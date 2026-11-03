// Guest-produced CPU/RAM snapshots. Mixed manager pointers name the actual
// producer for each mode; PM32 user samples are captured by the CPU mapping.
const readSnapshot = page => page.evaluate(() => {
 const n=window.np2debug.np2,w=(s,o)=>s.charCodeAt(o)|s.charCodeAt(o+1)<<8;
 const d=(s,o)=>(w(s,o)|w(s,o+2)<<16)>>>0;
 const read=(at,len)=>atob(n.readMemoryBase64(at,len).base64);
 let a=window.k386InspectAddresses;
 if(!a){
  const scan=read(0x10000,0x90000);
  const find=(signature,version,size,live)=>{let at=-1;while((at=scan.indexOf(signature,at+1))>=0)if(w(scan,at+8)===version&&w(scan,at+10)===size&&live(at))return at+0x10000;};
  const mixed=find('K32MUX01',1,200,at=>w(scan,at+12)===1&&w(scan,at+196)>0x1000);
  if(mixed){const m=read(mixed,200);a={mixed,mailbox:d(m,188),diagnostics:d(m,192)};}
  else a={mailbox:find('K386ABI1',1,4240,at=>d(scan,at+168)||d(scan,at+2212)),diagnostics:find('K386DOS1',2,2348,at=>d(scan,at+12)||d(scan,at+16))};
  if(!a.mailbox||!a.diagnostics)return null;window.k386InspectAddresses=a;
 }
 const b=read(a.mailbox,4240),diag=read(a.diagnostics,2348),m=a.mixed?read(a.mixed,200):null;
 if(b.slice(0,8)!=='K386ABI1'||diag.slice(0,8)!=='K386DOS1'||w(b,12)!==1||w(b,22)||(m&&(m.slice(0,8)!=='K32MUX01'||w(m,22))))return null;
 const fields=['edi','esi','ebp','ignored','ebx','edx','ecx','eax','vector','error','eip','cs','eflags','esp','ss','es','ds','fs','gs'];
 const pmFields=['gs','fs','es','ds','edi','esi','ebp','ignored','ebx','edx','ecx','eax','vector','error','eip','cs','eflags','esp','ss'];
 const records=[0,1].map(id=>m&&w(m,152+id*2)===1?read(d(m,176+id*4),1024):null);
 const views=[0,1].map(id=>{
  const v=m?read(d(m,168+id*4),2044):b.slice(152+id*2044,152+(id+1)*2044);
  return {kind:m?w(m,152+id*2):0,abi:m?w(m,156+id*2):0,generation:m?d(m,160+id*4):null,
   state:w(v,0),exit:w(v,2),fault:w(v,4),ticks:d(v,8),cr3:d(v,12),physical:d(v,16),eip:d(v,20),eflags:d(v,24),
   cr2:d(v,28),counter:d(v,32),column:w(v,36),row:w(v,38),keys:w(v,40),psp:w(v,42),screen:v.slice(44,2044)};
 });
 const diagnostics=[0,1].map(id=>{
  const r=records[id];
  if(r){
   const tables=w(r,40)&&d(r,24)?read(d(r,24),12288):null;
   return {count:d(r,636),frame:Object.fromEntries(pmFields.map((f,i)=>[f,d(r,320+i*4)])),memory:[],calls:[],pm32:{
    freeBefore:w(r,48),freeAfter:w(r,50),largestBefore:w(r,52),largestAfter:w(r,54),tag:d(r,56),state:d(r,12),error:d(r,16),handle:w(r,40),locked:w(r,42),a20Owned:w(r,142),freed:d(r,156),
    irqs:d(r,60),resumes:d(r,64),reason:d(r,68),cr2:d(r,72),faultError:d(r,76),pmCR0:d(r,84),pmCR3:d(r,88),
    returnedCR0:d(r,92),savedCR0:d(r,96),savedCR3:d(r,100),returnedCR3:d(r,104),savedFlags:d(r,108),returnedFlags:d(r,112),savedMask:r.charCodeAt(140),returnedMask:r.charCodeAt(141),
    unmapped:d(r,464),budget:d(r,492),a20Before:w(r,500),a20After:w(r,502),
    syscalls:d(r,608),exitCode:d(r,628),dispatches:d(r,636),abi:d(r,768),features:d(r,772),argc:d(r,776),heapBase:d(r,780),heapLimit:d(r,784),heapPages:d(r,788),heapPeak:d(r,792),allocations:d(r,796),frees:d(r,800),waits:d(r,808),waitPolls:d(r,812),openFiles:d(r,820),peakFiles:d(r,824),readBytes:d(r,828),opens:d(r,832),closes:d(r,836),lastKey:d(r,852),wakeFlags:d(r,856),queuedKeys:d(r,872),droppedKeys:d(r,876),samples:Array.from({length:d(r,944)},(_,i)=>d(r,880+i*4)),tablesCleared:d(r,948),
    pde0:tables?d(tables,0):null,pde2:tables?d(tables,8):null,ptes:tables?Array.from({length:1024},(_,i)=>d(tables,8192+i*4)):null}};
  }
  return {count:d(diag,12+id*4),frame:Object.fromEntries(fields.map((f,i)=>[f,d(diag,1172+id*76+i*4)])),
   memory:Array.from(diag.slice(1324+id*512,1836+id*512),c=>c.charCodeAt(0)),
   calls:Array.from({length:16},(_,i)=>Array.from({length:9},(_,j)=>d(diag,20+id*576+i*36+j*4)))};
 });
 return {address:a.mailbox,mixedAddress:a.mixed??null,views,diagnostics};
});
export async function inspectK386(page){for(let i=0;i<100;i++){const s=await readSnapshot(page);if(s)return s;await page.waitForTimeout(15);}return null;}

// Historical backend records remain readable after a slot changes mode. These
// are published by the resident module, not reconstructed from executable bytes.
export async function inspectPM32Records(page){
 const cpu=await inspectK386(page);if(!cpu?.mixedAddress)return null;
 return page.evaluate(at=>{
  const n=window.np2debug.np2,read=(p,l)=>atob(n.readMemoryBase64(p,l).base64),w=(s,o)=>s.charCodeAt(o)|s.charCodeAt(o+1)<<8,d=(s,o)=>(w(s,o)|w(s,o+2)<<16)>>>0;
  const m=read(at,200);if(w(m,22))return null;
  return [0,1].map(i=>{const r=read(d(m,176+i*4),1024);return {state:d(r,12),error:d(r,16),handle:w(r,40),locked:w(r,42),freeBefore:w(r,48),freeAfter:w(r,50),largestBefore:w(r,52),largestAfter:w(r,54),tag:d(r,56),irqs:d(r,60),resumes:d(r,64),reason:d(r,68),a20Owned:w(r,142),freed:d(r,156),unmapped:d(r,464),syscalls:d(r,608),heapPages:d(r,788),openFiles:d(r,820),tablesCleared:d(r,948)};});
 },cpu.mixedAddress);
}
