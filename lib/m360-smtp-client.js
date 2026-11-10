'use strict';

const net = require('node:net');
const tls = require('node:tls');
const { randomUUID } = require('node:crypto');

function cleanHeader(value, label) {
  const text = String(value || '').trim();
  if (!text || /[\r\n]/.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function replyReader(socket) {
  let buffer = '', current = [], waiting = [], queued = [];
  const settle = reply => waiting.length ? waiting.shift().resolve(reply) : queued.push(reply);
  socket.on('data', chunk => {
    buffer += chunk.toString('utf8');
    for (;;) {
      const end = buffer.indexOf('\n');
      if (end < 0) break;
      const line = buffer.slice(0, end + 1).replace(/\r?\n$/, '');
      buffer = buffer.slice(end + 1);
      current.push(line);
      if (/^\d{3} /.test(line)) { settle({ code: Number(line.slice(0, 3)), lines: current }); current = []; }
    }
  });
  socket.on('error', error => { for (const item of waiting.splice(0)) item.reject(error); });
  return {
    next(timeoutMs = 10000) {
      if (queued.length) return Promise.resolve(queued.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('SMTP response timed out.')), timeoutMs);
        waiting.push({ resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      });
    }
  };
}

function connectSocket({ host, port, secure }) {
  const options = { host, port, servername: host, rejectUnauthorized: true };
  return new Promise((resolve, reject) => {
    const socket = secure ? tls.connect(options) : net.connect({ host, port });
    const event = secure ? 'secureConnect' : 'connect';
    socket.setTimeout(12000, () => socket.destroy(new Error('SMTP connection timed out.')));
    socket.once(event, () => resolve(socket));
    socket.once('error', reject);
  });
}

async function expectReply(reader, allowed, action) {
  const reply = await reader.next();
  if (!allowed.includes(reply.code)) {
    const error = new Error(`SMTP ${action} was rejected (${reply.code}).`);
    error.code = [534, 535].includes(reply.code) ? 'SMTP_AUTHENTICATION_REJECTED' : `SMTP_${String(action).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_REJECTED`;
    throw error;
  }
  return reply;
}

async function writeCommand(socket, reader, command, allowed, action) {
  socket.write(command + '\r\n');
  return expectReply(reader, allowed, action);
}

async function authenticate(config) {
  const host = cleanHeader(config.host, 'SMTP host');
  const port = Number(config.port || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP port is invalid.');
  const username = cleanHeader(config.username, 'SMTP login');
  const password = String(config.password || '');
  if (!password || /[\r\n]/.test(password)) throw new Error('SMTP key is missing or invalid.');
  let socket = await connectSocket({ host, port, secure: port === 465 || config.secure === true });
  let reader = replyReader(socket);
  await expectReply(reader, [220], 'greeting');
  await writeCommand(socket, reader, `EHLO ${cleanHeader(config.clientName || 'matrix360.local', 'SMTP client name')}`, [250], 'EHLO');
  if (!(socket instanceof tls.TLSSocket)) {
    await writeCommand(socket, reader, 'STARTTLS', [220], 'STARTTLS');
    socket = tls.connect({ socket, servername: host, rejectUnauthorized: true });
    await new Promise((resolve, reject) => { socket.once('secureConnect', resolve); socket.once('error', reject); });
    reader = replyReader(socket);
    await writeCommand(socket, reader, `EHLO ${cleanHeader(config.clientName || 'matrix360.local', 'SMTP client name')}`, [250], 'secure EHLO');
  }
  await writeCommand(socket, reader, 'AUTH LOGIN', [334], 'authentication');
  await writeCommand(socket, reader, Buffer.from(username).toString('base64'), [334], 'login');
  await writeCommand(socket, reader, Buffer.from(password).toString('base64'), [235], 'authentication');
  return { socket, reader };
}

async function verifySmtpConnection(config) {
  const { socket, reader } = await authenticate(config);
  try { await writeCommand(socket, reader, 'QUIT', [221], 'quit'); } finally { socket.end(); }
  return { account_verified: true, scopes_valid: true, sender_ready: true, transport: 'smtp_tls' };
}

function buildSmtpMessage(config, message) {
  const from = cleanHeader(message.from || config.senderEmail, 'Sender email');
  const to = cleanHeader(message.to, 'Recipient email');
  const subject = cleanHeader(message.subject, 'Email subject');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('Sender or recipient email is invalid.');
  const messageDomain = String(config.messageDomain || 'smtp-relay.brevo.com').replace(/[^a-z0-9.-]/gi, '');
  const messageId = `<${randomUUID()}@${messageDomain}>`;
  const body = String(message.text || '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
  const boundary = '----=_Part_' + randomUUID().replace(/-/g, '');
  const htmlBody = String(message.html || body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n/g, '<br/>\r\n'));
  let data = [
    `From: Matrix360 <${from}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    `Reply-To: <${from}>`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#183944;padding:16px;">${htmlBody}</body></html>`,
    '',
    `--${boundary}--`,
    ''
  ].join('\r\n');
  if(message.inlineImage){
    const image=message.inlineImage.content,cid=String(message.inlineImage.cid||'');
    if(!Buffer.isBuffer(image)||image.length<5000||image.length>2900000||image[0]!==255||image[1]!==216||image[2]!==255||!/^[a-zA-Z0-9_.@-]{1,100}$/.test(cid))throw Error('Invalid inline campaign image.');
    const related='----=_Related_'+randomUUID().replace(/-/g,'');
    const alternative=`Content-Type: multipart/alternative; boundary="${boundary}"`;
    data=data.replace(alternative,`Content-Type: multipart/related; boundary="${related}"\r\n\r\n--${related}\r\n${alternative}`);
    data += [`--${related}`,'Content-Type: image/jpeg; name="campaign-creative.jpg"','Content-Transfer-Encoding: base64',`Content-ID: <${cid}>`,'Content-Disposition: inline; filename="campaign-creative.jpg"','',image.toString('base64').match(/.{1,76}/g).join('\r\n'),`--${related}--`,''].join('\r\n');
  }
  return {data,messageId,from,to};
}

async function sendSmtpMessage(config, message) {
  const {data,messageId,from,to}=buildSmtpMessage(config,message);
  const { socket, reader } = await authenticate(config);
  try {
    await writeCommand(socket, reader, `MAIL FROM:<${from}>`, [250], 'sender');
    await writeCommand(socket, reader, `RCPT TO:<${to}>`, [250, 251], 'recipient');
    await writeCommand(socket, reader, 'DATA', [354], 'message data');
    socket.write(data + '\r\n.\r\n');
    const acknowledgement = await expectReply(reader, [250], 'message submission');
    await writeCommand(socket, reader, 'QUIT', [221], 'quit');
    return { accepted: true, provider_message_id: messageId, provider_acknowledgement: acknowledgement.lines.join(' ') };
  } finally { socket.end(); }
}

module.exports = { verifySmtpConnection, sendSmtpMessage, buildSmtpMessage };
