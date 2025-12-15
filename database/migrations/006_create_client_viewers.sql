-- Create mapping table for client viewers
CREATE TABLE IF NOT EXISTS client_viewers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  UNIQUE KEY uniq_client_user (client_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional index for lookups by user
CREATE INDEX IF NOT EXISTS idx_client_viewers_user ON client_viewers (user_id);
