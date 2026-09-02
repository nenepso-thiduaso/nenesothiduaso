const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logActivity } = require('../activityLog');

const router = express.Router();
router.use(requireAuth);

// Ai được phép GHI NHẬN: tất cả trừ bgh (Ban Giám hiệu chỉ xem)
const CAN_RECORD = ['admin', 'tpt', 'gvcn', 'gvbm', 'codo'];
// Ai được SỬA/XOÁ 1 lượt ghi nhận đã gửi: chỉ admin/tpt, hoặc GVCN với đúng lớp mình
function canMutateEntry(user, entryClassId) {
  if (['admin', 'tpt'].includes(user.role)) return true;
  if (user.role === 'gvcn' && user.class_id === entryClassId) return true;
  return false; // gvbm, codo: KHÔNG được tự sửa/xoá sau khi đã gửi — đúng nguyên tắc kiểm soát dữ liệu
}

// ---------- TẠO LƯỢT GHI NHẬN ----------
router.post('/entries', requireRole(...CAN_RECORD), async (req, res) => {
  const { class_id, student_id, student_name_snap, criteria_id, entry_date, note } = req.body || {};
  if (!class_id || !criteria_id) return res.status(400).json({ error: 'Thiếu lớp hoặc tiêu chí' });
  if (req.user.role === 'gvcn' && req.user.class_id !== class_id) {
    return res.status(403).json({ error: 'GVCN chỉ ghi nhận được cho lớp mình phụ trách' });
  }

  const { rows: critRows } = await pool.query('SELECT points FROM criteria WHERE id=$1 AND is_active=true', [criteria_id]);
  if (!critRows[0]) return res.status(400).json({ error: 'Tiêu chí không hợp lệ' });
  const points_snap = critRows[0].points;

  const { rows } = await pool.query(
    `INSERT INTO entries (class_id, student_id, student_name_snap, criteria_id, points_snap, entry_date, note, recorded_by)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6, CURRENT_DATE), $7, $8) RETURNING *`,
    [class_id, student_id || null, student_name_snap || null, criteria_id, points_snap, entry_date || null, note || null, req.user.id]
  );
  await logActivity({
    user: req.user, action: 'entry.create', targetTable: 'entries', targetId: rows[0].id,
    detail: { class_id, student_name_snap, criteria_id }, req,
  });
  res.status(201).json({ entry: rows[0] });
});

// ---------- DANH SÁCH GHI NHẬN (lọc theo lớp / khoảng ngày) ----------
router.get('/entries', async (req, res) => {
  const { class_id, from, to, limit } = req.query;
  const conds = [];
  const params = [];
  let i = 1;
  if (class_id) { conds.push(`e.class_id = $${i++}`); params.push(class_id); }
  if (from) { conds.push(`e.entry_date >= $${i++}`); params.push(from); }
  if (to) { conds.push(`e.entry_date <= $${i++}`); params.push(to); }
  // GVCN chỉ xem được lớp mình
  if (req.user.role === 'gvcn') { conds.push(`e.class_id = $${i++}`); params.push(req.user.class_id); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  params.push(Number(limit) || 500);

  const { rows } = await pool.query(
    `SELECT e.*, c.name AS class_name, cr.name AS criteria_name, cr.type AS criteria_type, u.full_name AS recorded_by_name
     FROM entries e
     JOIN classes c ON c.id = e.class_id
     JOIN criteria cr ON cr.id = e.criteria_id
     JOIN users u ON u.id = e.recorded_by
     ${where}
     ORDER BY e.entry_date DESC, e.created_at DESC
     LIMIT $${i}`,
    params
  );
  res.json({ entries: rows });
});

router.delete('/entries/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT class_id FROM entries WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy' });
  if (!canMutateEntry(req.user, rows[0].class_id)) {
    return res.status(403).json({ error: 'Bạn không có quyền xoá lượt ghi nhận này' });
  }
  await pool.query('DELETE FROM entries WHERE id=$1', [req.params.id]);
  await logActivity({ user: req.user, action: 'entry.delete', targetTable: 'entries', targetId: req.params.id, req });
  res.json({ ok: true });
});

