// Inspect guest-owned conventional records and actual page tables of K32MEM.
export async function inspectMemoryRunner(page,previousTag=null,signature='K32MEM01'){
 return page.evaluate(({previous,signature})=>{
  const n=window.np2debug.np2,w=(b,o)=>b.charCodeAt(o)|b.charCodeAt(o+1)<<8;
  const d=(b,o)=>(w(b,o)|w(b,o+2)<<16)>>>0;
  const ram=atob(n.readMemoryBase64(0x10000,0x90000).base64);let at=-1;
  while((at=ram.indexOf(signature,at+1))>=0){
   if(w(ram,at+8)!==256||w(ram,at+10)!==1024)continue;
   const b=ram.slice(at,at+1024),base=d(b,20),tag=d(b,56);
   if(!base||base+d(b,504)!==at+0x10000||!tag||tag===previous)continue;
   const fields=['gs','fs','es','ds','edi','esi','ebp','ignored','ebx','edx','ecx','eax','vector','error','eip','cs','eflags','esp','ss'];
   const frame=o=>Object.fromEntries(fields.map((k,i)=>[k,d(b,o+i*4)]));
   const pd=d(b,24),tables=pd?atob(n.readMemoryBase64(pd,12288).base64):null;
   return {address:at+0x10000,base,tag,state:d(b,12),error:d(b,16),pd,physical:d(b,28),raw:d(b,32),allocationBytes:d(b,36),
    handle:w(b,40),locked:w(b,42),owner:w(b,44),mode:w(b,46),freeBefore:w(b,48),freeAfter:w(b,50),largestBefore:w(b,52),largestAfter:w(b,54),
    irqs:d(b,60),resumes:d(b,64),reason:d(b,68),cr2:d(b,72),faultError:d(b,76),picISR:d(b,80),pmCR0:d(b,84),pmCR3:d(b,88),
    returnedCR0:d(b,92),savedCR0:d(b,96),savedCR3:d(b,100),returnedCR3:d(b,104),savedFlags:d(b,108),returnedFlags:d(b,112),
    savedGDT:Array.from(b.slice(116,122),c=>c.charCodeAt(0)),returnedGDT:Array.from(b.slice(122,128),c=>c.charCodeAt(0)),
    savedIDT:Array.from(b.slice(128,134),c=>c.charCodeAt(0)),returnedIDT:Array.from(b.slice(134,140),c=>c.charCodeAt(0)),
    savedMask:b.charCodeAt(140),returnedMask:b.charCodeAt(141),a20Owned:w(b,142),stage:d(b,144),checksum:d(b,148),sampleCount:d(b,152),freed:d(b,156),attempts:d(b,160),
    firstIRQ:frame(168),lastIRQ:frame(244),final:frame(320),samples:Array.from({length:16},(_,i)=>d(b,396+i*4)),unmapped:d(b,464),counter:d(b,468),budget:d(b,492),
    a20Before:w(b,500),a20After:w(b,502),publishedPtes:Array.from({length:13},(_,i)=>d(b,512+i*4)),
    pde0:tables?d(tables,0):null,pde2:tables?d(tables,8):null,userPtClear:tables?Array.from(tables.slice(8192)).every(c=>c.charCodeAt(0)===0):null,
    parserError:d(b,576),fileBytes:d(b,580),entry:d(b,584),segments:d(b,588),rwbase:d(b,592),rwbytes:d(b,596),fileOpen:d(b,604),syscalls:d(b,608),writes:d(b,612),yields:d(b,616),times:d(b,620),badPointers:d(b,624),exitCode:d(b,628),unknownCalls:d(b,632),dispatches:d(b,636),name:b.slice(704,768).split('\0')[0],
    abi:d(b,768),features:d(b,772),argc:d(b,776),heapBase:d(b,780),heapLimit:d(b,784),heapPages:d(b,788),heapPeak:d(b,792),allocations:d(b,796),frees:d(b,800),inputPolls:d(b,804),waits:d(b,808),waitPolls:d(b,812),openFiles:d(b,820),peakFiles:d(b,824),readBytes:d(b,828),opens:d(b,832),closes:d(b,836),fileErrors:d(b,840),heapErrors:d(b,844),mapChanges:d(b,848),lastKey:d(b,852),wakeFlags:d(b,856),waitElapsed:d(b,860),lastToken:d(b,864),queuedKeys:d(b,872),droppedKeys:d(b,876),
    ptes:signature==='K32RUN01'&&tables?Array.from({length:1024},(_,i)=>d(tables,8192+i*4)):null};
  }return null;
 },{previous:previousTag,signature});
}
