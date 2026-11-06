import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectClients} from './kgui32-client-inspect.mjs';
const [base='http://127.0.0.1:4176/',out='test-results/editor',video='pegc']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/kgui32/manifest.json',import.meta.url)));
const original=await readFile(new URL('../public/kgui32/'+manifest.image,import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
const fnv=s=>{let h=2166136261;for(const b of Buffer.from(s))h=Math.imul(h^b,16777619)>>>0;return h;};
await mkdir(out,{recursive:true});const results=[],errors=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));
async function inspect(){const s=await inspectClients(page);if(!s)return null;s.editors=s.cpu.diagnostics.map(d=>{const v=d.pm32?.samples;if(v?.[0]!==0x3345474b)return null;return Object.fromEntries(['magic','version','frames','events','bytes','hash','cursor','anchor','dirty','mode','top','heartbeat','error','history','redo','reserved'].map((k,i)=>[k,v[i]]));});return s;}
async function until(test,label){console.log('CHECK '+label);let s;for(let end=Date.now()+120000;Date.now()<end;){s=await inspect().catch(()=>null);if(s&&test(s))return s;await page.waitForTimeout(100);}throw Error(label+' '+JSON.stringify({e:s?.editors,app:s?.gui.app,states:s?.cpu.views}));}
const key=async text=>{await page.evaluate(text=>window.np2debug.np2.sendKeys(text),text);await page.waitForTimeout(250);};
const type=async text=>{await page.evaluate(text=>window.np2debug.np2.typeText(text),text);await page.waitForTimeout(250);};
async function click(x,y){await page.evaluate(({x,y})=>window.np2debug.np2.mouseMoveTo(x,y),{x,y});await until(s=>s.gui.app?.mx===x&&s.gui.app?.my===y,'pointer');for(const d of [1,0]){const before=(await inspect()).gui.app.heartbeat;await page.evaluate(d=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,d]),d);await until(s=>s.gui.app.heartbeat>=before+3,'guest consumes mouse transition '+d);}}
const pass=s=>{results.push(s);console.log('PASS '+s);};
try{
 await page.goto(new URL(`?fd1=./kgui32/${manifest.image}&run=1&mem=16&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);
 let s=await until(s=>s.gui.ready&&s.gui.app?.frames&&s.bridge?.ready,'desktop');const height=s.gui.height;
 await click(130,266);s=await until(s=>s.editors[0]?.frames>0&&!s.editors[0].error,'editor');
 if(process.argv[5]==='emergency'){
  await type('temporary');await until(s=>s.editors[0]?.dirty===1,'dirty editor before native emergency');await key('CTRL+G');
  s=await until(s=>!s.gui.ready&&s.gui.state===3,'native emergency cleanup');assert.equal(s.gui.cpu.reason,65);assert.equal(s.bridge.ready,0);assert.equal(s.bridge.arena,0);assert.equal(s.bridge.currentVector,s.bridge.oldVector);assert.equal(s.gui.cpu.freeBefore,s.gui.cpu.freeAfter);assert.equal(s.gui.cpu.largestBefore,s.gui.cpu.largestAfter);assert.equal(s.gui.dosBefore,s.gui.dosAfter);assert.ok(s.cpu.views.every(v=>v.state===0));
  const disk=Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');assert.equal(hash(disk),hash(original));pass('native emergency bypasses dirty-client negotiation and reclaims all owned resources without disk writes');
  await writeFile(join(out,'verification.json'),JSON.stringify({video,source:manifest.source_commit,image:manifest.sha256,results,errors},null,2));
 }else{
 await type('alpha\rbravo');s=await until(s=>s.editors[0]?.hash===fnv('alpha\nbravo'),'multiline');assert.equal(s.editors[0].dirty,1);
 await key('CTRL+A');await key('CTRL+C');await type('X');await until(s=>s.editors[0]?.hash===fnv('X'),'selection replacement');await key('CTRL+Z');await until(s=>s.editors[0]?.hash===fnv('alpha\nbravo'),'undo');await key('CTRL+Y');await until(s=>s.editors[0]?.hash===fnv('X'),'redo');
 pass('actual CPL3 multiline document, selection, clipboard and undo/redo');
 await key('F2');await until(s=>s.gui.app.active===0,'launcher');await click(130,266);s=await until(s=>s.editors[1]?.frames>0&&!s.editors[1].error,'peer editor');await key('CTRL+V');s=await until(s=>s.editors[1]?.hash===fnv('alpha\nbravo'),'cross process paste');assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);assert.notEqual(s.cpu.views[0].physical,s.cpu.views[1].physical);assert.equal(s.editors[0].hash,fnv('X'));assert.ok(s.editors[0].heartbeat>1);
 pass('clipboard copies between independently mapped editors without altering source');
 await key('CTRL+E');await type('!');s=await until(s=>s.editors[1]?.hash===fnv('alpha\nbravo!'),'editing keys do not end task');const gen=s.cpu.views[1].generation;
 await key('F10');await until(s=>s.editors[1]?.mode===2&&s.editors[0]?.mode===2,'desktop exit confirmation');await key('ESC');await until(s=>s.editors[1]?.mode===0,'cancel desktop exit');assert.equal((await inspect()).cpu.views[1].generation,gen);
 // Return to source and cancel its pending request, then test its title X.
 await click(330,height-16);await key('ESC');await until(s=>s.editors[0]?.mode===0,'cancel source request');await click(596,56);await until(s=>s.editors[0]?.mode===2,'title close confirmation');await key('ESC');await until(s=>s.editors[0]?.mode===0,'cancel title close');await type('Y');await until(s=>s.editors[0]?.hash===fnv('XY'),'text retained after close cancellation');
 pass('Ctrl+E remains an editing key; title X and F10 negotiate and allow cancellation');
 await key('CTRL+N');await until(s=>s.editors[0]?.mode===2,'new confirmation');await key('d');await until(s=>s.editors[0]?.bytes===0&&!s.editors[0].dirty,'new after discard');
 await key('CTRL+O');await until(s=>s.editors[0]?.mode===1,'common picker');await type('EDITTEST.TXT');await key('TAB');await key('ENTER');s=await until(s=>s.editors[0]?.mode===0&&s.editors[0]?.hash===fnv('EDITOR FIXTURE\nSecond line\n'),'actual file contents');assert.equal(s.editors[0].dirty,0);assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);
 await page.screenshot({path:join(out,'editor-picker-result.png')});pass('shared read-only picker opens real FAT fixture and releases handles');
 await key('CTRL+A');await key('HELP');await until(s=>s.editors[0]?.cursor===27&&s.editors[0]?.anchor===27,'End on trailing empty line');await key('UP');await key('HELP');await until(s=>s.editors[0]?.cursor===26,'End excludes newline');await key('DOWN');s=await until(s=>s.editors[0]?.cursor===27,'vertical cursor clamps to empty line');
 const stable=s.editors[0].hash,oldGeneration=s.cpu.views[0].generation;
 await click(118,90);s=await until(s=>s.cpu.views[0].state===3,'stop editor');const frozen=s.editors[0].heartbeat,peer=s.editors[1].heartbeat;
 s=await until(s=>s.editors[1]?.heartbeat>peer+2,'peer continues while editor stopped');assert.equal(s.editors[0].heartbeat,frozen);assert.equal(s.editors[0].hash,stable);
 await click(182,90);s=await until(s=>s.editors[0]?.heartbeat>frozen,'resume editor');assert.equal(s.editors[0].hash,stable);assert.equal(s.cpu.views[0].generation,oldGeneration);
 await click(246,90);await until(s=>s.cpu.views[0].state===0,'force end editor');
 await click(54,90);await type('KGEDIT.EXE fault\r');s=await until(s=>s.cpu.views[0].state===4&&s.cpu.views[0].fault===14,'actual editor page fault');assert.equal(s.cpu.views[0].cr2,0x10000);assert.equal(s.cpu.diagnostics[0].pm32.handle,0);assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);assert.equal(s.editors[1].hash,fnv('alpha\nbravo!'));
 await click(54,90);await type('KGEDIT.EXE\r');s=await until(s=>s.editors[0]?.frames>0&&s.cpu.views[0].state!==4&&s.cpu.views[0].generation>oldGeneration+1,'fresh editor after fault');assert.equal(s.editors[0].bytes,0);assert.equal(s.editors[0].dirty,0);
 pass('stop/resume preserves text, peer continues, and actual #PF reclaims owned resources before clean restart');
 await click(596,56);await until(s=>s.cpu.views[0].state===0,'clean editor close');await click(480,height-16);await key('F10');await until(s=>s.editors[1]?.mode===2,'last dirty editor close');await key('d');
 s=await until(s=>s.gui.state===3&&!s.gui.ready,'DOS return');
 assert.equal(s.bridge.ready,0);assert.equal(s.bridge.arena,0);assert.equal(s.bridge.currentVector,s.bridge.oldVector);assert.equal(s.gui.cpu.freeBefore,s.gui.cpu.freeAfter);assert.equal(s.gui.cpu.largestBefore,s.gui.cpu.largestAfter);assert.equal(s.gui.cpu.handle,0);assert.equal(s.gui.cpu.tablesCleared,1);assert.equal(s.gui.dosBefore,s.gui.dosAfter);assert.ok(s.cpu.views.every(v=>v.state===0));
 const disk=Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');assert.equal(hash(disk),hash(original));assert.deepEqual(errors,[]);pass('normal desktop exit and byte identical entire FAT12 disk');
 await writeFile(join(out,'verification.json'),JSON.stringify({video,source:manifest.source_commit,image:manifest.sha256,results,errors},null,2));
}
}catch(e){await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});await writeFile(join(out,'failure.json'),JSON.stringify(await inspect().catch(()=>null),null,2));throw e;}finally{await browser.close();}
