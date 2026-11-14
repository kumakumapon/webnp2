// Independent FAT16 inspection of exported bytes, never a live host FAT writer.
import assert from 'node:assert/strict';
export function inspectHdd(image){
 assert.equal(image.readUInt16LE(0),615);assert.equal(image.length,256+615*8*33*256);
 const partition=256+image.readUInt16LE(512+10)*8*33*256;
 assert.equal(partition,67840);assert.equal(image.toString('ascii',528,544),'KHDPROOF        ');
 const bps=image.readUInt16LE(partition+11),spc=image[partition+13],reserved=image.readUInt16LE(partition+14),fats=image[partition+16],roots=image.readUInt16LE(partition+17),sectors=image.readUInt16LE(partition+19),fatSectors=image.readUInt16LE(partition+22);
 assert.equal(bps,1024);assert.equal(spc,4);assert.equal(fats,2);assert.equal(sectors,40524);
 const fat=partition+reserved*bps,root=fat+fats*fatSectors*bps,rootBytes=Math.ceil(roots*32/bps)*bps,data=root+rootBytes,clusterBytes=bps*spc,clusters=Math.floor((partition+sectors*bps-data)/clusterBytes);
 assert.equal(clusters,10116);assert.deepEqual(image.subarray(fat,fat+fatSectors*bps),image.subarray(fat+fatSectors*bps,fat+2*fatSectors*bps),'both FAT16 copies');
 assert.equal(image.readUInt16LE(fat),0xfff8);assert.equal(image.readUInt16LE(fat+2),0xffff);
 const next=c=>image.readUInt16LE(fat+c*2),used=new Set(),files=new Map(),entries=new Map(),chains=new Map();
 function chain(c){const ids=[];while(c>=2&&c<0xfff8){assert(c<=clusters+1&&!used.has(c),'valid, unshared FAT16 chain');used.add(c);ids.push(c);c=next(c);}assert(c===0&&!ids.length||c>=0xfff8,'chain termination');return ids;}
 function directory(bytes,prefix,parent=0,self=0){
  if(prefix){assert.equal(bytes.toString('ascii',0,11),'.          ');assert.equal(bytes.readUInt16LE(26),self);assert.equal(bytes.toString('ascii',32,43),'..         ');assert.equal(bytes.readUInt16LE(58),parent);}
  for(let at=0;at<bytes.length&&bytes[at];at+=32){if(bytes[at]===0xe5||bytes[at+11]&8)continue;
   const base=bytes.toString('ascii',at,at+8).trimEnd(),ext=bytes.toString('ascii',at+8,at+11).trimEnd();if(base==='.'||base==='..')continue;
   const name=prefix+base+(ext?'.'+ext:''),size=bytes.readUInt32LE(at+28),first=bytes.readUInt16LE(at+26),attr=bytes[at+11];assert(!entries.has(name));
   const ids=chain(first),contents=Buffer.concat(ids.map(c=>image.subarray(data+(c-2)*clusterBytes,data+(c-1)*clusterBytes)));
   entries.set(name,{size,cluster:first,attr,raw:Buffer.from(bytes.subarray(at,at+32)),offset:prefix?null:root+at});chains.set(name,ids);
   if(attr&16)directory(contents,name+'/',self,first);else{assert.equal(ids.length,Math.ceil(size/clusterBytes),'file allocation matches size');files.set(name,contents.subarray(0,size));}
  }
 }
 directory(image.subarray(root,root+rootBytes),'');
 let free=0;for(let c=2;c<=clusters+1;c++){assert.equal(next(c)!==0,used.has(c),'no lost allocation '+c);if(!next(c))free++;}
 return {files,entries,chains,used,next,free,clusterBytes,clusters,partition,fat,fatSectors,bps,spc,root,data};
}
export function assertHddProtected(before,after){
 const a=inspectHdd(before),b=inspectHdd(after);assert.deepEqual(after.subarray(0,a.fat),before.subarray(0,a.fat),'THD/IPL/partition/BPB preserved');
 assert.deepEqual(after.subarray(a.data+a.clusters*a.clusterBytes),before.subarray(a.data+a.clusters*a.clusterBytes),'unused tail preserved');
 for(const [name,e] of a.entries){if(name==='WORK'||name.startsWith('WORK/'))continue;
  assert.deepEqual(b.entries.get(name)?.raw,e.raw,'root metadata '+name);assert.deepEqual(b.chains.get(name),a.chains.get(name));assert.deepEqual(b.files.get(name),a.files.get(name),'existing root file '+name);
 }
 for(const name of b.entries.keys())assert(a.entries.has(name)||name==='WORK'||name.startsWith('WORK/'),'workspace additions only');
 if(a.entries.has('WORK'))assert.equal(b.entries.get('WORK')?.cluster,a.entries.get('WORK')?.cluster);return b;
}
function link(image,s,c,value){for(let i=0;i<2;i++)image.writeUInt16LE(value,s.fat+i*s.fatSectors*s.bps+c*2);}
function directoryOffset(s,index){const c=s.chains.get('WORK')[Math.floor(index*32/s.clusterBytes)];assert(c);return s.data+(c-2)*s.clusterBytes+index*32%s.clusterBytes;}
export function withHddFile(original,name,bytes,attr=32){
 const image=Buffer.from(original),s=inspectHdd(image),parts=name.split('.');assert(parts.length===2&&parts[0].length<=8&&parts[1].length<=3);
 let index=2;while(image[directoryOffset(s,index)])index++;const at=directoryOffset(s,index),free=[];
 for(let c=2;c<=s.clusters+1&&free.length<Math.ceil(bytes.length/s.clusterBytes);c++)if(!s.next(c))free.push(c);
 assert.equal(free.length,Math.ceil(bytes.length/s.clusterBytes));for(let i=0;i<free.length;i++){
  link(image,s,free[i],free[i+1]??0xffff);bytes.copy(image,s.data+(free[i]-2)*s.clusterBytes,i*s.clusterBytes,(i+1)*s.clusterBytes);
 }
 image.fill(0,at,at+32);image.write(parts[0].padEnd(8)+parts[1].padEnd(3),at,'ascii');image[at+11]=attr;image.writeUInt16LE(0x21,at+24);image.writeUInt16LE(free[0]??0,at+26);image.writeUInt32LE(bytes.length,at+28);
 inspectHdd(image);return image;
}
export function fullHdd(original,{directoryFull=false}={}){
 let image=withHddFile(original,'NOTE.TXT',Buffer.from('original on HDD\n'));
 image=withHddFile(image,'BASE.TXT',Buffer.from('preserve me\n'));
 const s=inspectHdd(image),free=[];for(let c=2;c<=s.clusters+1;c++)if(!s.next(c))free.push(c);
 if(directoryFull)free.pop();let index=2;while(image[directoryOffset(s,index)])index++;const at=directoryOffset(s,index);
 for(let i=0;i<free.length;i++)link(image,s,free[i],free[i+1]??0xffff);
 image.write('FULL    BIN',at,'ascii');image[at+11]=32;image.writeUInt16LE(0x21,at+24);image.writeUInt16LE(free[0],at+26);image.writeUInt32LE(free.length*s.clusterBytes,at+28);
 if(directoryFull)for(let i=index+1;i<s.clusterBytes/32;i++){
  const p=directoryOffset(s,i);image.write('Z'+i.toString().padStart(7,'0')+'TXT',p,'ascii');image[p+11]=32;image.writeUInt16LE(0x21,p+24);
 }
 const done=inspectHdd(image);assert.equal(done.free,directoryFull?1:0);return image;
}
export function blockedWork(original){
 const image=Buffer.from(original),s=inspectHdd(image),entry=s.entries.get('WORK');image[entry.offset+11]=32;image.writeUInt32LE(s.clusterBytes,entry.offset+28);return image;
}
export function legacyHdd(original){
 const image=Buffer.from(original),s=inspectHdd(image),entry=s.entries.get('WORK');
 for(const c of s.chains.get('WORK')){link(image,s,c,0);image.fill(0,s.data+(c-2)*s.clusterBytes,s.data+(c-1)*s.clusterBytes);}
 image.fill(0,entry.offset,entry.offset+32);inspectHdd(image);return image;
}
