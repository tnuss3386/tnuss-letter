(function () {
  'use strict';

  var app = document.getElementById('app');
  var userbox = document.getElementById('userbox');
  var notice = document.getElementById('notice');

  var TOKEN_KEY = 'letterSessionToken';
  var CACHE_PREFIX = 'letterCache:';
  var PAGE_SIZE = 20;
  var NEW_DAYS = 3;
  var TEXT_COLORS = ['#222222', '#c0392b', '#1c5fbf', '#1e7a34', '#d9730d'];
  var REFRESH_AFTER_MS = 60 * 1000;

  var lastFetch = 0;
  var refreshCurrent = null;

  // ---------- 端末への保存（ログイン情報と、前回表示したデータ） ----------
  var storage = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    remove: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    clearCache: function () {
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf(CACHE_PREFIX) === 0) localStorage.removeItem(k);
        });
      } catch (e) {}
    }
  };
  function cacheGet(name) {
    var raw = storage.get(CACHE_PREFIX + name);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function cacheSet(name, value) { storage.set(CACHE_PREFIX + name, JSON.stringify(value)); }
  function clearSession() {
    storage.remove(TOKEN_KEY);
    storage.clearCache();
    refreshCurrent = null;
  }

  // ---------- 共通 ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function htmlToText(html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function api(action, params) {
    var body = JSON.stringify(Object.assign({ action: action }, params || {}));
    return fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    }).then(function (r) { return r.json(); });
  }

  function setNotice(text) {
    if (!text) { notice.classList.add('hidden'); return; }
    notice.textContent = text;
    notice.classList.remove('hidden');
  }

  function showSkeleton() {
    app.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  }

  function showFatal(message, retry) {
    app.innerHTML = '<div class="card"><p class="error">' + escapeHtml(message) + '</p>' +
      (retry ? '<button id="retryBtn">再読み込み</button>' : '') + '</div>';
    if (retry) document.getElementById('retryBtn').onclick = retry;
  }

  function setUserbox(label) {
    if (!label) { userbox.innerHTML = ''; return; }
    userbox.innerHTML = '<span class="who">' + escapeHtml(label) + '</span><button class="ghost" id="logoutBtn">ログアウト</button>';
    document.getElementById('logoutBtn').onclick = function () {
      clearSession();
      setNotice('');
      renderLogin();
    };
  }

  // ---------- 起動 ----------
  function boot() {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(GAS_URL)) {
      showFatal('設定が未完了です。config.js の GAS_URL にウェブアプリのURLを入力してください。');
      return;
    }
    var token = storage.get(TOKEN_KEY);
    if (!token) return renderLogin();

    var cached = cacheGet('state');
    if (cached && cached.role) {
      showState(token, cached);
    } else {
      showSkeleton();
    }
    fetchState(token, !!cached);
  }

  function fetchState(token, hasCache) {
    api('getState', { token: token }).then(function (state) {
      lastFetch = Date.now();
      setNotice('');
      if (state.role === 'guest') {
        clearSession();
        return renderLogin();
      }
      var prev = cacheGet('state');
      cacheSet('state', state);
      if (!hasCache || !same(prev, state)) showState(token, state, true);
    }).catch(function () {
      if (hasCache) setNotice('通信できないため、前回表示した内容を表示しています。');
      else showFatal('通信できませんでした。電波の良い場所でお試しください。', function () { showSkeleton(); fetchState(token, false); });
    });
  }

  function showState(token, state, refreshed) {
    if (state.role === 'teacher') {
      if (document.getElementById('pTitle')) return;
      renderTeacher(token, state);
    } else if (state.role === 'parent') {
      renderParent(token, state);
    }
  }

  // ---------- ログイン ----------
  function renderLogin() {
    setUserbox(null);
    app.innerHTML =
      '<div class="card">' +
      '<h2>ログイン</h2>' +
      '<p class="muted">発行されたIDとパスワードを入力してください。</p>' +
      '<label for="loginId">ログインID</label>' +
      '<input type="text" id="loginId" autocomplete="username" autocapitalize="off" autocorrect="off">' +
      '<label for="loginPw">パスワード</label>' +
      '<input type="password" id="loginPw" autocomplete="current-password">' +
      '<button id="loginBtn">ログイン</button>' +
      '<div class="error hidden" id="loginError"></div>' +
      '</div>';
    var errEl = document.getElementById('loginError');
    function fail(msg) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
    document.getElementById('loginPw').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });
    document.getElementById('loginBtn').onclick = function () {
      var btn = this;
      errEl.classList.add('hidden');
      btn.disabled = true;
      api('login', {
        loginId: document.getElementById('loginId').value.trim(),
        password: document.getElementById('loginPw').value
      }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) return fail(res.error);
        storage.clearCache();
        storage.set(TOKEN_KEY, res.token);
        showSkeleton();
        fetchState(res.token, false);
      }).catch(function () {
        btn.disabled = false;
        fail('通信できませんでした。電波の良い場所でお試しください。');
      });
    };
  }

  // ---------- 掲示板（保護者・教員共通の一覧表示） ----------
  function renderBoard(container, posts, categories) {
    var catMap = {};
    categories.forEach(function (c) { catMap[c.name] = c.color; });
    var items = posts.map(function (p) {
      return {
        post: p,
        time: new Date(p.date).getTime(),
        haystack: (p.title + ' ' + p.category + ' ' + htmlToText(p.body)).toLowerCase()
      };
    });
    var filter = { cat: 'ALL', q: '' };
    var limit = PAGE_SIZE;

    var counts = {};
    items.forEach(function (it) { counts[it.post.category] = (counts[it.post.category] || 0) + 1; });

    var chipsHtml = '<button class="chip active" data-cat="ALL">すべて（' + items.length + '）</button>' +
      categories.filter(function (c) { return counts[c.name]; }).map(function (c) {
        return '<button class="chip" data-cat="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '（' + counts[c.name] + '）</button>';
      }).join('');

    container.innerHTML =
      '<div class="filters">' +
      '<div class="search-wrap"><input type="search" id="boardSearch" placeholder="キーワードで検索"></div>' +
      '<div class="chips" id="boardChips">' + chipsHtml + '</div>' +
      '<div class="result-count" id="boardCount"></div>' +
      '</div>' +
      '<div id="boardList"></div>';

    var listEl = container.querySelector('#boardList');
    var countEl = container.querySelector('#boardCount');

    function draw() {
      var q = filter.q.trim().toLowerCase();
      var matched = items.filter(function (it) {
        return (filter.cat === 'ALL' || it.post.category === filter.cat) && (!q || it.haystack.indexOf(q) !== -1);
      });
      countEl.textContent = matched.length + '件';
      if (matched.length === 0) {
        listEl.innerHTML = '<div class="empty">該当する連絡はありません。</div>';
        return;
      }
      var shown = matched.slice(0, limit);
      var openAll = matched.length <= 3;
      var now = Date.now();
      var html = '';
      var lastMonth = '';
      shown.forEach(function (it) {
        var p = it.post;
        var d = new Date(p.date);
        var month = d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
        if (month !== lastMonth) {
          html += '<div class="month-head">' + month + '</div>';
          lastMonth = month;
        }
        var color = catMap[p.category] || '#2f5d8a';
        var isNew = now - it.time < NEW_DAYS * 86400000;
        var atts = (p.attachments || []).map(function (url, i) {
          return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">添付ファイル ' + (i + 1) + '</a>';
        }).join('');
        html +=
          '<details class="post" style="--cat:' + escapeHtml(color) + '"' + (openAll ? ' open' : '') + '>' +
          '<summary>' +
          '<div class="post-meta">' +
          '<span class="cat-badge">' + escapeHtml(p.category) + '</span>' +
          (isNew ? '<span class="new-badge">NEW</span>' : '') +
          '<span>' + formatShortDate(d) + '</span>' +
          (p.attachments && p.attachments.length ? '<span class="clip">添付 ' + p.attachments.length + '</span>' : '') +
          '</div>' +
          '<div class="post-title">' + escapeHtml(p.title) + '</div>' +
          '</summary>' +
          '<div class="post-content">' +
          '<div class="post-body">' + p.body + '</div>' +
          (atts ? '<div class="post-attachments">' + atts + '</div>' : '') +
          '<div class="muted" style="margin-top:12px">' + escapeHtml(p.author || '') + '</div>' +
          '</div></details>';
      });
      if (matched.length > shown.length) {
        html += '<button class="more-btn" id="moreBtn">さらに表示（残り' + (matched.length - shown.length) + '件）</button>';
      }
      listEl.innerHTML = html;
      var more = listEl.querySelector('#moreBtn');
      if (more) more.onclick = function () { limit += PAGE_SIZE; draw(); };
    }

    container.querySelector('#boardSearch').oninput = function () {
      filter.q = this.value;
      limit = PAGE_SIZE;
      draw();
    };
    container.querySelector('#boardChips').onclick = function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      filter.cat = btn.getAttribute('data-cat');
      limit = PAGE_SIZE;
      Array.prototype.forEach.call(this.querySelectorAll('.chip'), function (c) { c.classList.toggle('active', c === btn); });
      draw();
    };
    draw();
  }

  function formatShortDate(d) {
    var w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + '（' + w + '） ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // ---------- 保護者 ----------
  function renderParent(token, state) {
    setUserbox(state.name + ' さん');
    app.innerHTML = '<div id="board"></div>';
    renderBoard(document.getElementById('board'), state.posts, state.categories);
    refreshCurrent = function () { fetchState(token, true); };
  }

  // ---------- 教員 ----------
  function renderTeacher(token, state) {
    setUserbox(state.name + ' 先生');

    var catOptions = state.categories.map(function (c) {
      return '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>';
    }).join('');
    var gradeOptions = state.grades.map(function (g) {
      return '<option value="' + escapeHtml(g) + '">' + escapeHtml(g) + '</option>';
    }).join('');
    var classOptions = state.classes.map(function (c) {
      return '<option value="' + escapeHtml(c.grade) + '|' + escapeHtml(c.klass) + '">' +
        escapeHtml(c.grade) + ' ' + escapeHtml(c.klass) + '</option>';
    }).join('');
    var studentOptions = state.students.map(function (s) {
      return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name) +
        '（' + escapeHtml(s.grade) + ' ' + escapeHtml(s.klass) + '）</option>';
    }).join('');
    var swatches = TEXT_COLORS.map(function (c) {
      return '<button type="button" class="swatch" data-color="' + c + '" style="background:' + c + '" title="文字色"></button>';
    }).join('');

    app.innerHTML =
      '<div class="card">' +
      '<h2>新規投稿</h2>' +
      '<label for="pCategory">カテゴリ</label>' +
      '<select id="pCategory">' + catOptions + '</select>' +
      '<label for="pTitle">タイトル</label>' +
      '<input type="text" id="pTitle">' +
      '<label>本文</label>' +
      '<div class="toolbar" id="toolbar">' +
      '<button type="button" data-cmd="bold" title="太字"><b>B</b></button>' +
      '<button type="button" data-cmd="underline" title="下線"><u>U</u></button>' +
      '<span class="sep"></span>' + swatches +
      '<span class="sep"></span>' +
      '<button type="button" data-cmd="h3" title="見出し">見出し</button>' +
      '<button type="button" data-cmd="insertUnorderedList" title="箇条書き">・リスト</button>' +
      '<button type="button" id="linkBtn" title="リンク">リンク</button>' +
      '<button type="button" data-cmd="clear" title="書式クリア">書式解除</button>' +
      '</div>' +
      '<div class="toolbar hidden" id="linkBar" style="border-radius:0;border-top:none">' +
      '<input type="text" id="linkUrl" placeholder="https://example.com" style="flex:1;min-width:160px;padding:6px 10px">' +
      '<button type="button" id="linkApply">追加</button>' +
      '<button type="button" id="linkCancel">やめる</button>' +
      '</div>' +
      '<div class="editor" id="pBody" contenteditable="true" data-placeholder="本文を入力（選択した文字に太字・下線・色・リンクを付けられます）"></div>' +
      '<label for="pFiles">添付ファイル（複数選択可・任意）</label>' +
      '<input type="file" id="pFiles" multiple>' +
      '<label for="pTargetType">配信対象</label>' +
      '<select id="pTargetType">' +
      '<option value="ALL">全体</option>' +
      '<option value="GRADE">学年で指定</option>' +
      '<option value="CLASS">クラスで指定</option>' +
      '<option value="STUDENT">個人で指定（複数可）</option>' +
      '</select>' +
      '<div id="targetGradeWrap" class="hidden"><label>学年</label><select id="pGrade">' + gradeOptions + '</select></div>' +
      '<div id="targetClassWrap" class="hidden"><label>クラス</label><select id="pClass">' + classOptions + '</select></div>' +
      '<div id="targetStudentWrap" class="hidden"><label>生徒（Ctrl/Cmdで複数選択）</label><select id="pStudents" multiple size="6">' + studentOptions + '</select></div>' +
      '<button id="postBtn">投稿する</button>' +
      '<div class="error hidden" id="postError"></div>' +
      '<div class="success hidden" id="postSuccess"></div>' +
      '</div>' +
      '<div id="teacherPosts"></div>';

    setupEditor();

    document.getElementById('pTargetType').onchange = function () {
      document.getElementById('targetGradeWrap').classList.toggle('hidden', this.value !== 'GRADE');
      document.getElementById('targetClassWrap').classList.toggle('hidden', this.value !== 'CLASS');
      document.getElementById('targetStudentWrap').classList.toggle('hidden', this.value !== 'STUDENT');
    };
    document.getElementById('postBtn').onclick = function () { submitPost(token, state.categories); };

    loadTeacherPosts(token, state.categories);
    refreshCurrent = function () { loadTeacherPosts(token, state.categories); };
  }

  function setupEditor() {
    var editor = document.getElementById('pBody');
    var linkBar = document.getElementById('linkBar');
    var linkUrl = document.getElementById('linkUrl');
    var savedRange = null;

    function saveRange() {
      var sel = window.getSelection();
      if (sel.rangeCount && editor.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
    }
    function restoreRange() {
      editor.focus();
      if (savedRange) {
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
    }
    function exec(cmd, value) {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(cmd, false, value || null);
    }

    document.getElementById('toolbar').addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) e.preventDefault();
    });
    document.getElementById('toolbar').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      if (btn.id === 'linkBtn') {
        saveRange();
        linkBar.classList.remove('hidden');
        linkUrl.value = '';
        linkUrl.focus();
        return;
      }
      restoreRange();
      var color = btn.getAttribute('data-color');
      if (color) return exec('foreColor', color);
      var cmd = btn.getAttribute('data-cmd');
      if (cmd === 'h3') return exec('formatBlock', 'h3');
      if (cmd === 'clear') { exec('removeFormat'); return exec('formatBlock', 'div'); }
      if (cmd) exec(cmd);
    });

    function applyLink() {
      var url = linkUrl.value.trim();
      if (!url) return;
      if (!/^(https?:\/\/|mailto:)/i.test(url)) url = 'https://' + url;
      restoreRange();
      var sel = window.getSelection();
      if (sel.isCollapsed) {
        exec('insertHTML', '<a href="' + escapeHtml(url) + '">' + escapeHtml(url) + '</a>');
      } else {
        exec('createLink', url);
      }
      linkBar.classList.add('hidden');
    }
    document.getElementById('linkApply').onclick = applyLink;
    document.getElementById('linkCancel').onclick = function () { linkBar.classList.add('hidden'); };
    linkUrl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
    });

    editor.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result;
        resolve({ fileName: file.name, mimeType: file.type, base64Data: result.substring(result.indexOf(',') + 1) });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function submitPost(token, categories) {
    var title = document.getElementById('pTitle').value.trim();
    var editor = document.getElementById('pBody');
    var body = htmlToText(editor.innerHTML).trim() ? editor.innerHTML : '';
    var category = document.getElementById('pCategory').value;
    var targetType = document.getElementById('pTargetType').value;
    var targetValue = '';
    if (targetType === 'GRADE') targetValue = document.getElementById('pGrade').value;
    if (targetType === 'CLASS') targetValue = document.getElementById('pClass').value;
    if (targetType === 'STUDENT') {
      targetValue = Array.from(document.getElementById('pStudents').selectedOptions).map(function (o) { return o.value; }).join(',');
    }

    var errEl = document.getElementById('postError');
    var okEl = document.getElementById('postSuccess');
    errEl.classList.add('hidden');
    okEl.classList.add('hidden');

    if (!title) {
      errEl.textContent = 'タイトルを入力してください。';
      errEl.classList.remove('hidden');
      return;
    }

    var btn = document.getElementById('postBtn');
    btn.disabled = true;

    var files = Array.from(document.getElementById('pFiles').files || []);
    Promise.all(files.map(fileToBase64)).then(function (attachments) {
      return api('createPost', {
        token: token, title: title, body: body, attachments: attachments,
        targetType: targetType, targetValue: targetValue, category: category
      });
    }).then(function (res) {
      btn.disabled = false;
      if (!res.ok) {
        errEl.textContent = res.error;
        errEl.classList.remove('hidden');
        return;
      }
      okEl.textContent = '投稿しました。';
      okEl.classList.remove('hidden');
      document.getElementById('pTitle').value = '';
      editor.innerHTML = '';
      document.getElementById('pFiles').value = '';
      loadTeacherPosts(token, categories);
    }).catch(function () {
      btn.disabled = false;
      errEl.textContent = '通信できませんでした。投稿されていない可能性があります。履歴を確認してからもう一度お試しください。';
      errEl.classList.remove('hidden');
    });
  }

  function loadTeacherPosts(token, categories) {
    var wrap = document.getElementById('teacherPosts');
    if (!wrap) return;
    var cached = cacheGet('teacherPosts');
    function draw(posts) {
      wrap.innerHTML = '<div class="month-head" style="margin-top:28px">投稿履歴</div><div id="board"></div>';
      renderBoard(document.getElementById('board'), posts, categories);
    }
    if (cached) draw(cached);
    else wrap.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';

    api('getAllPosts', { token: token }).then(function (res) {
      lastFetch = Date.now();
      if (!res.ok) {
        wrap.innerHTML = '<div class="card"><p class="error">' + escapeHtml(res.error) + '</p></div>';
        return;
      }
      setNotice('');
      cacheSet('teacherPosts', res.posts);
      if (!cached || !same(cached, res.posts)) draw(res.posts);
    }).catch(function () {
      if (cached) setNotice('通信できないため、前回表示した内容を表示しています。');
      else wrap.innerHTML = '<div class="card"><p class="error">通信できませんでした。</p></div>';
    });
  }

  // アプリに戻ってきたとき、しばらく経っていれば最新に更新する
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && refreshCurrent && Date.now() - lastFetch > REFRESH_AFTER_MS) {
      refreshCurrent();
    }
  });

  boot();
})();
