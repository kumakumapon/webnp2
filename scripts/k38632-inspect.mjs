// Actual standalone probe records in conventional RAM, not loader-generated CPU state.
export async function inspectRing3Probe(page,previousTag=null){
 return page.evaluate(previous=>{
  const n=window.np2debug.np2,w=(b,o)=>b.charCodeAt(o)|b.charCodeAt(o+1)<<8;
  const d=(b,o)=>(w(b,o)|w(b,o+2)<<16)>>>0;
  const ram=atob(n.readMemoryBase64(0x10000,0x90000).base64);let at=-1;
  while((at=ram.indexOf('K32CPU01',at+1))>=0){
   if(w(ram,at+8)!==256||w(ram,at+10)!==576)continue;
   const b=ram.slice(at,at+576),address=at+0x10000,base=d(b,20),tag=d(b,88);
   if(!base||base+d(b,84)!==address||d(b,12)!==31||tag===previous)continue;
   const fields=['vector','cr0','cr3','cr2','eip','cs','eflags','esp','ss','error','userCS','userSS','userFlags','userSP','cookie','picISR','userDS','index','restoredCR0','restoredCR3','restoredFlags','restoredMask','pfGateAccess','savedFlags'];
   const pd=d(b,24),tables=atob(n.readMemoryBase64(pd,12288).base64);
   return {address,base,tag,complete:d(b,12),error:d(b,16),pd,
    savedCR0:d(b,28),restoredCR0:d(b,32),savedCR3:d(b,36),restoredCR3:d(b,40),
    savedGDT:Array.from(b.slice(44,50),c=>c.charCodeAt(0)),restoredGDT:Array.from(b.slice(50,56),c=>c.charCodeAt(0)),
    savedIDT:Array.from(b.slice(56,62),c=>c.charCodeAt(0)),restoredIDT:Array.from(b.slice(62,68),c=>c.charCodeAt(0)),
    savedFlags:d(b,68),restoredFlags:d(b,72),savedMask:b.charCodeAt(76),restoredMask:b.charCodeAt(77),refused:w(b,78),
    pdes:[d(tables,0),d(tables,8)],ptes:[0,1,2,3].map(i=>d(tables,8192+i*4)),
    cases:Array.from({length:5},(_,i)=>Object.fromEntries(fields.map((name,j)=>[name,d(b,96+i*96+j*4)])))};
  }return null;
 },previousTag);
}
