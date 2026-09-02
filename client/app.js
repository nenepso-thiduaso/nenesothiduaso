// =====================================================================
// CLIENT "NỀ NẾP SỐ - THI ĐUA SỐ" — gọi API thật, dữ liệu lưu trên máy chủ
// =====================================================================
const API = ''; // cùng origin với server (server phục vụ luôn file tĩnh này)

let currentUser = null;
let classes = [];
let criteria = [];
let currentWeekOffset = 0;
let cbWeekOffset = 0;
let selectedCriteria = new Set();

const ROLE_LABEL = { admin:'Admin', tpt:'Tổng phụ trách Đội', gvcn:'Giáo viên chủ nhiệm', gvbm:'Giáo viên bộ môn', codo:'Đội cờ đỏ', bgh:'Ban Giám hiệu' };
const ROLE_TABS = {
  admin: ['ranking','record','canhbao','thongke','lookup','manage','logs'],
  tpt:   ['ranking','record','canhbao','thongke','lookup','manage','logs'],
  gvcn:  ['ranking','record','canhbao','thongke','lookup'],
  gvbm:  ['ranking','record'],
  codo:  ['ranking','record'],
  bgh:   ['ranking','canhbao','thongke','lookup'],
};

// ---------- helper gọi API ----------
async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method: opts.method || 'GET',
      credentials: 'include',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (networkErr) {
    document.getElementById('offlineBanner').style.display = '';
    throw new Error('Mất kết nối mạng — thao tác chưa được lưu. Vui lòng kiểm tra internet và thử lại.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || ('Lỗi HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split('-');
  return `${day}/${m}`;
}
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function getWeekRange(offset) {
  const base = new Date();
  base.setDate(base.getDate() + offset * 7);
  const monday = getMonday(base);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const toIso = d => d.toISOString().slice(0, 10);
  return { start: toIso(monday), end: toIso(sunday) };
}
function getMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toIso = d => d.toISOString().slice(0, 10);
  return { start: toIso(first), end: toIso(last) };
}
function getSchoolYearRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const startYear = m >= 8 ? y : y - 1;
  return { start: `${startYear}-08-01`, end: `${startYear + 1}-07-31` };
}

// ---------- ĐĂNG NHẬP / PHIÊN ----------
async function checkSession() {
  try {
    const { user } = await api('/api/auth/me');
    currentUser = user;
    showApp();
  } catch (e) {
    showLogin();
  }
}
function showLogin() {
  document.getElementById('loginScreen').style.display = '';
  document.getElementById('appRoot').style.display = 'none';
}
function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appRoot').style.display = '';
  applyRolePermissions();
  bootstrapData();
}
document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errBox = document.getElementById('loginError');
  errBox.textContent = '';
  if (!username || !password) { errBox.textContent = 'Nhập đủ tên đăng nhập và mật khẩu'; return; }
  try {
    const { user } = await api('/api/auth/login', { method: 'POST', body: { username, password } });
    currentUser = user;
    document.getElementById('loginPass').value = '';
    showApp();
  } catch (e) {
    errBox.textContent = e.message;
  }
}
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  currentUser = null;
  showLogin();
});
document.getElementById('changePassBtn').addEventListener('click', async () => {
  const old_password = document.getElementById('oldPass').value;
  const new_password = document.getElementById('newPass').value;
  try {
    await api('/api/auth/change-password', { method: 'POST', body: { old_password, new_password } });
    document.getElementById('oldPass').value = '';
    document.getElementById('newPass').value = '';
    toast('Đã đổi mật khẩu');
  } catch (e) { toast(e.message); }
});

function applyRolePermissions() {
  document.getElementById('roleBadge').textContent = (ROLE_LABEL[currentUser.role] || currentUser.role) + ' · ' + currentUser.full_name;
  const allowed = ROLE_TABS[currentUser.role] || ['ranking'];
  document.querySelectorAll('.tab').forEach(tab => {
    tab.style.display = allowed.includes(tab.dataset.view) ? '' : 'none';
  });
  const active = document.querySelector('.tab.active');
  if (!active || active.style.display === 'none') {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const first = document.querySelector(`.tab[data-view="${allowed[0]}"]`);
    if (first) { first.classList.add('active'); document.getElementById('view-' + allowed[0]).classList.add('active'); }
  }
  // ẩn các thẻ quản lý chỉ dành riêng cho admin/tpt trong tab Quản lý
  const manageOnlyAdmin = ['configCard', 'classCard', 'critCard', 'accountsCard'];
  const isAdminLike = ['admin', 'tpt'].includes(currentUser.role);
  manageOnlyAdmin.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = isAdminLike ? '' : 'none'; });
}

// ---------- TABS ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('view-' + tab.dataset.view).classList.add('active');
    onTabShown(tab.dataset.view);
  });
});
function onTabShown(view) {
  if (view === 'ranking') renderRanking();
  if (view === 'record') renderRecordEntries();
  if (view === 'canhbao') renderCanhBao();
  if (view === 'thongke') renderThongKe();
  if (view === 'lookup') { renderLookupClassOptions(); renderDetailClassOptions(); }
  if (view === 'manage') renderManage();
  if (view === 'logs') renderLogs();
}

