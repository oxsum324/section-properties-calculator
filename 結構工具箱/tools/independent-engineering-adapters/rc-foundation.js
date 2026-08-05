const FoundationIsolated = require('../../../鋼筋混凝土/shared/foundation-isolated.js');

function validateInput(input) {
  return FoundationIsolated.validateInput(input);
}

function calculate(input) {
  const result = FoundationIsolated.calculateStrength(input);
  return {
    dX: result.dX,
    dY: result.dY,
    quTfM2: result.quTfM2,
    MuxTfm: result.MuxTfm,
    MuyTfm: result.MuyTfm,
    phiMnXTfm: result.phiMnXTfm,
    phiMnYTfm: result.phiMnYTfm,
    flexuralAsX: result.flexuralAsX,
    flexuralAsY: result.flexuralAsY,
    AsReqX: result.AsReqX,
    AsReqY: result.AsReqY,
    Vu1Tf: result.Vu1Kgf / 1000,
    phiVc1Tf: result.phiVc1Kgf / 1000,
    bo: result.bo,
    Vu2Tf: result.Vu2Kgf / 1000,
    phiVc2Tf: result.phiVc2Kgf / 1000
  };
}

module.exports = { validateInput, calculate };
