const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'tpt'));

// Xem nhật ký hệ thống — trả lời được câu hỏi "Ai đã sửa dữ liệu này?"
router.get('/', async (req, res) => {
  const { from, to, username, action, limit } = req.query;
  const conds = [];
  const params = [];
  let i = 1;
  if (from) { conds.push(`created_at >= $${i++}`); params.push(from); }
  if (to) { conds.push(`created_at <= $${i++}`); params.push(to); }
  if (username) { conds.push(`username_snap ILIKE $${i++}`); params.push(`%${username}%`); }
  if (action) { conds.push(`action = $${i++}`); params.push(action); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  params.push(Number(limit) || 200);

  const { rows } = await pool.query(
    `SELECT id, username_snap, role_snap, action, target_table, target_id, detail, created_at
     FROM activity_logs ${where} ORDER BY created_at DESC LIMIT $${i}`,
    params
  );
  res.json({ logs: rows });
});

module.exports = router;
