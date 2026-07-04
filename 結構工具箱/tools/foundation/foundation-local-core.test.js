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
assert.equal(FoundationLocalCore.version, '0.6.0');

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

// ── 壓密沉陷：Boussinesq / 2:1 應力增量 + Cc/Cr 一維壓密 ──
{
  // Boussinesq 角點影響係數對齊教科書表列值 Iσ(1,1)=0.175
  approx(FoundationLocalCore.boussinesqCornerFactor(1, 1), 0.17522148257029865, 1e-9);
}
{
  // 中心點深度趨近 0 時，影響係數趨近 1.0（4 角點各 0.25）
  approx(FoundationLocalCore.boussinesqCenterFactor(2, 2, 0.001), 1, 1e-6);
}
{
  // 2:1 法：z=0 時為 1.0；B=2,L=3,z=2 時 = 6/20 = 0.3
  approx(FoundationLocalCore.twoToOneFactor(2, 3, 0), 1, 1e-12);
  approx(FoundationLocalCore.twoToOneFactor(2, 3, 2), 0.3, 1e-12);
}
{
  // NC：Sc = Cc·h/(1+e0)·log10((σ0+Δσ)/σ0)
  const r = FoundationLocalCore.consolidationSettlementLayer(3, 0.9, 0.3, 0.05, 10, 0, 5);
  assert.equal(r.regime, 'normally-consolidated');
  approx(r.Sc, 0.3 * 3 / 1.9 * Math.log10(15 / 10), 1e-12);
}
{
  // OC 跨越 σp'：Sc = Cr·h/(1+e0)·log10(σp/σ0) + Cc·h/(1+e0)·log10(σf/σp)
  const r = FoundationLocalCore.consolidationSettlementLayer(3, 0.9, 0.3, 0.05, 10, 13, 5);
  assert.equal(r.regime, 'overconsolidated-straddling');
  approx(r.Sc, 0.05 * 3 / 1.9 * Math.log10(13 / 10) + 0.3 * 3 / 1.9 * Math.log10(15 / 13), 1e-12);
}
{
  // OC 未跨越 σp'（仍在再壓縮範圍）：Sc = Cr·h/(1+e0)·log10(σf/σ0)
  const r = FoundationLocalCore.consolidationSettlementLayer(3, 0.9, 0.3, 0.05, 10, 20, 5);
  assert.equal(r.regime, 'overconsolidated-recompression');
  approx(r.Sc, 0.05 * 3 / 1.9 * Math.log10(15 / 10), 1e-12);
}
{
  // calculate() 整合：單一黏土層、2:1 法，qNet 扣除基礎面覆土應力
  const base = { B: 2.5, L: 3, t: 0.6, Df: 1.2, gammaC: 2.4, gammaS: 1.8, P: 80, qa: 20, Mx: 12, My: 8, Hx: 4, Hy: 3, mu: 0.45, passive: 0, fsSlideReq: 1.5, fsOverReq: 1.5, includeSelfWeight: true };
  const r = FoundationLocalCore.calculate(Object.assign({}, base, {
    consolidationEnable: true, consolidationMethod: '2:1',
    consolidationLayers: [{ h: 3, zMid: 2, sigma0: 12, e0: 0.85, Cc: 0.28, Cr: 0, sigmaP: 0 }]
  }));
  approx(r.qNet, r.qAvg - 1.8 * 1.2, 1e-9);
  approx(r.consolidationLayerResults[0].influenceFactor, (2.5 * 3) / ((2.5 + 2) * (3 + 2)), 1e-9);
  approx(r.consolidationSettlementCm, 5.268920498576918, 1e-6);
  assert.equal(r.consolidationOk, false, '5.27cm 超過預設容許 2.5cm');
  assert.equal(r.overallOk, false, '壓密沉陷不通過須反映於總結論');
  assert.ok(r.checks.some(c => c.key === 'consolidation-settlement'));
}
{
  // 預設（未開壓密）不受影響，且與現有 golden 案結果逐位一致
  const r = FoundationLocalCore.calculate(goldenCases[0].input);
  assert.equal(r.hasConsolidation, false);
  assert.equal(r.consolidationSettlementCm, null);
  assert.equal(r.consolidationLayerResults.length, 0);
  assert.ok(!r.checks.some(c => c.key === 'consolidation-settlement'));
}
{
  // 驗證：層厚/覆土應力/孔隙比不合理時的錯誤訊息
  const errors = FoundationLocalCore.validateInput(Object.assign({}, goldenCases[0].input, {
    consolidationEnable: true,
    consolidationLayers: [{ h: 0, zMid: -1, sigma0: 0, e0: -1, Cc: -0.1, Cr: -0.1, sigmaP: 0 }]
  }));
  assert.ok(errors.some(m => m.includes('厚度')));
  assert.ok(errors.some(m => m.includes('中點深度')));
  assert.ok(errors.some(m => m.includes('σ0′')));
  assert.ok(errors.some(m => m.includes('e0')));
  assert.ok(errors.some(m => m.includes('Cc')));
}

