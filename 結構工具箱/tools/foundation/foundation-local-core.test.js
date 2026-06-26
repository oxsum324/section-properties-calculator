const assert = require('node:assert/strict');
const FoundationLocalCore = require('./foundation-local-core.js');
const goldenCases = require('./foundation-local-golden-cases.js');

function approx(actual, expected, tolerance = 1e-6) {
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
assert.equal(FoundationLocalCore.version, '0.3.0');

for (const goldenCase of goldenCases) {
  const r = FoundationLocalCore.calculate(goldenCase.input);

  for (const [key, expected] of Object.entries(goldenCase.expected.values)) {
    approx(r[key], expected);
  }

  for (const [key, expected] of Object.entries(goldenCase.expected.flags)) {
    assert.equal(r[key], expected, `${goldenCase.id}.${key}`);
  }

  assert.equal(r.qmaxCorner.name, goldenCase.expected.corners.qmaxCorner, `${goldenCase.id}.qmaxCorner`);
  assert.equal(r.qminCorner.name, goldenCase.expected.corners.qminCorner, `${goldenCase.id}.qminCorner`);
}

{
  const errors = FoundationLocalCore.validateInput({
    ...goldenCases[0].input,
    B: 0,
    qa: 0,
    fsSlideReq: 0
  });
  assert.equal(errors.length, 3);
  assert.ok(errors.some(msg => msg.includes('B、L')));
  assert.ok(errors.some(msg => msg.includes('qa')));
  assert.ok(errors.some(msg => msg.includes('安全係數')));
}

{
  const r = FoundationLocalCore.calculate({
    ...goldenCases[0].input,
    designCode: 'tw-foundation-112',
    loadCondition: 'short-term',
    bearingMode: 'ultimate',
    bearingSafetyFactor: undefined,
    fsSlideReq: undefined,
    fsOverReq: undefined,
    qult: 60
  });
  assert.equal(r.designBasis.designCodeLabel, '台灣《建築物基礎構造設計規範》112 年版');
  assert.equal(r.designBasis.loadConditionLabel, '短期載重（風、震、施工或偶發載重）');
  assert.equal(r.designBasis.criteriaSource, 'code-preset');
  approx(r.bearingSafetyFactor, 2);
  approx(r.fsSlideReq, 1.2);
  approx(r.fsOverReq, 1.2);
  approx(r.qa, 30);
}

{
  const r = FoundationLocalCore.calculate({
    ...goldenCases[0].input,
    designCode: 'project-custom',
    loadCondition: 'long-term',
    bearingSafetyFactor: 2.7,
    fsSlideReq: 1.35,
    fsOverReq: 1.4
  });
  assert.equal(r.designBasis.criteriaSource, 'user-defined');
  approx(r.bearingSafetyFactor, 2.7);
  approx(r.fsSlideReq, 1.35);
  approx(r.fsOverReq, 1.4);
}

// ── 預設路徑：不得出現有效面積 / 沉陷檢核項，overallOk 不受影響 ──
{
  const r = FoundationLocalCore.calculate(goldenCases[0].input);
  assert.ok(!r.checks.some(c => c.key === 'bearing-effective'), '預設無有效面積檢核');
  assert.ok(!r.checks.some(c => c.key === 'settlement'), '預設無沉陷檢核');
  assert.equal(r.hasSettlement, false);
  assert.equal(r.settlementCm, null);
}

// ── Meyerhof 有效面積承壓 ──
{
  const r = FoundationLocalCore.calculate({ ...goldenCases[0].input, effectiveAreaCheck: true });
  const expBp = r.B - 2 * Math.abs(r.ex);
  const expLp = r.L - 2 * Math.abs(r.ey);
  approx(r.effWidthB, expBp);
  approx(r.effWidthL, expLp);
  approx(r.qEff, r.Ptotal / (expBp * expLp));
  assert.ok(r.qEff >= r.qAvg - 1e-9, '有效面積承壓不小於平均底壓');
  assert.ok(r.checks.some(c => c.key === 'bearing-effective'), '含有效面積檢核項');
}
{
  // 大偏心：有效寬可能歸零（合力超出基礎一半），qEff = Infinity
  const r = FoundationLocalCore.calculate({ ...goldenCases[1].input, effectiveAreaCheck: true });
  assert.equal(r.qEffOk, false, '大偏心有效面積承壓不通過');
}

// ── 立即彈性沉陷 Se = q·B·(1−ν²)·Iw/Es ──
{
  const r = FoundationLocalCore.calculate({ ...goldenCases[0].input, Es: 1500 });
  const expected = r.qAvg * r.B * (1 - 0.3 * 0.3) * 0.88 / 1500 * 100;
  approx(r.settlementCm, expected, 1e-9);
  assert.equal(r.hasSettlement, true);
  assert.ok(r.checks.some(c => c.key === 'settlement'), '含沉陷檢核項');
  assert.equal(r.settlementOk, r.settlementCm <= 2.5);
}
{
  // 自訂 ν、影響係數與容許沉陷
  const r = FoundationLocalCore.calculate({ ...goldenCases[0].input, Es: 800, nu: 0.35, settlementInfluence: 1.12, allowableSettlementCm: 5 });
  const expected = r.qAvg * r.B * (1 - 0.35 * 0.35) * 1.12 / 800 * 100;
  approx(r.settlementCm, expected, 1e-9);
}

console.log('foundation local core regression OK (incl. effective area + elastic settlement)');
