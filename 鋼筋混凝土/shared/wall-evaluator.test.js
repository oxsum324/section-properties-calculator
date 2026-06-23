const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const concretePath = path.join(ROOT, '..', '結構工具箱', 'core', 'materials', 'concrete.js');
const rebarPath = path.join(ROOT, '..', '結構工具箱', 'core', 'materials', 'rebar.js');
const commonPath = path.join(ROOT, 'shared', 'common.js');
const wallPath = path.join(ROOT, 'shared', 'wall.js');
const pmPath = path.join(ROOT, 'shared', 'pmsection.js');
const basePath = path.join(ROOT, 'shared', 'wall-base.js');
const evaluatorPath = path.join(ROOT, 'shared', 'wall-evaluator.js');

function boot() {
  const context = { console, Math };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of [concretePath, rebarPath, commonPath, wallPath, pmPath, basePath, evaluatorPath]) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return context;
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
function near(a, b, rel, title) {
  const tol = Math.abs(b) * rel + 1e-6;
  assert(Math.abs(a - b) <= tol, title, `got=${a} expect=${b} tol=${tol}`);
}

function makeBase(ctx) {
  const g = {
    seismic: true,
    scopeSingleWall: true,
    scopeNoOpening: true,
    scopeAnalysisReady: true,
    fc: 280,
    fy: 4200,
    fyt: 4200,
    lambda: 1.0,
    tw: 30,
    lw: 500,
    hw: 1500,
    cover: 5,
    duhw: 0.01,
    nBE: 12,
    dBE: '#7',
    lbe: 75,
    dV: '#4',
    sV: 20,
    nLayer: 2,
    dH: '#4',
    sH: 20,
    dTie: '#4',
    sTie: 10,
    nLegTie: 4,
    hx: 15,
    hu: 300,
    bComp: 30,
    hasJoint: true,
    jointSurface: 'not_roughened',
  };
  const base = ctx.WallBase.buildBase(g, { pmSteps: 140 });
  return {
    ...g,
    ...base,
    rholOk: true,
    rhotOk: true,
    spVOk: true,
    spHOk: true,
  };
}

