// H 型鋼斷面性質表 (JIS G 3192 / CNS 規格)
// 單位：H, B, tw, tf = cm；A = cm²；Wb = kg/m；I = cm⁴；S = cm³；r = cm
// R（mm）：H250～H350 取 13，H400～H458 取 22。Sx、Sy 為彈性斷面係數。
const H_SECTION_SOURCE = 'H250～H428 採東和 H 型鋼型錄（精簡版），H458 採野田喜産業廣幅 H 形鋼表。';
const H_SECTIONS = [
  { name: "H250×250×9×14",   H: 25.0, B: 25.0, tw: 0.9, tf: 1.4, A:  91.43, Wb:  71.8, Ix:  10700, Iy:  3650, Sx:  860, Sy:  292, rx: 10.8, ry: 6.32 },
  { name: "H300×300×10×15",  H: 30.0, B: 30.0, tw: 1.0, tf: 1.5, A: 118.4, Wb:  93.0, Ix:  20200, Iy:  6750, Sx: 1350, Sy:  450, rx: 13.1, ry: 7.55 },
  { name: "H350×350×12×19",  H: 35.0, B: 35.0, tw: 1.2, tf: 1.9, A: 171.9, Wb: 135, Ix:  39800, Iy: 13600, Sx: 2280, Sy:  776, rx: 15.2, ry: 8.89 },
  { name: "H400×400×13×21",  H: 40.0, B: 40.0, tw: 1.3, tf: 2.1, A: 218.7,  Wb: 172,   Ix:  66600, Iy: 22400, Sx: 3330, Sy: 1120, rx: 17.5,  ry: 10.1 },
  { name: "H414×405×18×28",  H: 41.4, B: 40.5, tw: 1.8, tf: 2.8, A: 295.4,  Wb: 232,   Ix:  92800, Iy: 31000, Sx: 4480, Sy: 1530, rx: 17.7,  ry: 10.2 },
  { name: "H428×407×20×35",  H: 42.8, B: 40.7, tw: 2.0, tf: 3.5, A: 360.7,  Wb: 283,   Ix: 119000, Iy: 39400, Sx: 5570, Sy: 1930, rx: 18.2,  ry: 10.4 },
  { name: "H458×417×30×50",  H: 45.8, B: 41.7, tw: 3.0, tf: 5.0, A: 528.6,  Wb: 415,   Ix: 187000, Iy: 60500, Sx: 8170, Sy: 2900, rx: 18.8,  ry: 10.7 },
];

// 覆工板面 (H190 五支併接 200mm 厚標準板, 1m×3m)
const DECK_PLATE = {
  name: "H190 集成 3000×1000×200",
  Sx: 1560,   // cm³ /片
  Ix: 15150,  // cm⁴ /片
  Aw: 47.5,   // cm² /片
  self: 163,  // kgf/m² (自重)
};

// 載重範本
const LOAD_PRESETS = {
  "HS20-44":   { type: "concentrated", P: 7.3,    note: "卡車：P=144kN/2=7.3t/輪，輪心距 1.2/1.8/1.2 m" },
  "PC400":     { type: "track",        Wc: 8.244, trackLen: 4.35, note: "履帶車：Wc=8.244 t/m，履帶長 4.35 m" },
  "45T 吊車":  { type: "concentrated", P: 13.63,  note: "45T吊車：P=13.63 t（M=50 T-m）" },
  "200T 吊車": { type: "concentrated", P: 56.51,  note: "200T吊車（KATO NK-1600，350 T-m）：P=56.51 t" },
  "300T 吊車": { type: "concentrated", P: 89.83,  note: "300T吊車：P=89.83 t" },
};

if (typeof module !== "undefined") module.exports = { H_SECTIONS, DECK_PLATE, LOAD_PRESETS };
