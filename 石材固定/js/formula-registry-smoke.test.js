const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadContext() {
  const context = { console, window: {} };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ['constants.spec.js', 'calculator.spec.js', 'formula-registry.spec.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  }
  return context.window;
}

function baseInput(overrides = {}) {
  return {
    w_src: 'manual', w_manual_mode: 'pressure', w_pos: 360, w_neg: 360, w_cf: 1.25,
    s_sds: 0.6, s_ip_raw: 1.0, s_ip: 1.5, st_t: 3, st_gam: 2700,
    m_fy: 2400, m_fya36: 2400, m_screw_ta: 120, m_anc_ta: 450,
    m_anc_type: 'custom', m_anc_fc: 280, m_anc_sf: 5, m_mc_va: 130, m_mc_ta: 120,
    m_pin_d: 4, m_pin_fy: 1350,
    sp_anchor_on: true, sp_anchor_design_mode: 'dual_compare', sp_anchor_phi: 0.75,
    sp_anchor_service_factor: 1.6, sp_anchor_aci_category: 1, sp_bk2_on: true,
    sp_panel_on: true, sp_stone_grade: 'granite_grade2', sp_stone_fb: 55, sp_stone_ft: 35,
    sp_panel_local_mode: 'auto', sp_panel_cone_angle: 30, sp_psicv_on: true,
    sp_concrete_crack: 'cracked', sp_rebar_support: 'full_rebar', sp_geometry_on: true,
    sp_geometry_source: 'combined', sp_custom_anchor_on: true, sp_custom_anchor_length_mm: 75,
    sp_custom_anchor_embed_mm: 40, sp_custom_anchor_d_mm: 12, sp_custom_anchor_edge_mm: 25,
    sp_custom_pin_length_mm: 75, sp_custom_pin_embed_mm: 40, sp_custom_pin_edge_mm: 25,
    sp_material_on: true, sp_dimension_on: true, sp_wind_dir_on: true, sp_ip15_on: true,
    sp_chapter_on: true, sp_torque_on: true, sp_angle_on: true, sp_seismic_detail_on: true,
    sp_allow_stress_static_on: false, sp_anchor_group_on: true,
    sp_interaction_mode: 'conservative_envelope', sp_drift_on: true, sp_thermal_on: true,
    sp_seis_ap: 1.0, sp_seis_rp: 2.5, sp_seis_zh_ratio: 0.5,
    sp_seis_upper_compare_on: false, sp_pev_conservative_on: false,
    sp_drift_theta: 0.005, sp_story_height_mm: 4000,
    sp_thermal_alpha: 0.000008, sp_thermal_delta_t: 40, sp_thermal_reserve_mm: 3,
    get m_pin_va() {
      return 1.25 * 0.4 * this.m_pin_fy * Math.PI * Math.pow(this.m_pin_d / 10, 2) / 4;
    },
    ...overrides,
  };
}

function caseFixture(overrides = {}) {
  return {
    name: 'case', w: 870, h: 800, type: 'pk_4h', N: 4, hasMC: false,
    bh: 10, H1: 5, d1: 2.5, h12: '3.4,3.6', L1a: 5, L1b: 8,
    Lt: 0.5, LL: 5, angle_section_mode: 'l_angle_composite', d0: 1.2,
    fx: 150, fy1: 150, fy2: 200, anc_key: '3/8"', anc_spec: '3/8" expansion anchor',
    conn_spec: 'dia.4mm stainless pin', mat_grade: 'sus304', panel_mode: 'two_way_rankine',
    mat_other: '', mat_approved: false, hole_edge_mm: 60, hole_spacing_mm: 600,
    hole_depth_mm: 18, hole_diameter_mm: 12, anchor_spacing_mm: 160, anchor_edge_mm: 60,
    movement_allow_mm: 10, rotation_allow_deg: 0.6, drift_span_mode: 'single_story',
    joint_width_mm: 8, pin_edge_mm: 25, hasSlipPlate: false, slip_plate_b: 5,
    slip_plate_t: 0.5, slip_plate_spec: 'PL50x5t', bk2_exception: false, spec_note: '',
    ...overrides,
  };
}

const { StoneCalculator, StoneFormulaRegistry } = loadContext();
assert.ok(StoneFormulaRegistry.VERSION);
assert.ok(StoneFormulaRegistry.refs);
assert.ok(StoneFormulaRegistry.checks);

const scenarios = [
  [caseFixture(), baseInput()],
  [caseFixture({ type: 'bk_4h', hasMC: true, conn_spec: 'M8 stainless back anchor' }), baseInput()],
  [caseFixture({ anchor_spacing_mm: 40, anchor_edge_mm: 20 }), baseInput()],
  [caseFixture({ movement_allow_mm: 2, rotation_allow_deg: 0.1 }), baseInput({ sp_drift_theta: 0.01 })],
  [caseFixture({ w: 2000, h: 1000, joint_width_mm: 3 }), baseInput({ sp_thermal_delta_t: 80, sp_thermal_reserve_mm: 3 })],
  [caseFixture({ panel_mode: 'one_way_short' }), baseInput()],
  [caseFixture({ w: 2000, h: 2000, d1: 0.5 }), baseInput({ w_pos: 20, w_neg: 20, s_sds: 0, s_ip: 1, s_ip_raw: 1, st_t: 10, sp_ip15_on: false, sp_anchor_group_on: false, sp_interaction_mode: 'separated' })],
];

const observed = new Set();
for (const [cd, inp] of scenarios) {
  for (const check of StoneCalculator.calcCase(cd, inp).checks) observed.add(check.item);
}

const registry = StoneFormulaRegistry.checks;
const missing = [...observed].filter((item) => !registry[item]).sort();
assert.deepStrictEqual(missing, [], `Missing formula registry entries: ${missing.join(', ')}`);

for (const [item, entry] of Object.entries(registry)) {
  assert.ok(entry.category, `${item}: category`);
  assert.ok(entry.formula, `${item}: formula`);
  assert.ok(Object.prototype.hasOwnProperty.call(entry, 'unit'), `${item}: unit`);
  assert.ok(entry.ref, `${item}: ref`);
  assert.ok(StoneFormulaRegistry.refs[entry.ref], `${item}: ref target ${entry.ref}`);
}

console.log(`StoneFormulaRegistry ${StoneFormulaRegistry.VERSION} covers ${observed.size} observed checks.`);
