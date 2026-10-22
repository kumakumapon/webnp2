// Real PC-98 guest validation; host code only supplies input and inspects state.
import assert from 'node:assert/strict';
import { clickTask } from './verify-window.mjs';
import { inspectK386 } from './k386-inspect.mjs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [base='http://127.0.0.1:4173/webnp2/', output='test-results/k386'] = process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/k386/manifest.json',import.meta.url),'utf8'));
assert.equal(manifest.enabled,true,'Generate the experimental image before this test');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',
  args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const page=await browser.newPage();
const results=[],snapshots=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const pause=ms=>page.waitForTimeout(ms);
const text=()=>page.evaluate(()=>window.np2debug.np2.getScreenText().text);
const wait=needle=>page.waitForFunction(needle=>{
  try{return window.np2debug?.np2?.getScreenText().text.includes(needle);}catch{return false;}
},needle,{timeout:60000});
const prompt=()=>page.waitForFunction(()=>{
  try{return window.np2debug.np2.getScreenText().lines.some(line=>line.trim()==='A>');}catch{return false;}
},null,{timeout:60000});
const key=async value=>{await page.evaluate(v=>window.np2debug.np2.sendKeys(v),value);await pause(200);};
const type=async value=>{await page.evaluate(v=>window.np2debug.np2.typeText(v),value);await pause(200);};
const disk=async()=>Buffer.from(await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))
  .then(result=>result.base64),'base64');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshot=async()=>(await inspectK386(page))?.views;
