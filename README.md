# Hệ thống "Nề nếp số - Thi đua số" — Bản Full-stack (Node.js + PostgreSQL)

Xem hướng dẫn triển khai chi tiết trong file: `HUONG_DAN_TRIEN_KHAI.docx` (gửi kèm ngoài thư mục này).

## Cấu trúc thư mục
- `server/` — Backend Node.js + Express + PostgreSQL (API, xác thực, phân quyền, nhật ký hệ thống)
- `client/` — Giao diện web (HTML/CSS/JS thuần, gọi API của server) — có hỗ trợ **cài đặt như ứng dụng (PWA)** trên điện thoại và máy tính (manifest.json, sw.js, icons/)

## Cài đặt như ứng dụng trên điện thoại/máy tính (PWA)
Sau khi triển khai lên internet với địa chỉ HTTPS (bắt buộc để PWA hoạt động):
- **Android/Chrome/Edge (máy tính)**: mở trang web, sẽ tự hiện nút "📲 Cài đặt ứng dụng" trên thanh tiêu đề — bấm để cài như app thật, có icon riêng, mở toàn màn hình.
- **iPhone/iPad (Safari)**: bấm nút Chia sẻ (⬆️) → "Thêm vào Màn hình chính".
- Sau khi cài, mở từ icon trên máy — không cần mở trình duyệt, không cần đăng nhập lại (phiên nhớ 30 ngày), có thông báo khi mất mạng.


## Chạy thử trên máy tính cá nhân (trước khi đưa lên internet)
```bash
cd server
npm install
cp .env.example .env        # rồi sửa DATABASE_URL, JWT_SECRET trong file .env
node src/db/migrate.js      # tạo bảng
node src/db/seed.js         # tạo dữ liệu mẫu + tài khoản admin đầu tiên
npm start                   # chạy server tại http://localhost:4000
```
Mở trình duyệt vào `http://localhost:4000` — client đã được server phục vụ sẵn, không cần chạy riêng.

## Backup dữ liệu
Xem `server/scripts/backup.sh` và `server/scripts/restore.sh`.
