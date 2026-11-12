// 梁左端為全梁座標零點。每段 [x0,x1,M0,c1,c2,c3] 以 t=(x−x0)/(x1−x0) 表示 M(t)。
export const braceMethods = { end: '極限設計法 §7.2.2 正文端彎矩法', quarter: '極限設計法 §7.2.2 解說四分點法' };
export const braceFlanges = { top:'上翼板', bottom:'下翼板', both:'兩翼板' };
export const braceUnits = { 'tf-m':['m','tf·m',100], 'kN-m':['m','kN·m',100], 'kgf-cm':['cm','kgf·cm',1] };
const fmt = n => String(Number(n.toPrecision(8)));
const hash = values => globalThis.StructReportUtils.sha256Text(JSON.stringify(values));
export const braceScope = p => hash([p.project,p.member]);

export function makeMomentProfile(model, elements, clipLoad, sectionState) {
  const offsets = [0], hinges = [], pieces = [];
  for (const span of model.spans) {
    const origin = offsets.at(-1);
    hinges.push(...(span.hinges || []).map(x => origin+x));
    offsets.push(origin+span.L);
  }
  for (const e of elements) {
    const span = model.spans[e.spanIdx];
    const loads = (model.loads[e.spanIdx] || []).map(ld => clipLoad(ld.type==='trapezoid' ? {...ld,_spanL:span.L} : ld,e.x1,e.x2)).filter(Boolean);
    const breaks = [...new Set([0,e.L,...loads.filter(ld=>ld.type==='point'||ld.type==='moment').map(ld=>ld.a)])].sort((a,b)=>a-b);
    let w0=0, gradient=0;
    for (const ld of loads) {
      if (ld.type==='udl') w0+=ld.w;
      if (ld.type==='trapezoid') { w0+=ld.w1; gradient+=(ld.w2-ld.w1)/e.L; }
    }
    for (let i=1;i<breaks.length;i++) {
      const x=breaks[i-1], dx=breaks[i]-x;
      const {M,V}=sectionState(x,e.L,e.endForces,loads,'right');
      const origin=offsets[e.spanIdx]+e.x1;
      pieces.push([origin+x,origin+breaks[i],M,V*dx,-(w0+gradient*x)*dx**2/2,-gradient*dx**3/6]);
    }
  }
  return { offsets, hinges, pieces, freeStart:model.supports[0].type==='free', freeEnd:model.supports.at(-1).type==='free' };
}

