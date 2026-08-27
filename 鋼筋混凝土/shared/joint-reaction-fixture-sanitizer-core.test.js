const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Adapter = require('./joint-reaction-load-adapter.js');
const Core = require('./joint-reaction-fixture-sanitizer-core.js');

const raw = [
  'TABLE: "PRIVATE PROJECT - Joint Reactions"',
  'Story,Point,Unique Name,OutputCase,CaseType,StepType,StepNum,F1,F2,F3,M1,M2,M3,Private Note',
  'BASE,PRIVATE-JOINT,9001,PRIVATE-DEAD,Linear Static,,,0,0,987654.321,0,0,0,PRIVATE DESIGNER',
].join('\n');
const options = {
  raw,
  software:'ETABS',
  softwareVersion:'23.0.0',
  units:'kN / kN·m',
  tableName:'Joint Reactions',
  originKind:'actual-observed',
  sourceExtension:'.csv',
  generatedAt:'2026-08-27T02:00:00+08:00',
};

const direct = Core.sanitizeExportStructure(options);
assert.equal(Core.schemaVersion, 'rc-joint-reaction-anonymization-evidence.v1');
assert.equal(direct.evidence.originKind, 'actual-observed');
assert.equal(direct.evidence.source.softwareVersion, '23.0.0');
assert.equal(direct.evidence.source.sha256, undefined, 'pure core must not invent hashes');
assert.equal(direct.evidence.output.sha256, undefined, 'pure core leaves hashing to host');
assert.match(direct.sanitized, /STORY_001,JOINT_001,UNIQUE_001,CASE_001,Linear Static/);
for (const secret of ['PRIVATE PROJECT', 'PRIVATE-JOINT', '9001', 'PRIVATE-DEAD', '987654.321', 'PRIVATE DESIGNER']) {
  assert.equal(direct.sanitized.includes(secret), false, `pure sanitizer leaked ${secret}`);
}

const browserContext = { JointReactionLoadAdapter:Adapter };
browserContext.globalThis = browserContext;
vm.createContext(browserContext);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, 'joint-reaction-fixture-sanitizer-core.js'), 'utf8'),
  browserContext,
  { filename:'joint-reaction-fixture-sanitizer-core.js' }
);
const browserCore = browserContext.JointReactionFixtureSanitizerCore;
assert.equal(typeof browserCore?.sanitizeExportStructure, 'function', 'browser global sanitizer core is available');
const browserResult = browserCore.sanitizeExportStructure(options);
assert.equal(browserResult.sanitized, direct.sanitized, 'browser and Node sanitizer output must match byte-for-byte');
assert.equal(JSON.stringify(browserResult.evidence), JSON.stringify(direct.evidence), 'browser and Node structural evidence must match');

assert.throws(
  () => Core.sanitizeExportStructure({ ...options, softwareVersion:'' }),
  /軟體版本不得空白/
);
assert.throws(
  () => Core.sanitizeExportStructure({ ...options, sourceExtension:'.xlsx' }),
  /只支援/
);

console.log('joint reaction fixture sanitizer core tests passed');
