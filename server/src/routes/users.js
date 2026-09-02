const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logActivity } = require('../activityLog');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'tpt'));

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email, u.full_name, u.role, u.class_id, c.name AS class_name, u.is_active, u.created_at
     FROM users u LEFT JOIN classes c ON c.id = u.class_id
     ORDER BY u.created_at DESC`
  );
  res.json({ users: rows });
});

router.post('/', async (req, res) => {
  const { username, email, password, full_name, role, class_id } = req.body || {};
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
  }
  if (role === 'admin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ Admin mới được tạo tài khoản Admin khác' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu phải từ 6 ký tự trở lên' });

  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, full_name, role, class_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, role`,
      [username, email || null, hash, full_name, role, role === 'gvcn' ? class_id : null]
    );
    await logActivity({ user: req.user, action: 'user.create', targetTable: 'users', targetId: rows[0].id, detail: { username, role }, req });
    res.status(201).json({ user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Tên đăng nhập hoặc email đã tồn tại' });
    throw e;
  }
});

router.patch('/:id', async (req, res) => {
  const { full_name, role, class_id, is_active, password } = req.body || {};
  const fields = [];
  const values = [];
  let i = 1;
  if (full_name !== undefined) { fields.push(`full_name=$${i++}`); values.push(full_name); }
  if (role !== undefined) { fields.push(`role=$${i++}`); values.push(role); }
  if (class_id !== undefined) { fields.push(`class_id=$${i++}`); values.push(class_id); }
  if (is_active !== undefined) { fields.push(`is_active=$${i++}`); values.push(is_active); }
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu phải từ 6 ký tự trở lên' });
    fields.push(`password_hash=$${i++}`); values.push(await bcrypt.hash(password, 12));
  }
  if (fields.length === 0) return res.status(400).json({ error: 'Không có gì để cập nhật' });
  fields.push(`updated_at=now()`);
  values.push(req.params.id);

  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id=$${i}`, values);
  await logActivity({ user: req.user, action: 'user.update', targetTable: 'users', targetId: req.params.id, detail: req.body, req });
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Không thể tự xoá chính mình' });
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  await logActivity({ user: req.user, action: 'user.delete', targetTable: 'users', targetId: req.params.id, req });
  res.json({ ok: true });
});

module.exports = router;
