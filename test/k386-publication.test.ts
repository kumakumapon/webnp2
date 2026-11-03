import {afterEach,describe,expect,it,vi} from 'vitest';
import {inspectResources} from '../scripts/k386-resources.mjs';
import {inspectXms} from '../scripts/k386-xms.mjs';

// Execute the real browser callbacks against guest RAM. The emulator can start
// an API dispatch between the CPU evaluate and the following record evaluate.
function guest({busyForever=false,invalidMailbox=false}={}) {
 const ram=Buffer.alloc(0xa0000),mailbox=0x20000,diagnostics=0x22000;
 const resources=0x24000,xms=0x25000,reads:number[]=[];
 const header=(at:number,signature:string,version:number,size:number)=>{
  ram.write(signature,at);ram.writeUInt16LE(version,at+8);ram.writeUInt16LE(size,at+10);
 };
 header(mailbox,'K386ABI1',1,4240);ram.writeUInt16LE(1,mailbox+12);
 header(diagnostics,'K386DOS1',2,2348);
 header(resources,'K386SYS1',1,1084);
 ram.writeUInt32LE(7,resources+20);ram.writeUInt16LE(664,resources+40);
 ram.write('ECHO.EXE',resources+64);
 header(xms,'K386XMS1',256,276);ram.writeUInt32LE(5,xms+12);
 ram.writeUInt32LE(1048576,xms+20);ram.writeUInt32LE(1048576,xms+24);
 ram.writeUInt16LE(0x8000,xms+28);ram.writeUInt16LE(17,xms+30);ram.writeUInt16LE(9,xms+32);
 const state={k386InspectAddresses:{mailbox,diagnostics},k386ResourceAddress:resources,k386XmsAddress:xms,
  np2debug:{np2:{readMemoryBase64:(at:number,size:number)=>{
   reads.push(at);return {base64:ram.subarray(at,at+size).toString('base64')};
  }}}};
 vi.stubGlobal('window',state);
 let evaluations=0,waits=0;
 const page={evaluate:async(fn:(arg:unknown)=>unknown,arg:unknown)=>{
  evaluations++;
  if(evaluations===2){
   ram.writeUInt16LE(1,mailbox+22);
   if(invalidMailbox)ram.write('OLDOWNER',mailbox);
  }
  return fn(arg);
 },waitForTimeout:async()=>{
  waits++;
  if(!busyForever)ram.writeUInt16LE(0,mailbox+22);
 }};
 return {page,reads,resources,xms,waits:()=>waits};
}
afterEach(()=>vi.unstubAllGlobals());

describe('published K386 telemetry across browser turns',()=>{
 it('retries resources after a new dispatch starts following the CPU snapshot',async()=>{
  const g=guest(),r=await inspectResources(g.page);
  expect(r?.usage[0]).toMatchObject({generation:7,program:'ECHO.EXE',memoryKiB:664});
  expect(g.waits()).toBeGreaterThan(0);
 });
 it('retries XMS metadata through the same publication race',async()=>{
  const g=guest(),r=await inspectXms(g.page);
  expect(r?.sessions[0]).toEqual([{bytes:1048576,initialized:1048576,owner:0x8000,handle:17,token:9}]);
  expect(g.waits()).toBeGreaterThan(0);
 });
 for(const [name,inspect] of [['resources',inspectResources],['XMS',inspectXms]] as const){
  it(`bounds retries and never reads ${name} while the mailbox is busy`,async()=>{
   const g=guest({busyForever:true});
   expect(await inspect(g.page)).toBeNull();
   expect(g.waits()).toBeGreaterThan(0);expect(g.waits()).toBeLessThanOrEqual(100);
   expect(g.reads).not.toContain(name==='resources'?g.resources:g.xms);
  });
  it(`rejects ${name} when the discovered monitor mailbox has disappeared`,async()=>{
   const g=guest({invalidMailbox:true});
   expect(await inspect(g.page)).toBeNull();
   expect(g.reads).not.toContain(name==='resources'?g.resources:g.xms);
  });
 }
});