// ---------- BẢNG XẾP HẠNG THI ĐUA THEO TUẦN ----------
// week_start / week_end dạng YYYY-MM-DD do client tính sẵn (Thứ 2 - Chủ nhật)
router.get('/ranking', async (req, res) => {
  const { week_start, week_end } = req.query;
  if (!week_start || !week_end) return res.status(400).json({ error: 'Thiếu week_start/week_end' });

  const { rows: cfgRows } = await pool.query('SELECT diem_nen FROM app_config WHERE id=1');
  const diemNen = cfgRows[0]?.diem_nen ?? 100;

  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.grade,
            COALESCE(SUM(CASE WHEN cr.type='plus' THEN e.points_snap ELSE 0 END),0) AS plus_points,
            COALESCE(SUM(CASE WHEN cr.type='minus' THEN e.points_snap ELSE 0 END),0) AS minus_points,
            COALESCE(COUNT(*) FILTER (WHERE cr.type='plus'),0) AS plus_count,
            COALESCE(COUNT(*) FILTER (WHERE cr.type='minus'),0) AS minus_count
     FROM classes c
     LEFT JOIN entries e ON e.class_id = c.id AND e.entry_date BETWEEN $1 AND $2
     LEFT JOIN criteria cr ON cr.id = e.criteria_id
     GROUP BY c.id
     ORDER BY c.name`,
    [week_start, week_end]
  );
  const ranking = rows
    .map(r => ({
      ...r,
      score: diemNen + Number(r.plus_points) - Number(r.minus_points),
    }))
    .sort((a, b) => b.score - a.score);
  res.json({ diem_nen: diemNen, ranking });
});

// ---------- CẢNH BÁO HỌC SINH ----------
router.get('/warnings', async (req, res) => {
  const { week_start, week_end } = req.query;
  if (!week_start || !week_end) return res.status(400).json({ error: 'Thiếu week_start/week_end' });
  const { rows: cfgRows } = await pool.query('SELECT nguong_vang, nguong_cam, nguong_do FROM app_config WHERE id=1');
  const cfg = cfgRows[0];

  const params = [week_start, week_end];
  let classFilter = '';
  if (req.user.role === 'gvcn') { classFilter = 'AND e.class_id = $3'; params.push(req.user.class_id); }

  const { rows } = await pool.query(
    `SELECT COALESCE(s.full_name, e.student_name_snap) AS student_name, c.name AS class_name, COUNT(*) AS violation_count
     FROM entries e
     JOIN criteria cr ON cr.id = e.criteria_id AND cr.type = 'minus'
     JOIN classes c ON c.id = e.class_id
     LEFT JOIN students s ON s.id = e.student_id
     WHERE e.entry_date BETWEEN $1 AND $2
       AND (s.full_name IS NOT NULL OR e.student_name_snap IS NOT NULL)
       ${classFilter}
     GROUP BY COALESCE(s.full_name, e.student_name_snap), c.name
     HAVING COUNT(*) >= $${req.user.role === 'gvcn' ? 4 : 3}
     ORDER BY violation_count DESC`,
    req.user.role === 'gvcn' ? [...params, cfg.nguong_vang] : [...params, cfg.nguong_vang]
  );

  const withLevel = rows.map(r => {
    const n = Number(r.violation_count);
    let level = 'yellow';
    if (n >= cfg.nguong_do) level = 'red';
    else if (n >= cfg.nguong_cam) level = 'orange';
    return { ...r, level };
  });
  res.json({ thresholds: cfg, warnings: withLevel });
});

// ---------- TRA CỨU 1 HỌC SINH: TUẦN / THÁNG / NĂM HỌC ----------
router.get('/student-lookup', async (req, res) => {
  const { student_name, class_id, week_start, week_end, month_start, month_end, year_start, year_end } = req.query;
  if (!student_name || !class_id) return res.status(400).json({ error: 'Thiếu tên học sinh hoặc lớp' });

  async function countMinus(start, end) {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM entries e JOIN criteria cr ON cr.id=e.criteria_id AND cr.type='minus'
       WHERE e.class_id=$1 AND COALESCE((SELECT full_name FROM students WHERE id=e.student_id), e.student_name_snap) = $2
         AND e.entry_date BETWEEN $3 AND $4`,
      [class_id, student_name, start, end]
    );
    return Number(rows[0].count);
  }

  const [week, month, year] = await Promise.all([
    countMinus(week_start, week_end),
    countMinus(month_start, month_end),
    countMinus(year_start, year_end),
  ]);

  const { rows: history } = await pool.query(
    `SELECT e.entry_date, e.note, cr.name AS criteria_name, cr.type, e.points_snap
     FROM entries e JOIN criteria cr ON cr.id = e.criteria_id
     WHERE e.class_id=$1 AND COALESCE((SELECT full_name FROM students WHERE id=e.student_id), e.student_name_snap) = $2
       AND e.entry_date BETWEEN $3 AND $4
     ORDER BY e.entry_date DESC`,
    [class_id, student_name, year_start, year_end]
  );

  res.json({ week_violations: week, month_violations: month, year_violations: year, history });
});

