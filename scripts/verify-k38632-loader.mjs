import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectMemoryRunner} from './k38632-memory-inspect.mjs';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/k38632-loader']=process.argv.slice(2);
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
 throw new Error('Loader record: '+JSON.stringify(r));
}
function reclaimed(r){
 assert.equal(r.error,0);assert.equal(r.fileOpen,0);assert.equal(r.handle,0);assert.equal(r.locked,0);assert.equal(r.freed,1);assert.equal(r.a20Owned,0);
 assert.equal(r.freeAfter,r.freeBefore);assert.equal(r.largestAfter,r.largestBefore);assert.equal(r.a20After,r.a20Before);
 assert.equal(r.returnedCR0,r.savedCR0);assert.equal(r.returnedCR3,r.savedCR3);assert.equal(r.returnedFlags,r.savedFlags);assert.equal(r.returnedMask,r.savedMask);
 assert.deepEqual(r.returnedGDT,r.savedGDT);assert.deepEqual(r.returnedIDT,r.savedIDT);
 assert.equal(r.unmapped,1);assert.equal(r.pde2,0);assert.equal(r.userPtClear,true);
 assert.equal(r.pmCR0&1,1);assert.equal(r.pmCR0>>>31,1);assert.equal(r.final.cs,59);assert.equal(r.final.ss,67);assert.equal(r.final.eflags&0x27200,0x200);
}
async function run(name,{cancel=false}={}){
 await type('K32RUN '+name+'\r');
 if(cancel){
  const live=await record(r=>r.irqs>8&&r.counter>0&&r.state===2);
  assert.equal(live.ptes[0]&7,5);assert.equal(live.ptes[(live.rwbase-0x800000)/4096]&7,7);
  assert.equal(live.ptes[1022],0);assert.equal(live.ptes[1023]&7,7);assert.equal(live.pde0&7,3);
  runs.push({...live,checkpoint:'live'});await key('ESC');
 }
 const r=await record(r=>[3,4,5].includes(r.state)&&r.freed===1&&r.fileOpen===0&&r.freeAfter===r.freeBefore);
 reclaimed(r);lastTag=r.tag;runs.push(r);await prompt();return r;
}
async function boot(mem){
 page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=${mem}&clk=8&worklet=0`,base).href);
 await wait('Ready');assert.equal(hash(await disk()),manifest.sha256);await key('F10');await wait('KDESK exited.');await prompt();
}
try{
 await boot(16);
 await type('HELLO32\r');await wait('Use K32RUN APP32.EXE');await prompt();
 const hello=await run('HELLO32.EXE');await wait('HELLO32: C SDK in Ring 3');
 assert.equal(hello.state,3);assert.equal(hello.exitCode,42);assert.equal(hello.parserError,0);assert.equal(hello.entry,0x800000);
 assert.equal(hello.writes,1);assert.equal(hello.yields,1);assert.equal(hello.times,2);assert.equal(hello.syscalls,5);assert.equal(hello.resumes,hello.irqs+4);
 pass('external MZ/ELF32 C application, safe DOS stub, versioned exit/write/yield/ticks ABI and exit status 42');
 const mem=await run('MEM32.EXE');await wait('MEM32: 2 MiB BSS');assert.equal(mem.exitCode,0);assert.ok(mem.fileBytes>65536);assert.ok(mem.rwbytes>=0x200000);assert.ok(mem.irqs>0);
 const offsets=[0,4,8,12,0xfff8,0xfffc,0x10000,0x10004,0xffff8,0xffffc,0x100000,0x100004,0x1ffff0,0x1ffff4,0x1ffff8,0x1ffffc];
 assert.deepEqual(mem.samples,offsets.map(o=>((o/4)^0x5a93c6ef)>>>0));assert.equal(mem.publishedPtes[3]&7,5);assert.ok(mem.publishedPtes[3]&0x20);
 pass('streamed >64 KiB executable, executed code beyond 4 KiB, zeroed 2 MiB BSS and direct-pointer pattern/checksum with actual boundary samples');
 const bad=await run('BADPTR32.EXE');await wait('BADPTR32: invalid buffers rejected');assert.equal(bad.exitCode,0);assert.equal(bad.badPointers,3);assert.equal(bad.unknownCalls,1);
 pass('kernel pointers, wrapping ranges and guard crossings are rejected before copy; oversized writes and unknown syscalls return bounded errors');
 const fault=await run('FAULT32.EXE');assert.equal(fault.state,4);assert.equal(fault.reason,14);assert.equal(fault.cr2,0x10000);assert.equal(fault.faultError,5);
 const budget=await run('/T SPIN32.EXE');assert.equal(budget.state,5);assert.equal(budget.reason,66);assert.equal(budget.dispatches,64);assert.equal(budget.irqs,64);assert.equal(budget.resumes,63);
 const cancelled=await run('SPIN32.EXE',{cancel:true});assert.equal(cancelled.reason,65);assert.ok(cancelled.counter>0);
 pass('real protection fault, timer budget and Escape contain external C programs, revoke their pages, close files and reclaim XMS');
 for(const name of ['BADABI.EXE','BADENT.EXE','BADOVR.EXE','BADSIZE.EXE','BADELF.EXE','COUNTER.EXE']){
  await type('K32RUN '+name+'\r');
  const r=await record(r=>r.state===6&&r.error===20&&r.fileOpen===0);
  assert.equal(r.attempts,0);assert.equal(r.pd,0);assert.equal(r.handle,0);assert.ok(r.parserError>0);lastTag=r.tag;runs.push(r);await prompt();
 }
 const again=await run('HELLO32.EXE');assert.equal(again.exitCode,42);assert.notEqual(again.tag,hello.tag);
 await page.screenshot({path:join(output,'external-apps.png')});
 pass('actual malformed ABI/entry/overlap/overflow/ELF and ordinary DOS images are rejected before allocation; a following valid app still runs');
 assert.equal(hash(await disk()),manifest.sha256);await type('KDESK\r');await wait('Ready');
 const shell=async needle=>{for(let end=Date.now()+90000;Date.now()<end;){const cpu=await inspectK386(page),r=await inspectResources(page);if(cpu?.views[0].state===2&&r?.usage[0].program==='KSH.EXE'&&cpu.views[0].screen.includes(needle))return;await page.waitForTimeout(150);}throw new Error('V86 refusal: '+needle);};
 await key('CTRL+N');await shell('K386 DOS shell');await type('HELLO32.EXE\r');await shell('Cannot execute program: 11');
 await type('K32RUN HELLO32.EXE\r');await shell('K32RUN REFUSED: protected/V86 owner present');
 await key('F4');await type('SDK RETURNED SAFELY');await wait('SDK RETURNED SAFELY');
 await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');assert.equal(hash(await disk()),manifest.sha256);await page.close();
 lastTag=null;await boot(4);await type('K32RUN HELLO32.EXE\r');await wait('K32RUN REFUSED: XMS memory');await prompt();
 const oom=await record(r=>r.state===6&&r.error===8&&r.fileOpen===0&&r.freeAfter===r.freeBefore);
 assert.equal(oom.handle,0);assert.equal(oom.freed,0);assert.equal(oom.pd,0);assert.equal(oom.a20Owned,0);runs.push(oom);
 assert.equal(hash(await disk()),manifest.sha256);assert.deepEqual(errors,[]);
 pass('GUI/V86 recovery and ownership refusal, actual insufficient XMS, balanced ownership and unchanged FAT12 bytes on both machines');
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,image:manifest.image,sha256:manifest.sha256,results,runs},null,2)+'\n');
}catch(e){
 await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),text:await page?.evaluate(()=>window.np2debug.np2.getScreenText().text).catch(()=>null),record:await inspectMemoryRunner(page,null,'K32RUN01').catch(()=>null),results,runs},null,2)+'\n');
 await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;
}finally{await browser.close();}
