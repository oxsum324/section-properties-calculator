(() => {
  'use strict';
  const core=window.FloorPlateFEM,$=id=>document.getElementById(id);
  const keys=['caseId','basis','width','depth','hMm','eMpa','nu','kMNm3','angle','face','joint','jointsX','jointsY','mesh','loads','points'];
  const raw=()=>Object.fromEntries(keys.map(k=>[k,$(k).value]));
  const tab=rows=>rows.map(r=>r.map(v=>String(v??'').replace(/[\r\n\t]+/g,' ')).join('\t')).join('\n');
  const fmt=(value,places=4)=>Number(value.toFixed(places)).toString();
  const status=msg=>{$('status').textContent=msg;};
  let current=null,worker=null,source=null;
  function invalidate(msg){
    if(worker){worker.terminate();worker=null;}
    current=null;$('result').hidden=true;$('print').disabled=$('save').disabled=true;$('run').disabled=false;status(msg);
  }
  function replace(v,note,snapshot=null){
    invalidate(note);source=snapshot;
    for(const k of keys)$(k).value=v[k]??'';
  }
  function table(id,head,rows){
    const target=$(id),wrap=document.createElement('div');wrap.className='scroll';wrap.tabIndex=0;wrap.setAttribute('aria-label',head.join('、')+'，可捲動');
    const t=document.createElement('table'),tr=t.createTHead().insertRow();head.forEach(s=>{const th=document.createElement('th');th.scope='col';th.textContent=s;tr.append(th);});
    const body=t.createTBody();rows.forEach(row=>{const tr=body.insertRow();row.forEach(s=>tr.insertCell().textContent=s);});
    wrap.append(t);target.replaceChildren(wrap);
  }
  const coords=p=>fmt(p.x)+' ／ '+fmt(p.y);
  const side=p=>p.panel+'；'+(p.i+1)+'／'+(p.j+1);
  function plot(a,f){
    const canvas=$('plot');canvas.width=Math.max(440,Math.min(820,Math.round(350*a.width/a.depth+90)));
    canvas.style.width=canvas.width/1.25+'px';
    const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,pad=45;
    const s=Math.min((W-2*pad)/a.width,(H-2*pad)/a.depth),x0=(W-s*a.width)/2,y0=H-pad;
    const X=x=>x0+x*s,Y=y=>y0-y*s;
    ctx.clearRect(0,0,W,H);ctx.font='16px sans-serif';
    const limit=Math.max(Math.abs(f.max.stress),Math.abs(f.min.stress),1e-12);
    function color(v){
      const t=Math.min(1,Math.abs(v)/limit)**.65;
      const rgb=v>=0?[159,49,20]:[28,87,137];return 'rgb('+rgb.map(c=>Math.round(245+(c-245)*t)).join(',')+')';
    }
    f.panels.forEach((p,index)=>{
      const map=f.map[index];
      for(let j=0;j<p.ny;j++)for(let i=0;i<p.nx;i++){
        ctx.fillStyle=color(map[j*p.nx+i]);ctx.fillRect(X(p.xe[i]),Y(p.ye[j+1]),(p.xe[i+1]-p.xe[i])*s+.35,(p.ye[j+1]-p.ye[j])*s+.35);
      }
      ctx.lineWidth=2;ctx.strokeStyle='#334a45';ctx.strokeRect(X(p.x0),Y(p.y1),(p.x1-p.x0)*s,(p.y1-p.y0)*s);
    });
    ctx.lineWidth=1.5;ctx.strokeStyle='#262626';
    a.loads.forEach(l=>{ctx.strokeRect(X(l.x-l.b/2),Y(l.y+l.d/2),l.b*s,l.d*s);});
    for(const p of a.points){ctx.beginPath();ctx.arc(X(p.x),Y(p.y),3.5,0,Math.PI*2);ctx.stroke();}
    for(const [i,v] of [f.max,f.min].entries()){
      const x=X(v.x),y=Y(v.y);ctx.strokeStyle=i?'#002f62':'#852000';ctx.beginPath();ctx.moveTo(x-6,y-6);ctx.lineTo(x+6,y+6);ctx.moveTo(x-6,y+6);ctx.lineTo(x+6,y-6);ctx.stroke();
      ctx.fillStyle=ctx.strokeStyle;ctx.fillText(i?'最小':'最大',x+6,y+(i?15:-7));
    }
    ctx.fillStyle='#263e3a';ctx.fillText('0',x0-15,y0+17);ctx.fillText('x　'+fmt(a.width)+' m',X(a.width)-40,y0+28);ctx.fillText('y　'+fmt(a.depth)+' m',x0,21);
    $('legend').textContent='藍色為壓、紅色為拉；顏色取細網格單元中心值。空心矩形為輪印，圓點為觀察點，叉號為全體取樣之控制位置。';
  }
  function display(r){
    const a=r.input,f=r.fine,c=r.coarse;
    $('identity').textContent=[a.caseId,a.basis,core.version].join(' ｜ ');
    $('model').textContent='自由邊矩形板 '+fmt(a.width)+' × '+fmt(a.depth)+' m，厚 '+fmt(a.hMm)+' mm；E＝'+fmt(a.eMpa)+' MPa，ν＝'+fmt(a.nu)+'；k＝'+fmt(a.kMNm3)+' MN/m³。'+(a.joint==='none'?'完整單板。':'貫通接縫無傳力，x＝'+(a.jointsX.join('、')||'無')+' m，y＝'+(a.jointsY.join('、')||'無')+' m。');
    $('summary').textContent=(a.face==='bottom'?'底面':'頂面')+' '+fmt(a.angle)+'° 方向，細網格取樣應力 '+fmt(f.min.stress,6)+' ～ '+fmt(f.max.stress,6)+' MPa；荷重合計 '+fmt(f.applied,5)+' kN。';
    table('limits',['取樣極值','粗網格 MPa；x／y (m)','細網格 MPa；x／y (m)','細−粗 (MPa)','細網格板區；元素 i／j'],
      [['最大','max'],['最小','min']].map(([title,k])=>[title,fmt(c[k].stress,7)+'；'+coords(c[k]),fmt(f[k].stress,7)+'；'+coords(f[k]),fmt(f[k].stress-c[k].stress,7),side(f[k])]));
    $('uplift').textContent=f.minW.wMm < -1e-7 ? '細網格取樣最小撓度 '+fmt(f.minW.wMm,6)+' mm（x／y＝'+coords(f.minW)+' m），該處線性地盤彈簧受拉。若現地地盤僅能受壓，須另核脫空。' : '細網格取樣最小撓度 '+fmt(f.minW.wMm,6)+' mm，向下為正。';
    const rows=[];
    for(const [id,p] of [['全域最大',f.max],['全域最小',f.min],...f.observations.map(v=>[v.id,v])]){
      for(const q of [...p.parts,{...p,id:'合計'}]) rows.push([id,coords(p),side(p),q.id,fmt(q.stress,6),fmt(q.sx,6)+'／'+fmt(q.sy,6)+'／'+fmt(q.tau,6),fmt(q.wMm,6)]);
    }
    table('values',['位置','x／y (m)','板區；元素 i／j','項次','σθ (MPa)','σx／σy／τxy (MPa)','w (mm)'],rows);
    table('inventory',['項次','x／y (m)','接觸寬／深 (m)','單輪 kN × 動力係數','來源'],a.loads.map(l=>[l.id,coords(l),fmt(l.b)+'／'+fmt(l.d),fmt(l.p)+' × '+fmt(l.f),l.src]));
    table('panels',['板區','x、y 邊界 (m)','粗 → 細單元數','細網格最小／最大邊長 (m)','項次　分攤荷重／地盤反力 (kN)'],
      f.panels.map((p,i)=>{
        const steps=[...p.xe.slice(1).map((v,j)=>v-p.xe[j]),...p.ye.slice(1).map((v,j)=>v-p.ye[j])];
        return [p.panel,[p.x0+'～'+p.x1,p.y0+'～'+p.y1].join('；'),c.panels[i].nx+'×'+c.panels[i].ny+' → '+p.nx+'×'+p.ny,fmt(Math.min(...steps),6)+'／'+fmt(Math.max(...steps),6),
          p.forces.map(l=>l.id+'　'+fmt(l.applied,6)+'／'+fmt(l.reaction,6)).join('；')];
      }));
    current=r;$('result').hidden=false;$('save').disabled=$('print').disabled=false;plot(a,f);$('result').focus();
  }
  function run(){
    invalidate('正在積分輪印、分解剛度矩陣與比較兩級網格…');
    try{
      const data=raw();core.normalize(data);
      const task=new Worker('floor-plate-worker.js');worker=task;$('run').disabled=true;
      task.onmessage=e=>{
        if(worker!==task)return;
        task.terminate();worker=null;$('run').disabled=false;
        if(e.data.error){invalidate(e.data.error);return;}display(e.data.result);status('已完成兩級網格計算。');
      };
      task.onerror=e=>invalidate('計算工作無法完成：'+e.message);task.postMessage(data);
    }catch(e){invalidate(e.message);}
  }
  const emptyLoads=core.loadHeaders.join('\t')+'\n',emptyPoints=core.pointHeaders.join('\t')+'\n';
  $('loads').value=emptyLoads;$('points').value=emptyPoints;
  async function allowReplace(){
    if(!['caseId','basis','width','depth','hMm','eMpa','nu','kMNm3','joint','jointsX','jointsY'].some(k=>$(k).value.trim())&&$('loads').value===emptyLoads&&$('points').value===emptyPoints)return true;
    const d=$('replace');if(d.open)return false;d.returnValue='';const answer=new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='yes'),{once:true}));d.showModal();return answer;
  }
  $('example').onclick=async()=>{
    if(!await allowReplace())return;
    replace({caseId:'合成地坪 F1',basis:'5 m 自由板；合成輪組與線彈性地盤',width:5,depth:5,hMm:180,eMpa:28000,nu:.2,kMNm3:50,face:'bottom',angle:0,mesh:16,joint:'none',
      loads:tab([core.loadHeaders,['W1',1.9,2.3,.24,.3,40,1,'合成載重圖 A'],['W2',3.1,2.7,.3,.38,25,1,'合成載重圖 B']]),
      points:tab([core.pointHeaders,['板中央',2.5,2.5],['W1 中心',1.9,2.3]])},'已載入合成雙輪例。');
  };
  try{$('parentInput').hidden=typeof window.parent.readFloorPlateSource!=='function';}catch{$('parentInput').hidden=true;}
  $('parentInput').onclick=async()=>{
    try{
      const p=window.parent.readFloorPlateSource(),s=p.input,rows=[core.loadHeaders];
      for(const [i,g] of s.loadGroups.entries()){
        if(!Number.isSafeInteger(g.count)||g.count<1)throw Error('主頁輪數須為正整數。');
        for(let j=0;j<g.count;j++)rows.push([(i+1)+'-'+(j+1)+' '+g.name,'','','','',g.loadKn,g.dynamicFactor,'']);
      }
      if(!await allowReplace())return;
      replace({caseId:p.project.no||p.project.name,basis:'',width:'',depth:'',hMm:s.slabThicknessMm,eMpa:s.elasticModulusMpa,nu:s.poissonRatio,kMNm3:s.subgradeModulusMNm3,
        face:'bottom',angle:0,mesh:16,joint:'',loads:tab(rows),points:emptyPoints},'已帶入主頁參數與各輪荷重。請依圖面補入輪位、輪印、板界及資料來源。',p);
    }catch(e){status(e.message);}
  };
  keys.forEach(k=>$(k).addEventListener('input',()=>invalidate('輸入已變更，請重新計算。')));
  $('run').onclick=run;$('print').onclick=()=>{if(current)window.print();};
  $('save').onclick=()=>{
    if(!current)return;
    const data={version:core.version,generatedAt:new Date().toISOString(),input:raw(),sourceSnapshot:source,result:current};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download='地坪位置分析-'+current.input.caseId.replace(/[\\/:*?"<>|]/g,'_')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  $('file').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      const data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));
      if(data.version!==core.version||!data.input)throw Error('無法辨識位置分析版本。');
      core.normalize(data.input);if(!await allowReplace())return;
      replace(data.input,'讀取輸入後重新計算。',data.sourceSnapshot||null);run();
    }catch(err){status('讀回失敗：'+err.message);}finally{e.target.value='';}
  };
})();
