module.exports = [
  {
    id: 'single-wheel-generalized-pass',
    title: '單輪三位置一般化公式案例',
    purpose: '守住 SI 單位、相對勁度半徑、等效接觸半徑及內部／邊緣／角隅應力。',
    input: {
      slabThicknessMm: 180,
      elasticModulusMpa: 28000,
      poissonRatio: 0.15,
      subgradeModulusMNm3: 50,
      allowableStressMpa: 3,
      allowableStressBasis: '專案指定：28 日抗彎試驗折減容許值',
      loadGroups: [
        { name: '單輪', loadKn: 40, count: 1, dynamicFactor: 1.15, contactRadiusMm: 150, influenceInterior: 1, influenceEdge: 1, influenceCorner: 1, influenceBasis: '' }
      ]
    },
    expected: {
      values: {
        relativeStiffnessRadiusMm: 726.4017512741043,
        totalEffectiveLoadKn: 46,
        governingStressMpa: 2.613514568694403,
        governingRatio: 0.8711715228981343
      },
      positionStress: { interior: 1.7641413588791965, edge: 2.613514568694403, corner: 2.224131393785715 },
      flags: { formulaApplicable: true, influenceBasisReady: true, allowableBasisReady: true, stressChecksOk: true, overallOk: true },
      governingPosition: 'edge'
    }
  },
  {
    id: 'two-wheel-governed-influence-pass',
    title: '雙輪具依據影響係數案例',
    purpose: '守住多輪於同一檢核點之線性疊加，並要求非 1.0 影響係數保留專案依據。',
    input: {
      slabThicknessMm: 200,
      elasticModulusMpa: 30000,
      poissonRatio: 0.18,
      subgradeModulusMNm3: 70,
      allowableStressMpa: 3.5,
      allowableStressBasis: '專案指定：材料試驗容許彎拉應力',
      loadGroups: [
        { name: '雙輪', loadKn: 35, count: 2, dynamicFactor: 1.2, contactRadiusMm: 140, influenceInterior: 1, influenceEdge: 0.75, influenceCorner: 0.5, influenceBasis: '專案輪距配置圖之同點影響係數' }
      ]
    },
    expected: {
      values: {
        relativeStiffnessRadiusMm: 737.1553536627464,
        totalEffectiveLoadKn: 84,
        governingStressMpa: 3.0542703307140946,
        governingRatio: 0.8726486659183127
      },
      positionStress: { interior: 2.7606009675833465, edge: 3.0542703307140946, corner: 1.7186001759235852 },
      flags: { formulaApplicable: true, influenceBasisReady: true, allowableBasisReady: true, stressChecksOk: true, overallOk: true },
      governingPosition: 'edge'
    }
  },
  {
    id: 'thin-slab-stress-failure',
    title: '薄版重腳位應力超限案例',
    purpose: '守住三位置中任一應力比超過 1.0 時不得宣告通過。',
    input: {
      slabThicknessMm: 120,
      elasticModulusMpa: 26000,
      poissonRatio: 0.15,
      subgradeModulusMNm3: 35,
      allowableStressMpa: 1.5,
      allowableStressBasis: '規範判定：專案容許彎拉應力',
      loadGroups: [
        { name: '重型機具腳位', loadKn: 90, count: 1, dynamicFactor: 1.25, contactRadiusMm: 100, influenceInterior: 1, influenceEdge: 1, influenceCorner: 1, influenceBasis: '' }
      ]
    },
    expected: {
      values: {
        relativeStiffnessRadiusMm: 575.1587847369394,
        totalEffectiveLoadKn: 112.5,
        governingStressMpa: 15.716380212662964,
        governingRatio: 10.477586808441975
      },
      positionStress: { interior: 10.44583851908044, edge: 15.716380212662964, corner: 13.336889379803809 },
      flags: { formulaApplicable: true, influenceBasisReady: true, allowableBasisReady: true, stressChecksOk: false, overallOk: false },
      governingPosition: 'edge'
    }
  },
  {
    id: 'mixed-wheel-groups-pass',
    title: '前後輪分組疊加案例',
    purpose: '守住不同輪壓、接觸半徑與三位置影響係數逐組計算後再相加。',
    input: {
      slabThicknessMm: 220,
      elasticModulusMpa: 31000,
      poissonRatio: 0.17,
      subgradeModulusMNm3: 80,
      allowableStressMpa: 6.5,
      allowableStressBasis: '專案指定：品質控制抗彎強度折減值',
      loadGroups: [
        { name: '前輪', loadKn: 30, count: 2, dynamicFactor: 1.1, contactRadiusMm: 130, influenceInterior: 1, influenceEdge: 0.8, influenceCorner: 0.6, influenceBasis: '專案配置圖幾何係數' },
        { name: '後輪', loadKn: 45, count: 2, dynamicFactor: 1.1, contactRadiusMm: 160, influenceInterior: 0.7, influenceEdge: 1, influenceCorner: 0.5, influenceBasis: '專案配置圖幾何係數' }
      ]
    },
    expected: {
      values: {
        relativeStiffnessRadiusMm: 771.3893476817293,
        totalEffectiveLoadKn: 165,
        governingStressMpa: 5.982275921367897,
        governingRatio: 0.9203501417489073
      },
      positionStress: { interior: 3.6474605831204965, edge: 5.982275921367897, corner: 3.014590952127472 },
      flags: { formulaApplicable: true, influenceBasisReady: true, allowableBasisReady: true, stressChecksOk: true, overallOk: true },
      governingPosition: 'edge'
    }
  },
  {
    id: 'missing-allowable-basis-blocked',
    title: '容許應力依據缺漏案例',
    purpose: '證明數值應力即使通過，缺少可追溯容許應力來源仍須失敗關閉。',
    input: {
      slabThicknessMm: 200,
      elasticModulusMpa: 30000,
      poissonRatio: 0.2,
      subgradeModulusMNm3: 60,
      allowableStressMpa: 3,
      allowableStressBasis: '尚未指定',
      loadGroups: [
        { name: '大型腳位', loadKn: 20, count: 1, dynamicFactor: 1, contactRadiusMm: 400, influenceInterior: 1, influenceEdge: 1, influenceCorner: 1, influenceBasis: '' }
      ]
    },
    expected: {
      values: {
        relativeStiffnessRadiusMm: 767.6298919328178,
        totalEffectiveLoadKn: 20,
        governingStressMpa: 0.4348571997444382,
        governingRatio: 0.14495239991481274
      },
      positionStress: { interior: 0.36198030429265865, edge: 0.4348571997444382, corner: 0.2510497889807424 },
      flags: { formulaApplicable: true, influenceBasisReady: true, allowableBasisReady: false, stressChecksOk: true, overallOk: false },
      governingPosition: 'edge'
    }
  },
  {
    id: 'reduced-influence-without-basis-blocked',
    title: '影響係數無依據案例',
    purpose: '證明多輪空間互制不得用無依據折減冒充自動求解。',
    input: {
      slabThicknessMm: 200,
      elasticModulusMpa: 30000,
      poissonRatio: 0.18,
      subgradeModulusMNm3: 70,
      allowableStressMpa: 3.5,
      allowableStressBasis: '專案指定：材料試驗容許彎拉應力',
      loadGroups: [
        { name: '雙輪', loadKn: 35, count: 2, dynamicFactor: 1.2, contactRadiusMm: 140, influenceInterior: 0.8, influenceEdge: 0.75, influenceCorner: 0.5, influenceBasis: '' }
      ]
    },
    expected: {
      values: {
        relativeStiffnessRadiusMm: 737.1553536627464,
        totalEffectiveLoadKn: 84,
        governingStressMpa: 3.0542703307140946,
        governingRatio: 0.8726486659183127
      },
      positionStress: { interior: 2.2084807740666773, edge: 3.0542703307140946, corner: 1.7186001759235852 },
      flags: { formulaApplicable: true, influenceBasisReady: false, allowableBasisReady: true, stressChecksOk: true, overallOk: false },
      governingPosition: 'edge'
    }
  }
];