// ---------- CHI TIẾT LỚP: BÁO CÁO THEO HỌC SINH (all-time hoặc theo khoảng ngày) ----------
router.get('/class-report', async (req, res) => {
  const { class_id, from, to } = req.query;
  if (!class_id) return res.status(400).json({ error: 'Thiếu lớp' });
  if (req.user.role === 'gvcn' && req.user.class_id !== class_id) {
    return res.status(403).json({ error: 'GVCN chỉ xem được lớp mình phụ trách' });
  }
  const params = [class_id];
  let dateFilter = '';
  if (from && to) { dateFilter = 'AND e.entry_date BETWEEN $2 AND $3'; params.push(from, to); }

  const { rows } = await pool.query(
    `SELECT COALESCE(s.full_name, e.student_name_snap, 'Không ghi tên') AS student_name,
            COUNT(*) FILTER (WHERE cr.type='minus') AS minus_count,
            COALESCE(SUM(e.points_snap) FILTER (WHERE cr.type='minus'),0) AS minus_points,
            COUNT(*) FILTER (WHERE cr.type='plus') AS plus_count,
            COALESCE(SUM(e.points_snap) FILTER (WHERE cr.type='plus'),0) AS plus_points
     FROM entries e
     JOIN criteria cr ON cr.id = e.criteria_id
     LEFT JOIN students s ON s.id = e.student_id
     WHERE e.class_id = $1 ${dateFilter}
     GROUP BY COALESCE(s.full_name, e.student_name_snap, 'Không ghi tên')
     ORDER BY minus_points DESC, plus_points DESC`,
    params
  );
  const report = rows.map(r => ({
    student_name: r.student_name,
    minus_count: Number(r.minus_count), minus_points: Number(r.minus_points),
    plus_count: Number(r.plus_count), plus_points: Number(r.plus_points),
    net: Number(r.plus_points) - Number(r.minus_points),
  }));
  res.json({ report });
});

