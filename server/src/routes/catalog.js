const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logActivity } = require('../activityLog');

const router = express.Router();
router.use(requireAuth);
const MANAGE = ['admin', 'tpt']; // ai được sửa danh mục

// ---------- LỚP ----------
router.get('/classes', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM classes ORDER BY name');
  res.json({ classes: rows });
});
router.post('/classes', requireRole(...MANAGE), async (req, res) => {
  const { name, grade } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Thiếu tên lớp' });
  const { rows } = await pool.query('INSERT INTO classes (name, grade) VALUES ($1,$2) RETURNING *', [name, grade || '']);
  await logActivity({ user: req.user, action: 'class.create', targetTable: 'classes', targetId: rows[0].id, detail: { name }, req });
  res.status(201).json({ class: rows[0] });
});
router.delete('/classes/:id', requireRole(...MANAGE), async (req, res) => {
  await pool.query('DELETE FROM classes WHERE id=$1', [req.params.id]);
  await logActivity({ user: req.user, action: 'class.delete', targetTable: 'classes', targetId: req.params.id, req });
  res.json({ ok: true });
});

// ---------- HỌC SINH ----------
router.get('/students', async (req, res) => {
  const { class_id } = req.query;
  const { rows } = await pool.query(
    class_id ? 'SELECT * FROM students WHERE class_id=$1 ORDER BY full_name' : 'SELECT * FROM students ORDER BY full_name',
    class_id ? [class_id] : []
  );
  res.json({ students: rows });
});
router.post('/students', requireRole(...MANAGE, 'gvcn'), async (req, res) => {
  const { full_name, class_id } = req.body || {};
  if (!full_name || !class_id) return res.status(400).json({ error: 'Thiếu tên học sinh hoặc lớp' });
  if (req.user.role === 'gvcn' && req.user.class_id !== class_id) {
    return res.status(403).json({ error: 'GVCN chỉ được thêm học sinh cho lớp mình phụ trách' });
  }
  const { rows } = await pool.query('INSERT INTO students (full_name, class_id) VALUES ($1,$2) RETURNING *', [full_name, class_id]);
  await logActivity({ user: req.user, action: 'student.create', targetTable: 'students', targetId: rows[0].id, detail: { full_name }, req });
  res.status(201).json({ student: rows[0] });
});
router.delete('/students/:id', requireRole(...MANAGE), async (req, res) => {
  await pool.query('DELETE FROM students WHERE id=$1', [req.params.id]);
  await logActivity({ user: req.user, action: 'student.delete', targetTable: 'students', targetId: req.params.id, req });
  res.json({ ok: true });
});

// ---------- TIÊU CHÍ ----------
router.get('/criteria', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM criteria WHERE is_active=true ORDER BY group_name, name');
  res.json({ criteria: rows });
});
router.post('/criteria', requireRole(...MANAGE), async (req, res) => {
  const { name, type, points, group_name, severity } = req.body || {};
  if (!name || !['plus', 'minus'].includes(type) || !points) {
    return res.status(400).json({ error: 'Thiếu hoặc sai dữ liệu tiêu chí' });
  }
  const { rows } = await pool.query(
    'INSERT INTO criteria (name, type, points, group_name, severity) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [name, type, points, group_name || 'Khác', severity || null]
  );
  await logActivity({ user: req.user, action: 'criteria.create', targetTable: 'criteria', targetId: rows[0].id, detail: req.body, req });
  res.status(201).json({ criteria: rows[0] });
});
router.delete('/criteria/:id', requireRole(...MANAGE), async (req, res) => {
  await pool.query('UPDATE criteria SET is_active=false WHERE id=$1', [req.params.id]); // xoá mềm, giữ lịch sử ghi nhận cũ nguyên vẹn
  await logActivity({ user: req.user, action: 'criteria.delete', targetTable: 'criteria', targetId: req.params.id, req });
  res.json({ ok: true });
});

// ---------- CẤU HÌNH CHUNG ----------
router.get('/config', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM app_config WHERE id=1');
  res.json({ config: rows[0] });
});
router.put('/config', requireRole(...MANAGE), async (req, res) => {
  const { diem_nen, nguong_vang, nguong_cam, nguong_do } = req.body || {};
  if (!(nguong_vang < nguong_cam && nguong_cam < nguong_do)) {
    return res.status(400).json({ error: 'Ngưỡng phải tăng dần: vàng < cam < đỏ' });
  }
  const { rows } = await pool.query(
    `UPDATE app_config SET diem_nen=$1, nguong_vang=$2, nguong_cam=$3, nguong_do=$4, updated_at=now() WHERE id=1 RETURNING *`,
    [diem_nen, nguong_vang, nguong_cam, nguong_do]
  );
  await logActivity({ user: req.user, action: 'config.update', targetTable: 'app_config', targetId: 1, detail: req.body, req });
  res.json({ config: rows[0] });
});

module.exports = router;
