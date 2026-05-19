module.exports = [
  {
    id: 'active-dry-wall-pass',
    title: '乾土主動土壓與簡化穩定通過案例',
    purpose: '守住 Rankine Ka、土壓、超載、抗滑、抗傾覆與基底壓力的常用初估基準。',
    input: {
      H: 2.5,
      gammaSoil: 1.8,
      phiDeg: 30,
      mode: 'active',
      surcharge: 1,
      waterDepth: 0,
      gammaWater: 1,
      baseB: 1.8,
      verticalLoad: 16,
      qa: 15,
      mu: 0.45,
      passive: 0,
      fsSlideReq: 1.5,
      fsOverReq: 1.5
    },
    expected: {
      values: {
        Ka: 0.3333333333333333,
        K0: 0.5,
        K: 0.3333333333333333,
        soilForce: 1.875,
        surchargeForce: 0.8333333333333333,
        waterForce: 0,
        totalForce: 2.708333333333333,
        overturningMoment: 2.6041666666666665,
        resultantHeight: 0.9615384615384616,
        fsSlide: 2.658461538461539,
        fsOver: 5.5296,
        e: 0.16276041666666666,
        qmax: 13.711419753086421,
        qmin: 4.066358024691358,
        kernUtil: 0.09042245370370369
      },
      flags: {
        fullContact: true,
        bearingOk: true,
        slideOk: true,
        overOk: true,
        overallOk: true
      }
    }
  },
  {
    id: 'at-rest-pressure-higher-demand',
    title: '靜止土壓提高側向需求案例',
    purpose: '守住 K0 路線不會誤用 Ka，並反映側向力與傾覆力矩增加。',
    input: {
      H: 2.5,
      gammaSoil: 1.8,
      phiDeg: 30,
      mode: 'atRest',
      surcharge: 1,
      waterDepth: 0,
      gammaWater: 1,
      baseB: 2.2,
      verticalLoad: 22,
      qa: 18,
      mu: 0.5,
      passive: 0,
      fsSlideReq: 1.5,
      fsOverReq: 1.5
    },
    expected: {
      values: {
        Ka: 0.3333333333333333,
        K0: 0.5,
        K: 0.5,
        soilForce: 2.8125,
        surchargeForce: 1.25,
        waterForce: 0,
        totalForce: 4.0625,
        overturningMoment: 3.90625,
        resultantHeight: 0.9615384615384616,
        fsSlide: 2.707692307692308,
        fsOver: 6.195200000000001,
        e: 0.17755681818181818,
        qmax: 14.84245867768595,
        qmin: 5.157541322314049,
        kernUtil: 0.08070764462809916
      },
      flags: {
        fullContact: true,
        bearingOk: true,
        slideOk: true,
        overOk: true,
        overallOk: true
      }
    }
  },
  {
    id: 'water-pressure-overturning-failure',
    title: '地下水壓造成穩定失敗案例',
    purpose: '守住地下水壓獨立進入側向力與傾覆力矩，避免水壓被忽略。',
    input: {
      H: 3,
      gammaSoil: 1.8,
      phiDeg: 30,
      mode: 'active',
      surcharge: 0.5,
      waterDepth: 3,
      gammaWater: 1,
      baseB: 1.6,
      verticalLoad: 14,
      qa: 18,
      mu: 0.4,
      passive: 0,
      fsSlideReq: 1.5,
      fsOverReq: 1.5
    },
    expected: {
      values: {
        Ka: 0.3333333333333333,
        K0: 0.5,
        K: 0.3333333333333333,
        soilForce: 2.6999999999999997,
        surchargeForce: 0.5,
        waterForce: 4.5,
        totalForce: 7.699999999999999,
        overturningMoment: 7.949999999999999,
        resultantHeight: 1.0324675324675325,
        fsSlide: 0.7272727272727274,
        fsOver: 1.4088050314465412,
        e: 0.5678571428571428,
        qmax: 27.3828125,
        qmin: -9.882812499999998,
        kernUtil: 0.35491071428571425
      },
      flags: {
        fullContact: false,
        bearingOk: false,
        slideOk: false,
        overOk: false,
        overallOk: false
      }
    }
  },
  {
    id: 'passive-resistance-slide-pass',
    title: '被動抵抗參與後抗滑通過案例',
    purpose: '守住被動抵抗欄位確實進入抗滑安全係數。',
    input: {
      H: 2,
      gammaSoil: 1.75,
      phiDeg: 28,
      mode: 'active',
      surcharge: 1.5,
      waterDepth: 0,
      gammaWater: 1,
      baseB: 1.5,
      verticalLoad: 10,
      qa: 14,
      mu: 0.25,
      passive: 4,
      fsSlideReq: 1.5,
      fsOverReq: 1.5
    },
    expected: {
      values: {
        Ka: 0.3610334834981831,
        K0: 0.5305284372141092,
        K: 0.3610334834981831,
        soilForce: 1.2636171922436408,
        surchargeForce: 1.0831004504945492,
        waterForce: 0,
        totalForce: 2.3467176427381897,
        overturningMoment: 1.9255119119903097,
        resultantHeight: 0.8205128205128206,
        fsSlide: 2.769826195372908,
        fsOver: 3.895068087243152,
        e: 0.19255119119903097,
        qmax: 11.801365098640826,
        qmin: 1.5319682346925076,
        kernUtil: 0.128367460799354
      },
      flags: {
        fullContact: true,
        bearingOk: true,
        slideOk: true,
        overOk: true,
        overallOk: true
      }
    }
  }
];
