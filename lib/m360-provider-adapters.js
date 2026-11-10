'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');
const { verifySmtpConnection, sendSmtpMessage } = require('./m360-smtp-client');

class ProviderError extends Error {
  constructor(code, message, retryable = false) { super(message); this.code = code; this.retryable = retryable; }
}

function requireFields(config, fields) {
  const missing = fields.filter(field => !String(config?.[field] || '').trim());
  return { valid: missing.length === 0, missing };
}

async function request(fetchImpl, url, options) {
  let response;
  try { response = await fetchImpl(url, { ...options, signal: options.signal || AbortSignal.timeout(10000) }); }
  catch { throw new ProviderError('PROVIDER_TIMEOUT', 'Provider request did not complete.', true); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ProviderError(`PROVIDER_HTTP_${response.status}`, 'Provider rejected the request.', response.status === 429 || response.status >= 500);
  return payload;
}

function assertMockOrAuthorized(mode, safety = {}) {
  if (mode === 'mock') return;
  if (mode !== 'live' || safety.liveSendEnabled !== true || safety.operatorApproved !== true) {
    throw new ProviderError('LIVE_SEND_BLOCKED', 'Live provider execution is disabled until explicit operator authorization.');
  }
}

function verifyWebhookSignature(secret, rawBody, signature) {
  if (!secret || !Buffer.isBuffer(rawBody) || !signature) return false;
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex'));
  const actual = Buffer.from(String(signature));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseVerifiedWebhook(provider, config, rawBody, signature) {
  if (!verifyWebhookSignature(config.webhookSecret, rawBody, signature)) throw new ProviderError('INVALID_WEBHOOK_SIGNATURE', 'Provider webhook signature could not be verified.');
  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); } catch { throw new ProviderError('INVALID_WEBHOOK_BODY', 'Provider webhook body is invalid.'); }
  return { provider, verified: true, event_id: String(payload.id || payload.eventId || payload.entry?.[0]?.id || ''), payload };
}

function createBrevoAdapter(config = {}, fetchImpl = fetch) {
  return {
    name: 'brevo',
    validateConfig: () => requireFields(config, ['apiKey', 'senderEmail']),
    verifyConnection: async () => request(fetchImpl, 'https://api.brevo.com/v3/account', { headers: { 'api-key': config.apiKey, Accept: 'application/json' } }),
    handleWebhook: (rawBody, signature) => parseVerifiedWebhook('brevo', config, rawBody, signature),
    execute: async (draft, { mode = 'blocked', safety, idempotencyKey } = {}) => {
      assertMockOrAuthorized(mode, safety);
      const payload = await request(fetchImpl, 'https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(draft) });
      return { provider: 'brevo', mode, provider_message_id: payload.messageId || null, mock: mode === 'mock', accepted: Boolean(payload.messageId) };
    }
  };
}

function createBrevoSmtpAdapter(config = {}, transport = { verify: verifySmtpConnection, send: sendSmtpMessage }) {
  return {
    name: 'brevo_smtp',
    validateConfig: () => requireFields(config, ['host', 'port', 'username', 'password', 'senderEmail']),
    verifyConnection: async () => transport.verify(config),
    execute: async (draft, { mode = 'blocked', safety, idempotencyKey } = {}) => {
      assertMockOrAuthorized(mode, safety);
      if (!idempotencyKey) throw new ProviderError('IDEMPOTENCY_KEY_REQUIRED', 'Email execution requires an idempotency key.');
      if (mode === 'mock') return { provider: 'brevo_smtp', mode, provider_message_id: `mock_${idempotencyKey}`, mock: true, accepted: true };
      const result = await transport.send(config, draft);
      if (!result?.accepted || !result.provider_message_id) throw new ProviderError('PROVIDER_ACK_REQUIRED', 'Brevo SMTP did not return an accepted message acknowledgement.');
      return { provider: 'brevo_smtp', mode, ...result, mock: false };
    }
  };
}

function createWhatsAppAdapter(config = {}, fetchImpl = fetch) {
  return {
    name: 'whatsapp_cloud',
    validateConfig: () => requireFields(config, ['accessToken', 'phoneNumberId', 'graphVersion']),
    verifyConnection: async () => request(fetchImpl, `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}?fields=verified_name,code_verification_status`, { headers: { Authorization: `Bearer ${config.accessToken}` } }),
    handleWebhook: (rawBody, signature) => parseVerifiedWebhook('whatsapp_cloud', config, rawBody, signature),
    execute: async (draft, { mode = 'blocked', safety, idempotencyKey } = {}) => {
      assertMockOrAuthorized(mode, safety);
      if (!draft?.template?.name || draft?.consent_verified !== true) throw new ProviderError('WHATSAPP_TEMPLATE_OR_CONSENT_REQUIRED', 'Approved template and verified consent are required.');
      const payload = await request(fetchImpl, `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey }, body: JSON.stringify(draft) });
      return { provider: 'whatsapp_cloud', mode, provider_message_id: payload.messages?.[0]?.id || null, mock: mode === 'mock', accepted: Boolean(payload.messages?.[0]?.id) };
    }
  };
}

function createMetaAdapter(config = {}, fetchImpl = fetch) {
  return {
    name: 'meta_graph',
    validateConfig: () => requireFields(config, ['accessToken', 'graphVersion', 'destinationId']),
    verifyConnection: async () => request(fetchImpl, `https://graph.facebook.com/${config.graphVersion}/${config.destinationId}?fields=id,name,tasks`, { headers: { Authorization: `Bearer ${config.accessToken}` } }),
    handleWebhook: (rawBody, signature) => parseVerifiedWebhook('meta_graph', config, rawBody, signature),
    execute: async (draft, { mode = 'blocked', safety } = {}) => {
      assertMockOrAuthorized(mode, safety);
      const payload = await request(fetchImpl, `https://graph.facebook.com/${config.graphVersion}/${config.destinationId}/feed`, { method: 'POST', headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      return { provider: 'meta_graph', mode, provider_post_id: payload.id || null, mock: mode === 'mock', accepted: Boolean(payload.id) };
    }
  };
}

function createLinkedInAdapter(config = {}, fetchImpl = fetch) {
  return {
    name: 'linkedin',
    validateConfig: () => requireFields(config, ['accessToken', 'organizationUrn', 'apiVersion']),
    verifyConnection: async () => request(fetchImpl, 'https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${config.accessToken}`, 'LinkedIn-Version': config.apiVersion } }),
    handleWebhook: (rawBody, signature) => parseVerifiedWebhook('linkedin', config, rawBody, signature),
    execute: async (draft, { mode = 'blocked', safety } = {}) => {
      assertMockOrAuthorized(mode, safety);
      const payload = await request(fetchImpl, 'https://api.linkedin.com/rest/posts', { method: 'POST', headers: { Authorization: `Bearer ${config.accessToken}`, 'LinkedIn-Version': config.apiVersion, 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      return { provider: 'linkedin', mode, provider_post_id: payload.id || null, mock: mode === 'mock', accepted: Boolean(payload.id) };
    }
  };
}

module.exports = { ProviderError, verifyWebhookSignature, createBrevoAdapter, createBrevoSmtpAdapter, createWhatsAppAdapter, createMetaAdapter, createLinkedInAdapter };
