const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '25') * 1024 * 1024;

const ALLOWED_TYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
};

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const internId = req.user?.id || 'unknown';
    const internDir = path.join(UPLOAD_DIR, `intern_${internId}`);
    if (!fs.existsSync(internDir)) {
      fs.mkdirSync(internDir, { recursive: true });
    }
    cb(null, internDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: PDF, DOC, DOCX, JPG, PNG`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

module.exports = { upload, UPLOAD_DIR, ALLOWED_TYPES };
