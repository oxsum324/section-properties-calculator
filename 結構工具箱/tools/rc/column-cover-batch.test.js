'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const batch = require('./column-cover-batch.js');
const cases = require('./column-cover-deviation-golden-cases.js');
const sample = fs.readFileSync(path.join(__dirname, '../../tests/column-cover-batch-sample.tsv'), 'utf8').trimEnd();
const [header, ...data] = sample.split(/\r?\n/).map(s => s.split('\t'));
const join = rows => rows.map(r => r.join('\t')).join('\n');
const run = (records, labels = header) => batch.evaluate(batch.preview(join([labels, ...records]), '\t'));
const change = (row, label, value) => row.map((cell,i) => header[i] === label ? value : cell);
test('dispatch sample matches the five golden control fields and distinguishes missing from engineering failure', () => {
  const rows = run(data);
  assert.deepEqual(batch.summarize(rows).counts, {pass:2,fail:1,missing:1,error:0});
  rows.slice(0,3).forEach(({result},i) => {
    const expected = cases[i].expected;
    assert.equal(result.minimumRetentionRatio,expected.values.minimumRetentionRatio);
    assert.equal(result.maximumMeasuredUtilization,expected.values.maximumMeasuredUtilization);
    assert.equal(result.criticalRetentionDirection,expected.criticalRetentionDirection);
    assert.equal(result.governingDemandDirection,expected.governingDemandDirection);
    assert.equal(result.overallOk,expected.flags.overallOk);
  });
  assert.equal(rows[3].result,null);
  assert.equal(rows[3].issues[0].field,'實測上_mm');
  const fixed = run([...data.slice(0,3),change(data[3],'實測上_mm','80')]);
  assert.deepEqual(batch.summarize(fixed).counts,{pass:3,fail:1,missing:0,error:0});
  assert.equal(batch.summarize(fixed.slice(0,2)).minimumRows.length,2);
});
test('headers, record boundaries and quoting', () => {
  const prepare = rows => batch.preview(join(rows),'\t');
  for (const h of [header.slice(1), [...header,header[0]], change(header,'實測上_mm','實測上_cm')]) assert.throws(() => prepare([h,data[0]]));
  assert.deepEqual(run([data[0].toReversed()],header.toReversed())[0].result,run([data[0]])[0].result);
  const csvLabel = '\uFEFF' + header.join(',');
  const quoted = change(data[0],'材料依據','"材料,紀錄""一""\n第二行"').join(',');
  const p = batch.preview(csvLabel+'\r\n\r\n'+quoted,',');
  assert.equal(p.rows[0].record,3);
  assert.equal(p.rows[0].raw.materialBasis,'材料,紀錄"一"\n第二行');
  for (const bad of ['"未閉合','多"引號','"a"x']) assert.throws(() => batch.preview(csvLabel+'\n'+bad,','));
  const short = run([data[0].slice(0,-2)])[0];
  assert.equal(short.status,'待補');assert.equal(short.issues.length,2);assert.equal(short.result,null);
  assert.equal(run([[...data[0],'']])[0].status,'格式錯誤');
});
test('missing and invalid input never reach the calculation, legitimate zeros survive', () => {
  for (const blank of ['', '　', 'null', 'undefined', null, undefined]) {
    const p = batch.preview(sample,'\t');
    if (blank === undefined) delete p.rows[0].raw.measuredTopMm;
    else p.rows[0].raw.measuredTopMm = blank;
    const row = batch.evaluate(p)[0];
    assert.equal(row.status,'待補');assert.equal(row.result,null);
  }
  for (const [field,value] of [['實測上_mm','0'],['實測上_mm','12 cm'],['最低容量保留比','90%'],['負Mx幅值_tf·m','-22'],['柱號','#N/A'],['材料依據','#VALUE!'],['軸力Pu_tf','Infinity'],['實測基準','unknown'],['柱寬_mm','NaN']]) {
    const row = run([change(data[0],field,value)])[0];
    assert.equal(row.status,'資料錯誤');assert.equal(row.result,null);
    assert.ok(row.issues.some(i => i.field===field && i.raw===value));
  }
  const zeros = [['軸力Pu_tf','0'],['正Mx幅值_tf·m','0'],['左右每側中間支數_不含角筋','0']].reduce((r,[f,v]) => change(r,f,v),data[0]);
  const r = run([zeros])[0].result;assert.ok(r);assert.equal(r.input.puTf,0);assert.equal(r.input.intermediateBarsPerSide,0);
  const failed = run([change(data[0],'正Mx幅值_tf·m','180')])[0].result;
  assert.equal(failed.retentionOk,true);assert.equal(failed.allMeasuredDemandOk,false);
  const outside = run([change(data[0],'軸力Pu_tf','100000')])[0].result;
  assert.equal(outside.allAxialOk,false);assert.equal(outside.maximumMeasuredUtilization,Infinity);
});
test('every duplicate is excluded; revision and demand ID distinguish otherwise identical columns', () => {
  const variants = [data[0],change(data[0],'原始列號','12'),change(data[0],'修次','R1'),change(data[0],'需求識別','組B')];
  const rows=run(variants);
  assert.deepEqual(rows.map(r=>r.status),['識別重複','識別重複','已算／通過','已算／通過']);
  assert.ok(rows[0].issues[0].reason.includes('12'));
  assert.equal(batch.summarize(rows.slice(0,2)).minimumRows.length,0);
});
