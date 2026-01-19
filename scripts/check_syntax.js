const fs = require('fs');
const s = fs.readFileSync('./src/services/reportService.js','utf8');
let braces=0, paren=0, lineNum=0;
s.split('\n').forEach((line, idx)=>{
  lineNum = idx+1;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c=='{') braces++;
    if(c=='}') braces--;
    if(c=='(') paren++;
    if(c==')') paren--;
  }
  if(paren<0) console.log('Paren negative at line', lineNum, 'line:', line);
});
console.log('Final counts -> braces:',braces,'paren:',paren);
console.log('\n---FILE---');
console.log(s);
