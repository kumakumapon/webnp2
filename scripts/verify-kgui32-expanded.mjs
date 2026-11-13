// CI client only. Real keys/mouse exercise the shipped HDD/FD and native CPU.
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {toolsHarness,sha} from './kgui32-tools-harness.mjs';
import {inspectExpanded} from './kgui32-expanded-inspect.mjs';
const [base='http://127.0.0.1:4173/',output='test-results/expanded',video='pegc',suite='runtime']=process.argv.slice(2);
assert(['runtime','lifecycle'].includes(suite));
const h=await toolsHarness(base,output,video),m=h.manifest;assert.equal(m.runtime_profiles.expanded.application_slots,4);
let last;const results=[];
async function until(f,label){console.log('CHECK',label);for(let end=Date.now()+120000;Date.now()<end;){const s=await inspectExpanded(h.page());if(s){last=s;if(f(s))return s;}await h.page().waitForTimeout(100);}throw Error(label+'; see expanded-failure.json');}
const pass=name=>{results.push(name);console.log('PASS',name);};
async function focus(id){const s=await until(s=>s.gui.app?.frames,'desktop'),step=(s.gui.width-300)/4;await h.click(300+step*id+step/2,s.gui.height-16);return until(s=>s.gui.app.active===id+2,'focus '+id);}
async function run(id,command){await focus(id);const generation=last.slots[id].generation;await h.key('CTRL+L');await h.type(command+'\r');return until(s=>s.slots[id].generation!==generation&&[1,2,4].includes(s.slots[id].state),'run '+id+' '+command);}
async function stop(id){
 const s=await focus(id),c=s.bridge?.clients[id];
 if(c?.token&&s.slots[id].kind){const x=id?s.gui.width-c.width-32:16,y=id?Math.max(40,s.gui.height-c.height-144):40;await h.click(x+230,y+48);}else await h.key('CTRL+E');
 return until(s=>s.slots[id].state===0,'end '+id);
}
async function finish(vector,before,floppy=false){
 assert.equal(sha(await h.disk(floppy?'fd1':'hdd')),sha(before));
 await h.exit(vector);const s=await until(s=>s.capacity===2&&s.gui.completed===1,'release expansion');assert.equal(s.gui.stackGuard,1);assert.equal(s.gui.owned,0);await h.unchangedFd();await h.closeContext();
}
function separate(s){
 assert.equal(s.capacity,4);assert.equal(s.profile,32);assert.equal(s.gui.cpu.frame.cs,59);
 assert.equal(new Set(s.slots.map(v=>v.pd)).size,4);assert.equal(new Set(s.slots.map(v=>v.physical)).size,4);
 assert.equal(new Set(s.slots.map(v=>v.generation)).size,4);
 for(const v of s.slots){assert.notEqual(v.pd,s.gui.cpu.pd);assert(v.physical>=0x100000&&v.physical<0x2000000);assert.equal(v.generation,v.usage.generation);assert(v.usage.runs>0&&v.usage.ticks>0);}
}
async function progress(before,ids){return until(s=>ids.every(id=>s.slots[id].generation===before.slots[id].generation&&s.slots[id].counter!==before.slots[id].counter&&s.slots[id].usage.runs>before.slots[id].usage.runs),'peer progress '+ids);}
async function runtime(){
 const vector=await h.bootHdd(undefined,true,32),original=await readFile(new URL('../public/kgui32/'+m.standalone_hdd.image,import.meta.url));
 await until(s=>s.capacity===4,'four-slot shipping profile');await h.key('F2');await h.key('T');
 let s=await until(s=>s.slots.length===4&&s.slots.every(v=>v.kind===1&&v.state===1&&v.counter>0&&v.pm.samples?.[2]===0x50333221),'four actual CPL3 counters');
 separate(s);for(const v of s.slots){assert.equal(v.pm.frame.cs,59);assert.equal(v.pm.frame.eflags&0x20000,0);assert.equal(v.pde0&7,3);assert.equal(v.pde2&7,7);assert.equal(v.ptes[0]&7,5);assert.equal(v.ptes[1023]&7,7);assert.equal(v.ptes[1022],0);assert.equal(v.pm.error,0);}
 await progress(s,[0,1,2,3]);await h.shot('four-pm32.png');pass('32 MiB shipping HDD boots four independent CPL3 counters with real page tables, permissions, CPU samples and fair progress');
 // Proof workers do not open windows. Open their existing slots through New DOS.
 for(let id=0;id<4;id++)await h.click(s.gui.width-360+id*56+24,15);
 await focus(2);await h.key('CTRL+P');s=await until(s=>s.slots[2].state===3,'pause slot 3');const counter=s.slots[2].counter;
 s=await progress(s,[0,1,3]);assert.equal(s.slots[2].counter,counter);await h.key('CTRL+R');await until(s=>s.slots[2].state===1&&s.slots[2].counter!==counter,'resume slot 3');
 await stop(3);s=await run(3,'FAULT32.EXE');s=await until(s=>s.slots[3].state===4&&s.slots[3].pm.handle===0&&s.slots[3].pm.openFiles===0,'fourth slot protected fault');
 assert(s.events.some(e=>e.session===3&&e.type===3&&e.generation===s.slots[3].generation));await progress(s,[0,1,2]);pass('Third-slot pause/resume and fourth-slot fault reclaim their own resources while all peers continue');
 await h.key('F2');await h.key('S');await until(s=>s.slots.every(v=>v.state===0),'stop all owned workers');
 for(let id=0;id<4;id++)await run(id,'COUNTER.EXE');
 s=await until(s=>s.slots.every(v=>v.kind===0&&v.state===1&&v.counter>0&&v.screen.includes('V86 COUNTER')),'four V86 counters');separate(s);for(const v of s.slots)assert(v.frame.eflags&0x20000);
 await progress(s,[0,1,2,3]);await h.shot('four-v86.png');pass('All four V86 banks preserve private CPU frames, RAM, generation and concurrent counter progress');
 await stop(1);await run(1,'COUNT32.EXE 2');await stop(3);await run(3,'COUNT32.EXE 4');
 s=await until(s=>s.slots.map(v=>v.kind).join('')==='0101'&&s.slots.every(v=>v.state===1&&v.counter>0),'mixed four slots');separate(s);await progress(s,[0,1,2,3]);pass('Four mixed V86/PM32 slots remain isolated and runnable after cross-mode replacement');
 await finish(vector,original);pass('GUI exit restores conventional memory, XMS, vectors, stack guards and the original two-slot manager; whole HDD is unchanged');
}
async function lifecycle(){
 const original=await readFile(new URL('../public/kgui32/'+m.standalone_hdd.image,import.meta.url));
 let vector=await h.bootHdd(undefined,true,32);await until(s=>s.capacity===4,'expanded desktop');
 const commands=['KGCALC.EXE','KGCLOCK.EXE','KGFILES.EXE','KGEDIT.EXE'];
 for(let id=0;id<4;id++){let s=await until(s=>s.gui.app?.frames,'ready');await h.click(s.gui.width-360+id*56+24,15);await until(s=>s.slots[id].state===2,'shell slot '+id);await stop(id);await run(id,commands[id]);await until(s=>s.bridge?.clients[id]?.token&&s.slots[id].pm?.samples?.[2]>0,'graphical slot '+id);}
 let s=await until(s=>s.bridge.clients.length===4&&s.bridge.clients.every((c,i)=>c.token&&c.generation===s.slots[i].generation&&c.revision>1),'four independent graphical clients');
 separate(s);assert.equal(new Set(s.bridge.clients.map(c=>c.token)).size,4);await h.shot('four-graphical-clients.png');
 const old=s.slots[3].generation;await focus(3);await h.key('a');await h.key('BS');await stop(3);await run(3,'KGCLOCK.EXE');s=await until(s=>s.slots[3].generation!==old&&s.bridge.clients[3].token&&s.bridge.clients[3].generation===s.slots[3].generation,'fourth slot graphical recycle');
 assert(s.bridge.clients.slice(0,3).every((c,i)=>c.generation===s.slots[i].generation));pass('Four real GUI clients own separate queues/tokens and recycle the fourth slot without changing peers');
 await finish(vector,original);pass('Four graphical clients, heap and handles are reclaimed at desktop exit with unchanged media');
 // 24 MiB is intentionally below the expanded profile; the rejected request
 // must not leak any partially allocated control bank or change the old ABI.
 vector=await h.bootHdd(undefined,true,24);s=await until(s=>s.gui.app?.frames&&s.capacity===2,'24 MiB two-slot fallback');await h.key('F2');await h.key('T');await until(s=>s.slots.length===2&&s.slots.every(v=>v.state===1&&v.counter>0),'fallback workers');await h.exit(vector);await h.closeContext();pass('24 MiB rejects expansion, retains both working slots and restores memory exactly');
 vector=await h.boot(null,h.legacy,32);s=await until(s=>s.capacity===4,'complete FD four-slot boot');await h.key('F2');await h.key('T');await until(s=>s.slots.every(v=>v.state===1&&v.counter>0),'FD four workers');await finish(vector,h.legacy,true);pass('The complete standalone FD also supports four slots without any HDD');
}
try{
 if(suite==='runtime')await runtime();else await lifecycle();
 await writeFile(join(output,'expanded-verification.json'),JSON.stringify({video,suite,source:m.source_commit,results},null,2)+'\n');
}catch(e){
 const raw=await h.page().evaluate(()=>{
  const n=window.np2debug?.np2;if(!n)return null;const s=atob(n.readMemoryBase64(0,0xa0000).base64),w=o=>s.charCodeAt(o)|s.charCodeAt(o+1)<<8;
  const records=[];for(const sig of ['K32MUX01','K32MUX02','K386EXT1','KX32MEM1','KX32BOOT']){let at=-1;while((at=s.indexOf(sig,at+1))>=0)records.push({sig,address:at,words:Array.from({length:132},(_,i)=>w(at+i*2))});}
  return {url:location.href,above16:w(0x594),records};
 }).catch(String);
 await writeFile(join(output,'expanded-native-raw.json'),JSON.stringify(raw,null,2)+'\n');
 await writeFile(join(output,'expanded-failure.json'),JSON.stringify({error:String(e),last:await inspectExpanded(h.page()).catch(()=>last),results},null,2)+'\n');await h.fail(e);throw e;}
finally{await h.close();}
