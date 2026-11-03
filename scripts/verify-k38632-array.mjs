// Real guest comparison: identical datasets, independent host oracle, and
// owner/context/lifecycle inspection. cpuTicks includes execution AND broker
// service; elapsed includes GUI/input. Neither is browser CPU utilization.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
import {inspectXms} from './k386-xms.mjs';
import {arrayWorkloads,arrayExpected,arrayRecord,legacyArrayResult,patternWord} from './k386-array-workloads.mjs';

const [base='http://127.0.0.1:4173/webnp2/',output='test-results/k38632-array',video='pegc']=process.argv.slice(2);
assert.ok(['pegc','cirrus'].includes(video));
const manifest=await (await fetch(new URL('k386/manifest.json',base))).json();
assert.equal(manifest.enabled,true);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
let page;const results=[],snapshots=[],measurements=[],errors=[];
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await page.waitForTimeout(150);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await page.waitForTimeout(150);};
const wait=s=>page.waitForFunction(s=>{try{return window.np2debug.np2.getScreenText().text.includes(s);}catch{return false;}},s,{timeout:90000});
const hash=b=>createHash('sha256').update(b).digest('hex');
const diskHash=async()=>hash(Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64'));
const pm=(s,id)=>s.cpu.diagnostics[id].pm32;
const record=(s,id)=>arrayRecord(s.cpu,id);
const save=(label,s)=>snapshots.push({label,...s});
const pass=s=>{results.push(s);console.log('PASS '+s);};
async function snapshot(){const cpu=await inspectK386(page),resources=await inspectResources(page);return cpu&&resources?{cpu,resources}:null;}
async function until(test,label,timeout=120000){
 let last;for(let end=Date.now()+timeout,i=0;Date.now()<end;i++){
  last=await snapshot();if(last&&last.cpu.views.some(v=>v.screen.includes('XARRAY FAIL')||v.screen.includes('XARRAY32 FAIL')))throw Error('guest verification failed: '+JSON.stringify(last));
  if(last&&test(last))return last;
  if(i&&i%150===0)console.log('WAIT '+label+': '+JSON.stringify(last?.cpu.views.map((v,id)=>({state:v.state,record:record(last,id)}))));
  await page.waitForTimeout(80);
 }throw Error(label+': '+JSON.stringify(last));
}
async function run(id,command){await key(id?'CTRL+O':'CTRL+N');await key('CTRL+L');await wait('COM/EXE command:');await type(command+'\r');}
async function end(id){await key(id?'CTRL+O':'CTRL+N');await key('CTRL+E');return until(s=>s.cpu.views[id].state===0,'End '+id);}
function ready(s,id){return s.cpu.views[id].kind===1&&s.cpu.views[id].state===2&&record(s,id)?.state===0&&s.cpu.views[id].screen.includes('XARRAY32 READY');}
function clean(s,id){const r=pm(s,id);assert.ok(r);assert.equal(r.error,0);assert.equal(r.handle,0);assert.equal(r.locked,0);assert.equal(r.heapPages,0);assert.equal(r.openFiles,0);assert.equal(r.allocations,r.frees);assert.equal(r.unmapped,1);assert.equal(r.tablesCleared,1);assert.equal(r.freed,1);}
function identity(s,id){return {generation:s.cpu.views[id].generation,cr3:s.cpu.views[id].cr3,physical:s.cpu.views[id].physical};}
function sameOwner(before,after,id){assert.deepEqual(identity(after,id),identity(before,id));}
function progressed(before,after,id){sameOwner(before,after,id);assert.ok(after.resources.usage[id].cpuTicks>before.resources.usage[id].cpuTicks,'peer guest CPU/service ticks must progress');assert.ok(after.resources.usage[id].runs>before.resources.usage[id].runs,'peer dispatches must progress');}
function privatePair(s){assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);assert.notEqual(s.cpu.views[0].physical,s.cpu.views[1].physical);for(let id=0;id<2;id++){const p=pm(s,id);assert.ok(p.pmCR0&1);assert.ok(p.pmCR0>>>31);assert.equal(s.cpu.diagnostics[id].frame.cs,59);assert.equal(s.cpu.diagnostics[id].frame.eflags&0x20000,0);}}
function held(s,id){const r=record(s,id);return s.cpu.views[id].state===2&&r?.scenario===6&&r.state===4&&pm(s,id).heapPages===512;}
function checkHeld(s,id,expectedIdentity){const r=record(s,id);assert.equal(r.identity,expectedIdentity);assert.equal(r.sum,arrayExpected('fill',expectedIdentity).sum);assert.equal(r.work,6291456);assert.equal(r.first,patternWord(0,expectedIdentity));assert.equal(r.last,patternWord(2097152-4,expectedIdentity));assert.equal(r.allocations,1);assert.equal(r.frees,0);}
async function boot(mem){page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=${mem}&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);await wait('Ready');assert.equal(await diskHash(),manifest.sha256);}
async function persist(){await writeFile(output+'/verification.json',JSON.stringify({source:manifest.source_commit,sourceDirty:manifest.source_dirty,image:manifest.sha256,video,ramMiB:16,clock:8,articHz:307200,results,measurements,snapshots,errors},null,2)+'\n');}
try{
 await boot(16);
 // Use the actual guest launcher, not a host app substitute.
 await key('CTRL+K');await wait('Find apps');await type('pm32 array lab');
 await page.waitForFunction(()=>window.np2debug.np2.getScreenText().lines[20]?.includes('1 results -'),null,{timeout:90000});await key('ENTER');
 let s=await until(s=>ready(s,0),'XARRAY32 launcher');save('PM32 startup',s);assert.equal(record(s,0).identity,1);
 await run(1,'COUNT32.EXE 1');s=await until(s=>s.cpu.views[1].kind===1&&s.cpu.views[1].counter>0&&pm(s,1)?.samples[2]===0x50333221,'PM32 peer initialized');
 privatePair(s);
 const pmResults=new Map();
 for(const workload of arrayWorkloads){
  await key('CTRL+N');const before=await snapshot(),sequence=record(before,0).sequence,start=performance.now();await type(workload.key);
  s=await until(s=>record(s,0)?.sequence===sequence+1&&record(s,0)?.state===2&&record(s,0)?.scenario===workload.id&&s.cpu.views[0].state===2&&pm(s,0).heapPages===0,'PM32 '+workload.name,600000);
  const r=record(s,0);assert.equal(r.error,0);assert.equal(r.allocations,r.frees);
  const got=Object.fromEntries(['bytes','sum','detail','work'].map(k=>[k,r[k]]));assert.deepEqual(got,arrayExpected(workload.name));pmResults.set(workload.name,got);
  progressed(before,s,1);assert.ok(s.cpu.views[1].counter>before.cpu.views[1].counter);
  const measurement={backend:'PM32',scenario:workload.name,elapsedMs:Math.round(performance.now()-start),cpuTicks:s.resources.usage[0].cpuTicks-before.resources.usage[0].cpuTicks,runs:s.resources.usage[0].runs-before.resources.usage[0].runs,syscalls:pm(s,0).syscalls-pm(before,0).syscalls,dispatches:pm(s,0).dispatches-pm(before,0).dispatches,result:got};measurements.push(measurement);console.log('MEASURE '+JSON.stringify(measurement));save('PM32 '+workload.name,s);await persist();
 }
 await type('q');s=await until(s=>s.cpu.views[0].state===0,'PM32 normal quit');clean(s,0);await end(1);clean(await snapshot(),1);
 pass('all five PM32 pointer workloads match the independent oracle while a separate PM32 CPU context progresses; normal exit frees the backing handle and tables');
 // Same data and operations through the legacy paged-XMS API. Canonical
 // results precede statistics; wait for the prompt and actual block release.
 await run(0,'XARRAY.EXE');await until(s=>s.cpu.views[0].kind===0&&s.cpu.views[0].state===2&&s.cpu.views[0].screen.includes('XARRAY READY'),'legacy startup');
 await run(1,'COUNT32.EXE 1');await until(s=>s.cpu.views[1].counter>0&&pm(s,1)?.samples[2]===0x50333221,'mixed peer ready');await key('CTRL+N');
 for(const workload of arrayWorkloads){
  const before=await snapshot(),start=performance.now();await type(workload.key);
  s=await until(s=>s.cpu.views[0].state===2&&legacyArrayResult(s.cpu.views[0].screen,workload.name),'V86 '+workload.name,600000);
  const xms=await inspectXms(page);assert.ok(xms);assert.equal(xms.sessions[0].length,0);
  const got=legacyArrayResult(s.cpu.views[0].screen,workload.name);assert.deepEqual(got,arrayExpected(workload.name));assert.deepEqual(got,pmResults.get(workload.name));progressed(before,s,1);
  assert.ok(s.cpu.diagnostics[0].frame.eflags&0x20000);assert.equal(s.cpu.diagnostics[1].frame.eflags&0x20000,0);
  const stats=[...s.cpu.views[0].screen.matchAll(/XARRAY OK ([^\r\n]*?) hits=(\d+) misses=(\d+) writebacks=(\d+)/g)].filter(m=>m[1].startsWith(workload.name==='seq'?'sequential':workload.name)).map(m=>({name:m[1],hits:+m[2],misses:+m[3],writebacks:+m[4]}));
  const measurement={backend:'V86-XMS',scenario:workload.name,elapsedMs:Math.round(performance.now()-start),cpuTicks:s.resources.usage[0].cpuTicks-before.resources.usage[0].cpuTicks,runs:s.resources.usage[0].runs-before.resources.usage[0].runs,cache:stats,transfers:stats.reduce((n,v)=>n+v.misses+v.writebacks,0),result:got};measurements.push(measurement);console.log('MEASURE '+JSON.stringify(measurement));save('V86 '+workload.name,{...s,xms});await persist();
 }
 await type('q');await until(s=>s.cpu.views[0].state===0,'legacy quit');await end(1);
 pass('V86 XARRAY and PM32 XARRAY32 return identical data for all five workloads; actual cache transfers, guest CPU/service, dispatches and elapsed time are recorded separately');
 // Two apps reserve the same virtual addresses and retain distinct 2 MiB
 // patterns. C re-reads EVERY byte after peer activity and lifecycle changes.
 await run(0,'XARRAY32.EXE 1');await until(s=>ready(s,0),'identity one');await type('h');await until(s=>held(s,0),'first held array',300000);
 await run(1,'XARRAY32.EXE 2');await until(s=>ready(s,1),'identity two');await type('h');s=await until(s=>held(s,1)&&held(s,0),'two held arrays',300000);privatePair(s);checkHeld(s,0,1);checkHeld(s,1,2);save('two private 2 MiB patterns',s);
 assert.equal(pm(s,0).heapBase,pm(s,1).heapBase);
 const heapFirst=(pm(s,0).heapBase-0x800000)/4096;assert.ok(Number.isInteger(heapFirst)&&heapFirst>0);
 for(const offset of [0,255,511])for(let id=0;id<2;id++){
  assert.equal(pm(s,id).ptes[heapFirst+offset]&7,7);
  assert.notEqual(pm(s,id).ptes[heapFirst+offset]&0xfffff000,pm(s,1-id).ptes[heapFirst+offset]&0xfffff000);
 }
 await key('CTRL+N');await key('CTRL+P');s=await until(s=>s.cpu.views[0].state===3,'pause held owner');const paused=s;
 await key('CTRL+O');await type('c');s=await until(s=>record(s,1)?.state===2&&s.cpu.views[1].state===2,'peer verifies while other is stopped');progressed(paused,s,1);assert.equal(s.cpu.views[0].state,3);sameOwner(paused,s,0);assert.deepEqual(record(s,0),record(paused,0));assert.equal(s.resources.usage[0].cpuTicks,paused.resources.usage[0].cpuTicks);
 await type('h');await until(s=>held(s,1),'peer refilled',300000);await key('CTRL+N');await key('CTRL+R');await until(s=>held(s,0),'resume original owner');await type('c');s=await until(s=>record(s,0)?.state===2&&s.cpu.views[0].state===2,'full original data verification');sameOwner(paused,s,0);
 await type('h');await until(s=>held(s,0),'End victim filled',300000);s=await end(0);clean(s,0);checkHeld(s,1,2);const endedGeneration=s.cpu.views[0].generation;save('End reclaims selected held owner',s);
 await run(0,'XARRAY32.EXE 1');s=await until(s=>ready(s,0)&&s.cpu.views[0].generation!==endedGeneration,'new generation after End');await type('f');s=await until(s=>s.cpu.views[0].state===4&&pm(s,0)?.reason===14,'fault with 512 heap pages');clean(s,0);assert.equal(pm(s,0).heapPeak,512);assert.equal(pm(s,0).cr2,0x10000);assert.equal(pm(s,0).faultError,5);checkHeld(s,1,2);save('contained fault with peer pattern intact',s);
 await key('CTRL+O');await type('c');s=await until(s=>record(s,1)?.state===2&&s.cpu.views[1].state===2,'peer re-reads full array after End and fault');assert.equal(record(s,1).allocations,1);assert.equal(record(s,1).frees,1);await type('q');s=await until(s=>s.cpu.views[1].state===0,'held peer quits');clean(s,1);await end(0);
 pass('same virtual heap, different page tables and data; stop/resume preserves 2 MiB, End/fault reclaim only the victim, and the peer verifies every retained byte afterwards');
 await key('F4');await type('ARRAY32 CHECKED');await wait('ARRAY32 CHECKED');await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');assert.equal(await diskHash(),manifest.sha256);await page.close();
 await boot(4);await key('CTRL+N');s=await until(s=>s.cpu.views[0].kind===0&&s.resources.usage[0].program==='KSH.EXE','low-memory parent');const old=s;await key('CTRL+L');await type('XARRAY32.EXE\r');await wait('Cannot load program');await key('ESC');await type('ECHO ARRAY OOM SAFE\r');s=await until(s=>s.cpu.views[0].screen.includes('ARRAY OOM SAFE'),'parent after refusal');sameOwner(old,s,0);
 const failure=await page.evaluate(()=>{const n=window.np2debug.np2,b=atob(n.readMemoryBase64(0x10000,0x90000).base64),w=o=>b.charCodeAt(o)|b.charCodeAt(o+1)<<8,d=o=>(w(o)|w(o+2)<<16)>>>0;let at=-1;while((at=b.indexOf('K32HOST1',at+1))>=0)if(w(at+8)===1&&w(at+10)===7584&&w(at+12)===1&&d(at+28)){const r=at+6560;return {error:d(r+16),handle:w(r+40),locked:w(r+42),freeBefore:w(r+48),freeAfter:w(r+50),a20:w(r+142),pmCR0:d(r+84),fileOpen:d(r+604)};}return null;});
 assert.ok(failure);assert.equal(failure.error,8);assert.equal(failure.handle,0);assert.equal(failure.locked,0);assert.equal(failure.a20,0);assert.equal(failure.fileOpen,0);assert.equal(failure.pmCR0,0);assert.equal(failure.freeAfter,failure.freeBefore);save('XARRAY32 low-memory transaction',{...s,failure});assert.equal(await diskHash(),manifest.sha256);
 pass('actual 4 MiB refusal retains the existing V86 shell and both full FAT12 exports remain byte-for-byte unchanged');assert.deepEqual(errors,[]);await persist();
}catch(error){await writeFile(output+'/failure.json',JSON.stringify({error:String(error),screen:await page?.evaluate(()=>window.np2debug.np2.getScreenText().text).catch(()=>null),last:await snapshot().catch(()=>null),results,measurements},null,2)+'\n');await page?.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}
finally{await browser.close();}
