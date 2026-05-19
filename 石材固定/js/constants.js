window.STONE_CONSTANTS = Object.freeze({
  TYPE_N: Object.freeze({
    bk_2: 2,
    bk_4h: 4,
    bk_6h: 6,
    bk_6v: 6,
    pk_4h: 4,
    pk_6h: 6,
    pk_4v: 4,
    pk_6v: 6,
  }),
  ANC_SPECS: Object.freeze({
    '3/8"': Object.freeze({ label: '3/8" 內迫型膨脹螺栓', d0: 1.2 }),
    '1/2"': Object.freeze({ label: '1/2" 內迫型膨脹螺栓', d0: 1.6 }),
    M8: Object.freeze({ label: 'M8 化學錨栓', d0: 1.0 }),
    M10: Object.freeze({ label: 'M10 化學錨栓', d0: 1.2 }),
    M12: Object.freeze({ label: 'M12 化學錨栓', d0: 1.4 }),
    custom: Object.freeze({ label: '自訂', d0: null }),
  }),
  // 套管式膨脹錨栓廠商極限強度表（新生五金 SIOC 五彩電鍍，資料來源：新生五金工廠股份有限公司型錄）
  // Nu = 極限抗拉力 (kgf)，Vu = 極限抗剪力 (kgf)，依混凝土強度 fc' (kgf/cm²)
  // 設計容許值 = 極限值 ÷ 安全係數 SF（廠商建議：靜荷重 SF=4~5；動荷重 SF=8~10）
  ANCHOR_CATALOG: Object.freeze({
    custom: Object.freeze({ label: '自訂（手動輸入）', d: '', holeMm: null, embedMm: null, Nu: null, Vu: null }),
    'SH-440': Object.freeze({
      label: 'SH-440（d=1/2"）', d: '1/2"', D: '11/16"',
      holeMm: 17.5, embedMm: 50.8,
      Nu: Object.freeze({ 210: 2800, 280: 3700 }),
      Vu: Object.freeze({ 210: 3000, 280: 3000 }),
    }),
    'SH-550': Object.freeze({
      label: 'SH-550（d=5/8"）', d: '5/8"', D: '7/8"',
      holeMm: 22.2, embedMm: 63.5,
      Nu: Object.freeze({ 210: 3850, 280: 5200 }),
      Vu: Object.freeze({ 210: 4600, 280: 5100 }),
    }),
    'SH-560': Object.freeze({
      label: 'SH-560（d=5/8"，加長型）', d: '5/8"', D: '7/8"',
      holeMm: 22.2, embedMm: 63.5,
      Nu: Object.freeze({ 210: 3850, 280: 5200 }),
      Vu: Object.freeze({ 210: 4600, 280: 5100 }),
    }),
    'SH-660': Object.freeze({
      label: 'SH-660（d=3/4"）', d: '3/4"', D: '1"',
      holeMm: 26.0, embedMm: 76.2,
      Nu: Object.freeze({ 210: 5700, 280: 5700 }),
      Vu: Object.freeze({ 210: 7200, 280: 7200 }),
    }),
  }),
  ANCHOR_FC_OPTIONS: Object.freeze([210, 280]),
  ANCHOR_SF_OPTIONS: Object.freeze([3, 4, 5, 8, 10]),
  ANCHOR_DEFAULT_TYPE: 'custom',
  ANCHOR_DEFAULT_FC: 280,
  ANCHOR_DEFAULT_SF: 5,
  TYPE_LABEL: Object.freeze({
    bk_2: '背扣孔─上下各1點',
    bk_4h: '背扣孔─上下各2點',
    bk_6h: '背扣孔─上下各3點',
    bk_6v: '背扣孔─左右各3點',
    pk_4h: '插銷式─上下各2支',
    pk_6h: '插銷式─上下各3支',
    pk_4v: '插銷式─左右各2支',
    pk_6v: '插銷式─左右各3支',
  }),
  FIELD_RULES: Object.freeze({
    w_v: Object.freeze({
      label: '設計風速 V',
      min: 26,
      max: 40,
      message: '應介於 26～40 m/s。',
    }),
    s_sds: Object.freeze({
      label: 'SDS',
      min: 0,
      max: 3,
      message: '應介於 0.00～3.00。',
    }),
    cc_kzt: Object.freeze({
      label: '地形係數 Kzt',
      min: 1,
      max: 3,
      message: '應介於 1.00～3.00。',
    }),
  }),
  SPEC_REFS: Object.freeze({
    cc: '建築物耐風設計規範（107 年版）',
    seismic: '建築物耐震設計規範及解說（113 年版）',
    anchor: '錨栓製造商試驗報告（安全係數 SF=3）',
    steel: '鋼構造建築物鋼結構設計技術規範（容許應力設計法）',
  }),
  COMMON_PRESETS: Object.freeze({
    stone_12_back4: Object.freeze({
      label: '12mm 石材＋背扣 4 點',
      stoneThicknessMm: 12,
      caseType: 'bk_4h',
      connectionSpec: 'M8 不鏽鋼背扣螺絲',
      anchorSpec: '3/8"',
    }),
    stone_12_pin4: Object.freeze({
      label: '12mm 石材＋插銷 4 點',
      stoneThicknessMm: 12,
      caseType: 'pk_4h',
      connectionSpec: 'ψ4mm 不鏽鋼插銷',
      anchorSpec: '3/8"',
    }),
  }),
});
