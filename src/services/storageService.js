const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const stream = require('stream');

const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();

class StorageService {
  constructor() {
    if (STORAGE_PROVIDER === 's3') {
      this.client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      });
      this.bucket = process.env.AWS_S3_BUCKET;
    }
  }

  // Uploads a local file (from multer) to selected provider.
  // Returns an object { storagePath }
  async upload(file, key) {
    if (!file) throw new Error('No file provided to upload');

    if (STORAGE_PROVIDER === 's3') {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fs.createReadStream(file.path),
        ContentType: file.mimetype,
        Metadata: { originalName: file.originalname }
      });
      await this.client.send(command);
      return { storagePath: `s3://${this.bucket}/${key}`, provider: 's3', key };
    }

    // default: local — accept multer memory buffers or disk paths
    try {
      const uploadsDir = path.resolve(path.join(__dirname, '..', '..', 'uploads'));
      fs.mkdirSync(uploadsDir, { recursive: true });

      // prefer provided key as filename, otherwise fall back to timestamp+originalname
      const originalName = file.originalname || (file.name || 'upload');
      const filename = key || `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9._()-]/g, '_')}`;
      const destPath = path.join(uploadsDir, filename);

      if (file.buffer && Buffer.isBuffer(file.buffer)) {
        fs.writeFileSync(destPath, file.buffer);
      } else if (file.path) {
        // multer.diskStorage already wrote file.path — copy to our uploads dir using the desired filename
        try {
          fs.copyFileSync(file.path, destPath);
        } catch (e) {
          // fallback: attempt to move
          fs.renameSync(file.path, destPath);
        }
      } else {
        throw new Error('No file data available to persist');
      }

      return { storagePath: encodeURI('/uploads/' + filename), provider: 'local', key: filename };
    } catch (e) {
      const err = new Error('Failed to save uploaded file');
      err.cause = e;
      throw err;
    }
  }

  // For downloads/previews: either return a signed url (redirect) or a stream
  async getDownloadHandle(storageInfo, options = {}) {
    if (!storageInfo) throw new Error('storageInfo required');

    // If storageInfo provides explicit key (legacy), use it for signed url
    if (STORAGE_PROVIDER === 's3' && storageInfo.key) {
      const expiresIn = options.expiresIn || 3600;
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageInfo.key });
      const url = await getSignedUrl(this.client, command, { expiresIn });
      return { redirectUrl: url, expiresInSeconds: expiresIn };
    }

    // If storagePath encodes an s3://bucket/key value, parse it and generate signed URL
    if (STORAGE_PROVIDER === 's3' && storageInfo.storagePath && typeof storageInfo.storagePath === 'string' && storageInfo.storagePath.startsWith('s3://')) {
      try {
        const withoutPrefix = storageInfo.storagePath.replace('s3://', '');
        const parts = withoutPrefix.split('/');
        const bucket = parts.shift();
        const key = parts.join('/');
        const expiresIn = options.expiresIn || 3600;
        const command = new GetObjectCommand({ Bucket: bucket || this.bucket, Key: key });
        const url = await getSignedUrl(this.client, command, { expiresIn });
        return { redirectUrl: url, expiresInSeconds: expiresIn };
      } catch (e) {
        const err = new Error('Failed to build signed URL');
        err.status = 500;
        throw err;
      }
    }

    // local path
    let p = storageInfo.storagePath;

    // If storagePath is a public uploads path (e.g. '/uploads/...'), resolve to absolute file path
    const candidateUploads = path.resolve(path.join(__dirname, '..', '..', 'uploads'));
      if (typeof p === 'string' && p.startsWith('/uploads/')) {
      const rel = p.replace(/^[\\/]+uploads[\\/]+/, '');
      p = path.join(candidateUploads, rel);
    }

    if (!fs.existsSync(p)) {
      const err = new Error('File not found');
      err.status = 404;
      throw err;
    }
    const fileStream = fs.createReadStream(p);

    // Try to provide a public path if the file lives under the project's uploads directory
    try {
      const resolvedP = path.resolve(p);
      let publicPath = null;
      if (resolvedP.startsWith(candidateUploads)) {
        const rel = path.relative(candidateUploads, resolvedP).replace(/\\/g, '/');
        // encode URI but preserve slashes
        publicPath = encodeURI('/uploads/' + rel);
      } else if (resolvedP.includes('/uploads/')) {
        const idx = resolvedP.indexOf('/uploads/');
        publicPath = encodeURI(resolvedP.substring(idx).replace(/\\/g, '/'));
      }

      const result = { stream: fileStream };
      if (publicPath) result.publicPath = publicPath;
      return result;
    } catch (e) {
      return { stream: fileStream };
    }
  }
}

module.exports = new StorageService();
