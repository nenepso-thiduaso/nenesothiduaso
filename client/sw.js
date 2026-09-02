// Service Worker — giúp cài đặt ứng dụng (PWA) và mở nhanh giao diện kể cả mạng chập chờn.
// LƯU Ý QUAN TRỌNG: dữ liệu (điểm, ghi nhận...) KHÔNG được cache ở đây — luôn lấy trực tiếp
// từ máy chủ để đảm bảo mọi người luôn thấy số liệu mới nhất, tránh hiển thị dữ liệu cũ/sai.

const CACHE_NAME = 'nenepso-shell-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // KHÔNG can thiệp vào các lời gọi API — luôn để trình duyệt gọi thẳng máy chủ,
  // nếu mất mạng thì để lỗi tự nhiên xảy ra (app.js sẽ hiển thị thông báo phù hợp).
  if (url.pathname.startsWith('/api/')) {
    return; // để mặc định trình duyệt xử lý, không gọi event.respondWith()
  }

  // Với giao diện (HTML/CSS/JS/icon): ưu tiên cache để mở nhanh, đồng thời âm thầm
  // tải bản mới từ mạng để cập nhật cache cho lần sau (stale-while-revalidate).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // mất mạng -> dùng bản đã cache nếu có
      return cached || networkFetch;
    })
  );
});