// ---------- BOOTSTRAP DỮ LIỆU DÙNG CHUNG ----------
async function bootstrapData() {
  try {
    const [c, cr] = await Promise.all([api('/api/catalog/classes'), api('/api/catalog/criteria')]);
    classes = c.classes; criteria = cr.criteria;
  } catch (e) { toast('Lỗi tải dữ liệu: ' + e.message); }
  renderRanking();
  renderRecordSelectors();
  renderRecordEntries();
}

// ---------- BẢNG XẾP HẠNG ----------
async function renderRanking() {
  const { start, end } = getWeekRange(currentWeekOffset);
  document.getElementById('weekLabel').innerHTML =
    (currentWeekOffset === 0 ? 'Tuần này' : (currentWeekOffset > 0 ? `Tuần +${currentWeekOffset}` : `Tuần ${currentWeekOffset}`)) +
    `<small>${fmtDate(start)} – ${fmtDate(end)}</small>`;
  const board = document.getElementById('rankingBoard');
  board.innerHTML = '<div class="empty"><span class="spinner"></span> Đang tải...</div>';
  try {
    const { diem_nen, ranking } = await api(`/api/records/ranking?week_start=${start}&week_end=${end}`);
    document.getElementById('diemNenHint').textContent = diem_nen;
    if (ranking.length === 0) { board.innerHTML = '<div class="empty">Chưa có lớp nào.</div>'; return; }
    const maxScore = Math.max(diem_nen, ...ranking.map(r => r.score));
    board.innerHTML = ranking.map((r, i) => {
      const rankClass = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : '';
      const pct = Math.max(4, Math.min(100, (r.score / maxScore) * 100));
      const neg = r.score < diem_nen ? 'negative' : '';
      return `<div class="row">
        <div class="rank ${rankClass}">${i + 1}</div>
        <div class="row-main">
          <div class="cname">${escapeHtml(r.name)} <span style="font-weight:400;color:var(--slate);font-size:12px;">${escapeHtml(r.grade || '')}</span></div>
          <div class="meter"><div class="meter-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="row-score ${neg}"><div class="num">${r.score}</div><div class="txt">+${r.plus_count} · -${r.minus_count}</div></div>
      </div>`;
    }).join('');
  } catch (e) { board.innerHTML = `<div class="empty">Lỗi tải bảng xếp hạng: ${escapeHtml(e.message)}</div>`; }
}
document.getElementById('prevWeek').addEventListener('click', () => { currentWeekOffset--; renderRanking(); });
document.getElementById('nextWeek').addEventListener('click', () => { currentWeekOffset++; renderRanking(); });

// ---------- GHI NHẬN ----------
function renderRecordSelectors() {
  const sel = document.getElementById('recordClass');
  const prev = sel.value;
  sel.innerHTML = classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('') || '<option value="">(chưa có lớp)</option>';
  if (currentUser.role === 'gvcn' && currentUser.class_id) {
    sel.value = currentUser.class_id;
    sel.disabled = true;
  } else {
    sel.disabled = false;
    if (prev && classes.some(c => c.id === prev)) sel.value = prev;
  }
  if (!document.getElementById('recordDate').value) {
    document.getElementById('recordDate').value = new Date().toISOString().slice(0, 10);
  }
  const picker = document.getElementById('criteriaPicker');
  picker.innerHTML = criteria.map(c => {
    const sign = c.type === 'plus' ? '+' : '-';
    return `<div class="crit-chip ${c.type}" data-id="${c.id}"><span>${escapeHtml(c.name)}</span><span class="pt">${sign}${c.points}</span></div>`;
  }).join('') || '<div class="empty">Chưa có tiêu chí.</div>';
  picker.querySelectorAll('.crit-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.id;
      if (selectedCriteria.has(id)) { selectedCriteria.delete(id); chip.classList.remove('selected'); }
      else { selectedCriteria.add(id); chip.classList.add('selected'); }
    });
  });
  loadStudentDatalist();
}
document.getElementById('recordClass').addEventListener('change', loadStudentDatalist);
async function loadStudentDatalist() {
  const classId = document.getElementById('recordClass').value;
  if (!classId) return;
  try {
    const { students } = await api('/api/catalog/students?class_id=' + classId);
    document.getElementById('studentNamesList').innerHTML = students.map(s => `<option value="${escapeHtml(s.full_name)}">`).join('');
  } catch (e) { /* im lặng, không chặn thao tác chính */ }
}