function moment(piece,x) {
  const [a,b,m,c1,c2,c3]=piece,t=(x-a)/(b-a);
  return ((c3*t+c2)*t+c1)*t+m;
}
function zeroShear([a,b,,linear,quadratic,cubic]) {
  // 經係數尺度化，並以乘積求另一根，避免兩個近似數相減。
  const scale=Math.max(Math.abs(linear),Math.abs(2*quadratic),Math.abs(3*cubic));
  if (!scale) return [];
  const A=3*cubic/scale, B=2*quadratic/scale, C=linear/scale;
  const eps=32*Number.EPSILON;
  let roots=[];
  if (Math.abs(A)<=eps) { if(Math.abs(B)>eps) roots=[-C/B]; }
  else {
    const disc=B*B-4*A*C;
    if(disc>=-eps) {
      const q=-0.5*(B+(B<0?-1:1)*Math.sqrt(Math.max(0,disc)));
      roots=q===0 ? [-B/(2*A)] : [q/A,C/q];
    }
  }
  return roots.filter(t=>t>0&&t<1).map(t=>a+(b-a)*t);
}
function sides(pieces,x,tol) {
  const left=pieces.find(p=>p[0]<x-tol&&p[1]>=x-tol);
  const right=pieces.find(p=>p[0]<=x+tol&&p[1]>x+tol);
  const value=p=>p ? moment(p,Math.min(p[1],Math.max(p[0],x))) : null;
  return {x,left:value(left),right:value(right)};
}
export function spanLocation(profile,x,end=false) {
  const o=profile.offsets;
  let i=o.slice(1).findIndex(bound=>end ? x<=bound : x<bound);
  if(i<0)i=o.length-2;
  return '第 '+(i+1)+' 跨＋'+fmt(x-o[i]);
}
export function evaluateBrace(profile, input) {
  const {start,end,method,flange,restraints,jump}=input;
  const extent=profile.offsets.at(-1), tol=32*Number.EPSILON*Math.max(1,extent);
  if (![start,end].every(Number.isFinite)||start<0||end>extent||end-start<=2*tol) return {cb:null,issue:'請指定梁內兩個不同的側撐位置，終點須在起點右方。'};
  const pieces=profile.pieces.filter(p=>p[1]>start+tol&&p[0]<end-tol);
  if(!pieces.length)return {cb:null,issue:'所選段沒有連續分析結果。'};
  const points=[];
  for(const p of pieces){
    const l=Math.max(p[0],start),r=Math.min(p[1],end);
    points.push({x:l,m:moment(p,l),side:'右'},{x:r,m:moment(p,r),side:'左'});
    for(const x of zeroShear(p)) if(x>l&&x<r) points.push({x,m:moment(p,x),side:'連續'});
    if(p.slice(3).every(c=>c===0))points.push({x:(l+r)/2,m:p[2],side:'連續'});
  }
  if(!points.every(p=>Number.isFinite(p.m)))return {cb:null,issue:'彎矩超出可計算的數值範圍。'};
  const peak=points.reduce((a,b)=>Math.abs(b.m)>Math.abs(a.m)?b:a);
  const max=Math.abs(peak.m), mTol=max*1e-10;
  const ties=[];
  const maxima=points.filter(p=>Math.abs(Math.abs(p.m)-max)<=mTol).sort((a,b)=>a.x-b.x||a.m-b.m);
  for(const p of maxima) {
    const last=ties.at(-1);
    if(!last || Math.abs(last.x-p.x)>tol || Math.abs(last.m-p.m)>mTol) ties.push(p);
  }
  const constantBands=[];
  for(const piece of pieces) {
    if(Math.abs(Math.abs(piece[2])-max)>mTol || piece.slice(3).some(v=>Math.abs(v)>mTol))continue;
    const a=Math.max(start,piece[0]), b=Math.min(end,piece[1]),last=constantBands.at(-1);
    if(last && Math.abs(last.end-a)<=tol && Math.abs(last.m-piece[2])<=mTol) last.end=b;
    else constantBands.push({start:a,end:b,m:piece[2]});
  }
  const mStart=moment(pieces[0],start),mEnd=moment(pieces.at(-1),end);
  const endMax=Math.max(Math.abs(mStart),Math.abs(mEnd));
  const interiorControls=points.some(p=>p.x>start+tol&&p.x<end-tol&&Math.abs(p.m)>=endMax-mTol);
  const larger=Math.abs(mStart)>=Math.abs(mEnd)?mStart:mEnd,smaller=larger===mStart?mEnd:mStart;
  // 梁內力圖等號向彎矩為單曲率；正文端彎矩比以雙曲率為正。
  const ratio=larger ? -smaller/larger : 0;
  const body=max ? (interiorControls||!larger?1:Math.min(2.3,1.75+1.05*ratio+0.3*ratio**2)) : null;
  const quarters=[1,2,3].map(i=>sides(pieces,start+(end-start)*i/4,tol));
  if(quarters.some(p=>!Number.isFinite(p.left)||!Number.isFinite(p.right)))return {cb:null,issue:'四分點缺少連續分析資料。'};
  const hasJump=quarters.some(p=>Math.abs(p.left-p.right)>mTol);
  const [ma,mb,mc]=quarters.map(p=>Math.max(Math.abs(p.left),Math.abs(p.right)));
  const quarter=max && (!hasJump||jump==='envelope') ? 12.5*max/(2.5*max+3*ma+4*mb+3*mc) : null;
  let issue='';
  if(restraints==='cantilever')issue='未側撐懸臂依規範取 Cb＝1，請另行核對。';
  else if(restraints!=='both')issue='請確認所選段的兩端均有有效側撐。';
  else if(profile.hinges.some(x=>x>start+tol&&x<end-tol))issue='段內有內鉸，請分段或另行確認構件連續性。';
  else if(!Object.hasOwn(braceFlanges,flange))issue='請指定受到側向支撐的翼板。';
  else if((flange==='top'&&points.some(p=>p.m < -mTol))||(flange==='bottom'&&points.some(p=>p.m>mTol)))issue='所選翼板未涵蓋全段受壓側，請核對反曲位置及兩翼板的側撐。';
  else if(!max)issue='全段彎矩為零，沒有可採用的 Cb。';
  else if(!Object.hasOwn(braceMethods,method))issue='請選擇 Cb 計算方法。';
  else if(method==='quarter'&&quarter===null)issue='四分點有彎矩突跳，請核對左右側或指定絕對值包絡。';
  const chosen=method==='quarter'?quarter:body;
  const result={start,end,length:end-start,mStart,mEnd,peak,ties,constantBands,quarters,body:restraints==='cantilever'?1:body,
    quarter:restraints==='cantilever'?null:quarter,hasJump,ratio,interiorControls,issue};
  if(!issue && !(Number.isFinite(chosen) && chosen>0))result.issue='未能取得有效 Cb。';
  result.cb=result.issue ? null : chosen;
  return result;
}

