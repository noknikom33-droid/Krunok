/* ============================================================================
   ห้องเรียนออนไลน์ — script.js
   สมองของเว็บ: ดึงข้อมูลจาก Code.gs มาแสดง, จัดการเข้าสู่ระบบครู,
   และเพิ่ม/แก้ไข/ลบ ทุกอย่างผ่านหน้าเว็บ
   ============================================================================ */

/* ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
   ★  สำคัญ: นำ "Web app URL" ที่ได้จากการ Deploy Code.gs (ลงท้าย /exec)        ★
   ★  มาวางแทนที่ค่าด้านล่างนี้                                                  ★
   ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★ */
const API_URL = 'https://script.google.com/macros/s/AKfycbzGmcCrs06fIBNyR1onhuLFmSRa9hDKq2CH-hxZV7sgGB2AJaTl2BFtOikES49oayOh/exec';


/* ============================================================================
   1) สถานะของแอป (เก็บข้อมูลที่โหลดมาแล้ว เพื่อไม่ต้องโหลดซ้ำบ่อยๆ)
   ============================================================================ */
const state = {
  settings: {},
  subjects: [],
  announcements: [],  // ประชาสัมพันธ์
  stats: null,        // สถิติสรุปหน้าแรก
  recentWorks: [],    // ผลงานนักเรียนล่าสุด
  lessonsCache: {},   // เก็บบทเรียนแยกตาม subject_id
  worksCache: {},     // เก็บผลงานแยกตาม lesson_id
  token: sessionStorage.getItem('cr_token') || null,
  user:  sessionStorage.getItem('cr_user')  || null
};

/* ============================================================================
   2) ตัวช่วยเล็กๆ
   ============================================================================ */
const $  = (sel) => document.querySelector(sel);
const app = $('#app');

// --- ตัวเชื่อมกับ "หน้าจอกำลังโหลด" ใน index.html (window.AppLoader) ---
// เรียกได้อย่างปลอดภัย แม้หน้าจอโหลดจะปิดไปแล้ว (จะกลายเป็นไม่ทำอะไร)
function loaderSet(p)  { try { if (window.AppLoader && window.AppLoader.set)    window.AppLoader.set(p); } catch (e) {} }
function loaderDone()  { try { if (window.AppLoader && window.AppLoader.finish) window.AppLoader.finish(); } catch (e) {} }

// --- ตัวช่วยจำ "ตัวตนนักเรียน" และ "บทที่ดูจบแล้ว" ไว้ในเครื่อง (localStorage) ---
// (ใช้เพื่อความสะดวก ไม่ต้องพิมพ์ชื่อซ้ำ และจำว่าดูบทไหนจบไปแล้ว)
function getStudentInfo() {
  try { return JSON.parse(localStorage.getItem('cr_student') || '{}'); } catch (e) { return {}; }
}
function saveStudentInfo(info) {
  try { localStorage.setItem('cr_student', JSON.stringify(info || {})); } catch (e) {}
}
function getCompletedLessons() {
  try { return JSON.parse(localStorage.getItem('cr_completed') || '[]'); } catch (e) { return []; }
}
function markCompleted(lessonId) {
  const arr = getCompletedLessons();
  if (!arr.includes(lessonId)) { arr.push(lessonId); try { localStorage.setItem('cr_completed', JSON.stringify(arr)); } catch (e) {} }
}
function isCompleted(lessonId) { return getCompletedLessons().includes(lessonId); }

// ป้องกันโค้ดอันตรายจากข้อความ (escape) ก่อนเอาไปแสดง
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// แปลงลิงก์รูปจาก Google Drive ให้เป็นลิงก์ที่แสดงในแท็ก <img> ได้
function imgUrl(u) {
  if (!u) return '';
  u = String(u).trim();
  let m = u.match(/\/file\/d\/([^/]+)/) || u.match(/[?&]id=([^&]+)/);
  if (m && m[1]) return 'https://lh3.googleusercontent.com/d/' + m[1];
  return u;
}

// แปลงสี hex -> rgba (ใช้ทำ overlay โปร่งแสงบน hero)
function hexToRgba(hex, alpha) {
  hex = String(hex || '#4f8cff').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// เรียงข้อมูลตามคอลัมน์ order (น้อยไปมาก)
function byOrder(a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); }

// แปลงวันที่ให้เป็นภาษาไทย เช่น "วันจันทร์ที่ 22 มิถุนายน 2569"
// รองรับทั้งข้อความ ISO (2026-06-21T17:00:00.000Z), "2026-06-22" หรือออบเจกต์ Date
function formatThaiDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);   // ถ้าไม่ใช่วันที่ ให้แสดงตามเดิม
  try {
    const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    // ดึงวัน/เดือน/ปี/วันในสัปดาห์ ตามเวลาประเทศไทย (กันวันคลาดเคลื่อนจาก timezone)
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
    const get = (t) => { const p = parts.find(x => x.type === t); return p ? p.value : ''; };
    const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')] || 0;
    const day = parseInt(get('day'), 10);
    const month = parseInt(get('month'), 10) - 1;
    const year = parseInt(get('year'), 10) + 543;   // แปลงเป็น พ.ศ.
    return 'วัน' + days[wd] + 'ที่ ' + day + ' ' + months[month] + ' ' + year;
  } catch (e) { return String(val); }
}

// แปลงค่าวันที่ให้อยู่ในรูป yyyy-MM-dd สำหรับช่อง <input type="date">
function toDateInputValue(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val).slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = (t) => parts.find(x => x.type === t).value;
    return get('year') + '-' + get('month') + '-' + get('day');
  } catch (e) { return String(val).slice(0, 10); }
}

const isTeacher = () => !!state.token;

// ดึงรหัสวิดีโอ (11 ตัวอักษร) จากลิงก์ YouTube หลายรูปแบบ
// รองรับ: youtube.com/watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID, /live/ID
// คืน null ถ้าไม่ใช่ลิงก์ YouTube
function youtubeId(url) {
  if (!url) return null;
  const u = String(url).trim();
  let m;
  if ((m = u.match(/[?&]v=([A-Za-z0-9_-]{11})/))) return m[1];
  if ((m = u.match(/youtu\.be\/([A-Za-z0-9_-]{11})/))) return m[1];
  if ((m = u.match(/\/embed\/([A-Za-z0-9_-]{11})/))) return m[1];
  if ((m = u.match(/\/shorts\/([A-Za-z0-9_-]{11})/))) return m[1];
  if ((m = u.match(/\/live\/([A-Za-z0-9_-]{11})/))) return m[1];
  return null;
}

// คืน URL สำหรับฝัง (embed) — ใช้ในกรณีที่ฝังแบบ iframe ธรรมดา (ครูพรีวิว ฯลฯ)
function youtubeEmbedUrl(url) {
  const id = youtubeId(url);
  return id ? 'https://www.youtube.com/embed/' + id : null;
}

// อ่าน "เกณฑ์การดูจบ" (%) จากการตั้งค่า — จำกัด 50–100 ค่าเริ่มต้น 90
function watchThreshold() {
  const v = Number(state.settings.register_complete_pct);
  return (isFinite(v) && v > 0) ? Math.max(50, Math.min(100, Math.round(v))) : 90;
}

// โหลดสคริปต์ YouTube IFrame API ครั้งเดียว แล้วคืน Promise เมื่อพร้อมใช้งาน
let _ytApiPromise = null;
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (_ytApiPromise) return _ytApiPromise;
  _ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') { try { prev(); } catch (e) {} } resolve(); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return _ytApiPromise;
}

/* ============================================================================
   3) ติดต่อ API (Code.gs)
   - อ่านข้อมูลใช้ GET
   - เขียน/แก้/ลบใช้ POST (ส่งเป็น text/plain เพื่อเลี่ยงปัญหา CORS)
   ============================================================================ */
async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data.data;
}

async function apiPost(action, payload = {}) {
  const body = JSON.stringify(Object.assign({ action, token: state.token }, payload));
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // สำคัญ! เลี่ยง preflight/CORS
    body
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data.data;
}

/* ============================================================================
   4) Toast แจ้งเตือน
   ============================================================================ */
function toast(msg, type = '') {
  const wrap = $('#toastWrap');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

/* ============================================================================
   5) Modal (กล่องฟอร์มลอย)
   ============================================================================ */
function openModal(title, bodyHtml) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalOverlay').hidden = false;
}
function closeModal() { $('#modalOverlay').hidden = true; $('#modalBody').innerHTML = ''; }

$('#modalClose').addEventListener('click', closeModal);
$('#modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ============================================================================
   6) ธีมสี + ข้อความ จาก Settings
   ============================================================================ */
function applyTheme() {
  const s = state.settings || {};
  const root = document.documentElement;
  if (s.primary_color) root.style.setProperty('--primary', s.primary_color);
  if (s.accent_color)  root.style.setProperty('--accent',  s.accent_color);
  if (s.primary_color) root.style.setProperty('--primary-soft', hexToRgba(s.primary_color, .12));

  $('#brandName').textContent = s.site_title || 'ห้องเรียนออนไลน์';
  document.title = s.site_title || 'ห้องเรียนออนไลน์';
  $('#footerText').textContent = s.footer_text || '';

  // อัปเดตชื่อบนหน้าจอกำลังโหลด (ถ้ายังเปิดอยู่) ให้ตรงกับชื่อเว็บจริง
  const ldb = document.getElementById('ldBrand');
  if (ldb && s.site_title) ldb.textContent = s.site_title;
}

/* ============================================================================
   7) ระบบเข้าสู่ระบบครู
   ============================================================================ */
function applyAuthUI() {
  document.body.classList.toggle('is-teacher', isTeacher());
}

function openLogin() {
  openModal('เข้าสู่ระบบครู', `
    <form id="loginForm" novalidate>
      <div class="field" id="f-user">
        <label>ชื่อผู้ใช้ <span class="req">*</span></label>
        <input name="username" autocomplete="username" placeholder="เช่น teacher" />
        <div class="err">กรุณากรอกชื่อผู้ใช้</div>
      </div>
      <div class="field" id="f-pass">
        <label>รหัสผ่าน <span class="req">*</span></label>
        <input name="password" type="password" autocomplete="current-password" placeholder="••••••" />
        <div class="err">กรุณากรอกรหัสผ่าน</div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" id="loginCancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">เข้าสู่ระบบ</button>
      </div>
    </form>
  `);
  $('#loginCancel').onclick = closeModal;
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const u = f.elements.username.value.trim(), p = f.elements.password.value.trim();
    let ok = true;
    $('#f-user').classList.toggle('invalid', !u); if (!u) ok = false;
    $('#f-pass').classList.toggle('invalid', !p); if (!p) ok = false;
    if (!ok) return;

    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';
    try {
      const res = await apiPost('login', { username: u, password: p });
      state.token = res.token; state.user = res.user;
      sessionStorage.setItem('cr_token', res.token);
      sessionStorage.setItem('cr_user', res.user);
      applyAuthUI();
      closeModal();
      toast('เข้าสู่ระบบสำเร็จ ยินดีต้อนรับครู ' + esc(res.user), 'success');
      router(); // วาดหน้าใหม่ให้เห็นปุ่มแก้ไข
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
    }
  });
}

function logout() {
  state.token = null; state.user = null;
  sessionStorage.removeItem('cr_token'); sessionStorage.removeItem('cr_user');
  applyAuthUI();
  toast('ออกจากระบบแล้ว');
  router();
}

$('#btnLogin').onclick = openLogin;
$('#btnLogout').onclick = logout;
$('#btnSettings').onclick = () => { location.hash = 'view=settings'; };
$('#btnMe').onclick = () => { location.hash = 'view=me'; };
$('#brandLink').onclick = (e) => { e.preventDefault(); location.hash = ''; };

/* ============================================================================
   8) มุมมองสถานะ (โหลด / ว่าง / ผิดพลาด)
   ============================================================================ */
function viewSkeleton() {
  let cards = '';
  for (let i = 0; i < 8; i++) cards += `<div class="skeleton"><div class="sk-cover"></div><div class="sk-line"></div><div class="sk-line short"></div></div>`;
  return `<div class="skeleton-grid">${cards}</div>`;
}
function viewEmpty(emoji, title, sub) {
  return `<div class="state"><div class="emoji">${emoji}</div><h3>${esc(title)}</h3><p>${esc(sub || '')}</p></div>`;
}
function viewError(msg) {
  return `<div class="state"><div class="emoji">😟</div><h3>โหลดข้อมูลไม่สำเร็จ</h3>
    <p>${esc(msg)}</p>
    <p style="margin-top:8px">ลองตรวจว่าตั้งค่า <b>API_URL</b> ใน script.js ถูกต้อง และ Deploy Code.gs แบบ "Anyone" แล้ว</p>
    <button class="btn btn-primary" style="margin-top:14px" onclick="router()">ลองใหม่อีกครั้ง</button></div>`;
}

