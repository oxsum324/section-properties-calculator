/* shear-wall.html 回歸測試 (輕量 node, 無 playwright)。
 * 載入共用模組 (concrete/rebar/common/wall/pmsection) 至 vm，
 * 做：① 源碼結構守衛 ② PMSection/Wall 數值黃金案例。
 * 執行：node 鋼筋混凝土/tools/shear-wall-regression.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const swHtmlPath = path.join(__dirname, 'shear-wall.html');
const concretePath = path.join(ROOT, '..', '結構工具箱', 'core', 'materials', 'concrete.js');
const rebarPath = path.join(ROOT, '..', '結構工具箱', 'core', 'materials', 'rebar.js');
const commonPath = path.join(ROOT, 'shared', 'common.js');
const wallPath = path.join(ROOT, 'shared', 'wall.js');
const pmPath = path.join(ROOT, 'shared', 'pmsection.js');

function bootLibs() {
  const context = { console, Math };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of [concretePath, rebarPath, commonPath, wallPath, pmPath]) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return context;
}

let failed = 0;
function assert(pass, title, detail) {
  if (!pass) { failed++; console.error(`FAIL | ${title} :: ${detail}`); }
  else console.log(`PASS | ${title} | ${detail}`);
}
function near(a, b, rel, title) {
  const tol = Math.abs(b) * (rel == null ? 0.02 : rel) + 1e-6;
  assert(Math.abs(a - b) <= tol, title, `got=${a} expect=${b} tol=${tol.toFixed(3)}`);
}
function section(t) { console.log(`\n## ${t}`); }

// 與 shear-wall.html buildWallBars 對齊之縱筋分布
function buildWallBars(g, REBAR_TABLE) {
  const bars = [];
  const aBE = REBAR_TABLE[g.dBE].area, aV = REBAR_TABLE[g.dV].area;
  const rowsBE = Math.max(1, Math.round(g.nBE / 2));
  const AsRowBE = (g.nBE * aBE) / rowsBE;
  const y0 = g.cover, y1 = Math.max(g.cover + 0.1, g.lbe - g.cover);
  for (let k = 0; k < rowsBE; k++) {
    const yy = rowsBE === 1 ? (y0 + y1) / 2 : y0 + (y1 - y0) * k / (rowsBE - 1);
    bars.push({ y: yy, As: AsRowBE }); bars.push({ y: g.lw - yy, As: AsRowBE });
  }
  const webStart = g.lbe, webEnd = g.lw - g.lbe, AsRowWeb = g.nLayer * aV;
  if (webEnd > webStart && g.sV > 0) {
    const nWeb = Math.max(0, Math.round((webEnd - webStart) / g.sV));
    for (let i = 0; i < nWeb; i++) bars.push({ y: webStart + (i + 0.5) * (webEnd - webStart) / nWeb, As: AsRowWeb });
  }
  return bars;
}

function main() {
  const html = fs.readFileSync(swHtmlPath, 'utf8');
  const libs = bootLibs();
  const { Wall, PMSection, Concrete, Rebar } = libs;
  const { REBAR_TABLE } = Rebar;

  section('源碼結構守衛');
  // GitHub Pages 相對路徑 (絕對路徑會 404 — 見 feedback-github-pages-relative-paths)
  assert(html.includes('src="../shared/pmsection.js'), '載入共用 P-M 模組 (相對路徑)', 'pmsection.js relative');
  assert(html.includes('src="../shared/wall.js'), '載入共用牆模組 (相對路徑)', 'wall.js relative');
  assert(html.includes('src="../../結構工具箱/core/materials/concrete.js"'), '載入材料模組 (相對路徑)', 'concrete.js relative');
  assert(!/src="\/結構工具箱|src="\/鋼筋混凝土/.test(html), '無絕對路徑腳本', 'no absolute /結構工具箱 or /鋼筋混凝土 src');
  assert(html.includes('href="../index.html"'), '返回連結為相對路徑', 'back link relative');
  // 分頁與關鍵 id
  ['data-tab="pm"', 'data-tab="shear"', 'data-tab="detail"'].forEach(t =>
    assert(html.includes(t), `具分頁 ${t}`, 'tab present'));
  ['id="pmSvg"', 'id="sectionSvg"', 'id="r-phiMn"', 'id="c-shear"', 'id="s-sbeReq"', 'id="r-rhol"', 'id="caseJson"',
   'id="r-phiShear"', 'id="c-sbeAsh"', 'id="c-sbeSp"', 'id="dTie"'].forEach(id =>
    assert(html.includes(id), `具結果節點 ${id}`, 'id present'));
  assert(html.includes('21.2.4.1'), '剪力 φ 引用 21.2.4.1', 'shear phi clause');
  assert(html.includes('18.10.6.4'), 'SBE 圍束筋引用 18.10.6.4', 'SBE confinement clause');
  // SVG 需 xmlns (計算書內嵌不空白 — 見 feedback-svg-popup-xmlns)
  assert((html.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g) || []).length >= 2, 'SVG 皆含 xmlns', 'pm+section svg xmlns');
  // 關鍵函式與案例
  ['const SW_TEST_CASES', 'function calcShearWall', 'function buildWallBars', 'function buildReport', 'function drawPMDiagram'].forEach(fn =>
    assert(html.includes(fn), `具函式 ${fn}`, 'function present'));
  assert(html.includes('rc-pending'), '採 rc-pending 隱藏未觸及項目', 'rc-pending used');

  section('面內撓曲 P-M (黃金案例：細長結構牆)');
  const g = { fc:280, fy:4200, fyt:4200, lambda:1.0, tw:30, lw:500, hw:1500, cover:5,
    Pu:150, Mu:650, Vu:160, duhw:0.010, nBE:12, dBE:'#7', lbe:75, dV:'#4', sV:20, nLayer:2, dH:'#4', sH:20 };
  const bars = buildWallBars(g, REBAR_TABLE);
  const pm = PMSection.curve({ b:g.tw, h:g.lw, bars }, { fc:g.fc, fy:g.fy }, { steps:140 });
  near(pm.Po, 4119.56, 0.01, 'Po 標稱軸壓');
  near(pm.phiPnMax, 0.65 * 0.80 * 4119.56, 0.01, 'φPn,max = φc·0.80·Po');
  const cAtPu = PMSection.cAtP(pm.nominal, g.Pu);
  near(cAtPu, 69.2, 0.05, '@Pu 中性軸 c');
  const dem = PMSection.checkDemand(pm.design, g.Pu, g.Mu);
  near(dem.phiMn, 1466.9, 0.02, 'φMn @Pu');
  assert(dem.ok === true && dem.util < 1, '需求 Mu 落於封包內', `util=${dem.util.toFixed(3)}`);

  section('面內剪力 (Wall.*)');
  const Ag = g.tw * g.lw, hwlw = g.hw / g.lw;
  const aH = REBAR_TABLE[g.dH].area;
  const rhot = (g.nLayer * aH) / (g.tw * g.sH);
  const alpha_c = Wall.alphaC(hwlw);
  near(alpha_c, 0.53, 1e-9, 'αc (hw/ℓw=3 → 0.53)');
  const Vn = Wall.vn({ Acv:Ag, alpha_c, lambda:g.lambda, fc:g.fc, rhot, fy:g.fyt });
  near(Vn / 1000, 399.1, 0.01, 'Vn');
  assert(0.75 * Vn / 1000 >= g.Vu, 'φVn ≥ Vu', `φVn=${(0.75*Vn/1000).toFixed(1)} ≥ ${g.Vu}`);

  section('特殊邊界構材 (18.10.6)');
  const S = g.tw * g.lw * g.lw / 6;
  const sigma = g.Pu * 1000 / Ag + g.Mu * 1e5 / S;
  near(sigma, 62, 1e-6, '邊緣應力 σ=Pu/Ag+Mu/S');
  assert(sigma > 0.2 * g.fc, '應力法觸發 SBE (σ>0.2fc\')', `σ=${sigma} > ${0.2*g.fc}`);
  const cLimit = Wall.beStrainTrigger(g.lw, Math.max(0.005, g.duhw));
  near(cLimit, 55.56, 0.01, 'c 上限 ℓw/[600·1.5·δu/hw]');
  assert(cAtPu >= cLimit, '應變法觸發 SBE (c≥c上限)', `c=${cAtPu.toFixed(1)} ≥ ${cLimit.toFixed(1)}`);

  section('剪力 φ (規範 21.2.4.1) ＆ 圍束筋 (18.10.6.4)');
  // 標稱撓曲 Mn@Pu (內插標稱曲線，對應因數化軸力)
  let MnNom = null;
  for (let i = 0; i < pm.nominal.length - 1; i++) {
    const A = pm.nominal[i], B = pm.nominal[i + 1];
    if ((A.P - g.Pu) * (B.P - g.Pu) <= 0 && A.P !== B.P) {
      const t = (g.Pu - A.P) / (B.P - A.P), M = A.M + t * (B.M - A.M);
      if (MnNom == null || M > MnNom) MnNom = M;
    }
  }
  const Vmn = g.Vu * (MnNom / g.Mu);   // 撓曲強度發展對應之剪力 (tf)
  const phiFor = (dH, sH) => {
    const rt = (g.nLayer * REBAR_TABLE[dH].area) / (g.tw * sH);
    const vn = Wall.vn({ Acv: Ag, alpha_c, lambda: g.lambda, fc: g.fc, rhot: rt, fy: g.fyt }) / 1000;
    return { vn, phi: vn < Vmn ? 0.60 : 0.75 };
  };
  // 低橫筋 → Vn≪Vmn → 撓曲控制 → φ=0.60
  const lowRt = phiFor('#3', 40);
  assert(lowRt.phi === 0.60, '低橫筋牆 φ=0.60 (Vn<Vmn, 防脆性剪力)', `Vn=${lowRt.vn.toFixed(0)} < Vmn=${Vmn.toFixed(0)} tf`);
  // 高橫筋 → Vn≫Vmn → 剪力充裕 → φ=0.75
  const highRt = phiFor('#5', 10);
  assert(highRt.phi === 0.75, '高橫筋牆 φ=0.75 (Vn≥Vmn)', `Vn=${highRt.vn.toFixed(0)} ≥ Vmn=${Vmn.toFixed(0)} tf`);
  // 圍束筋 Ash
  const bc = g.tw - 2 * g.cover, hx = 15;
  const so = Math.min(15, Math.max(10, 10 + (35 - hx) / 3));
  const sbeSpLimit = Math.min(Math.min(g.tw, g.lbe) / 3, 6 * REBAR_TABLE[g.dBE].db, so);
  near(sbeSpLimit, 10, 1e-6, '圍束筋間距上限 min(d/3,6db,so)');
  const AshReq = (0.09 * g.fc / g.fyt) * 10 * bc;   // sTie=10
  const AshProv = 4 * REBAR_TABLE['#4'].area;        // 4 肢 #4
  assert(AshProv >= AshReq, 'Ash 提供 ≥ 需求 (0.09·s·bc·fc/fyt)', `${AshProv.toFixed(2)} ≥ ${AshReq.toFixed(2)} cm²`);

  section('矮牆 αc (剪力控制)');
  near(Wall.alphaC(1.0), 0.80, 1e-9, 'αc (hw/ℓw=1 → 0.80)');

  if (failed) { console.error(`\n✗ ${failed} 項失敗`); process.exit(1); }
  console.log('\nAll shear-wall regression checks passed.');
}

main();
