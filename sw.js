const CACHE_PREFIX = 'quoin-';

async function manifest() {
  const res = await fetch('asset-manifest.json', { cache: 'no-store' });
  return res.json();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const m = await manifest();
      const cache = await caches.open(`${CACHE_PREFIX}${m.version}`);
      await cache.addAll(m.files);
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const m = await manifest();
      const keep = `${CACHE_PREFIX}${m.version}`;
      for (const k of await caches.keys()) if (k.startsWith(CACHE_PREFIX) && k !== keep) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      return fetch(req);
    })()
  );
});
