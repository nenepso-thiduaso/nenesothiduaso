#!/bin/bash
# Khôi phục database từ 1 file backup .sql.gz
# Cách dùng: ./restore.sh /var/backups/nenepso/daily/nenepdb_daily_20261101_020000.sql.gz
set -e
FILE="$1"
if [ -z "$FILE" ]; then
  echo "Cách dùng: ./restore.sh <đường-dẫn-file-backup.sql.gz>"
  exit 1
fi
export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)

echo "CẢNH BÁO: thao tác này sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại trong database đích."
read -p "Nhập 'DONG-Y' để tiếp tục: " confirm
if [ "$confirm" != "DONG-Y" ]; then
  echo "Đã huỷ."
  exit 1
fi

gunzip -c "$FILE" | psql "$DATABASE_URL"
echo "Khôi phục xong từ $FILE"
