(() => {
  'use strict';
  const core=window.CableSpectrum,$=id=>document.getElementById(id);
  const signalKeys=['csv','begin','end','low','high','thresholdPct'];
  const modelKeys=['caseId','sensor','source','boundary','length','mass','model','tolerance','ei','ea','sag','left','right'];
  const keys=[...signalKeys,...modelKeys],read=()=>Object.fromEntries(keys.map(k=>[k,$(k).value]));
  const fmt=(v,d=5)=>Number.isFinite(v)?Number(v.toFixed(d)).toString():'—';
  const names={string:'理想張緊弦',beam:'簡支受拉梁（已知 EI）',beamFit:'簡支受拉梁（同時辨識 T、EI）',sag:'水平淺垂索（面內振動與端轉動彈簧）'};
  let spec=null,fit=null,fitIssue='',attempted=false,filename='',snapshot=null;
  const message=s=>{$('status').textContent=s;};
  function physics(){
    const m=$('model').value;
    document.querySelector('[data-ei]').hidden=!['beam','sag'].includes(m);
    document.querySelectorAll('[data-sag]').forEach(e=>e.hidden=m!=='sag');
  }
  function assignments(){return [...$('peaks').querySelectorAll('input')].filter(e=>e.value!=='').map(e=>({bin:Number(e.dataset.bin),mode:Number(e.value)}));}
  function describe(){
    const v=read();
    $('context').textContent=[filename||'貼入時序',v.caseId,v.sensor,v.source,v.boundary,names[v.model],v.length&&'L＝'+v.length+' m',v.mass&&'μ＝'+v.mass+' kg/m'].filter(Boolean).join(' ｜ ');
    if(v.model==='beam'||v.model==='sag')$('context').textContent+=' ｜ EI＝'+(v.ei||'待補')+' N·m²';
    if(v.model==='sag')$('context').textContent+=' ｜ EA＝'+(v.ea||'待補')+' N；垂度 '+(v.sag||'待補')+' m；左／右端轉動勁度 '+(v.left||'待補')+'／'+(v.right||'待補')+' N·m/rad';
  }
  function clearFit(note='尚未指派並核對模態。'){
    fit=null;attempted=false;fitIssue='';$('outcome').textContent=note;$('results').replaceChildren();physics();describe();
  }
  function clearAll(){spec=null;$('spectral').hidden=true;$('peaks').replaceChildren();clearFit();message('時序或分析條件已變更，請重新計算頻譜。');}
  async function allowReplace(){
    if(!['csv',...modelKeys].some(k=>$(k).value.trim()))return true;
    const d=$('replace');if(d.open)return false;d.returnValue='';
    const answer=new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='yes'),{once:true}));d.showModal();return answer;
  }
  function populate(data,file='',orig=null){
    for(const k of keys)$(k).value=data[k]??(k==='thresholdPct'?'8':'');
    filename=file;snapshot=orig;clearAll();
  }
  function graph(id,v,markers){
    const cv=$(id);
    cv.width=Math.min(860,Math.max(300,Math.round(cv.getBoundingClientRect().width)||780));
    const ctx=cv.getContext('2d'),w=cv.width,h=cv.height,l=48,r=29,t=26,b=35;
    const X=x=>l+(w-l-r)*(x-v.xMin)/(v.xMax-v.xMin||1),Y=y=>h-b-(h-b-t)*(y-v.yMin)/(v.yMax-v.yMin||1);
    ctx.clearRect(0,0,w,h);ctx.strokeStyle='#cad5d8';ctx.lineWidth=1;ctx.font='15px sans-serif';ctx.fillStyle='#354953';
    for(let i=0;i<=4;i++){const x=v.xMin+(v.xMax-v.xMin)*i/4;ctx.beginPath();ctx.moveTo(X(x),t);ctx.lineTo(X(x),h-b);ctx.stroke();ctx.fillText(fmt(x,2),X(x)-9,h-13);}
    ctx.fillText(v.yLabel,4,16);ctx.fillText(v.xLabel,w-24,h-10);ctx.fillText(fmt(v.yMax,3),3,t+7);ctx.fillText(fmt(v.yMin,3),3,h-b);
    ctx.strokeStyle='#216781';ctx.lineWidth=1.4;ctx.beginPath();
    v.points.forEach(([x,y],i)=>i?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y)));ctx.stroke();
    ctx.fillStyle='#a43e16';for(const [x,y] of markers){ctx.beginPath();ctx.arc(X(x),Y(y),3,0,2*Math.PI);ctx.fill();}
  }
  function charts(){
    const s=spec,range=s.trace.flatMap(v=>[v.min,v.max]),max=Math.max(...range),min=Math.min(...range);
    graph('wave',{xMin:s.begin,xMax:s.end,yMin:min,yMax:max,xLabel:'s',yLabel:'a (m/s²)',points:s.trace.flatMap(v=>[[v.time,v.min],[v.time,v.max]])},[]);
    const lo=Math.ceil(s.low/s.df),hi=Math.floor(s.high/s.df),stride=Math.max(1,Math.ceil((hi-lo+1)/1600)),pts=[];
    let ymax=0;
    for(let i=lo;i<=hi;i+=stride){
      let j=i;for(let k=i+1;k<=Math.min(hi,i+stride-1);k++)if(s.amplitudes[k]>s.amplitudes[j])j=k;
      ymax=Math.max(ymax,s.amplitudes[j]);pts.push([j*s.df,s.amplitudes[j]]);
    }
    graph('plot',{xMin:s.low,xMax:s.high,yMin:0,yMax:ymax||1,xLabel:'Hz',yLabel:'振幅 (m/s²)',points:pts},s.peaks.map(v=>[v.hz,v.amplitude]));
  }
  window.addEventListener('resize',()=>{if(spec)charts();});
  window.addEventListener('beforeprint',()=>{if(spec)charts();});
  function analyze(prepared=null,picks=[]){
    clearAll();spec=prepared||core.spectrum(read());const s=spec;$('spectral').hidden=false;
    $('meta').textContent='選窗 '+fmt(s.begin)+'～'+fmt(s.end)+' s，'+s.n+'／'+s.totalSamples+' 筆；取樣率 '+fmt(s.fs)+' Hz，Nyquist '+fmt(s.nyquist)+' Hz。時間窗解析度 '+fmt(s.resolution,7)+' Hz，FFT 格距 '+fmt(s.df,7)+' Hz。';
    $('peakNote').textContent=s.method+'。頻帶 '+fmt(s.low)+'～'+fmt(s.high)+' Hz，門檻 '+s.threshold+'%，共 '+s.peaks.length+' 個候選；空白階次不參與回算。';
    const index=new Map(picks.map(p=>[p.bin,p.mode]));
    for(const p of s.peaks){
      const tr=$('peaks').insertRow();
      for(const v of [p.bin,fmt(p.hz,6),fmt(p.amplitude,6)])tr.insertCell().textContent=v;
      const td=tr.insertCell(),input=document.createElement('input'),label=document.createElement('span');
      input.type='number';input.min='1';input.step='1';input.className='mode no-print';input.dataset.bin=p.bin;
      input.setAttribute('aria-label','指派 '+fmt(p.hz,6)+' Hz 的振型編號');input.value=index.get(p.bin)??'';
      label.className='print-only';label.textContent=input.value||'未採用';
      input.oninput=()=>{label.textContent=input.value||'未採用';clearFit('模態指派已更動，請重新辨識。');};
      td.append(input,label);
    }
    charts();describe();message('已建立頻譜，請核對候選峰。');
  }
  function identify(){
    clearFit();attempted=true;
    try{
      fit=core.identify(read(),spec,assignments());
      $('outcome').textContent=fit.tensionKn==null?'待核：'+fit.status:(fit.model==='sag'?'水平張力 H':'索力 T')+'＝'+fmt(fit.tensionKn,5)+' kN'+(fit.eiIdentified==null?'':'，辨識 EI＝'+fmt(fit.eiIdentified,2)+' N·m²');
      const t=document.createElement('table'),head=t.createTHead().insertRow();['階次','量測 (Hz)','模型 (Hz)','量測−模型 (Hz)'].forEach(v=>{const th=document.createElement('th');th.scope='col';th.textContent=v;head.append(th);});
      const body=t.createTBody();fit.rows.forEach(v=>{const tr=body.insertRow();[v.mode,fmt(v.hz,6),fmt(v.predictedHz,6),fmt(v.residualHz,6)].forEach(s=>tr.insertCell().textContent=s);});
      const p=document.createElement('p');p.textContent='專案頻差上限 '+fmt(fit.tolerance,6)+' Hz；最大絕對頻差 '+fmt(fit.maxResidual,6)+' Hz。';
      if(fit.coarseDelta!=null)p.textContent+='淺索正弦基底 '+fit.parameters.ritzTerms+' 項，末兩級最大頻率差 '+fmt(fit.coarseDelta,7)+' Hz。';
      if(fit.parameters.resolutionSensitivity)p.textContent+='一個時間窗頻率解析度擾動對回歸斜率 EI 的界限 ±'+fmt(fit.parameters.resolutionSensitivity.eiAbs,1)+' N·m²。';
      $('results').append(t,p);message(fit.status);
    }catch(e){fitIssue=e.message;$('outcome').textContent='待核：'+fitIssue;message('已保留頻譜與指派，請查待核事項。');}
  }
  $('example').onclick=async()=>{
    if(!await allowReplace())return;
    const rows=['time_s,accel_m_s2'],L=30,mu=18,T=400000,ei=220000;
    for(let i=0;i<8192;i++){const t=i/128;let a=.0006*t+.13*Math.sin(2*Math.PI*7.23*t);
      [1,2,3,5].forEach((n,j)=>{const q=n*Math.PI/L,f=Math.sqrt((T*q*q+ei*q**4)/mu)/(2*Math.PI);a+=[.65,.22,.095,.31][j]*Math.sin(2*Math.PI*f*t+.28*n);});
      rows.push(t+','+a.toFixed(10));}
    populate({csv:rows.join('\n'),caseId:'合成索 C01',sensor:'跨內橫向加速度',source:'合成時序：1、2、3、5 階；另有 7.23 Hz 干擾峰',boundary:'兩端簡支直索，合成 EI 與線質量已知',length:L,mass:mu,model:'beam',tolerance:.02,ei,low:.5,high:20},'合成直索含 EI');analyze();
  };
  try{$('parent').hidden=typeof window.parent.readCableSpectrumSource!=='function';}catch{$('parent').hidden=true;}
  $('parent').onclick=async()=>{
    try{const p=window.parent.readCableSpectrumSource(),s=p.input;if(!await allowReplace())return;
      populate({caseId:p.project.no||p.project.name,length:s.effectiveLengthM,mass:s.massPerLengthKgM,boundary:[s.effectiveLengthBasis,s.massBasis].filter(Boolean).join('；')},'',p);message('已帶入主頁弦長、線密度與依據。請讀入或貼上本次時序。');
    }catch(e){message(e.message);}
  };
  signalKeys.forEach(k=>$(k).oninput=()=>{clearAll();if(k==='csv')filename='手動貼入或修改的時序';});
  modelKeys.forEach(k=>$(k).oninput=()=>clearFit('條件已變更，請重新辨識。'));
  $('analyze').onclick=()=>{try{analyze();}catch(e){message(e.message);}};
  $('identify').onclick=identify;$('print').onclick=()=>{if(spec)window.print();};
  $('save').onclick=()=>{
    if(!spec)return;
    const data={version:core.version,file:filename,savedAt:new Date().toISOString(),input:read(),sourceSnapshot:snapshot,assignments:assignments(),attempted,spectrum:spec,result:fit,issue:fitIssue};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='鋼索時序頻譜.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  $('file').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      const source=(await file.text()).replace(/^\uFEFF/,'');
      if(!file.name.toLowerCase().endsWith('.json')){
        if($('csv').value.trim()){
          if(!await allowReplace())return;
          populate({csv:source},file.name);
        }else{$('csv').value=source;filename=file.name;clearAll();}
        message('已讀入 '+file.name+'，請選擇時間窗與頻帶，並核對本次索段條件。');return;
      }
      const data=JSON.parse(source);
      if(data.version!==core.version||!data.input||!Array.isArray(data.assignments))throw Error('不支援的頻譜紀錄。');
      const verified=core.spectrum(data.input),bins=new Set(verified.peaks.map(p=>p.bin)),selected=new Set();
      for(const a of data.assignments){
        if(!bins.has(a.bin)||selected.has(a.bin)||!Number.isFinite(a.mode))throw Error('來源指派與重算頻譜不符。');selected.add(a.bin);
      }
      if(!await allowReplace())return;populate(data.input,data.file,data.sourceSnapshot);analyze(verified,data.assignments);if(data.attempted)identify();
    }catch(err){message('讀取失敗：'+err.message);}finally{e.target.value='';}
  };
  physics();
})();
