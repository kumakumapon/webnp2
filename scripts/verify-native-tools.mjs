// Exercise the actual guest MZ loaders, native tools and incremental text paint.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/native-tools',video='']=process.argv.slice(2);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const page=await browser.newPage(),results=[],errors=[],snapshots=[];
page.on('pageerror',e=>errors.push(e.message));
const hash=b=>createHash('sha256').update(b).digest('hex');
const pause=ms=>page.waitForTimeout(ms);
const text=()=>page.evaluate(()=>window.np2debug.np2.getScreenText().text);
const wait=s=>page.waitForFunction(s=>{try{return window.np2debug.np2.getScreenText().text.includes(s);}catch{return false;}},s,{timeout:90000});
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await pause(180);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await pause(180);};
const file=async s=>Buffer.from(await page.evaluate(async s=>Array.from(await window.np2debug.np2.diskReadFile('fd1',s)),s));
const until=async(test,label)=>{let cpu,resources;
 for(let i=0;i<500;i++){cpu=await inspectK386(page);resources=await inspectResources(page);if(cpu&&resources&&test({cpu,resources}))return {cpu,resources};await pause(50);}
 throw new Error(label+': '+JSON.stringify({cpu,resources}));};
const prompt=v=>v.state===2&&v.screen.slice(v.row*80,v.row*80+80).trim()==='A:\\>';
const find=async query=>{
 await key('CTRL+K');await wait('Find apps');await type(query);
 await page.waitForFunction(q=>{const l=window.np2debug.np2.getScreenText().lines;return l[5]?.slice(15,64).trim().replace(/_$/,'')===q&&l[20]?.includes('1 results -');},query,{timeout:90000});
 await key('ENTER');
};
const pass=s=>{results.push(s);console.log('PASS '+s);};
try {
 const manifest=await (await fetch(new URL('k386/manifest.json',base))).json();
 await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=16&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);
 await wait('Ready');
 const names=await page.evaluate(async()=> (await window.np2debug.np2.diskListFiles('fd1')).entries.map(f=>f.name));
 for(const stem of ['FD98','EDIT98','EDIT','CPANEL','KVIEW','KPAINT']) {
  assert.ok(!names.includes(stem+'.COM'));
  const exe=await file(stem+'.EXE');assert.equal(exe.toString('ascii',0,2),'MZ');
  assert.equal(exe.toString('ascii',28,36),'K386APP1');assert.equal(exe.readUInt16LE(38),2);
  assert.ok(exe.readUInt16LE(6)>0);assert.ok(exe.readUInt16LE(14)>exe.readUInt16LE(22));
  assert.equal((exe.readUInt16LE(4)-1)*512+(exe.readUInt16LE(2)||512),exe.length);
 }
 assert.deepEqual(await file('EDIT.EXE'),await file('EDIT98.EXE'));
 const protectedFiles=Object.fromEntries(await Promise.all(['IO.SYS','MSDOS.SYS','COMMAND.COM','COLORS.BMP','KDATA.TXT'].map(async n=>[n,hash(await file(n))])));
 pass('six native tool executables have real MZ relocation and separate data/stack segments; COM collisions are absent');
 await key('CTRL+N');await until(r=>prompt(r.cpu.views[0]),'first shell');
 await type('EDIT98\r');await until(r=>prompt(r.cpu.views[0])&&r.cpu.views[0].screen.includes('Desktop application:'),'desktop tool rejected safely');
 const shell=await until(r=>prompt(r.cpu.views[0]),'shell retained');
 await key('CTRL+L');await type('KPAINT.EXE\r');await wait('Cannot load program');await key('ESC');
 const retained=await until(r=>prompt(r.cpu.views[0]),'root loader retained shell');
 assert.equal(retained.resources.usage[0].generation,shell.resources.usage[0].generation);
 assert.equal(retained.cpu.views[0].physical,shell.cpu.views[0].physical);
 await type('COUNTER\r');await until(r=>r.cpu.views[0].screen.includes('V86 COUNTER:')&&r.cpu.views[0].counter>0,'first counter');
 await key('CTRL+O');await until(r=>prompt(r.cpu.views[1]),'second shell');
 await type('COUNTER\r');const running=await until(r=>r.cpu.views.every(v=>v.state===1&&v.screen.includes('V86 COUNTER:')),'two counters');
 const generations=running.resources.usage.map(u=>u.generation);
 pass('native tool kinds are rejected before replacing a V86 child or root; both original shell contexts survive');
 await find('text editor');await wait('[New file]');
 await type('NATIVE MZ SAVE\rPSP AND STACK');await key('F4');await wait('Save as:');
 await type('NEWMZ.TXT\r');await wait('Saved (Shift_JIS / CRLF)');
 assert.equal((await file('NEWMZ.TXT')).toString(),'NATIVE MZ SAVE\r\nPSP AND STACK');
 await key('F10');await wait('Program returned to desktop');
 let resumed=await until(r=>r.cpu.views.every((v,i)=>v.counter>running.cpu.views[i].counter),'counters resume after editing');
 assert.deepEqual(resumed.resources.usage.map(u=>u.generation),generations);
 pass('EDIT98 saves real file contents and returns directly; both V86 sessions retain their identity and continue');
 await find('file manager');await wait('FD Filer 1.0');
 await key('F7');await wait('Create directory:');await type('NATIVE\r');await wait('Directory created');
 await page.waitForFunction(async()=>{try{await window.np2debug.np2.diskListFiles('fd1','NATIVE');return true;}catch{return false;}},null,{timeout:60000});
 await key('F10');await wait('Program returned to desktop');
 await find('system settings');await wait('PC-98 SYSTEM SETTINGS');await type('+s');await wait('Saved. Reboot');
 assert.match((await file('CONFIG.SYS')).toString(),/FILES=50/);
 assert.match((await file('CONFIG.SYS')).toString(),/DEVICE=FDXMS286.SYS/);
 assert.ok(!(await file('CONFIG.SYS')).toString().includes('DEVICE=EMM386'));
 await type('q');await wait('Program returned to desktop');
 pass('FD98 creates a directory and CPANEL saves CONFIG.SYS without losing the enhanced XMS configuration');
 await find('image editor');await wait('KPAINT - Image editor');await key('F3');await wait('Saved BMP');
 const bitmap=await file('DRAW.BMP');assert.equal(bitmap.toString('ascii',0,2),'BM');
 await key('F10');await wait('Program returned to desktop');
 await find('image viewer');await wait('KVIEW - Image viewer');await wait('Opened BMP');
 await key('F10');await wait('Program returned to desktop');
 if(video==='cirrus')await page.waitForFunction(()=>document.querySelector('#canvas').width===800);
 pass('MZ image editor saves a BMP; image viewer opens and returns with the desktop display mode restored');
 resumed=await until(r=>r.cpu.views.every(v=>v.state===1),'sessions restored after all tools');
 assert.deepEqual(resumed.resources.usage.map(u=>u.generation),generations);snapshots.push(resumed);
 // Stop the second counter and return the first to its original shell. Inspect
 // real raster pixels before/after an occluding Memo forces full composition.
 await key('CTRL+O');await key('CTRL+P');await key('CTRL+N');await type('q');await until(r=>prompt(r.cpu.views[0]),'first parent restored');
 for(const command of ['CLS','ECHO FAST ROW ONE','ECHO FAST ROW TWO','ECHO FAST ROW THREE']) {
  const before=await inspectK386(page);await type(command+'\r');
  await until(r=>prompt(r.cpu.views[0])&&r.cpu.diagnostics[0].count>before.diagnostics[0].count+3,command);
 }
 await wait('FAST ROW THREE');await key('CTRL+P');
 await page.evaluate(()=>window.np2debug.np2.mouseMoveTo(610,350));await pause(600);
 const pixels=()=>page.evaluate(()=>{const src=document.querySelector('#canvas'),c=document.createElement('canvas');c.width=src.width;c.height=src.height;const g=c.getContext('2d');g.drawImage(src,0,0);return Array.from(g.getImageData(32,80,320,176).data);});
 const incremental=await pixels();
 await key('F4');await wait('NOTE.TXT');await key('CTRL+N');await wait('FAST ROW THREE');await pause(600);
 assert.deepEqual(await pixels(),incremental,'incremental DOS glyphs match full composition after occlusion');
 await page.screenshot({path:output+'/desktop.png'});
 for(const [name,sha] of Object.entries(protectedFiles))assert.equal(hash(await file(name)),sha,name+' retained');
 assert.deepEqual(errors,[]);
 pass('incremental shell raster matches a complete repaint; existing kernel, COMMAND, image and data files remain intact');
 await writeFile(output+'/verification.json',JSON.stringify({source:manifest.source_commit,image_sha256:manifest.sha256,video:video||'pegc',browser:browser.version(),results,snapshots},null,2)+'\n');
}catch(e){console.error(await text().catch(()=>''));await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw e;}
finally{await browser.close();}
