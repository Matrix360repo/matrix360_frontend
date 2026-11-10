/* Matrix360 single CRM origin for login/dashboard. Vercel uses a same-origin, non-caching reverse proxy. */
(() => {
  'use strict';
  const loc = window.location;
  const directFallback = 'https://matrix360-crm-backend-p9os.onrender.com';
  // On a deployed HTTPS website, route requests through the same-origin Vercel rewrite.
  // This avoids relying on individual Vercel preview origins in backend CORS settings.
  const loopback = loc && ['localhost', '127.0.0.1'].includes(loc.hostname) && loc.protocol === 'http:';
  const fallback = loc && (loc.protocol === 'https:' || loopback)
    ? loc.origin + '/api/crm' : directFallback;
  const settings = window.MATRIX360_CRM_CONFIG;
  const candidate = settings && Object.prototype.hasOwnProperty.call(settings, 'apiBase')
    ? settings.apiBase : fallback;
  try {
    if (typeof candidate !== 'string' || !candidate.trim()) throw new Error('Missing CRM API origin');
    const parsed = new URL(candidate);
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    const secure = parsed.protocol === 'https:' || (local && parsed.protocol === 'http:');
    const proxy = loc && parsed.origin === loc.origin && parsed.pathname === '/api/crm' && (loc.protocol === 'https:' || loopback);
    const direct = parsed.pathname === '/';
    if (!secure || parsed.username || parsed.password || parsed.search || parsed.hash ||
        parsed.origin === 'null' || !(proxy || direct)) {
      throw new Error('Invalid CRM API origin');
    }
    window.Matrix360ApiBase = proxy ? parsed.origin + '/api/crm' : parsed.origin;
    window.Matrix360ApiConfigError = '';
  } catch {
    // Never transmit credentials to malformed URLs, cleartext remote hosts or unexpected paths.
    window.Matrix360ApiBase = null;
    window.Matrix360ApiConfigError = 'The CRM connection is not configured safely. Contact Matrix 360 support.';
  }
})();
