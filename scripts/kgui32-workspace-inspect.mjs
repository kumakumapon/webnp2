import {inspectClients} from './kgui32-client-inspect.mjs';
export async function inspectWorkspace(page){
 const s=await inspectClients(page);if(!s)return null;
 s.editors=s.cpu.diagnostics.map(d=>{
  const v=d.pm32?.samples;if(v?.[0]!==0x3345474b)return null;
  return Object.fromEntries(['magic','version','frames','events','bytes','hash','cursor','anchor','dirty','mode','top','heartbeat','error','history','redo','workspace'].map((k,i)=>[k,v[i]]));
 });
 // App-private IME diagnostics live immediately after the unchanged v4 sample.
 // Translate the first writable user page through the guest's actual PTEs;
 // never infer live addresses from an EXE or change guest memory.
 s.imes=await page.evaluate(records=>records.map(({editor,ptes})=>{
  if(!editor||!ptes)return null;
  const pte=ptes.find(p=>(p&7)===7);if(!pte)return null;
  const b=atob(window.np2debug.np2.readMemoryBase64((pte&0xfffff000)>>>0,112).base64);
  const d=o=>(b.charCodeAt(o)|b.charCodeAt(o+1)<<8|b.charCodeAt(o+2)<<16|b.charCodeAt(o+3)<<24)>>>0;
  if(d(0)!==0x3345474b||d(64)!==0x31454d49)return null;
  return Object.fromEntries(['magic','scheme','script','bytes','pending','cursor','candidates','selected','selecting','target','dictionary','hash'].map((k,i)=>[k,d(64+i*4)]));
 }),s.cpu.diagnostics.map((d,id)=>({editor:!!s.editors[id],ptes:d.pm32?.ptes})));
 s.canvases=s.bridge?.arena?await page.evaluate(arena=>[0,1].map(id=>{
  const b=atob(window.np2debug.np2.readMemoryBase64(arena*16+id*4096,3144).base64);
  const d=o=>(b.charCodeAt(o)|b.charCodeAt(o+1)<<8|b.charCodeAt(o+2)<<16|b.charCodeAt(o+3)<<24)>>>0;
  const commands=Array.from({length:Math.min(d(36),40)},(_,i)=>72+i*76);
  return {width:d(28),height:d(32),count:d(36),buttons:commands.filter(at=>d(at)===3).map(at=>({id:d(at+24),x:d(at+4),y:d(at+8),w:d(at+12),h:d(at+16),text:b.slice(at+28,at+76).split('\0')[0]})),draws:commands.filter(at=>d(at)===2).map(at=>({x:d(at+4),y:d(at+8),text:b.slice(at+28,at+76).split('\0')[0]})),controls:commands.filter(at=>d(at)===3).map(at=>d(at+24)),
   texts:commands.filter(at=>d(at)===2).map(at=>b.slice(at+28,at+76).split('\0')[0])};
 }),s.bridge.arena):[];
 return s;
}
