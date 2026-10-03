// 画面の部品（アイコン・日付の表示・シート・通知バナー）
(function () {
  'use strict';
  var L = window.L = window.L || {};
  var TZ = 'Asia/Tokyo';

  L.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  L.htmlToText = function (html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  };

  // ---------- アイコン（Google Material Symbols。icons.js に埋め込み。currentColor で色が変わる） ----------
  var ALIAS = {
    notice: 'article', calendar: 'calendar_month', survey: 'assignment_turned_in', interview: 'groups', absence: 'event_busy',
    link: 'open_in_new', person: 'account_circle', plus: 'add', compose: 'edit_square',
    chevR: 'chevron_right', chevL: 'chevron_left', chevD: 'expand_more', back: 'arrow_back',
    xmark: 'cancel', clip: 'attach_file', bell: 'notifications', trash: 'delete', clock: 'schedule',
    panelClose: 'left_panel_close', panelOpen: 'left_panel_open'
  };
  L.icon = function (name, cls, filled) {
    var key = ALIAS[name] || name;
    var d = (filled && L.iconPathsFilled && L.iconPathsFilled[key]) || L.iconPaths[key] || '';
    return '<svg class="mi' + (cls ? ' ' + cls : '') + '" viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
  };

  // ---------- 日付（日本時間で表示） ----------
  var WD = { Sun: '日', Mon: '月', Tue: '火', Wed: '水', Thu: '木', Fri: '金', Sat: '土' };
  var dtf = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parts(d) {
    var date = d instanceof Date ? d : new Date(d);
    var o = {};
    dtf.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, H: +o.hour % 24, M: +o.minute, w: WD[o.weekday] };
  }
  function weekdayOfYmd(ymd) {
    var s = ymd.split('-');
    return new Date(Date.UTC(+s[0], +s[1] - 1, +s[2])).getUTCDay();
  }
  L.fmt = {
    parts: parts,
    md: function (d) { var p = parts(d); return p.m + '/' + p.d + '（' + p.w + '）'; },
    hm: function (d) { var p = parts(d); return pad(p.H) + ':' + pad(p.M); },
    mdhm: function (d) { var p = parts(d); return p.m + '/' + p.d + '（' + p.w + '）' + pad(p.H) + ':' + pad(p.M); },
    ymd: function (d) { var p = parts(d); return p.y + '-' + pad(p.m) + '-' + pad(p.d); },
    month: function (d) { var p = parts(d); return p.y + '年' + p.m + '月'; },
    ymdLabel: function (ymd) {
      var s = ymd.split('-');
      return (+s[1]) + '/' + (+s[2]) + '（' + '日月火水木金土'.charAt(weekdayOfYmd(ymd)) + '）';
    },
    ymdLong: function (ymd) {
      var s = ymd.split('-');
      return (+s[0]) + '年' + (+s[1]) + '月' + (+s[2]) + '日（' + '日月火水木金土'.charAt(weekdayOfYmd(ymd)) + '）';
    },
    weekdayOfYmd: weekdayOfYmd,
    pad: pad
  };
  // 学年・クラス・番号の表示を「1年A組3番」にそろえる（マスタには「第1学年」「A組」のまま入れておく。欠席届フォームへの入力と、配信対象の判定に使うため）
  L.fmt.grade = function (g) {
    var m = /^第?\s*(\d+)\s*学年$/.exec(String(g || '').trim());
    return m ? m[1] + '年' : String(g || '');
  };
  L.fmt.klass = function (k) {
    k = String(k || '').trim();
    return k && !/組$/.test(k) ? k + '組' : k;
  };
  /** 1年A組（番号があれば 1年A組3番） */
  L.fmt.cls = function (c, withNum) {
    var n = withNum !== false && c.num !== undefined && String(c.num).trim() !== '' ? String(c.num).trim() + '番' : '';
    return L.fmt.grade(c.grade) + L.fmt.klass(c.klass) + n;
  };
  L.today = function () { return L.fmt.ymd(new Date()); };

  // 日本時間の「日付＋時刻」と ISO の相互変換（端末の時刻設定に左右されないようにする）
  L.jst = {
    toIso: function (dateStr, timeStr) {
      var d = new Date(dateStr + 'T' + (timeStr || '00:00') + ':00+09:00');
      return isNaN(d.getTime()) ? '' : d.toISOString();
    },
    fromLocalInput: function (v) { // datetime-local の値
      if (!v) return '';
      var d = new Date(v + ':00+09:00');
      return isNaN(d.getTime()) ? '' : d.toISOString();
    },
    toLocalInput: function (iso) {
      if (!iso) return '';
      var p = parts(iso);
      return p.y + '-' + pad(p.m) + '-' + pad(p.d) + 'T' + pad(p.H) + ':' + pad(p.M);
    },
    addDays: function (ymd, n) {
      var s = ymd.split('-');
      var d = new Date(Date.UTC(+s[0], +s[1] - 1, +s[2] + n));
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }
  };

  // ---------- シート・アクションシート・通知バナー ----------
  L.ui = {};
  var overlays = [];

  function lockScroll() { document.body.classList.add('sheet-open'); }
  function unlockScroll() { if (!overlays.length) document.body.classList.remove('sheet-open'); }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlays.length) overlays[overlays.length - 1].close();
  });

  /** 下から出てくるシート。opts: { title, left, right, body(HTML), full } */
  L.ui.sheet = function (opts) {
    var backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    var sheet = document.createElement('div');
    sheet.className = 'sheet' + (opts.full ? ' full' : '');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML =
      '<div class="grabber"></div>' +
      '<div class="sheet-bar">' +
      '<div class="l">' + (opts.left ? '<button class="act" data-sheet="left">' + L.esc(opts.left.label) + '</button>' : '') + '</div>' +
      '<div class="ttl">' + L.esc(opts.title || '') + '</div>' +
      '<div class="r">' + (opts.right ? '<button class="act' + (opts.right.bold === false ? '' : ' bold') + '" data-sheet="right">' + L.esc(opts.right.label) + '</button>' : '') + '</div>' +
      '</div>' +
      '<div class="sheet-body' + (opts.flush ? ' flush' : '') + '">' + (opts.body || '') + '</div>';
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    lockScroll();

    var api = {
      el: sheet,
      body: sheet.querySelector('.sheet-body'),
      close: function () {
        if (!sheet.parentNode) return;
        sheet.remove();
        backdrop.remove();
        overlays = overlays.filter(function (o) { return o !== api; });
        unlockScroll();
        if (opts.onClose) opts.onClose();
      },
      setRight: function (label, disabled) {
        var b = sheet.querySelector('[data-sheet=right]');
        if (!b) return;
        if (label != null) b.textContent = label;
        b.disabled = !!disabled;
      }
    };
    overlays.push(api);
    backdrop.addEventListener('click', function () { if (!opts.modal) api.close(); });
    var lb = sheet.querySelector('[data-sheet=left]');
    if (lb) lb.addEventListener('click', function () { if (opts.left.onTap) opts.left.onTap(api); else api.close(); });
    var rb = sheet.querySelector('[data-sheet=right]');
    if (rb) rb.addEventListener('click', function () { if (opts.right.onTap) opts.right.onTap(api); });
    return api;
  };

  /**
   * 選択肢の一覧（スマホでは下から、PCでは中央に表示）。
   * opts: { title, message, items:[{label, destructive, selected, onTap}], cancel, dialog }
   * dialog が true のときは、確認用のダイアログ（本文＋横並びのボタン）で表示する。
   */
  L.ui.actions = function (opts) {
    var backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    var wrap = document.createElement('div');
    wrap.className = 'actions' + (opts.dialog ? ' alert' : '');
    wrap.setAttribute('role', opts.dialog ? 'alertdialog' : 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    var head = (opts.title || opts.message)
      ? '<div class="head">' + (opts.title ? '<b>' + L.esc(opts.title) + '</b>' : '') + (opts.message ? '<span>' + L.esc(opts.message) + '</span>' : '') + '</div>'
      : '';
    if (opts.dialog) {
      wrap.innerHTML = '<div class="panel">' + head + '<div class="buttons">' +
        '<button class="item cancel" data-i="-1">' + L.esc(opts.cancel || 'キャンセル') + '</button>' +
        (opts.items || []).map(function (it, i) {
          return '<button class="item primary' + (it.destructive ? ' destructive' : '') + '" data-i="' + i + '">' + L.esc(it.label) + '</button>';
        }).join('') + '</div></div>';
    } else {
      var items = (opts.items || []).map(function (it, i) {
        return '<button class="item' + (it.destructive ? ' destructive' : '') + (it.selected ? ' selected' : '') + '" data-i="' + i + '">' +
          '<span class="mark">' + (it.selected ? L.icon('check') : '') + '</span><span class="lbl">' + L.esc(it.label) + '</span></button>';
      }).join('');
      wrap.innerHTML = '<div class="panel">' + head + '<div class="scroll">' + items + '</div>' +
        '<button class="item cancel" data-i="-1">' + L.esc(opts.cancel || 'キャンセル') + '</button></div>';
    }
    document.body.appendChild(backdrop);
    document.body.appendChild(wrap);
    lockScroll();
    var picked = false;
    var api = {
      close: function () {
        if (!wrap.parentNode) return;
        wrap.remove(); backdrop.remove();
        overlays = overlays.filter(function (o) { return o !== api; });
        unlockScroll();
        if (!picked && opts.onCancel) opts.onCancel();
      }
    };
    overlays.push(api);
    backdrop.addEventListener('click', api.close);
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('button.item');
      if (!b) return;
      var i = +b.getAttribute('data-i');
      picked = i >= 0;
      api.close();
      if (i >= 0 && opts.items[i] && opts.items[i].onTap) opts.items[i].onTap();
    });
    return api;
  };

  /** 確認。「はい」なら true、キャンセルや外側のタップなら false で解決する。 */
  L.ui.confirm = function (opts) {
    return new Promise(function (resolve) {
      L.ui.actions({
        dialog: true,
        title: opts.title, message: opts.message, cancel: opts.cancel || 'キャンセル',
        items: [{ label: opts.confirm || 'OK', destructive: !!opts.destructive, onTap: function () { resolve(true); } }],
        onCancel: function () { resolve(false); }
      });
    });
  };

  L.ui.alert = function (message, title) {
    L.ui.actions({ dialog: true, title: title, message: message, cancel: '閉じる', items: [] });
  };

  var toastTimer = null;
  L.ui.toast = function (text, isError) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast' + (isError ? ' err' : '');
    t.setAttribute('role', 'status');
    t.textContent = text;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, isError ? 4200 : 2400);
  };

  /** 埋め込み表示（添付ファイル・フォーム）が開くまでの、回転するアイコンと文言 */
  L.loadingHtml = function (text) {
    return '<div class="doc-loading" role="status" aria-live="polite"><div class="spinner" aria-hidden="true"></div><span>' + L.esc(text || '読み込み中…') + '</span></div>';
  };
  /** frame の読み込みが終わったら overlay を消す。時間がかかるときは、文言を変えて待ってもらう */
  L.watchLoading = function (host, frame) {
    var timer = setTimeout(function () {
      var s = host.querySelector('.doc-loading span');
      if (s) s.textContent = '読み込みに時間がかかっています。電波の良い場所で、そのままお待ちください…';
    }, 10000);
    frame.addEventListener('load', function () {
      clearTimeout(timer);
      var l = host.querySelector('.doc-loading');
      if (l) l.remove();
    });
  };

  L.debounce = function (fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  };
})();
