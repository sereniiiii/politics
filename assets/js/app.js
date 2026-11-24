/* ============================================================
   app.js —— 主站交互
   纯 IIFE（非 module），兼容 file:// 直接打开。
   ============================================================ */
(function () {
  var ZZ = window.ZZ;
  var S = window.ZZStore;
  var R = window.ZZRender;
  if (!ZZ || !S || !R) { console.error('依赖脚本未加载：content.js / store.js / render.js'); return; }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var pad = function (n) { return String(n).padStart(2, '0'); };
  var dateStr = function (d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };
  var TODAY = dateStr(new Date());
  window.__ZZ_TODAY__ = TODAY;

  var user = S.loadUser();
  var items = [];
  var visible = [];
  var lessonMeta = {};
  var bookMeta = {};
  var lessonOrder = {};

  var state = {
    q: '', type: 'all', diff: 0, status: 'all',
    scope: { kind: 'all', bookId: '', lesson: '' },
    sort: 'chapter', selectedId: '', dueOnly: false,
    view: 'cards', mxDim: 'all', matrixId: '', pairId: ''
  };

  /* ---------- 数据装配 ---------- */
  function buildMetaMaps() {
    lessonMeta = {}; bookMeta = {}; lessonOrder = {};
    ZZ.books.forEach(function (b, bi) {
      bookMeta[b.id] = { name: b.name, title: b.title, short: b.short, index: bi };
      b.lessons.forEach(function (les, li) {
        var unit = null;
        (b.units || []).forEach(function (u) {
          if (u.lessons.indexOf(les.id) >= 0) unit = u;
        });
        lessonMeta[les.id] = {
          bookId: b.id, bookName: b.name, bookTitle: b.title,
          unitNo: unit ? unit.no : '', unitTitle: unit ? unit.title : '',
          lessonNo: les.no, lessonTitle: les.title
        };
        lessonOrder[les.id] = li;
      });
    });
  }

  function buildItems() {
    items = ZZ.items.map(function (it) { return it; });
    (user.customs || []).forEach(function (c) {
      var m = lessonMeta[c.lesson] || {};
      var bm = bookMeta[c.bookId] || {};
      items.push({
        id: c.id, title: c.title, summary: c.summary, type: c.type || '概念',
        diff: c.diff || 2, core: c.core || [], pitfall: c.pitfall || '',
        exam: c.exam || '', terms: c.terms || [],
        bookId: c.bookId || 'custom', bookName: bm.name || '我的补充',
        bookTitle: bm.title || '自建', unitNo: m.unitNo || '', unitTitle: m.unitTitle || '',
        lesson: c.lesson || 'custom', lessonNo: m.lessonNo || '自建',
        lessonTitle: m.lessonTitle || '自定义条目', custom: true,
        updatedAt: c.updatedAt
      });
    });
  }

  function byId(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function lessonItems(lid) {
    return items.filter(function (it) { return it.lesson === lid; });
  }

  /* ---------- 状态 ---------- */
  function rawStatus(id) {
    return (user.status[id] && user.status[id].state) || '';
  }
  function reviewedToday(id) {
    return ((user.reviews[id]) || []).indexOf(TODAY) >= 0;
  }
  function isDue(id) {
    return rawStatus(id) === 'review' && !reviewedToday(id);
  }
  function dueIds() {
    return items.filter(function (it) { return isDue(it.id); }).map(function (it) { return it.id; });
  }
  function todayIds() {
    return items.filter(function (it) { return reviewedToday(it.id); }).map(function (it) { return it.id; });
  }
  function masteredIds() {
    return items.filter(function (it) { return rawStatus(it.id) === 'mastered'; });
  }
  function reviewDays() {
    var set = {};
    Object.keys(user.reviews || {}).forEach(function (k) {
      (user.reviews[k] || []).forEach(function (d) { set[d] = 1; });
    });
    return Object.keys(set).sort();
  }
  function persist() {
    if (!S.saveUser(user)) toast('本机存储写入失败，请先导出备份');
  }

  /* ---------- 筛选与排序 ---------- */
  function haystack(it) {
    return [
      it.title, it.summary, it.bookTitle, it.bookName, it.lessonTitle, it.unitTitle,
      (it.core || []).join(' '), it.pitfall || '', it.exam || '', (it.terms || []).join(' '),
      (user.notes[it.id] && user.notes[it.id].text) || ''
    ].join(' ').toLowerCase();
  }

  function applyFilters() {
    var q = state.q.trim().toLowerCase();
    var toks = q ? q.split(/\s+/).filter(Boolean) : [];
    var arr = items.slice();

    if (state.dueOnly) {
      arr = arr.filter(function (it) { return isDue(it.id); });
    } else if (!q) {
      if (state.scope.kind === 'lesson') {
        arr = arr.filter(function (it) { return it.lesson === state.scope.lesson; });
      } else if (state.scope.kind === 'book') {
        arr = arr.filter(function (it) { return it.bookId === state.scope.bookId; });
      }
    }

    if (state.type !== 'all') arr = arr.filter(function (it) { return it.type === state.type; });
    if (state.diff) arr = arr.filter(function (it) { return +it.diff === +state.diff; });

    if (state.status !== 'all') {
      arr = arr.filter(function (it) {
        if (state.status === 'mastered') return rawStatus(it.id) === 'mastered';
        if (state.status === 'review') return rawStatus(it.id) === 'review';
        if (state.status === 'today') return reviewedToday(it.id);
        if (state.status === 'none') return !rawStatus(it.id) && !reviewedToday(it.id);
        return true;
      });
    }

    if (toks.length) {
      arr = arr.filter(function (it) {
        var hay = haystack(it);
        return toks.every(function (t) { return hay.indexOf(t) >= 0; });
      });
    }
    return sortItems(arr);
  }

  function statusRank(id) {
    if (reviewedToday(id)) return 0;
    var s = rawStatus(id);
    if (s === 'review') return 1;
    if (s === 'mastered') return 2;
    return 3;
  }

  function sortItems(arr) {
    var out = arr.slice();
    if (state.sort === 'difficulty') {
      out.sort(function (a, b) { return b.diff - a.diff || a.id.localeCompare(b.id); });
    } else if (state.sort === 'status') {
      out.sort(function (a, b) { return statusRank(a.id) - statusRank(b.id) || a.id.localeCompare(b.id); });
    } else if (state.sort === 'title') {
      out.sort(function (a, b) { return a.title.localeCompare(b.title, 'zh-Hans-CN'); });
    } else {
      out.sort(function (a, b) {
        var ao = (bookMeta[a.bookId] ? bookMeta[a.bookId].index : 99) * 100 + (lessonOrder[a.lesson] || 0);
        var bo = (bookMeta[b.bookId] ? bookMeta[b.bookId].index : 99) * 100 + (lessonOrder[b.lesson] || 0);
        return ao - bo || a.id.localeCompare(b.id, 'en');
      });
    }
    return out;
  }

  /* ---------- 概览 ---------- */
  function renderStats() {
    $('#heroTotal').textContent = items.length;
    $('#heroMastered').textContent = masteredIds().length;
    var d = $('#heroDue'), t = $('#heroToday');
    if (d) d.textContent = dueIds().length;
    if (t) t.textContent = todayIds().length;
    var dc = $('#dueCount');
    if (dc) { dc.textContent = dueIds().length; dc.className = 'count' + (dueIds().length ? ' warn' : ''); }
    var rc = $('#reviewCount');
    if (rc) rc.textContent = reviewDays().length;

    var d0 = new Date();
    $('#heroDate').textContent = d0.getFullYear() + '.' + pad(d0.getMonth() + 1) + '.' + pad(d0.getDate());
    $('#heroCount').textContent = items.length + ' 条';

    var last = user.config && user.config.lastBackup;
    var info = $('#backupInfo'), warn = $('#backupWarn');
    if (last) {
      var dt = new Date(last);
      info.textContent = '上次备份 ' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
      var days = Math.floor((Date.now() - last) / 86400000);
      warn.hidden = days < 7;
      warn.textContent = '距上次备份超过七天，建议导出一次';
    } else {
      info.textContent = '尚未导出备份';
      warn.hidden = true;
    }
  }

  /* ---------- 章节树 ---------- */
  function dotClass(lid) {
    var arr = lessonItems(lid);
    if (!arr.length) return '';
    if (arr.some(function (it) { return reviewedToday(it.id); })) return 'today';
    if (arr.every(function (it) { return rawStatus(it.id) === 'mastered'; })) return 'mastered';
    if (arr.some(function (it) { return rawStatus(it.id) === 'review'; })) return 'review';
    return '';
  }

  function renderTree() {
    if (state.view !== 'cards') return renderOtherIndex();
    var tree = $('#tree');
    var keep = tree.scrollTop;
    var exp = (user.config && user.config.expanded) || {};
    var html = '';

    html += '<button class="tree-lesson root' + (state.scope.kind === 'all' ? ' active' : '') + '" data-scope="all">' +
      '<span class="dot' + (dueIds().length ? ' review' : '') + '"></span>' +
      '<span class="lbl">全部考点</span><span class="cnt">' + items.length + '</span></button>';

    ZZ.books.forEach(function (b) {
      var open = exp[b.id] !== false;
      var arr = items.filter(function (it) { return it.bookId === b.id; });
      html += '<div class="tree-book">';
      html += '<button class="tree-toggle" data-book="' + b.id + '" aria-expanded="' + open + '">' +
        '<span class="caret">▾</span>' +
        '<span class="tree-book-title">' + R.esc(b.name + ' ' + b.title) + '<small>' + b.lessons.length + ' 课</small></span>' +
        '</button>';
      if (open) {
        var printed = {};
        (b.units || []).forEach(function (u) {
          html += '<div class="tree-unit">' + R.esc(u.no + ' ' + u.title) + '</div>';
          u.lessons.forEach(function (lid) {
            var les = b.lessons.filter(function (x) { return x.id === lid; })[0];
            if (!les) return;
            printed[lid] = 1;
            html += lessonRow(b, les, b.lessons.map(function (x) { return x.id; }).indexOf(lid) + 1);
          });
        });
        b.lessons.forEach(function (les, li) {
          if (printed[les.id]) return;
          html += lessonRow(b, les, li + 1);
        });
      }
      html += '</div>';
    });

    tree.innerHTML = html;
    tree.scrollTop = keep;

    function lessonRow(b, les, idx) {
      var n = lessonItems(les.id).length;
      var active = state.scope.kind === 'lesson' && state.scope.lesson === les.id;
      return '<div class="tree-lesson' + (active ? ' active' : '') + '" data-lesson="' + les.id + '" role="button" tabindex="0">' +
        '<span class="dot ' + dotClass(les.id) + '"></span>' +
        '<span class="num">' + idx + '</span>' +
        '<span class="lbl">' + R.esc(les.title) + '</span>' +
        '<span class="cnt">' + n + '</span></div>';
    }
  }


  /* ---------- 视图：卡片 / 主体矩阵 / 易混对照 ---------- */
  var V = window.ZZViews || {};
  var mx = (V.matrix && V.matrix.subjects && V.matrix.subjects.length) ? V.matrix : null;
  var prs = (V.pairs && V.pairs.pairs && V.pairs.pairs.length) ? V.pairs.pairs : null;
  var VIEW_HINT = { cards: '章节索引 · 卡片阅读', matrix: '维度索引 · 横向对比', pairs: '对照索引 · 成对分辨' };

  function viewHasData(v) { return v === 'cards' || (v === 'matrix' && !!mx) || (v === 'pairs' && !!prs); }

  function setViewUrl() {
    try {
      var url;
      if (state.view === 'matrix') {
        url = '?view=matrix' + (state.mxDim !== 'all' ? '&dim=' + encodeURIComponent(state.mxDim) : '') +
          (state.matrixId ? '&s=' + encodeURIComponent(state.matrixId) : '');
      } else if (state.view === 'pairs') {
        url = '?view=pairs' + (state.pairId ? '&p=' + encodeURIComponent(state.pairId) : '');
      } else {
        url = state.selectedId ? '?id=' + encodeURIComponent(state.selectedId) : '';
      }
      history.replaceState(null, '', url || location.pathname);
    } catch (e) { /* file:// 下忽略 */ }
  }

  function switchView(v, opt) {
    opt = opt || {};
    if (!viewHasData(v)) v = 'cards';
    state.view = v;
    document.body.classList.toggle('mode-matrix', v === 'matrix');
    document.body.classList.toggle('mode-pairs', v === 'pairs');
    var lv = $('#listViewport'), hs = $('#homeStrip'), ct = $('.center-toolbar');
    if (lv) lv.hidden = v !== 'cards';
    if (hs) hs.hidden = false;
    if (ct) ct.hidden = v !== 'cards';
    var mv = $('#matrixView'), pv = $('#pairsView');
    if (mv) mv.hidden = v !== 'matrix';
    if (pv) pv.hidden = v !== 'pairs';
    $$('#viewBar button').forEach(function (b) {
      var on = b.getAttribute('data-view') === v;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var ttl = $('#leftPaneTitle');
    if (ttl) ttl.textContent = v === 'matrix' ? '主体索引' : v === 'pairs' ? '对照索引' : '章节树';
    var rtl = $('#rightPaneTitle');
    if (rtl) rtl.textContent = v === 'matrix' ? '主体详情' : v === 'pairs' ? '对照详情' : '考点详情';
    var hint = $('#viewbarHint');
    if (hint) hint.textContent = VIEW_HINT[v] || '';
    if (v === 'matrix') {
      $('#scopeLabel').textContent = state.mxDim === 'all' ? '主体矩阵' : '主体矩阵 · 单维';
      $('#scopeSub').textContent = mx ? mx.subjects.length + ' 个主体 × ' + mx.dims.length + ' 个维度' : '数据未加载';
    } else if (v === 'pairs') {
      $('#scopeLabel').textContent = '易混对照';
      $('#scopeSub').textContent = prs ? prs.length + ' 组最容易混的搭配' : '数据未加载';
    }
    renderTree();
    if (v === 'matrix' && mx) {
      if (!state.matrixId) state.matrixId = mx.subjects[0].id;
      renderMatrix(true);
      renderSubjectDetail(state.matrixId, { openMobile: false });
    } else if (v === 'pairs' && prs) {
      if (!state.pairId) state.pairId = prs[0].id;
      renderPairs(true);
      renderPairDetail(state.pairId, { openMobile: false });
    } else if (v === 'cards') {
      renderList(true);
      if (state.selectedId && byId(state.selectedId)) renderDetail(state.selectedId);
      else { $('#detailBody').innerHTML = ''; $('#detailBody').hidden = true; $('#detailEmpty').hidden = false; }
    }
    if (!opt.silent) setViewUrl();
  }

  function renderOtherIndex() {
    var tree = $('#tree');
    var keep = tree.scrollTop;
    var html = '';
    if (state.view === 'matrix' && mx) {
      html += '<button class="dim-item' + (state.mxDim === 'all' ? ' active' : '') + '" data-dim="all">' +
        '<span class="t">全部维度</span><span class="h">一次看全 5 个维度</span></button>';
      mx.dims.forEach(function (d) {
        html += '<button class="dim-item' + (state.mxDim === d.key ? ' active' : '') + '" data-dim="' + d.key + '">' +
          '<span class="t">' + R.esc(d.label) + '</span><span class="h">' + R.esc(d.hint) + '</span></button>';
      });
    } else if (state.view === 'pairs' && prs) {
      prs.forEach(function (x) {
        html += '<button class="dim-item' + (state.pairId === x.id ? ' active' : '') + '" data-pair="' + x.id + '">' +
          '<span class="t">' + R.esc(x.title) + '</span><span class="h">' + R.esc((x.terms || []).join(' · ')) + '</span></button>';
      });
    }
    tree.innerHTML = html;
    tree.scrollTop = keep;
  }

  function renderMatrix(reset) {
    var box = $('#matrixView');
    if (!box || !mx) return;
    var keep = reset ? 0 : box.scrollTop;
    var dimOn = null;
    mx.dims.forEach(function (d) { if (d.key === state.mxDim) dimOn = d; });
    var html = '<div class="mx-head"><h3>主体 — 职权矩阵</h3><span class="mx-count">' +
      mx.subjects.length + ' 个主体 · ' + mx.dims.length + ' 个维度</span></div>';
    html += '<p class="mx-note">' + (dimOn
      ? '正在看「' + R.esc(dimOn.label) + '」：' + R.esc(dimOn.hint) + '。换维度点左栏，或切回「全部维度」。'
      : '政治选择题最常见的失分是“主体错位”：先认准主体，再谈它能不能做这件事。按同一维度竖着读，差异最清楚。') + '</p>';
    html += '<div class="mx-list">';
    mx.subjects.forEach(function (s) {
      var sel = state.matrixId === s.id;
      html += '<article class="mx-card' + (sel ? ' selected' : '') + '" data-subject="' + s.id + '" role="button" tabindex="0">' +
        '<header><h3>' + R.esc(s.name) + '</h3><span class="badge type">' + R.esc(s.tag) + '</span></header>' +
        '<p class="mx-sum">' + R.esc(s.summary) + '</p><dl>';
      mx.dims.forEach(function (d) {
        if (state.mxDim !== 'all' && state.mxDim !== d.key) return;
        html += '<div class="mx-row' + (d.key === 'pitfall' ? ' hl' : '') + '"><dt>' + R.esc(d.label) + '</dt>' +
          '<dd>' + R.esc(s.dims[d.key]) + '</dd></div>';
      });
      html += '</dl><div class="mx-foot"><span>点开看完整职权与易错</span><span class="go">详情 ›</span></div></article>';
    });
    html += '</div>';
    box.innerHTML = html;
    box.scrollTop = keep;
  }

  function renderPairs(reset) {
    var box = $('#pairsView');
    if (!box || !prs) return;
    var keep = reset ? 0 : box.scrollTop;
    var html = '<div class="mx-head"><h3>易混对照</h3><span class="mx-count">' + prs.length + ' 组 · 每组只差一个词</span></div>' +
      '<p class="mx-note">每组先看两个概念各自的定义，再看“区别要点”。考场上真正扣分的是把 A 的定义写到 B 头上。</p>' +
      '<div class="pair-list">';
    prs.forEach(function (x) {
      var sel = state.pairId === x.id;
      html += '<article class="pair-card' + (sel ? ' selected' : '') + '" data-pair="' + x.id + '" role="button" tabindex="0">' +
        '<h3>' + R.esc(x.title) + '</h3>' +
        '<div class="pair-grid">' +
        '<div class="pair-side"><span class="pair-label">' + R.esc(x.a.label) + '</span><p>' + R.esc(x.a.text) + '</p></div>' +
        '<div class="pair-side"><span class="pair-label">' + R.esc(x.b.label) + '</span><p>' + R.esc(x.b.text) + '</p></div>' +
        '</div>' +
        '<ul class="pair-diff">' + x.diff.map(function (d) { return '<li>' + R.esc(d) + '</li>'; }).join('') + '</ul>' +
        '<p class="pair-pitfall">易错：' + R.esc(x.pitfall) + '</p></article>';
    });
    html += '</div>';
    box.innerHTML = html;
    box.scrollTop = keep;
  }

  function relatedByTerms(terms, limit) {
    if (!terms || !terms.length) return [];
    var hit = [];
    items.forEach(function (it) {
      var hay = it.title + ' ' + (it.summary || '') + ' ' + (it.core || []).join(' ') + ' ' +
        (it.pitfall || '') + ' ' + (it.exam || '') + ' ' + (it.terms || []).join(' ');
      var n = 0;
      terms.forEach(function (t) { if (t && hay.indexOf(t) >= 0) n++; });
      if (n) hit.push({ it: it, n: n });
    });
    hit.sort(function (a, b) { return b.n - a.n; });
    return hit.slice(0, limit || 8).map(function (x) { return x.it; });
  }

  function kwBlock(terms) {
    if (!terms || !terms.length) return '';
    return '<section class="detail-section"><h3>关键词</h3><div class="kw-row">' +
      terms.map(function (t) { return '<span class="kw">' + R.esc(t) + '</span>'; }).join('') + '</div></section>';
  }

  function relatedBlock(terms, label) {
    var rel = relatedByTerms(terms, 8);
    if (!rel.length) return '';
    return '<section class="detail-section"><h3>' + label + '</h3><div class="related">' +
      rel.map(function (it) {
        return '<button class="related-item" data-goto-item="' + it.id + '">' +
          '<span class="badge type">' + R.esc(it.type) + '</span><span class="t">' + R.esc(it.title) + '</span></button>';
      }).join('') + '</div></section>';
  }

  function renderSubjectDetail(id, opt) {
    if (!mx) return;
    opt = opt || {};
    var s = null;
    mx.subjects.forEach(function (x) { if (x.id === id) s = x; });
    if (!s) return;
    state.matrixId = s.id;
    var html = '<div class="detail-crumb">主体矩阵 · ' + R.esc(s.tag) + '</div>' +
      '<h1 class="detail-title">' + R.esc(s.name) + '</h1>' +
      '<div class="detail-badges"><span class="badge type">' + R.esc(s.tag) + '</span></div>' +
      '<p class="detail-lead">' + R.esc(s.summary) + '</p>' +
      '<div class="mx-detail">';
    mx.dims.forEach(function (d) {
      html += '<section class="detail-section mx-dim' + (state.mxDim === d.key ? ' on' : '') + '">' +
        '<h3>' + R.esc(d.label) + '</h3><p>' + R.esc(s.dims[d.key]) + '</p></section>';
    });
    html += '</div>';
    html += kwBlock(s.terms);
    html += relatedBlock(s.terms, '相关考点');
    $('#detailBody').innerHTML = html;
    $('#detailBody').hidden = false;
    $('#detailEmpty').hidden = true;
    $$('#matrixView .mx-card').forEach(function (c) {
      c.classList.toggle('selected', c.getAttribute('data-subject') === s.id);
    });
    if (opt.openMobile !== false && isMobile()) { openPane('detail'); setTab('detail'); }
  }

  function renderPairDetail(id, opt) {
    if (!prs) return;
    opt = opt || {};
    var x = null;
    prs.forEach(function (p) { if (p.id === id) x = p; });
    if (!x) return;
    state.pairId = x.id;
    var html = '<div class="detail-crumb">易混对照 · 定义 → 区别 → 陷阱</div>' +
      '<h1 class="detail-title">' + R.esc(x.title) + '</h1>' +
      '<div class="pair-detail">' +
      '<div class="pair-grid">' +
      '<div class="pair-side"><span class="pair-label">' + R.esc(x.a.label) + '</span><p>' + R.esc(x.a.text) + '</p></div>' +
      '<div class="pair-side"><span class="pair-label">' + R.esc(x.b.label) + '</span><p>' + R.esc(x.b.text) + '</p></div>' +
      '</div></div>' +
      '<section class="detail-section"><h3>区别要点</h3><div class="core-box detail-content"><ul>' +
      x.diff.map(function (d) { return '<li>' + R.esc(d) + '</li>'; }).join('') + '</ul></div></section>' +
      '<section class="detail-section"><h3>易错</h3><div class="pitfall">' + R.esc(x.pitfall) + '</div></section>' +
      kwBlock(x.terms) + relatedBlock(x.terms || [], '相关考点');
    $('#detailBody').innerHTML = html;
    $('#detailBody').hidden = false;
    $('#detailEmpty').hidden = true;
    $$('#pairsView .pair-card').forEach(function (c) {
      c.classList.toggle('selected', c.getAttribute('data-pair') === x.id);
    });
    if (opt.openMobile !== false && isMobile()) { openPane('detail'); setTab('detail'); }
  }

  function selectSubject(id, opt) {
    opt = opt || {};
    renderSubjectDetail(id, opt);
    var card = $('#matrixView .mx-card[data-subject="' + id + '"]');
    if (card) card.scrollIntoView({ block: 'nearest' });
    setViewUrl();
  }

  function selectPair(id, opt) {
    opt = opt || {};
    renderPairDetail(id, opt);
    var card = $('#pairsView .pair-card[data-pair="' + id + '"]');
    if (card) card.scrollIntoView({ block: 'nearest' });
    $$('#tree .dim-item').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-pair') === id);
    });
    setViewUrl();
  }

  function openItem(id) {
    if (!byId(id)) return;
    state.q = ''; $('#searchInput').value = '';
    state.dueOnly = false;
    state.scope = { kind: 'all', bookId: '', lesson: '' };
    state.type = 'all'; state.diff = 0; state.status = 'all';
    $('#filterType').value = 'all'; $('#filterDiff').value = '0'; $('#filterStatus').value = 'all';
    switchView('cards', { silent: true });
    renderTree(); renderList(true);
    select(id, { scrollCard: true, openMobile: true });
  }

  function moveAlt(step) {
    var list = state.view === 'matrix' ? mx.subjects : prs;
    if (!list) return;
    var ids = list.map(function (x) { return x.id; });
    var cur = state.view === 'matrix' ? state.matrixId : state.pairId;
    var i = ids.indexOf(cur);
    var next = i < 0 ? (step > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, i + step));
    var id = ids[next];
    if (state.view === 'matrix') selectSubject(id, { openMobile: false });
    else selectPair(id, { openMobile: false });
  }

  /* ---------- 列表 ---------- */
  function scopeText() {
    if (state.dueOnly) return { label: '今日待复盘', sub: '待复盘且今日未复盘' };
    if (state.q.trim()) return { label: '搜索结果', sub: '“' + state.q.trim() + '”' };
    if (state.scope.kind === 'lesson') {
      var m = lessonMeta[state.scope.lesson] || {};
      return { label: m.lessonNo + ' ' + m.lessonTitle, sub: m.bookName + ' · ' + m.bookTitle };
    }
    if (state.scope.kind === 'book') {
      var bm = bookMeta[state.scope.bookId] || {};
      return { label: bm.name + ' ' + bm.title, sub: '整本书' };
    }
    return { label: '全部考点', sub: '按教材顺序' };
  }

  function renderList(resetScroll) {
    var vp = $('#listViewport');
    var keep = resetScroll ? 0 : vp.scrollTop;
    visible = applyFilters();

    $('#resultCount').textContent = visible.length;
    var st = scopeText();
    $('#scopeLabel').textContent = st.label;
    $('#scopeSub').textContent = st.sub;
    $('#searchHint').textContent = state.q.trim() ? ' · 含笔记内容' : '';
    var vt = $('#viewToggle');
    if (vt) vt.hidden = !(state.q.trim() || state.dueOnly || state.scope.kind !== 'all');
    $('#searchClear').hidden = !state.q;

    if (!visible.length) {
      $('#listCanvas').innerHTML = '';
      $('#emptyState').hidden = false;
      renderNearest();
      vp.scrollTop = 0;
      return;
    }
    $('#emptyState').hidden = true;

    var q = state.q.trim();
    $('#listCanvas').innerHTML = visible.map(function (it, i) { return R.cardHTML(it, user, q, i); }).join('');
    var sel = $('#listCanvas .k-card.selected');
    $$('#listCanvas .k-card').forEach(function (c) {
      if (c.getAttribute('data-id') === state.selectedId) c.classList.add('selected');
    });
    if (sel) { /* 已由上面统一处理 */ }
    vp.scrollTop = keep;
  }

  function renderNearest() {
    var box = $('#nearestList');
    var q = state.q.trim().toLowerCase();
    if (!q) {
      box.innerHTML = '<div class="nearest-title">可以试试这些入口</div>' +
        ['b1c1', 'b3c5', 'b4c6', 'x1c4', 'x2c5', 'x3c6'].map(function (lid) {
          var m = lessonMeta[lid];
          return '<button class="nearest-item" data-goto-lesson="' + lid + '">' +
            '<span class="muted small">' + R.esc(m.bookName + ' · ' + m.lessonNo) + '</span>' +
            '<span>' + R.esc(m.lessonTitle) + '</span></button>';
        }).join('');
      return;
    }
    var scored = items.map(function (it) {
      var hay = haystack(it);
      var score = 0;
      Array.from(q).forEach(function (ch) { if (hay.indexOf(ch) >= 0) score++; });
      return { it: it, score: score };
    }).sort(function (a, b) { return b.score - a.score; }).slice(0, 4);
    box.innerHTML = '<div class="nearest-title">最接近的几条</div>' +
      scored.map(function (s) {
        return '<button class="nearest-item" data-goto="' + R.esc(s.it.id) + '">' +
          '<span class="muted small">' + R.esc(s.it.bookName + ' · ' + s.it.lessonNo) + '</span>' +
          '<span>' + R.esc(s.it.title) + '</span></button>';
      }).join('');
  }

  /* ---------- 详情 ---------- */
  function renderDetail(id) {
    var it = byId(id);
    var body = $('#detailBody'), empty = $('#detailEmpty');
    if (!it) {
      body.hidden = true; empty.hidden = false;
      state.selectedId = '';
      return;
    }
    state.selectedId = it.id;
    var related = items.filter(function (x) { return x.lesson === it.lesson && x.id !== it.id; }).slice(0, 6);
    empty.hidden = true;
    body.hidden = false;
    body.innerHTML = R.detailHTML(it, user, { today: TODAY, related: related });
    body.scrollTop = 0;

    R.bindDetail(body, it, {
      setStatus: function (s) { commitNote(it.id); setStatus(it.id, s); },
      toggleToday: function (on) { commitNote(it.id); toggleToday(it.id, on); },
      saveNote: function (text) { saveNote(it.id, text); },
      openRelated: function (rid) { select(rid, { openMobile: true }); },
      removeCustom: function (cid) { removeCustom(cid); },
      toast: toast
    });
  }

  function commitNote(id) {
    var ta = $('#detailBody .note-input');
    if (ta && ta.getAttribute('data-note-id') === id) saveNote(id, ta.value);
  }

  function saveNote(id, text) {
    var clean = String(text || '');
    if (!clean.trim()) {
      delete user.notes[id];
    } else {
      user.notes[id] = { text: clean, updatedAt: Date.now() };
    }
    persist();
    refreshCards();
  }

  function refreshCards() {
    renderList(false);
    renderStats();
  }

  function setStatus(id, s) {
    if (!s) delete user.status[id];
    else user.status[id] = { state: s, updatedAt: Date.now() };
    persist();
    renderDetail(id);
    renderStats();
    renderTree();
    refreshCards();
  }

  function toggleToday(id, on) {
    var arr = (user.reviews[id] || []).slice();
    var i = arr.indexOf(TODAY);
    if (on && i < 0) arr.push(TODAY);
    if (!on && i >= 0) arr.splice(i, 1);
    arr.sort();
    if (arr.length) user.reviews[id] = arr; else delete user.reviews[id];
    persist();
    renderDetail(id);
    renderStats();
    renderTree();
    refreshCards();
  }

  /* ---------- 选中 ---------- */
  var isMobile = function () { return window.matchMedia('(max-width:980px)').matches; };

  function select(id, opt) {
    opt = opt || {};
    var it = byId(id);
    if (!it) return;
    state.selectedId = id;
    $$('#listCanvas .k-card').forEach(function (c) {
      c.classList.toggle('selected', c.getAttribute('data-id') === id);
    });
    if (opt.scrollCard) {
      var card = $('#listCanvas .k-card[data-id="' + id + '"]');
      if (card) card.scrollIntoView({ block: 'nearest' });
    }
    renderDetail(id);
    if (opt.openMobile !== false && isMobile()) {
      openPane('detail');
    }
    try {
      var url = location.pathname + '?id=' + encodeURIComponent(id);
      history.replaceState(null, '', url);
    } catch (e) { /* file:// 下忽略 */ }
  }

  /* ---------- 键盘 ---------- */
  function move(step) {
    if (!visible.length) return;
    var i = visible.findIndex(function (it) { return it.id === state.selectedId; });
    var next = i < 0 ? (step > 0 ? 0 : visible.length - 1) : Math.max(0, Math.min(visible.length - 1, i + step));
    select(visible[next].id, { scrollCard: true, openMobile: false });
  }

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (e.key === 'Escape') {
      if (!$('#modalRoot').hidden) { closeModal(); return; }
      if ($('#searchInput').value) {
        $('#searchInput').value = ''; onSearch('');
        if (typing) $('#searchInput').blur();
        return;
      }
      if (isMobile()) { closePanes(); setTab('list'); return; }
      return;
    }
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); $('#searchInput').focus(); $('#searchInput').select(); return; }
    if (e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      if (state.view === 'cards') move(1); else moveAlt(1);
      return;
    }
    if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      if (state.view === 'cards') move(-1); else moveAlt(-1);
      return;
    }
    if (e.key === 'Enter' && state.selectedId) {
      e.preventDefault();
      window.open('detail.html?id=' + encodeURIComponent(state.selectedId), '_blank', 'noopener');
    }
  });

  /* ---------- 提示 ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ---------- 弹窗 ---------- */
  function modal(title, body, foot, onMount) {
    var root = $('#modalRoot');
    root.hidden = false;
    root.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h3>' + R.esc(title) + '</h3><button class="icon-btn" data-close aria-label="关闭">×</button></div>' +
      '<div class="modal-body">' + body + '</div>' +
      (foot ? '<div class="modal-foot">' + foot + '</div>' : '') +
      '</div>';
    $$('[data-close]', root).forEach(function (b) { b.addEventListener('click', closeModal); });
    root.onclick = function (e) { if (e.target === root) closeModal(); };
    var focusable = root.querySelector('input,select,textarea,button');
    if (focusable) setTimeout(function () { focusable.focus(); }, 60);
    if (onMount) onMount(root);
    return root;
  }

  function closeModal() {
    var root = $('#modalRoot');
    root.hidden = true;
    root.innerHTML = '';
    root.onclick = null;
  }

  /* ---------- 备份 ---------- */
  function snapshotRows() {
    var snaps = S.listSnapshots();
    if (!snaps.length) return '<p class="muted small">还没有快照。导入、恢复或每日首次打开会自动生成。</p>';
    return '<div class="list-mini">' + snaps.map(function (s) {
      var d = new Date(s.at);
      return '<div class="row"><div><div>' + R.esc(s.reason || '快照') + '</div>' +
        '<div class="snap-meta">' + R.esc(dateStr(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())) +
        ' · 笔记 ' + (s.counts.notes || 0) + ' · 自定义 ' + (s.counts.customs || 0) + '</div></div>' +
        '<button class="btn small" data-restore="' + s.id + '">恢复</button></div>';
    }).join('') + '</div>';
  }

  function exportJSON() {
    var payload = S.exportPayload(user);
    S.download('政治知识库-备份-' + S.stamp() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    user.config.lastBackup = Date.now();
    persist(); renderStats();
    toast('已导出 JSON 备份');
  }

  function exportCSV() {
    S.download('政治考点-笔记-' + S.stamp() + '.csv', S.notesToCSV(items, user), 'text/csv;charset=utf-8');
    user.config.lastBackup = Date.now();
    persist(); renderStats();
    toast('已导出 CSV（可用 Excel 打开）');
  }

  function exportMD() {
    S.download('政治考点-汇总-' + S.stamp() + '.md', S.knowledgeToMD(items, user), 'text/markdown;charset=utf-8');
    user.config.lastBackup = Date.now();
    persist(); renderStats();
    toast('已导出 Markdown');
  }

  function openBackup() {
    var body = '' +
      '<div class="info-note">内容在页面里，你的笔记、状态、复盘、自定义条目只存在本机浏览器。换设备或清理浏览器前，先导出 JSON。</div>' +
      '<h4 style="margin:14px 0 7px">导出</h4>' +
      '<div class="seg"><button class="btn small primary" data-exp="json">JSON 全量备份</button>' +
      '<button class="btn small" data-exp="csv">CSV 笔记表</button>' +
      '<button class="btn small" data-exp="md">Markdown 汇总</button></div>' +
      '<h4 style="margin:16px 0 7px">导入</h4>' +
      '<div class="seg"><button class="btn small" data-import>选择 JSON 备份…</button>' +
      '<input type="file" id="importFile" accept=".json,application/json" hidden></div>' +
      '<p class="muted small" style="margin-top:6px">导入前会自动快照；校验通过后可选「合并」或「覆盖」。</p>' +
      '<h4 style="margin:16px 0 7px">快照回滚</h4>' + snapshotRows() +
      '<h4 style="margin:16px 0 7px">风险操作</h4>' +
      '<button class="btn small danger" data-wipe>清空本机用户数据</button>';

    modal('备份与导入', body, '<button class="btn" data-close>关闭</button>', function (root) {
      $$('[data-exp]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-exp');
          if (k === 'json') exportJSON();
          if (k === 'csv') exportCSV();
          if (k === 'md') exportMD();
          closeModal(); openBackup();
        });
      });
      root.querySelector('[data-import]').addEventListener('click', function () { root.querySelector('#importFile').click(); });
      root.querySelector('#importFile').addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        if (f) readImport(f);
      });
      $$('[data-restore]', root).forEach(function (b) {
        b.addEventListener('click', function () { confirmRestore(b.getAttribute('data-restore')); });
      });
      root.querySelector('[data-wipe]').addEventListener('click', confirmWipe);
    });
  }

  function readImport(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var obj;
      try { obj = JSON.parse(String(fr.result)); } catch (e) {
        modal('导入失败', '<div class="danger-note">文件不是合法 JSON。</div>', '<button class="btn" data-close>关闭</button>');
        return;
      }
      var err = S.validateImport(obj);
      if (err) {
        modal('导入失败', '<div class="danger-note">' + R.esc(err) + '</div><p class="muted small" style="margin-top:8px">请选择由本工具「JSON 全量备份」导出的文件。</p>', '<button class="btn" data-close>关闭</button>');
        return;
      }
      var d = obj.data;
      var counts = {
        notes: Object.keys(d.notes || {}).length,
        status: Object.keys(d.status || {}).length,
        reviews: Object.keys(d.reviews || {}).length,
        customs: (d.customs || []).length
      };
      var body = '<div class="info-note">校验通过。备份时间：' + R.esc(obj.exportedAt ? new Date(obj.exportedAt).toLocaleString('zh-CN') : '未知') + '</div>' +
        '<div class="list-mini" style="margin-top:10px">' +
        '<div class="row"><span>笔记</span><strong>' + counts.notes + '</strong></div>' +
        '<div class="row"><span>状态标记</span><strong>' + counts.status + '</strong></div>' +
        '<div class="row"><span>有条目的复盘记录</span><strong>' + counts.reviews + '</strong></div>' +
        '<div class="row"><span>自定义考点</span><strong>' + counts.customs + '</strong></div></div>' +
        '<p class="muted small" style="margin-top:10px">合并：以更新时间较新者为准，复盘日期取并集。覆盖：完全替换当前数据。两种方式都会先自动快照。</p>';
      modal('导入预览', body,
        '<button class="btn" data-close>取消</button>' +
        '<button class="btn" data-mode="merge">合并导入</button>' +
        '<button class="btn primary" data-mode="overwrite">覆盖导入</button>',
        function (root) {
          $$('[data-mode]', root).forEach(function (b) {
            b.addEventListener('click', function () {
              var mode = b.getAttribute('data-mode');
              S.takeSnapshot(user, '导入前自动快照');
              user = mode === 'merge' ? S.mergeUser(user, d) : S.overwriteUser(d);
              persist();
              buildItems();
              closeModal();
              boot(true);
              toast(mode === 'merge' ? '已合并导入' : '已覆盖导入');
            });
          });
        });
    };
    fr.readAsText(file, 'utf-8');
  }

  function confirmRestore(sid) {
    modal('恢复快照', '<div class="info-note">将用该快照覆盖当前笔记、状态、复盘与自定义条目。恢复前会先为当前状态再存一份快照。</div>',
      '<button class="btn" data-close>取消</button><button class="btn primary" data-do>确认恢复</button>',
      function (root) {
        root.querySelector('[data-do]').addEventListener('click', function () {
          var data = S.restoreSnapshot(sid);
          if (!data) { toast('快照已不存在'); closeModal(); return; }
          S.takeSnapshot(user, '恢复前自动快照');
          user = S.overwriteUser(data);
          persist(); buildItems(); closeModal(); boot(true);
          toast('已恢复到该快照');
        });
      });
  }

  function confirmWipe() {
    modal('清空本机数据', '<div class="danger-note">将删除本机保存的笔记、状态、复盘记录与自定义考点。教材内容不受影响。此操作不可撤销，建议先导出 JSON。</div>',
      '<button class="btn" data-close>取消</button><button class="btn danger" data-do>确认清空</button>',
      function (root) {
        root.querySelector('[data-do]').addEventListener('click', function () {
          S.takeSnapshot(user, '清空前自动快照');
          user = S.emptyUser();
          persist(); buildItems(); closeModal(); boot(true);
          toast('已清空，可在备份面板回滚');
        });
      });
  }

  /* ---------- 复盘 ---------- */
  function renderCalendar() {
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    var first = new Date(y, m, 1).getDay();
    var days = new Date(y, m + 1, 0).getDate();
    var marked = {};
    reviewDays().forEach(function (d) {
      if (d.slice(0, 7) === y + '-' + pad(m + 1)) marked[+d.slice(8, 10)] = 1;
    });
    var cells = ['日', '一', '二', '三', '四', '五', '六'].map(function (w) {
      return '<div class="cal-week">' + w + '</div>';
    }).join('');
    for (var i = 0; i < first; i++) cells += '<div class="cal-cell cal-empty"></div>';
    for (var d = 1; d <= days; d++) {
      var cls = 'cal-cell' + (marked[d] ? ' on' : '') + (d === now.getDate() ? ' today' : '');
      cells += '<div class="' + cls + '">' + d + '</div>';
    }
    return '<div class="cal">' + cells + '</div>';
  }

  function streak() {
    var days = reviewDays();
    if (!days.length) return 0;
    var set = {}; days.forEach(function (d) { set[d] = 1; });
    var cur = new Date();
    var n = 0;
    if (!set[dateStr(cur)]) cur.setDate(cur.getDate() - 1);
    while (set[dateStr(cur)]) { n++; cur.setDate(cur.getDate() - 1); }
    return n;
  }

  function openReview() {
    var ids = todayIds();
    var list = ids.length ? '<div class="list-mini">' + ids.slice(0, 30).map(function (id) {
      var it = byId(id);
      return '<div class="row"><span>' + R.esc(it.title) + '</span>' +
        '<button class="btn small" data-goto="' + R.esc(id) + '">查看</button></div>';
    }).join('') + '</div>' : '<p class="muted small">今天还没有复盘记录。在详情里点「标记今日复盘」即可。</p>';

    var body = '<div class="list-mini">' +
      '<div class="row"><span>累计复盘天数</span><strong>' + reviewDays().length + '</strong></div>' +
      '<div class="row"><span>连续复盘</span><strong>' + streak() + ' 天</strong></div>' +
      '<div class="row"><span>今日已复盘</span><strong>' + ids.length + ' 条</strong></div>' +
      '<div class="row"><span>今日待复盘</span><strong>' + dueIds().length + ' 条</strong></div></div>' +
      '<h4 style="margin:14px 0 4px">本月</h4>' + renderCalendar() +
      '<h4 style="margin:14px 0 7px">今天复盘了什么</h4>' + list;

    modal('复盘记录', body, '<button class="btn" data-close>关闭</button>', function (root) {
      $$('[data-goto]', root).forEach(function (b) {
        b.addEventListener('click', function () { closeModal(); select(b.getAttribute('data-goto'), { scrollCard: true, openMobile: true }); });
      });
    });
  }

  /* ---------- 自定义考点 ---------- */
  function openCustom() {
    var bookOpts = ZZ.books.map(function (b) {
      return '<option value="' + b.id + '">' + R.esc(b.name + ' ' + b.title) + '</option>';
    }).join('') + '<option value="custom">我的补充（不归属教材）</option>';

    var body = '<div class="form-grid">' +
      '<label class="form-field full"><span>标题（必填）</span><input id="cuTitle" maxlength="60" placeholder="例：人民代表大会与人民政协的区别"></label>' +
      '<label class="form-field full"><span>一句话结论（必填）</span><input id="cuSummary" maxlength="90" placeholder="把结论压到一句能背的话"></label>' +
      '<label class="form-field"><span>类型</span><select id="cuType">' +
        ['概念', '原理', '制度', '对比', '易错', '答题'].map(function (t) { return '<option>' + t + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="form-field"><span>难度</span><select id="cuDiff"><option value="1">Ⅰ 基础</option><option value="2" selected>Ⅱ 常考</option><option value="3">Ⅲ 难点</option></select></label>' +
      '<label class="form-field"><span>教材</span><select id="cuBook">' + bookOpts + '</select></label>' +
      '<label class="form-field"><span>课次</span><select id="cuLesson"></select></label>' +
      '<label class="form-field full"><span>要点（每行一条，必填）</span><textarea id="cuCore" placeholder="一行一个要点，最多 8 行"></textarea></label>' +
      '<label class="form-field full"><span>易错</span><input id="cuPitfall" maxlength="120"></label>' +
      '<label class="form-field full"><span>关键词（逗号分隔）</span><input id="cuTerms" maxlength="80"></label>' +
      '</div><div class="danger-note" id="cuErr" hidden></div>';

    modal('新增自定义考点', body, '<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存</button>', function (root) {
      var bookSel = root.querySelector('#cuBook');
      var lessonSel = root.querySelector('#cuLesson');
      function fillLessons() {
        var b = ZZ.books.filter(function (x) { return x.id === bookSel.value; })[0];
        if (!b) { lessonSel.innerHTML = '<option value="custom">自定义条目</option>'; lessonSel.disabled = true; return; }
        lessonSel.disabled = false;
        lessonSel.innerHTML = b.lessons.map(function (l) {
          return '<option value="' + l.id + '">' + R.esc(l.no + ' ' + l.title) + '</option>';
        }).join('');
      }
      bookSel.addEventListener('change', fillLessons);
      fillLessons();

      root.querySelector('[data-save]').addEventListener('click', function () {
        var title = root.querySelector('#cuTitle').value.trim();
        var summary = root.querySelector('#cuSummary').value.trim();
        var core = root.querySelector('#cuCore').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        var err = '';
        if (!title) err = '标题不能为空';
        else if (!summary) err = '结论不能为空';
        else if (!core.length) err = '至少写一条要点';
        var errBox = root.querySelector('#cuErr');
        if (err) { errBox.hidden = false; errBox.textContent = err; return; }

        var rec = {
          id: 'cu-' + Date.now().toString(36),
          title: title, summary: summary,
          type: root.querySelector('#cuType').value,
          diff: +root.querySelector('#cuDiff').value,
          core: core.slice(0, 8),
          pitfall: root.querySelector('#cuPitfall').value.trim(),
          exam: '', terms: root.querySelector('#cuTerms').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
          bookId: bookSel.value,
          lesson: lessonSel.value,
          createdAt: Date.now(), updatedAt: Date.now()
        };
        user.customs.push(rec);
        persist(); buildItems(); closeModal();
        boot(true);
        select(rec.id, { scrollCard: true });
        toast('已添加自定义考点');
      });
    });
  }

  function removeCustom(id) {
    modal('删除自定义考点', '<div class="danger-note">只删除你自建的这一条，不影响教材内容。</div>',
      '<button class="btn" data-close>取消</button><button class="btn danger" data-do>删除</button>',
      function (root) {
        root.querySelector('[data-do]').addEventListener('click', function () {
          user.customs = user.customs.filter(function (c) { return c.id !== id; });
          delete user.notes[id]; delete user.status[id]; delete user.reviews[id];
          persist(); buildItems(); closeModal();
          if (state.selectedId === id) { state.selectedId = ''; renderDetail(''); }
          boot(true); toast('已删除');
        });
      });
  }

  /* ---------- 帮助 ---------- */
  function openHelp() {
    var body = '' +
      '<div class="info-note">七本书 58 课，按教材顺序拆成考点卡。内容是归纳性表述，不标教材页码；没有把握的条目只写考点归纳。</div>' +
      '<h4 style="margin:14px 0 6px">键盘</h4>' +
      '<table class="shortcut-table">' +
      '<tr><td>搜索</td><td><kbd>/</kbd></td></tr>' +
      '<tr><td>下一条 / 上一条</td><td><kbd>J</kbd> / <kbd>K</kbd></td></tr>' +
      '<tr><td>打开独立详情页</td><td><kbd>Enter</kbd></td></tr>' +
      '<tr><td>关闭弹窗 / 清空搜索</td><td><kbd>Esc</kbd></td></tr>' +
      '</table>' +
      '<h4 style="margin:14px 0 6px">状态色</h4>' +
      '<div class="list-mini">' +
      '<div class="row"><span><span class="badge ok">已掌握</span> 松绿</span><span class="snap-meta">能复述并能做题</span></div>' +
      '<div class="row"><span><span class="badge warn">待复盘</span> 赭石</span><span class="snap-meta">有印象但不稳</span></div>' +
      '<div class="row"><span><span class="badge today">今日已复盘</span> 青蓝</span><span class="snap-meta">今天过了一遍</span></div>' +
      '<div class="row"><span><span class="badge">未标记</span> 灰</span><span class="snap-meta">还没判断</span></div>' +
      '</div>' +
      '<h4 style="margin:14px 0 6px">数据</h4>' +
      '<p class="muted small">笔记、状态、复盘、自定义条目存在浏览器 localStorage，与教材内容完全分离。备份面板可导出 JSON / CSV / Markdown，导入前自动快照，可回滚。</p>';

    modal('使用说明', body, '<button class="btn" data-close>关闭</button>');
  }

  /* ---------- 移动端 ---------- */
  function openPane(which) {
    var left = $('#leftPane'), right = $('#rightPane'), scrim = $('#drawerScrim');
    if (!isMobile()) return;
    if (which === 'tree') { left.classList.add('open'); right.classList.remove('open'); setTab('tree'); scrim.hidden = false; }
    if (which === 'detail') { right.classList.add('open'); left.classList.remove('open'); setTab('detail'); scrim.hidden = false; }
  }
  function closePanes() {
    $('#leftPane').classList.remove('open');
    $('#rightPane').classList.remove('open');
    $('#drawerScrim').hidden = true;
  }
  function setTab(name) {
    $$('.mobile-tabs button').forEach(function (b) {
      var on = b.getAttribute('data-tab') === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  /* ---------- 主题 ---------- */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('zz.theme', t); } catch (e) { }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0d1518' : '#f4f1ea');
    var btn = $('#themeToggle');
    if (btn) btn.setAttribute('title', t === 'dark' ? '切换到浅色' : '切换到深色');
  }

  /* ---------- 事件绑定 ---------- */
  function bindOnce() {
    var qTimer = null;
    $('#searchInput').addEventListener('input', function (e) {
      var v = e.target.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(function () { onSearch(v); }, 110);
    });
    $('#searchClear').addEventListener('click', function () {
      $('#searchInput').value = ''; onSearch(''); $('#searchInput').focus();
    });

    $('#filterType').addEventListener('change', function (e) { state.type = e.target.value; renderList(true); });
    $('#filterDiff').addEventListener('change', function (e) { state.diff = +e.target.value; renderList(true); });
    $('#filterStatus').addEventListener('change', function (e) { state.status = e.target.value; renderList(true); });
    $('#filterReset').addEventListener('click', function () {
      state.type = 'all'; state.diff = 0; state.status = 'all'; state.dueOnly = false;
      $('#filterType').value = 'all'; $('#filterDiff').value = '0'; $('#filterStatus').value = 'all';
      renderList(true); renderTree();
    });

    $('#sortSelect').addEventListener('change', function (e) { state.sort = e.target.value; renderList(true); });
    $('#viewToggle').addEventListener('click', function () {
      state.dueOnly = false;
      $('#searchInput').value = ''; state.q = '';
      state.scope = { kind: 'all', bookId: '', lesson: '' };
      $('#filterStatus').value = 'all'; state.status = 'all';
      renderTree(); renderList(true);
    });

    $('#viewBar').addEventListener('click', function (e) {
      var b = e.target.closest('[data-view]');
      if (b) switchView(b.getAttribute('data-view'));
    });

    $('#matrixView').addEventListener('click', function (e) {
      var c = e.target.closest('[data-subject]');
      if (c) selectSubject(c.getAttribute('data-subject'), { openMobile: true });
    });
    $('#pairsView').addEventListener('click', function (e) {
      var c = e.target.closest('[data-pair]');
      if (c) selectPair(c.getAttribute('data-pair'), { openMobile: true });
    });
    ['matrixView', 'pairsView'].forEach(function (id) {
      $('#' + id).addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var card = e.target.closest('[data-subject],[data-pair]');
        if (!card) return;
        e.preventDefault();
        if (card.hasAttribute('data-subject')) selectSubject(card.getAttribute('data-subject'), { openMobile: true });
        else selectPair(card.getAttribute('data-pair'), { openMobile: true });
      });
    });

    $('#detailBody').addEventListener('click', function (e) {
      var b = e.target.closest('[data-goto-item]');
      if (b) openItem(b.getAttribute('data-goto-item'));
    });

    $('#themeToggle').addEventListener('click', function () {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });

    $('#dueBtn').addEventListener('click', function () {
      state.dueOnly = !state.dueOnly;
      state.q = ''; $('#searchInput').value = '';
      if (state.dueOnly && state.view !== 'cards') switchView('cards', { silent: true });
      renderTree(); renderList(true);
      if (state.dueOnly) toast('只看待复盘：' + dueIds().length + ' 条');
    });

    $('#backupBtn').addEventListener('click', openBackup);
    $('#helpBtn').addEventListener('click', openHelp);
    $('#reviewBtn').addEventListener('click', openReview);
    $('#customBtn').addEventListener('click', openCustom);
    $('#closeDetail').addEventListener('click', function () { closePanes(); setTab('list'); });
    $('#drawerScrim').addEventListener('click', function () { closePanes(); setTab('list'); });

    $('#collapseAll').addEventListener('click', function () {
      var exp = (user.config.expanded = user.config.expanded || {});
      var anyOpen = ZZ.books.some(function (b) { return exp[b.id] !== false; });
      ZZ.books.forEach(function (b) { exp[b.id] = !anyOpen; });
      persist(); renderTree();
      $('#collapseAll').textContent = anyOpen ? '展开全部' : '收起全部';
    });

    $('#tree').addEventListener('click', function (e) {
      if (state.view === 'matrix') {
        var d = e.target.closest('[data-dim]');
        if (!d) return;
        state.mxDim = d.getAttribute('data-dim');
        renderOtherIndex(); renderMatrix(true); setViewUrl();
        if (isMobile()) { closePanes(); setTab('list'); }
        return;
      }
      if (state.view === 'pairs') {
        var p = e.target.closest('[data-pair]');
        if (!p) return;
        selectPair(p.getAttribute('data-pair'), { openMobile: false });
        if (isMobile()) { closePanes(); setTab('list'); }
        return;
      }
      var root = e.target.closest('.tree-lesson.root');
      if (root) { setScopeAll(); return; }
      var bookBtn = e.target.closest('.tree-toggle');
      if (bookBtn) {
        var bid = bookBtn.getAttribute('data-book');
        var exp = (user.config.expanded = user.config.expanded || {});
        var isOpen = bookBtn.getAttribute('aria-expanded') === 'true';
        if (state.scope.kind === 'book' && state.scope.bookId === bid && isOpen) {
          exp[bid] = false; persist(); renderTree(); return;
        }
        exp[bid] = true;
        state.scope = { kind: 'book', bookId: bid, lesson: '' };
        state.dueOnly = false;
        persist(); renderTree(); renderList(true);
        if (isMobile()) { closePanes(); setTab('list'); }
        return;
      }
      var les = e.target.closest('.tree-lesson[data-lesson]');
      if (les) {
        state.scope = { kind: 'lesson', bookId: '', lesson: les.getAttribute('data-lesson') };
        state.dueOnly = false;
        renderTree(); renderList(true);
        if (isMobile()) { closePanes(); setTab('list'); }
      }
    });

    $('#listCanvas').addEventListener('click', function (e) {
      var link = e.target.closest('a.cd-link');
      if (link) return;
      var card = e.target.closest('.k-card');
      if (!card) return;
      select(card.getAttribute('data-id'), { scrollCard: false, openMobile: true });
    });

    $('#emptyState').addEventListener('click', function (e) {
      var g = e.target.closest('[data-goto]');
      var l = e.target.closest('[data-goto-lesson]');
      if (g) { state.q = ''; $('#searchInput').value = ''; renderList(true); select(g.getAttribute('data-goto'), { openMobile: true }); }
      if (l) {
        state.q = ''; $('#searchInput').value = '';
        state.scope = { kind: 'lesson', bookId: '', lesson: l.getAttribute('data-goto-lesson') };
        renderTree(); renderList(true);
      }
    });

    $$('.mobile-tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        var tab = b.getAttribute('data-tab');
        if (tab === 'tree') openPane('tree');
        else if (tab === 'detail') {
          if (state.selectedId) openPane('detail');
          else { closePanes(); setTab('list'); toast('先在列表里选一条考点'); }
        } else { closePanes(); setTab('list'); }
      });
    });

    window.addEventListener('resize', function () {
      if (!isMobile()) { closePanes(); setTab('list'); }
    });
  }

  function setScopeAll() {
    state.scope = { kind: 'all', bookId: '', lesson: '' };
    state.dueOnly = false;
    state.q = ''; $('#searchInput').value = '';
    renderTree(); renderList(true);
  }

  function onSearch(v) {
    state.q = v;
    if (v.trim()) {
      state.dueOnly = false;
      if (state.view !== 'cards') switchView('cards', { silent: true });
    }
    renderList(true);
  }

  /* ---------- 启动 ---------- */
  function boot(rebuild) {
    if (rebuild) {
      renderStats(); renderTree(); renderList(true);
      if (state.selectedId && byId(state.selectedId)) renderDetail(state.selectedId);
      else { $('#detailBody').hidden = true; $('#detailEmpty').hidden = false; }
    }
  }

  function init() {
    buildMetaMaps();
    buildItems();

    var snaps = S.listSnapshots();
    var newest = snaps[0];
    if (!newest || dateStr(new Date(newest.at)) !== TODAY) {
      S.takeSnapshot(user, '每日自动快照');
    }

    applyTheme(document.documentElement.dataset.theme || 'light');
    bindOnce();

    var anyOpen = ZZ.books.some(function (b) { return (user.config.expanded || {})[b.id] !== false; });
    $('#collapseAll').textContent = anyOpen ? '收起全部' : '展开全部';

    renderStats(); renderTree(); renderList(true);
    $('#detailBody').hidden = true; $('#detailEmpty').hidden = false;

    var params = new URLSearchParams(location.search);
    var vp = params.get('view');
    if (vp === 'matrix' && mx) {
      var dim = params.get('dim');
      if (dim && mx.dims.some(function (d) { return d.key === dim; })) state.mxDim = dim;
      var ms = params.get('s');
      state.matrixId = (ms && mx.subjects.some(function (x) { return x.id === ms; })) ? ms : mx.subjects[0].id;
      switchView('matrix', { silent: true });
    } else if (vp === 'pairs' && prs) {
      var ps = params.get('p');
      state.pairId = (ps && prs.some(function (x) { return x.id === ps; })) ? ps : prs[0].id;
      switchView('pairs', { silent: true });
    }
    var id = params.get('id');
    if (id && byId(id)) {
      select(id, { openMobile: false });
      var card = $('#listCanvas .k-card[data-id="' + id + '"]');
      if (card) card.scrollIntoView({ block: 'center' });
    } else {
      var lid = params.get('lesson');
      if (lid && lessonMeta[lid]) {
        state.scope = { kind: 'lesson', bookId: '', lesson: lid };
        renderTree(); renderList(true);
        if (visible.length) select(visible[0].id, { openMobile: false });
      }
    }

    if (state.view === 'cards' && !state.selectedId && visible.length) {
      select(visible[0].id, { openMobile: false });
    }
    if (isMobile()) { setTab('list'); closePanes(); }

    // 自测钩子
    window.__POLITICS_SELFTEST__ = {
      version: 'politics-hub/v1',
      today: TODAY,
      itemsCount: function () { return items.length; },
      lessonsCount: function () { return Object.keys(lessonMeta).length; },
      booksCount: function () { return ZZ.books.length; },
      resultCount: function () { return visible.length; },
      selected: function () { return state.selectedId; },
      counts: function () {
        return { total: items.length, mastered: masteredIds().length, due: dueIds().length, today: todayIds().length };
      },
      state: state,
      user: function () { return user; },
      select: select,
      setStatus: setStatus,
      toggleToday: toggleToday,
      saveNote: saveNote,
      setQuery: function (q) { $('#searchInput').value = q; onSearch(q); },
      view: function () { return state.view; },
      switchView: switchView,
      matrixCount: function () { return mx ? mx.subjects.length : 0; },
      pairsCount: function () { return prs ? prs.length : 0; },
      selectSubject: selectSubject,
      selectPair: selectPair,
      matrixId: function () { return state.matrixId; },
      pairId: function () { return state.pairId; },
      mxDim: function () { return state.mxDim; },
      setDim: function (k) { state.mxDim = k; renderOtherIndex(); renderMatrix(true); setViewUrl(); }
    };
  }

  init();
})();