/* ============================================================================
   9) เราเตอร์ — ดูค่าใน URL (#) แล้วเลือกหน้าที่จะแสดง
   ============================================================================ */
async function router() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('view') === 'settings') return renderSettings();
  if (params.get('view') === 'me') return renderMyPage();
  if (params.get('lesson')) return renderLesson(params.get('lesson'));
  if (params.get('subject')) return renderSubject(params.get('subject'));
  return renderHome();
}
window.addEventListener('hashchange', router);

// โหลดข้อมูลหลักทั้งหมด "ในคำขอเดียว" (settings + subjects + บทเรียนทั้งหมด + ประกาศ + สถิติ + ผลงานล่าสุด)
// แล้วแคชไว้ เปลี่ยนหน้าวิชา/บทเรียนได้ทันทีโดยไม่ต้องยิงซ้ำ
async function loadCore(force) {
  if (!force && state._loaded) return;
  const data = await apiGet('getBootstrap');
  state.settings = data.settings || {};
  state.subjects = (data.subjects || []).sort(byOrder);
  state.announcements = Array.isArray(data.announcements) ? data.announcements : [];
  state.stats = data.stats || null;
  state.recentWorks = Array.isArray(data.recentWorks) ? data.recentWorks : [];

  // จัดบทเรียนทั้งหมดเข้า cache แยกตามวิชา (เพื่อให้หน้า วิชา/บทเรียน ใช้ได้ทันที)
  state.lessonsCache = {};
  (data.lessons || []).forEach(l => {
    (state.lessonsCache[l.subject_id] = state.lessonsCache[l.subject_id] || []).push(l);
  });
  Object.keys(state.lessonsCache).forEach(sid => state.lessonsCache[sid].sort(byOrder));

  state._loaded = true;
  applyTheme();
}

// บังคับให้โหลดข้อมูลใหม่รอบหน้า (เรียกหลังครูเพิ่ม/แก้/ลบ)
function invalidateCache() { state._loaded = false; }

/* ============================================================================
   10) หน้าแรก — Hero + ตารางวิชา
   ============================================================================ */
async function renderHome() {
  loaderSet(15);                     // แจ้งหน้าจอโหลด: เริ่มโหลดแล้ว
  app.innerHTML = viewSkeleton();
  try {
    await loadCore(true);            // ★ ยิงครั้งเดียวได้ครบทุกอย่าง (เร็วขึ้นมาก)
    loaderSet(92);
  } catch (err) { app.innerHTML = viewError(err.message); loaderDone(); return; }

  const s = state.settings;
  // รูปปกหน้าแรก: รองรับได้ถึง 3 รูป (สลับอัตโนมัติ) เก็บใน settings 3 คีย์
  const covers = [s.site_cover_image, s.site_cover_image2, s.site_cover_image3]
    .map(imgUrl).filter(Boolean);
  // เฉดสีทาบบนรูป (โปร่งแสง) — ใช้ค่ากลางให้เห็นรูปชัดขึ้น แต่ตัวอักษรยังอ่านง่าย
  const c1 = hexToRgba(s.primary_color || '#4f8cff', .55);
  const c2 = hexToRgba(s.accent_color || '#ff7eb6', .55);
  // ชั้นรูปภาพ (แต่ละรูปมีเฉดสีทาบในตัว) — ถ้าไม่มีรูปเลย จะใช้พื้นไล่เฉดสีจาก CSS
  const slidesHtml = covers.length
    ? `<div class="hero-slides">${covers.map((url, i) =>
        `<div class="hero-slide ${i === 0 ? 'active' : ''}" style="background-image:linear-gradient(135deg,${c1},${c2}),url('${esc(url)}')"></div>`
      ).join('')}</div>`
    : '';
  // จุดบอกตำแหน่ง (แสดงเมื่อมีรูปมากกว่า 1)
  const dotsHtml = covers.length > 1
    ? `<div class="hero-dots">${covers.map((_, i) =>
        `<span class="hero-dot ${i === 0 ? 'active' : ''}" data-i="${i}" role="button" aria-label="รูปที่ ${i + 1}"></span>`
      ).join('')}</div>`
    : '';
  const heroHtml = `
    <section class="hero hero-tech">
      ${slidesHtml}
      ${techHeroLayer()}
      <div class="hero-inner">
        <span class="hero-pill">📚 ห้องเรียนออนไลน์</span>
        <h1 class="hero-title">${esc(s.site_title || 'ห้องเรียนออนไลน์')}</h1>
        <p class="hero-sub">${esc(s.site_subtitle || '')}</p>
      </div>
      ${dotsHtml}
    </section>`;

  // เลือกวิชาที่จะแสดง: นักเรียนเห็นเฉพาะ active / ครูเห็นทั้งหมด
  const subjects = state.subjects.filter(x => isTeacher() || (x.status || 'active') === 'active');

  // แถบค้นหา + ปุ่มกรองตามระดับชั้น (สร้างจากข้อมูลจริง) — แสดงเมื่อมีวิชาเท่านั้น
  const grades = gradesList();
  const filterBar = subjects.length ? `
    <div class="filter-bar">
      <input id="homeSearch" class="search-input" type="search" placeholder="🔍 ค้นหาวิชาหรือบทเรียน..." value="${esc(homeSearch)}" />
      ${grades.length > 1 ? `<div class="grade-chips">
        <button class="chip ${homeGrade === '' ? 'active' : ''}" data-grade="">ทั้งหมด</button>
        ${grades.map(g => `<button class="chip ${homeGrade === g ? 'active' : ''}" data-grade="${esc(g)}">${esc(g)}</button>`).join('')}
      </div>` : ''}
    </div>` : '';

  loaderSet(97);                     // กำลังจะวาดหน้าแล้ว
  app.innerHTML = `
    ${heroHtml}
    ${statsBar()}
    ${announcementsSection()}

    <div class="section-head">
      <h2>วิชาทั้งหมด <span class="count">(${subjects.length})</span></h2>
      <button class="btn btn-primary teacher-only" onclick="openSubjectForm()">➕ เพิ่มวิชา</button>
    </div>
    ${filterBar}
    <div id="subjectGrid"></div>

    ${featuredWorksSection()}
    ${aboutSection()}
  `;

  loaderDone();          // โหลดเสร็จสมบูรณ์ -> หน้าจอโหลดวิ่งไป 100% แล้วเฟดหาย
  setupHomeFilter();     // ผูกช่องค้นหา/ปุ่มกรอง แล้ววาดการ์ดวิชาครั้งแรก
  animateStats();        // ทำเลขสถิติวิ่งขึ้น
  startHeroRotation();   // เริ่มสลับรูปปกอัตโนมัติ (ถ้ามีหลายรูป)
}

/* ---- ค้นหา + กรองตามระดับชั้น (หน้าแรก) ---- */
let homeSearch = '';   // คำค้นปัจจุบัน
let homeGrade = '';    // ชั้นที่เลือก ('' = ทั้งหมด)

// รวบรายชื่อระดับชั้นจากวิชาทั้งหมด (ไม่ซ้ำ เรียงตามธรรมชาติ เช่น ป.1..ป.6)
function gradesList() {
  const set = [];
  state.subjects.forEach(s => { const g = String(s.grade || '').trim(); if (g && !set.includes(g)) set.push(g); });
  set.sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
  return set;
}

function setupHomeFilter() {
  const search = document.getElementById('homeSearch');
  if (search) {
    search.addEventListener('input', () => { homeSearch = search.value; renderSubjectGrid(); });
  }
  document.querySelectorAll('.grade-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      homeGrade = chip.dataset.grade || '';
      document.querySelectorAll('.grade-chips .chip').forEach(c => c.classList.toggle('active', c === chip));
      renderSubjectGrid();
    });
  });
  renderSubjectGrid();
}

// วาดเฉพาะการ์ดวิชา ตามคำค้น + ชั้นที่เลือก (ทำในหน่วยความจำ จึงเร็วทันที)
function renderSubjectGrid() {
  const box = document.getElementById('subjectGrid');
  if (!box) return;
  const q = homeSearch.trim().toLowerCase();
  let list = state.subjects.filter(x => isTeacher() || (x.status || 'active') === 'active');

  if (homeGrade) list = list.filter(s => String(s.grade || '').trim() === homeGrade);

  if (q) {
    list = list.filter(s => {
      const inSubject = String(s.subject_name || '').toLowerCase().includes(q) || String(s.grade || '').toLowerCase().includes(q);
      const lessons = state.lessonsCache[s.id] || [];
      const inLesson = lessons.some(l =>
        String(l.lesson_name || '').toLowerCase().includes(q) || String(l.description || '').toLowerCase().includes(q));
      return inSubject || inLesson;
    });
  }

  if (!list.length) {
    box.innerHTML = viewEmpty('🔍', 'ไม่พบผลลัพธ์', 'ลองค้นด้วยคำอื่น หรือเลือกระดับชั้นอื่น');
    return;
  }
  box.innerHTML = `<div class="grid">${list.map((sub, i) => subjectCard(sub, i)).join('')}</div>`;
}

/* ---- สลับรูปปก hero อัตโนมัติ ---- */
function startHeroRotation() {
  if (state._heroTimer) { clearInterval(state._heroTimer); state._heroTimer = null; }
  const slides = Array.from(app.querySelectorAll('.hero-slide'));
  const dots = Array.from(app.querySelectorAll('.hero-dot'));
  if (slides.length < 2) return;   // มีรูปเดียว/ไม่มี = ไม่ต้องสลับ

  // อ่าน "เวลาสลับรูป" (วินาที) จากการตั้งค่า — จำกัด 2–60 วิ ค่าเริ่มต้น 5 วิ
  const sec = Number(state.settings.cover_interval);
  const ms = (isFinite(sec) && sec > 0 ? Math.max(2, Math.min(60, sec)) : 5) * 1000;

  let idx = 0;
  const show = (n) => {
    idx = (n + slides.length) % slides.length;
    slides.forEach((el, i) => el.classList.toggle('active', i === idx));
    dots.forEach((el, i) => el.classList.toggle('active', i === idx));
  };
  const restart = () => {
    clearInterval(state._heroTimer);
    state._heroTimer = setInterval(() => {
      // หยุดเองถ้า hero หลุดออกจากหน้าจอแล้ว (เปลี่ยนหน้า)
      if (!document.body.contains(slides[0])) { clearInterval(state._heroTimer); state._heroTimer = null; return; }
      show(idx + 1);
    }, ms);
  };
  dots.forEach((d) => d.addEventListener('click', () => { show(Number(d.dataset.i)); restart(); }));
  restart();
}

/* ---- แถบสถิติสรุป (จำนวนวิชา / บทเรียน / ผลงาน) ---- */
function statsBar() {
  const st = state.stats;
  if (!st) return '';
  const item = (icon, num, label) =>
    `<div class="stat-item"><div class="stat-ic">${icon}</div><div class="stat-num" data-to="${Number(num) || 0}">0</div><div class="stat-label">${label}</div></div>`;
  return `<section class="stats-bar">
    ${item('📚', st.subjects, 'วิชา')}
    ${item('📖', st.lessons, 'บทเรียน')}
    ${item('🌟', st.works, 'ผลงานนักเรียน')}
  </section>`;
}