document.getElementById('submitRecord').addEventListener('click', async () => {
  const class_id = document.getElementById('recordClass').value;
  const entry_date = document.getElementById('recordDate').value;
  const note = document.getElementById('recordNote').value.trim();
  const studentName = document.getElementById('recordStudentName').value.trim();
  const qty = Math.max(1, parseInt(document.getElementById('recordQty').value, 10) || 1);
  if (!class_id) { toast('Chọn lớp'); return; }
  if (selectedCriteria.size === 0) { toast('Chọn ít nhất 1 tiêu chí'); return; }

  const submitBtn = document.getElementById('submitRecord');
  submitBtn.disabled = true;
  let count = 0;
  try {
    for (const criteria_id of selectedCriteria) {
      const times = studentName ? 1 : qty;
      for (let i = 0; i < times; i++) {
        await api('/api/records/entries', {
          method: 'POST',
          body: { class_id, criteria_id, entry_date, note, student_name_snap: studentName || null },
        });
        count++;
      }
    }
    toast(`Đã lưu ${count} lượt ghi nhận ✓`);
    selectedCriteria.clear();
    document.querySelectorAll('.crit-chip.selected').forEach(c => c.classList.remove('selected'));
    document.getElementById('recordStudentName').value = '';
    document.getElementById('recordNote').value = '';
    renderRecordEntries();
  } catch (e) {
    toast('Lỗi: ' + e.message);
  } finally {
    submitBtn.disabled = false;
  }
});

