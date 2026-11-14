import {inspectGUI} from './kgui32-inspect.mjs';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
export async function inspectClients(page){
 const gui=await inspectGUI(page),cpu=await inspectK386(page),resources=await inspectResources(page);
 if(!gui||!cpu||!resources)return null;
 const bridge=await page.evaluate(owner=>{
  const n=window.np2debug.np2,read=(p,l)=>atob(n.readMemoryBase64(p,l).base64),w=(s,o)=>s.charCodeAt(o)|s.charCodeAt(o+1)<<8,d=(s,o)=>(w(s,o)|w(s,o+2)<<16)>>>0;
  const snapshot=(b,address)=>{const v=read(0x2f*4,4);return {address,owner:d(b,16),arena:d(b,20),oldVector:d(b,24),vector:d(b,28),ready:d(b,32),requests:d(b,36),rejected:d(b,40),generation:[d(b,44),d(b,48)],tokens:[d(b,52),d(b,56)],revision:[d(b,60),d(b,64)],events:[d(b,68),d(b,72)],dropped:[d(b,76),d(b,80)],currentVector:d(v,0)};};
  const cached=window.kguiClientBridgeAddress;
  if(cached){const b=read(cached,84);if(b.slice(0,8)==='KGCLNT01'&&d(b,8)===1&&d(b,12)===84&&d(b,16)===owner)return snapshot(b,cached);}
  const s=read(0x10000,0x90000);let at=-1;
  while((at=s.indexOf('KGCLNT01',at+1))>=0)if(d(s,at+8)===1&&d(s,at+12)===84&&d(s,at+16)===owner){window.kguiClientBridgeAddress=at+0x10000;return snapshot(s.slice(at,at+84),at+0x10000);}return null;
 },gui.owner);
 const fields=['magic','version','frames','events','keys','clicks','value','seconds','width','height','token','heartbeat','error','mode','reserved0','reserved1'];
 const apps=cpu.diagnostics.map(d=>d.pm32?Object.fromEntries(fields.map((f,i)=>[f,d.pm32.samples[i]])):null);
 return {gui,cpu,resources,bridge,apps};
}
