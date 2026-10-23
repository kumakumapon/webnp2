// Guest shell/process tests against the real NP2kai CPU. Host code only supplies
// keys, prepares an isolated DOS fixture and reads actual memory/disk/framebuffer.
import assert from 'node:assert/strict';
import { inspectK386 } from './k386-inspect.mjs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [base='http://127.0.0.1:4173/webnp2/',output='test-results/k386-shell']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/k386/manifest.json',import.meta.url),'utf8'));
assert.equal(manifest.enabled,true,'Generate the pinned experimental image first');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',
  args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const page=await browser.newPage(),results=[],snapshots=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const pause=ms=>page.waitForTimeout(ms);
const text=()=>page.evaluate(()=>window.np2debug.np2.getScreenText().text);
const wait=needle=>page.waitForFunction(needle=>{try{return window.np2debug.np2.getScreenText().text.includes(needle);}catch{return false;}},needle,{timeout:60000});
const key=async value=>{await page.evaluate(v=>window.np2debug.np2.sendKeys(v),value);await pause(200);};
const type=async value=>{await page.evaluate(v=>window.np2debug.np2.typeText(v),value);await pause(200);};
const focus=id=>key(id?'CTRL+O':'CTRL+N');
const memory=async(at,n)=>Buffer.from(await page.evaluate(({at,n})=>window.np2debug.np2.readMemoryBase64(at,n).base64,{at,n}),'base64');
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
const file=async name=>Buffer.from(await page.evaluate(async name=>Array.from(await window.np2debug.np2.diskReadFile('fd1',name)),name));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshot=async()=>(await inspectK386(page))?.views.map(v=>({...v,exitCode:v.exit}));
const rows=view=>Array.from({length:25},(_,i)=>view.screen.slice(i*80,i*80+80).trim());
const shell=view=>view.state===2&&/^A:\\[^>]*>$/.test(rows(view).filter(Boolean).at(-1)??'');
const line=(view,needle)=>rows(view).includes(needle);
const until=async(predicate,label)=>{
  let views;
  for(let i=0;i<300;i++){
    views=await snapshot();if(views&&predicate(views))return views;await pause(200);
  }
  throw new Error(`${label}: ${JSON.stringify(views?.map(({screen,...v})=>({...v,lines:rows({screen}).filter(Boolean)})))}`);
};
const done=message=>{results.push(message);console.log('PASS '+message);};
const command=async(id,value,expected)=>{
  await focus(id);await type(value+'\r');
  return until(v=>shell(v[id])&&(typeof expected==='function'?expected(v[id]):line(v[id],expected)),value);
};
const replace=async(id,value)=>{await focus(id);await key('CTRL+L');await type(value+'\r');};
const visibleText=(id,row=0)=>page.waitForFunction(({id,row})=>{
  const source=document.querySelector('#canvas'),c=document.createElement('canvas');c.width=640;c.height=400;
  const g=c.getContext('2d');g.drawImage(source,0,0);
  const pixels=g.getImageData(id?272:32,(id?128:80)+row*16,216,16).data;let ink=0;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i]<100&&pixels[i+1]<100&&pixels[i+2]<100)ink++;
  return ink>50;
},{id,row},{timeout:60000});

