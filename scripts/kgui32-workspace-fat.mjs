// Independent checks of the actual PC-98 2HD FAT12 disk, outside guest diagnostics.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function inspectFat(image){
 assert.equal(image.length,1232*1024);assert.deepEqual(image.subarray(1024,3072),image.subarray(3072,5120),'both FAT copies agree');
 const next=c=>{const n=image.readUInt16LE(1024+Math.floor(c*3/2));return c&1?n>>>4:n&4095;};
 const used=new Set(),files=new Map(),entries=new Map();
 const chain=c=>{const chunks=[];let guard=0;while(c>=2&&c<0xff8){assert.ok(c<1223&&!used.has(c)&&guard++<1221,'valid, unshared FAT chain');used.add(c);chunks.push(image.subarray((9+c)*1024,(10+c)*1024));c=next(c);}assert.ok(c>=0xff8||(!chunks.length&&c===0),'chain terminates');return Buffer.concat(chunks);};
 function directory(bytes,prefix){
  for(let at=0;at<bytes.length&&bytes[at];at+=32){if(bytes[at]===0xe5||bytes[at+11]&8)continue;
   const base=bytes.subarray(at,at+8).toString('ascii').trimEnd(),ext=bytes.subarray(at+8,at+11).toString('ascii').trimEnd();if(base==='.'||base==='..')continue;
   const name=prefix+base+(ext?'.'+ext:''),size=bytes.readUInt32LE(at+28),cluster=bytes.readUInt16LE(at+26),attr=bytes[at+11];assert.ok(!entries.has(name),'no duplicate names');entries.set(name,{size,cluster,attr,raw:Buffer.from(bytes.subarray(at,at+32))});
   const data=chain(cluster);if(attr&16)directory(data,name+'/');else{assert.ok(size<=data.length);files.set(name,Buffer.from(data.subarray(0,size)));}
  }
 }
 directory(image.subarray(5*1024,11*1024),'');
 for(let c=2;c<1223;c++)assert.equal(next(c)!==0,used.has(c),'no lost allocation at '+c);
 return {files,entries,used,next,sha:sha(image)};
}
export function assertProtected(before,after){
 assert.deepEqual(after.subarray(0,1024),before.subarray(0,1024),'IPL unchanged');
 const a=inspectFat(before),b=inspectFat(after);
 for(const [name,data] of a.files){if(name.startsWith('WORK/'))continue;assert.deepEqual(b.files.get(name),data,'protected root file '+name);assert.deepEqual(b.entries.get(name).raw,a.entries.get(name).raw,'root metadata '+name);}
 for(const [name] of b.entries)assert.ok(a.entries.has(name)||name.startsWith('WORK/'),'only workspace additions');
 for(const c of a.used)assert.equal(b.next(c),a.next(c),'original FAT chains unchanged');
 return b;
}
// Disposable full-disk fixture: leave all boot files intact and allocate the
// otherwise-free clusters to a real, reachable WORK/FULL.BIN directory entry.
export function fullWorkspace(original){
 const image=Buffer.from(original),s=inspectFat(image),work=s.entries.get('WORK');assert.ok(work?.attr&16);
 const free=[];for(let c=2;c<1223;c++)if(!s.next(c))free.push(c);
 for(let i=0;i<free.length;i++)for(const start of [1024,3072]){const c=free[i],at=start+Math.floor(c*3/2),old=image.readUInt16LE(at),value=i+1<free.length?free[i+1]:0xfff;image.writeUInt16LE(c&1?(old&15)|(value<<4):(old&0xf000)|value,at);}
 const at=(9+work.cluster)*1024+64;image.fill(0,at,at+32);image.write('FULL    BIN',at,'ascii');image[at+11]=32;image.writeUInt16LE(0x21,at+24);image.writeUInt16LE(free[0]??0,at+26);image.writeUInt32LE(free.length*1024,at+28);
 inspectFat(image);return image;
}

export function wideWorkspace(original){
 const image=Buffer.from(original),s=inspectFat(image);
 // Remove diagnostic data, unused negative probes and the unused IME dictionary
 // from this ASCII-only wide-save fixture before boot. Never
 // modify the bundled image or a user's disk to create free space.
 for(const name of ['BROWSE.TXT','LINES.TXT','K386.TXT','DATA32.BIN','KGIME.DIC','KGDIRBAD.EXE','KGDIRNO.EXE','KGRECNEG.EXE','KGRECNON.EXE']){const e=s.entries.get(name);if(!e&&name==='DATA32.BIN')continue;assert.ok(e);let c=e.cluster;while(c>=2&&c<0xff8){const next=s.next(c);for(const start of [1024,3072]){const at=start+Math.floor(c*3/2),old=image.readUInt16LE(at);image.writeUInt16LE(c&1?old&15:old&0xf000,at);}c=next;}
  for(let at=5*1024;at<11*1024;at+=32)if(image.readUInt16LE(at+26)===e.cluster){image[at]=0xe5;break;}
 }
 const ready=inspectFat(image);let free=0;for(let c=2;c<1223;c++)if(!ready.next(c))free++;assert(free*1024>=2*65536,'64 KiB replacement needs original plus temp capacity');return image;
}
