/* Matrix 360: browser-side decoded-media acceptance, independent of the provider.
   A signed URL alone is NOT proof of a playable reel or decodable PNG. */
(function (root, factory) {
  'use strict';
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  if (root) root.Matrix360MediaVerification = value;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  function verify(media, kind, opts) {
    opts = opts || {};
    if (!media || !media.addEventListener || !['reel', 'image'].includes(kind)) {
      return Promise.reject(new Error('Media preview is invalid.'));
    }
    const limit = Number.isFinite(opts.timeoutMs) ? Math.max(1, opts.timeoutMs) : 25000;
    const signal = opts.signal;
    return new Promise((resolve, reject) => {
      let settled = false;
      const readyEvent = kind === 'reel' ? 'loadeddata' : 'load';
      const cleanup = () => {
        clearTimeout(timeout);
        media.removeEventListener(readyEvent, onReady);
        media.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };
      const finish = (error, data) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error); else resolve(data);
      };
      const onError = () => finish(new Error('Media URL could not be decoded by this browser.'));
      const onAbort = () => finish(new Error('Media verification cancelled.'));
      const onReady = () => {
        if (kind === 'reel') {
          const duration = Number(media.duration);
          const width = Number(media.videoWidth), height = Number(media.videoHeight);
          if (!Number.isFinite(duration) || duration < 2 || duration > 120 ||
              !Number.isFinite(width) || !Number.isFinite(height) || width < 100 || height < 100 ||
              Number(media.readyState) < 2) {
            return finish(new Error('The returned MP4 has invalid or undecodable video metadata.'));
          }
          return finish(null, {kind, duration, width, height, decodedFirstFrame: true});
        }
        const width = Number(media.naturalWidth), height = Number(media.naturalHeight);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width < 100 || height < 100) {
          return finish(new Error('The returned image cannot be decoded.'));
        }
        return finish(null, {kind, width, height, decodedFirstFrame: true});
      };
      const timeout = setTimeout(() => finish(new Error('Media could not be decoded before the preview timeout.')), limit);
      media.addEventListener(readyEvent, onReady);
      media.addEventListener('error', onError);
      signal?.addEventListener('abort', onAbort, {once: true});
      if (signal?.aborted) return onAbort();
      if (kind === 'image' && media.complete && media.naturalWidth > 0) onReady();
      if (kind === 'reel' && Number(media.readyState) >= 2) onReady();
    });
  }
  return Object.freeze({verify});
});
