// Real CPL3 Editor + DOS broker + PC-98 block driver; inspect exported FAT bytes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectWorkspace} from './kgui32-workspace-inspect.mjs';
import {guiCleanupPublished} from './gui-cleanup-state.mjs';
import {inspectHdd,assertHddProtected,withHddFile,fullHdd,blockedWork,legacyHdd} from './kgui32-hdd-fat.mjs';
import {inspectFat,assertProtected} from './kgui32-workspace-fat.mjs';
const [base='http://127.0.0.1:4183/',output='test-results/hdd-workspace',video='pegc',only='all']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/kgui32/manifest.json',import.meta.url)));
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
async function exit(oldVector,discard=false){if(discard){await key('ENTER');await key('F10');await until(s=>s.editors.some(e=>e?.mode===2),'dirty close');await key('d');}else await key('F10');const s=await until(s=>guiCleanupPublished(s.gui)&&s.gui.state===3,'DOS and resource reclamation');reclaimed(s);assert.equal(await vector(),oldVector);assert.deepEqual(errors,[]);return s;}
function pass(name,more={}){results.push({name,...more});console.log('PASS',name);}
async function normal(){
 let old=await boot(),s=await editor();location(s,0,1);await text(0,'HDD document\nsecond line');await key('CTRL+S');s=await picker(0,3,1);assert(s.canvases[0].texts.some(t=>t.includes('HDD')));assert(s.canvases[0].texts.some(t=>t.includes('temp 4 KiB')));
 await type('NOTE.TXT');await key('ENTER');await until(s=>s.editors[0]?.mode===0&&!s.editors[0]?.dirty,'new HDD file saved');let value='HDD document\nsecond line';let fat=assertHddProtected(hdd,await disk('hdd'));assert.equal(fat.files.get('WORK/NOTE.TXT').toString(),value);assert.equal(sha(await disk('fd1')),sha(original));
 for(const suffix of ['!','?']){value+=suffix;await text(0,suffix,value);await key('CTRL+S');s=await until(s=>!s.editors[0]?.dirty&&s.editors[0]?.hash===fnv(value),'checked overwrite');fat=assertHddProtected(hdd,await disk('hdd'));assert.equal(fat.files.get('WORK/NOTE.TXT').toString(),value);assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);}
 await key('CTRL+Z');await until(s=>s.editors[0]?.dirty===1,'undo after save');await key('CTRL+Y');await until(s=>s.editors[0]?.dirty===0,'redo to saved revision');
 const before=sha(await disk('hdd'));await saveAs(0,'NOTE.TXT',1);await until(s=>s.editors[0]?.mode===4,'overwrite confirmation');await key('ESC');await until(s=>s.editors[0]?.mode===0,'cancel replacement');assert.equal(sha(await disk('hdd')),before);
 await saveAs(0,'COPY.TXT',1);await until(s=>s.editors[0]?.mode===0&&!s.editors[0]?.dirty,'Save As copy');await open(0,'NOTE.TXT',1);
 await editor(1);await open(1,'NOTE.TXT',1);s=await until(s=>s.editors[1]?.hash===fnv(value),'peer exact revision');assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);assert.notEqual(s.cpu.views[0].physical,s.cpu.views[1].physical);location(s,1,1);
 await key('CTRL+A');await text(1,'peer HDD revision');await key('CTRL+S');await until(s=>!s.editors[1]?.dirty,'peer commit');await click(330,s.gui.height-16);await key('CTRL+A');await text(0,'stale HDD revision');const prior=(await inspect()).editors[0];await key('CTRL+S');s=await until(s=>s.editors[0]?.error===116,'stale HDD overwrite refused');assert.equal(s.editors[0].dirty,1);assert.equal(s.editors[0].hash,prior.hash);assert.equal(s.editors[0].history,prior.history);assert.equal(assertHddProtected(hdd,await disk('hdd')).files.get('WORK/NOTE.TXT').toString(),'peer HDD revision');
 await key('ENTER');await saveAs(0,'RESCUE.TXT',1);await until(s=>!s.editors[0]?.dirty&&s.editors[0]?.mode===0,'conflict recovery by Save As');await page.screenshot({path:join(output,'hdd-editor.png')});
 await exit(old);const saved=await disk('hdd');fat=assertHddProtected(hdd,saved);assert.equal(fat.files.get('WORK/RESCUE.TXT').toString(),'stale HDD revision');assert(![...fat.files.keys()].some(n=>/\.(TMP|BAK)$/.test(n)));assert.equal(sha(await disk('fd1')),sha(original));await writeFile(join(output,'saved.thd'),saved);await ctx.close();
 old=await boot(saved);await editor();await open(0,'RESCUE.TXT',1);s=await until(s=>s.editors[0]?.hash===fnv('stale HDD revision')&&!s.editors[0]?.dirty,'cold boot retained document');location(s,0,1);assert.equal(sha(await disk('hdd')),sha(saved));await page.screenshot({path:join(output,'cold-boot.png')});await exit(old);await ctx.close();
 pass('Editor, Save/Save As/Open, repeated overwrite, saved history, two-owner conflict, cold boot and reclamation',{fileSha256:sha(Buffer.from('stale HDD revision')),fdUnchanged:true});
}
async function wide(){
 let old=await boot();await key('F2');await click(130,230);let s=await until(s=>s.cpu.views[0].kind===0&&s.cpu.views[0].state!==0,'DOS launcher');const generation=s.cpu.views[0].generation;await key('CTRL+E');await until(s=>s.cpu.views[0].state===0,'end DOS launcher');await key('CTRL+L');await type('KGSAVE64.EXE hdd\r');
 s=await until(s=>s.cpu.views[0].state===0&&s.cpu.views[0].generation>generation&&s.cpu.diagnostics[0].pm32?.samples?.[0]===0x3457474b,'64 KiB actual CPL3 diagnostic');const d=s.cpu.diagnostics[0].pm32,v=d.samples;assert.equal(d.exitCode,0);assert.equal(d.openFiles,0);assert.equal(v[1],5);assert(v[2]>=39);assert.equal(v[3],0);assert.equal(v[4]&7,5);assert.equal(v[5],1);assert.equal(v[6],1024);assert.equal(v[7],4);assert.equal(v[8],inspectHdd(hdd).free*4096);assert.equal(v[9],41435136);assert.equal(v[10],65536);assert.equal(v[15],4);
 const expected=Buffer.alloc(65536);for(let i=0;i<expected.length;i++)expected[i]=i%79===78?10:65+i%26;expected[0]=33;expected[65535]=63;expected[1]=48;expected[65534]=97;expected[2]=49;expected[65533]=98;
 const saved=await disk('hdd'),fat=assertHddProtected(hdd,saved);assert.deepEqual(fat.files.get('WORK/WIDE.TXT'),expected);assert(![...fat.files.keys()].some(n=>/\.(TMP|BAK)$/.test(n)));assert.equal(fat.free,inspectHdd(hdd).free-16);assert.equal(sha(await disk('fd1')),sha(original));await exit(old);await ctx.close();
 old=await boot(saved);await editor();await open(0,'WIDE.TXT',1);await until(s=>s.editors[0]?.bytes===65536&&s.editors[0]?.hash===fnv(expected)&&!s.editors[0]?.dirty,'64 KiB Editor cold boot');assert.equal(sha(await disk('hdd')),sha(saved));await page.screenshot({path:join(output,'64k-cold-boot.png')});await exit(old);await ctx.close();pass('64 KiB create + three overwrites + exact full readback + Editor cold boot',{bytes:65536,commits:4,sha256:sha(expected),checks:v[2]});
}
async function failure(kind){
 const diskBefore=kind==='full'?fullHdd(hdd):kind==='short'?fullHdd(hdd,{directoryFull:true}):kind==='readonly'?withHddFile(hdd,'LOCKED.TXT',Buffer.from('locked HDD file\n'),33):blockedWork(hdd);
 const old=await boot(diskBefore);let s=await editor();location(s,0,1);
 if(kind==='full'||kind==='short'){await open(0,'NOTE.TXT',1);await key('CTRL+A');}
 await text(0,'unsaved HDD text');const prior=(await inspect()).editors[0];
 if(kind==='full'||kind==='short')await key('CTRL+S');else{await key('CTRL+S');await until(s=>s.editors[0]?.mode===3,'failed target picker');await type(kind==='readonly'?'LOCKED.TXT':'NEW.TXT');await key('ENTER');}
 const code=kind==='full'||kind==='short'?28:kind==='readonly'?13:20;
 s=await until(s=>s.editors[0]?.mode===0&&s.editors[0]?.error===code,kind+' save refusal');for(const k of ['bytes','hash','cursor','anchor','history','redo'])assert.equal(s.editors[0][k],prior[k],k+' retained');assert.equal(s.editors[0].dirty,1);assert.equal(s.editors[0].workspace>>>8,1);assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);
 const after=await disk('hdd');if(kind!=='short')assert.equal(sha(after),sha(diskBefore));else{
  const a=inspectHdd(diskBefore),b=assertHddProtected(diskBefore,after);for(const [n,data] of a.files)assert.deepEqual(b.files.get(n),data,n+' retained');assert(![...b.files.keys()].some(n=>/\.(TMP|BAK)$/.test(n)));assert.equal(b.chains.get('WORK').length,2,'actual DOS expands directory before short data write');assert.equal(b.free,0);
 }
 assert.equal(sha(await disk('fd1')),sha(original));await page.screenshot({path:join(output,kind+'.png')});await exit(old,true);await ctx.close();pass(kind+' preserves dirty document/history, prior data and FD',{error:code});
}
async function fallback(foreign){
 const bytes=foreign?Buffer.from(hdd):null;if(bytes)bytes[528]^=1;
 const old=await boot(bytes);let s=await editor();location(s,0,0,false);await text(0,'FD fallback document');await key('CTRL+S');s=await picker(0,3,0);assert(s.canvases[0].texts.some(t=>t.includes(' / FD')));await type('FALLBACK.TXT');await key('ENTER');s=await until(s=>s.editors[0]?.mode===0&&!s.editors[0]?.dirty,'FD fallback save');
 assert.equal(assertProtected(original,await disk('fd1')).files.get('WORK/FALLBACK.TXT').toString(),'FD fallback document');if(bytes)assert.equal(sha(await disk('hdd')),sha(bytes));await exit(old);await ctx.close();pass(foreign?'foreign HDD refused without changing it; explicit FD target works':'no HDD: explicit FD target remains usable');
}
async function legacy(){
 const before=legacyHdd(hdd);assert.equal(sha(before),'0179bd71c74c7f6aadf7856b9119f805c1049b899d8a645ba1a4fdc82095f7c7');
 const old=await boot(before);let s=await editor();location(s,0,1);await text(0,'legacy HDD retained');await key('CTRL+S');await picker(0,3,1);await type('LEGACY.TXT');await key('ENTER');await until(s=>!s.editors[0]?.dirty&&s.editors[0]?.mode===0,'old proof volume gains workspace');
 const fat=assertHddProtected(before,await disk('hdd'));assert.equal(fat.files.get('WORK/LEGACY.TXT').toString(),'legacy HDD retained');assert.equal(fat.files.get('HDD.ID').toString(),'KHDPROOF');assert.equal(sha(await disk('fd1')),sha(original));await exit(old);await ctx.close();pass('existing marked HDD gains WORK through DOS without formatting or losing existing data');
}
async function driver(){return page.evaluate(()=>{
 const b=atob(window.np2debug.np2.readMemoryBase64(0x1000,0x9f000).base64),w=i=>b.charCodeAt(i)|b.charCodeAt(i+1)<<8,d=i=>(w(i)|w(i+2)<<16)>>>0;
 for(let at=b.indexOf('KHDDIOP1');at>=0;at=b.indexOf('KHDDIOP1',at+1))if(w(at+8)===1&&w(at+10)===64&&w(at+12)===1)return {reads:d(at+32),writes:d(at+36),rejected:d(at+40),biosErrors:d(at+44),partial:d(at+56)};
 return null;
});}
function faultFd(){
 const fd=Buffer.from(original),s=inspectFat(fd);assert(s.files.has('HDDFLT.COM'));const entry=s.entries.get('AUTOEXEC.BAT'),bytes=Buffer.concat([Buffer.from('HDDFLT.COM\r\n'),s.files.get('AUTOEXEC.BAT')]);assert(bytes.length<1024&&s.next(entry.cluster)>=0xff8);
 for(let at=5*1024;at<11*1024;at+=32)if(fd.toString('ascii',at,at+11)==='AUTOEXECBAT'){fd.writeUInt32LE(bytes.length,at+28);break;}
 const at=(9+entry.cluster)*1024;fd.fill(0,at,at+1024);bytes.copy(fd,at);inspectFat(fd);return fd;
}
async function fault(){
 const fd=faultFd(),old=await boot(hdd,fd);let s=await editor();location(s,0,1);const before=await driver();assert.equal(before.biosErrors,0);
 await text(0,'device write fault');await key('CTRL+S');await picker(0,3,1);await type('IOFAULT.TXT');await key('ENTER');
 s=await until(s=>s.editors[0]?.mode===0&&(!s.editors[0]?.dirty||s.editors[0]?.error),'real BIOS write fault completes');const e=s.editors[0],record=await driver();assert.equal(record.biosErrors,1);assert.equal(record.partial,1);assert.equal(e.hash,fnv('device write fault'));assert.equal(e.workspace>>>8,1);
 const fat=assertHddProtected(hdd,await disk('hdd'));if(e.error){assert(e.error===5||e.error===117);assert.equal(e.dirty,1);assert(!fat.files.has('WORK/IOFAULT.TXT'));}else assert.equal(fat.files.get('WORK/IOFAULT.TXT').toString(),'device write fault');
 assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);assert.equal(sha(await disk('fd1')),sha(fd));await page.screenshot({path:join(output,'bios-write-fault.png')});await exit(old,!!e.error);await ctx.close();pass('real INT 1Bh write failure: safe retry or retained document, correct target, FAT and handle ownership',{error:e.error,record});
}
try{
 if(only==='all'||only==='normal')await normal();
 if(only==='all'||only==='wide')await wide();
 for(const kind of ['full','short','readonly','blocked'])if(only==='all'||only===kind)await failure(kind);
 if(only==='all'||only==='fallback')await fallback(false);
 if(only==='all'||only==='foreign')await fallback(true);
 if(only==='all'||only==='legacy')await legacy();
 if(only==='all'||only==='fault')await fault();
 await writeFile(join(output,'verification.json'),JSON.stringify({video,source:manifest.source_commit,fd:manifest.sha256,hdd:manifest.workspace_hdd.sha256,results},null,2)+'\n');console.log(JSON.stringify(results,null,2));
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),last:await inspect().catch(()=>null),results},null,2)+'\n');await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;}finally{await browser.close();}
