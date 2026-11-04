// Optional native GUI measurements. Cache absence for released baseline images.
export async function inspectKdeskPerformance(page){
 return page.evaluate(()=>{
  const n=window.np2debug.np2,w=(s,o)=>s.charCodeAt(o)|s.charCodeAt(o+1)<<8;
  const d=(s,o)=>(w(s,o)|w(s,o+2)<<16)>>>0,read=(p,l)=>atob(n.readMemoryBase64(p,l).base64);
  let at=window.kdeskPerformanceAddress;
  if(at===undefined){
   at=0;const ram=read(0x10000,0x90000);let p=-1;
   while((p=ram.indexOf('KDPERF01',p+1))>=0){const physical=p+0x10000,owner=d(ram,p+16)*16;
    if(w(ram,p+8)===1&&w(ram,p+10)===64&&w(ram,p+14)===1&&d(ram,p+20)&&physical>=owner&&physical+64<=owner+65536){at=physical;break;}
   }window.kdeskPerformanceAddress=at;
  }
  if(!at)return null;const s=read(at,64);
  if(s.slice(0,8)!=='KDPERF01'||w(s,12)||w(s,14)!==1)return null;
  return {address:at,owner:d(s,16),cookie:d(s,20),scheduleCalls:d(s,24),scheduleGapMax:d(s,28),fullScenes:d(s,32),fullSceneTicks:d(s,36),clockUpdates:d(s,40),clockPreserves:d(s,44),fullSceneMax:d(s,48),width:w(s,56),height:w(s,58)};
 });
}
