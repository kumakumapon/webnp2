// Guest-produced CPU/RAM snapshots: the core's legacy 2MiB main-RAM buffer
// contains font/graphics storage above 1MiB, not the separately allocated XMS.
export const inspectK386 = page => page.evaluate(() => {
  const n=window.np2debug.np2,scan=atob(n.readMemoryBase64(0x10000,0x90000).base64);
  const word=(s,o)=>s.charCodeAt(o)|s.charCodeAt(o+1)<<8;
  const dword=(s,o)=>(word(s,o)|word(s,o+2)<<16)>>>0;
  let at=-1,mailbox;
  while((at=scan.indexOf('K386ABI1',at+1))>=0){
    if(word(scan,at+8)===1&&word(scan,at+10)===4240&&word(scan,at+12)===1){mailbox=at;break;}
  }
  if(mailbox===undefined)return null;
  const views=[0,1].map(id=>{const v=mailbox+152+id*2044;return {
    state:word(scan,v),exit:word(scan,v+2),fault:word(scan,v+4),ticks:dword(scan,v+8),
    cr3:dword(scan,v+12),physical:dword(scan,v+16),eip:dword(scan,v+20),eflags:dword(scan,v+24),
    cr2:dword(scan,v+28),counter:dword(scan,v+32),psp:word(scan,v+42),screen:scan.slice(v+44,v+2044),
  };});
  at=-1;let diagnostics;
  while((at=scan.indexOf('K386DOS1',at+1))>=0){
    if(word(scan,at+8)!==2||word(scan,at+10)!==2348)continue;
    const fields=['edi','esi','ebp','ignored','ebx','edx','ecx','eax','vector','error','eip','cs','eflags','esp','ss','es','ds','fs','gs'];
    diagnostics=[0,1].map(id=>({
      count:dword(scan,at+12+id*4),
      frame:Object.fromEntries(fields.map((field,i)=>[field,dword(scan,at+1172+id*76+i*4)])),
      memory:Array.from(scan.slice(at+1324+id*512,at+1836+id*512),c=>c.charCodeAt(0)),
      calls:Array.from({length:16},(_,i)=>Array.from({length:9},(_,j)=>dword(scan,at+20+id*576+i*36+j*4))),
    }));break;
  }
  return {address:0x10000+mailbox,views,diagnostics};
});
