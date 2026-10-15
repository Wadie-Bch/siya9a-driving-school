/* Service worker — the ONLY one in this app.
 * The build script replaces __VERSION__ and the PRECACHE list with every file
 * in the build (hashed version), so after the first online visit the whole
 * app — code, lessons, questions, maps, icons — is served from Cache Storage
 * and works in Airplane Mode. No runtime network requests are needed.
 */
const VERSION = 'f7a5b72f0d39';
const PRECACHE = ["./","./content/curriculum.json","./content/lab-modules.json","./content/legal-sources.json","./content/mistakes.json","./content/practical-exams.json","./content/questions.json","./data/rabat-agdal.json","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./index.html","./js/main.js","./licenses/ATTRIBUTION.txt","./licenses/three.js-LICENSE.txt","./manifest.webmanifest","./styles/app.css"];
const CACHE = `siya9a-${VERSION}`;

async function broadcast(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) c.postMessage(msg);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let done = 0;
    // one by one so the page can show real progress and a single failure is visible
    for (const url of PRECACHE) {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(`precache failed: ${url} (${res.status})`);
      await cache.put(url, res);
      done++;
      if (done % 4 === 0 || done === PRECACHE.length) broadcast({ type: 'precache', done, total: PRECACHE.length, version: VERSION });
    }
    // First install activates immediately; updates wait until the learner accepts them.
    const regs = await self.registration;
    if (!regs.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('siya9a-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    broadcast({ type: 'activated', version: VERSION });
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch other origins
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      const hit = await cache.match('./index.html') || await cache.match('./');
      if (hit) return hit;
      return fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      return new Response('offline: not cached', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'skipWaiting') self.skipWaiting();
  if (data.type === 'status') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const keys = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
      const base = new URL(self.registration.scope).pathname;
      const missing = PRECACHE.filter((u) => !keys.has(new URL(u, self.registration.scope).pathname) && !keys.has(base + u.replace(/^\.\//, '')));
      event.ports[0]?.postMessage({ version: VERSION, total: PRECACHE.length, cached: PRECACHE.length - missing.length, missing: missing.slice(0, 20) });
    })());
  }
});
