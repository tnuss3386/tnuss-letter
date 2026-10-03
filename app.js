// 土台: 起動・ログイン・状態の取得・画面の枠（ナビゲーションバー／タブバー）・画面遷移
(function () {
  'use strict';
  var L = window.L;
  var esc = L.esc;

  var $nav = document.getElementById('navbar');
  var $view = document.getElementById('view');
  var $tabbar = document.getElementById('tabbar');

  var TOKEN_KEY = 'letterSessionToken';
  var CHILD_KEY = 'letterChild';
  var CACHE_PREFIX = 'letterCache:';
  var REFRESH_AFTER_MS = 60 * 1000;

  var S = L.S = {
    role: null, name: '', categories: [],
    children: [], child: null, posts: [],
    grades: [], classes: [], students: [], tposts: null,
    tab: 'home', detail: null, offline: false,
    filter: { cat: 'ALL', unread: false, scheduled: false, q: '' },
    lastFetch: 0, scrollByTab: {}
  };
  L.acts = {};
  L.views = {};

  // ---------- 端末への保存（ログイン情報と、前回表示したデータ） ----------
  L.store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    remove: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    cacheGet: function (name) {
      var raw = L.store.get(CACHE_PREFIX + name);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },
    cacheSet: function (name, value) { L.store.set(CACHE_PREFIX + name, JSON.stringify(value)); },
    clearCache: function () {
      try {
        Object.keys(localStorage).forEach(function (k) { if (k.indexOf(CACHE_PREFIX) === 0) localStorage.removeItem(k); });
      } catch (e) {}
    }
  };
  L.token = function () { return L.store.get(TOKEN_KEY); };

  L.api = function (action, params) {
    return fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, params || {}))
    }).then(function (r) { return r.json(); });
  };

  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  // ---------- 起動 ----------
  function boot() {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(GAS_URL)) {
      showMessage('設定が未完了です', 'config.js の GAS_URL にウェブアプリのURLを入力してください。');
      return;
    }
    var token = L.token();
    if (!token) return showLogin();

    var parentCache = L.store.cacheGet('state:parent');
    var teacherCache = L.store.cacheGet('state:teacher');
    var cached = parentCache && parentCache.cachedChild === L.store.get(CHILD_KEY) ? parentCache : (teacherCache || parentCache);
    if (cached && cached.role) {
      applyState(cached);
      if (cached.role === 'teacher') applyTeacherPosts(L.store.cacheGet('tposts'));
      render();
      openFromHash();
    } else {
      showSkeleton();
    }
    loadState(!!cached);
  }

  function showSkeleton() {
    setChrome(false);
    $nav.innerHTML = '';
    $view.innerHTML = '<div class="skeleton" style="margin-top:56px"></div><div class="skeleton"></div><div class="skeleton"></div>';
  }

  function showMessage(title, text, retry) {
    setChrome(false);
    $nav.innerHTML = '';
    $view.innerHTML = '<div class="empty" style="padding-top:96px">' + L.icon('info') + '<b>' + esc(title) + '</b>' + esc(text) +
      (retry ? '<div class="btn-wrap" style="margin-top:20px"><button class="btn" data-act="retry">再読み込み</button></div>' : '') + '</div>';
    L.acts.retry = retry || function () {};
  }

  function loadState(hadCache) {
    var token = L.token();
    var child = S.role === 'teacher' ? undefined : (L.store.get(CHILD_KEY) || undefined);
    return L.api('getState', { token: token, studentId: child }).then(function (state) {
      if (state.role === 'guest' && child) {
        L.store.remove(CHILD_KEY);
        return L.api('getState', { token: token });
      }
      return state;
    }).then(function (state) {
      S.lastFetch = Date.now();
      setOffline(false);
      if (state.role === 'guest') { clearSession(); return showLogin(); }
      var key = 'state:' + state.role;
      var prev = L.store.cacheGet(key);
      if (state.role === 'parent') state.cachedChild = state.current.id;
      L.store.cacheSet(key, state);
      if (state.role === 'parent') L.store.set(CHILD_KEY, state.current.id);
      var changed = !hadCache || !prev || !same(prev, state);
      if (state.role === 'teacher') {
        var firstTime = S.role !== 'teacher';
        applyState(state);
        if (firstTime || !hadCache) render();
        loadTeacherPosts(!hadCache);
      } else if (changed) {
        applyState(state);
        // 届け出のフォームを入力中に、画面を作り直して入力が消えないようにする
        if (S.tab === 'form') $tabbar.innerHTML = tabbarHtml();
        else render(null, hadCache);
      }
      updateBadge();
      if (!hadCache) openFromHash();
      if (state.role === 'parent' && window.LetterPush && window.LetterPush.status() === 'on') {
        setTimeout(function () { window.LetterPush.sync(L.api, L.token()); }, 2500);
      }
    }).catch(function () {
      if (hadCache) setOffline(true);
      else showMessage('通信できませんでした', '電波の良い場所で、もう一度お試しください。', function () { showSkeleton(); loadState(false); });
    });
  }

  function applyState(state) {
    S.role = state.role;
    S.name = state.name;
    S.categories = state.categories || [];
    if (state.role === 'parent') {
      S.children = state.children && state.children.length ? state.children : [state.current];
      S.child = state.current;
      S.posts = state.posts || [];
      S.serverOffset = state.serverTime ? new Date(state.serverTime).getTime() - Date.now() : 0;
    } else {
      S.grades = state.grades || [];
      S.classes = state.classes || [];
      S.students = state.students || [];
    }
  }

  function applyTeacherPosts(posts) { if (posts) S.tposts = posts; }

  function loadTeacherPosts(forceRender) {
    return L.api('getAllPosts', { token: L.token() }).then(function (res) {
      S.lastFetch = Date.now();
      if (!res.ok) { if (!S.tposts) showMessage('読み込めませんでした', res.error); return; }
      setOffline(false);
      var prev = S.tposts;
      S.tposts = res.posts;
      L.store.cacheSet('tposts', res.posts);
      if (forceRender || !prev || !same(prev, res.posts)) render(null, true);
    }).catch(function () {
      if (S.tposts) setOffline(true);
      else showMessage('通信できませんでした', '電波の良い場所で、もう一度お試しください。', function () { showSkeleton(); loadTeacherPosts(true); });
    });
  }

  L.refresh = function () {
    if (S.role === 'teacher') return loadTeacherPosts(false);
    return loadState(true);
  };

  function setOffline(v) {
    if (S.offline === v) return;
    S.offline = v;
    var bar = document.getElementById('offlineBar');
    if (bar) bar.classList.toggle('hidden', !v);
  }
  L.isOffline = function () { return S.offline; };

  function clearSession() {
    L.store.remove(TOKEN_KEY);
    L.store.remove(CHILD_KEY);
    L.store.clearCache();
    S.role = null; S.posts = []; S.tposts = null; S.detail = null; S.tab = 'home';
    S.nonce = Math.random().toString(36).slice(2);
    if (navigator.clearAppBadge) navigator.clearAppBadge().catch(function () {});
  }

  // ---------- ログイン ----------
  function showLogin() {
    setChrome(false);
    $nav.innerHTML = '';
    document.body.classList.remove('has-tabs');
    $view.innerHTML =
      '<div class="page login">' +
      '<img class="crest" src="icons/crest.png" alt="" width="92">' +
      '<h1>配布物・連絡事項</h1>' +
      '<p class="lead">発行されたIDとパスワードで<br>ログインしてください</p>' +
      '<div class="group"><div class="field"><label for="loginId">ID</label>' +
      '<input id="loginId" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ログインID"></div>' +
      '<div class="field" style="position:relative"><label for="loginPw">パスワード</label>' +
      '<input id="loginPw" type="password" autocomplete="current-password" placeholder="パスワード"></div></div>' +
      '<div class="error-text hidden" id="loginError" style="text-align:left;margin:0 4px 12px"></div>' +
      '<button class="btn" id="loginBtn">ログイン</button>' +
      '<p class="foot">IDやパスワードが分からない場合は、学校へお問い合わせください。</p>' +
      '</div>';
    var err = document.getElementById('loginError');
    function fail(msg) { err.textContent = msg; err.classList.remove('hidden'); }
    document.getElementById('loginPw').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });
    document.getElementById('loginBtn').onclick = function () {
      var btn = this;
      err.classList.add('hidden');
      btn.disabled = true;
      L.api('login', {
        loginId: document.getElementById('loginId').value.trim(),
        password: document.getElementById('loginPw').value
      }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) return fail(res.error);
        L.store.clearCache();
        L.store.remove(CHILD_KEY);
        L.store.set(TOKEN_KEY, res.token);
        S.role = null;
        showSkeleton();
        loadState(false);
      }).catch(function () {
        btn.disabled = false;
        fail('通信できませんでした。電波の良い場所でお試しください。');
      });
    };
  }

  // ---------- 画面の枠 ----------
  function setChrome(on) {
    $tabbar.classList.toggle('hidden', !on);
    $view.classList.toggle('no-tabbar', !on);
  }

  function unreadCount() { return S.posts.filter(function (p) { return !p.read; }).length; }
  function pendingSurveys() { return S.posts.filter(function (p) { return p.option && p.option.type === 'survey' && !p.option.answered && !p.option.closed; }).length; }
  function pendingInterviews() { return S.posts.filter(function (p) { return p.option && p.option.type === 'interview' && !p.option.mySlot && !p.option.closed; }).length; }
  L.counts = { unread: unreadCount, surveys: pendingSurveys, interviews: pendingInterviews };

  function updateBadge() {
    if (S.role !== 'parent') return;
    var n = unreadCount() + pendingSurveys() + pendingInterviews();
    if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(n).catch(function () {});
    else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(function () {});
  }

  /** 保護者のフォームを開くURL（子どもの情報を入力済みにする）。embedded=true はアプリ内に埋め込んで表示するとき用 */
  function formUrl(form, embedded) {
    var fields = form.fields || {};
    var c = S.child || {};
    var values = { grade: c.grade, klass: c.klass, student: c.name, date: L.today() };
    var q = (embedded ? ['embedded=true'] : []).concat(['usp=pp_url']);
    Object.keys(fields).forEach(function (key) {
      if (fields[key] && values[key]) q.push(encodeURIComponent(fields[key]) + '=' + encodeURIComponent(values[key]));
    });
    return form.url + (form.url.indexOf('?') === -1 ? '?' : '&') + q.join('&');
  }
  L.formUrl = formUrl;

  function tabbarHtml() {
    var tabs = [];
    function tab(id, label, icon, badge, extra) {
      return '<button class="tab' + (S.tab === id ? ' active' : '') + '" data-act="tab" data-tab="' + id + '"' + (extra || '') + ' aria-label="' + esc(label) + '">' +
        L.icon(icon) + '<span class="lbl">' + esc(label) + '</span>' + (badge ? '<span class="tab-badge">' + (badge > 99 ? '99+' : badge) + '</span>' : '') + '</button>';
    }
    tabs.push(tab('home', '連絡', 'notice', S.role === 'parent' ? unreadCount() : 0));
    tabs.push(tab('cal', '予定', 'calendar'));
    if (S.role === 'parent') {
      tabs.push(tab('survey', 'アンケート', 'survey', pendingSurveys()));
      tabs.push(tab('iv', '面談', 'interview', pendingInterviews()));
      var forms = (typeof FORM_LINKS !== 'undefined' && FORM_LINKS) || [];
      if (forms.length === 1) {
        tabs.push(tab('form', forms[0].label, forms[0].icon || 'link', 0, ' data-idx="0"'));
      } else if (forms.length > 1) {
        tabs.push('<button class="tab' + (S.tab === 'form' ? ' active' : '') + '" data-act="forms">' + L.icon('link') + '<span class="lbl">届け出</span></button>');
      }
    } else {
      tabs.push('<button class="tab" data-act="compose" aria-label="新規投稿">' + L.icon('compose') + '<span class="lbl">作成</span></button>');
    }
    return '<div class="tabbar-inner">' + tabs.join('') + '</div>';
  }

  function navHtml(cfg) {
    var left = '';
    if (cfg.back) {
      left = '<button class="nb-btn nb-back" data-act="back" aria-label="戻る">' + L.icon('chevL') + '<span>' + esc(cfg.back) + '</span></button>';
    } else if (S.role === 'parent' && S.children.length > 1) {
      left = '<button class="nb-child" data-act="switchChild" aria-label="子どもを切り替える"><span>' + esc(S.child.name) + '</span>' + L.icon('chevD') + '</button>';
    }
    var right = (cfg.right || '');
    if (S.role === 'teacher' && !cfg.hideCompose) {
      right += '<button class="nb-btn" data-act="compose" aria-label="新規投稿">' + L.icon('compose') + '</button>';
    }
    right += '<button class="nb-btn" data-act="account" aria-label="アカウント"><span class="nb-avatar">' + L.icon('person') + '</span></button>';
    return '<div class="nb-inner"><div class="nb-left">' + left + '</div><div class="nb-title">' + esc(cfg.title || '') + '</div><div class="nb-right">' + right + '</div></div>';
  }

  // ---------- 描画 ----------
  /**
   * anim: 'push'（詳細へ進む）／'pop'（戻る）／null。keepScroll: 再取得による更新のとき、位置を保つ。
   */
  function render(anim, keepScroll) {
    if (!S.role) return;
    var y = keepScroll ? window.scrollY : 0;
    var v;
    if (S.detail) v = L.views.detail(S.detail);
    else v = (L.views[S.tab] || L.views.home)();

    document.body.classList.add('has-tabs');
    setChrome(true);
    $view.classList.toggle('fill', !!v.fill);
    $nav.classList.toggle('solid', !!v.fill);
    $nav.innerHTML = navHtml(v.nav || {});
    $tabbar.innerHTML = tabbarHtml();
    $view.innerHTML = '<div class="page' + (anim ? ' ' + anim : '') + '">' +
      '<div id="offlineBar" class="offline-bar' + (S.offline ? '' : ' hidden') + '">通信できないため、前回表示した内容を表示しています。</div>' +
      v.html + '</div>';
    if (v.bind) v.bind($view);
    if (keepScroll) window.scrollTo(0, y);
    updateScrolled();
  }
  L.render = render;

  function updateScrolled() {
    var lt = $view.querySelector('.large-title');
    var scrolled;
    if ($nav.classList.contains('solid')) scrolled = true;
    else if (lt) scrolled = lt.getBoundingClientRect().bottom < $nav.getBoundingClientRect().height + 4;
    else scrolled = window.scrollY > 4;
    $nav.classList.toggle('scrolled', scrolled);
  }
  window.addEventListener('scroll', updateScrolled, { passive: true });

  // ---------- 画面遷移 ----------
  L.go = function (tab, idx) {
    if (tab === 'form') {
      // 届け出のフォームは、下のボタンを残したまま、アプリの中に表示する
      S.detail = null;
      S.formIdx = idx || 0;
      S.scrollByTab[S.tab] = window.scrollY;
      S.tab = 'form';
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (S.detail) { S.detail = null; }
    else if (S.tab === tab) {
      if (window.scrollY > 40) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      L.refresh();
      return;
    }
    S.scrollByTab[S.tab] = window.scrollY;
    S.tab = tab;
    render();
    window.scrollTo(0, S.scrollByTab[tab] || 0);
  };

  // ログイン・ログアウトをまたいで、前の利用者の「戻る」履歴で画面が開かないよう、履歴に目印を付ける
  S.nonce = Math.random().toString(36).slice(2);
  function ownEntry(st) { return !!(st && st.d && st.n === S.nonce); }

  L.openPost = function (id) {
    S.scrollByTab[S.tab] = window.scrollY;
    S.detail = id;
    try { history.pushState({ d: id, n: S.nonce }, '', '#post=' + id); } catch (e) {}
    render('push');
    window.scrollTo(0, 0);
    if (S.role === 'parent') markRead(id);
  };

  L.back = function () {
    if (ownEntry(history.state)) { history.back(); return; }
    closeDetail();
  };

  function closeDetail() {
    S.detail = null;
    render('pop');
    window.scrollTo(0, S.scrollByTab[S.tab] || 0);
  }

  window.addEventListener('popstate', function (e) {
    if (!S.role) return;
    if (ownEntry(e.state)) { S.detail = e.state.d; render('push'); window.scrollTo(0, 0); }
    else if (S.detail) closeDetail();
  });

  function openFromHash() {
    var m = /^#post=([\w-]+)$/.exec(location.hash || '');
    if (!m || !S.role) return;
    var id = m[1];
    var list = S.role === 'teacher' ? S.tposts : S.posts;
    if (!list || !list.some(function (p) { return p.id === id; })) return;
    try {
      history.replaceState({ root: true }, '', location.pathname + location.search);
    } catch (e) {}
    L.openPost(id);
  }

  function markRead(id) {
    var p = S.posts.filter(function (x) { return x.id === id; })[0];
    if (!p || p.read) return;
    p.read = true;
    var cached = L.store.cacheGet('state:parent');
    if (cached && cached.posts) {
      cached.posts.forEach(function (x) { if (x.id === id) x.read = true; });
      L.store.cacheSet('state:parent', cached);
    }
    updateBadge();
    $tabbar.innerHTML = tabbarHtml();
    L.api('markRead', { token: L.token(), studentId: S.child.id, postIds: [id] }).catch(function () {});
  }

  // ---------- 操作（data-act）の受け付け ----------
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var fn = L.acts[el.getAttribute('data-act')];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  L.acts.tab = function (el) { L.go(el.getAttribute('data-tab'), +el.getAttribute('data-idx') || 0); };
  L.acts.back = function () { L.back(); };
  L.acts.open = function (el) { L.openPost(el.getAttribute('data-id')); };

  L.acts.forms = function () {
    var forms = FORM_LINKS || [];
    L.ui.actions({
      title: '届け出',
      items: forms.map(function (f, i) {
        return { label: f.label, selected: S.tab === 'form' && S.formIdx === i, onTap: function () { L.go('form', i); } };
      })
    });
  };

  L.acts.switchChild = function () {
    L.ui.actions({
      title: '表示する子どもを選ぶ',
      items: S.children.map(function (c) {
        return {
          label: c.name + '（' + c.grade + ' ' + c.klass + '）',
          selected: c.id === S.child.id,
          onTap: function () { switchChild(c.id); }
        };
      })
    });
  };

  function switchChild(id) {
    if (S.child && id === S.child.id) return;
    L.store.set(CHILD_KEY, id);
    S.detail = null;
    S.posts = [];
    S.filter = { cat: 'ALL', unread: false, scheduled: false, q: '' };
    showSkeleton();
    loadState(false);
  }

  L.acts.account = function () {
    var push = window.LetterPush;
    var st = S.role === 'parent' && push ? push.status() : 'unconfigured';
    var body = '<div class="section"><div class="group">' +
      '<div class="row"><span class="row-icon">' + L.icon('person') + '</span><span class="row-main"><span class="row-label">' + esc(S.name) + '</span>' +
      '<span class="row-value">' + (S.role === 'teacher' ? '教員' : (S.child ? esc(S.child.grade + ' ' + S.child.klass) : '')) + '</span></span></div></div></div>';
    if (st === 'off' || st === 'on') {
      body += '<div class="section"><div class="group"><label class="row"><span class="row-icon" style="background:var(--red)">' + L.icon('bell') + '</span>' +
        '<span class="row-label">新着をスマホに通知</span><span class="switch"><input type="checkbox" id="pushToggle"' + (st === 'on' ? ' checked' : '') + '><i></i></span></label></div>' +
        '<div class="group-footer">1日1回、新しい連絡があった日にまとめてお知らせします。「緊急」の連絡は、すぐにお知らせします。</div></div>';
    } else if (st === 'needs-install') {
      body += '<div class="section"><div class="banner">' + L.icon('info') + '<div>通知を受け取るには、ホーム画面に追加したアプリから開いてください。</div></div></div>';
    } else if (st === 'denied') {
      body += '<div class="section"><div class="banner warn">' + L.icon('info') + '<div>通知がブロックされています。端末の設定で、このアプリの通知を許可してください。</div></div></div>';
    }
    body += '<div class="section"><div class="group"><button class="row center destructive" id="logoutBtn">ログアウト</button></div></div>';
    var sheet = L.ui.sheet({ title: 'アカウント', right: { label: '完了', onTap: function (s) { s.close(); } }, body: body });
    var tg = sheet.el.querySelector('#pushToggle');
    if (tg) tg.addEventListener('change', function () {
      tg.disabled = true;
      var p = tg.checked ? push.enable(L.api, L.token()) : push.disable(L.api, L.token()).then(function () { return { ok: true }; });
      p.then(function (res) {
        tg.disabled = false;
        if (res.ok) { L.ui.toast(tg.checked ? '通知をオンにしました' : '通知をオフにしました'); render(null, true); return; }
        tg.checked = false;
        L.ui.toast(res.reason === 'server' ? res.error : (res.reason === 'denied' || res.reason === 'default') ? '通知が許可されませんでした' : '通知の設定に失敗しました', true);
      });
    });
    sheet.el.querySelector('#logoutBtn').addEventListener('click', function () {
      L.ui.confirm({ title: 'ログアウトしますか？', confirm: 'ログアウト', destructive: true }).then(function (ok) {
        if (!ok) return;
        sheet.close();
        if (window.LetterPush && S.role === 'parent') window.LetterPush.disable(L.api, L.token());
        clearSession();
        showLogin();
      });
    });
  };

  // アプリに戻ってきたとき、しばらく経っていれば最新に更新する
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S.role && Date.now() - S.lastFetch > REFRESH_AFTER_MS) L.refresh();
  });
  // 通知を押してアプリが開かれたとき、その投稿へ移動する
  window.addEventListener('letter:push', function () { if (S.role) L.refresh(); });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      var m = e.data && e.data.type === 'letter:open' && /#post=([\w-]+)/.exec(e.data.url || '');
      if (!m || !S.role) return;
      var id = m[1];
      L.refresh().then(function () {
        var list = S.role === 'teacher' ? S.tposts : S.posts;
        if (list && list.some(function (p) { return p.id === id; })) L.openPost(id);
      });
    });
  }

  L.boot = boot;
  L.updateBadge = updateBadge;
  L.tabbarHtml = function () { $tabbar.innerHTML = tabbarHtml(); };
})();
