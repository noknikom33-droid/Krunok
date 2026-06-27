/* ============================================================================
   Service Worker — ห้องเรียนออนไลน์ (PWA)
   หน้าที่: ทำให้ติดตั้งเป็นแอปได้ และเปิดใช้แบบออฟไลน์เบื้องต้น
   กลยุทธ์: "เครือข่ายก่อน" (network-first) สำหรับไฟล์เว็บของเราเอง
            -> ออนไลน์ = ได้ของใหม่เสมอ (ไม่ค้างเวอร์ชันเก่า)
            -> ออฟไลน์ = ใช้สำเนาที่แคชไว้
   หมายเหตุ: คำขอไปยัง Apps Script / YouTube / รูปจาก Google (คนละโดเมน)
            จะปล่อยผ่าน ไม่ยุ่ง/ไม่แคช
   ★ ทุกครั้งที่อยากบังคับให้แอปอัปเดตแน่ ๆ ให้เปลี่ยนเลข CACHE_VERSION
   ============================================================================ */

const CACHE_VERSION = 'v19';
const CACHE_NAME = 'hongrian-' + CACHE_VERSION;

// ไฟล์หลักของแอป (app shell) ที่เก็บไว้ให้เปิดออฟไลน์ได้
const SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// ติดตั้ง: ดาวน์โหลดไฟล์หลักเก็บไว้
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL).catch(() => {}))   // กันพังถ้าบางไฟล์โหลดไม่ได้
      .then(() => self.skipWaiting())
  );
});

// เปิดใช้งาน: ลบแคชเวอร์ชันเก่าทิ้ง
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // สนใจเฉพาะ GET และไฟล์ที่อยู่โดเมนเดียวกับเว็บเท่านั้น
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // ปล่อยผ่าน Apps Script/YouTube/Google CDN

  // network-first: ลองโหลดจากเน็ตก่อน สำเร็จก็อัปเดตแคช, ล้มเหลวค่อยใช้แคช
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true })       // ignoreSearch: ข้าม ?v=... ตอนเทียบ
          .then((hit) => hit || caches.match('./index.html'))   // เผื่อหน้าใหม่ -> คืนหน้าหลักที่แคชไว้
      )
  );
});
