import {inspectClients} from './kgui32-client-inspect.mjs';
export async function inspectBrowser(page){
 const s=await inspectClients(page);if(!s)return null;
 const fields=['magic','version','frames','events','focus','selected','entries','matches','top','mode','bytes','hash','heartbeat','error','nameHash','metadataHash'];
 s.files=s.cpu.diagnostics.map(d=>d.pm32?.samples[0]===0x3246474b?Object.fromEntries(fields.map((f,i)=>[f,d.pm32.samples[i]])):null);
 s.canvases=s.bridge?.arena?await page.evaluate(arena=>{const n=window.np2debug.np2;return [0,1].map(id=>{const b=atob(n.readMemoryBase64(arena*16+id*4096+28,8).base64),d=o=>(b.charCodeAt(o)|b.charCodeAt(o+1)<<8|b.charCodeAt(o+2)<<16|b.charCodeAt(o+3)<<24)>>>0;return {width:d(0),height:d(4)};});},s.bridge.arena):[];
 return s;
}
