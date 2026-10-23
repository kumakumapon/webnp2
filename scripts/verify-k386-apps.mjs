// Real guest EXE execution and native KDESK application routing.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/k386-apps']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/k386/manifest.json',import.meta.url)));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const page=await browser.newPage(),results=[],snapshots=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const pause=ms=>page.waitForTimeout(ms);
const text=()=>page.evaluate(()=>window.np2debug.np2.getScreenText().text);
const wait=s=>page.waitForFunction(s=>{try{return window.np2debug.np2.getScreenText().text.includes(s);}catch{return false;}},s,{timeout:90000});
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await pause(200);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await pause(200);};
const file=async name=>Buffer.from(await page.evaluate(async name=>Array.from(await window.np2debug.np2.diskReadFile('fd1',name)),name));
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
const hash=b=>createHash('sha256').update(b).digest('hex');
const until=async(predicate,label)=>{
 let record;
 for(let i=0;i<400;i++){
  const cpu=await inspectK386(page),resources=await inspectResources(page);record={cpu,resources};
  if(cpu&&resources&&predicate(record))return record;await pause(150);
 }throw new Error(label+': '+JSON.stringify(record));
};
const find=async query=>{
 await key('CTRL+K');await wait('Find apps');await type(query);
 await page.waitForFunction(query=>{
  const l=window.np2debug.np2.getScreenText().lines;
  return l[5]?.slice(15,64).trim().replace(/_$/,'')===query&&l[20]?.slice(14,59).trim().startsWith('1 results -');
 },query,{timeout:60000});
 await key('ENTER');
};
const pass=s=>{results.push(s);console.log('PASS '+s);};
try{
 await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=16&clk=8&worklet=0`,base).href);
 await wait('Ready');assert.equal(hash(await disk()),manifest.sha256);
 const stems='KSH COUNTER ECHO FAULT KFILE PORT DF FPU FLAGS DTA KEYCHK TIMER MEMORY PROCESS BADTIMER ROMWRITE INTWAIT KHELLO'.split(' ');
 const files=await page.evaluate(async()=> (await window.np2debug.np2.diskListFiles('fd1')).entries.map(e=>e.name));
 for(const stem of stems){
  assert.ok(!files.includes(stem+'.COM'));
  const exe=await file(stem+'.EXE');assert.equal(exe.toString('ascii',0,2),'MZ');
  assert.equal(exe.toString('ascii',28,36),'K386APP1');assert.equal(exe.readUInt16LE(36),0x0100);
  assert.ok(exe.readUInt16LE(6)>0);assert.equal(exe.readUInt16LE(24),72);
  assert.equal((exe.readUInt16LE(4)-1)*512+(exe.readUInt16LE(2)||512),exe.length);
 }
 pass('18 shipped text applications are real MZ modules with relocations and ABI descriptors; old application COM files are absent');
 // Real DOS prepares a renamed app on a disposable browser disk, then tests
 // the safe error outside V86 even though the monitor TSR itself is installed.
 await key('F10');await wait('KDESK exited.');await type('KHELLO.EXE\r');
 await wait('Open this application in KDESK/386.');
 await type('COPY KHELLO.EXE 000APP.EXE\r');
 await page.waitForFunction(async()=>{try{return (await window.np2debug.np2.diskReadFile('fd1','000APP.EXE')).length>0;}catch{return false;}},null,{timeout:60000});
 assert.deepEqual(await file('000APP.EXE'),await file('KHELLO.EXE'));
 const prepared=hash(await disk());
 await type('KDESK.EXE\r');await wait('Ready');
 await key('F3');await wait('Parent');await key('HELP');await wait('000APP.EXE');await key('ENTER');
 let r=await until(r=>r.resources.usage[0].program==='000APP.EXE'&&r.cpu.views[0].state===2,'Renamed EXE opened from native file icons');
 assert.ok(r.cpu.views[0].screen.includes('Session: 1'));
 const d=r.cpu.diagnostics[0],v=r.cpu.views[0],raw=await file('000APP.EXE');
 assert.equal(d.frame.cs,v.psp+16);assert.equal(d.frame.ds,v.psp+16);assert.equal(d.frame.ss,v.psp+16);assert.equal(d.frame.fs,v.psp);
 assert.ok(d.frame.eflags&0x20000);
 const module=Buffer.from(raw.subarray(raw.readUInt16LE(8)*16));
 for(let i=0;i<raw.readUInt16LE(6);i++){
  const at=raw.readUInt16LE(24)+i*4,target=raw.readUInt16LE(at)+16*raw.readUInt16LE(at+2);
  module.writeUInt16LE((module.readUInt16LE(target)+v.psp+16)&65535,target);
 }
 assert.deepEqual(Buffer.from(d.memory.slice(256,512)),module.subarray(0,256));
 snapshots.push({stage:'renamed-exe',...r});
 pass('file icons recognize app metadata independently of its filename; real CPU segments/PSP and relocated RAM match the EXE');
 await find('background counter');
 const started=await until(r=>r.resources.usage[1].program==='COUNTER.EXE'&&r.cpu.views[1].state===1&&r.cpu.views[1].counter>0,'Second application starts');
 assert.notEqual(started.cpu.views[0].physical,started.cpu.views[1].physical);assert.notEqual(started.cpu.views[0].cr3,started.cpu.views[1].cr3);
 await find('keyboard echo');await wait('Both DOS windows are in use');
 r=await until(r=>r.cpu.views[1].counter>started.cpu.views[1].counter,'Busy session keeps executing');
 assert.deepEqual(r.resources.usage.map(u=>u.generation),started.resources.usage.map(u=>u.generation));
 assert.equal(r.resources.usage[0].program,'000APP.EXE');
 await key('CTRL+N');await type('X');await until(r=>r.cpu.views[0].state===0,'First EXE exits');
 await find('keyboard echo');r=await until(r=>r.resources.usage[0].program==='ECHO.EXE'&&r.cpu.views[0].state===2,'Freed slot reused');
 await type('PRIVATE INPUT');r=await until(r=>r.cpu.views[0].screen.includes('PRIVATE INPUT'),'Input to EXE');
 assert.ok(!r.cpu.views[1].screen.includes('PRIVATE INPUT'));
 snapshots.push({stage:'coexisting-apps',...r});
 pass('search starts a second app, refuses to overwrite two live sessions, reuses an ended slot and routes input independently');
 await key('CTRL+O');const before=await until(r=>r.cpu.views[1].state===1,'Counter active');
 await key('CTRL+L');await type('BADAPP.EXE\r');await wait('Cannot load program');
 r=await until(r=>r.cpu.views[1].counter>before.cpu.views[1].counter,'Invalid application ABI leaves CPU alive');
 assert.equal(r.cpu.views[1].physical,before.cpu.views[1].physical);assert.equal(r.resources.usage[1].generation,before.resources.usage[1].generation);
 await key('ESC');await key('F4');await type('EXE APPS RUN IN BACKGROUND');await wait('EXE APPS RUN');
 await until(r=>r.cpu.views[1].counter>before.cpu.views[1].counter,'Native Memo coexists');
 await page.screenshot({path:join(output,'exe-applications.png')});
 pass('unsupported application ABI is rejected before replacing RAM; background execution coexists with native GUI apps');
 await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');
 assert.equal(hash(await disk()),prepared);assert.deepEqual(errors,[]);
 pass('clean shutdown preserves every byte of the prepared FAT12 disk');
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,image:manifest.image,sha256:manifest.sha256,prepared,results,snapshots},null,2)+'\n');
}catch(e){
 console.error(await text().catch(()=>''));await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;
}finally{await browser.close();}
