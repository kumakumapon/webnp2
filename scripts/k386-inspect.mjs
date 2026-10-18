// Guest-produced CPU/RAM snapshots: the core's legacy 2MiB main-RAM buffer
// contains font/graphics storage above 1MiB, not the separately allocated XMS.
const readSnapshot = page => page.evaluate(() => {
  const n=window.np2debug.np2,word=(s,o)=>s.charCodeAt(o)|s.charCodeAt(o+1)<<8;
  const dword=(s,o)=>(word(s,o)|word(s,o+2)<<16)>>>0;
  let addresses=window.k386InspectAddresses;
  if(!addresses){
    const scan=atob(n.readMemoryBase64(0x10000,0x90000).base64);
    const find=(signature,version,size)=>{let at=-1;while((at=scan.indexOf(signature,at+1))>=0){
      if(word(scan,at+8)===version&&word(scan,at+10)===size)return at+0x10000;
    }};
    addresses={mailbox:find('K386ABI1',1,4240),diagnostics:find('K386DOS1',2,2348)};
    if(!addresses.mailbox||!addresses.diagnostics)return null;
    window.k386InspectAddresses=addresses;
  }
  const b=atob(n.readMemoryBase64(addresses.mailbox,4240).base64);
  const d=atob(n.readMemoryBase64(addresses.diagnostics,2348).base64);
  if(b.slice(0,8)!=='K386ABI1'||d.slice(0,8)!=='K386DOS1'||word(b,12)!==1||word(b,22)!==0)return null;
  const views=[0,1].map(id=>{const v=152+id*2044;return {
    state:word(b,v),exit:word(b,v+2),fault:word(b,v+4),ticks:dword(b,v+8),
    cr3:dword(b,v+12),physical:dword(b,v+16),eip:dword(b,v+20),eflags:dword(b,v+24),
    cr2:dword(b,v+28),counter:dword(b,v+32),column:word(b,v+36),row:word(b,v+38),keys:word(b,v+40),psp:word(b,v+42),screen:b.slice(v+44,v+2044),
  };});
  const fields=['edi','esi','ebp','ignored','ebx','edx','ecx','eax','vector','error','eip','cs','eflags','esp','ss','es','ds','fs','gs'];
  const diagnostics=[0,1].map(id=>({
    count:dword(d,12+id*4),
    frame:Object.fromEntries(fields.map((field,i)=>[field,dword(d,1172+id*76+i*4)])),
    memory:Array.from(d.slice(1324+id*512,1836+id*512),c=>c.charCodeAt(0)),
    calls:Array.from({length:16},(_,i)=>Array.from({length:9},(_,j)=>dword(d,20+id*576+i*36+j*4))),
  }));
  return {address:addresses.mailbox,views,diagnostics};
});

export async function inspectK386(page) {
  for(let i=0;i<100;i++){const snapshot=await readSnapshot(page);if(snapshot)return snapshot;await page.waitForTimeout(15);}
  return null;
}
