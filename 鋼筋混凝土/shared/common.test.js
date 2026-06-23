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

  if (failed) {
    console.error(`\n${failed} common helper tests failed.`);
    process.exit(1);
  }
  console.log('\nAll common shared tests passed.');
}

main();