const until=async(predicate,label)=>{
  let states;
  for(let i=0;i<200;i++){
    states=await snapshot();if(states&&predicate(states))return states;await pause(200);
  }
  throw new Error(`${label}: ${JSON.stringify(states?.map(({screen,...state})=>state))}`);
};
const run=async(id,name)=>{
  await key(id?'CTRL+O':'CTRL+N');await key('CTRL+L');await type(name+'\r');
};
try{
  await mkdir(output,{recursive:true});
  await page.goto(new URL('?lang=en',base).href);
  await page.waitForSelector('.start-btn-k386');
  assert.equal(await page.locator('.start-btn-k386').innerText(),'Start KDESK/386 (experimental)');
  assert.equal(new URL(await page.locator('.start-btn-k386').getAttribute('href'),base).searchParams.get('lang'),'en');
  await page.goto(new URL('?lang=ja',base).href);
  await page.waitForSelector('.start-btn-k386');
  assert.equal(await page.locator('.start-btn-k386').innerText(),'KDESK/386（実験版）で起動');
  await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=16&clk=8&worklet=0`,base).href);
  await wait('Ready');assert.equal(digest(await disk()),manifest.sha256);
  assert.equal(await page.locator('.start-btn-k386').count(),0);
  await key('F10');await wait('KDESK exited.');await prompt();
  await type('K386CPU\r');await wait('K386 PROBE PASS');await prompt();
  const probe=await page.evaluate(()=>{
    const bytes=atob(window.np2debug.np2.readMemoryBase64(0x10000,0x90000).base64);let at=-1;
    while((at=bytes.indexOf('K386CPU1',at+1))>=0){
      const u32=off=>(bytes.charCodeAt(at+off)|bytes.charCodeAt(at+off+1)<<8|
        bytes.charCodeAt(at+off+2)<<16|bytes.charCodeAt(at+off+3)<<24)>>>0;
      if(u32(20)===1&&u32(60)===1)return {address:0x10000+at,protectedCR0:u32(12),pagingCR0:u32(16),
        ud:u32(20),gp:u32(24),halts:u32(28),privateValues:[u32(32),u32(36)],returns:[u32(40),u32(44)],
        vmFlags:[u32(48),u32(52)],realCR0:u32(56),pageFaults:u32(60),faultAddress:u32(64),error:u32(68)};
    }
    return null;
  });
  assert.ok(probe);assert.equal(probe.protectedCR0&1,1);assert.equal(probe.pagingCR0>>>31,1);
  assert.deepEqual(probe.privateValues,[0x11110001,0x22220001]);assert.deepEqual(probe.returns,[0xabcd,0xabcd]);
  assert.ok(probe.vmFlags.every(flags=>flags&0x20000));assert.equal(probe.gp,4);
  assert.equal(probe.realCR0&1,0);assert.equal(probe.faultAddress,0x400000);assert.equal(probe.error,0);
  results.push('CPU-generated PM/paging/#UD/#PF/V86/#GP records and real-mode return');
  await type('K386TEST\r');await wait('K386 CHECK PASS');await prompt();
  results.push('guest native test driver: timer quanta, dual CR3/RAM, stop/resume, isolated #PF and input');
  await type('KDESK\r');await wait('Ready');
  await run(0,'COUNTER.COM');await run(1,'COUNTER.COM');
  let states=await until(s=>s.every(v=>v.counter>0&&v.ticks>0),'Both native counters start');
  assert.notEqual(states[0].physical,states[1].physical);assert.notEqual(states[0].cr3,states[1].cr3);
  assert.ok(states.every(v=>v.eflags&0x20000));snapshots.push({stage:'dual-running',states});
  let before=states;
  await key('F4');await type('GUI WHILE BOTH RUN');await wait('GUI WHILE BOTH RUN');
  states=await until(s=>s.every((v,i)=>v.counter>before[i].counter),'Both inactive VMs continue with Memo active');
  before=states;
  await key('F2');await key('HOME');await wait('Selected: File manager');
  await key('HELP');await wait('Selected: Clock');await key('LEFT');await wait('Selected: Calculator');
  await key('ENTER');await wait('Value: 0');await type('6*7=');await wait('Value: 42');
  await key('F2');await key('HELP');await wait('Selected: Clock');await key('ENTER');
  await page.waitForFunction(()=>/\b\d{2}:\d{2}:\d{2}\b/.test(window.np2debug.np2.getScreenText().text),null,{timeout:60000});
  const clock=await page.evaluate(()=>window.np2debug.np2.getScreenText().text.match(/\b\d{2}:\d{2}:\d{2}\b/)[0]);
  await page.waitForFunction(clock=>{const t=window.np2debug.np2.getScreenText().text.match(/\b\d{2}:\d{2}:\d{2}\b/);return t&&t[0]!==clock;},clock,{timeout:30000});
  states=await until(s=>s.every((v,i)=>v.counter>before[i].counter),'Both VMs continue with Calculator, Clock and Memo open');
  results.push('Calculator arithmetic, live Clock and Memo coexist with both background V86 contexts');
  await key('CTRL+N');await key('CTRL+P');before=await until(s=>s[0].state===3,'Pause DOS 1');
  states=await until(s=>s[1].counter>before[1].counter,'DOS 2 continues while DOS 1 is stopped');
  assert.equal(states[0].counter,before[0].counter);
  await key('CTRL+O');await key('CTRL+P');states=await until(s=>s[1].state===3,'Pause DOS 2');
  const physical=await page.evaluate(states=>states.map(v=>{
    const np2=window.np2debug.np2;
    const u32=at=>{const b=atob(np2.readMemoryBase64(at,4).base64);
      return (b.charCodeAt(0)|b.charCodeAt(1)<<8|b.charCodeAt(2)<<16|b.charCodeAt(3)<<24)>>>0;};
    return {directory:u32(v.cr3),supervisor:u32(v.cr3+4),low:u32(v.cr3+4096),pte:u32(v.cr3+4096+0x80*4),rom:u32(v.cr3+4096+0xf0*4)};
  }),states);
  const contexts=await inspectK386(page);
  for(let i=0;i<2;i++){
    assert.equal(physical[i].pte&0xfffff000,states[i].physical);
    assert.equal(physical[i].low&0xfffff000,states[i].physical-states[i].psp*16);
    assert.equal(physical[i].directory&7,7);assert.equal(physical[i].supervisor&7,3);assert.equal(physical[i].rom&7,5);
    const cpu=contexts.diagnostics[i];assert.equal(cpu.frame.cs,states[i].psp);assert.equal(cpu.frame.ss,states[i].psp);
    assert.ok(cpu.frame.eflags&0x20000);assert.equal(cpu.memory[0],0xcd);assert.equal(cpu.memory[1],0x20);
    const code=await page.evaluate(async()=>Array.from(await window.np2debug.np2.diskReadFile('fd1','COUNTER.COM')));
    assert.deepEqual(cpu.memory.slice(256,256+code.length),code);
  }
  snapshots.push({stage:'stopped-physical-check',states,physical,contexts});
  await key('CTRL+N');await key('CTRL+R');await key('CTRL+O');await key('CTRL+R');
  await until(s=>s.every((v,i)=>v.counter>states[i].counter),'Resume both VMs');
  results.push('actual V86 flags, separate physical PTEs/registers/screens; background progress and independent stop/resume');

  // Window operations retain running guest state. Mouse API drives the PC-98 bus mouse.
  await page.evaluate(()=>window.np2debug.np2.mouseHome());await pause(500);
  await page.evaluate(()=>window.np2debug.np2.mouseDrag({x:300,y:102},{x:324,y:118}));
  await key('F7');await key('LEFT');await key('UP');await key('ENTER');
  await key('F8');await wait('Window minimized');
  await clickTask(page,'DOS 2');
  before=await snapshot();await until(s=>s[1].counter>before[1].counter,'Minimized/restored VM keeps running');
  await run(1,'ECHO.COM');await until(s=>s[1].state===2&&s[1].screen.includes('V86 ECHO'),'Echo waits for input');
  await type('SECOND ONLY');states=await until(s=>s[1].screen.includes('SECOND ONLY'),'Input to DOS 2');
  assert.ok(!states[0].screen.includes('SECOND ONLY'));
  before=states;await key('F2');await until(s=>s[0].counter>before[0].counter,'Counter continues with launcher active');
  results.push('native DOS window move/resize/minimize/restore, retained state, focused input and existing GUI coexistence');

  await run(1,'FAULT.COM');states=await until(s=>s[1].state===4,'Isolated page violation');
  assert.equal(states[1].fault,14);assert.equal(states[1].cr2,0xe0000);
  before=states;await until(s=>s[0].counter>before[0].counter,'Other VM survives the fault');
  await run(1,'PORT.COM');states=await until(s=>s[1].state===4&&s[1].fault===13,'Denied port I/O');
  await run(1,'FPU.COM');states=await until(s=>s[1].state===4&&s[1].fault===7,'Unvirtualized FPU is contained');
  await run(1,'CON.COM');await wait('Cannot load program');
  await key('ESC'); // Cancel the rejected path, leaving the GUI usable.
  await run(1,'DF.COM');await until(s=>s[1].state===0&&s[1].screen.includes('V86 DIRECTION FLAG PASS'),'Empty input at private RAM boundary and guest DF are safe');
  await run(1,'P98TEST.COM');await until(s=>s[1].state===0&&s[1].screen.includes('DOS4 EXEC OK'),'Existing DOS COM binary');
  await run(1,'KFILE.COM');states=await until(s=>s[1].state===0&&s[1].screen.includes('READ ONLY FILE PASS'),'DOS file broker');
  assert.ok(states[1].screen.includes('READ ONLY DATA'));
  const names=await page.evaluate(async()=> (await window.np2debug.np2.diskListFiles('fd1')).entries.map(e=>e.name));
  assert.ok(!names.includes('DENIED.TXT'));
  const data=await page.evaluate(async()=>Array.from(await window.np2debug.np2.diskReadFile('fd1','KDATA.TXT')));
  assert.equal(Buffer.from(data).toString(),'READ ONLY DATA\r\n');
  snapshots.push({stage:'readonly-file-result',states});
  await run(1,'ECHO.COM');await until(s=>s[1].state===2&&s[1].screen.includes('V86 ECHO'),'Restart after faults');
  results.push('hardware #PF and I/O #GP containment; other VM continues; guest read succeeds and writes/create are denied');

  await key('CTRL+T');await wait('Switch');await page.waitForFunction(()=>window.np2debug.np2.getScreenText().lines.some(line=>/^\s+Tasks\s+_\s+[+=]\s+x/.test(line)));await pause(200);
  await page.screenshot({path:join(output,'task-manager.png')});
  await key('CTRL+N');await wait('V86 COUNTER');await key('CTRL+O');await wait('V86 ECHO');await pause(200);
  await page.waitForFunction(()=>{
    const source=document.querySelector('#canvas'),c=document.createElement('canvas');c.width=640;c.height=400;
    const g=c.getContext('2d');g.drawImage(source,0,0);const p=g.getImageData(352,110,1,1).data;
    return p[0]<80&&p[1]>70&&p[1]<160&&p[2]>120;
  },null,{timeout:60000}); // Wait for the foreground DOS 2 title in the actual framebuffer.
  await page.screenshot({path:join(output,'dos-windows.png')});
  await key('ESC');await until(s=>s[1].state===0,'Guest Escape exits Echo');
  await run(1,'ECHO.COM');await until(s=>s[1].state===2,'Restart exited guest');
  await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');await prompt();
  states=await snapshot();assert.ok(states.every(v=>v.state===0));
  assert.equal(digest(await disk()),manifest.sha256,'Entire FAT12 image is byte-identical after all read-only VM operations');
  results.push('session exit/restart and GUI shutdown release sessions; complete exported disk SHA-256 unchanged');
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'verification.json'),JSON.stringify({browser:browser.version(),source:manifest.source_commit,
    image_sha256:manifest.sha256,probe,snapshots,results,limitations:manifest.compatibility},null,2)+'\n');
  console.log('PASS K386 (experimental COM scope):\n'+results.join('\n'));
}catch(error){
  console.error(await text().catch(()=>''));
  console.error((await snapshot().catch(()=>null))?.map(({screen,...state})=>state));
  await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;
}finally{await browser.close();}
