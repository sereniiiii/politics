/* ============================================================
   render.js —— 卡片 / 详情 / 徽标的唯一渲染源
   主站 app.js 与独立页 detail.js 共用，保证两处结构一致。
   ============================================================ */
(function (global) {
  var DIFF_LABEL = { 1: 'Ⅰ 基础', 2: 'Ⅱ 常考', 3: 'Ⅲ 难点' };
  var STATE_LABEL = { mastered: '已掌握', review: '待复盘', today: '今日已复盘', none: '未标记' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function hl(text, q) {
    text = String(text == null ? '' : text);
    if (!q || !q.trim()) return esc(text);
    var toks = q.trim().split(/\s+/).filter(Boolean).slice(0, 4).map(reEsc);
    if (!toks.length) return esc(text);
    var parts = text.split(new RegExp('(' + toks.join('|') + ')', 'gi'));
    return parts.map(function (p, i) {
      return i % 2 ? '<mark>' + esc(p) + '</mark>' : esc(p);
    }).join('');
  }

  function statusOf(item, user, today) {
    var rev = (user.reviews && user.reviews[item.id]) || [];
    if (rev.indexOf(today) >= 0) return 'today';
    var st = (user.status && user.status[item.id] && user.status[item.id].state) || '';
    if (st === 'mastered') return 'mastered';
    if (st === 'review') return 'review';
    return 'none';
  }

  function hasMastered(item, user) {
    return !!(user.status && user.status[item.id] && user.status[item.id].state === 'mastered');
  }

  function sourceText(item) {
    var bits = [];
    if (item.bookName) bits.push(item.bookName);
    if (item.bookTitle) bits.push(item.bookTitle);
    var tail = [];
    if (item.unitNo) tail.push(item.unitNo + (item.unitTitle ? ' ' + item.unitTitle : ''));
    if (item.lessonNo) tail.push(item.lessonNo + (item.lessonTitle ? ' ' + item.lessonTitle : ''));
    return {
      head: bits.join(' · '),
      detail: tail.join(' · ')
    };
  }

  function badges(item, user, today, q) {
    var out = [];
    out.push('<span class="badge type">' + esc(item.type) + '</span>');
    out.push('<span class="badge">' + DIFF_LABEL[item.diff] + '</span>');
    if (item.custom) out.push('<span class="badge custom">自定义</span>');
    var src = item.bookName ? (item.bookName + (item.lessonNo ? ' · ' + item.lessonNo : '')) : '';
    if (src) out.push('<span class="badge book">' + hl(src, q) + '</span>');
    var st = statusOf(item, user, today);
    if (st === 'today') {
      out.push('<span class="badge today">' + STATE_LABEL.today + '</span>');
      if (hasMastered(item, user)) out.push('<span class="badge ok">已掌握</span>');
    } else if (st === 'mastered') {
      out.push('<span class="badge ok">已掌握</span>');
    } else if (st === 'review') {
      out.push('<span class="badge warn">待复盘</span>');
    }
    return out.join('');
  }

  function cardHTML(item, user, q, index) {
    var st = statusOf(item, user, today0());
    var no = String(index + 1).padStart(2, '0');
    return '' +
      '<article class="k-card ' + st + '" data-id="' + esc(item.id) + '" tabindex="-1" role="button" aria-label="' + esc(item.title) + '">' +
        '<div class="ct"><span class="idx">' + no + '</span><span>' + hl(item.title, q) + '</span></div>' +
        '<p class="cc">' + hl(item.summary || '', q) + '</p>' +
        '<div class="cm">' + badges(item, user, today0(), q) +
          '<span class="spacer"></span>' +
          '<a class="cd-link" href="detail.html?id=' + encodeURIComponent(item.id) + '" target="_blank" rel="noopener">独立页</a>' +
        '</div>' +
      '</article>';
  }

  function today0() { return global.__ZZ_TODAY__ || ''; }

  function coreList(core) {
    return '<ul>' + (core || []).map(function (c) {
      return '<li>' + esc(c) + '</li>';
    }).join('') + '</ul>';
  }

  function lessonMapHTML(map) {
    if (!map) return '';
    return '<details class="lesson-map">' +
      '<summary><span class="lm-kicker">本课脉络</span><span class="lm-sub">主线 · 必背 · 易错 · 常问</span></summary>' +
      '<ol class="lm-chain">' + (map.chain || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ol>' +
      '<div class="lm-block"><h4>必背术语</h4><div class="kw-row">' +
        (map.must || []).map(function (t) { return '<span class="kw">' + esc(t) + '</span>'; }).join('') + '</div></div>' +
      '<div class="lm-block"><h4>本课易错</h4><ul class="lm-traps">' +
        (map.traps || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="lm-block"><h4>常问角度</h4><ul class="lm-asks">' +
        (map.asks || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '</details>';
  }

  function detailHTML(item, user, opts) {
    opts = opts || {};
    var today = opts.today || today0();
    var src = sourceText(item);
    var rev = (user.reviews && user.reviews[item.id]) || [];
    var note = (user.notes && user.notes[item.id] && user.notes[item.id].text) || '';
    var st = statusOf(item, user, today);
    var stRaw = (user.status && user.status[item.id] && user.status[item.id].state) || '';
    var reviewedToday = rev.indexOf(today) >= 0;
    var last = rev.length ? rev[rev.length - 1] : '';
    var related = (opts.related || []);

    var html = '' +
      '<div class="detail-crumb">' + esc(src.head) + (src.detail ? ' · ' + esc(src.detail) : '') + '</div>' +
      '<h1 class="detail-title">' + esc(item.title) + '</h1>' +
      '<div class="detail-badges">' + badges(item, user, today, '') + '</div>' +
      '<p class="detail-lead">' + esc(item.summary || '') + '</p>' +
      (item.type !== '总览' ? lessonMapHTML(opts.lessonMap) : '') +

      '<div class="status-block">' +
        '<div class="status-row" role="group" aria-label="掌握状态">' +
          '<button class="btn small' + (stRaw === 'mastered' ? ' primary' : '') + '" data-state="mastered" aria-pressed="' + (stRaw === 'mastered') + '">已掌握</button>' +
          '<button class="btn small' + (stRaw === 'review' ? ' primary' : '') + '" data-state="review" aria-pressed="' + (stRaw === 'review') + '">待复盘</button>' +
          '<button class="btn small" data-act="clear">清除状态</button>' +
          '<button class="btn small' + (reviewedToday ? ' primary' : '') + '" data-act="done-today" aria-pressed="' + reviewedToday + '">' + (reviewedToday ? '今日已复盘' : '标记今日复盘') + '</button>' +
        '</div>' +
        '<div class="review-line">' +
          '<span>复盘 <strong>' + rev.length + '</strong> 次</span>' +
          (last ? '<span>最近 <strong>' + esc(last) + '</strong></span>' : '<span>尚无记录</span>') +
          (reviewedToday ? '<span class="badge today">今日已复盘</span>' : '') +
        '</div>' +
      '</div>' +

      '<section class="detail-section">' +
        '<h3>要点</h3>' +
        '<div class="core-box detail-content">' + coreList(item.core) + '</div>' +
      '</section>' +

      (item.pitfall ?
        '<section class="detail-section"><h3>易错</h3><div class="pitfall">' + esc(item.pitfall) + '</div></section>' : '') +

      (item.exam ?
        '<section class="detail-section"><h3>考法</h3><div class="exam-box">' + esc(item.exam) + '</div></section>' : '') +

      ((item.terms && item.terms.length) ?
        '<section class="detail-section"><h3>关键词</h3><div class="kw-row">' +
          item.terms.map(function (t) { return '<span class="kw">' + esc(t) + '</span>'; }).join('') +
        '</div></section>' : '') +

      '<section class="detail-section">' +
        '<h3>我的笔记</h3>' +
        '<div class="note-box">' +
          '<textarea class="note-input" data-note-id="' + esc(item.id) + '" maxlength="2000" placeholder="记下自己的口径、易混点、错题出处…">' + esc(note) + '</textarea>' +
          '<div class="note-actions"><span class="hint" data-note-hint>自动保存到本机 · ' + note.length + '/2000</span>' +
            '<button class="btn small" data-act="copy-note">复制</button>' +
          '</div>' +
        '</div>' +
      '</section>' +

      (related.length ?
        '<section class="detail-section"><h3>同课其他考点</h3><div class="related">' +
          related.map(function (r) {
            return '<button class="related-item" data-related="' + esc(r.id) + '">' +
              '<span class="badge type">' + esc(r.type) + '</span>' +
              '<span class="t">' + esc(r.title) + '</span>' +
            '</button>';
          }).join('') +
        '</div></section>' : '') +

      (opts.standalone ?
        '<div class="detail-source"><span>来源：' + esc(src.head) + (src.detail ? ' · ' + esc(src.detail) : '') + '</span>' +
        '<a class="link-btn" href="index.html?id=' + encodeURIComponent(item.id) + '">在主站打开</a></div>' :
        '<div class="detail-source"><span>来源：' + esc(src.head) + (src.detail ? ' · ' + esc(src.detail) : '') + '</span>' +
        '<a class="link-btn" href="detail.html?id=' + encodeURIComponent(item.id) + '" target="_blank" rel="noopener">独立页打开</a></div>') +

      (item.custom ? '<div class="detail-section"><button class="btn small danger" data-act="delete-custom">删除这条自定义考点</button></div>' : '');

    return html;
  }

  function bindDetail(root, item, hooks) {
    hooks = hooks || {};
    root.querySelectorAll('[data-state]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var s = btn.getAttribute('data-state');
        var cur = btn.getAttribute('aria-pressed') === 'true';
        hooks.setStatus && hooks.setStatus(cur ? null : s);
      });
    });
    var clearBtn = root.querySelector('[data-act="clear"]');
    if (clearBtn) clearBtn.addEventListener('click', function () { hooks.setStatus && hooks.setStatus(null); });

    var doneBtn = root.querySelector('[data-act="done-today"]');
    if (doneBtn) doneBtn.addEventListener('click', function () {
      var pressed = doneBtn.getAttribute('aria-pressed') === 'true';
      hooks.toggleToday && hooks.toggleToday(!pressed);
    });

    var ta = root.querySelector('.note-input');
    if (ta) {
      var hint = root.querySelector('[data-note-hint]');
      var t = null;
      var commit = function () {
        if (hooks.saveNote) hooks.saveNote(ta.value, item.id);
        if (hint) hint.textContent = '已保存 · ' + ta.value.length + '/2000';
      };
      ta.addEventListener('input', function () {
        if (hint) hint.textContent = '输入中… ' + ta.value.length + '/2000';
        clearTimeout(t);
        t = setTimeout(commit, 450);
      });
      ta.addEventListener('blur', function () {
        clearTimeout(t); commit();
      });
    }

    var copyBtn = root.querySelector('[data-act="copy-note"]');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var val = ta ? ta.value : '';
      if (!val) { hooks.toast && hooks.toast('还没有笔记内容'); return; }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(val).then(function () { hooks.toast && hooks.toast('笔记已复制'); });
      } else {
        hooks.toast && hooks.toast('当前环境不支持自动复制');
      }
    });

    root.querySelectorAll('[data-related]').forEach(function (b) {
      b.addEventListener('click', function () {
        hooks.openRelated && hooks.openRelated(b.getAttribute('data-related'));
      });
    });

    var del = root.querySelector('[data-act="delete-custom"]');
    if (del) del.addEventListener('click', function () { hooks.removeCustom && hooks.removeCustom(item.id); });
  }

  global.ZZRender = {
    esc: esc,
    hl: hl,
    statusOf: statusOf,
    cardHTML: cardHTML,
    detailHTML: detailHTML,
    bindDetail: bindDetail,
    DIFF_LABEL: DIFF_LABEL,
    STATE_LABEL: STATE_LABEL
  };
})(window);
