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

const isTeacher = () => !!state.token;

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
  if (params.get('lesson')) return renderLesson(params.get('lesson'));
  if (params.get('subject')) return renderSubject(params.get('subject'));
  return renderHome();
}
window.addEventListener('hashchange', router);

// โหลด settings + subjects (ครั้งแรก หรือบังคับโหลดใหม่)
async function loadCore(force) {
  if (force || !state.subjects.length || !Object.keys(state.settings).length) {
    const [settings, subjects] = await Promise.all([apiGet('getSettings'), apiGet('getSubjects')]);
    state.settings = settings || {};
    state.subjects = (subjects || []).sort(byOrder);
    applyTheme();
  }
}

/* ============================================================================
   10) หน้าแรก — Hero + ตารางวิชา
   ============================================================================ */
async function renderHome() {
  app.innerHTML = viewSkeleton();
  try {
    await loadCore(true);
  } catch (err) { app.innerHTML = viewError(err.message); return; }

  const s = state.settings;
  // สร้าง hero — กลับมาเป็นแบบเดิม: รูปเป็นพื้นหลัง + เฉดสีโปร่งแสงทาบ + ข้อความหัวเรื่องทับ
  // ตกแต่งด้วยเลเยอร์ "เครือข่ายเทคโนโลยีขยับได้" (โหนด/เส้นข้อมูลวิ่ง) ให้ดูไฮเทค
  const cover = imgUrl(s.site_cover_image);
  let heroStyle = '';
  if (cover) {
    const c1 = hexToRgba(s.primary_color || '#4f8cff', .72);
    const c2 = hexToRgba(s.accent_color || '#ff7eb6', .72);
    heroStyle = `style="background-image:linear-gradient(135deg,${c1},${c2}),url('${esc(cover)}')"`;
  }
  const heroHtml = `
    <section class="hero hero-tech" ${heroStyle}>
      ${techHeroLayer()}
      <span class="hero-pill">📚 ห้องเรียนออนไลน์</span>
      <h1 class="hero-title">${esc(s.site_title || 'ห้องเรียนออนไลน์')}</h1>
      <p class="hero-sub">${esc(s.site_subtitle || '')}</p>
    </section>`;

  // เลือกวิชาที่จะแสดง: นักเรียนเห็นเฉพาะ active / ครูเห็นทั้งหมด
  const subjects = state.subjects.filter(x => isTeacher() || (x.status || 'active') === 'active');

  let cardsHtml;
  if (!subjects.length) {
    cardsHtml = viewEmpty('🌱', 'ยังไม่มีวิชา', isTeacher() ? 'กดปุ่ม "เพิ่มวิชา" เพื่อเริ่มต้น' : 'คุณครูกำลังเตรียมบทเรียนอยู่ แวะมาใหม่นะ');
  } else {
    cardsHtml = `<div class="grid">${subjects.map((sub, i) => subjectCard(sub, i)).join('')}</div>`;
  }

  app.innerHTML = `
    ${heroHtml}

    <div class="section-head">
      <h2>วิชาทั้งหมด <span class="count">(${subjects.length})</span></h2>
      <button class="btn btn-primary teacher-only" onclick="openSubjectForm()">➕ เพิ่มวิชา</button>
    </div>
    ${cardsHtml}
  `;
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
  app.innerHTML = viewSkeleton();
  try {
    await loadCore();
    const lessons = await apiGet('getLessons', { subject_id: subjectId });
    state.lessonsCache[subjectId] = (lessons || []).sort(byOrder);
  } catch (err) { app.innerHTML = viewError(err.message); return; }

  const sub = state.subjects.find(x => x.id === subjectId);
  if (!sub) { app.innerHTML = viewEmpty('🔍', 'ไม่พบวิชานี้', 'อาจถูกลบไปแล้ว'); return; }

  const lessons = state.lessonsCache[subjectId].filter(x => isTeacher() || (x.status || 'active') === 'active');

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
}

