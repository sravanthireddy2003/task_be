-- Migration: add `public_id` column to `users` and populate with UUID-based hex strings
ALTER TABLE users
  ADD COLUMN public_id VARCHAR(64) NULL;

-- populate existing rows with per-row UUIDs (remove dashes)
UPDATE users SET public_id = REPLACE(UUID(), '-', '') WHERE public_id IS NULL OR public_id = '';

-- make column NOT NULL and unique to ensure external ids exist
ALTER TABLE users
  MODIFY COLUMN public_id VARCHAR(64) NOT NULL,
  ADD UNIQUE KEY (public_id);
