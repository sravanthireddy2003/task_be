const db = require('./src/config/db');

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

async function createDocumentTables() {
  try {
    logger.info('Creating document management tables...');

    const q = (sql, params = []) => new Promise((resolve, reject) => {
      db.query(sql, params, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Create documents table
    logger.info('Creating documents table...');
    await q(`
      CREATE TABLE IF NOT EXISTS documents (
        documentId VARCHAR(255) PRIMARY KEY,
        entityType ENUM('CLIENT', 'PROJECT', 'TASK') NOT NULL,
        entityId VARCHAR(255) NOT NULL,
        uploadedBy VARCHAR(255) NOT NULL,
        storageProvider ENUM('s3', 'local') DEFAULT 'local',
        filePath TEXT NOT NULL,
        fileName VARCHAR(255),
        fileSize BIGINT,
        mimeType VARCHAR(100),
        encrypted BOOLEAN DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_entity (entityType, entityId),
        INDEX idx_uploaded_by (uploadedBy),
        INDEX idx_created_at (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create document_access table
    logger.info('Creating document_access table...');
    await q(`
      CREATE TABLE IF NOT EXISTS document_access (
        id INT AUTO_INCREMENT PRIMARY KEY,
        documentId VARCHAR(255) NOT NULL,
        userId VARCHAR(255) NOT NULL,
        accessType ENUM('READ', 'WRITE', 'ADMIN') DEFAULT 'READ',
        grantedBy VARCHAR(255) NOT NULL,
        grantedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiresAt TIMESTAMP NULL,
        isActive BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (documentId) REFERENCES documents(documentId) ON DELETE CASCADE,
        UNIQUE KEY unique_document_user (documentId, userId),
        INDEX idx_user (userId),
        INDEX idx_document (documentId),
        INDEX idx_active (isActive)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('Creating client_documents table...');
    await q(`
      CREATE TABLE IF NOT EXISTS client_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id VARCHAR(255) NOT NULL,
        document_name VARCHAR(255) NOT NULL,
        document_type VARCHAR(100),
        document_url TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        uploaded_by VARCHAR(255),
        INDEX idx_client (client_id),
        INDEX idx_uploaded_at (uploaded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ All document tables created successfully!');

    // Verify tables exist
    logger.info('Verifying tables...');
    const tables = await q("SHOW TABLES LIKE 'documents'");
    if (tables.length > 0) {
      logger.info('✅ documents table exists');
    }

    const accessTables = await q("SHOW TABLES LIKE 'document_access'");
    if (accessTables.length > 0) {
      logger.info('✅ document_access table exists');
    }

    const clientDocTables = await q("SHOW TABLES LIKE 'client_documents'");
    if (clientDocTables.length > 0) {
      logger.info('✅ client_documents table exists');
    }

  } catch (error) {
    logger.error('❌ Failed to create document tables:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

createDocumentTables();