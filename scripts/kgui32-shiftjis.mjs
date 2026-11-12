// Independent byte/font checks for native Japanese-text acceptance tests.
import assert from 'node:assert/strict';
export function sjisUnits(bytes){
 const result=[];
 for(let at=0;at<bytes.length;){
  const c=bytes[at],lead=c>=0x81&&c<=0x9f||c>=0xe0&&c<=0xef;
  if(lead){const t=bytes[at+1];assert(t>=0x40&&t<=0xfc&&t!==0x7f,'complete Shift-JIS pair');result.push((c<<8)|t);at+=2;}
  else{assert(c>=32&&c<=126||c>=0xa1&&c<=0xdf||c===9||c===10||c===13,'Shift-JIS single byte');result.push(c);at++;}
 }
 return result;
}
export function normalized(bytes){return Buffer.from(bytes.filter(c=>c!==13));}
export function cgGlyph(bmp,code){
 assert.equal(bmp.toString('ascii',0,2),'BM');assert.equal(bmp.readInt32LE(18),2048);assert.equal(bmp.readInt32LE(22),2048);assert.equal(bmp.readUInt16LE(28),1);
 const offset=bmp.readUInt32LE(10),bits=Buffer.alloc(32),columns=code>255?2:1;
 let x=code,y=0;
 if(columns===2){const lead=code>>8,trail=code&255;let ku=(lead-(lead<=0x9f?0x81:0xc1))*2+0x21,ten;
  if(trail>=0x9f){ku++;ten=trail-0x7e;}else ten=trail-(trail>=0x80?0x20:0x1f);
  x=(ku-0x20)*2;y=ten*16;
 }
 for(let half=0;half<columns;half++)for(let row=0;row<16;row++)bits[half*16+row]=bmp[offset+(2047-y-row)*256+x+half]^255;
 assert(bits.some(c=>c!==0),'nonempty shipped CG-ROM glyph');return {columns,bits};
}
