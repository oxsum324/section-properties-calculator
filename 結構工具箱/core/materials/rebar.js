/* core/materials/rebar.js
 * 竹節鋼筋規格 (CNS 560) — 直徑/面積/單位重
 */

// db: 直徑 (cm), area: 單根面積 (cm²), w: 單位重 (kgf/m)
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

// 常用降伏強度 (kgf/cm²) — 依 CNS 560
const FY_OPTIONS = [2800, 4200, 5000, 5600];   // SD280W / SD420W / SD490W / SD550W

// 鋼筋彈性模數 Es (kgf/cm²)
const ES = 2.04e6;

window.Rebar = { REBAR_TABLE, FY_OPTIONS, ES };
