// Offline support for Service English 100.
// - The app itself (page, icons) is cached on install and refreshed from the network when online.
// - Each day's recordings (audio/dNNN.js) are cached the first time they load, or all at once
//   from Settings → "Save all recordings for offline". They never change, so cache-first.
const BUILD = '2b27822eb2';
const SHELL = 'se100-shell-' + BUILD;
const AUDIO = 'se100-audio';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('se100-shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;

  if (path.includes('/audio/')) {   // recordings: cache first
    e.respondWith(caches.open(AUDIO).then(async c => {
      const hit = await c.match(req, { ignoreVary: true, ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (req.mode === 'navigate' || path.endsWith('/') || path.endsWith('/index.html')) {   // page: network first
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      try {
        const res = await withTimeout(fetch(req), 4000);
        if (res.ok) c.put('./index.html', res.clone());
        return res;
      } catch (err) {
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  e.respondWith(caches.match(req, { ignoreVary: true, ignoreSearch: true }).then(hit => hit || fetch(req)));   // icons etc.
});
