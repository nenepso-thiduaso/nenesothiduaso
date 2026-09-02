-- =====================================================================
-- SCHEMA CƠ SỞ DỮ LIỆU — HỆ THỐNG "NỀ NẾP SỐ - THI ĐUA SỐ"
-- PostgreSQL 14+
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- dùng gen_random_uuid()

-- ---------- ENUM VAI TRÒ ----------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin','tpt','gvcn','gvbm','codo','bgh');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE criteria_type AS ENUM ('plus','minus');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE entry_status AS ENUM ('pending','confirmed','disputed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- BẢNG LỚP ----------
CREATE TABLE IF NOT EXISTS classes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,        -- VD: 6.1
  grade         TEXT,                        -- VD: Khối 6
  school_year   TEXT NOT NULL DEFAULT '2026-2027',
  homeroom_teacher_id UUID,                  -- fk -> users.id (GVCN), gán sau khi tạo bảng users
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- BẢNG TÀI KHOẢN NGƯỜI DÙNG ----------
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT NOT NULL UNIQUE,
  email           TEXT UNIQUE,
  password_hash   TEXT NOT NULL,             -- bcrypt hash, KHÔNG BAO GIỜ lưu chữ thường
  full_name       TEXT NOT NULL,
  role            user_role NOT NULL,
  class_id        UUID REFERENCES classes(id) ON DELETE SET NULL, -- chỉ dùng cho role = gvcn
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE classes
  ADD CONSTRAINT fk_classes_homeroom
  FOREIGN KEY (homeroom_teacher_id) REFERENCES users(id) ON DELETE SET NULL;

-- ---------- BẢNG HỌC SINH ----------
CREATE TABLE IF NOT EXISTS students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   TEXT NOT NULL,
  class_id    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  gender      TEXT,
  dob         DATE,
  status      TEXT NOT NULL DEFAULT 'active', -- active/transferred/left
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);

-- ---------- BẢNG TIÊU CHÍ ----------
CREATE TABLE IF NOT EXISTS criteria (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        criteria_type NOT NULL,
  points      INTEGER NOT NULL CHECK (points > 0),
  group_name  TEXT NOT NULL DEFAULT 'Khác',
  severity    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- BẢNG GHI NHẬN (trung tâm hệ thống) ----------
CREATE TABLE IF NOT EXISTS entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id          UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id        UUID REFERENCES students(id) ON DELETE SET NULL,
  student_name_snap TEXT,                     -- lưu kèm tên tại thời điểm ghi, phòng khi học sinh đổi lớp/xoá
  criteria_id       UUID NOT NULL REFERENCES criteria(id),
  points_snap       INTEGER NOT NULL,          -- sao chép điểm tại thời điểm ghi nhận, không đổi dù sau này sửa tiêu chí
  entry_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  note              TEXT,
  recorded_by       UUID NOT NULL REFERENCES users(id),
  status            entry_status NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entries_class_date ON entries(class_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_entries_student ON entries(student_id);

-- ---------- BẢNG CẤU HÌNH CHUNG (1 dòng duy nhất) ----------
CREATE TABLE IF NOT EXISTS app_config (
  id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  diem_nen      INTEGER NOT NULL DEFAULT 100,
  nguong_vang   INTEGER NOT NULL DEFAULT 2,
  nguong_cam    INTEGER NOT NULL DEFAULT 4,
  nguong_do     INTEGER NOT NULL DEFAULT 6,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------- BẢNG NHẬT KÝ HỆ THỐNG (activity_logs) ----------
CREATE TABLE IF NOT EXISTS activity_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  username_snap TEXT NOT NULL,               -- lưu kèm tên đăng nhập, không mất dấu vết dù tài khoản bị xoá
  role_snap     TEXT NOT NULL,
  action        TEXT NOT NULL,               -- VD: 'record.create', 'entry.delete', 'user.create'
  target_table  TEXT,
  target_id     TEXT,
  detail        JSONB,                       -- dữ liệu chi tiết dạng JSON (trước/sau, mô tả...)
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_time ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);

-- ---------- BẢNG PHIÊN ĐĂNG NHẬP (để có thể thu hồi phiên nếu cần) ----------
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,               -- hash của refresh token, không lưu token gốc
  user_agent    TEXT,
  ip_address    TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
