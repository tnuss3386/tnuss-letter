/* =====================================================================
   cp-api.js — GAS 向けの画面コードを、そのまま GitHub Pages 上で動かすための互換層

   画面側は今まで通り
       google.script.run.withSuccessHandler(ok).withFailureHandler(ng).関数名(引数...)
   と書いてあるだけ。ここでは同じ書き方のまま、中身を
       fetch(API_URL, { fn, args, sessionToken })   ← 学籍番号＋パスワードで得たセッションキー付きの POST
   に差し替える。画面コード（mobile-student の本体）には手を入れない。
   ログイン: 学籍番号＋パスワード。サーバーが返すセッションキー（最長6時間）を sessionStorage に保存し、切れたらログイン画面を出す。
   ===================================================================== */
(function () {
  'use strict';
  var C = window.CP_CONFIG || {};
  var waiting = null;          // 取得中のトークン Promise（同時に複数回ログインを出さない）


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


  /* ---------- 認証 ----------
     A. 学籍番号＋パスワード → サーバーが「セッションキー」を返す（sessionStorage に保存。タブを閉じると消える）

     以後の通信で、body に { sessionToken } を付ける。 */
  var SKEY = 'cp_session';
  function storedSession() {
    try {
      var o = JSON.parse(sessionStorage.getItem(SKEY) || 'null');
      if (o && o.t && o.exp > Date.now() + 60 * 1000) return o.t;
    } catch (e) {}
    return null;
  }
  function saveSession(t, sec) { try { sessionStorage.setItem(SKEY, JSON.stringify({ t: t, exp: Date.now() + (sec || 21600) * 1000 })); } catch (e) {} }
  function clearSession() { try { sessionStorage.removeItem(SKEY); } catch (e) {} }
  function clearAll() { clearSession(); }

  function postJson(body) {
    return fetch(C.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // プリフライト(OPTIONS)を避ける。GAS は OPTIONS に対応しない
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(function (r) {
      // 返事が JSON でないとき（Google の「アクセス権が必要です」のページなど）は、原因が分かる文にする
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (j) return j;
        if (/アクセス権|You need access|ログイン|Sign in|accounts\.google\.com/i.test(t) || r.status === 401 || r.status === 403) throw new Error('サーバー（API用のデプロイ）に入れません。Apps Script のデプロイの「アクセスできるユーザー」が「全員」になっているか、API_URL が「API用デプロイ」の URL か、確認してください。(' + r.status + ')');
        throw new Error('サーバーの返事を読み取れません (' + r.status + ')。API_URL が正しいか確認してください。');
      });
    });
  }

  function loginMessage(e) {
    var s = String(e && e.message || e);
    if (s === 'LOGIN_FAILED') return '学籍番号またはパスワードが違います。';
    if (s === 'LOCKED') return '失敗が続いたため、一時的に入れません。15分ほどたってから、もう一度お試しください。';
    if (s === 'API_DISABLED') return 'パスワードでのログインは、まだ有効になっていません。先生に伝えてください。';
    return s;
  }

  function login() {
    if (!C.API_URL) {
      overlay('<h2 style="margin:6px 0">アプリの設定が未完了です</h2><p class="meta" style="margin-top:8px">cp-config.js の API_URL を設定してください。<br>手順: docs/PWA-API設計.md</p>');
      return new Promise(function () {});          // 設定が済むまで先へ進めない
    }
    return new Promise(function (resolve) {
      var pw = C.PASSWORD_LOGIN !== false;
      var inp = 'width:100%;box-sizing:border-box;padding:12px;font-size:16px;border:1px solid #cbd5e1;border-radius:10px;margin-top:8px;';
      overlay('<h2 style="margin:6px 0;color:#0B2545">TNUSS CareerPort</h2>' +
        (pw ? '<form id="cp-pwform" style="text-align:left;margin-top:10px"><p class="meta" style="margin:0 0 4px;text-align:center">学籍番号とパスワードでログイン</p>' +
          '<input id="cp-sid" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="学籍番号" style="' + inp + '">' +
          '<input id="cp-spw" type="password" autocomplete="current-password" placeholder="パスワード" style="' + inp + '">' +
          '<button id="cp-pwbtn" type="submit" style="width:100%;margin-top:12px;padding:12px;font-size:16px;font-weight:700;color:#fff;background:#0B2545;border:0;border-radius:999px">ログイン</button></form>' : '') +
        '<p id="cp-login-msg" style="color:#dc2626;font-size:13px;margin-top:12px"></p>');
      var msg = function (t) { var m = document.getElementById('cp-login-msg'); if (m) m.textContent = t; };

      var form = document.getElementById('cp-pwform');
      if (form) form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var sid = document.getElementById('cp-sid').value.trim(), spw = document.getElementById('cp-spw').value;
        var btn = document.getElementById('cp-pwbtn');
        if (!sid || !spw) { msg('学籍番号とパスワードを入れてください。'); return; }
        btn.disabled = true; btn.textContent = '確認中…'; msg('');
        postJson({ fn: 'passwordLogin', args: [sid, spw] }).then(function (j) {
          if (j && j.ok && j.result && j.result.sessionToken) {
            saveSession(j.result.sessionToken, j.result.expiresIn); hideOverlay(); resolve({ sessionToken: j.result.sessionToken });
          } else { msg(loginMessage((j && j.error) || '不明なエラー')); }
        }).catch(function (e) { msg(loginMessage(e)); }).then(function () {
          if (document.getElementById('cp-pwbtn')) { btn.disabled = false; btn.textContent = 'ログイン'; }
          var f = document.getElementById('cp-spw'); if (f) f.value = '';
        });
      });


    });
  }

  // 現在の認証情報 { sessionToken } を返す。無ければログイン画面を出す
  function getAuth(force) {
    if (!force) {
      var s = storedSession(); if (s) return Promise.resolve({ sessionToken: s });
    }
    if (!waiting) waiting = login().then(function (a) { waiting = null; return a; }, function (e) { waiting = null; throw e; });
    return waiting;
  }

  /* ---------- API 呼び出し ---------- */
  // サーバーの返すエラーを、直し方が分かる文にする
  function explain(e) {
    var s = String(e);
    if (s === 'API_DISABLED') return 'サーバー側で、アプリ用の API が有効になっていません。管理者に、スクリプトプロパティ API_CLIENT_ID（Googleログイン）または API_PASSWORD_LOGIN（パスワードログイン）の設定を依頼してください。';
    if (s === 'UNAUTHORIZED') return 'ログインの有効期限が切れました。もう一度ログインしてください。';
    if (s === 'UNKNOWN_FN') return 'このアプリは、まだこの操作に対応していません（サーバー側の code.gs が古い可能性があります）。';
    if (/^Users未登録/.test(s)) return 'このアカウント（' + s.replace(/^Users未登録:\s*/, '') + '）は、名簿に登録されていません。担任の先生に伝えてください。';
    if (/^Students未登録/.test(s)) return 'このアカウント（' + s.replace(/^Students未登録:\s*/, '') + '）は、生徒として登録されていません。このアプリは生徒用です（教員は、PC・スマホのブラウザで、通常のページをお使いください）。';
    return s;
  }
  function call(fn, args, retried) {
    // 設定が空のときは、保存済みの認証情報があっても通信せず、設定案内を出して止める
    if (!C.API_URL) return login();
    return getAuth(retried).then(function (auth) {
      return postJson({ fn: fn, args: args, sessionToken: auth.sessionToken });
    }).then(function (j) {
      if (j && j.ok) return j.result;
      if (j && j.error === 'UNAUTHORIZED' && !retried) { clearAll(); return call(fn, args, true); }   // 期限切れ → ログインし直して1回だけ再試行
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

  window.CP_AUTH = { signOut: function () {
    var s = storedSession(), done = function () { clearAll(); location.reload(); };
    if (s && C.API_URL) postJson({ fn: 'logout', args: [], sessionToken: s }).then(done, done); else done();   // サーバー側のセッションも無効にする
  } };
})();