// ---------- THỐNG KÊ TOÀN TRƯỜNG ----------
router.get('/stats', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Thiếu from/to' });

  const { rows: cfgRows } = await pool.query('SELECT diem_nen FROM app_config WHERE id=1');
  const diemNen = cfgRows[0]?.diem_nen ?? 100;

  // điểm từng lớp trong kỳ
  const { rows: classScores } = await pool.query(
    `SELECT c.id, c.name, c.grade,
            COALESCE(SUM(e.points_snap) FILTER (WHERE cr.type='plus'),0) AS plus_points,
            COALESCE(SUM(e.points_snap) FILTER (WHERE cr.type='minus'),0) AS minus_points
     FROM classes c
     LEFT JOIN entries e ON e.class_id=c.id AND e.entry_date BETWEEN $1 AND $2
     LEFT JOIN criteria cr ON cr.id = e.criteria_id
     GROUP BY c.id ORDER BY c.name`,
    [from, to]
  );
  const scored = classScores.map(c => ({
    id: c.id, name: c.name, grade: c.grade,
    score: diemNen + Number(c.plus_points) - Number(c.minus_points),
  })).sort((a, b) => b.score - a.score);

  // tổng quan toàn trường
  const { rows: totalsRows } = await pool.query(
    `SELECT COUNT(*) AS total_entries,
            COALESCE(SUM(e.points_snap) FILTER (WHERE cr.type='plus'),0) AS total_plus_points,
            COUNT(*) FILTER (WHERE cr.type='plus') AS total_plus_count,
            COALESCE(SUM(e.points_snap) FILTER (WHERE cr.type='minus'),0) AS total_minus_points,
            COUNT(*) FILTER (WHERE cr.type='minus') AS total_minus_count
     FROM entries e JOIN criteria cr ON cr.id=e.criteria_id
     WHERE e.entry_date BETWEEN $1 AND $2`,
    [from, to]
  );
  const totals = totalsRows[0];

  // lỗi phổ biến nhất (top 6)
  const { rows: topViolations } = await pool.query(
    `SELECT cr.name, COUNT(*) AS cnt FROM entries e JOIN criteria cr ON cr.id=e.criteria_id AND cr.type='minus'
     WHERE e.entry_date BETWEEN $1 AND $2 GROUP BY cr.name ORDER BY cnt DESC LIMIT 6`,
    [from, to]
  );

  // vi phạm theo khối
  const { rows: byGrade } = await pool.query(
    `SELECT COALESCE(c.grade,'Khác') AS grade, COUNT(*) AS cnt
     FROM entries e JOIN criteria cr ON cr.id=e.criteria_id AND cr.type='minus'
     JOIN classes c ON c.id=e.class_id
     WHERE e.entry_date BETWEEN $1 AND $2 GROUP BY c.grade ORDER BY cnt DESC`,
    [from, to]
  );

  // học sinh vi phạm nhiều nhất (top 8)
  const { rows: topStudents } = await pool.query(
    `SELECT COALESCE(s.full_name, e.student_name_snap) AS student_name, c.name AS class_name, COUNT(*) AS cnt
     FROM entries e JOIN criteria cr ON cr.id=e.criteria_id AND cr.type='minus'
     JOIN classes c ON c.id=e.class_id
     LEFT JOIN students s ON s.id=e.student_id
     WHERE e.entry_date BETWEEN $1 AND $2 AND COALESCE(s.full_name, e.student_name_snap) IS NOT NULL
     GROUP BY COALESCE(s.full_name, e.student_name_snap), c.name
     ORDER BY cnt DESC LIMIT 8`,
    [from, to]
  );

  res.json({
    diem_nen: diemNen,
    total_entries: Number(totals.total_entries),
    total_plus_points: Number(totals.total_plus_points), total_plus_count: Number(totals.total_plus_count),
    total_minus_points: Number(totals.total_minus_points), total_minus_count: Number(totals.total_minus_count),
    class_scores: scored,
    top_class: scored[0] || null,
    bottom_class: scored[scored.length - 1] || null,
    top_violations: topViolations.map(r => ({ name: r.name, count: Number(r.cnt) })),
    by_grade: byGrade.map(r => ({ grade: r.grade, count: Number(r.cnt) })),
    top_students: topStudents.map(r => ({ student_name: r.student_name, class_name: r.class_name, count: Number(r.cnt) })),
  });
});

module.exports = router;
