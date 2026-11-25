/* ============================================================
   detail.js —— 独立详情页：?id= 直达，可单独分享
   ============================================================ */
(function () {
  var ZZ = window.ZZ, S = window.ZZStore, R = window.ZZRender;
  if (!ZZ || !S || !R) { console.error('依赖脚本未加载'); return; }

  var pad = function (n) { return String(n).padStart(2, '0'); };
  var dateStr = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var TODAY = dateStr(new Date());
  window.__ZZ_TODAY__ = TODAY;

  var user = S.loadUser();
  var items = ZZ.items.slice();
  var lessonMeta = {};

  ZZ.books.forEach(function (b) {
    b.lessons.forEach(function (l) {
      var unit = null;
      (b.units || []).forEach(function (u) { if (u.lessons.indexOf(l.id) >= 0) unit = u; });
      lessonMeta[l.id] = { bookName: b.name, bookTitle: b.title, unitNo: unit ? unit.no : '', unitTitle: unit ? unit.title : '' };
    });
  });

  (user.customs || []).forEach(function (c) {
    var bm = ZZ.books.filter(function (b) { return b.id === c.bookId; })[0];
    items.push({
      id: c.id, title: c.title, summary: c.summary, type: c.type, diff: c.diff,
      core: c.core, pitfall: c.pitfall, exam: c.exam, terms: c.terms,
      bookId: c.bookId, bookName: bm ? bm.name : '我的补充', bookTitle: bm ? bm.title : '自建',
      lesson: c.lesson, lessonNo: '', lessonTitle: '自定义条目', custom: true
    });
  });

  var id = new URLSearchParams(location.search).get('id') || '';
  var item = items.filter(function (x) { return x.id === id; })[0] || null;
  var body = document.getElementById('detailBody');
  var missing = document.getElementById('detailMissing');

  function find(id) { return items.filter(function (x) { return x.id === id; })[0] || null; }

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el.__t);
    el.__t = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  function render() {
    if (!item) {
      body.hidden = true; missing.hidden = false;
      document.title = '未找到考点 · 政治知识库';
      return;
    }
    body.hidden = false; missing.hidden = true;
    var related = items.filter(function (x) { return x.lesson === item.lesson && x.id !== item.id; }).slice(0, 8);
    var lv = (window.ZZViews && window.ZZViews.lessons) || [];
    var lm = null;
    for (var i = 0; i < lv.length; i++) if (lv[i].lesson === item.lesson) { lm = lv[i]; break; }
    body.innerHTML = R.detailHTML(item, user, { today: TODAY, standalone: true, related: related, lessonMap: lm });

    R.bindDetail(body, item, {
      setStatus: function (s) { applyStatus(s); },
      toggleToday: function (on) { applyToday(on); },
      saveNote: function (text) { saveNote(text); },
      openRelated: function (rid) { location.href = 'detail.html?id=' + encodeURIComponent(rid); },
      removeCustom: function () { toast('自定义条目请在主站的备份面板管理'); },
      toast: toast
    });

    document.title = item.title + ' · 政治知识库';
  }

  function applyStatus(s) {
    if (!s) delete user.status[item.id];
    else user.status[item.id] = { state: s, updatedAt: Date.now() };
    S.saveUser(user);
    render();
    toast(s ? (s === 'mastered' ? '已标记为已掌握' : '已标记为待复盘') : '已清除状态');
  }

  function applyToday(on) {
    var arr = (user.reviews[item.id] || []).slice();
    var i = arr.indexOf(TODAY);
    if (on && i < 0) arr.push(TODAY);
    if (!on && i >= 0) arr.splice(i, 1);
    arr.sort();
    if (arr.length) user.reviews[item.id] = arr; else delete user.reviews[item.id];
    S.saveUser(user);
    render();
    toast(on ? '已记入今日复盘' : '已取消今日复盘');
  }

  function saveNote(text) {
    if (!String(text || '').trim()) delete user.notes[item.id];
    else user.notes[item.id] = { text: text, updatedAt: Date.now() };
    S.saveUser(user);
  }

  var btn = document.getElementById('themeToggle');
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('zz.theme', t); } catch (e) { }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0d1518' : '#f4f1ea');
  }
  applyTheme(document.documentElement.dataset.theme || 'light');
  if (btn) btn.addEventListener('click', function () {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      location.href = 'index.html' + (item ? '?id=' + encodeURIComponent(item.id) : '');
    }
  });

  var up = document.getElementById('pageUpdated');
  if (up) up.textContent = '内容更新：' + (ZZ.meta && ZZ.meta.updated ? ZZ.meta.updated : TODAY);

  render();

  window.__DETAIL_SELFTEST__ = {
    id: id,
    found: !!item,
    title: item ? item.title : '',
    today: TODAY,
    user: function () { return user; }
  };
})();
