-- Allow staff to clear resolved face renewal requests from the admin queue
-- without deleting the underlying audit record.

ALTER TABLE face_renewal_requests
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_by bigint REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dismissed_by_name text;

CREATE INDEX IF NOT EXISTS idx_face_renewal_requests_dismissed
  ON face_renewal_requests (dismissed_at, created_at DESC);
