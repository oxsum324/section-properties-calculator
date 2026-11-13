const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('../結構工具箱/tools/cable-tension/cable-spectrum-core.js'),ref=require('./fixtures/cable-spectrum-reference.json');
const near=(v,r,t)=>assert.ok(Number.isFinite(v)&&Math.abs(v-r)<t,v+' vs '+r+' (tol '+t+')');
const base={caseId:'C01',sensor:'構件面內跨內',source:'已知組合訊號',boundary:'合成邊界與材料',length:ref.lengthM,mass:ref.massKgM,ei:ref.EI_Nm2,ea:ref.EA_N,sag:ref.sagM,left:50000,right:120000,thresholdPct:8,low:.5,high:20,tolerance:.02};
function csv(signal){
  if(process.env.CABLE_REFERENCE_CSV)return fs.readFileSync(path.join(process.env.CABLE_REFERENCE_CSV,signal.file),'utf8');
  const rows=['time_s,accel_m_s2'];
  for(let i=0;i<ref.n;i++){
    const t=i/ref.rateHz;
    let a=.0006*t+.13*Math.sin(2*Math.PI*signal.noiseLineHz*t);
    signal.activeModes.forEach((m,j)=>a+=[.65,.22,.095,.31][j]*Math.sin(2*Math.PI*signal.modeFrequenciesHz[m-1]*t+.28*m));rows.push(t+','+a);
  }
  return rows.join('\n');
}
function picks(signal,spec){
  return signal.activeModes.map(m=>({mode:m,bin:spec.peaks.reduce((a,b)=>Math.abs(a.hz-signal.modeFrequenciesHz[m-1])<Math.abs(b.hz-signal.modeFrequenciesHz[m-1])?a:b).bin}));
}
for(const [name,sig] of Object.entries(ref.signals)){
  const input={...base,csv:csv(sig)},s=core.spectrum(input),m=picks(sig,s);
  near(s.resolution,ref.binWidthHz,1e-8);assert.equal(s.peaks.length,5);
  s.peaks.forEach((p,i)=>{assert.equal(p.bin,sig.peaks[i].bin);near(p.hz,sig.peaks[i].interpolatedHz,process.env.CABLE_REFERENCE_CSV?1e-8:.0003);});
  assert.ok(!m.some(p=>p.bin===Math.round(7.23/s.df)));
  const model=name==='理想弦'?'string':name==='直索含EI'?'beam':'sag';
  const result=core.identify({...input,model},s,m);near(result.tensionKn,400,.09);
  if(model==='beam'){
    const fitted=core.identify({...input,model:'beamFit'},s,m);near(fitted.eiIdentified,ref.EI_Nm2,300);near(fitted.tensionKn,400,.09);
  }
  if(model==='sag'){
    assert.equal(core.identify({...input,model:'string'},s,m).tensionKn,null);
    assert.throws(()=>core.identify({...input,model,sag:''},s,m),/垂度/);
    assert.throws(()=>core.identify({...input,model,right:-1},s,m),/彈簧/);
  }
  if(model==='string'){
    let unresolved;try{unresolved=core.identify({...input,model:'beamFit'},s,m).tensionKn===null;}catch(e){unresolved=e.message.includes('EI');}assert.ok(unresolved);
    const invalid=m.map((p,i)=>({...p,mode:i===2?1:p.mode}));assert.throws(()=>core.identify({...input,model},s,invalid),/順序/);
    assert.throws(()=>core.identify({...input,model},s,m.slice(0,1)),/模態資料不足/);
    assert.equal(core.identify({...input,model},s,m.map((p,i)=>i===2?{...p,bin:Math.round(7.23/s.df)}:p)).tensionKn,null);
    const shorter=core.spectrum({...input,begin:'2',end:'22'});assert.ok(shorter.resolution>s.resolution);assert.ok(shorter.df<shorter.resolution);
  }
}
const small=Array.from({length:1024},(_,i)=>Math.sin(2*Math.PI*7*i/64));
const one=core.spectrum({...base,csv:['time_ms,accel_g',...small.map((x,i)=>[i*1000/64,x/9.80665].join(','))].join('\n')});near(one.fs,64,1e-10);near(one.peaks[0].hz,7,.0001);near(one.peaks[0].amplitude,1,.0001);
const trend=['time_s,accel_m_s2',...Array.from({length:1024},(_,i)=>i/64+','+(7+i*.0625))].join('\n');
assert.equal(core.spectrum({...base,csv:trend}).peaks.length,0);
const raw=csv(ref.signals['直索含EI']);
for(const patch of [{csv:raw.replace('time_s','samples')},{csv:raw.split('\n').filter((_,i)=>i!==11).join('\n')},{high:70},{end:999},{begin:4,end:3},{thresholdPct:''}]){
  assert.throws(()=>core.spectrum({...base,csv:raw,...patch}));
}
console.log('PASS 獨立三組已知索力、四個模態、漏階、干擾峰、時間窗、單位、端部柔度與不可辨識案例。');
