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

// A terminated PM32 slot deliberately retains its last counter and CPU samples
// for diagnostics. A replacement is ready only after its own live generation,
// resource owner and protected CPU frame agree and it has executed COUNT32.
export function pm32CounterReady(snapshot,id,previousGeneration){
 const v=snapshot?.cpu?.views?.[id],u=snapshot?.resources?.usage?.[id],d=snapshot?.cpu?.diagnostics?.[id],p=d?.pm32;
 return !!v&&!!u&&!!p&&v.kind===1&&v.abi===257&&v.state===1&&v.generation>0&&v.generation!==previousGeneration&&
  u.generation===v.generation&&u.program==='COUNT32.EXE'&&u.psp===v.psp&&v.cr3>0&&v.physical>0&&
  v.counter>0&&v.screen.includes('COUNT32 1')&&p.error===0&&p.handle>0&&p.locked===1&&
  p.samples?.[1]===49&&p.samples?.[2]===0x50333221&&d.frame?.cs===59&&!(d.frame.eflags&0x20000);
}
