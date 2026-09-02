const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Bật SSL khi deploy lên hầu hết dịch vụ Postgres đám mây (Render, Railway, Supabase...):
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Lỗi không mong muốn từ PostgreSQL pool:', err);
});

module.exports = pool;
