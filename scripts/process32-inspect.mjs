// Read-only resident producer observation. Addresses come from validated live
// records, not an executable fixture or injected emulator memory.
export async function inspectProcess(page){return page.evaluate(()=>{
 const read=(p,n)=>atob(window.np2debug.np2.readMemoryBase64(p,n).base64),w=(b,o)=>b.charCodeAt(o)|b.charCodeAt(o+1)<<8,d=(b,o)=>(w(b,o)|w(b,o+2)<<16)>>>0;
 let at=window.process32Record;
 if(!at){const b=read(0x10000,0x90000);for(let i=b.indexOf('K32PROC1');i>=0;i=b.indexOf('K32PROC1',i+1))if(w(b,i+8)===1&&w(b,i+10)===48&&w(b,i+12)===1){at=i+0x10000;break;}if(!at)return null;window.process32Record=at;}
 const r=read(at,48);if(w(r,14))return null;const ptr=d(r,36);if(ptr<0x10000||ptr+6644>0xa0000)return null;const b=read(ptr,6644);
 return {address:at,owner:d(r,16),manager:d(r,20),calls:d(r,24),rejected:d(r,28),stackOk:d(r,32),launches:d(r,44),serial:d(b,0),tasks:Array.from({length:8},(_,i)=>{const p=4+i*568;return {index:i,...Object.fromEntries(['token','parent','slot','generation','physical','epoch','state','cancel','code','reason','input','output'].map((k,j)=>[k,d(b,p+j*4)])),fds:Array.from({length:8},(_,j)=>({token:d(b,p+176+j*12),pipe:d(b,p+180+j*12),write:d(b,p+184+j*12)})),messages:d(b,p+564)};}),pipes:Array.from({length:4},(_,i)=>({used:d(b,4548+i*524),head:d(b,4552+i*524),count:d(b,4556+i*524)}))};
 });}
export async function inspectTransfer(page,owner){return page.evaluate(owner=>{
 const read=(p,n)=>atob(window.np2debug.np2.readMemoryBase64(p,n).base64),d=(b,o)=>(b.charCodeAt(o)|b.charCodeAt(o+1)<<8|b.charCodeAt(o+2)<<16|b.charCodeAt(o+3)<<24)>>>0;
 const b=read(0x10000,0x90000);for(let i=b.indexOf('KGXFER01');i>=0;i=b.indexOf('KGXFER01',i+1))if(d(b,i+8)===1&&d(b,i+12)===44&&d(b,i+16)===owner)return Object.fromEntries(['requestBytes','replyBytes','statusRequests','statusBytes','uploads','uploadBytes'].map((k,j)=>[k,d(b,i+20+j*4)]));return null;
 },owner);}
export async function inspectHeadless(page){return page.evaluate(()=>{
 const b=atob(window.np2debug.np2.readMemoryBase64(0x10000,0x90000).base64),d=o=>(b.charCodeAt(o)|b.charCodeAt(o+1)<<8|b.charCodeAt(o+2)<<16|b.charCodeAt(o+3)<<24)>>>0;
 for(let i=b.indexOf('KPRUN001');i>=0;i=b.indexOf('KPRUN001',i+1))if(d(i+8)===1&&d(i+12)===44)return Object.fromEntries(['version','size','phase','error','capacity','steps','exitCode','largestBefore','largestAfter'].map((k,j)=>[k,d(i+8+j*4)]));return null;
 });}
