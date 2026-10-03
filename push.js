// プッシュ通知の許可・端末登録（Firebase Cloud Messaging）。必要になったときだけ Firebase を読み込む。
(function () {
  'use strict';

  var FB_VERSION = '10.12.2';
  var TOKEN_KEY = 'letterFcmToken';
  var SW_PATH = 'push-scope/sw-push.js';
  var SW_SCOPE = 'push-scope/';

  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  var messaging = null;
  var listening = false;

  function configured() {
    return typeof FIREBASE_CONFIG === 'object' && FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey &&
      typeof VAPID_KEY === 'string' && VAPID_KEY.length > 20;
  }

  function store(op, v) {
    try {
      if (op === 'get') return localStorage.getItem(TOKEN_KEY);
      if (op === 'set') localStorage.setItem(TOKEN_KEY, v);
      if (op === 'remove') localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
    return null;
  }

  // unconfigured: 設定なし(表示しない) / needs-install: iPhoneでホーム画面に未追加 / unsupported: 非対応
  // denied: ブロック中 / off: 未設定 / on: 設定済み
  function status() {
    if (!configured()) return 'unconfigured';
    if (isIOS && !standalone) return 'needs-install';
    if (!supported) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'granted' && store('get')) return 'on';
    return 'off';
  }

  function waitActive(reg) {
    if (reg.active) return Promise.resolve(reg);
    return new Promise(function (resolve) {
      var worker = reg.installing || reg.waiting;
      if (!worker) return resolve(reg);
      worker.addEventListener('statechange', function () {
        if (worker.state === 'activated') resolve(reg);
      });
    });
  }

  // 端末の通知用トークンを取得する（毎回同じとは限らないため、起動時にも確認する）
  function obtainToken() {
    var registration;
    return navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE }).then(waitActive).then(function (reg) {
      registration = reg;
      return Promise.all([
        import('https://www.gstatic.com/firebasejs/' + FB_VERSION + '/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/' + FB_VERSION + '/firebase-messaging.js')
      ]);
    }).then(function (mods) {
      var app = mods[0], fm = mods[1];
      var fbApp = app.getApps().length ? app.getApp() : app.initializeApp(FIREBASE_CONFIG);
      messaging = fm.getMessaging(fbApp);
      if (!listening) {
        listening = true;
        // アプリを開いている間に届いた通知も、表示して一覧を更新する
        fm.onMessage(messaging, function (payload) {
          var d = (payload && payload.data) || {};
          registration.showNotification(d.title || '連絡事項', {
            body: d.body || '',
            icon: 'icons/icon-192.png',
            tag: d.tag || 'letter',
            data: { url: d.url || '' }
          });
          window.dispatchEvent(new Event('letter:push'));
        });
      }
      return fm.getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    });
  }

  // 「通知をオンにする」ボタンから呼ぶ（許可ダイアログはボタン操作の直後でないと出ない）
  function enable(api, sessionToken) {
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') return { ok: false, reason: perm };
      return obtainToken().then(function (fcmToken) {
        if (!fcmToken) return { ok: false, reason: 'no-token' };
        return api('registerPush', { token: sessionToken, fcmToken: fcmToken }).then(function (res) {
          if (!res.ok) return { ok: false, reason: 'server', error: res.error };
          store('set', fcmToken);
          return { ok: true };
        });
      });
    }).catch(function (e) {
      return { ok: false, reason: 'error', error: String((e && e.message) || e) };
    });
  }

  // 起動時に、登録内容が最新か確かめる（トークンが変わっていれば登録し直す）
  function sync(api, sessionToken) {
    if (status() !== 'on') return Promise.resolve();
    return obtainToken().then(function (fcmToken) {
      if (!fcmToken) return;
      if (fcmToken !== store('get')) {
        return api('registerPush', { token: sessionToken, fcmToken: fcmToken }).then(function (res) {
          if (res.ok) store('set', fcmToken);
        });
      }
    }).catch(function () {});
  }

  // 通知オフ・ログアウト時に、この端末の登録を外す
  function disable(api, sessionToken) {
    var fcmToken = store('get');
    store('remove');
    if (!fcmToken) return Promise.resolve();
    return api('unregisterPush', { token: sessionToken, fcmToken: fcmToken }).catch(function () {});
  }

  window.LetterPush = { status: status, enable: enable, sync: sync, disable: disable };
})();
