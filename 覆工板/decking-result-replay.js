const fs = require('fs');
const path = require('path');
const vm = require('vm');

function inputValues(payload) {
  const g = payload.global || {};
  const input = payload.inputs || {};
  const d = input.deck || {};
  const s = input.stringer || {};
  const gi = input.girder || {};
  const c = input.column || {};
  const b = input.bond || {};
  const p = input.pile || {};
  return {
    g_Fy: g.Fy, g_E: g.E, g_beta: g.beta, g_imp: g.imp,
    g_Wp: g.Wp, g_Wl: g.Wl, g_defl: g.defl,
    d_B: d.B, d_L: d.L, d_n: d.n, d_Sx: d.Sx, d_Ix: d.Ix,
    d_Aw: d.Aw, d_Pcrane: d.Pcrane,
    s_section: s.section, s_n: s.n, s_B: s.B, s_L: s.L,
    s_Lt: s.Lt, s_fa: s.fa, s_Pcrane: s.Pcrane,
    g4_section: gi.section, g4_n: gi.n, g4_B: gi.B, g4_L: gi.L,
    g4_W2: gi.W2, g4_Lt: gi.Lt, g4_fa: gi.fa, g4_Pcrane: gi.Pcrane,
    c_section: c.section, c_L: c.L, c_K: c.K, c_N: c.N,
    c_ex: c.ex, c_ey: c.ey, c_old: c.old,
    b_fc: b.fc, b_L: b.L, b_P: b.P, b_T: b.T,
    p_D: p.D, p_Lb: p.Lb, p_Nb: p.Nb, p_Ns: p.Ns,
    p_FSb: p.FSb, p_FSs: p.FSs, p_P: p.P,
    proj_name: payload.project?.name || '',
    proj_no: payload.project?.no || '',
    proj_date: payload.project?.date || '',
  };
}

function makeElement(id, value = '') {
  const checkbox = id === 'autolink' || id === 'deckingAttachmentApproved';
  return {
    id,
    type: checkbox ? 'checkbox' : 'text',
    value: value == null ? '' : String(value),
    checked: false,
    dataset: {},
    className: '',
    textContent: '',
    innerHTML: '',
    classList: { add() {}, remove() {} },
    addEventListener() {},
    click() {},
  };
}

function replayDeckingExport(payload, options = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('decking replay payload must be an object');
  if (!payload.inputs || Object.keys(payload.inputs).length === 0) {
    throw new Error('decking replay payload must include exported inputs');
  }

  const toolRoot = options.toolRoot || __dirname;
  const html = fs.readFileSync(path.join(toolRoot, 'index.html'), 'utf8');
  const sectionTable = fs.readFileSync(path.join(toolRoot, 'shared', 'h-section-table.js'), 'utf8');
  const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim());
  if (inlineScripts.length !== 1) throw new Error(`expected one inline decking script, found ${inlineScripts.length}`);

  const elements = new Map();
  const ensureElement = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };
  for (const [id, value] of Object.entries(inputValues(payload))) {
    elements.set(id, makeElement(id, value));
  }
  ensureElement('autolink').checked = false;
  ensureElement('deckingAttachmentApproved').checked = payload.document?.approved === true;
  ensureElement('deckingAttachmentApproved').dataset.approvedAt = payload.document?.approvedAt || '';

  const storage = new Map();
  const document = {
    getElementById: ensureElement,
    querySelectorAll: () => [...elements.values()],
    querySelector: () => null,
    addEventListener() {},
    createElement: id => makeElement(id),
    body: { classList: { add() {}, remove() {} } },
  };
  const context = vm.createContext({
    console,
    document,
    window: { addEventListener() {}, print() {} },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    location: { reload() {} },
    Blob: function Blob() {},
    URL: { createObjectURL: () => '', revokeObjectURL() {} },
    setTimeout,
    clearTimeout,
  });

  const replaySource = `${sectionTable}\n${inlineScripts[0]}\nrecalcAll();\n` +
    `globalThis.__deckingReplay = {\n` +
    `  global: G(),\n` +
    `  results: JSON.parse(JSON.stringify(RESULTS, (key, value) =>\n` +
    `    (typeof value === 'object' && value !== null && 'name' in value && 'H' in value)\n` +
    `      ? {name:value.name,H:value.H,B:value.B,tw:value.tw,tf:value.tf,A:value.A,Wb:value.Wb,Ix:value.Ix,Iy:value.Iy,Sx:value.Sx,Sy:value.Sy,rx:value.rx,ry:value.ry}\n` +
    `      : value)),\n` +
    `  calculationFingerprint: buildDeckingCalculationFingerprint(G(), RESULTS),\n` +
    `};`;
  vm.runInContext(replaySource, context, { filename: path.join(toolRoot, 'index.html'), timeout: 10000 });
  return JSON.parse(JSON.stringify(context.__deckingReplay));
}

module.exports = { replayDeckingExport };
