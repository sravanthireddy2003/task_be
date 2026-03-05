const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsp = require("fs").promises;
const env = require('./src/config/env');
const { safeFilename } = require('./src/utils/fileHelper');

const ensureUploadsDir = async () => {
  const dir = path.join(process.cwd(), "uploads/profiles");
  try {
    await fsp.access(dir); // FIXED: use fs.promises
  } catch {
    await fsp.mkdir(dir, { recursive: true }); // FIXED
  }
};


const storage = multer.memoryStorage();

const MAX_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || String(env.MAX_UPLOAD_SIZE || 25 * 1024 * 1024), 10);

const allowedMimes = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]);

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const ok = allowedMimes.has(file.mimetype) || file.mimetype.startsWith('image/');
    if (!ok) return cb(new Error('File type not allowed'), false);
    return cb(null, true);
  },
});

upload.ensureUploadsDir = ensureUploadsDir;

upload.safeFilename = safeFilename;

module.exports = upload;