async function renderRecordEntries() {
  const box = document.getElementById('recentEntries');
  box.innerHTML = '<div class="empty"><span class="spinner"></span> Đang tải...</div>';
  try {
    const classId = document.getElementById('recordClass').value;
    const url = currentUser.role === 'gvcn' ? '/api/records/entries?limit=15' : (classId ? `/api/records/entries?limit=15` : '/api/records/entries?limit=15');
    const { entries } = await api(url);
    if (entries.length === 0) { box.innerHTML = '<div class="empty">Chưa có ghi nhận nào.</div>'; return; }
    box.innerHTML = entries.map(e => {
      const sign = e.criteria_type === 'plus' ? '+' : '-';
      const who = e.student_name_snap || 'Không ghi tên';
      const canDel = ['admin','tpt'].includes(currentUser.role) || (currentUser.role === 'gvcn' && currentUser.class_id === e.class_id);
      return `<div class="entry-row">
        <div>
          <div style="font-weight:700;font-size:13.5px;">${escapeHtml(e.class_name)} · ${escapeHtml(who)} — ${escapeHtml(e.criteria_name)} <span class="tag ${e.criteria_type}">${sign}${e.points_snap}</span></div>
          <div class="meta">${e.note ? escapeHtml(e.note) + ' · ' : ''}ghi bởi ${escapeHtml(e.recorded_by_name)}</div>
        </div>
        <div style="text-align:right;">
          <div class="entry-date">${fmtDate(e.entry_date)}</div>
          ${canDel ? `<span class="btn btn-danger" style="margin-top:4px;display:inline-block;" data-del="${e.id}">Xóa</span>` : ''}
        </div>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await api('/api/records/entries/' + btn.dataset.del, { method: 'DELETE' }); renderRecordEntries(); renderRanking(); }
        catch (e) { toast('Lỗi: ' + e.message); }
      });
    });
  } catch (e) { box.innerHTML = `<div class="empty">Lỗi: ${escapeHtml(e.message)}</div>`; }
}

// ---------- CẢNH BÁO ----------
async function renderCanhBao() {
  const { start, end } = getWeekRange(cbWeekOffset);
  document.getElementById('cbWeekLabel').innerHTML =
    (cbWeekOffset === 0 ? 'Tuần này' : (cbWeekOffset > 0 ? `Tuần +${cbWeekOffset}` : `Tuần ${cbWeekOffset}`)) +
    `<small>${fmtDate(start)} – ${fmtDate(end)}</small>`;
  const box = document.getElementById('cbList');
  box.innerHTML = '<div class="empty"><span class="spinner"></span> Đang tải...</div>';
  try {
    const { thresholds, warnings } = await api(`/api/records/warnings?week_start=${start}&week_end=${end}`);
    document.getElementById('cbLegend').innerHTML = `
      <span class="cb-badge cb-green">🟢 0–${thresholds.nguong_vang - 1}</span>
      <span class="cb-badge cb-yellow">🟡 ${thresholds.nguong_vang}–${thresholds.nguong_cam - 1}</span>
      <span class="cb-badge cb-orange">🟠 ${thresholds.nguong_cam}–${thresholds.nguong_do - 1}</span>
      <span class="cb-badge cb-red">🔴 từ ${thresholds.nguong_do}</span>`;
    if (warnings.length === 0) { box.innerHTML = '<div class="empty">Không có học sinh nào vượt ngưỡng cảnh báo 🎉</div>'; return; }
    const LVL = { yellow:{cls:'cb-yellow',row:'',label:'🟡 Cần nhắc nhở'}, orange:{cls:'cb-orange',row:'level-orange',label:'🟠 Cần theo dõi'}, red:{cls:'cb-red',row:'level-red',label:'🔴 Cần phối hợp GVCN/TPT'} };
    box.innerHTML = warnings.map(w => {
      const l = LVL[w.level];
      return `<div class="cb-row ${l.row}">
        <div class="cb-main"><div class="cb-name">${escapeHtml(w.student_name)}</div><div class="cb-class">Lớp ${escapeHtml(w.class_name)}</div><span class="cb-level ${l.cls}">${l.label}</span></div>
        <div class="cb-count">${w.violation_count} lượt<br>vi phạm/tuần</div>
      </div>`;
    }).join('');
  } catch (e) { box.innerHTML = `<div class="empty">Lỗi: ${escapeHtml(e.message)}</div>`; }
}
document.getElementById('cbPrevWeek').addEventListener('click', () => { cbWeekOffset--; renderCanhBao(); });
document.getElementById('cbNextWeek').addEventListener('click', () => { cbWeekOffset++; renderCanhBao(); });

// ---------- TRA CỨU HỌC SINH ----------
function renderLookupClassOptions() {
  const sel = document.getElementById('lookupClass');
  const list = (currentUser.role === 'gvcn' && currentUser.class_id) ? classes.filter(c => c.id === currentUser.class_id) : classes;
  sel.innerHTML = list.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  sel.disabled = currentUser.role === 'gvcn';
  loadLookupStudents();
}
document.getElementById('lookupClass').addEventListener('change', loadLookupStudents);
document.getElementById('lookupStudentSel').addEventListener('change', renderStudentLookup);
async function loadLookupStudents() {
  const classId = document.getElementById('lookupClass').value;
  const sel = document.getElementById('lookupStudentSel');
  if (!classId) { sel.innerHTML = ''; return; }
  try {
    const { students } = await api('/api/catalog/students?class_id=' + classId);
    sel.innerHTML = students.map(s => `<option value="${escapeHtml(s.full_name)}">${escapeHtml(s.full_name)}</option>`).join('') || '<option value="">(chưa có học sinh)</option>';
    renderStudentLookup();
  } catch (e) { toast('Lỗi: ' + e.message); }
}
async function renderStudentLookup() {
  const classId = document.getElementById('lookupClass').value;
  const name = document.getElementById('lookupStudentSel').value;
  const kpiBox = document.getElementById('lookupKpis');
  const histBox = document.getElementById('lookupHistory');
  if (!classId || !name) { kpiBox.innerHTML = ''; histBox.innerHTML = '<div class="empty">Chọn lớp và học sinh để tra cứu.</div>'; return; }
  const week = getWeekRange(0), month = getMonthRange(), year = getSchoolYearRange();
  try {
    const q = new URLSearchParams({
      student_name: name, class_id: classId,
      week_start: week.start, week_end: week.end,
      month_start: month.start, month_end: month.end,
      year_start: year.start, year_end: year.end,
    });
    const data = await api('/api/records/student-lookup?' + q.toString());
    kpiBox.innerHTML = `
      <div class="tk-kpi"><div class="tk-val" style="color:#A33;">${data.week_violations}</div><div class="tk-lbl">Vi phạm tuần này</div></div>
      <div class="tk-kpi"><div class="tk-val" style="color:#A33;">${data.month_violations}</div><div class="tk-lbl">Vi phạm tháng này</div></div>
      <div class="tk-kpi"><div class="tk-val" style="color:#A33;">${data.year_violations}</div><div class="tk-lbl">Vi phạm năm học</div></div>`;
    if (data.history.length === 0) { histBox.innerHTML = '<div class="empty">Chưa có ghi nhận nào trong năm học.</div>'; return; }
    histBox.innerHTML = data.history.map(h => {
      const sign = h.type === 'plus' ? '+' : '-';
      return `<div class="entry-row"><div><div style="font-weight:700;font-size:13.5px;">${escapeHtml(h.criteria_name)} <span class="tag ${h.type}">${sign}${h.points_snap}</span></div>${h.note ? `<div class="meta">${escapeHtml(h.note)}</div>` : ''}</div><div class="entry-date">${fmtDate(h.entry_date)}</div></div>`;
    }).join('');
  } catch (e) { histBox.innerHTML = `<div class="empty">Lỗi: ${escapeHtml(e.message)}</div>`; }
}

// ---------- THỐNG KÊ TOÀN TRƯỜNG ----------
function getPeriodRange(mode) {
  if (mode === 'week') return getWeekRange(0);
  if (mode === 'month') return getMonthRange();
  return { start: '2000-01-01', end: '2999-12-31' }; // toàn bộ thời gian
}
document.getElementById('tkPeriod').addEventListener('change', renderThongKe);
async function renderThongKe() {
  const mode = document.getElementById('tkPeriod').value;
  const { start, end } = getPeriodRange(mode);
  try {
    const d = await api(`/api/records/stats?from=${start}&to=${end}`);
    document.getElementById('tkKpis').innerHTML = `
      <div class="tk-kpi"><div class="tk-val">${d.total_entries}</div><div class="tk-lbl">Tổng lượt ghi nhận</div></div>
      <div class="tk-kpi"><div class="tk-val" style="color:#A33;">-${d.total_minus_points}</div><div class="tk-lbl">Tổng điểm trừ (${d.total_minus_count} lượt)</div></div>
      <div class="tk-kpi"><div class="tk-val" style="color:var(--green);">+${d.total_plus_points}</div><div class="tk-lbl">Tổng điểm cộng (${d.total_plus_count} lượt)</div></div>
      <div class="tk-kpi"><div class="tk-val">${d.class_scores.length ? (d.class_scores.reduce((s,c)=>s+c.score,0)/d.class_scores.length).toFixed(1) : d.diem_nen}</div><div class="tk-lbl">Điểm thi đua TB toàn trường</div></div>`;

    const topBox = document.getElementById('tkTopClass'), bottomBox = document.getElementById('tkBottomClass');
    if (d.top_class) {
      topBox.innerHTML = `<div class="highlight-class"><div><div class="hc-name">${escapeHtml(d.top_class.name)}</div><div class="hc-meta">${escapeHtml(d.top_class.grade||'')}</div></div><div class="hc-score">${d.top_class.score}</div></div>`;
      bottomBox.innerHTML = `<div class="highlight-class" style="background:linear-gradient(135deg,#FBE6D2,#fff);"><div><div class="hc-name">${escapeHtml(d.bottom_class.name)}</div><div class="hc-meta">${escapeHtml(d.bottom_class.grade||'')}</div></div><div class="hc-score" style="color:#A15A17;">${d.bottom_class.score}</div></div>`;
    } else { topBox.innerHTML = bottomBox.innerHTML = '<div class="empty">Chưa có dữ liệu.</div>'; }

    const chartBox = document.getElementById('tkClassChart');
    if (d.class_scores.length === 0) { chartBox.innerHTML = '<div class="empty">Chưa có lớp nào.</div>'; }
    else {
      const maxS = Math.max(d.diem_nen, ...d.class_scores.map(c=>c.score), 1);
      chartBox.innerHTML = d.class_scores.map(c => {
        const pct = Math.max(3, (c.score/maxS)*100);
        const cls = c.score >= d.diem_nen ? '' : 'gold';
        return `<div class="bar-row"><div class="bar-label">${escapeHtml(c.name)}</div><div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div><div class="bar-val">${c.score}</div></div>`;
      }).join('');
    }

    const violBox = document.getElementById('tkTopViolations');
    violBox.innerHTML = d.top_violations.length === 0 ? '<div class="empty">Chưa có vi phạm nào.</div>' :
      (() => { const maxV = Math.max(...d.top_violations.map(r=>r.count)); return d.top_violations.map(r=>`<div class="bar-row"><div class="bar-label">${escapeHtml(r.name)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(4,(r.count/maxV)*100)}%"></div></div><div class="bar-val">${r.count}</div></div>`).join(''); })();

    const gradeBox = document.getElementById('tkByGrade');
    gradeBox.innerHTML = d.by_grade.length === 0 ? '<div class="empty">Chưa có dữ liệu.</div>' :
      (() => { const maxG = Math.max(...d.by_grade.map(r=>r.count)); return d.by_grade.map(r=>`<div class="bar-row"><div class="bar-label">${escapeHtml(r.grade)}</div><div class="bar-track"><div class="bar-fill green" style="width:${Math.max(4,(r.count/maxG)*100)}%"></div></div><div class="bar-val">${r.count}</div></div>`).join(''); })();

    const stuBox = document.getElementById('tkTopStudents');
    stuBox.innerHTML = d.top_students.length === 0 ? '<div class="empty">Chưa có học sinh nào vi phạm.</div>' :
      d.top_students.map(r => `<div class="student-mini-row"><span>${escapeHtml(r.student_name)} <span style="color:var(--slate);font-weight:400;">— lớp ${escapeHtml(r.class_name)}</span></span><span class="smr-count">${r.count} lượt</span></div>`).join('');
  } catch (e) { toast('Lỗi tải thống kê: ' + e.message); }
}
document.getElementById('tkExportBtn').addEventListener('click', async () => {
  const mode = document.getElementById('tkPeriod').value;
  const { start, end } = getPeriodRange(mode);
  try {
    const d = await api(`/api/records/stats?from=${start}&to=${end}`);
    const header = ['Lớp','Khối','Điểm nền','Điểm thi đua'];
    const rows = d.class_scores.map(c => [c.name, c.grade||'', d.diem_nen, c.score]);
    downloadCsv(`bao-cao-toan-truong-${mode}.csv`, [header, ...rows]);
    toast('Đã xuất báo cáo toàn trường');
  } catch (e) { toast('Lỗi: ' + e.message); }
});
function downloadCsv(filename, rows) {
  const csv = '\uFEFF' + rows.map(row => row.map(v => {
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  }).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- CHI TIẾT LỚP: THEO NGÀY / THEO HỌC SINH ----------
function renderDetailClassOptions() {
  const sel = document.getElementById('detailClass');
  const prev = sel.value;
  const list = (currentUser.role === 'gvcn' && currentUser.class_id) ? classes.filter(c => c.id === currentUser.class_id) : classes;
  sel.innerHTML = list.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('') || '<option value="">(chưa có lớp)</option>';
  sel.disabled = currentUser.role === 'gvcn';
  if (prev && list.some(c => c.id === prev)) sel.value = prev;
  renderClassDetail();
}
document.getElementById('detailClass').addEventListener('change', renderClassDetail);
document.getElementById('detailModeSelect').addEventListener('change', renderClassDetail);
async function renderClassDetail() {
  const classId = document.getElementById('detailClass').value;
  const mode = document.getElementById('detailModeSelect').value;
  const summary = document.getElementById('detailSummary');
  const list = document.getElementById('detailList');
  const toolbar = document.getElementById('detailToolbar');
  toolbar.style.display = mode === 'student' ? 'block' : 'none';
  if (!classId) { summary.innerHTML = ''; list.innerHTML = '<div class="empty">Chưa có lớp nào.</div>'; return; }

  try {
    if (mode === 'student') {
      const { report } = await api('/api/records/class-report?class_id=' + classId);
      const totalPlus = report.reduce((s,r)=>s+r.plus_points,0);
      const totalMinus = report.reduce((s,r)=>s+r.minus_points,0);
      summary.innerHTML = summaryHtml(totalPlus, totalMinus);
      list.innerHTML = report.length === 0 ? '<div class="empty">Lớp này chưa có dữ liệu.</div>' : `<table class="student-table">
        <thead><tr><th>Học sinh</th><th>Lượt vi phạm</th><th>Điểm trừ</th><th>Lượt tốt</th><th>Điểm cộng</th><th>Điểm ròng</th></tr></thead>
        <tbody>${report.map(r=>`<tr>
          <td class="sname">${escapeHtml(r.student_name)}</td><td>${r.minus_count}</td>
          <td style="color:#A33;font-weight:700;">${r.minus_points>0?'-'+r.minus_points:'0'}</td><td>${r.plus_count}</td>
          <td style="color:var(--green);font-weight:700;">${r.plus_points>0?'+'+r.plus_points:'0'}</td>
          <td style="font-weight:800;">${r.net>0?'+':''}${r.net}</td>
        </tr>`).join('')}</tbody></table>`;
    } else {
      const { entries } = await api(`/api/records/entries?class_id=${classId}&limit=500`);
      const totalPlus = entries.filter(e=>e.criteria_type==='plus').reduce((s,e)=>s+e.points_snap,0);
      const totalMinus = entries.filter(e=>e.criteria_type==='minus').reduce((s,e)=>s+e.points_snap,0);
      summary.innerHTML = summaryHtml(totalPlus, totalMinus);
      list.innerHTML = entries.length === 0 ? '<div class="empty">Lớp này chưa có ghi nhận nào.</div>' : entries.map(e => {
        const sign = e.criteria_type === 'plus' ? '+' : '-';
        const who = e.student_name_snap || 'Không ghi tên';
        return `<div class="entry-row"><div><div style="font-weight:700;font-size:13.5px;">${escapeHtml(who)} — ${escapeHtml(e.criteria_name)} <span class="tag ${e.criteria_type}">${sign}${e.points_snap}</span></div>${e.note?`<div class="meta">${escapeHtml(e.note)}</div>`:''}</div><div class="entry-date">${fmtDate(e.entry_date)}</div></div>`;
      }).join('');
    }
  } catch (e) { list.innerHTML = `<div class="empty">Lỗi: ${escapeHtml(e.message)}</div>`; }
}
function summaryHtml(totalPlus, totalMinus) {
  return `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:8px;">
    <div class="card" style="flex:1;min-width:120px;padding:12px;margin:0;text-align:center;"><div class="section-label">Tổng cộng điểm</div><div style="font-family:'Noto Serif',serif;font-weight:800;font-size:22px;color:var(--green);">+${totalPlus}</div></div>
    <div class="card" style="flex:1;min-width:120px;padding:12px;margin:0;text-align:center;"><div class="section-label">Tổng trừ điểm</div><div style="font-family:'Noto Serif',serif;font-weight:800;font-size:22px;color:#A33;">-${totalMinus}</div></div>
  </div>`;
}
document.getElementById('exportCsvBtn').addEventListener('click', async () => {
  const classId = document.getElementById('detailClass').value;
  const cls = classes.find(c => c.id === classId);
  if (!classId) { toast('Chọn lớp trước'); return; }
  try {
    const { report } = await api('/api/records/class-report?class_id=' + classId);
    const header = ['Học sinh','Lượt vi phạm','Điểm trừ','Lượt tốt','Điểm cộng','Điểm ròng'];
    const rows = report.map(r => [r.student_name, r.minus_count, r.minus_points, r.plus_count, r.plus_points, r.net]);
    downloadCsv(`bao-cao-hoc-sinh-${cls?cls.name:'lop'}.csv`, [header, ...rows]);
    toast('Đã xuất báo cáo CSV');
  } catch (e) { toast('Lỗi: ' + e.message); }
});

// ---------- QUẢN LÝ ----------
async function renderManage() {
  if (['admin','tpt'].includes(currentUser.role)) {
    loadConfig();
    renderClassList();
    renderCritList();
    renderAccountList();
  }
  renderStudentManageClassOptions();
}
async function loadConfig() {
  try {
    const { config } = await api('/api/catalog/config');
    document.getElementById('cfgDiemNen').value = config.diem_nen;
    document.getElementById('cfgVang').value = config.nguong_vang;
    document.getElementById('cfgCam').value = config.nguong_cam;
    document.getElementById('cfgDo').value = config.nguong_do;
  } catch (e) { toast('Lỗi tải cấu hình: ' + e.message); }
}
document.getElementById('saveConfigBtn').addEventListener('click', async () => {
  try {
    await api('/api/catalog/config', { method:'PUT', body: {
      diem_nen: parseInt(document.getElementById('cfgDiemNen').value,10),
      nguong_vang: parseInt(document.getElementById('cfgVang').value,10),
      nguong_cam: parseInt(document.getElementById('cfgCam').value,10),
      nguong_do: parseInt(document.getElementById('cfgDo').value,10),
    }});
    toast('Đã lưu cấu hình'); renderRanking();
  } catch (e) { toast('Lỗi: ' + e.message); }
});

async function renderClassList() {
  const box = document.getElementById('classList');
  box.innerHTML = classes.map(c => `<div class="list-item"><div><div style="font-weight:700;">${escapeHtml(c.name)}</div><div class="meta">${escapeHtml(c.grade||'')}</div></div><span class="btn btn-danger" data-del-class="${c.id}">Xóa</span></div>`).join('') || '<div class="empty">Chưa có lớp.</div>';
  box.querySelectorAll('[data-del-class]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Xóa lớp này?')) return;
    try { await api('/api/catalog/classes/' + btn.dataset.delClass, { method:'DELETE' }); await bootstrapData(); renderManage(); toast('Đã xóa lớp'); }
    catch(e){ toast('Lỗi: '+e.message); }
  }));
}
document.getElementById('addClassBtn').addEventListener('click', async () => {
  const name = document.getElementById('newClassName').value.trim();
  const grade = document.getElementById('newClassGrade').value.trim();
  if (!name) { toast('Nhập tên lớp'); return; }
  try {
    await api('/api/catalog/classes', { method:'POST', body:{name, grade} });
    document.getElementById('newClassName').value=''; document.getElementById('newClassGrade').value='';
    await bootstrapData(); renderManage(); toast('Đã thêm lớp');
  } catch(e){ toast('Lỗi: '+e.message); }
});

