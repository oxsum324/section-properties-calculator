module.exports = [
  {
    id: 'four-support-pass',
    title: '四支承設備局部荷重通過案例',
    purpose: '守住服務重量、動力係數、平均支承反力、接觸壓、1:1 分布壓與水平力的常用基準。',
    input: {
      equipmentWeight: 12,
      fluidWeight: 2,
      accessoryWeight: 1,
      dynamicFactor: 1.1,
      supportCount: 4,
      contactB: 0.25,
      contactL: 0.25,
      spreadDepth: 0.15,
      planB: 2.4,
      planL: 1.2,
      allowableContact: 100,
      allowableSpread: 20,
      allowablePoint: 5,
      horizontalCoeff: 0.2
    },
    expected: {
      values: {
        serviceWeight: 15,
        designWeight: 16.5,
        pointLoad: 4.125,
        qContact: 66,
        spreadB: 0.55,
        spreadL: 0.55,
        spreadAreaEach: 0.30250000000000005,
        qSpread: 13.636363636363635,
        qEquivalent: 5.729166666666667,
        horizontalTotal: 3.3000000000000003,
        horizontalPerSupport: 0.8250000000000001,
        pointUtil: 0.825
      },
      flags: {
        contactOk: true,
        spreadOk: true,
        pointOk: true,
        overallOk: true
      }
    }
  },
  {
    id: 'contact-and-spread-failure',
    title: '接觸面過小且無分布厚度的失敗案例',
    purpose: '守住小底座設備不得被誤判為接觸壓或分布壓通過。',
    input: {
      equipmentWeight: 12,
      fluidWeight: 2,
      accessoryWeight: 1,
      dynamicFactor: 1.1,
      supportCount: 4,
      contactB: 0.1,
      contactL: 0.1,
      spreadDepth: 0,
      planB: 2.4,
      planL: 1.2,
      allowableContact: 50,
      allowableSpread: 20,
      allowablePoint: 5,
      horizontalCoeff: 0.2
    },
    expected: {
      values: {
        serviceWeight: 15,
        designWeight: 16.5,
        pointLoad: 4.125,
        qContact: 412.49999999999994,
        spreadB: 0.1,
        spreadL: 0.1,
        spreadAreaEach: 0.010000000000000002,
        qSpread: 412.49999999999994,
        qEquivalent: 5.729166666666667,
        horizontalTotal: 3.3000000000000003,
        horizontalPerSupport: 0.8250000000000001,
        pointUtil: 0.825
      },
      flags: {
        contactOk: false,
        spreadOk: false,
        pointOk: true,
        overallOk: false
      }
    }
  },
  {
    id: 'point-limit-omitted',
    title: '容許支承反力上限填 0 時略過該項檢核',
    purpose: '守住選填檢核不應讓未指定容許值誤造成不通過。',
    input: {
      equipmentWeight: 12,
      fluidWeight: 2,
      accessoryWeight: 1,
      dynamicFactor: 1.1,
      supportCount: 4,
      contactB: 0.25,
      contactL: 0.25,
      spreadDepth: 0.15,
      planB: 2.4,
      planL: 1.2,
      allowableContact: 100,
      allowableSpread: 20,
      allowablePoint: 0,
      horizontalCoeff: 0.2
    },
    expected: {
      values: {
        serviceWeight: 15,
        designWeight: 16.5,
        pointLoad: 4.125,
        qContact: 66,
        spreadB: 0.55,
        spreadL: 0.55,
        spreadAreaEach: 0.30250000000000005,
        qSpread: 13.636363636363635,
        qEquivalent: 5.729166666666667,
        horizontalTotal: 3.3000000000000003,
        horizontalPerSupport: 0.8250000000000001,
        pointUtil: null
      },
      flags: {
        contactOk: true,
        spreadOk: true,
        pointOk: null,
        overallOk: true
      }
    }
  },
  {
    id: 'heavy-equipment-point-failure',
    title: '接觸壓通過但控制支承反力超限案例',
    purpose: '守住接觸壓與分布壓通過時，控制支承反力仍能獨立控制整體結論。',
    input: {
      equipmentWeight: 20,
      fluidWeight: 4,
      accessoryWeight: 1,
      dynamicFactor: 1.2,
      supportCount: 4,
      contactB: 0.5,
      contactL: 0.5,
      spreadDepth: 0.25,
      planB: 3,
      planL: 2,
      allowableContact: 50,
      allowableSpread: 10,
      allowablePoint: 6,
      horizontalCoeff: 0.15
    },
    expected: {
      values: {
        serviceWeight: 25,
        designWeight: 30,
        pointLoad: 7.5,
        qContact: 30,
        spreadB: 1,
        spreadL: 1,
        spreadAreaEach: 1,
        qSpread: 7.5,
        qEquivalent: 5,
        horizontalTotal: 4.5,
        horizontalPerSupport: 1.125,
        pointUtil: 1.25
      },
      flags: {
        contactOk: true,
        spreadOk: true,
        pointOk: false,
        overallOk: false
      }
    }
  },
  {
    id: 'eccentric-four-support-pass',
    title: '矩形四支點偏心反力通過案例',
    purpose: '守住設備重心偏移時四角反力平衡、控制支點與局部壓力必須採最大反力，而不是沿用平均值。',
    input: {
      equipmentWeight: 12,
      fluidWeight: 2,
      accessoryWeight: 1,
      dynamicFactor: 1.1,
      reactionMode: 'eccentric-rectangular-4',
      supportCount: 4,
      supportSpacingX: 2,
      supportSpacingY: 1,
      cgEccentricityX: 0.2,
      cgEccentricityY: -0.1,
      contactB: 0.25,
      contactL: 0.25,
      spreadDepth: 0.15,
      planB: 2.4,
      planL: 1.2,
      allowableContact: 100,
      allowableSpread: 20,
      allowablePoint: 6,
      horizontalCoeff: 0.2
    },
    expected: {
      values: {
        serviceWeight: 15,
        designWeight: 16.5,
        averageReaction: 4.125,
        maximumReaction: 5.775,
        minimumReaction: 2.4749999999999996,
        pointLoad: 5.775,
        reactionEccentricityRatio: 0.2,
        reactionUtilization: 0.4,
        qContact: 92.4,
        qSpread: 19.09090909090909,
        qEquivalent: 5.729166666666667,
        pointUtil: 0.9625
      },
      flags: {
        reactionOk: true,
        contactOk: true,
        spreadOk: true,
        pointOk: true,
        overallOk: true
      }
    }
  },
  {
    id: 'eccentric-four-support-uplift',
    title: '矩形四支點偏心超出無拉力範圍案例',
    purpose: '守住任一支點計算反力為負時不得仍以平均反力宣告局部荷重通過，必須轉入錨栓與底座詳算。',
    input: {
      equipmentWeight: 12,
      fluidWeight: 2,
      accessoryWeight: 1,
      dynamicFactor: 1.1,
      reactionMode: 'eccentric-rectangular-4',
      supportCount: 4,
      supportSpacingX: 2,
      supportSpacingY: 1,
      cgEccentricityX: 0.8,
      cgEccentricityY: 0.2,
      contactB: 0.25,
      contactL: 0.25,
      spreadDepth: 0.15,
      planB: 2.4,
      planL: 1.2,
      allowableContact: 200,
      allowableSpread: 50,
      allowablePoint: 0,
      horizontalCoeff: 0.2
    },
    expected: {
      values: {
        serviceWeight: 15,
        designWeight: 16.5,
        averageReaction: 4.125,
        maximumReaction: 9.075,
        minimumReaction: -0.8249999999999997,
        pointLoad: 9.075,
        reactionEccentricityRatio: 0.6000000000000001,
        reactionUtilization: 1.2000000000000002,
        qContact: 145.2,
        qSpread: 29.999999999999996,
        qEquivalent: 5.729166666666667,
        pointUtil: null
      },
      flags: {
        reactionOk: false,
        contactOk: true,
        spreadOk: true,
        pointOk: null,
        overallOk: false
      }
    }
  }
];
