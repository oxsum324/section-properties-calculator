module.exports = [
  {
    id: 'service-stable-self-weight',
    title: '含基礎與覆土自重的矩形淺基礎通過案例',
    purpose: '守住常用服務載重、中央核、底壓、抗滑與抗傾覆皆通過的基準。',
    input: {
      B: 2.5,
      L: 3,
      t: 0.6,
      Df: 1.2,
      gammaC: 2.4,
      gammaS: 1.8,
      P: 80,
      qa: 20,
      Mx: 12,
      My: 8,
      Hx: 4,
      Hy: 3,
      mu: 0.45,
      passive: 0,
      fsSlideReq: 1.5,
      fsOverReq: 1.5,
      includeSelfWeight: true
    },
    expected: {
      values: {
        Ptotal: 98.89999999999999,
        qmax: 18.946666666666665,
        qmin: 7.426666666666665,
        kernUtil: 0.07280080889787666,
        fsSlide: 8.901,
        fsOver: 12.362499999999999
      },
      flags: {
        fullContact: true,
        bearingOk: true,
        slideOk: true,
        overOk: true,
        overallOk: true
      },
      corners: {
        qmaxCorner: '+X +Y',
        qminCorner: '-X -Y'
      }
    }
  },
  {
    id: 'eccentric-bearing-failure',
    title: '偏心超出中央核造成 qmin 拉力與底壓失敗',
    purpose: '守住大彎矩下不得把局部初估誤判為通過的失敗案例。',
    input: {
      B: 2.5,
      L: 3,
      t: 0.6,
      Df: 1.2,
      gammaC: 2.4,
      gammaS: 1.8,
      P: 80,
      qa: 20,
      Mx: 80,
      My: 60,
      Hx: 4,
      Hy: 3,
      mu: 0.45,
      passive: 0,
      fsSlideReq: 1.5,
      fsOverReq: 1.5,
      includeSelfWeight: true
    },
    expected: {
      values: {
        Ptotal: 98.89999999999999,
        qmax: 53.72,
        qmin: -27.346666666666664,
        kernUtil: 0.5123019885406135,
        fsSlide: 8.901,
        fsOver: 1.8543749999999999
      },
      flags: {
        fullContact: false,
        bearingOk: false,
        slideOk: true,
        overOk: true,
        overallOk: false
      },
      corners: {
        qmaxCorner: '+X +Y',
        qminCorner: '-X -Y'
      }
    }
  },
  {
    id: 'external-load-only-no-lateral',
    title: '不納入自重且無水平力的外力基準案例',
    purpose: '守住 includeSelfWeight 關閉時 Ptotal 不被自重污染，且無水平力時抗滑為無窮大。',
    input: {
      B: 2,
      L: 2,
      t: 0.5,
      Df: 0.8,
      gammaC: 2.4,
      gammaS: 1.8,
      P: 40,
      qa: 15,
      Mx: 3,
      My: 2,
      Hx: 0,
      Hy: 0,
      mu: 0.4,
      passive: 0,
      fsSlideReq: 1.5,
      fsOverReq: 1.5,
      includeSelfWeight: false
    },
    expected: {
      values: {
        Ptotal: 40,
        qmax: 13.75,
        qmin: 6.25,
        kernUtil: 0.0625,
        fsSlide: Infinity,
        fsOver: 13.333333333333334
      },
      flags: {
        fullContact: true,
        bearingOk: true,
        slideOk: true,
        overOk: true,
        overallOk: true
      },
      corners: {
        qmaxCorner: '+X +Y',
        qminCorner: '-X -Y'
      }
    }
  },
  {
    id: 'passive-resistance-slide-pass',
    title: '被動抵抗參與後抗滑通過案例',
    purpose: '守住被動抵抗欄位確實進入抗滑安全係數，避免 UI 有欄位但 core 未採用。',
    input: {
      B: 2,
      L: 2,
      t: 0.5,
      Df: 0.8,
      gammaC: 2.4,
      gammaS: 1.8,
      P: 30,
      qa: 25,
      Mx: 2,
      My: 1,
      Hx: 12,
      Hy: 0,
      mu: 0.2,
      passive: 15,
      fsSlideReq: 1.5,
      fsOverReq: 1.5,
      includeSelfWeight: true
    },
    expected: {
      values: {
        Ptotal: 36.96,
        qmax: 11.49,
        qmin: 6.99,
        kernUtil: 0.040584415584415584,
        fsSlide: 1.8659999999999999,
        fsOver: 18.48
      },
      flags: {
        fullContact: true,
        bearingOk: true,
        slideOk: true,
        overOk: true,
        overallOk: true
      },
      corners: {
        qmaxCorner: '+X +Y',
        qminCorner: '-X -Y'
      }
    }
  }
];
