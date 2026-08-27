const assert = require('node:assert/strict');

global.window = global;
require('./beam-applicability.js');

const bySpan = global.BeamApplicability.assess({ h: 400, ln: 1200 });
assert.equal(bySpan.status, 'deep-beam');
assert.equal(bySpan.deepBySpan, true);
assert.equal(bySpan.methodApplicable, false);
assert.match(bySpan.reason, /ln\/h=3\.000 <= 4/);

const boundaryBySpan = global.BeamApplicability.assess({ h: 400, ln: 1600 });
assert.equal(boundaryBySpan.deepBeam, true);

const byLoad = global.BeamApplicability.assess({ h: 100, ln: 600, loadDistance: 150 });
assert.equal(byLoad.deepBySpan, false);
assert.equal(byLoad.deepByLoad, true);
assert.equal(byLoad.deepBeam, true);
assert.equal(byLoad.loadDistanceRatio, 1.5);

const ordinary = global.BeamApplicability.assess({ h: 100, ln: 600, loadDistance: 250 });
assert.equal(ordinary.status, 'ordinary-beam');
assert.equal(ordinary.methodApplicable, true);
assert.equal(ordinary.loadDistanceRatio, 2.5);

const loadAtSupport = global.BeamApplicability.assess({ h: 100, ln: 600, loadDistance: 0 });
assert.equal(loadAtSupport.loadDistanceProvided, true);
assert.equal(loadAtSupport.loadDistanceRatio, 0);
assert.equal(loadAtSupport.deepByLoad, true);

const ordinarySpanOnly = global.BeamApplicability.assess({ h: 100, ln: 600, loadDistance: '' });
assert.equal(ordinarySpanOnly.status, 'ordinary-beam');
assert.equal(ordinarySpanOnly.loadDistanceProvided, false);
assert.equal(ordinarySpanOnly.loadDistanceRatio, null);
assert.match(ordinarySpanOnly.reason, /僅完成跨深比條件判定/);

const invalid = global.BeamApplicability.assess({ h: 0, ln: 600 });
assert.equal(invalid.status, 'invalid-input');
assert.equal(invalid.methodApplicable, false);

console.log('beam applicability unit: PASS');
