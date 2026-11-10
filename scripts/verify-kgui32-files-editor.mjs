// Files -> deferred native broker -> CPL3 Editor -> DOS save -> Files reopen.
// Fixtures are prepared offline; all changes under test use native application UI.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectWorkspace} from './kgui32-workspace-inspect.mjs';
import {guiCleanupPublished} from './gui-cleanup-state.mjs';
import {inspectHdd,assertHddProtected,withHddFile} from './kgui32-hdd-fat.mjs';
import {inspectFat,assertProtected} from './kgui32-workspace-fat.mjs';
const [base='http://127.0.0.1:4183/',output='test-results/files-editor',video='pegc',only='all']=process.argv.slice(2);
assert(['pegc','cirrus'].includes(video));assert(['all','roundtrip','rejected','fallback'].includes(only));
const manifest=JSON.parse(await readFile(new URL('../public/kgui32/manifest.json',import.meta.url)));
const distribution=manifest.application_distribution;assert(distribution);
const legacyImage=manifest.image;
manifest.image=distribution.image;manifest.sha256=distribution.sha256;manifest.workspace_hdd=distribution.hdd;
const original=await readFile(new URL('../public/kgui32/'+manifest.image,import.meta.url));
const hdd=await readFile(new URL('../public/kgui32/'+manifest.workspace_hdd.image,import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const fnv=b=>{let h=2166136261;for(const c of Buffer.from(b))h=Math.imul(h^c,16777619)>>>0;return h;};
assert.equal(sha(original),manifest.sha256);assert.equal(sha(hdd),manifest.workspace_hdd.sha256);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
let page,ctx,errors=[],results=[],last;
async function inspect(){const s=await inspectWorkspace(page);if(s)s.files=s.cpu.diagnostics.map(d=>d.pm32?.samples[0]===0x3246474b?Object.fromEntries(['magic','version','frames','events','focus','selected','entries','matches','top','mode','bytes','hash','heartbeat','error','nameHash','metadataHash'].map((k,i)=>[k,d.pm32.samples[i]])):null);return s;}
async function until(f,label){console.log('CHECK',label);let s;for(let end=Date.now()+120000;Date.now()<end;){s=await inspect().catch(()=>null);if(s&&f(s)){last=s;return s;}await page.waitForTimeout(100);}throw Error(label+' '+JSON.stringify({files:s?.files,editors:s?.editors,gui:s?.gui.app,programs:s?.resources.usage.map(u=>u.program),states:s?.cpu.views.map(v=>v.state)}));}
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await page.waitForTimeout(200);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await page.waitForTimeout(200);};
async function click(x,y){await page.evaluate(p=>window.np2debug.np2.mouseMoveTo(p.x,p.y),{x,y});await until(s=>s.gui.app.mx===x&&s.gui.app.my===y,'pointer');for(let d of [1,0]){const hb=(await inspect()).gui.app.heartbeat;await page.evaluate(d=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,d]),d);await until(s=>s.gui.app.heartbeat>=hb+3,'mouse transition '+d);}}
const vector=()=>page.evaluate(()=>window.np2debug.np2.readMemoryBase64(0x24*4,4).base64);
async function disk(slot){if(slot==='fd1')return Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');const wait=page.waitForEvent('download');await page.evaluate(()=>window.np2debug.np2.exportDisk('hdd'));return readFile(await (await wait).path());}
async function boot(bytes=hdd,fd=original){
 filters.fill('');ctx=await browser.newContext({viewport:{width:1280,height:1000}});page=await ctx.newPage();errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(bytes)await page.route('**/kgui32/'+manifest.workspace_hdd.image,r=>r.fulfill({body:bytes,contentType:'application/octet-stream'}));
 if(!fd.equals(original))await page.route('**/kgui32/'+manifest.image,r=>r.fulfill({body:fd,contentType:'application/octet-stream'}));
 await page.goto(new URL(`?fd1=./kgui32/${manifest.image}${bytes?'&hdd=./kgui32/'+manifest.workspace_hdd.image:''}&run=1&mem=16&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);
 await until(s=>s.gui.ready&&s.gui.app?.frames&&s.bridge?.ready,'desktop');return vector();
}
function location(s,id,drive,hddTarget=true){const e=s.editors[id];assert.equal(e.version,4);assert.equal(e.workspace>>>8,drive);assert.equal(e.workspace&3,hddTarget?1:2);assert.notEqual(s.cpu.views[id].cr3,s.gui.cpu.pd);assert.equal(s.cpu.diagnostics[id].frame.cs,59);assert.equal(s.cpu.diagnostics[id].frame.eflags&0x20000,0);}
async function text(id,value){
 // A native retained frame can take longer than the emulator's key pulse.
 // Bound the outstanding input and acknowledge actual CPL3 bytes after each key.
 let prefix='',s;for(const c of value){await type(c==='\n'?'\r':c);prefix+=c;s=await until(s=>s.editors[id]?.bytes===prefix.length&&s.editors[id]?.hash===fnv(prefix),'typed document '+prefix.length+'/'+value.length);}return s;
}
async function picker(id,mode,drive){return until(s=>s.editors[id]?.mode===mode&&s.canvases[id]?.texts.some(t=>t.includes(String.fromCharCode(65+drive)+':\\WORK'))&&s.canvases[id]?.texts.some(t=>t.startsWith('Free ')||t.includes('unavailable')),'workspace picker');}
async function saveAs(id,name,drive){await key('CTRL+W');await picker(id,3,drive);await key('HOME');for(let i=0;i<12;i++)await key('DEL');await type(name);await key('ENTER');}
function reclaimed(s){assert.equal(s.bridge.ready,0);assert.equal(s.bridge.arena,0);assert.equal(s.bridge.currentVector,s.bridge.oldVector);assert.equal(s.gui.cpu.freeBefore,s.gui.cpu.freeAfter);assert.equal(s.gui.cpu.largestBefore,s.gui.cpu.largestAfter);assert.equal(s.gui.cpu.handle,0);assert.equal(s.gui.cpu.tablesCleared,1);assert.equal(s.gui.dosBefore,s.gui.dosAfter);assert(s.cpu.views.every(v=>v.state===0));}
async function exit(oldVector){await key('F10');const s=await until(s=>guiCleanupPublished(s.gui)&&s.gui.state===3,'DOS and resource reclamation');reclaimed(s);assert.equal(await vector(),oldVector);assert.deepEqual(errors,[]);return s;}
function pass(name,more={}){results.push({name,...more});console.log('PASS',name);}
async function end(id){
 const s=await inspect();await click(330+146*id,s.gui.height-16);
 // Editor owns Ctrl+E (end of line); use the desktop's explicit End button.
 if(s.editors[id]){const c=s.canvases[id],x=id?s.gui.width-c.width-32:16,y=id?Math.max(40,s.gui.height-c.height-144):40;await click(x+230,y+48);}
 else await key('CTRL+E');
 return until(s=>s.cpu.views[id].state===0,'end slot '+id);
}
async function launch(x,y){await key('F2');await click(x,y);}

async function shot(name){for(let i=0;i<2;i++){const before=await inspect(),x=before.gui.app.mx===10?12:10;await page.evaluate(({x,y})=>window.np2debug.np2.mouseMoveTo(x,y),{x,y:before.gui.height-48});await until(s=>s.gui.app.frames>before.gui.app.frames&&s.gui.app.heartbeat>=before.gui.app.heartbeat+2,'composed screenshot');}await page.screenshot({path:join(output,name)});}
const filters=['',''];
async function focus(id){const s=await inspect();await click(330+146*id,s.gui.height-16);return until(s=>s.gui.app.active===id+2,'active slot '+id);}
async function selectAll(id){await key('CTRL+A');return until(s=>s.gui.app.active===id+2&&s.editors[id]?.anchor===0&&s.editors[id]?.cursor===s.editors[id]?.bytes,'Editor selection committed');}
async function files(){await launch(268,230);return until(s=>s.files[0]?.frames>0&&!(s.files[0].mode&2),'Files root');}
async function localFocus(id,target){for(let i=0;i<8;i++){const s=await inspect();if(s.files[id].focus===target)return;const next=(s.files[id].focus+1)%8;await key('TAB');await until(s=>s.files[id]?.focus===next,'local focus '+next);}throw Error('local focus');}
async function filter(name){
 await focus(0);let s=await inspect();if(s.files[0].mode&1){await key('ESC');await until(s=>!(s.files[0]?.mode&1),'back to list');}
 s=await inspect();if(filters[0]===name&&s.files[0]?.matches===1&&s.files[0]?.nameHash===fnv(name))return s;
 await localFocus(0,0);await key('HOME');for(let i=0;i<filters[0].length;i++)await key('DEL');await type(name);filters[0]=name;
 return until(s=>!(s.files[0]?.mode&2)&&s.files[0]?.matches===1&&s.files[0]?.nameHash===fnv(name),'selected '+name);
}
async function work(){await key('CTRL+W');return until(s=>(s.files[0]?.mode&32)&&!(s.files[0].mode&2),'Work enumeration');}
async function preview(name,bytes){await filter(name);await localFocus(0,1);await key('ENTER');return until(s=>(s.files[0]?.mode&1)&&s.files[0].bytes===bytes.length&&s.files[0].hash===fnv(bytes),'native preview '+name);}
async function linked(name,bytes,drive=1){
 const normalized=Buffer.from(bytes.toString().replaceAll('\r',''));
 const before=await filter(name),generation=before.cpu.views[0].generation,peerGeneration=before.cpu.views[1].generation;await key('CTRL+O');
 const s=await until(s=>s.cpu.views[1].generation>peerGeneration&&[1,2].includes(s.cpu.views[1].state)&&s.bridge.generation[1]===s.cpu.views[1].generation&&s.bridge.tokens[1]>0&&s.editors[1]?.frames>0&&s.editors[1].bytes===normalized.length&&s.editors[1].hash===fnv(normalized)&&!s.editors[1].dirty,'Files opens '+name+' in Editor');
 assert.equal(s.cpu.views[0].generation,generation);assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);assert.notEqual(s.cpu.views[0].physical,s.cpu.views[1].physical);location(s,1,drive,drive!==0);await focus(1);return s;
}
async function refresh(){await focus(0);await localFocus(0,3);const events=(await inspect()).files[0].events;await key('ENTER');return until(s=>s.files[0]?.events>events&&!(s.files[0].mode&2)&&s.files[0].error===0,'Files refresh');}
async function assertMedia(before,fdBefore=original){const saved=await disk('hdd');const state=assertHddProtected(before,saved);assert.equal(sha(await disk('fd1')),sha(fdBefore));return {saved,state};}
const initial=Buffer.from('Files Work document\r\n'),updated=Buffer.from('Edited through Files\nsecond line');
const savedUpdated=Buffer.from(updated.toString().replaceAll('\n','\r\n')); // Preserve the opened CRLF format.
const fixture=withHddFile(hdd,'NOTE.TXT',initial);
async function roundtrip(){
 const old=await boot(fixture);let s=await files();assert.equal(s.files[0].mode&32,0);const generation=s.cpu.views[0].generation;
 s=await work();assert.equal(s.files[0].entries,1);
 const entry=inspectHdd(fixture).entries.get('WORK/NOTE.TXT');let metadata=2166136261;for(const v of [fnv('NOTE.TXT'),entry.size,entry.attr,entry.raw.readUInt16LE(24),entry.raw.readUInt16LE(22)])metadata=Math.imul(metadata^v,16777619)>>>0;assert.equal(s.files[0].metadataHash,metadata);
 s=await preview('NOTE.TXT',initial);assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);
 await until(s=>s.canvases[0]?.texts.includes('Files Work document'),'preview retained frame');await shot('work-preview.png');await linked('NOTE.TXT',initial);
 await selectAll(1);await text(1,updated.toString());await key('CTRL+S');await until(s=>s.editors[1]?.hash===fnv(updated)&&!s.editors[1].dirty&&s.editors[1].mode===0,'save opened Work document');
 let media=await assertMedia(fixture);assert.deepEqual(media.state.files.get('WORK/NOTE.TXT'),savedUpdated);
 await end(1);await refresh();s=await preview('NOTE.TXT',savedUpdated);assert.equal(s.cpu.views[0].generation,generation);
 s=await linked('NOTE.TXT',savedUpdated);const editorGeneration=s.cpu.views[1].generation;
 await selectAll(1);await text(1,'dirty peer must survive');s=await until(s=>s.editors[1]?.dirty,'dirty peer');const peer={hash:s.editors[1].hash,bytes:s.editors[1].bytes,history:s.editors[1].history};
 await filter('NOTE.TXT');await key('CTRL+O');s=await until(s=>s.files[0]?.error===16&&(s.files[0].mode&4),'two occupied slots refused');
 assert.equal(s.cpu.views[1].generation,editorGeneration);assert.equal(s.cpu.views[0].generation,generation);for(const [k,v] of Object.entries(peer))assert.equal(s.editors[1][k],v);assert.equal(s.editors[1].dirty,1);assert([1,2].includes(s.cpu.views[1].state));
 await until(s=>s.canvases[0]?.texts.some(t=>t.startsWith('Both slots')),'busy retained frame');await shot('busy-dirty-editor.png');await key('ESC');
 media=await assertMedia(fixture);assert.deepEqual(media.state.files.get('WORK/NOTE.TXT'),savedUpdated);
 await end(1); // Explicit user End after checking that the refused request kept dirty text.
 await exit(old);await assertMedia(fixture);await writeFile(join(output,'saved.thd'),media.saved);await ctx.close();
 pass('HDD Work enumeration, preview, fixed Editor launch, save, refresh and reopen; busy dirty peer retains generation, bytes and history; protected FD/APPS and full cleanup');
 const cold=await boot(media.saved);await files();await work();await linked('NOTE.TXT',savedUpdated);await end(1);await exit(cold);await assertMedia(fixture);await ctx.close();pass('cold boot retains Files-opened document and actual CPL3 Editor');
}
async function rejected(){
 const large=Buffer.alloc(65537,65),binary=Buffer.from([65,0,66]);let bytes=withHddFile(fixture,'LARGE.TXT',large);bytes=withHddFile(bytes,'BINARY.TXT',binary);
 const old=await boot(bytes);await files();await work();await filter('LARGE.TXT');await key('CTRL+O');let s=await until(s=>(s.files[0]?.mode&4)&&!(s.files[0].mode&64),'over-limit document refused');assert.equal(s.cpu.views[1].state,0);await key('ESC');
 await filter('BINARY.TXT');await key('CTRL+O');s=await until(s=>s.editors[1]?.frames>0&&s.editors[1].error===22,'Editor rejects binary bytes');assert.equal(s.editors[1].bytes,0);assert.equal(s.editors[1].dirty,0);assert.equal(s.cpu.diagnostics[1].pm32.openFiles,0);await end(1);
 for(const [args,message] of [['work MISSING.TXT','Cannot open file'],['work ../A.TXT','Invalid document request'],['other NOTE.TXT','Invalid document request']]){
  const generation=(await inspect()).cpu.views[1].generation;await focus(1);await key('CTRL+L');await type('KGEDIT.EXE '+args+'\r');
  s=await until(s=>s.cpu.views[1].generation>generation&&s.editors[1]?.frames>0&&s.canvases[1]?.texts.includes(message),'startup rejects '+args);assert.equal(s.editors[1].bytes,0);assert.equal(s.editors[1].dirty,0);assert.equal(s.cpu.diagnostics[1].pm32.openFiles,0);await end(1);
 }
 await exit(old);assert.equal(sha(await disk('hdd')),sha(bytes));assert.equal(sha(await disk('fd1')),sha(original));await ctx.close();pass('large selection refuses launch; binary, missing, path and namespace startup requests cannot create a dirty document or alter disks');
}
async function fallback(){
 const legacy=await readFile(new URL('../public/kgui32/'+legacyImage,import.meta.url)),root=inspectFat(legacy).files.get('EDITTEST.TXT');assert(root);
 const old=await boot(null,legacy);await files();await linked('EDITTEST.TXT',root,0);
 await selectAll(1);await text(1,'root copied to FD Work');await saveAs(1,'LINKED.TXT',0);await until(s=>!s.editors[1]?.dirty&&s.editors[1]?.mode===0,'root Save As into FD Work');await end(1);
 await focus(0);await work();await preview('LINKED.TXT',Buffer.from('root copied to FD Work'));await linked('LINKED.TXT',Buffer.from('root copied to FD Work'),0);
 await selectAll(1);await text(1,'FD Work opened and saved');await key('CTRL+S');await until(s=>!s.editors[1]?.dirty&&s.editors[1]?.mode===0,'save FD Work');await end(1);await refresh();await preview('LINKED.TXT',Buffer.from('FD Work opened and saved'));
 await exit(old);const saved=await disk('fd1'),state=assertProtected(legacy,saved);assert.equal(state.files.get('WORK/LINKED.TXT').toString(),'FD Work opened and saved');assert.deepEqual(state.files.get('EDITTEST.TXT'),root);await writeFile(join(output,'saved-fallback.xdf'),saved);await ctx.close();pass('root document opens read-only, Save As selects explicit FD Work; Files preview/open/save use the same fallback; protected root and complete cleanup');
}
try{
 if(only==='all'||only==='roundtrip')await roundtrip();
 if(only==='all'||only==='rejected')await rejected();
 if(only==='all'||only==='fallback')await fallback();
 await writeFile(join(output,'verification.json'),JSON.stringify({video,source:manifest.source_commit,fd:manifest.sha256,hdd:manifest.workspace_hdd.sha256,results},null,2)+'\n');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),last:await inspect().catch(()=>null),results},null,2)+'\n');await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;}finally{await browser.close();}
