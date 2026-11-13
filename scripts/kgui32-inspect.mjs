// Read the native producer and samples of the real CPL3 application's memory
// captured by the CPU while paging/A20 are active. Never use container bytes.
export async function inspectGUI(page){
 return page.evaluate(()=>{
  const n=window.np2debug?.np2;if(!n)return null;
  const read=(p,l)=>atob(n.readMemoryBase64(p,l).base64),w=(s,o)=>s.charCodeAt(o)|s.charCodeAt(o+1)<<8,d=(s,o)=>(w(s,o)|w(s,o+2)<<16)>>>0;
  let at=window.kgui32Address;
  if(!at){const scan=read(0x10000,0x90000);let p=-1;while((p=scan.indexOf('KG32DRV1',p+1))>=0)if(w(scan,p+8)===1&&w(scan,p+10)===256&&d(scan,p+16)&&d(scan,p+20)&&d(scan,p+20)!==window.kgui32ExcludedCookie){at=p+0x10000;break;}if(!at)return null;window.kgui32Address=at;}
  const b=read(at,256);if(b.slice(0,8)!=='KG32DRV1'||d(b,20)===window.kgui32ExcludedCookie){delete window.kgui32Address;return null;}
  const r=read(d(b,64),1024),tables=w(r,40)&&d(r,24)?read(d(r,24),12288):null;
  const fields=['gs','fs','es','ds','edi','esi','ebp','ignored','ebx','edx','ecx','eax','vector','error','eip','cs','eflags','esp','ss'];
  let app=null;
  if(d(r,944)===16&&d(r,880)===0x3147554b)app=Object.fromEntries(['magic','version','frames','events','mx','my','x0','y0','x1','y1','active','drag','presents','lastKey','heartbeat','error'].map((k,i)=>[k,d(r,880+i*4)]));
  return {address:at,busy:w(b,12),ready:w(b,14),owner:d(b,16),cookie:d(b,20),state:d(b,24),error:d(b,28),width:d(b,32),height:d(b,36),bpp:d(b,40),presents:d(b,44),events:d(b,48),rejected:d(b,52),unknown:d(b,56),graphics:d(b,60),runtime:d(b,64),appmask:d(b,68),quanta:d(b,72),rect:[76,80,84,88].map(o=>d(b,o)),lost:d(b,92),owned:d(b,96),generations:[d(b,100),d(b,104)],counters:[d(b,108),d(b,112)],states:[d(b,116),d(b,120)],dosBefore:d(b,124),dosAfter:d(b,128),scratch:d(b,132),tables:d(b,136),lastKey:d(b,144),completed:d(b,148),stackGuard:d(b,152),app,
   cpu:{state:d(r,12),error:d(r,16),pd:d(r,24),physical:d(r,28),handle:w(r,40),locked:w(r,42),freeBefore:w(r,48),freeAfter:w(r,50),largestBefore:w(r,52),largestAfter:w(r,54),irqs:d(r,60),resumes:d(r,64),reason:d(r,68),cr2:d(r,72),faultError:d(r,76),pmCR0:d(r,84),pmCR3:d(r,88),returnedCR0:d(r,92),savedCR0:d(r,96),savedCR3:d(r,100),returnedCR3:d(r,104),savedFlags:d(r,108),returnedFlags:d(r,112),savedMask:r.charCodeAt(140),returnedMask:r.charCodeAt(141),a20Owned:w(r,142),freed:d(r,156),unmapped:d(r,464),a20Before:w(r,500),a20After:w(r,502),exitCode:d(r,628),features:d(r,772),heapPages:d(r,788),allocations:d(r,796),frees:d(r,800),openFiles:d(r,820),opens:d(r,832),closes:d(r,836),tablesCleared:d(r,948),frame:Object.fromEntries(fields.map((f,i)=>[f,d(r,320+i*4)])),pde0:tables?d(tables,0):null,ptes:tables?Array.from({length:1024},(_,i)=>d(tables,8192+i*4)):null}};
 });
}
