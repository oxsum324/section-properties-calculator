const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCalculator() {
  const context = { console, window: {} };
  context.globalThis = context;
  vm.createContext(context);

  for (const file of ['constants.spec.js', 'code-profiles-registry.spec.js', 'calculator.spec.js']) {
    const fullPath = path.join(__dirname, file);
    vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: file });
  }

  assert.ok(context.window.STONE_CONSTANTS, 'STONE_CONSTANTS should be loaded');
  assert.ok(context.window.StoneCodeProfiles, 'StoneCodeProfiles should be loaded');
  assert.ok(context.window.StoneCalculator, 'StoneCalculator should be loaded');
  return {
    calculator: context.window.StoneCalculator,
    profiles: context.window.StoneCodeProfiles,
  };
}

function baseInput(overrides = {}) {
  return {
    w_src: 'manual',
    w_manual_mode: 'pressure',
    w_manual: 360,
    w_pos: 360,
    w_neg: 360,
    w_cf: 1.25,
    s_sds: 0.6,
    s_ip_raw: 1.0,
    s_ip: 1.5,
    st_t: 3,
    st_gam: 2700,
    m_fy: 2400,
    m_fya36: 2400,
    m_screw_ta: 120,
    m_anc_ta: 450,
    m_anc_type: 'custom',
    m_anc_fc: 280,
    m_anc_sf: 5,
    m_mc_va: 130,
    m_mc_ta: 120,
    m_pin_d: 4,
    m_pin_fy: 1350,
    sp_anchor_on: true,
    sp_anchor_design_mode: 'dual_compare',
    sp_anchor_phi: 0.75,
    sp_anchor_service_factor: 1.6,
    sp_anchor_aci_category: 1,
    sp_bk2_on: true,
    sp_panel_on: true,
    sp_stone_grade: 'granite_grade2',
    sp_stone_fb: 55,
    sp_stone_ft: 35,
    sp_panel_local_mode: 'auto',
    sp_panel_cone_angle: 30,
    sp_psicv_on: true,
    sp_concrete_crack: 'cracked',
    sp_rebar_support: 'full_rebar',
    sp_geometry_on: true,
    sp_geometry_source: 'combined',
    sp_custom_anchor_on: true,
    sp_custom_anchor_length_mm: 75,
    sp_custom_anchor_embed_mm: 40,
    sp_custom_anchor_d_mm: 12,
    sp_custom_anchor_edge_mm: 25,
    sp_custom_pin_length_mm: 75,
    sp_custom_pin_embed_mm: 40,
    sp_custom_pin_edge_mm: 25,
    sp_material_on: true,
    sp_dimension_on: true,
    sp_wind_dir_on: true,
    sp_ip15_on: true,
    sp_chapter_on: true,
    sp_torque_on: true,
    sp_angle_on: true,
    sp_seismic_detail_on: true,
    sp_allow_stress_static_on: false,
    sp_anchor_group_on: true,
    sp_interaction_mode: 'conservative_envelope',
    sp_drift_on: true,
    sp_thermal_on: true,
    sp_seis_ap: 1.0,
    sp_seis_rp: 2.5,
    sp_seis_zh_ratio: 0.5,
    sp_seis_upper_compare_on: false,
    sp_pev_conservative_on: false,
    sp_drift_theta: 0.005,
    sp_story_height_mm: 4000,
    sp_thermal_alpha: 0.000008,
    sp_thermal_delta_t: 40,
    sp_thermal_reserve_mm: 3,
    get m_pin_va() {
      const d = this.m_pin_d;
      const fy = this.m_pin_fy;
      return 1.25 * 0.4 * fy * Math.PI * Math.pow(d / 10, 2) / 4;
    },
    ...overrides,
  };
}

