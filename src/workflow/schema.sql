-- Workflow Module Database Schema
-- Run these in your MySQL/Postgres database

-- Table for workflow definitions (per-tenant)
CREATE TABLE workflow_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  entity_type ENUM('TASK', 'PROJECT') NOT NULL,
  name VARCHAR(255) NOT NULL,
  states JSON NOT NULL, -- Array of state names
  rules JSON NOT NULL, -- Role-based rules for transitions
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tenant_entity (tenant_id, entity_type)
);

-- Table for workflow requests (pending approvals)
CREATE TABLE workflow_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  entity_type ENUM('TASK', 'PROJECT') NOT NULL,
  entity_id INT NOT NULL,
  from_state VARCHAR(50) NOT NULL,
  to_state VARCHAR(50) NOT NULL,
  requested_by INT NOT NULL, -- User ID
  approved_by INT NULL, -- User ID, null if pending
  status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tenant_status (tenant_id, status),
  INDEX idx_entity (entity_type, entity_id)
);

-- Table for workflow logs (audit trail)
CREATE TABLE workflow_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NULL, -- Links to workflow_requests.id, null for direct actions
  tenant_id INT NOT NULL,
  entity_type ENUM('TASK', 'PROJECT') NOT NULL,
  entity_id INT NOT NULL,
  action VARCHAR(100) NOT NULL, -- e.g., 'STATE_CHANGE', 'APPROVAL_REQUEST'
  from_state VARCHAR(50),
  to_state VARCHAR(50),
  user_id INT NOT NULL,
  details JSON, -- Additional info
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tenant_entity (tenant_id, entity_type, entity_id),
  INDEX idx_request (request_id)
);