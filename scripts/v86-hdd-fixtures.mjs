// Offline copies of marked test media only; never edits a mounted/user volume.
import assert from 'node:assert/strict';
import {inspectHdd} from './kgui32-hdd-fat.mjs';
export function withAppFile(original,name,content,attr=33){
 const image=Buffer.from(original),s=inspectHdd(image),ids=s.chains.get('APPS');assert(ids?.length);assert(/^[A-Z0-9_]{1,8}\.[A-Z0-9_]{1,3}$/.test(name));assert(!s.entries.has('APPS/'+name));
 const directory=s.data+(ids[0]-2)*s.clusterBytes;let index=2;while(index<s.clusterBytes/32&&image[directory+index*32])index++;assert(index<s.clusterBytes/32);
 const free=[];for(let c=2;c<=s.clusters+1&&free.length<Math.ceil(content.length/s.clusterBytes);c++)if(!s.next(c))free.push(c);assert.equal(free.length,Math.ceil(content.length/s.clusterBytes));
 for(let i=0;i<free.length;i++){for(let fat=0;fat<2;fat++)image.writeUInt16LE(free[i+1]??0xffff,s.fat+fat*s.fatSectors*s.bps+free[i]*2);content.copy(image,s.data+(free[i]-2)*s.clusterBytes,i*s.clusterBytes,(i+1)*s.clusterBytes);}
 const at=directory+index*32,[base,ext]=name.split('.');image.fill(0,at,at+32);image.write(base.padEnd(8)+ext.padEnd(3),at,'ascii');image[at+11]=attr;image.writeUInt16LE(0x21,at+24);image.writeUInt16LE(free[0]??0,at+26);image.writeUInt32LE(content.length,at+28);inspectHdd(image);return image;
}
export function probe(state,id=0){
 const data=Buffer.from(state.cpu.diagnostics[id]?.memory??[]),at=data.indexOf('KVHDD001');if(at<0||at+64>data.length||data.readUInt32LE(at+8)!==1||data.readUInt32LE(at+12)!==64)return null;
 const fields=['checks','error','stage','drive','bytes','hash','first','actual','environment'];return Object.fromEntries(fields.map((k,i)=>[k,data.readUInt32LE(at+16+i*4)]));
}
