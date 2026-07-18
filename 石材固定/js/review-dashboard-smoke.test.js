const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scriptPath = path.join(__dirname, 'review-dashboard.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const context = { window: {} };

vm.runInNewContext(source, context, { filename: scriptPath });

const helper = context.window.StoneReviewDashboard?.dashboardServerInfo;
const qualityHelper = context.window.StoneReviewDashboard?.deliveryQualityGradeFromSummary;
const checklistItem = context.window.StoneReviewDashboard?.deliveryQualityChecklistItem;
const checklistHtml = context.window.StoneReviewDashboard?.exportChecklistHtml;
const needsConfirmation = context.window.StoneReviewDashboard?.exportChecklistNeedsConfirmation;
const reasonText = context.window.StoneReviewDashboard?.deliveryQualityReasonText;
if(typeof helper !== 'function'){
  throw new Error('StoneReviewDashboard.dashboardServerInfo was not exported');
}
if(typeof qualityHelper !== 'function'){
  throw new Error('StoneReviewDashboard.deliveryQualityGradeFromSummary was not exported');
}
if(typeof checklistItem !== 'function'){
  throw new Error('StoneReviewDashboard.deliveryQualityChecklistItem was not exported');
}
if(typeof checklistHtml !== 'function'){
  throw new Error('StoneReviewDashboard.exportChecklistHtml was not exported');
}
if(typeof needsConfirmation !== 'function'){
  throw new Error('StoneReviewDashboard.exportChecklistNeedsConfirmation was not exported');
}
if(typeof reasonText !== 'function'){
  throw new Error('StoneReviewDashboard.deliveryQualityReasonText was not exported');
}

const options = { toolHtml: 'toolV2.html', appVersion: 'V9.8.7' };

const cases = [
  [null, { text:'確認中', cls:'warn' }],
  [{ ok:false, skipped:true, mode:'public_static' }, { text:'公開版免檢查', cls:'ok' }],
  [{ ok:false }, { text:'未連線', cls:'warn' }],
  [{ ok:true, tool_html:'toolV2.html', server_version:'9.8.7' }, { text:'v9.8.7 一致', cls:'ok' }],
  [{ ok:true, tool_html:'old.html', server_version:'9.8.7' }, { text:'HTML old.html', cls:'ng' }],
  [{ ok:true, tool_html:'toolV2.html', server_version:'1.2.3' }, { text:'server v1.2.3', cls:'ng' }],
  [{ ok:true, tool_html:'old.html', server_version:'1.2.3' }, { text:'HTML old.html；server v1.2.3', cls:'ng' }],
];

for(const [status, expected] of cases){
  const actual = helper(status, options);
  if(actual.text !== expected.text || actual.cls !== expected.cls){
    throw new Error(`Unexpected server info: ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
  }
}

function assertQuality(name, actual, expected){
  if(actual.code !== expected.code || actual.text !== expected.text || actual.cls !== expected.cls){
    throw new Error(`${name}: unexpected grade ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
  }
  for(const reason of expected.reasons || []){
    if(!actual.reasons.includes(reason)){
      throw new Error(`${name}: missing reason "${reason}" in ${JSON.stringify(actual.reasons)}`);
    }
  }
}

assertQuality(
  'no cases',
  qualityHelper({ caseCount:0, failedTotal:0, warningTotal:0 }, { total:0, covered:0 }, [], null),
  { code:'C', text:'C 先修正', cls:'ng', reasons:['尚未建立案例'] },
);

assertQuality(
  'failed and missing formula',
  qualityHelper(
    { caseCount:1, failedTotal:2, warningTotal:0 },
    { total:5, covered:3 },
    [],
    { cls:'ng' },
  ),
  { code:'C', text:'C 先修正', cls:'ng', reasons:['2 項檢核未通過', '2 項公式來源未登錄', '工具與伺服器版本不一致'] },
);

assertQuality(
  'warnings and notes',
  qualityHelper(
    { caseCount:1, failedTotal:0, warningTotal:1 },
    { total:2, covered:2 },
    [{ note:'' }, { note:'OK' }],
    { cls:'warn', text:'未連線' },
    { signatureRequired:true, referenceRequired:true },
  ),
  { code:'B', text:'B 附註交付', cls:'warn', reasons:['1 項警示', '1 項覆核註記未填', '伺服器狀態未連線', '簽章資料待補', '設計依據未選取'] },
);

assertQuality(
  'ready',
  qualityHelper({ caseCount:1, failedTotal:0, warningTotal:0 }, { total:2, covered:2 }, [], { cls:'ok' }),
  { code:'A', text:'A 可交付', cls:'ok', reasons:['主要檢核、公式來源、覆核與版本狀態皆完成'] },
);

assertQuality(
  'public static ready',
  qualityHelper({ caseCount:1, failedTotal:0, warningTotal:0 }, { total:2, covered:2 }, [], helper({ ok:false, skipped:true }, options)),
  { code:'A', text:'A 可交付', cls:'ok', reasons:['主要檢核、公式來源、覆核與版本狀態皆完成'] },
);

const joined = reasonText({ reasons:['甲', '乙'] });
if(joined !== '甲；乙'){
  throw new Error(`Unexpected joined reason text: ${joined}`);
}
const empty = reasonText({ reasons:[] });
if(empty !== '—'){
  throw new Error(`Unexpected empty reason text: ${empty}`);
}

const cItem = checklistItem({ code:'C', text:'C 先修正', reasons:['尚未建立案例'] });
if(cItem?.level !== 'warn' || cItem.text !== '交付品質為「C 先修正」：尚未建立案例。'){
  throw new Error(`Unexpected C checklist item: ${JSON.stringify(cItem)}`);
}
const bItem = checklistItem({ code:'B', text:'B 附註交付', reasons:['1 項警示'] });
if(bItem?.level !== 'info' || bItem.text !== '交付品質為「B 附註交付」：1 項警示。'){
  throw new Error(`Unexpected B checklist item: ${JSON.stringify(bItem)}`);
}
const aItem = checklistItem({ code:'A', text:'A 可交付', reasons:['主要檢核、公式來源、覆核與版本狀態皆完成'] });
if(aItem !== null){
  throw new Error(`Unexpected A checklist item: ${JSON.stringify(aItem)}`);
}

const okHtml = checklistHtml([]);
if(!okHtml.includes('匯出前檢查完成') || !okHtml.includes('color:#2f6b32')){
  throw new Error(`Unexpected empty checklist HTML: ${okHtml}`);
}

const warnHtml = checklistHtml([
  { level:'warn', text:'案例 <1> & "測試"' },
  { level:'info', text:'提示項目' },
]);
if(!warnHtml.includes('匯出前有 2 項需確認')){
  throw new Error(`Checklist HTML did not show the item count: ${warnHtml}`);
}
if(!warnHtml.includes('案例 &lt;1&gt; &amp; &quot;測試&quot;')){
  throw new Error(`Checklist HTML did not escape text: ${warnHtml}`);
}
if(!warnHtml.includes('<li>提示：提示項目</li>')){
  throw new Error(`Checklist HTML did not label info items: ${warnHtml}`);
}

if(needsConfirmation([]) !== false){
  throw new Error('Empty checklist should not need confirmation');
}
if(needsConfirmation([{ level:'info', text:'提示' }]) !== false){
  throw new Error('Info-only checklist should not need confirmation');
}
if(needsConfirmation([{ level:'warn', text:'警示' }]) !== true){
  throw new Error('Warn checklist should need confirmation');
}

console.log('StoneReviewDashboard smoke test passed.');
