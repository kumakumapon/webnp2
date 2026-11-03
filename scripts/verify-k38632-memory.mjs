import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectMemoryRunner} from './k38632-memory-inspect.mjs';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
import {counterPairReady,counterPairAdvanced} from './k386-counter-progress.mjs';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/k38632-memory']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/k386/manifest.json',import.meta.url)));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const results=[],runs=[],errors=[];let page,lastTag=null;
const hash=b=>createHash('sha256').update(b).digest('hex');
const wait=s=>page.waitForFunction(s=>{try{return window.np2debug.np2.getScreenText().text.includes(s);}catch{return false;}},s,{timeout:90000});
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await page.waitForTimeout(200);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await page.waitForTimeout(200);};
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
const prompt=()=>page.waitForFunction(()=>window.np2debug.np2.getScreenText().lines.some(l=>l.trim()==='A>'),null,{timeout:60000});
const pass=s=>{results.push(s);console.log('PASS '+s);};
async function record(predicate,previous=lastTag){
 let r;for(let end=Date.now()+90000;Date.now()<end;){r=await inspectMemoryRunner(page,previous);if(r&&predicate(r))return r;await page.waitForTimeout(100);}
 throw new Error('PM32 memory record: '+JSON.stringify(r));
}
function reclaimed(r){
 assert.equal(r.handle,0);assert.equal(r.locked,0);assert.equal(r.a20Owned,0);
 assert.equal(r.a20After,r.a20Before);assert.equal(r.freeAfter,r.freeBefore);assert.equal(r.largestAfter,r.largestBefore);
 assert.equal(r.returnedCR0,r.savedCR0);assert.equal(r.returnedCR3,r.savedCR3);assert.equal(r.savedCR0&1,0);
 assert.equal(r.returnedFlags,r.savedFlags);assert.equal(r.returnedMask,r.savedMask);
 assert.deepEqual(r.returnedGDT,r.savedGDT);assert.deepEqual(r.returnedIDT,r.savedIDT);
 assert.equal(r.unmapped,1);assert.equal(r.pde2,0);assert.equal(r.userPtClear,true);assert.equal(r.freed,1);
 assert.equal(r.pmCR0&1,1);assert.equal(r.pmCR0>>>31,1);assert.equal(r.pmCR3,r.pd);
 assert.equal(r.final.cs,59);assert.equal(r.final.ss,67);assert.equal(r.final.eflags&0x27200,0x200);
 assert.ok(r.raw>=0x100000);assert.ok(r.physical>=r.raw&&r.physical-r.raw<4096);
 assert.ok(r.physical+0x400000<=r.raw+r.allocationBytes);assert.equal(r.physical&4095,0);
 const flags=r.publishedPtes.map(v=>v&7);
 assert.deepEqual(flags,[3,7,5,7,7,7,7,7,7,0,7,0,7]);
 assert.equal(r.publishedPtes[2]&0xfffff000,r.physical);
 assert.equal(r.publishedPtes[8]&0xfffff000,r.physical+0x200000);
 assert.equal(r.publishedPtes[10]&0xfffff000,r.physical+0x201000);
 assert.equal(r.publishedPtes[12]&0xfffff000,r.physical+0x202000);
}
async function run(mode=''){
 await type('K32MEM'+(mode?' '+mode:'')+'\r');
 if(mode==='B'){await record(r=>r.irqs>8&&r.state===2);await key('ESC');}
 const r=await record(r=>[3,4,5].includes(r.state)&&r.freed===1&&r.freeAfter===r.freeBefore);
 assert.equal(r.error,0);reclaimed(r);lastTag=r.tag;runs.push(r);await prompt();return r;
}
async function boot(mem){
 page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=${mem}&clk=8&worklet=0`,base).href);
 await wait('Ready');assert.equal(hash(await disk()),manifest.sha256);
 await key('F10');await wait('KDESK exited.');await prompt();
}
try{
 await boot(16);
 const r=await run();assert.equal(r.state,3);assert.equal(r.reason,48);assert.equal(r.stage,3);assert.equal(r.checksum,0xfffc0000);
 assert.ok(r.irqs>2);assert.equal(r.resumes,r.irqs);assert.equal(r.firstIRQ.vector,32);assert.equal(r.lastIRQ.vector,32);
 assert.equal(r.firstIRQ.cs,59);assert.equal(r.lastIRQ.cs,59);assert.equal(r.final.ebx,0x12345678);assert.equal(r.final.ebp,0x87654321);
 const offsets=[0,4,8,12,0xfff8,0xfffc,0x10000,0x10004,0xffff8,0xffffc,0x100000,0x100004,0x1ffff0,0x1ffff4,0x1ffff8,0x1ffffc];
 assert.deepEqual(r.samples,offsets.map(o=>((o/4)^0x5a93c6ef)>>>0));
 pass('actual XMS allocation, CPL3/PE+PG with 2 MiB zero/pattern/checksum, 64 KiB/1 MiB/2 MiB samples and repeated IRQ0 context resumption');
 for(const [mode,vector,error,address] of [['F',14,4,0xa01000],['C',14,7,0x800000],['K',14,5,null],['S',14,6,0xa03ffc],['P',13,0,null]]){
  const f=await run(mode);assert.equal(f.state,4);assert.equal(f.reason,vector);assert.equal(f.faultError,error);
  if(mode==='K')assert.equal(f.cr2,f.base);else if(address!==null)assert.equal(f.cr2,address);
 }
 pass('real read-only code, supervisor and guard-page violations plus privileged CLI are contained and reclaim their XMS');
 const budget=await run('T');assert.equal(budget.state,5);assert.equal(budget.reason,66);assert.equal(budget.irqs,64);assert.ok(budget.counter>0);
 const cancelled=await run('B');assert.equal(cancelled.state,5);assert.equal(cancelled.reason,65);assert.ok(cancelled.counter>0);
 pass('infinite CPL3 loops are preempted and terminated by a real scheduler budget or explicit Escape with complete reclamation');
 const again=await run();assert.equal(again.stage,3);assert.equal(again.checksum,r.checksum);assert.notEqual(again.tag,r.tag);
 await page.screenshot({path:join(output,'pm32-reclaimed.png')});
 pass('restarted PM32 applications see zeroed reused memory; XMS free/largest block, A20, CR0/CR3, descriptors, flags and PIC are restored');
 await type('KDESK\r');await wait('Ready');await key('CTRL+N');await wait('K386 DOS shell');await type('COUNTER\r');
 await key('CTRL+O');await wait('K386 DOS shell');await type('COUNTER\r');
 const until=async fn=>{for(let end=Date.now()+90000;Date.now()<end;){const cpu=await inspectK386(page),resources=await inspectResources(page),s={cpu,resources};if(fn(s))return s;await page.waitForTimeout(150);}throw new Error('V86 recovery');};
 const before=await until(counterPairReady);await key('F4');await type('PM32 MEMORY RETURNED');await wait('PM32 MEMORY RETURNED');
 await until(s=>counterPairAdvanced(before,s));
 await key('CTRL+N');await key('CTRL+C');
 await until(s=>!!s.cpu&&s.cpu.views[0].state===2&&s.resources?.usage[0].program==='KSH.EXE');
 await type('K32MEM\r');
 await until(s=>!!s.cpu&&s.cpu.views[0].screen.includes('K32MEM REFUSED: protected/V86 owner present')&&s.resources?.usage[0].program==='KSH.EXE');
 await page.screenshot({path:join(output,'pm32-v86-recovery.png')});
 await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');await prompt();
 assert.equal(hash(await disk()),manifest.sha256);await page.close();
 pass('KDESK, native Memo and two background V86 CPUs recover; live V86 ownership is refused and all FAT12 bytes are preserved');
 lastTag=null;await boot(4);await type('K32MEM\r');await wait('K32MEM REFUSED: XMS memory');await prompt();
 const oom=await record(r=>r.state===6&&r.error===8&&r.freeAfter===r.freeBefore);
 assert.equal(oom.handle,0);assert.equal(oom.locked,0);assert.equal(oom.freed,0);assert.equal(oom.pd,0);assert.equal(oom.a20Owned,0);
 assert.equal(oom.a20After,oom.a20Before);assert.equal(oom.largestAfter,oom.largestBefore);runs.push(oom);
 assert.equal(hash(await disk()),manifest.sha256);assert.deepEqual(errors,[]);
 pass('actual insufficient XMS on a 4 MiB machine refuses allocation without entering PM, losing memory or modifying the disk');
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,image:manifest.image,sha256:manifest.sha256,results,runs},null,2)+'\n');
}catch(e){
 await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),text:await page?.evaluate(()=>window.np2debug.np2.getScreenText().text).catch(()=>null),record:await inspectMemoryRunner(page).catch(()=>null),results,runs},null,2)+'\n');
 await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;
}finally{await browser.close();}
