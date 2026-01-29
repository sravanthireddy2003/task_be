-- Migration: add new_assignee_id to task_resign_requests
-- Run this against your application's database.

ALTER TABLE `task_resign_requests`
  ADD COLUMN `new_assignee_id` VARCHAR(255) NULL COMMENT 'users._id of the new assignee',
  ADD INDEX `idx_new_assignee_id` (`new_assignee_id`);
