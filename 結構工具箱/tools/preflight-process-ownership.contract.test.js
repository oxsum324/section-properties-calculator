'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const helperPath='結構工具箱/tools/preflight-process-ownership.ps1';
const fixturePath='結構工具箱/tools/preflight-process-ownership.fixture.ps1';
const preflight=read('preflight-tools.ps1'),audit=read('audit-all.ps1'),helper=read(helperPath);
function assertOwnershipMechanism(source){
  for(const token of ['JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE','limits.Basic.Flags = 0x00002000','AssignProcessToJobObject','IsProcessInJob','TerminateJobObject(handle,1)','SafeHandleZeroOrMinusOneIsInvalid','Get-OwnedProcessGateBootstrap','OpenExisting($ownershipGateName)','WaitOne(30000)','$job.Assign($process)','[void]$gate.Set()','not-in-owned-job'])assert.ok(source.includes(token),'Ownership mechanism missing: '+token);
  assert.ok(source.indexOf('$job.Assign($process)')<source.indexOf('[void]$gate.Set()'),'Assign must precede gate release');
  assert.ok(!/Stop-Process|taskkill\s+\/IM/i.test(source),'Helper must not kill through name-based commands');
  assert.ok(!/CommandLine|\.MainModule|ExecutablePath/.test(source),'Helper never reads command lines or executable paths');
  const writer=source.slice(source.indexOf('function Write-OwnedProcessRecord'),source.indexOf('function Get-OwnedProcessGateBootstrap'));
  for(const field of ['action=','name=','pid=','startTimeUtc=','checkKey=','reason='])assert.ok(writer.includes(field),'Closed cleanup schema missing '+field);
}
function staticContract(){
  assertOwnershipMechanism(helper);
  for(const [source,name,context]of[[preflight,'Preflight','preflightOwnership'],[audit,'Audit','auditOwnership']]){
    const clear=source.match(new RegExp('function Clear-'+name+'RuntimeProcesses \\{[\\s\\S]*?\\n\\}'));
    assert.ok(clear,'Cleanup entry point remains present');
    assert.ok(clear[0].includes('Clear-OwnedProcessJobs -Context $script:'+context),'Cleanup must delegate to its own context');
    assert.ok(!/Get-Process|Stop-Process|\$Since|AddHours/.test(clear[0]),'Cleanup must not recover broad name/time semantics');
    assert.ok(source.includes('(Get-OwnedProcessGateBootstrap),'),'Actual generated check script must block at the gate');
    assert.ok(source.includes('Start-OwnedProcess -Context $script:'+context),'Actual check launcher must register a job');
    assert.ok(source.includes('Complete-OwnedProcessCheck -Context $script:'+context),'Check finally must close only its own job');
    assert.ok(source.includes('taskkill.exe /PID $process.Id /T /F | Out-Null'),'Original PID-tree timeout command remains exact');
    assert.ok(!/Clear-(?:Preflight|Audit)RuntimeProcesses -Since/.test(source),'Old startup and retry selectors are removed');
  }
  const checks=preflight.match(/^\$checks = @\(\r?\n  \[pscustomobject\]@\{[\s\S]*?^\)/m);
  assert.ok(checks);assert.equal(hash(checks[0].replace(/\r\n/g,'\n')),'1b00ef12ac0ad72963bf19efeb7cfed148b58d945c43eebe853e051d1119915f','Original 70 check declarations stay byte-for-byte identical');
  assert.equal([...checks[0].matchAll(/key = "[^"]+"/g)].length,70);
  const jobs=audit.match(/^  \$jobs = @\([\s\S]*?^  \)/m);assert.ok(jobs);
  assert.equal(hash(jobs[0]),'dbedb52726fff15cc9e3ed96eeb3a5014f68374fa97d7a9edb14f570b46267e6','Original platform item/order/budgets stay byte-for-byte identical');
  assert.deepEqual([...jobs[0].matchAll(/timeoutSeconds = (\d+)/g)].map(m=>Number(m[1])),[540,1200,240]);
  const post=preflight.split(/\r?\n/).filter(line=>/Invoke-PreflightCheck -Key "audit-dashboard-(?:contract|browser-smoke|live-output-smoke)-final"/.test(line));
  assert.equal(post.length,3);assert.equal(hash(post.join('\n')),'d863670787a1f2c5913e75eef959c830ac3452f068f50205a77d2cb31053bcb8','All three original post-check invocation literals stay identical');
  for(const bad of [helper.replace('limits.Basic.Flags = 0x00002000','limits.Basic.Flags = 0'),helper.replace('TerminateJobObject(handle,1)','CloseEverything()'),helper.replace('$job.Assign($process)','$job.AssignNothing()'),helper.replaceAll('IsProcessInJob','TrustPidOnly')])assert.throws(()=>assertOwnershipMechanism(bad),'A weakened mechanism must fail before real processes are created');
}
function main(){
  staticContract();
  if(process.platform!=='win32')throw new Error('Real Windows ownership fixture is required; this test cannot silently skip.');
  const relative=path.join('output','preflight','process-ownership-fixtures',new Date().toISOString().replace(/[-:.TZ]/g,'')+'-'+process.pid);
  const destination=path.join(root,relative);fs.mkdirSync(destination,{recursive:true});
  const native=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result=cp.spawnSync(native,['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,fixturePath),'-WorkspaceRoot',root,'-FixtureRoot',destination],{cwd:root,env:process.env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,timeout:180000});
  fs.writeFileSync(path.join(destination,'stdout.log'),result.stdout||'');fs.writeFileSync(path.join(destination,'stderr.log'),result.stderr||'');
  fs.writeFileSync(path.join(destination,'process-result.json'),JSON.stringify({exitCode:result.status,signal:result.signal,error:result.error?.code||null},null,2));
  const summaryFile=path.join(destination,'summary.json');
  assert.ok(fs.existsSync(summaryFile),'Fixture must retain cleanup evidence even on assertion failure');
  const summary=JSON.parse(fs.readFileSync(summaryFile,'utf8'));
  assert.equal(result.error,undefined,result.error?.message);assert.equal(result.status,0,summary.failure||'PowerShell fixture failed');
  assert.equal(summary.pass,true,summary.failure);assert.match(summary.powerShellVersion,/^5\.1\./);assert.equal(summary.scenarios.length,12);assert.ok(summary.scenarios.every(s=>s.pass));assert.deepEqual(summary.remaining,[]);assert.equal(summary.fullFormalPreflightRun,false);
  for(const scenario of summary.scenarios.filter(s=>/-(?:eperm|timeout)$/.test(s.name))){assert.equal(scenario.ownedBefore.length,2);assert.deepEqual(scenario.ownedBefore.map(p=>p.Name).sort(),['msedge','node']);assert.ok(scenario.ownedBefore.every(p=>p.StartTimeUtc));assert.ok(scenario.ownedAfter.every(p=>p.alive===false));assert.equal(scenario.decoysAlive,true);}
  for(const file of fs.readdirSync(destination).filter(f=>f.endsWith('.jsonl'))){for(const line of fs.readFileSync(path.join(destination,file),'utf8').trim().split(/\r?\n/).filter(Boolean)){const row=JSON.parse(line);assert.deepEqual(Object.keys(row).sort(),['action','checkKey','name','pid','reason','startTimeUtc']);assert.ok(!JSON.stringify(row).includes(root));}}
  for(const kind of ['preflight','audit']){const rows=fs.readFileSync(path.join(destination,kind+'.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);assert.ok(rows.some(r=>r.action==='skipped'&&r.name==='node'));assert.ok(rows.some(r=>r.action==='skipped'&&r.name==='msedge'));assert.ok(rows.some(r=>r.action==='stopped'&&r.name==='node'));assert.ok(rows.some(r=>r.action==='stopped'&&r.name==='msedge'));}
  const gateRows=fs.readFileSync(path.join(destination,'gate.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.ok(gateRows.some(row=>row.checkKey==='assign-denied'&&row.action==='stopped'&&row.reason==='launch-not-completed'),'Assignment failure retains its own child cleanup record');
  for(const name of ['log-failure-closes-owned-job','snapshot-failure-closes-owned-job']){const scenario=summary.scenarios.find(s=>s.name===name);assert.ok(scenario?.failurePropagated);assert.ok(scenario.ownedAfter.every(p=>p.alive===false));assert.equal(scenario.decoysAlive,true);}
  console.log('Owned process contract passed: 12 scenarios, unrelated decoys survived, all fixture processes exited.');
  console.log('Receipt: '+relative.replace(/\\/g,'/')+'/summary.json');
}
if(require.main===module){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={staticContract,assertOwnershipMechanism};
