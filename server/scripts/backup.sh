#!/bin/bash
# =====================================================================
# SCRIPT BACKUP DATABASE — Hệ thống Nề nếp số - Thi đua số
# =====================================================================
# Cách dùng:
#   ./backup.sh daily     -> chạy mỗi ngày (giữ lại 14 bản gần nhất)
#   ./backup.sh weekly    -> chạy mỗi tuần (giữ lại 12 bản gần nhất, ~3 tháng)
#
# Thiết lập chạy tự động bằng cron trên server, ví dụ (crontab -e):
#   0 2 * * *   /duong-dan/backup.sh daily    >> /var/log/nenepso-backup.log 2>&1
#   0 3 * * 0   /duong-dan/backup.sh weekly   >> /var/log/nenepso-backup.log 2>&1
#
# KHUYẾN NGHỊ: sau khi tạo file backup, đồng bộ (rsync/rclone) sang một nơi lưu trữ
# KHÁC vị trí vật lý với server chính (ví dụ Google Drive, một VPS khác...) để
# tránh mất luôn cả bản sao lưu nếu server chính gặp sự cố (cháy, hỏng ổ cứng...).
# =====================================================================
set -e

MODE="${1:-daily}"                     # daily | weekly
BACKUP_DIR="/var/backups/nenepso/$MODE"
KEEP_COUNT=$([ "$MODE" = "weekly" ] && echo 12 || echo 14)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/nenepdb_${MODE}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# DATABASE_URL lấy từ file .env cùng thư mục server/
export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)

echo "[$(date)] Bắt đầu backup ($MODE) -> $FILE"
pg_dump "$DATABASE_URL" | gzip > "$FILE"
echo "[$(date)] Backup xong: $(du -h "$FILE" | cut -f1)"

# Xoá bớt bản cũ, chỉ giữ lại KEEP_COUNT bản gần nhất
cd "$BACKUP_DIR"
ls -1t nenepdb_${MODE}_*.sql.gz | tail -n +$((KEEP_COUNT + 1)) | xargs -r rm --
echo "[$(date)] Đã dọn bớt bản cũ, chỉ giữ $KEEP_COUNT bản gần nhất."

# ---- (Tuỳ chọn) đồng bộ sang nơi lưu trữ dự phòng khác vị trí vật lý ----
# Ví dụ dùng rclone (cần cài và cấu hình sẵn: rclone config):
# rclone copy "$FILE" remote:nenepso-backups/$MODE/
