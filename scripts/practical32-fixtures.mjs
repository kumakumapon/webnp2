import assert from 'node:assert/strict';
import {fnv} from './kgui32-tools-harness.mjs';
const decoder=new TextDecoder('shift_jis'),encoding=new Map();
for(let lead=0x81;lead<=0xef;lead++){if(lead>0x9f&&lead<0xe0)continue;for(let trail=0x40;trail<=0xfc;trail++){if(trail===0x7f)continue;const b=Buffer.from([lead,trail]),s=decoder.decode(b);if(s.length===1&&s!=='�'&&!encoding.has(s))encoding.set(s,b);}}
export const sjis=s=>Buffer.concat([...s].map(c=>{const n=c.codePointAt(0);if(n<128)return Buffer.from(c);if(n>=0xff61&&n<=0xff9f)return Buffer.from([n-0xff61+0xa1]);assert(encoding.has(c),c);return encoding.get(c);}));
export function dictionary(entries){
 const records=entries.map(([reading,values])=>{const key=sjis(reading),words=values.map(sjis),n=4+key.length+words.reduce((n,b)=>n+1+b.length,0),r=Buffer.alloc(n);r.writeUInt16LE(n);r[2]=key.length;r[3]=words.length;key.copy(r,4);let at=4+key.length;for(const word of words){r[at++]=word.length;word.copy(r,at);at+=word.length;}return r;});
 const body=Buffer.concat(records),header=Buffer.alloc(32);header.write('KGIMED1\0','ascii');header.writeUInt32LE(1,8);header.writeUInt32LE(32+body.length,12);header.writeUInt32LE(records.length,16);header.writeUInt32LE(fnv(body),20);return Buffer.concat([header,body]);
}
export function bitmap(width,height,bits=24,seed=1){
 const palette=bits===8?16:0,stride=(width*(bits/8)+3)&~3,offset=54+palette*4,b=Buffer.alloc(offset+stride*height),pixels=[];
 b.write('BM','ascii');b.writeUInt32LE(b.length,2);b.writeUInt32LE(offset,10);b.writeUInt32LE(40,14);b.writeInt32LE(width,18);b.writeInt32LE(height,22);b.writeUInt16LE(1,26);b.writeUInt16LE(bits,28);b.writeUInt32LE(stride*height,34);b.writeUInt32LE(palette,46);
 if(palette)for(let i=0;i<palette;i++){b[54+i*4]=i*17;b[55+i*4]=(15-i)*17;b[56+i*4]=(i*3%16)*17;}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let r=(x*13+y*7+seed*19)&255,g=(x*3+y*17+seed*23)&255,blue=(x*5+y*11+seed*29)&255;const at=offset+(height-1-y)*stride+x*(bits/8);
  if(bits===8){const index=(x+y+seed)%16;b[at]=index;blue=b[54+index*4];g=b[55+index*4];r=b[56+index*4];}
  else if(bits===16){const red=r>>3,green=g>>3;b.writeUInt16LE(red<<10|green<<5|blue>>3,at);r=red<<3|red>>2;g=green<<3|green>>2;blue=(blue>>3)<<3|blue>>5;}
  else {b[at]=blue;b[at+1]=g;b[at+2]=r;if(bits===32)b[at+3]=0xa5;}
  pixels.push((r>>3)<<11|(g>>2)<<5|blue>>3);
 }
 return {bytes:b,pixels,width,height,bits};
}
export function encode565(pixels,width,height){
 const stride=(width*3+3)&~3,b=Buffer.alloc(54+stride*height);b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(width,18);b.writeInt32LE(height,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);b.writeUInt32LE(stride*height,34);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=pixels[(height-1-y)*width+x],r=v>>11,g=v>>5&63,blue=v&31,at=54+y*stride+x*3;b[at]=blue<<3|blue>>2;b[at+1]=g<<2|g>>4;b[at+2]=r<<3|r>>2;}return b;
}
