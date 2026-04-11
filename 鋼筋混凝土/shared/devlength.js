/* shared/devlength.js
 * 鋼筋開發長度 ℓd 與搭接長度 ℓs — 112 規範第 25 章
 *
 * Tension development length (簡化型, 25.4.2):
 *   ℓd/db = (fy / (1.1·λ·√fc')) · (ψt·ψe·ψs / ((cb+Ktr)/db))
 *   下限 30 cm；上限 (cb+Ktr)/db ≤ 2.5
 *
 * 簡化計算 (25.4.2.3):
 *   小於 #7:  ℓd = (fy·ψt·ψe / (5.3·λ·√fc')) · db
 *   #7 以上:  ℓd = (fy·ψt·ψe / (4.2·λ·√fc')) · db
 *
 * Compression (25.4.9):
 *   ℓdc = max( (0.24·fy)/(λ·√fc')·db,  0.043·fy·db ),  下限 20 cm
 *
 * Lap splice (25.5.2):
 *   Class A: 1.0·ℓd  (As 配置 ≥ 2·As 需求 且 搭接量 ≤ 50%)
 *   Class B: 1.3·ℓd  (其他)
 *   下限 30 cm
 */
(function(){
  function ldTension(opts){
    const fc = opts.fc;            // kgf/cm²
    const fy = opts.fy;            // kgf/cm²
    const db = opts.db;            // cm
    const lambda = opts.lambda || 1.0;
    const psit = opts.psit || 1.0; // 上層筋係數 (≥30cm 新拌混凝土在下方時 1.3)
    const psie = opts.psie || 1.0; // 環氧塗布
    const isLarge = db >= 2.0;     // #7 以上
    const k = isLarge ? 4.2 : 5.3;
    const ld = (fy * psit * psie / (k * lambda * Math.sqrt(fc))) * db;
    return Math.max(ld, 30);
  }

  function ldCompression(opts){
    const fc = opts.fc, fy = opts.fy, db = opts.db;
    const lambda = opts.lambda || 1.0;
    const ldc1 = (0.24 * fy) / (lambda * Math.sqrt(fc)) * db;
    const ldc2 = 0.043 * fy * db;
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
    const k = (opts.db >= 2.0) ? 4.2 : 5.3;
    return [
      { label:`${label||'拉力 ℓd'} (簡化式)`,
        formula:`ℓd = (fy·ψt·ψe / (${k}·λ·√fc')) · db ≥ 30 cm`,
        sub:`= (${opts.fy}·${opts.psit||1}·${opts.psie||1} / (${k}·${opts.lambda||1}·√${opts.fc}))·${opts.db.toFixed(2)} = ${ld.toFixed(1)} cm`,
        value: ld.toFixed(1), unit:'cm', ok:null },
      { label:'壓力 ℓdc',
        formula:"ℓdc = max(0.24·fy/(λ·√fc')·db, 0.043·fy·db) ≥ 20 cm",
        sub:`= ${ldc.toFixed(1)} cm`,
        value: ldc.toFixed(1), unit:'cm', ok:null },
      { label:'搭接長度 ℓs (Class B 1.3·ℓd)',
        formula:'規範 25.5.2 — 多數情況採 Class B',
        sub:`Class A = ${lsA.toFixed(1)} cm,  Class B = ${lsB.toFixed(1)} cm`,
        value: `${lsA.toFixed(0)} / ${lsB.toFixed(0)}`, unit:'cm', ok:null }
    ];
  }

  window.DevLength = { ldTension, ldCompression, lapSplice, reportItems };
})();
