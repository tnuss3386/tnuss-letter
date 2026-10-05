// 連絡の一覧・アンケート・面談の画面と、投稿の詳細
(function () {
  'use strict';
  var L = window.L;
  var S = L.S;
  var esc = L.esc;
  var PAGE_SIZE = 20;      // 1か月ぶんで最初に出す件数
  var NEW_MS = 3 * 86400000;
  var PUSH_DISMISS_KEY = 'letterPushDismiss';

  S.seg = { survey: 'todo', iv: 'todo' };
  S.ivSel = {};
  S.forms = {};
  var monthOpen = {};      // 月ごとの開閉（手で開閉したもの）
  var monthLimit = {};     // 月ごとに出している件数
  var allToggle = null;    // 'open' | 'closed': 「すべて開く／閉じる」を押したとき
  var AUTO_OPEN = 2;       // 何も絞り込んでいないとき、新しい方から何か月を開いておくか

  function sourcePosts() {
    if (S.viewFy) return S.archive;
    return S.role === 'teacher' ? S.tposts : S.posts;
  }
  L.findPost = function (id) {
    var list = sourcePosts() || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    if (S.viewFy) return null;
    return null;
  };

  function catColor(name) {
    for (var i = 0; i < S.categories.length; i++) if (S.categories[i].name === name) return S.categories[i].color;
    return '#2f5d8a';
  }
  L.catColor = catColor;
  function badge(name) { return '<span class="badge" style="--c:' + esc(catColor(name)) + '">' + esc(name) + '</span>'; }
  L.badge = badge;
  // 発信元（学年・分掌など）。カテゴリの色付きラベルとは別に、枠だけの控えめなラベルで添える
  function audTag(p) { return p.audience === '生徒' || p.audience === '保護者・生徒' ? '<span class="from-tag">' + (p.audience === '生徒' ? '生徒向け' : '保護者・生徒') + '</span>' : ''; }
  function fromTag(p) { return audTag(p) + (p.sender ? '<span class="from-tag">' + esc(p.sender) + '</span>' : ''); }
  L.fromTag = fromTag;

  var hayCache = {};
  function haystack(p) {
    var key = p.id + '|' + (p.edited || '');
    if (!hayCache[key]) hayCache[key] = (p.title + ' ' + p.category + ' ' + (p.sender || '') + ' ' + L.htmlToText(p.body)).toLowerCase();
    return hayCache[key];
  }

  // ---------- 行 ----------
  function optionTag(p) {
    var o = p.option;
    if (!o) return '';
    if (S.role === 'teacher') return '<span class="tag info">' + (o.type === 'survey' ? 'アンケート' : '面談') + '</span>';
    if (o.type === 'survey') {
      if (o.answered) return '<span class="tag ok">回答済み</span>';
      return o.closed ? '<span class="tag">終了</span>' : '<span class="tag warn">未回答</span>';
    }
    if (o.mySlot) return '<span class="tag ok">予約済み</span>';
    return o.closed ? '<span class="tag">終了</span>' : '<span class="tag warn">要予約</span>';
  }

  function statusTag(p) {
    if (p.status === '承認待ち') return '<span class="tag warn">承認待ち</span>';
    if (p.status === '差戻し') return '<span class="tag reject">差し戻し</span>';
    return '';
  }
  L.statusTag = statusTag;

  function rowHtml(p) {
    var teacher = S.role === 'teacher';
    var unread = !teacher && !p.read;
    var now = Date.now();
    var isNew = !p.scheduled && now - new Date(p.date).getTime() < NEW_MS;
    var sub = [];
    if (teacher && p.targetLabel) sub.push('対象：' + p.targetLabel);
    if (p.attachments.length) sub.push('添付 ' + p.attachments.length);
    if (p.eventDate) sub.push('行事 ' + L.fmt.ymdLabel(p.eventDate));
    if (p.option && p.option.deadline) sub.push((p.option.type === 'survey' ? '回答' : '予約') + '期限 ' + L.fmt.md(p.option.deadline));
    if (!teacher && p.option && p.option.type === 'interview' && p.option.mySlot) sub.push('予約：' + L.fmt.mdhm(p.option.mySlot.start));
    var when = p.scheduled ? '公開予定 ' + L.fmt.mdhm(p.date) : L.fmt.mdhm(p.date);
    return '<button class="row post-row' + (unread ? ' unread' : '') + '" data-act="open" data-id="' + esc(p.id) + '">' +
      '<span class="unread-dot"></span>' +
      '<span class="row-main">' +
      '<span class="row-meta">' + badge(p.category) + fromTag(p) + statusTag(p) + (p.scheduled ? '<span class="tag warn">予約中</span>' : '') + (isNew ? '<span class="tag new">NEW</span>' : '') + optionTag(p) + '<span>' + esc(when) + '</span></span>' +
      '<span class="row-title">' + esc(p.title) + '</span>' +
      (sub.length ? '<span class="row-sub">' + esc(sub.join('　')) + '</span>' : '') +
      '</span>' + L.icon('chevR', 'chev') + '</button>';
  }
  L.rowHtml = rowHtml;

  function groupedRows(items, withMonths) {
    return '<div class="section tight"><div class="group">' + items.map(rowHtml).join('') + '</div></div>';
  }

  function isFiltering() {
    var f = S.filter;
    return !!(f.q.trim() || f.cat !== 'ALL' || f.from || f.unread || f.scheduled || f.pending);
  }

  // 月ごとにまとめ、古い月は閉じておく（開閉は押して切り替え。未読がある月は、閉じていても件数でわかる）
  function monthsHtml(items) {
    var groups = [], idx = {};
    items.forEach(function (p) {
      var m = L.fmt.month(p.date);
      if (!(m in idx)) { idx[m] = groups.length; groups.push({ name: m, posts: [] }); }
      groups[idx[m]].posts.push(p);
    });
    var filtering = isFiltering(), teacher = S.role === 'teacher';
    var html = '';
    groups.forEach(function (g, gi) {
      var open;
      if (g.name in monthOpen) open = monthOpen[g.name];
      else if (allToggle) open = allToggle === 'open';
      else open = filtering || gi < AUTO_OPEN;
      var unread = teacher ? 0 : g.posts.filter(function (p) { return !p.read; }).length;
      html += '<div class="month' + (open ? ' open' : '') + '">' +
        '<button class="month-head" data-act="toggleMonth" data-m="' + esc(g.name) + '" aria-expanded="' + open + '">' +
        L.icon('chevR', 'chev') + '<span class="mh-name">' + esc(g.name) + '</span>' +
        '<span class="mh-n">' + g.posts.length + '件</span>' +
        (unread ? '<span class="mh-unread">未読' + unread + '</span>' : '') + '</button>';
      if (open) {
        var lim = monthLimit[g.name] || PAGE_SIZE;
        var shown = g.posts.slice(0, lim);
        html += '<div class="section tight"><div class="group">' + shown.map(rowHtml).join('');
        if (g.posts.length > shown.length) {
          html += '<button class="row center tint" data-act="moreMonth" data-m="' + esc(g.name) + '">さらに表示（残り' + (g.posts.length - shown.length) + '件）</button>';
        }
        html += '</div></div>';
      }
      html += '</div>';
    });
    return html;
  }

  L.acts.toggleMonth = function (el) {
    var m = el.getAttribute('data-m');
    monthOpen[m] = el.getAttribute('aria-expanded') !== 'true';
    drawList(true);
  };
  L.acts.moreMonth = function (el) {
    var m = el.getAttribute('data-m');
    monthLimit[m] = (monthLimit[m] || PAGE_SIZE) + PAGE_SIZE;
    drawList(true);
  };
  L.acts.toggleAllMonths = function () {
    var anyOpen = !!document.querySelector('#list .month.open');
    monthOpen = {};
    allToggle = anyOpen ? 'closed' : 'open';
    drawList(true);
  };

  // 「対応が必要なもの」: 未回答のアンケート・要予約の面談（期限が近い順）を、一覧の上にまとめて出す
  function todoHtml() {
    if (S.role !== 'parent' || S.viewFy || isFiltering()) return '';
    var todo = (S.posts || []).filter(function (p) {
      var o = p.option;
      if (!o || o.closed) return false;
      return o.type === 'survey' ? !o.answered : !o.mySlot;
    }).sort(function (a, b) { return (a.option.deadline || '9') < (b.option.deadline || '9') ? -1 : 1; });
    if (!todo.length) return '';
    var shown = todo.slice(0, 3);
    return '<div class="section todo-box"><div class="group-header">対応が必要です（' + todo.length + '件）</div><div class="group">' +
      shown.map(rowHtml).join('') +
      (todo.length > shown.length ? '<button class="row center tint" data-act="tab" data-tab="' + (shown[0].option.type === 'survey' ? 'survey' : 'iv') + '">すべて見る</button>' : '') +
      '</div></div>';
  }

  function emptyState(icon, title, text) {
    return '<div class="empty">' + L.icon(icon) + '<b>' + esc(title) + '</b>' + esc(text || '') + '</div>';
  }

  // ---------- 連絡（ホーム） ----------
  function pushBannerHtml() {
    if (S.role !== 'parent' || !window.LetterPush) return '';
    if (window.LetterPush.status() !== 'off' || L.store.get(PUSH_DISMISS_KEY)) return '';
    return '<div class="banner" id="pushBanner">' + L.icon('bell') +
      '<div style="flex:1"><b>新着をスマホに通知</b><br>1日1回、新しい連絡があった日にまとめてお知らせします。' +
      '<div style="margin-top:10px;display:flex;gap:14px;align-items:center"><button class="btn small" data-act="pushOn">オンにする</button><button class="link-btn" data-act="pushDismiss">あとで</button></div></div></div>';
  }

  L.acts.pushOn = function (el) {
    el.disabled = true;
    window.LetterPush.enable(L.api, L.token()).then(function (res) {
      if (res.ok) { L.ui.toast('通知をオンにしました'); L.render(null, true); return; }
      el.disabled = false;
      L.ui.toast(res.reason === 'server' ? res.error : (res.reason === 'denied' || res.reason === 'default') ? '通知が許可されませんでした' : '通知の設定に失敗しました', true);
    });
  };
  L.acts.pushDismiss = function () { L.store.set(PUSH_DISMISS_KEY, '1'); var b = document.getElementById('pushBanner'); if (b) b.remove(); };

  function filteredItems() {
    var f = S.filter, q = f.q.trim().toLowerCase();
    return (sourcePosts() || []).filter(function (p) {
      if (f.cat !== 'ALL' && p.category !== f.cat) return false;
      if (f.from && p.sender !== f.from) return false;
      if (f.unread && p.read) return false;
      if (f.scheduled && !p.scheduled) return false;
      if (f.pending && !p.status) return false;
      return !q || haystack(p).indexOf(q) !== -1;
    });
  }

  function chipsHtml() {
    var src = sourcePosts() || [];
    var f = S.filter, teacher = S.role === 'teacher';
    var counts = {};
    src.forEach(function (p) { counts[p.category] = (counts[p.category] || 0) + 1; });
    var h = '<button class="chip' + (f.cat === 'ALL' && !f.unread && !f.scheduled ? ' on' : '') + '" data-act="chipAll">すべて</button>';
    if (!teacher) {
      var un = src.filter(function (p) { return !p.read; }).length;
      h += '<button class="chip' + (f.unread ? ' on' : '') + '" data-act="chipUnread">未読<span class="n">' + un + '</span></button>';
    } else {
      var pd = src.filter(function (p) { return p.status; }).length;
      if (pd) h += '<button class="chip' + (f.pending ? ' on' : '') + '" data-act="chipPending">' + (S.perm === '管理者' ? '承認待ち・差し戻し' : '承認待ち・差し戻し') + '<span class="n">' + pd + '</span></button>';
      var sc = src.filter(function (p) { return p.scheduled; }).length;
      if (sc) h += '<button class="chip' + (f.scheduled ? ' on' : '') + '" data-act="chipScheduled">予約中<span class="n">' + sc + '</span></button>';
    }
    S.categories.forEach(function (c) {
      if (!counts[c.name]) return;
      h += '<button class="chip' + (f.cat === c.name ? ' on' : '') + '" data-act="chipCat" data-cat="' + esc(c.name) + '">' + esc(c.name) + '<span class="n">' + counts[c.name] + '</span></button>';
    });
    return h;
  }

  // 開閉のたびに、見ている位置が飛ばないよう、スクロールしている要素（PCでは真ん中の枠、スマホでは画面全体）を探す
  function scroller(el) {
    for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      var oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    }
    return document.scrollingElement || document.documentElement;
  }

  // 発信元の絞り込み（2種類以上の発信元があるときだけ表示）
  function fromChipsHtml() {
    var src = sourcePosts() || [], counts = {}, order = [];
    src.forEach(function (p) {
      if (!p.sender) return;
      if (!counts[p.sender]) order.push(p.sender);
      counts[p.sender] = (counts[p.sender] || 0) + 1;
    });
    if (order.length < 2) return '';
    var names = [];
    ((S.role === 'teacher' ? S.senders : null) || []).forEach(function (g) { g.items.forEach(function (n) { names.push(n); }); });
    order.sort(function (a, b) {
      var ia = names.indexOf(a), ib = names.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || (a < b ? -1 : 1);
    });
    return '<span class="chips-label">発信元</span>' + order.map(function (n) {
      return '<button class="chip from' + (S.filter.from === n ? ' on' : '') + '" data-act="chipFrom" data-from="' + esc(n) + '">' + esc(n) + '<span class="n">' + counts[n] + '</span></button>';
    }).join('');
  }

  function drawList(keepScroll) {
    var list = document.getElementById('list');
    if (!list) return;
    var items = filteredItems();
    var chips = document.getElementById('chips');
    if (chips) chips.innerHTML = chipsHtml();
    var chips2 = document.getElementById('chips2');
    if (chips2) { var fh = fromChipsHtml(); chips2.innerHTML = fh; chips2.style.display = fh ? '' : 'none'; }
    var cnt = document.getElementById('resultLine');
    if (cnt) {
      var parts = [];
      if (isFiltering()) parts.push(items.length + '件');
      cnt.innerHTML = '<span>' + esc(parts.join('')) + '</span>' +
        (items.length > 8 ? '<button class="link-btn" data-act="toggleAllMonths">月をすべて開く／閉じる</button>' : '');
    }
    var y = document.getElementById('yearBar');
    if (y) y.innerHTML = yearBarHtml();
    if (!items.length) {
      list.innerHTML = todoHtml() + ((sourcePosts() || []).length
        ? emptyState('search', '該当する連絡はありません', '条件を変えてお試しください。')
        : emptyState('notice', '連絡はまだありません', S.viewFy ? 'この年度の連絡はありません。' : '新しい連絡が届くと、ここに表示されます。'));
      return;
    }
    var sc = keepScroll ? scroller(list) : null, y0 = sc ? sc.scrollTop : 0;
    list.innerHTML = todoHtml() + monthsHtml(items);
    if (sc) sc.scrollTop = y0;
  }

  function resetView() { monthOpen = {}; monthLimit = {}; allToggle = null; }
  L.acts.chipFrom = function (el) { var n = el.getAttribute('data-from'); S.filter.from = S.filter.from === n ? '' : n; resetView(); drawList(); };
  L.acts.chipPending = function () { S.filter.pending = !S.filter.pending; S.filter.cat = 'ALL'; S.filter.unread = false; S.filter.scheduled = false; resetView(); drawList(); };
  L.acts.chipAll = function () { S.filter.pending = false; S.filter.from = ''; S.filter.cat = 'ALL'; S.filter.unread = false; S.filter.scheduled = false; resetView(); drawList(); };
  L.acts.chipUnread = function () { S.filter.unread = !S.filter.unread; S.filter.cat = 'ALL'; resetView(); drawList(); };
  L.acts.chipScheduled = function () { S.filter.scheduled = !S.filter.scheduled; S.filter.cat = 'ALL'; resetView(); drawList(); };
  L.acts.chipCat = function (el) { S.filter.cat = el.getAttribute('data-cat'); S.filter.unread = false; S.filter.scheduled = false; resetView(); drawList(); };

  // 管理者: 承認待ちがあるとき、一覧の一番上に知らせる
  function approvalBannerHtml() {
    if (S.role !== 'teacher' || S.perm !== '管理者' || S.viewFy) return '';
    var n = (S.tposts || []).filter(function (p) { return p.status === '承認待ち'; }).length;
    if (!n) return '';
    return '<div class="banner warn" id="approvalBanner">' + L.icon('bell') + '<div style="flex:1"><b>承認待ちの投稿が' + n + '件あります。</b>' +
      '<div style="margin-top:10px"><button class="btn small" data-act="showPending">確認する</button></div></div></div>';
  }
  L.acts.showPending = function () { S.filter.pending = true; S.filter.cat = 'ALL'; S.filter.unread = false; S.filter.scheduled = false; resetView(); drawList(); };

  // 年度の表示。過去の年度を見ているときは、帯で知らせて、今年度に戻れるようにする
  function yearBarHtml() {
    var multi = (S.years || []).length > 1;
    if (S.viewFy) {
      return '<div class="year-banner">' + L.icon('clock') + '<span><b>' + S.viewFy + '年度</b>の連絡を表示中</span>' +
        '<button class="link-btn" data-act="pickYear">年度を変える</button><button class="link-btn" data-act="thisYear">今年度へ</button></div>';
    }
    return multi ? '<div class="year-bar"><button class="link-btn" data-act="pickYear">' + L.icon('calendar') + (S.curFy || '') + '年度 ▾　過去の年度を見る</button></div>' : '';
  }

  L.views.home = function () {
    var src = sourcePosts();
    if (src === null || src === undefined) {
      return { nav: { title: '連絡' }, html: '<div class="page-loading" role="status" aria-label="読み込み中"><div class="spinner" aria-hidden="true"></div></div>' };
    }
    resetView();
    var html = pushBannerHtml() + approvalBannerHtml() + '<div id="yearBar">' + yearBarHtml() + '</div>' +
      '<div class="search' + (S.filter.q ? ' has-text' : '') + '">' + L.icon('search', 'mag') +
      '<input id="q" type="search" placeholder="検索" value="' + esc(S.filter.q) + '" enterkeyhint="search" autocomplete="off">' +
      '<button class="clear" data-act="clearSearch" aria-label="消す">' + L.icon('xmark') + '</button></div>' +
      '<div class="chips" id="chips">' + chipsHtml() + '</div>' +
      '<div class="chips from-chips" id="chips2"></div>' +
      '<div class="result-line" id="resultLine"></div><div id="list"></div>';
    return {
      nav: { title: '連絡' },
      html: html,
      bind: function (root) {
        var q = root.querySelector('#q');
        q.addEventListener('input', L.debounce(function () {
          S.filter.q = q.value; resetView();
          q.parentNode.classList.toggle('has-text', !!q.value);
          drawList();
        }, 120));
        drawList();
      }
    };
  };
  L.acts.clearSearch = function () {
    S.filter.q = ''; resetView();
    var q = document.getElementById('q');
    if (q) { q.value = ''; q.parentNode.classList.remove('has-text'); q.focus(); }
    drawList();
  };

  // ---------- アンケート・面談のタブ ----------
  function segHtml(key, items) {
    var cur = S.seg[key];
    var tabs = [['todo', key === 'survey' ? '未回答' : '要予約'], ['done', key === 'survey' ? '回答済み' : '予約済み'], ['closed', '終了']];
    return '<div class="section" style="margin-bottom:14px"><div class="seg" role="tablist">' + tabs.map(function (t) {
      return '<button role="tab" class="' + (cur === t[0] ? 'on' : '') + '" data-act="seg" data-key="' + key + '" data-v="' + t[0] + '">' + t[1] + (items[t[0]].length ? '（' + items[t[0]].length + '）' : '') + '</button>';
    }).join('') + '</div></div>';
  }
  L.acts.seg = function (el) { S.seg[el.getAttribute('data-key')] = el.getAttribute('data-v'); L.render(null, true); };

  function optionTab(type, title, icon, labels) {
    var all = S.posts.filter(function (p) { return p.option && p.option.type === type; });
    var done = type === 'survey' ? function (p) { return p.option.answered; } : function (p) { return !!p.option.mySlot; };
    var items = {
      todo: all.filter(function (p) { return !done(p) && !p.option.closed; }),
      done: all.filter(function (p) { return done(p) && !p.option.closed; }),
      closed: all.filter(function (p) { return p.option.closed; })
    };
    var byDeadline = function (a, b) { return (a.option.deadline || '9') < (b.option.deadline || '9') ? -1 : 1; };
    items.todo.sort(byDeadline);
    var key = type === 'survey' ? 'survey' : 'iv';
    var cur = items[S.seg[key]];
    var html = segHtml(key, items);
    html += cur.length ? groupedRows(cur, false) : emptyState(icon, labels[S.seg[key]][0], labels[S.seg[key]][1]);
    return { nav: { title: title }, html: html };
  }

  L.views.survey = function () {
    return optionTab('survey', 'アンケート', 'survey', {
      todo: ['未回答のアンケートはありません', 'すべて回答済みです。'],
      done: ['回答済みのアンケートはありません', ''],
      closed: ['終了したアンケートはありません', '']
    });
  };
  L.views.iv = function () {
    return optionTab('interview', '面談', 'interview', {
      todo: ['予約が必要な面談はありません', ''],
      done: ['予約済みの面談はありません', ''],
      closed: ['終了した面談はありません', '']
    });
  };

  // ---------- 詳細 ----------
  function attachmentsHtml(p) {
    if (!p.attachments.length) return '';
    return '<div class="section"><div class="group-header">添付ファイル</div><div class="group">' + p.attachments.map(function (url, i) {
      return '<button class="row" data-act="viewAtt" data-url="' + esc(url) + '" data-n="' + (i + 1) + '"><span class="row-icon">' + L.icon('clip') + '</span>' +
        '<span class="row-label">添付ファイル ' + (i + 1) + '</span>' + L.icon('chevR', 'chev') + '</button>';
    }).join('') + '</div></div>';
  }

  // 添付ファイルは、Googleドライブのアプリに切り替わらないよう、アプリの中の画面に埋め込んで表示する
  L.acts.viewAtt = function (el) {
    var url = el.getAttribute('data-url');
    var m = /\/d\/([\w-]+)/.exec(url) || /[?&]id=([\w-]+)/.exec(url);
    if (!m) { window.open(url, '_blank', 'noopener'); return; }
    var id = m[1];
    var sheet = L.ui.sheet({
      full: true, flush: true,
      title: '添付ファイル ' + el.getAttribute('data-n'),
      left: { label: '保存・共有', onTap: function () { window.open('https://drive.google.com/uc?export=download&id=' + id, '_blank', 'noopener'); } },
      right: { label: '完了', onTap: function (s) { s.close(); } },
      body: L.loadingHtml('添付ファイルを開いています…') + '<iframe class="doc-frame" src="https://drive.google.com/file/d/' + id + '/preview" title="添付ファイル"></iframe>'
    });
    L.watchLoading(sheet.el, sheet.el.querySelector('iframe'));
  };

  // ---------- 届け出（既存のGoogleフォームを、アプリの中に表示する） ----------
  L.views.form = function () {
    var forms = (typeof FORM_LINKS !== 'undefined' && FORM_LINKS) || [];
    var f = forms[S.formIdx || 0] || forms[0];
    if (!f) return { nav: { title: '' }, html: emptyState('link', '届け出はありません') };
    return {
      fill: true,
      nav: {
        title: f.label, hideCompose: true,
        right: '<button class="nb-btn" data-act="openExternal" data-url="' + esc(L.formUrl(f, false)) + '" aria-label="ブラウザで開く">' + L.icon('link') + '</button>'
      },
      html: '<div class="form-wrap">' + L.loadingHtml('フォームを開いています…') +
        '<iframe class="form-frame" src="' + esc(L.formUrl(f, true)) + '" title="' + esc(f.label) + '"></iframe></div>',
      bind: function (root) {
        L.watchLoading(root, root.querySelector('iframe'));
      }
    };
  };
  L.acts.openExternal = function (el) { window.open(el.getAttribute('data-url'), '_blank', 'noopener'); };

  function eventChipHtml(p) {
    if (!p.eventDate) return '';
    var text = L.fmt.ymdLabel(p.eventDate) + (p.eventEndDate && p.eventEndDate !== p.eventDate ? ' 〜 ' + L.fmt.ymdLabel(p.eventEndDate) : '');
    return '<div class="event-chip">' + L.icon('calendar') + '<span>' + esc(text) + '</span></div>';
  }

  function backLabel() {
    return { home: '連絡', cal: '予定', survey: 'アンケート', iv: '面談' }[S.tab] || '戻る';
  }

  L.views.detail = function (id) {
    var p = L.findPost(id);
    var nav = { back: backLabel(), title: backLabel(), hideCompose: true };
    if (!p) {
      return { nav: nav, html: emptyState('info', '見つかりません', 'この連絡は削除されたか、表示できません。') };
    }
    var teacher = S.role === 'teacher';
    var html = '<div class="detail-meta">' + badge(p.category) + fromTag(p) +
      statusTag(p) + (p.scheduled ? '<span class="tag warn">公開予定</span>' : '') +
      '<span>' + esc(L.fmt.mdhm(p.date)) + '</span>' +
      (p.edited ? '<span>・編集済み</span>' : '') + '</div>' +
      '<h1 class="detail-title">' + esc(p.title) + '</h1>' + eventChipHtml(p) +
      '<div class="post-body">' + p.body + '</div>' +
      attachmentsHtml(p);
    if (!teacher && p.option) html += p.option.type === 'survey' ? surveyHtml(p) : interviewHtml(p);
    if (teacher) html += L.teacher.panelHtml(p);
    html += '<div class="author-line" style="margin-top:8px">投稿：' + esc(p.author || '') + '</div>';
    return {
      nav: nav,
      html: html,
      bind: function (root) { if (teacher) L.teacher.bindPanel(root, p); }
    };
  };

  // ---------- アンケートの回答 ----------
  // 入力中の回答は、子どもごとに分けて覚える（きょうだいで、選んだ内容が混ざらないように）
  function formKey(p) { return (S.child ? S.child.id : '') + ':' + p.id; }
  function formFor(p) {
    var k = formKey(p);
    if (!S.forms[k]) S.forms[k] = { answers: JSON.parse(JSON.stringify(p.option.answers || {})) };
    return S.forms[k];
  }

  function surveyHtml(p) {
    var o = p.option, f = formFor(p), ro = o.closed;
    var h = '';
    if (ro) h += '<div class="banner warn">' + L.icon('clock') + '<div><b>回答の受付は終了しました。</b>' + (o.answered ? '<br>あなたの回答は下に表示されています。' : '') + '</div></div>';
    else if (o.answered) h += '<div class="banner ok">' + L.icon('check') + '<div><b>回答済みです。</b><br>' + (o.deadline ? esc(L.fmt.mdhm(o.deadline)) + 'まで、内容を変更できます。' : '内容はいつでも変更できます。') + '</div></div>';
    else if (o.deadline) h += '<div class="banner">' + L.icon('clock') + '<div>回答期限：<b>' + esc(L.fmt.mdhm(o.deadline)) + '</b></div></div>';

    o.questions.forEach(function (q) {
      h += '<div class="section" data-qwrap="' + q.id + '"><div class="q-title">' + esc(q.text) +
        (q.required ? '<span class="req">必須</span>' : '') + (q.type === 'multi' ? '<span class="req" style="color:var(--label-2)">複数選択可</span>' : '') + '</div><div class="group">';
      var val = f.answers[q.id];
      if (q.type === 'text') {
        h += '<textarea class="text-area" data-qtext="' + q.id + '" maxlength="1000" placeholder="回答を入力"' + (ro ? ' disabled' : '') + '>' + esc(val || '') + '</textarea>';
      } else {
        q.options.forEach(function (opt, i) {
          var sel = q.type === 'single' ? val === opt : Array.isArray(val) && val.indexOf(opt) !== -1;
          h += '<button class="row opt-row' + (sel ? ' selected' : '') + (q.type === 'multi' ? ' square' : '') + '" data-act="pick" data-q="' + q.id + '" data-i="' + i + '"' + (ro ? ' disabled' : '') + '>' +
            '<span class="radio">' + L.icon('check') + '</span><span class="row-label">' + esc(opt) + '</span></button>';
        });
      }
      h += '</div></div>';
    });
    if (!ro) h += '<div class="btn-wrap"><button class="btn" data-act="submitSurvey" data-id="' + esc(p.id) + '">' + (o.answered ? '回答を変更する' : '回答を送信') + '</button></div>';
    return h;
  }

  L.acts.pick = function (el) {
    var p = L.findPost(S.detail);
    if (!p) return;
    var qid = el.getAttribute('data-q'), i = +el.getAttribute('data-i');
    var q = p.option.questions.filter(function (x) { return x.id === qid; })[0];
    var f = formFor(p), val = q.options[i];
    if (q.type === 'single') f.answers[qid] = val;
    else {
      var arr = Array.isArray(f.answers[qid]) ? f.answers[qid].slice() : [];
      var k = arr.indexOf(val);
      if (k === -1) arr.push(val); else arr.splice(k, 1);
      f.answers[qid] = arr;
    }
    var wrap = document.querySelector('[data-qwrap="' + qid + '"]');
    Array.prototype.forEach.call(wrap.querySelectorAll('.opt-row'), function (row) {
      var v = q.options[+row.getAttribute('data-i')];
      var sel = q.type === 'single' ? f.answers[qid] === v : (f.answers[qid] || []).indexOf(v) !== -1;
      row.classList.toggle('selected', sel);
    });
  };

  document.addEventListener('input', function (e) {
    var t = e.target.closest && e.target.closest('[data-qtext]');
    if (!t || !S.detail) return;
    var p = L.findPost(S.detail);
    if (p && p.option) formFor(p).answers[t.getAttribute('data-qtext')] = t.value;
  });

  L.acts.submitSurvey = function (el) {
    var p = L.findPost(el.getAttribute('data-id'));
    if (!p) return;
    var f = formFor(p);
    for (var i = 0; i < p.option.questions.length; i++) {
      var q = p.option.questions[i], a = f.answers[q.id];
      var empty = q.type === 'multi' ? !(a && a.length) : !(a && String(a).trim());
      if (q.required && empty) { L.ui.toast('「' + q.text + '」に回答してください', true); return; }
    }
    el.disabled = true;
    L.api('submitSurvey', { token: L.token(), studentId: S.child.id, postId: p.id, answers: f.answers }).then(function (res) {
      el.disabled = false;
      if (!res.ok) { L.ui.toast(res.error, true); return; }
      p.option.answered = true;
      p.option.answers = res.answers || f.answers;
      p.option.answeredAt = new Date().toISOString();
      delete S.forms[formKey(p)];
      L.store.cacheSet('state:parent', Object.assign({}, L.store.cacheGet('state:parent'), { posts: S.posts }));
      L.updateBadge();
      L.ui.toast('回答を送信しました');
      L.render(null, true);
    }).catch(function () { el.disabled = false; L.ui.toast('通信できませんでした。もう一度お試しください', true); });
  };

  // ---------- 面談の予約 ----------
  function slotRange(s) { return L.fmt.hm(s.start) + '〜' + L.fmt.hm(s.end); }

  function interviewHtml(p) {
    var o = p.option, h = '';
    if (o.note) h += '<div class="section"><div class="group"><div class="row-wrap" style="white-space:pre-wrap;line-height:1.65">' + esc(o.note) + '</div></div></div>';

    if (o.mySlot) {
      h += '<div class="section"><div class="group-header">あなたの予約</div><div class="group"><div class="my-slot"><span class="ic">' + L.icon('check') + '</span>' +
        '<div><div class="big">' + esc(L.fmt.md(o.mySlot.start)) + '</div><div>' + esc(slotRange(o.mySlot)) + '</div></div></div>' +
        (o.closed ? '' : '<button class="row center destructive" data-act="cancelSlot" data-id="' + esc(p.id) + '">予約を取り消す</button>') + '</div>' +
        (o.closed ? '' : '<div class="group-footer">別の時間に変更するには、下から新しい時間を選んでください。</div>') + '</div>';
    } else if (o.closed) {
      h += '<div class="banner warn">' + L.icon('clock') + '<div><b>予約の受付は終了しました。</b></div></div>';
    } else if (o.deadline) {
      h += '<div class="banner">' + L.icon('clock') + '<div>予約期限：<b>' + esc(L.fmt.mdhm(o.deadline)) + '</b></div></div>';
    }
    if (o.closed) return h;

    var days = {}, order = [];
    o.slots.forEach(function (s) { var d = L.fmt.ymd(s.start); if (!days[d]) { days[d] = []; order.push(d); } days[d].push(s); });
    if (!order.length) return h + '<div class="empty">' + L.icon('calendar') + '<b>予約できる時間がありません</b></div>';
    var selKey = (S.child ? S.child.id : '') + ':' + p.id;
    var sel = S.ivSel[selKey];
    if (!days[sel]) {
      sel = o.mySlot ? L.fmt.ymd(o.mySlot.start) : (order.filter(function (d) { return days[d].some(function (s) { return s.state === 'free' && new Date(s.start) > new Date(); }); })[0] || order[0]);
      S.ivSel[selKey] = sel;
    }
    h += '<div class="group-header" style="margin-top:4px">日にちを選ぶ</div><div class="date-scroll">' + order.map(function (d) {
      var mine = days[d].some(function (s) { return s.state === 'mine'; });
      var parts = d.split('-');
      return '<button class="date-pill' + (d === sel ? ' on' : '') + (mine ? ' has-mine' : '') + '" data-act="ivDate" data-id="' + esc(p.id) + '" data-d="' + d + '">' +
        '<span class="w">' + (+parts[1]) + '月</span><span class="d">' + (+parts[2]) + '</span><span class="w">' + '日月火水木金土'.charAt(L.fmt.weekdayOfYmd(d)) + '</span></button>';
    }).join('') + '</div>';
    h += '<div class="group-header">' + esc(L.fmt.ymdLong(sel)) + ' の時間</div><div class="slot-grid">' + days[sel].map(function (s) {
      var past = new Date(s.start).getTime() < Date.now();
      var cls = s.state === 'mine' ? 'mine' : s.state === 'taken' ? 'taken' : past ? 'past' : '';
      var note = s.state === 'mine' ? 'あなたの予約' : s.state === 'taken' ? '予約済み' : past ? '終了' : L.fmt.hm(s.end) + ' まで';
      return '<button class="slot ' + cls + '" data-act="book" data-id="' + esc(p.id) + '" data-slot="' + esc(s.id) + '"' + (cls && cls !== 'mine' ? ' disabled' : '') + '>' + L.fmt.hm(s.start) + '<small>' + note + '</small></button>';
    }).join('') + '</div>';
    return h;
  }

  L.acts.ivDate = function (el) { S.ivSel[(S.child ? S.child.id : '') + ':' + el.getAttribute('data-id')] = el.getAttribute('data-d'); L.render(null, true); };

  L.acts.book = function (el) {
    var p = L.findPost(el.getAttribute('data-id'));
    var slot = p && p.option.slots.filter(function (s) { return s.id === el.getAttribute('data-slot'); })[0];
    if (!slot || slot.state === 'mine') return;
    L.ui.confirm({
      title: '面談を予約しますか？',
      message: L.fmt.md(slot.start) + ' ' + slotRange(slot) + (p.option.mySlot ? '\n（いまの予約は取り消されます）' : ''),
      confirm: '予約する'
    }).then(function (ok) {
      if (!ok) return;
      L.api('bookSlot', { token: L.token(), studentId: S.child.id, postId: p.id, slotId: slot.id }).then(function (res) {
        if (!res.ok) { L.ui.toast(res.error, true); L.refresh(); return; }
        p.option.slots.forEach(function (s) { if (s.state === 'mine') s.state = 'free'; });
        slot.state = 'mine';
        p.option.mySlot = slot;
        L.store.cacheSet('state:parent', Object.assign({}, L.store.cacheGet('state:parent'), { posts: S.posts }));
        L.updateBadge();
        L.ui.toast('予約しました');
        L.render(null, true);
      }).catch(function () { L.ui.toast('通信できませんでした。もう一度お試しください', true); });
    });
  };

  L.acts.cancelSlot = function (el) {
    var p = L.findPost(el.getAttribute('data-id'));
    if (!p) return;
    L.ui.confirm({ title: '予約を取り消しますか？', message: p.option.mySlot ? L.fmt.md(p.option.mySlot.start) + ' ' + slotRange(p.option.mySlot) : '', confirm: '予約を取り消す', destructive: true }).then(function (ok) {
      if (!ok) return;
      L.api('cancelSlot', { token: L.token(), studentId: S.child.id, postId: p.id }).then(function (res) {
        if (!res.ok) { L.ui.toast(res.error, true); return; }
        p.option.slots.forEach(function (s) { if (s.state === 'mine') s.state = 'free'; });
        p.option.mySlot = null;
        L.store.cacheSet('state:parent', Object.assign({}, L.store.cacheGet('state:parent'), { posts: S.posts }));
        L.updateBadge();
        L.ui.toast('予約を取り消しました');
        L.render(null, true);
      }).catch(function () { L.ui.toast('通信できませんでした。もう一度お試しください', true); });
    });
  };
})();
