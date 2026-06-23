const fs = require('fs');
const path = require('path');
const vm = require('vm');

const loadCasesPath = path.join(__dirname, 'loadcases.js');

function boot() {
  const context = { console, Math };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(loadCasesPath, 'utf8'), context, { filename: loadCasesPath });
  return context.LoadCases;
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
  const LoadCases = boot();

  const parsed = LoadCases.parseText(`
# comment
name, Pu, Mu, Vu, Vuns, VuEh, omegaV, omegaW, duhw, mode
LC-service,150,650,160
LC-control，150，1800，0，20，250，1.5，1.0，0.012，amplified
bad,abc,1,2
short,1
`, { Vuns: 0, VuEh: 160, omegaV: 1.2, omegaW: 1.0, duhw: 0.01, shearDemandMode: 'direct' });

  assert(parsed.cases.length === 2, '解析有效工況列', `count=${parsed.cases.length}`);
  assert(parsed.errors.length === 2, '回報錯誤列', parsed.errors.join(' / '));
  assert(parsed.cases[0].name === 'LC-service' && parsed.cases[0].VuEh === 160, '單一 Vu 欄位預設 VuEh=Vu', JSON.stringify(parsed.cases[0]));
  assert(parsed.cases[1].shearDemandMode === 'amplified' && parsed.cases[1].VuEh === 250, '支援中文逗號與 amplified 欄位', JSON.stringify(parsed.cases[1]));
  const noDefaults = LoadCases.parseText('LC-default,1,2,3');
  assert(noDefaults.cases[0].omegaV === 1 && noDefaults.cases[0].omegaW === 1 && noDefaults.cases[0].duhw === 0.01, '未傳 defaults 時採穩定預設值', JSON.stringify(noDefaults.cases[0]));

  const serialized = LoadCases.toText([
    { name: 'LC,A', Pu: 1, Mu: 2, Vu: 3, Vuns: 4, VuEh: 5, omegaV: 1.5, omegaW: 1, duhw: 0.01, shearDemandMode: 'direct' },
    { name: 'LC-B', Pu: 10, Mu: 20, Vu: 30, Vuns: '', VuEh: '', omegaV: '', omegaW: '', duhw: '', shearDemandMode: 'amplified' },
  ]);
  assert(!serialized.includes('LC,A') && serialized.includes('LC A'), '序列化會清洗逗號避免破壞 CSV 欄位', serialized);
  assert(serialized.split(/\n/).length === 2, '序列化保留一列一工況', serialized);

  const evaluated = [
    { name: 'PM', pmAxialOk: true, pmUtil: 0.95, shearUtil: 0.6, sbeIndex: 1.1, shearFricUtil: 0.1, overallOk: true },
    { name: 'SHEAR', pmAxialOk: true, pmUtil: 0.4, shearUtil: 1.2, sbeIndex: 0.8, shearFricUtil: 0.2, overallOk: false },
    { name: 'AXIAL', pmAxialOk: false, pmUtil: 0, shearUtil: 0.2, sbeIndex: 0.3, shearFricUtil: 0.1, overallOk: false },
    { name: 'FRIC', pmAxialOk: true, pmUtil: 0.5, shearUtil: 0.7, sbeIndex: 0.9, shearFricUtil: 1.5, overallOk: false },
  ];
  const controls = LoadCases.pickControls(evaluated);
  assert(controls.pm.name === 'AXIAL', 'P-M 控制優先挑軸力越界', controls.pm.name);
  assert(controls.shear.name === 'SHEAR', '剪力控制挑最大 Ve/phiVn', controls.shear.name);
  assert(controls.shearFric.name === 'FRIC', '剪摩擦控制挑最大 Avf 比', controls.shearFric.name);
  assert(controls.overall.name === 'SHEAR' || controls.overall.name === 'FRIC' || controls.overall.name === 'AXIAL', 'overall 控制挑失敗工況', controls.overall.name);

  const result = LoadCases.result(evaluated, ['格式錯誤']);
  assert(result.loadCasesActive === true, 'result 標示多工況啟用', JSON.stringify({ active: result.loadCasesActive }));
  assert(result.loadCaseFailures === true, 'result 納入失敗與 parse error', JSON.stringify({ failures: result.loadCaseFailures }));

  if (failed) {
    console.error(`\n${failed} load case tests failed.`);
    process.exit(1);
  }
  console.log('\nAll load case shared tests passed.');
}

main();
