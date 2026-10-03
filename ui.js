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

  // ---------- アイコン（線画。currentColor で色が変わる） ----------
  var ICONS = {
    notice: '<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M15 3v4h4M9 12h6M9 16h6"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    survey: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4h6v3H9zM9 14l2 2 4-4"/>',
    interview: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19.5c.5-3.2 2.8-5 5.5-5s5 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.3c2.6.1 4.2 1.7 4.6 4.4"/>',
    absence: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M10 13.5l4 4M14 13.5l-4 4"/>',
    link: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    person: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20c.8-3.8 3.7-6 7.5-6s6.7 2.2 7.5 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    compose: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 7.5l3 3"/>',
    chevR: '<path d="M9 5l7 7-7 7"/>',
    chevL: '<path d="M15 5l-7 7 7 7"/>',
    chevD: '<path d="M5 9l7 7 7-7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/>',
    xmark: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    clip: '<path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8l-8.4 8.4a1.8 1.8 0 0 1-2.5-2.5l7.4-7.4"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    trash: '<path d="M4.5 7h15M9 7V4.5h6V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    send: '<path d="M4 12l16-8-6 17-3-7z"/>',
    book: '<path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>'
  };
  L.icons = ICONS;
  L.icon = function (name, cls) {
    return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
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

  /** 画面下に出る選択肢。opts: { title, message, items:[{label, destructive, selected, onTap}], cancel } */
  L.ui.actions = function (opts) {
    var backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    var wrap = document.createElement('div');
    wrap.className = 'actions';
    wrap.setAttribute('role', 'dialog');
    var items = (opts.items || []).map(function (it, i) {
      return '<button class="item' + (it.destructive ? ' destructive' : '') + '" data-i="' + i + '">' +
        (it.selected ? L.icon('check') : '') + '<span>' + L.esc(it.label) + '</span></button>';
    }).join('');
    wrap.innerHTML =
      '<div class="panel">' +
      (opts.title || opts.message ? '<div class="head">' + (opts.title ? '<b>' + L.esc(opts.title) + '</b>' : '') + L.esc(opts.message || '') + '</div>' : '') +
      '<div class="scroll">' + items + '</div></div>' +
      '<div class="panel"><button class="item cancel" data-i="-1">' + L.esc(opts.cancel || 'キャンセル') + '</button></div>';
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
        title: opts.title, message: opts.message, cancel: opts.cancel || 'キャンセル',
        items: [{ label: opts.confirm || 'OK', destructive: !!opts.destructive, onTap: function () { resolve(true); } }],
        onCancel: function () { resolve(false); }
      });
    });
  };

  L.ui.alert = function (message, title) {
    L.ui.actions({ title: title, message: message, cancel: '閉じる', items: [] });
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

  L.debounce = function (fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  };
})();
