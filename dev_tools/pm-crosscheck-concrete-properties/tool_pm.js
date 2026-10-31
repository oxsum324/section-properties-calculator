// RC 柱 P-M 離線交叉驗證：小工具端（唯讀執行本 repo 原始碼，不修改任何檔案）。
// 單位一律 N、mm；pmsection.js 與 getRebarPositions 與單位無關，β1、Es 明確傳入。
// 用法：node tool_pm.js <輸出資料夾>
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'output', 'pm-crosscheck-concrete-properties'));
fs.mkdirSync(OUT, { recursive: true });
const PMSection = require(path.join(REPO, '鋼筋混凝土/shared/pmsection.js'));
// column.app.js 依賴 DOM，只以 vm 執行從原文抽出的四個純配筋函式
const app = fs.readFileSync(path.join(REPO, '鋼筋混凝土/tools/column.app.js'), 'utf8');
function grab(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('column.app.js 找不到函式 ' + name);
  let depth = 0;
  for (let k = app.indexOf('{', i); k < app.length; k++) {
    if (app[k] === '{') depth++;
    else if (app[k] === '}') { depth--; if (depth === 0) return app.slice(i, k + 1); }
  }
  throw new Error('column.app.js 函式括號不成對 ' + name);
}
const ctx = {};
vm.createContext(ctx);
vm.runInContext(['makeLayoutSym', 'expandBundle', 'getRebarPositions', 'buildBars'].map(grab).join('\n') +
  '\nthis.makeLayoutSym=makeLayoutSym;this.getRebarPositions=getRebarPositions;this.buildBars=buildBars;', ctx);

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
const out = {};
for (const cs of cases) {
  const L = ctx.makeLayoutSym(cs.nFaceB, cs.nFaceH, 1, 1);
  Object.assign(L, { cornerAb: cs.ab, cornerDb: cs.db, faceAb: cs.ab, faceDb: cs.db });
  const positions = ctx.getRebarPositions(L, cs.b, cs.h, cs.cover);
  const bars = ctx.buildBars(cs.b, cs.h, cs.cover, L);
  const mat = { fc: cs.fc, fy: cs.fy, Es: cs.Es, beta1: cs.beta1, phiComp: 0.65, phiTen: 0.90, PnMaxFactor: 0.80 };
  const sec = { b: cs.b, h: cs.h, bars };
  const curve = PMSection.curve(sec, mat, {}); // N、mm 輸入時：P/1000 → kN；M×1e5/1e6 → kN·m
  const nominal = curve.nominal.map(p => ({ P: p.P, M: p.M * 1e5 / 1e6, phi: p.phi, c: p.c }));
  const design = curve.design.map(p => ({ P: p.P, M: p.M * 1e5 / 1e6 }));
  const dt = Math.max(...bars.map(r => r.y));
  const epsTy = cs.fy / cs.Es;
  const at = c => {
    const r = PMSection.point(c, sec, mat);
    const eT = 0.003 * (dt - c) / c;
    return { c, P: r.Pn / 1000, M: Math.abs(r.Mn) / 1e6, epsT: eT, phi: PMSection.phiOf(eT, 0.65, 0.90, epsTy) };
  };
  const cb = 0.003 * dt / (0.003 + epsTy); // 平衡點：最外受拉鋼筋 εt = εty
  let lo = 1e-3 * cs.h, hi = cs.h;          // 純彎：二分 Pn(c) = 0
  for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (at(m).P > 0) hi = m; else lo = m; }
  out[cs.id] = {
    input: cs, positions: positions.map(p => ({ x: p.x, y: p.y, ab: p.ab })), bars, dt, epsTy,
    Po_kN: curve.Po, phiPnMax_kN: curve.phiPnMax, Ast: curve.Ast,
    balanced: at(cb), pureBending: at((lo + hi) / 2),
    scan: cs.cScan.map(r => at(r * cs.h)), nominal, design, samplePoints: curve.samplePoints
  };
}
fs.writeFileSync(path.join(OUT, 'out_tool.json'), JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) {
  console.log(k, 'Po', v.Po_kN.toFixed(1), 'kN; bal P', v.balanced.P.toFixed(1), 'M', v.balanced.M.toFixed(1),
    '; M0', v.pureBending.M.toFixed(1), 'c0', v.pureBending.c.toFixed(2), 'bars', v.bars.length, 'layers');
}
