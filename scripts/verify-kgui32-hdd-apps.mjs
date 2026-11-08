// Real CPL3 Editor + DOS broker + PC-98 block driver; inspect exported FAT bytes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectWorkspace} from './kgui32-workspace-inspect.mjs';
import {inspectHdd,assertHddProtected,withHddFile,fullHdd,blockedWork,legacyHdd} from './kgui32-hdd-fat.mjs';
import {inspectFat,assertProtected} from './kgui32-workspace-fat.mjs';
const [base='http://127.0.0.1:4183/',output='test-results/hdd-apps',video='pegc',only='all']=process.argv.slice(2);
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
const inspect=()=>inspectWorkspace(page);
async function until(f,label){console.log('CHECK',label);let s;for(let end=Date.now()+120000;Date.now()<end;){s=await inspect().catch(()=>null);if(s&&f(s)){last=s;return s;}await page.waitForTimeout(100);}throw Error(label+' '+JSON.stringify({editors:s?.editors,gui:s?.gui.app,programs:s?.resources.usage.map(u=>u.program),states:s?.cpu.views.map(v=>v.state)}));}
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await page.waitForTimeout(200);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await page.waitForTimeout(200);};
async function click(x,y){await page.evaluate(p=>window.np2debug.np2.mouseMoveTo(p.x,p.y),{x,y});await until(s=>s.gui.app.mx===x&&s.gui.app.my===y,'pointer');for(let d of [1,0]){const hb=(await inspect()).gui.app.heartbeat;await page.evaluate(d=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,d]),d);await until(s=>s.gui.app.heartbeat>=hb+3,'mouse transition '+d);}}
const vector=()=>page.evaluate(()=>window.np2debug.np2.readMemoryBase64(0x24*4,4).base64);
async function disk(slot){if(slot==='fd1')return Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');const wait=page.waitForEvent('download');await page.evaluate(()=>window.np2debug.np2.exportDisk('hdd'));return readFile(await (await wait).path());}
async function boot(bytes=hdd,fd=original){
 ctx=await browser.newContext({viewport:{width:1280,height:1000}});page=await ctx.newPage();errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(bytes)await page.route('**/kgui32/'+manifest.workspace_hdd.image,r=>r.fulfill({body:bytes,contentType:'application/octet-stream'}));
 if(!fd.equals(original))await page.route('**/kgui32/'+manifest.image,r=>r.fulfill({body:fd,contentType:'application/octet-stream'}));
 await page.goto(new URL(`?fd1=./kgui32/${manifest.image}${bytes?'&hdd=./kgui32/'+manifest.workspace_hdd.image:''}&run=1&mem=16&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);
 await until(s=>s.gui.ready&&s.gui.app?.frames&&s.bridge?.ready,'desktop');return vector();
}
async function editor(id=0){await key('F2');await click(130,266);return until(s=>s.editors[id]?.frames>0,'Editor '+id);}
function location(s,id,drive,hddTarget=true){const e=s.editors[id];assert.equal(e.version,4);assert.equal(e.workspace>>>8,drive);assert.equal(e.workspace&3,hddTarget?1:2);assert.notEqual(s.cpu.views[id].cr3,s.gui.cpu.pd);assert.equal(s.cpu.diagnostics[id].frame.cs,59);assert.equal(s.cpu.diagnostics[id].frame.eflags&0x20000,0);}
async function text(id,value,expected=value){await type(value.replaceAll('\n','\r'));return until(s=>s.editors[id]?.bytes===expected.length&&s.editors[id]?.hash===fnv(expected),'typed document');}
async function picker(id,mode,drive){return until(s=>s.editors[id]?.mode===mode&&s.canvases[id]?.texts.some(t=>t.includes(String.fromCharCode(65+drive)+':\\WORK'))&&s.canvases[id]?.texts.some(t=>t.startsWith('Free ')||t.includes('unavailable')),'workspace picker');}
async function saveAs(id,name,drive){await key('CTRL+W');await picker(id,3,drive);await key('HOME');for(let i=0;i<12;i++)await key('DEL');await type(name);await key('ENTER');}
async function open(id,name,drive){await key('CTRL+O');await picker(id,1,drive);await type(name);await key('TAB');await key('ENTER');return until(s=>s.editors[id]?.mode===0&&!s.editors[id]?.dirty,'workspace file opened');}
function reclaimed(s){assert.equal(s.bridge.ready,0);assert.equal(s.bridge.arena,0);assert.equal(s.bridge.currentVector,s.bridge.oldVector);assert.equal(s.gui.cpu.freeBefore,s.gui.cpu.freeAfter);assert.equal(s.gui.cpu.largestBefore,s.gui.cpu.largestAfter);assert.equal(s.gui.cpu.handle,0);assert.equal(s.gui.cpu.tablesCleared,1);assert.equal(s.gui.dosBefore,s.gui.dosAfter);assert(s.cpu.views.every(v=>v.state===0));}
async function exit(oldVector,discard=false){if(discard){await key('ENTER');await key('F10');await until(s=>s.editors.some(e=>e?.mode===2),'dirty close');await key('d');}else await key('F10');const s=await until(s=>!s.gui.ready&&s.gui.state===3,'DOS and resource reclamation');reclaimed(s);assert.equal(await vector(),oldVector);assert.deepEqual(errors,[]);return s;}
function pass(name,more={}){results.push({name,...more});console.log('PASS',name);}
const fdFat=inspectFat(original),hdFat=inspectHdd(hdd);
for(const name of distribution.relocated){assert(!fdFat.files.has(name),name+' absent from distribution FD');assert(hdFat.files.has('APPS/'+name));}
async function end(id){await click(330+146*id,(await inspect()).gui.height-16);await key('CTRL+E');return until(s=>s.cpu.views[id].state===0,'end slot '+id);}
async function launch(x,y){await key('F2');await click(x,y);}
async function command(id,value){await launch(130,230);await until(s=>s.cpu.views[id].state!==0,'V86 command window');await end(id);await key('CTRL+L');await type(value+'\r');}
function protectedImages(bytes,fd){const state=assertHddProtected(hdd,bytes);assert.equal(sha(fd),sha(original));return state;}
async function shipped(){
 let old=await boot();await launch(118,192);await type('6*7=');let s=await until(s=>s.apps[0]?.magic===0x3243474b&&s.apps[0].value===42,'HDD calculator 42');
 await launch(268,192);s=await until(s=>s.apps[1]?.magic===0x324b474b&&s.apps[1].frames>0,'HDD clock');const seconds=s.apps[1].seconds;
 s=await until(s=>s.apps[1].seconds!==seconds,'HDD clock background progress');
 for(let id=0;id<2;id++){assert.equal(s.cpu.views[id].kind,1);assert.equal(s.cpu.diagnostics[id].frame.cs,59);assert.equal(s.cpu.diagnostics[id].frame.eflags&0x20000,0);assert.equal(s.cpu.diagnostics[id].pm32.openFiles,0);}
 assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);assert.notEqual(s.cpu.views[0].physical,s.cpu.views[1].physical);
 await page.screenshot({path:join(output,'hdd-calculator-clock.png')});await end(1);await end(0);
 pass('HDD-only calculator and clock: actual CPL3, independent CR3/RAM, input and background progress');
 await editor();location(await inspect(),0,1);await text(0,'application HDD document');await key('CTRL+S');await picker(0,3,1);await type('APPDOC.TXT');await key('ENTER');await until(s=>!s.editors[0]?.dirty&&s.editors[0]?.mode===0,'HDD Editor save');
 await launch(268,230);s=await until(s=>s.apps[1]?.magic===0x3246474b&&s.apps[1].frames>0,'HDD Files');assert.equal(s.apps[1].error,0);assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);
 const saved=await disk('hdd');assert.equal(protectedImages(saved,await disk('fd1')).files.get('WORK/APPDOC.TXT').toString(),'application HDD document');await page.screenshot({path:join(output,'hdd-files-editor.png')});await end(1);await end(0);
 pass('HDD-only Files and Editor, real DOS save, unchanged distribution apps and FD');
 await command(0,'ARGS32.EXE "two words" three');s=await until(s=>s.cpu.views[0].state===0&&s.cpu.diagnostics[0].pm32?.argc===3,'HDD quoted arguments');assert.equal(s.cpu.diagnostics[0].pm32.exitCode,0);
 await key('CTRL+L');await type('COUNT32.EXE 7\r');s=await until(s=>s.cpu.views[0].kind===1&&s.cpu.views[0].state===1&&s.cpu.views[0].counter>0,'HDD PM32 text application');
 await key('CTRL+E');await until(s=>s.cpu.views[0].state===0,'end HDD text app');
 await click(310,88);s=await until(s=>s.cpu.views[0].state===1&&s.cpu.views[0].counter>0,'restart HDD text app');await end(0);
 await exit(old);protectedImages(await disk('hdd'),await disk('fd1'));await writeFile(join(output,'saved.thd'),saved);await ctx.close();
 pass('PM32 HDD text app, quoted startup arguments, restart and complete resource reclamation');
 old=await boot(saved);await editor();await open(0,'APPDOC.TXT',1);s=await until(s=>s.editors[0]?.hash===fnv('application HDD document'),'cold boot app and saved document');assert.equal(sha(await disk('hdd')),sha(saved));await page.screenshot({path:join(output,'hdd-app-cold-boot.png')});await exit(old);await ctx.close();pass('cold boot with distributed FD/HDD retains document and launches HDD Editor');
}
function brokenApp(corrupt){
 const bytes=Buffer.from(hdd),s=inspectHdd(bytes),name='APPS/KGCALC.EXE';
 if(corrupt){const at=s.data+(s.chains.get(name)[0]-2)*s.clusterBytes;bytes[at+bytes.readUInt32LE(at+84)]=0;}
 else{const c=s.chains.get('APPS')[0],at=s.data+(c-2)*s.clusterBytes+64;bytes[at]='X'.charCodeAt(0);}
 inspectHdd(bytes);return bytes;
}
async function rejection(kind){
 const bytes=kind==='missing-hdd'?null:kind==='foreign'?Buffer.from(hdd):brokenApp(kind==='corrupt');if(kind==='foreign')bytes[528]^=1;
 const old=await boot(bytes);await launch(118,192);await until(s=>s.gui.app?.heartbeat>10,'refused launch completes');await page.waitForTimeout(800);const s=await inspect();assert(s.cpu.views.every(v=>v.state===0));assert(!s.apps.some(a=>a?.magic===0x3243474b&&a.frames>0));assert.equal(sha(await disk('fd1')),sha(original));if(bytes)assert.equal(sha(await disk('hdd')),sha(bytes));await exit(old);await ctx.close();pass(kind+' rejects launch and preserves media and resources');
}
async function standalone(){
 const legacy=await readFile(new URL('../public/kgui32/'+legacyImage,import.meta.url));
 const old=await boot(null,legacy);await editor();location(await inspect(),0,0,false);await exit(old);assert.equal(sha(await disk('fd1')),sha(legacy));await ctx.close();pass('explicit standalone FD compatibility still launches Editor without HDD');
}
try{
 if(only==='all'||only==='shipped')await shipped();
 for(const kind of ['missing','corrupt','missing-hdd','foreign'])if(only==='all'||only===kind)await rejection(kind);
 if(only==='all'||only==='standalone')await standalone();
 await writeFile(join(output,'verification.json'),JSON.stringify({video,source:manifest.source_commit,fd:manifest.sha256,hdd:manifest.workspace_hdd.sha256,fdFree:distribution.fd_free_bytes,results},null,2)+'\n');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),last:await inspect().catch(()=>null),results},null,2)+'\n');await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;}finally{await browser.close();}
