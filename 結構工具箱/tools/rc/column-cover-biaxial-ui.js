(() => {
  'use strict';
  const core = window.ColumnCoverBiaxial;
  const byId = id => document.getElementById(id);
  const keys = ['caseId','materialBasis','widthMm','depthMm','fc','fy','pTf','mxTfm','myTfm','mode','demandBasis','designBars','observedBars','layoutBasis'];
  const getInput = () => Object.fromEntries(keys.map(k=>[k,byId(k).value]));
  const fmt = (n,d=4) => n==null ? '—' : Number(n.toFixed(d)).toString();
  let current = null;
  const pair = (x,y,d) => fmt(x,d)+' ／ '+fmt(y,d);

  function invalidate(message) {
    current=null; byId('results').hidden=true; byId('save').disabled=true; byId('print').disabled=true;
    byId('status').textContent=message;
    const design=byId('mode').value==='design';
    byId('pLabel').textContent=design ? 'Pu (tf)' : '目標 Pn (tf)';
    byId('xLabel').textContent=design ? 'Mux (tf·m)' : 'Mx 方向分量 (tf·m)';
    byId('yLabel').textContent=design ? 'Muy (tf·m)' : 'My 方向分量 (tf·m)';
  }
  function replace(fields, message) {
    for (const k of keys) byId(k).value=fields[k] ?? '';
    invalidate(message);
  }
  const hasInputs = () => keys.some(k=>k!=='mode' && byId(k).value.trim());
  async function allowReplacement(question) {
    if(!hasInputs())return true;
    const dialog=byId('replaceDialog');
    if(dialog.open)return false;
    byId('replaceQuestion').textContent=question;
    dialog.returnValue='';
    const closed=new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='replace'),{once:true}));
    dialog.showModal();
    return closed;
  }
  function row(container,values) {
    const tr=container.insertRow();
    for (const s of values) tr.insertCell().textContent=s;
  }
  function draw(r) {
    const canvas=byId('plot'), ctx=canvas.getContext('2d');
    const {widthMm:w,depthMm:h}=r.input;
    const s=Math.min((canvas.width-80)/w,(canvas.height-50)/h),x=(canvas.width-w*s)/2,y=22;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#f6f4f8';ctx.fillRect(x,y,w*s,h*s);ctx.strokeStyle='#544d5c';ctx.lineWidth=2;ctx.strokeRect(x,y,w*s,h*s);
    // Clip the strain-plane neutral lines to the rectangular section.
    ctx.save();ctx.beginPath();ctx.rect(x,y,w*s,h*s);ctx.clip();
    for (const [layout,stroke,dash] of [[r.observed,'#18645e',[]],[r.design,'#714d93',[8,5]]]) {
      if (!layout.point) continue;
      const t=layout.point.normalDeg*Math.PI/180, nx=Math.sin(t), ny=Math.cos(t);
      const edge=(Math.abs(nx)*w+Math.abs(ny)*h)/2-layout.point.cCm*10;
      const cx=x+(w/2-nx*edge)*s, cy=y+(h/2-ny*edge)*s, length=Math.hypot(w,h)*s;
      ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.setLineDash(dash);ctx.beginPath();
      ctx.moveTo(cx-ny*length,cy+nx*length);ctx.lineTo(cx+ny*length,cy-nx*length);ctx.stroke();
    }
    ctx.restore();
    const xy=b=>[x+b.xMm*s,y+b.yMm*s];
    for(const pos of r.positions) {
      if(pos.design && pos.observed){
        ctx.beginPath();ctx.moveTo(...xy(pos.design));ctx.lineTo(...xy(pos.observed));ctx.strokeStyle='#8a7b94';ctx.lineWidth=1.5;ctx.stroke();
      }
    }
    for (const pos of r.positions) {
      if(pos.design){ctx.beginPath();ctx.arc(...xy(pos.design),Math.max(4,10*Math.sqrt(pos.design.areaCm2/Math.PI)*s),0,2*Math.PI);ctx.strokeStyle='#714d93';ctx.lineWidth=2;ctx.stroke();}
      if(pos.observed){ctx.beginPath();ctx.arc(...xy(pos.observed),Math.max(3,10*Math.sqrt(pos.observed.areaCm2/Math.PI)*s*.7),0,2*Math.PI);ctx.fillStyle='#18645e';ctx.fill();}
    }
  }
  function display(r) {
    current=r;
    const {input,design,observed}=r;
    const designMode=input.mode==='design';
    byId('context').textContent=[input.caseId,input.materialBasis,input.demandBasis,input.widthMm+' × '+input.depthMm+' mm',
      'fc′／fy＝'+pair(input.fc,input.fy)+' kgf/cm²',(designMode?'Pu':'Pn')+'＝'+fmt(input.pTf)+' tf',
      (designMode?'Mux／Muy＝':'方向分量 Mx／My＝')+pair(input.mxTfm,input.myTfm,6)+' tf·m',core.version].join(' ｜ ');
    byId('positionContext').textContent=input.caseId+' ｜ '+input.materialBasis+' ｜ '+input.demandBasis;
    byId('summary').textContent='現況／設計方向容量保留比　'+(r.retention==null ? '待核或無指定方向' : fmt(r.retention*100,3)+'%');
    const tb=byId('strength');tb.replaceChildren();
    const add=(label,field)=>row(tb,[label,...[design,observed].map(field)]);
    const atPoint=(label,field)=>add(label,s=>s.point ? field(s.point) : '—');
    add('求解狀態',s=>s.status);
    if(designMode)add('同組需求檢核',s=>s.ok===true ? '滿足' : s.ok===false ? '未滿足' : '待核');
    add((designMode?'折減後':'名義')+'方向容量 (tf·m)',s=>fmt(s.capacityTfm,7));
    if(designMode)add('有號需求向量之利用率',s=>fmt(s.utilization,7));
    add('適用軸力範圍 (tf)',s=>pair(s.limits.pMinTf,s.limits.pMaxTf));
    atPoint('名義 Pn (tf)；Mnx／Mny (tf·m)',p=>fmt(p.pnTf,6)+'；'+pair(p.mnxTfm,p.mnyTfm,6));
    atPoint('同一應變面 φPn (tf)；φMnx／φMny (tf·m)',p=>fmt(p.phiPnTf,6)+'；'+pair(p.phiMnxTfm,p.phiMnyTfm,6));
    atPoint('中性軸深度 c (cm)；受壓法線角度（自上朝左為正）',p=>fmt(p.cCm,6)+'；'+fmt(p.normalDeg,5)+'°');
    atPoint('最外側鋼筋、淨拉應變 εt；折減因數 φ',p=>p.tensionBarIds.join('、')+'　'+fmt(p.epsT,7)+'；'+fmt(p.phi,6));
    atPoint('軸力殘差 (tf)；垂直需求方向彎矩殘差 (tf·m)',p=>p.pResidual.toExponential(2)+'；'+p.cross.toExponential(2));
    if(design.endpoint||observed.endpoint)add('端點可平衡 Mx／My (tf·m)',s=>s.endpoint ? pair(s.endpoint.mxTfm,s.endpoint.myTfm,7) : '—');
    const notes=[];
    if(input.layoutBasis)notes.push('兩清冊差異依據：'+input.layoutBasis);
    if(!designMode)notes.push('名義模式的彎矩分量用來指定方向；折減後內力列對應同一應變面。');
    if(!Math.hypot(input.mxTfm,input.myTfm))notes.push('零彎矩使用 Mx 軸截線檢查原點；表列的應變面是該截線邊界。');
    if([design,observed].some(x=>x.status==='軸壓上限截面'))notes.push('Pu 恰等於繫筋軸壓上限。表列值是未截平曲面的平衡解；超過此值的需求需另核上限平面。');
    byId('solverNote').textContent=notes.join(' ');byId('solverNote').hidden=!notes.length;
    const alternatives=byId('solutions');alternatives.replaceChildren();
    for(const [label,s] of [['設計',design],['現況',observed]])if(s.intersections) {
      const p=document.createElement('p');p.className='caution';
      p.textContent=label+'配置平衡交點（沿需求方向之有號 tf·m）　'+(s.intersections.map(a=>fmt(a.radial,7)).join('、')||'未取得')+'。請覆核應力塊穿越鋼筋時的模型與解支。';alternatives.append(p);
    }
    const positions=byId('positions');positions.replaceChildren();
    const coord=b=>b ? pair(b.xMm,b.yMm)+'；'+fmt(b.areaCm2,5) : '清冊未列';
    for(const p of r.positions)row(positions,[p.id,coord(p.design),coord(p.observed),pair(p.dxMm,p.dyMm),
      [p.design,p.observed].map(b=>b ? b.method+'・'+b.source : '清冊未列').join(' ／ ')]);
    byId('results').hidden=false;draw(r);
    byId('save').disabled=false;byId('print').disabled=false;byId('status').textContent='已依本次兩份逐筋清冊重算。';
  }
  keys.forEach(k=>byId(k).addEventListener('input',()=>invalidate('輸入已變更，請重新比較。')));
  byId('calculate').onclick=()=>{
    try {display(core.calculate(getInput()));byId('results').focus();}catch(e){invalidate(e.message);}
  };
  byId('save').onclick=()=>{
    if(!current)return;
    const data={schema:core.version,generatedAt:new Date().toISOString(),input:getInput(),result:current};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='逐筋雙軸-'+current.input.caseId.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  byId('print').onclick=()=>{if(current)window.print();};
  byId('load').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    try {
      const raw=JSON.parse(await file.text());
      if(raw.schema!==core.version || !raw.input)throw Error('無法辨識逐筋雙軸紀錄版本。');
      const r=core.calculate(raw.input);
      if(!await allowReplacement('以讀入的雙軸紀錄取代目前資料？'))return;
      replace({...raw.input,...r.input},'');display(r);byId('status').textContent='已讀回原始輸入，並依目前引擎重新計算。';
    }catch(e){byId('status').textContent='讀取失敗，保留原資料。'+e.message;}
    finally{event.target.value='';}
  };
  byId('example').onclick=async()=>{
    if(!await allowReplacement('以合成對照例取代目前資料？'))return;
    const ids=['T1','T2','T3','L1','R1','B1','B2','B3'];
    const table=(coords,source)=>[core.header.join('\t'),...coords.map(([x,y],i)=>[ids[i],x,y,5.067,'合成',source].join('\t'))].join('\n');
    replace({caseId:'合成柱 C01／R1',materialBasis:'合成矩形繫筋柱',demandBasis:'合成組合 U1，30° 方向',mode:'design',
      widthMm:500,depthMm:600,fc:280,fy:4200,pTf:60,mxTfm:20*Math.sqrt(3),myTfm:20,
      designBars:table([[50,50],[250,50],[450,50],[50,300],[450,300],[50,550],[250,550],[450,550]],'設計配置 A'),
      observedBars:table([[65,70],[240,50],[410,80],[60,270],[450,310],[60,530],[260,540],[420,510]],'偏移配置 B')},'已載入合成資料，可修改或直接比較。');
  };
  try {byId('seed').hidden=window===window.parent || typeof window.parent.getCoverBiaxialDesign!=='function';}
  catch {byId('seed').hidden=true;}
  byId('seed').onclick=async()=>{
    try {
      const data=window.parent.getCoverBiaxialDesign();
      if(!await allowReplacement('以主頁設計配筋開新比較？取代後須重新填寫現況座標與同組內力。'))return;
      replace({...data,mode:'design'},'已帶入設計。請逐筋填寫現況位置及同組有號 P、Mx、My。');
    }catch(e){byId('status').textContent=e.message;}
  };
})();
