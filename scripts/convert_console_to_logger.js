const fs = require('fs');
const path = require('path');

const root = process.cwd();
const excludeDirs = ['node_modules', 'uploads', '.git', 'dist', 'build', 'public', 'frontend', 'src/components', 'package-lock.json', 'coverage'];
const exts = ['.js', '.cjs', '.mjs'];
const changed = [];

function isExcluded(filePath) {
  return excludeDirs.some(d => filePath.includes(path.join(path.sep, d + path.sep)));
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (isExcluded(full)) continue;
    if (e.isDirectory()) walk(full);
    else if (exts.includes(path.extname(e.name))) processFile(full);
  }
}

function hasLogger(s) {
  return /require\(.*logger/.test(s) || /\blet logger\b/.test(s) || /const logger\b/.test(s);
}

function ensureLogger(s) {
  if (hasLogger(s)) return s;
  const header = `let logger;\ntry { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }\n`;
  return header + s;
}

function processFile(file) {
  let s = fs.readFileSync(file, 'utf8');
  if (!/console\./.test(s)) return;
  // Only update server-side files: under src/ or root scripts
  if (!(file.includes(path.sep + 'src' + path.sep) || path.dirname(file) === root || file.includes('scripts' + path.sep) || file.endsWith('.js'))) {
    return;
  }

  const orig = s;
  // Map console methods to logger
  s = s.replace(/console\.log\(/g, 'logger.info(');
  s = s.replace(/console\.info\(/g, 'logger.info(');
  s = s.replace(/console\.warn\(/g, 'logger.warn(');
  s = s.replace(/console\.error\(/g, 'logger.error(');
  s = s.replace(/console\.debug\(/g, 'logger.debug(');
  s = s.replace(/console\.trace\(/g, 'logger.silly(');
  s = s.replace(/console\.table\(/g, 'logger.info(');

  if (s === orig) return;

  // Ensure logger is present for server files (src or root scripts)
  if (file.includes(path.sep + 'src' + path.sep) || path.dirname(file) === root || file.includes(path.join('scripts', path.sep))) {
    s = ensureLogger(s);
  }

  fs.writeFileSync(file, s, 'utf8');
  const removed = (orig.match(/console\./g) || []).length;
  changed.push({ file, replaced: removed });
}

console.log('Converting console.* to logger.* across server files...');
walk(root);
console.log('Done. Files changed:', changed.length);
for (const c of changed) console.log(`${c.file}: replaced ${c.replaced} occurrences`);
