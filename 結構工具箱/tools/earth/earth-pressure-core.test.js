const assert = require('node:assert/strict');
const EarthPressureCore = require('./earth-pressure-core.js');
const goldenCases = require('./earth-pressure-golden-cases.js');

function approx(actual, expected, tolerance = 1e-9) {
  if (!Number.isFinite(expected)) {
    assert.equal(actual, expected);
    return;
  }
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} ~= ${expected} within ${tolerance}`
  );
}

assert.equal(goldenCases.length, 4);

for (const goldenCase of goldenCases) {
  const r = EarthPressureCore.calculate(goldenCase.input);

  for (const [key, expected] of Object.entries(goldenCase.expected.values)) {
    approx(r[key], expected);
  }

  for (const [key, expected] of Object.entries(goldenCase.expected.flags)) {
    assert.equal(r[key], expected, `${goldenCase.id}.${key}`);
  }
}

{
  const r = EarthPressureCore.calculate(goldenCases[0].input);
  assert.equal(r.modeLabel, '主動土壓 Ka');
  assert.equal(r.wallType, 'cantilever');
  assert.equal(r.wallTypeLabel, '懸臂式擋土牆');
  assert.equal(r.wallTypeOutput.headline, '懸臂式工作輸出');
  assert.ok(r.wallTypeOutput.primaryResult.includes('控制項'));
  assert.ok(r.wallTypeOutput.outputGroups.some(group => group.label === '懸臂式後續檢核'));
  approx(r.Ka, 0.33333333333333337);
  approx(r.K0, 0.5);
}

{
  const r = EarthPressureCore.calculate({
    ...goldenCases[0].input,
    wallType: 'gravity'
  });
  assert.equal(r.wallType, 'gravity');
  assert.equal(r.wallTypeLabel, '重力式擋土牆');
  assert.equal(r.wallTypeOutput.headline, '重力式工作輸出');
  assert.ok(r.wallTypeOutput.primaryResult.includes('B/H'));
  assert.ok(r.wallTypeOutput.outputGroups.some(group => group.label === '重力式後續檢核'));
  approx(r.baseWidthHeightRatio, 0.72);
}

{
  const r = EarthPressureCore.calculate(goldenCases[1].input);
  assert.equal(r.modeLabel, '靜止土壓 K0');
  approx(r.K, 0.5);
}

{
  const r = EarthPressureCore.calculate({
    ...goldenCases[0].input,
    wallCondition: 'restrained',
    mode: 'active'
  });
  assert.equal(r.mode, 'atRest');
  assert.equal(r.modeLabel, '靜止土壓 K0');
  assert.ok(r.selectedModeReason.includes('受約束'));
}

{
  const r = EarthPressureCore.calculate({
    ...goldenCases[3].input,
    passiveMode: 'ignore'
  });
  approx(r.effectivePassive, 0);
  approx(r.slideResistance, r.mu * r.verticalLoad);
  assert.equal(r.slideOk, false);
}

{
  const r = EarthPressureCore.calculate({
    ...goldenCases[3].input,
    passiveMode: 'reduced',
    passiveReductionFactor: 0.5
  });
  approx(r.effectivePassive, 2);
  approx(r.slideResistance, r.mu * r.verticalLoad + 2);
}

{
  const errors = EarthPressureCore.validateInput({
    ...goldenCases[0].input,
    H: 0,
    phiDeg: 60,
    waterDepth: 3,
    verticalLoad: 0,
    fsSlideReq: 0
  });
  assert.equal(errors.length, 5);
  assert.ok(errors.some(msg => msg.includes('高度')));
  assert.ok(errors.some(msg => msg.includes('內摩擦角')));
  assert.ok(errors.some(msg => msg.includes('地下水')));
  assert.ok(errors.some(msg => msg.includes('垂直穩定重量')));
  assert.ok(errors.some(msg => msg.includes('安全係數')));
}

{
  const errors = EarthPressureCore.validateInput({
    ...goldenCases[0].input,
    passiveMode: 'reduced',
    passiveReductionFactor: 1.2
  });
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('折減係數'));
}

// ── Coulomb 土壓理論 ──
const DEG = Math.PI / 180;
{
  // δ=β=θ=0 時，Coulomb Ka 必須退化為 Rankine Ka=(1-sinφ)/(1+sinφ)
  const phi = 30 * DEG;
  const rankineKa = (1 - Math.sin(phi)) / (1 + Math.sin(phi));
  const c = EarthPressureCore.coulombActiveKa(phi, 0, 0, 0);
  assert.ok(c.valid);
  approx(c.Ka, rankineKa, 1e-12);
}
{
  // 牆摩擦 δ=20° 應降低主動土壓係數（< Rankine），且對齊手算基準
  const phi = 30 * DEG;
  const c = EarthPressureCore.coulombActiveKa(phi, 20 * DEG, 0, 0);
  assert.ok(c.valid && c.Ka < 0.3333333333333333, 'wall friction reduces Ka');
  approx(c.Ka, 0.29731385720545095, 1e-9);
}
{
  // 背填傾角 β 接近 φ 時 Coulomb 主動解不成立
  const phi = 30 * DEG;
  const c = EarthPressureCore.coulombActiveKa(phi, 0, 35 * DEG, 0);
  assert.equal(c.valid, false);
}
{
  // calculate() 使用 Coulomb 時，靜態土壓水平分量計入穩定，預設 Rankine 不受影響
  const base = goldenCases[0].input;
  const rankine = EarthPressureCore.calculate(base);
  const coulomb = EarthPressureCore.calculate({ ...base, pressureTheory: 'coulomb', deltaDeg: 20, betaDeg: 0, thetaDeg: 0 });
  assert.equal(coulomb.useCoulomb, true);
  assert.equal(coulomb.coulombValid, true);
  assert.ok(coulomb.soilForce < rankine.soilForce, 'Coulomb 含牆摩擦時水平土壓較小');
  assert.ok(coulomb.theoryLabel.includes('Coulomb'));
}

// ── Mononobe-Okabe 地震主動土壓 ──
{
  // kh=kv=0 時 M-O Kae 必須退化為 Coulomb Ka
  const phi = 30 * DEG, delta = 15 * DEG;
  const c = EarthPressureCore.coulombActiveKa(phi, delta, 0, 0);
  const mo = EarthPressureCore.mononobeOkabeKae(phi, delta, 0, 0, 0);
  assert.ok(mo.valid);
  approx(mo.Kae, c.Ka, 1e-12);
}
{
  // kh>0 時 Kae 應大於靜態 Ka，並對齊手算基準
  const phi = 30 * DEG, delta = 20 * DEG;
  const psi = Math.atan(0.15 / 1);
  const mo = EarthPressureCore.mononobeOkabeKae(phi, delta, 0, 0, psi);
  assert.ok(mo.valid);
  approx(mo.Kae, 0.4070222210484143, 1e-9);
}
{
  // calculate() 開啟地震時，新增地震檢核項並反映於 overallOk
  const base = goldenCases[0].input;
  const r = EarthPressureCore.calculate({ ...base, pressureTheory: 'coulomb', deltaDeg: 20, seismicEnable: true, kh: 0.15, kv: 0 });
  assert.ok(r.seismic && r.seismic.valid, 'seismic block valid');
  assert.ok(r.seismic.Kae > r.effectiveSoilCoef, '地震 Kae > 靜態 Ka');
  assert.ok(r.seismic.deltaPae > 0, '動態增量為正');
  assert.ok(r.checks.some(c => c.key === 'seismic-sliding'), '含地震抗滑檢核');
  assert.ok(r.checks.some(c => c.key === 'seismic-overturning'), '含地震抗傾覆檢核');
  // 未開啟地震時不得出現地震檢核項
  const r0 = EarthPressureCore.calculate(base);
  assert.ok(!r0.checks.some(c => c.key && c.key.startsWith('seismic')), '預設無地震檢核項');
  assert.equal(r0.seismic, null);
}
{
  // 地震輸入驗證：kv 超界、kh 為負
  const errors = EarthPressureCore.validateInput({ ...goldenCases[0].input, seismicEnable: true, kh: -0.1, kv: 1.2 });
  assert.ok(errors.some(m => m.includes('kh')));
  assert.ok(errors.some(m => m.includes('kv')));
}

// ── 分層土主動土壓（砂土 / 黏土）──
{
  // 單一砂層必須退化為單層 Rankine（0.5·Ka·γ·H²），作用高 H/3
  const a = EarthPressureCore.computeLayeredActive([{ type: 'sand', h: 2.5, gamma: 1.8, phi: 30, c: 0 }], 0, 2.5, 2.5, 1);
  approx(a.soilForce, 1.875, 1e-9);
  approx(a.resultantHeight, 2.5 / 3, 1e-9);
  approx(a.waterForce, 0, 1e-12);
}
{
  // 黏土張力裂縫：φ=0、c=2、γ=1.8、H=3 → 裂縫深 2.222 m、有效推力 0.5444
  const b = EarthPressureCore.computeLayeredActive([{ type: 'clay', h: 3, gamma: 1.8, phi: 0, c: 2 }], 0, 3, 3, 1);
  approx(b.tensionCrackDepth, 20 / 9, 1e-9);
  approx(b.soilForce, 0.5444444444444445, 1e-9);
}
{
  // 兩層砂上黏下：calculate() 分層模式，層內張力自動截斷
  const c = EarthPressureCore.calculate({
    H: 5, waterModel: 'none', surcharge: 0, gammaWater: 1, baseB: 3, verticalLoad: 40, qa: 25,
    mu: 0.5, passive: 0, fsSlideReq: 1.5, fsOverReq: 1.5,
    layeredMode: true, layers: [{ type: 'sand', h: 2, gamma: 1.8, phi: 32, c: 0 }, { type: 'clay', h: 3, gamma: 1.9, phi: 0, c: 3 }]
  });
  assert.equal(c.useLayered, true);
  assert.equal(c.layered.byLayer.length, 2);
  assert.equal(c.surchargeForce, 0, '分層模式超載併入 σv');
  approx(c.layered.byLayer[1].Ka, 1, 1e-9); // 黏土 φ=0 → Ka=1
  approx(c.layered.byLayer[1].force, 2.865789473684209, 1e-6); // 黏土層內張力截斷後之推力
  approx(c.totalForce, c.soilForce, 1e-12); // 無水無超載時 total=soil
}
{
  // 分層 + 地下水 + 超載：水壓與有效土壓分離
  const d = EarthPressureCore.calculate({
    H: 4, waterModel: 'hydrostatic', waterDepth: 2, surcharge: 1, gammaWater: 1, baseB: 2.5, verticalLoad: 30, qa: 20,
    mu: 0.5, passive: 0, fsSlideReq: 1.5, fsOverReq: 1.5,
    layeredMode: true, layers: [{ type: 'sand', h: 4, gamma: 1.9, phi: 30, c: 0 }]
  });
  approx(d.waterForce, 2, 1e-9); // 0.5·1·2²
  assert.ok(d.soilForce > 0 && d.totalForce > d.waterForce);
}
{
  // 預設（未開分層）不受影響
  const r = EarthPressureCore.calculate(goldenCases[0].input);
  assert.equal(r.useLayered, false);
  assert.equal(r.layered, null);
}
{
  // 分層驗證：層厚總和與 H 不符
  const errors = EarthPressureCore.validateInput({
    ...goldenCases[0].input, layeredMode: true,
    layers: [{ type: 'sand', h: 1, gamma: 1.8, phi: 30 }]
  });
  assert.ok(errors.some(m => m.includes('厚度總和')));
}

console.log('earth pressure core regression OK (incl. Coulomb + Mononobe-Okabe + layered sand/clay)');
