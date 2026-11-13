import {inspectTerminal} from './kgui32-terminal-inspect.mjs';
import {inspectExpanded} from './kgui32-expanded-inspect.mjs';
// Locate private CPL3 GUI pages by actual PTEs and all CPU-published samples.
// No addresses or screen content are taken from an executable; no RAM writes.
export async function inspectBitmaps(page){
 const s=await inspectTerminal(page);if(!s?.terminals)return null;
 const expanded=await inspectExpanded(page);if(!expanded)return null;
 const bitmaps=await page.evaluate(({runtime,address,capacity,slots,tokens})=>{
  const read=(p,n)=>atob(window.np2debug.np2.readMemoryBase64(p,n).base64),w=(b,o)=>b.charCodeAt(o)|b.charCodeAt(o+1)<<8,d=(b,o)=>(w(b,o)|w(b,o+2)<<16)>>>0;
  const r=read(runtime,1024),g=read(address,256),heap=window.Module.HEAPU8,base=window.kguiTerminalXmsBacking;
  if(base===undefined||!w(r,40)||d(r,944)!==16||d(r,880)!==0x3147554b)return null;
  const table=read(d(r,24)+8192,4096);let first=-1;
  for(let i=0;i<1024;i++)if((d(table,i*4)&7)===7){first=i;break;}if(first<0)return null;
  const start=base+(d(table,first*4)&0xfffff000);if(start<0||start+212>heap.length)return null;
  if(!Array.from({length:64},(_,i)=>heap[start+i]===r.charCodeAt(880+i)).every(Boolean))return null;
  const u=o=>(heap[start+o]|heap[start+o+1]<<8|heap[start+o+2]<<16|heap[start+o+3]<<24)>>>0;
  if(u(192)!==0x3153474b||u(132)!==capacity||u(204)!==196608)return null;
  function app(ptr,n){
   if(ptr<0x800000||n>0x100000||ptr>0xc00000-n)return null;
   const out=new Uint8Array(n);for(let at=0;at<n;){const v=ptr+at,p=d(table,((v-0x800000)>>>12)*4);if((p&5)!==5)return null;const len=Math.min(n-at,4096-(v&4095)),from=base+(p&0xfffff000)+(v&4095);if(from<0||from+len>heap.length)return null;out.set(heap.subarray(from,from+len),at);at+=len;}return new DataView(out.buffer);
  }
  return Array.from({length:capacity},(_,id)=>{
   const m=app(u(196)+id*36,36);if(!m)return null;const v=o=>m.getUint32(o,true),width=v(12),height=v(16),front=v(28);
   if(width>256||height>192||front>1)return null;
   const raw=width&&height&&v(32)?app(u(200)+id*u(204)+front*98304,width*height*2):null;
   const frame=app(u(208)+id*3144,3144),draws=[];
   if(frame&&frame.getUint32(8,true)===2&&frame.getUint32(36,true)<=40){
    for(let i=0;i<frame.getUint32(36,true);i++){const p=72+i*76;draws.push({op:frame.getUint32(p,true),x:frame.getInt32(p+4,true),y:frame.getInt32(p+8,true),w:frame.getInt32(p+12,true),h:frame.getInt32(p+16,true),color:frame.getUint32(p+20,true),handle:frame.getUint32(p+24,true)});}
   }
   const pixels=raw?Array.from({length:width*height},(_,i)=>raw.getUint16(i*2,true)):[];
   let hash=2166136261;for(const value of pixels){hash=Math.imul(hash^(value&255),16777619)>>>0;hash=Math.imul(hash^(value>>8),16777619)>>>0;}
   const gen=d(g,232+id*4),handle=d(g,184+id*4),uploaded=d(g,200+id*4),pending=d(g,216+id*4),geometry=id<2?84+id*24:144+(id-2)*24;
   return {generation:v(0),token:v(4),handle:v(8),width,height,uploaded:v(20),revision:v(24),front,valid:v(32),pixels,hash,
    native:{generation:gen,handle,uploaded,pending},window:Object.fromEntries(['x','y','w','h','sx','sy'].map((key,i)=>[key,u(geometry+i*4)])),
    draws,consistent:!!v(32)&&v(0)===slots[id].generation&&gen===v(0)&&v(4)===tokens[id]&&handle===v(8)&&uploaded===width*height*2&&v(20)===uploaded&&!pending};
  });
 },{runtime:s.gui.runtime,address:s.gui.address,capacity:expanded.capacity,slots:expanded.slots,tokens:expanded.bridge?.clients.map(c=>c.token)??[]});
 return {...s,expanded,bitmaps};
}
