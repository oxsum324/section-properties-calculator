const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const RC_ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.RC_TEST_PORT || 8124);
const TOOL_URL = `http://127.0.0.1:${PORT}/%E9%8B%BC%E7%AD%8B%E6%B7%B7%E5%87%9D%E5%9C%9F/tools/beam.html`;
const COLUMN_URL = `http://127.0.0.1:${PORT}/%E9%8B%BC%E7%AD%8B%E6%B7%B7%E5%87%9D%E5%9C%9F/tools/column.html`;
const beamPath = path.join(__dirname, 'beam.html');
const casesPath = path.join(__dirname, 'beam-regression-cases.json');
const concretePath = path.join(ROOT, '結構工具箱', 'core', 'materials', 'concrete.js');
const rebarPath = path.join(ROOT, '結構工具箱', 'core', 'materials', 'rebar.js');
const flexurePath = path.join(RC_ROOT, 'shared', 'flexure.js');
const commonPath = path.join(RC_ROOT, 'shared', 'common.js');
const toleranceDefault = 0.001;
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function section(title) {
  console.log(`\n## ${title}`);
}

function serveStatic(rootDir, port = PORT) {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
  };
  const server = http.createServer((req, res) => {
    const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const safePath = path.normalize(path.join(rootDir, reqPath === '/' ? 'index.html' : reqPath));
    if (!safePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(safePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(safePath).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

function bootLibs() {
  const context = { console, window: {}, Math };
  context.window = context;
  vm.createContext(context);
  for (const file of [concretePath, rebarPath, flexurePath]) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return context;
}

function getBeamShape(sectionType, direction, bw, bf, hf) {
  if (sectionType === 'rect') return { type: 'rect', b: bw };
  return { type: sectionType, bw, bf, hf, flangeOnComp: direction === 'pos' };
}

function calcPhiFromEpsT(epsT, fy, PHI) {
  const epsY = fy / 2.04e6;
  if (epsT >= 0.005) return PHI.tension;
  if (epsT <= epsY) return 0.65;
  return 0.65 + (PHI.tension - 0.65) * (epsT - epsY) / (0.005 - epsY);
}

function solveTrialFlexure(Flexure, PHI, opt) {
  const { sectionType, direction, h, bw, bf, hf, fc, fy, beta1, dEff, AsTension, AsComp = 0, dComp = 0 } = opt;
  if (AsTension <= 0 || dEff <= 0) return { phiMn_kgcm: 0, valid: false };
  const layers = [{ y: dEff, As: AsTension }];
  if (AsComp > 0 && dComp > 0) layers.unshift({ y: dComp, As: AsComp });
  const shape = getBeamShape(sectionType, direction, bw, bf, hf);
  const sc = Flexure.solveSection({ shape, h, layers, fc, fy, beta1 });
  const phi = calcPhiFromEpsT(sc.epsT_max, fy, PHI);
  return { phiMn_kgcm: phi * sc.Mn, Mn_kgcm: sc.Mn, a: sc.a, epsT: sc.epsT_max, phi, valid: sc.valid };
}

function calcRequiredAsByAnalysis(Flexure, PHI, opt) {
  const { Mu_kgcm, sectionType, direction, h, bw, bf, hf, fc, fy, beta1, dEff, AsComp = 0, dComp = 0, AsMin = 0 } = opt;
  if (Mu_kgcm <= 0 || dEff <= 0) return 0;
  let low = 0;
  let high = Math.max(AsMin, 0.1);
  let trial = solveTrialFlexure(Flexure, PHI, { sectionType, direction, h, bw, bf, hf, fc, fy, beta1, dEff, AsTension: high, AsComp, dComp });
  let guard = 0;
  while (trial.phiMn_kgcm < Mu_kgcm && high < bw * h * 0.6 && guard < 40) {
    high *= 2;
    trial = solveTrialFlexure(Flexure, PHI, { sectionType, direction, h, bw, bf, hf, fc, fy, beta1, dEff, AsTension: high, AsComp, dComp });
    guard += 1;
  }
  if (trial.phiMn_kgcm < Mu_kgcm) return high;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    const res = solveTrialFlexure(Flexure, PHI, { sectionType, direction, h, bw, bf, hf, fc, fy, beta1, dEff, AsTension: mid, AsComp, dComp });
    if (res.phiMn_kgcm >= Mu_kgcm) high = mid;
    else low = mid;
  }
  return Math.max(high, AsMin);
}

function calcSmrfSpacingDbFactor(fy) {
  if (fy <= 4200) return 6;
  if (fy <= 5000) return 5.5;
  return 5;
}

function calcSmrfSpacingLimit(d, dbMinAll, fy) {
  return Math.min(d / 4, 15, calcSmrfSpacingDbFactor(fy) * dbMinAll);
}

function nearlyEqual(a, b, tolerance) {
  if (a == null && b == null) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  if (typeof a === 'string' || typeof b === 'string') return String(a) === String(b);
  if (typeof a !== 'number' || typeof b !== 'number') return a === b;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= tolerance;
}

function cleanNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}

function sanitizeSnapshot(actual) {
  const out = {};
  Object.entries(actual).forEach(([key, value]) => {
    out[key] = cleanNumber(value);
  });
  return out;
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function applyCase(page, tc) {
  await page.evaluate(tcCase => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!value;
      } else {
        el.value = String(value);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    document.querySelector(`.mode-btn[data-mode="${tcCase.mode}"]`)?.click();
    Object.entries(tcCase.checkboxes || {}).forEach(([id, value]) => setField(id, value));
    Object.entries(tcCase.selects || {}).forEach(([id, value]) => setField(id, value));
    Object.entries(tcCase.values || {}).forEach(([id, value]) => setField(id, value));

    if (typeof window.syncToggles === 'function') window.syncToggles();
    if (typeof window.calcBeam === 'function') window.calcBeam();
    document.querySelector('.section-tabs button[data-tab="summary"]')?.click();
  }, tc);
  await wait(300);
}

async function captureBeamSnapshot(page) {
  const raw = await page.evaluate(() => {
    const r = window.beamLast || {};
    const text = id => document.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    return {
      mode: document.querySelector('.mode-btn.active')?.dataset.mode ?? null,
      banner: text('bannerStatus'),
      sectionType: r.sectionType ?? null,
      support: r.support ?? null,
      seismic: r.seismic ?? null,
      enableTorsion: r.enableTorsion ?? null,
      enableDefl: r.enableDefl ?? null,
      enableExactDefl: r.enableExactDefl ?? null,
      fc: r.fc ?? null,
      fy: r.fy ?? null,
      fyt: r.fyt ?? null,
      bw: r.bw ?? null,
      h: r.h ?? null,
      ln: r.ln ?? null,
      d: r.d ?? null,
      d_pos: r.d_pos ?? null,
      d_neg: r.d_neg ?? null,
      AsBot: r.AsBot ?? null,
      AsTop: r.AsTop ?? null,
      AsReqPos: r.AsReqPos ?? null,
      AsReqNeg: r.AsReqNeg ?? null,
      AsFlexReqPos: r.AsFlexReqPos ?? null,
      AsFlexReqNeg: r.AsFlexReqNeg ?? null,
      AsMinPos: r.AsMinPos ?? null,
      AsMinNeg: r.AsMinNeg ?? null,
      AsMinPosB: r.AsMinPosInfo?.bAsMin ?? null,
      AsMinNegB: r.AsMinNegInfo?.bAsMin ?? null,
      AsMinPosBSource: r.AsMinPosInfo?.bSource ?? null,
      AsMinNegBSource: r.AsMinNegInfo?.bSource ?? null,
      AsMinPosBSourceText: r.AsMinPosInfo?.bSourceText ?? null,
      AsMinNegBSourceText: r.AsMinNegInfo?.bSourceText ?? null,
      AsMinNegFlangeInTension: r.AsMinNegInfo?.flangeInTension ?? null,
      phiMnPos: r.phiMnPos ?? null,
      phiMnNeg: r.phiMnNeg ?? null,
      MnPos_raw: r.MnPos_raw ?? null,
      MnNeg_raw: r.MnNeg_raw ?? null,
      beamJointTarget: r.beamColumnJoint?.targetId ?? null,
      beamJointMnb: r.beamColumnJoint?.values?.mnbControl ?? null,
      beamJointMprSum: r.beamColumnJoint?.values?.mprSum ?? null,
      beamJointVeCap: r.beamColumnJoint?.values?.veCap ?? null,
      ldReq: r.developmentData?.ldReq ?? null,
      ldBot: r.developmentData?.ldBot ?? null,
      ldTop: r.developmentData?.ldTop ?? null,
      lapReq: r.developmentData?.lapReq ?? null,
      leftAnchorage: r.developmentData?.leftAnchorage ?? null,
      rightAnchorage: r.developmentData?.rightAnchorage ?? null,
      leftAnchorageType: r.developmentData?.leftType ?? null,
      rightAnchorageType: r.developmentData?.rightType ?? null,
      leftAnchorageTypeLabel: r.developmentData?.leftTypeLabel ?? null,
      rightAnchorageTypeLabel: r.developmentData?.rightTypeLabel ?? null,
      developmentManualReview: r.developmentData?.developmentManualReview ?? null,
      developmentHasInput: r.developmentData?.hasAnchorageInput ?? null,
      developmentHasCompleteInput: r.developmentData?.hasCompleteAnchorageInput ?? null,
      lapHasAnyInput: r.developmentData?.lapHasAnyInput ?? null,
      lapManualReview: r.developmentData?.lapManualReview ?? null,
      lapStart: r.developmentData?.lapStart ?? null,
      lapEnd: r.developmentData?.lapEnd ?? null,
      lapLength: r.developmentData?.lapLength ?? null,
      okAnchorageLeft: r.developmentData?.okLeftAnchorage ?? null,
      okAnchorageRight: r.developmentData?.okRightAnchorage ?? null,
      okLapLength: r.developmentData?.okLapLength ?? null,
      okBeamLapZone: r.developmentData?.okLapZone ?? null,
      okFlex: r.okFlex ?? null,
      okFlexPos: r.okFlexPos ?? null,
      okFlexNeg: r.okFlexNeg ?? null,
      phiVn_tf: r.phiVn_kgf != null ? r.phiVn_kgf / 1000 : null,
      phiVc_tf: r.phiVc_kgf != null ? r.phiVc_kgf / 1000 : null,
      phiVs_tf: r.phiVs_kgf != null ? r.phiVs_kgf / 1000 : null,
      Vu_in: r.Vu_in ?? null,
      Ve_in: r.Ve_in ?? null,
      shearDemandTf: r.shearDemand != null ? r.shearDemand / 1000 : null,
      shearDemandSource: r.shearDemandSource ?? null,
      okShear: r.okShear ?? null,
      okShearStrength: r.okShearStrength ?? null,
      okShearMin: r.okShearMin ?? null,
      okShearSpacing: r.okShearSpacing ?? null,
      needsMinStir: r.needsMinStir ?? null,
      needsShearRebar: r.needsShearRebar ?? null,
      Av: r.Av ?? null,
      AvProvidedPerS: r.AvProvidedPerS ?? null,
      AvMinPerS: r.AvMinPerS ?? null,
      lambdaS: r.lambdaS ?? null,
      rhoForVc: r.rhoForVc ?? null,
      axialFactor: r.axialFactor ?? null,
      vcBaseStress: r.vcBaseStress ?? null,
      axialStress: r.axialStress ?? null,
      vcSimpleStress: r.vcSimpleStress ?? null,
      vcRhoStress: r.vcRhoStress ?? null,
      shearSpacingLimit: r.shearSpacingLimit ?? null,
      legSpacing: r.legSpacing ?? null,
      shearLegSpacingLimit: r.shearLegSpacingLimit ?? null,
      forceVc0: r.forceVc0 ?? null,
      okBw: r.okBw ?? null,
      okLn: r.okLn ?? null,
      okBwRaw: r.okBwRaw ?? null,
      okLnRaw: r.okLnRaw ?? null,
      smrfMnMin: r.smrfMnMin ?? null,
      mnQuarterReq: r.mnQuarterReq ?? null,
      hasMnQuarterInput: r.hasMnQuarterInput ?? null,
      okMnQuarter: r.okMnQuarter ?? null,
      firstHoopDist: r.firstHoopDist ?? null,
      hasFirstHoopInput: r.hasFirstHoopInput ?? null,
      okFirstHoop: r.okFirstHoop ?? null,
      okRhoMax: r.okRhoMax ?? null,
      okAsMin: r.okAsMin ?? null,
      okAsMinBot: r.okAsMinBot ?? null,
      okAsMinTop: r.okAsMinTop ?? null,
      AsMinPosMode: r.asMinCheckPos?.mode ?? null,
      AsMinNegMode: r.asMinCheckNeg?.mode ?? null,
      AsMinPosWaiverReq: r.asMinCheckPos?.waiverReq ?? null,
      AsMinNegWaiverReq: r.asMinCheckNeg?.waiverReq ?? null,
      needSkin: r.needSkin ?? null,
      okSkin: r.okSkin ?? null,
      skinSpacing: r.skinSpacing ?? null,
      skinSpacingLimit: r.skinSpacingLimit ?? null,
      skinRequiredPerTensionFace: r.skinRequiredPerTensionFace ?? null,
      skinZoneText: r.skinZoneText ?? null,
      skinAreaEachSidePerZone: r.skinAreaEachSidePerZone ?? null,
      skinAreaTotalBothSides: r.skinAreaTotalBothSides ?? null,
      okCrackSpacing: r.okCrackSpacing ?? null,
      crackSpacingLimit: r.crackSpacingLimit ?? null,
      crackSpacingText: r.crackSpacingText ?? null,
      crackFaces: (r.crackFaces || []).filter(f => f.active).map(f => ({
        faceLabel: f.faceLabel,
        n: f.n,
        barNo: f.barNo,
        spacing: f.spacing,
        ok: f.ok,
        text: f.text
      })),
      torNegligible: r.torNegligible ?? null,
      torsionNeedsDesign: r.torsionNeedsDesign ?? null,
      torsionStatusOk: r.torsionStatusOk ?? null,
      torsionDetailOk: r.torsionDetailOk ?? null,
      torsionDesignStatus: r.torsionDesignStatus ?? null,
      torsionAtPerS: r.torsionAtPerS ?? null,
      torsionAl: r.torsionAl ?? null,
      Tu_th_tfm: r.Tu_th != null ? r.Tu_th / 1e5 : null,
      hmin: r.hmin ?? null,
      okHmin: r.okHmin ?? null,
      okDeflOverall: r.okDeflOverall ?? null,
      deflNeedsExact: r.deflNeedsExact ?? null,
      deflManualReview: r.deflManualReview ?? null,
      deflStatusText: r.deflStatusText ?? null,
      deflDirection: r.defl?.deflDirection ?? null,
      deflMaUseTf: r.defl?.Ma_use_tf ?? null,
      deflIeUse: r.defl?.IeUse ?? r.defl?.IeAvg ?? null,
      deflIeUseSource: r.defl?.ieUseSource ?? null,
      deflRhoPrime: r.defl?.rhoPrime ?? null,
      deflRhoPrimeSource: r.defl?.rhoPrimeSource ?? null,
      deflLambdaLT: r.defl?.lambdaLT ?? null,
      deflDeltaImm: r.defl?.deltaImm ?? null,
      deflDeltaLT: r.defl?.deltaLT ?? null,
      deflOk: r.defl?.okDefl ?? null,
      reportBasisVisible: document.body.textContent.includes('112 年混凝土結構設計規範'),
      cShearMin: text('c-shearMin'),
      cShearSpacing: text('c-shearSpacing'),
      cAsMinBot: text('c-AsMinBot'),
      cAsMinTop: text('c-AsMinTop'),
      cSkin: text('c-skin'),
      cCrackSpacing: text('c-crackSpacing'),
      cHmin: text('c-hmin'),
      cDevLeft: text('c-devLeft'),
      cDevRight: text('c-devRight'),
      cLapLength: text('c-lapLength'),
      cTorDetail: text('c-torDetail'),
      sLapZone: text('s-lapZone')
    };
  });
  return sanitizeSnapshot(raw);
}

async function captureBeamReportHtml(page) {
  return page.evaluate(() => {
    let html = '';
    const previousOpen = window.open;
    window.open = () => ({
      document: {
        open() {},
        write(chunk) { html += String(chunk); },
        close() {}
      },
      close() {},
      closed: false
    });
    try {
      window.buildBeamReport();
    } finally {
      window.open = previousOpen;
    }
    return html;
  });
}

async function runBeamColumnHandoffCase(page) {
  section('Beam Column Joint Handoff');
  await page.goto(TOOL_URL, { waitUntil: 'networkidle' });
  await applyCase(page, {
    key: 'beam_column_joint_handoff',
    mode: 'check',
    checkboxes: { seismicMode: true },
    values: {
      fc: 280, fy: 4200, fyt: 4200, bw: 40, h: 70, ln: 600, colW: 60,
      MuPos: 85, MuNeg: 125, Vu: 35, Ve: 42, stirS: 10, legs: 4,
      botBar1N: 4, botBar1No: '#8', topBar1N: 5, topBar1No: '#8'
    }
  });
  const payload = await page.evaluate(() => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setField('beamJointTarget', 'scwbBeamXLeft');
    setField('beamJointMprFactor', 1.25);
    window.calcBeam();
    const p = window.buildBeamColumnJointPayload();
    window.localStorage.setItem('rc.pendingBeamColumnJoint', JSON.stringify(p));
    return p;
  });
  assert(payload?.schema === 'rc-beam-column-joint-v1', 'beam joint payload schema', `schema=${payload?.schema}`);
  assert(payload.columnFields.scwbBeamXLeft > 0, 'beam joint Mnb payload', `Mnb=${payload.columnFields.scwbBeamXLeft}`);
  assert(payload.columnFields.VeBeamCapX > 0, 'beam joint Ve cap payload', `VeCap=${payload.columnFields.VeBeamCapX}`);

  await page.goto(COLUMN_URL + '?beamJoint=1', { waitUntil: 'networkidle' });
  await wait(600);
  const actual = await page.evaluate(() => {
    const num = id => parseFloat(document.getElementById(id)?.value) || 0;
    const r = window.colLast || {};
    return {
      seismicMode: document.getElementById('seismicMode')?.checked ?? false,
      scwbBeamXLeft: num('scwbBeamXLeft'),
      VeBeamCapX: num('VeBeamCapX'),
      importSchema: r.beamJointImport?.schema ?? null,
      importTarget: r.beamJointImport?.targetId ?? null,
      scwbBeamA: r.scwb?.x?.beamA ?? null,
      scwbActive: r.scwb?.x?.active ?? null,
      veCapX: r.veDemand?.capX ?? null,
      storageCleared: window.localStorage.getItem('rc.pendingBeamColumnJoint') == null
    };
  });
  assert(actual.seismicMode === true, 'column import enables seismic mode', `seismicMode=${actual.seismicMode}`);
  assert(nearlyEqual(actual.scwbBeamXLeft, payload.columnFields.scwbBeamXLeft, 0.01), 'column import writes SCWB beam field', `expected=${payload.columnFields.scwbBeamXLeft} actual=${actual.scwbBeamXLeft}`);
  assert(nearlyEqual(actual.VeBeamCapX, payload.columnFields.VeBeamCapX, 0.01), 'column import writes Ve cap field', `expected=${payload.columnFields.VeBeamCapX} actual=${actual.VeBeamCapX}`);
  assert(actual.importSchema === 'rc-beam-column-joint-v1', 'column snapshot keeps import schema', `schema=${actual.importSchema}`);
  assert(actual.importTarget === 'scwbBeamXLeft', 'column snapshot keeps import target', `target=${actual.importTarget}`);
  assert(actual.scwbActive === true, 'column SCWB X active after import', `active=${actual.scwbActive}`);
  assert(nearlyEqual(actual.scwbBeamA, payload.columnFields.scwbBeamXLeft, 0.01), 'column SCWB uses imported Mnb', `expected=${payload.columnFields.scwbBeamXLeft} actual=${actual.scwbBeamA}`);
  assert(nearlyEqual(actual.veCapX, payload.columnFields.VeBeamCapX, 0.01), 'column Ve demand uses imported beam cap', `expected=${payload.columnFields.VeBeamCapX} actual=${actual.veCapX}`);
  assert(actual.storageCleared === true, 'column import clears pending storage', `storageCleared=${actual.storageCleared}`);
}

async function runBrowserCases() {
  section('Browser Regression Cases');
  const pack = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const tolerance = pack.tolerance ?? toleranceDefault;
  const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  assert(!!chromePath, 'browser executable', 'system Chrome/Edge found for beam regression test');

  const server = await serveStatic(ROOT, PORT);
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage();
  const pageErrors = [];
  const failedResponses = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('response', res => {
    if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`);
  });

  const captured = [];
  try {
    await page.goto(TOOL_URL, { waitUntil: 'networkidle' });
    await wait(300);
    assert(pageErrors.length === 0, 'beam page boot', 'no page errors during initial load');
    assert(failedResponses.length === 0, 'beam page resources', 'no missing static resources during initial load');

    for (const tc of pack.cases) {
      await applyCase(page, tc);
      const actual = await captureBeamSnapshot(page);
      captured.push({ key: tc.key, actual });

      if (process.env.BEAM_PRINT_ACTUAL === '1') continue;
      const expectedEntries = Object.entries(tc.expected || {});
      assert(expectedEntries.length > 0, `${tc.key} :: expected metrics`, 'case has locked expected metrics');
      expectedEntries.forEach(([key, expected]) => {
        const pass = nearlyEqual(actual[key], expected, tolerance);
        assert(pass, `${tc.key} :: ${key}`, `expected=${expected} actual=${actual[key]}`);
      });

      if (tc.reportExpectedIncludes) {
        const reportHtml = await captureBeamReportHtml(page);
        const fragments = Array.isArray(tc.reportExpectedIncludes) ? tc.reportExpectedIncludes : [tc.reportExpectedIncludes];
        fragments.forEach(fragment => {
          assert(reportHtml.includes(fragment), `${tc.key} :: report includes`, `expected fragment=${fragment}`);
        });
      }
    }


    await runBeamColumnHandoffCase(page);
    if (process.env.BEAM_PRINT_ACTUAL === '1') {
      console.log(JSON.stringify(captured, null, 2));
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  const beamHtml = fs.readFileSync(beamPath, 'utf8');
  const sharedCommon = fs.readFileSync(commonPath, 'utf8');
  section('Source Helpers');
  assert(beamHtml.includes('function calcSmrfSpacingDbFactor'), 'beam.html has calcSmrfSpacingDbFactor', 'helper exists in source');
  assert(beamHtml.includes('function calcBischoffIe'), 'beam.html has calcBischoffIe', 'helper exists in source');
  assert(beamHtml.includes('function calcMainBarCrackControlData'), 'beam.html has main-bar crack-control check', '24.3.2 spacing is applied to primary tension reinforcement');
  assert(beamHtml.includes('deflManualReview'), 'beam.html has deflection manual-review status', 'span-depth non-exemption is not treated as automatic NG');
  assert(beamHtml.includes("support === 'cantilever'") && beamHtml.includes('Ma_use_tf'), 'beam.html has cantilever deflection direction logic', 'cantilever exact deflection uses negative-moment critical section');
  assert(beamHtml.includes('function calcSmrfSpacingLimit'), 'beam.html has calcSmrfSpacingLimit', 'helper exists in source');
  assert(beamHtml.includes('function getCrackingStateText'), 'beam.html has getCrackingStateText', 'helper exists in source');
  assert(beamHtml.includes('function calcAsMinInfo'), 'beam.html has calcAsMinInfo', 'T/L beam As,min width helper exists in source');
  assert(beamHtml.includes('bSourceText'), 'beam.html exposes As.min width source text', 'T/L beam As.min b source is report-visible');
  assert(beamHtml.includes('function calcAsMinCheck'), 'beam.html has calcAsMinCheck', 'As,min waiver source is explicit');
  assert(beamHtml.includes('function calcShearSizeFactor'), 'beam.html has calcShearSizeFactor', 'shear size-effect helper exists in source');
  assert(beamHtml.includes('function calcCrackSpacingLimit'), 'beam.html has calcCrackSpacingLimit', 'surface reinforcement spacing helper exists in source');
  assert(beamHtml.includes('function calcSkinReinforcementData'), 'beam.html has calcSkinReinforcementData', 'skin reinforcement zone helper exists in source');
  assert(beamHtml.includes('id="c-shearMin"'), 'beam.html has Av,min check result', 'minimum shear reinforcement is visible');
  assert(beamHtml.includes('id="c-shearSpacing"'), 'beam.html has shear spacing check result', 'shear reinforcement spacing is visible');
  assert(beamHtml.includes('表層筋 (h > 90 cm)'), 'beam.html labels surface reinforcement', 'skin reinforcement wording is report-safe');
  assert(beamHtml.includes('規範依據：112 年混凝土結構設計規範'), 'beam report declares code basis', 'report exposes code version');
  assert(beamHtml.includes('Nu/(6Ag)'), 'beam shear axial term is displayed as stress', 'avoids treating axial stress as a multiplier');
  assert(beamHtml.includes('shearDemand = seismic ? Math.max(Vu, Ve || 0) : Vu'), 'beam.html has SMRF shear demand control', 'seismic shear demand uses max(Vu, Ve)');
  const oldSmrfBeamClause = ['18', '6', '3', '2'].join('.');
  assert(!beamHtml.includes(oldSmrfBeamClause), 'beam.html does not use old SMRF beam clause label', 'uses 18.3.3.2 for beam moment ratio');
  assert(beamHtml.includes('id="stepsVerbosity"'), 'beam.html has steps verbosity selector', 'summary/full selector exists in source');
  assert(beamHtml.includes('id="warningCard"'), 'beam.html has warning card', 'warning panel exists in source');
  assert(beamHtml.includes('id="beamPreset"'), 'beam.html has beam preset selector', 'example-case selector exists in source');
  assert(beamHtml.includes('id="btnApplyPreset"'), 'beam.html has apply preset button', 'example-case apply button exists in source');
  assert(beamHtml.includes('btn-calc'), 'beam.html has visible calc button', 'manual calculate entry exists in source');
  assert(beamHtml.includes('function getStepsVerbosity'), 'beam.html uses shared-friendly verbosity helper', 'verbosity access is abstracted');
  assert(beamHtml.includes('reportFullSteps ? txt : summarizeStepText(txt)'), 'beam report respects steps verbosity', 'report steps follow summary/full mode');
  assert(sharedCommon.includes('window.RCUI.getStepsVerbosity'), 'shared/common.js exposes getStepsVerbosity', 'shared RCUI helper exists');
  assert(sharedCommon.includes('window.RCUI.renderWarningList'), 'shared/common.js exposes renderWarningList', 'shared warning renderer exists');
  assert(beamHtml.indexOf('const deflResult = calcDeflectionData(') < beamHtml.indexOf('const warnings = collectDesignWarnings('), 'beam.html computes deflection before warnings', 'avoids deflResult runtime reference error');
  assert(beamHtml.includes('rc.pendingBeamColumnJoint'), 'beam.html has beam-column joint storage key', 'handoff storage key exists');
  assert(beamHtml.includes('function calcBeamColumnJointData'), 'beam.html has beam-column joint payload builder', 'Mnb/Mpr handoff helper exists');
  assert(beamHtml.includes('id="beamJointTarget"'), 'beam.html has beam joint target selector', 'target selector exists');
  assert(beamHtml.includes('id="btnSendToColumn"'), 'beam.html has send-to-column button', 'column handoff command exists');
  assert(beamHtml.includes('function calcBeamDevelopmentData'), 'beam.html has development length helper', 'beam anchorage and splice helper exists');
  assert(beamHtml.includes('id="beamDevLeftType"'), 'beam.html has left anchorage type selector', 'anchorage type workflow is visible');
  assert(beamHtml.includes('BEAM_DEV_TYPE_LABELS'), 'beam.html has anchorage type labels', 'non-straight anchorage is classified for manual review');
  assert(beamHtml.includes('id="anchorageLeft"'), 'beam.html has left anchorage input', 'available anchorage length is user-visible');
  assert(beamHtml.includes('id="beamLapLength"'), 'beam.html has lap length input', 'splice length input is user-visible');
  assert(beamHtml.includes('id="c-devLeft"'), 'beam.html has anchorage check result', 'anchorage check result is visible');
  assert(beamHtml.includes('torsionNeedsDesign'), 'beam.html has torsion manual-review status', 'torsion beyond threshold is not treated as automatic NG');
  assert(beamHtml.includes('id="torsionDesignStatus"'), 'beam.html has torsion design status input', '22.7 torsion design conclusion can be entered');
  assert(beamHtml.includes('id="torsionAtPerS"'), 'beam.html has torsion transverse steel input', 'At/s can be disclosed in report');
  assert(beamHtml.includes('id="torsionAl"'), 'beam.html has torsion longitudinal steel input', 'Al can be disclosed in report');
  assert(beamHtml.includes('id="smrfMnMin"'), 'beam.html has SMRF span Mn input', 'span strength check can be entered instead of only reminded');
  assert(beamHtml.includes('id="firstHoopDist"'), 'beam.html has first hoop distance input', 'SMRF first hoop check can be entered instead of only reminded');
  assert(beamHtml.includes('column.html?beamJoint=1'), 'beam.html links to column joint import', 'column import URL exists');

  const libs = bootLibs();
  const { Flexure, Concrete, Rebar } = libs;
  const { PHI, calcBeta1 } = Concrete;
  const { REBAR_TABLE } = Rebar;

  section('Core Calculation Sanity');
  const rectBeta1 = calcBeta1(280);
  const rectAsLow = calcRequiredAsByAnalysis(Flexure, PHI, {
    Mu_kgcm: 50e5, sectionType: 'rect', direction: 'pos',
    h: 60, bw: 35, bf: 35, hf: 0, fc: 280, fy: 4200, beta1: rectBeta1, dEff: 54
  });
  const rectAsHigh = calcRequiredAsByAnalysis(Flexure, PHI, {
    Mu_kgcm: 70e5, sectionType: 'rect', direction: 'pos',
    h: 60, bw: 35, bf: 35, hf: 0, fc: 280, fy: 4200, beta1: rectBeta1, dEff: 54
  });
  assert(rectAsHigh > rectAsLow, '矩形梁 As 需求隨 Mu 增加', `As(50 tf·m)=${rectAsLow.toFixed(2)} cm², As(70 tf·m)=${rectAsHigh.toFixed(2)} cm²`);
  const rectTrial = solveTrialFlexure(Flexure, PHI, {
    sectionType: 'rect', direction: 'pos',
    h: 60, bw: 35, bf: 35, hf: 0, fc: 280, fy: 4200, beta1: rectBeta1, dEff: 54, AsTension: rectAsHigh
  });
  assert(rectTrial.phiMn_kgcm >= 70e5, '矩形梁反算 As 可滿足目標彎矩', `phiMn=${(rectTrial.phiMn_kgcm / 1e5).toFixed(2)} tf·m`);

  const beta1 = calcBeta1(280);
  const asPos = calcRequiredAsByAnalysis(Flexure, PHI, {
    Mu_kgcm: 140e5, sectionType: 'T', direction: 'pos',
    h: 70, bw: 40, bf: 120, hf: 15, fc: 280, fy: 4200, beta1, dEff: 63
  });
  const asNeg = calcRequiredAsByAnalysis(Flexure, PHI, {
    Mu_kgcm: 140e5, sectionType: 'T', direction: 'neg',
    h: 70, bw: 40, bf: 120, hf: 15, fc: 280, fy: 4200, beta1, dEff: 63
  });
  assert(asPos < asNeg, 'T 梁正負彎矩 As 需求不同', `As+ ${asPos.toFixed(2)} cm², As- ${asNeg.toFixed(2)} cm²`);
  const dbMin = REBAR_TABLE['#8'].db;
  assert(calcSmrfSpacingDbFactor(4200) === 6, 'SMRF fy=4200 對應 6db', 'dbFactor=6');
  assert(calcSmrfSpacingDbFactor(5000) === 5.5, 'SMRF fy=5000 對應 5.5db', 'dbFactor=5.5');
  assert(calcSmrfSpacingLimit(60, dbMin, 5600) < calcSmrfSpacingLimit(60, dbMin, 4200), 'SMRF 高強度橫向筋間距更嚴', 'fy=5600 uses 5db cap');

  await runBrowserCases();
  console.log('\nAll beam regression checks passed.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
