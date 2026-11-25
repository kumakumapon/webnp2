// Exercise the shipped DOS applications and read back the resulting FAT media.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {toolsHarness,sha} from './kgui32-tools-harness.mjs';
import {inspectHdd,withHddFile} from './kgui32-hdd-fat.mjs';
import {assertProtected,inspectFat} from './kgui32-workspace-fat.mjs';

const [base='http://127.0.0.1:4173/webnp2/',output='test-results/kgui32-standard',video='pegc']=process.argv.slice(2);
const h=await toolsHarness(base,output,video,{touch:true});
const canvas=(s,id=0)=>s.canvases[id];
const waitText=(text,id=0)=>h.until(s=>canvas(s,id)?.texts.some(v=>v.includes(text)),text);
const button=(code,id=0)=>h.control(id,code);
const config=(s,id=0)=>s.cpu.diagnostics[id].pm32?.samples;
const fileStats=s=>config(s)?.[0]===0x3246474b?config(s):[];
const configured=predicate=>h.until(s=>config(s)?.[0]===0x3253474b&&predicate(config(s)),'Settings state');

async function files(){
 await h.key('F2');await h.click(230,230);
 await h.until(s=>fileStats(s)[2]&&!(fileStats(s)[9]&2),'Files ready');
 await button(104);await button(106);
 await h.until(s=>fileStats(s)[9]===160&&canvas(s)?.controls.includes(403),'Work Manager');
}
async function choose(name){
 const s=await h.until(s=>canvas(s)?.draws.some(d=>d.y>=66&&d.text.startsWith(name+' ')),name+' row');
 const row=canvas(s).draws.find(d=>d.y>=66&&d.text.startsWith(name+' ')),o=h.origin(s,0);
 await h.click(o.x+24,o.y+70+row.y+8);
}
async function input(code,value){
 await button(code);
 const s=await h.until(s=>canvas(s)?.controls.includes(410),'Operation dialog');
 await h.input(0,32,Math.floor((canvas(s).height-152)/2)+42,value,12);
 await button(410);
}
async function recycle(name,result){
 await choose(name);await button(407);await button(410);await waitText(result);
}
async function closeFiles(){
 await button(400);await button(103);
 await h.until(s=>s.cpu.views[0].state===0,'Files closed');
}
function onlyBootChanges(before,after){
 const mutable=new Set(['CONFIG.SYS','AUTOEXEC.BAT']);
 for(const [name,bytes] of before.files)if(!mutable.has(name))assert.deepEqual(after.files.get(name),bytes,name);
 for(const [name,record] of before.entries)if(!mutable.has(name))assert.deepEqual(after.entries.get(name)?.raw,record.raw,name+' metadata');
 for(const name of after.entries.keys())assert(before.entries.has(name),name+' unexpected entry');
 assert(!after.entries.has('CONFIG.TMP')&&!after.entries.has('CONFIG.BAK'));
 assert(!after.entries.has('AUTOEXEC.TMP')&&!after.entries.has('AUTOEXEC.BAK'));
}
async function settings(slot,inspect){
 const snapshot=async()=>inspect(await h.disk(slot)),before=await snapshot();
 if(slot==='hdd'){
  const {gui}=await h.inspect();
  await h.click(204,gui.height-16);
  await h.guiUntil(app=>app.active===1,'System for Settings button');
  await h.click(gui.width-132,274);
 }else {
  await h.key('F2');
  await h.guiUntil(app=>app.active===0,'Welcome for Settings shortcut');
  await h.key('F9');
 }
 let s=await configured(v=>v[2]>0&&v[11]===3);
 const initial=config(s);
 assert.equal(initial[5],1);assert.equal(initial[6],0);
 await button(511);await configured(v=>v[6]===1);
 await button(516);await waitText('EMS on may stop KGUI32');await button(521);
 assert.deepEqual((await snapshot()).files.get('CONFIG.SYS'),before.files.get('CONFIG.SYS'));
 await button(511);await configured(v=>v[6]===0);
 await button(513);await button(514);await configured(v=>v[10]===1);
 await button(516);await configured(v=>v[3]===1&&v[10]===0);
 await button(515);await configured(v=>v[10]===2);
 await button(517);await configured(v=>v[3]===2&&v[10]===0&&v[4]===0);
 const middle=await snapshot(),auto=middle.files.get('AUTOEXEC.BAT').toString('ascii');
 const expectedConfig=before.files.get('CONFIG.SYS').toString('ascii')
  .replace(/FILES=\d+/, 'FILES='+(initial[7]+1)).replace(/BUFFERS=\d+/,'BUFFERS='+(initial[8]===8?16:8));
 assert.equal(middle.files.get('CONFIG.SYS').toString('ascii'),expectedConfig);
 assert.equal(auto,before.files.get('AUTOEXEC.BAT').toString('ascii').replace('KGUILDR.EXE','REM CPANEL AUTO FD98\r\nFD98\r\nKGUILDR.EXE'));
 onlyBootChanges(before,middle);
 await button(518);await configured(v=>v[9]===1&&v[10]===0);
 await button(515);await button(517);await configured(v=>v[3]===3&&v[9]===0&&v[10]===0);
 const after=await snapshot();
 assert.equal(after.files.get('CONFIG.SYS').toString('ascii'),expectedConfig);
 assert.deepEqual(after.files.get('AUTOEXEC.BAT'),before.files.get('AUTOEXEC.BAT'));
 onlyBootChanges(before,after);
 await button(519);await h.until(t=>t.cpu.views[0].state===0,'Settings closed');
 h.pass(slot+' boot settings use separate confirmed transactions with exact CONFIG/AUTOEXEC readback');
}
try{
 const original=await readFile(new URL('../public/kgui32/'+h.manifest.standalone_hdd.image,import.meta.url));
 const bytes=Buffer.from(Array.from({length:9001},(_,i)=>(i*59+13)&255));
 let seeded=withHddFile(original,'SOURCE.BIN',bytes);
 seeded=withHddFile(seeded,'GUARD.TXT',Buffer.from('keep\r\n'));
 seeded=withHddFile(seeded,'GUARD.BAK',Buffer.from('recovery copy\r\n'));
 let vector=await h.bootHdd(seeded);await files();
 await input(403,'BOX');await waitText('Folder created');
 await choose('SOURCE.BIN');await input(404,'..\\BOOT.SYS');await waitText('Use a DOS 8.3 Work path');
 await choose('SOURCE.BIN');await input(404,'BOX\\COPY.BIN');await waitText('Copied');
 await choose('SOURCE.BIN');await input(404,'BOX\\COPY.BIN');await waitText('Name already exists');
 await choose('GUARD.TXT');await input(406,'GUARD2.TXT');await waitText('TMP or BAK needs recovery');
 await choose('SOURCE.BIN');await input(405,'BOX\\MOVED.BIN');await waitText('Moved');
 await choose('BOX');await button(408);
 await choose('MOVED.BIN');await input(406,'FINAL.BIN');await waitText('Renamed');
 await recycle('FINAL.BIN','In Trash');
 const trashed=await h.disk('hdd'),stage=inspectHdd(trashed);
 assert(stage.entries.get('WORK/KTRASH').attr&2);
 assert.deepEqual(stage.files.get('WORK/KTRASH/BOX/FINAL.BIN'),bytes);
 assert.deepEqual(stage.files.get('WORK/BOX/COPY.BIN'),bytes);
 assert(!stage.files.has('WORK/SOURCE.BIN')&&!stage.files.has('WORK/BOX/FINAL.BIN'));
 assert.deepEqual(stage.files.get('WORK/GUARD.BAK'),inspectHdd(seeded).files.get('WORK/GUARD.BAK'));
 assert.deepEqual(stage.files.get('WORK/GUARD.TXT'),inspectHdd(seeded).files.get('WORK/GUARD.TXT'));
 await closeFiles();await h.unchangedFd();await h.exit(vector);await h.closeContext();
 vector=await h.bootHdd(trashed);await files();await choose('BOX');await button(408);
 await button(402);await recycle('FINAL.BIN','Restored');await button(402);await choose('FINAL.BIN');
 const restored=inspectHdd(await h.disk('hdd'));
 assert.deepEqual(restored.files.get('WORK/BOX/FINAL.BIN'),bytes);
 assert(!restored.files.has('WORK/KTRASH/BOX/FINAL.BIN'));
 await closeFiles();await settings('hdd',inspectHdd);await h.exit(vector);await h.closeContext();
 h.pass('HDD copies more than two chunks, guards traversal, collisions and BAK, and restores after cold boot');
 vector=await h.boot(null,h.legacy);
 await h.key('F4');await h.until(s=>s.editors[0]?.frames&&canvas(s)?.texts.some(v=>v.includes('NOTE.TXT')),'Memo opened');
 await h.setText(0,'FD Work note');await h.key('CTRL+S');
 await h.until(s=>s.editors[0]?.mode===0&&!s.editors[0].dirty,'FD memo saved');
 await h.end(0);
 await files();await input(403,'EMPTY');await waitText('Folder created');
 await recycle('EMPTY','In Trash');
 await recycle('NOTE.TXT','In Trash');await button(402);
 await recycle('EMPTY','Restored');await recycle('NOTE.TXT','Restored');
 const floppy=await h.disk('fd1'),fat=assertProtected(h.legacy,floppy);
 assert.equal(fat.files.get('WORK/NOTE.TXT').toString('ascii'),'FD Work note');
 assert(fat.entries.get('WORK/EMPTY').attr&16);assert(fat.entries.get('WORK/KTRASH').attr&2);
 assert(![...fat.entries.keys()].some(n=>/\.(TMP|BAK)$/.test(n)));
 await closeFiles();await settings('fd1',inspectFat);await h.exit(vector);
 h.pass('FD-only fallback uses real KGUI32 writes, confirmed folder/file recycling and protected boot media');
 await h.finish();
}catch(e){await h.fail(e);throw e;}finally{await h.close();}
