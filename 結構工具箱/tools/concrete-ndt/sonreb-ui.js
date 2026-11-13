(() => {
  'use strict';
  const core=window.SonReb, $=id=>document.getElementById(id);
  const number=(v,d=3)=>Number.isFinite(v)?Number(v.toFixed(d)).toString():'—';
  const message=s=>{$('status').textContent=s;};
  let groups=[],current=null,sourceSnapshot=null,decisions=new Map();
  function group(){return groups.find(g=>g.key===$('group').value);}
  function clearResults(){current=null;$('result').hidden=true;}
  function invalidate(){
    groups=[];clearResults();decisions.clear();$('selection').hidden=true;
    message('資料已變更，請重新配對與核對採用紀錄。');
  }
  function adoption(){
    const record={zone:$('selectedZone').value.trim(),mpa:$('selectedMpa').value.trim(),reason:$('reason').value.trim()};
    const any=Object.values(record).some(Boolean);
    const valid=!any || (record.zone && record.reason && Number.isFinite(Number(record.mpa)) && Number(record.mpa)>0);
    $('adoption').textContent=!any?'工程採用強度尚未指定。':valid?'採用 '+record.zone+'　'+record.mpa+' MPa　'+record.reason:'請補齊採用部位、正值強度及理由。';
    $('print').disabled=$('save').disabled=!valid;
    if(group())decisions.set(group().key,record);
    return {valid,record};
  }
  function showGroup(){
    clearResults();const g=group();if(!g)return;
    const count=role=>g.zones.filter(z=>z.role===role).length;
    const missing=g.zones.filter(z=>z.missing.length).map(z=>z.zone+' 待補 '+z.missing.join('/'));
    $('coverage').textContent='校正 '+count('校正')+' 區，外留 '+count('外留')+' 區，推估 '+count('推估')+' 區。'+missing.join('；');
    const d=decisions.get(g.key)||{};
    $('selectedZone').value=d.zone||'';$('selectedMpa').value=d.mpa||'';$('reason').value=d.reason||'';
  }
  function prepare(selected){
    if(!$('project').value.trim())throw Error('請填案件或資料集識別。');
    groups=core.parse($('data').value);
    $('group').replaceChildren(...groups.map(g=>new Option(g.material+' ／ '+g.condition,g.key)));
    if(selected!=null){
      if(!groups.some(g=>g.key===selected))throw Error('紀錄的材料群與條件未出現在資料中。');
      $('group').value=selected;
    }
    $('selection').hidden=false;showGroup();message('已配對 '+groups.length+' 個材料與試驗條件群組。');
  }
  function table(id,headers,rows){
    const host=$(id);host.replaceChildren();
    if(!rows.length){host.textContent='本組尚無資料。';return;}
    const box=document.createElement('div');box.className='scroll';box.tabIndex=0;
    box.setAttribute('aria-label',headers.join('、')+'，可捲動');
    const t=document.createElement('table'),top=t.createTHead().insertRow();
    headers.forEach(h=>{const th=document.createElement('th');th.scope='col';th.textContent=h;top.append(th);});
    const body=t.createTBody();
    rows.forEach(cells=>{const tr=body.insertRow();cells.forEach(cell=>tr.insertCell().textContent=String(cell));});
    box.append(t);host.append(box);
  }
  function predictions(id,rows){
    const headers=['測區／用途','範圍','預測中位數 (MPa)','單顆近似 95% 區間 (MPa)','各顆誤差 (MPa)','該折校正測區'];
    table(id,headers,rows.map(z=>z.reason?[z.zone+'／'+z.role,z.reason,'—','—','—','—']:
      [z.zone+'／'+z.role,z.insideHull?'範圍內':'外插，適用性待核',number(z.medianMpa),z.individualCoreApprox95Mpa.map(v=>number(v)).join('～'),
        z.errors.map(c=>c.id+' '+number(c.differenceMpa)).join('、')||'無對照鑽心',z.trainingZones.join('、')]));
  }
  function plot(g,model){
    const canvas=$('plot'),ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,pad=56;
    const pts=g.zones.filter(z=>z.r>0&&z.v>0).map(z=>({x:Math.log(z.r/35),y:Math.log(z.v/4),z}));
    const xmin=pts.reduce((v,p)=>Math.min(v,p.x),Infinity),xmax=pts.reduce((v,p)=>Math.max(v,p.x),-Infinity);
    const ymin=pts.reduce((v,p)=>Math.min(v,p.y),Infinity),ymax=pts.reduce((v,p)=>Math.max(v,p.y),-Infinity);
    const X=x=>pad+(W-pad*2)*(x-xmin)/(xmax-xmin),Y=y=>H-pad-(H-pad*2)*(y-ymin)/(ymax-ymin);
    ctx.clearRect(0,0,W,H);ctx.font='16px sans-serif';ctx.strokeStyle='#52636a';ctx.beginPath();ctx.moveTo(pad-4,pad-12);ctx.lineTo(pad-4,H-pad+5);ctx.lineTo(W-pad+12,H-pad+5);ctx.stroke();
    ctx.fillStyle='#30404a';ctx.fillText('V (km/s)',5,22);ctx.fillText('R',W-23,H-pad+10);
    ctx.fillText(number(4*Math.exp(ymin),2),6,H-pad);ctx.fillText(number(4*Math.exp(ymax),2),6,pad+4);
    ctx.fillText(number(35*Math.exp(xmin),2),pad-10,H-18);ctx.fillText(number(35*Math.exp(xmax),2),W-pad-10,H-18);
    ctx.beginPath();model.hull.forEach(([x,y],i)=>i?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y)));ctx.closePath();ctx.fillStyle='#deeff0';ctx.fill();ctx.strokeStyle='#357b83';ctx.stroke();
    for(const p of pts){const x=X(p.x),y=Y(p.y);ctx.beginPath();
      if(p.z.role==='校正'){ctx.arc(x,y,4,0,2*Math.PI);ctx.fillStyle='#16576b';}
      else{ctx.moveTo(x,y-6);ctx.lineTo(x-6,y+5);ctx.lineTo(x+6,y+5);ctx.closePath();ctx.fillStyle=current.external.find(e=>e.zone===p.z.zone)?.insideHull?'#353b75':'#a74f0a';}
      ctx.fill();ctx.fillStyle='#253c44';ctx.fillText(p.z.zone,x+6,y-5);}
  }
  function render(r){
    current=r;const g=group(),m=r.model;
    $('identity').textContent=[$('project').value.trim(),g.material,g.condition,core.version].join(' ｜ ');
    $('summary').textContent=m.nZones+' 個校正測區，'+m.nCores+' 顆鑽心。外留 '+r.external.filter(z=>z.role==='外留').length+' 區。';
    const [b0,bR,bV]=m.beta;
    $('formula').textContent='log(fc / MPa)＝'+number(b0,8)+' ＋ ('+number(bR,8)+') log(R / 35) ＋ ('+number(bV,8)+') log(V / 4)。log 為自然對數。';
    $('variance').textContent='測區隨機截距模型，REML 估計。對數變異數：區內 '+number(m.varianceWithinLog,9)+'、區間 '+number(m.varianceBetweenLog,9)+'。區間採 t 分布，自由度 '+m.degreesOfFreedom+'。';
    $('result').hidden=false;plot(g,m);predictions('external',r.external);predictions('loo',r.loo);
    table('pairs',['測區／用途','反彈 R、波速 V 與來源','鑽心編號、原值 × 係數＝修正值 (MPa)','鑽心修正依據'],
      g.zones.map(z=>[z.zone+'／'+z.role,['R','V'].flatMap(k=>z[k].map(a=>k+' '+a.id+' '+number(a.raw,5)+'（'+a.source+'）')).join('、'),
        z.C.map(c=>c.id+' '+number(c.raw,5)+' × '+number(c.factor,6)+'＝'+number(c.corrected,5)).join('、')||'—',z.C.map(c=>c.id+' '+c.source).join('、')||'—']));
    const c=r.reboundCoverage;
    $('sampling').textContent='本組有 '+c.zonesWithTwoCores+' 個位置具至少兩顆鑽心，其中平均反彈數不同的位置計 '+c.distinctReplicatedReboundNumbers+' 個。儀器核驗、取樣代表性、表面與暴露條件仍須回查。';
    adoption();message('已完成本組校正。');$('result').focus();
  }
  async function allowReplace(){
    if(!$('data').value.trim() && !$('project').value.trim())return true;
    const dialog=$('replace');if(dialog.open)return false;
    dialog.returnValue='';const answer=new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='yes'),{once:true}));
    dialog.showModal();return answer;
  }
  function reset(project,data,source=null){
    $('project').value=project;$('data').value=data;sourceSnapshot=source;invalidate();
  }
  const tsv=rows=>rows.map(row=>row.map(s=>String(s??'').replace(/[\t\r\n]+/g,' ')).join('\t')).join('\n');
  $('example').onclick=async()=>{
    if(!await allowReplace())return;
    const rv=[[29,3.65],[33,3.55],[31,4.05],[36,3.8],[35,4.32],[40,4],[39,4.5],[43,4.23],[36,4.05],[46,4.65]];
    const effects=[-.035,.05,-.04,.03,.025,-.045,.05,-.025,.015,.02],rows=[core.headers];
    rv.forEach(([r,v],i)=>{
      const zone='Z'+String(i+1).padStart(2,'0'),prefix=['M1','H1／水平／乾表面／直達',zone,i<8?'校正':'外留'];
      for(const [m,vs] of [['R',[r-.5,r+.5]],['V',[v-.025,v+.025]]])vs.forEach((x,j)=>rows.push([...prefix,m,m+'-'+zone+'-'+(j+1),x,'','合成量測']));
      const count=[2,3,2,4][i%4];for(let j=0;j<count;j++){
        const raw=32*(r/35)**1.1*(v/4)**1.4*Math.exp(effects[i]-.035+.07*j/(count-1));
        rows.push([...prefix,'C','C'+(i+1)+'-'+(j+1),raw,1,'合成 L/D=2.0，無齡期修正']);
      }
    });
    reset('合成同測區校正例',tsv(rows));prepare();
  };
  $('blank').onclick=async()=>{if(await allowReplace()){reset('',tsv([core.headers])+'\n');message('已建立表頭。');}};
  try{$('fromPage').hidden=typeof window.parent.readCurrentSonRebSource!=='function';}catch{$('fromPage').hidden=true;}
  $('fromPage').onclick=async()=>{
    try{
      const source=window.parent.readCurrentSonRebSource();
      if(!source?.ok)throw Error('主頁量測資料不足，請先完成有效的三法資料整理。');
      const project=source.project,rows=[core.headers];
      for(const [method,k] of [['rebound','R'],['ultrasonic','V'],['core','C']]){
        for(const row of source.methods[method].rows){
          const prefix=[project.concreteDescription||'','',row.zone,'',k,row.id];
          const basis=method==='rebound'?'主頁修正反彈值，角度 '+row.angleDeg+'°；ΔR '+row.angleCorrectionDeltaR+'；'+(row.assumed?'示例或覆寫，待核':'已載入規格'):method==='ultrasonic'?'主頁波速；'+(row.distanceMm==null?'直接輸入':'測距 '+row.distanceMm+' mm，走時 '+row.timeMicroseconds+' μs'):'';
          const value=method==='rebound'?row.adjustedMeanRebound:method==='ultrasonic'?row.velocityKmS:row.rawStrengthMpa;
          rows.push([...prefix,value,k==='C'&&!row.assumed?Object.values(row.factors).reduce((a,b)=>a*b,1):'',basis || (row.assumed?'':'主頁鑽心修正紀錄 '+row.id)]);
        }
      }
      if(!await allowReplace())return;
      reset(project.number||project.name,tsv(rows),{project,input:source.input,methods:Object.fromEntries(Object.entries(source.methods).map(([k,v])=>[k,v.rows])),model:source.appliedModel});
      message('已帶入逐筆量測。請填試驗條件、用途；另核對反彈值處理依據並補齊鑽心修正。');
    }catch(e){message(e.message);}
  };
  $('prepare').onclick=()=>{try{prepare();}catch(e){invalidate();message(e.message);}};
  $('fit').onclick=()=>{try{render(core.analyze(group()));}catch(e){clearResults();message(e.message);}};
  $('group').onchange=()=>{showGroup();message('請重新建立所選群組模型。');};
  for(const k of ['project','data'])$(k).oninput=invalidate;
  for(const k of ['selectedZone','selectedMpa','reason'])$(k).oninput=adoption;
  function save(analysis){
    const selected=analysis?group().key:null;
    const data={schema:core.version,kind:analysis?'analysis':'draft',project:$('project').value.trim(),table:$('data').value,sourceSnapshot,
      selected,adoptions:[...decisions],result:analysis?current:null,savedAt:new Date().toISOString()};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='SonReb-'+(analysis?'校正紀錄':'原始資料')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  $('save').onclick=()=>{if(current&&adoption().valid)save(true);};
  $('draft').onclick=()=>save(false);
  $('print').onclick=()=>{if(current&&adoption().valid)window.print();};
  $('file').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      const contents=(await file.text()).replace(/^\uFEFF/,'');
      if(!file.name.toLowerCase().endsWith('.json')){
        if(await allowReplace()){reset('',contents);message('已讀入表格，請填資料集識別並配對。');}return;
      }
      const data=JSON.parse(contents);
      if(data.schema!==core.version || !['draft','analysis'].includes(data.kind) || typeof data.table!=='string' || typeof data.project!=='string')throw Error('不支援的校正紀錄格式。');
      const restored=new Map(data.adoptions||[]);
      for(const [key,v] of restored)if(typeof key!=='string'||!v||['zone','mpa','reason'].some(k=>typeof v[k]!=='string'))throw Error('採用紀錄格式錯誤。');
      let replay=null;
      if(data.kind==='analysis'){
        const g=core.parse(data.table).find(g=>g.key===data.selected);
        if(!g || !data.project.trim())throw Error('校正群組或案件識別不符。');replay=core.analyze(g);
      }
      if(!await allowReplace())return;
      reset(data.project,data.table,data.sourceSnapshot||null);decisions=restored;
      if(replay){prepare(data.selected);render(replay);message('已依原始列重新配對並計算。');}else message('已讀回原始資料。');
    }catch(err){message('讀取失敗：'+err.message);}
    finally{e.target.value='';}
  };
})();
