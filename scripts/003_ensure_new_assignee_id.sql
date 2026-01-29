-- Migration: Ensure task_resign_requests.new_assignee_id exists
-- Run this on your dev DB if the column is missing. This script is intentionally safe
-- and uses information_schema to check presence before running the ALTER.

-- NOTE: Some MySQL versions don't allow conditional DDL in a single script
-- This file documents the required ALTER; run the ALTER manually if needed.

SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'task_resign_requests'
  AND COLUMN_NAME = 'new_assignee_id';

-- If the above SELECT returns no rows, run the following:
-- ALTER TABLE task_resign_requests ADD COLUMN new_assignee_id INT NULL AFTER responded_at;

-- Optionally add a foreign key (if you want stricter referential integrity):
-- ALTER TABLE task_resign_requests ADD CONSTRAINT fk_trr_new_assignee FOREIGN KEY (new_assignee_id) REFERENCES users(_id) ON DELETE SET NULL;
