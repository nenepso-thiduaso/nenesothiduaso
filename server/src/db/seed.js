// Seed dữ liệu khởi tạo: 18 lớp, danh mục tiêu chí mẫu, 1 tài khoản admin đầu tiên.
// Chạy: node src/db/seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db');

const CLASSES = ['6.1','6.2','6.3','6.4','6.5','7.1','7.2','7.3','7.4','8.1','8.2','8.3','8.4','9.1','9.2','9.3','9.4','9.5'];

const CRITERIA = [
  ['Đi học trễ','minus',2,'Nề nếp cá nhân','Nhẹ'],
  ['Không mặc đúng đồng phục','minus',2,'Nề nếp cá nhân','Nhẹ'],
  ['Không đeo khăn quàng','minus',2,'Nề nếp cá nhân','Nhẹ'],
  ['Không mang bảng tên','minus',1,'Nề nếp cá nhân','Nhẹ'],
  ['Nói chuyện trong giờ','minus',2,'Nề nếp cá nhân','Nhẹ'],
  ['Xả rác','minus',3,'Vệ sinh','Vừa'],
  ['Không trực nhật','minus',3,'Vệ sinh','Vừa'],
  ['Không thực hiện yêu cầu của giáo viên','minus',3,'Ý thức - kỷ luật','Vừa'],
  ['Vi phạm nội quy trường','minus',5,'Ý thức - kỷ luật','Nặng'],
  ['Đánh nhau','minus',10,'Vi phạm nghiêm trọng','Nghiêm trọng'],
  ['Mang vật dụng bị cấm','minus',10,'Vi phạm nghiêm trọng','Nghiêm trọng'],
  ['Giúp đỡ bạn','plus',3,'Khuyến khích',null],
  ['Nhặt được của rơi trả lại','plus',5,'Khuyến khích',null],
  ['Tham gia tích cực hoạt động Đội','plus',2,'Khuyến khích',null],
  ['Thành tích cấp trường','plus',5,'Khuyến khích',null],
];

async function main(){
  const client = await pool.connect();
  try{
    await client.query('BEGIN');

    // 1) lớp
    for(const name of CLASSES){
      const grade = 'Khối ' + name.split('.')[0];
      await client.query(
        `INSERT INTO classes (name, grade) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING`,
        [name, grade]
      );
    }

    // 2) tiêu chí — chỉ thêm nếu bảng đang trống, tránh chạy seed nhiều lần bị trùng
    const { rows: existingCrit } = await client.query('SELECT COUNT(*) FROM criteria');
    if (Number(existingCrit[0].count) === 0) {
      for(const [name,type,points,group,severity] of CRITERIA){
        await client.query(
          `INSERT INTO criteria (name, type, points, group_name, severity) VALUES ($1,$2,$3,$4,$5)`,
          [name,type,points,group,severity]
        );
      }
    }

    // 3) tài khoản admin đầu tiên (đổi mật khẩu này ngay sau khi đăng nhập lần đầu!)
    const defaultPassword = process.env.SEED_ADMIN_PASSWORD || 'DoiMatKhauNgay123!';
    const hash = await bcrypt.hash(defaultPassword, 12);
    await client.query(
      `INSERT INTO users (username, email, password_hash, full_name, role)
       VALUES ('admin', 'admin@hieutuschool.local', $1, 'Quản trị hệ thống', 'admin')
       ON CONFLICT (username) DO NOTHING`,
      [hash]
    );

    await client.query('COMMIT');
    console.log('Seed xong. Tài khoản đầu tiên: admin /', defaultPassword);
    console.log('=> Hãy đăng nhập và đổi mật khẩu này ngay lập tức.');
  }catch(e){
    await client.query('ROLLBACK');
    console.error('Seed lỗi:', e);
    process.exitCode = 1;
  }finally{
    client.release();
    await pool.end();
  }
}
main();
