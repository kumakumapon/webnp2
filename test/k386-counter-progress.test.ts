import {describe,it,expect} from 'vitest';
import {counterPairReady,counterPairAdvanced} from '../scripts/k386-counter-progress.mjs';
const title='V86 COUNTER: independent background CPU loop';
const sample=()=>({
 cpu:{views:[0,1].map(i=>({state:1,psp:0x1005,physical:0x200000+i*0x100000,cr3:0x30000+i*0x3000,counter:100,screen:title}))},
 resources:{usage:[0,1].map(i=>({psp:0x1005,program:'COUNTER.EXE',generation:i+1,runs:10,cpuTicks:1000}))},
});
const advance=(before:ReturnType<typeof sample>)=>{
 const after=structuredClone(before);
 for(let i=0;i<2;i++){after.cpu.views[i].counter+=20;after.resources.usage[i].runs++;after.resources.usage[i].cpuTicks+=50;}
 return after;
};
describe('real K386 counter progress samples',()=>{
 it('rejects old shell CPU state paired with newly loaded COUNTER metadata',()=>{
  const mixed=sample();mixed.cpu.views[1]={...mixed.cpu.views[1],psp:0x8000,counter:0xef90660f,screen:'K386 DOS shell (read-only)'};
  // The previous E2E predicate accepts this impossible single-context baseline.
  expect(mixed.resources.usage.every(u=>u.program==='COUNTER.EXE')&&mixed.cpu.views.every(v=>v.counter>0)).toBe(true);
  expect(counterPairReady(mixed)).toBe(false);
 });
 it('waits for both children to finish startup and produce their own counter output',()=>{
  for(const field of ['counter','screen','state'] as const){
   const transient=sample();
   if(field==='counter')transient.cpu.views[1].counter=0;
   if(field==='screen')transient.cpu.views[1].screen='K386 DOS shell (read-only)';
   if(field==='state')transient.cpu.views[1].state=2;
   expect(counterPairReady(transient)).toBe(false);
  }
  expect(counterPairReady(sample())).toBe(true);expect(counterPairReady({cpu:null,resources:null})).toBe(false);
 });
 it('requires actual execution of both retained CPU contexts',()=>{
  const before=sample();expect(counterPairAdvanced(before,advance(before))).toBe(true);
  for(const field of ['counter','runs','cpuTicks'] as const){
   const stopped=advance(before);
   if(field==='counter')stopped.cpu.views[1].counter=before.cpu.views[1].counter;
   else stopped.resources.usage[1][field]=before.resources.usage[1][field];
   expect(counterPairAdvanced(before,stopped)).toBe(false);
  }
  const paused=advance(before);paused.cpu.views[1].state=3;expect(counterPairAdvanced(before,paused)).toBe(false);
 });
 it('rejects a restarted or replaced process even when its counter is larger',()=>{
  const before=sample();
  for(const field of ['psp','physical','cr3'] as const){const replaced=advance(before);replaced.cpu.views[1][field]++;expect(counterPairAdvanced(before,replaced)).toBe(false);}
  const restarted=advance(before);restarted.resources.usage[1].generation++;expect(counterPairAdvanced(before,restarted)).toBe(false);
 });
 it('accepts unsigned counter wrap while rejecting backwards samples',()=>{
  const before=sample();before.cpu.views[1].counter=0xfffffff0;
  const after=advance(before);after.cpu.views[1].counter=4;expect(counterPairAdvanced(before,after)).toBe(true);
  const stale=advance(before);stale.cpu.views[0].counter=90;expect(counterPairAdvanced(before,stale)).toBe(false);
 });
});
