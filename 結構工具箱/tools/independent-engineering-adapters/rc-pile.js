const FoundationPile = require('../../../鋼筋混凝土/shared/foundation-pile.js');

function validateInput(input) {
  const issues = FoundationPile.validateGroupAndCapInput(input);
  if (!Array.isArray(input?.layers) || !input.layers.length) issues.push('layers:required');
  if (!Number.isFinite(Number(input?.pileLength)) || Number(input.pileLength) <= 0) issues.push('pileLength:positive-finite-required');
  if (!Number.isFinite(Number(input?.pileDiameterM)) || Number(input.pileDiameterM) <= 0) issues.push('pileDiameterM:positive-finite-required');
  if (!Number.isFinite(Number(input?.safetyFactor)) || Number(input.safetyFactor) <= 1) issues.push('safetyFactor:greater-than-one-required');
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-rc-pile-benchmark-input:${issues.join(',')}`);
  const axial = FoundationPile.calculateAxialCapacity(input);
  const group = FoundationPile.calculateGroupAndCap(input);
  return {
    Qs: axial.Qs,
    Qb: axial.Qb,
    Qult: axial.Qult,
    Qall: axial.Qall,
    reaction1: group.reactions[0],
    reaction2: group.reactions[1],
    reaction3: group.reactions[2],
    reaction4: group.reactions[3],
    reactionSum: group.reactions.reduce((sum, value) => sum + value, 0),
    rMax: group.rMax,
    rMin: group.rMin,
    d: group.d,
    Vu2Tf: group.Vu2Tf,
    phiVc2Tf: group.phiVc2Kgf / 1000,
    excludedCount: group.excludedCount,
    rowL1: group.pileReactionRowsL[0],
    rowL2: group.pileReactionRowsL[1],
    rowB1: group.pileReactionRowsB[0],
    rowB2: group.pileReactionRowsB[1],
    capMuLongTfm: group.capMuLongTfm,
    capMuTransTfm: group.capMuTransTfm,
    capMuTfm: group.capMuTfm,
    capVuTf: group.capVuTf,
    capFlexuralAs: group.capFlexuralAs,
    capAsReq: group.capAsReq,
    capPhiMnTfm: group.capPhiMnTfm,
    capPhiVnTf: group.capPhiVnTf
  };
}

module.exports = { validateInput, calculate };
