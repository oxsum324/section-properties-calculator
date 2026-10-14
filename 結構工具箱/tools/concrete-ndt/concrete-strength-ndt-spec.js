(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ConcreteStrengthNdtSpec = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const definitions = {
    mean: { assumed: false, expression: '平均 = Σxi / n', source: '數學定義：輸入資料的算術平均；沒有樣本時不產生數值。' },
    sampleSd: { assumed: false, expression: '樣本標準差 s = √[Σ(xi − 平均)² / (n − 1)]', source: '數學定義：分母為 n−1；n<2 時不產生樣本標準差。' },
    cov: { assumed: false, expression: 'CoV = s / 平均', source: '數學定義：樣本標準差除以算術平均；平均必須為正值。' },
    zoneAggregation: { assumed: false, source: 'Mathematical definition: repeated method results at the same zone are combined by arithmetic mean before method statistics; each distinct zone counts once in n.' },
    reboundStrengthFormula: { assumed: false, expression: '線性 fc = aR + b；二次 fc = aR² + bR + c', source: '指定模型的數學定義；係數為使用者輸入或明示的示例假設，並非通用材料關係。' },
    reboundOutlierRule: { assumed: true, source: 'V12 specified example rule: remove a reading only when its absolute difference from the original raw-reading mean exceeds 6; not a cited standard rule.' },
    reboundMinimumCount: { assumed: true, source: 'V12 specified tool rule: at least 10 original rebound readings per zone.' },
    reboundRetainedCount: { assumed: true, source: 'Additional fail-closed tool assumption: at least 10 readings remain after the stated outlier filter; not specified by V12 or a cited standard.' },
    ultrasonicVelocity: { assumed: false, expression: 'V（km/s）= 測距（mm）/ 傳播時間（μs）', source: '數學單位換算；mm/μs 的數值與 km/s 相同。' },
    ultrasonicStrengthFormula: { assumed: false, expression: '指數 fc = a·exp(bV)；冪次 fc = a·Vᵇ', source: '指定模型的數學定義；係數為使用者輸入或明示的示例假設，並非通用材料關係。' },
    lengthDiameterRatio: { assumed: false, expression: 'L/D = 試體長度 / 試體直徑', source: '數學定義：實測試體長度與直徑的比值。' },
    meanDesignRatio: { assumed: false, source: 'Mathematical descriptive ratio: method mean divided by the user supplied design comparison strength; no acceptance threshold is applied.' },
    coreArea: { assumed: false, expression: 'A（mm²）= πd²/4', source: '數學定義：以實測直徑 d（mm）計算圓形截面積。' },
    coreRawStrength: { assumed: false, expression: '原始抗壓強度（MPa）= 破壞荷重（kN）×1000 / A（mm²）', source: '數學單位換算：N/mm² 與 MPa 數值相同。' },
    coreCorrectionProduct: { assumed: false, expression: '現場等值強度 = 原始抗壓強度 × F_L/D × F_直徑 × F_含水 × F_鑽取損傷', source: '數學定義：依指定方法乘上四項修正係數；取樣方向只記錄。' },
    samplingDirection: { assumed: true, source: 'Sampling direction is recorded as project metadata; no correction factor is applied unless a sourced, confirmed method explicitly defines one.' },
    characteristicStrength: { assumed: true, expression: 'fc,k = 平均 − k·樣本標準差', source: '描述模型：n≥3 時 k=1.645 為常態 5% 分位示例；沒有有限樣本信賴修正，不作母體推論或規範判定。' },
    relativeDifference: { assumed: false, source: 'Mathematical definition: (method value−paired core value)/paired core value ×100; only calculated for the same zone and positive core value.' },
    coreRatio: { assumed: false, source: 'Mathematical definition: method value/paired core value; only calculated for the same zone and positive core value.' },
    curveCoefficientUnits: { assumed: false, source: '依指定換算式作量綱標示：fc 為 MPa、R 為無因次、V 為 km/s；單位定義不代表係數已校正。' },
    reboundTrim: { assumed: true, source: 'V12 指定示例規則：讀值與原始平均差超過 ±6 時剔除；不是規範或通用測試規則。' },
    reboundCurve: { assumed: true, source: '示例曲線；無儀器型號與同位置鑽心校正，並非 ASTM/CNS 曲線。' },
    angleCorrection: { assumed: true, expression: '修正反彈值 R = 剔除後平均反彈值 + ΔR；之後才代入強度曲線', source: '示例角度表僅 0°=0 ΔR；其他角度須儀器資料或逐筆覆寫；不代表儀器手冊常用值。' },
    ultrasonicCurve: { assumed: true, source: '示例曲線；ASTM C597-22 未提供通用抗壓強度換算式，無專案鑽心校正。', url: 'https://store.astm.org/c0597-22.html' },
    ultrasonicGrade: { assumed: true, source: '示例速度分級；非 ASTM/CNS 驗收表。' },
    coreCorrections: { assumed: true, source: '示例修正表，預設值為 1.0；無案件依據時不能視為已完成校正。' },
    characteristicK: { assumed: true, source: '示例常態模型第 5 百分位 z 值 1.645；不含有限樣本信賴修正，非規範 k 表或母體推論。' },
    reboundMethod: { assumed: false, source: 'ASTM C805/C805M-25：回彈值可用於均勻性或相對指標；強度估計需對應混凝土與儀器的關係，並以同位置鑽心資料關聯。', url: 'https://store.astm.org/c0805_c0805m-25.html' },
    coreMethod: { assumed: false, source: 'ACI 說明鑽心試體修正會涉及 L/D、直徑、含水狀態與鑽取損傷；係數須依適用方法/專案取值。', url: 'https://www.concrete.org/frequentlyaskedquestions/faqid/10.aspx' }
  };
  const presets = {
    rebound: {
      trimDifference: 6,
      trim: Object.assign({ mode: 'absolute-difference-from-original-mean' }, definitions.reboundTrim),
      curve: { type: 'quadratic', coefficients: { a: 0.012, b: -0.20, c: 1.0 }, ...definitions.reboundCurve },
      angleTableDeltaR: { 0: 0, 45: null, 90: null },
      angleTable: Object.assign({ unit: 'degree → rebound-number ΔR', entries: { 0: 0, 45: null, 90: null } }, definitions.angleCorrection),
      minimumRawReadings: 10,
      minRetainedReadings: 10
    },
    ultrasonic: {
      velocityUnits: 'km/s',
      distanceUnits: 'mm',
      timeUnits: 'microsecond',
      curve: { type: 'power', coefficients: { a: 1.5, b: 2.0 }, ...definitions.ultrasonicCurve },
      gradeRanges: [
        { label: '示例級距 A', minKmS: 4.0 },
        { label: '示例級距 B', minKmS: 3.5 },
        { label: '示例級距 C', minKmS: 3.0 },
        { label: '示例級距 D', minKmS: 0 }
      ],
      gradeSource: definitions.ultrasonicGrade
    },
    core: {
      loadUnits: 'kN', diameterUnits: 'mm', lengthUnits: 'mm', strengthUnits: 'MPa',
      minimumLengthDiameter: 1,
      lengthDiameterFactors: [ { min: 2.0, max: 2.00000001, factor: 1.0 } ],
      diameterFactors: [
        { min: 0, max: 75, factor: 1.0 },
        { min: 75, max: 100, factor: 1.0 },
        { min: 100, max: 125, factor: 1.0 },
        { min: 125, max: 1000000000, factor: 1.0 }
      ],
      moistureFactors: { dry: 1.0, wet: 1.0, unknown: 1.0 },
      drillingDamageFactors: { low: 1.0, typical: 1.0, high: 1.0, unknown: 1.0 },
      correctionSource: definitions.coreCorrections,
      unadjustedNote: '除明示 L/D=2 範例外，預設係數 1.0 僅表示未修正；不代表規範或文獻建議係數。'
    },
    statistics: {
      characteristicKBands: [ { minN: 3, maxNExclusive: 501, k: 1.645 } ],
      characteristic: definitions.characteristicStrength
    },
    designStrength: { valueMpa:25, assumed:true, source:'示例案件比較值，非專案設計值；請輸入適用設計強度。' }
  };

  const curveUnits = {
    linear: { a: 'MPa／反彈單位', b: 'MPa' },
    quadratic: { a: 'MPa／反彈單位²', b: 'MPa／反彈單位', c: 'MPa' },
    exponential: { a: 'MPa', b: 's/km' },
    power: { a: 'MPa／(km/s)^b', b: '無因次' }
  };

  const formulas = {
    mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; },
    groupMeanByZone(rows, valueKey = 'strengthMpa') {
      const groups = new Map();
      rows.forEach(row => { if (!groups.has(row.zone)) groups.set(row.zone, []); groups.get(row.zone).push(row[valueKey]); });
      return [...groups.entries()].map(([zone, values]) => ({ zone, mean:formulas.mean(values), measurementCount:values.length }));
    },
    sampleSd(values) {
      if (values.length < 2) return null;
      const average = formulas.mean(values);
      return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
    },
    cov(values) {
      const average = formulas.mean(values), sd = formulas.sampleSd(values);
      return average > 0 && sd !== null ? sd / average : null;
    },
    trimRebound(readings, limit = presets.rebound.trimDifference) {
      const rawMean = formulas.mean(readings);
      const retained = readings.filter(value => Math.abs(value - rawMean) <= limit);
      return { rawMean, retained, removed: readings.filter(value => Math.abs(value - rawMean) > limit), mean: formulas.mean(retained) };
    },
    reboundStrength(reading, curve = presets.rebound.curve) {
      const c = curve.coefficients;
      if (curve.type === 'linear') return c.a * reading + c.b;
      return c.a * reading * reading + c.b * reading + c.c;
    },
    adjustedMeanRebound(mean, deltaR) { return mean + deltaR; },
    reboundAdjustedStrength(reading, deltaR, curve = presets.rebound.curve) { return formulas.reboundStrength(reading + deltaR, curve); },
    lengthDiameterRatio(lengthMm, diameterMm) { return lengthMm / diameterMm; },
    reboundAngleCorrection(angleDeg, overrideDeltaR, angleTable = presets.rebound.angleTableDeltaR) {
      if (overrideDeltaR !== null && overrideDeltaR !== undefined) return overrideDeltaR;
      const value = angleTable[angleDeg];
      return value === undefined ? null : value;
    },
    velocityFromDistanceTime(distanceMm, timeMicroseconds) { return distanceMm / timeMicroseconds; },
    ultrasonicStrength(velocityKmS, curve = presets.ultrasonic.curve) {
      const c = curve.coefficients;
      if (curve.type === 'exponential') return c.a * Math.exp(c.b * velocityKmS);
      return c.a * Math.pow(velocityKmS, c.b);
    },
    coreArea(diameterMm) { return Math.PI * diameterMm * diameterMm / 4; },
    coreRawStrength(loadKn, diameterMm) { return loadKn * 1000 / formulas.coreArea(diameterMm); },
    lengthDiameterFactor(ratio, table = presets.core.lengthDiameterFactors) { return lookupRange(ratio, table); },
    diameterFactor(diameterMm, table = presets.core.diameterFactors) { return lookupRange(diameterMm, table); },
    correctedCoreStrength(rawMpa, factors) { return rawMpa * factors.lengthDiameter * factors.diameter * factors.moisture * factors.drillingDamage; },
    characteristic(values, bands = presets.statistics.characteristicKBands) {
      const n = values.length, average = formulas.mean(values), sd = formulas.sampleSd(values), band = bands.find(item => n >= item.minN && n < item.maxNExclusive), k = band && band.k;
      return { n, mean: average, sampleSd: sd, k: k === undefined ? null : k, value: n < 3 || k === undefined || sd === null ? null : average - k * sd, status: n < 3 || k === undefined || sd === null ? '待補' : '假設模型描述指標' };
    },
    lowest(values) { return values.length ? Math.min(...values) : null; },
    meanToDesignRatio(values, designStrengthMpa) {
      if (!Number.isFinite(designStrengthMpa) || designStrengthMpa <= 0) return { ratio: null, meanAtLeastDesign: null };
      const average = formulas.mean(values);
      return { ratio: average === null ? null : average / designStrengthMpa, meanAtLeastDesign: average === null ? null : average >= designStrengthMpa };
    },
    differencePercent(value, reference) { return reference > 0 ? (value - reference) / reference * 100 : null; },
    coreReferenceRatio(value, coreValue) { return coreValue > 0 ? value / coreValue : null; }
  };

  function lookupRange(value, table) {
    const row = table.find(item => value >= item.min && value < item.max);
    return row ? row.factor : null;
  }
  const demoInputs = {
    project:{name:'示例案件',number:'DEMO-001',preparer:'示例資料'},
    designStrengthMpa:25,
    rebound:[
      {id:'R-01',zone:'Z-01',readings:[24,25,25,26,24,25,26,25,24,26],angleDeg:0},
      {id:'R-02',zone:'Z-02',readings:[25,26,26,27,25,26,27,26,25,27],angleDeg:0},
      {id:'R-03',zone:'Z-03',readings:[26,27,27,28,26,27,28,27,26,28],angleDeg:0}
    ],
    ultrasonic:[
      {id:'U-01',zone:'Z-01',velocityKmS:3.8},
      {id:'U-02',zone:'Z-02',velocityKmS:3.9},
      {id:'U-03',zone:'Z-03',velocityKmS:4.0}
    ],
    core:[
      {id:'C-01',zone:'Z-01',diameterMm:100,lengthMm:200,failureLoadKn:188.496,moistureState:'dry',samplingDirection:'perpendicular',drillingDamage:'typical'},
      {id:'C-02',zone:'Z-02',diameterMm:100,lengthMm:200,failureLoadKn:204.204,moistureState:'dry',samplingDirection:'perpendicular',drillingDamage:'typical'},
      {id:'C-03',zone:'Z-03',diameterMm:100,lengthMm:200,failureLoadKn:196.350,moistureState:'dry',samplingDirection:'perpendicular',drillingDamage:'typical'}
    ]
  };
  const confirmedModels = new WeakSet();
  const confirmedSchema = {
    fileName:'concrete-strength-ndt-confirmed.json',
    rootKeys:['schemaVersion','confirmedAt','confirmedBy','applicability','assumptions'],
    applicabilityKeys:['projectNumber','concreteDescription','instrumentModel','applicableMethod','projectSource'],
    itemKeys:['confirmed','assumed','confirmedBy','confirmedAt','source','values'],
    valueKeys:{
      reboundTrim:['threshold','minimumRawReadings','minimumRetainedReadings'],
      reboundAngleTable:['entries'],
      reboundCurve:['curveType','coefficients'],
      ultrasonic:['curveType','coefficients','gradeRanges'],
      coreCorrections:['lengthDiameterFactors','diameterFactors','moistureFactors','drillingDamageFactors'],
      characteristicModel:['bands']
    },
    assumptionIds:['reboundTrim','reboundAngleTable','reboundCurve','ultrasonic','coreCorrections','characteristicModel']
  };
  function defaultModel() {
    return {
      rebound:{trimDifference:presets.rebound.trimDifference,minimumRawReadings:presets.rebound.minimumRawReadings,minRetainedReadings:presets.rebound.minRetainedReadings,angleTableDeltaR:presets.rebound.angleTableDeltaR,curve:presets.rebound.curve,assumed:true},
      ultrasonic:{curve:presets.ultrasonic.curve,gradeRanges:presets.ultrasonic.gradeRanges,assumed:true},
      core:{...presets.core,assumed:true},
      characteristicBands:presets.statistics.characteristicKBands,
      assumptions:Object.entries(definitions).filter(([,item])=>item.assumed).map(([label,item])=>({label,assumed:true,source:item.source}))
    };
  }
  function resolveConfirmedModel(file) {
    validateConfirmedSpec(file);
    const a=file.assumptions;
    const model = {
      rebound:{trimDifference:a.reboundTrim.values.threshold,minimumRawReadings:a.reboundTrim.values.minimumRawReadings,minRetainedReadings:a.reboundTrim.values.minimumRetainedReadings,angleTableDeltaR:a.reboundAngleTable.values.entries,curve:{type:a.reboundCurve.values.curveType,coefficients:a.reboundCurve.values.coefficients},assumed:false,source:a.reboundCurve.source},
      ultrasonic:{curve:{type:a.ultrasonic.values.curveType,coefficients:a.ultrasonic.values.coefficients},gradeRanges:a.ultrasonic.values.gradeRanges,assumed:false,source:a.ultrasonic.source},
      core:{...presets.core,...a.coreCorrections.values,assumed:false,source:a.coreCorrections.source},
      characteristicBands:a.characteristicModel.values.bands,
      assumptions:confirmedSchema.assumptionIds.map(id=>({label:id,assumed:false,confirmed:true,source:file.assumptions[id].source})),
      applicability:file.applicability,
      confirmedBy:file.confirmedBy,
      confirmedAt:file.confirmedAt
    };
    confirmedModels.add(model);
    return deepFreeze(model);
  }
  function isConfirmedModel(model) { return !!model && confirmedModels.has(model); }
  function validateOrderedRanges(table,label) { for(let i=1;i<table.length;i++) if(table[i].min < table[i-1].max) throw new Error(label+' ranges overlap or are out of order'); }
  function validateOrderedBands(bands) { for(let i=1;i<bands.length;i++) if(bands[i].minN < bands[i-1].maxNExclusive) throw new Error('characteristic bands overlap or are out of order'); }
  function validateConfirmedSpec(file) {
    assertExactKeys(file,confirmedSchema.rootKeys,'root');
    if(file.schemaVersion!=='1.0.0'||!validTimestamp(file.confirmedAt)||!nonempty(file.confirmedBy))throw new Error('confirmed spec root values are invalid');
    assertExactKeys(file.applicability,confirmedSchema.applicabilityKeys,'applicability');
    if(!Object.values(file.applicability).every(nonempty))throw new Error('applicability requires project, concrete, instrument, method and source');
    if(!['all-methods','rebound','ultrasonic','core'].includes(file.applicability.applicableMethod))throw new Error('applicable method is outside the closed method inventory');
    assertExactKeys(file.assumptions,confirmedSchema.assumptionIds,'assumptions');
    confirmedSchema.assumptionIds.forEach(id=>{
      const item=file.assumptions[id];assertExactKeys(item,confirmedSchema.itemKeys,id);
      if(item.confirmed!==true||item.assumed!==false||!nonempty(item.confirmedBy)||!validTimestamp(item.confirmedAt)||!nonempty(item.source))throw new Error(`${id} must be confirmed, non-assumed, sourced, attributable and dated`);
      assertExactKeys(item.values,confirmedSchema.valueKeys[id],`${id}.values`);
    });
    const finite=(v)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=rules.maximumMagnitude;
    const a=file.assumptions;
    if(!finite(a.reboundTrim.values.threshold)||a.reboundTrim.values.threshold<0||!Number.isInteger(a.reboundTrim.values.minimumRawReadings)||a.reboundTrim.values.minimumRawReadings<10||!Number.isInteger(a.reboundTrim.values.minimumRetainedReadings)||a.reboundTrim.values.minimumRetainedReadings<10)throw new Error('rebound trim values invalid');
    const angle=a.reboundAngleTable.values.entries;assertExactKeys(angle,['0','45','90'],'angle table');if(!Object.values(angle).every(finite))throw new Error('angle table values must be finite and complete');
    validateCurve(a.reboundCurve.values,['linear','quadratic']);validateCurve(a.ultrasonic.values,['exponential','power']);
    if(!Array.isArray(a.ultrasonic.values.gradeRanges)||!a.ultrasonic.values.gradeRanges.length||!a.ultrasonic.values.gradeRanges.every(row=>exactKeys(row,['label','minKmS'])&&nonempty(row.label)&&finite(row.minKmS)&&row.minKmS>=0))throw new Error('ultrasonic grade table invalid');for(let i=1;i<a.ultrasonic.values.gradeRanges.length;i++)if(a.ultrasonic.values.gradeRanges[i].minKmS>=a.ultrasonic.values.gradeRanges[i-1].minKmS)throw new Error('ultrasonic grade thresholds must be strictly descending');
    const corrections=a.coreCorrections.values;
    ['lengthDiameterFactors','diameterFactors'].forEach(key=>{const table=corrections[key];if(!Array.isArray(table)||!table.length||!table.every(row=>exactKeys(row,['min','max','factor'])&&finite(row.min)&&finite(row.max)&&finite(row.factor)&&row.min<row.max&&row.factor>0))throw new Error(key+' invalid');validateOrderedRanges(table,key);});
    [['moistureFactors',['dry','wet','unknown']],['drillingDamageFactors',['low','typical','high','unknown']]].forEach(([key,keys])=>{assertExactKeys(corrections[key],keys,key);if(!Object.values(corrections[key]).every(v=>finite(v)&&v>0))throw new Error(`${key} invalid`);});
    const bands=a.characteristicModel.values.bands;if(!Array.isArray(bands)||!bands.length||!bands.every(row=>exactKeys(row,['minN','maxNExclusive','k'])&&Number.isInteger(row.minN)&&Number.isInteger(row.maxNExclusive)&&row.minN>=3&&row.minN<row.maxNExclusive&&finite(row.k)&&row.k>=0))throw new Error('characteristic bands invalid');validateOrderedBands(bands);
    return true;
  }
  function validateCurve(item,types){if(!types.includes(item.curveType))throw new Error('curve type invalid');const expected=item.curveType==='quadratic'?['a','b','c']:['a','b'];assertExactKeys(item.coefficients,expected,'curve coefficients');if(!Object.values(item.coefficients).every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=rules.maximumMagnitude))throw new Error('curve coefficients invalid');}
  function assertExactKeys(value,keys,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))throw new Error(`${label} keys do not match closed schema`);}
  function exactKeys(value,keys){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');}
  function nonempty(value){return typeof value==='string'&&value.trim().length>0;}
  function validTimestamp(value){return nonempty(value)&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value));}
  const rules={maximumRows:500,maximumMagnitude:1e9,minimumMethodZones:3,minimumCharacteristicN:3};
  return deepFreeze({schemaVersion:'1.0.0',definitions,presets,curveUnits,formulas,rules,sources:{rebound:definitions.reboundMethod,ultrasonic:definitions.ultrasonicCurve,core:definitions.coreMethod},demoInputs,confirmedSchema,defaultModel,validateConfirmedSpec,resolveConfirmedModel,isConfirmedModel});

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }
});
