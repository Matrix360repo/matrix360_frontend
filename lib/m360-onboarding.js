'use strict';

const { createHash } = require('node:crypto');

const requests = new Map();
const clean = (value, max) => String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const emailPattern = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,24}$/;

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function safeOrigin(req) {
  const configured = clean(process.env.M360_PUBLIC_APP_ORIGIN, 240);
  if (configured) {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw Error('Invalid public application origin');
    return parsed.origin;
  }
  const host = clean(req.headers?.host, 180);
  if (/^(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(host)) return `http://${host}`;
  throw Error('Public application origin is not configured');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return reply(res, 405, { status: 'error', message: 'POST only' });
  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const name = clean(body.name, 120), email = clean(body.email, 255).toLowerCase(), company = clean(body.company, 160);
  const website = clean(body.website, 240), objective = clean(body.objective, 700);
  if (name.length < 2 || company.length < 2 || !emailPattern.test(email)) {
    return reply(res, 422, { status: 'error', message: 'Enter your name, company and valid business email.' });
  }
  const key = createHash('sha256').update(email).digest('hex');
  const now = Date.now(), previous = requests.get(key) || 0;
  if (now - previous < 10 * 60 * 1000) return reply(res, 429, { status: 'error', message: 'An access email was already requested. Check your inbox or retry later.' });

  const apiKey = process.env.RESEND_API_KEY || '';
  const from = clean(process.env.M360_ONBOARDING_FROM_EMAIL, 240);
  const internal = clean(process.env.M360_ONBOARDING_TEAM_EMAIL, 255).toLowerCase();
  if (!apiKey.startsWith('re_') || !from || !emailPattern.test(internal)) {
    return reply(res, 503, { status: 'blocked', message: 'Email onboarding is not configured yet. Your details were not submitted.' });
  }

  let origin;
  try { origin = safeOrigin(req); } catch { return reply(res, 503, { status: 'blocked', message: 'The sign-in link origin is not configured.' }); }
  const loginUrl = `${origin}/login.html?mode=login`;
  const escapeHtml = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const clientHtml = `<h1>Matrix 360 access request received</h1><p>Hi ${escapeHtml(name)},</p><p>We received the onboarding details for <strong>${escapeHtml(company)}</strong>.</p><p>Your workspace must be activated before sign-in. When activation is confirmed, use this link:</p><p><a href="${loginUrl}">Open Matrix 360 client sign in</a></p><p>If you did not request access, ignore this email.</p>`;
  const teamText = [`New Matrix 360 onboarding request`, `Name: ${name}`, `Email: ${email}`, `Company: ${company}`, website ? `Website: ${website}` : '', objective ? `Objective: ${objective}` : ''].filter(Boolean).join('\n');
  const send = async payload => fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000)
  });
  try {
    const [clientMail, teamMail] = await Promise.all([
      send({ from, to: [email], subject: 'Your Matrix 360 access request', html: clientHtml }),
      send({ from, to: [internal], subject: `New onboarding request: ${company}`, text: teamText, reply_to: email })
    ]);
    if (!clientMail.ok || !teamMail.ok) return reply(res, 503, { status: 'error', message: 'The access email could not be delivered. Please retry later.' });
    requests.set(key, now);
    return reply(res, 202, { status: 'accepted', message: 'Check your email. We sent your sign-in link and notified the onboarding team.' });
  } catch {
    return reply(res, 503, { status: 'error', message: 'The access email could not be delivered. Please retry later.' });
  }
};
