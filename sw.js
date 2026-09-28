// Budget Asie 2027 — fonctionnement hors connexion.
// L'appli (page, icônes, polices) est gardée en cache et s'ouvre sans réseau ; les données passent par localStorage
// et le Google Sheet (jamais mises en cache ici). Changer VERSION à chaque mise à jour de l'appli.
const VERSION = 'ba27-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Le Google Sheet : toujours en direct, jamais depuis le cache
  if (/(^|\.)google(usercontent)?\.com$/.test(url.hostname) && !/fonts\./.test(url.hostname)) return;
  const sameOrigin = url.origin === self.location.origin;
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !font) return;
  // La page : réseau d'abord (3 s max) pour recevoir les mises à jour, sinon la copie en cache
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(VERSION).then(async (cache) => {
      const net = fetch(req).then((res) => { if (res && res.ok) cache.put('index.html', res.clone()); return res; });
      const timeout = new Promise((resolve) => setTimeout(resolve, 3000, null));
      const res = await Promise.race([net.catch(() => null), timeout]);
      return res || (await cache.match('index.html')) || net;
    }));
    return;
  }
  // Le reste (icônes, polices) : cache d'abord, mise à jour en arrière-plan
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: sameOrigin && req.mode === 'navigate' });
    const net = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  }));
});