async function renderCritList() {
  const box = document.getElementById('critList');
  const groups = {};
  criteria.forEach(c => { const g=c.group_name||'Khác'; (groups[g]=groups[g]||[]).push(c); });
  box.innerHTML = Object.keys(groups).map(g => {
    const items = groups[g].map(c => {
      const sign = c.type==='plus'?'+':'-';
      return `<div class="list-item"><div><div style="font-weight:700;">${escapeHtml(c.name)}</div><div class="meta"><span class="tag ${c.type}">${sign}${c.points}</span></div></div><span class="btn btn-danger" data-del-crit="${c.id}">Xóa</span></div>`;
    }).join('');
    return `<div class="section-label" style="margin-top:10px;">${escapeHtml(g)}</div>${items}`;
  }).join('') || '<div class="empty">Chưa có tiêu chí.</div>';
  box.querySelectorAll('[data-del-crit]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Xóa tiêu chí này?')) return;
    try { await api('/api/catalog/criteria/' + btn.dataset.delCrit, { method:'DELETE' }); await bootstrapData(); renderManage(); toast('Đã xóa'); }
    catch(e){ toast('Lỗi: '+e.message); }
  }));
}
document.getElementById('addCritBtn').addEventListener('click', async () => {
  const name = document.getElementById('newCritName').value.trim();
  const type = document.getElementById('newCritType').value;
  const points = parseInt(document.getElementById('newCritPoints').value,10);
  const group_name = document.getElementById('newCritGroup').value.trim() || 'Khác';
  if (!name || !points) { toast('Nhập đủ tên và điểm'); return; }
  try {
    await api('/api/catalog/criteria', { method:'POST', body:{name,type,points,group_name} });
    document.getElementById('newCritName').value=''; document.getElementById('newCritPoints').value=''; document.getElementById('newCritGroup').value='';
    await bootstrapData(); renderManage(); toast('Đã thêm tiêu chí');
  } catch(e){ toast('Lỗi: '+e.message); }
});

