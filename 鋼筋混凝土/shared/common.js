/* 鋼筋混凝土工具箱 共用常數與工具函式 (單位 cm, kgf) */

// === 標準竹節鋼筋表 (CNS 560) ===
// db: 直徑(cm), area: 單根面積(cm²), w: 單位重(kgf/m)
const REBAR_TABLE = {
  '#3':  { db: 0.953, area: 0.7133, w: 0.560 },
  '#4':  { db: 1.270, area: 1.267,  w: 0.994 },
  '#5':  { db: 1.588, area: 1.979,  w: 1.552 },
  '#6':  { db: 1.905, area: 2.850,  w: 2.235 },
  '#7':  { db: 2.222, area: 3.879,  w: 3.042 },
  '#8':  { db: 2.540, area: 5.067,  w: 3.973 },
  '#9':  { db: 2.865, area: 6.469,  w: 5.060 },
  '#10': { db: 3.226, area: 8.143,  w: 6.404 },
  '#11': { db: 3.581, area: 10.07,  w: 7.907 },
};

// === 強度折減因數 φ ===
const PHI = {
  tension:    0.90,  // 拉力控制 (撓曲)
  compTied:   0.65,  // 壓力控制-箍筋柱
  compSpiral: 0.75,  // 壓力控制-螺箍筋柱
  shear:      0.75,  // 剪力與扭力
  bearing:    0.65,  // 承壓
  plain:      0.60,  // 純混凝土
};

// === 常用混凝土強度 fc' (kgf/cm²) ===
const FC_OPTIONS = [210, 245, 280, 350, 420, 490, 560];

// === 常用鋼筋降伏強度 fy (kgf/cm²) ===
const FY_OPTIONS = [2800, 4200, 5600];   // SD280W, SD420W, SD550W

// === β1 (應力方塊係數) ===
function calcBeta1(fc) {
  if (fc <= 280) return 0.85;
  if (fc >= 560) return 0.65;
  return 0.85 - 0.05 * (fc - 280) / 70;
}

// === λ (輕質混凝土修正因數) — 常重 = 1.0 ===
const LAMBDA_NORMAL = 1.0;

// === Es (鋼筋彈性模數) ===
const ES = 2.04e6;  // kgf/cm²

// === Ec (混凝土彈性模數, 常重) ===
function calcEc(fc) {
  return 15000 * Math.sqrt(fc);  // kgf/cm² (ACI/我國規範常用)
}

// === 格式化數值顯示 ===
function fmt(v, digits = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Number(v).toFixed(digits);
}

// === 結果項目 DOM 產生 (含 OK/WARN/FAIL 標示) ===
function makeResult(label, value, unit, status) {
  const cls = status ? ` ${status}` : '';
  return `<div class="result-item${cls}">
    <span class="label">${label}</span>
    <span><span class="value">${value}</span><span class="unit">${unit || ''}</span></span>
  </div>`;
}