function validProfile(p){
  if(!p||!Array.isArray(p.offsets)||p.offsets.length<2||p.offsets[0]!==0||!p.offsets.every((v,i,a)=>Number.isFinite(v)&&(!i||v>a[i-1])))return false;
  const end=p.offsets.at(-1),eps=32*Number.EPSILON*Math.max(1,end);
  return Array.isArray(p.hinges)&&p.hinges.every(x=>Number.isFinite(x)&&x>0&&x<end)
    &&typeof p.freeStart==='boolean'&&typeof p.freeEnd==='boolean'&&Array.isArray(p.pieces)&&p.pieces.length>0
    &&p.pieces.every((row,i,all)=>Array.isArray(row)&&row.length===6&&row.every(Number.isFinite)&&row[1]>row[0]&&Math.abs(row[0]-(i?all[i-1][1]:0))<=eps)
    &&Math.abs(p.pieces.at(-1)[1]-end)<=eps;
}
function braceId(p) {
  const c=p.profile, s=p.selection;
  return hash([p.kind,p.project,p.member,p.revision,p.caseName,p.combination,p.basis,p.units,p.fingerprint,p.engine,
    c.offsets,c.hinges,c.freeStart,c.freeEnd,c.pieces,s.start,s.end,s.restraints,s.flange,s.method,s.jump]);
}
export function sealBrace(p) {
  return {...p,result:evaluateBrace(p.profile,p.selection),id:braceId(p)};
}
// 依欄位比對，不受 JSON 物件鍵順序影響。歷史數值須能由原分段曲線重新計算。
function sameResult(actual,expected) {
  if(actual===expected)return true;
  if(!actual||!expected||typeof actual!=='object'||typeof expected!=='object'||Array.isArray(actual)!==Array.isArray(expected))return false;
  const keys=Object.keys(expected);
  return Object.keys(actual).length===keys.length && keys.every(k=>Object.hasOwn(actual,k)&&sameResult(actual[k],expected[k]));
}
export function validBrace(p){
  if(!p||p.kind!=='beam-brace-v1'||!p.selection||!validProfile(p.profile)||!Object.hasOwn(braceUnits,p.units)
    ||!['','envelope'].includes(p.selection.jump)||!/^continuous-beam\.inline\.v\d+\.\d+\.\d+$/.test(p.engine)||p.basis!=='factored'||![p.project,p.member,p.caseName,p.combination].every(x=>typeof x==='string'&&x.length>0&&x.length<=100&&x.trim()===x)
    ||!Number.isSafeInteger(p.revision)||p.revision<1||!/^[a-f0-9]{64}$/.test(p.fingerprint)||braceId(p)!==p.id)return false;
  const r=evaluateBrace(p.profile,p.selection);
  return Number.isFinite(r.cb)&&r.cb>0&&sameResult(p.result,r);
}
export function braceRows(p) {
  const r=evaluateBrace(p.profile,p.selection),u=braceUnits[p.units],peak=Math.abs(r.peak.m);
  const fm=v=>Math.abs(v)<=peak*1e-12 ? '0' : fmt(v);
  const quarter=q=>Math.abs(q.left-q.right)>peak*1e-10 ? fm(q.left)+'／'+fm(q.right)+'（左／右）' : fm(q.left);
  const isolated=r.ties.filter(t=>!r.constantBands.some(b=>t.x>=b.start&&t.x<=b.end&&Math.abs(t.m-b.m)<=peak*1e-10));
  const positions=[...r.constantBands.map(b=>fmt(b.start)+'～'+fmt(b.end)+'（全區間）'),
    ...isolated.map(t=>fmt(t.x)+'（'+t.side+'）')];
  return [
    {label:'來源案例',value:[p.project,p.member,p.caseName,p.combination,'R'+p.revision].join(' ／ ')},
    {label:'側撐配置與段界',value:'兩端有效側撐，'+braceFlanges[p.selection.flange]+'；'+spanLocation(p.profile,r.start)+' 至 '+spanLocation(p.profile,r.end,true)+' '+u[0]+'；全梁 x = '+fmt(r.start)+'～'+fmt(r.end)+' '+u[0]},
    {label:'未側撐長度 Lb',value:fmt(r.length),unit:u[0]},
    {label:'起點右側／終點左側彎矩',value:fm(r.mStart)+' ／ '+fm(r.mEnd),unit:u[1]},
    {label:'最大絕對彎矩與位置',value:fmt(peak)+' '+u[1]+'；全梁 x = '+positions.join('、')+' '+u[0]},
    {label:'MA ／ MB ／ MC（有號）',value:r.quarters.map(quarter).join('；')+' '+u[1]+(r.hasJump&&p.selection.jump==='envelope'?'，跳點採絕對值包絡':'')},
    {label:'比較與採用',value:'正文 '+fmt(r.body)+'；四分點 '+(r.quarter==null?'待核':fmt(r.quarter))+'。採 '+braceMethods[p.selection.method]+'，Cb = '+fmt(r.cb)},
    {label:'來源引擎與分析指紋',value:p.engine+' ／ '+p.fingerprint},
    {label:'段資料指紋',value:p.id},
  ];
}
export function braceText(p) {
  return braceRows(p).map(r=>r.label+'：'+r.value+(r.unit?' '+r.unit:'')).join('｜');
}
export function braceGraphValues(profile) {
  return profile.pieces.flatMap(p=>Array.from({length:17},(_,i)=>{const x=p[0]+(p[1]-p[0])*i/16;return [x,moment(p,x)];}));
}


export function sameBraceStation(station,brace) {
  if(!station) return true;
  if(!['project','member','caseName','combination','revision','fingerprint','basis','units'].every(k=>station[k]===brace[k]))return false;
  const o=brace.profile.offsets,i=station.span-1;
  if(!Number.isInteger(i)||i<0||i>=o.length-1)return false;
  const x=o[i]+station.x,{start,end}=brace.selection,tol=32*Number.EPSILON*Math.max(1,o.at(-1));
  const at=sides(brace.profile.pieces,x,tol);
  const relevant=station.side==='left'?[at.left]:station.side==='right'?[at.right]:[at.left,at.right].filter(v=>v!==null);
  const scale=Math.max(Math.abs(evaluateBrace(brace.profile,brace.selection).peak.m),Math.abs(station.moment));
  if(!Number.isFinite(station.moment)||!relevant.length||relevant.some(v=>!Number.isFinite(v)||Math.abs(v-station.moment)>1e-8*Math.max(scale,1e-12)))return false;
  return Math.abs(station.length-(o[i+1]-o[i]))<=tol && x>=start-tol && x<=end+tol
    && !(Math.abs(x-start)<=tol && station.side==='left') && !(Math.abs(x-end)<=tol && station.side==='right');
}
