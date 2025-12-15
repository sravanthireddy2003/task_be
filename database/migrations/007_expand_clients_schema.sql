-- Expand clients table with all required fields
ALTER TABLE clientss
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS office_address TEXT,
  ADD COLUMN IF NOT EXISTS gst_number VARCHAR(255),
  ADD COLUMN IF NOT EXISTS tax_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS bank_details TEXT,
  ADD COLUMN IF NOT EXISTS industry_type VARCHAR(255),
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_by INT,
  ADD COLUMN IF NOT EXISTS updated_by INT,
  ADD COLUMN IF NOT EXISTS manager_id INT,
  ADD COLUMN IF NOT EXISTS tenant_id INT,
  ADD COLUMN IF NOT EXISTS created_at DATETIME DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT NOW();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_clientss_status ON clientss (status);
CREATE INDEX IF NOT EXISTS idx_clientss_manager_id ON clientss (manager_id);
CREATE INDEX IF NOT EXISTS idx_clientss_tenant_id ON clientss (tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientss_gst ON clientss (gst_number);

-- Enhance client_contacts with validation
ALTER TABLE client_contacts
  ADD COLUMN IF NOT EXISTS email_validated TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phone_validated TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_client_contacts_email ON client_contacts (email);
CREATE INDEX IF NOT EXISTS idx_client_contacts_phone ON client_contacts (phone);

-- Enhance client_documents with document type
ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS document_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_client_documents_type ON client_documents (document_type);

-- Create onboarding_tasks table for auto-generated tasks
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  task_id INT,
  task_title VARCHAR(255) NOT NULL,
  task_description TEXT,
  assigned_to INT,
  status VARCHAR(50) DEFAULT 'Pending',
  due_date DATETIME,
  created_at DATETIME DEFAULT NOW(),
  completed_at DATETIME,
  FOREIGN KEY (client_id) REFERENCES clientss(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_client ON onboarding_tasks (client_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_status ON onboarding_tasks (status);

-- Enhance activity logs
ALTER TABLE client_activity_logs
  ADD COLUMN IF NOT EXISTS action_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
  ADD COLUMN IF NOT EXISTS changes JSON;

CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON client_activity_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON client_activity_logs (created_at);

-- Ensure client_viewers has proper structure
ALTER TABLE client_viewers
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_client_viewers_active ON client_viewers (is_active);
