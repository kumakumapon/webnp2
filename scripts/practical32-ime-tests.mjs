import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {withHddFile,assertHddProtected} from './kgui32-hdd-fat.mjs';
import {withFdWorkFile} from './kgui32-tools-fixtures.mjs';
import {cgGlyph,sjisUnits} from './kgui32-shiftjis.mjs';
import {dictionary,sjis} from './practical32-fixtures.mjs';
import {fnv,sha} from './practical32-harness.mjs';
export async function imeTests(p){
 const {h,until,samples}=p,font=await readFile(new URL('../public/core/font.bmp',import.meta.url));
 const ime=(s,id)=>s.appRaw[id]?.[16]===0x31454d49?{scheme:s.appRaw[id][17],bytes:s.appRaw[id][19],pending:s.appRaw[id][20],cursor:s.appRaw[id][21],candidates:s.appRaw[id][22],selected:s.appRaw[id][23],selecting:s.appRaw[id][24],hash:s.appRaw[id][27]}:null;
 async function add(id,key,value){
  let s=await until(s=>s.appRaw[id]?.[0]===0x32574b47,'dictionary fields');if(s.appRaw[id][10]!==0)await p.appKey(id,'TAB');
  s=await until(s=>s.appRaw[id]?.[0]===0x32574b47,'dictionary input scheme');if(s.appRaw[id][19]!==1)await p.appKey(id,'F4');
  await p.appType(id,key);await p.appKey(id,'ENTER');await p.appKey(id,'TAB');await p.appType(id,value);await p.appKey(id,'SPACE');await until(s=>samples(s,id)[13]>1,'dictionary word candidates');await p.appKey(id,'ENTER');await p.control(id,101);return until(s=>samples(s,id)[6]===1,'explicit unsaved dictionary edit');
 }
 async function convert(id,roman,text){await p.appType(id,roman);await p.appKey(id,'SPACE');await until(s=>ime(s,id)?.selecting===1,'Editor candidates '+roman);await p.appKey(id,'ENTER');const bytes=sjis(text);return until(s=>samples(s,id)[4]===bytes.length&&samples(s,id)[5]===fnv(bytes),'Editor committed '+text);}
 async function pixels(id,text){
  await p.focus(id);await h.shot('common-ime-glyphs.png');const s=await p.inspect(),r=s.bitmaps[id].window,glyphs=sjisUnits(sjis(text)).map(c=>cgGlyph(font,c)),width=sjis(text).length*8;
  const got=await h.page().evaluate(({x,y,w})=>{const source=document.querySelector('#canvas'),out=document.createElement('canvas');out.width=source.width;out.height=source.height;const g=out.getContext('2d');g.drawImage(source,0,0);return Array.from(g.getImageData(x,y,w,16).data);},{x:r.x+16,y:r.y+110,w:width});
  let at=0;for(const glyph of glyphs){for(let y=0;y<16;y++)for(let x=0;x<glyph.columns*8;x++){const offset=(y*width+at+x)*4,ink=got[offset]<245||got[offset+1]<245||got[offset+2]<245;assert.equal(ink,!!(glyph.bits[Math.floor(x/8)*16+y]&(128>>(x%8))),'real committed CG-ROM pixel');}at+=glyph.columns*8;}
 }
 const vector=await h.bootHdd();await p.launch('words');await add(0,'kuma','gazou');await p.control(0,103);await until(s=>samples(s)[6]===0&&samples(s)[9]===0,'explicit USERIME.DIC save');
 const expected=dictionary([['くま',['画像']]]),exported=await h.disk('hdd');assert.deepEqual(assertHddProtected(p.original,exported).files.get('WORK/USERIME.DIC'),expected);
 await p.launch('editor',1);await p.appKey(1,'F4');let s=await convert(1,'kuma','画像');assert.equal(s.appRaw[1][28],1);await pixels(1,'画像');
 await p.appKey(1,'F4');await p.appKey(1,'CTRL+A');await p.appKey(1,'BS');await p.appKey(1,'F4');await convert(1,'nihongowokakimasu','日本語を書きます');
 await p.appType(1,'gazou');s=await until(s=>ime(s,1)?.bytes===6&&!ime(s,1).pending,'pending shared composition');const before={doc:samples(s,1).slice(4,10),ime:ime(s,1)};
 await h.key('F8');await until(s=>ime(s,1)?.hash===before.ime.hash&&s.appRaw[1]?.[19]===6,'F8 composition retained');await p.appKey(1,'F9');s=await until(s=>ime(s,1)?.hash===before.ime.hash,'reload refused during composition');assert.deepEqual(samples(s,1).slice(4,10),before.doc);assert.deepEqual(ime(s,1),before.ime);await p.appKey(1,'ESC');
 p.pass('KGWORDS and Editor consume the same actual IME API; explicit user registration/save overrides a system word, complete-word/particle/inflection conversion works, real CG-ROM pixels match, F8/F9 retain active composition');await p.cleanup(vector);
 const cold=await h.bootHdd(exported);await p.launch('editor');await p.appKey(0,'F4');s=await convert(0,'kuma','画像');assert.equal(s.appRaw[0][28],1);assert.equal(sha(await h.disk('hdd')),sha(exported));await p.cleanup(cold);
 const fd=withFdWorkFile(h.legacy,'USERIME.DIC',expected),fdVector=await h.boot(null,fd);await p.launch('editor');await p.appKey(0,'F4');await convert(0,'kuma','画像');assert.equal(sha(await h.disk('fd1')),sha(fd));await p.cleanup(fdVector);p.pass('The saved user dictionary is read by a fresh HDD cold boot and the complete FD fallback, with exact disk bytes preserved');
 const concurrent=await h.bootHdd(exported);await p.launch('words');await p.launch('words',1);await add(0,'hozon','fukkyuu');await add(1,'henkan','gazou');await p.control(0,103);await until(s=>samples(s)[6]===0,'first dictionary commit');await p.control(1,103);s=await until(s=>samples(s,1)[9]===116&&samples(s,1)[6]===1,'stale dictionary save keeps private edits');assert.equal(samples(s,1)[7],2);const shared=assertHddProtected(exported,await h.disk('hdd'));assert.deepEqual(shared.files.get('WORK/USERIME.DIC'),dictionary([['くま',['画像']],['ほぞん',['復旧']]]));assert.deepEqual(shared.files.get('WORK/USERIME.TMP'),dictionary([['くま',['画像']],['へんかん',['画像']]]));assert.equal(s.expanded.slots[1].pm.openFiles,0);await p.cleanup(concurrent);p.pass('Two real dictionary owners reject stale overwrites, retain the losing private edits and exact TMP candidate, and close all DOS handles');
 const recoveryCandidate=dictionary([['くま',['画像']],['ほぞん',['復旧']]]),backup=dictionary([['へんかん',['変換']]]);
 let fixture=withHddFile(p.original,'USERIME.DIC',expected);fixture=withHddFile(fixture,'USERIME.TMP',recoveryCandidate);fixture=withHddFile(fixture,'USERIME.BAK',backup);
 const recovery=await h.bootHdd(fixture);await p.launch('words');await p.control(0,105);await until(s=>s.appRaw[0]?.[18]===1,'validated TMP inspection');await p.control(0,107);s=await until(s=>s.appRaw[0]?.[18]===0&&samples(s)[9]===0,'explicit unused dictionary recovery');assert.equal(samples(s)[7],1);const recovered=assertHddProtected(fixture,await h.disk('hdd'));assert.deepEqual(recovered.files.get('WORK/RECIME.DIC'),recoveryCandidate);assert.deepEqual(recovered.files.get('WORK/USERIME.DIC'),expected);assert.deepEqual(recovered.files.get('WORK/USERIME.BAK'),backup);assert(!recovered.files.has('WORK/USERIME.TMP'));await p.cleanup(recovery);
 const malformed=Buffer.from(recoveryCandidate);malformed[malformed.length-1]^=1;fixture=withHddFile(withHddFile(p.original,'USERIME.DIC',expected),'USERIME.TMP',malformed);const bad=await h.bootHdd(fixture);await p.launch('words');await p.control(0,105);s=await until(s=>samples(s)[9]===22,'malformed dictionary candidate refused');assert.equal(samples(s)[7],1);assert.equal(sha(await h.disk('hdd')),sha(fixture));await p.cleanup(bad);
 const readonly=withHddFile(p.original,'USERIME.DIC',expected,33),ro=await h.bootHdd(readonly);await p.launch('words');await until(s=>samples(s)[7]===1,'read-only dictionary can load');await add(0,'hozon','fukkyuu');await p.control(0,103);s=await until(s=>samples(s)[9]===13&&samples(s)[6]===1,'read-only dictionary replacement refused');assert.equal(sha(await h.disk('hdd')),sha(readonly));await p.cleanup(ro);
 p.pass('Validated TMP recovery moves only to unused RECIME.DIC, retaining original/BAK/active dictionary; malformed candidates and read-only replacement preserve exact originals and live edits');
}
