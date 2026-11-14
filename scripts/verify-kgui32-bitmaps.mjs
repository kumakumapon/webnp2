// CI client only. Real shipped DOS apps, CPU samples and PTE-matched private
// buffers; all actions use keyboard/mouse and no guest memory is written.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {toolsHarness,sha,fnv} from './kgui32-tools-harness.mjs';
import {imageSaveTests} from './kgui32-image-save-tests.mjs';
import {inspectBitmaps} from './kgui32-bitmap-inspect.mjs';
const [base='http://127.0.0.1:4173/',output='test-results/bitmaps',video='pegc',suite='paint']=process.argv.slice(2);
assert(['paint','lifecycle','save','recovery'].includes(suite));
const h=await toolsHarness(base,output,video),m=h.manifest;
assert.equal(m.bitmap_sdk.version,1);assert.equal(m.bitmap_sdk.disk_save,true);
const root=new URL('../public/kgui32/',import.meta.url),original=await readFile(new URL(m.standalone_hdd.image,root));
const sample=new Uint16Array(64*48);
// Independently decode the deterministic shipped BMP fixture.
// The fixture's bytes come from the actual generated FAT image, not the EXE.
const {inspectFat}=await import('./kgui32-workspace-fat.mjs');
const source=inspectFat(h.legacy).files.get('SAMPLE.BMP');assert(source&&source.toString('ascii',0,2)==='BM');
assert.equal(source.readUInt32LE(18),64);assert.equal(source.readInt32LE(22),48);
for(let y=0;y<48;y++)for(let x=0;x<64;x++){const at=54+(47-y)*192+x*3;sample[y*64+x]=(source[at+2]>>3)<<11|(source[at+1]>>2)<<5|(source[at]>>3);}
const hash=p=>fnv(Buffer.from(Uint16Array.from(p).buffer));
const stats=(s,id)=>s.expanded.slots[id]?.pm?.samples;
const image=(s,id=0)=>stats(s,id)?.[0]===0x3149474b?stats(s,id):null;
const accepted=(s,id=0)=>image(s,id)?.[2]>0&&s.bitmaps?.[id]?.consistent&&image(s,id)[8]===s.bitmaps[id].hash;
let last;const results=[];
async function until(f,label){console.log('CHECK',label);for(let end=Date.now()+120000;Date.now()<end;){const s=await inspectBitmaps(h.page());if(s?.bitmaps){last=s;if(f(s))return s;}await h.page().waitForTimeout(100);}throw Error(label+'; see bitmap-failure.json');}
function pass(label){results.push(label);console.log('PASS',label);}
async function focus(id){const s=await until(s=>s.gui.app?.frames,'desktop'),step=(s.gui.width-300)/s.expanded.capacity;await h.click(s.expanded.capacity===2?330+146*id:Math.round(300+step*(id+0.5)),s.gui.height-16);return until(s=>s.gui.app.active===id+2,'focus '+id);}
async function stop(id){const s=await focus(id),w=s.bitmaps[id].window;await h.click(w.x+230,w.y+48);return until(s=>s.expanded.slots[id].state===0,'End '+id);}
async function run(id,command){
 await focus(id);const generation=last.expanded.slots[id].generation;
 await h.enterCommand(command);return until(s=>s.expanded.slots[id].generation!==generation,'Run '+command);
}
async function launcher(){await h.key('F2');await h.click(292,266);return until(s=>accepted(s),'launcher Images');}
async function finished(vector,before,floppy=false){assert.equal(sha(await h.disk(floppy?'fd1':'hdd')),sha(before));await h.exit(vector);const s=await h.until(s=>s.gui.completed===1,'complete cleanup');assert.equal(s.gui.stackGuard,1);assert.equal(s.gui.owned,0);await h.unchangedFd();await h.closeContext();}
// Indexed PEGC uses the desktop's 6x6x6 cube, then the core's RGB565 SDL
// surface. Account for both quantizations before the final DAC LSB tolerance.
function rgba(value){if(video==='pegc'){const q=[value>>11,value>>5&63,value&31].map((v,i)=>Math.floor((Math.floor(v*255/(i===1?63:31))+25)/51)*51);value=(q[0]>>3)<<11|(q[1]>>2)<<5|(q[2]>>3);}const r=value>>11,g=value>>5&63,b=value&31;return [r<<3|r>>2,g<<2|g>>4,b<<3|b>>2,255];}
async function rendered(id=0){
 const current=await until(s=>s.gui.app?.frames,'before pixel inspection');await h.point(10,current.gui.height-48);
 const s=await until(s=>s.bitmaps[id]?.consistent&&s.bitmaps[id].draws.some(d=>d.op===4),'committed bitmap frame'),b=s.bitmaps[id],d=b.draws.find(d=>d.op===4),x=b.window.x+8+d.x,y=b.window.y+70+d.y;
 const want=[];for(let row=0;row<d.h;row++)for(let col=0;col<d.w;col++)want.push(...rgba(b.pixels[((d.color>>>16)+row)*b.width+(d.color&65535)+col]));
 let got;for(let end=Date.now()+20000;Date.now()<end;){got=await h.page().evaluate(({x,y,w,ht})=>{const src=document.querySelector('#canvas'),c=document.createElement('canvas');c.width=src.width;c.height=src.height;const g=c.getContext('2d');g.drawImage(src,0,0);return Array.from(g.getImageData(x,y,w,ht).data);},{x,y,w:d.w,ht:d.h});if(got.length===want.length&&got.every((v,i)=>i%4===3?v===want[i]:Math.abs(v-want[i])<=1))return;await h.page().waitForTimeout(100);}assert.deepEqual(got,want,'actual visible bitmap pixels');
}
async function edited(key,want,atomic=false){
 const s=await until(s=>accepted(s),'before edit'),old=s.bitmaps[0].hash,uploads=image(s,0)[10];
 await h.page().evaluate(key=>window.np2debug.np2.sendKeys(key),key);
 let partial=false;await until(t=>{const b=t.bitmaps[0];if(b?.valid&&b.native.uploaded>0&&b.native.uploaded<b.width*b.height*2){assert.equal(b.hash,old,'old complete front survives partial transfer');partial=true;}return accepted(t)&&image(t,0)[10]>uploads&&b.hash===hash(want);},'edit '+key);
 assert.deepEqual(last.bitmaps[0].pixels,Array.from(want));if(atomic)assert(partial,'observe a real partial replacement');await rendered();return last;
}
async function paint(){
 const vector=await h.bootHdd();await launcher();assert.deepEqual(last.bitmaps[0].pixels,Array.from(sample));assert.equal(image(last,0)[13],0);assert.equal(last.gui.cpu.frame.cs,59);assert.equal(last.expanded.slots[0].pm.frame.cs,59);await rendered();await h.shot('sample-bmp.png');
 pass('Shipping HDD launcher opens a real CPL3 BMP decoder; every cached RGB565 pixel and actual PEGC/Cirrus canvas pixel matches the generated BMP');
 const inverted=sample.map(v=>v^65535),flipped=inverted.slice();for(let y=0;y<48;y++)for(let x=0;x<64;x++)flipped[y*64+x]=inverted[y*64+63-x];
 await edited('i',inverted,true);await edited('h',flipped);await edited('u',inverted);await edited('r',sample);
 await h.key('p');await until(s=>(image(s,0)?.[15]&2)!==0,'paint mode');let s=last,w=s.bitmaps[0].window;
 await h.point(w.x+8+26,w.y+70+98);await h.button(1);await h.button(0);
 const painted=sample.slice();for(let y=9;y<=11;y++)for(let x=9;x<=11;x++)painted[y*64+x]=0xf81f;
 await until(s=>accepted(s)&&image(s,0)[8]===hash(painted)&&!(image(s,0)[15]&4),'bounded real mouse brush');assert.deepEqual(last.bitmaps[0].pixels,Array.from(painted));await rendered();await edited('u',sample);
 // Wrong-format read must preserve source, undo and closed file handles.
 await h.input(0,50,16,'BINARY.TXT');await h.control(0,'o'.charCodeAt(0));
 await until(s=>accepted(s)&&image(s,0)[13]>0&&image(s,0)[8]===hash(sample),'invalid BMP retains image');assert.equal(last.expanded.slots[0].pm.openFiles,0);await edited('u',painted);await edited('r',sample);
 pass('Atomic image replacement, invert, horizontal flip, Undo, Reset, real mouse paint and invalid-file preservation leave disk bytes unchanged');
 // The independent boundary app passes a peer handle/token through the actual
 // CPU syscall path, then paints a 3x2 source at (-2,-1) for one-pixel clipping.
 s=last;const peer={handle:s.bitmaps[0].handle,token:s.bitmaps[0].token};await h.click(s.gui.width-188,15);await until(s=>s.expanded.slots[1].state===2,'DOS 2');await h.key('CTRL+E');await until(s=>s.expanded.slots[1].state===0,'End shell');
 await run(1,`KGBITBAD.EXE ${peer.handle} ${peer.token}`);
 s=await until(s=>stats(s,1)?.[0]===0x3142474b&&stats(s,1)[2]===1&&s.bitmaps[1]?.consistent&&s.bitmaps[1].draws.some(d=>d.op===4&&d.x===-2&&d.y===-1),'actual CPL3 bitmap boundary probes');assert.equal(stats(s,1)[6],25);assert.equal(stats(s,1)[12],0);assert.equal(s.bitmaps[0].hash,hash(sample));
 const p=s.bitmaps[1],cx=p.window.x+8,cy=p.window.y+70;
 const background=rgba(0x334455>>19<<11|(0x334455>>10&63)<<5|(0x334455>>3&31)),expected=[...rgba(0xf81f),...background,...background,...background];let got;
 for(let end=Date.now()+20000;Date.now()<end;){got=await h.page().evaluate(({cx,cy})=>{const src=document.querySelector('#canvas'),c=document.createElement('canvas');c.width=src.width;c.height=src.height;const g=c.getContext('2d');g.drawImage(src,0,0);return Array.from(g.getImageData(cx,cy,2,2).data);},{cx,cy});if(got.every((v,i)=>i%4===3?v===expected[i]:Math.abs(v-expected[i])<=1))break;await h.page().waitForTimeout(100);}
 assert(got.every((v,i)=>i%4===3?v===expected[i]:Math.abs(v-expected[i])<=1),'one-pixel clipping and adjacent background');
 await h.shot('owned-clipped-bitmap.png');await h.key('q');await until(s=>s.expanded.slots[1].state===0&&stats(s,1)?.[6]===31,'destroy and stale-handle probes');assert.equal(stats(last,1)[12],0);assert.equal(last.bitmaps[1].native.handle,0);assert.equal(last.bitmaps[0].hash,hash(sample));
 pass('31 actual CPL3 probes reject invalid buffers, sizes, offsets, forged peer tokens/handles, incomplete frames, source overflow and stale surfaces; negative destinations clip exactly');
 // Files opens a root BMP through the same deferred owned launch API as TXT.
 await stop(0);await run(1,'KGFILES.EXE');await until(s=>stats(s,1)?.[0]===0x3246474b&&stats(s,1)[6]>0&&!(stats(s,1)[9]&2),'Files root ready');
 await h.input(1,100,36,'SAMPLE.BMP',0);await h.until(s=>s.apps[1]?.seconds===1,'one BMP match');await h.control(1,105);await until(s=>accepted(s,0)&&s.bitmaps[0].hash===hash(sample),'Files opens BMP in free slot');await focus(0);await rendered();
 pass('Files Open app launches the selected root BMP in an independent free slot');await finished(vector,original);
}
async function lifecycle(){
 const vector=await h.bootHdd(undefined,true,32);await until(s=>s.expanded.capacity===4,'four-slot desktop');
 for(let id=0;id<4;id++){let s=last;await h.click(s.gui.width-360+id*56+24,15);await until(s=>s.expanded.slots[id].state===2,'DOS '+id);await focus(id);await h.key('CTRL+E');await until(s=>s.expanded.slots[id].state===0,'End DOS '+id);await run(id,'KGIMAGE.EXE');await until(s=>accepted(s,id),'Images '+id);}
 let s=await until(s=>s.bitmaps.every((b,i)=>accepted(s,i)),'four independent images');
 assert.equal(new Set(s.expanded.slots.map(v=>v.pd)).size,4);assert.equal(new Set(s.bitmaps.map(b=>b.handle)).size,4);assert.equal(new Set(s.bitmaps.map(b=>b.token)).size,4);for(const b of s.bitmaps)assert.deepEqual(b.pixels,Array.from(sample));await h.shot('four-owned-images.png');
 await focus(3);await h.key('i');await until(s=>accepted(s,3)&&image(s,3)[8]===hash(sample.map(v=>v^65535)),'fourth image edit');for(let id=0;id<3;id++)assert.equal(last.bitmaps[id].hash,hash(sample));
 const generations=last.expanded.slots.map(v=>v.generation),tokens=last.bitmaps.map(b=>b.token),beats=last.expanded.slots.map(v=>v.pm.samples[12]);await stop(3);await run(3,'KGIMAGE.EXE fault');
 await until(s=>s.expanded.slots[3].state===4&&s.expanded.slots[3].pm.handle===0&&image(s,3)?.[10]===1&&!s.bitmaps[3].native.handle&&!s.bitmaps[3].valid,'fault after actual surface upload');
 for(let id=0;id<3;id++){assert.equal(last.expanded.slots[id].generation,generations[id]);assert.equal(last.bitmaps[id].hash,hash(sample));}
 await run(3,'KGIMAGE.EXE');await until(s=>accepted(s,3)&&s.expanded.slots[3].generation!==generations[3]&&s.bitmaps[3].token!==tokens[3]&&s.bitmaps[3].hash===hash(sample)&&[0,1,2].every(id=>image(s,id)[12]>beats[id]),'fourth image recycle and peer progress');
 pass('Four independent CPL3 image surfaces preserve pixels and fair peer progress across fourth-slot edits, uploaded-image page fault, resource reclaim and generation/token replacement');
 await finished(vector,original);pass('Four image owners exit with exact XMS/DOS/vector/stack restoration and unchanged HDD');
 const floppyVector=await h.boot(null,h.legacy,16);await launcher();assert.deepEqual(last.bitmaps[0].pixels,Array.from(sample));await rendered();await finished(floppyVector,h.legacy,true);pass('The complete standalone FD also loads, renders and closes Images without an HDD');
}
try{if(suite==='paint')await paint();else if(suite==='lifecycle')await lifecycle();else await imageSaveTests({suite,h,until,image,accepted,run,launcher,sample,hash,pass,original});await writeFile(join(output,'bitmap-verification.json'),JSON.stringify({video,suite,source:m.source_commit,results},null,2)+'\n');}
catch(e){await writeFile(join(output,'bitmap-failure.json'),JSON.stringify({error:String(e),last:(await inspectBitmaps(h.page()).catch(()=>null))??last,results},null,2)+'\n');await h.fail(e);throw e;}
finally{await h.close();}
