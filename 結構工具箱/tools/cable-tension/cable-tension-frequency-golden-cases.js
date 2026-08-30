module.exports = [
  {
    id: 'single-fundamental-20kn',
    title: '單一第一模態 20 kN 基準',
    purpose: '守住理想弦基本式 T(N) = 4mL²(f₁/1)²、kN 換算與單一模態時的一致性檢查邊界。',
    input: {
      effectiveLengthM: 10,
      effectiveLengthBasis: '兩端錨頭間確認之自由振動長度',
      massPerLengthKgM: 2,
      massBasis: '鋼索型錄所列含護套有效單位長質量',
      frequencyBasis: '現地加速度計頻譜第一模態峰值',
      measurements: [{ mode: 1, frequencyHz: 5, note: '  第一模態主峰  ' }],
      assumptionConfirmed: true,
      harmonicTolerancePct: 5,
      harmonicToleranceBasis: '量測計畫 CT-01 指定諧波頻率偏差容許值 5%',
      targetTensionKn: ''
    },
    expected: {
      fit: {
        fundamentalFrequencyHz: 5,
        tensionKn: 20,
        equivalentTf: 2.0394324259558565,
        maxFrequencyDeviationPct: 0,
        rmsFrequencyDeviationPct: 0
      },
      measurementTensionKn: [20],
      measurementFrequencyDeviationPct: [0],
      measurementNotes: ['第一模態主峰'],
      target: { provided: false, passed: null, deviationPct: null },
      checkStatuses: {
        'project-data-provenance': 'pass',
        'taut-string-assumption': 'pass',
        'measurement-set': 'pass',
        'harmonic-consistency': 'not_applicable',
        'target-tension': 'not_applicable'
      },
      overallOk: true
    }
  },
  {
    id: 'three-exact-harmonics-21p6kn',
    title: '三個整數諧波一致的 21.6 kN 基準',
    purpose: '守住多模態原點回歸 a = Σ(nf)/Σ(n²) 及三個完全一致模態的零殘差。',
    input: {
      effectiveLengthM: 20,
      effectiveLengthBasis: '索夾中心間之自由振動有效長度',
      massPerLengthKgM: 1.5,
      massBasis: '供應商型錄有效單位長質量',
      frequencyBasis: '頻譜 3、6、9 Hz 峰值依序辨識為第 1、2、3 模態',
      measurements: [
        { mode: 1, frequencyHz: 3 },
        { mode: 2, frequencyHz: 6 },
        { mode: 3, frequencyHz: 9 }
      ],
      assumptionConfirmed: true,
      harmonicTolerancePct: 2,
      harmonicToleranceBasis: '量測計畫 CT-02 指定諧波頻率偏差容許值 2%'
    },
    expected: {
      fit: {
        fundamentalFrequencyHz: 3,
        tensionKn: 21.6,
        equivalentTf: 2.2025870200323254,
        maxFrequencyDeviationPct: 0,
        rmsFrequencyDeviationPct: 0
      },
      measurementTensionKn: [21.6, 21.6, 21.6],
      measurementFrequencyDeviationPct: [0, 0, 0],
      target: { provided: false, passed: null, deviationPct: null },
      checkStatuses: {
        'project-data-provenance': 'pass',
        'taut-string-assumption': 'pass',
        'measurement-set': 'pass',
        'harmonic-consistency': 'pass',
        'target-tension': 'not_applicable'
      },
      overallOk: true
    }
  },
  {
    id: 'inconsistent-harmonics-fail',
    title: '多模態頻率偏離容許差案例',
    purpose: '守住回歸仍會提供估算值，但最大諧波偏差超過 5% 時不得宣告整體通過。',
    input: {
      effectiveLengthM: 10,
      effectiveLengthBasis: '兩端錨頭間確認之自由振動長度',
      massPerLengthKgM: 2,
      massBasis: '鋼索型錄所列含護套有效單位長質量',
      frequencyBasis: '頻譜峰值 5 Hz 與 11 Hz 分別辨識為第 1、2 模態',
      measurements: [
        { mode: 1, frequencyHz: 5 },
        { mode: 2, frequencyHz: 11 }
      ],
      assumptionConfirmed: true,
      harmonicTolerancePct: 5,
      harmonicToleranceBasis: '量測計畫 CT-03 指定諧波頻率偏差容許值 5%'
    },
    expected: {
      fit: {
        fundamentalFrequencyHz: 5.4,
        tensionKn: 23.328,
        equivalentTf: 2.3787939816349115,
        maxFrequencyDeviationPct: 7.407407407407407,
        rmsFrequencyDeviationPct: 5.399029532264165
      },
      measurementTensionKn: [20, 24.2],
      measurementFrequencyDeviationPct: [-7.407407407407407, 1.851851851851852],
      target: { provided: false, passed: null, deviationPct: null },
      checkStatuses: {
        'project-data-provenance': 'pass',
        'taut-string-assumption': 'pass',
        'measurement-set': 'pass',
        'harmonic-consistency': 'fail',
        'target-tension': 'not_applicable'
      },
      overallOk: false
    }
  },
  {
    id: 'target-band-pass',
    title: '估算索力落在目標容許範圍案例',
    purpose: '守住目標索力上下限及絕對百分比差異的通過判定。',
    input: {
      effectiveLengthM: 10,
      effectiveLengthBasis: '兩端錨頭間確認之自由振動長度',
      massPerLengthKgM: 2,
      massBasis: '鋼索型錄所列含護套有效單位長質量',
      frequencyBasis: '頻譜 5 Hz 與 10 Hz 峰值辨識為第 1、2 模態',
      measurements: [
        { mode: 1, frequencyHz: 5 },
        { mode: 2, frequencyHz: 10 }
      ],
      assumptionConfirmed: true,
      harmonicTolerancePct: 5,
      harmonicToleranceBasis: '量測計畫 CT-04 指定諧波頻率偏差容許值 5%',
      targetTensionKn: 21,
      targetTolerancePct: 5,
      targetTensionBasis: '張拉計畫 CT-T01 指定目標索力 21 kN 與容許差 5%'
    },
    expected: {
      fit: {
        fundamentalFrequencyHz: 5,
        tensionKn: 20,
        equivalentTf: 2.0394324259558565,
        maxFrequencyDeviationPct: 0,
        rmsFrequencyDeviationPct: 0
      },
      measurementTensionKn: [20, 20],
      measurementFrequencyDeviationPct: [0, 0],
      target: {
        provided: true,
        passed: true,
        deviationPct: 4.761904761904762,
        lowerKn: 19.95,
        upperKn: 22.05
      },
      checkStatuses: {
        'project-data-provenance': 'pass',
        'taut-string-assumption': 'pass',
        'measurement-set': 'pass',
        'harmonic-consistency': 'pass',
        'target-tension': 'pass'
      },
      overallOk: true
    }
  },
  {
    id: 'target-band-default-tolerance-fail',
    title: '估算索力超出預設目標容許差案例',
    purpose: '守住提供目標索力但未填容許差時採 10%，且超出範圍必須失敗。',
    input: {
      effectiveLengthM: 10,
      effectiveLengthBasis: '兩端錨頭間確認之自由振動長度',
      massPerLengthKgM: 2,
      massBasis: '鋼索型錄所列含護套有效單位長質量',
      frequencyBasis: '頻譜 5 Hz 與 10 Hz 峰值辨識為第 1、2 模態',
      measurements: [
        { mode: 1, frequencyHz: 5 },
        { mode: 2, frequencyHz: 10 }
      ],
      assumptionConfirmed: true,
      harmonicTolerancePct: 5,
      harmonicToleranceBasis: '量測計畫 CT-05 指定諧波頻率偏差容許值 5%',
      targetTensionKn: 25,
      targetTensionBasis: '張拉計畫 CT-T02 指定目標索力 25 kN 與容許差 10%'
    },
    expected: {
      fit: {
        fundamentalFrequencyHz: 5,
        tensionKn: 20,
        equivalentTf: 2.0394324259558565,
        maxFrequencyDeviationPct: 0,
        rmsFrequencyDeviationPct: 0
      },
      measurementTensionKn: [20, 20],
      measurementFrequencyDeviationPct: [0, 0],
      target: {
        provided: true,
        passed: false,
        tolerancePct: 10,
        deviationPct: 20,
        lowerKn: 22.5,
        upperKn: 27.5
      },
      checkStatuses: {
        'project-data-provenance': 'pass',
        'taut-string-assumption': 'pass',
        'measurement-set': 'pass',
        'harmonic-consistency': 'pass',
        'target-tension': 'fail'
      },
      overallOk: false
    }
  },
  {
    id: 'assumption-not-confirmed',
    title: '理想弦假設未確認案例',
    purpose: '守住核心可顯示數值供檢視，但假設未確認時不得宣告整體通過。',
    input: {
      effectiveLengthM: 10,
      effectiveLengthBasis: '現場量測紀錄 CT-L06：兩端錨頭間自由振動段',
      massPerLengthKgM: 2,
      massBasis: '製造商型錄 CT-M06：含護套有效單位長質量',
      frequencyBasis: '單點手持感測器頻譜第一峰值',
      measurements: [{ mode: 1, frequencyHz: 5 }],
      assumptionConfirmed: false,
      harmonicTolerancePct: 5,
      harmonicToleranceBasis: '量測計畫 CT-06 指定諧波頻率偏差容許值 5%'
    },
    expected: {
      fit: {
        fundamentalFrequencyHz: 5,
        tensionKn: 20,
        equivalentTf: 2.0394324259558565,
        maxFrequencyDeviationPct: 0,
        rmsFrequencyDeviationPct: 0
      },
      measurementTensionKn: [20],
      measurementFrequencyDeviationPct: [0],
      target: { provided: false, passed: null, deviationPct: null },
      checkStatuses: {
        'project-data-provenance': 'pass',
        'taut-string-assumption': 'fail',
        'measurement-set': 'pass',
        'harmonic-consistency': 'not_applicable',
        'target-tension': 'not_applicable'
      },
      overallOk: false
    }
  }
];
