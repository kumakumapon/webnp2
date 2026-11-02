// Real PC-98 PM32/CPL3, architectural exceptions and hardware IRQ0, followed by V86 recovery.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectRing3Probe} from './k38632-inspect.mjs';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
import {counterPairReady,counterPairAdvanced} from './k386-counter-progress.mjs';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/k38632']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/k386/manifest.json',import.meta.url)));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const page=await browser.newPage(),results=[],probes=[],snapshots=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const pause=ms=>page.waitForTimeout(ms);
const text=()=>page.evaluate(()=>window.np2debug.np2.getScreenText().text);
const wait=s=>page.waitForFunction(s=>{try{return window.np2debug.np2.getScreenText().text.includes(s);}catch{return false;}},s,{timeout:90000});
const prompt=()=>page.waitForFunction(()=>window.np2debug.np2.getScreenText().lines.some(l=>l.trim()==='A>'),null,{timeout:60000});
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await pause(200);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await pause(200);};
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
const hash=b=>createHash('sha256').update(b).digest('hex');
const until=async(predicate,label)=>{
 let last;
 for(let end=Date.now()+90000;Date.now()<end;){const cpu=await inspectK386(page),resources=await inspectResources(page);last={cpu,resources};if(cpu&&resources&&predicate(last))return last;await pause(150);}
 await writeFile(join(output,'failure-state.json'),JSON.stringify({label,last,probes,snapshots},null,2)+'\n');throw new Error(label);
};
const pass=s=>{results.push(s);console.log('PASS '+s);};
function verify(p){
 assert.equal(p.error,0);assert.equal(p.refused,0);assert.equal(p.complete,31);
 assert.equal(p.restoredCR0,p.savedCR0);assert.equal(p.restoredCR3,p.savedCR3);assert.equal(p.savedCR0&1,0);
 assert.deepEqual(p.restoredGDT,p.savedGDT);assert.deepEqual(p.restoredIDT,p.savedIDT);
 assert.equal(p.restoredFlags,p.savedFlags);assert.equal(p.restoredMask,p.savedMask);assert.equal(p.savedMask&1,1);
 assert.equal(p.pdes[0]&7,3);assert.equal(p.pdes[1]&7,7);
 assert.deepEqual(p.ptes.map(x=>x&7),[5,7,0,7]);
 assert.equal(p.pdes[0]&0xfffff000,p.pd+4096);assert.equal(p.pdes[1]&0xfffff000,p.pd+8192);
 assert.deepEqual(p.ptes.map(x=>x&0xfffff000),[p.pd+12288,p.pd+16384,0,p.pd+20480]);
 assert.deepEqual(p.cases.map(c=>c.vector),[48,32,14,13,8]);
 for(let i=0;i<5;i++){
  const c=p.cases[i];assert.equal(c.index,i);assert.equal(c.cs,59);assert.equal(c.cs&3,3);assert.equal(c.ss,67);
  assert.equal(c.cr0&1,1);assert.equal(c.cr0>>>31,1);assert.equal(c.cr3,p.pd);
  assert.equal(c.eflags&0x27200,0x200);assert.equal(c.userFlags&0x27200,0x200);
  assert.equal(c.userCS,59);assert.equal(c.userSS,67);assert.equal(c.userDS,67);
  assert.equal(c.userSP,0x804000);assert.equal(c.esp,0x804000);
  assert.ok(c.eip>=0x800000&&c.eip<0x801000);
  assert.equal(c.restoredCR0,p.savedCR0);assert.equal(c.restoredCR3,p.savedCR3);
  assert.equal(c.restoredFlags,c.savedFlags);assert.equal(c.restoredMask,p.savedMask);
  assert.equal(c.pfGateAccess,i===4?0x0e:0x8e);
  if(i!==1)assert.equal(c.cookie,0x32320001);
 }
 const timer=p.cases[1];assert.ok(timer.cookie>0);assert.equal(timer.picISR&1,1);
 assert.equal(p.cases[2].error,4);assert.equal(p.cases[2].cr2,0xc00000);
 assert.equal(p.cases[3].error,0);assert.equal(p.cases[4].error,0);assert.equal(p.cases[4].picISR&1,0);
}
async function probe(previous){
 await type('K32CPU\r');
 await page.waitForFunction(()=>/K32CPU (PASS|FAIL|REFUSED)/.test(window.np2debug.np2.getScreenText().text),null,{timeout:60000});
 // Wait for a new CPU-generated tag; a previous PASS line may still be visible.
 let p;
 for(let i=0;i<200;i++){p=await inspectRing3Probe(page,previous);if(p)break;await pause(100);}
 assert.ok(p,'New live Ring-3 record');verify(p);await prompt();probes.push(p);return p;
}
try{
 await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=16&clk=8&worklet=0`,base).href);
 await wait('Ready');assert.equal(hash(await disk()),manifest.sha256);
 await key('F10');await wait('KDESK exited.');await prompt();
 const first=await probe(null);pass('actual CPL3/VM=0/PE+PG, user read-only code/RW data/guard/stack pages and DPL3 exit return');
 pass('infinite PM32 loop is preempted by actual PC-98 IRQ0 (PIC ISR bit 0), separately from CPU-generated #DF on vector 8');
 pass('contained user #PF/#GP and genuine #DF return to real DOS with CR0/CR3/GDT/IDT/flags/PIC mask restored');
 await probe(first.tag);await page.screenshot({path:join(output,'ring3-dos-return.png')});
 pass('repeated complete Ring-3 probe uses a fresh hardware-clock tag and restores DOS again');
 await type('KDESK\r');await wait('Ready');
 await key('CTRL+N');await wait('K386 DOS shell');await type('COUNTER\r');
 await key('CTRL+O');await wait('K386 DOS shell');await type('COUNTER\r');
 const started=await until(counterPairReady,'Two V86 children after PM32 probe');
 const before=await until(r=>counterPairAdvanced(started,r),'Both actual V86 CPUs advance');
 await key('F4');await type('RING3 RETURNED SAFELY');await wait('RING3 RETURNED SAFELY');
 const after=await until(r=>counterPairAdvanced(before,r),'V86 background execution with Memo focused');
 assert.notEqual(after.cpu.views[0].physical,after.cpu.views[1].physical);assert.notEqual(after.cpu.views[0].cr3,after.cpu.views[1].cr3);
 snapshots.push({stage:'after-probe-before',...before},{stage:'after-probe-gui',...after});
 pass('KDESK restarts, two isolated V86 COUNTER EXEs resume background execution and native Memo remains usable');
 // A COM launched inside V86 must refuse ownership before attempting mode changes.
 await key('CTRL+N');await key('CTRL+C');
 await until(r=>r.resources.usage[0].program==='KSH.EXE'&&r.cpu.views[0].state===2,'First shell restored');
 await type('K32CPU\r');
 const refused=await until(r=>r.cpu.views[0].screen.includes('K32CPU REFUSED: protected/V86 owner present')&&r.resources.usage[0].program==='KSH.EXE'&&r.cpu.views[0].state===2,'Live V86 ownership refusal');
 await until(r=>r.cpu.views[1].counter>refused.cpu.views[1].counter,'Other V86 CPU survives refusal');
 snapshots.push({stage:'v86-owner-refused',...refused});await page.screenshot({path:join(output,'kdesk-v86-recovery.png')});
 pass('probe refuses an existing live V86 owner and returns to its shell while the other CPU continues');
 await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');await prompt();
 await probe(probes.at(-1).tag);
 assert.equal(hash(await disk()),manifest.sha256);assert.deepEqual(errors,[]);
 pass('a further probe after full GUI/V86 teardown succeeds; every FAT12 disk byte remains unchanged');
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,image:manifest.image,sha256:manifest.sha256,results,probes,snapshots},null,2)+'\n');
}catch(e){console.error(await text().catch(()=>''));await writeFile(join(output,'failure-cpu.json'),JSON.stringify({cpu:await page.evaluate(()=>window.np2debug.np2.dbgReadRegs()).catch(()=>null),probe:await inspectRing3Probe(page).catch(()=>null),probes,snapshots},null,2)+'\n').catch(()=>{});await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;}
finally{await browser.close();}
