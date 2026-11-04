import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectK386,inspectPM32Records} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
import {counterPairReady,counterPairAdvanced} from './k386-counter-progress.mjs';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/k38632-windows',video='pegc']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/k386/manifest.json',import.meta.url)));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
let page;const results=[],snapshots=[],errors=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const wait=s=>page.waitForFunction(s=>{try{return window.np2debug.np2.getScreenText().text.includes(s);}catch{return false;}},s,{timeout:90000});
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await page.waitForTimeout(180);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await page.waitForTimeout(180);};
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
const pass=s=>{results.push(s);console.log('PASS '+s);};
async function until(test,label){console.log('CHECK '+label);let cpu,resources;for(let end=Date.now()+120000;Date.now()<end;){cpu=await inspectK386(page);resources=await inspectResources(page);if(cpu&&resources&&test({cpu,resources}))return {cpu,resources};await page.waitForTimeout(100);}throw Error(label+': '+JSON.stringify({cpu,resources}));}
function save(label,s){snapshots.push({label,...s});}
async function find(q){await key('CTRL+K');await wait('Find apps');await type(q);await page.waitForFunction(q=>{const l=window.np2debug.np2.getScreenText().lines;return l[5]?.slice(15,64).trim().replace(/_$/,'')===q&&l[20]?.includes('1 results -');},q,{timeout:90000});await key('ENTER');}
async function run(id,command){await key(id?'CTRL+O':'CTRL+N');await key('CTRL+L');await wait('COM/EXE command:');await type(command+'\r');}
async function end(id){await key(id?'CTRL+O':'CTRL+N');await key('CTRL+E');return until(s=>s.cpu.views[id].state===0,'end '+id);}
async function task(id,command){const resources=await inspectResources(page);await find('task manager');for(let i=0;i<14;i++)await key('UP');for(let i=0;i<8+id;i++)await key('DOWN');await wait('ID '+resources.usage[id].generation+'  '+resources.usage[id].program+'  Priority:');await type(command);}
const pm=(s,id)=>s.cpu.diagnostics[id].pm32;
const live=(s,id)=>s.cpu.views[id].kind===1&&s.cpu.views[id].state===1&&s.cpu.views[id].counter>0;
function owned(s,id){
 const v=s.cpu.views[id],r=pm(s,id);assert.ok(r);assert.equal(r.error,0);assert.ok(r.handle);assert.equal(r.locked,1);assert.equal(r.a20Owned,0);
 assert.equal(r.returnedCR0,r.savedCR0);assert.equal(r.returnedCR3,r.savedCR3);assert.equal(r.returnedFlags,r.savedFlags);assert.equal(r.returnedMask,r.savedMask);assert.equal(r.a20Before,r.a20After);
 assert.equal(r.pmCR0&1,1);assert.equal(r.pmCR0>>>31,1);assert.equal(s.cpu.diagnostics[id].frame.cs,59);assert.equal(s.cpu.diagnostics[id].frame.ss,67);assert.equal(s.cpu.diagnostics[id].frame.eflags&0x20000,0);
 assert.equal(r.ptes[0]&7,5);assert.equal(r.ptes[1021]&7,5);assert.equal(r.ptes[1022],0);assert.equal(r.ptes[1023]&7,7);assert.equal(r.pde0&7,3);assert.equal(v.cr3,r.pmCR3);
}
function reclaimed(s,id){const r=pm(s,id);assert.equal(r.error,0);assert.equal(r.handle,0);assert.equal(r.locked,0);assert.equal(r.a20Owned,0);assert.equal(r.heapPages,0);assert.equal(r.openFiles,0);assert.equal(r.opens,r.closes);assert.equal(r.allocations,r.frees);assert.equal(r.unmapped,1);assert.equal(r.tablesCleared,1);assert.equal(r.freed,1);}
async function proof(previousTag){
 await type('K32MIX\r');await page.waitForFunction(()=>/K32MIX (PASS|FAIL)/.test(window.np2debug.np2.getScreenText().text),null,{timeout:120000});
 const text=await page.evaluate(()=>window.np2debug.np2.getScreenText().text);assert.ok(text.includes('K32MIX PASS'),text);
 const r=await page.evaluate(previous=>{const s=atob(window.np2debug.np2.readMemoryBase64(0x10000,0x90000).base64),d=o=>(s.charCodeAt(o)|s.charCodeAt(o+1)<<8|s.charCodeAt(o+2)<<16|s.charCodeAt(o+3)<<24)>>>0;let at=-1;while((at=s.indexOf('K32MIX01',at+1))>=0)if(d(at+8)===2&&d(at+12)===84&&d(at+16)&&d(at+16)!==previous&&d(at+24)===128)return {tag:d(at+16),error:d(at+20),iterations:d(at+24),counters:[d(at+28),d(at+32)],pd:[d(at+36),d(at+40)],physical:[d(at+44),d(at+48)],cs:[d(at+52),d(at+56)],flags:[d(at+60),d(at+64)],v86Counter:d(at+68),v86Flags:d(at+72),dosBefore:d(at+76),dosAfter:d(at+80)};return null;},previousTag??0);
 assert.ok(r);assert.equal(r.error,0);assert.equal(r.dosBefore,r.dosAfter);assert.ok(r.counters.every(n=>n>0));assert.notEqual(r.pd[0],r.pd[1]);assert.notEqual(r.physical[0],r.physical[1]);assert.deepEqual(r.cs,[59,59]);assert.ok(r.flags.every(f=>!(f&0x20000)));assert.ok(r.v86Flags&0x20000);assert.ok(r.v86Counter>0);
 let raw;for(let i=0;i<100;i++){raw=await inspectPM32Records(page);if(raw)break;await page.waitForTimeout(25);}assert.ok(raw);assert.ok(raw.every(r=>r.irqs>=64&&r.resumes>=63&&r.syscalls===0));assert.equal(raw[0].freeBefore,raw[1].freeAfter);assert.equal(raw[0].largestBefore,raw[1].largestAfter);save('raw CPU proof',{proof:r,records:raw});return {proof:r,records:raw};
}
async function boot(mem){page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=${mem}&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);await wait('Ready');assert.equal(hash(await disk()),manifest.sha256);}
try{
 await boot(16);await key('F10');await wait('KDESK exited.');const first=await proof();await type('KDESK\r');await wait('Ready');
 pass('128 real PM32/V86 and PM32/PM32 CPU slices, distinct CR3/backing, correct user mode, host restoration and conventional-memory reclamation');
 await find('pm32 viewer');let s=await until(s=>s.cpu.views[0].kind===1&&s.cpu.views[0].state===2&&s.cpu.views[0].screen.includes('LINE 000'),'viewer waiting');owned(s,0);assert.equal(pm(s,0).openFiles,1);assert.equal(pm(s,0).heapPages,18);const waitFrame=s.cpu.diagnostics[0].frame,dispatches=pm(s,0).dispatches,waitCPU=s.resources.usage[0].cpuTicks;
 await page.waitForTimeout(400);s=await until(s=>s.cpu.views[0].state===2,'viewer remains waiting');assert.equal(pm(s,0).dispatches,dispatches);assert.equal(s.resources.usage[0].cpuTicks,waitCPU);assert.deepEqual(s.cpu.diagnostics[0].frame,waitFrame);
 await type('n');await until(s=>s.cpu.views[0].screen.includes('LINE 018'),'viewer next page');await key('ROLLDOWN');s=await until(s=>s.cpu.views[0].screen.includes('LINE 036'),'packed PageDown');assert.equal(pm(s,0).lastKey>>8,0x37);
 await key('HOME');await until(s=>s.cpu.views[0].screen.includes('LINE 000'),'packed Home');
 await find('pm32 ticker');s=await until(s=>live(s,1)&&s.cpu.views[0].state===2,'ticker and viewer');owned(s,1);save('two PM32 windows',s);const counter=s.cpu.views[1].counter,generation=s.resources.usage.map(u=>u.generation);
 await page.waitForTimeout(400);s=await until(s=>s.cpu.views[1].counter>counter&&s.cpu.views[0].state===2,'background ticker');assert.equal(pm(s,0).queuedKeys,0);
 await key('CTRL+O');await type('x');s=await until(s=>s.cpu.views[1].keys===1,'focus routes key only to ticker');assert.equal(pm(s,0).queuedKeys,0);assert.equal(s.cpu.views[0].state,2);
 await key('CTRL+N');await find('window left');await key('CTRL+O');await find('window right');await key('CTRL+G');await key('CTRL+G');await key('F8');await key('CTRL+O');
 await find('math');await wait('Value: 0');await type('6*7=');await wait('Value: 42');await key('F4');await type('PM32 GUI COEXISTS');await wait('PM32 GUI COEXISTS');await find('clock');await wait('12-hour');
 s=await until(s=>s.cpu.views[1].counter>counter&&s.cpu.views[0].state===2,'native GUI coexistence');assert.deepEqual(s.resources.usage.map(u=>u.generation),generation);
 await page.waitForFunction(()=>!window.np2debug.np2.getScreenText().text.includes('Find apps'));await page.waitForTimeout(1200);await page.screenshot({path:join(output,'two-pm32-gui.png')});
 pass('windowed VIEW32 file/ANSI/navigation, wait without redispatch, per-focus input, tiling/maximize/minimize and calculator/clock/memo coexistence');
 // Keep Clock open through the lifecycle checks too. The dedicated rendering
 // gate measures latency and exact occlusion while this checks owner cleanup.
 await key('CTRL+N');await type('q');s=await until(s=>s.cpu.views[0].state===0,'viewer quit');reclaimed(s,0);
 await run(0,'COUNT32.EXE 2');s=await until(s=>live(s,0)&&live(s,1),'two private counters');owned(s,0);owned(s,1);
 assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);assert.notEqual(s.cpu.views[0].physical,s.cpu.views[1].physical);assert.equal(pm(s,0).samples[1],50);assert.equal(pm(s,1).samples[1],49);assert.equal(pm(s,0).samples[2],0x50333221);assert.equal(pm(s,1).samples[2],0x50333221);assert.equal(pm(s,0).samples[3],pm(s,1).samples[3]);
 const heapIndex=(pm(s,0).samples[3]-0x800000)/4096;assert.notEqual(pm(s,0).ptes[heapIndex]&0xfffff000,pm(s,1).ptes[heapIndex]&0xfffff000);save('isolated same-address private data',s);
 await key('CTRL+P');s=await until(s=>s.cpu.views[0].state===3,'pause ticker');const paused=s.cpu.views[0].counter,peer=s.cpu.views[1].counter,oldGeneration=s.resources.usage[0].generation;
 await page.waitForTimeout(400);s=await until(s=>s.cpu.views[1].counter>peer,'peer while stopped');assert.equal(s.cpu.views[0].counter,paused);await key('CTRL+R');s=await until(s=>s.cpu.views[0].counter>paused,'resume same CPU context');assert.equal(s.resources.usage[0].generation,oldGeneration);
 await end(0);s=await until(s=>s.cpu.views[0].state===0,'end ticker');reclaimed(s,0);await task(0,'r');s=await until(s=>live(s,0)&&s.resources.usage[0].generation!==oldGeneration,'task manager restarts original app');assert.equal(pm(s,0).samples[1],50);save('restart',s);
 pass('two PM32 tasks isolate identical virtual addresses, heap data and CR3; stop preserves CPU/data while peer runs; task-manager restart gets a new generation');
 await end(0);await run(0,'FAULT32.EXE');s=await until(s=>s.cpu.views[0].state===4,'contained PM32 fault');reclaimed(s,0);assert.equal(pm(s,0).reason,14);assert.equal(pm(s,0).cr2,0x10000);assert.equal(pm(s,0).faultError,5);const faultGeneration=s.resources.usage[0].generation,afterFaultPeer=s.cpu.views[1].counter;save('PM32 fault containment',s);
 await task(0,'r');s=await until(s=>s.cpu.views[0].state===4&&s.resources.usage[0].generation!==faultGeneration,'fault restart');assert.ok(s.cpu.views[1].counter>afterFaultPeer);reclaimed(s,0);
 await end(0);await run(0,'COUNT32.EXE fault');s=await until(s=>s.cpu.views[0].state===4&&pm(s,0).reason===13,'privileged instruction fault');reclaimed(s,0);assert.equal(pm(s,0).faultError,0);assert.equal(pm(s,0).heapPeak,2);
 await end(0);await run(0,'KSH.EXE');await until(s=>s.cpu.views[0].kind===0&&s.resources.usage[0].program==='KSH.EXE','V86 parent');await type('COUNTER\r');s=await until(s=>s.cpu.views[0].counter>0&&s.cpu.views[0].screen.includes('V86 COUNTER:')&&s.resources.usage[0].program==='COUNTER.EXE'&&live(s,1),'mixed actual execution');assert.ok(s.cpu.diagnostics[0].frame.eflags&0x20000);assert.equal(s.cpu.diagnostics[1].frame.eflags&0x20000,0);assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);save('PM32 and V86',s);
 const mixedPeer=s.cpu.views[1].counter;await type('q');await until(s=>s.resources.usage[0].program==='KSH.EXE','V86 parent restored');await type('FAULT\r');s=await until(s=>s.resources.usage[0].lastFault===14&&s.resources.usage[0].program==='KSH.EXE','V86 child fault journal');assert.ok(s.cpu.views[1].counter>mixedPeer);assert.ok(s.resources.events.some(e=>e.type===3&&e.fault===14));
 pass('PM32 #PF and restart preserve peer/GUI; mixed PM32/V86 execution preserves mode-specific frames; V86 child faults restore shell and reach the common journal');
 await type('COUNTER\r');await until(s=>s.resources.usage[0].program==='COUNTER.EXE','first V86 counter');await end(1);await run(1,'KSH.EXE');await until(s=>s.resources.usage[1].program==='KSH.EXE','second V86 parent');await type('COUNTER\r');s=await until(s=>s.cpu.views.every(v=>v.kind===0)&&counterPairReady(s),'legacy pair');save('legacy V86 baseline',s);const before=s;await page.waitForTimeout(400);s=await until(s=>counterPairAdvanced(before,s),'two V86 progress');assert.ok(s.cpu.diagnostics.every(d=>d.frame.eflags&0x20000));save('legacy V86 pair',s);
 pass('the original two V86 slots continue executing independently through the common manager');
 await end(0);await end(1);await run(0,'FILE32.EXE hold');await until(s=>s.cpu.views[0].kind===1&&s.cpu.views[0].state===2&&pm(s,0).openFiles===8,'first file owner');await run(1,'FILE32.EXE hold');s=await until(s=>s.cpu.views[1].state===2&&pm(s,1)?.openFiles===8,'two file owners');assert.equal(pm(s,0).openFiles,8);save('16 owned read-only handles',s);
 await end(0);reclaimed(await until(s=>s.cpu.views[0].state===0,'first file end'),0);await run(0,'FILE32.EXE');s=await until(s=>s.cpu.views[0].state===0&&pm(s,0).exitCode===0&&pm(s,0).opens===10,'file API in active peer environment');reclaimed(s,0);assert.equal(pm(s,0).readBytes,20);assert.equal(pm(s,1).openFiles,8);
 await run(0,'FILE32.EXE fault');s=await until(s=>s.cpu.views[0].state===4&&pm(s,0).peakFiles===8,'file fault');reclaimed(s,0);assert.equal(pm(s,1).openFiles,8);await end(0);await key('CTRL+O');await key('ESC');s=await until(s=>s.cpu.views[1].state===0,'Escape ends only selected file owner');reclaimed(s,1);assert.equal(pm(s,1).reason,65);
 pass('two owners hold 16 real read-only DOS handles; odd copies/seek/token checks, normal exit, #PF and focused Escape close only the selected owner');
 await page.screenshot({path:join(output,'task-lifecycle.png')});await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');
 const final=await proof(first.proof.tag);assert.equal(final.proof.dosBefore,first.proof.dosBefore);assert.equal(final.records[1].freeAfter,first.records[0].freeBefore);assert.equal(final.records[1].largestAfter,first.records[0].largestBefore);assert.equal(hash(await disk()),manifest.sha256);await page.close();
 pass('repeated CPU proof after GUI teardown reclaims conventional snapshots and all XMS; whole FAT12 image remains byte-for-byte unchanged');
 await boot(4);await key('CTRL+N');s=await until(s=>s.cpu.views[0].kind===0&&s.resources.usage[0].program==='KSH.EXE','low-memory shell');const retained={generation:s.resources.usage[0].generation,physical:s.cpu.views[0].physical,cr3:s.cpu.views[0].cr3};await key('CTRL+L');await type('VIEW32.EXE VIEWDATA.TXT\r');await wait('Cannot load program');await key('ESC');await type('ECHO OOM SAFE\r');s=await until(s=>s.cpu.views[0].screen.includes('OOM SAFE'),'existing shell survives OOM');assert.equal(s.resources.usage[0].generation,retained.generation);assert.equal(s.cpu.views[0].physical,retained.physical);assert.equal(s.cpu.views[0].cr3,retained.cr3);
 const failure=await page.evaluate(()=>{const n=window.np2debug.np2,b=atob(n.readMemoryBase64(0x10000,0x90000).base64),w=o=>b.charCodeAt(o)|b.charCodeAt(o+1)<<8,d=o=>(w(o)|w(o+2)<<16)>>>0;let at=-1;while((at=b.indexOf('K32HOST1',at+1))>=0)if(w(at+8)===1&&w(at+10)===7584&&w(at+12)===1&&d(at+28)){const r=at+6560;return {state:d(r+12),error:d(r+16),handle:w(r+40),locked:w(r+42),freeBefore:w(r+48),freeAfter:w(r+50),a20:w(r+142),pmCR0:d(r+84),fileOpen:d(r+604)};}return null;});
 assert.ok(failure);assert.equal(failure.error,8);assert.equal(failure.handle,0);assert.equal(failure.locked,0);assert.equal(failure.a20,0);assert.equal(failure.fileOpen,0);assert.equal(failure.pmCR0,0);assert.equal(failure.freeAfter,failure.freeBefore);save('actual low-memory transactional refusal',{...s,failure});assert.equal(hash(await disk()),manifest.sha256);assert.deepEqual(errors,[]);
 pass('actual 4 MiB XMS refusal closes candidate resources without replacing the V86 owner, changing disk bytes or stopping the GUI');
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,sourceDirty:manifest.source_dirty,image:manifest.image,sha256:manifest.sha256,video,results,snapshots},null,2)+'\n');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),text:await page?.evaluate(()=>window.np2debug.np2.getScreenText().text).catch(()=>null),cpu:await inspectK386(page).catch(()=>null),resources:await inspectResources(page).catch(()=>null),results,snapshots},null,2)+'\n');await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;}
finally{await browser.close();}
