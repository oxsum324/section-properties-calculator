const assert=require('node:assert/strict');
const core=require('../結構工具箱/tools/floor-slab/floor-plate-fem.js');
const independent=require('./fixtures/floor-plate-ritz.json');
const tsv=rows=>rows.map(row=>row.join('\t')).join('\n');
const base={caseId:'合成',basis:'自由板基準',width:5,depth:5,hMm:180,eMpa:28000,nu:.2,kMNm3:50,angle:0,face:'bottom',joint:'none',mesh:16};
const loads=data=>tsv([core.loadHeaders,...data.map(([x,y,p,b,d],i)=>['L'+i,x,y,b,d,p,1,'載重圖 '+i])]);
const point=(x,y)=>tsv([core.pointHeaders,['A',x,y]]);
const near=(x,y,tol)=>assert.ok(Number.isFinite(x)&&Math.abs(x-y)<tol,x+' vs '+y+' tolerance '+tol);
function run(raw,mesh=16){return core.evaluate(core.normalize(raw),mesh);}
let dual;
for(const [label,c] of Object.entries(independent.cases)){
  const raw={...base,loads:loads(c.loads),points:tsv([core.pointHeaders,...Object.entries(c.points).map(([id,p])=>[id,p.xM,p.yM])])};
  const {coarse,fine}=core.calculate(raw);
  for(const v of fine.observations){
    const ref=c.points[v.id].total;
    near(v.sx,ref.bottomXmpa,.025);near(v.sy,ref.bottomYmpa,.025);
    near(v.tau,ref.bottomXYmpa,.01);near(v.wMm,ref.wMm,5e-6);
  }
  for(const v of [...fine.observations,fine.max,fine.min]){
    for(const key of ['stress','wMm','sx','sy','tau'])near(v[key],v.parts.reduce((s,q)=>s+q[key],0),1e-9);
    assert.ok(v.stress<=fine.max.stress+1e-10 && v.stress>=fine.min.stress-1e-10);
  }
  near(fine.applied,c.springForceKn,1e-7);near(fine.balance,0,1e-6);
  if(label==='中央'){
    const r=c.points['第一輪心'].total.bottomXmpa;
    assert.ok(Math.abs(fine.max.stress-r)<Math.abs(coarse.max.stress-r));
  }
  if(label==='雙輪')dual={raw,fine};
}
const fixed=run({...base,loads:loads([[2.5,2.5,250,5,5]]),points:point(1.7,2.3)},8);
near(fixed.observations[0].wMm,.2,1e-8);near(fixed.max.stress,0,1e-8);near(fixed.min.stress,0,1e-8);
assert.ok(dual.fine.minW.wMm<0);
const coarse=run(dual.raw,16), mirrored=run({...dual.raw,loads:loads(independent.cases['雙輪'].loads.map(([x,...v])=>[5-x,...v])),points:point(2.5,2.5)},16);
const best=coarse.observations.filter(r=>r.id==='板中央'),match=mirrored.observations.find(q=>q.tx===1-best[0].tx && q.ty===best[0].ty);
near(match.sx,best[0].sx,1e-8);near(match.tau,-best[0].tau,1e-8);
const angle=run({...dual.raw,face:'top',angle:45},16);
for(const q of angle.observations){
  const b=coarse.observations.find(v=>v.id===q.id&&v.i===q.i&&v.j===q.j);
  near(q.stress,-(b.sx+b.sy+2*b.tau)/2,1e-9);
}
const seam={...base,width:6,depth:3,mesh:8,joint:'free',jointsX:'2',points:point(2,1.25)};
const split=run({...seam,loads:loads([[2.05,1.25,80,.4,.3]])},8);
near(split.panels[0].forces[0].applied,30,1e-8);near(split.panels[1].forces[0].applied,50,1e-8);
assert.equal(new Set(split.observations.map(v=>v.panel)).size,2);
const separate=run({...seam,loads:loads([[1,1.25,80,.4,.3]])},8);near(separate.panels[1].forces[0].reaction,0,1e-12);
assert.ok(separate.observations.filter(p=>p.panel==='2-1').every(v=>v.stress===0));
const swapped=run({...base,width:3,depth:6,mesh:8,joint:'free',jointsY:'2',angle:90,points:point(1.25,2),loads:loads([[1.25,2.05,80,.3,.4]])},8);
near(swapped.max.stress,split.max.stress,1e-8);near(swapped.min.stress,split.min.stress,1e-8);
for(const bad of [{basis:''},{hMm:''},{joint:'unknown'},{joint:'free'},{jointsX:'2'},{loads:loads([[0,0,40,.24,.3]])},{points:point(-1,1)}])
  assert.throws(()=>core.normalize({...dual.raw,...bad}));
console.log('PASS 100 階獨立自由板五例、全板均布、同點有號分量、旋轉、板面、跨縫分攤、兩側觀察、反力與資料界限。');
