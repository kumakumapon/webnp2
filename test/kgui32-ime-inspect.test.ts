import {afterEach,describe,expect,it,vi} from 'vitest';
import {inspectWorkspace} from '../scripts/kgui32-workspace-inspect.mjs';
import {inspectClients} from '../scripts/kgui32-client-inspect.mjs';
vi.mock('../scripts/kgui32-client-inspect.mjs',()=>({inspectClients:vi.fn()}));

// Execute the actual observer callback with separate conventional RAM/XMS
// backing. A physical XMS address is deliberately outside the public RAM API.
function guest(){
 const ram=Buffer.alloc(0xa0000),heap=Buffer.alloc(12*1024*1024),mixed=0x20000,record=0x21000,table=0x23000,physical=0x420000,backing=0x18000;
 ram.writeUInt32LE(record,mixed+176);ram.writeUInt32LE(record+1024,mixed+180);
 ram.writeUInt32LE(table,record+24);ram.writeUInt16LE(1,record+40);
 ram.writeUInt32LE(physical|7,table+8192+8*4);
 const sample=Buffer.alloc(112);sample.writeUInt32LE(0x3345474b);sample.writeUInt32LE(4,4);sample.writeUInt32LE(2,8);sample.writeUInt32LE(2166136261,20);
 sample.writeUInt32LE(0x31454d49,64);sample.writeUInt32LE(1,68);sample.writeUInt32LE(8,76);sample.writeUInt32LE(3,88);
 sample.copy(ram,record+880,0,64);sample.copy(heap,backing+physical);
 const reads:number[]=[];
 vi.stubGlobal('window',{Module:{HEAPU8:heap},np2debug:{np2:{readMemoryBase64:(at:number,n:number)=>{reads.push(at);if(at<0||at+n>ram.length)throw Error('outside conventional RAM');return {base64:ram.subarray(at,at+n).toString('base64')};}}}});
 vi.mocked(inspectClients).mockImplementation(async()=>({cpu:{mixedAddress:mixed,diagnostics:[{pm32:{samples:Array.from({length:16},(_,i)=>ram.readUInt32LE(record+880+i*4))}},{}]},bridge:null}));
 const page={evaluate:async(fn:(arg:unknown)=>unknown,arg:unknown)=>fn(arg)};
 return {ram,heap,mixed,record,table,physical,backing,sample,reads,page};
}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
describe('native IME XMS observation',()=>{
 it('reads real extended-memory state while every public RAM read stays conventional',async()=>{
  const g=guest(),s=await inspectWorkspace(g.page);
  expect(s.imes[0]).toMatchObject({magic:0x31454d49,scheme:1,bytes:8,candidates:3});expect(s.imes[1]).toBeNull();
  expect(g.reads.every(at=>at<0xa0000)).toBe(true);
 });
 it('uses the actual remapped PTE after a new application allocation',async()=>{
  const g=guest();await inspectWorkspace(g.page);const next=g.physical+0x10000;
  g.ram.writeUInt32LE(next|7,g.table+8192+8*4);g.sample.writeUInt32LE(2,68);g.sample.writeUInt32LE(3,8);g.sample.copy(g.ram,g.record+880,0,64);g.sample.copy(g.heap,g.backing+next);
  expect((await inspectWorkspace(g.page)).imes[0]).toMatchObject({scheme:2,bytes:8});
 });
 it('rejects ambiguous copies and samples that do not match the running guest',async()=>{
  const g=guest();g.sample.copy(g.heap,0x9000);expect((await inspectWorkspace(g.page)).imes[0]).toBeNull();
  g.heap.fill(0,0x9000,0x9000+112);g.heap[g.backing+g.physical+8]++;expect((await inspectWorkspace(g.page)).imes[0]).toBeNull();
 });
 it('does not adopt unpublished state during a resident dispatch',async()=>{
  const g=guest();g.ram.writeUInt16LE(1,g.mixed+22);expect((await inspectWorkspace(g.page)).imes).toEqual([null,null]);expect(g.reads).toEqual([g.mixed]);
 });
});
