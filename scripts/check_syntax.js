const fs = require('fs');

// Usage: node scripts/check_syntax.js [path]
// Defaults to controllers/Tasks.js
const target = process.argv[2] || './src/controllers/Tasks.js';
const s = fs.readFileSync(target, 'utf8');

let braces = 0, paren = 0, brackets = 0, backtick = 0;
let lineNum = 0;

function isEscaped(str, idx) {
  let count = 0;
  for (let i = idx - 1; i >= 0 && str[i] === '\\'; i--) count++;
  return count % 2 === 1;
}

s.split('\n').forEach((line, idx) => {
  lineNum = idx + 1;

  // Naive comment strip to reduce noise
  const noSingleLineComment = line.replace(/\/\/.*$/, '');
  let inSingleQuote = false, inDoubleQuote = false;

  for (let i = 0; i < noSingleLineComment.length; i++) {
    const c = noSingleLineComment[i];

    // Track quotes/backticks, skip counting inside quotes
    if (c === '\'' && !isEscaped(noSingleLineComment, i) && !inDoubleQuote && backtick === 0) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (c === '"' && !isEscaped(noSingleLineComment, i) && !inSingleQuote && backtick === 0) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (c === '`' && !isEscaped(noSingleLineComment, i) && !inSingleQuote && !inDoubleQuote) {
      backtick = backtick === 0 ? 1 : 0;
      continue;
    }

    if (inSingleQuote || inDoubleQuote || backtick === 1) continue;

    if (c === '{') braces++;
    else if (c === '}') braces--;
    else if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === '[') brackets++;
    else if (c === ']') brackets--;
  }

  if (paren < 0) console.log('Paren negative at line', lineNum, 'line:', line.trim());
  if (braces < 0) console.log('Braces negative at line', lineNum, 'line:', line.trim());
  if (brackets < 0) console.log('Brackets negative at line', lineNum, 'line:', line.trim());
});

console.log('Final counts -> braces:', braces, 'paren:', paren, 'brackets:', brackets, 'backtickOpen:', backtick);
