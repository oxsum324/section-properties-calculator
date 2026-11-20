(() => {
  'use strict';
  const VERSION='staged-wall.eb.v4',$=id=>document.getElementById(id);
  const headers={
    layers:['層底_m','kh_kN/m³','層頂有效_kPa','層底有效_kPa','反力下限_kPa','反力上限_kPa','來源'],
    sided_layers:['側別','層底_m','總單位重_kN/m³','水下總單位重_kN/m³','kh_kN/m³','Ka','K0','Kp','主動修正_kPa','被動修正_kPa','被動壁面摩擦角_deg','來源'],
    surcharges:['階段','側別','型式','超載_kPa','深度_m','近緣_m','遠緣_m','來源'],
    stages:['階段','挖深_m','外水深_m','內水深_m','有效側壓倍率','水壓倍率','來源'],
    water_profiles:['階段','側別','深度_m','水壓_kPa','來源'],
    supports:['支撐','深度_m','間距_m','水平勁度_kN/m','水平預力_kN','安裝階','拆除階','型式','來源','安裝方式'],
    comparisons:['階段','深度_m','來源類別','量','單位','數值','側別','支撐','來源與正向依據']
  };
  const keys=['case_id','basis','length','ei','water_weight','step','toe','soil_law','geometric',...Object.keys(headers)];
  const tsv=rows=>rows.map(r=>r.map(v=>String(v??'').replace(/[\r\n\t]+/g,' ')).join('\t')).join('\n');
  const form=()=>Object.fromEntries(keys.map(k=>[k,$(k).value]));
  let result=null,input=null,source=null,project=null,serial=0,controller=null;
  const msg=s=>{$('status').textContent=s;};
  const fmt=(n,d=4)=>n!=null && n!=='' && Number.isFinite(Number(n))?Number(Number(n).toFixed(d)).toString():'—';
  function invalidate(note){
    serial++;if(controller)controller.abort();controller=null;result=null;input=null;$('result').hidden=true;$('run').disabled=false;msg(note);
  }
  function writeForm(v){
    for(const k of keys)$(k).value=v[k]??(headers[k]?tsv([headers[k]])+'\n':'');
    soilInputs();
  }
  function soilInputs(){
    const twoSided=$('soil_law').value==='two_sided';
    $('twoSideSoilInputs').hidden=!twoSided;
    $('legacySoilInputs').hidden=twoSided;
  }
  function set(v,attachment=null){
    invalidate('請核對資料後計算。');source=attachment;writeForm(v);
  }
  function rows(v,key){
    const lines=String(v[key]).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n'),cols=lines.shift().split('\t');
    const expected=key==='supports'&&cols.length===headers.supports.length-1?headers.supports.slice(0,-1):headers[key];
    if(cols.length!==expected.length||expected.some((h,i)=>h!==cols[i].trim()))throw Error('請保留「'+headers[key][0]+'」表格的欄位與表頭順序。');
    return lines.filter(l=>l.trim()).map((l,i)=>{
      const r=l.split('\t').map(c=>c.trim());
      if(r.length!==cols.length)throw Error(headers[key][0]+'資料第 '+(i+1)+' 列欄數不足。');return r;
    });
  }
  const lookup=(value,map,label)=>{if(!Object.hasOwn(map,value))throw Error(label+'無法辨識：'+value);return map[value];};
  function request(v){
    const {water_profiles,sided_layers,surcharges,geometric,layers:netLayers,...rest}=v;
    const stages=rows(v,'stages').map(([id,cut,outside_water,inside_water,earth_factor,water_factor,basis])=>({
      id,cut,outside_water:outside_water||null,inside_water:inside_water||null,earth_factor,water_factor,basis
    }));
    const byStage=new Map(stages.map(stage=>[stage.id,stage]));
    if(byStage.size!==stages.length)throw Error('施工階段名稱不可重複。');
    if(water_profiles?.trim()){
      for(const [id,side,depth,pressure,basis] of rows(v,'water_profiles')){
        const stage=byStage.get(id);
        if(!stage)throw Error('分段水壓找不到施工階段 '+id+'。');
        const field=lookup(side,{'外':'outside_water_profile','內':'inside_water_profile'},'水壓側別');
        const profile=stage[field]??(stage[field]={basis,points:[]});
        if(profile.basis!==basis)throw Error(id+' '+side+'側分段水壓請填寫同一來源。');
        profile.points.push({depth,pressure});
      }
    }
    const twoSided=rest.soil_law==='two_sided';
    const layers=twoSided?[]:rows(v,'layers').map(([bottom,kh,pressure_top,pressure_bottom,lower,upper,basis])=>({bottom,kh,pressure_top,pressure_bottom,lower:lower||null,upper:upper||null,basis}));
    const soil=twoSided?{outside:[],inside:[],geometric:lookup(geometric,{yes:true,no:false},'二階作用設定')}:null;
    if(soil){
      for(const [face,bottom,unit_weight,saturated_unit_weight,kh,ka,k0,kp,active_offset,passive_offset,passive_friction_deg,basis] of rows(v,'sided_layers')){
        const side=lookup(face,{'外':'outside','內':'inside'},'土層側別');
        soil[side].push({bottom,unit_weight,saturated_unit_weight:saturated_unit_weight||null,kh,ka,k0,kp,active_offset,passive_offset,passive_friction_deg,basis});
      }
      for(const [id,face,type,pressure,depth,near,far,basis] of rows(v,'surcharges')){
        const stage=byStage.get(id);
        if(!stage)throw Error('超載找不到施工階段 '+id+'。');
        const side=lookup(face,{'外':'outside','內':'inside'},'超載側別');
        const kind=lookup(type,{'均佈':'uniform','帶狀':'strip'},'超載型式');
        if(kind==='uniform'&&(depth||near||far))throw Error(id+' 均佈超載的深度、近緣和遠緣須留空。');
        const load={side,kind,pressure,basis};
        if(kind==='strip')Object.assign(load,{depth,near,far});
        (stage.surcharges??=[]).push(load);
      }
    }
    return {...rest,layers,...(soil?{two_sided:soil}:{}),
      stages,
      supports:rows(v,'supports').map(([id,depth,spacing,stiffness,preload,install,remove,law,basis,installation])=>({
        id,depth,spacing,stiffness,preload,install,remove:remove||null,
        law:lookup(law,{'雙向':'bilateral','只受壓':'compression'},'支撐型式'),basis,
        installation:lookup(installation||'前階平衡',{'前階平衡':'previous_equilibrium','預力後鎖定':'preload_then_lock'},'安裝方式')
      })),
      comparisons:rows(v,'comparisons').map(([stage,depth,kind,quantity,unit,value,side,support,source])=>({stage,depth,kind:lookup(kind,{'外部':'external','監測':'measurement'},'比較來源'),quantity,unit,value,side:lookup(side,{'上':'above','下':'below'},'站位側別'),support:support||null,source}))};
  }
  function table(id,head,data){
    const host=$(id);host.replaceChildren();if(!data.length){host.textContent='本階無紀錄。';return;}
    const wrap=document.createElement('div');wrap.className='scroll';wrap.tabIndex=0;wrap.setAttribute('aria-label',head.join('、')+'，可捲動');
    const t=document.createElement('table'),tr=t.createTHead().insertRow();head.forEach(x=>{const th=document.createElement('th');th.scope='col';th.textContent=x;tr.append(th);});
    const body=t.createTBody();data.forEach(v=>{const tr=body.insertRow();v.forEach(cell=>tr.insertCell().textContent=cell);});wrap.append(t);host.append(wrap);
  }
  const peak=rows=>rows.reduce((a,b)=>Math.abs(a.u_mm)>=Math.abs(b.u_mm)?a:b);
  const viewingCoarse=()=>input?.soil_law==='two_sided'&&$('meshView').value==='coarse';
  const stageRecords=()=>viewingCoarse()?result.coarse:result.stages;
  function diagram(stage){
    const cv=$('plot'),w=cv.width=Math.min(760,Math.max(320,Math.round(cv.getBoundingClientRect().width)||760)),h=cv.height=360,ctx=cv.getContext('2d');
    ctx.clearRect(0,0,w,h);ctx.font='12px sans-serif';
    const fields=[['位移 mm','u_mm','u_mm'],['彎矩 kN·m/m','M_above','M_below'],['剪力 kN/m','V_above','V_below']];
    fields.forEach(([label,ka,kb],index)=>{
      const x=(index+.5)*w/3,y=z=>31+z/input.length*(h-70),records=stage.wall;
      const max=records.reduce((v,p)=>Math.max(v,Math.abs(p[ka]||0),Math.abs(p[kb]||0)),0),scale=(w/6-10)/(max||1);
      ctx.strokeStyle='#c2cec6';ctx.beginPath();ctx.moveTo(x,29);ctx.lineTo(x,h-37);ctx.stroke();
      ctx.fillStyle='#254e40';ctx.fillText(label,index*w/3+4,16);ctx.fillText('±'+fmt(max,2),index*w/3+4,h-8);
      ctx.strokeStyle='#bcc9c2';ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();
      const cut=Number(input.stages[$('stage').selectedIndex].cut);
      ctx.moveTo(index*w/3+4,y(cut));ctx.lineTo((index+1)*w/3-4,y(cut));ctx.stroke();ctx.setLineDash([]);
      if(index===0){ctx.fillText('0 m',2,29);ctx.fillText(fmt(Number(input.length))+' m',2,h-34);}
      ctx.strokeStyle=['#137467','#995126','#51538e'][index];ctx.lineWidth=1.6;ctx.beginPath();
      let first=true;for(const p of records)for(const k of [ka,kb])if(p[k]!=null){
        if(first){ctx.moveTo(x+p[k]*scale,y(p.z));first=false;}else ctx.lineTo(x+p[k]*scale,y(p.z));
      }ctx.stroke();ctx.lineWidth=1;
    });
  }
  function stageView(){
    if(!result)return;
    const i=$('stage').selectedIndex,s=stageRecords()[i],coarse=viewingCoarse(),p=peak(s.wall),b=s.balance;
    const other=coarse?result.stages[i]:result.coarse[i];
    $('title').textContent='階段 '+s.id+' ｜ '+(coarse?'粗':'細')+'網格 ｜ 壁頂深度 0，壁趾深度 '+input.length+' m';
    $('summary').textContent='最大絕對位移所在節點 z＝'+fmt(p.z)+' m，有號位移 '+fmt(p.u_mm,5)+' mm。'+(coarse?'細':'粗')+'網格 '+fmt(peak(other.wall).u_mm,5)+' mm。總水平力殘差 '+b.force_error.toExponential(2)+' kN/m，對地表力矩殘差 '+b.moment_error.toExponential(2)+' kN·m/m。';
    table('struts',['支撐','深度 m','安裝方式','位移基準 mm','每支水平力 kN','每米牆反力 kN/m','狀態'],s.supports.map(v=>[
      v.id,fmt(v.z),v.installation==='preload_then_lock'?'預力後鎖定':'前階平衡',
      fmt(v.reference_mm,5),fmt(v.force_kn,5),fmt(v.per_m,5),v.applying_preload?'本階施力並鎖定':v.gap?'脫離':'作用'
    ]));
    const units={u:'mm',M:'kN·m/m',V:'kN/m',R:'kN'};
    table('comparison',['來源','深度／側別','量','來源值','模型值','模型−來源（同單位）','來源與正向依據'],s.comparisons.map(v=>[v.kind==='external'?'外部解':'監測',fmt(v.depth)+' m／'+(v.side==='above'?'上':'下'),v.quantity+(v.support?' '+v.support:''),fmt(v.value)+' '+v.unit,v.calc==null?'該階未啟用':fmt(v.calc,5)+' '+units[v.quantity],fmt(v.delta,5)+' '+units[v.quantity],v.source]));
    const twoSided=input.soil_law==='two_sided';
    table('profile',['深度 m','位移 mm','轉角 rad','M 上／下 kN·m/m','V 上／下 kN/m',...(twoSided?['垂直力 kN/m']:[])],
      s.wall.map(v=>[fmt(v.z),fmt(v.u_mm,5),fmt(v.rotation,7),fmt(v.M_above,5)+'／'+fmt(v.M_below,5),fmt(v.V_above,5)+'／'+fmt(v.V_below,5),...(twoSided?[fmt(v.vertical_kn_m,5)]:[])]));
    $('springTitle').textContent=twoSided?'雙側土壓與接觸歷程':'土彈簧積分點與塑性位移';
    if($('springDetails').open){
      if(twoSided){
        const stateLabels={active:'主動',passive:'被動',elastic:'彈性',separated:'分離',excavated:'挖除'};
        table('springs',['深度 m','側別／區間','有效土壓 kPa','主動下限 kPa','靜止 kPa','被動上限 kPa','平衡後位移基準 mm','狀態'],
          s.soil_pressures.map(p=>[fmt(p.z),(p.side==='outside'?'外':'內')+'／'+(p.interval==='below'?'下':'上'),
            fmt(p.pressure_kpa),fmt(p.active_kpa),fmt(p.rest_kpa),fmt(p.passive_kpa),fmt(p.reference_mm,5),stateLabels[p.state]]));
      }else table('springs',['深度 m','有效驅動 kPa','淨水壓 kPa','土反力 kPa','塑性位移 mm','狀態'],s.springs.flat().map(v=>[fmt(v.z),fmt(v.effective_kpa),fmt(v.water_kpa),fmt(v.spring_kpa),fmt(v.plastic_m*1000,5),v.active?'作用':'無彈簧']));
    }
    const st=input.stages[i];
    const waterSides=[['外',st.outside_water,st.outside_water_profile],['內',st.inside_water,st.inside_water_profile]];
    const waterBasis=waterSides.map(([side,head,profile])=>profile?side+'側分段水壓':side+'側靜水位深度 '+head+' m');
    const waterRows=waterSides.flatMap(([side,_,profile])=>profile?.points.map(p=>[side,fmt(p.depth),fmt(p.pressure),profile.basis])??[]);
    $('waterProfileResult').hidden=!waterRows.length;
    if(waterRows.length)table('waterProfileTable',['側別','深度 m','水壓 kPa','來源'],waterRows);
    $('waterBalance').textContent=waterBasis.join('、')+'。水壓倍率 '+st.water_factor+
      '，淨水壓合力 '+fmt(b.water_force,6)+' kN/m，對壁頂矩 '+fmt(b.water_moment_at_ground,6)+' kN·m/m。';
    const forceBasis=twoSided
      ?'有效土壓外側 '+fmt(b.soil_outside)+'、內側 '+fmt(b.soil_inside)+' kN/m。壁趾垂直力 '+fmt(b.vertical_toe)+' kN/m，二階力矩項 '+fmt(b.geometric_moment)+' kN·m/m。'
      :'合外力 '+fmt(b.applied)+'、合土反力 '+fmt(b.soil)+' kN/m。';
    $('assumptions').textContent=st.basis+' ｜ 開挖 '+st.cut+' m。'+forceBasis+'壁趾水平反力 '+fmt(b.toe_force)+' kN/m，壁趾反力矩 '+fmt(b.toe_moment)+' kN·m/m。';
    diagram(s);
  }
  function stageTable(){
    table('stageTable',['階段','挖深 m','壁頂位移 mm','最大絕對位移之有號值 mm','支撐反力 kN/支','節點殘差最大值¹'],stageRecords().map((s,i)=>[s.id,fmt(Number(input.stages[i].cut)),fmt(s.wall[0].u_mm,5),fmt(peak(s.wall).u_mm,5),s.supports.map(v=>v.id+' '+fmt(v.force_kn,4)).join('、')||'—',s.balance.nodal_error.toExponential(2)]));
  }
  function display(r,body,selected,meshView){
    result=r;input=body;$('result').hidden=false;
    const model=input.soil_law==='two_sided'?'雙側彈塑性土壓，'+(input.two_sided.geometric?'計入二階作用':'一階內力'):
      input.soil_law==='plastic'?'彈性完全塑性土彈簧':'雙向線彈性土彈簧';
    $('context').textContent=[input.case_id,input.basis,'EI＝'+input.ei+' kN·m²/m','壁趾 '+({fixed:'固定',pinned:'鉸支',free:'自由'})[input.toe],model,'粗／細最大步距 '+r.coarse_step+'／'+r.fine_step+' m',r.version].join(' ｜ ');
    $('stage').replaceChildren(...r.stages.map((s,i)=>new Option(s.id,i)));
    if(selected&&r.stages.some(s=>s.id===selected))$('stage').selectedIndex=r.stages.findIndex(s=>s.id===selected);
    $('meshViewLabel').hidden=$('meshView').hidden=input.soil_law!=='two_sided';
    $('meshView').value=meshView==='coarse'?'coarse':'fine';
    stageTable();
    stageView();msg('已完成 '+r.stages.length+' 階。¹節點平移及轉動方程分別以 kN/m、kN·m/m 計。');
  }
  async function run(v=form(),selected=null,after=null,meshView='fine'){
    if(controller)controller.abort();
    const job=++serial,task=new AbortController();controller=task;$('run').disabled=true;msg('逐階求解與網格加密中…');
    try{
      const body=request(v);
      const resp=await fetch('./calculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:task.signal});
      const data=await resp.json();if(!resp.ok){const detail=data.detail;throw Error(Array.isArray(detail)?detail.map(e=>e.loc.slice(1).join('.')+' '+e.msg).join('；'):detail);}
      if(job!==serial)return;
      if(after)after();
      display(data,body,selected,meshView);
    }catch(e){if(job===serial)msg('未完成分析：'+e.message);}
    finally{if(job===serial){controller=null;$('run').disabled=false;}}
  }
  async function allowReplace(){
    if(!keys.some(k=>$(k).value.trim()&&(headers[k]?$(k).value.trim()!==tsv([headers[k]]):true)))return true;
    const d=$('replace');if(d.open)return false;d.returnValue='';const answer=new Promise(r=>d.addEventListener('close',()=>r(d.returnValue==='yes'),{once:true}));d.showModal();return answer;
  }
  $('example').onclick=async()=>{
    if(!await allowReplace())return;
    set({case_id:'合成壁段 W1',basis:'地表 GL 0；合成分層、固定趾基準',length:12,ei:210000,water_weight:9.81,step:.5,toe:'fixed',soil_law:'linear',
      layers:tsv([headers.layers,[6,6200,8,26,'','','上層合成 8＋3z'],[12,12500,26,44,'','','下層合成 8＋3z']]),
      stages:tsv([headers.stages,...[['S1',3,2,3,1,1,'挖至 3 m'],['S2',3,2,3,1,1,'安裝與預力'],['S3',6,2,6,1,1,'降水續挖'],['S4',6,2,6,1,1,'拆撐'],['S5',6,2,6,.65,.65,'合成等比例卸載']]]),
      supports:tsv([headers.supports,['B1',2,2,36000,90,'S2','S4','雙向','合成總水平剛度／預力；每米牆半數','前階平衡']]),
      comparisons:tsv([headers.comparisons,['S3',0,'外部','u','mm',18.645,'下','','獨立矩陣指數，正向開挖側'],['S3',2,'外部','R','kN',198.8468,'下','B1','獨立梁解每米反力 ×2 m'],['S3',0,'監測','u','cm',1.90,'下','','合成觀測 3，供單位與對欄演練']])});
  };
  $('twoSideExample').onclick=async()=>{
    if(!await allowReplace())return;
    const soil=[12,19,20,6200,.35,.5,3.2,0,0,15,'合成砂層'];
    set({case_id:'合成雙側壁段',basis:'地表 GL 0，壁趾固定，合成土層與水平支撐',
      length:12,ei:210000,water_weight:9.81,step:.5,toe:'fixed',soil_law:'two_sided',geometric:'yes',
      sided_layers:tsv([headers.sided_layers,['外',...soil],['內',...soil]]),
      stages:tsv([headers.stages,['S1',3,2,3,1,1,'挖至 3 m'],['S2',3,2,3,1,1,'安裝支撐'],['S3',6,2,6,1,1,'續挖、降水']]),
      surcharges:tsv([headers.surcharges,['S3','外','帶狀',15,0,0,5,'合成帶狀超載']]),
      supports:tsv([headers.supports,['B1',2,2,36000,90,'S2','','只受壓','合成水平預力','預力後鎖定']])});
  };
  $('bring').onclick=async()=>{
    if(!project)return;
    const side=$('externalSide').value,obj=side==='analysis_import'?project.analysis_import:project[side]?.import_result;
    if(side!=='analysis_import'&&project[side]?.mode!=='import'){msg('所選側目前未使用外部匯入。');return;}
    if(!obj?.stages?.length){msg('所選來源沒有施工階段。');return;}
    if(!await allowReplace())return;
    const ids=obj.stages.map((s,i)=>(i+1)+' '+s.label);
    const comps=[];
    for(const e of obj.events||[])for(const c of e.stage_force_cases||[]){
      const i=obj.stages.findIndex(s=>s.index===c.stage_index&&s.label===c.stage_label);
      if(i>=0&&e.depth_m!=null)comps.push([ids[i],e.depth_m,'外部','R','tf',c.axial_force_t,'下','',obj.source_name+'；請核對軸力正向、水平投影與支撐對應']);
    }
    set({case_id:project.metadata.name+'／'+obj.source_name,length:obj.wall_length_m,ei:obj.wall_ei_tf_m2_per_m!=null?obj.wall_ei_tf_m2_per_m*9.80665:'',
      layers:tsv([headers.layers,...(obj.soils||[]).map(l=>[l.depth_m,
        l.kh_source && l.kh_t_per_m3!=null && (l.kh_source==='O SOIL NO/Kh'||l.kh_pressure_gradient_per_m===0)?l.kh_t_per_m3*9.80665:'',
        '','','','',obj.source_name+'；'+l.name+(l.kh_source?'；'+l.kh_source:'；舊土層資料須回查')+(l.kh_pressure_gradient_per_m?'；Rp 非零，需另定等效 kh':'')])]),
      stages:tsv([headers.stages,...obj.stages.map((s,i)=>[ids[i],s.excavation_depth_m,'',s.water_level_m,'','',obj.source_name+'；'+s.label])]),
      comparisons:tsv([headers.comparisons,...comps])},{project:project.metadata.id,side,external:obj});
    msg('已帶入已儲存外部來源。請核對深度正向、各階兩側水位、側壓、土參數、支撐與水平分量。未提供值留白。');
  };
  window.addEventListener('resize',()=>{if(result)diagram(stageRecords()[$('stage').selectedIndex]);});
  window.addEventListener('beforeprint',()=>{if(result)diagram(stageRecords()[$('stage').selectedIndex]);});
  $('stage').onchange=stageView;$('springDetails').ontoggle=stageView;$('run').onclick=()=>run();
  $('meshView').onchange=()=>{if(result){stageTable();stageView();}};
  keys.forEach(k=>$(k).oninput=()=>invalidate('輸入已更動，請重新分析。'));
  $('soil_law').addEventListener('change',soilInputs);
  $('print').onclick=()=>{if(result)window.print();};
  $('save').onclick=()=>{
    if(!result)return;
    const data={version:VERSION,form:form(),input,source,stage:result.stages[$('stage').selectedIndex].id,result,generated:new Date().toISOString()};
    if(input.soil_law==='two_sided')data.mesh_view=$('meshView').value;
    const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='逐階壁體分析.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('file').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{const d=JSON.parse(await file.text());if(![VERSION,'staged-wall.eb.v3','staged-wall.eb.v2','staged-wall.eb.v1'].includes(d.version)||!d.form)throw Error('無法辨識紀錄。');
      request(d.form);if(!await allowReplace())return;
      await run(d.form,d.stage,()=>{writeForm(d.form);source=d.source??null;},d.mesh_view);
    }catch(err){msg(err.message);}finally{e.target.value='';}
  };
  set({});msg('請輸入案件參數或載入合成例。');
  const id=new URLSearchParams(location.search).get('project');
  if(id)fetch('/api/projects/'+encodeURIComponent(id)).then(r=>{if(!r.ok)throw Error('無法讀取已儲存案件');return r.json();}).then(p=>{project=p;$('sourceName').textContent=p.metadata.name;$('bring').disabled=false;}).catch(e=>msg(e.message));
})();
