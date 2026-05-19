window.StoneCalculator = (() => {
  const VERSION = '2026.04.19-core1';

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function buildCaseCheckData(cd, result, inp) {
    const T = toNumber(result.T);
    const V = toNumber(result.V);
    const mc_h1 = toNumber(result.mc_h1, 3.4);
    const mc_h2 = toNumber(result.mc_h2, 3.6);
    const bh = toNumber(cd.bh, 10);
    const d1 = toNumber(cd.d1, 8);
    const Lt = toNumber(cd.Lt, 0.5);
    const LL = toNumber(cd.LL, 5);
    const d0 = toNumber(cd.d0, 1.2);
    const fy = toNumber(inp.m_fy, 2100);
    const screwTa = toNumber(inp.m_screw_ta, 255.3);
    const anchorTa = toNumber(inp.m_anc_ta, 499.7);
    const mcVa = toNumber(inp.m_mc_va, 567);
    const mcTa = toNumber(inp.m_mc_ta, 709);
    const pinVa = toNumber(inp.m_pin_va, 0);
    const wCf = toNumber(inp.w_cf, 1.25);
    const hasMC = Boolean(cd.hasMC);

    const Tu1 = d1 ? (V * bh) / d1 : 0;
    const Tu2 = d1 ? (T * bh) / d1 : 0;
    const Tu = Math.max(Tu1, Tu2);
    const T1 = mc_h2 ? (V * mc_h1) / mc_h2 : 0;
    const Au = (LL - d0) * Lt;
    const S_sec = (1 / 6) * LL * Lt * Lt;
    const Va_L = 0.4 * fy * Au;
    const M = Math.max(V * bh, T * d1);
    const Fb = 0.6 * fy * wCf;
    const Sreq = Fb ? M / Fb : 0;

    const row = (no, item, formula, calc, allow, value, limit, unit, pass) => ({
      no,
      item,
      formula,
      calc,
      allow,
      v: value,
      a: limit,
      unit,
      pass,
      label: `${item}：${formula} = ${calc}，容許值 ${allow}`,
    });

    return [
      row('①', '背扣螺絲 抗拔', 'T = P ÷ N', `${T.toFixed(2)} kgf`, `${screwTa} kgf`, T, screwTa, 'kgf', T <= screwTa),
      row('②', '膨脹螺栓 Tu1（垂直力）', 'Tu1 = V × h ÷ d₁', `${Tu1.toFixed(2)} kgf`, `${anchorTa} kgf`, Tu1, anchorTa, 'kgf', Tu1 <= anchorTa),
      row('③', '膨脹螺栓 Tu2（水平力）', 'Tu2 = T × h ÷ d₁', `${Tu2.toFixed(2)} kgf`, `${anchorTa} kgf`, Tu2, anchorTa, 'kgf', Tu2 <= anchorTa),
      ...(hasMC
        ? [
            row('④', '馬車螺栓 剪力', 'V = T', `${T.toFixed(2)} kgf`, `${mcVa} kgf`, T, mcVa, 'kgf', T <= mcVa),
            row('⑤', '馬車螺栓 拉力 T₁', 'T₁ = V × h₁ ÷ h₂', `${T1.toFixed(2)} kgf`, `${mcTa} kgf`, T1, mcTa, 'kgf', T1 <= mcTa),
          ]
        : [
            row('④', '插銷 剪力', 'Tu ≤ Va', `${Tu.toFixed(2)} kgf`, `${pinVa.toFixed(1)} kgf`, Tu, pinVa, 'kgf', Tu <= pinVa),
          ]),
      row(hasMC ? '⑥' : '⑤', '角鋼 剪力（淨截面）', 'V ≤ 0.4·Fy·Au', `${V.toFixed(2)} kgf`, `${Va_L.toFixed(2)} kgf`, V, Va_L, 'kgf', V <= Va_L),
      row(hasMC ? '⑦' : '⑥', '角鋼 彎矩（斷面模數）', 'Sreq = M ÷ Fb', `${Sreq.toFixed(4)} cm³`, `${S_sec.toFixed(4)} cm³`, Sreq, S_sec, 'cm³', Sreq <= S_sec),
    ];
  }

  function calcCase(cd, inp) {
    const w = toNumber(cd.w, 870);
    const h = toNumber(cd.h, 800);
    const N = Math.max(1, Math.round(toNumber(cd.N, 4)));
    const h12 = String(cd.h12 || '3.4,3.6')
      .split(',')
      .map((value) => toNumber(value.trim()))
      .filter((value) => Number.isFinite(value));
    const mc_h1 = h12[0] || 3.4;
    const mc_h2 = h12[1] || 3.6;

    const Wp = toNumber(inp.st_gam, 2800) * toNumber(inp.st_t, 30) / 1000;
    const A = (w / 1000) * (h / 1000);
    const G = A * Wp;

    const Fph = 1.6 * toNumber(inp.s_sds, 0.6) * toNumber(inp.s_ip, 1.0) * Wp;
    const PE = Fph * A;
    const PEV = 0.5 * PE;

    const FW = Math.max(toNumber(inp.w_pos, 426), toNumber(inp.w_neg, 341)) * toNumber(inp.w_cf, 1.25);
    const PW = A * FW;

    const S = G + PEV;
    const P = Math.max(PE, PW);
    const govWind = PW >= PE;
    const T = P / N;
    const V = S / N;

    const checks = buildCaseCheckData(cd, { T, V, mc_h1, mc_h2 }, inp);
    const allOK = checks.every((check) => check.pass);

    return {
      id: cd.id ?? null,
      A,
      G,
      Wp,
      Fph,
      PE,
      PEV,
      PW,
      FW,
      S,
      P,
      T,
      V,
      govWind,
      gov_wind: govWind,
      checks,
      allOK,
      all_ok: allOK,
      mc_h1,
      mc_h2,
      calculator_version: VERSION,
    };
  }

  function computeAllCases(caseRows, inp) {
    return (caseRows || []).map((cd) => calcCase(cd, inp));
  }

  return Object.freeze({
    VERSION,
    buildCaseCheckData,
    calcCase,
    computeAllCases,
  });
})();
