/* Landing-page appearance only. Existing navigation, forms and service calls retain ownership. */
(() => {
  'use strict';
  const root = document.documentElement;
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let chosen = null;
  let themeButton;
  try {
    const saved = localStorage.getItem('m360-theme') || localStorage.getItem('m360-public-theme');
    if (saved === 'light' || saved === 'dark') chosen = saved;
  } catch {}
  function applyTheme() {
    const theme = chosen || (scheme.matches ? 'dark' : 'light');
    root.dataset.m360PublicTheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#08171f' : '#f7f9f8');
    themeButton?.setAttribute('aria-checked', String(theme === 'dark'));
  }
  applyTheme();
  scheme.addEventListener('change', applyTheme);
  addEventListener('storage', event => {
    if (event.key !== 'm360-theme') return;
    chosen = ['light', 'dark'].includes(event.newValue) ? event.newValue : null;
    applyTheme();
  });

  function boot() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    themeButton = document.createElement('button');
    themeButton.type = 'button';
    themeButton.className = 'm360-public-theme-toggle';
    themeButton.setAttribute('role', 'switch');
    themeButton.setAttribute('aria-label', 'Night mode');
    themeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 15.5A8.5 8.5 0 0 1 8.5 3.7 8.5 8.5 0 1 0 20.3 15.5Z"/></svg><span>Night mode</span>';
    (document.getElementById('nav-toggle') || nav.querySelector('.mobile-toggle') || nav.lastElementChild).before(themeButton);
    themeButton.addEventListener('click', () => {
      chosen = root.dataset.m360PublicTheme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('m360-theme', chosen);localStorage.setItem('m360-public-theme', chosen); } catch {}
      applyTheme();
    });
    applyTheme();

    if (!document.querySelector('.hero-art')) return;

    const hosts = [...document.querySelectorAll('.hero,#why,#capabilities,#for-you,#start,section:has(.responsibility-grid),.final-cta')];
    let frame = 0;
    let paused = document.querySelector('.hero .m360-motion-toggle')?.getAttribute('aria-pressed') === 'true';
    const pointers = new Map();
    const enabled = () => !reduced.matches && !paused && !document.hidden && innerWidth >= 1000;
    function render() {
      frame = 0;
      const active = enabled();
      const measurements = hosts.map(host => ({ host, rect: host.getBoundingClientRect() }));
      for (const { host, rect } of measurements) {
        const pointer = active && finePointer.matches ? pointers.get(host) : null;
        const scroll = active ? Math.max(-40, Math.min(40, (innerHeight / 2 - rect.top - rect.height / 2) * .07)) : 0;
        host.style.setProperty('--pub-scroll-y', scroll + 'px');
        host.style.setProperty('--pub-pointer-x', (pointer?.x || 0) + 'px');
        host.style.setProperty('--pub-pointer-y', (pointer?.y || 0) + 'px');
      }
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(render);
    }
    for (const host of hosts) {
      host.classList.add('m360-public-scene');
      const field = document.createElement('div');
      field.className = 'm360-reactive-field';
      field.setAttribute('aria-hidden', 'true');
      field.innerHTML = '<i class="m360-field-halo"></i><i class="m360-field-orbit"></i><i class="m360-field-satellite"></i>';
      host.append(field);
      host.addEventListener('pointermove', event => {
        if (!enabled() || !finePointer.matches || event.pointerType === 'touch') return;
        const rect = host.getBoundingClientRect();
        pointers.set(host, {
          x: Math.max(-1, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1)) * 48,
          y: Math.max(-1, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1)) * 36
        });
        schedule();
      }, { passive: true });
      host.addEventListener('pointerleave', () => { pointers.delete(host); schedule(); }, { passive: true });
    }
    // Reuse the existing motion control so all decorative layers share its pause state.
    document.addEventListener('click', event => {
      const control = event.target.closest('.m360-motion-toggle');
      if (!control) return;
      paused = control.getAttribute('aria-pressed') === 'true';
      root.dataset.m360PublicMotionPaused = String(paused);
      pointers.clear();
      schedule();
    });
    addEventListener('scroll', () => { pointers.clear(); schedule(); }, { passive: true });
    addEventListener('resize', schedule);
    reduced.addEventListener('change', () => { pointers.clear(); schedule(); });
    finePointer.addEventListener('change', () => { pointers.clear(); schedule(); });
    document.addEventListener('visibilitychange', () => { pointers.clear(); schedule(); });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
