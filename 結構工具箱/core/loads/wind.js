/* core/loads/wind.js — v2.0
 * 台灣建築物耐風設計規範 — 完整計算引擎
 * 依據：建築物耐風設計規範及解說 (107 年版)
 *
 * 單位：高度 z (m)、風速 V (m/s)、速度壓 q (kgf/m²)、風力 F (kgf)
 *
 * v2.0 更新：
 *   ‧ 修正 Table 2.2 地況參數 (α, zg, zmin 用 10 分鐘平均值)
 *   ‧ 修正 Kz 公式 → K(z) = 2.774·(z/zg)^(2α)
 *   ‧ 修正陣風因子 G → 剛性預設 1.88 (Eq 2.9)；柔性完整 Gf (Eq 2.13)
 *   ‧ 完整 R² = (1/β)·Rn·Rh·(0.53·RB+0.47·RL) (Eq 2.15-2.18)
 *   ‧ 新增橫風向風力 WLz (Eq 2.21/2.22)
 *   ‧ 新增扭矩 MTz (Eq 2.23/2.24)
 *   ‧ 新增基本設計風速詳細表 (至鄉鎮區層級)
 *   ‧ 新增用途係數 5 分類
 */
(function (global) {
  'use strict';

  // ═══════════════════════════════
  //  基本設計風速 V10(C) (m/s)
  //  107 年版 §2.4 依行政區詳細劃分
  //  此處以主要縣市代表值簡化（同一縣市內有多風速區者取較大值）
  // ═══════════════════════════════
  const BASIC_WIND_SPEED = {
    '花蓮市/吉安': 47.5, '恆春/滿州': 47.5,
    '基隆市': 42.5,
    '臺北市': 42.5, '新北市(北區)': 42.5,
    '新北市(南區)': 37.5, '桃園市': 37.5,
    '高雄市': 37.5, '臺南市(沿海)': 37.5, '屏東縣': 37.5,
    '宜蘭縣': 37.5, '臺東縣': 37.5,
    '花蓮縣': 42.5,
    '新竹市': 32.5, '新竹縣': 32.5,
    '苗栗縣': 32.5, '臺中市': 32.5,
    '臺南市(內陸)': 32.5,
    '彰化縣(沿海)': 32.5,
    '雲林縣(沿海)': 32.5,
    '嘉義市': 27.5, '嘉義縣': 27.5,
    '南投縣': 27.5, '彰化縣(內陸)': 27.5,
    '雲林縣(內陸)': 27.5,
    '南投縣(山區)': 22.5,
    '澎湖縣': 33.0, '金門縣': 35.0, '馬祖': 42.0,
    '蘭嶼/綠島': 65.0, '琉球': 40.0,
    // 簡化常用城市 (取轄區代表值或最大值)
    '臺北市(簡)': 42.5, '新北市': 37.5,
    '桃園市(簡)': 37.5, '臺中市(簡)': 32.5,
    '臺南市': 32.5, '高雄市(簡)': 37.5,
  };

  // ═══════════════════════════════
  //  常用城市快捷 (UI 用) — 依 107 規範 §2.4 詳分沿海/內陸/山區
  //  保留「臺北市」作為各工具預設值
  // ═══════════════════════════════
  const CITY_QUICK = {
    // —— 北部 ——
    '臺北市':         42.5,
    '新北市(北區)':   42.5,
    '新北市(南區)':   37.5,
    '基隆市':         42.5,
    '桃園市':         37.5,
    '新竹市':         32.5,
    '新竹縣':         32.5,
    '苗栗縣':         32.5,
    // —— 中部 ——
    '臺中市':         32.5,
    '彰化縣(沿海)':   32.5,
    '彰化縣(內陸)':   27.5,
    '雲林縣(沿海)':   32.5,
    '雲林縣(內陸)':   27.5,
    '南投縣':         27.5,
    '南投縣(山區)':   22.5,
    // —— 南部 ——
    '嘉義市':         27.5,
    '嘉義縣':         27.5,
    '臺南市(沿海)':   37.5,
    '臺南市(內陸)':   32.5,
    '高雄市':         37.5,
    '屏東縣':         37.5,
    '恆春/滿州':      47.5,
    // —— 東部 ——
    '宜蘭縣':         37.5,
    '花蓮縣':         42.5,
    '花蓮市/吉安':    47.5,
    '臺東縣':         37.5,
    // —— 離島 ——
    '澎湖縣':         33.0,
    '金門縣':         35.0,
    '連江縣(馬祖)':   42.0,
    '蘭嶼/綠島':      65.0,
    '小琉球':         40.0,
  };

  // ═══════════════════════════════
  //  表 2.2 地況參數 (10 分鐘平均)
  // ═══════════════════════════════
  const TERRAIN = {
    A: { name: '地況 A (大城市市中心)', alpha: 0.32, zg: 500, b: 0.45, c: 0.45, ell: 55,  eps: 0.50, zmin: 18 },
    B: { name: '地況 B (都市郊區/小城市)', alpha: 0.25, zg: 400, b: 0.62, c: 0.30, ell: 98,  eps: 0.33, zmin: 9  },
    C: { name: '地況 C (開闊平坦地)',     alpha: 0.15, zg: 300, b: 0.94, c: 0.20, ell: 152, eps: 0.20, zmin: 4.5 },
  };

  // ═══════════════════════════════
  //  用途係數 I (§2.5 表 2.4 — 107 年版)
  //  第一類：對大眾安全有重大影響者（核能、爆裂物等）I = 1.15
  //  第二類：醫院、消防、警察、救災等重要設施         I = 1.10
  //  第三類：學校、商場、車站等公眾使用建築物         I = 1.10
  //  第四類：一般建築物                              I = 1.00
  //  第五類：附屬構造物、臨時建築                    I = 0.95
  // ═══════════════════════════════
  const IMPORTANCE = {
    I:   { name: '第一類 (極重要 — 核能 / 危險物品)', factor: 1.15 },
    II:  { name: '第二類 (重要 — 醫院 / 消防)',        factor: 1.10 },
    III: { name: '第三類 (公眾使用 — 學校 / 商場)',    factor: 1.10 },
    IV:  { name: '第四類 (一般建築)',                  factor: 1.00 },
    V:   { name: '第五類 (臨時 / 次要 / 附屬)',       factor: 0.95 },
  };

  // ═══════════════════════════════
  //  Kz — 風速壓地況係數 (Eq 2.7)
  //  K(z) = 2.774 · (z/zg)^(2α)
  //  z < zmin → 以 zmin 計算
  // ═══════════════════════════════
  function calcKz(z, terrain) {
    const t = TERRAIN[terrain] || TERRAIN.C;
    const zUse = Math.max(z, t.zmin);
    return 2.774 * Math.pow(zUse / t.zg, 2 * t.alpha);
  }

  // ═══════════════════════════════
  //  qz — 速度壓 (Eq 2.6)
  //  q(z) = 0.06 · K(z) · Kzt · [I·V10(C)]²
  // ═══════════════════════════════
  function calcQz(z, V, terrain, I, Kzt) {
    if (Kzt == null) Kzt = 1.0;
    const Kz = calcKz(z, terrain);
    const qz = 0.06 * Kz * Kzt * I * I * V * V;
    return { Kz, qz };
  }

  // ═══════════════════════════════
  //  Kzt — 地形係數 (Eq 2.8)
  //  Kzt = (1 + K1·K2·K3)²
  // ═══════════════════════════════
  // K1 查表 2.3(a)，K2 = (1-|x|/(μLh))，K3 = e^(-γz/Lh)
  const KZT_PARAMS = {
    ridge: { K1_fA: 1.30, K1_fC: 1.45, mu_up: 3, mu_dn: 1.5, gamma: 1.5 },
    cliff: { K1_fA: 0.75, K1_fC: 0.85, mu_up: 2.5, mu_dn: 1.5, gamma: 4   },
    hill:  { K1_fA: 0.95, K1_fC: 1.05, mu_up: 4,   mu_dn: 1.5, gamma: 1.5 },
  };

  /**
   * 地形係數 Kzt (Eq 2.8)
   * @param {string} topoType  'ridge'|'cliff'|'hill'|'flat'
   * @param {string} terrainGrp 'AB'|'C'  (地況 A/B 或 C)
   * @param {number} H  山丘高度 (m)
   * @param {number} Lh 山丘半長 (m), 自頂至H/2處之水平距離
   * @param {number} x  距山頂水平距離 (m)，上風側為負
   * @param {number} z  離地面高度 (m)
   */
  function calcKzt(topoType, terrainGrp, H, Lh, x, z) {
    if (topoType === 'flat' || !topoType) return 1.0;
    const p = KZT_PARAMS[topoType];
    if (!p) return 1.0;
    const HL = Math.min(H / Lh, 0.50);
    const K1f = terrainGrp === 'C' ? p.K1_fC : p.K1_fA;
    const K1 = K1f * HL;
    // K2: 水平衰減
    const mu = x < 0 ? p.mu_up : p.mu_dn;
    const Lh_use = HL >= 0.50 ? 2 * H : Lh;
    const K2 = Math.max(0, 1 - Math.abs(x) / (mu * Lh_use));
    // K3: 垂直衰減
    const K3 = Math.exp(-p.gamma * z / Lh_use);
    return Math.pow(1 + K1 * K2 * K3, 2);
  }

  // ═══════════════════════════════
  //  紊流強度 Iz (Eq 2.10)
  //  Iz̄ = c · (10/z̄)^(1/6)
  // ═══════════════════════════════
  function calcIz(z, terrain) {
    const t = TERRAIN[terrain] || TERRAIN.C;
    const zBar = Math.max(z, t.zmin);
    return t.c * Math.pow(10 / zBar, 1 / 6);
  }

  // ═══════════════════════════════
  //  紊流積分尺度 Lz̄ (Eq 2.12)
  //  Lz̄ = ℓ · (z̄/10)^ε̄
  // ═══════════════════════════════
  function calcLz(z, terrain) {
    const t = TERRAIN[terrain] || TERRAIN.C;
    const zBar = Math.max(z, t.zmin);
    return t.ell * Math.pow(zBar / 10, t.eps);
  }

  // ═══════════════════════════════
  //  背景反應 Q² (Eq 2.11)
  // ═══════════════════════════════
  function calcQ2(B, h, Lz) {
    return 1 / (1 + 0.63 * Math.pow((B + h) / Lz, 0.63));
  }

  // ═══════════════════════════════
  //  V̄z — 等效高度之平均風速 (C2.19)
  //  Vz̄ = b·(z̄/10)^α · V10(C)
  // ═══════════════════════════════
  function calcVzBar(z, V, terrain) {
    const t = TERRAIN[terrain] || TERRAIN.C;
    const zBar = Math.max(0.6 * z, t.zmin);  // z̄ for Gf
    return t.b * Math.pow(zBar / 10, t.alpha) * V;
  }

  function calcMeanWindSpeed(z, V, terrain) {
    const t = TERRAIN[terrain] || TERRAIN.C;
    const zUse = Math.max(z, t.zmin);
    return t.b * Math.pow(zUse / 10, t.alpha) * V;
  }

  // ═══════════════════════════════
  //  陣風反應因子 G — 剛性結構 (Eq 2.9)
  //  G = 1.927 · (1 + 1.7·gQ·Iz·Q) / (1 + 1.7·gV·Iz)
  //  gQ = gV = 3.4
  //  或直接取 1.88
  // ═══════════════════════════════
  const G_RIGID_DEFAULT = 1.88;

  function calcGustRigid(h, B, terrain) {
    const zBar = Math.max(0.6 * h, (TERRAIN[terrain] || TERRAIN.C).zmin);
    const Iz = calcIz(zBar, terrain);
    const Lz = calcLz(zBar, terrain);
    const Q2 = calcQ2(B, h, Lz);
    const Q  = Math.sqrt(Q2);
    const gQ = 3.4, gV = 3.4;
    const G = 1.927 * (1 + 1.7 * gQ * Iz * Q) / (1 + 1.7 * gV * Iz);
    return { G, Iz, Lz, Q2, Q, zBar };
  }

  // ═══════════════════════════════
  //  共振反應因子 Rj (Eq 2.18)
  //  Rj = (1/η - 1/(2η²)(1-e^(-2η))) for η>0; Rj=1 for η=0
  // ═══════════════════════════════
  function _Rj(eta) {
    if (eta <= 0) return 1.0;
    return 1 / eta - 1 / (2 * eta * eta) * (1 - Math.exp(-2 * eta));
  }

  // ═══════════════════════════════
  //  陣風反應因子 Gf — 柔性結構 (Eq 2.13)
  // ═══════════════════════════════
  /**
   * @param {object} p
   *   fn    基本自然頻率 (Hz)
   *   h     建物總高 (m)
   *   B     迎風寬 (m)
   *   L     順風深 (m)
   *   terrain 'A'|'B'|'C'
   *   beta  結構阻尼比
   *   V     基本設計風速 V10(C) (m/s)
   */
  function calcGustFlex(p) {
    const { fn, h, B, L, terrain, beta = 0.02, V } = p;
    const t = TERRAIN[terrain] || TERRAIN.C;
    const zBar = Math.max(0.6 * h, t.zmin);
    const Iz = calcIz(zBar, terrain);
    const Lz = calcLz(zBar, terrain);
    const Q2 = calcQ2(B, h, Lz);

    // V̄z̄ (Eq C2.19)
    const Vz = t.b * Math.pow(zBar / 10, t.alpha) * V;

    // Rn (Eq 2.16)
    const N = fn * Lz / Vz;  // Eq 2.17
    const Rn = 7.47 * N / Math.pow(1 + 10.3 * N, 5 / 3);

    // Rh, RB, RL (Eq 2.18)
    const eta_h = 4.6 * fn * h / Vz;
    const eta_B = 4.6 * fn * B / Vz;
    const eta_L = 15.4 * fn * L / Vz;
    const Rh = _Rj(eta_h);
    const RB = _Rj(eta_B);
    const RL = _Rj(eta_L);

    // R² (Eq 2.15)
    const R2 = (1 / beta) * Rn * Rh * (0.53 * RB + 0.47 * RL);

    // gR (Eq 2.14)
    const lnT = Math.log(3600 * Math.max(fn, 0.1));
    const gR = Math.sqrt(2 * lnT) + 0.577 / Math.sqrt(2 * lnT);
    const gQ = 3.4, gV = 3.4;

    // Gf (Eq 2.13)
    const num = 1 + 1.7 * Iz * Math.sqrt(gQ * gQ * Q2 + gR * gR * R2);
    const den = 1 + 1.7 * gV * Iz;
    const Gf = 1.927 * num / den;

    return { Gf, Iz, Lz, Vz, Q2, R2, Rn, Rh, RB, RL, N, gR, zBar, eta_h, eta_B, eta_L };
  }

  // ═══════════════════════════════
  //  風壓係數 Cp (§2.8, Table 2.4)
  // ═══════════════════════════════
  // 迎風面固定 +0.8
  // 背風面依 L/B 內插
  // 側風面固定 -0.7
  function leewardCp(L, B) {
    const r = L / Math.max(B, 1e-6);
    if (r <= 1) return -0.5;
    if (r >= 4) return -0.2;
    if (r <= 2) return -0.5 + (r - 1) * (-0.3 - (-0.5));
    return -0.3 + (r - 2) / 2 * (-0.2 - (-0.3));
  }
  const Cp_WINDWARD  = 0.8;
  const Cp_SIDEWALL  = -0.7;
  const Cp_FLAT_ROOF = -0.7;

  // ═══════════════════════════════
  //  內風壓係數 (GCpi) (Table 2.17)
  // ═══════════════════════════════
  const GCPI = {
    enclosed: 0.375,   // ±0.375 (=0.18×2.083 from ASCE conversion)
    partial:  1.145,   // ±1.145 (=0.55×2.083)
    open:     0.00,
  };
  // Note: 107 code Table 2.17 values are already in 10-min system

  // ═══════════════════════════════
  //  開放式建築物斜屋頂局部構材及外部被覆物淨風壓係數 Cpn (圖 3.3)
  //  key: roofType -> blockage -> theta -> areaBand -> zone -> [pos, neg]
  //  areaBand: small = A < a², medium = a² < A <= 4a², large = A > 4a²
  // ═══════════════════════════════
  const OPEN_ROOF_CPN = {
    monoslope: {
      unblocked: {
        0: {
          small:  { zone3: [2.4, -3.3], zone2: [1.8, -1.7], zone1: [1.2, -1.1] },
          medium: { zone3: [1.8, -1.7], zone2: [1.8, -1.7], zone1: [1.2, -1.1] },
          large:  { zone3: [1.2, -1.1], zone2: [1.2, -1.1], zone1: [1.2, -1.1] },
        },
        7.5: {
          small:  { zone3: [3.2, -4.2], zone2: [2.4, -2.1], zone1: [1.6, -1.4] },
          medium: { zone3: [2.4, -2.1], zone2: [2.4, -2.1], zone1: [1.6, -1.4] },
          large:  { zone3: [1.6, -1.4], zone2: [1.6, -1.4], zone1: [1.6, -1.4] },
        },
        15: {
          small:  { zone3: [3.6, -3.8], zone2: [2.7, -2.9], zone1: [1.8, -1.9] },
          medium: { zone3: [2.7, -2.9], zone2: [2.7, -2.9], zone1: [1.8, -1.9] },
          large:  { zone3: [1.8, -1.9], zone2: [1.8, -1.9], zone1: [1.8, -1.9] },
        },
        30: {
          small:  { zone3: [5.2, -5.0], zone2: [3.9, -3.8], zone1: [2.6, -2.5] },
          medium: { zone3: [3.9, -3.8], zone2: [3.9, -3.8], zone1: [2.6, -2.5] },
          large:  { zone3: [2.6, -2.5], zone2: [2.6, -2.5], zone1: [2.6, -2.5] },
        },
        45: {
          small:  { zone3: [5.2, -4.6], zone2: [3.9, -3.5], zone1: [2.6, -2.3] },
          medium: { zone3: [3.9, -3.5], zone2: [3.9, -3.5], zone1: [2.6, -2.3] },
          large:  { zone3: [2.6, -2.3], zone2: [2.6, -2.3], zone1: [2.6, -2.3] },
        },
      },
      blocked: {
        0: {
          small:  { zone3: [1.0, -3.6], zone2: [0.8, -1.8], zone1: [0.5, -1.2] },
          medium: { zone3: [0.8, -1.8], zone2: [0.8, -1.8], zone1: [0.5, -1.2] },
          large:  { zone3: [0.5, -1.2], zone2: [0.5, -1.2], zone1: [0.5, -1.2] },
        },
        7.5: {
          small:  { zone3: [1.6, -5.1], zone2: [1.2, -2.6], zone1: [0.8, -1.7] },
          medium: { zone3: [1.2, -2.6], zone2: [1.2, -2.6], zone1: [0.8, -1.7] },
          large:  { zone3: [0.8, -1.7], zone2: [0.8, -1.7], zone1: [0.8, -1.7] },
        },
        15: {
          small:  { zone3: [2.4, -4.2], zone2: [1.8, -3.2], zone1: [1.2, -2.1] },
          medium: { zone3: [1.8, -3.2], zone2: [1.8, -3.2], zone1: [1.2, -2.1] },
          large:  { zone3: [1.2, -2.1], zone2: [1.2, -2.1], zone1: [1.2, -2.1] },
        },
        30: {
          small:  { zone3: [3.2, -4.6], zone2: [2.4, -3.5], zone1: [1.6, -2.3] },
          medium: { zone3: [2.4, -3.5], zone2: [2.4, -3.5], zone1: [1.6, -2.3] },
          large:  { zone3: [1.6, -2.3], zone2: [1.6, -2.3], zone1: [1.6, -2.3] },
        },
        45: {
          small:  { zone3: [4.2, -3.8], zone2: [3.2, -2.9], zone1: [2.1, -1.9] },
          medium: { zone3: [3.2, -2.9], zone2: [3.2, -2.9], zone1: [2.1, -1.9] },
          large:  { zone3: [2.1, -1.9], zone2: [2.1, -1.9], zone1: [2.1, -1.9] },
        },
      },
    },
    gable: {
      unblocked: {
        0: {
          small:  { zone3: [2.4, -3.3], zone2: [1.8, -1.7], zone1: [1.2, -1.1] },
          medium: { zone3: [1.8, -1.7], zone2: [1.8, -1.7], zone1: [1.2, -1.1] },
          large:  { zone3: [1.2, -1.1], zone2: [1.2, -1.1], zone1: [1.2, -1.1] },
        },
        7.5: {
          small:  { zone3: [2.2, -3.6], zone2: [1.7, -1.8], zone1: [1.1, -1.2] },
          medium: { zone3: [1.7, -1.8], zone2: [1.7, -1.8], zone1: [1.1, -1.2] },
          large:  { zone3: [1.1, -1.2], zone2: [1.1, -1.2], zone1: [1.1, -1.2] },
        },
        15: {
          small:  { zone3: [2.2, -2.2], zone2: [1.7, -1.7], zone1: [1.1, -1.1] },
          medium: { zone3: [1.7, -1.7], zone2: [1.7, -1.7], zone1: [1.1, -1.1] },
          large:  { zone3: [1.1, -1.1], zone2: [1.1, -1.1], zone1: [1.1, -1.1] },
        },
        30: {
          small:  { zone3: [2.6, -1.8], zone2: [2.0, -1.4], zone1: [1.3, -0.9] },
          medium: { zone3: [2.0, -1.4], zone2: [2.0, -1.4], zone1: [1.3, -0.9] },
          large:  { zone3: [1.3, -0.9], zone2: [1.3, -0.9], zone1: [1.3, -0.9] },
        },
        45: {
          small:  { zone3: [2.2, -1.6], zone2: [1.7, -1.2], zone1: [1.1, -0.8] },
          medium: { zone3: [1.7, -1.2], zone2: [1.7, -1.2], zone1: [1.1, -0.8] },
          large:  { zone3: [1.1, -0.8], zone2: [1.1, -0.8], zone1: [1.1, -0.8] },
        },
      },
      blocked: {
        0: {
          small:  { zone3: [1.0, -3.6], zone2: [0.8, -1.8], zone1: [0.5, -1.2] },
          medium: { zone3: [0.8, -1.8], zone2: [0.8, -1.8], zone1: [0.5, -1.2] },
          large:  { zone3: [0.5, -1.2], zone2: [0.5, -1.2], zone1: [0.5, -1.2] },
        },
        7.5: {
          small:  { zone3: [1.0, -5.1], zone2: [0.8, -2.6], zone1: [0.5, -1.7] },
          medium: { zone3: [0.8, -2.6], zone2: [0.8, -2.6], zone1: [0.5, -1.7] },
          large:  { zone3: [0.5, -1.7], zone2: [0.5, -1.7], zone1: [0.5, -1.7] },
        },
        15: {
          small:  { zone3: [1.0, -3.2], zone2: [0.8, -2.4], zone1: [0.5, -1.6] },
          medium: { zone3: [0.8, -2.4], zone2: [0.8, -2.4], zone1: [0.5, -1.6] },
          large:  { zone3: [0.5, -1.6], zone2: [0.5, -1.6], zone1: [0.5, -1.6] },
        },
        30: {
          small:  { zone3: [1.0, -2.4], zone2: [0.8, -1.8], zone1: [0.5, -1.2] },
          medium: { zone3: [0.8, -1.8], zone2: [0.8, -1.8], zone1: [0.5, -1.2] },
          large:  { zone3: [0.5, -1.2], zone2: [0.5, -1.2], zone1: [0.5, -1.2] },
        },
        45: {
          small:  { zone3: [1.0, -2.4], zone2: [0.8, -1.8], zone1: [0.5, -1.2] },
          medium: { zone3: [0.8, -1.8], zone2: [0.8, -1.8], zone1: [0.5, -1.2] },
          large:  { zone3: [0.5, -1.2], zone2: [0.5, -1.2], zone1: [0.5, -1.2] },
        },
      },
    },
  };

  // ═══════════════════════════════
  //  橫風向風力 WLz (Eq 2.21 / 2.22)
  // ═══════════════════════════════
  /**
   * 簡化橫風向 (h/√BL < 3): WLz = 0.87·√(L/B)·WDz
   * @param {number} WDz 同高度順風向風力
   * @param {number} L   順風深
   * @param {number} B   迎風寬
   */
  function calcCrossWindSimple(WDz, L, B) {
    return 0.87 * Math.sqrt(L / B) * WDz;
  }

  // ═══════════════════════════════
  //  扭矩 MTz (Eq 2.23)
  //  h/√BL < 3: MTz = 0.28·(B·WDz)
  // ═══════════════════════════════
  function calcTorsionSimple(WDz, B) {
    return 0.28 * B * WDz;
  }

  function calcPeakFactorForDuration(f) {
    const ff = Math.max(f, 0.1);
    const x = 2 * Math.log(3600 * ff);
    return Math.sqrt(x) + 0.577 / Math.sqrt(x);
  }

  function calcCrossWindResonanceFactor(L, B, fa, Vh) {
    const r = L / Math.max(B, 1e-6);
    const nStar = fa * B / Math.max(Vh, 1e-9);
    const n1 = 0.12 / Math.pow(1 + 0.38 * Math.pow(r, 2), 0.89);
    const n2 = 0.56 / Math.pow(r, 0.85);
    const beta1 = (
      (Math.pow(r, 4) + 2.3 * Math.pow(r, 2)) /
      (2.4 * Math.pow(r, 4) - 9.2 * Math.pow(r, 3) + 18 * Math.pow(r, 2) + 9.5 * r - 0.15)
    ) + 0.12 / r;
    const beta2 = 0.28 * Math.pow(r, -0.34);
    const terms = [
      { k: 0.85, beta: beta1, n: n1 },
      { k: 0.02, beta: beta2, n: n2 },
    ];
    const S = r < 3 ? 1 : 2;
    let SL = 0;
    for (let i = 0; i < S; i++) {
      const term = terms[i];
      const nr = nStar / term.n;
      const num = (4 * term.k * (1 + 0.6 * term.beta) * term.beta / Math.PI) * (nr * nr);
      const den = Math.pow(1 - nr * nr, 2) + 4 * term.beta * term.beta * nr * nr;
      SL += num / den;
    }
    const RLR = Math.PI * SL / 4;
    return { r, nStar, n1, n2, beta1, beta2, S, SL, RLR };
  }

  function calcTorsionResonanceFactor(L, B, ft, Vh) {
    const r = L / Math.max(B, 1e-6);
    const LBL = Math.max(B, L);
    const Ustar = Vh / (Math.max(ft, 1e-9) * Math.sqrt(B * L));
    const ktLow = ((-1.1 * r + 0.97) / (r * r + 0.85 * r + 3.3)) + 0.17;
    const ktHigh = ((0.077 * r - 0.16) / (r * r - 0.96 * r + 0.42)) + (0.35 / r) + 0.095;
    const betaLow = ((r + 3.6) / (r * r - 5.1 * r + 9.1)) + (0.14 / r) + 0.14;
    const betaHigh = ((0.44 * r * r - 0.0064) / (Math.pow(r, 4) - 0.26 * r * r + 0.1)) + 0.2;
    let KT, betaT;
    if (Ustar <= 4.5) {
      KT = ktLow;
      betaT = betaLow;
    } else if (Ustar >= 6) {
      KT = ktHigh;
      betaT = betaHigh;
    } else {
      const t = (Ustar - 4.5) / (6 - 4.5);
      KT = ktLow + (ktHigh - ktLow) * t;
      betaT = betaLow + (betaHigh - betaLow) * t;
    }
    const RTRbase = 0.036 * KT * KT * Math.pow(Ustar, 2 * betaT) * (L * Math.pow(B * B + L * L, 2)) / (LBL * LBL * Math.pow(B, 3));
    let RTR = RTRbase;
    if (Ustar > 4.5 && Ustar < 6) {
      const R45 = 0.036 * ktLow * ktLow * Math.pow(4.5, 2 * betaLow) * (L * Math.pow(B * B + L * L, 2)) / (LBL * LBL * Math.pow(B, 3));
      const R6 = 0.036 * ktHigh * ktHigh * Math.pow(6, 2 * betaHigh) * (L * Math.pow(B * B + L * L, 2)) / (LBL * LBL * Math.pow(B, 3));
      RTR = R45 * Math.exp(3.48 * Math.log(R6 / R45) * Math.log(Ustar / 4.5));
    }
    return { r, LBL, Ustar, KT, betaT, RTR, ktLow, ktHigh, betaLow, betaHigh };
  }

  function calcMwfrsPressureCases(qExt, Cp, qInt, GCpi) {
    const casePos = qExt * Cp - qInt * GCpi;
    const caseNeg = qExt * Cp + qInt * GCpi;
    return {
      posGCpi: GCpi,
      negGCpi: -GCpi,
      casePos,
      caseNeg,
      max: Math.max(casePos, caseNeg),
      min: Math.min(casePos, caseNeg),
    };
  }

  function _interp1(points, x) {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [x2, y2] = points[i];
      const [x1, y1] = points[i - 1];
      if (x <= x2) return y1 + (y2 - y1) * ((x - x1) / (x2 - x1));
    }
    return points[points.length - 1][1];
  }

  function _roofPerpRowEnvelope(rowKey, theta) {
    const t = Math.max(0, theta);
    const commonMax = 0.01 * t;
    if (rowKey === 0.3) {
      const pos = _interp1([[0, -0.7], [10, 0.2], [15, 0.2], [20, 0.2], [30, 0.3], [40, 0.4], [50, 0.5], [60, 0.6]], t);
      const neg = _interp1([[0, -0.7], [10, -0.9], [15, -0.9], [20, 0.2], [30, 0.3], [40, 0.4], [50, 0.5], [60, 0.6]], t);
      return { max: Math.max(pos, neg, commonMax), min: Math.min(pos, neg) };
    }
    const rows = {
      0.5: [[0, -0.7], [10, -0.9], [15, -0.9], [20, -0.75], [30, -0.2], [40, 0.3], [50, 0.5], [60, 0.6]],
      1.0: [[0, -0.7], [10, -0.9], [15, -0.9], [20, -0.75], [30, -0.9], [40, 0.35], [50, 0.5], [60, 0.6]],
      1.5: [[0, -0.7], [10, -0.9], [15, -0.9], [20, -0.9], [30, -0.9], [40, -0.35], [50, 0.2], [60, 0.6]],
    };
    const cp = _interp1(rows[rowKey], t);
    return { max: Math.max(cp, commonMax), min: cp };
  }

  function lookupMwfrsRoofCp(p) {
    const {
      roofType = 'flat',
      windToRidge = 'perpendicular',
      theta = 0,
      h,
      L,
      B,
    } = p;
    const t = Math.max(0, theta);
    const perpRatio = h / Math.max(L, 1e-6);
    const parallelRatio = Math.max(h / Math.max(L, 1e-6), h / Math.max(B, 1e-6));
    if (roofType === 'flat') {
      const perpEnv = _roofPerpRowEnvelope(Math.max(perpRatio, 0.3) <= 0.3 ? 0.3 : perpRatio <= 0.5 ? 0.5 : perpRatio <= 1.0 ? 1.0 : 1.5, t);
      const parallelCp = parallelRatio <= 2.5 ? -0.7 : -0.8;
      return {
        supported: true,
        reference: 'Table 2.5',
        ratioUsed: parallelRatio,
        ratioLabel: 'max(h/L, h/B)',
        windward: {
          candidates: [...perpEnv.max === perpEnv.min ? [perpEnv.max] : [perpEnv.min, perpEnv.max], parallelCp],
          maxCp: Math.max(perpEnv.max, parallelCp),
          minCp: Math.min(perpEnv.min, parallelCp),
        },
        leeward: {
          candidates: [-0.7, parallelCp],
          maxCp: Math.max(-0.7, parallelCp),
          minCp: Math.min(-0.7, parallelCp),
        },
      };
    }
    if (windToRidge === 'parallel') {
      const cp = parallelRatio <= 2.5 ? -0.7 : -0.8;
      return {
        supported: true,
        reference: 'Table 2.5',
        ratioUsed: parallelRatio,
        ratioLabel: 'max(h/L, h/B)',
        windward: { candidates: [cp], maxCp: cp, minCp: cp },
        leeward: { candidates: [cp], maxCp: cp, minCp: cp },
      };
    }

    const rows = [0.3, 0.5, 1.0, 1.5];
    const r = Math.max(perpRatio, rows[0]);
    let low = rows[0], high = rows[rows.length - 1];
    if (r <= rows[0]) {
      low = high = rows[0];
    } else if (r >= rows[rows.length - 1]) {
      low = high = rows[rows.length - 1];
    } else {
      for (let i = 1; i < rows.length; i++) {
        if (r <= rows[i]) {
          low = rows[i - 1];
          high = rows[i];
          break;
        }
      }
    }
    const loEnv = _roofPerpRowEnvelope(low, t);
    const hiEnv = _roofPerpRowEnvelope(high, t);
    const f = low === high ? 0 : (r - low) / (high - low);
    const windwardMax = loEnv.max + (hiEnv.max - loEnv.max) * f;
    const windwardMin = loEnv.min + (hiEnv.min - loEnv.min) * f;
    const leeward = -0.7;
    const base = {
      supported: true,
      reference: roofType === 'gable' ? 'Table 2.7 -> Table 2.5' : 'Table 2.5',
      ratioUsed: perpRatio,
      ratioLabel: 'h/L',
      windward: { candidates: [windwardMin, windwardMax], maxCp: windwardMax, minCp: windwardMin },
      leeward: { candidates: [leeward], maxCp: leeward, minCp: leeward },
    };
    if (roofType === 'gable') {
      base.center = { candidates: [leeward], maxCp: leeward, minCp: leeward };
    }
    return base;
  }

  function calcMwfrsPressureEnvelope(qExt, cpInfo, qInt, GCpi) {
    const cps = (cpInfo.candidates || []).filter(v => isFinite(v));
    const vals = [];
    cps.forEach(cp => {
      vals.push(qExt * cp - qInt * GCpi);
      vals.push(qExt * cp + qInt * GCpi);
    });
    return {
      cpMax: cpInfo.maxCp,
      cpMin: cpInfo.minCp,
      pMax: Math.max(...vals),
      pMin: Math.min(...vals),
      values: vals,
    };
  }

  function lookupMwfrsArchRoofCp(p) {
    const { archMode = 'with_walls', riseRatio = 0.2 } = p;
    const r = Math.max(0, Math.min(0.6, riseRatio));
    let windward;
    if (archMode === 'with_walls') {
      if (r < 0.2) windward = -0.9;
      else if (r < 0.3) windward = 1.5 * r - 0.3;
      else windward = 2.75 * r - 0.7;
    } else {
      windward = 1.4 * r;
    }
    const center = -0.7 - r;
    const leeward = -0.5;
    return {
      supported: true,
      reference: 'Table 2.6',
      ratioUsed: r,
      ratioLabel: 'r',
      windward: { candidates: [windward], maxCp: windward, minCp: windward },
      center: { candidates: [center], maxCp: center, minCp: center },
      leeward: { candidates: [leeward], maxCp: leeward, minCp: leeward },
      regionShare: { windward: 0.25, center: 0.5, leeward: 0.25 },
      archMode,
    };
  }

  function lookupMwfrsSawtoothRoofCp(p) {
    const {
      theta = 0,
      h,
      L,
      B,
      faceCode = 'D',
    } = p;
    const code = String(faceCode || 'D').trim();
    const lead = lookupMwfrsRoofCp({
      roofType: 'monoslope',
      windToRidge: 'perpendicular',
      theta,
      h,
      L,
      B,
    });
    const firstWindward = lead.windward;
    const firstLeeward = lead.leeward;
    const fixed = {
      "E'": -0.5,
      'D"': -0.5,
      'E"': -0.4,
      'D"""': -0.4,
      'E"""': -0.3,
      'D""""': -0.3,
      'E""""': -0.3,
    };
    let cpInfo;
    if (code === 'D') cpInfo = firstWindward;
    else if (code === 'E' || code === "D'") cpInfo = firstLeeward;
    else if (fixed[code] != null) {
      cpInfo = { candidates: [fixed[code]], maxCp: fixed[code], minCp: fixed[code] };
    } else {
      cpInfo = { candidates: [-0.3], maxCp: -0.3, minCp: -0.3 };
    }
    return {
      supported: true,
      reference: 'Table 2.8 -> Table 2.5',
      ratioUsed: lead.ratioUsed,
      ratioLabel: lead.ratioLabel,
      faceCode: code,
      faceCp: cpInfo,
    };
  }

  // ═══════════════════════════════
  //  主結構風力 (MWFRS) 逐層計算
  // ═══════════════════════════════
  /**
   * @param {object} input
   *   V        基本設計風速 V10(C) (m/s)
   *   terrain  'A'|'B'|'C'
   *   I        用途係數 (數值)
   *   B        迎風寬度 (m)
   *   L        順風長度 (m)
   *   storyH   [number] 每層樓高 (m), 由地面往上
   *   Kzt      地形係數 (預設 1.0)
   *   isFlexible 是否柔性結構
   *   fn       基本自然頻率 (Hz) — 柔性時必填
   *   beta     阻尼比 — 柔性時使用
   *   GOverride 手動指定 G
   *   encl     建築物封閉型式
   *   roofSlope 屋面坡度 (deg)
   *   roofType 'flat'|'monoslope'|'gable'|'arched'|'sawtooth'
   *   windToRidge 'perpendicular'|'parallel'
   *   archMode 'with_walls'|'springline'
   *   archRiseRatio r
   *   sawtoothFaceCode 面代號
   *   eaveHeight 屋簷高度，θ<10° 的屋面查表與屋面 q(h) 使用
   */
  function calcBuildingWind(input) {
    const {
      V, terrain, I, B, L, storyH,
      Kzt = 1.0, isFlexible = false,
      fn, beta = 0.02, GOverride,
      encl = 'enclosed',
      roofSlope = 0,
      roofType = 'flat',
      windToRidge = 'perpendicular',
      archMode = 'with_walls',
      archRiseRatio = 0.2,
      sawtoothFaceCode = 'D',
      eaveHeight,
      fa,
      ft,
    } = input;

    const Cpw = Cp_WINDWARD;
    const Cpl = leewardCp(L, B);
    if (encl === 'open') {
      throw new Error('Open buildings are not supported in this MWFRS page; use the open-building tools/formulas instead.');
    }
    const GCpi = GCPI[encl] ?? GCPI.enclosed;

    // 總高
    const zTops = [];
    let acc = 0;
    for (const h of storyH) { acc += h; zTops.push(acc); }
    const totalH = acc;

    // 陣風因子
    let G, gustInfo = null;
    if (GOverride != null) {
      G = GOverride;
    } else if (isFlexible && fn > 0) {
      gustInfo = calcGustFlex({ fn, h: totalH, B, L, terrain, beta, V });
      G = gustInfo.Gf;
    } else {
      gustInfo = calcGustRigid(totalH, B, terrain);
      G = gustInfo.G;
    }

    // 屋頂高度速度壓 q(h)
    const { Kz: KzH, qz: qH } = calcQz(totalH, V, terrain, I, Kzt);
    const roofRefH = roofSlope < 10 ? Math.max(eaveHeight == null ? totalH : eaveHeight, 0) : totalH;
    const { Kz: KzRoof, qz: qRoof } = calcQz(roofRefH, V, terrain, I, Kzt);
    // 背風面壓力 (用 q(h))
    const plConst = qH * G * Cpl;
    // 側風面壓力 (用 q(h))
    const pSide = qH * G * Cp_SIDEWALL;
    const wallCaseConst = {
      leeward: calcMwfrsPressureCases(qH * G, Cpl, qH, GCpi),
      side: calcMwfrsPressureCases(qH * G, Cp_SIDEWALL, qH, GCpi),
    };

    // 逐層
    let prevZ = 0;
    const stories = storyH.map((h, i) => {
      const zTop = zTops[i];
      const zMid = (prevZ + zTop) / 2;
      const { Kz, qz } = calcQz(zMid, V, terrain, I, Kzt);
      const pw = qz * G * Cpw;            // 迎風面
      const pl = plConst;                  // 背風面 (q(h) 計算)
      const pNet = pw - pl;               // 淨壓 (背風 Cpl 為負)
      const A = h * B;                    // 迎風面積
      const F = pNet * A;                 // 順風向風力
      const wallCases = {
        windward: calcMwfrsPressureCases(qz * G, Cpw, qH, GCpi),
        leeward: wallCaseConst.leeward,
        side: wallCaseConst.side,
      };
      prevZ = zTop;
      return { i: i + 1, zTop, zMid, h, Kz, qz, pw, pl, pNet, A, F, wallCases };
    });

    const Vb = stories.reduce((s, r) => s + r.F, 0);

    // 傾覆力矩 OTM
    const OTM = stories.reduce((s, r) => s + r.F * r.zMid, 0);

    // 橫風向 & 扭矩
    const hBL = totalH / Math.sqrt(B * L);
    const Vh = calcMeanWindSpeed(totalH, V, terrain);
    const faUse = fa > 0 ? fa : estFrequency(totalH).fa;
    const ftUse = ft > 0 ? ft : estFrequency(totalH).ft;
    let crossWind = null, torsion = null, lateralMeta = null;
    if (hBL < 3) {
      crossWind = stories.map(s => ({
        i: s.i, WL: calcCrossWindSimple(s.F, L, B), method: 'Eq 2.21'
      }));
      torsion = stories.map(s => ({
        i: s.i, MT: calcTorsionSimple(s.F, B), method: 'Eq 2.23'
      }));
      lateralMeta = {
        regime: 'simple',
        methodCross: 'Eq 2.21',
        methodTorsion: 'Eq 2.23',
        Vh,
        fa: faUse,
        ft: ftUse,
        crossApplicable: true,
        torsionApplicable: true,
      };
    } else if (hBL <= 6 && L / B >= 0.2 && L / B <= 5) {
      const crossRes = calcCrossWindResonanceFactor(L, B, faUse, Vh);
      const torsRes = calcTorsionResonanceFactor(L, B, ftUse, Vh);
      const crossApplicable = Vh / (faUse * Math.sqrt(B * L)) <= 10;
      const torsionApplicable = torsRes.Ustar <= 10;
      if (crossApplicable) {
        const CLp = 0.0082 * Math.pow(L / B, 3) - 0.071 * Math.pow(L / B, 2) + 0.22 * (L / B);
        const gL = calcPeakFactorForDuration(faUse);
        crossWind = stories.map(s => ({
          i: s.i,
          WL: 3 * qH * CLp * s.A * (s.zMid / totalH) * gL * Math.sqrt(1 + (crossRes.RLR / beta)),
          method: 'Eq 2.22',
        }));
        crossRes.CLp = CLp;
        crossRes.gL = gL;
      }
      if (torsionApplicable) {
        const CTp = Math.pow(0.0066 + 0.015 * Math.pow(L / B, 2), 0.78);
        const gT = calcPeakFactorForDuration(ftUse);
        torsion = stories.map(s => ({
          i: s.i,
          MT: 1.8 * qH * CTp * B * s.A * (s.zMid / totalH) * gT * Math.sqrt(1 + (torsRes.RTR / beta)),
          method: 'Eq 2.24',
        }));
        torsRes.CTp = CTp;
        torsRes.gT = gT;
      }
      lateralMeta = {
        regime: 'resonant',
        methodCross: crossApplicable ? 'Eq 2.22' : null,
        methodTorsion: torsionApplicable ? 'Eq 2.24' : null,
        Vh,
        fa: faUse,
        ft: ftUse,
        crossApplicable,
        torsionApplicable,
        cross: crossRes,
        torsion: torsRes,
      };
    } else {
      lateralMeta = {
        regime: 'out_of_scope',
        methodCross: null,
        methodTorsion: null,
        Vh,
        fa: faUse,
        ft: ftUse,
        crossApplicable: false,
        torsionApplicable: false,
      };
    }

    let roofLookup;
    if (roofType === 'arched') {
      roofLookup = lookupMwfrsArchRoofCp({ archMode, riseRatio: archRiseRatio });
    } else if (roofType === 'sawtooth') {
      roofLookup = lookupMwfrsSawtoothRoofCp({ theta: roofSlope, h: totalH, L, B, faceCode: sawtoothFaceCode });
    } else {
      roofLookup = lookupMwfrsRoofCp({
        roofType,
        windToRidge,
        theta: roofSlope,
        h: roofRefH,
        L,
        B,
      });
    }
    const roof = {
      supported: !!roofLookup.supported,
      roofSlope,
      roofType,
      windToRidge,
      note: roofType === 'arched'
        ? '拱形屋頂外壓係數依表 2.6。'
        : roofType === 'sawtooth'
          ? '鋸齒屋頂外壓係數依表 2.8，首列面代號需轉用表 2.5。'
          : '屋面外壓係數依表 2.5；雙斜式屋頂依表 2.7 轉用表 2.5。',
      reference: roofLookup.reference,
      ratioUsed: roofLookup.ratioUsed,
      ratioLabel: roofLookup.ratioLabel,
      roofRefH,
      qRoof,
      KzRoof,
      archMode,
      archRiseRatio,
      sawtoothFaceCode,
      xDir: null,
      yDir: null,
    };
    if (roofType === 'arched') {
      roof.xDir = {
        windward: calcMwfrsPressureEnvelope(qRoof * G, roofLookup.windward, qRoof, GCpi),
        center: calcMwfrsPressureEnvelope(qRoof * G, roofLookup.center, qRoof, GCpi),
        leeward: calcMwfrsPressureEnvelope(qRoof * G, roofLookup.leeward, qRoof, GCpi),
        regionShare: roofLookup.regionShare,
      };
      roof.yDir = roof.xDir;
    } else if (roofType === 'sawtooth') {
      roof.xDir = {
        face: calcMwfrsPressureEnvelope(qRoof * G, roofLookup.faceCp, qRoof, GCpi),
      };
      roof.yDir = roof.xDir;
    } else {
      roof.xDir = {
        windward: calcMwfrsPressureEnvelope(qRoof * G, roofLookup.windward, qRoof, GCpi),
        leeward: calcMwfrsPressureEnvelope(qRoof * G, roofLookup.leeward, qRoof, GCpi),
      };
      roof.yDir = roofType === 'gable' && windToRidge === 'perpendicular'
      ? {
          windward: calcMwfrsPressureEnvelope(qRoof * G, roofLookup.windward, qRoof, GCpi),
          center: calcMwfrsPressureEnvelope(qRoof * G, roofLookup.center, qRoof, GCpi),
          leeward: calcMwfrsPressureEnvelope(qRoof * G, roofLookup.leeward, qRoof, GCpi),
        }
      : {
          windward: calcMwfrsPressureEnvelope(qRoof * G, roofLookup.windward, qRoof, GCpi),
          leeward: calcMwfrsPressureEnvelope(qRoof * G, roofLookup.leeward, qRoof, GCpi),
        };
    }

    return {
      stories, Vb, OTM,
      Cpw, Cpl, Cp_side: Cp_SIDEWALL, Cp_roof: Cp_FLAT_ROOF,
      totalH, qH, KzH,
      G, gustInfo, isFlexible,
      crossWind, torsion, hBL, Vh, lateralMeta,
      pSide,
      encl, GCpi, roof,
    };
  }

  // ═══════════════════════════════
  //  C&C 區域風壓 (第三章, 圖 3.1 / 3.2)
  //  (GCp) = ASCE 7-02 (GCp) × 2.083 (§3.3 解說)
  //  因 10 分鐘平均 → 3 秒陣風轉換: 1.443² = 2.083
  //
  //  每項 = { pos: [small_A, large_A], neg: [small_A, large_A] }
  //  A ≤ Amin=0.93m² → small_A 值
  //  A ≥ Amax=46.5m² → large_A 值
  //  中間 → log-linear 內插
  // ═══════════════════════════════
  const CC_A_MIN = 0.93;   // 10 ft²
  const CC_A_MAX = 46.5;   // 500 ft²

  // h ≤ 18m: 圖 3.1(a) 外牆
  const GCP_WALL_LE18 = {
    zone4: { pos: [+1.89, +1.46], neg: [-2.08, -1.67] },
    zone5: { pos: [+1.89, +1.46], neg: [-2.71, -1.67] },
  };
  // h ≤ 18m: 圖 3.1(b) 屋頂 θ≤7°
  const GCP_ROOF_LE18 = {
    zone1: { pos: [+0.62, +0.42], neg: [-2.08, -1.46] },
    zone2: { pos: [+0.62, +0.42], neg: [-3.75, -1.67] },
    zone3: { pos: [+0.62, +0.42], neg: [-5.83, -2.08], negAmax: 9.3 },
  };
  // h > 18m: 圖 3.2 外牆
  const GCP_WALL_GT18 = {
    zone4: { pos: [+1.87, +1.46], neg: [-1.88, -1.67] },
    zone5: { pos: [+1.87, +1.46], neg: [-3.75, -1.67] },
  };
  // h > 18m: 圖 3.2 屋頂 θ≤10°
  const GCP_ROOF_GT18 = {
    zone1: { pos: [+0.62, +0.42], neg: [-2.08, -1.75] },
    zone2: { pos: [+0.62, +0.42], neg: [-3.75, -2.29] },
    zone3: { pos: [+0.62, +0.42], neg: [-5.83, -2.29], negAmax: 9.3 },
  };

  // 向後相容的扁平表格 (取 h>18m 值)
  const GCP_WALL = GCP_WALL_GT18;
  const GCP_ROOF = GCP_ROOF_GT18;

  /**
   * Log-linear GCp 內插 (圖 3.1/3.2 讀值)
   * curve = [small_A_value, large_A_value]
   * amax = 覆蓋 CC_A_MAX (部分區域曲線較早收斂)
   */
  function interpGCp(curve, A, amax) {
    if (A <= CC_A_MIN) return curve[0];
    const am = amax || CC_A_MAX;
    if (A >= am) return curve[1];
    const t = Math.log10(A / CC_A_MIN) / Math.log10(am / CC_A_MIN);
    return curve[0] + (curve[1] - curve[0]) * t;
  }

  /**
   * 查 GCp (pos, neg)
   */
  function lookupGCp(zoneData, A) {
    // 支援新格式 { pos: [...], neg: [...], negAmax? } 與舊格式 [[...]]
    if (Array.isArray(zoneData)) {
      // 舊格式 fallback
      for (const row of zoneData) {
        if (A >= row[0] && A < row[1]) return { pos: row[2], neg: row[3] };
      }
      const last = zoneData[zoneData.length - 1];
      return { pos: last[2], neg: last[3] };
    }
    return {
      pos: interpGCp(zoneData.pos, A),
      neg: interpGCp(zoneData.neg, A, zoneData.negAmax),
    };
  }

  /**
   * 區域風壓 C&C (第三章 §3.1~3.4)
   * h ≤ 18m: p = q(h)·[(GCp) − (GCpi)]    (Eq 3.1)
   * h > 18m: p = q·(GCp) − qi·(GCpi)       (Eq 3.2)
   *   迎風面牆正壓採 q(z)，背風/側牆與屋頂採 q(h)
   * 本函式僅適用封閉式/部分封閉式建築物之牆與低坡度屋面
   */
  function calcCC(p) {
    const { V, terrain, I, Kzt = 1.0, h, z, zh0, zone, surface, A, encl = 'enclosed' } = p;
    if (encl === 'open') {
      throw new Error('Open buildings must use Chapter 3.4 net pressure coefficients (Cpn).');
    }
    const qh = calcQz(h, V, terrain, I, Kzt).qz;
    const zUse = Math.max(z == null ? h : z, 0);
    const qz = calcQz(zUse, V, terrain, I, Kzt).qz;
    const zh0Use = Math.max(zh0 == null ? h : zh0, 0);
    const qh0 = calcQz(zh0Use, V, terrain, I, Kzt).qz;
    // 依 h 選擇 GCp 表
    const isLE18 = (h <= 18);
    const wallTbl = isLE18 ? GCP_WALL_LE18 : GCP_WALL_GT18;
    const roofTbl = isLE18 ? GCP_ROOF_LE18 : GCP_ROOF_GT18;
    const tbl = (surface === 'roof' ? roofTbl : wallTbl);
    const zoneData = tbl[zone];
    if (!zoneData) throw new Error('Unknown zone: ' + zone);
    const GCp = lookupGCp(zoneData, A);
    const GCpi = GCPI[encl] ?? GCPI.enclosed;
    const qPos = (!isLE18 && surface === 'wall') ? qz : qh;
    const qNeg = qh;
    const qiNeg = qh;
    const qiPos = encl === 'partial' ? qh0 : qh;
    const p_pos = qPos * GCp.pos + qiNeg * GCpi;
    const p_neg = qNeg * GCp.neg - qiPos * GCpi;
    return { qh, qz, qh0, qPos, qNeg, qiPos, qiNeg, zUse, zh0Use, GCp, GCpi, p_pos, p_neg, isLE18 };
  }

  /**
   * 屋頂女兒牆設計風壓 (第二章 Eq 2.3)
   * 設計迎風面女兒牆：GCpn = +1.8
   * 設計背風面女兒牆：GCpn = -1.1
   */
  function calcMwfrsParapet(p) {
    const { V, terrain, I, Kzt = 1.0, h, hp, face = 'windward' } = p;
    const topZ = h + hp;
    const qp = calcQz(topZ, V, terrain, I, Kzt).qz;
    const GCpn = face === 'windward' ? 1.8 : -1.1;
    return {
      qp,
      topZ,
      GCpn,
      p: qp * GCpn,
    };
  }

  /**
   * 女兒牆風壓 (第三章 Eq 3.3 + 圖 3.4 / 3.5)
   * 以既有 C&C 牆/屋面 GCp 表組合女兒牆正反面外壓。
   * 假設：
   * - 迎風面女兒牆：正面採牆面正壓，背面採屋面負壓
   * - 背風面女兒牆：正面採牆面負壓，背面採牆面正壓
   * - corner 情況採 zone5 / zone3；edge 情況採 zone4 / zone2
   * - q_p 取女兒牆頂端高度 z = h + hp 之風速壓
   */
  function calcParapet(p) {
    const {
      V, terrain, I, Kzt = 1.0,
      h, hp, A,
      face = 'windward',
      edge = 'edge',
      encl = 'enclosed',
      GCpiOverride = null,
    } = p;
    const topZ = h + hp;
    const qp = calcQz(topZ, V, terrain, I, Kzt).qz;
    const isLE18 = (h <= 18);
    const wallTbl = isLE18 ? GCP_WALL_LE18 : GCP_WALL_GT18;
    const roofTbl = isLE18 ? GCP_ROOF_LE18 : GCP_ROOF_GT18;
    const wallZone = edge === 'corner' ? 'zone5' : 'zone4';
    const roofZone = edge === 'corner' ? 'zone3' : 'zone2';
    const wallGCp = lookupGCp(wallTbl[wallZone], A);
    const roofGCp = lookupGCp(roofTbl[roofZone], A);
    const GCpi = GCpiOverride != null ? GCpiOverride : (GCPI[encl] ?? GCPI.enclosed);

    let frontGCp, backGCp, frontRef, backRef;
    if (face === 'windward') {
      frontGCp = wallGCp.pos;
      backGCp = roofGCp.neg;
      frontRef = { type: 'wall', zone: wallZone, sign: 'pos' };
      backRef = { type: 'roof', zone: roofZone, sign: 'neg' };
    } else {
      frontGCp = wallGCp.neg;
      backGCp = wallGCp.pos;
      frontRef = { type: 'wall', zone: wallZone, sign: 'neg' };
      backRef = { type: 'wall', zone: wallZone, sign: 'pos' };
    }

    // 對各面分別取使外壓方向最不利之內壓符號
    const frontInternalSign = frontGCp >= 0 ? '+' : '-';
    const backInternalSign = backGCp >= 0 ? '+' : '-';
    const pFront = qp * (frontGCp >= 0 ? (frontGCp + GCpi) : (frontGCp - GCpi));
    const pBack = qp * (backGCp >= 0 ? (backGCp + GCpi) : (backGCp - GCpi));
    const pDiff = pFront - pBack;

    return {
      qp, topZ, GCpi, isLE18,
      wallZone, roofZone,
      wallGCp, roofGCp,
      frontGCp, backGCp,
      frontRef, backRef,
      frontInternalSign, backInternalSign,
      pFront, pBack, pDiff,
    };
  }

  /**
   * 建築物屋頂女兒牆 C&C 全條件 (圖 3.4)
   * 逐條件列出：
   * - 迎風面 / 背風面
   * - 一般邊緣 / 角隅
   * 供頁面直接做逐圖逐區總覽與控制條件採用。
   */
  function calcParapetCcCases(p) {
    const cases = [
      { key: 'windward_edge', face: 'windward', edge: 'edge', label: '迎風面 / 一般邊緣' },
      { key: 'windward_corner', face: 'windward', edge: 'corner', label: '迎風面 / 角隅' },
      { key: 'leeward_edge', face: 'leeward', edge: 'edge', label: '背風面 / 一般邊緣' },
      { key: 'leeward_corner', face: 'leeward', edge: 'corner', label: '背風面 / 角隅' },
    ];
    return cases.map(item => ({
      ...item,
      data: calcParapet({ ...p, face: item.face, edge: item.edge }),
    }));
  }

  /**
   * 單一屋頂女兒牆 C&C (圖 3.5)
   * 以單一女兒牆兩側均受外風壓之情境，列出：
   * - 一般邊緣 / 角隅
   * - 左側外壓主控 / 右側外壓主控
   * 外壓係數均取外牆區域 GCp，方向反轉時交換正、背面來源。
   */
  function calcSingleRoofParapetCcCases(p) {
    const {
      V, terrain, I, Kzt = 1.0,
      h, hp, A,
      encl = 'enclosed',
      GCpiOverride = null,
    } = p;
    const topZ = h + hp;
    const qp = calcQz(topZ, V, terrain, I, Kzt).qz;
    const isLE18 = (h <= 18);
    const wallTbl = isLE18 ? GCP_WALL_LE18 : GCP_WALL_GT18;
    const GCpi = GCpiOverride != null ? GCpiOverride : (GCPI[encl] ?? GCPI.enclosed);
    const patterns = [
      { edge: 'edge', zone: 'zone4', dir: 'left', label: '一般邊緣 / 左側外壓主控' },
      { edge: 'edge', zone: 'zone4', dir: 'right', label: '一般邊緣 / 右側外壓主控' },
      { edge: 'corner', zone: 'zone5', dir: 'left', label: '角隅 / 左側外壓主控' },
      { edge: 'corner', zone: 'zone5', dir: 'right', label: '角隅 / 右側外壓主控' },
    ];
    return patterns.map(item => {
      const wallGCp = lookupGCp(wallTbl[item.zone], A);
      const frontGCp = item.dir === 'left' ? wallGCp.pos : wallGCp.neg;
      const backGCp = item.dir === 'left' ? wallGCp.neg : wallGCp.pos;
      const frontRef = { type: 'wall', zone: item.zone, sign: item.dir === 'left' ? 'pos' : 'neg' };
      const backRef = { type: 'wall', zone: item.zone, sign: item.dir === 'left' ? 'neg' : 'pos' };
      const frontInternalSign = frontGCp >= 0 ? '+' : '-';
      const backInternalSign = backGCp >= 0 ? '+' : '-';
      const pFront = qp * (frontGCp >= 0 ? (frontGCp + GCpi) : (frontGCp - GCpi));
      const pBack = qp * (backGCp >= 0 ? (backGCp + GCpi) : (backGCp - GCpi));
      return {
        key: `${item.edge}_${item.dir}`,
        label: item.label,
        edge: item.edge,
        dir: item.dir,
        data: {
          qp, topZ, GCpi, isLE18,
          wallZone: item.zone,
          roofZone: null,
          wallGCp,
          roofGCp: null,
          frontGCp, backGCp,
          frontRef, backRef,
          frontInternalSign, backInternalSign,
          pFront, pBack, pDiff: pFront - pBack,
        }
      };
    });
  }

  function _interp(x1, y1, x2, y2, x) {
    if (x2 === x1) return y1;
    return y1 + (y2 - y1) * ((x - x1) / (x2 - x1));
  }

  function _openRoofAreaBand(A, a) {
    if (A < a * a) return 'small';
    if (A <= 4 * a * a) return 'medium';
    return 'large';
  }

  function lookupOpenRoofCpn(roofType, blockage, theta, zone, A, minWidth) {
    const roofData = OPEN_ROOF_CPN[roofType];
    if (!roofData) throw new Error('Unknown open roof type: ' + roofType);
    const blockData = roofData[blockage];
    if (!blockData) throw new Error('Unknown blockage condition: ' + blockage);
    const a = Math.max(0.1 * minWidth, 0.9);
    const band = _openRoofAreaBand(A, a);
    const angles = Object.keys(blockData).map(Number).sort((m, n) => m - n);
    const thetaUse = Math.max(angles[0], Math.min(theta, angles[angles.length - 1]));
    let low = angles[0], high = angles[angles.length - 1];
    for (let i = 0; i < angles.length; i++) {
      if (thetaUse === angles[i]) { low = high = angles[i]; break; }
      if (thetaUse > angles[i]) low = angles[i];
      if (thetaUse < angles[i]) { high = angles[i]; break; }
    }
    const lowPair = blockData[low][band][zone];
    if (!lowPair) throw new Error('Unknown open roof zone: ' + zone);
    if (low === high) return { a, band, thetaUse, pos: lowPair[0], neg: lowPair[1], low, high };
    const highPair = blockData[high][band][zone];
    return {
      a, band, thetaUse, low, high,
      pos: _interp(low, lowPair[0], high, highPair[0], thetaUse),
      neg: _interp(low, lowPair[1], high, highPair[1], thetaUse),
    };
  }

  /**
   * 開放式建築物斜屋頂局部構材及外部被覆物 (第三章 Eq 3.4 / 圖 3.3)
   */
  function calcOpenRoofCC(p) {
    const {
      V, terrain, I,
      h, B, L, Kzt = 1.0,
      theta, A, zone,
      roofType = 'monoslope',
      blockage = 'unblocked',
    } = p;
    const qh = calcQz(h, V, terrain, I, Kzt).qz;
    const G = calcGustRigid(h, B, terrain).G;
    const minWidth = Math.min(B, L);
    const cpn = lookupOpenRoofCpn(roofType, blockage, theta, zone, A, minWidth);
    return {
      qh, G, minWidth,
      a: cpn.a, areaBand: cpn.band,
      thetaUse: cpn.thetaUse, thetaLow: cpn.low, thetaHigh: cpn.high,
      Cpn: { pos: cpn.pos, neg: cpn.neg },
      p_pos: qh * G * cpn.pos,
      p_neg: qh * G * cpn.neg,
    };
  }

  // ═══════════════════════════════
  //  建物基本自然頻率估算 (ASCE 7-05)
  //  fn = fa = 22.86/h (Hz), ft = 1.3·fn
  // ═══════════════════════════════
  function estFrequency(h) {
    const fn = 22.86 / h;
    return { fn, fa: fn, ft: 1.3 * fn };
  }

  // ═══════════════════════════════
  //  層間變位角限制 (§4.2)
  //  回歸期 50 年: Δ/h ≤ 5/1000
  // ═══════════════════════════════
  const DRIFT_LIMIT = 5 / 1000;

  // ═══════════════════════════════
  //  頂樓角隅容許加速度 (§4.3)
  //  回歸期半年: ≤ 0.05 m/s²
  //  半年回歸期風速 ≈ V50 / 3.34
  // ═══════════════════════════════
  const ACCEL_LIMIT = 0.05;  // m/s²
  const V_HALF_YEAR_RATIO = 1 / 3.34;  // V_0.5yr / V_50yr
  const G_ACCEL = 9.80665;
  const STRUCTURE_DENSITY = {
    RC: 400,
    SRC: 300,
    SS: 200,
  };
  const SOLID_OBJECT_CF = {
    flat_panel: { name: '平板 / 告示牌', cf: 1.80 },
    box: { name: '矩形箱體', cf: 1.30 },
    circular_cylinder: { name: '圓柱體', cf: 0.70 },
    polygonal_prism: { name: '多角柱', cf: 1.20 },
    sphere: { name: '球體', cf: 0.50 },
  };
  const TOWER_CF_TABLE = {
    square_face: {
      name: '方形（風向垂直於某面）',
      points: [[1, 1.3], [7, 1.4], [25, 2.0]],
    },
    square_diagonal: {
      name: '方形（風向沿對角線）',
      points: [[1, 1.0], [7, 1.1], [25, 1.5]],
    },
    hex_oct: {
      name: '六邊形 / 八邊形',
      points: [[1, 1.0], [7, 1.2], [25, 1.4]],
    },
    circular_low_qd: {
      name: '圓形（q(z)D ≤ 1.70）',
      points: [[1, 0.7], [7, 0.8], [25, 1.2]],
    },
    circular_moderate: {
      name: '圓形（中度光滑，q(z)D > 1.70）',
      points: [[1, 0.5], [7, 0.6], [25, 0.7]],
    },
    circular_rough: {
      name: '圓形（粗糙，q(z)D > 1.70）',
      points: [[1, 0.7], [7, 0.8], [25, 0.9]],
    },
    circular_very_rough: {
      name: '圓形（極粗糙，q(z)D > 1.70）',
      points: [[1, 0.8], [7, 1.0], [25, 1.2]],
    },
  };
  const POROUS_FRAME_CF_TABLE = {
    circular_low_qd: [
      { min: 0.00, max: 0.10, cf: 2.0 },
      { min: 0.10, max: 0.29, cf: 1.8 },
      { min: 0.30, max: 0.70, cf: 1.6 },
    ],
    circular_high_qd: [
      { min: 0.00, max: 0.10, cf: 1.2 },
      { min: 0.10, max: 0.29, cf: 1.3 },
      { min: 0.30, max: 0.70, cf: 1.5 },
    ],
    flat_member: [
      { min: 0.00, max: 0.10, cf: 0.8 },
      { min: 0.10, max: 0.29, cf: 0.9 },
      { min: 0.30, max: 0.70, cf: 1.1 },
    ],
  };
  const SIGN_CF_GROUND = [[3, 1.2], [5, 1.3], [8, 1.4], [10, 1.5], [20, 1.75], [30, 1.85], [40, 2.0]];
  const SIGN_CF_ABOVE  = [[6, 1.2], [10, 1.3], [16, 1.4], [20, 1.5], [40, 1.75], [60, 1.85], [80, 2.0]];
  const ANGULAR_PRISM_CF = {
    rect_long: { name: '長方柱（風向垂直長邊）', cf: 2.2 },
    rect_short: { name: '長方柱（風向垂直短邊）', cf: 1.4 },
    tri_vertex: { name: '等邊三角柱（風向循著頂點）', cf: 1.2 },
    tri_face: { name: '等邊三角柱（風向垂直面）', cf: 2.0 },
    right_iso_vertex: { name: '直角等腰三角柱（風向循著直角頂）', cf: 1.55 },
  };
  const ANGULAR_PRISM_R = [
    { min: 0, max: 4, r: 0.6 },
    { min: 4, max: 8, r: 0.7 },
    { min: 8, max: 40, r: 0.8 },
    { min: 40, max: Infinity, r: 1.0 },
  ];
  const CABLE_CF = {
    smooth: { name: '光滑繩、竿、管', low: 1.2, high: 0.5 },
    moderate: { name: '中度光滑繩、竿、管', low: 1.2, high: 0.7 },
    fine_cable: { name: '細電纜、鋼索', low: 1.2, high: 0.9 },
    rough_cable: { name: '粗電纜、鋼索', low: 1.3, high: 1.1 },
  };

  // ═══════════════════════════════
  //  第四章最高居室樓層角隅加速度
  //  C4.1 與第 45 頁角隅合成式
  // ═══════════════════════════════
  function calcPeakAcceleration(freqHz, displacement) {
    return Math.pow(2 * Math.PI * freqHz, 2) * displacement;
  }

  /**
   * @param {object} p
   *   fn 順風向基本自然頻率 (Hz)
   *   fa 橫風向基本自然頻率 (Hz)
   *   ft 扭轉向基本自然頻率 (Hz)
   *   Dstar 最高居室樓層形心順風向位移 D* (m)
   *   Lstar 最高居室樓層形心橫風向位移 L* (m)
   *   thetaStar 最高居室樓層扭轉角位移 θ* (rad)
   *   B 建築物迎風寬度 (m)
   *   L 建築物順風長度 (m)
   */
  function calcCornerPeakAcceleration(p) {
    const {
      fn, fa, ft,
      Dstar = 0,
      Lstar = 0,
      thetaStar = 0,
      B,
      L,
    } = p;
    const AD = calcPeakAcceleration(fn, Dstar);
    const AL = calcPeakAcceleration(fa, Lstar);
    const AT = calcPeakAcceleration(ft, thetaStar);
    const Apeak = Math.sqrt(
      AD * AD +
      AL * AL +
      AT * AT * ((B * B + L * L) / 4) +
      (L * AL * AT)
    );
    return {
      AD,
      AL,
      AT,
      Apeak,
      pass: Apeak <= ACCEL_LIMIT,
    };
  }

  /**
   * 簡化推估最高居室樓層角隅尖峰加速度
   * 說明：以平均單位質量推估建築物總質量與質量慣性矩，
   * 再用半年回歸期主結構設計風力估計頂層加速度。
   * 本函式為報表輔助推估，不取代第四章以結構分析位移進行之正式檢核。
   */
  function calcSimplifiedAccelEstimate(p) {
    const {
      totalMassKg,
      widthB,
      lengthL,
      WD = 0,
      WL = 0,
      WT = 0,
    } = p;
    const M = Math.max(totalMassKg, 1e-9);
    const Itheta = M * (widthB * widthB + lengthL * lengthL) / 12;
    const rCorner = Math.sqrt(widthB * widthB + lengthL * lengthL) / 2;
    const AD = WD * G_ACCEL / M;
    const AL = WL * G_ACCEL / M;
    const alphaT = WT * G_ACCEL / Itheta;
    const ATcorner = alphaT * rCorner;
    const Apeak = Math.sqrt(AD * AD + AL * AL + ATcorner * ATcorner);
    return {
      AD,
      AL,
      alphaT,
      ATcorner,
      Apeak,
      totalMassKg: M,
      Itheta,
      rCorner,
      pass: Apeak <= ACCEL_LIMIT,
    };
  }

  function lookupSolidObjectCf(shapeType) {
    const data = SOLID_OBJECT_CF[shapeType];
    if (!data) throw new Error('Unknown solid object shape: ' + shapeType);
    return { shapeType, name: data.name, cf: data.cf };
  }

  function calcSolidObjectWind(p) {
    const {
      V, terrain, I,
      z,
      A,
      charWidth,
      Kzt = 1.0,
      shapeType = 'flat_panel',
      Cf = null,
      shapeFactor = 1.0,
      G = null,
    } = p;
    const zUse = Math.max(z, 0);
    const shape = lookupSolidObjectCf(shapeType);
    const baseCf = Cf == null ? shape.cf : Cf;
    const CfEff = baseCf * shapeFactor;
    const qz = calcQz(zUse, V, terrain, I, Kzt).qz;
    const gust = G == null ? calcGustRigid(Math.max(zUse, 0.1), Math.max(charWidth || 1, 1), terrain).G : G;
    const pressure = qz * gust * CfEff;
    const F = pressure * A;
    return {
      z: zUse,
      qz,
      G: gust,
      shapeType,
      shapeName: shape.name,
      baseCf,
      shapeFactor,
      CfEff,
      A,
      pressure,
      F,
      baseShear: F,
      baseMoment: F * zUse,
      resultantHeight: zUse,
    };
  }

  function calcVerticalSolidObjectWind(p) {
    const {
      V, terrain, I,
      zBase = 0,
      height,
      width,
      segments = 10,
      Kzt = 1.0,
      shapeType = 'flat_panel',
      Cf = null,
      shapeFactor = 1.0,
      G = null,
    } = p;
    const n = Math.max(1, Math.round(segments));
    const dz = height / n;
    const topZ = zBase + height;
    const shape = lookupSolidObjectCf(shapeType);
    const baseCf = Cf == null ? shape.cf : Cf;
    const CfEff = baseCf * shapeFactor;
    const gust = G == null ? calcGustRigid(Math.max(topZ, dz), Math.max(width || 1, 1), terrain).G : G;
    const rows = [];
    let baseShear = 0;
    let baseMoment = 0;
    for (let i = 0; i < n; i++) {
      const z1 = zBase + i * dz;
      const z2 = z1 + dz;
      const zMid = (z1 + z2) / 2;
      const area = width * dz;
      const qz = calcQz(zMid, V, terrain, I, Kzt).qz;
      const pressure = qz * gust * CfEff;
      const force = pressure * area;
      const moment = force * zMid;
      baseShear += force;
      baseMoment += moment;
      rows.push({
        index: i + 1,
        z1,
        z2,
        zMid,
        area,
        qz,
        pressure,
        force,
        moment,
      });
    }
    return {
      zBase,
      height,
      topZ,
      width,
      segments: n,
      segmentHeight: dz,
      G: gust,
      shapeType,
      shapeName: shape.name,
      baseCf,
      shapeFactor,
      CfEff,
      totalArea: width * height,
      rows,
      baseShear,
      baseMoment,
      resultantHeight: baseShear > 0 ? baseMoment / baseShear : 0,
    };
  }

  function lookupTowerCf(p) {
    const {
      sectionType = 'square_face',
      hOverD,
      qzD = null,
    } = p;
    let key = sectionType;
    if (sectionType === 'circular_auto') {
      key = (qzD != null && qzD <= 1.70) ? 'circular_low_qd' : 'circular_moderate';
    }
    const data = TOWER_CF_TABLE[key];
    if (!data) throw new Error('Unknown tower section type: ' + sectionType);
    const pts = data.points;
    const x = Math.max(pts[0][0], Math.min(hOverD, pts[pts.length - 1][0]));
    let low = pts[0];
    let high = pts[pts.length - 1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (x >= pts[i][0] && x <= pts[i + 1][0]) {
        low = pts[i];
        high = pts[i + 1];
        break;
      }
    }
    const cf = _interp(low[0], low[1], high[0], high[1], x);
    return {
      sectionType: key,
      name: data.name,
      hOverD: x,
      lowRatio: low[0],
      highRatio: high[0],
      lowCf: low[1],
      highCf: high[1],
      cf,
      qzD,
    };
  }

  function calcTowerWind(p) {
    const {
      V, terrain, I,
      zBase = 0,
      height,
      D,
      segments = 10,
      Kzt = 1.0,
      sectionType = 'square_face',
      shapeFactor = 1.0,
      topArea = 0,
      topAreaCf = null,
    } = p;
    const refZ = zBase + height;
    const qTop = calcQz(refZ, V, terrain, I, Kzt).qz;
    const qzD = qTop * D;
    const cfData = lookupTowerCf({ sectionType, hOverD: height / Math.max(D, 1e-9), qzD });
    const body = calcVerticalSolidObjectWind({
      V, terrain, I,
      zBase,
      height,
      width: D,
      segments,
      Kzt,
      shapeType: 'flat_panel',
      Cf: cfData.cf,
      shapeFactor,
      charWidth: D,
    });
    let top = null;
    let baseShear = body.baseShear;
    let baseMoment = body.baseMoment;
    if (topArea > 0) {
      const topCfBase = topAreaCf == null ? cfData.cf : topAreaCf;
      const topCfEff = topCfBase * shapeFactor;
      const gust = body.G;
      const pressure = qTop * gust * topCfEff;
      const force = pressure * topArea;
      const zTop = zBase + height;
      const moment = force * zTop;
      top = {
        area: topArea,
        qz: qTop,
        baseCf: topCfBase,
        CfEff: topCfEff,
        force,
        moment,
        z: zTop,
      };
      baseShear += force;
      baseMoment += moment;
    }
    return {
      zBase,
      height,
      D,
      qTop,
      qzD,
      cfData,
      shapeFactor,
      body,
      top,
      baseShear,
      baseMoment,
      resultantHeight: baseShear > 0 ? baseMoment / baseShear : 0,
    };
  }

  function lookupPorousFrameCf(p) {
    const {
      solidity,
      memberType = 'circular',
      qzD = null,
    } = p;
    let key;
    if (memberType === 'flat') key = 'flat_member';
    else key = (qzD != null && qzD <= 1.70) ? 'circular_low_qd' : 'circular_high_qd';
    const rows = POROUS_FRAME_CF_TABLE[key];
    const phi = Math.max(rows[0].min, Math.min(solidity, rows[rows.length - 1].max));
    const row = rows.find(item => phi >= item.min && phi <= item.max) || rows[rows.length - 1];
    return {
      key,
      memberType,
      solidity: phi,
      qzD,
      cf: row.cf,
      band: `${row.min.toFixed(2)}~${row.max.toFixed(2)}`,
    };
  }

  function lookupLatticeTowerCf(p) {
    const {
      solidity,
      towerShape = 'square',
      memberShape = 'angle_flat',
      skewWind = false,
    } = p;
    const phi = Math.max(0, Math.min(solidity, 1));
    let baseCf;
    if (towerShape === 'square') {
      if (phi < 0.025) baseCf = 4.0;
      else if (phi <= 0.44) baseCf = 4.1 - 5.2 * phi;
      else if (phi <= 0.69) baseCf = 1.8;
      else baseCf = 1.3 + 0.7 * phi;
    } else {
      if (phi < 0.025) baseCf = 3.6;
      else if (phi <= 0.44) baseCf = 3.7 - 4.5 * phi;
      else if (phi <= 0.69) baseCf = 1.7;
      else baseCf = 1.0 + phi;
    }
    let memberFactor = 1.0;
    if (memberShape === 'circular') {
      if (phi <= 0.29) memberFactor = 0.67;
      else if (phi <= 0.79) memberFactor = 0.67 * phi + 0.47;
      else memberFactor = 1.0;
    }
    let skewFactor = 1.0;
    if (towerShape === 'square' && skewWind && phi < 0.5) {
      skewFactor = 1.0 + 0.75 * phi;
    }
    return {
      towerShape,
      memberShape,
      solidity: phi,
      baseCf,
      memberFactor,
      skewFactor,
      cf: baseCf * memberFactor * skewFactor,
    };
  }

  function calcLatticeTowerWind(p) {
    const {
      V, terrain, I,
      zBase = 0,
      height,
      faceWidth,
      solidity,
      segments = 10,
      Kzt = 1.0,
      towerShape = 'square',
      memberShape = 'angle_flat',
      skewWind = false,
    } = p;
    const cfData = lookupLatticeTowerCf({ solidity, towerShape, memberShape, skewWind });
    const body = calcVerticalSolidObjectWind({
      V, terrain, I,
      zBase,
      height,
      width: faceWidth * solidity,
      segments,
      Kzt,
      shapeType: 'flat_panel',
      Cf: cfData.cf,
      shapeFactor: 1.0,
      charWidth: faceWidth,
    });
    return {
      zBase,
      height,
      faceWidth,
      solidity,
      cfData,
      body,
      baseShear: body.baseShear,
      baseMoment: body.baseMoment,
      resultantHeight: body.resultantHeight,
      totalSolidArea: faceWidth * height * solidity,
    };
  }

  function _interpPoints(points, x) {
    const xs = points.map(item => item[0]);
    const xUse = Math.max(xs[0], Math.min(x, xs[xs.length - 1]));
    let low = points[0];
    let high = points[points.length - 1];
    for (let i = 0; i < points.length - 1; i++) {
      if (xUse >= points[i][0] && xUse <= points[i + 1][0]) {
        low = points[i];
        high = points[i + 1];
        break;
      }
    }
    return {
      x: xUse,
      lowX: low[0],
      highX: high[0],
      lowY: low[1],
      highY: high[1],
      y: _interp(low[0], low[1], high[0], high[1], xUse),
    };
  }

  function lookupSignCf(p) {
    const { atGround = false, aspectRatio } = p;
    const interp = _interpPoints(atGround ? SIGN_CF_GROUND : SIGN_CF_ABOVE, aspectRatio);
    return {
      atGround,
      aspectRatio: interp.x,
      cf: interp.y,
      lowRatio: interp.lowX,
      highRatio: interp.highX,
      lowCf: interp.lowY,
      highCf: interp.highY,
    };
  }

  function lookupAngularPrismCf(shapeKey) {
    const data = ANGULAR_PRISM_CF[shapeKey];
    if (!data) throw new Error('Unknown angular prism shape: ' + shapeKey);
    return { shapeKey, name: data.name, cf: data.cf };
  }

  function lookupAngularPrismR(slenderRatio) {
    const row = ANGULAR_PRISM_R.find(item => slenderRatio >= item.min && slenderRatio < item.max) || ANGULAR_PRISM_R[ANGULAR_PRISM_R.length - 1];
    return {
      slenderRatio,
      band: row.max === Infinity ? `>${row.min}` : `${row.min}~${row.max}`,
      r: row.r,
    };
  }

  function lookupCableCf(p) {
    const { roughness = 'smooth', qzD } = p;
    const data = CABLE_CF[roughness];
    if (!data) throw new Error('Unknown cable roughness: ' + roughness);
    const lowRegime = qzD <= 1.70;
    return {
      roughness,
      name: data.name,
      qzD,
      regime: lowRegime ? 'q(z)D ≤ 1.70' : 'q(z)D > 1.70',
      cf: lowRegime ? data.low : data.high,
    };
  }

  // ═══════════════════════════════
  //  匯出
  // ═══════════════════════════════
  global.Wind = {
    BASIC_WIND_SPEED,
    CITY_QUICK,
    TERRAIN,
    IMPORTANCE,
    GCPI,
    G_RIGID_DEFAULT,
    GCP_WALL, GCP_ROOF,
    GCP_WALL_LE18, GCP_ROOF_LE18,
    GCP_WALL_GT18, GCP_ROOF_GT18,
    OPEN_ROOF_CPN,
    CC_A_MIN, CC_A_MAX, interpGCp,
    DRIFT_LIMIT,
    ACCEL_LIMIT,
    V_HALF_YEAR_RATIO,
    G_ACCEL,
    STRUCTURE_DENSITY,
    SOLID_OBJECT_CF,
    TOWER_CF_TABLE,
    POROUS_FRAME_CF_TABLE,
    SIGN_CF_GROUND,
    SIGN_CF_ABOVE,
    ANGULAR_PRISM_CF,
    ANGULAR_PRISM_R,
    CABLE_CF,

    calcKz,
    calcQz,
    calcKzt,
    calcIz,
    calcLz,
    calcQ2,
    calcVzBar,
    calcMeanWindSpeed,
    calcGustRigid,
    calcGustFlex,
    leewardCp,
    calcCrossWindSimple,
    calcTorsionSimple,
    calcCrossWindResonanceFactor,
    calcTorsionResonanceFactor,
    calcPeakFactorForDuration,
    calcMwfrsPressureCases,
    lookupMwfrsRoofCp,
    lookupMwfrsArchRoofCp,
    lookupMwfrsSawtoothRoofCp,
    calcMwfrsPressureEnvelope,
    calcBuildingWind,
    calcCC,
    calcMwfrsParapet,
    calcParapet,
    calcParapetCcCases,
    calcSingleRoofParapetCcCases,
    lookupOpenRoofCpn,
    calcOpenRoofCC,
    lookupSolidObjectCf,
    calcSolidObjectWind,
    calcVerticalSolidObjectWind,
    lookupTowerCf,
    calcTowerWind,
    lookupPorousFrameCf,
    lookupLatticeTowerCf,
    calcLatticeTowerWind,
    lookupSignCf,
    lookupAngularPrismCf,
    lookupAngularPrismR,
    lookupCableCf,
    lookupGCp,
    estFrequency,
    calcPeakAcceleration,
    calcCornerPeakAcceleration,
    calcSimplifiedAccelEstimate,
  };
})(window);
