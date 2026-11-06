import {afterEach,describe,expect,it,vi} from 'vitest';
import {readKdeskRenderSnapshot,sameKdeskRenderSnapshot} from '../scripts/kdesk-render-snapshot.mjs';

function guest(){
 const ram=Buffer.alloc(0xa4000),at=0x24000;
 ram.write('KDPERF01',at);ram.writeUInt16LE(1,at+8);ram.writeUInt16LE(64,at+10);
 ram.writeUInt16LE(1,at+14);ram.writeUInt32LE(0x2000,at+16);ram.writeUInt32LE(123,at+20);
 ram.writeUInt32LE(9,at+32);ram.writeUInt32LE(3,at+44);ram.writeUInt32LE(17,at+52);
 ram.writeUInt16LE(640,at+56);ram.writeUInt16LE(400,at+58);
 for(let i=0;i<4000;i++){ram[0xa0000+i]=i%251;ram[0xa2000+i]=255-i%251;}
 const reads:number[]=[];
 const state={kdeskPerformanceAddress:at,np2debug:{np2:{readMemoryBase64:vi.fn((p:number,size:number)=>{
  reads.push(p);return {base64:ram.subarray(p,p+size).toString('base64')};
 })}}};
 const pixels=Uint8ClampedArray.from([21,35,76,255,210,188,166,255]);
 const draw=vi.fn(),getImageData=vi.fn(()=>({data:pixels})),create=vi.fn(()=>({getContext:()=>({drawImage:draw,getImageData})}));
 vi.stubGlobal('window',state);vi.stubGlobal('document',{querySelector:()=>({width:640,height:400}),createElement:create});
 return {ram,at,state,reads,create,draw,getImageData,pixels};
}
const bounds={width:640,height:400,left:12,top:5,columns:48,rows:16};
afterEach(()=>vi.unstubAllGlobals());

describe('coherent native KDESK render snapshots',()=>{
 it('reads every character and attribute row and the protected pixels in one turn',()=>{
  const g=guest(),s=readKdeskRenderSnapshot(bounds);
  expect(s?.metrics).toEqual({owner:0x2000,cookie:123,fullScenes:9,clockPreserves:3,dosUpdates:17});
  expect(s?.pixels).toEqual(Array.from(g.pixels));expect(s?.text).toHaveLength(32);
  expect(g.getImageData).toHaveBeenCalledWith(364,96,100,120);
  for(let i=0;i<16;i++)for(let plane=0;plane<2;plane++){
   const p=0xa0000+plane*0x2000+(i+5)*160+24;
   expect(s?.text[i*2+plane]).toBe(g.ram.subarray(p,p+96).toString('base64'));
  }
 });
 it('never samples temporary DOS text or canvas pixels while a nested redraw is busy',()=>{
  const g=guest();g.ram.writeUInt16LE(2,g.at+12);
  expect(readKdeskRenderSnapshot(bounds)).toBeNull();expect(g.reads).toEqual([g.at]);expect(g.create).not.toHaveBeenCalled();
  g.ram.writeUInt16LE(0,g.at+12);expect(readKdeskRenderSnapshot(bounds)).not.toBeNull();
 });
 for(const change of ['signature','version','size','ready','cookie','owner','geometry'] as const){
  it(`rejects a stale or invalid ${change} before reading VRAM`,()=>{
   const g=guest();
   if(change==='signature')g.ram.write('OLDPROD1',g.at);
   else if(change==='version')g.ram.writeUInt16LE(2,g.at+8);
   else if(change==='size')g.ram.writeUInt16LE(32,g.at+10);
   else if(change==='ready')g.ram.writeUInt16LE(0,g.at+14);
   else if(change==='cookie')g.ram.writeUInt32LE(0,g.at+20);
   else if(change==='owner')g.ram.writeUInt32LE(0x5000,g.at+16);
   else g.ram.writeUInt16LE(800,g.at+56);
   expect(readKdeskRenderSnapshot(bounds)).toBeNull();expect(g.reads).toEqual([g.at]);
  });
 }
 it('rejects publication changes during a read',()=>{
  const g=guest();g.state.np2debug.np2.readMemoryBase64.mockImplementation((p,size)=>{
   if(p===0xa0000+5*160+24)g.ram.writeUInt32LE(18,g.at+52);
   return {base64:g.ram.subarray(p,p+size).toString('base64')};
  });
  expect(readKdeskRenderSnapshot(bounds)).toBeNull();
 });
 it('rejects invalid rectangles without touching guest memory',()=>{
  const g=guest();for(const r of [{left:-1},{top:25},{columns:81},{rows:21},{columns:0},{width:1},{top:0.5}])expect(()=>readKdeskRenderSnapshot({...bounds,...r})).toThrow('bounds');
  expect(g.reads).toEqual([]);
 });
 it('does not turn transport errors into an idle snapshot',()=>{
  const g=guest();g.state.np2debug.np2.readMemoryBase64.mockImplementation(()=>{throw Error('transport');});
  expect(()=>readKdeskRenderSnapshot(bounds)).toThrow('transport');
 });
});


describe('frontend publication fence',()=>{
 it('accepts stable native text and canvas pixels but rejects stale uploads or changed producers',()=>{
  guest();const a=readKdeskRenderSnapshot(bounds);expect(sameKdeskRenderSnapshot(a,structuredClone(a))).toBe(true);
  expect(sameKdeskRenderSnapshot(null,a)).toBe(false);
  const progress=structuredClone(a)!;progress.metrics.clockPreserves++;progress.metrics.dosUpdates++;
  expect(sameKdeskRenderSnapshot(a,progress)).toBe(true);
  for(const part of ['pixels','text','metrics']){
   const b=structuredClone(a)!;
   if(part==='pixels')b.pixels[0]^=1;
   else if(part==='text')b.text[0]='stale';
   else b.metrics.owner++;
   expect(sameKdeskRenderSnapshot(a,b)).toBe(false);
  }
 });
});
