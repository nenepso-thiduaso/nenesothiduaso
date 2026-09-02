// Chạy file schema.sql để tạo toàn bộ bảng trong database.
// Dùng: node src/db/migrate.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Đã tạo/cập nhật xong toàn bộ bảng theo schema.sql');
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
