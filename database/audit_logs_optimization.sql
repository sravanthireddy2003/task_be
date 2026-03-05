-- =====================================================
-- 1) VALIDATE & OPTIMIZE EXISTING TABLE: audit_logs
-- =====================================================

-- ALTER TABLE statements (add only missing columns)
ALTER TABLE audit_logs 
ADD COLUMN IF NOT EXISTS module VARCHAR(50) DEFAULT NULL COMMENT 'Module name: Auth, Tasks, Projects, etc.',
ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) DEFAULT NULL COMMENT 'IP address of actor',
ADD COLUMN IF NOT EXISTS user_agent TEXT DEFAULT NULL COMMENT 'User agent string',
ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(100) DEFAULT NULL COMMENT 'Request correlation ID',
ADD COLUMN IF NOT EXISTS previous_value JSON DEFAULT NULL COMMENT 'Previous state before change',
ADD COLUMN IF NOT EXISTS new_value JSON DEFAULT NULL COMMENT 'New state after change';

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs(tenant_id, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_audit_module_action ON audit_logs(module, action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_module ON audit_logs(tenant_id, module, createdAt DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_audit_tenant_module_action_created ON audit_logs(tenant_id, module, action, createdAt DESC);

-- Full schema for reference (if creating from scratch)
/*
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id VARCHAR(100) DEFAULT NULL COMMENT 'User ID or system identifier',
  tenant_id INT NOT NULL COMMENT 'Tenant ID for multi-tenancy',
  action VARCHAR(100) NOT NULL COMMENT 'Action performed',
  entity VARCHAR(100) DEFAULT NULL COMMENT 'Entity type affected',
  entity_id VARCHAR(100) DEFAULT NULL COMMENT 'Entity ID affected',
  module VARCHAR(50) DEFAULT NULL COMMENT 'Module name: Auth, Tasks, Projects, etc.',
  ip_address VARCHAR(45) DEFAULT NULL COMMENT 'IP address of actor',
  user_agent TEXT DEFAULT NULL COMMENT 'User agent string',
  correlation_id VARCHAR(100) DEFAULT NULL COMMENT 'Request correlation ID',
  details JSON DEFAULT NULL COMMENT 'Additional metadata',
  previous_value JSON DEFAULT NULL COMMENT 'Previous state before change',
  new_value JSON DEFAULT NULL COMMENT 'New state after change',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_tenant_created (tenant_id, createdAt DESC),
  INDEX idx_audit_module_action (module, action),
  INDEX idx_audit_created (createdAt DESC),
  INDEX idx_audit_actor (actor_id, createdAt DESC),
  INDEX idx_audit_entity (entity, entity_id),
  INDEX idx_audit_correlation (correlation_id),
  INDEX idx_audit_tenant_module (tenant_id, module, createdAt DESC),
  INDEX idx_audit_tenant_module_action_created (tenant_id, module, action, createdAt DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
*/
