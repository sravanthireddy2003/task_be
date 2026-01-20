-- Migration: Add `new_assignee_id` to `task_resign_requests`
-- Run with: mysql -u <user> -p <database> < 20260120_add_new_assignee_id_to_task_resign_requests.sql

SET FOREIGN_KEY_CHECKS=0;

START TRANSACTION;

-- Add column (MySQL 8+ supports IF NOT EXISTS for ADD COLUMN)
ALTER TABLE task_resign_requests
  ADD COLUMN new_assignee_id INT NULL AFTER requested_by;

-- Add index for faster lookups
CREATE INDEX idx_task_resign_new_assignee ON task_resign_requests (new_assignee_id);

COMMIT;

SET FOREIGN_KEY_CHECKS=1;

-- Rollback (if needed):
-- ALTER TABLE task_resign_requests DROP COLUMN new_assignee_id;
