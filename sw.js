// 画面ファイル（殻）を端末に保存して、すばやく起動する。
// 更新時に新旧のファイルが混ざって動かなくならないよう、
//  - index.html と config.js は、まず最新を取りに行く（通信できないとき・遅いときだけ保存済みを使う）
//  - ほかのファイルは、版の番号（?v=…）ごとに保存する（index.html が指す版のものだけが使われる）
// 画面を更新したときは、BUILD の値を index.html の ?v=… と同じ値に変える。
var BUILD = '20261004p';
var CACHE = 'letter-shell-' + BUILD;
var V = '?v=' + BUILD;
var SHELL = [
  './', './index.html', './config.js', './manifest.webmanifest',
  './style.css' + V, './icons.js' + V, './ui.js' + V, './push.js' + V, './app.js' + V, './board.js' + V, './calendar.js' + V, './teacher.js' + V,
  './icons/icon-192.png', './icons/icon-512.png', './icons/crest.png', './icons/badge.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // 1つ取得に失敗しても、ほかは保存する
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
  }));
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

function networkFirst(req, timeoutMs) {
  return new Promise(function (resolve) {
    var settled = false;
    function fromCache() {
      caches.match(req, { ignoreSearch: false }).then(function (hit) { if (!settled) { settled = true; resolve(hit || fetch(req)); } });
    }
    var timer = setTimeout(fromCache, timeoutMs);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      if (!settled) { settled = true; resolve(res); }
    }).catch(function () { clearTimeout(timer); fromCache(); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  var path = url.pathname;
  var isIndex = req.mode === 'navigate' || path.slice(-1) === '/' || path.slice(-10) === 'index.html';
  if (isIndex || path.slice(-9) === 'config.js') {
    e.respondWith(networkFirst(req, 2500));
    return;
  }
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