function main() {
  const ctx = boot();
  const { WallEvaluator } = ctx;
  const base = makeBase(ctx);
  const mnAt150 = WallEvaluator.nominalMomentAtPu(base.pm.nominal, 150);
  assert(mnAt150 > 0, 'nominalMomentAtPu 以曲線內插取得正標稱彎矩', `Mn=${mnAt150}`);

  const service = WallEvaluator.evaluateLoadCase(base, {
    name: 'LC-service',
    Pu: 150,
    Mu: 650,
    Vu: 160,
    Vuns: 0,
    VuEh: 160,
    omegaV: 1.5,
    omegaW: 1,
    duhw: 0.01,
    shearDemandMode: 'direct',
  });
  assert(service.overallOk === true, '服務工況 overall OK', JSON.stringify({ pmUtil: service.pmUtil, shearUtil: service.shearUtil }));
  near(service.pmUtil, 0.443, 0.08, '服務工況 P-M 利用率');
  assert(service.shearPhiMode === 'flexure-comparison' && service.MnNomAtPu > 0 && service.Vmn_kgf > 0, '服務工況剪力 φ 使用 Vmn 內插比較', JSON.stringify({ mode: service.shearPhiMode, Mn: service.MnNomAtPu, Vmn: service.Vmn_kgf }));
  assert(service.shearPhiNote.includes('採 φ=0.75') && service.phiShear === 0.75, '服務工況剪力 φ 說明完整回傳', service.shearPhiNote);
  assert(service.sbeReq === true && service.sbeDesignOk === true, '服務工況 SBE 需求與提供 OK', JSON.stringify({ sbeIndex: service.sbeIndex }));
  assert(service.sbeLengthOk && service.sbeBWidthOk && service.sbeHxOk && service.sbeSpOk && service.sbeAshOk, '服務工況 SBE 細部欄位完整 OK', JSON.stringify({
    sbeHoriz: service.sbeHoriz,
    bWidthMin: service.bWidthMin,
    sbeSpOk: service.sbeSpOk,
    sbeAshOk: service.sbeAshOk,
  }));
  assert(service.shearFricActive === false, '服務工況未觸發剪摩擦', JSON.stringify({ shearFricActive: service.shearFricActive }));
  assert(Array.isArray(service.reviewWarnings) && service.reviewWarnings.some(w => w.includes('水平施工縫剪摩擦已初估')), '服務工況回傳施工縫圖說確認 warning', service.reviewWarnings.join(' / '));

  const control = WallEvaluator.evaluateLoadCase(base, {
    name: 'LC-control',
    Pu: 150,
    Mu: 1800,
    Vu: 320,
    Vuns: 0,
    VuEh: 320,
    omegaV: 1.5,
    omegaW: 1,
    duhw: 0.01,
    shearDemandMode: 'direct',
  });
  assert(control.overallOk === false, '控制工況 overall NG', JSON.stringify({ pmOk: control.pmOk, shearOk: control.shearOk }));
  assert(control.pmOk === false && control.pmUtil > 1, '控制工況 P-M 不足', JSON.stringify({ pmUtil: control.pmUtil }));
  assert(control.shearOk === false && control.shearUtil > 1, '控制工況剪力不足', JSON.stringify({ shearUtil: control.shearUtil }));
  assert(control.shearFricActive === true && control.shearFricOk === false, '未粗糙施工縫控制工況剪摩擦觸發且 Avf 不足', JSON.stringify({ AvfReq: control.shearFricAvfReq, AvfProv: control.shearFricAvfProv }));
  assert(control.shearFricDesign && control.shearFricWebAvfReq > 0 && isFinite(control.shearFricSVReq), '控制工況剪摩擦細部欄位完整回傳', JSON.stringify({
    AvfReq: control.shearFricAvfReq,
    webReq: control.shearFricWebAvfReq,
    sVReq: control.shearFricSVReq,
  }));
  assert(control.reviewWarnings.some(w => w.includes('剪摩擦強度不足')), '控制工況回傳剪摩擦不足 warning', control.reviewWarnings.join(' / '));

  const amplified = WallEvaluator.evaluateLoadCase(base, {
    name: 'LC-amp',
    Pu: 150,
    Mu: 650,
    Vu: 0,
    Vuns: 20,
    VuEh: 250,
    omegaV: 1.5,
    omegaW: 1,
    duhw: 0.012,
    shearDemandMode: 'amplified',
  });
  near(amplified.Ve, 395, 0.001, '放大剪力 Ve=Vuns+Omega*omega*VuEh');

  const zero = WallEvaluator.evaluateLoadCase(base, {
    name: 'LC-zero',
    Pu: 150,
    Mu: 0,
    Vu: 0,
    shearDemandMode: 'direct',
  });
  assert(zero.shearPhiMode === 'zero-shear' && zero.shearOk === true && zero.shearUtil === 0 && zero.shearPhiNote.includes('Ve=0'), '零剪力不產生假 Vmn 或 Infinity', JSON.stringify({ mode: zero.shearPhiMode, shearUtil: zero.shearUtil, note: zero.shearPhiNote }));

  const axial = WallEvaluator.evaluateLoadCase(base, {
    name: 'LC-axial',
    Pu: 3000,
    Mu: 10,
    Vu: 10,
    shearDemandMode: 'direct',
  });
  assert(axial.pmAxialOk === false && axial.pmOutOfRange === true && axial.overallOk === false, '軸力越界不得 overall OK', JSON.stringify({ pmAxialOk: axial.pmAxialOk, out: axial.pmOutOfRange }));
  assert(axial.reviewWarnings.some(w => w.includes('超出 P-M 設計軸力封包')), '軸力越界回傳 P-M 封包 warning', axial.reviewWarnings.join(' / '));
  assert(axial.sbeReq === true && axial.sbeLengthOk === null && axial.sbeCratioBOk === null && axial.sbeDesignOk === false, '軸力越界時 SBE 依 c@Pu 之細部長度改列待確認', JSON.stringify({
    sbeReq: axial.sbeReq,
    sbeHoriz: axial.sbeHoriz,
    sbeLengthOk: axial.sbeLengthOk,
    sbeCratioBOk: axial.sbeCratioBOk,
    sbeDesignOk: axial.sbeDesignOk,
  }));

  if (failed) {
    console.error(`\n${failed} wall evaluator tests failed.`);
    process.exit(1);
  }
  console.log('\nAll wall evaluator tests passed.');
}

main();
