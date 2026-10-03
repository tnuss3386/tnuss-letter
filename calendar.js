// 予定（行事カレンダー）: 投稿に付けた行事日と、アンケート・面談の期限を月表示で見られる
(function () {
  'use strict';
  var L = window.L;
  var S = L.S;
  var esc = L.esc;

  var today = L.today();
  var tp = today.split('-');
  S.cal = { y: +tp[0], m: +tp[1], sel: today };

  function posts() { return (S.role === 'teacher' ? S.tposts : S.posts) || []; }

  /** { 'yyyy-MM-dd': [{post, kind}] } */
  function buildEvents() {
    var map = {};
    function add(ymd, post, kind) { (map[ymd] = map[ymd] || []).push({ post: post, kind: kind }); }
    posts().forEach(function (p) {
      if (p.eventDate) {
        var end = p.eventEndDate && p.eventEndDate >= p.eventDate ? p.eventEndDate : p.eventDate;
        var d = p.eventDate, n = 0;
        while (d <= end && n < 62) { add(d, p, 'event'); d = L.jst.addDays(d, 1); n++; }
      }
      if (p.option && p.option.deadline && !p.option.closed) add(L.fmt.ymd(p.option.deadline), p, 'deadline');
    });
    return map;
  }

  function monthGrid(y, m) {
    var first = new Date(Date.UTC(y, m - 1, 1));
    var startDow = first.getUTCDay();
    var days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var cells = [];
    for (var i = 0; i < startDow; i++) cells.push({ ymd: L.jst.addDays(y + '-' + L.fmt.pad(m) + '-01', i - startDow), other: true });
    for (var d = 1; d <= days; d++) cells.push({ ymd: y + '-' + L.fmt.pad(m) + '-' + L.fmt.pad(d), other: false });
    while (cells.length % 7 !== 0) cells.push({ ymd: L.jst.addDays(cells[cells.length - 1].ymd, 1), other: true });
    return cells;
  }

  function gridHtml(events) {
    var c = S.cal;
    var head = '日月火水木金土'.split('').map(function (w, i) {
      return '<div class="cal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + w + '</div>';
    }).join('');
    var cells = monthGrid(c.y, c.m).map(function (cell, i) {
      var evs = events[cell.ymd] || [];
      var colors = [];
      evs.forEach(function (e) {
        var col = e.kind === 'deadline' ? '#ff9500' : L.catColor(e.post.category);
        if (colors.indexOf(col) === -1 && colors.length < 3) colors.push(col);
      });
      var dow = i % 7;
      return '<button class="cal-day' + (cell.other ? ' other' : '') + (cell.ymd === today ? ' today' : '') + (cell.ymd === c.sel ? ' sel' : '') +
        (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '') + '" data-act="calDay" data-ymd="' + cell.ymd + '" aria-label="' + esc(L.fmt.ymdLong(cell.ymd)) + (evs.length ? '、予定' + evs.length + '件' : '') + '">' +
        '<span class="num">' + (+cell.ymd.split('-')[2]) + '</span><span class="cal-dots">' +
        colors.map(function (col) { return '<i style="--c:' + col + '"></i>'; }).join('') + '</span></button>';
    }).join('');
    return '<div class="cal"><div class="cal-grid">' + head + cells + '</div></div>';
  }

  function eventRow(e) {
    var p = e.post;
    var color = e.kind === 'deadline' ? '#ff9500' : L.catColor(p.category);
    var label = e.kind === 'deadline'
      ? (p.option.type === 'survey' ? 'アンケートの回答期限' : '面談の予約期限') + '　' + L.fmt.hm(p.option.deadline)
      : (p.eventEndDate && p.eventEndDate !== p.eventDate ? L.fmt.ymdLabel(p.eventDate) + ' 〜 ' + L.fmt.ymdLabel(p.eventEndDate) : '行事');
    return '<button class="row cal-ev" data-act="open" data-id="' + esc(p.id) + '"><span class="bar" style="--c:' + color + '"></span>' +
      '<span class="row-main"><span class="row-title">' + esc(p.title) + '</span><span class="when">' + esc(label) + '</span></span>' + L.icon('chevR', 'chev') + '</button>';
  }

  function agendaHtml(events) {
    var sel = S.cal.sel;
    var list = events[sel] || [];
    var h = '<div class="group-header">' + esc(L.fmt.ymdLong(sel)) + '</div>';
    h += list.length
      ? '<div class="group">' + list.map(eventRow).join('') + '</div>'
      : '<div class="group"><div class="row-wrap" style="color:var(--label-2)">予定はありません</div></div>';

    // これからの予定（今日以降の直近）
    var upcoming = Object.keys(events).filter(function (d) { return d >= today && d !== sel; }).sort().slice(0, 8);
    if (upcoming.length) {
      h += '<div class="group-header" style="margin-top:22px">これからの予定</div><div class="group">';
      upcoming.forEach(function (d) {
        events[d].forEach(function (e) {
          h += '<div class="row-wrap" style="padding-bottom:0;padding-top:8px;color:var(--label-2);font-size:.78rem">' + esc(L.fmt.ymdLabel(d)) + '</div>' + eventRow(e);
        });
      });
      h += '</div>';
    }
    return h;
  }

  function draw() {
    var host = document.getElementById('calHost');
    if (!host) return;
    today = L.today();
    var events = buildEvents();
    document.getElementById('calMonth').textContent = S.cal.y + '年' + S.cal.m + '月';
    host.innerHTML = gridHtml(events) + '<div class="section">' + agendaHtml(events) + '</div>';
  }

  L.views.cal = function () {
    if (S.role === 'teacher' && S.tposts === null) {
      return { nav: { title: '予定' }, html: '<div class="skeleton"></div><div class="skeleton"></div>' };
    }
    return {
      nav: { title: '予定' },
      html: '<div class="cal-head"><span class="month" id="calMonth"></span><span class="ctrl">' +
        '<button data-act="calPrev" aria-label="前の月">' + L.icon('chevL') + '</button>' +
        '<button data-act="calToday">今日</button>' +
        '<button data-act="calNext" aria-label="次の月">' + L.icon('chevR') + '</button></span></div>' +
        '<div id="calHost"></div>',
      bind: draw
    };
  };

  function shift(delta) {
    var m = S.cal.m + delta, y = S.cal.y;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    S.cal.y = y; S.cal.m = m;
    var first = y + '-' + L.fmt.pad(m) + '-01';
    S.cal.sel = (today.slice(0, 7) === first.slice(0, 7)) ? today : first;
    draw();
  }
  L.acts.calPrev = function () { shift(-1); };
  L.acts.calNext = function () { shift(1); };
  L.acts.calToday = function () {
    var t = L.today().split('-');
    S.cal = { y: +t[0], m: +t[1], sel: L.today() };
    draw();
  };
  L.acts.calDay = function (el) {
    var ymd = el.getAttribute('data-ymd');
    var p = ymd.split('-');
    S.cal.sel = ymd;
    S.cal.y = +p[0]; S.cal.m = +p[1];
    draw();
  };
})();