// การ์ดบทเรียน 1 ใบ
function lessonCard(l, i) {
  const cover = imgUrl(l.cover_image);
  const coverHtml = cover
    ? `<img src="${esc(cover)}" alt="${esc(l.lesson_name)}" loading="lazy" onerror="this.parentNode.classList.add('gradient');this.remove()" />`
    : `<span class="placeholder">📖</span>`;
  const cls = (l.status || 'active') !== 'active' ? 'card inactive' : 'card';
  return `
    <div class="${cls}" style="animation-delay:${i * 60}ms" onclick="goLesson('${esc(l.id)}')" tabindex="0" onkeydown="if(event.key==='Enter')goLesson('${esc(l.id)}')">
      <div class="card-cover ${cover ? '' : 'gradient'}">${coverHtml}</div>
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
   12) หน้าบทเรียน — รายละเอียด + ปุ่มเข้าเรียน + ผลงานนักเรียน
   ============================================================================ */
async function renderLesson(lessonId) {
  app.innerHTML = viewSkeleton();
  let lesson, works;
  try {
    await loadCore();
    // หาบทเรียน: ลองจาก cache ก่อน ไม่มีค่อยโหลดทุกวิชา
    lesson = findLessonInCache(lessonId);
    if (!lesson) {
      // โหลดบทเรียนของทุกวิชาเพื่อหา (กรณีเข้าลิงก์ตรง)
      for (const sub of state.subjects) {
        const ls = await apiGet('getLessons', { subject_id: sub.id });
        state.lessonsCache[sub.id] = (ls || []).sort(byOrder);
      }
      lesson = findLessonInCache(lessonId);
    }
    if (!lesson) { app.innerHTML = viewEmpty('🔍', 'ไม่พบบทเรียนนี้', 'อาจถูกลบไปแล้ว'); return; }
    works = await apiGet('getWorks', { lesson_id: lessonId });
    state.worksCache[lessonId] = works || [];
  } catch (err) { app.innerHTML = viewError(err.message); return; }

  const sub = state.subjects.find(x => x.id === lesson.subject_id) || {};
  const cover = imgUrl(lesson.cover_image);
  const link = lesson.link ? esc(lesson.link) : '';

  let worksHtml;
  if (!works.length) {
    worksHtml = viewEmpty('🎨', 'ยังไม่มีผลงานนักเรียน', isTeacher() ? 'กดปุ่ม "เพิ่มผลงาน" เพื่อเริ่ม' : 'รอชมผลงานเร็วๆ นี้');
  } else {
    worksHtml = `<div class="works-grid">${works.map((w, i) => workCard(w, i)).join('')}</div>`;
  }

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
          ${link ? `<a class="btn btn-primary" href="${link}" target="_blank" rel="noopener">🚀 เข้าเรียนบทนี้</a>` : `<span class="btn btn-outline" style="cursor:default">ยังไม่มีลิงก์บทเรียน</span>`}
          <button class="btn btn-outline teacher-only" onclick="openLessonForm('${esc(lesson.id)}','${esc(lesson.subject_id)}')">✏️ แก้ไขบทเรียน</button>
        </div>
      </div>
    </section>

    <div class="section-head">
      <h2>🎨 ผลงานนักเรียน <span class="count">(${works.length})</span></h2>
      <button class="btn btn-accent teacher-only" onclick="openWorkForm(null,'${esc(lesson.id)}')">➕ เพิ่มผลงาน</button>
    </div>
    ${worksHtml}
  `;
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
   13) หน้าตั้งค่าเว็บไซต์ (เฉพาะครู)
   ============================================================================ */
async function renderSettings() {
  if (!isTeacher()) { toast('กรุณาเข้าสู่ระบบครูก่อน', 'error'); location.hash = ''; return; }
  app.innerHTML = viewSkeleton();
  try { await loadCore(true); } catch (err) { app.innerHTML = viewError(err.message); return; }

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
        ${imageField('site_cover_image', 'รูปปกเว็บหลัก (Hero banner)', s.site_cover_image)}
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
        <div class="form-actions">
          <button type="button" class="btn btn-outline" onclick="location.hash=''">ยกเลิก</button>
          <button type="submit" class="btn btn-primary">💾 บันทึกการตั้งค่า</button>
        </div>
      </form>
    </div>
  `;

  wireImageField('site_cover_image');
  // เชื่อมช่องสีกับช่องข้อความให้ตรงกัน
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
      primary_color: f.elements.primary_color.value,
      accent_color: f.elements.accent_color.value,
      footer_text: f.elements.footer_text.value.trim()
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
    await submitForm(f, () => apiPost('saveSubject', { item }), 'บันทึกวิชาแล้ว', () => { state.subjects = []; renderHome(); });
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
      <div class="field"><label>ลิงก์เข้าเรียน <span class="req">*</span></label><input name="link" value="${esc(lesson.link || '')}" placeholder="https://..." /><div class="err">กรุณากรอกลิงก์ (ขึ้นต้นด้วย http)</div></div>
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
      cover_image: f.elements.cover_image.value.trim(),
      order: Number(f.elements.order.value) || 0, status: f.elements.status.value
    };
    await submitForm(f, () => apiPost('saveLesson', { item }), 'บันทึกบทเรียนแล้ว', () => {
      state.lessonsCache[item.subject_id] = []; // ล้าง cache ให้โหลดใหม่
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
      state.subjects = []; renderHome();
    });
}
function confirmDeleteLesson(id, subjectId) {
  const lesson = findLessonInCache(id) || {};
  openConfirm('ต้องการลบบทเรียนนี้ใช่ไหม?', lesson.lesson_name || '',
    'ผลงานนักเรียนในบทเรียนนี้จะถูกลบไปด้วย', async () => {
      await apiPost('deleteLesson', { id });
      state.lessonsCache[subjectId] = []; renderSubject(subjectId);
    });
}
function confirmDeleteWork(id, lessonId) {
  const work = (state.worksCache[lessonId] || []).find(w => w.id === id) || {};
  openConfirm('ต้องการลบผลงานนี้ใช่ไหม?', work.work_title || '', '', async () => {
    await apiPost('deleteWork', { id });
    state.worksCache[lessonId] = []; renderLesson(lessonId);
  });
}

/* ============================================================================
   20) เริ่มทำงาน
   ============================================================================ */
applyAuthUI();
router();
