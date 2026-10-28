// CPU and resource records are sampled across separate emulator turns. Match
// the actual child PSP and startup output before treating scratch RAM as a counter.
export function counterPairReady({cpu,resources}={}) {
 return !!cpu&&!!resources&&cpu.views.length===2&&resources.usage.length===2&&cpu.views.every((v,i)=>
  v.state===1&&v.psp===resources.usage[i].psp&&resources.usage[i].program==='COUNTER.EXE'&&
  v.screen.includes('V86 COUNTER: independent background CPU loop')&&v.counter>0);
}
export function counterPairAdvanced(before,after) {
 return counterPairReady(before)&&counterPairReady(after)&&after.cpu.views.every((v,i)=>{
  const old=before.cpu.views[i],u=after.resources.usage[i],previous=before.resources.usage[i];
  const delta=(v.counter-old.counter)>>>0;
  return v.psp===old.psp&&v.physical===old.physical&&v.cr3===old.cr3&&u.generation===previous.generation&&
   u.runs>previous.runs&&u.cpuTicks>previous.cpuTicks&&delta>0&&delta<0x80000000;
 });
}
