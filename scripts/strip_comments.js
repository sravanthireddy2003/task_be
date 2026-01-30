let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const excludeDirs = ['node_modules', 'uploads', '.git', 'dist', 'build', 'public', 'package-lock.json', 'coverage'];
const fileExts = ['.js', '.cjs', '.mjs'];
let changedFiles = [];

function isExcluded(filePath) {
  return excludeDirs.some(d => filePath.includes(path.join(path.sep, d + path.sep)));
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (isExcluded(full)) continue;
    if (e.isDirectory()) walk(full);
    else if (fileExts.includes(path.extname(e.name)) && !full.includes(path.join(path.sep, 'node_modules' + path.sep))) {
      processFile(full);
    }
  }
}

function processFile(file) {
  let s = fs.readFileSync(file, 'utf8');
  const lines = s.split(/\r?\n/);
  const out = [];
  let removed = 0;
  for (let line of lines) {
    const t = line.trim();
    if (t.startsWith('//')) {
      // Don't remove TODO/FIXME/JSDoc/eslint/license/comments with @
      const lc = t.toLowerCase();
      if (lc.includes('todo') || lc.includes('fixme') || t.startsWith('///') || t.startsWith('// eslint') || t.startsWith('// eslint-') || t.startsWith('// @') || t.startsWith('//@') ) {
        out.push(line);
        continue;
      }
      const codeLike = /\b(console\.|return\b|var\b|let\b|const\b|function\b|=>|=|;|\bif\b|\bfor\b|\bwhile\b)/.test(t);
      if (codeLike) {
        removed++;
        continue; // drop line
      }
    }
    out.push(line);
  }
  if (removed > 0) {
    fs.writeFileSync(file, out.join('\n'), 'utf8');
    changedFiles.push({ file, removed });
  }
}

logger.info('Scanning for commented-out code...');
walk(root);
logger.info('Done. Files changed:', changedFiles.length);
for (const c of changedFiles) logger.info(`${c.file}: removed ${c.removed} lines`);

if (changedFiles.length === 0) logger.info('No commented-out code detected with conservative heuristics.');
