import {describe,it,expect} from 'vitest';
import {arrayExpected,arrayRecord,legacyArrayResult,patternWord} from '../scripts/k386-array-workloads.mjs';
describe('paired array evidence',()=>{
 it('uses the 16-bit LCG dataset, with explicit 32-bit wrap rather than floating multiplication',()=>{
  for(const identity of [1,2]){
   let seed=BigInt((12345^(identity===2?0xa5a5a5a5:0))>>>0),sum=0,max=0;
   for(let i=0;i<8192;i++){
    seed=(seed*1103515245n+12345n)&0xffffffffn;
    const value=Number((seed>>8n)&65535n);sum+=value;max=Math.max(max,value);
   }
   expect(arrayExpected('sort',identity)).toEqual({bytes:16384,sum,detail:max,work:229376});
  }
  expect(arrayExpected('sort',1).sum).not.toBe(arrayExpected('sort',2).sum);
 });
 it('decodes all four bytes of the retained pattern across page and 64 KiB boundaries',()=>{
  for(const identity of [1,2])for(const at of [0,252,4092,4096,65532,65536,2097148]){
   const word=patternWord(at,identity);
   for(let i=0;i<4;i++)expect((word>>>(i*8))&255).toBe(((at+i)^((at+i)>>>8)^((at+i)>>>16)^(identity===2?90:0))&255);
  }
 });
 it('requires the actual result record rather than a title, old CPU mode or truncated output',()=>{
  const samples=[0x58413332,1,9,1,2,0,2097152,267386880,0,6291456,1,1,0,0,0,2];
  const cpu={views:[{kind:1}],diagnostics:[{pm32:{samples}}]};
  expect(arrayRecord(cpu,0)).toMatchObject({sequence:9,scenario:1,state:2,identity:2});
  cpu.views[0].kind=0;expect(arrayRecord(cpu,0)).toBeNull();cpu.views[0].kind=1;
  samples[0]++;expect(arrayRecord(cpu,0)).toBeNull();samples[0]--;
  samples.pop();expect(arrayRecord(cpu,0)).toBeNull();
  expect(legacyArrayResult('XARRAY OK fill 2 MiB','fill')).toBeNull();
  expect(legacyArrayResult('XARRAY RESULT fill bytes=2097152 sum=267386880 detail=0 work=', 'fill')).toBeNull();
  expect(legacyArrayResult('XARRAY RESULT fill bytes=2097152 sum=267386880 detail=0 work=6291456', 'fill')).toEqual(arrayExpected('fill'));
 });
});
