import {inspectTerminal} from './kgui32-terminal-inspect.mjs';
// Read-only observation of CPU-published root PTEs, private V86 PTEs and the
// resident helper. Never infer display bytes from the packaged diagnostic.
export async function inspectVideo(page){
 const s=await inspectTerminal(page);if(!s)return null;
 s.video=await page.evaluate(({runtime,mixed})=>{
  if(!runtime||!mixed||window.kguiTerminalXmsBacking===undefined)return null;
  const read=(p,n)=>atob(window.np2debug.np2.readMemoryBase64(p,n).base64),w=(b,o)=>b.charCodeAt(o)|b.charCodeAt(o+1)<<8,d=(b,o)=>(w(b,o)|w(b,o+2)<<16)>>>0;
  const r=read(runtime,1024),m=read(mixed,200),heap=window.Module.HEAPU8,base=window.kguiTerminalXmsBacking;
  if(w(m,22)||!w(r,40))return null;
  const table=read(d(r,24)+8192,4096);
  function app(ptr,n){if(ptr<0x800000||n>0x400000||ptr>0xc00000-n)return null;const out=new Uint8Array(n);for(let j=0;j<n;){const v=ptr+j,p=d(table,((v-0x800000)>>>12)*4);if((p&5)!==5)return null;const k=Math.min(n-j,4096-(v&4095)),at=base+(p&0xfffff000)+(v&4095);if(at<0||at+k>heap.length)return null;out.set(heap.subarray(at,at+k),j);j+=k;}return out;}

  // inspectTerminal located the shared XMS backing through CPU samples.
  // Select the first actual writable root PTE, avoiding the identical 64-byte
  // diagnostic sample stored in the resident runtime itself.
  let physical;
  for(let i=0;i<1024;i++){const p=d(table,i*4);if((p&7)===7){physical=p&0xfffff000;break;}}
  if(!physical)return null;
  const rootAt=base+physical;
  if(rootAt<0||rootAt+236>heap.length||!Array.from({length:64},(_,i)=>heap[rootAt+i]===r.charCodeAt(880+i)).every(Boolean))return null;
  const u=o=>(heap[rootAt+o]|heap[rootAt+o+1]<<8|heap[rootAt+o+2]<<16|heap[rootAt+o+3]<<24)>>>0;
  if(u(212)!==0x3156474b||u(220)!==153600)return null;
  const gens=app(u(224),16),revs=app(u(228),16),valid=app(u(232),16);if(!gens||!revs||!valid)return null;
  const word=(b,o)=>b[o]|b[o+1]<<8,uint=(b,o)=>(word(b,o)|word(b,o+2)<<16)>>>0;
  const hash=b=>{let h=2166136261;for(const c of b)h=Math.imul(h^c,16777619)>>>0;return h;};
  const ram=read(0x10000,0x90000),helperAt=ram.indexOf('KV98VID1'),helper=helperAt<0?null:ram.slice(helperAt,helperAt+580);
  const slots=[0,1].map(id=>{
   if(!uint(valid,id*4)||w(m,152+id*2)!==0)return null;
   const b=app(u(216)+id*153600,153600);if(!b)return null;
   const view=read(d(m,168+id*4),44),cr3=d(view,12),generation=uint(gens,id*4),revision=uint(revs,id*4),state=w(view,0),live=[1,2,3].includes(state);
   const pte=page=>d(read(cr3+4096+page*4,4),0),origin=(pte(0xa0)&0xfffff000)-0xa0000;
   const raw=(at,n)=>heap.subarray(base+origin+at,base+origin+at+n);
   const meta={version:uint(b,0),size:uint(b,4),flags:uint(b,8),columns:uint(b,12),rows:uint(b,16),width:uint(b,20),height:uint(b,24),pitch:uint(b,28),start:uint(b,32),textPitch:uint(b,36),textStart:uint(b,40),cursor:uint(b,44),palette:Array.from({length:16},(_,i)=>Array.from(b.slice(48+i*3,51+i*3))),fontWrites:uint(b,124)};
   const font=b.slice(128,6144),planes=Array.from({length:4},(_,p)=>b.slice(6144+p*32768,6144+(p+1)*32768));
   const planePages=[...Array.from({length:24},(_,i)=>0xa8+i),...Array.from({length:8},(_,i)=>0xe0+i)];
   const privatePages=planePages.map(page=>({page,pte:pte(page)}));
   const fontEqual=!live||hash(font)===hash(raw(0xc0000,6016));
   const graphEqual=!(meta.flags&2)||!live||planes.every((b,p)=>hash(b)===hash(raw(p===3?0xe0000:0xa8000+p*32768,32768)));
   const textEqual=!live||hash(b.slice(137216,145408))===hash(raw(0xa0000,8192))&&hash(b.slice(145408,153600))===hash(raw(0xa2000,8192));
   return {generation,revision,state,cr3,origin,meta,font:Array.from(font.slice(0,32)),fontHash:hash(font),rawFont:live?Array.from(raw(0xc0000,32)):null,planeHashes:planes.map(hash),sample:planes.map(p=>Array.from(p.slice(0,32))),codes:Array.from({length:160},(_,i)=>word(b,137216+i*2)),attributes:Array.from({length:160},(_,i)=>word(b,145408+i*2)),privatePages,fontPte:pte(0xc0),fontEqual,graphEqual,textEqual,consistent:generation===d(m,160+id*4)&&revision===w(view,6)&&fontEqual&&graphEqual&&textEqual};
  });
  return {helper:helper?{ready:w(helper,12),busy:w(helper,14),calls:d(helper,24),rejected:d(helper,28),stackGuard:d(helper,32),generations:[0,1,2,3].map(i=>d(helper,36+i*4))}:null,slots};
 },{runtime:s.gui?.runtime,mixed:s.cpu?.mixedAddress});
 return s;
}