function caseFixture(overrides = {}) {
  return {
    name: 'pin-standard',
    w: 870,
    h: 800,
    type: 'pk_4h',
    N: 4,
    hasMC: false,
    bh: 10,
    H1: 5,
    d1: 2.5,
    h12: '3.4,3.6',
    L1a: 5,
    L1b: 8,
    Lt: 0.5,
    LL: 5,
    angle_section_mode: 'l_angle_composite',
    d0: 1.2,
    fx: 150,
    fy1: 150,
    fy2: 200,
    anc_key: '3/8"',
    anc_spec: '3/8" expansion anchor',
    conn_spec: 'dia.4mm stainless pin',
    mat_grade: 'sus304',
    panel_mode: 'two_way_rankine',
    mat_other: '',
    mat_approved: false,
    hole_edge_mm: 60,
    hole_spacing_mm: 600,
    hole_depth_mm: 18,
    hole_diameter_mm: 12,
    anchor_spacing_mm: 160,
    anchor_edge_mm: 60,
    movement_allow_mm: 10,
    rotation_allow_deg: 0.6,
    drift_span_mode: 'single_story',
    joint_width_mm: 8,
    pin_edge_mm: 25,
    hasSlipPlate: false,
    slip_plate_b: 5,
    slip_plate_t: 0.5,
    slip_plate_spec: 'PL50x5t',
    bk2_exception: false,
    spec_note: '',
    ...overrides,
  };
}

function snapshot(result) {
  return {
    allOK: result.allOK,
    checks: result.checks.length,
    failed: result.checks.filter((check) => !check.pass).length,
    tension: Number(result.design.tensionPerPoint.toFixed(4)),
    bending: Number(result.design.bendingPerPoint.toFixed(4)),
    horizontalPull: Number(result.design.horizontalPull.toFixed(4)),
    horizontalPush: Number(result.design.horizontalPush.toFixed(4)),
    compareP: Number(result.design.compareP.toFixed(4)),
    ipRaised: result.spec.ipRaised,
    pevMethod: result.spec.pevMethod,
    anchorTa: Number(result.spec.anchor.effectiveTa.toFixed(4)),
    anchorVa: Number(result.spec.anchor.effectiveVa.toFixed(4)),
    windDirectional: result.spec.windDirectional,
    verticalPull: Number(result.spec.verticalPull.toFixed(4)),
    verticalPush: Number(result.spec.verticalPush.toFixed(4)),
  };
}

function focusedSnapshot(result) {
  const interaction = result.checks.find((check) => check.item === '膨脹螺栓 拉剪交互');
  return {
    allOK: result.allOK,
    checks: result.checks.length,
    failed: result.checks.filter((check) => !check.pass).length,
    tension: Number(result.design.tensionPerPoint.toFixed(4)),
    horizontalPull: Number(result.design.horizontalPull.toFixed(4)),
    horizontalPush: Number(result.design.horizontalPush.toFixed(4)),
    verticalPull: Number(result.spec.verticalPull.toFixed(4)),
    verticalPush: Number(result.spec.verticalPush.toFixed(4)),
    pevMethod: result.spec.pevMethod,
    anchorTa: Number(result.spec.anchor.effectiveTa.toFixed(4)),
    anchorVa: Number(result.spec.anchor.effectiveVa.toFixed(4)),
    anchorTensionFactor: Number((result.spec.anchorGroup?.tensionFactor ?? 1).toFixed(4)),
    anchorShearFactor: Number((result.spec.anchorGroup?.shearFactor ?? 1).toFixed(4)),
    windFromGCp: Boolean(result.spec.windFromGCp),
    allowStressFactor: Number(result.spec.allowStressFactor.toFixed(4)),
    verticalBasis: result.spec.verticalBasis,
    panelMode: result.spec.panel?.mode || '',
    panelPass: Boolean(result.spec.panel?.pass),
    driftPass: Boolean(result.spec.drift?.pass),
    driftDisp: Number((result.spec.drift?.displacementMm ?? 0).toFixed(4)),
    thermalPass: Boolean(result.spec.thermal?.pass),
    thermalReq: Number((result.spec.thermal?.requiredJointMm ?? 0).toFixed(4)),
    interactionValue: Number((interaction?.v ?? 0).toFixed(4)),
    interactionDetail: interaction?.detail || '',
    failedItems: Array.from(result.checks.filter((check) => !check.pass).map((check) => String(check.item))),
  };
}