try{
  await mkdir(output,{recursive:true});
  await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=16&clk=8&worklet=0`,base).href);
  await wait('Ready');assert.equal(hash(await disk()),manifest.sha256);
  // Prepare a directory through real DOS, on this browser's disposable disk.
  // The distributed image itself remains immutable; VM operations are compared
  // against the prepared image, including all FAT/directory/file bytes.
  await key('F10');await wait('KDESK exited.');await type('MD K386DIR\r');
  await page.waitForFunction(async()=>{try{await window.np2debug.np2.diskListFiles('fd1','K386DIR');return true;}catch{return false;}},null,{timeout:60000});
  await type('ECHO PRIVATE DIRECTORY > K386DIR\\INFO.TXT\r');
  await page.waitForFunction(async()=>{try{return new TextDecoder().decode(await window.np2debug.np2.diskReadFile('fd1','K386DIR/INFO.TXT')).trim()==='PRIVATE DIRECTORY';}catch{return false;}},null,{timeout:60000});
  const preparedHash=hash(await disk());assert.notEqual(preparedHash,manifest.sha256);
  await type('KDESK\r');await wait('Ready');
  await focus(0);let views=await until(v=>shell(v[0])&&v[0].screen.includes('K386 DOS shell'),'Initial DOS 1 shell');
  assert.ok(!views[0].screen.includes('\0'));assert.ok(!views[0].screen.includes('????????'));
  await wait('K386 DOS shell');await visibleText(0);await page.screenshot({path:join(output,'initial-prompt.png')});
  await focus(1);views=await until(v=>shell(v[1])&&v[1].screen.includes('K386 DOS shell'),'Initial DOS 2 shell');
  assert.ok(!views[1].screen.includes('\0'));assert.ok(!views[1].screen.includes('????????'));
  assert.notEqual(views[0].physical,views[1].physical);assert.notEqual(views[0].cr3,views[1].cr3);
  snapshots.push({stage:'independent-prompts',views});
  done('both fresh windows have guest KSH prompts without NUL/question-mark cells');

  await command(0,'VER','MS-DOS 4.00 / K386 guest shell');
  await command(0,'ECHO '+'K'.repeat(121),v=>rows(v).includes('K'.repeat(41)));
  await command(0,'ECHO FIRST ONLY','FIRST ONLY');
  views=await command(1,'ECHO SECOND ONLY','SECOND ONLY');assert.ok(!views[0].screen.includes('SECOND ONLY'));
  await command(0,'CD K386DIR',v=>rows(v).includes('A:\\K386DIR>'));
  await command(0,'TYPE INFO.TXT','PRIVATE DIRECTORY');
  await command(1,'TYPE KDATA.TXT','READ ONLY DATA');
  await command(0,'DIR *.TXT',v=>rows(v).some(s=>/^INFO\.TXT\s+\d+$/.test(s)));
  views=await snapshot();assert.ok(rows(views[1]).filter(Boolean).at(-1)==='A:\\>');
  await command(0,'CD \\',v=>rows(v).filter(Boolean).at(-1)==='A:\\>');
  done('VER/ECHO/TYPE/DIR/CD execute in the guest with independent input and current directories');

  await command(0,'MZTEST HELLO','MZ RELOCATION PASS HELLO');
  await command(0,'FLAGS','V86 FLAGS AND IRET PASS');
  await command(0,'P98TEST','DOS4 EXEC OK');
  await command(0,'KFILE','READ ONLY FILE PASS');
  await command(0,'FAULT','Program returned: 14');
  await command(0,'ECHO AFTER CHILD FAULT','AFTER CHILD FAULT');
  done('COM/MZ EXEC, relocated code/stack, command tails, virtual flags/IRET and child-fault return to the same shell');

  await focus(0);await type('KEYCHK\r');
  await until(v=>v[0].state===1&&v[0].screen.includes('PC98 KEY PEEK WAIT'),'PC-98 BIOS peek loop');
  await type('X');await until(v=>shell(v[0])&&line(v[0],'PC98 KEY PEEK PASS'),'Non-consuming BH keyboard status');
  await focus(0);await type('DTA C\r');await until(v=>v[0].state===2&&rows(v[0]).some(s=>/^DTA FIRST: .*\.COM$/.test(s)),'COM search suspended');
  await focus(1);await type('DTA E\r');await until(v=>v[1].state===2&&rows(v[1]).some(s=>/^DTA FIRST: .*\.EXE$/.test(s)),'EXE search suspended');
  await until(v=>v.every(s=>s.state===2&&line(s,'DTA RESERVED GUARD PASS')),'Both reserved-state rejection checks complete');
  await focus(0);await type('Z');await until(v=>shell(v[0])&&line(v[0],'DTA PRIVATE SEARCH PASS')&&rows(v[0]).some(s=>/^DTA NEXT: .*\.COM$/.test(s)),'COM search state retained');
  await focus(1);await type('Z');await until(v=>shell(v[1])&&line(v[1],'DTA PRIVATE SEARCH PASS')&&rows(v[1]).some(s=>/^DTA NEXT: .*\.EXE$/.test(s)),'EXE search state retained');
  done('PC-98 BIOS peek preserves input; interleaved searches retain private DTAs and reject modified drive/network/cluster state');

  await focus(0);await type('COUNTER\r');await focus(1);await type('COUNTER\r');
  const children=await until(v=>v.every(s=>s.state===1&&s.counter>0&&s.screen.includes('V86 COUNTER:')),'Both child counters started');
  assert.ok(children.every(s=>s.eflags&0x20000));
  await key('F4');await type('GUI WHILE TWO SHELL CHILDREN RUN');await wait('GUI WHILE TWO');
  views=await until(v=>v.every((s,i)=>s.counter>children[i].counter),'Background children with Memo active');
  snapshots.push({stage:'two-background-children',views});
  await focus(0);await type('q');await until(v=>shell(v[0]),'First parent resumes');
  const before=(await snapshot())[1].counter;
  views=await command(0,'ECHO PARENT RESTORED','PARENT RESTORED');
  await until(v=>v[1].counter>before,'Other child continues during interactive shell use');
  done('both inactive child programs continue; one returns to its saved parent while the other keeps running');

  const running=(await snapshot())[1];await replace(1,'BADMZ.EXE');await wait('Cannot load program');
  views=await until(v=>v[1].counter>running.counter,'Malformed relocation leaves the current child alive');
  assert.equal(views[1].physical,running.physical);await key('ESC');
  await replace(1,'MZTEST.EXE DIRECT');views=await until(v=>v[1].state===0&&line(v[1],'MZ RELOCATION PASS DIRECT'),'Direct MZ load');
  assert.equal(views[1].exitCode,0);
  const raw=await file('MZTEST.EXE'),header=raw.readUInt16LE(8)*16,module=Buffer.from(raw.subarray(header));
  for(let i=0;i<raw.readUInt16LE(6);i++){
    const at=raw.readUInt16LE(24)+i*4,target=raw.readUInt16LE(at)+16*raw.readUInt16LE(at+2);
    module.writeUInt16LE((module.readUInt16LE(target)+0x8010)&0xffff,target);
  }
  const diagnostic=(await inspectK386(page)).diagnostics[1];
  assert.deepEqual(Buffer.from(diagnostic.memory.slice(256,256+module.length)),module);
  assert.deepEqual(Buffer.from(diagnostic.memory.slice(0x80,0x89)),Buffer.from([7,...Buffer.from(' DIRECT'),13]));
  snapshots.push({stage:'relocated-physical-image',views});
  done('bad MZ is rejected before replacing live RAM; actual loaded bytes, relocations and PSP arguments match');

  await replace(1,'KSH.EXE');await until(v=>shell(v[1])&&v[1].screen.includes('K386 DOS shell'),'Restart second shell');
  await command(1,'ECHO RESTARTED','RESTARTED');
  // Text VRAM labels precede the graphical copy. Wait for the new bottom
  // prompt row, rather than the unchanged shell banner, before taking a shot.
  await wait('RESTARTED');await visibleText(1,4);await page.screenshot({path:join(output,'independent-shells.png')});
  await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');
  await type('CD\r');await page.waitForFunction(()=>window.np2debug.np2.getScreenText().lines.some(s=>s.trim()==='A:\\'),null,{timeout:60000});
  assert.equal(hash(await disk()),preparedHash,'VM services leave every FAT/directory/file byte unchanged');
  assert.equal((await file('K386DIR/INFO.TXT')).toString().trim(),'PRIVATE DIRECTORY');
  const distributed=await page.evaluate(async image=>Array.from(new Uint8Array(await (await fetch('./k386/'+image)).arrayBuffer())),manifest.image);
  assert.equal(hash(Buffer.from(distributed)),manifest.sha256);
  assert.deepEqual(errors,[]);
  done('session shutdown restores host DOS; prepared disk and distributed image hashes remain unchanged');
  await writeFile(join(output,'verification.json'),JSON.stringify({browser:browser.version(),source:manifest.source_commit,
    image_sha256:manifest.sha256,prepared_sha256:preparedHash,results,snapshots},null,2)+'\n');
}catch(error){
  console.error(await text().catch(()=>''));console.error(await snapshot().catch(()=>null));
  await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;
}finally{await browser.close();}
