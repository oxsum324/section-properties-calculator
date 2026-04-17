/* core/materials/concrete.js
 * 混凝土材料常數與函式 (依 112 年混凝土結構設計規範, 單位 kgf, cm)
 */

// 強度折減因數 φ (規範 第 21 章)
const PHI = {
  tension:    0.90,  // 拉力控制 (撓曲)
  compTied:   0.65,  // 壓力控制 — 箍筋柱
  compSpiral: 0.75,  // 壓力控制 — 螺箍筋柱
  shear:      0.75,  // 剪力與扭力
  bearing:    0.65,  // 承壓
  plain:      0.60,  // 純混凝土
};

// 常用混凝土強度 fc' (kgf/cm²)
const FC_OPTIONS = [210, 245, 280, 350, 420, 490, 560];

// β1 應力方塊深度比 (規範 2.7.3)
function calcBeta1(fc) {
  if (fc <= 280) return 0.85;
  if (fc >= 560) return 0.65;
  return 0.85 - 0.05 * (fc - 280) / 70;
}

// 混凝土彈性模數 Ec (常重混凝土) — kgf/cm²
// 112 年規範 19.2.2: Ec = 12000√fc' (取代舊式 15000√fc')
function calcEc(fc) {
  return 12000 * Math.sqrt(fc);
}

// 輕質混凝土修正因數 λ (常重 = 1.0)
const LAMBDA_NORMAL = 1.0;

window.Concrete = { PHI, FC_OPTIONS, calcBeta1, calcEc, LAMBDA_NORMAL };