function renderStudentManageClassOptions() {
  const sel = document.getElementById('studentClassSelect');
  const list = (currentUser.role === 'gvcn' && currentUser.class_id) ? classes.filter(c=>c.id===currentUser.class_id) : classes;
  sel.innerHTML = list.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  loadStudentManageList();
}
document.getElementById('studentClassSelect').addEventListener('change', loadStudentManageList);
async function loadStudentManageList() {
  const classId = document.getElementById('studentClassSelect').value;
  const box = document.getElementById('studentList');
  if (!classId) { box.innerHTML = '<div class="empty">Chưa có lớp.</div>'; return; }
  try {
    const { students } = await api('/api/catalog/students?class_id=' + classId);
    box.innerHTML = students.map(s => `<div class="list-item"><div style="font-weight:600;">${escapeHtml(s.full_name)}</div><span class="btn btn-danger" data-del-student="${s.id}">Xóa</span></div>`).join('') || '<div class="empty">Lớp này chưa có học sinh.</div>';
    box.querySelectorAll('[data-del-student]').forEach(btn => btn.addEventListener('click', async () => {
      try { await api('/api/catalog/students/' + btn.dataset.delStudent, { method:'DELETE' }); loadStudentManageList(); }
      catch(e){ toast('Lỗi: '+e.message); }
    }));
  } catch(e){ box.innerHTML = `<div class="empty">Lỗi: ${escapeHtml(e.message)}</div>`; }
}
document.getElementById('addStudentBtn').addEventListener('click', async () => {
  const class_id = document.getElementById('studentClassSelect').value;
  const full_name = document.getElementById('newStudentName').value.trim();
  if (!class_id || !full_name) { toast('Nhập đủ lớp và tên học sinh'); return; }
  try {
    await api('/api/catalog/students', { method:'POST', body:{full_name, class_id} });
    document.getElementById('newStudentName').value='';
    loadStudentManageList(); toast('Đã thêm học sinh');
  } catch(e){ toast('Lỗi: '+e.message); }
});

