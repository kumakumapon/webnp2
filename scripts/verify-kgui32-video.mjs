// Finite CI browser client. All changes use actual DOS instructions and keys.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {toolsHarness,sha} from './kgui32-tools-harness.mjs';
import {inspectVideo} from './kgui32-video-inspect.mjs';
const [base='http://127.0.0.1:4173/',output='test-results/video',video='pegc',suite='paint']=process.argv.slice(2);
assert(['paint','lifecycle'].includes(suite));
const h=await toolsHarness(base,output,video),m=h.manifest;
assert.equal(m.dos_terminal_modes.gaiji_glyphs,188);assert.equal(m.dos_terminal_modes.snapshot_chunk_bytes,848);
const original=await readFile(new URL('../public/kgui32/'+m.standalone_hdd.image,import.meta.url));
let last;
const slot=(s,id=0)=>s.video?.slots[id];
const ready=(s,id=0)=>slot(s,id)?.consistent&&slot(s,id).meta.fontWrites===48&&s.cpu.views[id].state===2&&s.cpu.views[id].keys===0;
async function until(f,label){console.log('CHECK',label);for(let end=Date.now()+120000;Date.now()<end;){const s=await inspectVideo(h.page());if(s){last=s;if(f(s))return s;}await h.page().waitForTimeout(100);}throw Error(label+'; see video-failure.json');}
async function start(id=0,variant=1){
 let s=await h.inspect();await h.click(s.gui.width-280+id*92,15);await h.until(s=>s.cpu.views[id].state===2,'DOS shell '+id);await h.focus(id);await h.key('CTRL+E');await h.until(s=>s.cpu.views[id].state===0,'End shell '+id);
 await h.run(id,'KVTERM.COM'+(variant===2?' 2':''));return until(s=>ready(s,id),'private video diagnostic '+id);
}
async function input(key,test,id=0){await h.focus(id);await h.type(key);return until(s=>ready(s,id)&&test(slot(s,id).meta,s),'video command '+key);}
async function pixels(id=0){
 let s=await until(s=>ready(s,id),'coherent native display before pixels');
 if(slot(s,id).meta.flags&16)s=await input('c',m=>!(m.flags&16),id);
 const v=slot(s,id),r=s.terminals.slots[id].window;
 await h.shot('pixels-'+id+'.png');
 const width=Math.floor((r.w-16)/8)*8,height=Math.floor((r.h-104)/16)*16;let dw=width,dh=height;
 if(dw*400>dh*640)dw=Math.floor(dh*640/400);else dh=Math.floor(dw*400/640);
 const points=[];
 for(let y=0;y<Math.min(dh,60);y+=3)for(let x=0;x<Math.min(dw,100);x+=3)points.push({x:r.x+8+x,y:r.y+70+y,sx:Math.floor(x*640/dw),sy:Math.floor(y*400/dh)});
 const got=await h.page().evaluate(points=>{const c=document.querySelector('#canvas'),out=document.createElement('canvas');out.width=c.width;out.height=c.height;const g=out.getContext('2d');g.drawImage(c,0,0);return points.map(p=>Array.from(g.getImageData(p.x,p.y,1,1).data));},points);
 const meta=v.meta,pattern=id?0x42:0x81;
 function want(x,y){
  if(meta.flags&2){let index=0;const b=Math.floor(x/8),bit=128>>(x&7),p=[y===0&&b<2?255:0xaa,0xcc,0xf0,b&1?255:0];for(let i=0;i<4;i++)if(p[i]&bit)index|=1<<i;return meta.palette[index].map(c=>c*17);}
  const tx=Math.floor(x*meta.columns/80),ty=Math.floor(y*meta.rows/25),col=Math.floor(tx/8),row=Math.floor(ty/16),bit=tx&7,scan=ty&15;
  if((meta.flags&16)&&s.terminals.phase&&scan>=14&&row*meta.textPitch+col===meta.cursor)return [255,255,0];
  if(row===0&&col<2)return pattern&(128>>bit)?[255,255,255]:[0,0,0];
  if(row===Math.floor(80/meta.textPitch)&&col===80%meta.textPitch&&(meta.flags&4))return 0xa5&(1<<(Math.floor(bit/4)*4+Math.floor(scan/4)))?[255,255,255]:[0,0,0];
  return [0,0,0];
 }
 for(let i=0;i<points.length;i++){
  const p=points[i],rgb=want(p.sx,p.sy).map((c,k)=>video==='pegc'?Math.floor((c+25)/51)*51:Math.floor(c/(k===1?4:8))*255/(k===1?63:31));
  for(let k=0;k<3;k++)assert(Math.abs(got[i][k]-rgb[k])<=3,`Canvas ${id} ${p.sx},${p.sy} channel ${k}: ${got[i]} vs ${rgb}`);assert.equal(got[i][3],255);
 }
}
async function finish(vector,bytes=original,fd=false){assert.equal(sha(await h.disk(fd?'fd1':'hdd')),sha(bytes));const s=await h.exit(vector);assert.equal(s.gui.stackGuard,1);await h.unchangedFd();await h.closeContext();}
async function paint(){
 const vector=await h.bootHdd();let s=await start();
 assert.deepEqual(slot(s).font,Array(32).fill(0x81));assert.equal(s.video.helper.stackGuard,1);assert.equal(s.video.helper.ready,1);assert.equal(slot(s).fontPte&4,0,'private CGRAM is never guest-mapped');
 assert.deepEqual(slot(s).codes.slice(0,2),[0xa156,0xa156]);await h.shot('gaiji-semigraphics.png');await pixels();
 h.pass('Real V86 CGRAM OUT instructions, per-slot font bytes, semigraphics, exact scaled Canvas and unmapped font shadow');
 s=await input('4',m=>m.columns===40&&m.rows===20&&m.textPitch===40);await h.shot('forty-twenty.png');await pixels();
 await input('8',m=>m.columns===80&&m.rows===25&&m.textPitch===80);await pixels();
 h.pass('Actual GDC SYNC/PITCH/CCHAR 40x20 and 80x25 round trip, coherent raw TVRAM and viewport composition');
 s=await input('g',m=>!!(m.flags&2)&&!(m.flags&1));assert(slot(s).privatePages.every(p=>(p.pte&7)===7));assert.equal(new Set(slot(s).privatePages.map(p=>p.pte&0xfffff000)).size,32);
 assert.deepEqual(slot(s).sample[0].slice(0,4),[255,255,0xaa,0xaa]);await h.shot('private-four-plane.png');await pixels();
 await input('a',m=>!!(m.flags&8)&&m.palette[1].join(',')==='3,12,6');await pixels();
 h.pass('Four private CPU VRAM planes, GDC FIFO/WDAT/IN register preservation, analog palette and actual 16-colour Canvas pixels');
 await input('t',m=>!(m.flags&2)&&!!(m.flags&1));await pixels();await finish(vector);
}
async function lifecycle(){
 const vector=await h.bootHdd();let s=await start(0);const a=slot(s).fontHash;s=await start(1,2);
 assert.deepEqual(slot(s,1).font,Array(32).fill(0x42));assert.notEqual(slot(s,1).fontHash,a);assert.equal(slot(s).fontHash,a);assert.notEqual(slot(s).origin,slot(s,1).origin);assert.notEqual(slot(s).cr3,slot(s,1).cr3);
 await h.focus(0);await pixels(0);await h.focus(1);await pixels(1);await input('g',m=>!!(m.flags&2),1);s=await until(s=>ready(s,0)&&ready(s,1),'two isolated displays');assert.equal(slot(s).fontHash,a);assert(!(slot(s).meta.flags&2));
 const old=slot(s,1).generation;await h.type('f');s=await h.until(s=>s.cpu.views[1].state===4,'unsupported word I/O faults only owner');assert.equal(s.cpu.views[1].fault,13);assert.equal(s.cpu.views[0].state,2);
 await h.run(1,'KVTERM.COM 0');s=await until(s=>slot(s,1)?.generation!==old&&slot(s,1)?.meta.fontWrites===0&&s.cpu.views[1].state===2&&s.terminals?.slots[1]?.consistent,'recycled generation with unset gaiji');
 assert.deepEqual(slot(s,1).rawFont,Array(32).fill(0));
 await h.shot('unset-gaiji-after-generation.png');
 const r=s.terminals.slots[1].window;
 const blank=await h.page().evaluate(({x,y})=>{const c=document.querySelector('#canvas'),out=document.createElement('canvas');out.width=c.width;out.height=c.height;const g=out.getContext('2d');g.drawImage(c,0,0);return Array.from(g.getImageData(x+8,y+70,16,16).data);},r);
 assert(blank.every((c,i)=>i%4===3?c===255:c===0),'unset gaiji are blank in the legacy renderer after a generation with private glyphs');
 await h.key('CTRL+E');await h.until(s=>s.cpu.views[1].state===0,'End unset generation');
 await h.run(1,'KVTERM.COM 2');s=await until(s=>ready(s,1)&&slot(s,1).generation!==old,'new generation after fault');assert.deepEqual(slot(s,1).font,Array(32).fill(0x42));assert(!(slot(s,1).meta.flags&2));assert.equal(slot(s).fontHash,a);
 await h.focus(0);await h.type('q');await h.until(s=>s.cpu.views[0].state===0,'normal DOS exit');await h.focus(1);await h.key('CTRL+E');await h.until(s=>s.cpu.views[1].state===0,'force end display owner');await finish(vector);
 h.pass('Two actual V86 owners isolate CGRAM/VRAM/modes, fault only the unsupported owner, reset a recycled generation and reclaim all XMS/DOS resources');
 const fd=await h.boot(null,h.legacy);await start();await input('g',m=>!!(m.flags&2));await pixels();await finish(fd,h.legacy,true);
 h.pass('Complete FD fallback contains the same helper/diagnostic, actual graphics work and whole media plus resource/vector/stack invariance holds');
}
try{if(suite==='paint')await paint();else await lifecycle();await h.finish();}catch(e){await writeFile(join(output,'video-failure.json'),JSON.stringify({error:String(e),last},null,2));await h.fail(e);throw e;}finally{await h.close();}
