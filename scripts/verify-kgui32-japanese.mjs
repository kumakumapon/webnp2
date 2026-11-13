// Native Japanese text acceptance. Servers run only in GitHub Actions.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {toolsHarness,fnv,sha} from './kgui32-tools-harness.mjs';
import {withHddFile,inspectHdd,assertHddProtected} from './kgui32-hdd-fat.mjs';
import {assertProtected,inspectFat} from './kgui32-workspace-fat.mjs';
import {withFdWorkFile} from './kgui32-tools-fixtures.mjs';
import {cgGlyph,sjisUnits,normalized} from './kgui32-shiftjis.mjs';
const [base='http://127.0.0.1:4173/',output='test-results/japanese',video='pegc',suite='text']=process.argv.slice(2);
assert(['text','save'].includes(suite));
const h=await toolsHarness(base,output,video),m=h.manifest;
assert.equal(m.text_encoding,'shift-jis');assert.equal(m.japanese_glyphs,'pc98-cg-rom');assert.equal(m.japanese_ime,true);
const root=new URL('../public/kgui32/',import.meta.url),original=await readFile(new URL(m.standalone_hdd.image,root));
assert.equal(sha(original),m.standalone_hdd.sha256);
const bmp=await readFile(new URL('../public/core/font.bmp',import.meta.url));
const jp=Buffer.from('93fa967b8cea','hex'),kana=Buffer.from('b6c5','hex');
const raw=Buffer.concat([jp,kana,Buffer.from(' / Shift-JIS\r\nSecond line\r\n')]);
const texts=(s,id=0)=>s.canvases[id]?.texts??[];
const doc=(id,bytes)=>h.until(s=>s.editors[id]?.bytes===bytes.length&&s.editors[id].hash===fnv(bytes),'Native document '+id);
function files(s,id=0){const v=s.cpu.diagnostics[id]?.pm32?.samples;return v?.[0]===0x3246474b?{frames:v[2],focus:v[4],matches:v[7],mode:v[9],bytes:v[10],hash:v[11]}:null;}
function protectedTask(s,id){assert.equal(s.cpu.diagnostics[id].frame.cs,59);assert.equal(s.cpu.diagnostics[id].frame.eflags&0x20000,0);assert.notEqual(s.cpu.views[id].cr3,s.gui.cpu.pd);}
async function pixels(id,x,y,codes){
 const s=await h.inspect(),o=h.origin(s,id),expected=codes.map(c=>cgGlyph(bmp,c)),width=expected.reduce((n,g)=>n+g.columns*8,0);
 const rgba=await h.page().evaluate(({x,y,w,screenWidth})=>{
  const source=document.querySelector('#canvas');if(source.width!==screenWidth)throw Error('native canvas width');
  const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const g=c.getContext('2d');g.drawImage(source,0,0);
  return Array.from(g.getImageData(x,y,w,16).data);
 },{x:o.x+8+x,y:o.y+70+y,w:width,screenWidth:s.gui.width});
 let at=0;
 for(const g of expected){for(let row=0;row<16;row++)for(let col=0;col<g.columns*8;col++){
  const p=(row*width+at+col)*4,ink=rgba[p]<245||rgba[p+1]<245||rgba[p+2]<245;
  assert.equal(ink,!!(g.bits[Math.floor(col/8)*16+row]&(128>>(col%8))),`real CG-ROM pixel ${at+col},${row}`);
 }at+=g.columns*8;}
}
async function openWork(name,fd=false){
 await h.focus(0);await h.key('CTRL+O');await h.until(s=>s.editors[0]?.mode===1,'Open picker');
 if(fd){await h.key('CTRL+W');await h.until(s=>(s.editors[0]?.workspace&3)===2&&texts(s).some(t=>t==='Open / A:\\WORK / FD'),'FD Work picker');}
 await h.type(name);await h.key('TAB');await h.key('ENTER');await h.until(s=>s.editors[0]?.mode===0&&!s.editors[0].dirty,'Opened '+name);
}
async function save(bytes){await h.focus(0);await h.key('CTRL+S');await h.until(s=>s.editors[0]?.mode===0&&!s.editors[0].dirty&&s.editors[0].hash===fnv(bytes),'Committed Shift-JIS');}
async function textSuite(){
 const wrap=Buffer.concat([Buffer.alloc(46,97),jp,Buffer.alloc(110,98),Buffer.from('\r\n'),...Array.from({length:30},()=>Buffer.concat([jp,kana,Buffer.from(' / wrapped Japanese\r\n')]))]);
 let fixture=withHddFile(original,'BAD.TXT',Buffer.from([0x81]));fixture=withHddFile(fixture,'WRAP.TXT',wrap);
 const sample=inspectHdd(fixture).files.get('JPDEMO.TXT'),plain=normalized(sample);
 assert(new TextDecoder('shift_jis',{fatal:true}).decode(sample).startsWith('日本語'));
 const vector=await h.bootHdd(fixture);
 await h.key('F2');await h.click(268,230);await h.until(s=>files(s)?.frames&&!(files(s).mode&2),'Files root');
 await h.input(0,100,36,'JPDEMO.TXT',0);await h.until(s=>files(s)?.matches===1,'Japanese sample selected');
 await h.control(0,100);let s=await h.until(s=>(files(s)?.mode&1)&&files(s).hash===fnv(sample),'Native Shift-JIS Files preview');
 protectedTask(s,0);assert(texts(s).some(t=>Buffer.from(t,'latin1').includes(jp)));
 await h.shot('files-japanese.png');await pixels(0,12,52,[0x93fa,0x967b,0x8cea]);await pixels(0,12+6*8,52+16,[0xb6,0xc5]);
 await h.control(0,100);await h.key('CTRL+O');s=await h.until(s=>s.editors[1]?.frames&&s.editors[1].hash===fnv(plain),'Files launches Japanese Editor');
 protectedTask(s,1);assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);await h.focus(1);await h.key('HELP');
 await h.shot('editor-japanese.png');await pixels(1,8,40,[0x93fa,0x967b,0x8cea]);await pixels(1,8+6*8,40+16,[0xb6,0xc5]);
 h.pass('Shipping HDD-only link, actual CPL3 Files/Editor, and exact CG-ROM kanji/half-width kana pixels on '+video);
 await h.key('HOME');await h.chord('SHIFT','RIGHT');await h.until(s=>s.editors[1]?.anchor===0&&s.editors[1].cursor===2,'Whole Japanese character selection');
 await h.key('CTRL+C');await h.key('CTRL+F');await h.until(s=>s.editors[1]?.mode===5,'Find');await h.key('CTRL+V');
 await h.control(1,840);await h.until(s=>s.editors[1]?.mode===0&&s.editors[1].anchor===0&&s.editors[1].cursor===2,'Japanese clipboard query');
 await h.key('CTRL+F');await h.until(s=>s.editors[1]?.mode===5,'Find trail-byte query');await h.input(1,40,46,'{',2);await h.control(1,840);
 await h.until(s=>texts(s,1).includes('Not found'),'ASCII-valued Japanese trail is not a match');await h.control(1,843);await doc(1,plain);
 await h.key('CTRL+A');await h.key('CTRL+C');await h.end(0);await h.launchEditor(0);await h.key('CTRL+V');s=await doc(0,plain);
 assert.equal(s.editors[0].dirty,1);assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);assert.notEqual(s.cpu.views[0].physical,s.cpu.views[1].physical);
 const o=h.origin(s,0);await h.click(o.x+8+8+12,o.y+70+44);await h.until(s=>s.editors[0]?.cursor===0&&s.editors[0].anchor===0,'Hit in second glyph half snaps to start');
 await h.chord('SHIFT','RIGHT');await h.key('BS');await doc(0,plain.subarray(2));await h.key('CTRL+Z');await doc(0,plain);await h.key('CTRL+Y');await doc(0,plain.subarray(2));await h.key('CTRL+Z');await doc(0,plain);
 assert.equal((await h.inspect()).editors[1].hash,fnv(plain));
 h.pass('Whole-character hit/Shift/delete/history, Japanese Find paste, no trail-byte false match and independent clipboard consumers');
 const before=(await h.inspect()).editors[0];await h.key('CTRL+O');await h.until(s=>s.editors[0]?.mode===2,'Dirty Open confirmation');await h.key('d');
 await h.until(s=>s.editors[0]?.mode===1,'Open after explicit discard choice');await h.type('BAD.TXT');await h.key('TAB');await h.key('ENTER');
 s=await h.until(s=>s.editors[0]?.error===22&&texts(s).some(t=>t.startsWith('Open failed: Shift-JIS')),'Truncated lead rejected');
 for(const k of ['hash','bytes','dirty','history','cursor','anchor'])assert.equal(s.editors[0][k],before[k]);await h.key('ESC');
 await h.end(1);await h.run(1,'KGSAVEB.EXE sjis');s=await h.until(s=>s.cpu.views[1].state===0&&s.cpu.diagnostics[1].pm32?.samples?.[0]===0x3453474b,'Actual CPL3 malformed Shift-JIS save probe');
 assert.equal(s.cpu.diagnostics[1].pm32.samples[2],6);assert.equal(s.cpu.diagnostics[1].pm32.samples[3],0);assert.equal(s.cpu.diagnostics[1].pm32.exitCode,0);
 assert.equal(s.cpu.diagnostics[1].pm32.openFiles,0);assert.equal(sha(await h.disk('hdd')),sha(fixture));await h.unchangedFd();
 await h.launchEditor(1);await h.open(1,'WRAP.TXT');await doc(1,normalized(wrap));await h.dragToMaximum(1);await h.key('CTRL+A');
 s=await h.until(s=>s.editors[1]?.anchor===0&&s.editors[1].cursor===normalized(wrap).length&&s.canvases[1]?.draws.some(d=>d.y===40&&d.x>=376),'Expanded Japanese draw split');
 assert(s.canvases[1].count<=40);for(const d of s.canvases[1].draws){const encoded=Buffer.from(d.text,'latin1');assert(encoded.length<48);sjisUnits(encoded);}
 await h.shot('expanded-japanese-selection.png');await h.end(1);
 h.pass('Expanded selected Japanese text stays within 40 commands and never splits a pair at the 47-byte draw boundary');
 await h.end(0);await h.exit(vector);await h.unchangedFd();await h.closeContext();
 h.pass('Invalid Open retains dirty document/history; real broker rejects six malformed documents across 4096 bytes with whole-media invariance and complete cleanup');
}
async function saveSuite(){
 const wide=Buffer.alloc(65536,97);wide[4095]=0x93;wide[4096]=0xfa;wide[65534]=0x96;wide[65535]=0x7b;
 let fixture=withHddFile(original,'JP.TXT',raw);fixture=withHddFile(fixture,'WIDE.TXT',wide);fixture=withHddFile(fixture,'REC.TMP',raw);
 const vector=await h.bootHdd(fixture);await h.launchEditor();await openWork('JP.TXT');let s=await doc(0,normalized(raw));protectedTask(s,0);assert.equal(s.editors[0].workspace>>>8,0);assert.equal(s.editors[0].workspace&3,1);
 await h.key('HELP');await h.type('!');const split=raw.indexOf(13),encoded=Buffer.concat([raw.subarray(0,split),Buffer.from('!'),raw.subarray(split)]),plain=normalized(encoded);
 await doc(0,plain);await save(plain);let saved=await h.disk('hdd'),state=assertHddProtected(fixture,saved);assert.deepEqual(state.files.get('WORK/JP.TXT'),encoded);
 await h.control(0,605);await h.until(s=>s.editors[0]?.mode===7,'Editor Tools');await h.control(0,623);await h.until(s=>s.editors[0]?.dirty&&texts(s).some(t=>t.includes('LF /')),'LF format');await save(plain);
 saved=await h.disk('hdd');state=assertHddProtected(fixture,saved);assert.deepEqual(state.files.get('WORK/JP.TXT'),plain);
 await h.key('CTRL+T');await h.until(s=>s.editors[0]?.mode===6&&s.canvases[0]?.controls.includes(850),'Japanese recovery list');await h.control(0,850);
 await h.until(s=>s.canvases[0]?.controls.includes(860)&&texts(s).some(t=>Buffer.from(t,'latin1').includes(jp)),'Japanese TMP preview');
 await h.control(0,860);await h.until(s=>s.canvases[0]?.controls.includes(870),'Explicit Japanese recovery confirmation');await h.control(0,870);
 await h.until(s=>texts(s).some(t=>t.startsWith('Recovered as')),'Japanese candidate recovered');await h.control(0,862);await h.until(s=>s.editors[0]?.mode===0,'Recovery closed');
 saved=await h.disk('hdd');state=assertHddProtected(fixture,saved);assert.deepEqual(state.files.get('WORK/REC.TXT'),raw);assert(!state.files.has('WORK/REC.TMP'));assert.deepEqual(state.files.get('WORK/JP.TXT'),plain);
 h.pass('A: HDD Work preserves Shift-JIS bytes through editing, CRLF/LF saves and explicit byte-exact TMP recovery');
 await openWork('WIDE.TXT');await doc(0,wide);const full=(await h.inspect()).editors[0];await h.type('Z');
 s=await h.until(s=>texts(s).includes('Document limit: 64 KiB'),'Full document insertion refused');assert.equal(s.editors[0].hash,full.hash);assert.equal(s.editors[0].history,full.history);await h.key('ESC');
 await h.key('DEL');await h.type('Z');const changed=Buffer.from(wide);changed[0]=90;await doc(0,changed);
 await h.key('F2');await h.click(268,192);s=await h.until(s=>s.apps[1]?.magic===0x324b474b&&s.apps[1].frames,'Independent legacy clock');const tick=s.apps[1].heartbeat;assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);
 await save(changed);await h.until(s=>s.apps[1]?.heartbeat>tick,'Clock progresses during native save');saved=await h.disk('hdd');state=assertHddProtected(fixture,saved);assert.deepEqual(state.files.get('WORK/WIDE.TXT'),changed);
 await h.shot('saved-wide-japanese.png');await h.exit(vector);await h.unchangedFd();await writeFile(join(output,'saved-japanese.thd'),saved);await h.closeContext();
 const cold=await h.bootHdd(saved);await h.launchEditor();await openWork('JP.TXT');await doc(0,plain);await openWork('WIDE.TXT');await doc(0,changed);assert.equal(sha(await h.disk('hdd')),sha(saved));await h.exit(cold);await h.unchangedFd();await h.closeContext();
 h.pass('Full 65536-byte document with pairs at 4095/4096 and EOF saves exactly, keeps peer progress, survives HDD export/cold boot and reclaims all resources');
 const floppy=withFdWorkFile(h.legacy,'JP.TXT',raw),fdVector=await h.boot(null,floppy);await h.launchEditor();await openWork('JP.TXT',true);s=await doc(0,normalized(raw));assert.equal(s.editors[0].workspace&3,2);
 // An overwrite releases the old JP.TXT chain. Protect all original boot/root
 // chains using the shipped empty-Work image, then require this one Work file.
 await h.key('HELP');await h.type('!');await doc(0,plain);await save(plain);const fdSaved=await h.disk('fd1');const fs=assertProtected(h.legacy,fdSaved);
 assert.deepEqual([...fs.files.keys()].filter(n=>n.startsWith('WORK/')),['WORK/JP.TXT']);assert.deepEqual(fs.files.get('WORK/JP.TXT'),encoded);await h.exit(fdVector);await writeFile(join(output,'saved-japanese.xdf'),fdSaved);await h.closeContext();
 const fdCold=await h.boot(null,fdSaved);await h.launchEditor();await openWork('JP.TXT',true);await doc(0,plain);assert.deepEqual(inspectFat(await h.disk('fd1')).files.get('WORK/JP.TXT'),encoded);assert.equal(sha(await h.disk('fd1')),sha(fdSaved));await h.exit(fdCold);await h.closeContext();
 h.pass('Explicit FD Work fallback retains exact Shift-JIS/CRLF bytes, FAT12 protected files, export/cold boot and complete cleanup');
}
try{if(suite==='text')await textSuite();else await saveSuite();await h.finish();}catch(e){await h.fail(e);throw e;}finally{await h.close();}