// ── 壓密沉陷時間-沉陷歷程（Terzaghi Tv/U）──
{
  // Tv50/Tv90 對齊教科書標準值
  approx(FoundationLocalCore.timeFactorFromDegree(50), 0.19634954084936207, 1e-12);
  approx(FoundationLocalCore.timeFactorFromDegree(90), 0.8479999999999999, 1e-12);
}
{
  // 反函數一致性：U≤60% 拋物線段與 U>60% 對數段皆可還原
  approx(FoundationLocalCore.degreeFromTimeFactor(0.19634954084936207), 50, 1e-6);
  approx(FoundationLocalCore.degreeFromTimeFactor(0.8479999999999999), 90, 1e-3);
}
{
  // 雙面排水 Hdr=h/2；單面排水 Hdr=h（t50/t90 因 Hdr² 差 4 倍）
  const dbl = FoundationLocalCore.consolidationTimeRate(3, 2, 'double', 0.05, 0);
  const sgl = FoundationLocalCore.consolidationTimeRate(3, 2, 'single', 0.05, 0);
  approx(dbl.Hdr, 1.5, 1e-12);
  approx(sgl.Hdr, 3, 1e-12);
  approx(dbl.t50, 0.22089323345553233, 1e-9);
  approx(dbl.t90, 0.9539999999999998, 1e-9);
  approx(sgl.t50, dbl.t50 * 4, 1e-9);
  approx(sgl.t90, dbl.t90 * 4, 1e-9);
  assert.equal(dbl.atTarget, null, '未提供評估年限時不計算 atTarget');
}
{
  // 指定評估年限（落於 U≤60% 內插段）：U(t) 與對應沉陷量
  const tr = FoundationLocalCore.consolidationTimeRate(3, 2, 'double', 0.05, 0.3);
  approx(tr.atTarget.Tv, 0.26666666666666666, 1e-9);
  approx(tr.atTarget.Upercent, 58.269249631577544, 1e-6);
  approx(tr.atTarget.settlementAtT, 0.029134624815788775, 1e-9);
}
{
  // 超長年限：壓密度截於 99.9% 上限，不因對數發散而失控
  const tr = FoundationLocalCore.consolidationTimeRate(3, 2, 'double', 0.05, 5);
  approx(tr.atTarget.Upercent, 99.9, 1e-9);
  approx(tr.atTarget.settlementAtT, 0.05 * 0.999, 1e-9);
}
{
  // calculate() 整合：單層提供 cv，含評估年限 → 合計壓密度沉陷量
  const base = { B: 2.5, L: 3, t: 0.6, Df: 1.2, gammaC: 2.4, gammaS: 1.8, P: 80, qa: 20, Mx: 12, My: 8, Hx: 4, Hy: 3, mu: 0.45, passive: 0, fsSlideReq: 1.5, fsOverReq: 1.5, includeSelfWeight: true };
  const r = FoundationLocalCore.calculate(Object.assign({}, base, {
    consolidationEnable: true, consolidationMethod: '2:1', evaluationYears: 0.3,
    consolidationLayers: [{ h: 3, zMid: 2, sigma0: 12, e0: 0.85, Cc: 0.28, Cr: 0, sigmaP: 0, cv: 2, drainageType: 'double' }]
  }));
  assert.equal(r.allLayersHaveTimeRate, true);
  assert.equal(r.hasTimeRateEvaluation, true);
  approx(r.settlementAtEvaluationCm, 3.0701602808299477, 1e-6);
  approx(r.governingT90Years, 0.9539999999999998, 1e-9);
  assert.ok(r.consolidationLayerResults[0].hasTimeRate);
  assert.equal(r.consolidationLayerResults[0].drainageTypeLabel, '雙面排水');
}
{
  // 混合層（一層有 cv、一層無）：不得合計評估年限沉陷量，避免混雜已知/未知速率層
  const base = { B: 2.5, L: 3, t: 0.6, Df: 1.2, gammaC: 2.4, gammaS: 1.8, P: 80, qa: 20, Mx: 12, My: 8, Hx: 4, Hy: 3, mu: 0.45, passive: 0, fsSlideReq: 1.5, fsOverReq: 1.5, includeSelfWeight: true };
  const r = FoundationLocalCore.calculate(Object.assign({}, base, {
    consolidationEnable: true, consolidationMethod: '2:1', evaluationYears: 0.3,
    consolidationLayers: [
      { h: 3, zMid: 2, sigma0: 12, e0: 0.85, Cc: 0.28, Cr: 0, sigmaP: 0, cv: 2, drainageType: 'double' },
      { h: 2, zMid: 6, sigma0: 20, e0: 0.7, Cc: 0.15, Cr: 0, sigmaP: 0, cv: 0 }
    ]
  }));
  assert.equal(r.allLayersHaveTimeRate, false);
  assert.equal(r.hasTimeRateEvaluation, false);
  assert.equal(r.settlementAtEvaluationCm, null);
  assert.equal(r.consolidationLayerResults[0].hasTimeRate, true);
  assert.equal(r.consolidationLayerResults[1].hasTimeRate, false);
}
{
  // 未提供 cv（既有 B3 用法）：時間率相關欄位不出現、既有 Sc 不受影響
  const r = FoundationLocalCore.calculate(goldenCases[0].input);
  assert.equal(r.allLayersHaveTimeRate, false);
  assert.equal(r.hasTimeRateEvaluation, false);
  assert.equal(r.settlementAtEvaluationCm, null);
  assert.equal(r.governingT90Years, null);
}
{
  // 驗證：cv 為負時應報錯
  const errors = FoundationLocalCore.validateInput(Object.assign({}, goldenCases[0].input, {
    consolidationEnable: true,
    consolidationLayers: [{ h: 3, zMid: 2, sigma0: 12, e0: 0.85, Cc: 0.28, cv: -1 }]
  }));
  assert.ok(errors.some(m => m.includes('cv')));
}

