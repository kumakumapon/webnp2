import {inspectClients} from './kgui32-client-inspect.mjs';
// Read only the actual GUI's CPL3 pages and each V86's private TVRAM. PTEs and
// all 64 CPU-published GUI samples identify the live WASM XMS backing. No guest
// memory is written, and no address or expected screen is taken from an EXE.
export async function inspectTerminal(page){
 const s=await inspectClients(page);if(!s)return null;
 s.terminals=await page.evaluate(({runtime,mixed})=>{
  if(!runtime||!mixed)return null;
  const read=(p,n)=>atob(window.np2debug.np2.readMemoryBase64(p,n).base64);
  const w=(b,o)=>b.charCodeAt(o)|b.charCodeAt(o+1)<<8,d=(b,o)=>(w(b,o)|w(b,o+2)<<16)>>>0;
  const r=read(runtime,1024),m=read(mixed,200),heap=window.Module.HEAPU8;
  if(w(m,22)||!w(r,40)||d(r,880)!==0x3147554b||d(r,944)!==16)return null;
  const table=read(d(r,24)+8192,4096);let physical;
  for(let i=0;i<1024;i++){const p=d(table,i*4);if((p&7)===7){physical=(p&0xfffff000)>>>0;break;}}
  if(!physical)return null;
  const matches=at=>at>=0&&at+132<=heap.length&&heap[at+64]===0x4b&&heap[at+65]===0x47&&heap[at+66]===0x54&&heap[at+67]===0x32&&Array.from({length:64},(_,i)=>heap[at+i]===r.charCodeAt(880+i)).every(Boolean);
  let at=window.kguiTerminalXmsBacking===undefined?-1:window.kguiTerminalXmsBacking+physical;
  if(!matches(at)){
   const found=[];for(let p=heap.indexOf(0x4b);p>=0;p=heap.indexOf(0x4b,p+1))if(heap[p+1]===0x47&&heap[p+2]===0x55&&heap[p+3]===0x31&&matches(p))found.push(p);
   if(found.length!==1)return null;at=found[0];window.kguiTerminalXmsBacking=at-physical;
  }
  const u=o=>(heap[at+o]|heap[at+o+1]<<8|heap[at+o+2]<<16|heap[at+o+3]<<24)>>>0;
  function app(ptr,n){
   if(ptr<0x800000||n>0x400000||ptr>0xc00000-n)return null;
   const b=new Uint8Array(n);for(let j=0;j<n;){const v=ptr+j,p=d(table,((v-0x800000)>>>12)*4);if((p&5)!==5)return null;const k=Math.min(n-j,4096-(v&4095)),start=window.kguiTerminalXmsBacking+(p&0xfffff000)+(v&4095);if(start<0||start+k>heap.length)return null;b.set(heap.subarray(start,start+k),j);j+=k;}return new DataView(b.buffer);
  }
  const raw=phys=>{const start=window.kguiTerminalXmsBacking+phys;if(start<0||start+4000>heap.length)return null;return Array.from({length:2000},(_,i)=>heap[start+i*2]|heap[start+i*2+1]<<8);};
  return {phase:u(76),valid:u(80),slots:[0,1].map(id=>{
   if(!(u(80)&1<<id)||w(m,152+id*2)!==0)return null;
   const b=app(u(68+id*4),8032);if(!b||b.getUint32(0,true)!==2||b.getUint32(4,true)!==8032)return null;
   const v=read(d(m,168+id*4),44),cr3=d(v,12),live=[1,2,3,4].includes(w(v,0));
   const codes=Array.from({length:2000},(_,i)=>b.getUint16(32+i*2,true)),attributes=Array.from({length:2000},(_,i)=>b.getUint16(4032+i*2,true));
   const rawCodes=live?raw(d(read(cr3+4096+0xa0*4,4),0)&0xfffff000):null;
   const rawAttributes=live?raw(d(read(cr3+4096+0xa2*4,4),0)&0xfffff000):null;
   const generation=b.getUint32(12,true),revision=b.getUint32(16,true),state=b.getUint32(20,true),column=b.getUint32(24,true),row=b.getUint32(28,true);
   const consistent=generation===d(m,160+id*4)&&revision===w(v,6)&&state===w(v,0)&&column===w(v,36)&&row===w(v,38)&&(!live||rawCodes?.every((c,i)=>c===codes[i])&&rawAttributes?.every((c,i)=>c===attributes[i]));
   return {generation,revision,state,column,row,codes,attributes,rawCodes,rawAttributes,consistent,window:Object.fromEntries(['x','y','w','h','sx','sy'].map((k,i)=>[k,u(84+id*24+i*4)]))};
  })};
 },{runtime:s.gui?.runtime,mixed:s.cpu?.mixedAddress});
 return s;
}