function assertFocused(name, cd, inp, expected) {
  const actual = focusedSnapshot(calculator.calcCase(cd, inp));
  for (const key of Object.keys(expected)) {
    assert.deepStrictEqual(actual[key], expected[key], `${name}: ${key}`);
  }
  assert.deepStrictEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${name}: snapshot keys`);
}

const { calculator, profiles } = loadCalculator();

assert.match(calculator.VERSION, /^\d{4}\.\d{2}\.\d{2}-spec-core\d+$/);

{
  const defaultInput = baseInput({
    sp_seis_zh_ratio: 1,
    w_pos: 0,
    w_neg: 0,
  });
  const sync = profiles.buildProfileInputUpdates(
    'seismic',
    'cns_seismic_113',
    'cns_seismic_113_conservative',
    {
      sp_ip_default: String(defaultInput.sp_ip_default ?? 1.5),
      sp_seis_ap: String(defaultInput.sp_seis_ap),
      sp_seis_rp: String(defaultInput.sp_seis_rp),
    },
  );
  assert.strictEqual(sync.ok, true, 'profile input sync should resolve both seismic profiles');
  assert.strictEqual(sync.updates.sp_seis_rp, 2, 'conservative profile should lower Rp default from 2.5 to 2.0');

  const defaultSeismic = calculator.calcCase(caseFixture(), defaultInput).spec.seismic;
  const conservativeInput = {
    ...defaultInput,
    ...sync.updates,
    code_profiles: { seismic: 'cns_seismic_113_conservative' },
  };
  const conservativeSeismic = calculator.calcCase(caseFixture(), conservativeInput).spec.seismic;
  assert.strictEqual(Number(defaultSeismic.fph.toFixed(4)), 3.4992, 'default profile seismic demand baseline');
  assert.strictEqual(Number(conservativeSeismic.fph.toFixed(4)), 4.374, 'conservative profile seismic demand uses synchronized Rp=2.0');
  assert.strictEqual(conservativeSeismic.rp, 2, 'calculation report should expose synchronized conservative Rp');
  assert.strictEqual(
    Number((conservativeSeismic.fph / defaultSeismic.fph).toFixed(2)),
    1.25,
    'conservative profile should raise this non-limit-controlled demand by 25%',
  );
  console.log('  profile runtime sync: default Fph=3.4992 -> conservative Fph=4.3740 (Rp 2.5 -> 2.0)');
}

{
  const result = calculator.calcCase(caseFixture({
    joint_width_mm: 8,
    hole_edge_mm: 60,
    hole_depth_mm: 20,
  }), baseInput({
    sp_custom_anchor_length_mm: 150,
    sp_custom_anchor_embed_mm: 80,
    sp_custom_anchor_edge_mm: 50,
  }));
  const thermal = result.checks.find((check) => check.item === '伸縮縫淨寬估算');
  assert.strictEqual(thermal.sense, 'min', 'thermal joint should be a minimum requirement');
  assert.ok(thermal.dcr < 1, 'larger-than-required joint width should reduce utilization');
  assert.strictEqual(Number(thermal.dcr.toFixed(3)), Number((thermal.a / thermal.v).toFixed(3)));
  const anchorLength = result.checks.find((check) => check.item === '自訂錨栓長度');
  assert.strictEqual(anchorLength.sense, 'min', 'custom anchor length should be a minimum requirement');
  assert.strictEqual(Number(anchorLength.dcr.toFixed(3)), 0.5, '150 mm length against 75 mm minimum should be DCR 0.5');
  const edge = result.checks.find((check) => check.item === '插梢孔邊距');
  assert.strictEqual(edge.sense, 'range', 'pin hole edge should be a range requirement');
  assert.ok(edge.dcr <= 1, 'in-range geometry should not exceed DCR 1');
}

assert.deepStrictEqual(
  snapshot(calculator.calcCase(caseFixture(), baseInput())),
  {
    allOK: false,
    checks: 25,
    failed: 7,
    tension: 156.6,
    bending: 156.6,
    horizontalPull: 313.2,
    horizontalPush: 313.2,
    compareP: 313.2,
    ipRaised: true,
    pevMethod: 'Ev = 0.2SDSD 規範式',
    anchorTa: 450,
    anchorVa: 450,
    windDirectional: true,
    verticalPull: 5.6376,
    verticalPush: 5.6376,
  },
);

assert.deepStrictEqual(
  snapshot(calculator.calcCase(
    caseFixture({
      name: 'back-anchor',
      w: 900,
      h: 900,
      type: 'bk_4h',
      hasMC: true,
      conn_spec: 'M8 stainless back anchor',
    }),
    baseInput(),
  )),
  {
    allOK: false,
    checks: 24,
    failed: 4,
    tension: 91.125,
    bending: 91.125,
    horizontalPull: 364.5,
    horizontalPush: 364.5,
    compareP: 364.5,
    ipRaised: true,
    pevMethod: 'Ev = 0.2SDSD 規範式',
    anchorTa: 450,
    anchorVa: 450,
    windDirectional: true,
    verticalPull: 6.561,
    verticalPush: 6.561,
  },
);

assert.deepStrictEqual(
  snapshot(calculator.calcCase(
    caseFixture({
      name: 'directional-pressure',
      w: 1200,
      h: 900,
      hasSlipPlate: true,
    }),
    baseInput({ w_pos: 240, w_neg: 480 }),
  )),
  {
    allOK: false,
    checks: 27,
    failed: 8,
    tension: 324,
    bending: 324,
    horizontalPull: 648,
    horizontalPush: 324,
    compareP: 648,
    ipRaised: true,
    pevMethod: 'Ev = 0.2SDSD 規範式',
    anchorTa: 450,
    anchorVa: 450,
    windDirectional: true,
    verticalPull: 8.748,
    verticalPush: 8.748,
  },
);

assertFocused(
  'PEV conservative mode',
  caseFixture(),
  baseInput({ sp_pev_conservative_on: true }),
  {
    allOK: false,
    checks: 25,
    failed: 7,
    tension: 156.6,
    horizontalPull: 313.2,
    horizontalPush: 313.2,
    verticalPull: 5.6376,
    verticalPush: 5.6376,
    pevMethod: '0.5PE 保守式',
    anchorTa: 450,
    anchorVa: 450,
    anchorTensionFactor: 1,
    anchorShearFactor: 1,
    windFromGCp: false,
    allowStressFactor: 1.25,
    verticalBasis: 'D + W',
    panelMode: 'two_way_rankine',
    panelPass: false,
    driftPass: true,
    driftDisp: 4,
    thermalPass: true,
    thermalReq: 3.2784,
    interactionValue: 1.392,
    interactionDetail: 'Tu = 626.40 kgf（Tu2 水平力拉拔控制），Ta = 450.0 kgf；V = 2.82 kgf，Va = 450.0 kgf。 V/Va = 0.006 ≤ 0.2，依 17.8.2 免計互制，僅檢核拉力比值。',
    failedItems: [
      '膨脹螺栓 Tu2（水平力）',
      '膨脹螺栓 拉剪交互',
      '插銷 剪力',
      '石材板彎曲應力',
      '石材孔周剪應力 / 石板衝切（簡化）',
      '插梢孔深度',
      '石材厚度限制',
    ],
  },
);

assertFocused(
  'anchor group and edge reduction',
  caseFixture({ anchor_spacing_mm: 40, anchor_edge_mm: 20 }),
  baseInput(),
  {
    allOK: false,
    checks: 25,
    failed: 8,
    tension: 156.6,
    horizontalPull: 313.2,
    horizontalPush: 313.2,
    verticalPull: 5.6376,
    verticalPush: 5.6376,
    pevMethod: 'Ev = 0.2SDSD 規範式',
    anchorTa: 240,
    anchorVa: 240,
    anchorTensionFactor: 0.5333,
    anchorShearFactor: 0.5333,
    windFromGCp: false,
    allowStressFactor: 1.25,
    verticalBasis: 'D + W',
    panelMode: 'two_way_rankine',
    panelPass: false,
    driftPass: true,
    driftDisp: 4,
    thermalPass: true,
    thermalReq: 3.2784,
    interactionValue: 2.61,
    interactionDetail: 'Tu = 626.40 kgf（Tu2 水平力拉拔控制），Ta = 240.0 kgf；V = 2.82 kgf，Va = 240.0 kgf。 V/Va = 0.012 ≤ 0.2，依 17.8.2 免計互制，僅檢核拉力比值。',
    failedItems: [
      '膨脹螺栓 Tu2（水平力）',
      '膨脹螺栓 拉剪交互',
      '插銷 剪力',
      '石材板彎曲應力',
      '石材孔周剪應力 / 石板衝切（簡化）',
      '插梢孔深度',
      '石材厚度限制',
      '自訂錨栓邊距',
    ],
  },
);

assertFocused(
  'manual GCp and GCpi wind pressure',
  caseFixture(),
  baseInput({ w_manual_mode: 'coeff', w_qref: 300, w_cpe_pos: 0.8, w_cpe_neg: -1.2, w_gcpi: 0.2 }),
  {
    allOK: false,
    checks: 25,
    failed: 7,
    tension: 182.7,
    horizontalPull: 365.4,
    horizontalPush: 261,
    verticalPull: 5.6376,
    verticalPush: 5.6376,
    pevMethod: 'Ev = 0.2SDSD 規範式',
    anchorTa: 450,
    anchorVa: 450,
    anchorTensionFactor: 1,
    anchorShearFactor: 1,
    windFromGCp: true,
    allowStressFactor: 1.25,
    verticalBasis: 'D + W',
    panelMode: 'two_way_rankine',
    panelPass: false,
    driftPass: true,
    driftDisp: 4,
    thermalPass: true,
    thermalReq: 3.2784,
    interactionValue: 1.624,
    interactionDetail: 'Tu = 730.80 kgf（Tu2 水平力拉拔控制），Ta = 450.0 kgf；V = 2.82 kgf，Va = 450.0 kgf。 V/Va = 0.006 ≤ 0.2，依 17.8.2 免計互制，僅檢核拉力比值。',
    failedItems: [
      '膨脹螺栓 Tu2（水平力）',
      '膨脹螺栓 拉剪交互',
      '插銷 剪力',
      '石材板彎曲應力',
      '石材孔周剪應力 / 石板衝切（簡化）',
      '插梢孔深度',
      '石材厚度限制',
    ],
  },
);

assertFocused(
  'drift failure flags displacement and rotation',
  caseFixture({ movement_allow_mm: 2, rotation_allow_deg: 0.1 }),
  baseInput({ sp_drift_theta: 0.01 }),
  {
    allOK: false,
    checks: 25,
    failed: 9,
    tension: 156.6,
    horizontalPull: 313.2,
    horizontalPush: 313.2,
    verticalPull: 5.6376,
    verticalPush: 5.6376,
    pevMethod: 'Ev = 0.2SDSD 規範式',
    anchorTa: 450,
    anchorVa: 450,
    anchorTensionFactor: 1,
    anchorShearFactor: 1,
    windFromGCp: false,
    allowStressFactor: 1.25,
    verticalBasis: 'D + W',
    panelMode: 'two_way_rankine',
    panelPass: false,
    driftPass: false,
    driftDisp: 8,
    thermalPass: true,
    thermalReq: 3.2784,
    interactionValue: 1.392,
    interactionDetail: 'Tu = 626.40 kgf（Tu2 水平力拉拔控制），Ta = 450.0 kgf；V = 2.82 kgf，Va = 450.0 kgf。 V/Va = 0.006 ≤ 0.2，依 17.8.2 免計互制，僅檢核拉力比值。',
    failedItems: [
      '膨脹螺栓 Tu2（水平力）',
      '膨脹螺栓 拉剪交互',
      '插銷 剪力',
      '石材板彎曲應力',
      '石材孔周剪應力 / 石板衝切（簡化）',
      '掛件相對位移容許',
      '掛件轉角容許',
      '插梢孔深度',
      '石材厚度限制',
    ],
  },
);

assertFocused(
  'thermal joint failure',
  caseFixture({ w: 2000, h: 1000, joint_width_mm: 3 }),
  baseInput({ sp_thermal_delta_t: 80, sp_thermal_reserve_mm: 3 }),
  {
    allOK: false,
    checks: 25,
    failed: 9,
    tension: 450,
    horizontalPull: 900,
    horizontalPush: 900,
    verticalPull: 16.2,
    verticalPush: 16.2,
    pevMethod: 'Ev = 0.2SDSD 規範式',
    anchorTa: 450,
    anchorVa: 450,
    anchorTensionFactor: 1,
    anchorShearFactor: 1,
    windFromGCp: false,
    allowStressFactor: 1.25,
    verticalBasis: 'D + W',
    panelMode: 'two_way_rankine',
    panelPass: false,
    driftPass: true,
    driftDisp: 5,
    thermalPass: false,
    thermalReq: 4.28,
    interactionValue: 4,
    interactionDetail: 'Tu = 1800.00 kgf（Tu2 水平力拉拔控制），Ta = 450.0 kgf；V = 8.10 kgf，Va = 450.0 kgf。 V/Va = 0.018 ≤ 0.2，依 17.8.2 免計互制，僅檢核拉力比值。',
    failedItems: [
      '膨脹螺栓 Tu2（水平力）',
      '膨脹螺栓 拉剪交互',
      '插銷 剪力',
      '石材板彎曲應力',
      '石材孔周剪應力 / 石板衝切（簡化）',
      '伸縮縫淨寬估算',
      '插梢孔深度',
      '石材厚度限制',
      '單片面積限制',
    ],
  },
);

assertFocused(
  'static-only allowable stress factor',
  caseFixture(),
  baseInput({ w_pos: 0, w_neg: 0, s_sds: 0, sp_allow_stress_static_on: true }),
  {
    allOK: false,
    checks: 25,
    failed: 3,
    tension: 0,
    horizontalPull: 0,
    horizontalPush: 0,
    verticalPull: 5.6376,
    verticalPush: 5.6376,
    pevMethod: 'Ev = 0.2SDSD 規範式',
    anchorTa: 450,
    anchorVa: 450,
    anchorTensionFactor: 1,
    anchorShearFactor: 1,
    windFromGCp: false,
    allowStressFactor: 1,
    verticalBasis: 'D only',
    panelMode: 'two_way_rankine',
    panelPass: false,
    driftPass: true,
    driftDisp: 4,
    thermalPass: true,
    thermalReq: 3.2784,
    interactionValue: 0.0251,
    interactionDetail: 'Tu = 11.28 kgf（Tu1 垂直剪力導出，保守包絡），Ta = 450.0 kgf；V = 2.82 kgf，Va = 450.0 kgf。 V/Va = 0.006 ≤ 0.2，依 17.8.2 免計互制，僅檢核拉力比值。',
    failedItems: [
      '石材孔周剪應力 / 石板衝切（簡化）',
      '插梢孔深度',
      '石材厚度限制',
    ],
  },
);

assertFocused(
  'one-way panel mode',
  caseFixture({ panel_mode: 'one_way_short' }),
  baseInput(),
  {
    allOK: false,
    checks: 25,
    failed: 7,
    tension: 156.6,
    horizontalPull: 313.2,
    horizontalPush: 313.2,
    verticalPull: 5.6376,
    verticalPush: 5.6376,
    pevMethod: 'Ev = 0.2SDSD 規範式',
    anchorTa: 450,
    anchorVa: 450,
    anchorTensionFactor: 1,
    anchorShearFactor: 1,
    windFromGCp: false,
    allowStressFactor: 1.25,
    verticalBasis: 'D + W',
    panelMode: 'one_way_short',
    panelPass: false,
    driftPass: true,
    driftDisp: 4,
    thermalPass: true,
    thermalReq: 3.2784,
    interactionValue: 1.392,
    interactionDetail: 'Tu = 626.40 kgf（Tu2 水平力拉拔控制），Ta = 450.0 kgf；V = 2.82 kgf，Va = 450.0 kgf。 V/Va = 0.006 ≤ 0.2，依 17.8.2 免計互制，僅檢核拉力比值。',
    failedItems: [
      '膨脹螺栓 Tu2（水平力）',
      '膨脹螺栓 拉剪交互',
      '插銷 剪力',
      '石材板彎曲應力',
      '石材孔周剪應力 / 石板衝切（簡化）',
      '插梢孔深度',
      '石材厚度限制',
    ],
  },
);

assertFocused(
  'separated interaction omits duplicate shear term when vertical pull controls',
  caseFixture({ w: 2000, h: 2000, d1: 0.5 }),
  baseInput({
    w_pos: 20,
    w_neg: 20,
    s_sds: 0,
    s_ip: 1,
    s_ip_raw: 1,
    st_t: 10,
    sp_ip15_on: false,
    sp_anchor_group_on: false,
    sp_interaction_mode: 'separated',
  }),
  {
    allOK: false,
    checks: 25,
    failed: 8,
    tension: 50,
    horizontalPull: 100,
    horizontalPush: 100,
    verticalPull: 108,
    verticalPush: 108,
    pevMethod: 'Ev = 0.2SDSD 規範式',
    anchorTa: 450,
    anchorVa: 450,
    anchorTensionFactor: 1,
    anchorShearFactor: 1,
    windFromGCp: false,
    allowStressFactor: 1.25,
    verticalBasis: 'D + W',
    panelMode: 'two_way_rankine',
    panelPass: false,
    driftPass: true,
    driftDisp: 10,
    thermalPass: true,
    thermalReq: 3.64,
    interactionValue: 2.4,
    interactionDetail: 'Tu1 = 1080.00 kgf（Tu1 與 V 同源，依分離計算模式僅檢核 Tu1/Ta），Ta = 450.0 kgf；V = 54.00 kgf，Va = 450.0 kgf。',
    failedItems: [
      '膨脹螺栓 Tu1（垂直力）',
      '膨脹螺栓 Tu2（水平力）',
      '膨脹螺栓 拉剪交互',
      '插銷 剪力',
      '石材孔周剪應力 / 石板衝切（簡化）',
      '插梢孔深度',
      '石材厚度限制',
      '單片面積限制',
    ],
  },
);

// V3.1.0：112 年版第 17 章錨栓等效服務值（手算基準：SH-440、fc'=280 → Nu = 3700、Vu = 3000 kgf，換算係數 1.6）
{
  const anchorOf = (overrides) => calculator.calcCase(caseFixture(), baseInput({
    m_anc_type: 'SH-440', m_anc_fc: 280, sp_anchor_design_mode: 'appendix_d', ...overrides,
  })).spec.anchor;
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.05, `${label}: ${actual} ≠ ${expected}`);

  // 開裂、無輔助鋼筋、Category 1：φt = min(0.75, 0.65) = 0.65，φv = min(0.65, 0.70) = 0.65，ψ 比 = 1.0/1.4
  const cracked = anchorOf({ sp_concrete_crack: 'cracked', sp_rebar_support: 'none', sp_anchor_aci_category: 1 });
  assert.strictEqual(cracked.anchorMethod, 'cns_112_ch17_vendor_equivalent');
  near(cracked.phi, 0.65, '112 cracked φt');
  near(cracked.phiShear, 0.65, '112 cracked φv');
  near(cracked.appendixTensionService, 3700 * 0.65 * (1 / 1.4) / 1.6, '112 cracked tension service'); // 1073.66
  near(cracked.appendixShearService, 3000 * 0.65 * (1 / 1.4) / 1.6, '112 cracked shear service'); // 870.54

  // 未開裂：廠商試驗值不再乘 ψc 提高
  const uncracked = anchorOf({ sp_concrete_crack: 'noncracked', sp_anchor_aci_category: 1 });
  near(uncracked.appendixTensionService, 3700 * 0.65 / 1.6, '112 uncracked tension service'); // 1503.13
  near(uncracked.appendixShearService, 3000 * 0.65 / 1.6, '112 uncracked shear service'); // 1218.75

  // Category 3、有輔助鋼筋、開裂且錨栓與邊緣間有 D13 以上鋼筋：φt = min(0.75, 0.55) = 0.55，φv = min(0.65, 0.75) = 0.65，ψc,V 比 = 1.2/1.4
  const cat3 = anchorOf({ sp_concrete_crack: 'cracked', sp_rebar_support: 'edge_rebar', sp_anchor_aci_category: 3, sp_anchor_supplementary_rebar: 'yes' });
  near(cat3.phi, 0.55, '112 cat3 φt');
  near(cat3.appendixTensionService, 3700 * 0.55 * (1 / 1.4) / 1.6, '112 cat3 tension service'); // 908.48
  near(cat3.appendixShearService, 3000 * 0.65 * (1.2 / 1.4) / 1.6, '112 cat3 shear service'); // 1044.64

  // 舊版附篇 D profile（既有案件重播）維持原公式：φ = 0.75，未開裂 Category 1 ψc,N = 1.25
  const legacy = anchorOf({ sp_concrete_crack: 'noncracked', sp_anchor_aci_category: 1, code_profiles: { anchor: 'aci_318_appendix_d' } });
  assert.strictEqual(legacy.anchorMethod, 'aci_appendix_d_legacy');
  near(legacy.appendixTensionService, 3700 * 0.75 * 1.25 / 1.6, 'legacy tension service'); // 2167.97
}

console.log(`StoneCalculator ${calculator.VERSION} regression smoke tests passed.`);
