-- Add tenant_id to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(128) DEFAULT NULL;

-- Add password change timestamp and lock flag
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at DATETIME DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_locked TINYINT(1) DEFAULT 0;

-- Password history table
CREATE TABLE IF NOT EXISTS password_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(128),
  password_hash VARCHAR(255),
  changed_at DATETIME,
  INDEX (user_id)
);

-- Login history table
CREATE TABLE IF NOT EXISTS login_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(128),
  tenant_id VARCHAR(128),
  ip VARCHAR(128),
  user_agent VARCHAR(255),
  success TINYINT(1),
  created_at DATETIME
);

-- Ensure clients table has tenant_id
ALTER TABLE clientss
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(128) DEFAULT NULL;
