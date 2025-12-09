-- Add common client columns used by controller
ALTER TABLE clientss
  ADD COLUMN IF NOT EXISTS `ref` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `billing_address` TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `office_address` TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `gst_number` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `tax_id` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `industry` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `notes` TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `status` VARCHAR(64) DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS `manager_id` INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Indexes to speed up common lookups
CREATE INDEX IF NOT EXISTS idx_clientss_status ON clientss (status);
CREATE INDEX IF NOT EXISTS idx_clientss_manager_id ON clientss (manager_id);
CREATE INDEX IF NOT EXISTS idx_clientss_ref ON clientss (ref);
