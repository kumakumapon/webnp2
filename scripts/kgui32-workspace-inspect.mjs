import {inspectClients} from './kgui32-client-inspect.mjs';
export async function inspectWorkspace(page){
 const s=await inspectClients(page);if(!s)return null;
 s.editors=s.cpu.diagnostics.map(d=>{
  const v=d.pm32?.samples;if(v?.[0]!==0x3345474b)return null;
  return Object.fromEntries(['magic','version','frames','events','bytes','hash','cursor','anchor','dirty','mode','top','heartbeat','error','history','redo','workspace'].map((k,i)=>[k,v[i]]));
 });
 // App-private IME diagnostics live immediately after the unchanged v4 sample.
 // readMemoryBase64 covers conventional RAM only. Locate the read-only WASM
 // backing of XMS by matching all 64 actual CPU-published sample bytes once,
 // then translate each app's real writable PTE through that common backing.
 // Neither executable bytes nor a host-authored diagnostic value are used.
 s.imes=await page.evaluate(mixed=>{
  if(!mixed)return [null,null];
  const read=(p,n)=>atob(window.np2debug.np2.readMemoryBase64(p,n).base64);
  const d=(b,o)=>(b.charCodeAt(o)|b.charCodeAt(o+1)<<8|b.charCodeAt(o+2)<<16|b.charCodeAt(o+3)<<24)>>>0;
  const m=read(mixed,200),heap=window.Module.HEAPU8;
  return [0,1].map(id=>{
   const r=read(d(m,176+id*4),1024);if(d(r,880)!==0x3345474b||!d(r,24)||!d(r,40))return null;
   const table=read(d(r,24)+8192,4096);let physical=0;for(let i=0;i<1024;i++){const p=d(table,i*4);if((p&7)===7){physical=(p&0xfffff000)>>>0;break;}}
   if(!physical)return null;
   const matches=at=>at>=0&&at+112<=heap.length&&heap[at+64]===0x49&&heap[at+65]===0x4d&&heap[at+66]===0x45&&heap[at+67]===0x31&&Array.from({length:64},(_,i)=>heap[at+i]===r.charCodeAt(880+i)).every(Boolean);
   let at=window.kguiImeXmsBacking===undefined?-1:window.kguiImeXmsBacking+physical;
   if(!matches(at)){
    const found=[];for(let p=heap.indexOf(0x4b);p>=0;p=heap.indexOf(0x4b,p+1))if(heap[p+1]===0x47&&heap[p+2]===0x45&&heap[p+3]===0x33&&matches(p))found.push(p);
    if(found.length!==1)return null;
    at=found[0];window.kguiImeXmsBacking=at-physical;
   }
   const u=o=>(heap[at+o]|heap[at+o+1]<<8|heap[at+o+2]<<16|heap[at+o+3]<<24)>>>0;
   return Object.fromEntries(['magic','scheme','script','bytes','pending','cursor','candidates','selected','selecting','target','dictionary','hash'].map((k,i)=>[k,u(64+i*4)]));
  });
 },s.cpu.mixedAddress);
 s.canvases=s.bridge?.arena?await page.evaluate(arena=>[0,1].map(id=>{
  const b=atob(window.np2debug.np2.readMemoryBase64(arena*16+id*4096,3144).base64);
  const d=o=>(b.charCodeAt(o)|b.charCodeAt(o+1)<<8|b.charCodeAt(o+2)<<16|b.charCodeAt(o+3)<<24)>>>0;
  const commands=Array.from({length:Math.min(d(36),40)},(_,i)=>72+i*76);
  return {width:d(28),height:d(32),count:d(36),buttons:commands.filter(at=>d(at)===3).map(at=>({id:d(at+24),x:d(at+4),y:d(at+8),w:d(at+12),h:d(at+16),text:b.slice(at+28,at+76).split('\0')[0]})),draws:commands.filter(at=>d(at)===2).map(at=>({x:d(at+4),y:d(at+8),text:b.slice(at+28,at+76).split('\0')[0]})),controls:commands.filter(at=>d(at)===3).map(at=>d(at+24)),
   texts:commands.filter(at=>d(at)===2).map(at=>b.slice(at+28,at+76).split('\0')[0])};
 }),s.bridge.arena):[];
 return s;
}
