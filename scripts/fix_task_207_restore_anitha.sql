-- Fix script: restore edit access for Anitha on task 207
-- Replace <ANITHA_INTERNAL_ID> with the actual internal _id for Anitha (e.g., 12)

BEGIN;

-- Set is_read_only = 0 for Anitha on task 207
UPDATE taskassignments
SET is_read_only = 0
WHERE task_id = 207 AND user_id = <ANITHA_INTERNAL_ID>;

COMMIT;

-- Optional: verify
-- SELECT id, task_id, user_id, is_read_only FROM taskassignments WHERE task_id = 207;
