const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const concretePath = path.join(ROOT, '..', '結構工具箱', 'core', 'materials', 'concrete.js');
const rebarPath = path.join(ROOT, '..', '結構工具箱', 'core', 'materials', 'rebar.js');
const commonPath = path.join(ROOT, 'shared', 'common.js');
const wallPath = path.join(ROOT, 'shared', 'wall.js');
const pmPath = path.join(ROOT, 'shared', 'pmsection.js');
const basePath = path.join(ROOT, 'shared', 'wall-base.js');

function boot() {
  const context = { console, Math };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of [concretePath, rebarPath, commonPath, wallPath, pmPath, basePath]) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return context;
}

let failed = 0;
function assert(pass, title, detail = '') {
  if (!pass) {
    failed++;
    console.error(`FAIL | ${title} :: ${detail}`);
  } else {
    console.log(`PASS | ${title} | ${detail}`);
  }
}
function near(a, b, rel, title) {
  const tol = Math.abs(b) * rel + 1e-6;
  assert(Math.abs(a - b) <= tol, title, `got=${a} expect=${b} tol=${tol}`);
}

function sampleInput(overrides = {}) {
  return Object.assign({
    seismic: true,
    scopeSingleWall: true,
    scopeNoOpening: true,
    scopeAnalysisReady: true,
    fc: 280,
    fy: 4200,
    fyt: 4200,
    lambda: 1.0,
    tw: 30,
    lw: 500,
    hw: 1500,
    cover: 5,
    Pu: 150,
    Mu: 650,
    Vu: 160,
    duhw: 0.01,
    shearDemandMode: 'direct',
    Vuns: 0,
    VuEh: 160,
    omegaV: 1.5,
    omegaW: 1.0,
    nBE: 12,
    dBE: '#7',
    lbe: 75,
    dV: '#4',
    sV: 20,
    nLayer: 2,
    dH: '#4',
    sH: 20,
    hasJoint: true,
    jointSurface: 'not_roughened',
    dTie: '#4',
    sTie: 10,
    nLegTie: 4,
    hx: 15,
    hu: 300,
    bComp: 30,
  }, overrides);
}

function main() {
  const { WallBase } = boot();
  const g = sampleInput();
  const base = WallBase.buildBase(g);

  assert(base.scopeOk === true && base.geomModelOk === true && base.fcOk === true, '基本幾何與範圍 OK', JSON.stringify({ scopeOk: base.scopeOk, geomModelOk: base.geomModelOk }));
  near(base.Ag, 15000, 0.0001, 'Ag=tw*lw');
  near(base.Acv, 15000, 0.0001, 'Acv=tw*lw');
  near(base.hwlw, 3, 0.0001, 'hw/lw');
  assert(base.bars.length > 20 && base.AstTotal > 0, '組出邊界與腹部縱筋 bars', JSON.stringify({ bars: base.bars.length, Ast: base.AstTotal }));
  near(base.rhol, 0.004233333333333333, 0.01, '腹部縱筋比');
  near(base.rhot, 0.004233333333333333, 0.01, '腹部橫筋比');

  near(base.pm.Po, 4119.56, 0.01, 'P-M Po');
  near(base.dem.phiMn, 1466.9, 0.03, 'P-M phiMn@Pu');
  assert(base.pmAxialOk === true && base.dem.ok === true, 'P-M 需求在封包內', JSON.stringify({ util: base.dem.util }));

  near(base.alpha_c, 0.53, 0.001, 'alpha_c');
  near(base.Vn, 399098.9, 0.01, 'Vn');
  near(base.VnMaxSingle, 665148.5, 0.01, 'VnMaxSingle');

  near(base.bc, 20, 0.0001, 'SBE bc');
  near(base.sbeSpLimit, 10, 0.0001, 'SBE spacing limit uses boundary db');
  near(base.AshReq, 1.2, 0.0001, 'Ash requirement');
  near(base.AshProv, 5.068, 0.0001, 'Ash provided');

  near(base.spVmax, 45, 0.0001, 'vertical spacing max');
  near(base.spHmax, 45, 0.0001, 'horizontal spacing max');
  assert(base.shearFricSurface.mu === 0.6, 'not roughened shear friction mu', JSON.stringify(base.shearFricSurface));
  near(base.shearFricAvfProv, 138.708, 0.001, 'shear friction Avf provided');
  near(base.shearFricBoundaryAvf, 93.096, 0.001, 'boundary Avf provided');
  near(base.shearFricWebAvf, 45.612, 0.001, 'web Avf provided');

  const invalid = WallBase.buildBase(sampleInput({ cover: 20, lbe: 30, scopeNoOpening: false }));
  assert(invalid.scopeOk === false && invalid.scopeWarnings.length === 1, 'scope warning captured', invalid.scopeWarnings.join(' / '));
  assert(invalid.geomModelOk === false && invalid.geomModelIssues.length >= 2, 'geometry invalid issues captured', invalid.geomModelIssues.join(' / '));

  if (failed) {
    console.error(`\n${failed} wall base tests failed.`);
    process.exit(1);
  }
  console.log('\nAll wall base tests passed.');
}

main();
