import { braceMethods,braceFlanges,braceUnits,braceGraphValues,evaluateBrace,braceText,sealBrace,validBrace,sameBraceStation,spanLocation } from './beam-brace-segment.js';
import { saveBrace,readPackets,revisionStatus } from './beam-station-transfer.js';
const fmt=n=>String(Number(n.toPrecision(8)));
const options=labels=>Object.entries(labels).map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('');

function draw(canvas,profile,points,start,end,result) {
  const w=Math.max(260,canvas.clientWidth),h=166,dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const length=profile.offsets.at(-1),pad=22,cx=x=>pad+(w-2*pad)*x/length;
  const max=points.reduce((v,p)=>Math.max(v,Math.abs(p[1])),0)||1;
  const cy=m=>75-m/max*48;
  ctx.fillStyle='#f5f8fb';ctx.fillRect(0,0,w,h);
  if(Number.isFinite(start)&&Number.isFinite(end)&&end>start){ctx.fillStyle='#d7ebeb';ctx.fillRect(cx(start),8,cx(end)-cx(start),122);}
  ctx.strokeStyle='#62768a';ctx.beginPath();ctx.moveTo(pad,75);ctx.lineTo(w-pad,75);ctx.stroke();
  ctx.font='12px sans-serif';ctx.textAlign='center';
  profile.offsets.forEach((x,i)=>{
    ctx.fillStyle='#364b61';ctx.fillRect(cx(x)-1,71,2,8);
    if(i)ctx.fillText('跨 '+i,cx((profile.offsets[i-1]+x)/2),151);
  });
  ctx.beginPath();points.forEach(([x,m],i)=>i?ctx.lineTo(cx(x),cy(m)):ctx.moveTo(cx(x),cy(m)));
  ctx.strokeStyle='#216d79';ctx.lineWidth=2;ctx.stroke();
  if(result?.peak){
    for(const q of result.quarters){
      for(const m of new Set([q.left,q.right])){
        ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(cx(q.x),cy(m),3.5,0,2*Math.PI);ctx.fill();ctx.stroke();
      }
    }
    ctx.beginPath();ctx.fillStyle='#a44b22';ctx.arc(cx(result.peak.x),cy(result.peak.m),4,0,2*Math.PI);ctx.fill();
  }
  for(const [x,text] of [[start,'起'],[end,'迄']]){
    if(!Number.isFinite(x)||x<0||x>length)continue;
    ctx.strokeStyle='#a44b22';ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(cx(x),16);ctx.lineTo(cx(x),130);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#783416';ctx.fillText(text,cx(x),13);
  }
}
export async function showBraceSender(host,model,form){
  const previous=host._braceWatch;
  if(previous?.key===model.fingerprint && previous.isCurrent()){previous.refresh();return;}
  previous?.controller.abort();
  const controller=new AbortController(),watch={key:model.fingerprint,isCurrent:model.isCurrent,controller,refresh:()=>{}};
  host._braceWatch=watch;
  let profile;
  try{profile=await model.buildProfile();}catch(e){host.textContent=e.message;delete host._braceWatch;return;}
  if(host._braceWatch!==watch||!model.isCurrent())return;
  const points=braceGraphValues(profile),units=braceUnits[model.units],length=profile.offsets.at(-1);
  host.innerHTML='<p>沿用上方的案號、構件、修次與載重組合。點選彎矩圖或輸入距全梁左端的位置，正彎矩為上翼板受壓。</p>'+
    '<canvas aria-label="未側撐段選取用連續梁彎矩圖" style="width:100%;height:166px;display:block"></canvas>'+
    '<div class="brace-actions"><button type="button" class="btn btn-sm" data-pick="start">圖上選起點</button> <button type="button" class="btn btn-sm" data-pick="end">圖上選終點</button> <button type="button" class="btn btn-sm" data-full>選全梁兩端</button></div>'+
    '<div class="form-row"><label>段起點 ('+units[0]+') <input name="start" type="number" min="0" step="any"></label>'+
    '<label>段終點 ('+units[0]+') <input name="end" type="number" min="0" step="any"></label></div>'+
    '<div class="form-row"><label>側撐配置 <select name="restraints"><option value="">待確認</option><option value="both">所選段兩端有有效側撐</option><option value="cantilever">側向未支撐懸臂</option></select></label>'+
    '<label>已受側撐的翼板 <select name="flange"><option value="">待確認</option>'+options(braceFlanges)+'</select></label></div>'+
    '<label>適用方法 <select name="method"><option value="">請選擇</option>'+options(braceMethods)+'</select></label>'+
    '<label data-jump hidden>四分點突跳 <select name="jump"><option value="">待核對左右值</option><option value="envelope">採兩側絕對值較大者</option></select></label>'+
    '<p data-values></p><p role="status"></p><button type="button" class="btn btn-sm" data-send disabled>送出未側撐段候選</button> <a target="_blank" rel="noopener" hidden>開啟鋼梁核對視窗</a>';
  const field=k=>host.querySelector('[name="'+k+'"]'),canvas=host.querySelector('canvas'),status=host.querySelector('[role=status]'),link=host.querySelector('a');
  let pick='start';
  function values(){
    const selection={start:field('start').valueAsNumber,end:field('end').valueAsNumber};
    for(const k of ['method','restraints','flange','jump'])selection[k]=field(k).value;
    const meta={};
    for(const k of ['project','member','caseName','combination','basis'])meta[k]=form.elements[k].value.trim();
    meta.revision=form.elements.revision.valueAsNumber;
    return {selection,meta};
  }
  function refresh(){
    const {selection,meta}=values(),r=evaluateBrace(profile,selection);
    link.hidden=true;draw(canvas,profile,points,selection.start,selection.end,r);
    host.querySelector('[data-jump]').hidden=!(r.hasJump&&selection.method==='quarter');
    host.querySelector('[data-values]').textContent=r.peak ?
      ((profile.freeStart && r.start===0)||(profile.freeEnd && r.end===length)?'本段包含分析自由端，側向拘束依填選條件。 ':'')+spanLocation(profile,r.start)+' 至 '+spanLocation(profile,r.end,true)+' '+units[0]+'｜Lb = '+fmt(r.length)+' '+units[0]+
      '｜● 段內 |M|max = '+fmt(Math.abs(r.peak.m))+' '+units[1]+'，全梁 x = '+fmt(r.peak.x)+' '+units[0]+
      '｜○ 四分點有號彎矩（遇突跳列左／右） '+r.quarters.map(p=>Math.abs(p.left-p.right)>Math.abs(r.peak.m)*1e-10 ? fmt(p.left)+'／'+fmt(p.right) : fmt(p.left)).join('；')+' '+units[1]+
      '｜正文 Cb = '+(r.body===null?'待核':fmt(r.body))+'；四分點 Cb = '+(r.quarter===null?'待核':fmt(r.quarter)) : '';
    let issue=r.issue;
    if(!model.isCurrent())issue='來源已變動，請重新分析。';
    else if(!issue&&(!meta.project||!meta.member||!meta.caseName||!meta.combination||!Number.isSafeInteger(meta.revision)||meta.revision<1))
      issue='請在上方填妥案號、構件、修次、載重案例及實際組合識別。';
    else if(!issue&&model.project && model.project!==meta.project)issue='段候選案號須與本次分析案號一致。';
    else if(!issue&&meta.basis!=='factored')issue='本方法須核對已因數化 LRFD 載重組合。';
    status.textContent=issue||('可送出：'+braceMethods[selection.method]+'，Cb = '+fmt(r.cb));
    host.querySelector('[data-send]').disabled=Boolean(issue);
    return issue ? null : {kind:'beam-brace-v1',...meta,units:model.units,fingerprint:model.fingerprint,engine:model.engine,profile,selection};
  }
  watch.refresh=refresh;
  const observer=new ResizeObserver(()=>{const {selection}=values();draw(canvas,profile,points,selection.start,selection.end,evaluateBrace(profile,selection));});
  observer.observe(canvas);controller.signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
  for(const type of ['input','change']){host.addEventListener(type,refresh,{signal:controller.signal});form.addEventListener(type,refresh,{signal:controller.signal});}
  for(const button of host.querySelectorAll('[data-pick]'))button.onclick=()=>{pick=button.dataset.pick;status.textContent='請點選圖上的段'+(pick==='start'?'起點。':'終點。');};
  host.querySelector('[data-full]').onclick=()=>{field('start').value=0;field('end').value=length;refresh();};
  canvas.onclick=e=>{const rect=canvas.getBoundingClientRect();let x=Math.min(length,Math.max(0,(e.clientX-rect.left-22)/(rect.width-44)*length));
    const nearest=profile.pieces.reduce((best,p)=>Math.abs(p[0]-x)<Math.abs(best-x)?p[0]:best,length);
    const snap=Math.abs(nearest-x)<=5*length/(rect.width-44);
    field(pick).value=snap ? String(nearest) : fmt(x);pick=pick==='start'?'end':'start';refresh();};
  host.querySelector('[data-send]').onclick=()=>{
    const raw=refresh();if(!raw)return;
    try{const candidate=sealBrace(raw),scope=saveBrace(candidate);link.href=model.route+'?stations='+scope;link.hidden=false;
      status.textContent='已送出 '+raw.member+'／'+raw.combination+'／R'+raw.revision+'。請在鋼梁頁確認後採用。';}
    catch(e){status.textContent='無法儲存段候選。'+e.message;}
  };
  refresh();
}

