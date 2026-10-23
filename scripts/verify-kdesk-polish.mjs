// Operate the real native desktop. No host-side window/task emulation.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
import {inspectNativeMZ} from './kdesk-mz-inspect.mjs';

const [base='http://127.0.0.1:4173/webnp2/',output='test-results/kdesk-polish',only]=process.argv.slice(2);
assert.ok(!only||['msdos4','k386'].includes(only));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',
  args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
try{
 for(const profile of only?[only]:['msdos4','k386']){
  const m=JSON.parse(await readFile(new URL(`../public/${profile}/manifest.json`,import.meta.url)));
  const page=await browser.newPage({viewport:{width:1120,height:800}}),errors=[],results=[],snapshots=[];
  page.on('pageerror',error=>errors.push(error.message));
  const pause=ms=>page.waitForTimeout(ms);
  const text=()=>page.evaluate(()=>window.np2debug.np2.getScreenText().text);
  const wait=s=>page.waitForFunction(s=>{try{return window.np2debug.np2.getScreenText().text.includes(s);}catch{return false;}},s,{timeout:90000});
  const key=async k=>{await page.evaluate(k=>window.np2debug.np2.sendKeys(k),k);await pause(180);};
  const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await pause(180);};
  const click=async(x,y)=>{
   // Absolute test targets are implemented by a relative bus mouse. Re-home
   // after long keyboard/paint batches instead of accumulating estimates.
   await page.evaluate(()=>window.np2debug.np2.mouseHome());await pause(300);
   await page.evaluate(({x,y})=>window.np2debug.np2.mouseMoveTo(x,y),{x,y});await pause(200);
   await page.evaluate(()=>window.np2debug.np2.mouseClick());await pause(200);
  };
  const title=(name,row,col)=>page.waitForFunction(({name,row,col})=>
   window.np2debug.np2.getScreenText().lines[row]?.indexOf(name)===col,{name,row,col},{timeout:60000});
  const pixels=async(x,y,w,h)=>{
   await page.evaluate(()=>window.np2debug.np2.mouseMoveTo(630,365));await pause(500);
   return page.evaluate(({x,y,w,h})=>{
    const c=document.createElement('canvas');c.width=640;c.height=400;
    const g=c.getContext('2d');g.drawImage(document.querySelector('#canvas'),0,0);
    return Array.from(g.getImageData(x,y,w,h).data);
   },{x,y,w,h});
  };
  const command=async(query,mouse=false)=>{
   await key('CTRL+K');await wait('Find apps');await type(query);
   await page.waitForFunction(query=>{
    const l=window.np2debug.np2.getScreenText().lines;
    return l[5]?.trim().replace(/_$/, '')===query&&l[20]?.trim().startsWith('1 results -');
   },query,{timeout:60000});
   if(mouse)await click(240,124);else await key('ENTER');
   // Wait for the completed guest composition, not a stale title beneath
   // the modal panel. Its footer used to match '1 results' inside '21 results'.
   await page.waitForFunction(()=>{
    const l=window.np2debug.np2.getScreenText().lines;
    return !l[3]?.includes('Find apps')&&/App search closed|Window tiled|Window maximized|Window restored|No active window/.test(l[23]??'');
   },null,{timeout:60000});
  };
  const until=async(predicate,label)=>{
   for(let i=0;i<300;i++){
    const cpu=await inspectK386(page),resources=await inspectResources(page);
    if(cpu&&resources&&predicate({cpu,resources}))return {cpu,resources};await pause(150);
   }throw new Error(label);
  };
  const screenshot=async name=>{await pause(600);await page.screenshot({path:join(output,profile+'-'+name+'.png')});};
  const pass=async label=>{
   results.push(label);console.log('PASS '+profile+': '+label);
   await writeFile(join(output,profile+'.json'),JSON.stringify({results,snapshots,image:m.image,sha256:m.sha256,errors},null,2)+'\n');
  };
  try{
   await page.goto(new URL(`?fd1=./${profile}/${m.image}&run=1&mem=16&clk=8&worklet=0`,base).href);
   await wait('Ready');await title('Launcher',3,5);snapshots.push({stage:'native-mz',...await inspectNativeMZ(page,profile==='k386')});
   await screenshot('desktop');
   const original=await pixels(24,32,389,261);
   // Find button is in the guest launcher, not an HTML control.
   await click(232,264);await wait('Find apps');await screenshot('search');
   await type('MaTH');await wait('Calculator');await wait('1 results');
   await key('CTRL+A');await type('zz no such app');await wait('No matching apps');
   await key('ENTER');await wait('No matching apps');
   await key('CTRL+A');await type('z'.repeat(40));await wait('No matching apps');
   assert.equal(await page.evaluate(()=>window.np2debug.np2.getScreenText().lines[5].split('z').length-1),31);
   await key('CTRL+U');await wait(profile==='k386'?'21 results':'19 results');
   await key('ROLLDOWN');await page.waitForFunction(()=>window.np2debug.np2.getScreenText().lines[7]?.includes('Image viewer'));
   await key('HOME');
   await page.waitForFunction(()=>window.np2debug.np2.getScreenText().lines[7]?.includes('File manager'));
   await click(512,328); // Click after HOME has actually reached the guest.
   await page.waitForFunction(()=>window.np2debug.np2.getScreenText().lines[7]?.includes('Image viewer'));
   await click(620,350);await wait('App search closed');await title('Launcher',3,5);
   assert.deepEqual(await pixels(24,32,389,261),original,'Panel cancellation restores the composed window pixels');
   await page.keyboard.press('Control+k');await wait('Find apps');
   await page.keyboard.press('Escape');await wait('App search closed');
   await command('cAlC');await wait('Value: 0');await type('6*7=');await wait('Value: 42');
   await command('clock',true);await wait('12-hour');
   await pass('native mouse/keyboard search, aliases, query selection, empty results, pagination, cancellation and real app launch');

   await key('F8');await wait('Window minimized'); // Leave Clock deliberately minimized.
   const clockUnderline=async()=>{
    const line=await (await page.waitForFunction(()=>{
     const line=window.np2debug.np2.getScreenText().lines[24];return line?.includes('Clock')?line:false;
    },null,{timeout:60000})).jsonValue();
    const col=line.indexOf('Clock');assert.ok(col>=0);
    return pixels((col+1)*8,397,1,1);
   };
   const hiddenClock=await clockUnderline();
   await key('F4');await type('KEEP MY WORK');await wait('KEEP MY WORK');
   await page.keyboard.press('Control+d');await wait('Desktop shown');
   assert.ok(!(await text()).includes('KEEP MY WORK'));
   await command('tile left');await wait('No active window');
   await click(24,392);await wait('Desktop windows restored');await type('!');await wait('KEEP MY WORK!');
   assert.deepEqual(await clockUnderline(),hiddenClock,'Already minimized Clock stays minimized');
   await command('calc');await wait('Value: 42');
   await key('F4');await key('CTRL+D');await wait('Desktop shown');await key('CTRL+D');await wait('Desktop windows restored');
   await type('?');await wait('KEEP MY WORK!?');
   await pass('Desk/Ctrl+D retains unsaved text, calculator state, input focus and the pre-existing minimized set');

   // Keep a non-cell-aligned normal rectangle through several layout changes.
   await page.evaluate(()=>window.np2debug.np2.mouseDrag({x:112,y:88},{x:125,y:97}));
   await title('Memo',5,14);const normal=await pixels(96,64,400,270);
   await command('window left');await title('Memo',2,2);
   await command('window right');await title('Memo',2,42);
   await command('maximize window');await title('Memo',2,2);
   await command('restore window');await title('Memo',5,14);
   assert.deepEqual(await pixels(96,64,400,270),normal,'Multiple placements preserve the original pixel geometry and contents');
   await pass('left/right/maximize/restore keeps the original odd-pixel rectangle and live contents');

   if(profile==='k386'){
    await key('CTRL+N');await wait('K386 DOS shell');
    const shell=await until(r=>r.cpu.views[0].state===2&&r.cpu.views[0].screen.includes('A:\\>'),'KSH waits');
    await key('CTRL+K');await type('zz do not forward\r');await wait('No matching apps');await key('ESC');
    const afterShell=await until(r=>r.cpu.views[0].state===2,'KSH still waits');
    assert.equal(afterShell.cpu.views[0].screen,shell.cpu.views[0].screen);
    assert.equal(afterShell.cpu.views[0].keys,0);snapshots.push({stage:'modal-input',before:shell,after:afterShell});
    await command('dos 2');await wait('K386 DOS shell');
    await key('CTRL+N');await type('COUNTER\r');await key('CTRL+O');await type('COUNTER\r');
    const before=await until(r=>r.resources.usage.every(u=>u.program==='COUNTER.COM'&&u.depth===2)&&
      r.cpu.views.every(v=>v.state===1&&v.counter>0&&v.screen.includes('V86 COUNTER')),'Both child counters run');
    snapshots.push({stage:'before-background',...before});
    await key('CTRL+D');await wait('Desktop shown');
    await command('math');await type('c9*9=');await wait('Value: 81');
    const hidden=await until(r=>r.cpu.views.every((v,i)=>v.counter>before.cpu.views[i].counter),'Both hidden DOS programs continue');
    await key('CTRL+D');await wait('Desktop windows restored');
    await key('CTRL+N');await command('tile left');await title('DOS 1',2,2);
    await key('CTRL+O');await command('tile right');await title('DOS 2',2,42);
    const after=await until(r=>r.cpu.views.every((v,i)=>v.counter>hidden.cpu.views[i].counter),'Both tiled DOS programs continue');
    for(let i=0;i<2;i++){
     assert.equal(after.cpu.views[i].physical,before.cpu.views[i].physical);
     assert.equal(after.cpu.views[i].cr3,before.cpu.views[i].cr3);
     assert.equal(after.resources.usage[i].generation,before.resources.usage[i].generation);
     assert.deepEqual(after.cpu.diagnostics[i].memory.slice(0,256),before.cpu.diagnostics[i].memory.slice(0,256));
    }
    snapshots.push({stage:'hidden',...hidden},{stage:'after-tiling',...after});
    await screenshot('dos-tiles');
    await pass('modal input never reaches KSH; two hidden/tiled real DOS CPUs continue with retained RAM, CR3, IDs and PSP bytes');
   }
   await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');
   const disk=await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'));
   assert.equal(createHash('sha256').update(Buffer.from(disk.base64,'base64')).digest('hex'),m.sha256);
   assert.deepEqual(errors,[]);await pass('clean shutdown and byte-identical exported FAT12 disk');
  }catch(error){
   await writeFile(join(output,profile+'-failure.txt'),error.stack+'\n'+await text().catch(()=>''));
   await page.screenshot({path:join(output,profile+'-failure.png')}).catch(()=>{});throw error;
  }finally{await page.close();}
 }
}finally{await browser.close();}
