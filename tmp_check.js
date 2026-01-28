const fs = require('fs');
const source = fs.readFileSync('src/controllers/Tasks.js', 'utf8');
try {
  new Function(source);
  console.log('Syntax OK');
} catch (err) {
  console.error('SyntaxError:', err.stack || err.toString());
}

let braceDepth = 0;
let parenDepth = 0;
let bracketDepth = 0;
const parenStack = [];
let line = 1;
for (let i = 0; i < source.length; i += 1) {
  const ch = source[i];
  if (ch === '\n') {
    line += 1;
    continue;
  }
  if (ch === '\'' || ch === '"' || ch === '`') {
    const delim = ch;
    i += 1;
    while (i < source.length && source[i] !== delim) {
      if (source[i] === '\\') i += 1;
      i += 1;
    }
    continue;
  }
  if (ch === '{') {
    braceDepth += 1;
  } else if (ch === '}') {
    braceDepth -= 1;
  } else if (ch === '(') {
    parenDepth += 1;
    parenStack.push({
      line,
      snippet: source.slice(i, i + 120).split('\n')[0]
    });
  } else if (ch === ')') {
    parenDepth -= 1;
    if (parenStack.length > 0) parenStack.pop();
  } else if (ch === '[') {
    bracketDepth += 1;
  } else if (ch === ']') {
    bracketDepth -= 1;
  }
}
console.log('brace depth at EOF:', braceDepth);
console.log('paren depth at EOF:', parenDepth);
console.log('bracket depth at EOF:', bracketDepth);
if (parenStack.length > 0) {
  console.log('Unclosed parens count:', parenStack.length);
  parenStack.forEach((entry, idx) => {
    if (idx >= 5) return;
    console.log(`  Line ${entry.line}: ${entry.snippet.trim()}`);
  });
}
