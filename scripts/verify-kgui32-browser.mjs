import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectBrowser} from './kgui32-browser-inspect.mjs';
const [base='http://127.0.0.1:4174/',output='test-results/kgui32-browser',video='pegc']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/kgui32/manifest.json',import.meta.url)));
const image=await readFile(new URL('../public/kgui32/'+manifest.image,import.meta.url));
const fnv=b=>{let h=2166136261;for(const v of b)h=Math.imul(h^v,16777619)>>>0;return h;},nameHash=s=>fnv(Buffer.from(s));
const sha=b=>createHash('sha256').update(b).digest('hex');
// Independent expected values come from actual FAT directory/file bytes.
let metadataHash=2166136261;const directory=[];
for(let at=5*1024;at<11*1024&&image[at];at+=32){
 const attr=image[at+11];if(image[at]===0xe5||attr&8)continue;
 const name=image.subarray(at,at+8).toString('ascii').trimEnd()+'.'+image.subarray(at+8,at+11).toString('ascii').trimEnd();
 const bytes=image.readUInt32LE(at+28),date=image.readUInt16LE(at+24),time=image.readUInt16LE(at+22);
 directory.push({name,bytes,attr,date,time,cluster:image.readUInt16LE(at+26)});
 for(const value of [nameHash(name),bytes,attr,date,time])metadataHash=Math.imul(metadataHash^value,16777619)>>>0;
}
function file(name){const e=directory.find(e=>e.name===name);assert.ok(e);let cluster=e.cluster;const chunks=[];for(let guard=0;cluster<0xff8&&guard<1221;guard++){chunks.push(image.subarray((11+cluster-2)*1024,(12+cluster-2)*1024));const at=1024+Math.floor(cluster*3/2),n=image.readUInt16LE(at);cluster=(cluster&1)?n>>>4:n&4095;}return Buffer.concat(chunks).subarray(0,e.bytes);}
assert.equal(sha(image),manifest.sha256);assert.equal(directory.length,manifest.files.length);
await mkdir(output,{recursive:true});const results=[],snapshots=[],errors=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));
const pass=s=>{results.push(s);console.log('PASS '+s);};
async function until(test,label){console.log('CHECK '+label);let last,report=Date.now();for(let end=Date.now()+120000;Date.now()<end;){last=await inspectBrowser(page).catch(()=>null);if(last&&test(last))return last;if(Date.now()-report>15000){console.log(JSON.stringify({label,files:last?.files,states:last?.cpu.views.map(v=>({state:v.state,fault:v.fault,gen:v.generation})),gui:last?.gui.app}));report=Date.now();}await page.waitForTimeout(100);}throw Error(label+' timed out');}
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await page.waitForTimeout(200);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await page.waitForTimeout(200);};
const point=async(x,y)=>{await page.evaluate(({x,y})=>window.np2debug.np2.mouseMoveTo(x,y),{x,y});await until(s=>s.gui.app?.mx===x&&s.gui.app?.my===y,'pointer '+x+','+y);};
const button=async d=>{await page.evaluate(d=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,d]),d);await page.waitForTimeout(350);};
async function click(x,y){await point(x,y);await button(1);await button(0);}
async function composed(id){let s=await until(s=>s.gui.app?.active===id,'focus '+id);s=await until(t=>t.gui.app?.active===id&&t.gui.app.heartbeat>=s.gui.app.heartbeat+2,'refresh '+id);for(let i=0;i<2;i++){const frames=s.gui.app.frames,x=s.gui.app.mx===10?12:10;await point(x,s.gui.height-48);s=await until(s=>s.gui.app.active===id&&s.gui.app.frames>frames,'composition '+id);}return s;}
const pixels=async(x,y,w,h)=>page.evaluate(({x,y,w,h})=>{const src=document.querySelector("#canvas"),c=document.createElement("canvas");c.width=src.width;c.height=src.height;const g=c.getContext("2d");g.drawImage(src,0,0);return Array.from(g.getImageData(x,y,w,h).data);},{x,y,w,h});
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
function ready(s,id){const p=s.cpu.diagnostics[id].pm32,f=s.files[id];return s.gui.ready&&f?.version===2&&f.frames>0&&f.error===0&&!(f.mode&2)&&s.cpu.views[id].kind===1&&[1,2].includes(s.cpu.views[id].state)&&p?.handle>0&&p.features===111&&s.cpu.diagnostics[id].frame.cs===59&&!(s.cpu.diagnostics[id].frame.eflags&0x20000)&&s.bridge.generation[id]===s.cpu.views[id].generation&&s.bridge.tokens[id]>0;}
async function run(id,path){await key('CTRL+L');await type(path+'\r');return until(s=>s.resources.usage[id].program===path.split(' ')[0]&&s.cpu.views[id].generation>0,'run '+path);}
const filters=['',''];
async function filter(id,text){let s=await until(s=>ready(s,id),'Files before filter');if(s.files[id].mode&1){await key('ESC');await until(s=>ready(s,id)&&!(s.files[id].mode&1),'back to root');}for(let i=0;i<6&&s.files[id].focus!==0;i++){await key('TAB');s=await until(t=>t.files[id]?.focus===(s.files[id].focus+1)%6,'filter focus');}await key('HOME');for(let i=0;i<filters[id].length;i++)await key('DEL');await type(text);filters[id]=text;return until(s=>ready(s,id)&&s.files[id].focus===0&&s.files[id].matches===directory.filter(e=>e.name.toUpperCase().includes(text.toUpperCase())).length,'filter '+text);}
try{
 await page.goto(new URL(`?fd1=./kgui32/${manifest.image}&run=1&mem=16&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);
 let s=await until(s=>s.gui.ready&&s.gui.app?.frames&&s.bridge?.ready,'desktop');const width=s.gui.width,height=s.gui.height;
 await click(268,228);s=await until(s=>ready(s,0),'Files root');
 assert.equal(s.files[0].entries,directory.length);assert.equal(s.files[0].metadataHash,metadataHash);assert.equal(s.files[0].nameHash,nameHash(directory[0].name));
 assert.equal(s.cpu.diagnostics[0].pm32.heapPages,0);assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);
 await composed(2);await page.screenshot({path:join(output,'root.png')});snapshots.push({label:'actual directory metadata',...s});pass('A: names, sizes, attributes and DOS date/time match every raw FAT directory entry in real CPL3 RAM');
 const gen=s.cpu.views[0].generation;
 await key('TAB');s=await until(s=>ready(s,0)&&s.files[0].focus===1,'local Tab list focus');assert.equal(s.gui.app.active,2);
 await key('HELP');s=await until(s=>s.files[0]?.selected===directory.length-1&&s.files[0].top>0,'list end');assert.equal(s.files[0].nameHash,nameHash(directory.at(-1).name));
 await key('HOME');await until(s=>s.files[0]?.selected===0&&s.files[0].top===0,'list home');
 // Capture the scrollbar thumb, drag outside the canvas, then release there.
 const canvasX=24,canvasY=110,cw=576,ch=height===400?216:320,rows=Math.floor((ch-104)/16);
 await point(canvasX+cw-18,canvasY+71);await button(1);await until(s=>(s.files[0]?.mode&8)!==0,'thumb captured');
 await point(8,height-35);await until(s=>s.files[0]?.top===directory.length-rows,'drag outside reaches final list page');await button(0);await until(s=>(s.files[0]?.mode&8)===0,'release outside cancels capture');
 await key('HOME');await until(s=>s.files[0]?.top===0,'keyboard after drag');pass('local Tab, list navigation, scrollbar capture/motion and release outside the canvas work');
 await filter(0,'browse.txt');s=await until(s=>s.files[0]?.matches===1&&s.files[0].nameHash===nameHash('BROWSE.TXT'),'case-insensitive filter');
 await key('TAB');await key('ENTER');s=await until(s=>ready(s,0)&&(s.files[0].mode&1),'preview');
 const content=file('BROWSE.TXT');assert.ok(content.length>65536);assert.equal(s.files[0].bytes,content.length);assert.equal(s.files[0].hash,fnv(content));assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);assert.ok(s.cpu.diagnostics[0].pm32.heapPages>=Math.ceil(content.length/4096));
 await composed(2);const firstLine=sha(await pixels(36,162,300,16));
 await key('ROLLDOWN');s=await until(s=>s.files[0]?.top===rows,'preview page down');await key('HELP');s=await until(s=>s.files[0]?.top===1800-rows,'preview end');
 await composed(2);assert.notEqual(sha(await pixels(36,162,300,16)),firstLine,'scrolling redraws actual preview glyphs');await page.screenshot({path:join(output,'preview-end.png')});snapshots.push({label:'complete text bytes and scrolling',...s});pass('over-64-KiB TXT content matches the real file hash; scrolling reaches the last line with no open DOS handle');
 await key('ESC');s=await until(s=>ready(s,0)&&!(s.files[0].mode&1),'return to same list');assert.equal(s.files[0].matches,1);assert.equal(s.cpu.views[0].generation,gen);assert.equal(s.cpu.diagnostics[0].pm32.heapPages,0);
 await filter(0,'EMPTY.TXT');await key('TAB');await key('ENTER');s=await until(s=>ready(s,0)&&(s.files[0].mode&1)&&s.files[0].bytes===0,'empty preview');assert.equal(s.files[0].hash,fnv(Buffer.alloc(0)));await key('ESC');
 await filter(0,'BINARY.TXT');await key('TAB');await key('ENTER');s=await until(s=>(s.files[0]?.mode&4)!==0,'binary dialog');assert.equal(s.files[0].mode&1,0);assert.equal(s.cpu.diagnostics[0].pm32.heapPages,0);await key('ESC');await until(s=>(s.files[0]?.mode&4)===0,'dismiss dialog');
 await filter(0,'NO-SUCH-FILE');await until(s=>s.files[0]?.matches===0,'empty filter');await key('TAB');await key('ENTER');await until(s=>ready(s,0)&&s.files[0].mode===0,'empty list open is safe');pass('back retains filter/selection and frees preview pages; empty files, binary TXT dialog and no matches are safe');
 // A separate GUI clock continues while Files owns its list and preview.
 await key('F2');await until(s=>s.gui.app.active===0,'launcher');await click(268,192);s=await until(s=>s.apps[1]?.magic===0x324b474b&&s.apps[1].frames>0&&s.apps[1].error===0,'clock peer');
 const clock=s.apps[1].seconds;await click(330,height-16);await filter(0,'BROWSE.TXT');await key('TAB');await key('ENTER');s=await until(s=>ready(s,0)&&(s.files[0].mode&1)&&s.apps[1]?.seconds!==clock,'background clock');assert.notEqual(s.cpu.views[0].physical,s.cpu.views[1].physical);assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);assert.notEqual(s.gui.cpu.pd,s.cpu.views[0].cr3);
 const peerKeys=s.apps[1].keys;await key('ROLLDOWN');s=await until(s=>s.files[0]?.top===rows,'focused preview key');assert.equal(s.apps[1].keys,peerKeys);
 await click(330,height-16);await key('CTRL+P');s=await until(s=>s.cpu.views[0].state===3,'Files stop');const frozen=s.files[0].heartbeat;
 const before=s.apps[1].seconds;s=await until(s=>s.apps[1]?.seconds!==before,'clock while Files stopped');assert.equal(s.files[0].heartbeat,frozen);
 await key('CTRL+R');s=await until(s=>ready(s,0)&&s.files[0].heartbeat>frozen,'Files resume');assert.equal(s.files[0].hash,fnv(content));assert.equal(s.cpu.views[0].generation,gen);
 await composed(2);await page.screenshot({path:join(output,'files-clock.png')});snapshots.push({label:'clock and stopped/resumed preview',...s});pass('private Files/Clock CPU contexts, focused input and continuing background time survive stop/resume with preview memory retained');
 // Relayout the SDK2 controls on a real resize, preserving private text bytes.
 await point(598,ch+134);await button(1);await point(558,ch+118);await button(0);
 s=await until(s=>ready(s,0)&&s.canvases[0].width===536&&s.canvases[0].height===ch-16,'Files resize and retained frame');
 assert.equal(s.files[0].hash,fnv(content));await composed(2);await page.screenshot({path:join(output,'resized-files.png')});pass('SDK2 relayout receives the resized canvas and preserves complete preview bytes');
 // Reuse the peer slot for real invalid syscall checks; Files remains intact.
 await click(480,height-16);await key('CTRL+E');await until(s=>s.cpu.views[1].state===0,'end clock');await run(1,'KGDIRBAD.EXE');
 s=await until(s=>s.cpu.views[1].state===0&&s.apps[1]?.magic===0x3244474b&&s.apps[1].value===23,'directory negative probe');assert.equal(s.apps[1].error,0);assert.equal(s.cpu.diagnostics[1].pm32.exitCode,0);assert.equal(s.files[0].hash,fnv(content));
 await run(1,'KGDIRNO.EXE');s=await until(s=>s.cpu.views[1].state===0&&s.apps[1]?.value===3,'feature opt-in probe');assert.equal(s.apps[1].error,0);assert.equal(s.cpu.diagnostics[1].pm32.features,47);pass('real CPL3 rejects low/RO/overflow/size/stale cursor requests and missing capability; peer preview is unchanged');
 // Two independent Files instances enumerate concurrently using private DTAs.
 await run(1,'KGFILES.EXE');await until(s=>s.files[1]?.frames>0&&(s.files[1].mode&2),'peer enumeration started');
 await click(330,height-16);await key('ESC');await until(s=>ready(s,0)&&!(s.files[0].mode&1),'first root before refresh');await key('TAB');await key('TAB');await key('ENTER');
 s=await until(s=>(s.files[0]?.mode&2)&&(s.files[1]?.mode&2),'simultaneous independent DTA searches');
 snapshots.push({label:'interleaved live directory cursors',...s});
 s=await until(s=>ready(s,0)&&ready(s,1),'two Files roots');for(const f of s.files){assert.equal(f.entries,directory.length);assert.equal(f.metadataHash,metadataHash);}
 await click(480,height-16);
 await filter(1,'KGCLOCK.EXE');s=await until(s=>ready(s,1)&&s.files[1].matches===1&&s.files[1].nameHash===nameHash('KGCLOCK.EXE'),'second filter');assert.equal(s.files[0].hash,fnv(content));
 await key('TAB');await key('ENTER');await until(s=>(s.files[1]?.mode&4)!==0,'non-TXT dialog');await key('ENTER');
 await click(330,height-16);await key('ESC');await filter(0,'BROWSE.TXT');await key('TAB');await key('ENTER');await until(s=>ready(s,0)&&(s.files[0].mode&1),'first preview survives peer enumeration');pass('two Files roots keep independent enumeration, filters and selection; executable preview is refused');
 // Terminating with live heap pages, then faulting with live preview pages,
 // must reclaim only that generation and permit a clean restart.
 await key('CTRL+E');s=await until(s=>s.cpu.views[0].state===0,'end Files with preview');assert.equal(s.cpu.diagnostics[0].pm32.handle,0);assert.equal(s.cpu.diagnostics[0].pm32.heapPages,0);assert.equal(s.cpu.diagnostics[0].pm32.allocations,s.cpu.diagnostics[0].pm32.frees);
 await run(0,'KGFILES.EXE fault');s=await until(s=>s.cpu.views[0].state===4&&s.cpu.views[0].fault===14,'preview protection fault');assert.equal(s.cpu.views[0].cr2,0x10000);assert.equal(s.cpu.diagnostics[0].pm32.handle,0);assert.equal(s.cpu.diagnostics[0].pm32.heapPages,0);assert.ok(s.cpu.diagnostics[0].pm32.allocations>0);assert.equal(s.cpu.diagnostics[0].pm32.allocations,s.cpu.diagnostics[0].pm32.frees);assert.equal(s.files[1].matches,1);
 await run(0,'KGFILES.EXE');s=await until(s=>ready(s,0),'fresh Files generation');assert.notEqual(s.cpu.views[0].generation,gen);assert.equal(s.files[0].matches,directory.length);assert.equal(s.files[0].metadataHash,metadataHash);assert.equal(s.files[1].nameHash,nameHash('KGCLOCK.EXE'));pass('End and real #PF reclaim preview memory/handles while peer survives; fresh generation restores a clean root');
 for(let i=0;i<5;i++)await key('TAB');await until(s=>s.files[0]?.focus===5,'Close button focus');await key('ENTER');s=await until(s=>s.cpu.views[0].state===0&&s.gui.ready,'Files normal Close');assert.equal(s.cpu.diagnostics[0].pm32.exitCode,0);
 await key('F10');s=await until(s=>!s.gui.ready&&s.gui.state===3,'DOS fallback');
 assert.equal(s.bridge.ready,0);assert.equal(s.bridge.arena,0);assert.equal(s.bridge.currentVector,s.bridge.oldVector);assert.equal(s.gui.cpu.freeBefore,s.gui.cpu.freeAfter);assert.equal(s.gui.cpu.largestBefore,s.gui.cpu.largestAfter);assert.equal(s.gui.cpu.handle,0);assert.equal(s.gui.cpu.tablesCleared,1);assert.equal(s.gui.dosBefore,s.gui.dosAfter);assert.ok(s.cpu.views.every(v=>v.state===0));assert.equal(sha(await disk()),manifest.sha256);assert.deepEqual(errors,[]);
 snapshots.push({label:'all resources reclaimed',...s});pass('all conventional/XMS allocations, mappings, windows and hook reclaimed; entire FAT12 disk byte-identical');
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,sourceDirty:manifest.source_dirty,image:manifest.image,sha256:manifest.sha256,video,directory,metadataHash,results,snapshots},null,2)+'\n');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),text:await page.evaluate(()=>window.np2debug?.np2?.getScreenText().text).catch(()=>null),last:await inspectBrowser(page).catch(()=>null),results,snapshots},null,2)+'\n');await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;}finally{await browser.close();}
