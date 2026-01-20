function makeFrontendLink(pathSuffix) {
  const front = process.env.FRONTEND_URL;
  if (front) return String(front).replace(/\/$/, '') + pathSuffix;
  return pathSuffix;
}

function makePublicUploadsUrl(pathOrFilename) {
  const base = process.env.BASE_URL || process.env.FRONTEND_URL || null;
  const path = String(pathOrFilename || '');
  if (base) return String(base).replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
  return path.startsWith('/') ? path : '/' + path;
}

module.exports = { makeFrontendLink, makePublicUploadsUrl };