// ── 液化初判（簡化法，NCEER/Youd et al. 2001 + Idriss 1999 MSF）──
{
  // MSF 於基準地震規模 Mw=7.5 應近似 1.0（Idriss 1999 公式特性，非恰為 1.000）
  approx(FoundationLocalCore.magnitudeScalingFactor(7.5), 0.9996389409159898, 1e-9);
}
{
  // rd 分段公式：z=0 為 1.0；z>30 收斂常數 0.50
  approx(FoundationLocalCore.stressReductionFactor(0), 1.0, 1e-12);
  approx(FoundationLocalCore.stressReductionFactor(35), 0.5, 1e-12);
  approx(FoundationLocalCore.stressReductionFactor(30), 0.744 - 0.008 * 30, 1e-12);
}
{
  // CN 上限 1.7（Liao & Whitman）；σv′=1 atm 時 CN=1.0
  approx(FoundationLocalCore.overburdenCorrectionCN(10.34), 1.0, 1e-6);
  approx(FoundationLocalCore.overburdenCorrectionCN(1), 1.7, 1e-9);
  approx(FoundationLocalCore.overburdenCorrectionCN(41.36), 0.5, 1e-6);
}
{
  // 細料含量修正：FC≤5% 不修正；FC≥35% 封頂（FC=50 與 FC=35 同值）
  approx(FoundationLocalCore.finesContentCorrection(0), 0, 1e-12);
  approx(FoundationLocalCore.finesContentCorrection(5), 0, 1e-12);
  approx(FoundationLocalCore.finesContentCorrection(50), FoundationLocalCore.finesContentCorrection(35), 1e-12);
}
{
  // CRR7.5：N160cs≥30 視為過密實（非液化，Infinity）
  assert.equal(FoundationLocalCore.cyclicResistanceRatio(30), Infinity);
  approx(FoundationLocalCore.cyclicResistanceRatio(15), 1 / (34 - 15) + 15 / 135 + 50 / Math.pow(10 * 15 + 45, 2) - 1 / 200, 1e-12);
}
{
  // 單點液化初判整合：對齊獨立手算
  const p = FoundationLocalCore.liquefactionScreeningPoint(5, 12, 5, 9, 6, 0.24, 7.5);
  assert.equal(p.valid, true);
  approx(p.rd, 0.96175, 1e-9);
  approx(p.CN, 1.312757911167681, 1e-9);
  approx(p.N160cs, 15.753094934012172, 1e-9);
  approx(p.CSR, 0.22504949999999999, 1e-9);
  approx(p.FSliq, 0.744955248520285, 1e-6);
  assert.equal(p.likelyNonLiquefiable, false);
}
{
  // calculate() 整合：兩點（一淺層可能液化、一深層過密實），控制點須為較不利者
  const base = { B: 2.5, L: 3, t: 0.6, Df: 1.2, gammaC: 2.4, gammaS: 1.8, P: 80, qa: 20, Mx: 12, My: 8, Hx: 4, Hy: 3, mu: 0.45, passive: 0, fsSlideReq: 1.5, fsOverReq: 1.5, includeSelfWeight: true };
  const r = FoundationLocalCore.calculate(Object.assign({}, base, {
    liquefactionEnable: true, liquefactionAmaxG: 0.24, liquefactionMw: 7.5, liquefactionFsReq: 1.2,
    liquefactionPoints: [
      { z: 5, N: 12, FC: 5, sigmaV: 9, sigmaVEff: 6 },
      { z: 10, N: 35, FC: 5, sigmaV: 18, sigmaVEff: 11 }
    ]
  }));
  assert.equal(r.hasLiquefaction, true);
  assert.equal(r.liquefactionValid, true);
  approx(r.liquefactionGoverningFS, 0.744955248520285, 1e-6);
  assert.equal(r.liquefactionGoverningPoint.z, 5, '控制點應為淺層可能液化點，非深層過密實點');
  assert.equal(r.liquefactionPointResults[1].likelyNonLiquefiable, true);
  assert.equal(r.liquefactionPointResults[1].FSliq, Infinity);
  assert.equal(r.liquefactionOk, false, 'FS=0.745 < 要求 1.2 應不通過');
  assert.equal(r.overallOk, false, '液化不通過須反映於總結論');
  assert.ok(r.checks.some(c => c.key === 'liquefaction-screening'));
}
{
  // 預設（未啟用）：不受影響，與既有 golden 案結果逐位一致
  const r = FoundationLocalCore.calculate(goldenCases[0].input);
  assert.equal(r.hasLiquefaction, false);
  assert.equal(r.liquefactionPointResults.length, 0);
  assert.equal(r.liquefactionGoverningFS, null);
  assert.equal(r.liquefactionGoverningPoint, null);
  assert.ok(!r.checks.some(c => c.key === 'liquefaction-screening'));
}
{
  // 驗證：有效應力大於總應力、必要欄位缺漏應報錯
  const errors = FoundationLocalCore.validateInput(Object.assign({}, goldenCases[0].input, {
    liquefactionEnable: true, liquefactionAmaxG: 0, liquefactionMw: 0,
    liquefactionPoints: [{ z: 5, N: 12, FC: 5, sigmaV: 6, sigmaVEff: 9 }]
  }));
  assert.ok(errors.some(m => m.includes('amax')));
  assert.ok(errors.some(m => m.includes('Mw')));
  assert.ok(errors.some(m => m.includes('不得大於總覆土應力')));
}

console.log('foundation local core regression OK (incl. effective area + elastic settlement + consolidation Boussinesq/2:1 + Terzaghi time-rate + liquefaction NCEER simplified)');
