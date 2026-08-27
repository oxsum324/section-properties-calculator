const assert = require('assert');
const Bridge = require('./pile-cap-3d-stm-bridge.js');
const Envelope = require('./pile-cap-3d-stm-envelope.js');

const snapshot = {
  tab:'pile', fc:280, fy:4200, lambda:1,
  c1:100, c2:100, pileD:100, pileNL:2, pileNB:2, pileSL:300, pileSB:300,
  Lc:600, Bc:600, hc:180, pcCover:7.5,
  Pu_tf:400, Mx:0, My:0,
  xs:[-150,-150,150,150], ys:[-150,150,-150,150],
  pileReactions:[100,100,100,100],
  barNo:'#9', nBar:12, capAsReq:60, capAsProv:77.628,
};
const payload = Bridge.buildPayload(snapshot, {
  calculationFingerprint:'CF-0123456789ABCDEF',
  primaryCombination:'ULS-G',
  loadCases:[
    { id:'LC2', combination:'ULS-X', PuTf:500, MuxTfm:0, MuyTfm:60, reactions:[115,115,135,135] },
    { id:'LC3', combination:'ULS-Y', PuTf:500, MuxTfm:60, MuyTfm:0, reactions:[115,135,115,135] },
  ],
});
const baseInput = {
  capLengthX:600, capWidthY:600, h:180, columnX:100, columnY:100, loadNodeDepth:20, pileDiameter:100,
  fc:280, fy:4200, lambda:1, betaC:1, betaS:0.4, strutArea:7853.981633974483,
  topNodeArea:10000, bottomNodeArea:7853.981633974483,
  xTieMinimumArea:60, yTieMinimumArea:60,
  xTie:{ barArea:6.469, barDiameter:2.87, count:12, rows:2, sideCover:7.5, transverseBarDiameter:1.27, maxAggregateSize:2.5, verticalClearSpacing:3 },
  yTie:{ barArea:6.469, barDiameter:2.87, count:12, rows:2, sideCover:7.5, transverseBarDiameter:1.27, maxAggregateSize:2.5, verticalClearSpacing:3 },
  distributionReinforcementComplies:false,
  reactionSourceConfirmed:false, threeDimensionalTopologyConfirmed:false, nodalGeometryConfirmed:false,
  anchorageConfirmed:false, localTieDistributionConfirmed:false,
};

const result = Envelope.evaluate(payload, baseInput);
assert.equal(result.caseCount, 3);
assert.equal(result.cases.length, 3);
const xTieControl = result.entries.find(item => item.key === 'xTie');
const yTieControl = result.entries.find(item => item.key === 'yTie');
assert.ok(xTieControl && xTieControl.caseId !== 'LC1');
assert.ok(yTieControl && yTieControl.caseId !== 'LC1');
assert.notEqual(xTieControl.caseId, yTieControl.caseId);
assert.ok(result.entries.every(item => item.combination));
assert.ok(result.overallControl && result.overallControl.caseId);
assert.equal(result.calculationFingerprint, 'CF-0123456789ABCDEF');

const broken = JSON.parse(JSON.stringify(payload));
broken.model.loadCases[1].reactions[0].reactionTf = 80;
assert.throws(() => Envelope.evaluate(broken, baseInput), /第 2 組樁反力合計.*不平衡/);

console.log('pile-cap 3D STM load-case envelope tests passed');
