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

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"), false);
  },
});

// expose dir function
upload.ensureUploadsDir = ensureUploadsDir;

module.exports = upload;
