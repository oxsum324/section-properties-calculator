/* shared/devlength.js
 * 鋼筋開發長度 ℓd 與搭接長度 ℓs — 112 規範第 25 章
 *
 * Tension development length (簡化型, 25.4.2.3 表 25.4.2.3，kgf/cm²):
 *   有利條件（淨間距 ≥ db、淨保護層 ≥ db 且 ℓd 範圍內肋筋或箍筋 ≥ 規範最小值；
 *             或淨間距 ≥ 2db 且淨保護層 ≥ db）:
 *     D19 及較小:  ℓd = (fy·ψt·ψe / (6.6·λ·√fc')) · db
 *     D22 及較大:  ℓd = (fy·ψt·ψe / (5.3·λ·√fc')) · db
 *   其他情況:
 *     D19 及較小:  ℓd = (fy·ψt·ψe / (4.4·λ·√fc')) · db
 *     D22 及較大:  ℓd = (fy·ψt·ψe / (3.5·λ·√fc')) · db
 *   ψt·ψe 不必大於 1.7（25.4.2.5）；ℓd ≥ 30 cm（25.4.2.1）。
 *   未提供或無法確認間距、保護層與橫向鋼筋條件時，採「其他情況」。
 *
 * Compression (25.4.9):
 *   SI 式 ℓdc = max(0.24·fy/(λ·√fc'), 0.043·fy)·db (MPa)；換算 kgf/cm²：
 *   ℓdc = max( (0.075·fy)/(λ·√fc')·db,  0.0044·fy·db ),  下限 20 cm
 *
 * Lap splice (25.5.2):
 *   Class A: 1.0·ℓd  (As 配置 ≥ 2·As 需求 且 搭接量 ≤ 50%)
 *   Class B: 1.3·ℓd  (其他)
 *   下限 30 cm
 */
(function(){
  const CONDITION_LABELS = {
    favorable: '有利條件（淨間距與保護層 ≥ db 且有最少橫向筋，或淨間距 ≥ 2db 且保護層 ≥ db）',
    other: '其他情況',
  };

  // 表 25.4.2.3 條件判定：任一輸入缺漏即回傳 other（保守）
  function spacingCondition(opts){
    const db = Number(opts && opts.db);
    const clearSpacing = Number(opts && opts.clearSpacing);
    const clearCover = Number(opts && opts.clearCover);
    if (!(db > 0) || !Number.isFinite(clearSpacing) || !Number.isFinite(clearCover)) return 'other';
    if (clearCover < db) return 'other';
    if (clearSpacing >= 2 * db) return 'favorable';
    if (clearSpacing >= db && opts.minTransverse === true) return 'favorable';
    return 'other';
  }

  function tensionCoefficient(opts){
    const isLarge = opts.db >= 2.0;     // D22 及較大
    return opts.condition === 'favorable' ? (isLarge ? 5.3 : 6.6) : (isLarge ? 3.5 : 4.4);
  }

  function ldTension(opts){
    const fc = opts.fc;            // kgf/cm²
    const fy = opts.fy;            // kgf/cm²
    const db = opts.db;            // cm
    const lambda = opts.lambda || 1.0;
    const psit = opts.psit || 1.0; // 上層筋係數 (≥30cm 新拌混凝土在下方時 1.3)
    const psie = opts.psie || 1.0; // 環氧塗布
    const psiProduct = Math.min(psit * psie, 1.7);
    const k = tensionCoefficient({ db, condition: opts.condition });
    const ld = (fy * psiProduct / (k * lambda * Math.sqrt(fc))) * db;
    return Math.max(ld, 30);
  }

  function ldCompression(opts){
    const fc = opts.fc, fy = opts.fy, db = opts.db;
    const lambda = opts.lambda || 1.0;
    // kgf/cm² 版係數 (SI 0.24 / 0.043 經 1 MPa = 10.197 kgf/cm² 換算)
    const ldc1 = (0.075 * fy) / (lambda * Math.sqrt(fc)) * db;
    const ldc2 = 0.0044 * fy * db;
    return Math.max(ldc1, ldc2, 20);
  }

  function lapSplice(opts){
    // opts: { ld, classB:bool }  or  full opts forwarded to ldTension + classB
    let ld;
    if (opts.ld != null) ld = opts.ld;
    else ld = ldTension(opts);
    const factor = opts.classB ? 1.3 : 1.0;
    return Math.max(ld * factor, 30);
  }

  // 產生 計算書 用的檢核項目陣列
  function reportItems(opts, label){
    const ld = ldTension(opts);
    const ldc = ldCompression(opts);
    const lsB = lapSplice({ ...opts, classB:true });
    const lsA = lapSplice({ ...opts, classB:false });
    const k = tensionCoefficient(opts);
    const condition = opts.condition === 'favorable' ? 'favorable' : 'other';
    return [
      { label:`${label||'拉力 ℓd'} (表 25.4.2.3)`,
        formula:`ℓd = (fy·ψt·ψe / (${k}·λ·√fc')) · db ≥ 30 cm；${CONDITION_LABELS[condition]}`,
        sub:`= (${opts.fy}·${opts.psit||1}·${opts.psie||1} / (${k}·${opts.lambda||1}·√${opts.fc}))·${opts.db.toFixed(2)} = ${ld.toFixed(1)} cm`,
        value: ld.toFixed(1), unit:'cm', ok:null },
      { label:'壓力 ℓdc',
        formula:"ℓdc = max(0.075·fy/(λ·√fc')·db, 0.0044·fy·db) ≥ 20 cm (kgf/cm²)",
        sub:`= ${ldc.toFixed(1)} cm`,
        value: ldc.toFixed(1), unit:'cm', ok:null },
      { label:'搭接長度 ℓs (Class B 1.3·ℓd)',
        formula:'規範 25.5.2 — 多數情況採 Class B',
        sub:`Class A = ${lsA.toFixed(1)} cm,  Class B = ${lsB.toFixed(1)} cm`,
        value: `${lsA.toFixed(0)} / ${lsB.toFixed(0)}`, unit:'cm', ok:null }
    ];
  }

  window.DevLength = { ldTension, ldCompression, lapSplice, reportItems, spacingCondition, tensionCoefficient, CONDITION_LABELS };
})();
