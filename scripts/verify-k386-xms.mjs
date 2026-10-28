// Real V86 applications and the actual PC-98 XMS driver; no mocked CPU/driver.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
import {inspectXms} from './k386-xms.mjs';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/k386-xms']=process.argv.slice(2);
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
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
const hash=b=>createHash('sha256').update(b).digest('hex');
const until=async(predicate,label)=>{
 let record;const deadline=Date.now()+180000;
 for(let i=0;Date.now()<deadline;i++){
  const cpu=await inspectK386(page),resources=await inspectResources(page),xms=await inspectXms(page);record={cpu,resources,xms};
  if(cpu&&cpu.views.some(v=>v.screen.includes('XMS FAIL')))throw new Error(JSON.stringify(record));
  if(cpu&&resources&&xms&&predicate(record))return record;
  if(i&&i%100===0)console.log('WAIT '+label+': '+JSON.stringify({states:cpu?.views.map(v=>v.state),pending:xms?.pending}));await pause(150);
 }throw new Error(label+': '+JSON.stringify(record));
};
const run=async(id,path)=>{await key(id?'CTRL+O':'CTRL+N');await key('CTRL+L');await type(path+'\r');};
const pass=s=>{results.push(s);console.log('PASS '+s);};
try{
 await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=16&clk=8&worklet=0`,base).href);
 await wait('Ready');assert.equal(hash(await disk()),manifest.sha256);
 await run(0,'XMEM.EXE');
 let r=await until(r=>r.cpu.views[0].screen.includes('XMS READY'),'first 1 MiB diagnostic');
 assert.equal(r.xms.sessions[0].length,1);assert.equal(r.xms.sessions[0][0].bytes,1048576);
 snapshots.push({stage:'first-app',...r});
 pass('real EXE verifies all bytes of a zeroed 1 MiB XMS block, writes and reads its complete pattern, tests odd copies and rejects overflow');
 await run(1,'XMEM.EXE');
 r=await until(r=>r.cpu.views.every(v=>v.state===2&&v.screen.includes('XMS READY')),'two 1 MiB diagnostics');
 assert.notEqual(r.cpu.views[0].cr3,r.cpu.views[1].cr3);assert.notEqual(r.xms.sessions[0][0].handle,r.xms.sessions[1][0].handle);
 assert.notEqual(r.xms.sessions[0][0].token,r.xms.sessions[1][0].token);
 for(let id=0;id<2;id++){
  assert.equal(r.xms.sessions[id][0].owner,r.cpu.views[id].psp);assert.equal(r.xms.sessions[id][0].initialized,1048576);
  assert.equal(r.resources.usage[id].memoryKiB,664+1024);
  assert.ok(r.cpu.diagnostics[id].frame.eflags&0x20000);
 }
 snapshots.push({stage:'two-apps',...r});
 await type('t');await until(r=>r.cpu.views[1].screen.includes('XMS FOREIGN REJECTED'),'session 2 foreign rejection');
 await key('CTRL+N');await type('t');await until(r=>r.cpu.views[0].screen.includes('XMS FOREIGN REJECTED'),'session 1 foreign rejection');
 pass('two real V86 sessions retain distinct 1 MiB patterns and XMS handles; foreign tokens are rejected and Tasks accounts for their allocations');
 await type('p');r=await until(r=>r.cpu.views[0].screen.includes('XMS PARENT RETAINED'),'nested EXEC XMS ownership');
 assert.ok(r.cpu.views[0].screen.includes('XMS CHILD OK'));assert.equal(r.xms.sessions[0].length,1);assert.equal(r.resources.usage[0].depth,1);
 snapshots.push({stage:'parent-restored',...r});
 pass('nested EXE cannot read parent XMS; child allocation is reaped and the parent resumes with retained data');
 // The other session keeps its data while the desktop owns keyboard focus.
 await key('F4');await type('XMS APPLICATIONS COEXIST');await wait('XMS APPLICATIONS');
 await key('CTRL+O');await type('r');await until(r=>r.cpu.views[1].screen.includes('XMS RETAINED DATA OK'),'retained second pattern');
 await page.screenshot({path:join(output,'xms-applications.png')});
 await key('CTRL+N');await type('q');r=await until(r=>r.cpu.views[0].state===0&&r.xms.sessions[0].length===0,'normal exit XMS cleanup');
 assert.equal(r.xms.sessions[1].length,1);
 await key('CTRL+O');await type('f');r=await until(r=>r.cpu.views[1].state===4&&r.xms.sessions[1].length===0,'fault XMS cleanup');
 snapshots.push({stage:'exit-and-fault',...r});
 pass('native GUI coexistence, session switching and pattern retention; normal exit and a real protection fault release only their own XMS');
 // Pending initialization must also be cancellable without publishing data.
 await run(0,'XMEM.EXE');await key('CTRL+E');
 r=await until(r=>r.cpu.views[0].state===0&&r.xms.sessions[0].length===0,'End cancels allocation');
 await run(1,'XMEM.EXE');
 r=await until(r=>r.cpu.views[1].screen.includes('XMS READY')&&r.cpu.views[1].state===2,'reused session is zero initialized');
 const token=r.xms.sessions[1][0].token;assert.ok(token>2);
 await key('CTRL+C');r=await until(r=>r.cpu.views[1].state===0&&r.xms.sessions[1].length===0,'interrupt XMS cleanup');
 snapshots.push({stage:'reuse-and-interrupt',...r});
 pass('End and interrupt reclaim memory; restarted applications receive a fresh token and zeroed data');
 await run(0,'COUNTER.EXE');const before=await until(r=>r.cpu.views[0].counter>0,'background CPU loop');
 const starting=run(1,'XMEM.EXE');
 r=await until(r=>r.xms.pending[1]&&r.xms.sessions[1][0]?.initialized>0&&r.xms.sessions[1][0].initialized<1048576&&r.cpu.views[0].counter>before.cpu.views[0].counter,'bounded initialization with another CPU running');
 snapshots.push({stage:'incremental-initialization',...r});await starting;
 await key('F4');await wait('XMS APPLICATIONS');
 await run(1,'ECHO.EXE');
 r=await until(r=>r.resources.usage[1].program==='ECHO.EXE'&&r.cpu.views[1].state===2&&!r.xms.sessions[1].length&&r.cpu.views[0].counter>before.cpu.views[0].counter,'root replacement cleanup');
 snapshots.push({stage:'root-replaced',...r});
 await key('CTRL+E');await key('CTRL+N');await key('CTRL+E');
 pass('actual pending zero initialization yields to another V86 CPU and native GUI; root replacement reclaims its XMS');
 await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');
 assert.equal(hash(await disk()),manifest.sha256);assert.deepEqual(errors,[]);
 pass('clean desktop exit preserves every byte of the FAT12 disk');
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,image:manifest.image,sha256:manifest.sha256,results,snapshots},null,2)+'\n');
}catch(e){console.error(await text().catch(()=>''));await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;}
finally{await browser.close();}
