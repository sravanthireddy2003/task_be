/**
 * Enhanced Client Management API Controller
 * Complete CRUD with permissions, validation, dashboard, and onboarding
 */
const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require('../logger');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mime = require('mime-types');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const managerAccess = require(__root + 'middleware/managerAccess');
const clientViewer = require(__root + 'middleware/clientViewer');
const emailService = require(__root + 'utils/emailService');
const ClientOnboardingService = require(__root + 'services/ClientOnboardingService');
const {
  validateCreateClientDTO,
  validateUpdateClientDTO,
  validateContactDTO,
  sanitizeClientData,
  ClientValidationError,
  validateEmail,
  validatePhone
} = require(__root + 'services/ClientValidationService');
require('dotenv').config();

// ==================== MULTER SETUP ====================
const uploadsRoot = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsRoot);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_\.]/g, '_');
    const name = `${base}_${Date.now()}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

// ==================== HELPERS ====================
function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

const columnCache = {};
async function hasColumn(table, column) {
  const key = `${table}::${column}`;
  if (columnCache[key] !== undefined) return columnCache[key];
  try {
    const rows = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column]);
    const ok = Array.isArray(rows) && rows.length > 0;
    columnCache[key] = ok;
    return ok;
  } catch (e) {
    columnCache[key] = false;
    return false;
  }
}

async function tableExists(tableName) {
  try {
    const rows = await q("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [tableName]);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    return false;
  }
}

function guessMimeType(filename) {
  if (!filename) return null;
  const m = mime.lookup(filename);
  if (m) return m;
  const ext = (path.extname(filename) || '').toLowerCase().replace('.', '');
  const map = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return map[ext] || null;
}

async function ensureClientTables() {
  try {
    if (!await tableExists('client_contacts')) {
      await q("CREATE TABLE IF NOT EXISTS client_contacts (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, name VARCHAR(255) NOT NULL, email VARCHAR(255), phone VARCHAR(50), designation VARCHAR(255), is_primary TINYINT(1) DEFAULT 0, created_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
    if (!await tableExists('client_documents')) {
      await q("CREATE TABLE IF NOT EXISTS client_documents (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, file_url TEXT, file_name VARCHAR(255), file_type VARCHAR(100), uploaded_by INT, uploaded_at DATETIME DEFAULT NOW(), is_active TINYINT(1) DEFAULT 1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
    if (!await tableExists('client_activity_logs')) {
      await q("CREATE TABLE IF NOT EXISTS client_activity_logs (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, actor_id INT, action VARCHAR(255), details TEXT, created_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
    if (!await tableExists('client_viewers')) {
      await q("CREATE TABLE IF NOT EXISTS client_viewers (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, user_id INT NOT NULL, created_at DATETIME DEFAULT NOW(), UNIQUE KEY uniq_client_user (client_id, user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
  } catch (e) {
    logger.warn('Failed to ensure client tables: ' + e.message);
  }
}

// ==================== MIDDLEWARE ====================
router.use(requireAuth);
router.use(clientViewer);
router.use(managerAccess);

module.exports = router;
