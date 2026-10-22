// Native GUI interactions in both ordinary DOS and the K386 profile.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
import {clickTask} from './verify-window.mjs';

const [base='http://127.0.0.1:4173/webnp2/',output='test-results/kdesk-interface']=process.argv.slice(2);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',
  args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const results=[];
try{
 await mkdir(output,{recursive:true});
 for(const profile of ['msdos4','k386']){
  const manifest=JSON.parse(await readFile(new URL(`../public/${profile}/manifest.json`,import.meta.url),'utf8'));
  const page=await browser.newPage(),errors=[],snapshots=[];
  page.on('pageerror',error=>errors.push(error.message));
  const pause=ms=>page.waitForTimeout(ms);
  const text=()=>page.evaluate(()=>window.np2debug.np2.getScreenText().text);
  const wait=needle=>page.waitForFunction(needle=>{try{return window.np2debug.np2.getScreenText().text.includes(needle);}catch{return false;}},needle,{timeout:90000});
  const key=async value=>{await page.evaluate(v=>window.np2debug.np2.sendKeys(v),value);await pause(250);};
  const type=async value=>{await page.evaluate(v=>window.np2debug.np2.typeText(v),value);await pause(250);};
  const click=async(x,y,count=1)=>{
   await page.evaluate(({x,y})=>window.np2debug.np2.mouseMoveTo(x,y),{x,y});await pause(200);
   await page.evaluate(count=>window.np2debug.np2.mouseClick({count}),count);await pause(250);
  };
  const title=async(name,row,col)=>{
   await page.waitForFunction(({name,row,col})=>window.np2debug.np2.getScreenText().lines[row]?.indexOf(name)===col,{name,row,col},{timeout:60000});
   await pause(300);
  };
  const pixels=()=>page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=640;c.height=400;
   const g=c.getContext('2d');g.drawImage(document.querySelector('#canvas'),0,0);
   return Array.from(g.getImageData(37,41,384,256).data);
  });
  const until=async predicate=>{
   for(let i=0;i<300;i++){
    const cpu=await inspectK386(page),resources=await inspectResources(page);
    if(cpu&&resources&&predicate({cpu,resources}))return {cpu,resources};await pause(200);
   }throw new Error('K386 progress condition timed out');
  };
  try{
   await page.goto(new URL(`?fd1=./${profile}/${manifest.image}&run=1&mem=16&clk=8&worklet=0`,base).href);
   await wait('Ready');await title('Launcher',3,5);
   await page.evaluate(()=>window.np2debug.np2.mouseHome());await pause(300);
   await page.evaluate(()=>window.np2debug.np2.mouseDrag({x:100,y:52},{x:113,y:61}));
   await title('Launcher',3,6);
   await page.evaluate(()=>window.np2debug.np2.mouseMoveTo(600,350));await pause(300);
   const original=await pixels();
   await key('CTRL+G');await wait('Window maximized');await title('Launcher',2,2);
   await key('CTRL+G');await wait('Window restored');await title('Launcher',3,6);
   assert.deepEqual(await pixels(),original,'Keyboard restore retains the exact composed window pixels after an odd-pixel drag');
   await click(360,65);await wait('Window maximized');await title('Launcher',2,2);
   await click(100,40,2);await wait('Window restored');await title('Launcher',3,6);
   await clickTask(page,'Apps');await wait('Window minimized');
   assert.ok(!(await text()).includes('Launcher'));
   await clickTask(page,'Apps');await title('Launcher',3,6);
   await page.evaluate(()=>window.np2debug.np2.mouseMoveTo(600,350));await pause(300);
   assert.deepEqual(await pixels(),original,'Taskbar restores pixel geometry and contents');
   results.push(`${profile}: keyboard/title button/double-click maximize, exact pixel restore, taskbar minimize/restore`);
   console.log('PASS '+results.at(-1));

   await key('F4');await key('CTRL+A');
   const note='SEGMENT CHECK\r'+'0123456789'.repeat(90);
   await type(note);await key('F3');await wait('Parent');await key('F4');
   await key('CTRL+C');await wait('Copied memo');
   const copied=await page.evaluate(()=>{
    const s=atob(window.np2debug.np2.readMemoryBase64(0x1000,0x9f000).base64);let at=-1;
    while((at=s.indexOf('KDESKCLP',at+1))>=0){
     const w=o=>s.charCodeAt(at+o)|s.charCodeAt(at+o+1)<<8;
     if(w(8)===1&&w(10)===1)return s.slice(at+30,at+30+w(12));
    }return null;
   });
   assert.equal(copied,note.replace('\r','\n'),'Directory refresh preserves the separately allocated memo and clipboard');
   await key('CTRL+X');await key('CTRL+V');await wait('Pasted clipboard');
   await key('ESC');await wait('Unsaved memo:');await key('ESC');await wait('Close cancelled');
   await key('ESC');await type('d');await wait('Memo closed');
   results.push(`${profile}: 914-byte memo survives directory refresh, clipboard round trip and unsaved-close cancellation`);
   console.log('PASS '+results.at(-1));

   if(profile==='k386'){
    // Expose desktop shortcuts, then open real guest sessions using the mouse.
    await key('F3');await key('F8');await key('F2');await key('F8');
    await click(500,80);await wait('K386 DOS shell');await type('COUNTER\r');
    await click(588,80);await title('DOS 2',6,34);await type('COUNTER\r');
    const before=await until(r=>r.cpu.views.every(v=>v.counter>0));snapshots.push({stage:'before',...before});
    await key('CTRL+G');await title('DOS 2',2,2);
    await key('CTRL+N');await key('CTRL+O');await key('CTRL+G');await title('DOS 2',6,34);
    await clickTask(page,'DOS 2');await wait('Window minimized');
    const after=await until(r=>r.cpu.views.every((v,i)=>v.counter>before.cpu.views[i].counter));
    for(let i=0;i<2;i++){
     assert.equal(after.cpu.views[i].physical,before.cpu.views[i].physical);
     assert.equal(after.cpu.views[i].cr3,before.cpu.views[i].cr3);
     assert.equal(after.resources.usage[i].generation,before.resources.usage[i].generation);
    }
    await clickTask(page,'DOS 2');await title('DOS 2',6,34);snapshots.push({stage:'after',...after});
    results.push('k386: desktop mouse launch, two real CPUs continue through maximize/minimize/switch with private RAM/CR3/root IDs retained');
   }

   // Fill the taskbar, including all ten windows on K386. Captions stay separate.
   for(const k of ['F1','F2','F3','F4','F5'])await key(k);
   await key('F2');await key('HOME');for(let i=0;i<7;i++)await key('RIGHT');await key('ENTER');await wait('Value:');
   await key('F2');await key('RIGHT');await key('ENTER');await wait('12-hour');
   await key('CTRL+T');await wait('Switch');await pause(300);
   const labels=['Apps','Files','Memo','Help','About','Calc','Clock','Tasks',...(profile==='k386'?['DOS 1','DOS 2']:[])];
   // A clock can start another buffered composition immediately. Capture one
   // complete guest taskbar atomically, rather than sampling a cleared mirror.
   const bar=await (await page.waitForFunction(labels=>{
    const line=window.np2debug.np2.getScreenText().lines[24];
    return labels.every(label=>line?.includes(label))?line:false;
   },labels,{timeout:60000})).jsonValue();
   for(const label of labels)assert.ok(bar.includes(label),`Taskbar shows ${label}: ${bar}`);
   await clickTask(page,'Memo');await title('Memo',5,13);await type('KDESK 1.8\rA calmer desktop.\rWindows keep their place.');
   await page.evaluate(()=>window.np2debug.np2.mouseMoveTo(630,360));await pause(600);
   await page.screenshot({path:join(output,profile+'-desktop.png')});
   await key('CTRL+T');await pause(600);await page.screenshot({path:join(output,profile+'-tasks.png')});
   await key('F10');await wait('Unsaved memo:');await type('d');await wait('KDESK exited.');
   const disk=await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'));
   assert.equal(createHash('sha256').update(Buffer.from(disk.base64,'base64')).digest('hex'),manifest.sha256);
   assert.deepEqual(errors,[]);
   results.push(`${profile}: compact taskbar reaches every open window; confirmation protects text; exported disk unchanged`);
   await writeFile(join(output,profile+'.json'),JSON.stringify({results,snapshots,image:manifest.image,sha256:manifest.sha256,errors},null,2)+'\n');
   console.log('PASS '+profile);
  }catch(error){
   await writeFile(join(output,profile+'-failure.txt'),`${error.stack}\n${await text().catch(()=> '')}`);
   await page.screenshot({path:join(output,profile+'-failure.png')}).catch(()=>{});throw error;
  }finally{await page.close();}
 }
 console.log(JSON.stringify({results},null,2));
}finally{await browser.close();}
