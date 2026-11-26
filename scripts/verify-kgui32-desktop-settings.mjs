// Exercises the shipped HDD, guest settings and host status without starting a server.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {toolsHarness, fnv} from './kgui32-tools-harness.mjs';
import {assertHddProtected, withHddFile} from './kgui32-hdd-fat.mjs';

const [base = 'http://127.0.0.1:4173/webnp2/', output = 'test-results/kgui32-desktop-settings', video = 'pegc'] = process.argv.slice(2);
const h = await toolsHarness(base, output, video, {touch:true, viewport:{width:390,height:844}});
const retained = (id, text) => h.until(s => {
  const canvas=s.canvases[id];
  return canvas && [...canvas.texts,...canvas.buttons.map(b=>b.text)].some(value=>value.includes(text));
}, text);
const has = (id, code) => h.until(s => s.canvases[id]?.controls.includes(code), 'control '+code);
const owned = (id, program) => h.until(s => s.resources.usage[id]?.program === program && s.bridge.tokens[id], program);
const gone = id => h.until(s => s.cpu.views[id].state === 0, 'closed '+id);

async function launch(query, program, id = 0) {
  await h.key('CTRL+K');
  await h.type(query);
  await h.key('ENTER');
  return owned(id, program);
}
async function tap(x, y) {
  const {gui} = await h.inspect();
  const canvas = h.page().locator('#canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  assert.ok(box);
  await h.page().touchscreen.tap(box.x + x*box.width/gui.width, box.y + y*box.height/gui.height);
}
async function tapControl(code) {
  const s = await has(0, code);
  const b = s.canvases[0].buttons.find(b => b.id === code);
  const o = h.origin(s, 0);
  await tap(o.x+8+b.x+b.w/2, o.y+70+b.y+b.h/2);
}
async function crop(x, y, width, height, previous = '') {
  const result = await h.page().waitForFunction(({x,y,width,height,previous}) => {
    const canvas = document.createElement('canvas');
    canvas.width=width; canvas.height=height;
    canvas.getContext('2d').drawImage(document.querySelector('#canvas'),x,y,width,height,0,0,width,height);
    const image = canvas.toDataURL();
    return image!==previous && image;
  }, {x,y,width,height,previous}, {timeout:20000});
  try { return await result.jsonValue(); }
  finally { await result.dispose(); }
}
async function meter(gui) {
  const result = await h.page().waitForFunction(({owner,cookie}) => {
    const ram = atob(window.np2debug.np2.readMemoryBase64(0x10000,0x90000).base64);
    const word = i => (ram.charCodeAt(i)|ram.charCodeAt(i+1)<<8|ram.charCodeAt(i+2)<<16|ram.charCodeAt(i+3)<<24)>>>0;
    for(let at=ram.indexOf('KGPERF01');at>=0;at=ram.indexOf('KGPERF01',at+1)){
      if(word(at+8)!==1 || word(at+12)!==68 || word(at+16)!==owner || word(at+20)!==cookie ||
          word(at+28)!==1 || !word(at+36))continue;
      const keys=['hz','ready','startup','frames','paintLast','paintMax','pixelsLast','pixelsTotal','inputCount','inputLast','inputMax'];
      return Object.fromEntries(keys.map((name,i)=>[name,word(at+24+i*4)]));
    }
    return null;
  }, {owner:gui.owner,cookie:gui.cookie}, {timeout:15000});
  try { return await result.jsonValue(); }
  finally { await result.dispose(); }
}
async function hostByte(offset, value) {
  const {gui} = await h.inspect();
  await h.page().waitForFunction(({address,offset,value}) =>
    atob(window.np2debug.np2.readMemoryBase64(address+offset,1).base64).charCodeAt(0)===value,
    {address:gui.address,offset,value}, {timeout:15000});
}
async function toggleMute() {
  await h.page().getByRole('button',{name:/^(More|その他)$/}).click();
  const menu=h.page().locator('.toolbar-overflow-menu');
  await menu.getByText(/^(Sound|サウンド)$/).click();
  await menu.getByText(/^(Mute|ミュート)$/).click();
}
async function toastColor(success) {
  const {gui} = await h.inspect();
  // PEGC approximates the theme palette. Both devices preserve the dominant hue.
  const result = await h.page().waitForFunction(({x,y,success}) => {
    const c = document.createElement('canvas');
    c.width=c.height=1;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(document.querySelector('#canvas'),x,y,1,1,0,0,1,1);
    const [r,g,b]=ctx.getImageData(0,0,1,1).data;
    return success?g>r&&g>b&&g>=64:r>2*g&&r>2*b&&r>=96;
  }, {x:(gui.width-512)/2+3,y:gui.height-58,success}, {timeout:25000});
  await result.dispose();
}
async function choose(name) {
  let s=await has(0,412);
  for(let i=0;i<8;i++){
    const draws=s.canvases[0].draws, o=h.origin(s,0);
    const row=draws.find(d=>d.y>=66&&d.text.startsWith(name+' '));
    if(row){await h.click(o.x+24,o.y+70+row.y+7);return;}
    const first=draws.find(d=>d.y===66&&d.x===12)?.text;
    const down=draws.find(d=>d.text==='v');
    assert.ok(down,name+' is reachable by scrolling');
    await h.click(o.x+8+down.x+4,o.y+70+down.y+7);
    s=await h.until(t=>t.canvases[0]?.draws.some(d=>d.y===66&&d.x===12&&d.text!==first),'scroll to '+name);
  }
  throw Error('Missing Work file '+name);
}
async function copyTo(name) {
  await h.control(0,404);
  const s = await has(0,410);
  await h.input(0,40,(s.canvases[0].height-152)/2+48,name);
  // Let the verifier observe the progress frame before it dismisses it.
  await h.key('ENTER');
}

try {
  const original=await readFile(new URL('../public/kgui32/'+h.manifest.standalone_hdd.image,import.meta.url));
  const old=Buffer.alloc(24);
  old.write('KFP1',0);old.writeUInt32LE(2,4);
  const large=Buffer.alloc(896*1024,0x5a),seed=Buffer.from('note');
  let fixture=withHddFile(original,'KGUIPREF.DAT',old);
  fixture=withHddFile(fixture,'LARGE.BIN',large);
  fixture=withHddFile(fixture,'NOTE.TXT',seed);

  let vector=await h.bootHdd(fixture);
  const browserBootMs=await h.page().evaluate(()=>Math.round(window.performance.now()));
  const first=await h.inspect(), startup=await meter(first.gui);
  assert.equal(startup.hz,307200);
  assert(startup.startup>0 && startup.paintMax>0 && startup.pixelsTotal>=first.gui.width*first.gui.height);
  const wall=await crop(first.gui.width-32,first.gui.height-40,12,3);
  const date=await crop(96,16,80,15);

  await hostByte(252,101);
  const volume=await crop(208,18,65,13);
  await toggleMute();
  await hostByte(252,1);
  await crop(208,18,65,13,volume);
  await toggleMute();
  await hostByte(252,101);
  h.pass('The native status follows the webnp2 mute toggle');

  await launch('settings','KGSET.EXE');
  await h.control(0,522);
  await tapControl(529);
  await retained(0,'Wallpaper: Gradient');
  for(const [code,label] of [
    [530,'Wallpaper: Solid'],[530,'Wallpaper: Grid'],[531,'Keyboard: US'],
    [532,'Mouse: Slow'],[532,'Mouse: Fast'],[533,'Date: YYYY/MM/DD'],[533,'Date: DD/MM/YYYY'],
    [534,'Time: 12-hour'],[535,'Start: Files'],[535,'Start: Editor'],[535,'Start: Clock'],
  ]){
    await tapControl(code);
    await retained(0,label);
  }
  await tapControl(526);
  await crop(first.gui.width-32,first.gui.height-40,12,3,wall);
  await crop(96,16,80,15,date);
  await h.page().setViewportSize({width:844,height:390});
  await tapControl(536);
  await retained(0,'Desktop preferences');
  await tapControl(527);
  await tapControl(519);await gone(0);
  await hostByte(253,0);
  let gui=await h.guiUntil(a=>a.frames,'relative mouse ready');
  const previous=gui.app.mx,direction=previous+18<gui.width?1:-1;
  await h.page().evaluate(dx=>window.Module.ccall('webnp2_mouse_move',null,['number','number'],[dx,0]),9*direction);
  await h.guiUntil(a=>a.mx===previous+18*direction,'2x relative mouse movement');
  await h.page().evaluate(()=>window.np2debug.np2.mouseHome());
  h.pass('Legacy preferences load, new wallpaper applies, and landscape taps still work at 2x relative speed');

  await launch('editor','KGEDIT.EXE');
  await h.open(0,'NOTE.TXT');
  await h.key('HELP');
  const beforeText=await h.until(s=>s.canvases[0]?.draws.some(d=>d.text==='note'),'document rendered before input');
  const line=beforeText.canvases[0].draws.find(d=>d.text==='note'), origin=h.origin(beforeText,0);
  const textX=origin.x+8+line.x+32,textY=origin.y+70+line.y;
  const beforeInput=await meter(first.gui);
  await h.page().evaluate(() => window.Module.ccall('webnp2_key',null,['number','number'],[0x70,1]));
  await h.page().waitForTimeout(180);
  const editorInputMs=await h.page().evaluate(async ({textX,textY}) => {
    const source=document.querySelector('#canvas'), sample=document.createElement('canvas');
    sample.width=16;sample.height=16;
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    const ink=()=>{
      ctx.drawImage(source,textX,textY,16,16,0,0,16,16);
      return ctx.getImageData(0,0,16,16).data;
    };
    const before=ink();
    const key=(scan,down)=>window.Module.ccall('webnp2_key',null,['number','number'],[scan,down]);
    const started=performance.now();
    key(0x02,1);
    const released=new Promise(resolve=>setTimeout(()=>{key(0x02,0);key(0x70,0);resolve();},35));
    try {
      while(performance.now()-started<20000){
        await new Promise(resolve=>requestAnimationFrame(resolve));
        if(ink().some((byte,i)=>byte!==before[i]))return Math.round(performance.now()-started);
      }
      throw Error('The Editor did not present the translated character');
    } finally {await released;}
  },{textX,textY});
  await h.until(s => s.editors[0]?.hash===fnv('note@')&&s.canvases[0]?.texts.includes('note@'),
                'US keyboard produces @ for Shift+2');
  await h.save(0,Buffer.from('note@'));
  await toastColor(true);
  const away=await crop(148,0,32,15);
  await h.key('F4');
  await h.until(s=>s.imes[0]?.scheme===1,'Editor IME active');
  const romaji=await crop(148,0,32,15,away);
  await h.type('k');
  await crop(148,0,32,15,romaji);
  await h.key('ESC');
  h.pass('Editor save notice and focused native IME mode and composition');

  await launch('editor','KGEDIT.EXE',1);
  await h.guiUntil(a=>a.active===3,'second editor active');
  gui=await h.guiUntil(a=>a.frames,'group button rendered');
  await h.click(330,gui.height-16);
  await h.guiUntil(a=>a.active===2,'first grouped editor');
  await h.click(330,gui.height-16);
  await h.guiUntil(a=>a.active===3,'second grouped editor');
  await h.chord('GRPH','TAB');
  await h.guiUntil(a=>a.active===2,'Alt+Tab selects individual window');
  await h.end(0);
  await h.end(1);
  h.pass('One taskbar button switches both Editor windows');

  const finalPerf=await meter(first.gui);
  assert(finalPerf.frames>startup.frames && finalPerf.inputCount>beforeInput.inputCount);
  assert(finalPerf.paintMax>=finalPerf.paintLast && finalPerf.inputMax>=finalPerf.inputLast && finalPerf.inputMax>0);

  await launch('files','KGFILES.EXE');
  await h.control(0,104);await h.control(0,106);
  await choose('LARGE.BIN');
  await copyTo('ABORT.BIN');
  await retained(0,'Copying file');
  await h.control(0,411);
  await retained(0,'Copy cancelled');
  await choose('NOTE.TXT');
  await copyTo('COPY.TXT');
  await retained(0,'Copied');
  await choose('NOTE.TXT');
  await copyTo('COPY.TXT');
  await toastColor(false);
  await h.exit(vector);
  const saved=await h.disk('hdd'), fat=assertHddProtected(fixture,saved);
  assert.deepEqual(fat.files.get('WORK/LARGE.BIN'),large);
  assert(!fat.entries.has('WORK/ABORT.BIN') && !fat.entries.has('WORK/ABORT.TMP'));
  assert.equal(fat.files.get('WORK/NOTE.TXT').toString(),'note@');
  assert.equal(fat.files.get('WORK/COPY.TXT').toString(),'note@');
  const pref=fat.files.get('WORK/KGUIPREF.DAT');
  assert.equal(pref.length,48);
  assert.deepEqual(Array.from({length:7},(_,i)=>pref.readUInt32LE(i?20+i*4:4)),[3,2,1,2,2,1,3]);
  h.pass('Copy progress cancels safely, successful copy publishes, and failure preserves the target');
  await h.closeContext();

  vector=await h.bootHdd(saved);
  await owned(0,'KGCLOCK.EXE');
  await h.until(s=>s.cpu.diagnostics[0].pm32?.samples?.[13]===1,'autostart Clock uses saved 12-hour format');
  await h.exit(vector);
  await h.unchangedFd();
  h.pass('The chosen application opens on the next HDD boot');
  await writeFile(join(output,'performance.json'),JSON.stringify({video,browserBootMs,editorInputMs,startup,finalPerf},null,2)+'\n');
  await h.finish();
} catch (error) {
  await h.fail(error);
  throw error;
} finally {
  await h.close();
}
