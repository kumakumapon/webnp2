// Native app-local IME acceptance. Run only against the finite CI server.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {toolsHarness,fnv,sha} from './kgui32-tools-harness.mjs';
import {withHddFile,inspectHdd,assertHddProtected} from './kgui32-hdd-fat.mjs';
import {assertProtected,inspectFat} from './kgui32-workspace-fat.mjs';
import {withFdWorkFile} from './kgui32-tools-fixtures.mjs';
import {cgGlyph,sjisUnits} from './kgui32-shiftjis.mjs';
const [base='http://127.0.0.1:4173/',output='test-results/ime',video='pegc',suite='input']=process.argv.slice(2);
assert(['input','lifecycle'].includes(suite));
const h=await toolsHarness(base,output,video),m=h.manifest;
assert.equal(m.japanese_ime,true);assert.equal(m.ime.dictionary.readings,840);
const root=new URL('../public/kgui32/',import.meta.url),original=await readFile(new URL(m.standalone_hdd.image,root)),bmp=await readFile(new URL('../public/core/font.bmp',import.meta.url));
assert.equal(sha(original),m.standalone_hdd.sha256);
// Independent expected bytes, derived from the standard encoding's decoder.
const decoder=new TextDecoder('shift_jis'),encoding=new Map();
for(let lead=0x81;lead<=0xef;lead++){if(lead>0x9f&&lead<0xe0)continue;for(let trail=0x40;trail<=0xfc;trail++){if(trail===0x7f)continue;const b=Buffer.from([lead,trail]),s=decoder.decode(b);if(s.length===1&&s!=='�'&&!encoding.has(s))encoding.set(s,b);}}
const sjis=s=>Buffer.concat([...s].map(c=>{const n=c.codePointAt(0);if(n<128)return Buffer.from(c);if(n>=0xff61&&n<=0xff9f)return Buffer.from([n-0xff61+0xa1]);assert(encoding.has(c),c);return encoding.get(c);}));
const texts=(s,id=0)=>s.canvases[id]?.texts??[];
const doc=(text,id=0)=>{const bytes=Buffer.isBuffer(text)?text:sjis(text);return h.until(s=>s.editors[id]?.bytes===bytes.length&&s.editors[id].hash===fnv(bytes),'Document '+id+' '+bytes.length+' bytes');};
const pre=(text,pending=0,id=0)=>h.until(s=>s.imes[id]?.bytes===sjis(text).length&&s.imes[id].hash===fnv(sjis(text))&&s.imes[id].pending===pending,'Preedit '+id+' '+text);
const idle=(id=0)=>h.until(s=>s.imes[id]?.bytes===0&&s.imes[id].pending===0,'IME idle '+id);
async function convert(roman,reading,id=0){await h.type(roman);await h.key('SPACE');await pre(reading,0,id);return h.until(s=>s.imes[id]?.selecting===1&&s.canvases[id]?.controls.includes(2200),'Candidates '+reading);}
function invariant(before,after){for(const k of ['bytes','hash','cursor','anchor','dirty','history','redo'])assert.equal(after[k],before[k],k);}
async function clearDocument(){await h.key('F4');await h.key('CTRL+A');await h.key('BS');await doc('');await h.key('F4');}
async function pixels(id,text){
 const s=await h.inspect(),o=h.origin(s,id),glyphs=sjisUnits(sjis(text)).map(c=>cgGlyph(bmp,c)),width=sjis(text).length*8;
 const rgba=await h.page().evaluate(({x,y,width})=>{const source=document.querySelector('#canvas'),c=document.createElement('canvas');c.width=source.width;c.height=source.height;const g=c.getContext('2d');g.drawImage(source,0,0);return Array.from(g.getImageData(x,y,width,16).data);},{x:o.x+16,y:o.y+94,width});
 let at=0;for(const g of glyphs){for(let y=0;y<16;y++)for(let x=0;x<g.columns*8;x++)assert.equal(rgba[(y*width+at+x)*4]<100,!!(g.bits[Math.floor(x/8)*16+y]&(128>>(x%8))),'native preedit CG-ROM pixel');at+=g.columns*8;}
}
async function openWork(name,fd=false){await h.focus(0);await h.key('CTRL+O');await h.until(s=>s.editors[0]?.mode===1,'Open');if(fd)await h.key('CTRL+W');await h.type(name);await h.key('TAB');await h.key('ENTER');return h.until(s=>s.editors[0]?.mode===0&&!s.editors[0].dirty,'Opened '+name);}
async function save(plain){await h.key('CTRL+S');return h.until(s=>s.editors[0]?.mode===0&&!s.editors[0].dirty&&s.editors[0].hash===fnv(plain),'Saved native IME text');}
async function inputSuite(){
 const vector=await h.bootHdd();await h.launchEditor();let s=await idle();assert.equal(s.imes[0].scheme,0);
 await h.control(0,605);await h.control(0,626);await h.control(0,2211);await h.control(0,2215);await h.until(s=>s.imes[0]?.scheme===1,'Romaji settings button');
 const before=(await h.inspect()).editors[0];await convert('nihongo','にほんご');s=await doc('');invariant(before,s.editors[0]);assert.equal(s.imes[0].dictionary,1);
 assert(s.canvases[0].buttons.some(b=>Buffer.from(b.text,'latin1').includes(sjis('日本語'))));assert.equal(s.cpu.diagnostics[0].frame.cs,59);
 await h.shot('romaji-candidates.png');await pixels(0,'にほん');
 await h.key('SPACE');await h.until(s=>s.imes[0]?.selected===1,'Next candidate');await h.chord('SHIFT','SPACE');await h.until(s=>s.imes[0]?.selected===0,'Previous candidate');
 await h.control(0,2200);await h.key('ENTER');await doc('日本語');await idle();await h.key('CTRL+Z');await doc('');await h.key('CTRL+Y');await doc('日本語');
 h.pass('Actual CPL3 Romaji preedit, exact CG-ROM pixels, packaged dictionary candidates, explicit commit and single-step Undo/Redo');
 await h.key('CTRL+A');await convert('kanji','かんじ');await h.key('3');await h.until(s=>s.imes[0]?.selected===2,'Number selects without committing');await doc('日本語');await h.control(0,2201);await h.control(0,2190);await doc('感じ');
 await h.key('CTRL+Z');await doc('日本語');await h.key('CTRL+Y');await doc('感じ');
 await h.type('ky');await pre('',2);const kept=(await h.inspect()).editors[0];await h.key('SPACE');await h.until(s=>texts(s).some(t=>t.startsWith('Incomplete romaji')),'Incomplete input retained');await h.key('CTRL+S');await h.key('F10');
 s=await h.until(s=>texts(s).some(t=>t.startsWith('Commit or cancel IME')),'Close requires explicit composition resolution');invariant(kept,s.editors[0]);await pre('',2);await h.key('CTRL+Z');await idle();s=await doc('感じ');invariant(kept,s.editors[0]);
 await h.key('F5');await h.until(s=>s.imes[0]?.scheme===2,'JIS kana');await h.type('t@f[');await h.chord('SHIFT','3');await h.chord('SHIFT','Z');await pre('がぱぁっ');await h.key('F7');await h.until(s=>s.imes[0]?.script===1,'Katakana output');await h.shot('jis-kana-katakana.png');await h.key('ENTER');await doc('感じガパァッ');
 await h.key('F6');await h.key('F5');await convert('kou','こう');s=await h.until(s=>s.imes[0]?.candidates===14,'Multiple pages');const pageRows=Math.min(6,Math.max(1,Math.floor((s.canvases[0].height-112)/20)));await h.key('ROLLDOWN');await h.until(s=>s.imes[0]?.selected===pageRows,'Candidate page');await h.control(0,2193);await h.until(s=>s.imes[0]?.selected===pageRows*2,'Next page mouse');await h.key('HOME');await h.until(s=>s.imes[0]?.selected===0,'First candidate');await h.key('HELP');await h.until(s=>s.imes[0]?.selected===13,'Last candidate');await h.shot('candidate-pages.png');await h.key('ESC');await pre('こう');await h.key('ESC');await idle();await doc('感じガパァッ');
 h.pass('Selection replacement, numeric/mouse/page candidates, kana accents and small letters, Katakana, incomplete/cancel/close retention');
 await clearDocument();await convert('nihon','にほん');await h.key('ENTER');await doc('日本');await h.key('CTRL+H');await h.until(s=>s.editors[0]?.mode===5,'Replace');
 await convert('nihon','にほん');await h.key('ENTER');await idle();await h.key('TAB');await convert('kanji','かんじ');await h.key('ENTER');await idle();await h.control(0,842);await doc('漢字');await h.key('CTRL+Z');await doc('日本');
 h.pass('Find and Replace fields compose Japanese directly, replace atomically and Undo restores the original document');
 await h.type('konnichiha');await pre('こんにちは');const private0=(await h.inspect()).imes[0];await h.launchEditor(1);await idle(1);assert.equal((await h.inspect()).imes[1].scheme,0);await h.key('F4');await convert('gakkou','がっこう',1);await h.key('ENTER');await doc('がっこう',1);
 await h.focus(0);await pre('こんにちは');s=await h.inspect();assert.equal(s.imes[0].hash,private0.hash);assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);const tick=s.editors[1].heartbeat;await h.dragToMaximum(0);await pre('こんにちは');await h.until(s=>s.editors[1]?.heartbeat>tick,'Peer progresses during IME');assert((await h.inspect()).canvases[0].count<=40);
 await h.key('ESC');await idle();await h.end(1);await h.end(0);assert.equal(sha(await h.disk('hdd')),sha(original));await h.exit(vector);await h.unchangedFd();await h.closeContext();
 h.pass('Two independent Editor IMEs preserve preedit over focus/resize, peer progress and complete resource cleanup with whole-media invariance');
}
async function lifecycleSuite(){
 const wide=Buffer.alloc(65536,120),fixture=withHddFile(withHddFile(original,'IME.TXT',Buffer.from('BASE\r\n')),'WIDE.TXT',wide);
 const vector=await h.bootHdd(fixture);await h.launchEditor();await openWork('IME.TXT');await h.key('CTRL+A');await h.key('F4');await convert('nihongo','にほんご');await h.key('ENTER');await doc('日本語');await h.key('F4');await h.key('ENTER');await h.key('F4');await h.type('konnichiha');await pre('こんにちは');await h.key('ENTER');
 const plain=sjis('日本語\nこんにちは'),raw=sjis('日本語\r\nこんにちは');await doc(plain);await save(plain);let saved=await h.disk('hdd'),state=assertHddProtected(fixture,saved);assert.deepEqual(state.files.get('WORK/IME.TXT'),raw);await h.shot('ime-hdd-saved.png');
 await openWork('WIDE.TXT');
 await h.key('CTRL+A');await h.key('RIGHT');await h.until(s=>s.editors[0]?.cursor===65536&&s.editors[0].anchor===65536,'EOF at full document');
 const kept=(await h.inspect()).editors[0];await convert('kanji','かんじ');await h.key('ENTER');let s=await h.until(s=>texts(s).some(t=>t.startsWith('Document limit: 64 KiB')),'Full document retains composition');invariant(kept,s.editors[0]);await pre('かんじ');assert.equal(s.imes[0].selecting,1);await h.control(0,2191);await idle();
 await h.end(0);await h.exit(vector);await h.unchangedFd();await writeFile(join(output,'ime-saved.thd'),saved);await h.closeContext();
 const cold=await h.bootHdd(saved);await h.launchEditor();await openWork('IME.TXT');await doc(plain);assert.equal(sha(await h.disk('hdd')),sha(saved));await h.exit(cold);await h.unchangedFd();await h.closeContext();
 h.pass('HDD-only shipping boot, exact native IME Shift-JIS/CRLF save/export/cold boot, 64 KiB commit rejection retaining all original state, complete cleanup');
 const fd=withFdWorkFile(h.legacy,'IME.TXT',Buffer.from('old\r\n')),fdVector=await h.boot(null,fd);await h.launchEditor();await openWork('IME.TXT',true);await h.key('CTRL+A');await h.key('F4');await convert('nihongo','にほんご');await h.key('ENTER');await doc('日本語');await save(sjis('日本語'));
 const fdSaved=await h.disk('fd1'),fs=assertProtected(h.legacy,fdSaved);assert.deepEqual(fs.files.get('WORK/IME.TXT'),sjis('日本語'));assert.deepEqual([...fs.files.keys()].filter(n=>n.startsWith('WORK/')),['WORK/IME.TXT']);await h.exit(fdVector);await h.closeContext();
 const fdCold=await h.boot(null,fdSaved);await h.launchEditor();await openWork('IME.TXT',true);await doc('日本語');assert.equal(sha(await h.disk('fd1')),sha(fdSaved));await h.exit(fdCold);await writeFile(join(output,'ime-saved.xdf'),fdSaved);await h.closeContext();
 h.pass('Complete explicit FD fallback includes dictionary, native conversion and exact FAT12 save/export/cold boot without changing protected boot files');
 // Corrupt only the dictionary in a private offline FD fixture. All runtime
 // recovery is through real keys/buttons; no host write to guest memory.
 const broken=Buffer.from(h.legacy),fat=inspectFat(broken),e=fat.entries.get('KGIME.DIC');broken[(9+e.cluster)*1024+20]^=1;inspectFat(broken);
 const badVector=await h.boot(null,broken);await h.launchEditor();await h.key('F4');await convert('nihon','にほん');s=await h.until(s=>s.imes[0]?.dictionary===2&&texts(s).some(t=>t.startsWith('Dictionary unavailable')),'Corrupt dictionary safely falls back');assert.equal(s.cpu.diagnostics[0].pm32.openFiles,0);assert.equal(s.imes[0].candidates,2);
 await h.key('ENTER');await doc('にほん');await h.type('ky');await pre('',2);await h.end(0);await h.launchEditor();await idle();assert.equal((await h.inspect()).imes[0].scheme,0);assert.equal(sha(await h.disk('fd1')),sha(broken));await h.exit(badVector);await h.closeContext();
 h.pass('Corrupt dictionary closes its handle and retains kana conversion; explicit Force End reclaims a composing app and a new generation has no stale IME state');
}
try{if(suite==='input')await inputSuite();else await lifecycleSuite();await h.finish();}catch(e){await h.fail(e);throw e;}finally{await h.close();}
