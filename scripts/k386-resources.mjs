// Read only monitor-owned records, with the same busy guard as CPU snapshots.
import {inspectK386} from './k386-inspect.mjs';
export async function inspectResources(page){
  const cpu=await inspectK386(page);if(!cpu)return null;
  return page.evaluate(address=>{
    const n=window.np2debug.np2,w=(s,o)=>s.charCodeAt(o)|s.charCodeAt(o+1)<<8;
    const d=(s,o)=>(w(s,o)|w(s,o+2)<<16)>>>0;
    const mailbox=atob(n.readMemoryBase64(address,4240).base64);
    if(w(mailbox,22))return null;
    let at=window.k386ResourceAddress;
    if(!at){
      const scan=atob(n.readMemoryBase64(0x10000,0x90000).base64);let found=-1;
      while((found=scan.indexOf('K386SYS1',found+1))>=0){
        if(w(scan,found+8)===1&&w(scan,found+10)===1084&&(d(scan,found+20)||d(scan,found+80))){at=found+0x10000;break;}
      }
      if(!at)return null;window.k386ResourceAddress=at;
    }
    const b=atob(n.readMemoryBase64(at,1084).base64);
    if(b.slice(0,8)!=='K386SYS1')return null;
    const usage=[0,1].map(id=>{const o=20+id*60;return {
      generation:d(b,o),cpuTicks:d(b,o+4),runs:d(b,o+8),limitTicks:d(b,o+12),
      priority:w(b,o+16),reason:w(b,o+18),memoryKiB:w(b,o+20),heapKiB:w(b,o+22),
      handles:w(b,o+24),depth:w(b,o+26),psp:w(b,o+28),
      lastIP:d(b,o+32),lastCR2:d(b,o+36),lastFault:w(b,o+40),lastCS:w(b,o+42),
      program:b.slice(o+44,o+60).split('\0')[0],
    };});
    const next=w(b,16),count=w(b,18);
    const events=Array.from({length:count},(_,i)=>{
      const o=140+((next+16-count+i)%16)*32;return {
        sequence:d(b,o),generation:d(b,o+4),cpuTicks:d(b,o+8),ip:d(b,o+12),cr2:d(b,o+16),
        session:w(b,o+20),type:w(b,o+22),reason:w(b,o+24),fault:w(b,o+26),psp:w(b,o+28),cs:w(b,o+30),
      };
    });
    return {address:at,usage,sequence:d(b,12),events};
  },cpu.address);
}
