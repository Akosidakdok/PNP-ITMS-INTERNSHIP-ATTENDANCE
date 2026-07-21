-- Migration script for Face Verification feature in PNP-ITMS Internship Attendance

-- 1. Add face verification columns to `accounts` table
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS face_embedding jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS face_registered boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS face_registered_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS face_photo text DEFAULT NULL;

-- 2. Add face verification fields to `attendance_logs` table
ALTER TABLE attendance_logs 
ADD COLUMN IF NOT EXISTS verification_score numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'Pending';

-- Index for quickly querying face registration status
CREATE INDEX IF NOT EXISTS idx_accounts_face_registered ON accounts (face_registered);
