const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsp = require("fs").promises;

// Ensure uploads directory exists
const ensureUploadsDir = async () => {
  const dir = path.join(process.cwd(), "uploads/profiles");
  try {
    await fsp.access(dir); // FIXED: use fs.promises
  } catch {
    await fsp.mkdir(dir, { recursive: true }); // FIXED
  }
};


// Use disk storage so uploaded files have a filesystem path (used by storageService)
// Use memory storage: multer will expose `file.buffer` and we'll persist it in `storageService.upload`
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('File type not allowed'), false);
  },
});

// expose dir function
upload.ensureUploadsDir = ensureUploadsDir;

module.exports = upload;
