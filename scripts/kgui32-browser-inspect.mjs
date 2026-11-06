import {inspectClients} from './kgui32-client-inspect.mjs';
export async function inspectBrowser(page){
 const s=await inspectClients(page);if(!s)return null;
 const fields=['magic','version','frames','events','focus','selected','entries','matches','top','mode','bytes','hash','heartbeat','error','nameHash','metadataHash'];
 s.files=s.cpu.diagnostics.map(d=>d.pm32?.samples[0]===0x3246474b?Object.fromEntries(fields.map((f,i)=>[f,d.pm32.samples[i]])):null);
 // Read the real native retained frame, not an EXE or host UI model. Waiting
 // for the committed filter text prevents identical match counts from
 // acknowledging a previous filter while BIOS keys are still queued.
 s.canvases=s.bridge?.arena?await page.evaluate(arena=>{
  const n=window.np2debug.np2;
  return [0,1].map(id=>{
   const b=atob(n.readMemoryBase64(arena*16+id*4096,3144).base64),d=o=>(b.charCodeAt(o)|b.charCodeAt(o+1)<<8|b.charCodeAt(o+2)<<16|b.charCodeAt(o+3)<<24)>>>0;
   let filter=null;const controls=[];
   for(let i=0;i<Math.min(d(36),40);i++){const at=72+i*76;if(d(at)===3)controls.push(d(at+24));if(d(at)===2&&d(at+4)===68&&d(at+8)===28)filter=b.slice(at+28,at+76).split('\0')[0];}
   return {width:d(28),height:d(32),filter,controls};
  });
 },s.bridge.arena):[];
 return s;
}
