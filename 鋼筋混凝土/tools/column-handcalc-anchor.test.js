// 私有獨立錨點，不讀 column-regression-cases.json 或正式工具預期答案。
// 以下條號為查得的計算來源索引；原文、適用性與保護層量測取捨仍列 PR「待瀚文確認」，不另改規範係數。
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadColumnPure(source = fs.readFileSync(path.join(__dirname, 'column.app.js'), 'utf8')) {
  const context = vm.createContext({ PMSection: require('../shared/pmsection.js') });
  context.window = context;
  for (const material of ['rebar', 'concrete']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../結構工具箱/core/materials', `${material}.js`), 'utf8'), context);
  }
  context.PHI = context.Concrete.PHI;
  const start = source.indexOf('  function lateralSupportCheck(');
  const end = source.indexOf('  function calcColumn()');
  assert.ok(start > 0 && end > start, 'load the actual pure function region, fail on extraction drift');
  vm.runInContext(source.slice(start, end), context);
  return context;
}
function near(actual, expected, label, rel = 1e-11) {
  assert.ok(Math.abs(actual - expected) <= Math.max(1e-10, Math.abs(expected) * rel), `${label}: ${actual} vs hand calculation ${expected}`);
}
module.exports = { loadColumnPure };

if (require.main === module) {
  const core = loadColumnPure();
  // 試件鋼筋表值採 #8: db=2.54 cm, As=5.067 cm²；#4: db=1.27 cm。
  // 幾何來源索引：第2章保護層定義、20.5.1解說；來源及取捨由瀚文確認。
  test('70 cm circular anchor: bar radius, effective depths and concentric strength', () => {
    // 手算：inset=5+1.27+2.54/2=7.54；Rbar=35-7.54=27.46；d=35+27.46=62.46 cm。
    near(core.longBarCenterInset(5, 1.27, 2.54), 7.54, 'inset');
    const bars = core.buildBarsCircle(70, 5, 8, 5.067, 2.54, 1.27);
    near(35 - Math.min(...bars.map(p => p.y)), 27.46, 'Rbar');
    const depth = core.buildShearDepths('circle', 70, 70, 5, 8, 5.067, 2.54, null, 1.27);
    near(depth.d_x, 62.46, 'dx'); near(depth.d_y, 62.46, 'dy');
    // 22.4.2.2：Po=0.85fc'(Ag-Ast)+fyAst；Ag=π·35²，Ast=8·5.067=40.536。
    const handPo = (297.5 * (Math.PI * 1225 - 40.536) + 4200 * 40.536) / 1000;
    const sec = core.computePMSection(70, 70, 350, 4200, 5, 8, 5.067, 0.8, 'circle', 2.54, null, 1.27);
    near(sec.Po, handPo, 'Po (tf)');
  });

  test('60×60, 12-#8 anchor: independent four-row equilibrium at c=30 cm', () => {
    // 22.2.1.1/.2 平衡與應變相容、22.2.2.1 εcu=.003、22.2.2.4.1/.3 a=βc及0.85fc'；
    // 20.2.2.1/.2 彈塑性 fy=4200, Es=2.04e6。試件 fc'=350、β=.8。
    // inset=4+1.27+1.27=6.54；12根沿4邊均布，y=[6.54,22.18,37.82,53.46]，各排[4,2,2,4]根。
    // c=30，a=24；fs=[4200,1595.28,-1595.28,-4200]，壓力塊內為前6根。
    // Cc=297.5·60·24=428400 kgf；鋼筋正負力抵銷，Pn=428400-6·5.067·297.5。
    // Mn=Cc·18+4As(4200-297.5)·23.46+2As(1595.28-297.5)·7.82
    //              +2As(-1595.28)(-7.82)+4As(-4200)(-23.46)，以形心取矩。
    const handP = 428400 - 6 * 5.067 * 297.5;
    const handM = 428400 * 18 + 4 * 5.067 * (4200 - 297.5) * 23.46
      + 2 * 5.067 * (1595.28 - 297.5) * 7.82 + 2 * 5.067 * 1595.28 * 7.82 + 4 * 5.067 * 4200 * 23.46;
    const layout = core.attachBarSize(core.makeLayoutSym(4, 4, 1, 1), 5.067, 2.54, 5.067, 2.54);
    const bars = core.buildBars(60, 60, 4, layout, 1.27);
    const point = core.calcPMPoint(30, 60, 60, 350, 4200, bars, 0.8);
    near(point.Pn, handP, 'Pn (kgf)'); near(point.Mn, handM, 'Mn (kgf·cm)');
    near(core.buildShearDepths('rect', 60, 60, 4, 12, 5.067, 2.54, layout, 1.27).d_x, 53.46, 'dx');
  });

  test('60×60, 4-#8 balanced P-M and Mpr / Ve anchor at prescribed axial force', () => {
    // 同上應變相容來源。18.4.6.1.1及其解說：由柱端Mpr求Ve，至少1.25fy、φ=1，Ve不小於分析剪力。
    // 本試件只驗證既有路徑：lu=300 cm，柱兩端同斷面；不採梁端上限；Pu只取下式單點，不宣稱涵蓋所有Pu。
    // fy,prob=1.25·4200=5250，c=18，a=.8·18=14.4。
    // y=[6.54,53.46]每排2根；εtop=.003(18-6.54)/18=.00191 → fs=3896.4；底筋降伏=-5250。
    // Cc=297.5·60·14.4=257040；Pn=Cc+2As(3896.4-297.5)-2As·5250。
    // Mpr=[Cc·22.8+2As(3896.4-297.5)·23.46+2As·5250·23.46]/1e5 tf·m。
    // Ve=2Mpr/3 m，分析剪力10 tf，故designV=max(10,Ve)。期望值只由下列手算式生成。
    const handPu = (257040 + 2 * 5.067 * (3896.4 - 297.5) - 2 * 5.067 * 5250) / 1000;
    const handMpr = (257040 * 22.8 + 2 * 5.067 * (3896.4 - 297.5) * 23.46 + 2 * 5.067 * 5250 * 23.46) / 1e5;
    const layout = core.attachBarSize(core.makeLayoutSym(2, 2, 1, 1), 5.067, 2.54, 5.067, 2.54);
    const bars = core.buildBars(60, 60, 4, layout, 1.27);
    // 另驗證真正的平衡關鍵點：底筋 εt=fy/Es，c_bal=.003·53.46/(.003+4200/2040000)。
    // a=.8c_bal，頂筋已降伏、底筋恰降伏；Pn=Cc-2As·297.5，Mn 以形心分項取矩。
    const cBalanced = 0.003 * 53.46 / (0.003 + 4200 / 2040000);
    const balancedCc = 297.5 * 60 * (0.8 * cBalanced);
    const handBalancedP = balancedCc - 2 * 5.067 * 297.5;
    const handBalancedM = balancedCc * (30 - 0.4 * cBalanced)
      + 2 * 5.067 * (4200 - 297.5) * 23.46 + 2 * 5.067 * 4200 * 23.46;
    const balanced = core.calcPMPoint(cBalanced, 60, 60, 350, 4200, bars, .8);
    near(balanced.Pn, handBalancedP, 'balanced Pn'); near(balanced.Mn, handBalancedM, 'balanced Mn');
    const point = core.calcPMPoint(18, 60, 60, 350, 5250, bars, .8);
    near(point.Pn / 1000, handPu, 'prescribed Pu'); near(point.Mn / 1e5, handMpr, 'Mpr point');
    const result = core.buildProbableShearDemand({ seismic:true, auto:true, colType:'rect', b:60, h:60,
      fc:350, fy:4200, cover:4, transverseDb:1.27, nBar:4, ab:5.067, beta1:.8, db:2.54, layout,
      Pu:handPu, lu:300, VuxTf:10, VuyTf:10, manualVe:0, mprFactor:1.25 });
    near(result.MprX, handMpr, 'MprX'); near(result.MprY, handMpr, 'MprY');
    near(result.columnX, 2 * handMpr / 3, 'VeX'); near(result.designX, Math.max(10, 2 * handMpr / 3), 'designVx');
    console.log(JSON.stringify({ handPu, handMpr, handVe:2 * handMpr / 3 }));
  });

  test('geometry boundary: equality, negative radius, overlapping bars and recoverable valid input', () => {
    assert.match(core.columnBarGeometryError('circle', 15.08, 15.08, 5, 1.27, 2.54), /半邊／半徑/);
    assert.match(core.columnBarGeometryError('rect', 15, 60, 5, 1.27, 2.54), /半邊／半徑/);
    assert.match(core.columnBarGeometryError('circle', 25, 25, 6, 1.588, 3.581, null, 20), /重疊/);
    assert.equal(core.columnBarGeometryError('circle', 70, 70, 5, 1.27, 2.54, null, 8), '');
  });

  test('independent anchor detects omitted transverse diameter (mutation)', () => {
    const source = fs.readFileSync(path.join(__dirname, 'column.app.js'), 'utf8');
    assert.ok(source.includes('return c + t + d / 2;'));
    const mutated = loadColumnPure(source.replace('return c + t + d / 2;', 'return c + d / 2;'));
    assert.throws(() => near(mutated.longBarCenterInset(5, 1.27, 2.54), 7.54, 'mutated inset'));
  });
}