document.getElementById('newAccRole').addEventListener('change', function(){
  document.getElementById('newAccClassField').style.display = this.value === 'gvcn' ? '' : 'none';
});
async function renderAccountList() {
  document.getElementById('newAccClassField').style.display = document.getElementById('newAccRole').value === 'gvcn' ? '' : 'none';
  document.getElementById('newAccClass').innerHTML = classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const box = document.getElementById('accountList');
  try {
    const { users } = await api('/api/users');
    box.innerHTML = users.map(u => `<div class="list-item">
      <div><div style="font-weight:700;">${escapeHtml(u.username)} <span class="tag" style="background:var(--gold-soft);color:var(--red-deep);">${escapeHtml(ROLE_LABEL[u.role]||u.role)}</span>${!u.is_active?' <span class="tag minus">Đã khóa</span>':''}</div>
      <div class="meta">${escapeHtml(u.full_name||'')}${u.class_name?(' · Lớp '+escapeHtml(u.class_name)):''}</div></div>
      <span class="btn btn-danger" data-del-acc="${u.id}">Xóa</span>
    </div>`).join('') || '<div class="empty">Chưa có tài khoản.</div>';
    box.querySelectorAll('[data-del-acc]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Xóa tài khoản này?')) return;
      try { await api('/api/users/' + btn.dataset.delAcc, { method:'DELETE' }); renderAccountList(); toast('Đã xóa tài khoản'); }
      catch(e){ toast('Lỗi: '+e.message); }
    }));
  } catch(e){ box.innerHTML = `<div class="empty">Lỗi: ${escapeHtml(e.message)}</div>`; }
}
document.getElementById('addAccBtn').addEventListener('click', async () => {
  const username = document.getElementById('newAccUser').value.trim();
  const password = document.getElementById('newAccPass').value.trim();
  const full_name = document.getElementById('newAccFullname').value.trim();
  const role = document.getElementById('newAccRole').value;
  const class_id = role === 'gvcn' ? document.getElementById('newAccClass').value : null;
  if (!username || !password || !full_name) { toast('Nhập đủ thông tin'); return; }
  try {
    await api('/api/users', { method:'POST', body:{ username, password, full_name, role, class_id } });
    document.getElementById('newAccUser').value=''; document.getElementById('newAccPass').value=''; document.getElementById('newAccFullname').value='';
    renderAccountList(); toast('Đã thêm tài khoản');
  } catch(e){ toast('Lỗi: '+e.message); }
});

