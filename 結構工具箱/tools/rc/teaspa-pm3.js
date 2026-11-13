/* TEASPA V4.0, one rectangular vertical column, global X / local M3.
   Source P is compression-positive. Target tables use kgf, cm and rad. */
(function (root, build) {
  const api = build();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TeaspaPM3 = api;
})(globalThis, function () {
  'use strict';
  const property = 'TEASPA-X-PM3', frame = 'C1';
  const labels = ['-E','-D','-C','-B','A','B','C','D','E'];
  const requireThat = (ok, msg) => { if (!ok) throw new Error(msg); };
  function validate(s) {
    requireThat(s && s.schema === 'teaspa-pm3-source/1', '來源格式或版本不符。');
    for (const key of ['member','source','sectionBasis']) {
      requireThat(typeof s[key] === 'string' && s[key].trim(), '缺少構件或來源說明：' + key);
    }
    for (const key of ['widthCm','depthCm','clearCm','yieldMKgfCm']) {
      requireThat(Number.isFinite(s[key]) && s[key] > 0, '須填正值：' + key);
    }
    requireThat(Number.isFinite(s.gravityPKgf) && Number.isFinite(s.curvePKgf), '缺少軸力。');
    requireThat(Array.isArray(s.pm) && s.pm.length >= 3 && s.pm.every(p =>
      Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[1] >= 0), 'P–M 點須為兩個有效數字，M 為非負正側彎矩。');
    requireThat(s.pm.every(([p], i) => !i || p < s.pm[i-1][0]), '請按壓力由大至小排列 P–M 點，勿重複軸力。');
    requireThat(s.pm[0][0] > 0 && s.pm.at(-1)[0] < 0 && s.pm[0][1] === 0 && s.pm.at(-1)[1] === 0, 'P–M 須含純壓及純拉端點。');
    requireThat(s.pm.some(([p,m]) => p === s.curvePKgf && m === s.yieldMKgfCm), '背骨採用的 P、Mn 須對應同一個互制點。');
    requireThat(Array.isArray(s.backbone) && s.backbone.length === labels.length &&
      s.backbone.every((row,i) => Array.isArray(row) && row.length === 3 && row[0] === labels[i] && row.slice(1).every(Number.isFinite)), '請保留 -E 至 E 的九個有號點及原點序。');
    const pos = s.backbone.slice(4);
    requireThat(pos[0][1] === 0 && pos[0][2] === 0 && pos[1][1] === 1 && pos[1][2] === 0 &&
      pos.every(([,m,r], i) => m >= 0 && r >= 0 && (i < 2 || r > pos[i-1][2])), 'A 須為原點，B 為降伏點且塑性轉角為零；C 至 E 轉角須遞增。');
    requireThat(pos.slice(1).every(([,m,r],i) => s.backbone[3-i][1] === -m && s.backbone[3-i][2] === -r), '此交換只支援正負彎矩對稱的背骨。');
    return s;
  }
  function tables(s) {
    validate(s);
    const common = { FDType:'Moment-Rotation',IsMRSym:'Yes',AddBC:'No',AddCD:'No',NumForces:1,NumAngles:1,
      MRForce:-s.curvePKgf,MRAngle:0,BeyondE:'Drops to Zero',SFType:'User',UserSFRot:1,IntSurfType:'User',
      AxLoadDisp:'EPP',IsSymmetric:'Yes',NumPoints:s.pm.length,PSF:1,M3SF:1,
      POvSFFirst:-s.pm[0][0],M3OvSFFirst:0,POvSFLast:-s.pm.at(-1)[0],M3OvSFLast:0 };
    const positive = s.backbone.slice(4);
    const hinges = Array.from({length:Math.max(s.pm.length,positive.length)}, (_,i) => {
      const row = {Name:property};
      if (!i) Object.assign(row, common);
      if (positive[i]) {
        const [label,m,r] = positive[i];
        Object.assign(row,{MRCurveNum:1,MRPoint:label,Moment:m,Rotation:r});
      }
      if (s.pm[i]) Object.assign(row,{Curve:1,Point:i+1,POverSF:-s.pm[i][0],M3OverSF:s.pm[i][1]});
      return row;
    });
    const ends = [0,1].map(d => ({UniqueName:frame,AssignHinge:property,SaveFibResp:'No',DistType:'RelDist',RelDist:d,LenOWType:'None'}));
    return {hinges,ends};
  }
  function tsv(rows) {
    const keys = [...new Set(rows.flatMap(Object.keys))];
    return [keys.join('\t'), ...rows.map(row => keys.map(k => row[k] ?? '').join('\t'))].join('\r\n') + '\r\n';
  }
  function compare(s, read) {
    const {hinges,ends} = tables(s), differences = [];
    requireThat(read && read.schema === 'etabs-pm3-reopened/1' && Array.isArray(read.hinges) && Array.isArray(read.ends) && read.model, '請讀取存檔重開後產生的讀回 JSON。');
    const model = read.model;
    function check(field, expected, actual) {
      let matches = actual === expected;
      if (typeof expected === 'number') {
        const valid = typeof actual === 'number' || (typeof actual === 'string' && actual.trim() !== '');
        matches = valid && Number.isFinite(+actual) && Math.abs(+actual-expected) <= 1e-9 * Math.max(1,Math.abs(expected));
      }
      if (!matches) differences.push({field,expected,actual:actual ?? null});
    }
    for (const key of ['member','source','sectionBasis','gravityPKgf','curvePKgf','yieldMKgfCm','schema']) {
      check('匯入來源 ' + key,s[key],read.source?.[key]);
    }
    check('ETABS 版本','22.3.0.3775',model.version);
    check('顯示單位','kgf_cm_C',model.units);
    check('構件識別',frame,model.frame);
    check('鉸定義表版',1,model.propertyTableVersion);
    check('柱端指派表版',2,model.assignmentTableVersion);
    check('獨立 API 指派數',2,model.hingeCount);
    for (const [i,v] of [0,1,0,0,0,1,1,0,0].entries()) check('方向餘弦 '+(i+1),v,model.axes?.[i]);
    for (const [i,v] of [0,1].entries()) check('API 柱端相對位置 '+(i+1),v,model.hingeRD?.[i]);
    for (const [key,value] of Object.entries({widthCm:s.widthCm,depthCm:s.depthCm,clearCm:s.clearCm})) check(key,value,model[key]);
    check('I33 (cm⁴)',s.depthCm*s.widthCm**3/12,model.i33Cm4);
    check('I22 (cm⁴)',s.widthCm*s.depthCm**3/12,model.i22Cm4);
    check('鉸定義總列數',hinges.length,read.hinges.length);
    check('柱端總列數',ends.length,read.ends.length);
    // Tables combine independent sub-lists in the same physical rows.
    const root = read.hinges.find(row => String(row.FDType || '').trim()) || {};
    for (const [key,value] of Object.entries(hinges[0])) {
      if (!['MRCurveNum','MRPoint','Moment','Rotation','Point','Curve','POverSF','M3OverSF'].includes(key)) check(key,value,root[key]);
    }
    for (const row of read.hinges) check('鉸定義名',property,row.Name);
    const pmRows = read.hinges.filter(row => row.Point);
    check('互制點數',s.pm.length,pmRows.length);
    const interaction = s.pm.map(([p,m],i) => {
      const row = pmRows.find(x => Number(x.Point) === i+1) || {};
      check('互制曲線 '+(i+1),1,row.Curve);
      check('P '+(i+1)+' (kgf)',-p,row.POverSF);
      check('M3 '+(i+1)+' (kgf·cm)',m,row.M3OverSF);
      return {point:i+1,sourcePKgf:p,targetPKgf:row.POverSF,sourceMKgfCm:m,targetMKgfCm:row.M3OverSF};
    });
    const mr = read.hinges.filter(row => row.MRPoint);
    check('直接讀回背骨點數',5,mr.length);
    const signed = s.backbone.map(([label,m,r]) => {
      const neg = label.startsWith('-'), point = neg ? label.slice(1) : label;
      const row = mr.find(x => x.MRPoint === point) || {};
      check(label+' 曲線',1,row.MRCurveNum);
      check(label+' 力 (kgf)',-s.curvePKgf,row.CurveForce);
      check(label+' 角度 (°)',0,row.CurveAngle);
      check(label+' M/My',neg ? -m : m,row.Moment);
      check(label+' 塑性轉角 (rad)',neg ? -r : r,row.Rotation);
      const convert = key => row[key] == null || row[key] === '' || !Number.isFinite(+row[key]) ? null : (neg ? -1 : 1)*Number(row[key]);
      return {label,momentRatio:convert('Moment'),rotationRad:convert('Rotation'),origin:neg?'依讀回對稱設定展開':'目標表直接讀回'};
    });
    for (const end of ends) {
      const row = read.ends.find(x => x.RelDist !== '' && x.RelDist != null && Number(x.RelDist) === end.RelDist) || {};
      for (const [key,value] of Object.entries(end)) check('柱端 '+end.RelDist+' '+key,value,row[key]);
      check('柱端實際相對位置',end.RelDist,row.ActualRD);
      check('柱端實距 (cm)',end.RelDist*s.clearCm,row.ActualDist);
    }
    return {matched:differences.length===0,differences,interaction,signed,ends:read.ends,
      criteria:{IO:root.IO,LS:root.LS,CP:root.CP,source:'目標程式自填，無來源採用依據'},pushoverRun:false};
  }
  return {validate,tables,tsv,compare};
});
