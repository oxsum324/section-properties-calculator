/* core/loads/seismic.js — v2.0
 * 台灣建築物耐震設計規範 — 完整靜力分析引擎
 * 依據：建築物耐震設計規範及解說 (113 年 03 月修正版)
 *
 * 涵蓋：
 *   ‧ 表 2-4(a)(b) Fa / Fv 線性內插
 *   ‧ 式 (2-4)  SDS, SD1, SMS, SM1
 *   ‧ 式 (2-6)  ToD, ToM
 *   ‧ 式 (2-7~9) 經驗週期 Tcode
 *   ‧ 表 2-5    SaD / SaM 譜加速度 (含長週期段)
 *   ‧ 式 (2-10)(2-11) 容許韌性 Ra
 *   ‧ 式 (2-12) Fu 四段分段
 *   ‧ 式 (2-2)(2-3) VD 底部剪力
 *   ‧ 式 (2-13a)(2-13c) V* / VM
 *   ‧ 式 (2-14)(2-15) 豎向分配 Ft / Fx
 *   ‧ 式 (2-16) 地下層水平震度 K
 *
 * 單位：m, tf, sec
 */
(function (global) {
  'use strict';

  // ══════════════════════════════
  //  結構系統 (表 1-3 簡化)
  // ══════════════════════════════
  const SYSTEMS = {
    SMRF_RC:  { name: '特殊抗彎矩 RC 構架',       R: 4.8, alphaY: 1.0, period_C: 0.070 },
    IMRF_RC:  { name: '中度抗彎矩 RC 構架',       R: 3.5, alphaY: 1.0, period_C: 0.070 },
    OMRF_RC:  { name: '普通抗彎矩 RC 構架',       R: 2.0, alphaY: 1.0, period_C: 0.070 },
    SMRF_ST:  { name: '特殊抗彎矩鋼構架',         R: 4.8, alphaY: 1.0, period_C: 0.085 },
    IMRF_ST:  { name: '中度抗彎矩鋼構架',         R: 3.5, alphaY: 1.0, period_C: 0.085 },
    OMRF_ST:  { name: '普通抗彎矩鋼構架',         R: 2.0, alphaY: 1.0, period_C: 0.085 },
    SRC:      { name: '特殊抗彎矩 SRC 構架',      R: 4.8, alphaY: 1.0, period_C: 0.070 },
    SHEAR_RC: { name: '特殊結構牆系統',           R: 4.5, alphaY: 1.0, period_C: 0.050 },
    DUAL:     { name: '抗彎矩構架 + 結構牆雙系統', R: 5.0, alphaY: 1.0, period_C: 0.070 },
    CUSTOM:   { name: '自訂 (直接輸入 R/αy)',      R: 4.0, alphaY: 1.0, period_C: 0.070 },
    OTHER:    { name: '其他系統 (保守)',           R: 1.5, alphaY: 1.0, period_C: 0.050 },
  };

  const IMPORTANCE = {
    I:   { name: '第一類 (重要 — 醫院、消防、避難)', factor: 1.50 },
    II:  { name: '第二類 (危險物品)',               factor: 1.50 },
    III: { name: '第三類 (公眾使用)',               factor: 1.25 },
    IV:  { name: '第四類 (一般建築)',               factor: 1.00 },
  };

  // ══════════════════════════════
  //  表 2-4(a) Fa — 短週期工址放大係數
  //  key: SS values [0.5, 0.6, 0.7, 0.8, 0.9]
  // ══════════════════════════════
  const FA_TABLE = {
    // 地盤類別: [Fa at SS=0.5, 0.6, 0.7, 0.8, ≥0.9]
    1: [1.0, 1.0, 1.0, 1.0, 1.0],
    2: [1.1, 1.1, 1.0, 1.0, 1.0],
    3: [1.2, 1.2, 1.1, 1.0, 1.0],
  };
  const FA_SS = [0.5, 0.6, 0.7, 0.8, 0.9];

  // ══════════════════════════════
  //  表 2-4(b) Fv — 一秒週期工址放大係數
  //  key: S1 values [0.30, 0.35, 0.40, 0.45, 0.50]
  // ══════════════════════════════
  const FV_TABLE = {
    1: [1.0, 1.0, 1.0, 1.0, 1.0],
    2: [1.5, 1.4, 1.3, 1.2, 1.1],
    3: [1.8, 1.7, 1.6, 1.5, 1.4],
  };
  const FV_S1 = [0.30, 0.35, 0.40, 0.45, 0.50];

  /** 線性內插工具 */
  function _interp(xArr, yArr, x) {
    if (x <= xArr[0]) return yArr[0];
    if (x >= xArr[xArr.length - 1]) return yArr[yArr.length - 1];
    for (let i = 0; i < xArr.length - 1; i++) {
      if (x <= xArr[i + 1]) {
        const t = (x - xArr[i]) / (xArr[i + 1] - xArr[i]);
        return yArr[i] + t * (yArr[i + 1] - yArr[i]);
      }
    }
    return yArr[yArr.length - 1];
  }

  /**
   * 表 2-4(a) 查 Fa
   * @param {number} siteClass  1/2/3
   * @param {number} SS         震區短週期水平譜加速度 (SsD 或 SsM)
   * @returns {number} Fa
   * Ref: 規範 表 2-4(a)
   */
  function getFa(siteClass, SS) {
    const row = FA_TABLE[siteClass] || FA_TABLE[1];
    return _interp(FA_SS, row, SS);
  }

  /**
   * 表 2-4(b) 查 Fv
   * @param {number} siteClass
   * @param {number} S1        震區一秒週期水平譜加速度 (S1D 或 S1M)
   * @returns {number} Fv
   * Ref: 規範 表 2-4(b)
   */
  function getFv(siteClass, S1) {
    const row = FV_TABLE[siteClass] || FV_TABLE[1];
    return _interp(FV_S1, row, S1);
  }

  /**
   * 式 (2-4): 工址水平譜加速度係數
   * SDS = Fa × SsD,  SD1 = Fv × S1D
   * SMS = Fa × SsM,  SM1 = Fv × S1M
   * Ref: 規範 式 (2-4)
   */
  function calcSiteCoeff(siteClass, SsD, S1D, SsM, S1M) {
    const FaD = getFa(siteClass, SsD);
    const FvD = getFv(siteClass, S1D);
    const FaM = getFa(siteClass, SsM);
    const FvM = getFv(siteClass, S1M);
    return {
      FaD, FvD, FaM, FvM,
      SDS: FaD * SsD,      // 式 (2-4)
      SD1: FvD * S1D,
      SMS: FaM * SsM,
      SM1: FvM * S1M,
    };
  }

  /**
   * 式 (2-6): ToD, ToM
   * Ref: 規範 式 (2-6)
   */
  function calcTo(SDS, SD1, SMS, SM1) {
    return {
      ToD: SD1 / SDS,   // 式 (2-6)
      ToM: SM1 / SMS,
    };
  }

  /**
   * 式 (2-7~2-9): 經驗週期 Tcode
   * Ref: 規範 式 (2-7)(2-8)(2-9)
   */
  function calcPeriod(systemKey, hn) {
    const C = SYSTEMS[systemKey]?.period_C ?? 0.070;
    return C * Math.pow(hn, 0.75);    // 式 (2-7)~(2-9)
  }

  /**
   * 設計週期 Tdesign
   * Tdesign = min(CU × Tcode, Tdyna)
   * CU = 1.4 (113 年版)
   * Ref: 規範 2.6 節解說
   */
  function calcTdesign(Tcode, Tdyna, CU) {
    if (CU == null) CU = 1.4;
    if (Tdyna != null && Tdyna > 0) {
      return Math.min(CU * Tcode, Tdyna);
    }
    return CU * Tcode;
  }

  /**
   * 表 2-5(a)(b): 工址設計/最大考量水平譜加速度係數
   * @param {number} T    週期 (sec)
   * @param {number} SDS  工址短週期設計水平譜加速度
   * @param {number} SD1  工址一秒週期設計水平譜加速度
   * @returns {number} SaD (or SaM if called with SMS/SM1)
   * Ref: 規範 表 2-5(a)
   */
  function calcSa(T, SDS, SD1) {
    const T0 = SD1 / SDS;
    if (T <= 0.2 * T0) {
      return SDS * (0.4 + 3.0 * T / T0);   // 線性上升段
    } else if (T <= T0) {
      return SDS;                           // 等加速度平台
    } else if (T <= 2.5 * T0) {
      return SD1 / T;                       // 等速度衰減段
    } else {
      return Math.max(0.4 * SDS, SD1 / T);  // 長週期段 (下限 0.4SDS)
    }
  }

  /**
   * 式 (2-10): 容許韌性容量 Ra (一般工址)
   * Ra = 1 + (R-1)/1.5
   * Ref: 規範 式 (2-10)
   */
  function calcRa(R, isTaipeiBasin) {
    if (isTaipeiBasin) {
      return 1 + (R - 1) / 2.0;  // 式 (2-11) 臺北盆地
    }
    return 1 + (R - 1) / 1.5;    // 式 (2-10) 一般/近斷層
  }

  /**
   * 式 (2-12): 結構系統地震力折減係數 Fu
   * 四段分段函數，依 T 與 ToD 關係
   * @param {number} Ra  容許韌性容量
   * @param {number} T   設計週期
   * @param {number} ToD 短週期/中週期分界
   * @returns {number} Fu
   * Ref: 規範 式 (2-12)
   */
  function calcFu(Ra, T, ToD) {
    const T0 = ToD;
    const Fu_short = Math.sqrt(2 * Ra - 1);                     // 等能量原則
    if (T >= T0) {
      return Ra;                                               // 段1: T ≥ T0
    } else if (T >= 0.6 * T0) {
      return Fu_short + (Ra - Fu_short) *
             (T - 0.6 * T0) / (0.4 * T0);                     // 段2: 0.6T0 ≤ T < T0 (線性)
    } else if (T >= 0.2 * T0) {
      return Fu_short;                                          // 段3: 0.2T0 ≤ T < 0.6T0 (平坦)
    } else {
      return 1 + (Fu_short - 1) * (T / (0.2 * T0));            // 段4: T < 0.2T0 (線性)
    }
  }

  /**
   * FuM (最大考量地震用)
   * 直接取 R (一般工址, T≥ToM)
   * Ref: 規範 2.10.2
   */
  function calcFuM(R, T, ToM) {
    // 簡化：T ≥ ToM 時 FuM = R
    if (T >= ToM) return R;
    // 短週期分段同 Fu，但用 R 代替 Ra
    return calcFu(R, T, ToM);
  }

  /**
   * 式 (2-2): (SaD/Fu)m 修正
   * Ref: 規範 式 (2-2)
   */
  function calcSaFuM(SaD_over_Fu) {
    const r = SaD_over_Fu;
    if (r <= 0.3)  return r;
    if (r >= 0.8)  return 0.70 * r;
    return 0.52 * r + 0.144;              // 式 (2-2)
  }

  /**
   * 式 (2-3): VD 最小設計水平總橫力
   * VD = I/(1.4·αy) × (SaD/Fu)m × W
   * Ref: 規範 式 (2-3)
   */
  function calcVD(I, alphaY, SaD, Fu, W) {
    const ratio = SaD / Fu;
    const ratio_m = calcSaFuM(ratio);
    const VD = I / (1.4 * alphaY) * ratio_m * W;
    return { VD, ratio, ratio_m };
  }

  /**
   * 式 (2-13a): V* 避免中小度地震降伏
   * V* = I·Fu/(4.2·αy) × (SaD/Fu)m × W   (一般工址)
   * Ref: 規範 式 (2-13a)
   */
  function calcVstar(I, alphaY, Fu, SaD, W, isTaipeiBasin) {
    const ratio = SaD / Fu;
    const ratio_m = calcSaFuM(ratio);
    const denom = isTaipeiBasin ? 3.5 : 4.2;
    const Vstar = I * Fu / (denom * alphaY) * ratio_m * W;
    return { Vstar, ratio, ratio_m };
  }

  /**
   * 式 (2-13c): VM 避免最大考量地震崩塌
   * VM = I/(1.4·αy) × (SaM/FuM)m × W
   * Ref: 規範 式 (2-13c)
   */
  function calcVM(I, alphaY, SaM, FuM, W) {
    const ratio = SaM / FuM;
    const ratio_m = calcSaFuM(ratio);
    const VM = I / (1.4 * alphaY) * ratio_m * W;
    return { VM, ratio, ratio_m };
  }

  /**
   * 式 (2-14): 頂部附加力 Ft
   * Ref: 規範 式 (2-14)
   */
  function calcFt(T, V) {
    if (T <= 0.7) return 0;
    if (T >= 3.6) return 0.25 * V;
    return Math.min(0.07 * T * V, 0.25 * V);   // 式 (2-14)
  }

  /**
   * 式 (2-15): 豎向分配
   * Fx = (V - Ft) × (Wx·hx) / Σ(Wi·hi) + (頂層加 Ft)
   * @param {number} V    設計底部剪力
   * @param {number} T    設計週期
   * @param {Array}  floors  [{W, dH}]  由下往上，W=層重(tf), dH=層高(m)
   * Ref: 規範 式 (2-15)
   */
  function calcVerticalDist(V, T, floors) {
    const Ft = calcFt(T, V);
    const Vremain = V - Ft;

    // 計算 hi (距基面高度)
    const data = [];
    let hAcc = 0;
    for (let i = 0; i < floors.length; i++) {
      hAcc += floors[i].dH;
      data.push({ W: floors[i].W, dH: floors[i].dH, h: hAcc, Wh: floors[i].W * hAcc });
    }
    const sumWh = data.reduce((s, d) => s + d.Wh, 0);

    // Fi
    for (let i = 0; i < data.length; i++) {
      data[i].Fi = sumWh > 0 ? Vremain * data[i].Wh / sumWh : 0;
      if (i === data.length - 1) data[i].Fi += Ft;
    }

    // 累積剪力 (由頂往下)
    let Vacc = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      Vacc += data[i].Fi;
      data[i].Vstory = Vacc;
    }

    // 傾覆力矩
    const OTM = data.reduce((s, d) => s + d.Fi * d.h, 0);

    return { Ft, floors: data, sumWh, OTM };
  }

  /**
   * 式 (2-16): 地下層水平震度 K
   * K = 0.1 × (1 - H/40) × SDS × I    (H ≤ 20m)
   * Ref: 規範 式 (2-16)
   */
  function calcSubK(H_depth, SDS, SMS, I) {
    const h = Math.min(H_depth, 20);
    const KD = 0.1 * (1 - h / 40) * SDS * I;     // 規範原式 H/40 (深度 ≤ 20m)
    const KM = 0.1 * (1 - h / 40) * SMS * I;
    return { K: Math.max(KD, KM), KD, KM };
  }

  // ══════════════════════════════
  //  全流程整合
  // ══════════════════════════════

  /**
   * 完整耐震靜力分析
   * @param {object} p
   *   systemKey, hn, I, alphaY,
   *   SsD, S1D, SsM, S1M, siteClass,
   *   floors: [{W, dH, label}],   // 由下往上
   *   Tdyna (optional), CU (default 1.4),
   *   isTaipeiBasin (default false)
   */
  function calcFullSeismic(p) {
    const sys = SYSTEMS[p.systemKey] || SYSTEMS.OTHER;
    const R = p.R || sys.R;
    const alphaY = p.alphaY ?? sys.alphaY ?? 1.0;
    const I = p.I || 1.0;
    const CU = p.CU || 1.4;
    const isTB = p.isTaipeiBasin || false;

    // Step 1: 工址放大係數
    const site = calcSiteCoeff(p.siteClass || 2, p.SsD, p.S1D, p.SsM, p.S1M);

    // Step 2: ToD, ToM
    const { ToD, ToM } = calcTo(site.SDS, site.SD1, site.SMS, site.SM1);

    // Step 3: 週期
    const Tcode = calcPeriod(p.systemKey, p.hn);
    const Tdesign = calcTdesign(Tcode, p.Tdyna, CU);

    // Step 4: Ra, Fu, FuM
    const Ra = calcRa(R, isTB);
    const Fu = calcFu(Ra, Tdesign, ToD);
    const FuM = calcFuM(R, Tdesign, ToM);

    // Step 5: SaD, SaM
    const SaD = calcSa(Tdesign, site.SDS, site.SD1);
    const SaM = calcSa(Tdesign, site.SMS, site.SM1);

    // Step 6: W
    const W = p.floors.reduce((s, f) => s + f.W, 0);

    // Step 7: VD
    const vd = calcVD(I, alphaY, SaD, Fu, W);

    // Step 8: V*
    const vs = calcVstar(I, alphaY, Fu, SaD, W, isTB);

    // Step 9: VM
    const vm = calcVM(I, alphaY, SaM, FuM, W);

    // Step 10: Vdesign
    const Vdesign = Math.max(vd.VD, vs.Vstar, vm.VM);
    let controlledBy = 'VD';
    if (Vdesign === vs.Vstar) controlledBy = 'V*';
    if (Vdesign === vm.VM) controlledBy = 'VM';

    // VD/W, V*/W, VM/W coefficients
    const VD_coeff = vd.VD / W;
    const Vs_coeff = vs.Vstar / W;
    const VM_coeff = vm.VM / W;
    const V_coeff  = Vdesign / W;

    // Step 11: 豎向分配
    const dist = calcVerticalDist(Vdesign, Tdesign, p.floors);

    return {
      // 輸入參數
      sys, R, alphaY, I, CU,
      siteClass: p.siteClass || 2,
      SsD: p.SsD, S1D: p.S1D, SsM: p.SsM, S1M: p.S1M,
      // 工址係數
      site,
      // 週期
      Tcode, Tdesign, Tdyna: p.Tdyna || null,
      ToD, ToM,
      // 韌性 & 折減
      Ra, Fu, FuM,
      // 譜加速度
      SaD, SaM,
      // 底部剪力
      W,
      VD: vd.VD, VD_ratio: vd.ratio, VD_ratio_m: vd.ratio_m, VD_coeff,
      Vstar: vs.Vstar, Vs_ratio: vs.ratio, Vs_ratio_m: vs.ratio_m, Vs_coeff,
      VM: vm.VM, VM_ratio: vm.ratio, VM_ratio_m: vm.ratio_m, VM_coeff,
      Vdesign, V_coeff, controlledBy,
      // 豎向分配
      Ft: dist.Ft,
      dist,
    };
  }

  // ── 向後相容 (舊 seismic-force.html) ──
  function calcStaticSeismic(input) {
    const { systemKey, hn, I, SDS, SD1, storyW, storyH, Tuser } = input;
    const sys = SYSTEMS[systemKey] || SYSTEMS.OTHER;
    const Tcalc = calcPeriod(systemKey, hn);
    const T = (Tuser && Tuser > 0) ? Tuser : calcTdesign(Tcalc, null, 1.4);
    const T0 = SD1 / SDS;
    const Ts = T0; // same as ToD
    const SaDval = calcSa(T, SDS, SD1);
    const Ra = calcRa(sys.R, false);
    const Fuval = calcFu(Ra, T, T0);
    const W = storyW.reduce((s, w) => s + w, 0);
    const ratio = SaDval / Fuval;
    const ratio_m = calcSaFuM(ratio);
    const Vraw = I / (1.4 * sys.alphaY) * ratio_m * W;
    const Vmin = 0.044 * SDS * I * W;
    const V = Math.max(Vraw, Vmin);
    const Ft = calcFt(T, V);
    const Vremain = V - Ft;
    const zTops = [];
    let acc = 0;
    for (const h of storyH) { acc += h; zTops.push(acc); }
    const wh = storyW.map((w, i) => w * zTops[i]);
    const sumWh = wh.reduce((s, x) => s + x, 0);
    const stories = storyW.map((w, i) => {
      const Fx = (sumWh > 0 ? Vremain * wh[i] / sumWh : 0) + (i === storyW.length - 1 ? Ft : 0);
      return { i: i + 1, z: zTops[i], w, wh: wh[i], Fx };
    });
    let Vacc = 0;
    for (let k = stories.length - 1; k >= 0; k--) {
      Vacc += stories[k].Fx; stories[k].Vstory = Vacc;
    }
    return { sys, T, Tcalc, Tuser: Tuser || null, SDS, SD1, T0, Ts,
      SaD: SaDval, R: sys.R, alphaY: sys.alphaY, Fu: Fuval,
      W, Vraw, Vmin, V, Ft, stories };
  }

  // ═══════���══════════════════════
  //  第四章 — 附屬構造物地震力 (式 4-1 ~ 4-3)
  // ═════════���════════════════════

  // 表 4-1: 建築構造物構材之 ap, Rp
  const TABLE_4_1 = [
    { name: '無筋磚造內部非結構牆',       ap: 1.0,  Rp: 1.25 },
    { name: '其餘牆體與隔間',             ap: 1.0,  Rp: 2.5  },
    { name: '懸臂式女兒牆及懸臂式內部非結構牆', ap: 2.5, Rp: 2.5 },
    { name: '懸臂式煙囪',                 ap: 2.5,  Rp: 2.5  },
    { name: '半懸臂式女兒牆 (重心以上支撐)', ap: 1.0, Rp: 2.5 },
    { name: '外部非結構牆',               ap: 1.0,  Rp: 2.5  },
    { name: '牆板接合扣件',               ap: 1.25, Rp: 1.0  },
    { name: '飾面 (允許變形)',             ap: 1.0,  Rp: 2.5  },
    { name: '飾面 (低變形)',               ap: 1.0,  Rp: 1.25 },
    { name: '屋面突出物 (不含構架延伸)',    ap: 2.5,  Rp: 3.5  },
    { name: '天花板',                      ap: 1.0,  Rp: 2.5  },
    { name: '貯物架與實驗室設備',          ap: 1.0,  Rp: 2.5  },
    { name: '招牌與廣告物',               ap: 2.5,  Rp: 2.5  },
    { name: '附屬物與裝飾物',             ap: 2.5,  Rp: 2.5  },
  ];

  // 表 4-2: 機電設備構材之 ap, Rp
  const TABLE_4_2 = [
    { name: '鍋爐及熱水器',               ap: 1.0,  Rp: 2.5  },
    { name: '自立式壓力容器',             ap: 2.5,  Rp: 2.5  },
    { name: '煙道與煙囪',                 ap: 2.5,  Rp: 2.5  },
    { name: '一般機械設備',               ap: 1.0,  Rp: 2.5  },
    { name: '非載客運輸設備',             ap: 2.5,  Rp: 2.5  },
    { name: '管線 (高變形接頭)',           ap: 1.0,  Rp: 3.5  },
    { name: '管線 (中變形接頭)',           ap: 1.0,  Rp: 2.5  },
    { name: '管線 (低變形接頭)',           ap: 1.0,  Rp: 1.25 },
    { name: '含隔振之空調設備',            ap: 2.5,  Rp: 2.5  },
    { name: '不含隔振之空調設備',          ap: 1.0,  Rp: 2.5  },
    { name: '升降機',                      ap: 1.0,  Rp: 2.5  },
    { name: '電扶梯',                      ap: 1.0,  Rp: 2.5  },
    { name: '自立式桁架塔',               ap: 2.5,  Rp: 2.5  },
    { name: '電力配送系統',               ap: 1.0,  Rp: 3.5  },
    { name: '電氣設備',                    ap: 1.0,  Rp: 2.5  },
    { name: '照明設備',                    ap: 1.0,  Rp: 1.25 },
  ];

  /**
   * 式 (4-2): 容許耐震韌性容量 Rpa
   * @param {number} Rp — 地震反應折減係數
   * @param {boolean} isTaipeiBasin — 是否為臺北盆地
   */
  function calcRpa(Rp, isTaipeiBasin) {
    return isTaipeiBasin ? 1 + (Rp - 1) / 2.0 : 1 + (Rp - 1) / 1.5;
  }

  /**
   * 式 (4-1): 附屬構造物水平地震力 Fph
   * @param {object} p
   *   SDS     — 工址短週期設計譜加速度 (g)
   *   Wp      — 構材重量 (tf)
   *   ap      — 共振放大係數
   *   Rp      — 地震反應折減係數
   *   Ip      — 構材用途係數
   *   hx      — 構材固定高度 (m)
   *   hn      — 建物總高度 (m)
   *   isTaipeiBasin — 是否為臺北盆地
   */
  function calcFph(p) {
    const { SDS, Wp, ap, Rp, Ip = 1.0, hx = 0, hn = 1, isTaipeiBasin = false } = p;
    const Rpa = calcRpa(Rp, isTaipeiBasin);
    const Fph_calc = 0.4 * SDS * Ip * (ap / Rpa) * (1 + 2 * hx / hn) * Wp;
    const Fph_max = 1.6 * SDS * Ip * Wp;
    const Fph_min = 0.3 * SDS * Ip * Wp;
    const Fph = Math.min(Fph_max, Math.max(Fph_min, Fph_calc));
    const controlled = Fph_calc > Fph_max ? 'max' : Fph_calc < Fph_min ? 'min' : 'calc';
    return { Fph, Fph_calc, Fph_max, Fph_min, Rpa, controlled, ap, Rp, Ip, hx, hn, SDS, Wp };
  }

  /**
   * 式 (4-3): 附屬構造物垂直地震力 Fpv
   * @param {number} Fph — 水平地震力
   * @param {boolean} isNearFault — 是否為近斷層區域
   */
  function calcFpv(Fph, isNearFault) {
    return isNearFault ? (2 / 3) * Fph : 0.5 * Fph;
  }

  // ═══════════════════════════════
  //  垂直地震力 (式 2-19, C2-10, C2-11)
  // ═══════════════════════════════

  /**
   * 式 (2-19): 垂直設計譜加速度
   * SaD_V = (1/2)*SaD (一般/臺北) 或 (2/3)*SaD (近斷層)
   */
  function calcSaDV(SaD, isNearFault) {
    return isNearFault ? (2 / 3) * SaD : 0.5 * SaD;
  }

  /**
   * 式 (C2-11a/b): 垂直方向 (SaD_V/Fuv)_m 修正
   * 一般：門檻 0.15 / 0.40
   * 近斷層：門檻 0.20 / 0.53
   */
  function calcSaFuM_V(ratio, isNearFault) {
    const lo = isNearFault ? 0.20 : 0.15;
    const hi = isNearFault ? 0.53 : 0.40;
    const c  = 0.18 * hi;  // continuity: 0.52*hi + c = 0.70*hi → c = 0.18*hi
    if (ratio >= hi)  return 0.70 * ratio;
    if (ratio >  lo)  return 0.52 * ratio + c;
    return ratio;
  }

  /**
   * 垂直地震力完整計算
   * @param {object} p
   *   SDS, SD1    — 工址設計譜加速度
   *   I           — 用途係數
   *   alphaY      — 結構系統地震力調整係數
   *   T           — 設計週期
   *   ToD         — 特徵週期
   *   isNearFault — 近斷層
   *   isTaipeiBasin — 臺北盆地
   *   W_slab      — 樓版系統重量 (tf)
   */
  function calcVerticalSeismic(p) {
    const { SDS, SD1, I, alphaY, T, ToD, isNearFault, isTaipeiBasin, W_slab } = p;
    const SaD = calcSa(T, SDS, SD1);
    const SaD_V = calcSaDV(SaD, isNearFault);

    // 垂直方向使用固定 Ra=3.0
    const Ra_V = 3.0;
    const Fuv = calcFu(Ra_V, T, ToD);
    const ratio = SaD_V / Fuv;
    const ratio_m = calcSaFuM_V(ratio, isNearFault);

    // 式(C2-10): 樓版/梁系統垂直地震力
    const VZ = (I / (1.4 * alphaY)) * ratio_m * W_slab;

    // 柱系統簡化係數 (式 C2-12)
    const col_coeff = isNearFault
      ? (0.80 * SDS * I / 3)
      : (0.40 * SDS * I / 2);

    return {
      SaD, SaD_V, Ra_V, Fuv,
      ratio, ratio_m,
      VZ, col_coeff,
      isNearFault, W_slab, I, alphaY, T, ToD, SDS
    };
  }

  // ═══════════════════════════════
  //  第五章 — 雜項工作物地震力 (式 5-1)
  // ═══════════════════════════════

  /** 表 5-1: 雜項工作物之韌性容量 R 與 αy */
  const TABLE_5_1 = [
    { name: '自立式桁架塔',           R: 3.5, alphaY: 1.0 },
    { name: '拉線式桁架塔',           R: 3.5, alphaY: 1.0 },
    { name: '鋼造煙囪',               R: 3.5, alphaY: 1.0 },
    { name: 'RC 造煙囪',              R: 2.0, alphaY: 1.0 },
    { name: '鋼造水塔 (支柱式)',       R: 2.5, alphaY: 1.0 },
    { name: 'RC 造水塔 (壁式)',        R: 2.0, alphaY: 1.0 },
    { name: '混凝土 / 磚造擋土牆',    R: 2.5, alphaY: 1.0 },
    { name: 'RC 圍牆',                R: 2.0, alphaY: 1.0 },
    { name: '磚造圍牆',               R: 1.5, alphaY: 1.0 },
    { name: '招牌及廣告牌',           R: 2.5, alphaY: 1.0 },
    { name: '獨立式機電設備',          R: 2.5, alphaY: 1.0 },
    { name: '太陽能板支架',           R: 2.5, alphaY: 1.0 },
    { name: '其他 (保守)',             R: 1.5, alphaY: 1.0 },
  ];

  /**
   * 雜項工作物地震力計算 (式 5-1)
   * 同建築物公式但使用表 5-1 的 R/αy
   * @param {object} p
   *   typeIdx     — TABLE_5_1 索引 (或 -1 自訂)
   *   R, alphaY   — 自訂時使用
   *   SsD, S1D, SsM, S1M — 震區參數
   *   siteClass   — 地盤分類
   *   I           — 用途係數
   *   W           — 結構物重量 (tf)
   *   hn          — 結構物高度 (m)
   *   T_user      — 使用者輸入週期 (sec), 0 = 剛性
   *   isTaipeiBasin
   */
  function calcMiscSeismic(p) {
    const item = p.typeIdx >= 0 ? TABLE_5_1[p.typeIdx] : null;
    const R      = item ? item.R      : (p.R || 1.5);
    const alphaY = item ? item.alphaY : (p.alphaY || 1.0);
    const I      = p.I || 1.0;
    const W      = p.W || 0;
    const hn     = p.hn || 1;
    const isTB   = p.isTaipeiBasin || false;

    // 工址係數
    const site = calcSiteCoeff(p.siteClass || 2, p.SsD, p.S1D, p.SsM, p.S1M);
    const { ToD, ToM } = calcTo(site.SDS, site.SD1, site.SMS, site.SM1);

    // 週期: 使用者輸入或假設剛性 (T=0)
    const T = (p.T_user && p.T_user > 0) ? p.T_user : 0;

    // Ra, Fu
    const Ra  = calcRa(R, isTB);
    const Fu  = calcFu(Ra, T, ToD);
    const FuM = calcFuM(R, T, ToM);

    // SaD, SaM
    const SaD = calcSa(T, site.SDS, site.SD1);
    const SaM = calcSa(T, site.SMS, site.SM1);

    // VD (式 2-3)
    const vd = calcVD(I, alphaY, SaD, Fu, W);

    // V* (式 2-13a)
    const vs = calcVstar(I, alphaY, Fu, SaD, W, isTB);

    // VM (式 2-13c)
    const vm = calcVM(I, alphaY, SaM, FuM, W);

    const Vdesign = Math.max(vd.VD, vs.Vstar, vm.VM);
    let controlledBy = 'VD';
    if (Vdesign === vs.Vstar) controlledBy = 'V*';
    if (Vdesign === vm.VM) controlledBy = 'VM';

    // 震力係數 = V/W
    const Cs = W > 0 ? Vdesign / W : 0;

    return {
      typeName: item ? item.name : '自訂',
      R, alphaY, I, W, hn, T,
      site, ToD, ToM, Ra, Fu, FuM,
      SaD, SaM,
      VD: vd.VD, VD_ratio: vd.ratio, VD_ratio_m: vd.ratio_m,
      Vstar: vs.Vstar, Vs_ratio: vs.ratio, Vs_ratio_m: vs.ratio_m,
      VM: vm.VM, VM_ratio: vm.ratio, VM_ratio_m: vm.ratio_m,
      Vdesign, controlledBy, Cs,
      isTaipeiBasin: isTB
    };
  }

  // ── 匯出 ──
  global.Seismic = {
    SYSTEMS,
    IMPORTANCE,
    FA_TABLE, FA_SS,
    FV_TABLE, FV_S1,
    getFa,
    getFv,
    calcSiteCoeff,
    calcTo,
    calcPeriod,
    calcTdesign,
    calcSa,
    calcRa,
    calcFu,
    calcFuM,
    calcSaFuM,
    calcVD,
    calcVstar,
    calcVM,
    calcFt,
    calcVerticalDist,
    calcSubK,
    calcFullSeismic,
    // 第四章 — 附屬構造物
    TABLE_4_1,
    TABLE_4_2,
    calcRpa,
    calcFph,
    calcFpv,
    // 垂直地震力
    calcSaDV,
    calcSaFuM_V,
    calcVerticalSeismic,
    // 第五章 — 雜項工作物
    TABLE_5_1,
    calcMiscSeismic,
    // 向後相容
    calcStaticSeismic,
  };
})(window);
