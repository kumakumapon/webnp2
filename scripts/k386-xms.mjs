// Read trusted allocation metadata only after the monitor publishes its mailbox.
import {inspectK386} from './k386-inspect.mjs';
export async function inspectXms(page){
 const cpu=await inspectK386(page);if(!cpu)return null;
 return page.evaluate(address=>{
  const n=window.np2debug.np2,w=(s,o)=>s.charCodeAt(o)|s.charCodeAt(o+1)<<8;
  const d=(s,o)=>(w(s,o)|w(s,o+2)<<16)>>>0;
  const mailbox=atob(n.readMemoryBase64(address,4240).base64);if(w(mailbox,22))return null;
  let at=window.k386XmsAddress;
  if(!at){const scan=atob(n.readMemoryBase64(0x10000,0x90000).base64);let found=-1;
   while((found=scan.indexOf('K386XMS1',found+1))>=0){if(w(scan,found+8)===256&&w(scan,found+10)===276&&d(scan,found+12)){at=found+0x10000;break;}}
   if(!at)return null;window.k386XmsAddress=at;
  }
  const b=atob(n.readMemoryBase64(at,276).base64);if(b.slice(0,8)!=='K386XMS1')return null;
  return {address:at,serial:d(b,12),pending:[w(b,16),w(b,18)],sessions:[0,1].map(id=>Array.from({length:8},(_,i)=>{
   const o=20+(id*8+i)*16;return {bytes:d(b,o),initialized:d(b,o+4),owner:w(b,o+8),handle:w(b,o+10),token:w(b,o+12)};
  }).filter(block=>block.handle))};
 },cpu.address);
}
