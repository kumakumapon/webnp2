import {inspectGUI} from './kgui32-inspect.mjs';
// Read actual resident producers, CPU frames and page tables. No RAM writes.
export async function inspectExpanded(page){
 const gui=await inspectGUI(page);if(!gui)return null;
 return page.evaluate(gui=>{
  const n=window.np2debug?.np2;if(!n)return null;
  const read=(p,l)=>atob(n.readMemoryBase64(p,l).base64),w=(s,o)=>s.charCodeAt(o)|s.charCodeAt(o+1)<<8,d=(s,o)=>(w(s,o)|w(s,o+2)<<16)>>>0;
  let at=window.kguiExpandedManager;
  if(!at){const scan=read(0x10000,0x90000);let i=-1;while((i=scan.indexOf('K32MUX02',i+1))>=0)if(w(scan,i+8)===2&&w(scan,i+10)===264&&w(scan,i+12)===1&&w(scan,i+256)>0x1000){at=i+0x10000;break;}if(!at)return null;window.kguiExpandedManager=at;}
  const m=read(at,264),capacity=w(m,258);if(w(m,22)||![2,4].includes(capacity))return null;
  const legacy=read(d(m,252),4240);if(w(legacy,22))return null;
  const r=read(d(m,248),1084),slots=[];
  for(let id=0;id<capacity;id++){
   const v=read(d(m,184+id*4),2044),u=read(d(m,216+id*4),60),kind=w(m,152+id*2),p=read(d(m,200+id*4),1024),pd=d(v,12);
   const tables=pd&&([1,2,3,4].includes(w(v,0)))?read(pd,12288):null;
   const f=read(d(m,232+id*4),76);
   slots.push({id,kind,abi:w(m,160+id*2),generation:d(m,168+id*4),state:w(v,0),fault:w(v,4),revision:w(v,6),counter:d(v,32),physical:d(v,16),pd,eip:d(v,20),eflags:d(v,24),screen:v.slice(44),
    usage:{generation:d(u,0),ticks:d(u,4),runs:d(u,8),limit:d(u,12),memory:w(u,20),heap:w(u,22),handles:w(u,24),psp:w(u,28),program:u.slice(44,60).split('\0')[0]},
    frame:{eip:d(f,kind?56:40),cs:d(f,kind?60:44),eflags:d(f,kind?64:48)},
    pde0:tables?d(tables,0):null,pde2:tables?d(tables,8):null,ptes:tables?Array.from({length:1024},(_,i)=>d(tables,8192+i*4)):null,
    pm:kind?{state:d(p,12),error:d(p,16),exitCode:d(p,628),cr2:d(p,72),faultError:d(p,76),abi:d(p,768),features:d(p,772),heapBase:d(p,780),heapLimit:d(p,784),allocations:d(p,796),frees:d(p,800),waitPolls:d(p,812),handle:w(p,40),locked:w(p,42),reason:d(p,68),heap:d(p,788),openFiles:d(p,820),samples:Array.from({length:d(p,944)},(_,i)=>d(p,880+i*4)),frame:{eip:d(p,376),cs:d(p,380),eflags:d(p,384),esp:d(p,388),ss:d(p,392)},freed:d(p,156),unmapped:d(p,464),tablesCleared:d(p,948)}:null});
  }
  const events=Array.from({length:w(r,18)},(_,i)=>{const o=140+((w(r,16)+16-w(r,18)+i)%16)*32;return {session:w(r,o+20),generation:d(r,o+4),type:w(r,o+22),fault:w(r,o+26)};});
  const scan=read(0x10000,0x90000);let b=-1,bridge=null;
  while((b=scan.indexOf('KGCLNT01',b+1))>=0)if(d(scan,b+8)===1&&d(scan,b+12)===84&&d(scan,b+16)===gui.owner){const arena=d(scan,b+20),ready=d(scan,b+32);bridge={arena,ready,clients:ready?Array.from({length:capacity},(_,id)=>{const c=read(arena*16+id*4096+3200,76);return {generation:d(c,0),token:d(c,4),revision:d(c,8),width:d(c,12),height:d(c,16),title:c.slice(44,76).split('\0')[0]};}):[]};break;}
  return {gui,address:at,capacity,profile:w(m,260),slots,events,bridge};
 },gui);
}
