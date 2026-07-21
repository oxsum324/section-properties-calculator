const fs = require('fs');
const path = require('path');
const vm = require('vm');

const commonPath = path.join(__dirname, 'common.js');

function boot() {
  const context = { console, Math };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(commonPath, 'utf8'), context, { filename: commonPath });
  return context.RCUI;
}

let failed = 0;
function assert(pass, title, detail = '') {
  if (!pass) {
    failed++;
    console.error(`FAIL | ${title} :: ${detail}`);
  } else {
    console.log(`PASS | ${title} | ${detail}`);
  }
}

function main() {
  const RCUI = boot();
  assert(typeof RCUI.buildReviewCheckGroup === 'function', 'buildReviewCheckGroup exported', typeof RCUI.buildReviewCheckGroup);

  assert(RCUI.buildReviewCheckGroup([]) === null, 'empty entries return null');
  assert(RCUI.buildReviewCheckGroup(['', '   ', null, undefined]) === null, 'blank entries return null');

  const defaults = RCUI.buildReviewCheckGroup(['需正式分析確認']);
  assert(defaults.group === '待確認事項', 'default group', defaults.group);
  assert(defaults.items.length === 1, 'string entry creates one row', `count=${defaults.items.length}`);
  assert(defaults.items[0].label === '待確認事項 1', 'default label prefix', defaults.items[0].label);
  assert(defaults.items[0].formula === '不列為 OK 結論', 'default formula', defaults.items[0].formula);
  assert(defaults.items[0].sub === '需正式分析確認', 'string entry maps to sub text', defaults.items[0].sub);
  assert(defaults.items[0].value === '待確認', 'default value', defaults.items[0].value);
  assert(defaults.items[0].unit === '', 'default unit is empty string', JSON.stringify(defaults.items[0].unit));
  assert(defaults.items[0].ok === null, 'default ok is null', defaults.items[0].ok);

  const configured = RCUI.buildReviewCheckGroup(
    [{ detail: 'DDM / EFM 尚未建立' }, { text: '需施工圖確認', value: '待補' }],
    {
      group: '人工複核 / 補充資料需求',
      labelPrefix: '人工複核項目',
      formula: '不列為 OK 結論；補齊資料後方可作為完整檢核',
      value: '需補充資料確認',
      unit: '資料',
    }
  );
  assert(configured.group === '人工複核 / 補充資料需求', 'configured group', configured.group);
  assert(configured.items[0].label === '人工複核項目 1', 'configured label prefix', configured.items[0].label);
  assert(configured.items[0].formula.includes('補齊資料'), 'configured formula', configured.items[0].formula);
  assert(configured.items[0].sub === 'DDM / EFM 尚未建立', 'detail maps to sub text', configured.items[0].sub);
  assert(configured.items[0].value === '需補充資料確認', 'configured default value', configured.items[0].value);
  assert(configured.items[0].unit === '資料', 'configured default unit', configured.items[0].unit);
  assert(configured.items[1].value === '待補', 'entry value overrides option value', configured.items[1].value);

  const overrides = RCUI.buildReviewCheckGroup([{
    label: '指定項',
    sub: '自訂說明',
    formula: '專案指定',
    value: '自訂值',
    unit: '自訂單位',
    ok: false,
    note: '自訂註記',
  }]);
  const row = overrides.items[0];
  assert(row.label === '指定項', 'entry label override', row.label);
  assert(row.formula === '專案指定', 'entry formula override', row.formula);
  assert(row.sub === '自訂說明', 'entry sub override', row.sub);
  assert(row.value === '自訂值', 'entry value override', row.value);
  assert(row.unit === '自訂單位', 'entry unit override', row.unit);
  assert(row.ok === false, 'entry ok override preserves false', String(row.ok));
  assert(row.note === '自訂註記', 'entry note preserved', row.note);

  assert(typeof RCUI.getProjectMetadataState === 'function', 'project metadata state helper exported', typeof RCUI.getProjectMetadataState);
  assert(typeof RCUI.assessFormalAttachment === 'function', 'formal attachment assessment helper exported', typeof RCUI.assessFormalAttachment);
  const emptyMetadata = RCUI.getProjectMetadataState({ name: '未填', no: ' ', designer: '' });
  assert(emptyMetadata.complete === false, 'empty project metadata is incomplete', JSON.stringify(emptyMetadata.missingItems));
  assert(emptyMetadata.missingItems.join('、') === '計畫名稱、計畫編號、設計人', 'all required metadata fields are listed', emptyMetadata.missingItems.join('、'));

  const metadataReview = RCUI.assessFormalAttachment({ project: {}, failedItems: [], reviewItems: [] });
  assert(metadataReview.status === 'ready', 'missing metadata does not reduce engineering readiness', metadataReview.status);
  assert(metadataReview.formalOutputAllowed === true, 'missing metadata still allows printable attachment output', String(metadataReview.formalOutputAllowed));
  assert(metadataReview.documentState?.label === '內部審閱', 'unchecked report defaults to internal review', metadataReview.documentState?.label);
  assert(metadataReview.metadata.missingItems.length === 3, 'missing metadata stays available as inherited context', JSON.stringify(metadataReview.metadata));

  const completeProject = { name: '測試工程', no: 'RC-001', designer: 'QA' };
  const readyAssessment = RCUI.assessFormalAttachment({ project: completeProject, failedItems: [], reviewItems: [] });
  assert(readyAssessment.status === 'ready', 'complete clean assessment is ready', readyAssessment.status);
  assert(readyAssessment.formalOutputAllowed === true, 'ready assessment allows formal output', String(readyAssessment.formalOutputAllowed));
  assert(readyAssessment.readyToSign === false, 'unchecked report still awaits explicit approval', String(readyAssessment.readyToSign));
  assert(readyAssessment.documentClass?.label === '內部審閱', 'unchecked report carries internal-review class', readyAssessment.documentClass?.label);
  assert(readyAssessment.documentState?.kind === 'internal-review', 'unchecked report has internal-review state', JSON.stringify(readyAssessment.documentState));
  const approvedAssessment = RCUI.assessFormalAttachment({ project: {}, failedItems: [], reviewItems: [], approved: true });
  assert(approvedAssessment.readyToSign === true, 'approval promotes exact report to formal attachment', String(approvedAssessment.readyToSign));
  assert(approvedAssessment.documentClass?.label === '正式附件', 'approved report carries formal attachment class', approvedAssessment.documentClass?.label);
  assert(approvedAssessment.documentState === null, 'approved report removes internal-review state', String(approvedAssessment.documentState));

  const reviewAssessment = RCUI.assessFormalAttachment({ project: completeProject, reviewItems: ['柱端錨定'] });
  assert(reviewAssessment.status === 'review', 'manual item requires review', reviewAssessment.status);
  assert(reviewAssessment.formalOutputAllowed === true, 'review assessment remains printable', String(reviewAssessment.formalOutputAllowed));
  assert(reviewAssessment.documentState?.label === '內部審閱', 'review output stays cleanly classified as internal review', reviewAssessment.documentState?.label);

  const reviewRequirement = { id: 'column-anchorage', label: '柱端錨定', contextKey: 'ctx-001' };
  const reviewResolution = {
    id: 'column-anchorage', label: '柱端錨定', status: 'confirmed', basis: 'drawing',
    reference: 'S-302', reviewer: 'QA', reviewedAt: '2026-07-17T02:00:00.000Z', contextKey: 'ctx-001'
  };
  const resolvedAssessment = RCUI.assessFormalAttachment({
    project: completeProject,
    reviewItems: [reviewRequirement],
    reviewResolutions: [reviewResolution]
  });
  assert(resolvedAssessment.status === 'ready', 'traceable manual review can reach ready-to-sign', resolvedAssessment.status);
  assert(resolvedAssessment.resolvedReviewItems.join('、') === '柱端錨定', 'resolved manual review is listed', JSON.stringify(resolvedAssessment.resolvedReviewItems));
  assert(resolvedAssessment.unresolvedReviewItems.length === 0, 'resolved manual review clears pending item', JSON.stringify(resolvedAssessment.unresolvedReviewItems));
  assert(resolvedAssessment.documentState?.kind === 'internal-review', 'resolved manual review still awaits explicit attachment approval', JSON.stringify(resolvedAssessment.documentState));

  const staleAssessment = RCUI.assessFormalAttachment({
    project: completeProject,
    reviewItems: [{ ...reviewRequirement, contextKey: 'ctx-002' }],
    reviewResolutions: [reviewResolution]
  });
  assert(staleAssessment.status === 'review', 'changed calculation context invalidates prior review', staleAssessment.status);
  assert(staleAssessment.unresolvedReviewItems.join('、') === '柱端錨定', 'stale review returns to unresolved list', JSON.stringify(staleAssessment.unresolvedReviewItems));
  assert(staleAssessment.unresolvedReviews[0]?.validation?.contextMatches === false, 'stale review explains context mismatch', JSON.stringify(staleAssessment.unresolvedReviews[0]?.validation));
  assert(staleAssessment.documentState?.detail.includes('仍可列印'), 'stale review output remains printable', staleAssessment.documentState?.detail);

  const blockedAssessment = RCUI.assessFormalAttachment({ project: completeProject, failedItems: ['剪力強度'] });
  assert(blockedAssessment.status === 'blocked', 'failed check is blocked', blockedAssessment.status);
  assert(blockedAssessment.formalOutputAllowed === true, 'NG result remains printable as an attachment record', String(blockedAssessment.formalOutputAllowed));
  assert(blockedAssessment.documentState?.label === '內部審閱', 'NG result does not become a DRAFT classification', blockedAssessment.documentState?.label);

  assert(typeof RCUI.getAttachmentReadinessPriority === 'function', 'attachment readiness priority helper exported', typeof RCUI.getAttachmentReadinessPriority);
  const blockedPriority = RCUI.getAttachmentReadinessPriority({
    status: 'blocked',
    items: [
      { label: '不符項目', value: '2 項', tone: 'fail' },
      { label: '輸出邊界', value: '頁面顯示，不進計算書、列印或 PDF', tone: 'neutral' },
    ],
    notes: ['此面板僅供頁面輔助。', '優先處理：剪力強度、配筋比。']
  });
  assert(blockedPriority.label === '優先閱讀', 'blocked priority label', blockedPriority.label);
  assert(blockedPriority.tone === 'fail', 'blocked priority tone', blockedPriority.tone);
  assert(blockedPriority.value.includes('剪力強度'), 'blocked priority uses explicit note', blockedPriority.value);
  assert(blockedPriority.sourceNote.includes('優先處理'), 'blocked priority source note tracked', blockedPriority.sourceNote);

  const reviewPriority = RCUI.getAttachmentReadinessPriority({
    status: 'review',
    items: [{ label: '人工複核', value: '1 項', tone: 'warn' }],
    notes: ['需人工確認：施工圖搭接區。']
  });
  assert(reviewPriority.tone === 'warn', 'review priority tone', reviewPriority.tone);
  assert(reviewPriority.value.includes('施工圖搭接區'), 'review priority uses manual-review note', reviewPriority.value);

  const fallbackPriority = RCUI.getAttachmentReadinessPriority({
    status: 'blocked',
    items: [
      { label: '主要檢核', value: '2 項未通過', tone: 'fail' },
      { label: '阻擋 1', value: '衝剪', tone: 'fail' },
    ]
  });
  assert(fallbackPriority.value.includes('阻擋 1'), 'blocked priority prefers concrete blocker rows', fallbackPriority.value);

  const readyPriority = RCUI.getAttachmentReadinessPriority({
    status: 'ready',
    items: [{ label: '輸出邊界', value: '頁面顯示，不進計算書、列印或 PDF', tone: 'neutral' }]
  });
  assert(readyPriority.tone === 'ok', 'ready priority tone', readyPriority.tone);
  assert(readyPriority.value.includes('核可為正式附件'), 'ready priority explains explicit approval boundary', readyPriority.value);

  if (failed) {
    console.error(`\n${failed} common helper tests failed.`);
    process.exit(1);
  }
  console.log('\nAll common shared tests passed.');
}

main();
