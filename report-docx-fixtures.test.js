// Synthetic DOCX boundary fixtures; run with Node, then render-report-docx-word.ps1.
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const root = __dirname;
const { JSDOM } = require(path.join(root, '螺栓檢討/bolt-review-tool/node_modules/jsdom'));
const docx = require(path.join(root, '石材固定/vendor/package/dist/index.cjs'));
const JSZip = require('./螺栓檢討/bolt-review-tool/node_modules/jszip');
const converter = require(path.join(root, '結構工具箱/core/ui/report-docx.js'));
const integrity = require(path.join(root, '結構工具箱/tools/docx-package-integrity.js'));
const checker = require(path.join(root, '結構工具箱/tools/attachment-package-check.js'));
const out = path.join(root, 'output/playwright/report-docx-fixtures', new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out, { recursive: true });
const examples = [
  {key:'merged-table',html:'<h1>中文長案件名稱 結構計算書</h1><p>計画名稱：中文測試</p><p>計畫編號：DOCX-QA</p><table><thead><tr><th rowspan="2">構材</th><th colspan="2">採用輸入</th></tr><tr><th>Mu</th><th>Vu</th></tr></thead><tbody><tr><td>梁 B1</td><td>12.34</td><td>56.78</td></tr></tbody></table><h2>計算式</h2><p>φM<sub>n</sub> ≥ M<sub>u</sub>，A<sup>2</sup> = 12.34</p><p>工程結論：需人工複核。</p>'},
  {key:'long-table',html:'<h1>跨頁表格文書版</h1><h2>完整計算資料</h2><table><thead><tr><th>項次</th><th>構材及計算資料</th><th>結果</th></tr></thead><tbody>'+Array.from({length:110},(_,i)=>'<tr><td>'+i+'</td><td>中文構材 '+i+' 採用輸入及完整計算式</td><td>'+(i*1.23).toFixed(2)+'</td></tr>').join('')+'</tbody></table>'},
  {key:'plain-paper',html:'<h1>無圖簡易結果</h1><p>输入資料：123.456</p><p>計算式：1 + 2 = 3</p><pre>中文逐行計算\nφ × Rn = 123.456\nOK（限定本次輸入）</pre><div class="page-only-report-status">禁止匯出頁面導向</div><div hidden>禁止匯出隱藏文字</div><button>禁止控制項</button>'}
];
(async()=>{
const result=[];
for(const item of examples){
const dom=new JSDOM('<html><body><div class="paper"><span class="rep-document-status-line" data-document-class="formal-attachment">文件狀態：正式附件</span>'+item.html+'</div></body></html>',{pretendToBeVisual:true});
const built=await converter.build(dom.window.document,docx);
const bytes=Buffer.from(await built.blob.arrayBuffer());const file=path.join(out,item.key+'.docx');fs.writeFileSync(file,bytes);
const zip=await JSZip.loadAsync(bytes);const xml=await zip.file('word/document.xml').async('string');
const parts=new Map();for(const n of Object.keys(zip.files)){if(!zip.files[n].dir)parts.set(n,await zip.files[n].async('nodebuffer'));}
const packaging = integrity.inspectDocxPackage(parts); assert.equal(packaging.pass,true,JSON.stringify(packaging.issues));
assert.equal((xml.match(/<w:tbl>/g)||[]).length,dom.window.document.querySelectorAll('table').length);
assert(xml.includes('正式附件資格：否'));assert(!xml.includes('文件狀態：正式附件'));assert(!xml.includes('禁止匯出'));assert(!xml.includes('禁止控制項'));assert(bytes.length<=2000000);
const record=checker.inspectAttachment(file,out);assert(record.nonFormalReferenceNeedles.length>0);
const report=checker.analyzePackage([record],{projectNo:'DOCX-QA'});assert.notEqual(report.status,'ready');
result.push({key:item.key,file,bytes:bytes.length,stats:built.stats,packageStatus:report.status,packageIntegrity:packaging,nonFormalReferenceNeedles:record.nonFormalReferenceNeedles,merged:(xml.match(/<w:(?:gridSpan|vMerge)\b/g)||[]).length,tableHeaders:(xml.match(/<w:tblHeader/g)||[]).length});
dom.window.close();
}
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(result,null,2));console.log(result);
})().catch(e=>{console.error(e);process.exitCode=1});
