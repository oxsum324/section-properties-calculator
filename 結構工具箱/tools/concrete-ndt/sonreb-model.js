(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.SonReb=factory();
})(globalThis,function(){
  'use strict';
  const version='sonreb.zone-reml.v1';
  const headers=['材料群','試驗條件','測區','用途','方法','量測或試體編號','原值','鑽心修正係數','來源與修正依據'];
  const roles=['校正','外留','推估'];
  const methods=['R','V','C'];
  const groupKey=(material,condition)=>JSON.stringify([material,condition]);
  const average=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  function positive(value,label){
    if(typeof value!=='string' && typeof value!=='number')throw Error(label+'須為正數。');
    if(!String(value).trim() || !Number.isFinite(Number(value)) || !(Number(value)>0))throw Error(label+'缺值或不是有限正數。');
    return Number(value);
  }

  function parse(table){
    const lines=String(table||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
    const head=lines.shift().split('\t').map(s=>s.trim());
    if(head.length!==headers.length || !headers.every((s,i)=>s===head[i]))throw Error('請保留九欄 Excel 表頭與欄位順序。');
    const groups=new Map(), ids=new Set(),specimens=new Set();
    for(let i=0;i<lines.length;i++){
      if(!lines[i].trim())continue;
      const cells=lines[i].split('\t').map(s=>s.trim()),at='第 '+(i+2)+' 列：';
      if(cells.length!==headers.length)throw Error(at+'欄數應為九欄。');
      const [material,condition,zone,role,method,id,value,factor,source]=cells;
      if(!material || !condition || !zone || !id || !source)throw Error(at+'須填材料群、試驗條件、測區、編號與來源。');
      if(!roles.includes(role) || !methods.includes(method))throw Error(at+'用途或方法無法辨識。');
      const key=groupKey(material,condition),recordKey=JSON.stringify([key,zone,method,id]);
      if(ids.has(recordKey) || (method==='C' && specimens.has(id)))throw Error(at+'量測或鑽心編號重複：'+id);
      ids.add(recordKey);
      if(!groups.has(key))groups.set(key,{key,material,condition,zones:new Map()});
      const zones=groups.get(key).zones;
      if(!zones.has(zone))zones.set(zone,{zone,role,R:[],V:[],C:[]});
      const z=zones.get(zone);
      if(z.role!==role)throw Error(at+'同一測區不可拆為不同用途。');
      const raw=positive(value,at+'原值');
      const record={id,raw,source,row:i+2};
      if(method==='C'){
        if(role==='推估')throw Error(at+'有對照鑽心時請將整區標為外留或校正。');
        specimens.add(id);
        record.factor=positive(factor,at+'鑽心修正係數');
        record.corrected=positive(raw*record.factor,at+'修正強度');
      }else if(factor)throw Error(at+'鑽心修正係數只用於 C。');
      z[method].push(record);
    }
    if(!groups.size)throw Error('請加入同區的 R、V 及鑽心紀錄。');
    return [...groups.values()].map(g=>({...g,zones:[...g.zones.values()].map(z=>{
      const missing=methods.filter(m=>(m!=='C'||z.role!=='推估')&&!z[m].length);
      const r=z.R.length ? positive(average(z.R.map(p=>p.raw)),z.zone+' 平均反彈值'):null;
      const v=z.V.length ? positive(average(z.V.map(p=>p.raw)),z.zone+' 平均波速'):null;
      return {...z,r,v,missing};
    })}));
  }

  // V = I + lambda Z Z'. Within a zone its inverse has contrast weight 1
  // and mean weight n/(1+n*lambda). Only a 3x3 fixed-effect system is needed.
  function decompose(matrix){
    const L=[[0,0,0],[0,0,0],[0,0,0]];
    for(let i=0;i<3;i++)for(let j=0;j<=i;j++){
      let n=matrix[i][j];for(let k=0;k<j;k++)n-=L[i][k]*L[j][k];
      if(i===j){
        if(!(n>matrix[i][i]*1e-12)) throw Error('反彈數與波速無法分別辨識，請查獨立測區及共線性。');
        L[i][j]=Math.sqrt(n);
      }else L[i][j]=n/L[j][j];
    }
    return L;
  }
  function solve(L,rhs){
    const a=rhs.slice();
    for(let i=0;i<3;i++){for(let j=0;j<i;j++)a[i]-=L[i][j]*a[j];a[i]/=L[i][i];}
    for(let i=2;i>=0;i--){for(let j=i+1;j<3;j++)a[i]-=L[j][i]*a[j];a[i]/=L[i][i];}
    return a;
  }
  const features=z=>[1,Math.log(z.r/35),Math.log(z.v/4)];
  function fit(zones){
    const m=zones.length, n=zones.reduce((s,z)=>s+z.C.length,0);
    if(m<4)throw Error('三個迴歸係數及區間估計至少需要四個完整校正測區。');
    if(n===m)throw Error('缺同區重複鑽心，無法分開區內和區間變異。');
    const samples=zones.map(z=>{
      const logs=z.C.map(c=>Math.log(c.corrected)),mean=average(logs);
      return {x:features(z),n:logs.length,mean,ss:logs.reduce((s,y)=>s+(y-mean)**2,0)};
    });
    const within=samples.reduce((s,z)=>s+z.ss,0);
    if(within<1e-24*n)throw Error('同區重複鑽心未呈現可辨識變異；個別預測區間待核。');
    function profile(lambda){
      const H=[[0,0,0],[0,0,0],[0,0,0]],rhs=[0,0,0];
      let logV=0;
      for(const z of samples){
        const w=z.n/(1+lambda*z.n);
        logV+=Math.log1p(lambda*z.n);
        for(let i=0;i<3;i++){rhs[i]+=w*z.x[i]*z.mean;for(let j=0;j<3;j++)H[i][j]+=w*z.x[i]*z.x[j];}
      }
      const L=decompose(H),beta=solve(L,rhs);
      const rss=samples.reduce((s,z)=>s+z.n/(1+lambda*z.n)*(z.mean-dot(z.x,beta))**2,within);
      const variance=rss/(n-3);
      const score=(n-3)*Math.log(variance)+logV+2*(Math.log(L[0][0])+Math.log(L[1][1])+Math.log(L[2][2]));
      return {lambda,L,beta,variance,score};
    }
    let best=profile(0);
    const take=p=>{if(p.score<best.score)best=p;};
    // Bracket local minima on log(lambda), also testing the zero-variance boundary.
    const samplesGrid=[];
    for(let e=-24;e<=32;e+=2){const p=profile(Math.exp(e));samplesGrid.push(p);take(p);}
    if(best===samplesGrid[samplesGrid.length-1])throw Error('變異比分量超出可辨識的搜尋範圍。');
    for(let i=1;i<samplesGrid.length-1;i++){
      if(samplesGrid[i].score>samplesGrid[i-1].score || samplesGrid[i].score>samplesGrid[i+1].score)continue;
      let a=Math.log(samplesGrid[i-1].lambda),b=Math.log(samplesGrid[i+1].lambda);
      for(let step=0;step<44;step++){
        const l=profile(Math.exp((2*a+b)/3)),r=profile(Math.exp((a+2*b)/3));take(l);take(r);
        if(l.score<r.score)b=(a+2*b)/3;else a=(2*a+b)/3;
      }
    }
    return {beta:best.beta,L:best.L,varianceWithinLog:best.variance,varianceBetweenLog:best.variance*best.lambda,
      nZones:m,nCores:n,degreesOfFreedom:m-3,hull:convexHull(samples.map(z=>z.x.slice(1))),trainingZones:zones.map(z=>z.zone)};
  }
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  function convexHull(points){
    const sorted=points.slice().sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    function half(ps){
      const h=[];for(const p of ps){while(h.length>=2 && cross(h[h.length-2],h[h.length-1],p)<=0)h.pop();h.push(p);}return h.slice(0,-1);
    }
    return half(sorted).concat(half(sorted.reverse()));
  }
  function t975(df){
    // Student t two-sided 95%, first 30 integer df, then inverse-t expansion.
    const small=[0,12.706204736,4.302652730,3.182446305,2.776445105,2.570581836,2.446911851,2.364624252,2.306004135,2.262157163,2.228138852,2.200985160,2.178812830,2.160368656,2.144786688,2.131449546,2.119905299,2.109815578,2.100922040,2.093024054,2.085963447,2.079613845,2.073873068,2.068657610,2.063898562,2.059538553,2.055529439,2.051830516,2.048407142,2.045229642,2.042272456];
    if(df<=30)return small[df];
    const z=1.959963984540054;
    return z+(z**3+z)/(4*df)+(5*z**5+16*z**3+3*z)/(96*df**2)+(3*z**7+19*z**5+17*z**3-15*z)/(384*df**3);
  }
  function predict(model,z){
    const x=features(z),p=x.slice(1);
    const insideHull=model.hull.every((a,i,h)=>cross(a,h[(i+1)%h.length],p)>=-1e-12);
    const center=dot(x,model.beta),leverage=dot(x,solve(model.L,x));
    const delta=t975(model.degreesOfFreedom)*Math.sqrt(model.varianceWithinLog*(1+leverage)+model.varianceBetweenLog);
    const medianMpa=Math.exp(center),interval=[Math.exp(center-delta),Math.exp(center+delta)];
    if(![medianMpa,...interval].every(v=>v>0 && Number.isFinite(v)))throw Error('預測超出數值範圍。');
    return {zone:z.zone,role:z.role,r:z.r,v:z.v,insideHull,medianMpa,individualCoreApprox95Mpa:interval,
      trainingZones:model.trainingZones,errors:z.C.map(c=>({id:c.id,correctedMpa:c.corrected,differenceMpa:medianMpa-c.corrected,covered:interval[0]<=c.corrected&&c.corrected<=interval[1]}))};
  }
  function analyze(group){
    const train=group.zones.filter(z=>z.role==='校正');
    const blocked=train.filter(z=>z.missing.length);
    if(blocked.length)throw Error('校正測區尚待補：'+blocked.map(z=>z.zone+'（'+z.missing.join('、')+'）').join('、'));
    const model=fit(train);
    function attempt(z,refit){
      try{
        if(z.missing.length)throw Error('待補 '+z.missing.join('、'));
        return predict(refit ? fit(train.filter(t=>t!==z)):model,z);
      }catch(e){return {zone:z.zone,role:z.role,reason:e.message};}
    }
    const loo=train.map(z=>attempt(z,true)),external=group.zones.filter(z=>z.role!=='校正').map(z=>attempt(z,false));
    return {version,key:group.key,material:group.material,condition:group.condition,model,loo,external,
      reboundCoverage:{trainingZones:train.length,differentReboundNumbers:new Set(train.map(z=>z.r)).size,
        zonesWithTwoCores:train.filter(z=>z.C.length>=2).length,distinctReplicatedReboundNumbers:new Set(train.filter(z=>z.C.length>=2).map(z=>z.r)).size}};
  }
  return Object.freeze({version,headers,parse,analyze});
});