// ---------- NHẬT KÝ HỆ THỐNG ----------
async function renderLogs() {
  const box = document.getElementById('logsList');
  box.innerHTML = '<div class="empty"><span class="spinner"></span> Đang tải...</div>';
  try {
    const { logs } = await api('/api/logs?limit=200');
    if (logs.length === 0) { box.innerHTML = '<div class="empty">Chưa có nhật ký nào.</div>'; return; }
    box.innerHTML = logs.map(l => {
      const t = new Date(l.created_at);
      const time = t.toLocaleString('vi-VN');
      return `<div class="log-row"><div><b>${escapeHtml(l.username_snap)}</b> (${escapeHtml(ROLE_LABEL[l.role_snap]||l.role_snap)}) — ${escapeHtml(l.action)}${l.target_table ? ` [${escapeHtml(l.target_table)}#${String(l.target_id).slice(0,8)}]` : ''}</div><div class="log-time">${time}</div></div>`;
    }).join('');
  } catch(e){ box.innerHTML = `<div class="empty">Lỗi: ${escapeHtml(e.message)}</div>`; }
}

// ---------- PWA: SERVICE WORKER, CÀI ĐẶT ỨNG DỤNG, BÁO MẤT MẠNG ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // không chặn ứng dụng nếu đăng ký thất bại (VD: server chưa hỗ trợ HTTPS)
    });
  });
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installBtn').style.display = '';
});
document.getElementById('installBtn').addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('installBtn').style.display = 'none';
  } else {
    // iOS Safari (và các trình duyệt không hỗ trợ prompt) không có API cài tự động
    toast('Trên iPhone/iPad: bấm nút Chia sẻ (⬆️) trên Safari, chọn "Thêm vào MH Chính" để cài ứng dụng.');
  }
});
window.addEventListener('appinstalled', () => {
  document.getElementById('installBtn').style.display = 'none';
});

function updateOfflineBanner() {
  document.getElementById('offlineBanner').style.display = navigator.onLine ? 'none' : '';
}
window.addEventListener('online', updateOfflineBanner);
window.addEventListener('offline', updateOfflineBanner);
updateOfflineBanner();

// ---------- KHỞI ĐỘNG ----------
checkSession();
