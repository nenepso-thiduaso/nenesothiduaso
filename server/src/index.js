require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const catalogRoutes = require('./routes/catalog');
const recordRoutes = require('./routes/records');
const logRoutes = require('./routes/logs');

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || true,
  credentials: true, // bắt buộc để trình duyệt gửi/nhận cookie phiên đăng nhập
}));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/logs', logRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Phục vụ luôn giao diện web tĩnh (thư mục ../client) nếu có — để triển khai gọn 1 server duy nhất.
const clientDir = path.join(__dirname, '..', '..', 'client');
app.use(express.static(clientDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDir, 'index.html'));
});

// Middleware xử lý lỗi chung — tránh lộ chi tiết lỗi kỹ thuật ra ngoài
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Có lỗi xảy ra phía máy chủ' });
});

const PORT = process.env.PORT || 4000;

// Tự động tạo bảng + dữ liệu khởi tạo (nếu chưa có) mỗi khi server khởi động.
// Nhờ vậy KHÔNG cần vào Shell gõ lệnh tay — kể cả trên gói miễn phí của Render
// (gói miễn phí không hỗ trợ Shell). An toàn khi chạy lại nhiều lần vì migrate
// dùng "CREATE TABLE IF NOT EXISTS" và seed dùng "ON CONFLICT DO NOTHING".
async function startup() {
  try {
    await require('./db/migrate').run();
    await require('./db/seed').run();
    console.log('[startup] Đã kiểm tra/khởi tạo xong bảng và dữ liệu mặc định.');
  } catch (e) {
    console.error('[startup] Lỗi khi tự khởi tạo database (server vẫn sẽ chạy tiếp):', e);
  }
}

startup().then(() => {
  app.listen(PORT, () => console.log(`Server đang chạy tại cổng ${PORT}`));
});
