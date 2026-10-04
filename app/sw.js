/* Service Worker: アプリ本体（HTML/CSS/JS/アイコン）をキャッシュして、起動を速く・圏外でも画面は開けるようにする。
   API(GAS)への通信はキャッシュしない（常に最新・本人確認のため）。 */
const CACHE = 'cp-shell-v4';
const SHELL = ['./', 'index.html', 'cp-design.css', 'cp-ui.js', 'cp-config.js', 'cp-api.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.indexOf('cp-shell-') === 0 && k !== CACHE)   /* 同じ github.io のほかのアプリ（Bridge など）の保存は消さない */.map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // POST(API) は素通し
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    // Google Fonts は stale-while-revalidate
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
      e.respondWith(caches.open(CACHE).then(async c => {
        const hit = await c.match(req);
        const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      }));
    }
    return;
  }
  // 自分のファイル: ネットワーク優先（更新を即反映）、失敗時はキャッシュ
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html'))));
});
