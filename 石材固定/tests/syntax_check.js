// V2 HTML inline JS 語法靜態檢查（純 Node，無瀏覽器依賴）
// 用法：node tests/syntax_check.js  （從專案根目錄跑）
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, '石材計算書產生器_規範版V2.html');
const s=fs.readFileSync(HTML_PATH,'utf8');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m, idx=0, failed=0;
while((m = re.exec(s))){
  idx++;
  const code = m[1];
  if(!code.trim()) continue;
  try{
    new vm.Script(code, {filename:`inline_script_${idx}`});
    console.log(`script #${idx} (${code.length} chars): OK`);
  }catch(e){
    failed++;
    console.log(`script #${idx} (${code.length} chars): FAILED -> ${e.message}`);
    const match = e.stack.match(/inline_script_\d+:(\d+)/);
    if(match){
      const ln = parseInt(match[1]);
      const lines = code.split('\n');
      for(let i=Math.max(0,ln-3); i<Math.min(lines.length,ln+2); i++){
        console.log(`    ${i+1}: ${lines[i]?.slice(0,140)}`);
      }
    }
  }
}
console.log(`\nTotal inline scripts: ${idx}, failed: ${failed}`);
