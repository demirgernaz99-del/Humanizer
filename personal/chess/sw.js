/* Zugradar Service Worker – macht die App offline-fähig.
   Die Version setzt build.py (ändert sich bei jedem Build mit neuem Inhalt).
   Die Engine (7 MB) liegt in einem eigenen, beständigen Cache, damit sie nicht bei jedem Update neu geladen wird. */
var V = 'zugradar-11e0c83b96';
var ENGINE = 'zugradar-engine-1';
var ENGINE_FILES = ['engine/stockfish-18-lite-single.js', 'engine/stockfish-18-lite-single.wasm'];
var CORE = ['./', 'index.html', 'zugradar.html', 'manifest.webmanifest', 'fonts/fonts.css',
  'fonts/ibm-plex-sans-latin-400-normal.woff2', 'fonts/ibm-plex-sans-latin-500-normal.woff2', 'fonts/ibm-plex-sans-latin-600-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2', 'fonts/ibm-plex-mono-latin-600-normal.woff2',
  'fonts/bricolage-grotesque-latin-600-normal.woff2', 'fonts/bricolage-grotesque-latin-800-normal.woff2',
  'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('zugradar-') === 0 && k !== V && k !== ENGINE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// Die App meldet sich, sobald sie läuft: dann die Engine im Hintergrund für offline ablegen
self.addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'warm-engine') return;
  var job = caches.open(ENGINE).then(function (c) {
    return Promise.all(ENGINE_FILES.map(function (f) {
      return c.match(f).then(function (hit) { return hit || c.add(f).catch(function () {}); });
    }));
  });
  if (e.waitUntil) e.waitUntil(job);
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Fremde Adressen (chess.com, lichess, Lizenzprüfung, CDN) nie zwischenspeichern
  if (url.origin !== self.location.origin) return;
  var isPage = req.mode === 'navigate' || /\.html$|\/$/.test(url.pathname);
  if (isPage) {
    // Seiten: erst Netz (Updates), sonst Cache
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(V).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('zugradar.html'); });
    }));
    return;
  }
  // Engine, Schriften, Bilder: erst Cache (groß und unveränderlich), sonst Netz und merken
  var store = url.pathname.indexOf('/engine/') >= 0 ? ENGINE : V;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(store).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
