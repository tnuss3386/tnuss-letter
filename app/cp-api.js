/* =====================================================================
   cp-api.js — GAS 向けの画面コードを、そのまま GitHub Pages 上で動かすための互換層

   画面側は今まで通り
       google.script.run.withSuccessHandler(ok).withFailureHandler(ng).関数名(引数...)
   と書いてあるだけ。ここでは同じ書き方のまま、中身を
       fetch(API_URL, { fn, args, idToken })   ← Google ID トークン付きの POST
   に差し替える。画面コード（mobile-student の本体）には手を入れない。

   ログイン: Google Identity Services（学校アカウント）。ID トークンは約1時間有効で、
             期限が近づいたら自動で取り直す（失敗したらログイン画面を出す）。
   ===================================================================== */
(function () {
  'use strict';
  var C = window.CP_CONFIG || {};
  var KEY = 'cp_idtoken';
  var waiting = null;          // 取得中のトークン Promise（同時に複数回ログインを出さない）

  /* ---------- JWT ---------- */
  function parseJwt(t) {
    try {
      var b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(atob(b).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')));
    } catch (e) { return null; }
  }
  function stored() {
    try {
      var t = sessionStorage.getItem(KEY);
      var p = t && parseJwt(t);
      if (p && p.exp * 1000 > Date.now() + 90 * 1000) return t;   // 残り90秒以上
    } catch (e) {}
    return null;
  }
  function save(t) { try { sessionStorage.setItem(KEY, t); } catch (e) {} }
  function clear() { try { sessionStorage.removeItem(KEY); } catch (e) {} }

  /* ---------- ログイン画面 ---------- */
  function overlay(html) {
    var el = document.getElementById('cp-login');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cp-login';
      el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(11,37,69,.92);display:flex;align-items:center;justify-content:center;padding:16px;';
      document.body.appendChild(el);
    }
    el.innerHTML = '<div class="cp-auth-card"><svg width="56" height="56" viewBox="0 0 72 72" style="margin-bottom:10px"><rect x="6" y="6" width="60" height="60" rx="14" fill="#0B2545"/><path d="M22 48V24h28v24" stroke="#F1F5F9" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M26 36h14" stroke="#A3C1AD" stroke-width="6" stroke-linecap="round"/><path d="M40 30l12 6-12 6" fill="none" stroke="#D4AF37" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>' + html + '</div>';
    return el;
  }
  function hideOverlay() { var el = document.getElementById('cp-login'); if (el) el.remove(); }

  function loadGis() {
    return new Promise(function (resolve, reject) {
      if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = function () { reject(new Error('Googleログインを読み込めませんでした。通信環境を確認してください。')); };
      document.head.appendChild(s);
    });
  }

  function login() {
    if (!C.API_URL || !C.GOOGLE_CLIENT_ID) {
      overlay('<h2 style="margin:6px 0">アプリの設定が未完了です</h2><p class="meta" style="margin-top:8px">cp-config.js の API_URL と GOOGLE_CLIENT_ID を設定してください。<br>手順: docs/PWA-API設計.md</p>');
      return new Promise(function () {});          // 設定が済むまで先へ進めない
    }
    return loadGis().then(function () {
      return new Promise(function (resolve) {
        overlay('<h2 style="margin:6px 0;color:#0B2545">TNUSS CareerPort</h2><p class="meta" style="margin:6px 0 16px">学校のGoogleアカウントでログインしてください</p><div id="cp-gbtn" style="display:flex;justify-content:center"></div><p id="cp-login-msg" style="color:#dc2626;font-size:13px;margin-top:12px"></p>');
        google.accounts.id.initialize({
          client_id: C.GOOGLE_CLIENT_ID,
          hd: C.ALLOWED_DOMAIN || undefined,       // 学校ドメインのアカウントだけを選択肢に出す
          auto_select: true,
          cancel_on_tap_outside: false,
          callback: function (res) {
            var p = parseJwt(res.credential);
            if (!p || (C.ALLOWED_DOMAIN && String(p.email || '').toLowerCase().slice(-(C.ALLOWED_DOMAIN.length + 1)) !== '@' + C.ALLOWED_DOMAIN)) {
              var m = document.getElementById('cp-login-msg');
              if (m) m.textContent = '学校のアカウント（@' + C.ALLOWED_DOMAIN + '）でログインしてください。';
              return;
            }
            save(res.credential); hideOverlay(); resolve(res.credential);
          }
        });
        google.accounts.id.renderButton(document.getElementById('cp-gbtn'), { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ja' });
        google.accounts.id.prompt();               // 既にログイン済みなら自動で通る（One Tap）
      });
    });
  }

  function getToken(force) {
    if (!force) { var t = stored(); if (t) return Promise.resolve(t); }
    if (!waiting) waiting = login().then(function (t) { waiting = null; return t; }, function (e) { waiting = null; throw e; });
    return waiting;
  }

  /* ---------- API 呼び出し ---------- */
  // サーバーの返すエラーを、直し方が分かる文にする
  function explain(e) {
    var s = String(e);
    if (s === 'API_DISABLED') return 'サーバー側で、アプリ用の API が有効になっていません。管理者に、スクリプトプロパティ API_CLIENT_ID の設定を依頼してください。';
    if (s === 'UNAUTHORIZED') return 'ログイン情報を確認できませんでした。学校のアカウントでログインしているか、アプリとサーバーの OAuth クライアントID（cp-config.js の GOOGLE_CLIENT_ID と、サーバーの API_CLIENT_ID）が同じか、確認してください。';
    if (s === 'UNKNOWN_FN') return 'このアプリは、まだこの操作に対応していません（サーバー側の code.gs が古い可能性があります）。';
    if (/^Users未登録/.test(s)) return 'このアカウント（' + s.replace(/^Users未登録:\s*/, '') + '）は、名簿に登録されていません。担任の先生に伝えてください。';
    if (/^Students未登録/.test(s)) return 'このアカウント（' + s.replace(/^Students未登録:\s*/, '') + '）は、生徒として登録されていません。このアプリは生徒用です（教員は、PC・スマホのブラウザで、通常のページをお使いください）。';
    return s;
  }
  function call(fn, args, retried) {
    // 設定が空のときは、保存済みトークンがあっても通信せず、設定案内を出して止める
    if (!C.API_URL || !C.GOOGLE_CLIENT_ID) return login();
    return getToken(retried).then(function (token) {
      return fetch(C.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // プリフライト(OPTIONS)を避ける。GAS は OPTIONS に対応しない
        body: JSON.stringify({ fn: fn, args: args, idToken: token }),
        redirect: 'follow'
      });
    }).then(function (r) {
      // 返事が JSON でないとき（Google の「アクセス権が必要です」のページなど）は、原因が分かる文にする
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (j) return j;
        if (/アクセス権|You need access|ログイン|Sign in|accounts\.google\.com/i.test(t) || r.status === 401 || r.status === 403) throw new Error('サーバー（API用のデプロイ）に入れません。Apps Script のデプロイの「アクセスできるユーザー」が「全員」になっているか、API_URL が「API用デプロイ」の URL か、確認してください。(' + r.status + ')');
        throw new Error('サーバーの返事を読み取れません (' + r.status + ')。API_URL が正しいか確認してください。');
      });
    }).then(function (j) {
      if (j && j.ok) return j.result;
      if (j && j.error === 'UNAUTHORIZED' && !retried) { clear(); return call(fn, args, true); }   // 期限切れ → 取り直して1回だけ再試行
      throw new Error(explain((j && j.error) || '不明なエラー'));
    });
  }

  /* ---------- google.script.run 互換 ---------- */
  function runner(ok, ng) {
    return new Proxy({}, {
      get: function (_, name) {
        if (name === 'withSuccessHandler') return function (f) { return runner(f, ng); };
        if (name === 'withFailureHandler') return function (f) { return runner(ok, f); };
        if (name === 'withUserObject') return function () { return runner(ok, ng); };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          call(String(name), args, false).then(function (r) { if (ok) ok(r); }, function (e) { if (ng) ng(e); else console.error(name, e); });
        };
      }
    });
  }
  window.google = window.google || {};
  window.google.script = { run: runner(null, null), history: { push: function () {}, replace: function () {}, setChangeHandler: function () {} } };

  /* ---------- 圏外表示 ---------- */
  function offlineBar(on) {
    var id = 'cp-offline', el = document.getElementById(id);
    if (on && !el) {
      el = document.createElement('div'); el.id = id; el.className = 'cp-notice warn';
      el.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:99998;';
      el.innerHTML = '<span class="material-symbols-rounded">cloud_off</span><div class="cp-notice-body">オフラインです。記録の保存や最新の表示には通信が必要です。</div>';
      document.body.appendChild(el);
    } else if (!on && el) el.remove();
  }
  window.addEventListener('online', function () { offlineBar(false); });
  window.addEventListener('offline', function () { offlineBar(true); });
  document.addEventListener('DOMContentLoaded', function () { if (!navigator.onLine) offlineBar(true); });

  window.CP_AUTH = { getToken: getToken, signOut: function () { clear(); try { google.accounts.id.disableAutoSelect(); } catch (e) {} location.reload(); } };
})();
