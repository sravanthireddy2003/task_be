const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'controllers', 'Tasks.js');
const s = fs.readFileSync(file, 'utf8');
let re = /try\s*\{/g; let m; let errs = [];
while (m = re.exec(s)) {
  const idx = m.index;
  const rest = s.slice(m.index);
  const nextCatch = rest.search(/catch\s*\(/);
  const nextFinally = rest.search(/finally\s*\{/);
  if (nextCatch === -1 && nextFinally === -1) {
    errs.push({ pos: idx, reason: 'no catch/finally' });
  } else {
    const first = Math.min(nextCatch === -1 ? 1e9 : nextCatch, nextFinally === -1 ? 1e9 : nextFinally);
    const between = rest.slice(0, first);
    const openCount = (between.match(/\{/g) || []).length;
    const closeCount = (between.match(/\}/g) || []).length;
    if (openCount > closeCount) errs.push({ pos: idx, reason: 'no catch before nested braces closed' });
  }
}
console.log('found', errs.length, 'problematic try blocks');
errs.slice(0,20).forEach(e => {
  console.log('position', e.pos, e.reason);
  console.log('context:\n' + s.slice(Math.max(0, e.pos - 120), e.pos + 240));
  console.log('---');
});
