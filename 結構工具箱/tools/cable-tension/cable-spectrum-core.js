(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.CableSpectrum=factory();
})(globalThis,function(){
  'use strict';
  const version='cable-spectrum.v1';
  function number(v,name){
    if((typeof v!=='number'&&(typeof v!=='string'||!v.trim()))||!Number.isFinite(Number(v)))throw Error('請確認'+name+'的數值與單位。');
    return Number(v);
  }
  function positive(v,name){const n=number(v,name);if(n<=0)throw Error(name+'須大於零。');return n;}
  function text(v,name){if(typeof v!=='string'||!v.trim())throw Error('請填'+name+'。');return v.trim();}
  function spectrum(raw){
    const lines=String(raw.csv??'').replace(/^\uFEFF/,'').trim().split(/\r?\n/);
    const head=lines[0]?.trim(),delim=head?.includes('\t')?'\t':',';
    const columns=head.split(delim).map(s=>s.trim());
    const timeUnit={time_s:1,time_ms:.001}[columns[0]],accUnit={accel_m_s2:1,accel_g:9.80665,accel_cm_s2:.01}[columns[1]];
    if(columns.length!==2||typeof timeUnit!=='number'||typeof accUnit!=='number')throw Error('表頭須指定 time_s 或 time_ms，及 accel_m_s2、accel_g 或 accel_cm_s2。');
    const t=[],a=[];
    for(let i=1;i<lines.length;i++){
      if(!lines[i].trim())continue;
      const row=lines[i].split(delim);if(row.length!==2)throw Error('第 '+(i+1)+' 列應有兩欄。');
      const x=number(row[0],'第 '+(i+1)+' 列時間')*timeUnit,y=number(row[1],'第 '+(i+1)+' 列加速度')*accUnit;
      if(t.length&&x<=t[t.length-1])throw Error('時間須嚴格遞增，第 '+(i+1)+' 列重複或倒序。');
      t.push(x);a.push(y);
    }
    if(t.length<16)throw Error('時序資料不足 16 筆。');
    const begin=raw.begin==null||String(raw.begin).trim()===''?t[0]:number(raw.begin,'起始時間');
    const end=raw.end==null||String(raw.end).trim()===''?t.at(-1):number(raw.end,'結束時間');
    if(begin<t[0]-1e-10||end>t.at(-1)+1e-10||end<=begin)throw Error('時間窗須位於資料內，且起點早於終點。');
    const first=t.findIndex(v=>v>=begin-1e-10);
    let last=t.length-1;while(last>=0&&t[last]>end+1e-10)last--;
    const n=last-first+1;if(n<16)throw Error('選取的時間窗不足 16 筆。');
    const dt=(t[last]-t[first])/(n-1),fs=1/dt;
    let jitter=0;for(let i=first+1;i<=last;i++)jitter=Math.max(jitter,Math.abs((t[i]-t[i-1])/dt-1));
    if(jitter>.005)throw Error('選窗內取樣間距最大偏差超過 0.5%；請查缺樣或提供等間距時序。');
    if(!Number.isFinite(fs)||!(fs>0))throw Error('取樣時間尺度無法換算。');
    const size=2**Math.ceil(Math.log2(n)),re=new Float64Array(size),im=new Float64Array(size);
    const mid=(n-1)/2;let mean=0,slope=0;
    for(let i=0;i<n;i++){mean+=a[first+i]/n;slope+=(i-mid)*a[first+i];}
    slope/=n*(n*n-1)/12;
    let gain=0,signalScale=0,residualScale=0;
    for(let i=0;i<n;i++){const w=.5*(1-Math.cos(2*Math.PI*i/n));gain+=w;
      const residual=a[first+i]-mean-(i-mid)*slope;
      signalScale=Math.max(signalScale,Math.abs(a[first+i]));residualScale=Math.max(residualScale,Math.abs(residual));re[i]=residual*w;}
    // Iterative radix-2 FFT. Zero padding changes the bin grid, not the window resolution.
    for(let i=1,j=0;i<size;i++){
      let bit=size>>1;while(j&bit){j^=bit;bit>>=1;}j^=bit;
      if(i<j)[re[i],re[j]]=[re[j],re[i]];
    }
    for(let width=2;width<=size;width*=2){
      const half=width/2,c=Math.cos(-2*Math.PI/width),s=Math.sin(-2*Math.PI/width);
      for(let start=0;start<size;start+=width){
        let wr=1,wi=0;
        for(let k=0;k<half;k++){
          const i=start+k,j=i+half,ur=re[i],ui=im[i],vr=wr*re[j]-wi*im[j],vi=wr*im[j]+wi*re[j];
          re[i]=ur+vr;im[i]=ui+vi;re[j]=ur-vr;im[j]=ui-vi;
          const next=wr*c-wi*s;wi=wr*s+wi*c;wr=next;
        }
      }
    }
    const df=fs/size,resolution=fs/n,nyquist=fs/2;
    const low=String(raw.low??'').trim()?number(raw.low,'頻帶下限'):0,high=String(raw.high??'').trim()?positive(raw.high,'頻帶上限'):nyquist;
    if(low<0||high<=low||high>nyquist+1e-9)throw Error('頻帶須位於 0 至 Nyquist 頻率 '+nyquist.toFixed(4)+' Hz 內。');
    const threshold=positive(raw.thresholdPct,'峰值門檻百分比');if(threshold>100)throw Error('峰值門檻不能超過 100%。');
    const amplitudes=Array.from({length:size/2+1},(_,i)=>Math.hypot(re[i],im[i])*(i===0||i===size/2?1:2)/gain);
    const left=Math.max(1,Math.ceil(low/df)),right=Math.min(size/2-1,Math.floor(high/df));
    let max=0;for(let i=left;i<=right;i++)max=Math.max(max,amplitudes[i]);
    const peaks=[];
    const flat=residualScale<=64*Number.EPSILON*signalScale;
    for(let b=left;b<=right;b++){
      const y=amplitudes[b];if(flat||y<=0||y<max*threshold/100 || !(y>amplitudes[b-1] && y>=amplitudes[b+1]))continue;
      const u=Math.log(Math.max(Number.MIN_VALUE,amplitudes[b-1])),v=Math.log(y),w=Math.log(Math.max(Number.MIN_VALUE,amplitudes[b+1]));
      const den=u-2*v+w,offset=den?Math.max(-.5,Math.min(.5,.5*(u-w)/den)):0;
      const hz=(b+offset)*df;
      if(hz>=low&&hz<=high)peaks.push({bin:b,hz,amplitude:y});
    }
    const trace=[],stride=Math.max(1,Math.ceil(n/900));
    for(let i=first;i<=last;i+=stride){
      let min=a[i],max=a[i];
      for(let j=i+1;j<=Math.min(last,i+stride-1);j++){min=Math.min(min,a[j]);max=Math.max(max,a[j]);}
      trace.push({time:t[i],min,max});
    }
    if(!amplitudes.every(Number.isFinite))throw Error('振幅超出數值範圍。');
    return {version,totalSamples:t.length,n,first,last,begin:t[first],end:t[last],fs,dt,jitter,nyquist,size,df,resolution,low,high,threshold,amplitudes,peaks,columns,trace,method:'線性去趨勢、週期 Hann、單側峰值振幅（m/s²）'};
  }

  // Mass-normalized sine Ritz basis with fixed transverse end translations.
  // Rotational springs and in-plane shallow parabolic extension add three rank-one energies.
  function sagFrequencies(T,p,count,basis){
    const diag=[],updates=[],norm=Math.sqrt(2/(p.mu*p.L));
    for(let n=1;n<=basis;n++){
      const q=n*Math.PI/p.L,slope=q*norm;
      diag.push((T*q*q+p.ei*q**4)/p.mu);
      updates.push([Math.sqrt(p.left)*slope,Math.sqrt(p.right)*slope*(n%2?-1:1),
        Math.sqrt(p.ea/p.L)*(8*p.sag/p.L**2)*norm*(n%2?2/q:0)]);
    }
    // Inertia of D+UU'−λI via the three-dimensional Schur complement.
    function below(x){
      let a=1,b=0,c=0,d=1,e=0,f=1,negative=0;
      for(let j=0;j<basis;j++){
        let gap=diag[j]-x;if(Math.abs(gap)<1e-12*Math.max(1,x))gap=1e-12*Math.max(1,x);
        if(gap<0)negative++;
        const [u,v,w]=updates[j],g=1/gap;a+=u*u*g;b+=u*v*g;c+=u*w*g;d+=v*v*g;e+=v*w*g;f+=w*w*g;
      }
      // Eigenvalues of the real symmetric 3x3 matrix, scaled before its determinant.
      const avg=(a+d+f)/3,spread=Math.sqrt(((a-avg)**2+(d-avg)**2+(f-avg)**2+2*(b*b+c*c+e*e))/6);
      if(!spread)return negative-(avg<0?3:0);
      const A=(a-avg)/spread,B=b/spread,C=c/spread,D=(d-avg)/spread,E=e/spread,F=(f-avg)/spread;
      const det=A*D*F+2*B*C*E-A*E*E-D*C*C-F*B*B;
      const phi=Math.acos(Math.max(-1,Math.min(1,det/2)))/3;
      const large=avg+2*spread*Math.cos(phi),small=avg+2*spread*Math.cos(phi+2*Math.PI/3),middle=3*avg-large-small;
      return negative-Number(small<0)-Number(middle<0)-Number(large<0);
    }
    const frequencies=[];
    for(let n=0;n<count;n++){
      let lo=diag[n],hi=diag[n+3]; // interlacing under a nonnegative rank-three update
      for(let i=0;i<43;i++){const middle=(lo+hi)/2;if(below(middle)<=n)lo=middle;else hi=middle;}
      frequencies.push(Math.sqrt((hi+lo)/2)/(2*Math.PI));
    }
    return frequencies;
  }
  function identify(raw,spec,assignments){
    const p={L:positive(raw.length,'有效弦長'),mu:positive(raw.mass,'線密度')};
    for(const [k,v] of [['caseId','索號／工況'],['sensor','感測方向與位置'],['source','量測與模態辨識依據'],['boundary','端部與材料依據']])text(raw[k],v);
    const limit=positive(raw.tolerance,'專案頻率殘差上限');
    if(!Array.isArray(assignments)||!assignments.length)throw Error('請依振型或量測紀錄指派候選峰之模態。');
    const bins=new Map(spec.peaks.map(x=>[x.bin,x])),seen=new Set(),hits=assignments.map(x=>{
      const peak=bins.get(x.bin),mode=number(x.mode,'模態編號');
      if(!peak||seen.has(x.bin)||!Number.isSafeInteger(mode)||mode<=0)throw Error('候選峰重複、已失效或模態非正整數。');
      seen.add(x.bin);return {...peak,mode};
    }).sort((a,b)=>a.hz-b.hz);
    if(hits.some((v,i)=>i && (v.mode<=hits[i-1].mode || v.hz-hits[i-1].hz<2*spec.resolution)))throw Error('模態重複、順序不符或兩個指派峰小於 Hann 窗的有效分辨間距。');
    const model=raw.model;
    if(!['string','beam','beamFit','sag'].includes(model))throw Error('請指定有依據的端部與力學模型。');
    if(hits.length<(model==='beamFit'?3:2))throw Error('模態資料不足以同時辨識並查核殘差，請保留頻譜。');
    if(hits.some(v=>v.hz-spec.low<2*spec.resolution || spec.high-v.hz<2*spec.resolution))throw Error('指派峰靠近分析頻帶端點，時間窗或頻帶不足。');
    const highest=hits.at(-1).mode;
    let T,predictions,coarseDelta=null;
    if(model==='string'){
      const slope=hits.reduce((s,x)=>s+x.mode*x.hz,0)/hits.reduce((s,x)=>s+x.mode*x.mode,0);
      T=4*p.mu*(p.L*slope)**2;predictions=hits.map(x=>x.mode*slope);
    }else{
      const xs=hits.map(x=>(x.mode*Math.PI/p.L)**2),ys=hits.map((x,i)=>p.mu*(2*Math.PI*x.hz)**2/xs[i]);
      if(model==='beamFit'){
        const avg=a=>a.reduce((s,x)=>s+x,0)/a.length,mx=avg(xs),my=avg(ys);
        p.ei=xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/xs.reduce((s,x)=>s+(x-mx)**2,0);
        if(!(p.ei>0))throw Error('彎曲勁度的回歸斜率無正值，EI 無法辨識。');
        T=my-p.ei*mx;
      }else{p.ei=positive(raw.ei,'EI');T=ys.reduce((s,y,i)=>s+y-p.ei*xs[i],0)/ys.length;}
      if(model==='sag'){
        if(highest>40)throw Error('此淺垂索模型的高階截斷未涵蓋所選模態。');
        p.ea=positive(raw.ea,'EA');p.sag=number(raw.sag,'跨中垂度');p.left=number(raw.left,'左端轉動彈簧');p.right=number(raw.right,'右端轉動彈簧');
        if(p.sag<0||p.sag/p.L>.05||p.left<0||p.right<0)throw Error('垂度須在 0～弦長 5% 的淺索模型範圍內，端彈簧不可負值。');
        const basis=Math.max(96,highest*6);
        // Each modal frequency increases monotonically with tension for fixed geometry.
        const averageResidual=(t,n)=>{
          const f=sagFrequencies(t,p,highest,n);return hits.reduce((s,h)=>s+(f[h.mode-1]-h.hz)/h.hz,0)/hits.length;
        };
        let lo=0,hi=Math.max(...ys);
        if(!(averageResidual(lo,basis)<0&&averageResidual(hi,basis)>=0))throw Error('給定垂度／端勁度後，量測頻率無法包夾正張力。');
        for(let i=0;i<33;i++){const mid=(lo+hi)/2;if(averageResidual(mid,basis)<0)lo=mid;else hi=mid;}
        T=(lo+hi)/2;
        const coarseT=T;
        lo=0;hi=Math.max(...ys);
        for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(averageResidual(mid,basis*4)<0)lo=mid;else hi=mid;}
        T=(lo+hi)/2;p.ritzTerms=basis*4;p.coarseTensionKn=coarseT/1000;
        const coarse=sagFrequencies(T,p,highest,basis),fine=sagFrequencies(T,p,highest,basis*2);
        const finer=sagFrequencies(T,p,highest,basis*4);
        coarseDelta=Math.max(...hits.map(v=>Math.abs(finer[v.mode-1]-fine[v.mode-1])));
        const numericalShift=Math.max(...hits.map(v=>Math.abs(finer[v.mode-1]-coarse[v.mode-1])));
        if(numericalShift>Math.min(spec.resolution,limit))throw Error('端部模型的截斷差異過大，無法辨識單一索力。');
        predictions=hits.map(v=>finer[v.mode-1]);
      }else predictions=xs.map(q=>Math.sqrt((T*q+p.ei*q*q)/p.mu)/(2*Math.PI));
    }
    if(!Number.isFinite(T)||T<=0||predictions.some(f=>!Number.isFinite(f)))throw Error('無法由這組模態辨識正張力。');
    const rows=hits.map((v,i)=>({...v,predictedHz:predictions[i],residualHz:v.hz-predictions[i]}));
    const maxResidual=Math.max(...rows.map(v=>Math.abs(v.residualHz)));
    let issue=maxResidual>limit?'模態頻差超過專案指定上限。':'';
    if(model==='beamFit'){
      // Independent ±one window-resolution perturbations of each peak give a
      // conservative slope/intercept interval for this linearized two-parameter fit.
      const x=hits.map(v=>(v.mode*Math.PI/p.L)**2),mean=x.reduce((a,b)=>a+b,0)/x.length,den=x.reduce((s,q)=>s+(q-mean)**2,0);
      let eiBound=0,tBound=0;
      hits.forEach((v,i)=>{
        const dy=p.mu*(2*Math.PI)**2*(2*v.hz*spec.resolution+spec.resolution**2)/x[i],w=(x[i]-mean)/den;
        eiBound+=Math.abs(w)*dy;tBound+=Math.abs(1/x.length-mean*w)*dy;
      });
      p.resolutionSensitivity={eiAbs:eiBound,tensionAbsN:tBound};
      if(p.ei<=eiBound||T<=tBound)issue='一個時間窗頻率解析度的擾動即可使 EI 或張力跨零，兩參數無法可靠分離。';
    }
    return {version,model,parameters:p,rows,tensionKn:issue?null:T/1000,eiIdentified:!issue&&model==='beamFit'?p.ei:null,
      status:issue||'已依指定模態與條件辨識',maxResidual,tolerance:limit,coarseDelta,windowResolutionHz:spec.resolution};
  }
  return Object.freeze({version,spectrum,identify,sagFrequencies});
});
