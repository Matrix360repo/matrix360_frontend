'use strict';
// Preview-only: preserve immutable original site and serve a safer status poller.
const original = require('../lib/m360-preview-original');
const oldStart = '    function startStatusPolling() {';
const oldEnd = "    runBtn.addEventListener('click', async () => {";
const replacement = String.raw`    // Throttle polling; a transient proxy timeout is NOT job completion.
    let pollGeneration = 0;
    function startStatusPolling() {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
      const generation = ++pollGeneration;
      let failures = 0;
      const poll = async () => {
        if (generation !== pollGeneration) return;
        if (document.hidden) {
          pollTimer = setTimeout(poll, 10000);
          return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        let finished = false;
        try {
          const res = await fetch('/api/scraper/status?_t=' + Date.now(), {
            signal: controller.signal,
            cache: 'no-store'
          });
          if (!res.ok) throw new Error('Status HTTP ' + res.status);
          const st = await res.json();
          if (st.status !== 'ok' || typeof st.running !== 'boolean') {
            throw new Error(st.message || 'Invalid scraper status');
          }
          failures = 0;
          updateTelemetryUI(st);
          if (!st.running) {
            finished = true;
            ++pollGeneration;
            pollTimer = null;
            await fetchSavedLeads();
          }
        } catch (err) {
          failures++;
          if (failures >= 3) {
            setStatus('Connection slow. Retrying without interrupting your scraper job.', 'info');
          }
        } finally {
          clearTimeout(timer);
        }
        if (!finished && generation === pollGeneration) {
          pollTimer = setTimeout(poll, failures ? 10000 : 5000);
        }
      };
      poll();
    }

`;
function fixScript(input) {
  let source = Buffer.isBuffer(input) ? input.toString('utf8') : String(input ?? '');
  const start = source.indexOf(oldStart);
  const end = source.indexOf(oldEnd, start >= 0 ? start : 0);
  if (start < 0 || end <= start) {
    console.error('Matrix360 polling hotfix: expected scraper JS markers absent');
    return input;
  }
  source = source.slice(0, start) + replacement + source.slice(end);
  source = source.replace('Launching 6-Tab Google Maps + DNS MX Verification Pipeline',
                          'Launching Single-Tab Low-RAM Google Maps + DNS MX Verification Pipeline');
  const old = "        const data = await res.json();\n        if (Array.isArray(data.leads) && data.leads.length) {";
  const adjusted = "        const data = await res.json();\n        if (!res.ok || data.status === 'error') throw new Error(data.message || 'Scraper launch failed');\n        if (Array.isArray(data.leads) && data.leads.length) {";
  if (source.includes(old)) source = source.replace(old, adjusted);
  console.log('Matrix360 polling hotfix applied: nonoverlapping 5s status requests');
  return Buffer.from(source, 'utf8');
}
module.exports = async function(req, res) {
  const send = typeof res.send === 'function' ? res.send.bind(res) : null;
  const end = res.end.bind(res);
  // Patch the one static JS asset only; every other file and API route is unchanged.
  res.end = function(chunk, encoding, cb) {
    if (chunk != null) {
      chunk = fixScript(chunk);
      this.removeHeader?.('Content-Length');
      this.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      this.setHeader('Cache-Control', 'no-store');
    }
    return end(chunk, encoding, cb);
  };
  if (send) {
    res.send = function(chunk) {
      if (chunk != null) {
        chunk = fixScript(chunk);
        this.removeHeader?.('Content-Length');
        this.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        this.setHeader('Cache-Control', 'no-store');
      }
      return send(chunk);
    };
  }
  return original(req, res);
};
