const assert = require('node:assert/strict');
const core = require('../結構工具箱/tools/rc/column-cover-biaxial.js');
const ref = require('./fixtures/column-cover-biaxial.json');
const pm = require('../鋼筋混凝土/shared/pmsection.js');
const lines = coords => [core.header.join('\t'), ...coords.map(([x,y],i) =>
  [ref.ids[i],x,y,ref.areaCm2,'合成','雙軸獨立條帶例'].join('\t'))].join('\n');
const input = {widthMm:ref.widthMm,depthMm:ref.depthMm,fc:ref.material[0],fy:ref.material[1],caseId:'S-01',
  materialBasis:'合成斷面與材料',demandBasis:'單一合成工況',designBars:lines(ref.bars.design),observedBars:lines(ref.bars.observed)};
const close = (actual,expected,tol=2e-4) => assert.ok(Math.abs(actual-expected)<tol,actual+' vs '+expected);
function demand(c) {
  return {...input,mode:c.mode,pTf:c.pTf,mxTfm:40*Math.cos(c.angle*Math.PI/180),myTfm:40*Math.sin(c.angle*Math.PI/180)};
}
for (const c of ref.cases) {
  const result = core.calculate(demand(c));
  for (const name of ['design','observed']) {
    const r=result[name], target=c[name];
    if (target.positiveIntersectionsTfm.length>1) {
      assert.equal(r.ok,null);
      assert.equal(r.capacityTfm,null);
      const positive=r.intersections.filter(a=>a.radial>0).sort((a,b)=>a.radial-b.radial);
      assert.equal(positive.length,target.positiveIntersectionsTfm.length);
      positive.forEach((a,i)=>close(a.radial,target.positiveIntersectionsTfm[i]));
      continue;
    }
    assert.ok(r.point,JSON.stringify([name,c.mode,c.pTf,c.angle,r.status]));
    close(r.capacityTfm,target.capacityTfm);
    for (const key of ['cCm','pnTf','mnxTfm','mnyTfm','epsT','phi']) close(r.point[key],target[key]);
    close(Math.sin(r.point.normalDeg*Math.PI/180),Math.sin(target.normalDeg*Math.PI/180),1e-5);
    close(r.point.pResidual,0,1e-6); close(r.point.cross,0,1e-7);
    if (c.mode==='nominal') assert.equal(r.ok,null);
  }
  if(c.mode==='design' && [0,90,180,-90].includes(c.angle)){
    const lateral = Math.abs(c.angle)===90;
    const extent = lateral ? ref.widthMm/10 : ref.depthMm/10;
    const bars = ref.bars.design.map(([x,y])=>{
      const d=(lateral?x:y)/10;return {As:ref.areaCm2,y:c.angle===180 || c.angle===-90 ? extent-d : d};
    });
    const curve=pm.curve({b:lateral?ref.depthMm/10:ref.widthMm/10,h:extent,bars},{fc:280,fy:4200,Es:2040000},{steps:181});
    close(pm.checkDemand(curve.design,c.pTf,40).phiMn,result.design.capacityTfm,.025);
  }
}
const base=demand(ref.cases.find(c=>c.mode==='design'&&c.angle===30));
const current=core.calculate(base);
assert.ok(current.design.ok);assert.equal(current.positions[0].dxMm,15);
const reflect=core.calculate({...base,myTfm:-base.myTfm,observedBars:lines(ref.bars.observed.map(([x,y])=>[ref.widthMm-x,y]))});
close(current.observed.capacityTfm,reflect.observed.capacityTfm,1e-6);
const exchange=core.calculate({...base,widthMm:base.depthMm,depthMm:base.widthMm,mxTfm:base.myTfm,myTfm:base.mxTfm,
  observedBars:lines(ref.bars.observed.map(([x,y])=>[y,x])),designBars:lines(ref.bars.design.map(([x,y])=>[y,x]))});
close(exchange.observed.capacityTfm,current.observed.capacityTfm,1e-6);
assert.notEqual(core.calculate({...base,myTfm:-base.myTfm}).observed.capacityTfm,current.observed.capacityTfm);
assert.equal(core.calculate({...base,pTf:1000}).observed.ok,false);
assert.equal(core.calculate({...base,mxTfm:0,myTfm:0}).observed.ok,true);
assert.equal(core.calculate({...base,pTf:current.design.limits.pMinTf,mxTfm:0,myTfm:0}).observed.ok,false);
assert.equal(core.calculate({...base,pTf:current.design.limits.pMinTf,mxTfm:0,myTfm:0}).design.ok,true);
const cap=current.observed.limits.pMaxTf;
assert.equal(core.calculate({...base,pTf:cap,mxTfm:5,myTfm:3}).observed.ok,true);
assert.equal(core.calculate({...base,pTf:cap,mxTfm:500,myTfm:300}).observed.ok,null);
const unmatched=base.observedBars.replace('T1','R99');
assert.throws(()=>core.calculate({...base,observedBars:unmatched}),/筋號未對應/);
const differing=core.calculate({...base,observedBars:unmatched,layoutBasis:'已查核另一編號之位置，詳圖 R2'});
assert.equal(differing.positions.find(b=>b.id==='T1').observed,null);
assert.equal(differing.positions.find(b=>b.id==='R99').dxMm,null);
for (const changed of [{observedBars:''},{mxTfm:''},{myTfm:null},{fc:true},{caseId:''},
  {observedBars:base.observedBars.replace('T2','T1')},{observedBars:lines(ref.bars.design.map(()=>[10,10]))}])
  assert.throws(()=>core.calculate({...base,...changed}));
console.log('PASS',ref.cases.length*2,'independent strip-integral points, four PMSection checks, mirror, axis exchange, axial endpoints and missing inputs.');
