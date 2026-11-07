import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {assertProtected,inspectFat,fullWorkspace,wideWorkspace} from './kgui32-workspace-fat.mjs';
import {inspectClients} from './kgui32-client-inspect.mjs';
const [base='http://127.0.0.1:4176/',out='test-results/editor',video='pegc']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/kgui32/manifest.json',import.meta.url)));
const original=await readFile(new URL('../public/kgui32/'+manifest.image,import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
const fnv=s=>{let h=2166136261;for(const b of Buffer.from(s))h=Math.imul(h^b,16777619)>>>0;return h;};
await mkdir(out,{recursive:true});const results=[],errors=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
let page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));
async function inspect(){const s=await inspectClients(page);if(!s)return null;s.editors=s.cpu.diagnostics.map(d=>{const v=d.pm32?.samples;if(v?.[0]!==0x3345474b)return null;return Object.fromEntries(['magic','version','frames','events','bytes','hash','cursor','anchor','dirty','mode','top','heartbeat','error','history','redo','reserved'].map((k,i)=>[k,v[i]]));});s.canvases=s.bridge?.arena?await page.evaluate(arena=>[0,1].map(id=>{
 const b=atob(window.np2debug.np2.readMemoryBase64(arena*16+id*4096,3144).base64),d=o=>(b.charCodeAt(o)|b.charCodeAt(o+1)<<8|b.charCodeAt(o+2)<<16|b.charCodeAt(o+3)<<24)>>>0;
 return {width:d(28),height:d(32),controls:Array.from({length:Math.min(d(36),40)},(_,i)=>72+i*76).filter(at=>d(at)===3).map(at=>d(at+24))};
}),s.bridge.arena):[];return s;}
async function until(test,label){console.log('CHECK '+label);let s;for(let end=Date.now()+120000;Date.now()<end;){s=await inspect().catch(()=>null);if(s&&test(s))return s;await page.waitForTimeout(100);}throw Error(label+' '+JSON.stringify({e:s?.editors,app:s?.gui.app,states:s?.cpu.views}));}
const key=async text=>{await page.evaluate(text=>window.np2debug.np2.sendKeys(text),text);await page.waitForTimeout(250);};
const type=async text=>{await page.evaluate(text=>window.np2debug.np2.typeText(text),text);await page.waitForTimeout(250);};
async function click(x,y){await page.evaluate(({x,y})=>window.np2debug.np2.mouseMoveTo(x,y),{x,y});await until(s=>s.gui.app?.mx===x&&s.gui.app?.my===y,'pointer');for(const d of [1,0]){const before=(await inspect()).gui.app.heartbeat;await page.evaluate(d=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,d]),d);await until(s=>s.gui.app.heartbeat>=before+3,'guest consumes mouse transition '+d);}}
async function drag(x,y,toX,toY){await page.evaluate(({x,y})=>window.np2debug.np2.mouseMoveTo(x,y),{x,y});await until(s=>s.gui.app.mx===x&&s.gui.app.my===y,'resize grip');let before=(await inspect()).gui.app.heartbeat;await page.evaluate(()=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,1]));await until(s=>s.gui.app.heartbeat>=before+3,'resize down');await page.evaluate(({x,y})=>window.np2debug.np2.mouseMoveTo(x,y),{x:toX,y:toY});await until(s=>s.gui.app.mx===toX&&s.gui.app.my===toY,'resized pointer');before=(await inspect()).gui.app.heartbeat;await page.evaluate(()=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,0]));await until(s=>s.gui.app.heartbeat>=before+3,'resize released');}
const criticalVector=async()=>page.evaluate(()=>window.np2debug.np2.readMemoryBase64(0x24*4,4).base64);
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
const bootURL=()=>new URL(`?fd1=./kgui32/${manifest.image}&run=1&mem=16&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href;
const pass=s=>{results.push(s);console.log('PASS '+s);};
async function launch(){await key('F2');await until(s=>s.gui.app?.active===0,'launcher');await click(130,266);return until(s=>s.editors.some(e=>e?.frames>0),'editor launched');}
async function workspaceOpen(id,name){
 await key('CTRL+O');let s=await until(s=>s.editors[id]?.mode===1&&s.canvases[id]?.controls.includes(703),'Open picker');
 if(id===0)await key('CTRL+W');else await click(24+id*8+s.canvases[id].width-40,120+id*8);await type(name);await key('TAB');await key('ENTER');
 return until(s=>s.editors[id]?.mode===0&&!s.editors[id]?.dirty,'workspace opened');
}
async function nameAs(name){await key('CTRL+W');await until(s=>s.editors[s.gui.app.active-2]?.mode===3,'Save As');await key('HOME');for(let i=0;i<12;i++)await key('DEL');await type(name);await key('ENTER');}
function cleanup(s){assert.equal(s.bridge.ready,0);assert.equal(s.bridge.arena,0);assert.equal(s.bridge.currentVector,s.bridge.oldVector);assert.equal(s.gui.cpu.freeBefore,s.gui.cpu.freeAfter);assert.equal(s.gui.cpu.largestBefore,s.gui.cpu.largestAfter);assert.equal(s.gui.cpu.handle,0);assert.equal(s.gui.cpu.tablesCleared,1);assert.equal(s.gui.dosBefore,s.gui.dosAfter);assert.ok(s.cpu.views.every(v=>v.state===0));}
try{
 const full=process.argv[5]==='full',wide=process.argv[5]==='wide';const bootDisk=full?fullWorkspace(original):wide?wideWorkspace(original):original;
 if(full||wide)await page.route('**/kgui32/'+manifest.image,route=>route.fulfill({body:bootDisk,contentType:'application/octet-stream'}));
 await page.goto(bootURL());let s=await until(s=>s.gui.ready&&s.gui.app?.frames&&s.bridge?.ready,'desktop');const oldCritical=await criticalVector();await launch();
 if(wide){
  await click(246,90);await until(s=>s.cpu.views[0].state===0,'end initial editor for wide probe');await key('CTRL+L');await type('KGSAVE64.EXE\r');s=await until(s=>s.cpu.views[0].state===0&&s.cpu.diagnostics[0].pm32?.samples?.[0]===0x3457474b,'64 KiB CPL3 save probe');assert.equal(s.cpu.diagnostics[0].pm32.samples[2],23);assert.equal(s.cpu.diagnostics[0].pm32.samples[3],0);assert.equal(s.cpu.diagnostics[0].pm32.exitCode,0);assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);
  const fat=assertProtected(bootDisk,await disk()),expected=Buffer.alloc(65536);for(let i=0;i<expected.length;i++)expected[i]=i%79===78?10:65+i%26;expected[0]=33;expected[65535]=63;assert.deepEqual(fat.files.get('WORK/WIDE.TXT'),expected);assert.ok(!fat.files.has('WORK/WIDE.TMP')&&!fat.files.has('WORK/WIDE.BAK'));await key('F10');s=await until(s=>!s.gui.ready&&s.gui.state===3,'DOS after wide probe');cleanup(s);assert.equal(await criticalVector(),oldCritical);assertProtected(bootDisk,await disk());pass('actual CPL3 creates, replaces, reads and verifies all 65,536 bytes across DOS/XMS boundaries without leaks or unrelated changes');
 }else{
 const initial='saved text\nsecond line';await type(initial.replaceAll('\n','\r'));await until(s=>s.editors[0]?.hash===fnv(initial),'typed document');
 await key('CTRL+S');await until(s=>s.editors[0]?.mode===3&&s.canvases[0]?.controls.includes(701),'Save opens shared Save As dialog');
 if(video==='cirrus'){await drag(600,454,600,302);await until(s=>s.canvases[0]?.height===168&&s.canvases[0]?.controls.includes(701),'save picker at minimum height');await drag(600,302,600,454);await until(s=>s.canvases[0]?.height===320&&s.canvases[0]?.controls.includes(701),'save picker restored');}
 await type('NOTE.TXT');await key('ENTER');
 if(full){
  s=await until(s=>s.editors[0]?.mode===0&&s.editors[0]?.error===28,'real full disk failure');assert.equal(s.editors[0].dirty,1);assert.equal(s.editors[0].hash,fnv(initial));assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);
  let fat=assertProtected(bootDisk,await disk());assert.ok(!fat.files.has('WORK/NOTE.TXT'));assert.ok(![...fat.files.keys()].some(n=>n.endsWith('.TMP')||n.endsWith('.BAK')));assert.deepEqual(fat.files.get('WORK/FULL.BIN'),inspectFat(bootDisk).files.get('WORK/FULL.BIN'));
  await key('ENTER');await key('F10');await until(s=>s.editors[0]?.mode===2,'dirty full-disk exit confirmation');await key('d');s=await until(s=>!s.gui.ready&&s.gui.state===3,'DOS after full-disk failure');cleanup(s);assert.equal(await criticalVector(),oldCritical);assertProtected(bootDisk,await disk());
  pass('real DOS disk-full short write preserves editor text and protected files, removes temporary file and reclaims resources');
 }else{
  s=await until(s=>s.editors[0]?.mode===0&&s.editors[0]?.dirty===0,'new file saved');let fat=assertProtected(original,await disk());assert.equal(fat.files.get('WORK/NOTE.TXT').toString(),initial);assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);pass('new ASCII document saved by actual DOS into a valid FAT12 workspace');
  await type('!');await key('CTRL+S');await until(s=>s.editors[0]?.dirty===0&&s.editors[0]?.hash===fnv(initial+'!'),'Save overwrites current workspace file');fat=assertProtected(original,await disk());assert.equal(fat.files.get('WORK/NOTE.TXT').toString(),initial+'!');assert.ok(!fat.files.has('WORK/NOTE.BAK'));assert.ok(!fat.files.has('WORK/NOTE.TMP'));
  await key('CTRL+Z');await until(s=>s.editors[0]?.dirty===1,'undo saved text becomes modified');await key('CTRL+Y');await until(s=>s.editors[0]?.dirty===0,'redo to saved baseline clears modified');pass('checked overwrite, temporary/backup cleanup and history-preserving saved baseline');
  const unchanged=hash(await disk());await nameAs('NOTE.TXT');await until(s=>s.editors[0]?.mode===4,'overwrite confirmation');await key('ESC');await until(s=>s.editors[0]?.mode===0,'cancel overwrite');assert.equal(hash(await disk()),unchanged);
  await key('CTRL+W');await until(s=>s.editors[0]?.mode===3,'save picker cancellation');await key('ESC');await until(s=>s.editors[0]?.mode===0,'save picker cancelled');assert.equal(hash(await disk()),unchanged);
  await nameAs('COPY.TXT');s=await until(s=>s.editors[0]?.mode===0&&!s.editors[0]?.dirty,'Save As a second file');fat=assertProtected(original,await disk());assert.equal(fat.files.get('WORK/COPY.TXT').toString(),initial+'!');assert.equal(fat.files.get('WORK/NOTE.TXT').toString(),initial+'!');pass('shared Save As, cancellation without any disk changes and independent filenames');
  await key('CTRL+N');await until(s=>s.editors[0]?.bytes===0,'new empty document');await key('CTRL+S');await until(s=>s.editors[0]?.mode===3,'empty Save As');await type('EMPTY.TXT');await key('ENTER');await until(s=>s.editors[0]?.mode===0&&!s.editors[0]?.dirty,'empty file saved');fat=assertProtected(original,await disk());assert.equal(fat.files.get('WORK/EMPTY.TXT').length,0);
  await workspaceOpen(0,'NOTE.TXT');await until(s=>s.editors[0]?.hash===fnv(initial+'!'),'saved file reopened from Work');
  await launch();await until(s=>s.editors[1]?.frames>0,'second editor');await workspaceOpen(1,'NOTE.TXT');s=await until(s=>s.editors[1]?.hash===fnv(initial+'!'),'peer reads same revision');assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);assert.notEqual(s.cpu.views[0].physical,s.cpu.views[1].physical);
  await key('CTRL+A');await type('peer revision');await key('CTRL+S');await until(s=>s.editors[1]?.dirty===0,'peer saves new revision');const peerHeartbeat=(await inspect()).editors[1].heartbeat;
  await click(330,s.gui.height-16);await key('CTRL+A');await type('stale editor');await key('CTRL+S');s=await until(s=>s.editors[0]?.error===116,'stale overwrite refused');assert.equal(s.editors[0].dirty,1);assert.equal(s.editors[0].hash,fnv('stale editor'));assert.ok(s.editors[1].heartbeat>peerHeartbeat);assert.equal(assertProtected(original,await disk()).files.get('WORK/NOTE.TXT').toString(),'peer revision');await key('ENTER');
  pass('two real CPL3 editors remain isolated and reject a stale saved-file revision without losing either document');
  await nameAs('RESCUE.TXT');await until(s=>!s.editors[0]?.dirty&&s.editors[0]?.error===0,'Save As resolves conflict');await type('!');await key('F10');await until(s=>s.editors[0]?.mode===2,'Save on normal desktop close');await key('s');s=await until(s=>!s.gui.ready&&s.gui.state===3,'saved desktop returns to DOS');cleanup(s);
  assert.equal(await criticalVector(),oldCritical);const saved=await disk();fat=assertProtected(original,saved);assert.equal(fat.files.get('WORK/RESCUE.TXT').toString(),'stale editor!');assert.equal(fat.files.get('WORK/NOTE.TXT').toString(),'peer revision');assert.ok(![...fat.files.keys()].some(n=>n.endsWith('.TMP')||n.endsWith('.BAK')));await writeFile(join(out,'saved.xdf'),saved);pass('Save on close completes before normal exit and all handles, pages, hooks and conventional allocations are reclaimed');
  // Boot a fresh browser context from the exported bytes, not a RAM snapshot.
  await page.context().close();page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/kgui32/'+manifest.image,route=>route.fulfill({body:saved,contentType:'application/octet-stream'}));await page.goto(bootURL());await until(s=>s.gui.ready&&s.gui.app?.frames,'fresh boot from saved disk');await launch();await workspaceOpen(0,'RESCUE.TXT');s=await until(s=>s.editors[0]?.hash===fnv('stale editor!')&&!s.editors[0]?.dirty,'saved contents after cold boot');assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);await page.screenshot({path:join(out,'reopened-after-cold-boot.png')});
  // Exercise the actual broker's permission/pointer/feature checks in CPL3.
  await key('F2');await until(s=>s.gui.app.active===0,'launcher before diagnostics');await click(130,266);await until(s=>s.editors[1]?.frames>0,'diagnostic slot');await click(480,s.gui.height-16);await click(254,98);await until(s=>s.cpu.views[1].state===0,'end empty peer');
  for(const [name,count] of [['KGSAVEB.EXE',24],['KGSAVENO.EXE',1]]){await key('CTRL+L');await type(name+'\r');s=await until(s=>s.cpu.views[1].state===0&&s.cpu.diagnostics[1].pm32?.samples?.[0]===0x3453474b,'CPL3 '+name);assert.equal(s.cpu.diagnostics[1].pm32.samples[2],count);assert.equal(s.cpu.diagnostics[1].pm32.samples[3],0);assert.equal(s.cpu.diagnostics[1].pm32.exitCode,0);assert.equal(s.cpu.diagnostics[1].pm32.openFiles,0);}
  await key('F10');s=await until(s=>!s.gui.ready&&s.gui.state===3,'final DOS');cleanup(s);assert.equal(hash(await disk()),hash(saved));pass('cold boot retains exact file bytes; real CPL3 boundary/feature probes refuse invalid requests without disk changes');
 }
 }
 assert.deepEqual(errors,[]);await writeFile(join(out,'verification.json'),JSON.stringify({video,source:manifest.source_commit,image:manifest.sha256,results,errors},null,2));
}catch(e){await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});await writeFile(join(out,'failure.json'),JSON.stringify(await inspect().catch(()=>null),null,2));throw e;}finally{await browser.close();}
