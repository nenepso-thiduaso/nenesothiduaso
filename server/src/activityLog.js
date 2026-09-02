const pool = require('./db');

/**
 * Ghi 1 dòng vào activity_logs. Gọi hàm này ở MỌI thao tác thêm/sửa/xoá quan trọng
 * (ghi nhận, sửa điểm, thêm/xoá tài khoản, đổi cấu hình...) để sau này truy vết được
 * "ai đã làm gì, lúc nào".
 */
async function logActivity({ user, action, targetTable = null, targetId = null, detail = null, req = null }) {
  try {
    await pool.query(
      `INSERT INTO activity_logs (user_id, username_snap, role_snap, action, target_table, target_id, detail, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        user?.id || null,
        user?.username || 'unknown',
        user?.role || 'unknown',
        action,
        targetTable,
        targetId ? String(targetId) : null,
        detail ? JSON.stringify(detail) : null,
        req?.ip || null,
      ]
    );
  } catch (e) {
    // Không để lỗi ghi log làm hỏng thao tác chính — chỉ log ra console server.
    console.error('Không ghi được activity_log:', e.message);
  }
}

module.exports = { logActivity };