// เลขวิ่งขึ้นจาก 0 ถึงค่าจริง (ลูกเล่นแบบเว็บมืออาชีพ)
function animateStats() {
  app.querySelectorAll('.stat-num').forEach(el => {
    const to = Number(el.dataset.to) || 0;
    if (to === 0) { el.textContent = '0'; return; }
    const dur = 900, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(p * to).toLocaleString('th-TH');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* ---- ส่วนประชาสัมพันธ์/ข่าวสาร ---- */
function announcementsSection() {
  // นักเรียนเห็นเฉพาะ active / ครูเห็นทั้งหมด ; ปักหมุด (pin) ขึ้นก่อน แล้วเรียงวันที่ใหม่สุดก่อน
  const list = state.announcements
    .filter(a => isTeacher() || (a.status || 'active') === 'active')
    .sort((a, b) => {
      const pin = (x) => (String(x.pin).toLowerCase() === 'yes' || x.pin === true ? 1 : 0);
      if (pin(b) !== pin(a)) return pin(b) - pin(a);
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
  if (!list.length && !isTeacher()) return '';   // ไม่มีประกาศ + เป็นนักเรียน = ซ่อนทั้งส่วน

  const head = `<div class="section-head">
      <h2>📣 ประชาสัมพันธ์</h2>
      <button class="btn btn-primary teacher-only" onclick="openAnnounceForm()">➕ เพิ่มประกาศ</button>
    </div>`;
  if (!list.length) {
    return head + viewEmpty('📭', 'ยังไม่มีประกาศ', 'กดปุ่ม "เพิ่มประกาศ" เพื่อแจ้งข่าวถึงนักเรียน');
  }
  return head + `<div class="announce-list">${list.map(announceCard).join('')}</div>`;
}

function announceCard(a) {
  const pinned = String(a.pin).toLowerCase() === 'yes' || a.pin === true;
  const hidden = (a.status || 'active') === 'inactive';
  return `
    <article class="announce-card ${pinned ? 'pinned' : ''} ${hidden ? 'is-hidden' : ''}">
      <div class="announce-main">
        <div class="announce-top">
          ${pinned ? '<span class="announce-pin">📌 ปักหมุด</span>' : ''}
          ${hidden ? '<span class="announce-hidetag">ซ่อนอยู่</span>' : ''}
          <span class="announce-date">${esc(formatThaiDate(a.date))}</span>
        </div>
        <h3 class="announce-title">${esc(a.title || '')}</h3>
        ${a.detail ? `<p class="announce-detail">${esc(a.detail)}</p>` : ''}
      </div>
      <div class="announce-tools teacher-only">
        <button class="btn btn-outline btn-sm" onclick="openAnnounceForm('${esc(a.id)}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteAnnounce('${esc(a.id)}')">🗑️</button>
      </div>
    </article>`;
}

/* ---- ผลงานนักเรียนเด่น (หน้าแรก) ---- */
function featuredWorksSection() {
  const works = state.recentWorks || [];
  if (!works.length) return '';
  return `
    <div class="section-head"><h2>🌟 ผลงานนักเรียนเด่น</h2></div>
    <div class="works-grid">${works.map((w, i) => homeWorkCard(w, i)).join('')}</div>`;
}

function homeWorkCard(w, i) {
  const img = imgUrl(w.image);
  const imgHtml = img ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='🖼️'" />` : '🖼️';
  const inner = `
    <div class="work-img">${imgHtml}</div>
    <div class="work-info">
      <div class="t">${esc(w.work_title || 'ผลงาน')}</div>
      <div class="by">โดย ${esc(w.student_name || '-')}</div>
      ${w.lesson_name ? `<div class="work-lesson">📖 ${esc(w.lesson_name)}</div>` : ''}
    </div>`;
  return `<div class="work-card" style="animation-delay:${i * 50}ms">${
    w.work_link ? `<a href="${esc(w.work_link)}" target="_blank" rel="noopener">${inner}</a>` : inner
  }</div>`;
}

/* ---- เกี่ยวกับครู + ช่องทางติดตาม ---- */
function aboutSection() {
  const s = state.settings;
  const name = s.about_name || s.site_title || 'คุณครู';
  const photo = imgUrl(s.about_photo);
  const socials = [
    ['social_facebook', '👍 Facebook', s.social_facebook],
    ['social_line', '💬 LINE', s.social_line],
    ['social_youtube', '▶️ YouTube', s.social_youtube],
    ['social_email', '✉️ อีเมล', s.social_email ? (String(s.social_email).includes('@') && !String(s.social_email).startsWith('mailto:') ? 'mailto:' + s.social_email : s.social_email) : '']
  ].filter(x => x[2]);
  const socialHtml = socials.length
    ? `<div class="social-row">${socials.map(x => `<a class="social-btn" href="${esc(x[2])}" target="_blank" rel="noopener">${x[1]}</a>`).join('')}</div>`
    : (isTeacher() ? '<p class="about-hint">เพิ่มช่องทางติดตาม (Facebook/LINE/YouTube/อีเมล) ได้ในเมนูตั้งค่า</p>' : '');

  return `
    <div class="section-head"><h2>👩‍🏫 เกี่ยวกับผู้สอน</h2></div>
    <section class="about-card">
      <div class="about-photo">${photo ? `<img src="${esc(photo)}" alt="${esc(name)}" onerror="this.parentNode.innerHTML='👩‍🏫'" />` : '👩‍🏫'}</div>
      <div class="about-info">
        <h3 class="about-name">${esc(name)}</h3>
        ${s.about_role ? `<div class="about-role">${esc(s.about_role)}</div>` : ''}
        ${s.about_text ? `<p class="about-text">${esc(s.about_text)}</p>` : ''}
        ${socialHtml}
      </div>
    </section>`;
}

// เลเยอร์เอฟเฟกต์เทคโนโลยีขยับได้ — เครือข่ายโหนดเรืองแสง + เส้นข้อมูลวิ่ง + แสงสแกน
// วาดด้วย SVG ล้วน ขยับด้วย CSS/SMIL จึงไม่ต้องใช้ JS เพิ่ม และไม่ค้างหน่วยความจำตอนเปลี่ยนหน้า
function techHeroLayer() {
  // พิกัดโหนดบนผืน viewBox 1200x360
  const nodes = [
    [120, 70], [260, 140], [200, 260], [420, 90], [520, 210], [680, 120],
    [820, 250], [960, 90], [1080, 200], [1140, 300], [380, 300], [760, 60]
  ];
  // คู่เส้นเชื่อมระหว่างโหนด (อ้างอิงลำดับใน nodes)
  const links = [[0,1],[1,2],[1,3],[3,5],[4,5],[5,11],[5,6],[6,8],[7,8],[8,9],[4,10],[2,10],[7,11]];
  const lines = links.map((p, i) => {
    const a = nodes[p[0]], b = nodes[p[1]];
    return `<line class="tn-link" style="--d:${(i % 5) * 0.6}s" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
  }).join('');
  const dots = nodes.map((n, i) =>
    `<circle class="tn-node" style="--d:${(i % 6) * 0.5}s" cx="${n[0]}" cy="${n[1]}" r="3.2"/>`
  ).join('');
  // แพ็กเก็ตข้อมูลวิ่งไปตามเส้นบางเส้น (ใช้ SMIL animate ที่เบราว์เซอร์รองรับ)
  const packets = [[0,1],[5,6],[8,9],[3,5]].map((p, i) => {
    const a = nodes[p[0]], b = nodes[p[1]], begin = (i * 0.9).toFixed(1);
    return `<circle class="tn-packet" r="2.6" cx="${a[0]}" cy="${a[1]}">
        <animate attributeName="cx" values="${a[0]};${b[0]}" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/>
        <animate attributeName="cy" values="${a[1]};${b[1]}" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/>
      </circle>`;
  }).join('');
  return `
    <div class="tech-layer" aria-hidden="true">
      <svg class="tech-net" viewBox="0 0 1200 360" preserveAspectRatio="xMidYMid slice">
        <g class="tn-links">${lines}</g>
        <g class="tn-packets">${packets}</g>
        <g class="tn-nodes">${dots}</g>
      </svg>
      <span class="tech-scan"></span>
    </div>`;
}

// การ์ดวิชา 1 ใบ
function subjectCard(sub, i) {
  const cover = imgUrl(sub.cover_image);
  const coverHtml = cover
    ? `<img src="${esc(cover)}" alt="${esc(sub.subject_name)}" loading="lazy" onerror="this.parentNode.classList.add('gradient');this.remove()" />`
    : `<span class="placeholder">${esc(sub.icon || '📘')}</span>`;
  const cls = (sub.status || 'active') !== 'active' ? 'card inactive' : 'card';
  return `
    <div class="${cls}" style="animation-delay:${i * 60}ms;--c1:${esc(sub.color || 'var(--primary)')};--c2:${esc(sub.color || 'var(--accent)')}"
         onclick="goSubject('${esc(sub.id)}')" tabindex="0" onkeydown="if(event.key==='Enter')goSubject('${esc(sub.id)}')">
      <div class="card-cover ${cover ? '' : 'gradient'}" style="--c1:${esc(sub.color || 'var(--primary)')};--c2:${esc(sub.color || 'var(--accent)')}">
        <span class="badge">${esc(sub.grade || '')}</span>
        ${coverHtml}
      </div>
      <div class="card-body">
        <div class="card-title">${esc(sub.icon || '📘')} ${esc(sub.subject_name)}</div>
        <div class="card-tools" onclick="event.stopPropagation()">
          <button class="btn btn-outline btn-sm" onclick="openSubjectForm('${esc(sub.id)}')">✏️ แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteSubject('${esc(sub.id)}')">🗑️ ลบ</button>
        </div>
      </div>
    </div>`;
}
function goSubject(id) { location.hash = 'subject=' + id; }

/* ============================================================================
   11) หน้าวิชา — แสดงบทเรียนของวิชานั้น
   ============================================================================ */
async function renderSubject(subjectId) {
  loaderSet(25);
  app.innerHTML = viewSkeleton();
  try {
    await loadCore();              // ใช้แคชถ้ามีอยู่แล้ว (ปกติไม่ยิงซ้ำ)
    loaderSet(90);
  } catch (err) { app.innerHTML = viewError(err.message); loaderDone(); return; }

  const sub = state.subjects.find(x => x.id === subjectId);
  if (!sub) { app.innerHTML = viewEmpty('🔍', 'ไม่พบวิชานี้', 'อาจถูกลบไปแล้ว'); loaderDone(); return; }

  const lessons = (state.lessonsCache[subjectId] || []).filter(x => isTeacher() || (x.status || 'active') === 'active');

  let cardsHtml;
  if (!lessons.length) {
    cardsHtml = viewEmpty('📭', 'ยังไม่มีบทเรียน', isTeacher() ? 'กดปุ่ม "เพิ่มบทเรียน" เพื่อเริ่ม' : 'คุณครูกำลังเตรียมบทเรียนนี้อยู่');
  } else {
    cardsHtml = `<div class="grid">${lessons.map((l, i) => lessonCard(l, i)).join('')}</div>`;
  }

  app.innerHTML = `
    <nav class="crumbs"><a href="#">หน้าหลัก</a><span class="sep">›</span><span>${esc(sub.icon || '')} ${esc(sub.subject_name)} ${esc(sub.grade)}</span></nav>
    <div class="section-head">
      <h2>${esc(sub.icon || '')} ${esc(sub.subject_name)} <span class="count">${esc(sub.grade)} · ${lessons.length} บทเรียน</span></h2>
      <button class="btn btn-primary teacher-only" onclick="openLessonForm(null,'${esc(subjectId)}')">➕ เพิ่มบทเรียน</button>
    </div>
    ${cardsHtml}
  `;
  loaderDone();
}

// การ์ดบทเรียน 1 ใบ
function lessonCard(l, i) {
  const cover = imgUrl(l.cover_image);
  const coverHtml = cover
    ? `<img src="${esc(cover)}" alt="${esc(l.lesson_name)}" loading="lazy" onerror="this.parentNode.classList.add('gradient');this.remove()" />`
    : `<span class="placeholder">📖</span>`;
  const cls = (l.status || 'active') !== 'active' ? 'card inactive' : 'card';
  // ป้ายเล็ก ๆ บอกว่าเป็นวิดีโอ
  const videoTag = (l.link_type || 'lesson') === 'video' ? '<span class="card-vtag">▶️ วิดีโอ</span>' : '';
  return `
    <div class="${cls}" style="animation-delay:${i * 60}ms" onclick="goLesson('${esc(l.id)}')" tabindex="0" onkeydown="if(event.key==='Enter')goLesson('${esc(l.id)}')">
      <div class="card-cover ${cover ? '' : 'gradient'}">${videoTag}${coverHtml}</div>
      <div class="card-body">
        <div class="card-title">${esc(l.lesson_name)}</div>
        <div class="card-desc">${esc(l.description || '')}</div>
        <div class="card-tools" onclick="event.stopPropagation()">
          <button class="btn btn-outline btn-sm" onclick="openLessonForm('${esc(l.id)}','${esc(l.subject_id)}')">✏️ แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteLesson('${esc(l.id)}','${esc(l.subject_id)}')">🗑️ ลบ</button>
        </div>
      </div>
    </div>`;
}
function goLesson(id) { location.hash = 'lesson=' + id; }

/* ============================================================================
   11.5) หน้า "ของฉัน" — รวมบทที่ดูจบ + เกียรติบัตร (อ่านจากเครื่องนักเรียน)
   ============================================================================ */
async function renderMyPage() {
  loaderSet(25);
  app.innerHTML = viewSkeleton();
  try { await loadCore(); loaderSet(90); }   // ใช้ข้อมูลบทเรียนจากแคชเพื่อแสดงชื่อ/วิชา
  catch (err) { app.innerHTML = viewError(err.message); loaderDone(); return; }

  const info = getStudentInfo();
  const certOn = (state.settings.cert_enabled || 'yes') !== 'no';

  // แปลงรายการ "บทที่ดูจบ" (เก็บเป็น id ในเครื่อง) ให้เป็นข้อมูลบทเรียนจริง
  const done = getCompletedLessons()
    .map(id => findLessonInCache(id))
    .filter(Boolean);

  // ส่วนหัว: ชื่อนักเรียน + ปุ่มแก้ไขชื่อ
  const who = info.student_name
    ? `${esc(info.student_name)}${info.student_class ? ' · ' + esc(info.student_class) : ''}${info.student_no ? ' · เลขที่ ' + esc(info.student_no) : ''}`
    : 'ยังไม่ได้กรอกชื่อ';

  let listHtml;
  if (!done.length) {
    listHtml = viewEmpty('🌱', 'ยังไม่มีบทที่ดูจบ', 'ไปเลือกวิชาแล้วดูวิดีโอให้จบ (ทำแบบทดสอบให้ผ่าน) เพื่อสะสมเกียรติบัตรกันเลย!');
  } else {
    listHtml = `<div class="mine-grid">${done.map((l, i) => {
      const sub = state.subjects.find(x => x.id === l.subject_id) || {};
      return `
        <div class="mine-card" style="animation-delay:${i * 50}ms">
          <div class="mine-badge">✅</div>
          <div class="mine-main">
            <div class="mine-lesson">${esc(l.lesson_name)}</div>
            <div class="mine-sub">${esc(sub.icon || '📘')} ${esc(sub.subject_name || '')} ${esc(sub.grade || '')}</div>
          </div>
          <div class="mine-actions">
            <button class="btn btn-outline btn-sm" onclick="goLesson('${esc(l.id)}')">ไปที่บท</button>
            ${certOn ? `<button class="btn btn-primary btn-sm" onclick="openCertificateById('${esc(l.id)}')">🏆 เกียรติบัตร</button>` : ''}
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  app.innerHTML = `
    <nav class="crumbs"><a href="#">หน้าหลัก</a><span class="sep">›</span><span>ของฉัน</span></nav>

    <section class="mine-hero">
      <div class="mine-hero-ic">🎓</div>
      <div class="mine-hero-info">
        <h1>ของฉัน</h1>
        <p class="mine-who">${who}</p>
        <button class="btn btn-outline btn-sm" onclick="openMyNameForm()">✏️ ${info.student_name ? 'แก้ไขชื่อ' : 'กรอกชื่อ'}</button>
      </div>
      <div class="mine-stat">
        <div class="mine-stat-num">${done.length}</div>
        <div class="mine-stat-label">บทที่ดูจบ</div>
      </div>
    </section>

    <div class="section-head"><h2>🏅 บทเรียนที่ดูจบแล้ว <span class="count">(${done.length})</span></h2></div>
    ${listHtml}
  `;
  loaderDone();
}

// เปิดเกียรติบัตรจาก lesson id (ใช้ในหน้า "ของฉัน")
function openCertificateById(lessonId) {
  const lesson = findLessonInCache(lessonId);
  if (!lesson) { toast('ไม่พบบทเรียนนี้แล้ว', 'error'); return; }
  if (!getStudentInfo().student_name) { openMyNameForm(); return; }
  openCertificate(lesson);
}

// ฟอร์มแก้ไขชื่อนักเรียน (ในหน้า "ของฉัน")
function openMyNameForm() {
  const info = getStudentInfo();
  openModal('✏️ ข้อมูลของฉัน', `
    <form id="meForm" novalidate>
      <p class="reg-formhint">ชื่อนี้จะใช้แสดงบนเกียรติบัตรและรายชื่อของคุณครู</p>
      <div class="field"><label>ชื่อ-นามสกุล <span class="req">*</span></label><input name="student_name" value="${esc(info.student_name || '')}" placeholder="เช่น เด็กหญิงมานี ใจดี" /><div class="err">กรุณากรอกชื่อ-นามสกุล</div></div>
      <div class="row2">
        <div class="field"><label>ชั้น/ห้อง</label><input name="student_class" value="${esc(info.student_class || '')}" placeholder="เช่น ป.6/1" /></div>
        <div class="field"><label>เลขที่</label><input name="student_no" value="${esc(info.student_no || '')}" placeholder="เช่น 12" /></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>
  `);
  $('#meForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.elements.student_name.value.trim();
    f.elements.student_name.closest('.field').classList.toggle('invalid', !name);
    if (!name) return;
    saveStudentInfo({ student_name: name, student_class: f.elements.student_class.value.trim(), student_no: f.elements.student_no.value.trim() });
    closeModal();
    toast('บันทึกข้อมูลแล้ว', 'success');
    renderMyPage();
  });
}

/* ============================================================================
   12) หน้าบทเรียน — รายละเอียด + ปุ่มเข้าเรียน + ผลงานนักเรียน
   ============================================================================ */
async function renderLesson(lessonId) {
  loaderSet(25);
  app.innerHTML = viewSkeleton();
  let lesson, works;
  try {
    await loadCore();                       // โหลดบทเรียนทั้งหมดมาแล้ว (แคช) — ไม่ต้องวนยิงทีละวิชา
    loaderSet(55);
    lesson = findLessonInCache(lessonId);
    if (!lesson) { app.innerHTML = viewEmpty('🔍', 'ไม่พบบทเรียนนี้', 'อาจถูกลบไปแล้ว'); loaderDone(); return; }
    works = await apiGet('getWorks', { lesson_id: lessonId });   // ยิงเฉพาะ "ผลงาน" ของบทนี้
    state.worksCache[lessonId] = works || [];
    loaderSet(88);
  } catch (err) { app.innerHTML = viewError(err.message); loaderDone(); return; }

  const sub = state.subjects.find(x => x.id === lesson.subject_id) || {};
  const cover = imgUrl(lesson.cover_image);
  const link = lesson.link ? esc(lesson.link) : '';
  const isVideo = (lesson.link_type || 'lesson') === 'video';
  const ytId = isVideo ? youtubeId(lesson.link) : null;   // ฝัง+นับการดูได้เฉพาะลิงก์ YouTube
  const threshold = watchThreshold();

  // ปุ่ม/วิดีโอ ตามชนิดเนื้อหา
  //  - บทเรียนออนไลน์ -> ปุ่ม "เข้าเรียน" เปิดแท็บใหม่
  //  - วิดีโอ YouTube  -> ฝังเล่นในหน้าเลย (นับการดู + ออกเกียรติบัตร)
  //  - วิดีโออื่นที่ฝังไม่ได้ -> ปุ่ม "ดูวิดีโอ" เปิดแท็บใหม่ (นับการดูไม่ได้)
  let actionHtml;
  if (!link) {
    actionHtml = `<span class="btn btn-outline" style="cursor:default">ยังไม่มีลิงก์บทเรียน</span>`;
  } else if (isVideo && !ytId) {
    actionHtml = `<a class="btn btn-primary" href="${link}" target="_blank" rel="noopener">▶️ ดูวิดีโอ</a>`;
  } else if (!isVideo) {
    actionHtml = `<a class="btn btn-primary" href="${link}" target="_blank" rel="noopener">🚀 เข้าเรียนบทนี้</a>`;
  } else {
    actionHtml = '';   // วิดีโอ YouTube ฝังได้ -> ไม่ต้องมีปุ่ม (เล่นในหน้าด้านล่าง)
  }

  // กล่องวิดีโอฝัง: ใช้ div ให้ YouTube IFrame API มาสร้างตัวเล่น (เพื่อจับความคืบหน้าได้)
  const videoHtml = ytId ? `
    <section class="video-embed"><div id="ytPlayer"></div></section>` : '';

  let worksHtml;
  if (!works.length) {
    worksHtml = viewEmpty('🎨', 'ยังไม่มีผลงานนักเรียน', isTeacher() ? 'กดปุ่ม "เพิ่มผลงาน" เพื่อเริ่ม' : 'รอชมผลงานเร็วๆ นี้');
  } else {
    worksHtml = `<div class="works-grid">${works.map((w, i) => workCard(w, i)).join('')}</div>`;
  }

  // เปิดระบบดูจบ/เกียรติบัตรไหม (ครูตั้งค่าได้)
  const regOn = (state.settings.register_enabled || 'yes') !== 'no';

  app.innerHTML = `
    <nav class="crumbs">
      <a href="#">หน้าหลัก</a><span class="sep">›</span>
      <a href="#subject=${esc(sub.id)}">${esc(sub.subject_name || '')} ${esc(sub.grade || '')}</a><span class="sep">›</span>
      <span>${esc(lesson.lesson_name)}</span>
    </nav>

    <section class="lesson-hero">
      <div class="cover">${cover ? `<img src="${esc(cover)}" alt="" onerror="this.parentNode.innerHTML='<span class=placeholder>📖</span>'" />` : `<span class="placeholder">📖</span>`}</div>
      <div class="info">
        <h1>${esc(lesson.lesson_name)}</h1>
        <p>${esc(lesson.description || '')}</p>
        <div class="lesson-actions">
          ${actionHtml}
          <button class="btn btn-outline teacher-only" onclick="openLessonForm('${esc(lesson.id)}','${esc(lesson.subject_id)}')">✏️ แก้ไขบทเรียน</button>
          ${(isVideo && ytId) ? `<button class="btn btn-outline teacher-only" onclick="openQuizEditor('${esc(lesson.id)}')">📝 จัดการแบบทดสอบ</button>` : ''}
        </div>
      </div>
    </section>

    ${videoHtml}

    ${(isVideo && ytId && regOn && !isTeacher()) ? videoGateWrap(lesson, threshold) : ''}
    ${(isVideo && !ytId && regOn && !isTeacher()) ? nonEmbedNote() : ''}
    ${(isVideo && regOn) ? videoRosterSection(lesson) : ''}

    <div class="section-head">
      <h2>🎨 ผลงานนักเรียน <span class="count">(${works.length})</span></h2>
      <button class="btn btn-accent teacher-only" onclick="openWorkForm(null,'${esc(lesson.id)}')">➕ เพิ่มผลงาน</button>
    </div>
    ${worksHtml}
  `;
  loaderDone();

  // ระบบดูวิดีโอ:
  //  - มีลิงก์ YouTube -> สร้างตัวเล่น + (นักเรียน) ติดตามการดูจนจบเพื่อออกเกียรติบัตร
  //  - ครู -> โหลดรายชื่อนักเรียนที่ดูจบมาแสดง
  if (isVideo) {
    if (ytId) initVideoPlayer(lesson, ytId, threshold);
    if (regOn && isTeacher()) refreshRoster(lesson.id);
  }
}

function findLessonInCache(lessonId) {
  for (const sid in state.lessonsCache) {
    const found = state.lessonsCache[sid].find(l => l.id === lessonId);
    if (found) return found;
  }
  return null;
}

// การ์ดผลงาน 1 ใบ
function workCard(w, i) {
  const img = imgUrl(w.image);
  const imgHtml = img ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='🖼️'" />` : '🖼️';
  const inner = `
    <div class="work-img">${imgHtml}</div>
    <div class="work-info">
      <div class="t">${esc(w.work_title || 'ผลงาน')}</div>
      <div class="by">โดย ${esc(w.student_name || '-')}</div>
    </div>`;
  const linked = w.work_link
    ? `<a href="${esc(w.work_link)}" target="_blank" rel="noopener">${inner}</a>`
    : inner;
  return `
    <div class="work-card" style="animation-delay:${i * 50}ms">
      ${linked}
      <div class="work-tools">
        <button class="btn btn-outline btn-sm" onclick="openWorkForm('${esc(w.id)}','${esc(w.lesson_id)}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteWork('${esc(w.id)}','${esc(w.lesson_id)}')">🗑️</button>
      </div>
    </div>`;
}

/* ============================================================================
   12.5) ★ ระบบลงทะเบียนดูวิดีโอ
   ============================================================================ */

// กล่องสถานะการดู/รับเกียรติบัตร (ใต้วิดีโอ ฝั่งนักเรียน) — เนื้อหาเปลี่ยนตามสถานะโดย initVideoPlayer
function videoGateWrap(lesson, threshold) {
  const school = state.settings.register_school || state.settings.site_title || 'โรงเรียนของเรา';
  return `
    <section class="video-gate" id="videoGateWrap">
      <div class="vg-head">📺 สำหรับนักเรียน <b>${esc(school)}</b> — ดูวิดีโอให้จบเพื่อรับเกียรติบัตร</div>
      <div class="vp-progress"><div class="vp-bar" id="vpBar"></div></div>
      <div class="vp-meta"><span id="vpPct">ดูแล้ว 0%</span><span id="vpHint" class="vp-hint"></span></div>
      <div id="videoGate"></div>
    </section>`;
}

// ข้อความเตือนเมื่อลิงก์ฝังไม่ได้ (ไม่ใช่ YouTube มาตรฐาน) จึงนับการดูไม่ได้
function nonEmbedNote() {
  return `
    <section class="reg-box">
      <div class="reg-ic">⚠️</div>
      <div class="reg-main">
        <div class="reg-t">ลิงก์นี้ฝังเล่นในหน้าไม่ได้ ระบบจึงนับการดู/ออกเกียรติบัตรอัตโนมัติไม่ได้</div>
        <div class="reg-sub">แนะนำให้คุณครูแก้บทเรียนนี้ ใช้ลิงก์ YouTube มาตรฐาน เช่น youtu.be/xxxx หรือ youtube.com/watch?v=xxxx</div>
      </div>
    </section>`;
}

// ฟอร์มกรอกชื่อ (ใช้ทั้งก่อนเริ่มดู และตอนดูจบ) — เติมข้อมูลเดิมจากเครื่องให้อัตโนมัติ
function identityFormHtml(submitLabel) {
  const info = getStudentInfo();
  return `
    <form id="idForm" class="vg-form" novalidate>
      <div class="field"><label>ชื่อ-นามสกุล <span class="req">*</span></label><input name="student_name" value="${esc(info.student_name || '')}" placeholder="เช่น เด็กหญิงมานี ใจดี" /><div class="err">กรุณากรอกชื่อ-นามสกุล</div></div>
      <div class="row2">
        <div class="field"><label>ชั้น/ห้อง</label><input name="student_class" value="${esc(info.student_class || '')}" placeholder="เช่น ป.6/1" /></div>
        <div class="field"><label>เลขที่</label><input name="student_no" value="${esc(info.student_no || '')}" placeholder="เช่น 12" /></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${esc(submitLabel)}</button>
    </form>`;
}
function wireIdentityForm(after) {
  const f = document.getElementById('idForm');
  if (!f) return;
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = f.elements.student_name.value.trim();
    f.elements.student_name.closest('.field').classList.toggle('invalid', !name);
    if (!name) return;
    saveStudentInfo({
      student_name: name,
      student_class: f.elements.student_class.value.trim(),
      student_no: f.elements.student_no.value.trim()
    });
    if (after) after();
  });
}

// สร้างตัวเล่น YouTube + ติดตามการดูจริง (กันลากข้าม) เพื่อออกเกียรติบัตรเมื่อดูครบเกณฑ์
function initVideoPlayer(lesson, ytId, threshold) {
  // ล้างตัวเล่น/ตัวจับเวลาเดิม (กันซ้อนเมื่อเปลี่ยนหน้า)
  if (state._player) { try { state._player.destroy(); } catch (e) {} state._player = null; }
  if (state._trackTimer) { clearInterval(state._trackTimer); state._trackTimer = null; }

  const teacher = isTeacher();
  const totalBuckets = 24;          // แบ่งวิดีโอเป็น 24 ช่วง ต้องดูผ่านจริงทุกช่วงถึงจะนับ
  const watched = new Set();
  let completed = isCompleted(lesson.id);   // เคยดูจบแล้ว (จำในเครื่อง)
  let quizCache = null;             // คำถามแบบทดสอบ (null = ยังไม่โหลด, [] = ไม่มี)
  let postWatchStarted = false;     // เข้าสู่ขั้นตอนหลังดูจบแล้วหรือยัง (กัน tick เรียกซ้ำ)

  const byId = (id) => document.getElementById(id);
  const pct = () => Math.round(watched.size / totalBuckets * 100);

  function paintProgress(p) {
    p = Math.min(100, p);
    const bar = byId('vpBar'); if (bar) bar.style.width = p + '%';
    const t = byId('vpPct'); if (t) t.textContent = 'ดูแล้ว ' + p + '%';
  }

  function renderGate() {
    const gate = byId('videoGate');
    const hint = byId('vpHint');
    if (!gate) return;

    if (completed) {
      if (hint) hint.textContent = '';
      paintProgress(100);
      const info = getStudentInfo();
      const certOn = (state.settings.cert_enabled || 'yes') !== 'no';
      gate.innerHTML = `
        <div class="vg-done">
          <div class="vg-done-ic">🎉</div>
          <div class="vg-done-main">
            <div class="vg-done-t">ดูวิดีโอจบแล้ว${info.student_name ? ' — ' + esc(info.student_name) : ''}</div>
            <div class="vg-done-s">คุณครูเห็นชื่อหนูในรายการเรียบร้อยแล้ว</div>
          </div>
          ${certOn ? `<button class="btn btn-primary" id="vgCert">🏆 รับเกียรติบัตร</button>` : ''}
        </div>`;
      const cb = byId('vgCert');
      if (cb) cb.onclick = () => openCertificate(lesson);
      return;
    }

    if (!getStudentInfo().student_name) {
      if (hint) hint.textContent = 'กรอกชื่อก่อนเริ่มดู เพื่อให้ระบบบันทึกและออกเกียรติบัตรให้ (บุคคลทั่วไปไม่ต้องกรอกก็ดูได้)';
      gate.innerHTML = identityFormHtml('▶️ เริ่มดูเพื่อรับเกียรติบัตร');
      wireIdentityForm(() => renderGate());   // กรอกชื่อแล้ว เริ่มนับเครดิตให้
      return;
    }

    if (hint) hint.textContent = 'ดูให้ถึง ' + threshold + '% แล้วปุ่มรับเกียรติบัตรจะปรากฏ (ระบบนับเฉพาะส่วนที่ดูจริง ลากข้ามไม่นับ)';
    gate.innerHTML = `<div class="vg-waiting">⏳ กำลังดู… ตั้งใจดูต่อให้ครบเพื่อรับเกียรติบัตรนะ</div>`;
  }

  function onReachComplete() {
    if (completed || postWatchStarted) return;
    postWatchStarted = true;          // ★ เข้าขั้นตอนหลังดูจบแค่ครั้งเดียว
    if (!getStudentInfo().student_name) {
      // ดูจบแล้วแต่ยังไม่กรอกชื่อ -> ขอให้กรอกก่อน
      const gate = byId('videoGate'); const hint = byId('vpHint');
      if (hint) hint.textContent = 'ดูจบแล้ว! กรอกชื่อเพื่อทำแบบทดสอบ/รับเกียรติบัตร';
      if (gate) { gate.innerHTML = identityFormHtml('✅ ถัดไป'); wireIdentityForm(() => handleAfterWatch()); }
      return;
    }
    handleAfterWatch();
  }

  // หลังดูครบเกณฑ์ + รู้ชื่อแล้ว: มีแบบทดสอบไหม? มี -> ให้ทำก่อน / ไม่มี -> บันทึกดูจบเลย
  async function handleAfterWatch() {
    if (completed) return;
    if (quizCache === null) {
      const gate = byId('videoGate');
      if (gate) gate.innerHTML = `<div class="vg-waiting">⏳ กำลังเตรียมแบบทดสอบ...</div>`;
      try { quizCache = await apiGet('getQuiz', { lesson_id: lesson.id }); }
      catch (e) { quizCache = []; }
    }
    if (quizCache && quizCache.length) renderQuiz();
    else finishComplete();           // ไม่มีแบบทดสอบ = ดูจบถือว่าผ่าน
  }

  // แสดงแบบทดสอบ (สลับลำดับข้อ) ในกล่องใต้วิดีโอ
  function renderQuiz(prevResult) {
    const gate = byId('videoGate');
    const hint = byId('vpHint');
    if (hint) hint.textContent = 'ทำแบบทดสอบให้ผ่านเกณฑ์ เพื่อรับเกียรติบัตร';
    if (!gate) return;

    // สลับลำดับข้อ (ครั้งเดียวต่อรอบการแสดง) เพื่อลดการลอก
    const qs = quizCache.slice().sort(() => Math.random() - 0.5);

    const resultBanner = prevResult
      ? `<div class="quiz-result fail">ยังไม่ผ่าน ได้ ${prevResult.correct}/${prevResult.total} (${prevResult.pct}%) — ต้องได้อย่างน้อย ${prevResult.passPct}% ลองใหม่อีกครั้งนะ 💪</div>`
      : '';

    gate.innerHTML = `
      <div class="quiz-box">
        <div class="quiz-title">📝 แบบทดสอบหลังเรียน (${qs.length} ข้อ)</div>
        ${resultBanner}
        <form id="quizForm">
          ${qs.map((q, i) => `
            <div class="quiz-q" data-qid="${esc(q.id)}">
              <div class="quiz-qtext">${i + 1}. ${esc(q.question)}</div>
              <div class="quiz-choices">
                ${(q.choices || []).map((c, ci) => `
                  <label class="quiz-choice">
                    <input type="radio" name="q_${esc(q.id)}" value="${ci + 1}" />
                    <span>${esc(c)}</span>
                  </label>`).join('')}
              </div>
            </div>`).join('')}
          <button type="submit" class="btn btn-primary btn-block">✅ ส่งคำตอบ</button>
        </form>
      </div>`;

    const form = byId('quizForm');
    form.addEventListener('submit', (e) => { e.preventDefault(); gradeQuiz(qs, form); });
  }

  async function gradeQuiz(qs, form) {
    // รวบคำตอบ + ตรวจว่าตอบครบทุกข้อ
    const answers = {};
    let unanswered = 0;
    qs.forEach(q => {
      const sel = form.querySelector(`input[name="q_${q.id}"]:checked`);
      if (sel) answers[q.id] = Number(sel.value); else unanswered++;
    });
    if (unanswered > 0) { toast('กรุณาตอบให้ครบทุกข้อ (ยังเหลือ ' + unanswered + ' ข้อ)', 'error'); return; }

    const info = getStudentInfo();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'กำลังตรวจ...';
    try {
      const res = await apiPost('submitQuiz', {
        lesson_id: lesson.id,
        student_name: info.student_name,
        student_class: info.student_class || '',
        student_no: info.student_no || '',
        lesson_name: lesson.lesson_name || '',
        answers
      });
      if (res.pass) {
        completed = true;
        markCompleted(lesson.id);
        toast('ผ่านแล้ว! ได้ ' + res.correct + '/' + res.total + ' 🎉', 'success');
        renderGate();
      } else {
        toast('ยังไม่ผ่าน ลองใหม่อีกครั้งนะ', 'error');
        renderQuiz(res);          // แสดงคะแนน + ให้ทำใหม่ (สลับข้อใหม่)
      }
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false; btn.textContent = '✅ ส่งคำตอบ';
    }
  }

  async function finishComplete() {
    if (completed) return;
    completed = true;
    const info = getStudentInfo();
    const item = {
      lesson_id: lesson.id,
      student_name: info.student_name,
      student_class: info.student_class || '',
      student_no: info.student_no || '',
      lesson_name: lesson.lesson_name || '',
      percent: Math.max(pct(), threshold),
      status: 'completed'
    };
    try {
      await apiPost('registerView', { item });
      markCompleted(lesson.id);
      toast('ยินดีด้วย! ดูจบแล้ว รับเกียรติบัตรได้เลย 🎉', 'success');
    } catch (err) {
      completed = false;
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
      return;
    }
    renderGate();
  }

  function tick() {
    const p = state._player;
    if (!p || !p.getDuration) return;
    const dur = p.getDuration() || 0;
    const cur = p.getCurrentTime() || 0;
    if (dur <= 0) return;
    const b = Math.min(totalBuckets - 1, Math.floor(cur / dur * totalBuckets));
    watched.add(b);
    paintProgress(pct());
    if (!teacher && pct() >= threshold) onReachComplete();
  }

  loadYouTubeAPI().then(() => {
    const mount = byId('ytPlayer');
    if (!mount) return;
    state._player = new YT.Player('ytPlayer', {
      width: '100%', height: '100%', videoId: ytId,
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onReady: () => { if (!teacher) renderGate(); },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            if (!state._trackTimer) state._trackTimer = setInterval(tick, 1000);
          } else {
            clearInterval(state._trackTimer); state._trackTimer = null;
          }
          if (e.data === YT.PlayerState.ENDED) {
            for (let i = 0; i < totalBuckets; i++) watched.add(i);  // ดูจนจบ = ครบทุกช่วง
            paintProgress(100);
            if (!teacher) onReachComplete();
          }
        }
      }
    });
  });

  if (!teacher) renderGate();   // วาดสถานะเริ่มต้นทันที (ก่อน API พร้อม)
}

// เปิดเกียรติบัตร (ดูได้เต็มจอ + พิมพ์/บันทึกเป็น PDF)
function openCertificate(lesson) {
  const info = getStudentInfo();
  const s = state.settings;
  const school = s.register_school || s.site_title || 'ห้องเรียนออนไลน์';
  const teacherName = s.about_name || '';
  const teacherRole = s.about_role || 'ครูผู้สอน';
  const dateText = formatThaiDate(new Date());
  const detail = [
    info.student_class ? ('ชั้น ' + info.student_class) : '',
    info.student_no ? ('เลขที่ ' + info.student_no) : ''
  ].filter(Boolean).join('   ');

  const old = document.getElementById('certOverlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'certOverlay';
  overlay.className = 'cert-overlay';
  overlay.innerHTML = `
    <div class="cert-toolbar no-print">
      <button class="btn btn-primary" onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button>
      <button class="btn btn-outline" onclick="closeCertificate()">ปิด</button>
    </div>
    <div class="cert-scroll">
      <div class="cert-paper" id="certPaper">
        <div class="cert-frame">
          <div class="cert-corner tl"></div><div class="cert-corner tr"></div>
          <div class="cert-corner bl"></div><div class="cert-corner br"></div>
          <div class="cert-seal">🏆</div>
          <div class="cert-school">${esc(school)}</div>
          <div class="cert-kicker">เกียรติบัตรฉบับนี้ให้ไว้เพื่อแสดงว่า</div>
          <div class="cert-name">${esc(info.student_name || 'นักเรียน')}</div>
          ${detail ? `<div class="cert-detail">${esc(detail)}</div>` : ''}
          <div class="cert-line">ได้รับชมวิดีโอบทเรียน</div>
          <div class="cert-lesson">“${esc(lesson.lesson_name || '')}”</div>
          <div class="cert-line">จนจบครบถ้วน ด้วยความตั้งใจ</div>
          <div class="cert-date">ให้ไว้ ณ ${esc(dateText)}</div>
          <div class="cert-sign">
            <div class="cert-sign-name">${esc(teacherName || '____________________')}</div>
            <div class="cert-sign-role">${esc(teacherRole)}</div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('cert-open');
}
function closeCertificate() {
  const o = document.getElementById('certOverlay');
  if (o) o.remove();
  document.body.classList.remove('cert-open');
}

/* ---- ตัวจัดการแบบทดสอบ (เฉพาะครู) ---- */
const QUIZ_MAX = 10;   // จำนวนข้อสูงสุดต่อบทเรียน

// สร้าง HTML ของคำถาม 1 ข้อในตัวแก้ไข (idx เริ่มจาก 0)
function quizCardHtml(idx, q) {
  q = q || {};
  const ch = [q.choice1, q.choice2, q.choice3, q.choice4];
  const correct = Number(q.correct) || 1;
  const choiceRows = [0, 1, 2, 3].map(i => `
    <div class="qe-choice">
      <input type="radio" name="qe_correct_${idx}" value="${i + 1}" ${correct === (i + 1) ? 'checked' : ''} title="เลือกเป็นข้อที่ถูก" />
      <input type="text" class="qe-choice-text" data-c="${i + 1}" value="${esc(ch[i] || '')}" placeholder="ตัวเลือก ${i + 1}${i < 2 ? ' (จำเป็น)' : ' (ถ้ามี)'}" />
    </div>`).join('');
  return `
    <div class="qe-card" data-idx="${idx}">
      <div class="qe-head">
        <span class="qe-num">ข้อ <b class="qe-no">${idx + 1}</b></span>
        <button type="button" class="btn btn-danger btn-sm" onclick="quizRemoveCard(this)">🗑️ ลบข้อนี้</button>
      </div>
      <textarea class="qe-question" rows="2" placeholder="พิมพ์คำถาม...">${esc(q.question || '')}</textarea>
      <div class="qe-hint">เลือกปุ่มวงกลมหน้าตัวเลือกที่เป็น "คำตอบที่ถูก" • ต้องมีตัวเลือกอย่างน้อย 2 ข้อ</div>
      ${choiceRows}
    </div>`;
}

function quizRenumber() {
  document.querySelectorAll('#qeList .qe-card').forEach((card, i) => {
    card.dataset.idx = i;
    const no = card.querySelector('.qe-no'); if (no) no.textContent = i + 1;
    card.querySelectorAll('input[type=radio]').forEach(r => { r.name = 'qe_correct_' + i; });
  });
  const cnt = document.getElementById('qeCount');
  if (cnt) cnt.textContent = document.querySelectorAll('#qeList .qe-card').length + '/' + QUIZ_MAX;
  const addBtn = document.getElementById('qeAdd');
  if (addBtn) addBtn.disabled = document.querySelectorAll('#qeList .qe-card').length >= QUIZ_MAX;
}

function quizRemoveCard(btn) {
  const card = btn.closest('.qe-card');
  if (card) card.remove();
  quizRenumber();
}

function quizAddCard() {
  const list = document.getElementById('qeList');
  if (!list) return;
  if (list.querySelectorAll('.qe-card').length >= QUIZ_MAX) { toast('เพิ่มได้สูงสุด ' + QUIZ_MAX + ' ข้อ', 'error'); return; }
  list.insertAdjacentHTML('beforeend', quizCardHtml(list.querySelectorAll('.qe-card').length, {}));
  quizRenumber();
}

async function openQuizEditor(lessonId) {
  const lesson = findLessonInCache(lessonId) || {};
  openModal('📝 จัดการแบบทดสอบ', `<div class="state"><div class="spinner"></div><p>กำลังโหลดคำถาม...</p></div>`);
  let items = [];
  try { items = await apiPost('getQuizEdit', { lesson_id: lessonId }); } catch (err) { toast(err.message, 'error'); }

  const cards = (items && items.length) ? items.map((q, i) => quizCardHtml(i, q)).join('') : '';
  $('#modalBody').innerHTML = `
    <p class="reg-formhint">แบบทดสอบของบท "<b>${esc(lesson.lesson_name || '')}</b>" — นักเรียนต้องทำผ่านเกณฑ์หลังดูวิดีโอจบ ถึงจะได้เกียรติบัตร (เกณฑ์ผ่านปรับได้ในเมนูตั้งค่า)</p>
    <div class="qe-toolbar">
      <span class="qe-counter">จำนวนข้อ: <b id="qeCount">${(items ? items.length : 0)}/${QUIZ_MAX}</b></span>
      <button type="button" class="btn btn-outline btn-sm" id="qeAdd" onclick="quizAddCard()">➕ เพิ่มคำถาม</button>
    </div>
    <div id="qeList">${cards}</div>
    <div class="form-actions">
      <button type="button" class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
      <button type="button" class="btn btn-primary" id="qeSave" onclick="saveQuizEditor('${esc(lessonId)}')">💾 บันทึกแบบทดสอบ</button>
    </div>`;
  quizRenumber();
  if (!items || !items.length) quizAddCard();   // เริ่มด้วยช่องว่าง 1 ข้อให้พิมพ์ได้เลย
}

async function saveQuizEditor(lessonId) {
  const cards = Array.from(document.querySelectorAll('#qeList .qe-card'));
  const items = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const question = card.querySelector('.qe-question').value.trim();
    const texts = Array.from(card.querySelectorAll('.qe-choice-text')).map(x => x.value.trim());
    const correctEl = card.querySelector('input[type=radio]:checked');
    const correct = correctEl ? Number(correctEl.value) : 0;

    if (!question) { toast('ข้อ ' + (i + 1) + ': ยังไม่ได้พิมพ์คำถาม', 'error'); return; }
    if (texts.filter(Boolean).length < 2) { toast('ข้อ ' + (i + 1) + ': ต้องมีตัวเลือกอย่างน้อย 2 ข้อ', 'error'); return; }
    if (!correct || !texts[correct - 1]) { toast('ข้อ ' + (i + 1) + ': กรุณาเลือกคำตอบที่ถูก (และตัวเลือกนั้นต้องไม่ว่าง)', 'error'); return; }

    items.push({ question, choice1: texts[0], choice2: texts[1], choice3: texts[2], choice4: texts[3], correct });
  }

  const btn = document.getElementById('qeSave');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    const res = await apiPost('saveQuiz', { lesson_id: lessonId, items });
    closeModal();
    toast('บันทึกแบบทดสอบแล้ว (' + (res.count || 0) + ' ข้อ)', 'success');
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false; btn.textContent = '💾 บันทึกแบบทดสอบ';
  }
}

// ส่วนรายชื่อนักเรียนที่ลงทะเบียน (เฉพาะครู) — ตัวเนื้อหาจะถูกเติมโดย refreshRoster()
function videoRosterSection(lesson) {
  if (!isTeacher()) return '';
  return `
    <div class="section-head">
      <h2>📋 นักเรียนที่ดูวิดีโอจบแล้ว <span class="count" id="rosterCount"></span></h2>
      <button class="btn btn-outline btn-sm" onclick="refreshRoster('${esc(lesson.id)}')">🔄 รีเฟรช</button>
    </div>
    <div id="viewRoster" class="view-roster">
      <div class="state"><div class="spinner"></div><p>กำลังโหลดรายชื่อ...</p></div>
    </div>`;
}

// โหลดรายชื่อจากเซิร์ฟเวอร์ (ต้องเป็นครู) แล้ววาดลงในกล่อง
async function refreshRoster(lessonId) {
  const box = document.getElementById('viewRoster');
  if (box) box.innerHTML = `<div class="state"><div class="spinner"></div><p>กำลังโหลดรายชื่อ...</p></div>`;
  try {
    const list = await apiPost('getViews', { lesson_id: lessonId });
    renderRoster(lessonId, list || []);
  } catch (err) {
    if (box) box.innerHTML = viewError(err.message);
  }
}

function renderRoster(lessonId, list) {
  const box = document.getElementById('viewRoster');
  const cnt = document.getElementById('rosterCount');
  if (cnt) cnt.textContent = '(' + list.length + ' คน)';
  if (!box) return;
  if (!list.length) {
    box.innerHTML = viewEmpty('🙋', 'ยังไม่มีนักเรียนดูจบ', 'เมื่อนักเรียนดูวิดีโอจนครบเกณฑ์ รายชื่อจะมาแสดงที่นี่อัตโนมัติ');
    return;
  }
  box.innerHTML = `
    <div class="roster-table">
      <div class="roster-head"><span>#</span><span>ชื่อ-นามสกุล</span><span>ชั้น/ห้อง</span><span>เลขที่</span><span>สถานะ</span><span>เวลา</span><span></span></div>
      ${list.map((v, i) => {
        const done = String(v.status || 'completed') === 'completed';
        const p = Number(v.percent) || 0;
        const statusHtml = done ? '<span class="tag-done">✅ ดูจบ</span>' : ('👀 ' + p + '%');
        return `
        <div class="roster-row">
          <span class="r-no">${i + 1}</span>
          <span class="r-name">${esc(v.student_name || '-')}</span>
          <span>${esc(v.student_class || '-')}</span>
          <span>${esc(v.student_no || '-')}</span>
          <span class="r-status">${statusHtml}</span>
          <span class="r-date">${esc(v.date || '')}</span>
          <span class="r-act"><button class="btn btn-danger btn-sm" onclick="confirmDeleteView('${esc(v.id)}','${esc(lessonId)}')">🗑️</button></span>
        </div>`;
      }).join('')}
    </div>`;
}

function confirmDeleteView(id, lessonId) {
  openConfirm('ต้องการลบรายการนี้?', 'รายการที่เลือก', '', async () => {
    await apiPost('deleteView', { id });
    refreshRoster(lessonId);
  });
}


/* ============================================================================
   13) หน้าตั้งค่าเว็บไซต์ (เฉพาะครู)
   ============================================================================ */
async function renderSettings() {
  if (!isTeacher()) { toast('กรุณาเข้าสู่ระบบครูก่อน', 'error'); location.hash = ''; return; }
  loaderSet(30);
  app.innerHTML = viewSkeleton();
  try { await loadCore(true); } catch (err) { app.innerHTML = viewError(err.message); loaderDone(); return; }

  const s = state.settings;
  app.innerHTML = `
    <nav class="crumbs"><a href="#">หน้าหลัก</a><span class="sep">›</span><span>ตั้งค่าเว็บไซต์</span></nav>
    <div class="section-head"><h2>⚙️ ตั้งค่าเว็บไซต์</h2></div>
    <div style="max-width:620px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:24px">
      <form id="settingsForm" novalidate>
        <div class="field">
          <label>ชื่อเว็บไซต์ <span class="req">*</span></label>
          <input name="site_title" value="${esc(s.site_title || '')}" placeholder="เช่น ห้องเรียนครูใจดี" />
          <div class="err">กรุณากรอกชื่อเว็บไซต์</div>
        </div>
        <div class="field">
          <label>คำโปรย (ข้อความต้อนรับใต้ชื่อ)</label>
          <textarea name="site_subtitle" placeholder="เช่น ยินดีต้อนรับสู่ห้องเรียนออนไลน์">${esc(s.site_subtitle || '')}</textarea>
        </div>
        ${imageField('site_cover_image', 'รูปปกเว็บหลัก (รูปที่ 1)', s.site_cover_image)}
        ${imageField('site_cover_image2', 'รูปปกเว็บ (รูปที่ 2) — ใส่เพิ่มเพื่อให้สลับอัตโนมัติ', s.site_cover_image2)}
        ${imageField('site_cover_image3', 'รูปปกเว็บ (รูปที่ 3)', s.site_cover_image3)}
        <div class="field">
          <label>สลับรูปปกอัตโนมัติทุกกี่วินาที</label>
          <input type="number" name="cover_interval" min="2" max="60" step="1" value="${esc(s.cover_interval || 5)}" />
          <div class="hint">มีผลเมื่อใส่รูปปกมากกว่า 1 รูป — แนะนำ 4–7 วินาที (ต่ำสุด 2, สูงสุด 60)</div>
        </div>
        <div class="row2">
          <div class="field">
            <label>สีหลัก</label>
            <div class="color-field"><input type="color" name="primary_color" value="${esc(s.primary_color || '#4f8cff')}" /><input type="text" name="primary_color_text" value="${esc(s.primary_color || '#4f8cff')}" /></div>
          </div>
          <div class="field">
            <label>สีรอง</label>
            <div class="color-field"><input type="color" name="accent_color" value="${esc(s.accent_color || '#ff7eb6')}" /><input type="text" name="accent_color_text" value="${esc(s.accent_color || '#ff7eb6')}" /></div>
          </div>
        </div>
        <div class="field">
          <label>ข้อความท้ายเว็บ (Footer)</label>
          <input name="footer_text" value="${esc(s.footer_text || '')}" placeholder="เช่น จัดทำด้วยใจ เพื่อการเรียนรู้" />
        </div>

        <div class="settings-divider">📺 การดูวิดีโอ & เกียรติบัตร</div>
        <div class="field">
          <label>ระบบดูวิดีโอจบเพื่อรับเกียรติบัตร</label>
          <select name="register_enabled">
            <option value="yes" ${(s.register_enabled || 'yes') === 'yes' ? 'selected' : ''}>เปิด (นักเรียนต้องดูจบถึงมีชื่อ + รับเกียรติบัตร)</option>
            <option value="no" ${s.register_enabled === 'no' ? 'selected' : ''}>ปิด (ดูวิดีโออย่างเดียว ไม่ต้องบันทึก)</option>
          </select>
        </div>
        <div class="field">
          <label>ชื่อโรงเรียน/กลุ่ม (แสดงในหน้าวิดีโอและบนเกียรติบัตร)</label>
          <input name="register_school" value="${esc(s.register_school || '')}" placeholder="เช่น โรงเรียนนิคมสร้างตนเอง 3" />
          <div class="hint">ถ้าเว้นว่างจะใช้ชื่อเว็บไซต์แทน</div>
        </div>
        <div class="row2">
          <div class="field">
            <label>เกณฑ์การดูจบ (%)</label>
            <input type="number" name="register_complete_pct" min="50" max="100" step="1" value="${esc(s.register_complete_pct || 90)}" />
            <div class="hint">ต้องดูถึงกี่ % จึงนับว่า "ดูจบ" — แนะนำ 90% (ต่ำสุด 50, สูงสุด 100)</div>
          </div>
          <div class="field">
            <label>มอบเกียรติบัตรเมื่อดูจบ</label>
            <select name="cert_enabled">
              <option value="yes" ${(s.cert_enabled || 'yes') === 'yes' ? 'selected' : ''}>เปิด (มีปุ่มรับเกียรติบัตร)</option>
              <option value="no" ${s.cert_enabled === 'no' ? 'selected' : ''}>ปิด</option>
            </select>
            <div class="hint">เกียรติบัตรใช้ชื่อครูจาก "เกี่ยวกับผู้สอน" ด้านล่าง</div>
          </div>
        </div>
        <div class="field">
          <label>เกณฑ์ผ่านแบบทดสอบ (%)</label>
          <input type="number" name="quiz_pass_pct" min="0" max="100" step="1" value="${esc(s.quiz_pass_pct || 70)}" />
          <div class="hint">ถ้าบทเรียนมีแบบทดสอบ นักเรียนต้องทำได้ถึง % นี้ถึงจะ "ดูจบ" และรับเกียรติบัตร — แนะนำ 70% (บทที่ไม่มีแบบทดสอบ ดูจบก็ผ่านเลย)</div>
        </div>

        <div class="settings-divider">👩‍🏫 เกี่ยวกับผู้สอน</div>
        <div class="row2">
          <div class="field"><label>ชื่อผู้สอน</label><input name="about_name" value="${esc(s.about_name || '')}" placeholder="เช่น ครูนก" /></div>
          <div class="field"><label>ตำแหน่ง/บทบาท</label><input name="about_role" value="${esc(s.about_role || '')}" placeholder="เช่น ครูผู้สอนวิชาคณิตศาสตร์" /></div>
        </div>
        ${imageField('about_photo', 'รูปผู้สอน', s.about_photo)}
        <div class="field"><label>แนะนำตัว / ข้อความถึงนักเรียน</label><textarea name="about_text" placeholder="เล่าสั้น ๆ เกี่ยวกับตัวครูหรือห้องเรียนนี้">${esc(s.about_text || '')}</textarea></div>

        <div class="settings-divider">🔗 ช่องทางติดตาม</div>
        <div class="row2">
          <div class="field"><label>Facebook (ลิงก์)</label><input name="social_facebook" value="${esc(s.social_facebook || '')}" placeholder="https://facebook.com/..." /></div>
          <div class="field"><label>LINE (ลิงก์/Add friend)</label><input name="social_line" value="${esc(s.social_line || '')}" placeholder="https://line.me/..." /></div>
        </div>
        <div class="row2">
          <div class="field"><label>YouTube (ลิงก์)</label><input name="social_youtube" value="${esc(s.social_youtube || '')}" placeholder="https://youtube.com/..." /></div>
          <div class="field"><label>อีเมล</label><input name="social_email" value="${esc(s.social_email || '')}" placeholder="teacher@email.com" /></div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-outline" onclick="location.hash=''">ยกเลิก</button>
          <button type="submit" class="btn btn-primary">💾 บันทึกการตั้งค่า</button>
        </div>
      </form>
    </div>
  `;
  loaderDone();

  wireImageField('site_cover_image');
  wireImageField('site_cover_image2');
  wireImageField('site_cover_image3');
  wireImageField('about_photo');
  ['primary_color', 'accent_color'].forEach(name => {
    const c = app.querySelector(`[name=${name}]`), t = app.querySelector(`[name=${name}_text]`);
    c.addEventListener('input', () => t.value = c.value);
    t.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(t.value)) c.value = t.value; });
  });

  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const title = f.elements.site_title.value.trim();
    f.closest('div').querySelector('.field').classList.toggle('invalid', !title);
    if (!title) { toast('กรุณากรอกชื่อเว็บไซต์', 'error'); return; }

    const settings = {
      site_title: title,
      site_subtitle: f.elements.site_subtitle.value.trim(),
      site_cover_image: f.elements.site_cover_image.value.trim(),
      site_cover_image2: f.elements.site_cover_image2.value.trim(),
      site_cover_image3: f.elements.site_cover_image3.value.trim(),
      cover_interval: Math.max(2, Math.min(60, Number(f.elements.cover_interval.value) || 5)),
      primary_color: f.elements.primary_color.value,
      accent_color: f.elements.accent_color.value,
      footer_text: f.elements.footer_text.value.trim(),
      register_enabled: f.elements.register_enabled.value,
      register_school: f.elements.register_school.value.trim(),
      register_complete_pct: Math.max(50, Math.min(100, Number(f.elements.register_complete_pct.value) || 90)),
      cert_enabled: f.elements.cert_enabled.value,
      quiz_pass_pct: Math.max(0, Math.min(100, Number(f.elements.quiz_pass_pct.value) || 70)),
      about_name: f.elements.about_name.value.trim(),
      about_role: f.elements.about_role.value.trim(),
      about_photo: f.elements.about_photo.value.trim(),
      about_text: f.elements.about_text.value.trim(),
      social_facebook: f.elements.social_facebook.value.trim(),
      social_line: f.elements.social_line.value.trim(),
      social_youtube: f.elements.social_youtube.value.trim(),
      social_email: f.elements.social_email.value.trim()
    };
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
    try {
      state.settings = await apiPost('saveSettings', { settings });
      applyTheme();
      toast('บันทึกการตั้งค่าแล้ว', 'success');
      location.hash = '';
    } catch (err) {
      toast(err.message, 'error'); btn.disabled = false; btn.textContent = '💾 บันทึกการตั้งค่า';
    }
  });
}

/* ============================================================================
   14) ช่องใส่รูป (ใช้ลิงก์ หรือ อัปโหลดไฟล์ขึ้น Drive)
   ============================================================================ */
function imageField(name, label, value) {
  const v = value || '';
  return `
    <div class="field image-field" data-field="${name}">
      <label>${esc(label)}</label>
      <div class="img-row">
        <input name="${name}" value="${esc(v)}" placeholder="วางลิงก์รูป หรือกดอัปโหลด →" />
        <button type="button" class="btn btn-ghost" data-upload="${name}">📤 อัปโหลด</button>
        <input type="file" accept="image/*" data-file="${name}" hidden />
      </div>
      <div class="uploading" data-uploading="${name}">⏳ กำลังอัปโหลดรูป...</div>
      <div class="image-preview ${v ? 'show' : ''}" data-preview="${name}">${v ? `<img src="${esc(imgUrl(v))}" alt="" />` : ''}</div>
      <div class="hint">ใส่ลิงก์รูปได้ทันที หรือกดอัปโหลดไฟล์เพื่อเก็บลง Google Drive โดยอัตโนมัติ</div>
    </div>`;
}

// เชื่อมการทำงานของช่องรูป (ต้องเรียกหลังใส่ HTML ลงหน้าแล้ว)
function wireImageField(name, container) {
  const root = container || document;
  const input = root.querySelector(`[name=${name}]`);
  const fileInput = root.querySelector(`[data-file="${name}"]`);
  const uploadBtn = root.querySelector(`[data-upload="${name}"]`);
  const preview = root.querySelector(`[data-preview="${name}"]`);
  const uploading = root.querySelector(`[data-uploading="${name}"]`);
  if (!input) return;

  function showPreview(url) {
    if (url) { preview.innerHTML = `<img src="${esc(imgUrl(url))}" alt="" onerror="this.parentNode.classList.remove('show')" />`; preview.classList.add('show'); }
    else { preview.innerHTML = ''; preview.classList.remove('show'); }
  }
  input.addEventListener('input', () => showPreview(input.value.trim()));
  uploadBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 8MB กรุณาเลือกรูปเล็กลง', 'error'); return; }
    uploading.classList.add('show'); uploadBtn.disabled = true;
    try {
      const base64 = await fileToBase64(file);
      const res = await apiPost('uploadImage', { base64, mimeType: file.type, filename: file.name });
      input.value = res.url; showPreview(res.url);
      toast('อัปโหลดรูปสำเร็จ', 'success');
    } catch (err) {
      toast('อัปโหลดไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      uploading.classList.remove('show'); uploadBtn.disabled = false; fileInput.value = '';
    }
  });
}

// แปลงไฟล์รูปเป็นข้อความ base64 (ตัดส่วนหัว data:...;base64, ออก)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    r.readAsDataURL(file);
  });
}

/* ============================================================================
   15) ฟอร์มเพิ่ม/แก้ไข วิชา
   ============================================================================ */
function openSubjectForm(id) {
  const sub = id ? state.subjects.find(x => x.id === id) : {};
  const isEdit = !!id;
  openModal(isEdit ? 'แก้ไขวิชา' : 'เพิ่มวิชาใหม่', `
    <form id="subjectForm" novalidate>
      <div class="row2">
        <div class="field"><label>ชื่อวิชา <span class="req">*</span></label><input name="subject_name" value="${esc(sub.subject_name || '')}" placeholder="เช่น คณิตศาสตร์" /><div class="err">กรุณากรอกชื่อวิชา</div></div>
        <div class="field"><label>ระดับชั้น <span class="req">*</span></label><input name="grade" value="${esc(sub.grade || '')}" placeholder="เช่น ป.4" /><div class="err">กรุณากรอกระดับชั้น</div></div>
      </div>
      <div class="row2">
        <div class="field"><label>ไอคอน (อีโมจิ)</label><input name="icon" value="${esc(sub.icon || '📘')}" placeholder="📐" /><div class="hint">เปิดคีย์บอร์ดอีโมจิแล้วเลือกได้เลย</div></div>
        <div class="field"><label>สีประจำวิชา</label><div class="color-field"><input type="color" name="color" value="${esc(sub.color || '#4f8cff')}" /></div></div>
      </div>
      ${imageField('cover_image', 'รูปปกวิชา', sub.cover_image)}
      <div class="row2">
        <div class="field"><label>ลำดับการแสดง</label><input type="number" name="order" value="${esc(sub.order || (state.subjects.length + 1))}" /><div class="hint">เลขน้อยอยู่ก่อน</div></div>
        <div class="field"><label>การแสดงผล</label><select name="status"><option value="active" ${(sub.status||'active')==='active'?'selected':''}>แสดง (เปิด)</option><option value="inactive" ${sub.status==='inactive'?'selected':''}>ซ่อน (ปิด)</option></select></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มวิชา'}</button>
      </div>
    </form>
  `);
  wireImageField('cover_image', $('#modalBody'));
  $('#subjectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.elements.subject_name.value.trim(), grade = f.elements.grade.value.trim();
    f.elements.subject_name.closest('.field').classList.toggle('invalid', !name);
    f.elements.grade.closest('.field').classList.toggle('invalid', !grade);
    if (!name || !grade) return;

    const item = {
      id: sub.id || '', subject_name: name, grade,
      icon: f.elements.icon.value.trim() || '📘', color: f.elements.color.value,
      cover_image: f.elements.cover_image.value.trim(),
      order: Number(f.elements.order.value) || 0, status: f.elements.status.value
    };
    await submitForm(f, () => apiPost('saveSubject', { item }), 'บันทึกวิชาแล้ว', () => { invalidateCache(); renderHome(); });
  });
}

/* ============================================================================
   16) ฟอร์มเพิ่ม/แก้ไข บทเรียน
   ============================================================================ */
function openLessonForm(id, subjectId) {
  const lesson = id ? findLessonInCache(id) || {} : {};
  const sid = subjectId || lesson.subject_id || '';
  const isEdit = !!id;
  const subjectOptions = state.subjects.map(s =>
    `<option value="${esc(s.id)}" ${s.id === sid ? 'selected' : ''}>${esc(s.subject_name)} ${esc(s.grade)}</option>`).join('');

  openModal(isEdit ? 'แก้ไขบทเรียน' : 'เพิ่มบทเรียนใหม่', `
    <form id="lessonForm" novalidate>
      <div class="field"><label>วิชาที่สังกัด <span class="req">*</span></label><select name="subject_id">${subjectOptions}</select></div>
      <div class="field"><label>ชื่อบทเรียน <span class="req">*</span></label><input name="lesson_name" value="${esc(lesson.lesson_name || '')}" placeholder="เช่น เศษส่วน" /><div class="err">กรุณากรอกชื่อบทเรียน</div></div>
      <div class="field"><label>คำอธิบาย</label><textarea name="description" placeholder="อธิบายสั้นๆ ว่าบทเรียนนี้เกี่ยวกับอะไร">${esc(lesson.description || '')}</textarea></div>
      <div class="field">
        <label>ชนิดเนื้อหา</label>
        <select name="link_type" id="lf_type">
          <option value="lesson" ${(lesson.link_type||'lesson')==='lesson'?'selected':''}>บทเรียนออนไลน์ (กดแล้วเปิดแท็บใหม่)</option>
          <option value="video" ${lesson.link_type==='video'?'selected':''}>วิดีโอ YouTube (ฝังให้ดูในหน้านี้ + ให้นักเรียนลงทะเบียน)</option>
        </select>
      </div>
      <div class="field"><label id="lf_link_label">ลิงก์เข้าเรียน <span class="req">*</span></label><input name="link" id="lf_link" value="${esc(lesson.link || '')}" placeholder="https://..." /><div class="err">กรุณากรอกลิงก์ (ขึ้นต้นด้วย http)</div><div class="hint" id="lf_link_hint"></div></div>
      ${imageField('cover_image', 'รูปปกบทเรียน', lesson.cover_image)}
      <div class="row2">
        <div class="field"><label>ลำดับการแสดง</label><input type="number" name="order" value="${esc(lesson.order || 1)}" /></div>
        <div class="field"><label>การแสดงผล</label><select name="status"><option value="active" ${(lesson.status||'active')==='active'?'selected':''}>แสดง (เปิด)</option><option value="inactive" ${lesson.status==='inactive'?'selected':''}>ซ่อน (ปิด)</option></select></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มบทเรียน'}</button>
      </div>
    </form>
  `);
  wireImageField('cover_image', $('#modalBody'));
  // ปรับป้ายช่องลิงก์ตามชนิดเนื้อหา + เตือนถ้าวิดีโอไม่ใช่ลิงก์ YouTube
  const typeSel = $('#lf_type'), linkLabel = $('#lf_link_label'), linkInput = $('#lf_link'), linkHint = $('#lf_link_hint');
  function syncLinkUI() {
    const v = typeSel.value;
    if (v === 'video') {
      linkLabel.innerHTML = 'ลิงก์วิดีโอ YouTube <span class="req">*</span>';
      linkInput.placeholder = 'เช่น https://youtu.be/xxxx หรือ https://www.youtube.com/watch?v=xxxx';
      const ok = !linkInput.value.trim() || !!youtubeEmbedUrl(linkInput.value);
      linkHint.textContent = ok ? 'ลิงก์ YouTube จะฝังเล่นในหน้าบทเรียนให้นักเรียนดูได้เลย' : '⚠️ ไม่ใช่ลิงก์ YouTube ที่ฝังได้ ระบบจะแสดงเป็นปุ่ม "ดูวิดีโอ" เปิดแท็บใหม่แทน';
      linkHint.style.color = ok ? 'var(--ink-soft)' : '#d97706';
    } else {
      linkLabel.innerHTML = 'ลิงก์เข้าเรียน <span class="req">*</span>';
      linkInput.placeholder = 'https://...';
      linkHint.textContent = 'กดปุ่ม "เข้าเรียน" แล้วจะเปิดลิงก์นี้ในแท็บใหม่';
      linkHint.style.color = 'var(--ink-soft)';
    }
  }
  typeSel.addEventListener('change', syncLinkUI);
  linkInput.addEventListener('input', syncLinkUI);
  syncLinkUI();
  $('#lessonForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.elements.lesson_name.value.trim(), link = f.elements.link.value.trim();
    const linkOk = /^https?:\/\//i.test(link);
    f.elements.lesson_name.closest('.field').classList.toggle('invalid', !name);
    f.elements.link.closest('.field').classList.toggle('invalid', !linkOk);
    if (!name || !linkOk) return;

    const item = {
      id: lesson.id || '', subject_id: f.elements.subject_id.value,
      lesson_name: name, description: f.elements.description.value.trim(), link,
      link_type: f.elements.link_type.value,
      cover_image: f.elements.cover_image.value.trim(),
      order: Number(f.elements.order.value) || 0, status: f.elements.status.value
    };
    await submitForm(f, () => apiPost('saveLesson', { item }), 'บันทึกบทเรียนแล้ว', () => {
      invalidateCache();        // ให้โหลดบทเรียนชุดใหม่รอบหน้า
      renderSubject(item.subject_id);
    });
  });
}

/* ============================================================================
   17) ฟอร์มเพิ่ม/แก้ไข ผลงานนักเรียน
   ============================================================================ */
function openWorkForm(id, lessonId) {
  const work = id ? (state.worksCache[lessonId] || []).find(w => w.id === id) || {} : {};
  const isEdit = !!id;
  openModal(isEdit ? 'แก้ไขผลงานนักเรียน' : 'เพิ่มผลงานนักเรียน', `
    <form id="workForm" novalidate>
      <div class="field"><label>ชื่อนักเรียน <span class="req">*</span></label><input name="student_name" value="${esc(work.student_name || '')}" placeholder="เช่น น้องมานี" /><div class="err">กรุณากรอกชื่อนักเรียน</div></div>
      <div class="field"><label>ชื่อผลงาน <span class="req">*</span></label><input name="work_title" value="${esc(work.work_title || '')}" placeholder="เช่น สมุดภาพเศษส่วน" /><div class="err">กรุณากรอกชื่อผลงาน</div></div>
      <div class="field"><label>ลิงก์ผลงาน</label><input name="work_link" value="${esc(work.work_link || '')}" placeholder="https://... (ถ้ามี)" /></div>
      ${imageField('image', 'รูปผลงาน', work.image)}
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-accent">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มผลงาน'}</button>
      </div>
    </form>
  `);
  wireImageField('image', $('#modalBody'));
  $('#workForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.elements.student_name.value.trim(), title = f.elements.work_title.value.trim();
    f.elements.student_name.closest('.field').classList.toggle('invalid', !name);
    f.elements.work_title.closest('.field').classList.toggle('invalid', !title);
    if (!name || !title) return;

    const today = new Date().toISOString().slice(0, 10);
    const item = {
      id: work.id || '', lesson_id: lessonId,
      student_name: name, work_title: title,
      work_link: f.elements.work_link.value.trim(), image: f.elements.image.value.trim(),
      date: work.date || today
    };
    await submitForm(f, () => apiPost('saveWork', { item }), 'บันทึกผลงานแล้ว', () => {
      state.worksCache[lessonId] = []; renderLesson(lessonId);
    });
  });
}

/* ============================================================================
   17.5) ฟอร์มเพิ่ม/แก้ไข ประชาสัมพันธ์
   ============================================================================ */
function openAnnounceForm(id) {
  const a = id ? state.announcements.find(x => x.id === id) || {} : {};
  const isEdit = !!id;
  const today = toDateInputValue(new Date());
  const pinned = String(a.pin).toLowerCase() === 'yes' || a.pin === true;
  openModal(isEdit ? 'แก้ไขประกาศ' : 'เพิ่มประกาศใหม่', `
    <form id="announceForm" novalidate>
      <div class="field"><label>หัวข้อประกาศ <span class="req">*</span></label><input name="title" value="${esc(a.title || '')}" placeholder="เช่น เปิดบทเรียนใหม่ / แจ้งสอบ" /><div class="err">กรุณากรอกหัวข้อ</div></div>
      <div class="field"><label>รายละเอียด</label><textarea name="detail" placeholder="ข้อความที่อยากแจ้งนักเรียน/ผู้ปกครอง">${esc(a.detail || '')}</textarea></div>
      <div class="row2">
        <div class="field"><label>วันที่</label><input type="date" name="date" value="${esc(toDateInputValue(a.date) || today)}" /></div>
        <div class="field"><label>การแสดงผล</label><select name="status"><option value="active" ${(a.status||'active')==='active'?'selected':''}>แสดง (เปิด)</option><option value="inactive" ${a.status==='inactive'?'selected':''}>ซ่อน (ปิด)</option></select></div>
      </div>
      <div class="field check-field"><label><input type="checkbox" name="pin" ${pinned ? 'checked' : ''} /> 📌 ปักหมุดให้อยู่บนสุด</label></div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มประกาศ'}</button>
      </div>
    </form>
  `);
  $('#announceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const title = f.elements.title.value.trim();
    f.elements.title.closest('.field').classList.toggle('invalid', !title);
    if (!title) return;
    const item = {
      id: a.id || '', title,
      detail: f.elements.detail.value.trim(),
      date: f.elements.date.value || today,
      pin: f.elements.pin.checked ? 'yes' : 'no',
      status: f.elements.status.value
    };
    await submitForm(f, () => apiPost('saveAnnounce', { item }), 'บันทึกประกาศแล้ว', () => {
      invalidateCache(); renderHome();
    });
  });
}


/* ============================================================================
   18) ตัวช่วยส่งฟอร์ม (กันกดซ้ำ + แจ้งเตือน + รีเฟรชหน้า)
   ============================================================================ */
async function submitForm(form, apiCall, successMsg, after) {
  const btn = form.querySelector('button[type=submit]');
  const oldText = btn.textContent;
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    await apiCall();
    closeModal();
    toast(successMsg, 'success');
    if (after) after();
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false; btn.textContent = oldText;
  }
}

/* ============================================================================
   19) ยืนยันก่อนลบ
   ============================================================================ */
function openConfirm(title, name, warn, onYes) {
  openModal('ยืนยันการลบ', `
    <div class="confirm-box">
      <div class="big">🗑️</div>
      <p>${esc(title)}</p>
      <p class="name">"${esc(name)}"</p>
      ${warn ? `<p style="color:#d8453b;margin-top:8px">⚠️ ${esc(warn)}</p>` : ''}
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
      <button type="button" class="btn btn-danger" id="confirmYes">ใช่ ลบเลย</button>
    </div>
  `);
  $('#confirmYes').onclick = async () => {
    const btn = $('#confirmYes'); btn.disabled = true; btn.textContent = 'กำลังลบ...';
    try { await onYes(); closeModal(); toast('ลบเรียบร้อยแล้ว', 'success'); }
    catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'ใช่ ลบเลย'; }
  };
}

function confirmDeleteSubject(id) {
  const sub = state.subjects.find(x => x.id === id) || {};
  openConfirm('ต้องการลบวิชานี้ใช่ไหม?', sub.subject_name + ' ' + (sub.grade || ''),
    'บทเรียนและผลงานทั้งหมดในวิชานี้จะถูกลบไปด้วย', async () => {
      await apiPost('deleteSubject', { id });
      invalidateCache(); renderHome();
    });
}
function confirmDeleteLesson(id, subjectId) {
  const lesson = findLessonInCache(id) || {};
  openConfirm('ต้องการลบบทเรียนนี้ใช่ไหม?', lesson.lesson_name || '',
    'ผลงานนักเรียนในบทเรียนนี้จะถูกลบไปด้วย', async () => {
      await apiPost('deleteLesson', { id });
      invalidateCache(); renderSubject(subjectId);
    });
}
function confirmDeleteWork(id, lessonId) {
  const work = (state.worksCache[lessonId] || []).find(w => w.id === id) || {};
  openConfirm('ต้องการลบผลงานนี้ใช่ไหม?', work.work_title || '', '', async () => {
    await apiPost('deleteWork', { id });
    state.worksCache[lessonId] = []; renderLesson(lessonId);
  });
}
function confirmDeleteAnnounce(id) {
  const a = state.announcements.find(x => x.id === id) || {};
  openConfirm('ต้องการลบประกาศนี้ใช่ไหม?', a.title || '', '', async () => {
    await apiPost('deleteAnnounce', { id });
    invalidateCache(); renderHome();
  });
}

/* ============================================================================
   20) เริ่มทำงาน
   ============================================================================ */
applyAuthUI();
router();
