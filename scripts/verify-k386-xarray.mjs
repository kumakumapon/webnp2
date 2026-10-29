// Real V86 application (XARRAY.EXE) over the managed XMS API and the actual PC-98 XMS driver.
// Cost is taken from the monitor's per-session CPU tick record (307200 Hz ARTIC), because
// guests cannot read the clock.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
import {inspectXms} from './k386-xms.mjs';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/k386-xarray']=process.argv.slice(2);
const ARTIC_HZ=307200;
const manifest=JSON.parse(await readFile(new URL('../public/k386/manifest.json',import.meta.url)));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const page=await browser.newPage(),results=[],snapshots=[],measurements=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const pause=ms=>page.waitForTimeout(ms);
const text=()=>page.evaluate(()=>window.np2debug.np2.getScreenText().text);
const wait=s=>page.waitForFunction(s=>{try{return window.np2debug.np2.getScreenText().text.includes(s);}catch{return false;}},s,{timeout:90000});
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await pause(200);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await pause(200);};
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
const hash=b=>createHash('sha256').update(b).digest('hex');
// The XMS record is published by the monitor at the first allocation, so it may still be absent at start-up.
const until=async(predicate,label,{xmsOptional=false,timeout=300000}={})=>{
 let record;const deadline=Date.now()+timeout;
 for(let i=0;Date.now()<deadline;i++){
  const cpu=await inspectK386(page),resources=await inspectResources(page),xms=await inspectXms(page);record={cpu,resources,xms};
  if(cpu&&cpu.views.some(v=>v.screen.includes('XARRAY FAIL')||v.screen.includes('XMS FAIL')))throw new Error(JSON.stringify(record));
  if(cpu&&resources&&(xms||xmsOptional)&&predicate(record))return record;
  if(i&&i%100===0)console.log('WAIT '+label+': '+JSON.stringify({states:cpu?.views.map(v=>v.state),pending:xms?.pending}));await pause(150);
 }throw new Error(label+': '+JSON.stringify(record));
};
// While a program is busy the monitor's records are often mid-update; reading one record alone
// succeeds far more often than needing CPU, resource and XMS snapshots to be coherent together.
const untilXms=async(predicate,label)=>{
 let xms;const deadline=Date.now()+300000;
 while(Date.now()<deadline){xms=await inspectXms(page);if(xms&&predicate(xms))return xms;await pause(100);}
 throw new Error(label+': '+JSON.stringify(xms));
};
const run=async(id,path)=>{await key(id?'CTRL+O':'CTRL+N');await key('CTRL+L');await type(path+'\r');};
const pass=s=>{results.push(s);console.log('PASS '+s);};
const stat=(screen,name)=>{
 const m=new RegExp('XARRAY OK '+name+' hits=(\\d+) misses=(\\d+) writebacks=(\\d+)').exec(screen);
 return m&&{hits:+m[1],misses:+m[2],writebacks:+m[3]};
};
const scenarios=[
 {key:'1',name:'fill 2 MiB',done:'fill 2 MiB',expect:{hits:0,misses:1536,writebacks:512}},
 {key:'2',name:'sequential 1 MiB',done:'sequential 1 MiB',expect:{hits:256,misses:256,writebacks:0}},
 {key:'3',name:'sort',done:'sort target'},
 {key:'4',name:'search',done:'search',expect:{hits:65,misses:16,writebacks:2}},
 {key:'5',name:'range',done:'range',expect:{hits:0,misses:1,writebacks:0}},
];
try{
 await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=16&clk=8&worklet=0`,base).href);
 await wait('Ready');assert.equal(hash(await disk()),manifest.sha256);
 await run(0,'XARRAY.EXE');
 let r=await until(r=>r.cpu.views[0].screen.includes('XARRAY READY'),'XARRAY ready',{xmsOptional:true});
 snapshots.push({stage:'ready',...r});
 pass('real EXE starts from the enhanced image and finds the XMS service; no scenario has run yet');
 // Each scenario checks its own data in the guest; here the statistics and the XMS lifecycle are checked from outside.
 for(const s of scenarios){
  const before=r.resources.usage[0].cpuTicks;
  await type(s.key);
  r=await until(r=>stat(r.cpu.views[0].screen,s.done),'scenario '+s.name);
  const screen=r.cpu.views[0].screen,got=stat(screen,s.done),ticks=r.resources.usage[0].cpuTicks-before;
  if(s.expect)assert.deepEqual(got,s.expect,s.name);
  else{ // sort: counts depend on the data, but nearly every access must be a hit
   const source=stat(screen,'sort source');assert.ok(source&&got.misses>0&&got.writebacks>0&&got.hits>100*got.misses,JSON.stringify({source,got}));
  }
  assert.ok(ticks>0);
  r=await until(r=>r.xms.sessions[0].length===0,'blocks released after '+s.name);
  // Upper bounds: the ticks also include the guest's own computation.
  const transfers=got.misses+got.writebacks,accesses=got.hits+got.misses;
  measurements.push({scenario:s.name,...got,cpuTicks:ticks,seconds:+(ticks/ARTIC_HZ).toFixed(3),ticksPerTransfer:+(ticks/transfers).toFixed(1),ticksPerCacheAccess:+(ticks/accesses).toFixed(1)});
  console.log('MEASURE '+JSON.stringify(measurements.at(-1)));
  snapshots.push({stage:'scenario-'+s.name,...r});
 }
 pass('fill, sequential, sort, boundary search and range scenarios pass in the guest; cache statistics match, and each scenario releases its XMS blocks');
 // Ending an application in the middle of a scenario must reclaim its blocks.
 await type('3');
 const held=await untilXms(x=>x.sessions[0].length===2&&x.sessions[0].every(b=>b.bytes===16384&&b.initialized===16384),'sort holds two 16 KiB blocks');
 assert.notEqual(held.sessions[0][0].token,held.sessions[0][1].token);
 snapshots.push({stage:'sort-blocks',xms:held});
 await key('CTRL+E');
 r=await until(r=>r.cpu.views[0].state===0&&r.xms.sessions[0].length===0,'End reclaims blocks');
 pass('End during a running scenario ends the session and reclaims both XMS blocks');
 // Two independent sessions page different arrays at the same time.
 await run(0,'XARRAY.EXE');await run(1,'XARRAY.EXE');
 r=await until(r=>r.cpu.views.every(v=>v.state===2&&v.screen.includes('XARRAY READY')),'both sessions ready');
 assert.notEqual(r.cpu.views[0].cr3,r.cpu.views[1].cr3);
 // Scenario 1 (the 2 MiB fill) is left out here: it is verified above and would double this step.
 await key('CTRL+N');await type('2345');await key('CTRL+O');await type('2345');
 r=await until(r=>r.cpu.views.every(v=>v.screen.includes('XARRAY OK range')),'both sessions pass scenarios 2 to 5',{timeout:600000});
 for(const v of r.cpu.views)assert.ok(!v.screen.includes('XARRAY FAIL'));
 r=await until(r=>r.xms.sessions.every(b=>b.length===0),'both sessions released');
 snapshots.push({stage:'concurrent',...r});
 await page.screenshot({path:join(output,'xarray-concurrent.png')});
 pass('two V86 sessions run scenarios 2 to 5 concurrently and finish with no XMS block left');
 await key('CTRL+N');await type('q');await key('CTRL+O');await type('q');
 r=await until(r=>r.cpu.views.every(v=>v.state===0),'both exit');
 await key('F4');await type('XARRAY CHECKED');await wait('XARRAY CHECKED');
 await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');
 assert.equal(hash(await disk()),manifest.sha256);assert.deepEqual(errors,[]);
 pass('clean desktop exit preserves every byte of the FAT12 disk');
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,image:manifest.image,sha256:manifest.sha256,results,measurements,snapshots},null,2)+'\n');
}catch(e){console.error(await text().catch(()=>''));await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;}
finally{await browser.close();}
