// Actions-only browser client. Fixtures are offline disk copies; live guest
// state is observed read-only and every application action is keyboard/mouse.
import assert from 'node:assert/strict';
import {inspectHdd,assertHddProtected,withHddFile,fullHdd} from './kgui32-hdd-fat.mjs';
import {sha} from './kgui32-tools-harness.mjs';
export async function imageSaveTests({suite,h,until,image,accepted,run,launcher,sample,hash,pass,original}){
 const bmp=(pixels,w=64,ht=48)=>{
  const stride=(w*3+3)&~3,b=Buffer.alloc(54+stride*ht);b.write('BM');
  for(const [at,v] of [[2,b.length],[10,54],[14,40],[18,w],[22,ht],[34,stride*ht]])b.writeUInt32LE(v,at);
  b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);
  for(let y=0;y<ht;y++)for(let x=0;x<w;x++){
   const v=pixels[y*w+x],r=v>>11,g=v>>5&63,blue=v&31,at=54+(ht-1-y)*stride+x*3;
   b[at]=blue<<3|blue>>2;b[at+1]=g<<2|g>>4;b[at+2]=r<<3|r>>2;
  }return b;
 };
 async function start(id,command){
  const before=await until(s=>s.gui.app?.frames,'desktop before DOS launcher');
  const generation=before.expanded.slots[id].generation;
  await h.key('F2');await h.click(130,230);
  await until(s=>s.expanded.slots[id].generation!==generation&&s.expanded.slots[id].state===2,'owned DOS launcher '+id);
  await h.focus(id);await h.key('CTRL+E');await until(s=>s.expanded.slots[id].state===0,'end DOS launcher '+id);
  return run(id,command);
 }
 const modal=(s,id=0)=>image(s,id)?.[15]>>>4;
 async function waitImage(id=0){return until(s=>accepted(s,id),'real image '+id);}
 async function change(id,key,want){await h.focus(id);const before=(await waitImage(id)).bitmaps[id].hash;await h.key(key);return until(s=>accepted(s,id)&&image(s,id)[8]===hash(want)&&s.bitmaps[id].hash!==before,'image edit '+id);}
 async function name(value){await h.input(0,50,16,value);}
 async function save(id=0){await h.focus(id);await h.key('CTRL+S');return until(s=>accepted(s,id)&&!image(s,id)[14]&&!image(s,id)[13]&&!modal(s,id),'save complete '+id);}
 async function workOpen(value){await h.focus(0);let s=await waitImage();if(!(image(s)[15]&8)){await h.key('CTRL+W');await until(s=>image(s)?.[15]&8,'Work selected');}await name(value);await h.control(0,111);return until(s=>accepted(s)&&!image(s)[13]&&!image(s)[14],'Work open '+value);}
 async function finish(vector,before){const bytes=await h.disk('hdd');assertHddProtected(before,bytes);await h.exit(vector);await h.unchangedFd();await h.closeContext();return bytes;}
 const inverse=sample.map(v=>v^65535),flipped=inverse.slice();
 for(let y=0;y<48;y++)for(let x=0;x<64;x++)flipped[y*64+x]=inverse[y*64+63-x];
 if(suite==='save'){
  const fixture=withHddFile(original,'SAMPLE.BMP',bmp(sample)),vector=await h.bootHdd(fixture);await launcher();
  await change(0,'i',inverse);await name('EDIT.BMP');await save();
  let disk=await h.disk('hdd'),fat=assertHddProtected(fixture,disk);assert.deepEqual(fat.files.get('WORK/EDIT.BMP'),bmp(inverse));
  await change(0,'u',sample);assert.equal(image(await waitImage())[14],1);await h.key('q');await until(s=>modal(s)===3,'unsaved Close prompt');await h.key('ESC');await until(s=>modal(s)===0&&image(s)[14]===1,'cancel Close keeps pixels');await change(0,'u',inverse);
  await name('SAMPLE.BMP');const before=sha(await h.disk('hdd'));await h.key('CTRL+S');await until(s=>modal(s)===1,'explicit replace confirmation');await h.key('ESC');await until(s=>modal(s)===0,'cancel replace');assert.equal(sha(await h.disk('hdd')),before);
  await h.key('CTRL+S');await until(s=>modal(s)===1,'replace requires confirmation again');await h.key('r');await until(s=>modal(s)===0&&!image(s)[13],'explicit Replace');assert.deepEqual(inspectHdd(await h.disk('hdd')).files.get('WORK/SAMPLE.BMP'),bmp(inverse));
  await workOpen('EDIT.BMP');await start(1,'KGIMAGE.EXE work EDIT.BMP');await waitImage(1);
  await change(1,'h',flipped);await save(1);disk=await h.disk('hdd');assert.deepEqual(inspectHdd(disk).files.get('WORK/EDIT.BMP'),bmp(flipped));
  await change(0,'i',sample);await h.key('CTRL+S');let s=await until(s=>image(s)?.[13]===116,'stale BMP revision rejected');
  assert.equal(image(s)[8],hash(sample));assert.equal(image(s)[14],1);assert.equal(s.expanded.slots[0].pm.openFiles,0);assert.equal(sha(await h.disk('hdd')),sha(disk));
  await h.shot('bmp-conflict.png');disk=await finish(vector,fixture);
  let next=await h.bootHdd(disk);await start(0,'KGIMAGE.EXE work EDIT.BMP');s=await until(s=>accepted(s)&&image(s)[8]===hash(flipped),'exported BMP cold boot');assert.equal(image(s)[14],0);assert.equal(sha(await h.disk('hdd')),sha(disk));await finish(next,disk);
  pass('Actual BMP save, Undo retained across commit, explicit replace/cancel, two-owner conflict, exact FAT bytes and exported-image cold boot');
  const wide=Uint16Array.from({length:256*192},(_,i)=>i*137&65535),wideBytes=bmp(wide,256,192),wideFixture=withHddFile(original,'MAX.BMP',wideBytes);
  assert.equal(wideBytes.length,147510);next=await h.bootHdd(wideFixture);await start(0,'KGIMAGE.EXE work MAX.BMP');await until(s=>accepted(s)&&image(s)[8]===hash(wide),'maximum BMP loaded');
  const edited=wide.map(v=>v^65535);await change(0,'i',edited);await save();const result=await h.disk('hdd');assert.deepEqual(assertHddProtected(wideFixture,result).files.get('WORK/MAX.BMP'),bmp(edited,256,192));assert.equal(inspectHdd(result).chains.get('WORK/MAX.BMP').length,37);await finish(next,wideFixture);
  pass('Maximum 147510-byte BMP is loaded, edited, atomically replaced and read from independently validated FAT16 allocation');
 }else{
  let fixture=withHddFile(original,'NOTE.BMP',bmp(sample));fixture=withHddFile(fixture,'NOTE.TMP',bmp(inverse));fixture=withHddFile(fixture,'NOTE.BAK',bmp(sample));
  const vector=await h.bootHdd(fixture);await start(0,'KGIMAGE.EXE work NOTE.BMP');await waitImage();await change(0,'i',inverse);await h.key('CTRL+S');await until(s=>image(s)?.[13]===117,'existing BAK blocks save');assert.equal(sha(await h.disk('hdd')),sha(fixture));
  await h.key('CTRL+R');await until(s=>modal(s)===2,'BMP recovery inspect');await h.control(0,84);await until(s=>modal(s)===4,'TMP validated without replacing live pixels');
  await h.input(0,50,88,'NOTE.BMP');await h.key('ENTER');await until(s=>image(s)?.[13]===17,'restore refuses occupied destination');assert.equal(sha(await h.disk('hdd')),sha(fixture));
  await h.input(0,50,88,'RESCUED.BMP');await h.key('ENTER');let s=await until(s=>modal(s)===0&&!image(s)[13],'explicit BMP recovery');assert.equal(image(s)[8],hash(inverse));assert.equal(image(s)[14],1);
  let disk=await h.disk('hdd'),fat=assertHddProtected(fixture,disk);assert.deepEqual(fat.files.get('WORK/NOTE.BMP'),bmp(sample));assert.deepEqual(fat.files.get('WORK/NOTE.BAK'),bmp(sample));assert.deepEqual(fat.files.get('WORK/RESCUED.BMP'),bmp(inverse));assert(!fat.files.has('WORK/NOTE.TMP'));await h.shot('bmp-recovery.png');await finish(vector,fixture);
  pass('TMP/BAK inspection, occupied-destination refusal and explicit exclusive recovery preserve original, other candidate, live pixels and Undo');
  for(const mode of ['full','protected','invalid']){
   let before=withHddFile(original,'NOTE.BMP',bmp(sample));
   if(mode==='full')before=fullHdd(before);
   else if(mode==='protected')before=withHddFile(before,'LOCKED.BMP',bmp(sample),33);
   else before=withHddFile(before,'NOTE.TMP',Buffer.from('invalid BMP candidate'));
   const v=await h.bootHdd(before);await start(0,'KGIMAGE.EXE work NOTE.BMP');await waitImage();await change(0,'i',inverse);
   if(mode==='protected')await name('LOCKED.BMP');
   if(mode==='invalid'){await h.key('CTRL+R');await until(s=>modal(s)===2,'invalid candidate inspection');await h.control(0,84);}
   else await h.key('CTRL+S');
   const error=mode==='full'?28:mode==='protected'?13:22;s=await until(s=>image(s)?.[13]===error,mode+' safe refusal');assert.equal(image(s)[8],hash(inverse));assert.equal(image(s)[14],1);assert.equal(s.expanded.slots[0].pm.openFiles,0);assert.equal(sha(await h.disk('hdd')),sha(before));await finish(v,before);
  }
  pass('Full disk, protected target and malformed recovery BMP keep original files and dirty pixels with no leaked handles');
 }
}
