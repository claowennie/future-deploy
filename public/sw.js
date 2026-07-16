// future · 个人成长规划 — service worker
// 策略：
//   · 页面导航（HTML）→ 网络优先，离线时退回缓存的 index.html —— 部署新版后
//     刷新一定拿到新的 hashed bundle 文件名，不会被旧壳卡住；
//   · 其余同源 GET（JS/CSS/字体/图片/环境音）→ stale-while-revalidate：先回缓存
//     秒开，后台再更新 —— Vite 的 hashed 文件名天然不会脏，public/assets 下
//     无哈希的文件（树 PNG、mp3）最多旧一次刷新；
//   · /api/（Melo 中枢）、跨域（Supabase 等）、非 GET → 不碰。
// 改 VERSION 可整体作废旧缓存（一般不需要：壳是网络优先，资源带哈希）。
const VERSION = 'v1';
const CACHE = `future-${VERSION}`;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest'])).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 收到服务端推送（Web Push）：弹通知。payload = JSON { title, body, tag, url }。
// app 完全关闭时也会触发 —— 这正是它相对本地通知的意义。解析失败就退回纯文本。
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch { d = { body: (e.data && e.data.text()) || '' }; }
  const title = d.title || 'future';
  const options = {
    body: d.body || '',
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/icon-192.png',
    tag: d.tag || 'future-push',
    data: { url: d.url || './' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// 点击通知：聚焦已开着的标签页（若带了 url 就导航过去），没有就开一个。
// 本地通知（notify.js 经 registration.showNotification 发的）和 Web Push 共用这个处理。
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        if (url && url !== './' && 'navigate' in c) { try { await c.navigate(url); } catch { /* ignore */ } }
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
    return undefined;
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;       // Supabase / Sentry 等第三方不缓存
  if (url.pathname.startsWith('/api/')) return;     // Melo 中枢接口永远走网络

  // 导航请求：网络优先，离线退回缓存的应用壳
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const c = await caches.open(CACHE);
          c.put('./', res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match('./');
        return cached || Response.error();
      }
    })());
    return;
  }

  // 静态资源：stale-while-revalidate
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const refresh = fetch(req).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => null);
    if (cached) return cached;
    const res = await refresh;
    return res || Response.error();
  })());
});
