// A released/changed guest comparison. All application progress comes from the
// real CPU/resource producers. Host elapsed time includes launch/input latency;
// cpuTicks is the guest manager's execution/service accounting, not host CPU.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
import {inspectKdeskPerformance} from './kdesk-performance.mjs';
import {readKdeskRenderSnapshot,sameKdeskRenderSnapshot} from './kdesk-render-snapshot.mjs';

const [base='http://127.0.0.1:4173/webnp2/',output='test-results/render-load',phase='changed',video='pegc']=process.argv.slice(2);
assert.ok(['baseline','changed'].includes(phase));
assert.ok(['pegc','cirrus'].includes(video));
const repeats=Number(process.env.K386_RENDER_SAMPLES??3);
const timeout=Number(process.env.K386_RENDER_TIMEOUT??120000);
assert.ok(Number.isInteger(repeats)&&repeats>=1&&repeats<=5);
assert.ok(timeout>=1000&&timeout<=300000);
const manifest=await (await fetch(new URL('k386/manifest.json',base))).json();
assert.equal(manifest.enabled,true);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
let page;const cases=[],errors=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const key=s=>page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);
const type=s=>page.evaluate(s=>window.np2debug.np2.typeText(s),s);
const wait=s=>page.waitForFunction(s=>{try{return window.np2debug.np2.getScreenText().text.includes(s);}catch{return false;}},s,{timeout:90000});
async function snapshot(){const cpu=await inspectK386(page),resources=await inspectResources(page),ui=await inspectKdeskPerformance(page);return cpu&&resources?{cpu,resources,ui}:null;}
async function until(test,label,limit=timeout){
 const begin=performance.now();let last;
 while(performance.now()-begin<limit){last=await snapshot();if(last&&test(last))return {complete:true,elapsedMs:Math.round(performance.now()-begin),last};await page.waitForTimeout(50);}
 return {complete:false,elapsedMs:Math.round(performance.now()-begin),label,last};
}
async function requireState(test,label){console.log('CHECK '+label);const r=await until(test,label);assert.ok(r.complete,label);return r.last;}
const pm=(s,id)=>s.cpu.diagnostics[id].pm32;
const counterReady=s=>s.cpu.views[1].kind===1&&s.cpu.views[1].state===1&&s.cpu.views[1].counter>0&&pm(s,1)?.samples[2]===0x50333221&&s.cpu.views[1].generation===s.resources.usage[1].generation;
async function run(id,command){await key(id?'CTRL+O':'CTRL+N');await key('CTRL+L');await wait('COM/EXE command:');await type(command+'\r');}
async function find(query){
 await key('CTRL+K');await wait('Find apps');await type(query);
 await page.waitForFunction(q=>{const l=window.np2debug.np2.getScreenText().lines;return l[5]?.slice(15,64).trim().replace(/_$/,'')===q&&l[20]?.includes('1 results -');},query,{timeout:90000});
 await key('ENTER');
}
async function diskHash(){return hash(Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64'));}
function progress(before,after){
 assert.ok(counterReady(before)&&counterReady(after));
 const old=before.cpu.views[1],next=after.cpu.views[1];
 assert.equal(next.generation,old.generation);assert.equal(next.cr3,old.cr3);assert.equal(next.physical,old.physical);
 const delta=(next.counter-old.counter)>>>0;assert.ok(delta>0&&delta<0x80000000,'background CPU must progress');return delta;
}
function fileDone(s,old){return s.cpu.views[0].kind===1&&s.cpu.views[0].generation!==old&&s.cpu.views[0].state===0&&s.resources.usage[0].program.endsWith('FILE32.EXE')&&pm(s,0)?.opens===10;}
function fileClean(s){const r=pm(s,0);assert.equal(r.error,0);assert.equal(r.exitCode,0);assert.equal(r.handle,0);assert.equal(r.openFiles,0);assert.equal(r.opens,r.closes);assert.equal(r.allocations,r.frees);assert.equal(r.readBytes,20);assert.equal(r.tablesCleared,1);}
async function protectedSnapshot(rect={},memo){
 for(let end=Date.now()+60000;Date.now()<end;){
  const value=await page.evaluate(readKdeskRenderSnapshot,{width:video==='cirrus'?800:640,height:video==='cirrus'?600:400,...rect});
  if(value&&(!memo||value.text.filter((_,i)=>i%2===0).filter(s=>Buffer.from(s,'base64').toString('utf16le').includes(memo)).length===3)){
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const settled=await page.evaluate(readKdeskRenderSnapshot,{width:video==='cirrus'?800:640,height:video==='cirrus'?600:400,...rect});
   if(sameKdeskRenderSnapshot(value,settled))return settled;
  }
  await page.waitForTimeout(25);
 }throw Error('coherent KDESK snapshot not published');
}
function unchanged(actual,expected,label){
 assert.deepEqual(actual.pixels,expected.pixels,label+' pixels');
 assert.deepEqual(actual.text,expected.text,label+' characters and attributes');
}
async function occlusionCheck(row){
 await key('CTRL+O');await key('CTRL+P');await requireState(s=>s.cpu.views[1].state===3,'pause for pixel check');
 await key('F4');const text='OCCLUSION 012345678901234567890123456789\r';await type(text.repeat(3));await page.waitForFunction(s=>window.np2debug.np2.getScreenText().lines.filter(l=>l.includes(s)).length===3,text.slice(0,-1),{timeout:90000});
 await page.waitForFunction(({width,height})=>{const c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d');g.drawImage(document.querySelector('#canvas'),0,0,width,height);const p=g.getImageData(138,74,1,1).data;return p[0]<80&&p[1]>70&&p[1]<160&&p[2]>120;},{width:video==='cirrus'?800:640,height:video==='cirrus'?600:400},{timeout:60000});
 await requireState(s=>!!s.ui,'native GUI performance producer');
 const before=await protectedSnapshot({},text.slice(0,-1));
 await requireState(s=>s.ui&&s.ui.clockPreserves>=before.metrics.clockPreserves+2,'two clock updates behind Memo');
 const after=await protectedSnapshot();unchanged(after,before,'clock must preserve the occluder');
 assert.equal(after.metrics.fullScenes,before.metrics.fullScenes,'clock ticks must not recompose the whole scene');
 row.occlusion={before:before.metrics,after:after.metrics,text:before.text};await page.screenshot({path:output+'/occlusion.png'});
 // Move by non-cell offsets, then keep a printing DOS task below the memo.
 // This exercises partial glyph/shadow coverage and the composition page used
 // by the next drag/restore, rather than only a static fully covered window.
 await page.evaluate(()=>window.np2debug.np2.mouseHome());await page.waitForTimeout(300);
 await page.evaluate(()=>window.np2debug.np2.mouseDrag({x:112,y:72},{x:125,y:81}));
 await page.waitForFunction(()=>window.np2debug.np2.getScreenText().lines[5]?.slice(14,25).includes('Memo'),null,{timeout:60000});
 await page.evaluate(()=>window.np2debug.np2.mouseMoveTo(630,365));
 const rect={left:12,top:5,columns:48,rows:16};
 // Establish the expected Memo while the printing task is still stopped.
 // Resuming a peer must never redefine the expected foreground text.
 const movedBase=await protectedSnapshot(rect,text.slice(0,-1));
 await requireState(s=>s.cpu.views[1].state===3,'reference captured with printing peer paused');
 await key('CTRL+O');await key('CTRL+R');await key('F4');
 const moved=await requireState(s=>!!s.ui&&counterReady(s),'moved occluder and printing peer');
 const resumed=await protectedSnapshot(rect,text.slice(0,-1));unchanged(resumed,movedBase,'resuming a background peer must preserve Memo');
 let last=resumed,covered=null,accepted=0;
 console.log('CHECK repeated idle snapshots during guarded DOS updates');
 for(let end=Date.now()+timeout;Date.now()<end;){
  last=await protectedSnapshot(rect);
  unchanged(last,movedBase,'covered DOS glyphs must preserve the odd-pixel occluder');
  assert.equal(last.metrics.fullScenes,resumed.metrics.fullScenes,'covered console output must not recompose the scene');
  accepted++;
  const s=await snapshot();
  if(accepted>=8&&last.metrics.clockPreserves>=resumed.metrics.clockPreserves+2&&last.metrics.dosUpdates>=resumed.metrics.dosUpdates+3&&s&&s.cpu.views[1].counter>moved.cpu.views[1].counter+131072){covered=s;break;}
  await page.waitForTimeout(100);
 }
 assert.ok(covered,'multiple native DOS redraws, clock updates and background CPU progress must complete');
 row.occlusion.moved={before:resumed.metrics,after:last.metrics,snapshots:accepted,text:movedBase.text,counterBefore:moved.cpu.views[1].counter,counterAfter:covered.cpu.views[1].counter};
 console.log('OCCLUSION '+JSON.stringify({video,snapshots:accepted,dosUpdates:last.metrics.dosUpdates-resumed.metrics.dosUpdates,clockPreserves:last.metrics.clockPreserves-resumed.metrics.clockPreserves}));
 await key('CTRL+D');await wait('Desktop shown');await key('CTRL+D');await wait('Desktop windows restored');
 unchanged(await protectedSnapshot(rect,text.slice(0,-1)),movedBase,'hide/restore uses a coherent composition page');
 await page.screenshot({path:output+'/occlusion-moved.png'});
 await key('ESC');await wait('Unsaved memo:');await type('d');await wait('Memo closed');
 await requireState(counterReady,'peer after pixel check');
}
async function persist(){await writeFile(output+'/measurements.json',JSON.stringify({phase,video,clock:8,ramMiB:16,source:manifest.source_commit,sourceDirty:manifest.source_dirty,image:manifest.sha256,browser:browser.version(),repeats,timeout,cases,errors},null,2)+'\n');}
try{
 for(const clockOpen of [false,true]){
  page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=16&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);
  await wait('Ready');assert.equal(await diskHash(),manifest.sha256);
  const graphics=await page.evaluate(()=>window.np2debug.np2.getGraphicsInfo());
  assert.equal(graphics.width,video==='cirrus'?800:640);assert.equal(graphics.height,video==='cirrus'?600:400);
  if(video==='cirrus')assert.equal(graphics.deviceBpp,16);
  await run(1,'COUNT32.EXE 1');await requireState(counterReady,'counter initialization');
  // Warm both slots before timing, so replacement of the automatic KSH shell
  // is not compared with reuse of a previously ended PM32 owner.
  let old=(await snapshot()).cpu.views[0].generation;
  await run(0,'FILE32.EXE');fileClean(await requireState(s=>fileDone(s,old),'file warm-up'));
  if(clockOpen){await find('clock');await wait('12-hour');await page.waitForFunction(()=>!window.np2debug.np2.getScreenText().text.includes('Find apps'));}
  const row={clockOpen,graphics,file:[],input:[],snapshots:[]};cases.push(row);
  if(clockOpen&&phase==='changed')await occlusionCheck(row);
  for(let i=0;i<repeats;i++){
   const before=await snapshot(),start=performance.now();old=before.cpu.views[0].generation;
   await run(0,'FILE32.EXE');const result=await until(s=>fileDone(s,old),'FILE32 under drawing load');
   const s=result.last;assert.ok(s);assert.ok(!s.cpu.views.some(v=>v.state===4),'fault while measuring');
   const record={iteration:i,complete:result.complete,elapsedMs:Math.round(performance.now()-start),backgroundProgress:progress(before,s),cpuTicks:s.resources.usage[0].cpuTicks,runs:s.resources.usage[0].runs,syscalls:pm(s,0)?.syscalls};row.file.push(record);row.snapshots.push({stage:'file-'+i,...s});
   if(result.complete)fileClean(s);
   if(phase==='changed')assert.ok(record.elapsedMs<30000,'FILE32 drawing-load latency');
   console.log('MEASURE '+JSON.stringify({clockOpen,...record}));await persist();
   if(!result.complete){assert.equal(phase,'baseline','FILE32 timed out');break;}
  }
  if(row.file.every(r=>r.complete)){
   await run(0,'VIEW32.EXE VIEWDATA.TXT');
   const ready=await until(s=>s.cpu.views[0].kind===1&&s.cpu.views[0].state===2&&s.cpu.views[0].screen.includes('LINE 000'),'VIEW32 initial page');
   row.viewerReady=ready.complete;row.snapshots.push({stage:'viewer-ready',...ready.last});
   if(!ready.complete)assert.equal(phase,'baseline','VIEW32 timed out before input');
   else for(let i=0;i<repeats;i++){
    const before=await snapshot(),start=performance.now(),next=i%2===0;
    await key('CTRL+N');await type(next?'n':'p');
    const result=await until(s=>s.cpu.views[0].state===2&&s.cpu.views[0].screen.includes(next?'LINE 018':'LINE 000'),'VIEW32 input acknowledgment');
    const s=result.last;assert.ok(s);const record={iteration:i,complete:result.complete,elapsedMs:Math.round(performance.now()-start),backgroundProgress:progress(before,s),cpuTicks:s.resources.usage[0].cpuTicks-before.resources.usage[0].cpuTicks,dispatches:pm(s,0).dispatches-pm(before,0).dispatches};row.input.push(record);row.snapshots.push({stage:'input-'+i,...s});
    console.log('INPUT '+JSON.stringify({clockOpen,...record}));await persist();if(!result.complete){assert.equal(phase,'baseline','VIEW32 input timed out');break;}
    if(phase==='changed')assert.ok(record.elapsedMs<20000,'VIEW32 drawing-load input latency');
   }
  }
  await page.screenshot({path:`${output}/${clockOpen?'overlap':'quiet'}.png`});
  assert.equal(await diskHash(),manifest.sha256);await persist();await page.close();
 }
 assert.deepEqual(errors,[]);await persist();
}catch(error){await writeFile(output+'/failure.json',JSON.stringify({error:String(error),cpu:await snapshot().catch(()=>null),screen:await page?.evaluate(()=>window.np2debug.np2.getScreenText().text).catch(()=>null),cases},null,2));await page?.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}
finally{await browser.close();}
