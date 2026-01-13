const fs=require('fs');const path=require('path');const s=fs.readFileSync(path.join(__dirname,'..','src','controllers','Tasks.js'),'utf8');
let stack=[];const pairs={'{':'}','(':')','[':']'};for(let i=0;i<s.length;i++){const ch=s[i];if(ch==='\''||ch==='"' || ch==='`'){// skip strings
  const quote=ch; i++; while(i<s.length){ if(s[i]==='\\'){i+=2; continue;} if(s[i]===quote) break; i++; }} else if(ch==='/' && s[i+1]==='/' ){ // skip line comment
  while(i<s.length && s[i]!=="\n") i++;
 } else if(ch==='/' && s[i+1]==='*'){ // skip block comment
  i+=2; while(i<s.length && !(s[i]==='*' && s[i+1]==='/')) i++; i+=1;
 } else if(pairs[ch]){ stack.push({ch,i}); } else if(Object.values(pairs).includes(ch)){ const last=stack.pop(); if(!last || pairs[last.ch]!==ch){ console.log('Mismatch at',i,'char',ch,'expected',pairs[last?last.ch:'?']); console.log('Context:', s.slice(Math.max(0,i-40), i+40)); process.exit(0);} }
}
if(stack.length>0){console.log('Unclosed tokens:', stack.slice(0,5).map(x=>({ch:x.ch,pos:x.i})));} else console.log('All balanced');
