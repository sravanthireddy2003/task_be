-- Add soft-delete columns to clientss
ALTER TABLE clientss
  ADD COLUMN IF NOT EXISTS isDeleted TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME DEFAULT NULL;

-- Optional index for queries filtering deleted flag
CREATE INDEX IF NOT EXISTS idx_clientss_isDeleted ON clientss (isDeleted);
