// Chạy file schema.sql để tạo toàn bộ bảng trong database.
// Dùng: node src/db/migrate.js (chạy tay) — hoặc được index.js tự gọi lúc khởi động server.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[migrate] Đã tạo/cập nhật xong toàn bộ bảng theo schema.sql');
}

// Chỉ tự chạy + đóng pool khi file này được gọi trực tiếp bằng "node src/db/migrate.js".
// Khi được require() từ index.js, KHÔNG đóng pool vì server còn cần dùng tiếp.
if (require.main === module) {
  run().then(() => pool.end()).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { run };

