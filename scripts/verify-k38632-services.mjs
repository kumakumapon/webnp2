import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectMemoryRunner} from './k38632-memory-inspect.mjs';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/k38632-services']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/k386/manifest.json',import.meta.url)));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
let page,lastTag=null;const results=[],runs=[],errors=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const wait=s=>page.waitForFunction(s=>{try{return window.np2debug.np2.getScreenText().text.includes(s);}catch{return false;}},s,{timeout:90000});
const prompt=()=>page.waitForFunction(()=>window.np2debug.np2.getScreenText().lines.some(l=>l.trim()==='A>'),null,{timeout:60000});
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await page.waitForTimeout(200);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await page.waitForTimeout(200);};
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
const pass=s=>{results.push(s);console.log('PASS '+s);};
async function record(predicate){
 let r;for(let end=Date.now()+120000;Date.now()<end;){r=await inspectMemoryRunner(page,lastTag,'K32RUN01');if(r&&predicate(r))return r;await page.waitForTimeout(100);}
 throw new Error('Services record: '+JSON.stringify(r));
}
function reclaimed(r){
 assert.equal(r.error,0);assert.equal(r.fileOpen,0);assert.equal(r.handle,0);assert.equal(r.locked,0);assert.equal(r.freed,1);assert.equal(r.a20Owned,0);
 assert.equal(r.heapPages,0);assert.equal(r.openFiles,0);assert.equal(r.opens,r.closes);assert.equal(r.allocations,r.frees);
 assert.equal(r.freeAfter,r.freeBefore);assert.equal(r.largestAfter,r.largestBefore);assert.equal(r.a20After,r.a20Before);
 assert.equal(r.returnedCR0,r.savedCR0);assert.equal(r.returnedCR3,r.savedCR3);assert.equal(r.returnedFlags,r.savedFlags);assert.equal(r.returnedMask,r.savedMask);
 assert.deepEqual(r.returnedGDT,r.savedGDT);assert.deepEqual(r.returnedIDT,r.savedIDT);
 assert.equal(r.unmapped,1);assert.equal(r.pde2,0);assert.equal(r.userPtClear,true);
 assert.equal(r.pmCR0&1,1);assert.equal(r.pmCR0>>>31,1);assert.equal(r.final.cs,59);assert.equal(r.final.ss,67);
}
async function finish({state=3,status=0,reason}={}){
 const r=await record(r=>[3,4,5].includes(r.state)&&r.freed===1&&r.fileOpen===0&&r.freeAfter===r.freeBefore);
 reclaimed(r);assert.equal(r.state,state);if(state===3)assert.equal(r.exitCode,status);if(reason!==undefined)assert.equal(r.reason,reason);
 lastTag=r.tag;runs.push(r);await prompt();return r;
}
async function run(command,opts){await type('K32RUN '+command+'\r');return finish(opts);}
async function waiting(){return record(r=>r.state===7&&r.waitPolls>100);}
async function stableWait(r){
 await page.waitForTimeout(350);const next=await record(n=>n.state===7&&n.waitPolls>r.waitPolls);
 assert.equal(next.dispatches,r.dispatches);assert.equal(next.resumes,r.resumes);
 assert.equal(r.final.cs,59);assert.equal(r.final.ss,67);assert.equal(r.final.eax,8);assert.deepEqual(next.final,r.final);runs.push({...next,checkpoint:'waiting'});return next;
}
async function boot(mem){
 page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=${mem}&clk=8&worklet=0`,base).href);
 await wait('Ready');assert.equal(hash(await disk()),manifest.sha256);await key('F10');await wait('KDESK exited.');await prompt();
}
try{
 await boot(16);
 const old=await run('HELLO32.EXE',{status:42});assert.equal(old.abi,0);assert.equal(old.syscalls,5);
 const args=await run('ARGS32.EXE "two words" three');assert.equal(args.abi,257);assert.equal(args.features,15);assert.equal(args.argc,3);
 pass('unchanged ABI 0100h application and ABI 0101h startup/feature discovery/quoted argc and argv');
 const heap=await run('HEAP32.EXE');assert.ok(heap.heapPeak>512);assert.ok(heap.allocations>10);assert.ok(heap.heapErrors>=4);
 await type('K32RUN HEAP32.EXE hold\r');let live=await waiting();assert.equal(live.heapPages,17);
 assert.equal(live.ptes[1021]&7,5);assert.equal(live.ptes[1022],0);assert.equal(live.ptes[1023]&7,7);assert.equal(live.ptes[(live.heapBase-0x800000)/4096]&7,7);
 await stableWait(live);await key('ESC');await finish({state:5,reason:65});
 const hf=await run('HEAP32.EXE fault',{state:4,reason:14});assert.equal(hf.cr2,0x10000);assert.equal(hf.faultError,7);
 const revoked=await run('HEAP32.EXE revoked',{state:4,reason:14});assert.equal(revoked.cr2,revoked.heapBase);assert.equal(revoked.faultError,6);
 const infoFault=await run('HEAP32.EXE info',{state:4,reason:14});assert.equal(infoFault.cr2,0xbfd000);assert.equal(infoFault.faultError,7);
 pass('actual heap PTEs and read-only startup page, zero reuse, exhaustion, invalid frees and fault/Escape reclamation');
 await type('K32RUN INPUT32.EXE\r');await wait('INPUT32 WAIT');live=await waiting();assert.equal(live.waits,2);assert.ok(live.waitElapsed>0);await stableWait(live);
 await type('ab');const input=await finish();assert.equal(input.lastKey&255,98);assert.equal(input.waits,3);assert.equal(input.droppedKeys,0);
 pass('real deadline, preserved queued PC-98 keys, nonblocking polling and waiting without application redispatch/budget drain');
 const file=await run('FILE32.EXE');assert.equal(file.peakFiles,8);assert.equal(file.opens,10);assert.equal(file.readBytes,20);assert.ok(file.fileErrors>=3);
 await type('K32RUN FILE32.EXE hold\r');await wait('FILE32 HOLD');live=await waiting();assert.equal(live.openFiles,8);assert.equal(live.heapPages,2);await stableWait(live);await type('x');await key('ESC');
 await finish({state:5,reason:65});
 const ff=await run('FILE32.EXE fault',{state:4,reason:14});assert.equal(ff.peakFiles,8);assert.equal(ff.cr2,0x10000);
 pass('actual 70001-byte DOS file, odd unaligned copy sentinels, >64 KiB seek, EOF, token generations/limits, pointer/device/path rejection and owned-handle cleanup');
 await type('K32RUN VIEW32.EXE VIEWDATA.TXT\r');await wait('LINE 000 - K38632');live=await waiting();assert.equal(live.openFiles,1);assert.equal(live.heapPages,18);await stableWait(live);
 await type('n');await wait('LINE 018 - K38632');await waiting();await type('p');await wait('LINE 000 - K38632');await waiting();
 await page.screenshot({path:join(output,'viewer.png')});await type('q');await finish();await wait('VIEW32: closed');
 await type('K32RUN VIEW32.EXE VIEWDATA.TXT\r');await wait('LINE 000 - K38632');await waiting();await key('ESC');await finish({state:5,reason:65});
 await run('VIEW32.EXE MISSING.TXT',{status:2});await run('HELLO32.EXE',{status:42});
 assert.equal(hash(await disk()),manifest.sha256);await page.screenshot({path:join(output,'services-returned.png')});
 await type('KDESK\r');await wait('Ready');await key('F4');await type('SDK SERVICES RETURNED');await wait('SDK SERVICES RETURNED');
 await page.screenshot({path:join(output,'gui-recovery.png')});await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');assert.equal(hash(await disk()),manifest.sha256);await page.close();
 pass('text viewer paging/return/Escape/error, repeated application startup, existing GUI recovery and unchanged whole FAT12 disk');
 lastTag=null;await boot(4);await type('K32RUN VIEW32.EXE VIEWDATA.TXT\r');await wait('K32RUN REFUSED: XMS memory');await prompt();
 const oom=await record(r=>r.state===6&&r.error===8&&r.fileOpen===0&&r.freeAfter===r.freeBefore);assert.equal(oom.handle,0);assert.equal(oom.pd,0);assert.equal(oom.openFiles,0);runs.push(oom);
 assert.equal(hash(await disk()),manifest.sha256);assert.deepEqual(errors,[]);
 pass('actual insufficient-XMS refusal without PM entry, leaked handles, disk mutation or browser errors');
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,image:manifest.image,sha256:manifest.sha256,results,runs},null,2)+'\n');
}catch(e){
 await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),text:await page?.evaluate(()=>window.np2debug.np2.getScreenText().text).catch(()=>null),record:await inspectMemoryRunner(page,null,'K32RUN01').catch(()=>null),results,runs},null,2)+'\n');
 await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;
}finally{await browser.close();}
