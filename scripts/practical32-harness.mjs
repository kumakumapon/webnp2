// Finite Actions client. Observe real CPU/PTEs/retained frames; never write RAM.
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {toolsHarness,sha,fnv} from './kgui32-tools-harness.mjs';
import {inspectBitmaps} from './kgui32-bitmap-inspect.mjs';
export {sha,fnv};
export async function practicalHarness(base,output,video){
 const h=await toolsHarness(base,output,video),proof=[],results=[];
 const original=await readFile(new URL('../public/kgui32/'+h.manifest.standalone_hdd.image,import.meta.url));
 let last;
 async function inspect(){
  const s=await inspectBitmaps(h.page());if(!s?.expanded)return null;
  const native=await h.page().evaluate(()=>{
   const read=(p,n)=>atob(window.np2debug.np2.readMemoryBase64(p,n).base64),w=(b,o)=>b.charCodeAt(o)|b.charCodeAt(o+1)<<8,d=(b,o)=>(w(b,o)|w(b,o+2)<<16)>>>0;
   if(!window.practicalNativeRecords){
    const bytes=read(0x10000,0x90000);let broker=-1,host=-1;
    for(let p=bytes.indexOf('K32IOV01');p>=0;p=bytes.indexOf('K32IOV01',p+1))if(w(bytes,p+8)===1&&w(bytes,p+10)===192&&w(bytes,p+12)===1)broker=p+0x10000;
    for(let p=bytes.indexOf('K32HOST1');p>=0;p=bytes.indexOf('K32HOST1',p+1))if(w(bytes,p+8)===1&&w(bytes,p+10)===7584&&w(bytes,p+12)===1)host=p+0x10000;
    if(broker<0||host<0)return null;window.practicalNativeRecords={broker,host};
   }
   const {broker,host}=window.practicalNativeRecords,b=read(broker,192),r=read(host,7584);if(w(b,14)||w(r,22))return null;
   const failure=r.slice(6560,7584);
   return {broker:{address:broker,ready:w(b,12),stackOk:d(b,28),calls:d(b,20),rejected:d(b,24),owners:Array.from({length:8},(_,i)=>{const p=32+i*20;return {owner:d(b,p),epoch:d(b,p+4),handles:d(b,p+8),phase:d(b,p+12),bytes:d(b,p+16)};})},failure:{state:d(failure,12),error:d(failure,16),loaderError:d(failure,576),handle:w(failure,40),openFiles:d(failure,820)}};
  });
  if(!native)return null;s.native=native;
  s.appRaw=await h.page().evaluate(slots=>{
   const n=window.np2debug.np2,heap=window.Module.HEAPU8,base=window.kguiTerminalXmsBacking;
   const read=(p,n)=>atob(window.np2debug.np2.readMemoryBase64(p,n).base64),d=(b,o)=>(b.charCodeAt(o)|b.charCodeAt(o+1)<<8|b.charCodeAt(o+2)<<16|b.charCodeAt(o+3)<<24)>>>0;
   return slots.map(slot=>{
    if(!slot.pm?.handle||!slot.ptes||slot.pm.samples.length!==16||base===undefined)return null;
    const table=read(slot.pd+8192,4096);let physical=0;for(let i=0;i<1024;i++){const p=d(table,i*4);if((p&7)===7){physical=p&0xfffff000;break;}}if(!physical)return null;
    if(physical<slot.physical||physical>=slot.physical+4194304)return null;
    const at=base+physical;if(at<0||at+120>heap.length)return null;
    const u=o=>(heap[at+o]|heap[at+o+1]<<8|heap[at+o+2]<<16|heap[at+o+3]<<24)>>>0;
    // The actual owner's current RW PTE and CPU-published immutable header
    // identify live private stats; mutable events/IME can advance after yield.
    if(u(0)!==slot.pm.samples[0]||u(4)!==slot.pm.samples[1])return null;
    return Array.from({length:30},(_,i)=>u(i*4));
   });
  },s.expanded.slots);
  last=s;return s;
 }
 async function until(f,label,timeout=120000){console.log('CHECK',label);let error;for(let end=Date.now()+timeout;Date.now()<end;){const s=await inspect().catch(e=>{error=String(e);return null;});if(s&&f(s))return s;await h.page().waitForTimeout(100);}throw Error(label+' '+JSON.stringify({error,slots:last?.expanded.slots.map(s=>({id:s.id,state:s.state,pm:s.pm})),native:last?.native}));}
 const samples=(s,id=0)=>s.expanded.slots[id].pm?.samples??[];
 async function focus(id){const s=await until(s=>s.gui.app?.frames,'focus ready');if(s.gui.app.active===id+2)return s;const step=s.expanded.capacity===2?146:(s.gui.width-300)/4;await h.click(s.expanded.capacity===2?330+146*id:Math.round(300+step*(id+.5)),s.gui.height-16);return until(s=>s.gui.app.active===id+2,'focus '+id);}
 async function launch(kind,id=0){const s=await until(s=>s.gui.app?.frames,'launcher ready'),generation=s.expanded.slots[id].generation;await h.key('F2');await h.click(kind==='image'?292:kind==='words'?292:130,kind==='words'?164:266);return until(s=>s.expanded.slots[id].generation!==generation&&samples(s,id)[0]===(kind==='image'?0x3149474b:kind==='words'?0x32574b47:0x3345474b)&&samples(s,id)[2]>0,'launch '+kind+' '+id);}
 async function end(id){const s=await focus(id),r=s.bitmaps[id].window;await h.click(r.x+230,r.y+48);return until(s=>s.expanded.slots[id].state===0,'End '+id);}
 async function run(id,command){const s=await focus(id),generation=s.expanded.slots[id].generation;await h.enterCommand(command);return until(s=>s.expanded.slots[id].generation!==generation,'Run '+command);}
 async function control(id,code){await focus(id);const s=await until(s=>s.bitmaps[id].draws.some(d=>d.op===3&&d.handle===code),'retained control '+code),events=samples(s,id)[3];const b=s.bitmaps[id].draws.find(d=>d.op===3&&d.handle===code);const r=s.bitmaps[id].window;await h.click(r.x+8+b.x+Math.floor(b.w/2),r.y+70+b.y+Math.floor(b.h/2));return until(s=>samples(s,id)[3]>events||s.expanded.slots[id].state===0,'control '+code);}
 async function appKey(id,key,timeout=120000){await focus(id);const s=last,before=samples(s,id);if(key.length===1&&key.charCodeAt(0)>=32)await h.type(key);else await h.key(key);return until(s=>samples(s,id)[3]>before[3]&&samples(s,id)[2]>before[2]||s.expanded.slots[id].state===0,'app key '+key,timeout);}
 async function appType(id,text){for(const c of text){await focus(id);const before=samples(last,id);await h.type(c);await until(s=>samples(s,id)[3]>before[3]&&samples(s,id)[2]>before[2],'app character '+c);}}
 async function stopAll(){const s=await until(s=>s.gui.app?.frames,'before cleanup');for(let id=s.expanded.capacity-1;id>=0;id--)if((await until(()=>true,'cleanup slot '+id)).expanded.slots[id].state!==0)await end(id);}
 async function cleanup(vector,keepContext=false){await stopAll();const s=await until(s=>s.native.broker.owners.every(o=>!o.handles),'all broker handles closed');assert.equal(s.native.broker.stackOk,1);const done=await h.exit(vector);assert.equal(done.gui.stackGuard,1);assert.equal(done.gui.cpu.freeBefore,done.gui.cpu.freeAfter);await h.unchangedFd();if(!keepContext)await h.closeContext();}
 function pass(label,data){results.push(label);if(data)proof.push({label,data});console.log('PASS',label);}
 async function finish(){await writeFile(join(output,'verification.json'),JSON.stringify({video,source:h.manifest.source_commit,results,proof},null,2)+'\n');}
 async function fail(e){await writeFile(join(output,'practical-failure.json'),JSON.stringify({error:String(e),last,results},null,2)+'\n');await h.fail(e);}
 return {h,original,inspect:()=>until(()=>true,'coherent snapshot'),until,samples,focus,launch,end,run,control,appKey,appType,cleanup,pass,finish,fail,last:()=>last};
}
