'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../結構工具箱/tools/rc/teaspa-pm3.js');
const source = require('../結構工具箱/tools/rc/teaspa-column-reference.js');
const target = require('./fixtures/teaspa-etabs22-readback.json');
test('reopened ETABS single column, axial sign, both ends, nine signed backbone points', () => {
  const r = api.compare(source,target);
  assert.deepEqual(r.differences,[]);
  assert.deepEqual(r.interaction.map(p => Number(p.targetPKgf)), source.pm.map(([p])=>-p));
  assert.deepEqual(r.signed.map(p=>[p.label,p.momentRatio || 0,p.rotationRad || 0]),source.backbone);
  assert.deepEqual(r.ends.map(p=>Number(p.ActualDist)),[0,150]);
  assert.equal(r.signed.filter(p=>p.origin.includes('對稱')).length,4);
  assert.equal(r.pushoverRun,false);
  assert.deepEqual([r.criteria.IO,r.criteria.LS,r.criteria.CP],['2','4','6']);
});
for (const [name,mutate] of Object.entries({
  '缺值不得當作零': r=>{r.hinges[0].Rotation='';},
  '互制軸力翻號':r=>{r.hinges[6].POverSF='249421';},
  'E 點轉角受捨入':r=>{r.hinges[4].Rotation='0.4440';},
  '選錯側向':r=>{r.model.axes=[1,0,0,0,1,0,0,0,1];},
  '原點重複而遺漏柱頂':r=>{r.ends[1]=r.ends[0];},
  '背骨正負條件不符':r=>{r.hinges[0].IsMRSym='No';},
  '不同構件的讀回':r=>{r.source.member='other';},
  '斷面強弱軸錯置':r=>{r.model.i33Cm4=5000;},
  '不同版本':r=>{r.model.version='unknown';}
})) test(name,()=>{const r=structuredClone(target); mutate(r); assert.equal(api.compare(source,r).matched,false);});
test('rejects incomplete, non-monotonic and asymmetric source without filling values',()=>{
  for (const mutate of [s=>{s.curvePKgf=null;},s=>{s.backbone[0][2]=-.3;},s=>{s.pm.reverse();},s=>{s.backbone[5][2]=.001;},s=>{s.yieldMKgfCm*=1.1;}]) {
    const s=structuredClone(source); mutate(s); assert.throws(()=>api.tables(s));
  }
});
test('native table uses unrounded physical units and does not invent performance criteria',()=>{
  const {hinges,ends}=api.tables(source);
  assert.equal(hinges.length,11); assert.equal(hinges[1].M3OverSF,2506914);
  assert.equal(hinges[0].M3SF,1);
  assert.equal(hinges[0].MRForce,-249421);
  assert.equal(hinges[0].IO,undefined);
  assert.equal(ends.length,2);
});