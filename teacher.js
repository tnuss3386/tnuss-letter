// 先生向け: 既読・回答・予約の集計と催促、編集・削除、投稿画面
(function () {
  'use strict';
  var L = window.L;
  var S = L.S;
  var esc = L.esc;
  var T = L.teacher = {};

  function who(c) { return '<span>' + esc(c.name) + ' <small>' + esc(c.grade + ' ' + c.klass) + '</small></span>'; }

  // ---------- 詳細の下に出す管理パネル ----------
  T.panelHtml = function (p) {
    var h = '<div class="section"><div class="group-header">配信</div><div class="group">' +
      '<div class="row"><span class="row-label">配信対象</span><span class="row-value">' + esc(p.targetLabel || '') + '</span></div>' +
      (p.scheduled ? '<div class="row"><span class="row-label">公開予定</span><span class="row-value">' + esc(L.fmt.mdhm(p.date)) + '</span></div>' : '') +
      (p.lastRemind ? '<div class="row"><span class="row-label">前回の催促</span><span class="row-value">' + esc(L.fmt.mdhm(p.lastRemind)) + '</span></div>' : '') +
      '</div></div>';
    if (!p.scheduled) h += '<div id="statsBox" class="section"><div class="skeleton" style="margin:0"></div></div>';
    h += '<div class="section"><div class="group">' +
      '<button class="row tint" data-act="editPost" data-id="' + esc(p.id) + '">' + L.icon('compose') + '<span class="row-label">この投稿を編集</span></button>' +
      '<button class="row destructive" data-act="deletePost" data-id="' + esc(p.id) + '">' + L.icon('trash') + '<span class="row-label">この投稿を削除</span></button></div>' +
      '<div class="group-footer">削除すると、保護者の画面から見えなくなります（データは記録として残ります）。</div></div>';
    return h;
  };

  T.bindPanel = function (root, p) {
    if (p.scheduled) return;
    L.api('getPostStats', { token: L.token(), postId: p.id }).then(function (st) {
      var box = document.getElementById('statsBox');
      if (!box) return;
      box.innerHTML = st.ok ? statsHtml(p, st) : '<div class="banner warn">' + L.icon('info') + '<div>' + esc(st.error) + '</div></div>';
    }).catch(function () {
      var box = document.getElementById('statsBox');
      if (box) box.innerHTML = '<div class="banner warn">' + L.icon('info') + '<div>集計を読み込めませんでした。</div></div>';
    });
  };

  function progress(done, total) {
    var pct = total ? Math.round(done / total * 100) : 0;
    return '<div class="stat-card"><div class="stat-line"><b>' + done + ' / ' + total + '</b><span>' + pct + '%</span></div><div class="progress"><i style="width:' + pct + '%"></i></div></div>';
  }

  function nameList(list, title) {
    if (!list.length) return '';
    return '<details class="disclosure"><summary class="row"><span class="row-label">' + esc(title) + '（' + list.length + '）</span>' + L.icon('chevR', 'chev') + '</summary>' +
      '<div class="name-list">' + list.map(who).join('') + '</div></details>';
  }

  function statsHtml(p, st) {
    var o = p.option;
    var h = '<div class="group-header">既読</div><div class="group">' + progress(st.read, st.target) + nameList(st.unread, '未読の家庭') + '</div>';
    var pending = st.unread.length, pendingLabel = '未読';

    if (st.survey) {
      var sv = st.survey;
      h += '<div class="group-header" style="margin-top:20px">アンケートの回答</div><div class="group">' + progress(sv.answered, st.target) + nameList(sv.unanswered, '未回答の家庭') + '</div>';
      sv.questions.forEach(function (q) {
        h += '<div class="group-header" style="margin-top:20px">' + esc(q.text) + '</div><div class="group">';
        if (q.type === 'text') {
          h += q.texts.length ? q.texts.map(function (t) {
            return '<div class="text-answer">' + esc(t.text) + '<small>' + esc(t.student.name + '（' + t.student.grade + ' ' + t.student.klass + '）') + '</small></div>';
          }).join('') : '<div class="row-wrap" style="color:var(--label-2)">まだ回答がありません</div>';
        } else {
          var total = 0;
          q.options.forEach(function (op) { total += q.counts[op]; });
          q.options.forEach(function (op) {
            var n = q.counts[op], pct = sv.answered ? Math.round(n / sv.answered * 100) : 0;
            h += '<div class="bar-row"><div class="top"><span>' + esc(op) + '</span><span class="n">' + n + '件（' + pct + '%）</span></div><div class="progress"><i style="width:' + pct + '%"></i></div></div>';
          });
        }
        h += '</div>';
      });
      pending = sv.unanswered.length; pendingLabel = '未回答';
    }

    if (st.interview) {
      var iv = st.interview;
      h += '<div class="group-header" style="margin-top:20px">面談の予約</div><div class="group">' + progress(iv.booked, st.target) + nameList(iv.unbooked, '未予約の家庭') + '</div>';
      h += '<div class="group-header" style="margin-top:20px">日程表</div><div class="group slot-table">' + (iv.slots.length ? iv.slots.map(function (s) {
        return '<div class="row"><span class="time">' + esc(L.fmt.md(s.start).replace(/（.）/, '') + ' ' + L.fmt.hm(s.start)) + '</span><span class="who' + (s.student ? '' : ' empty') + '">' +
          (s.student ? esc(s.student.name) + ' <small style="color:var(--label-2)">' + esc(s.student.grade + ' ' + s.student.klass) + '</small>' : '空き') + '</span></div>';
      }).join('') : '<div class="row-wrap">枠がありません</div>') + '</div>';
      pending = iv.unbooked.length; pendingLabel = '未予約';
    }

    if (pending > 0) {
      h += '<div class="btn-wrap" style="margin-top:20px"><button class="btn tinted" data-act="remind" data-id="' + esc(p.id) + '" data-n="' + pending + '" data-label="' + pendingLabel + '">' +
        L.icon('bell') + pendingLabel + 'の' + pending + '件に通知する</button></div>' +
        '<div class="group-footer" style="margin:-14px 20px 24px">メールと、プッシュ通知（オンにしている方）でお知らせします。続けて送れるのは6時間おきです。</div>';
    }
    return h;
  }

  L.acts.remind = function (el) {
    var id = el.getAttribute('data-id'), n = el.getAttribute('data-n'), label = el.getAttribute('data-label');
    L.ui.confirm({ title: label + 'の' + n + '件に通知しますか？', message: 'メールとプッシュ通知で、確認のお願いを送ります。', confirm: '通知する' }).then(function (ok) {
      if (!ok) return;
      el.disabled = true;
      L.api('remindPost', { token: L.token(), postId: id }).then(function (res) {
        el.disabled = false;
        if (!res.ok) { L.ui.toast(res.error, true); return; }
        L.ui.toast('通知しました（メール ' + res.mailed + '件・プッシュ ' + res.pushed + '台）');
        L.refresh();
      }).catch(function () { el.disabled = false; L.ui.toast('通信できませんでした', true); });
    });
  };

  L.acts.deletePost = function (el) {
    var id = el.getAttribute('data-id');
    var p = L.findPost(id);
    L.ui.confirm({ title: 'この投稿を削除しますか？', message: p ? '「' + p.title + '」' : '', confirm: '削除', destructive: true }).then(function (ok) {
      if (!ok) return;
      L.api('deletePost', { token: L.token(), postId: id }).then(function (res) {
        if (!res.ok) { L.ui.toast(res.error, true); return; }
        S.tposts = (S.tposts || []).filter(function (x) { return x.id !== id; });
        L.store.cacheSet('tposts', S.tposts);
        L.ui.toast('削除しました');
        L.back();
        if (!(history.state && history.state.d)) L.refresh();
      }).catch(function () { L.ui.toast('通信できませんでした', true); });
    });
  };

  L.acts.editPost = function (el) { T.compose(L.findPost(el.getAttribute('data-id'))); };
  L.acts.compose = function () { T.compose(null); };

  // ---------- 投稿画面 ----------
  var TEXT_COLORS = ['#222222', '#c0392b', '#1c5fbf', '#1e7a34', '#d9730d'];
  var MINUTES = [10, 15, 20, 25, 30, 40, 45, 60];
  var MAX_FILE = 10 * 1024 * 1024;

  function initState(p) {
    var C = {
      editing: p || null,
      category: p ? p.category : (S.categories[0] ? S.categories[0].name : 'お知らせ'),
      title: p ? p.title : '',
      body: p ? p.body : '',
      att: p ? p.attachments.slice() : [],
      files: [],
      tmode: 'ALL', grades: {}, classes: {}, students: {}, pick: '',
      eventOn: !!(p && p.eventDate), eventDate: p ? p.eventDate : '', eventEnd: p ? p.eventEndDate : '',
      pubMode: p && p.scheduled ? 'later' : 'now', pubAt: p && p.scheduled ? L.jst.toLocalInput(p.date) : '',
      option: 'none',
      questions: [{ text: '', type: 'single', opts: '', required: true }],
      deadline: '', ivNote: '',
      blocks: [{ date: L.today(), start: '15:00', end: '18:00', min: 20 }],
      notifyNow: true, dirty: false
    };
    if (p) {
      var tokens = String(p.targetValue || '').split(',').map(function (s) { return s.trim(); }).filter(String);
      if (p.targetType === 'GRADE') { C.tmode = 'SELECT'; tokens.forEach(function (t) { C.grades[t] = true; }); }
      else if (p.targetType === 'CLASS') { C.tmode = 'SELECT'; tokens.forEach(function (t) { C.classes[t] = true; }); }
      else if (p.targetType === 'STUDENT') { C.tmode = 'STUDENT'; tokens.forEach(function (t) { C.students[t] = true; }); }
      else if (p.targetType === 'SELECT') {
        C.tmode = 'SELECT';
        tokens.forEach(function (t) {
          if (t.indexOf('G:') === 0) C.grades[t.slice(2)] = true;
          else if (t.indexOf('C:') === 0) C.classes[t.slice(2)] = true;
          else if (t.indexOf('S:') === 0) { C.tmode = 'STUDENT'; C.students[t.slice(2)] = true; }
        });
      }
      if (p.option) {
        C.option = p.option.type;
        C.deadline = L.jst.toLocalInput(p.option.deadline);
        if (p.option.type === 'survey') {
          C.questions = p.option.questions.map(function (q) {
            return { text: q.text, type: q.type, opts: (q.options || []).join('\n'), required: !!q.required };
          });
        } else {
          C.ivNote = p.option.note || '';
          C.blocks = [];
        }
      }
    }
    return C;
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve({ fileName: file.name, mimeType: file.type, base64Data: String(r.result).substring(String(r.result).indexOf(',') + 1) }); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function genSlots(C) {
    var out = [], err = '';
    C.blocks.forEach(function (b, i) {
      if (!b.date || !b.start || !b.end || !b.min) { err = '日程' + (i + 1) + 'の日にち・時間を入力してください。'; return; }
      var s = new Date(b.date + 'T' + b.start + ':00+09:00').getTime();
      var e = new Date(b.date + 'T' + b.end + ':00+09:00').getTime();
      if (!(e > s)) { err = '日程' + (i + 1) + 'の終了時刻は、開始より後にしてください。'; return; }
      for (var t = s; t + b.min * 60000 <= e; t += b.min * 60000) {
        out.push({ start: new Date(t).toISOString(), end: new Date(t + b.min * 60000).toISOString() });
      }
    });
    return { slots: out, error: err };
  }

  T.compose = function (post) {
    var C = initState(post);
    var sheet;
    var onSelect = null;

    function field(label, inner) { return '<div class="field-row"><label>' + label + '</label>' + inner + '</div>'; }
    function seg(name, items, cur, disabled) {
      return '<div class="seg" data-seg="' + name + '">' + items.map(function (it) {
        return '<button type="button" class="' + (cur === it[0] ? 'on' : '') + '" data-v="' + it[0] + '"' + (disabled ? ' disabled' : '') + '>' + it[1] + '</button>';
      }).join('') + '</div>';
    }
    function sw(name, on) { return '<span class="switch"><input type="checkbox" data-f="' + name + '"' + (on ? ' checked' : '') + '><i></i></span>'; }
    function opt(label, selected, attrs, extra) {
      return '<button type="button" class="row opt-row square' + (selected ? ' selected' : '') + '" ' + attrs + ' style="' + (extra || '') + '"><span class="radio">' + L.icon('check') + '</span><span class="row-label">' + label + '</span></button>';
    }

    // ----- 各セクション -----
    function secBasics() {
      var cats = S.categories.map(function (c) { return '<option value="' + esc(c.name) + '"' + (c.name === C.category ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
      return '<div class="section"><div class="group">' + field('カテゴリ', '<select data-f="category">' + cats + '</select>') +
        '<div class="field-row"><input class="left" type="text" data-f="title" maxlength="120" placeholder="タイトル" value="' + esc(C.title) + '"></div></div></div>' +
        '<div id="s-urgent"></div>';
    }
    function secUrgent() {
      if (C.category !== '緊急' || C.editing) return '';
      return '<div class="section"><div class="banner warn">' + L.icon('bolt') + '<div><b>「緊急」は、すぐにお知らせします。</b><br>公開と同時に、対象の家庭へメールとプッシュ通知を送ります。予約投稿の場合は、公開後の数分以内に送ります。</div></div>' +
        '<div class="group"><label class="row"><span class="row-label">すぐに通知する</span>' + sw('notifyNow', C.notifyNow) + '</label></div></div>';
    }
    function secBody() {
      var colors = TEXT_COLORS.map(function (c) { return '<button type="button" class="swatch" data-color="' + c + '" style="background:' + c + '" aria-label="文字色"></button>'; }).join('');
      return '<div class="section"><div class="group-header">本文</div><div class="group">' +
        '<div class="toolbar" id="tb">' +
        '<button type="button" data-cmd="bold" aria-label="太字"><b>B</b></button><button type="button" data-cmd="underline" aria-label="下線"><u>U</u></button>' +
        '<span class="sep"></span>' + colors + '<span class="sep"></span>' +
        '<button type="button" data-cmd="h3">見出し</button><button type="button" data-cmd="insertUnorderedList">リスト</button>' +
        '<button type="button" data-cmd="link">リンク</button><button type="button" data-cmd="clear">解除</button></div>' +
        '<div class="link-bar hidden" id="linkBar"><input type="text" id="linkUrl" placeholder="https://" autocapitalize="off"><button type="button" class="btn small" data-cmd="linkApply">追加</button></div>' +
        '<div class="editor" id="editor" contenteditable="true" data-placeholder="本文を入力（文字を選んでから、太字・色・リンクなどを設定できます）"></div></div></div>';
    }
    function secAttach() {
      var rows = C.att.map(function (u, i) {
        return '<div class="file-chip">' + L.icon('clip') + '<span class="name">添付ファイル ' + (i + 1) + '</span><button type="button" class="rm" data-rm-att="' + i + '" aria-label="外す">' + L.icon('xmark') + '</button></div>';
      }).join('') + C.files.map(function (f, i) {
        return '<div class="file-chip">' + L.icon('clip') + '<span class="name">' + esc(f.name) + '</span><button type="button" class="rm" data-rm-file="' + i + '" aria-label="外す">' + L.icon('xmark') + '</button></div>';
      }).join('');
      return '<div class="section"><div class="group-header">添付ファイル</div><div class="group">' + rows +
        '<label class="row tint">' + L.icon('plus') + '<span class="row-label">ファイルを追加</span><input type="file" id="fileInput" multiple hidden></label></div>' +
        '<div class="group-footer">1ファイル10MBまで。保護者はアプリの中で開けます。</div></div>';
    }
    function secTarget() {
      var h = '<div class="section"><div class="group-header">配信対象</div>' +
        seg('tmode', [['ALL', '全体'], ['SELECT', '学年・クラス'], ['STUDENT', '個人']], C.tmode) + '<div style="height:10px"></div>';
      if (C.tmode === 'ALL') {
        h += '<div class="group-footer" style="margin-top:0">すべての家庭に配信します。</div>';
      } else if (C.tmode === 'SELECT') {
        h += '<div class="group">';
        var natural = function (a, b) { return String(a).localeCompare(String(b), 'ja', { numeric: true }); };
        S.grades.slice().sort(natural).forEach(function (g) {
          var gOn = !!C.grades[g];
          h += opt('<b>' + esc(g) + '</b>　<small style="color:var(--label-2)">学年全体</small>', gOn, 'data-grade="' + esc(g) + '"');
          S.classes.filter(function (c) { return c.grade === g; }).sort(function (a, b) { return natural(a.klass, b.klass); }).forEach(function (c) {
            var key = c.grade + '|' + c.klass;
            h += opt(esc(c.klass), gOn || !!C.classes[key], 'data-class="' + esc(key) + '"' + (gOn ? ' disabled' : ''), 'padding-left:44px;' + (gOn ? 'opacity:.55' : ''));
          });
        });
        h += '</div><div class="group-footer">' + targetSummary() + '　<button type="button" class="link-btn" data-clear="select">すべて解除</button></div>';
      } else {
        var q = C.pick.trim().toLowerCase();
        var list = S.students.filter(function (s) { return !q || (s.name + s.grade + s.klass).toLowerCase().indexOf(q) !== -1; });
        h += '<div class="group"><div class="pick-search"><input type="search" id="pickQ" placeholder="名前で検索" value="' + esc(C.pick) + '"></div><div class="pick-list">' +
          list.slice(0, 120).map(function (s) {
            return opt(esc(s.name) + '　<small style="color:var(--label-2)">' + esc(s.grade + ' ' + s.klass) + '</small>', !!C.students[s.id], 'data-stu="' + esc(s.id) + '"');
          }).join('') + (list.length > 120 ? '<div class="row-wrap" style="color:var(--label-2)">ほか' + (list.length - 120) + '名（検索で絞り込めます）</div>' : '') + '</div></div>' +
          '<div class="group-footer">' + Object.keys(C.students).length + '名を選択中　<button type="button" class="link-btn" data-clear="students">すべて解除</button></div>';
      }
      return h + '</div>';
    }
    function targetSummary() {
      var gs = Object.keys(C.grades);
      var cs = Object.keys(C.classes).filter(function (k) { return !C.grades[k.split('|')[0]]; });
      var parts = gs.concat(cs.map(function (k) { return k.split('|').join(' '); }));
      return parts.length ? '選択中：' + esc(parts.join('、')) : '学年やクラスを選んでください';
    }
    function secWhen() {
      var h = '<div class="section"><div class="group-header">日付・公開</div><div class="group">' +
        '<label class="row"><span class="row-label">行事の日付を付ける</span>' + sw('eventOn', C.eventOn) + '</label>';
      if (C.eventOn) {
        h += field('開始日', '<input type="date" data-f="eventDate" value="' + esc(C.eventDate) + '">') +
          field('終了日（任意）', '<input type="date" data-f="eventEnd" value="' + esc(C.eventEnd) + '">');
      }
      if (C.editing && !C.editing.scheduled) {
        h += '<div class="row"><span class="row-label">公開</span><span class="row-value">公開済み（' + esc(L.fmt.mdhm(C.editing.date)) + '）</span></div>';
      } else {
        h += '<div class="row-wrap">' + seg('pubMode', [['now', '今すぐ公開'], ['later', '日時を指定']], C.pubMode) + '</div>';
        if (C.pubMode === 'later') h += field('公開日時', '<input type="datetime-local" data-f="pubAt" value="' + esc(C.pubAt) + '">');
      }
      h += '</div><div class="group-footer">行事の日付を付けると、保護者の「予定」に表示されます。</div></div>';
      return h;
    }
    function secOption() {
      var locked = !!(C.editing && C.editing.option);
      var h = '<div class="section"><div class="group-header">回答・予約を集める</div>' +
        seg('option', [['none', 'なし'], ['survey', 'アンケート'], ['interview', '面談日程']], C.option, locked) + '<div style="height:12px"></div></div>';
      if (C.option === 'survey') {
        h += '<div class="banner">' + L.icon('info') + '<div>回答は、スプレッドシートの「アンケート回答」と、この画面の集計で確認できます。' + (locked ? '回答が始まったあとは、質問の変更は反映されず、期限のみ変更できます。' : '') + '</div></div>';
        C.questions.forEach(function (q, i) {
          h += '<div class="q-card"><div class="q-head"><span>質問 ' + (i + 1) + '</span>' + (C.questions.length > 1 ? '<button type="button" data-rm-q="' + i + '">削除</button>' : '') + '</div><div class="group">' +
            '<input class="plain-input" type="text" data-q="' + i + '" data-f="text" maxlength="200" placeholder="質問文" value="' + esc(q.text) + '">' +
            '<div class="row-wrap">' + seg('qtype-' + i, [['single', '1つ選ぶ'], ['multi', '複数選ぶ'], ['text', '自由記述']], q.type) + '</div>' +
            (q.type !== 'text' ? '<textarea class="text-area" data-q="' + i + '" data-f="opts" placeholder="選択肢（1行に1つ）">' + esc(q.opts) + '</textarea>' : '') +
            '<label class="row"><span class="row-label">必須</span>' + sw('req-' + i, q.required) + '</label></div></div>';
        });
        h += '<div class="btn-wrap"><button type="button" class="btn gray" data-add="question">' + L.icon('plus') + '質問を追加</button></div>' +
          '<div class="section"><div class="group">' + field('回答期限（任意）', '<input type="datetime-local" data-f="deadline" value="' + esc(C.deadline) + '">') + '</div></div>';
      } else if (C.option === 'interview') {
        var gen = genSlots(C);
        h += '<div class="section"><div class="group"><textarea class="text-area" data-f="ivNote" placeholder="面談の案内（場所・所要時間・持ち物など）">' + esc(C.ivNote) + '</textarea></div></div>' +
          '<div class="section"><div class="group">' + field('予約期限（任意）', '<input type="datetime-local" data-f="deadline" value="' + esc(C.deadline) + '">') + '</div></div>';
        if (locked) h += '<div class="banner">' + L.icon('info') + '<div>現在の枠は ' + (C.editing.option.slotCount || 0) + ' 個です。ここで日程を追加すると、枠が増えます（既存の枠は変わりません）。</div></div>';
        C.blocks.forEach(function (b, i) {
          h += '<div class="q-card"><div class="q-head"><span>日程 ' + (i + 1) + '</span><button type="button" data-rm-b="' + i + '">削除</button></div><div class="group">' +
            field('日にち', '<input type="date" data-b="' + i + '" data-f="date" value="' + esc(b.date) + '">') +
            field('開始', '<input type="time" data-b="' + i + '" data-f="start" value="' + esc(b.start) + '">') +
            field('終了', '<input type="time" data-b="' + i + '" data-f="end" value="' + esc(b.end) + '">') +
            field('1家庭あたり', '<select data-b="' + i + '" data-f="min">' + MINUTES.map(function (m) { return '<option value="' + m + '"' + (m === b.min ? ' selected' : '') + '>' + m + '分</option>'; }).join('') + '</select>') +
            '</div></div>';
        });
        h += '<div class="btn-wrap"><button type="button" class="btn gray" data-add="block">' + L.icon('plus') + '日程を追加</button></div>' +
          '<div class="group-footer" style="margin:-14px 20px 20px" id="slotSummary">' + (gen.error ? esc(gen.error) : '合計 ' + gen.slots.length + ' 枠') + '</div>';
      }
      return h;
    }

    var secs = { basics: secBasics, body: secBody, attach: secAttach, target: secTarget, when: secWhen, option: secOption, urgent: secUrgent };
    var order = ['basics', 'body', 'attach', 'target', 'when', 'option'];
    sheet = L.ui.sheet({
      full: true, modal: true,
      onClose: function () { if (onSelect) document.removeEventListener('selectionchange', onSelect); },
      title: post ? '投稿を編集' : '新規投稿',
      left: { label: 'キャンセル', onTap: function () { tryClose(); } },
      right: { label: post ? '保存' : '投稿', onTap: function () { submit(); } },
      body: '<div style="height:4px"></div>' + order.map(function (k) { return '<div id="s-' + k + '"></div>'; }).join('') + '<div style="height:40px"></div>'
    });
    var root = sheet.body;
    function drawSec(k) {
      var el = root.querySelector('#s-' + k);
      if (el) el.innerHTML = secs[k]();
      if (k === 'basics') drawSec('urgent');
    }
    order.forEach(drawSec);
    var editor = root.querySelector('#editor');
    editor.innerHTML = C.body;

    function tryClose() {
      if (!C.dirty) { sheet.close(); return; }
      L.ui.confirm({ title: '入力した内容を破棄しますか？', confirm: '破棄する', destructive: true, cancel: '編集を続ける' }).then(function (ok) { if (ok) sheet.close(); });
    }

    // ----- エディタ -----
    var saved = null;
    onSelect = function () {
      var sel = window.getSelection();
      if (sel.rangeCount && editor.contains(sel.anchorNode)) saved = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', onSelect);
    function restore() {
      editor.focus();
      if (saved) { var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(saved); }
    }
    function exec(cmd, val) { document.execCommand('styleWithCSS', false, false); document.execCommand(cmd, false, val || null); C.dirty = true; }
    root.addEventListener('pointerdown', function (e) {
      if (e.target.closest('#tb button')) e.preventDefault();
    });
    root.addEventListener('click', function (e) {
      var tb = e.target.closest('#tb button, #linkBar button');
      if (tb) {
        var cmd = tb.getAttribute('data-cmd'), color = tb.getAttribute('data-color');
        var bar = root.querySelector('#linkBar'), url = root.querySelector('#linkUrl');
        if (cmd === 'link') { bar.classList.toggle('hidden'); if (!bar.classList.contains('hidden')) url.focus(); return; }
        if (cmd === 'linkApply') {
          var u = url.value.trim();
          if (!u) return;
          if (!/^(https?:\/\/|mailto:)/i.test(u)) u = 'https://' + u;
          restore();
          if (window.getSelection().isCollapsed) exec('insertHTML', '<a href="' + esc(u) + '">' + esc(u) + '</a>'); else exec('createLink', u);
          url.value = ''; bar.classList.add('hidden');
          return;
        }
        restore();
        if (color) exec('foreColor', color);
        else if (cmd === 'h3') exec('formatBlock', 'h3');
        else if (cmd === 'clear') { exec('removeFormat'); exec('formatBlock', 'div'); }
        else if (cmd) exec(cmd);
        return;
      }
      handleClick(e);
    });
    editor.addEventListener('paste', function (e) {
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
    });
    editor.addEventListener('input', function () { C.dirty = true; });

    // ----- 入力・選択の反映 -----
    function handleClick(e) {
      var el;
      if ((el = e.target.closest('[data-seg]'))) {
        var b = e.target.closest('button');
        if (!b || b.disabled) return;
        var name = el.getAttribute('data-seg'), v = b.getAttribute('data-v');
        C.dirty = true;
        if (name === 'tmode') { C.tmode = v; drawSec('target'); }
        else if (name === 'pubMode') { C.pubMode = v; drawSec('when'); }
        else if (name === 'option') { C.option = v; drawSec('option'); }
        else if (name.indexOf('qtype-') === 0) { C.questions[+name.slice(6)].type = v; drawSec('option'); }
        return;
      }
      if ((el = e.target.closest('[data-grade]'))) {
        var g = el.getAttribute('data-grade');
        if (C.grades[g]) delete C.grades[g]; else { C.grades[g] = true; Object.keys(C.classes).forEach(function (k) { if (k.split('|')[0] === g) delete C.classes[k]; }); }
        C.dirty = true; drawSec('target'); return;
      }
      if ((el = e.target.closest('[data-class]'))) {
        if (el.disabled) return;
        var k = el.getAttribute('data-class');
        if (C.classes[k]) delete C.classes[k]; else C.classes[k] = true;
        C.dirty = true; drawSec('target'); return;
      }
      if ((el = e.target.closest('[data-stu]'))) {
        var id = el.getAttribute('data-stu');
        if (C.students[id]) delete C.students[id]; else C.students[id] = true;
        C.dirty = true;
        el.classList.toggle('selected');
        var foot = root.querySelector('#s-target .group-footer');
        if (foot) foot.firstChild.textContent = Object.keys(C.students).length + '名を選択中　';
        return;
      }
      if ((el = e.target.closest('[data-clear]'))) {
        if (el.getAttribute('data-clear') === 'select') { C.grades = {}; C.classes = {}; } else C.students = {};
        drawSec('target'); return;
      }
      if ((el = e.target.closest('[data-rm-att]'))) { C.att.splice(+el.getAttribute('data-rm-att'), 1); C.dirty = true; drawSec('attach'); return; }
      if ((el = e.target.closest('[data-rm-file]'))) { C.files.splice(+el.getAttribute('data-rm-file'), 1); C.dirty = true; drawSec('attach'); return; }
      if ((el = e.target.closest('[data-rm-q]'))) { C.questions.splice(+el.getAttribute('data-rm-q'), 1); C.dirty = true; drawSec('option'); return; }
      if ((el = e.target.closest('[data-rm-b]'))) { C.blocks.splice(+el.getAttribute('data-rm-b'), 1); C.dirty = true; drawSec('option'); return; }
      if ((el = e.target.closest('[data-add]'))) {
        if (el.getAttribute('data-add') === 'question') {
          if (C.questions.length >= 20) { L.ui.toast('質問は20個までです', true); return; }
          C.questions.push({ text: '', type: 'single', opts: '', required: false });
        } else {
          var last = C.blocks[C.blocks.length - 1];
          C.blocks.push({ date: last ? L.jst.addDays(last.date, 1) : L.today(), start: last ? last.start : '15:00', end: last ? last.end : '18:00', min: last ? last.min : 20 });
        }
        C.dirty = true; drawSec('option'); return;
      }
    }

    root.addEventListener('input', function (e) {
      var t = e.target, f = t.getAttribute && t.getAttribute('data-f');
      if (t.id === 'pickQ') { C.pick = t.value; drawSec('target'); var n = root.querySelector('#pickQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); return; }
      if (!f) return;
      C.dirty = true;
      var qi = t.getAttribute('data-q'), bi = t.getAttribute('data-b');
      if (qi !== null) { C.questions[+qi][f] = t.value; return; }
      if (bi !== null) {
        C.blocks[+bi][f] = f === 'min' ? +t.value : t.value;
        var gen = genSlots(C);
        var sum = root.querySelector('#slotSummary');
        if (sum) sum.textContent = gen.error ? gen.error : '合計 ' + gen.slots.length + ' 枠';
        return;
      }
      if (t.type === 'checkbox') return;
      C[f] = t.value;
    });
    root.addEventListener('change', function (e) {
      var t = e.target, f = t.getAttribute && t.getAttribute('data-f');
      if (t.id === 'fileInput') {
        Array.prototype.forEach.call(t.files, function (file) {
          if (file.size > MAX_FILE) { L.ui.toast(file.name + ' は10MBを超えています', true); return; }
          if (C.att.length + C.files.length >= 10) { L.ui.toast('添付は10ファイルまでです', true); return; }
          C.files.push(file);
        });
        C.dirty = true; drawSec('attach'); return;
      }
      if (!f) return;
      C.dirty = true;
      if (t.type === 'checkbox') {
        if (f === 'eventOn') { C.eventOn = t.checked; drawSec('when'); }
        else if (f === 'notifyNow') C.notifyNow = t.checked;
        else if (f.indexOf('req-') === 0) C.questions[+f.slice(4)].required = t.checked;
        return;
      }
      if (f === 'category') { C.category = t.value; drawSec('urgent'); }
    });
    // ----- 送信 -----
    function fail(msg) { L.ui.toast(msg, true); return false; }

    function submit() {
      var title = C.title.trim();
      if (!title) return fail('タイトルを入力してください');
      var bodyHtml = L.htmlToText(editor.innerHTML).trim() ? editor.innerHTML : '';

      var payload = { token: L.token(), title: title, body: bodyHtml, category: C.category };
      if (C.tmode === 'ALL') { payload.targetType = 'ALL'; payload.targetValue = ''; }
      else if (C.tmode === 'STUDENT') {
        var ids = Object.keys(C.students);
        if (!ids.length) return fail('配信する生徒を選んでください');
        payload.targetType = 'STUDENT'; payload.targetValue = ids.join(',');
      } else {
        var tokens = Object.keys(C.grades).map(function (g) { return 'G:' + g; })
          .concat(Object.keys(C.classes).filter(function (k) { return !C.grades[k.split('|')[0]]; }).map(function (k) { return 'C:' + k; }));
        if (!tokens.length) return fail('配信する学年・クラスを選んでください');
        payload.targetType = 'SELECT'; payload.targetValue = tokens.join(',');
      }
      if (C.eventOn) {
        if (!C.eventDate) return fail('行事の開始日を入力してください');
        if (C.eventEnd && C.eventEnd < C.eventDate) return fail('終了日は開始日より後にしてください');
        payload.eventDate = C.eventDate; payload.eventEndDate = C.eventEnd || '';
      } else { payload.eventDate = ''; payload.eventEndDate = ''; }
      if (!(C.editing && !C.editing.scheduled) && C.pubMode === 'later') {
        var iso = L.jst.fromLocalInput(C.pubAt);
        if (!iso) return fail('公開日時を入力してください');
        payload.publishAt = iso;
      }
      if (!C.editing) payload.notifyNow = C.notifyNow;

      if (C.option === 'survey') {
        var qs = [];
        for (var i = 0; i < C.questions.length; i++) {
          var q = C.questions[i];
          if (!q.text.trim()) return fail('質問' + (i + 1) + 'の文章を入力してください');
          var item = { text: q.text.trim(), type: q.type, required: !!q.required };
          if (q.type !== 'text') {
            item.options = q.opts.split('\n').map(function (s) { return s.trim(); }).filter(String);
            if (item.options.length < 2) return fail('質問' + (i + 1) + 'の選択肢を2つ以上入力してください');
          }
          qs.push(item);
        }
        payload.option = { type: 'survey', questions: qs, deadline: L.jst.fromLocalInput(C.deadline) };
      } else if (C.option === 'interview') {
        var gen = genSlots(C);
        if (gen.error) return fail(gen.error);
        if (!gen.slots.length && !C.editing) return fail('面談の枠を1つ以上作ってください');
        payload.option = { type: 'interview', note: C.ivNote.trim(), deadline: L.jst.fromLocalInput(C.deadline) };
        payload.slots = gen.slots;
      }
      if (C.editing) { payload.postId = C.editing.id; payload.keepAttachments = C.att; }

      sheet.setRight(null, true);
      Promise.all(C.files.map(fileToBase64)).then(function (files) {
        payload.attachments = files;
        return L.api(C.editing ? 'updatePost' : 'createPost', payload);
      }).then(function (res) {
        if (!res.ok) { sheet.setRight(null, false); L.ui.toast(res.error, true); return; }
        sheet.close();
        L.ui.toast(C.editing ? '保存しました' : res.scheduled ? '予約投稿しました' : '投稿しました');
        L.refresh();
      }).catch(function () {
        sheet.setRight(null, false);
        L.ui.toast('通信できませんでした。投稿されていない可能性があります。履歴を確認してからお試しください', true);
      });
      return true;
    }
  };
})();
