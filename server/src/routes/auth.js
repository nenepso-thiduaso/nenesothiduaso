const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { signToken, setSessionCookie, clearSessionCookie, requireAuth } = require('../middleware/auth');
const { logActivity } = require('../activityLog');

const router = express.Router();

// Giới hạn đơn giản chống dò mật khẩu: tối đa 8 lần thử / 10 phút / IP.
const attempts = new Map(); // ip -> {count, resetAt}
function rateLimitLogin(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return next();
  }
  if (rec.count >= 8) {
    return res.status(429).json({ error: 'Thử sai quá nhiều lần, vui lòng đợi vài phút rồi thử lại.' });
  }
  rec.count++;
  next();
}

router.post('/login', rateLimitLogin, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
  }
  const { rows } = await pool.query(
    'SELECT id, username, password_hash, full_name, role, class_id, is_active FROM users WHERE lower(username) = lower($1)',
    [username]
  );
  const user = rows[0];
  // Trả lỗi giống nhau dù sai username hay sai password — tránh lộ thông tin tài khoản có tồn tại hay không.
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    await logActivity({ user, action: 'auth.login_failed', req });
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }

  const token = signToken(user);
  setSessionCookie(res, token);
  await logActivity({ user, action: 'auth.login_success', req });

  res.json({
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, class_id: user.class_id },
  });
});

router.post('/logout', requireAuth, async (req, res) => {
  await logActivity({ user: req.user, action: 'auth.logout', req });
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Gọi khi mở lại website: nếu cookie phiên còn hợp lệ, tự nhận diện tài khoản mà không cần đăng nhập lại.
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu mới phải từ 6 ký tự trở lên' });
  }
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  const ok = await bcrypt.compare(old_password || '', rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });

  const newHash = await bcrypt.hash(new_password, 12);
  await pool.query('UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2', [newHash, req.user.id]);
  await logActivity({ user: req.user, action: 'auth.change_password', targetTable: 'users', targetId: req.user.id, req });
  res.json({ ok: true });
});

module.exports = router;
