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
    events: [], years: [], curFy: null, viewFy: null, archive: null,   // 年度: viewFy が null なら今年度。過去の年度は archive に読み込む
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

  var slowTimer = 0;
  function showSkeleton(msg) {
    setChrome(false);
    $nav.innerHTML = '';
    $view.innerHTML = '<div class="skeleton" style="margin-top:56px"></div><div class="skeleton"></div><div class="skeleton"></div>' +
      (msg ? '<p class="meta" id="slowHint" style="text-align:center;margin-top:16px" role="status">' + esc(msg) + '</p>' : '');
    clearTimeout(slowTimer);
    if (msg) slowTimer = setTimeout(function () {   // 長く待たされたときは、止まっているように見えないよう、案内と再読み込みを出す
      var h = document.getElementById('slowHint');
      if (h) h.innerHTML = '時間がかかっています。しばらく待っても表示されないときは、<button class="btn" style="margin-top:10px" onclick="location.reload()">再読み込み</button>';
    }, 15000);
  }

  function showMessage(title, text, retry) {
    setChrome(false);
    $nav.innerHTML = '';
    $view.innerHTML = '<div class="empty" style="padding-top:96px">' + L.icon('info') + '<b>' + esc(title) + '</b>' + esc(text) +
      (retry ? '<div class="btn-wrap" style="margin-top:20px"><button class="btn" data-act="retry">再読み込み</button></div>' : '') + '</div>';
    L.acts.retry = retry || function () {};
  }

  function loadState(hadCache, pre) {
    var token = L.token();
    var child = S.role === 'teacher' ? undefined : (L.store.get(CHILD_KEY) || undefined);
    // pre: ログインの返事に載っていた最初のデータ（あれば、通信せずにそれを使う）
    return (pre ? Promise.resolve(pre) : L.api('getState', { token: token, studentId: child }).then(function (state) {
      if (state.role === 'guest' && child) {
        L.store.remove(CHILD_KEY);
        return L.api('getState', { token: token });
      }
      return state;
    })).then(function (state) {
      S.lastFetch = Date.now();
      setOffline(false);
      if (state.role === 'guest') {
        var fresh = L.justLoggedIn; L.justLoggedIn = false;
        clearSession(); showLogin();
        // ログインは通ったのに、すぐ「未ログイン」に戻されたとき（サーバー側の設定の問題）は、黙って戻さず、理由を出す
        if (fresh) { var er = document.getElementById('loginError'); if (er) { er.textContent = 'ログインはできましたが、ログイン状態の確認に失敗しました。管理者に、サーバー（Apps Script）の設定の確認を依頼してください。'; er.classList.remove('hidden'); } }
        return;
      }
      L.justLoggedIn = false;
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
        if (S.tab === 'form') L.refreshChrome();
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
      S.events = state.events || [];
      S.curFy = state.fy || S.curFy;
      S.years = state.years || S.years;
      S.serverOffset = state.serverTime ? new Date(state.serverTime).getTime() - Date.now() : 0;
    } else {
      S.grades = state.grades || [];
      S.classes = state.classes || [];
      S.students = state.students || [];
      S.senders = state.senders || [];
      S.perm = state.perm || 'poster';
      S.events = state.events || [];
      S.defaultSender = state.defaultSender || '';
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
      S.curFy = res.fy || S.curFy;
      S.years = res.years || S.years;
      L.store.cacheSet('tposts', res.posts);
      updateBadge();
      if (forceRender || !prev || !same(prev, res.posts)) render(null, true);
    }).catch(function () {
      if (S.tposts) setOffline(true);
      else showMessage('通信できませんでした', '電波の良い場所で、もう一度お試しください。', function () { showSkeleton(); loadTeacherPosts(true); });
    });
  }

  L.refresh = function () {
    var p = S.role === 'teacher' ? loadTeacherPosts(false) : loadState(true);
    if (S.viewFy) return Promise.resolve(p).then(function () { return loadArchive(S.viewFy, true); });
    return p;
  };

  // ---------- 年度の切り替え（過去の年度は、選んだときだけ読み込む） ----------
  function loadArchive(fy, silent) {
    var req = S.role === 'teacher'
      ? L.api('getAllPosts', { token: L.token(), fy: fy })
      : L.api('getState', { token: L.token(), studentId: S.child.id, fy: fy });
    return req.then(function (res) {
      if (S.viewFy !== fy) return;
      if (!res.ok && res.role !== 'parent') { if (!silent) L.ui.toast(res.error || '読み込めませんでした', true); return false; }
      S.archive = res.posts || [];
      render(null, true);
      return true;
    }).catch(function () { if (!silent) L.ui.toast('通信できませんでした', true); return false; });
  }

  function setYear(fy) {
    var cur = fy === S.curFy ? null : fy;
    if (cur === S.viewFy) return;
    S.detail = null;
    S.filter = { cat: 'ALL', unread: false, scheduled: false, q: '' };
    S.viewFy = cur;
    S.archive = null;
    if (!cur) { render(null, false); return; }
    render(null, false);
    loadArchive(cur, false).then(function (ok) { if (ok === false) { S.viewFy = null; S.archive = null; render(null, false); } });
  }

  L.acts.pickYear = function () {
    var years = S.years && S.years.length ? S.years : [S.curFy];
    L.ui.actions({
      title: '年度を選ぶ',
      items: years.map(function (y) {
        return { label: y + '年度' + (y === S.curFy ? '（今年度）' : ''), selected: (S.viewFy || S.curFy) === y, onTap: function () { setYear(y); } };
      })
    });
  };
  L.acts.thisYear = function () { setYear(S.curFy); };

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
    S.role = null; S.posts = []; S.tposts = null; S.viewFy = null; S.archive = null; S.detail = null; S.tab = 'home';
    S.nonce = Math.random().toString(36).slice(2);
    if (navigator.clearAppBadge) navigator.clearAppBadge().catch(function () {});
  }

  // ---------- ログイン ----------
  /** アプリ名を、最初の単語（学校の略称）と、残り（サービス名）に分けて表示する */
  function wordmark() {
    var title = (typeof APP_TITLE !== 'undefined' && APP_TITLE) || '配布物・連絡事項';
    var i = title.indexOf(' ');
    return i > 0 ? '<span class="w1">' + esc(title.slice(0, i)) + '</span><span class="w2">' + esc(title.slice(i + 1)) + '</span>' : esc(title);
  }
  L.wordmark = wordmark;

  // ---------- 教員の Google ログイン（Google Identity Services） ----------
  function hasGoogle() { return typeof GOOGLE_CLIENT_ID === 'string' && /\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID); }
  function setupGoogleButton(onToken) {
    function render() {
      var box = document.getElementById('gsiBtn');
      if (!box || !window.google || !google.accounts || !google.accounts.id) return;
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: function (r) { if (r && r.credential) onToken(r.credential); }, auto_select: false, ux_mode: 'popup' });
      google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'ja', width: Math.min(300, (box.parentNode.clientWidth || 300)) });
    }
    if (window.google && google.accounts && google.accounts.id) return render();
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true; s.onload = render;
    s.onerror = function () { var b = document.getElementById('gsiBtn'); if (b) b.innerHTML = '<p class="meta">Google のログインを読み込めませんでした。通信を確認してください。</p>'; };
    document.head.appendChild(s);
  }

  // 教員用のログイン画面は、アドレスの末尾に「#teacher」を付けたとき（例: https://○○.github.io/○○/#teacher）だけ出す
  function isTeacherLogin() { return hasGoogle() && /^#teacher$/.test(location.hash || ''); }

  window.addEventListener('hashchange', function () {   // ログイン画面のまま「#teacher」を付け外ししたときは、画面を切り替える
    if (!L.token() && document.querySelector('.page.login')) showLogin();
  });

  function showLogin() {
    var tl = isTeacherLogin();
    setChrome(false);
    $nav.innerHTML = '';
    $view.innerHTML =
      '<div class="page login">' +
      '<img class="crest" src="icons/crest.png" alt="" width="96">' +
      '<h1>' + esc((typeof APP_TITLE !== 'undefined' && APP_TITLE) || '配布物・連絡事項') + '</h1>' +
      ((typeof APP_TAGLINE !== 'undefined' && APP_TAGLINE) ? '<p class="tagline">' + esc(APP_TAGLINE) + '</p>' : '') +
      ((typeof SCHOOL_NAME !== 'undefined' && SCHOOL_NAME) ? '<p class="sub">' + esc(SCHOOL_NAME) + '</p>' : '') +
      (tl
        ? '<p class="lead">教員の方は、学校の Google アカウントで<br>ログインしてください</p>' +
          '<div id="gsiBtn" class="gsi-wrap" aria-label="Google でログイン"></div>' +
          '<div class="error-text hidden" id="loginError" style="text-align:left;margin:12px 4px 0"></div>'
        : '<p class="lead">発行されたIDとパスワードで<br>ログインしてください</p>' +
          '<div class="group"><div class="field"><label for="loginId">ID</label>' +
          '<input id="loginId" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ログインID（学籍番号）"></div>' +
          '<div class="field" style="position:relative"><label for="loginPw">パスワード</label>' +
          '<input id="loginPw" type="password" autocomplete="current-password" placeholder="パスワード"></div></div>' +
          '<div class="error-text hidden" id="loginError" style="text-align:left;margin:0 4px 12px"></div>' +
          '<button class="btn" id="loginBtn">ログイン</button>') +
      '<p class="foot">IDやパスワードが分からない場合は、学校へお問い合わせください。</p>' +
      '</div>';
    var err = document.getElementById('loginError');
    function fail(msg) { err.textContent = msg; err.classList.remove('hidden'); }
    function enter(res) {
      L.store.clearCache(); L.store.remove(CHILD_KEY); L.store.set(TOKEN_KEY, res.token);
      L.justLoggedIn = true;
      S.role = null; showSkeleton('ログインしています…（初回は少し時間がかかります）'); loadState(false, res.state && res.state.role ? res.state : null);
    }
    if (tl) setupGoogleButton(function (idToken) {
      err.classList.add('hidden');
      L.api('loginGoogle', { idToken: idToken }).then(function (res) { if (!res.ok) return fail(res.error); enter(res); })
        .catch(function () { fail('通信できませんでした。電波の良い場所でお試しください。'); });
    });
    if (tl) return;
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
        L.justLoggedIn = true;
        S.role = null;
        showSkeleton('ログインしています…（初回は少し時間がかかります）');
        loadState(false, res.state && res.state.role ? res.state : null);
      }).catch(function () {
        btn.disabled = false;
        fail('通信できませんでした。電波の良い場所でお試しください。');
      });
    };
  }

  // ---------- 画面の枠 ----------
  // 画面の幅が広いとき（PC・タブレットの横向き）は、サイドバー＋一覧＋詳細の3つの領域で表示する
  var mq = window.matchMedia('(min-width: 900px)');
  function isWide() { return mq.matches; }
  L.isWide = isWide;
  var SB_KEY = 'letterSidebar';

  function sidebarCollapsed() {
    var pref = L.store.get(SB_KEY);
    if (pref === 'closed') return true;
    if (pref === 'open') return false;
    return window.innerWidth < 1200;   // 窓が狭いときは、自動でたたむ
  }

  function setChrome(on) {
    if (!on) document.body.classList.remove('wide');
    $tabbar.classList.toggle('hidden', !on);
    $view.classList.toggle('no-tabbar', !on);
  }

  // 管理者: 承認待ちの投稿の数（メールではなく、アプリの中の印と、アイコンのバッジでお知らせする）
  function pendingApprovals() {
    if (S.role !== 'teacher' || S.perm !== '管理者') return 0;
    return (S.tposts || []).filter(function (p) { return p.status === '承認待ち'; }).length;
  }
  L.counts = L.counts || {};
  L.counts.approvals = pendingApprovals;

  function unreadCount() { return S.posts.filter(function (p) { return !p.read; }).length; }
  function pendingSurveys() { return S.posts.filter(function (p) { return p.option && p.option.type === 'survey' && !p.option.answered && !p.option.closed; }).length; }
  function pendingInterviews() { return S.posts.filter(function (p) { return p.option && p.option.type === 'interview' && !p.option.mySlot && !p.option.closed; }).length; }
  L.counts = { unread: unreadCount, surveys: pendingSurveys, interviews: pendingInterviews };

  function updateBadge() {
    if (S.role !== 'parent' && !(S.role === 'teacher' && S.perm === '管理者')) return;
    var n = S.role === 'teacher' ? pendingApprovals() : unreadCount() + pendingSurveys() + pendingInterviews();
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

  /** 下のメニュー（スマホ）とサイドバー（PC）で共通の、移動先の一覧 */
  function navItems() {
    var items = [];
    items.push({ kind: 'tab', id: 'home', label: '連絡', icon: 'notice', badge: S.role === 'parent' ? unreadCount() : pendingApprovals() });
    items.push({ kind: 'tab', id: 'cal', label: '予定', icon: 'calendar' });
    if (S.role === 'parent') {
      items.push({ kind: 'tab', id: 'survey', label: 'アンケート', icon: 'survey', badge: pendingSurveys() });
      items.push({ kind: 'tab', id: 'iv', label: '面談', icon: 'interview', badge: pendingInterviews() });
      var forms = (typeof FORM_LINKS !== 'undefined' && FORM_LINKS) || [];
      if (forms.length === 1) items.push({ kind: 'tab', id: 'form', label: forms[0].label, icon: forms[0].icon || 'link', idx: 0 });
      else if (forms.length > 1) items.push({ kind: 'forms', id: 'form', label: '届け出', icon: 'link' });
    } else {
      if (S.perm !== '閲覧のみ') items.push({ kind: 'compose', label: '作成', icon: 'compose' });
    }
    return items;
  }

  function itemAttrs(it) {
    if (it.kind === 'tab') return ' data-act="tab" data-tab="' + it.id + '"' + (it.idx != null ? ' data-idx="' + it.idx + '"' : '');
    return it.kind === 'forms' ? ' data-act="forms"' : ' data-act="compose"';
  }

  function tabbarHtml() {
    return '<div class="tabbar-inner">' + navItems().map(function (it) {
      var badge = it.badge ? '<span class="tab-badge">' + (it.badge > 99 ? '99+' : it.badge) + '</span>' : '';
      return '<button class="tab' + (it.id && S.tab === it.id ? ' active' : '') + '"' + itemAttrs(it) + ' aria-label="' + esc(it.label) + '">' +
        '<span class="ico">' + L.icon(it.icon, '', !!(it.id && S.tab === it.id)) + '</span><span class="lbl">' + esc(it.label) + '</span>' + badge + '</button>';
    }).join('') + '</div>';
  }

  function sidebarHtml() {
    var school = (typeof SCHOOL_NAME !== 'undefined' && SCHOOL_NAME) || '';
    var collapsed = sidebarCollapsed();
    var h = '<aside class="sidebar" aria-label="メニュー">' +
      '<div class="sb-brand"><div class="sb-crest"><img src="icons/crest.png" alt="">' + (school ? '<span class="sb-school">' + esc(school) + '</span>' : '') + '</div><b class="wordmark">' + wordmark() + '</b></div>';
    if (S.role === 'teacher' && S.perm !== '閲覧のみ') h += '<button class="sb-primary" data-act="compose" title="新規投稿">' + L.icon('compose') + '<span>新規投稿</span></button>';
    h += '<div class="sb-head">メニュー</div>';
    navItems().forEach(function (it) {
      if (it.kind === 'compose') return;
      var badge = it.badge ? '<span class="sb-badge">' + (it.badge > 99 ? '99+' : it.badge) + '</span>' : '';
      var on = !!(it.id && S.tab === it.id);
      h += '<button class="sb-item' + (on ? ' active' : '') + '"' + itemAttrs(it) + ' title="' + esc(it.label) + '">' + L.icon(it.icon, '', on) + '<span class="sb-label">' + esc(it.label) + '</span>' + badge + '</button>';
    });
    var cp = (typeof CAREERPORT_URL !== 'undefined' && CAREERPORT_URL) || '';
    if (/^https:\/\//.test(cp)) {
      h += '<a class="sb-item" href="' + esc(cp) + '" target="_blank" rel="noopener" title="CareerPort を開く">' + L.icon('link') + '<span class="sb-label">CareerPort</span></a>';
    }
    var multi = S.role === 'parent' && S.children.length > 1;
    h += '<button class="sb-item sb-who sb-account" data-act="' + (multi ? 'whoMenu' : 'account') + '" title="' + (multi ? 'アカウント・子どもの切り替え' : 'アカウント') + '">' + L.icon('person') +
      '<span class="sb-label">' + esc(S.name) + '<small>' + (S.role === 'teacher' ? '教員' : (S.child ? esc(L.fmt.cls(S.child)) : '')) + '</small></span>' + (multi ? L.icon('chevD') : '') + '</button>' +
      '<button class="sb-item sb-who sb-toggle" data-act="toggleSidebar" title="サイドバーの表示を切り替える" aria-label="サイドバーの表示を切り替える">' +
      L.icon(collapsed ? 'panelOpen' : 'panelClose') + '<span class="sb-label">' + (collapsed ? '広げる' : '閉じる') + '</span></button></aside>';
    return h;
  }

  function navHtml(cfg) {
    var left = '';
    if (cfg.back) {
      left = '<button class="nb-btn nb-back" data-act="back" aria-label="戻る">' + L.icon('back') + '</button>';
    }
    var right = (cfg.right || '');
    if (!cfg.back && S.role === 'parent' && S.children.length > 1) {
      right += '<button class="nb-child" data-act="switchChild" aria-label="子どもを切り替える（いま：' + esc(S.child.name) + '）"><span>' + esc(S.child.name) + '</span>' + L.icon('chevD') + '</button>';
    }
    if (S.role === 'teacher' && !cfg.hideCompose && S.perm !== '閲覧のみ') {
      right += '<button class="nb-btn" data-act="compose" aria-label="新規投稿">' + L.icon('compose') + '</button>';
    }
    right += '<button class="nb-btn" data-act="account" aria-label="アカウント"><span class="nb-avatar">' + L.icon('person') + '</span></button>';
    var title = cfg.back ? (cfg.title || '') : (cfg.title || '');
    return '<div class="nb-inner">' + (left ? '<div class="nb-left">' + left + '</div>' : '') + '<div class="nb-title">' + esc(title) + '</div><div class="nb-right">' + right + '</div></div>';
  }

  var TAB_EMPTY = {
    home: ['notice', '連絡を選んでください', '左の一覧から選ぶと、ここに内容が表示されます。'],
    cal: ['calendar', '予定を選んでください', '日付を選んで、予定をクリックすると、内容が表示されます。'],
    survey: ['survey', 'アンケートを選んでください', '左の一覧から選ぶと、回答できます。'],
    iv: ['interview', '面談を選んでください', '左の一覧から選ぶと、予約できます。']
  };
  function emptyDetail() {
    var e = TAB_EMPTY[S.tab] || TAB_EMPTY.home;
    return '<div class="empty-detail">' + L.icon(e[0]) + '<b>' + esc(e[1]) + '</b><span>' + esc(e[2]) + '</span></div>';
  }

  function markSelected() {
    Array.prototype.forEach.call($view.querySelectorAll('[data-act="open"]'), function (r) {
      r.classList.toggle('selected', r.getAttribute('data-id') === S.detail);
    });
  }

  function renderDetailPane() {
    var pd = document.getElementById('paneDetail');
    if (!pd || S.tab === 'form') return render();
    var vd = S.detail ? L.views.detail(S.detail) : null;
    pd.innerHTML = vd ? '<div class="detail-inner">' + vd.html + '</div>' : emptyDetail();
    pd.scrollTop = 0;
    if (vd && vd.bind) vd.bind(pd);
    markSelected();
  }

  function renderWide(keepScroll) {
    var pl = document.getElementById('paneList'), pd = document.getElementById('paneDetail');
    var listTop = keepScroll && pl ? pl.scrollTop : 0, detailTop = keepScroll && pd ? pd.scrollTop : 0;
    var offline = '<div id="offlineBar" class="offline-bar' + (S.offline ? '' : ' hidden') + '" style="margin-top:0">通信できないため、前回表示した内容を表示しています。</div>';
    var main, vl = null, vd = null, vf = null;
    if (S.tab === 'form') {
      vf = L.views.form();
      main = '<section class="pane pane-main"><header class="pane-head"><h1>' + esc(vf.nav.title) + '</h1>' + (vf.nav.right || '') + '</header>' +
        '<div class="pane-body fill" id="paneDetail">' + vf.html + '</div></section>';
    } else {
      vl = (L.views[S.tab] || L.views.home)();
      vd = S.detail ? L.views.detail(S.detail) : null;
      main = '<section class="pane pane-list"><header class="pane-head"><h1>' + esc(vl.nav.title) + '</h1></header>' +
        '<div class="pane-body" id="paneList">' + offline + vl.html + '</div></section>' +
        '<section class="pane pane-detail"><div class="pane-body" id="paneDetail">' + (vd ? '<div class="detail-inner">' + vd.html + '</div>' : emptyDetail()) + '</div></section>';
    }
    document.body.classList.add('wide');
    $nav.innerHTML = '';
    $view.classList.remove('fill');
    $view.innerHTML = '<div class="shell' + (sidebarCollapsed() ? ' sb-collapsed' : '') + '">' + sidebarHtml() + '<div class="main">' + main + '</div></div>';
    if (vl && vl.bind) vl.bind($view);
    if (vd && vd.bind) vd.bind($view);
    if (vf && vf.bind) vf.bind($view);
    var nl = document.getElementById('paneList'), nd = document.getElementById('paneDetail');
    if (nl && listTop) nl.scrollTop = listTop;
    if (nd && detailTop) nd.scrollTop = detailTop;
    markSelected();
  }

  // ---------- 描画 ----------
  /**
   * anim: 'push'（詳細へ進む）／'pop'（戻る）／null。keepScroll: 再取得による更新のとき、位置を保つ。
   */
  function render(anim, keepScroll) {
    if (!S.role) return;
    if (isWide()) { renderWide(keepScroll); return; }
    document.body.classList.remove('wide');
    var y = keepScroll ? window.scrollY : 0;
    var v;
    if (S.detail) v = L.views.detail(S.detail);
    else v = (L.views[S.tab] || L.views.home)();

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

  /** 未読数などが変わったとき、メニュー（スマホ）／サイドバー（PC）だけを更新する */
  L.refreshChrome = function () {
    if (isWide()) {
      var sb = $view.querySelector('.sidebar');
      if (sb) sb.outerHTML = sidebarHtml();
    } else {
      $tabbar.innerHTML = tabbarHtml();
    }
  };
  L.tabbarHtml = L.refreshChrome;

  function updateScrolled() {
    $nav.classList.toggle('scrolled', window.scrollY > 2);
  }
  window.addEventListener('scroll', updateScrolled, { passive: true });

  function onWidthChange() { if (S.role) render(null, false); }
  if (mq.addEventListener) mq.addEventListener('change', onWidthChange); else mq.addListener(onWidthChange);
  window.addEventListener('resize', L.debounce(function () {
    // メディアクエリの通知が届かない環境でも、幅が変わったら表示を切り替える
    if (S.role && isWide() !== document.body.classList.contains('wide')) { render(null, false); return; }
    var shell = document.querySelector('.shell');
    if (shell && isWide()) shell.classList.toggle('sb-collapsed', sidebarCollapsed());
  }, 150));

  L.acts.toggleSidebar = function () {
    L.store.set(SB_KEY, sidebarCollapsed() ? 'open' : 'closed');
    var shell = document.querySelector('.shell');
    if (shell) shell.classList.toggle('sb-collapsed', sidebarCollapsed());
    L.refreshChrome();
  };

  // ---------- 画面遷移 ----------
  L.go = function (tab, idx) {
    if (isWide()) {
      if (tab === 'form') S.formIdx = idx || 0;
      else if (S.tab === tab && !S.detail) { L.refresh(); return; }
      S.detail = null;
      S.tab = tab;
      render();
      return;
    }
    if (tab === 'form') {
      // 届け出のフォームは、下のメニューを残したまま、アプリの中に表示する
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
    S.detail = id;
    if (isWide()) {
      // 分割表示では、一覧の選択だけを入れ替える（履歴は増やさず、共有できるURLだけ更新する）
      try { history.replaceState({ d: id, n: S.nonce, wide: true }, '', '#post=' + id); } catch (e) {}
      renderDetailPane();
    } else {
      S.scrollByTab[S.tab] = window.scrollY;
      try { history.pushState({ d: id, n: S.nonce }, '', '#post=' + id); } catch (e) {}
      render('push');
      window.scrollTo(0, 0);
    }
    if (S.role === 'parent') markRead(id);
  };

  L.back = function () {
    if (!isWide() && ownEntry(history.state)) { history.back(); return; }
    closeDetail();
  };

  function closeDetail() {
    S.detail = null;
    if (isWide()) {
      try { history.replaceState({ root: true }, '', location.pathname + location.search); } catch (e) {}
      renderDetailPane();
      return;
    }
    render('pop');
    window.scrollTo(0, S.scrollByTab[S.tab] || 0);
  }

  window.addEventListener('popstate', function (e) {
    if (!S.role || isWide()) return;
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
    var p = (S.posts.filter(function (x) { return x.id === id; })[0]) || (S.archive || []).filter(function (x) { return x.id === id; })[0];
    if (!p || p.read) return;
    p.read = true;
    var cached = L.store.cacheGet('state:parent');
    if (cached && cached.posts) {
      cached.posts.forEach(function (x) { if (x.id === id) x.read = true; });
      L.store.cacheSet('state:parent', cached);
    }
    Array.prototype.forEach.call($view.querySelectorAll('.post-row[data-id="' + id + '"]'), function (r) { r.classList.remove('unread'); });
    updateBadge();
    L.refreshChrome();
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
          label: c.name + '（' + L.fmt.cls(c) + '）',
          selected: c.id === S.child.id,
          onTap: function () { switchChild(c.id); }
        };
      })
    });
  };

  // 左下の欄から開く: きょうだいの切り替えと、アカウント（ログアウトなど）
  L.acts.whoMenu = function () {
    L.ui.actions({
      title: S.name,
      items: S.children.map(function (c) {
        return { label: c.name + '（' + L.fmt.cls(c) + '）', selected: c.id === S.child.id, onTap: function () { switchChild(c.id); } };
      }).concat([{ label: 'アカウント・ログアウト', onTap: function () { L.acts.account(); } }])
    });
  };

  function switchChild(id) {
    if (S.child && id === S.child.id) return;
    L.store.set(CHILD_KEY, id);
    S.detail = null;
    S.posts = [];
    S.viewFy = null; S.archive = null;
    S.forms = {};
    S.ivSel = {};
    S.filter = { cat: 'ALL', unread: false, scheduled: false, q: '' };
    showSkeleton();
    loadState(false);
  }

  L.acts.account = function () {
    var push = window.LetterPush;
    var st = S.role === 'parent' && push ? push.status() : 'unconfigured';
    var body = '<div class="section"><div class="group">' +
      '<div class="row"><span class="row-icon">' + L.icon('person') + '</span><span class="row-main"><span class="row-label">' + esc(S.name) + '</span>' +
      '<span class="row-value">' + (S.role === 'teacher' ? '教員' : (S.child ? esc(L.fmt.cls(S.child)) : '')) + '</span></span></div></div></div>';
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
  // 開いたままのときも、一定の間隔で最新に更新する（先生は1分、保護者は3分）。
  // 画面が隠れているとき、投稿画面や確認ウィンドウを開いているとき、文字を入力しているときは更新しない。
  var AUTO_REFRESH_MS = { teacher: 60 * 1000, parent: 3 * 60 * 1000 };
  var refreshing = false;
  setInterval(function () {
    if (!S.role || refreshing || document.visibilityState !== 'visible') return;
    if (Date.now() - S.lastFetch < AUTO_REFRESH_MS[S.role]) return;
    if (document.body.classList.contains('sheet-open')) return;
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return;
    refreshing = true;
    Promise.resolve(L.refresh()).then(function () { refreshing = false; }, function () { refreshing = false; });
  }, 15 * 1000);
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
})();
