// Offline fixtures only. Live recovery is performed by the native guest UI.
import assert from 'node:assert/strict';
import {inspectFat} from './kgui32-workspace-fat.mjs';
export function withFdWorkFile(original,name,bytes,attr=32){
 const image=Buffer.from(original),s=inspectFat(image),work=s.entries.get('WORK');assert(work?.attr&16);assert(!s.files.has('WORK/'+name));
 const parts=name.split('.');assert(parts.length===2&&parts[0].length>=1&&parts[0].length<=8&&parts[1].length===3);
 let index=2;const start=(9+work.cluster)*1024;while(index<32&&image[start+index*32])index++;assert(index<32);
 const free=[];for(let c=2;c<1223&&free.length<Math.ceil(bytes.length/1024);c++)if(!s.next(c))free.push(c);assert.equal(free.length,Math.ceil(bytes.length/1024));
 for(let i=0;i<free.length;i++){
  const c=free[i],value=free[i+1]??0xfff;
  for(const base of [1024,3072]){const at=base+Math.floor(c*3/2),old=image.readUInt16LE(at);image.writeUInt16LE(c&1?(old&15)|(value<<4):(old&0xf000)|value,at);}
  image.fill(0,(9+c)*1024,(10+c)*1024);bytes.copy(image,(9+c)*1024,i*1024,(i+1)*1024);
 }
 const at=start+index*32;image.fill(0,at,at+32);image.write(parts[0].padEnd(8)+parts[1],at,'ascii');image[at+11]=attr;image.writeUInt16LE(0x21,at+24);image.writeUInt16LE(free[0]??0,at+26);image.writeUInt32LE(bytes.length,at+28);
 inspectFat(image);return image;
}
export function withFaultHook(original){
 const fd=Buffer.from(original),s=inspectFat(fd),entry=s.entries.get('AUTOEXEC.BAT');assert(s.files.has('HDDFLT.COM'));assert(s.next(entry.cluster)>=0xff8);
 const bytes=Buffer.concat([Buffer.from('HDDFLT.COM\r\n'),s.files.get('AUTOEXEC.BAT')]);assert(bytes.length<1024);
 for(let at=5*1024;at<11*1024;at+=32)if(fd.toString('ascii',at,at+11)==='AUTOEXECBAT'){fd.writeUInt32LE(bytes.length,at+28);break;}
 const at=(9+entry.cluster)*1024;fd.fill(0,at,at+1024);bytes.copy(fd,at);inspectFat(fd);return fd;
}
