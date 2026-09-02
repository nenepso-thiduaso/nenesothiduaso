const jwt = require('jsonwebtoken');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Không cho phép chạy server nếu thiếu secret — tránh ký token bằng giá trị đoán được.
  throw new Error('Thiếu biến môi trường JWT_SECRET. Xem file .env.example.');
}
const COOKIE_NAME = 'nenepso_session';
const TOKEN_TTL = '30d'; // "nhớ đăng nhập" — không cần đăng nhập lại mỗi lần mở web

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, username: user.username, class_id: user.class_id },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,       // JS phía client không đọc được, chống đánh cắp qua XSS
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // bắt buộc HTTPS khi lên production
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 ngày — khớp với TOKEN_TTL
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// Middleware: yêu cầu đã đăng nhập. Gắn req.user nếu hợp lệ.
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const payload = jwt.verify(token, JWT_SECRET);

    // Kiểm tra tài khoản còn tồn tại & còn hoạt động (phòng trường hợp admin đã khoá/xoá)
    const { rows } = await pool.query(
      'SELECT id, username, full_name, role, class_id, is_active FROM users WHERE id = $1',
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Tài khoản không còn hiệu lực' });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
  }
}

// Middleware: giới hạn theo vai trò, dùng sau requireAuth. VD: requireRole('admin','tpt')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Tài khoản của bạn không có quyền thực hiện thao tác này' });
    }
    next();
  };
}

module.exports = { signToken, setSessionCookie, clearSessionCookie, requireAuth, requireRole, COOKIE_NAME };
