// 画面ファイル（殻）を端末に保存し、起動時はまず保存済みのものを即表示して、裏で最新に更新する。
// 投稿内容そのもの（GASからのデータ）は別ドメインなのでここでは扱わない。
var CACHE = 'letter-shell-v5';
var SHELL = [
  './', './index.html', './style.css', './ui.js', './app.js', './board.js', './calendar.js', './teacher.js', './push.js',
  './config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/crest.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.slice(-10) === 'config.js') {
    e.respondWith(fetch(req).catch(function () { return caches.match(req); }));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
