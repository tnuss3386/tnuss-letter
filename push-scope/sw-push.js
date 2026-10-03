// プッシュ通知の受信と表示専用。画面表示用の sw.js とは別の範囲（push-scope/）で動かす。
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
importScripts('../config.js');

var APP_ROOT = new URL('../', self.registration.scope).href;
var ICON = APP_ROOT + 'icons/icon-192.png';

firebase.initializeApp(FIREBASE_CONFIG);
var messaging = firebase.messaging();

// アプリを開いていないときに届いた通知を表示する（毎回必ず表示する。iPhoneの決まりでもある）
messaging.onBackgroundMessage(function (payload) {
  var d = (payload && payload.data) || {};
  return self.registration.showNotification(d.title || 'TNUSS Bridge', {
    body: d.body || '',
    icon: ICON,
    badge: ICON,
    tag: d.tag || 'letter',
    data: { url: d.url || APP_ROOT }
  });
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || APP_ROOT;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(APP_ROOT) === 0 && 'focus' in list[i]) {
          // すでに開いているアプリには、該当の投稿へ移動するよう伝える
          list[i].postMessage({ type: 'letter:open', url: target });
          return list[i].focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
