/* ============================================================
   sw.js —— 离线缓存（纯静态，无后端）
   导航请求：网络优先，失败回退缓存（index / detail 均支持带参数）
   静态资源：缓存优先，后台更新
   ============================================================ */
var CACHE = 'zz-static-v7';
var ASSETS = [
  './',
  'index.html',
  'detail.html',
  'assets/css/site.css',
  'assets/js/store.js',
  'assets/js/render.js',
  'assets/js/app.js',
  'assets/js/detail.js',
  'data/content.js',
  'data/views.js',
  'data/matrix.json',
  'data/pairs.json',
  'data/meta.json',
  'data/b1.json',
  'data/b2.json',
  'data/b3.json',
  'data/b4.json',
  'data/x1.json',
  'data/x2.json',
  'data/x3.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () { /* 单个失败不阻塞安装 */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：网络优先，断网回退
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          if (hit) return hit;
          var page = url.pathname.indexOf('detail') >= 0 ? 'detail.html' : 'index.html';
          return caches.match(page, { ignoreSearch: true }).then(function (p) {
            return p || caches.match('./');
          });
        });
      })
    );
    return;
  }

  // 静态资源：缓存优先 + 后台更新
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) {
        fetch(req).then(function (res) {
          if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res); });
        }).catch(function () { });
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
