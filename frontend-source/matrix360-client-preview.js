'use strict';

(async () => {
  const match = /^#workspace-pass=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if (!match) return;

  const button = document.getElementById('submit-login');
  const status = document.getElementById('login-status');
  history.replaceState(history.state, '', location.pathname + location.search);
  button.disabled = true;
  status.textContent = 'Opening the Lakhotia workspace…';

  try {
    const response = await fetch('/api/crm/auth/client-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass: match[1] }),
      cache: 'no-store',
      signal: AbortSignal.timeout(35000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.message || 'Client preview access is unavailable.');
    const lifetime = Number(data.expires_in);
    if (typeof data.access_token !== 'string' || !Number.isFinite(lifetime) || lifetime <= 30) {
      throw Error('Client preview sign-in could not be verified.');
    }
    sessionStorage.setItem('matrix360_pilot_expires_at', String(Date.now() + (lifetime - 30) * 1000));
    sessionStorage.setItem('matrix360_pilot_token', data.access_token);
    location.replace('/client-dashboard.html');
  } catch (error) {
    status.textContent = error.name === 'TimeoutError'
      ? 'The workspace is taking longer than expected. Reopen the invitation to try again.'
      : error.message;
    status.className = 'error';
    button.disabled = false;
  }
})();