export function openBraceReceiver(host,scope,api){
  host.innerHTML='<h2>未側撐段 Lb、Cb 核對</h2><label>段候選 <select style="max-width:100%"></select></label>'+
    '<p data-incoming></p><p data-current></p><label><input type="checkbox"> 已核對正式需求與本段為相同構件及載重組合、兩端有效側撐及結實熱軋 H 型鋼強軸撓曲條件；採用本段 Lb、Cb。</label> '+
    '<button type="button" class="btn-calc" disabled>採用本段 Lb、Cb</button><p role="status"></p>';
  const list=host.querySelector('select'),confirm=host.querySelector('input'),apply=host.querySelector('button'),status=host.querySelector('[role=status]');
  let reviewed='';
  function refresh(){
    const rows=readPackets(scope),braces=rows.filter(p=>p.kind==='beam-brace-v1'),old=list.value;
    host.hidden=!braces.length;
    list.replaceChildren(...braces.map(p=>new Option(p.member+' ／ '+p.combination+' ／ R'+p.revision+' ／ '+p.selection.start+'～'+p.selection.end+' '+braceUnits[p.units][0]+' ／ '+braceMethods[p.selection.method],p.id)));
    if(braces.some(p=>p.id===old))list.value=old;
    const p=braces.find(p=>p.id===list.value),c=api.current();
    let issue=p?revisionStatus(p,rows):'沒有段候選。';
    if(issue==='有效修次'){
      if(c.project&&c.project!==p.project)issue='正式案號與候選不同。';
      else if(c.method!=='LRFD'||c.shape!=='h')issue='限 LRFD 雙對稱 H 型鋼強軸撓曲。';
      else if(!c.compact)issue='本段方法限極限設計法表 4.5-1 的結實熱軋 H 型鋼。';
      else if(c.stationModified)issue='已採用站位的需求或跨長經過人工修改，請重新採用同案站位。';
      else if(c.otherSource)issue='目前內力來源未附可核對的同站與組合識別，請先採用同來源站位。';
      else if(!sameBraceStation(c.station,p))issue='已採用的內力站位與本段案號、組合、修次、來源或段界不符。';
    }
    const token=JSON.stringify([p?.id,c,issue]);
    if(token!==reviewed)confirm.checked=false;
    reviewed=token;host.querySelector('[data-current]').textContent='正式輸入：Lb = '+fmt(c.lb)+' cm，Cb = '+fmt(c.cb)+'；'+c.source;
    host.querySelector('[data-incoming]').textContent=p?braceText(p):'';
    confirm.disabled=issue!=='有效修次';apply.disabled=confirm.disabled||!confirm.checked;status.textContent=issue;
    return p;
  }
  list.onchange=refresh;confirm.onchange=refresh;
  apply.onclick=()=>{const p=refresh();if(!p||apply.disabled||!validBrace(p))return;api.adopt(p);confirm.checked=false;refresh();status.textContent='已採用本段 Lb、Cb。';};
  window.addEventListener('storage',refresh);window.addEventListener('steel-beam-source-restored',refresh);
  document.addEventListener('input',e=>{if(!host.contains(e.target))refresh();});
  document.addEventListener('change',e=>{if(!host.contains(e.target))refresh();});
  document.addEventListener('click',e=>{if(e.target.closest('#btnLRFD,#btnASD,#beamUnitModeSiBtn,#beamUnitModeLegacyBtn'))refresh();});
  refresh();
}
