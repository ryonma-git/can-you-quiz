// 通信が切れても再読み込みできるように、画面のファイルを端末に保存しておく。
// いつもは最新のファイルを取りに行き（ネット優先）、つながらないときだけ保存分を使う。
var CACHE = "sensei-kuji-v1";
var FILES = ["./", "index.html", "style.css", "config.js", "lottery.js", "app.js"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.indexOf("/data/") !== -1) return; // 先生データは保存しない
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});
