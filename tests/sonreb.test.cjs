const assert=require('node:assert/strict');
const core=require('../結構工具箱/tools/concrete-ndt/sonreb-model.js');
const ref=require('./fixtures/sonreb-reference.json');
const rows=[];
for(const z of ref.zones)for(const [m,items] of Object.entries({R:z.rebound,V:z.velocityKmS,C:z.cores})){
  items.forEach((c,i)=>rows.push([z.material,z.condition,z.zone,z.role,m,m==='C'?c.id:m+(i+1),m==='C'?c.rawMpa:c,m==='C'?c.factor:'',m==='C'?c.factorBasis:'合成量測']));
}
const table=records=>[core.headers,...records].map(r=>r.join('\t')).join('\n');
const solve=records=>core.analyze(core.parse(table(records))[0]);
const near=(a,b,tol=1e-5)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<tol,a+' vs '+b);
const base=solve(rows);assert.equal(base.model.nCores,22);assert.equal(base.model.nZones,8);
for(const [i,c] of base.model.beta.entries())near(c,ref.fit.beta[i]);
near(base.model.varianceWithinLog,ref.fit.varianceWithinLog,1e-8);near(base.model.varianceBetweenLog,ref.fit.varianceBetweenLog,1e-8);
for(const [actual,expected] of [[base.loo,ref.leaveOneZoneOut],[base.external,ref.externalHoldout]]){
  assert.equal(actual.length,expected.length);
  for(const p of actual){
    const e=expected.find(v=>v.zone===p.zone);
    assert.ok(!p.trainingZones.includes(p.zone));
    assert.equal(p.insideHull,e.insideHull);near(p.medianMpa,e.medianMpa);
    p.individualCoreApprox95Mpa.forEach((v,i)=>near(v,e.individualCoreApprox95Mpa[i],5e-5));
    p.errors.forEach((v,i)=>{near(v.differenceMpa,e.predictedMinusMeasuredMpa[i]);near(v.correctedMpa,e.measuredCoreMpa[i]);});
  }
}
const other=rows.map(r=>['M2','另一儀器',r[2],r[3],r[4],r[4]==='C'?'M2-'+r[5]:r[5],r[4]==='C'?r[6]*2:r[6],r[7],r[8]]);
const split=core.parse(table([...rows,...other]));assert.equal(split.length,2);
near(core.analyze(split[1]).external[0].medianMpa,base.external[0].medianMpa*2);
const held=solve(rows.map(r=>r[3]==='外留'&&r[4]==='C'?[...r.slice(0,6),r[6]*3,...r.slice(7)]:r));
assert.deepEqual(held.model,base.model);
const conditionSplit=core.parse(table([...rows,...other.map(r=>['M1',...r.slice(1)])]));assert.equal(conditionSplit.length,2);
const corrected=solve(rows.map(r=>r[4]==='C'?[...r.slice(0,6),r[6]/2,2,r[8]]:r));
assert.deepEqual(corrected.model,base.model);
assert.throws(()=>solve(rows.filter(r=>r[2]!=='Z01'||r[4]!=='V')),/待補/);
assert.throws(()=>solve(rows.filter(r=>!['Z04','Z05','Z06','Z07','Z08'].includes(r[2]))),/四個/);
assert.throws(()=>solve(rows.map(r=>r[4]==='V'?[...r.slice(0,6),4,...r.slice(7)]:r)),/分別辨識/);
const one=rows.filter(r=>r[4]!=='C'||r[5].endsWith('-1'));assert.throws(()=>solve(one),/重複鑽心/);
const required=rows.find(r=>r[4]==='C');
for(const bad of [[...required.slice(0,7),'',required[8]],[...required.slice(0,6),'',1,required[8]],[...required.slice(0,8),'']])
  assert.throws(()=>core.parse(table([bad])));
assert.throws(()=>core.parse(table([...rows,required])),/重複/);
const mixed=rows.map(r=>r[2]==='Z01'&&r[4]==='V'?[...r.slice(0,3),'外留',...r.slice(4)]:r);
assert.throws(()=>solve(mixed),/不同用途/);
const unknown=rows.filter(r=>r[2]==='Z09'&&r[4]!=='C').map(r=>[...r.slice(0,2),'Z11','推估',...r.slice(4)]);
const addition=solve([...rows,...unknown]);assert.equal(addition.external.at(-1).errors.length,0);
near(addition.external.at(-1).medianMpa,base.external[0].medianMpa);
const incomplete=solve(rows.filter(r=>r[2]!=='Z10'||r[4]!=='R'));assert.match(incomplete.external[1].reason,/待補/);
console.log('PASS SonReb REML 圖形範圍、8 折整區留出、2 區外留、逐顆誤差、區間、跨群、缺值及修正依據。');
