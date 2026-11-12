(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../../SRC工具/core/src-column-rc-biaxial.js'));
  else root.ColumnCoverBiaxial = factory(root.SrcColumnRcBiaxial);
})(globalThis, function (rc) {
  'use strict';

  const version = 'rc-column-cover.biaxial.v1';
  const header = ['筋號', 'x_mm', 'y_mm', 'As_cm²', '定位方式', '來源'];
  const methods = ['圖說', '逐筋量測', '圖說推定', '合成'];
  const axialTolerance = 1e-6, momentTolerance = 1e-7;
  const text = value => typeof value === 'string' ? value.trim() : '';

  function numeric(value, label) {
    if ((typeof value !== 'number' && !text(value)) || !Number.isFinite(Number(value))) throw Error(label + ' 缺值或數字無效。');
    return Number(value);
  }

  function readBars(table, label) {
    const rows = text(table).replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (!rows.length) throw Error(label + '待補逐筋座標。');
    const separator = rows[0].includes('\t') ? '\t' : ',';
    if (rows[0].split(separator).map(x => x.trim()).join('|') === header.join('|')) rows.shift();
    if (rows.length < 4) throw Error(label + '至少須填四支主筋。');
    return rows.map((row, i) => {
      const cells = row.split(separator).map(x => x.trim());
      const where = label + '第 ' + (i+1) + ' 支';
      if (cells.length !== header.length) throw Error(where + '須有六欄，請由 Excel 複製完整資料。');
      const [id,x,y,area,method,source] = cells;
      if (!id || !methods.includes(method) || !source) throw Error(where + '須填筋號、定位方式及來源。');
      return {id, xMm:numeric(x,where+' x'), yMm:numeric(y,where+' y'), areaCm2:numeric(area,where+' As'), method, source};
    });
  }

  function checkGeometry(bars, width, depth, label) {
    const seen = new Set();
    bars.forEach((bar, index) => {
      if (seen.has(bar.id)) throw Error(label+'筋號重複：'+bar.id);
      seen.add(bar.id);
      if (!(bar.areaCm2 > 0 && bar.areaCm2 <= 25)) throw Error(label+bar.id+' 的 As 須大於 0 且不超過 25 cm²。');
      const radius = 10*Math.sqrt(bar.areaCm2/Math.PI);
      if (Math.min(bar.xMm,width-bar.xMm,bar.yMm,depth-bar.yMm) < radius-1e-8) throw Error(label+bar.id+' 等面積圓超出斷面。');
      for (let i=0;i<index;i++) {
        const other = bars[i];
        if (Math.hypot(bar.xMm-other.xMm,bar.yMm-other.yMm) < radius+10*Math.sqrt(other.areaCm2/Math.PI)-1e-8)
          throw Error(label+bar.id+' 與 '+other.id+' 的等面積圓重疊。');
      }
    });
  }

  // Solve for log(c) and the signed neutral normal. Residuals use the actual
  // section point. A step that jumps across a discrete-bar stress-block edge
  // cannot be accepted on the strength of a small step or a bracket alone.
  function intersection(evaluate, initialDepth, initialAngle, reference) {
    let logC = Math.log(initialDepth), angle = initialAngle;
    const step = 2e-5;
    for (let i=0;i<48;i++) {
      const a = evaluate(logC,angle);
      if (Math.abs(a.pResidual) <= axialTolerance/10 && Math.abs(a.cross) <= momentTolerance/10) return a;
      const b = evaluate(logC+step,angle), d = evaluate(logC,angle+step);
      const dp = (b.pResidual-a.pResidual)/step, dq = (d.pResidual-a.pResidual)/step;
      const mp = (b.cross-a.cross)/step, mq = (d.cross-a.cross)/step;
      const det = dp*mq - dq*mp;
      if (!Number.isFinite(det) || Math.abs(det)<1e-12) return null;
      const dl = (-a.pResidual*mq + dq*a.cross)/det, da = (mp*a.pResidual - dp*a.cross)/det;
      let factor = 1/Math.max(1,Math.abs(dl),Math.abs(da));
      let improved = false;
      for (let trial=0;trial<14;trial++,factor/=2) {
        const next = logC+factor*dl, nextAngle = angle+factor*da;
        if (next < Math.log(reference*1e-8) || next > Math.log(reference*1e5)) continue;
        const candidate = evaluate(next,nextAngle);
        if (Math.hypot(candidate.pResidual, candidate.cross*100/reference) < Math.hypot(a.pResidual,a.cross*100/reference)) {
          logC=next; angle=nextAngle; improved=true; break;
        }
      }
      if (!improved) return null;
    }
    return null;
  }

  function solveLayout(input, bars, label) {
    checkGeometry(bars,input.widthMm,input.depthMm,label);
    const section = {widthCm:input.widthMm/10,depthCm:input.depthMm/10,
      bars:bars.map(bar=>({xCm:bar.xMm/10,yCm:bar.yMm/10,areaCm2:bar.areaCm2}))};
    const materials = {fcKgfCm2:input.fc,fyKgfCm2:input.fy,esKgfCm2:2040000};
    const design = input.mode==='design';
    const {nominalPoTf,phiPnMaxTf,pureTensionTf} = rc.checkDemand(section,materials,{puTf:0,muxTfM:0,muyTfM:0});
    const pMax = design ? phiPnMaxTf : nominalPoTf, pMin = design ? pureTensionTf : pureTensionTf/.9;
    const limits = {nominalPoTf,phiPnMaxTf,pMinTf:pMin,pMaxTf:pMax};
    const base = {limits,point:null,capacityTfm:null,utilization:null,ok:null};
    if (input.pTf < pMin-axialTolerance || input.pTf > pMax+axialTolerance)
      return {...base,status:'超出軸力範圍',ok:design ? false : null};
    const radius = Math.hypot(input.mxTfm,input.myTfm), beta = radius ? Math.atan2(input.myTfm,input.mxTfm) : 0;
    const ux = Math.cos(beta), uy = Math.sin(beta);
    if (Math.abs(input.pTf-pMin)<=axialTolerance || (!design && Math.abs(input.pTf-pMax)<=axialTolerance)) {
      const tension = Math.abs(input.pTf-pMin)<=axialTolerance;
      const stress = tension ? -input.fy * (design ? .9 : 1) : input.fy-.85*input.fc;
      const mx = bars.reduce((s,b)=>s+stress*b.areaCm2*(input.depthMm/2-b.yMm)/1e6,0);
      const my = bars.reduce((s,b)=>s+stress*b.areaCm2*(input.widthMm/2-b.xMm)/1e6,0);
      const matches = Math.hypot(mx-input.mxTfm,my-input.myTfm)<=momentTolerance;
      return {...base,status:'軸力端點',endpoint:{mxTfm:mx,myTfm:my},ok:design ? matches : null};
    }

    function evaluate(logC,theta) {
      const c = Math.exp(logC);
      // SRC takes right-face compression as positive My; the cover page takes left.
      const str = rc.nominalPoint(c,-theta,section,materials);
      const phi = str.phi, pn = str.nominalPKgf/1000;
      const mnx = str.nominalMxKgfCm/1e5, mny = -str.nominalMyKgfCm/1e5;
      const scale = design ? phi : 1, mx=scale*mnx, my=scale*mny;
      return {cCm:c,normalDeg:Math.atan2(Math.sin(theta),Math.cos(theta))*180/Math.PI,epsT:str.epsT,
        phi,pnTf:pn,mnxTfm:mnx,mnyTfm:mny,phiPnTf:phi*pn,phiMnxTfm:phi*mnx,phiMnyTfm:phi*mny,
        pResidual:scale*pn-input.pTf,cross:-mx*uy+my*ux,radial:mx*ux+my*uy};
    }

    const reference = Math.hypot(section.widthCm,section.depthCm);
    const roots = [];
    function seek(depth, angle) {
      const a = intersection(evaluate,depth,angle,reference);
      if (a && !roots.some(b=>Math.abs(b.radial-a.radial)<momentTolerance*10)) roots.push(a);
    }
    for (const offset of [0,Math.PI,Math.PI/3,-Math.PI/3,2*Math.PI/3,-2*Math.PI/3]) {
      for (const factor of [.16,.45,.88]) {
        seek(reference*factor,beta+offset);
      }
    }
    // When a bar changes sides of the concrete block there can be two nearby
    // equilibria, even with opposite strength decisions for the same demand.
    for (const root of roots.slice()) {
      for (const radialScale of [.96,1.04]) {
        for (const rotation of [-2,2]) seek(root.cCm*radialScale,(root.normalDeg+rotation)*Math.PI/180);
      }
    }
    const positive = roots.filter(a=>a.radial>momentTolerance).sort((a,b)=>a.radial-b.radial);
    const negative = roots.some(a=>a.radial < -momentTolerance);
    if (!positive.length || !negative) return {...base,status:'待核：未取得夾住零彎矩的雙側平衡解',intersections:roots};
    if (positive.length>1) return {...base,status:'待核：同方向有多個平衡交點',intersections:roots};
    const point = positive[0];
    const rad = point.normalDeg*Math.PI/180, nx = Math.sin(rad), ny = Math.cos(rad);
    const depthAt = b => (nx*(input.widthMm/2-b.xMm)+ny*(input.depthMm/2-b.yMm))/10;
    const min = bars.reduce((least,bar)=>Math.min(least,depthAt(bar)),Infinity);
    point.tensionBarIds = bars.filter(b=>Math.abs(depthAt(b)-min)<1e-7).map(b=>b.id);
    // At the tied-column cap the uncapped surface supplies a verified limiting
    // equilibrium point. Compression-cap clipping elsewhere can enlarge the slice.
    const atCap = design && Math.abs(input.pTf-pMax)<=axialTolerance;
    const within = radius <= point.radial+momentTolerance;
    return {...base,status:!radius ? '純軸力' : atCap ? '軸壓上限截面' : '已求解',
      point,capacityTfm:radius ? point.radial : null,utilization:radius && design ? radius/point.radial : null,
      ok:design && (within || !atCap) ? within : null};
  }

  function calculate(raw) {
    const input = {mode:raw.mode};
    if (!['design','nominal'].includes(input.mode)) throw Error('請指定設計軸力或名義軸力。');
    for (const [key,label] of Object.entries({widthMm:'柱寬',depthMm:'柱深',fc:'fc′',fy:'fy',pTf:'軸力',mxTfm:'Mx',myTfm:'My'}))
      input[key]=numeric(raw[key],label);
    if (input.widthMm<200 || input.widthMm>3000 || input.depthMm<200 || input.depthMm>3000) throw Error('矩形柱寬深須介於 200～3000 mm。');
    if (input.fc<175 || input.fc>700 || input.fy<2000 || input.fy>5600) throw Error('材料範圍為 fc′ 175～700、fy 2000～5600 kgf/cm²。');
    for (const key of ['caseId','materialBasis','demandBasis']) {
      input[key]=text(raw[key]);
      if (!input[key]) throw Error('請填構件識別、尺寸與材料依據及同一組合內力來源。');
    }
    const designBars=readBars(raw.designBars,'設計'), observedBars=readBars(raw.observedBars,'現況');
    input.layoutBasis=text(raw.layoutBasis);
    const before = new Map(designBars.map(b=>[b.id,b])), after = new Map(observedBars.map(b=>[b.id,b]));
    const positions = [...new Set([...before.keys(),...after.keys()])].map(id=>{
      const a=before.get(id),b=after.get(id);
      return {id,design:a||null,observed:b||null,dxMm:a&&b ? b.xMm-a.xMm:null,dyMm:a&&b ? b.yMm-a.yMm:null};
    });
    const unmatched=positions.filter(p=>!p.design || !p.observed).map(p=>p.id);
    if(unmatched.length && !input.layoutBasis)
      throw Error('兩清冊筋號未對應（'+unmatched.join('、')+'）。請補齊逐筋資料，或填寫已確認增減與對應依據。');
    const design=solveLayout(input,designBars,'設計'), observed=solveLayout(input,observedBars,'現況');
    return {version,sectionEngine:rc.VERSION,input,design,observed,positions,constructionTolerance:'待依契約、量測誤差與施工紀錄另核',
      retention:design.capacityTfm>0 && observed.capacityTfm>0 ? observed.capacityTfm/design.capacityTfm:null};
  }
  return Object.freeze({version,header,readBars,calculate});
});
