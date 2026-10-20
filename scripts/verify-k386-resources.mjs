// Actual guest scheduling, budgets and lifecycle; no host-simulated DOS tasks.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';

const [base='http://127.0.0.1:4173/webnp2/',output='test-results/k386-resources']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/k386/manifest.json',import.meta.url),'utf8'));
assert.equal(manifest.enabled,true);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const page=await browser.newPage();const results=[],snapshots=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const pass=message=>{results.push(message);console.log('PASS '+message);};
const pause=ms=>page.waitForTimeout(ms);
const text=()=>page.evaluate(()=>window.np2debug.np2.getScreenText().text);
const wait=needle=>page.waitForFunction(needle=>{try{return window.np2debug.np2.getScreenText().text.includes(needle);}catch{return false;}},needle,{timeout:90000});
const key=async value=>{await page.evaluate(v=>window.np2debug.np2.sendKeys(v),value);await pause(200);};
const type=async value=>{await page.evaluate(v=>window.np2debug.np2.typeText(v),value);await pause(200);};
const click=async(x,y)=>{
  await page.evaluate(()=>window.np2debug.np2.mouseHome());await pause(200);
  await page.evaluate(({x,y})=>window.np2debug.np2.mouseMoveTo(x,y),{x,y});await pause(200);
  await page.evaluate(()=>window.np2debug.np2.mouseClick());await pause(200);
};
const tasksPresented=async()=>{
  // Guest TVRAM is a mirror and can update before the composed PEGC frame.
  await page.waitForFunction(()=>{
    const c=document.createElement('canvas');c.width=640;c.height=400;
    const g=c.getContext('2d');g.drawImage(document.querySelector('#canvas'),0,0);
    const p=g.getImageData(500,45,1,1).data;
    return p[0]<80&&p[1]>70&&p[1]<160&&p[2]>120;
  },null,{timeout:60000});await pause(200);
};
const until=async(predicate,label)=>{
  let record;
  for(let attempt=0;attempt<400;attempt++){
    const cpu=await inspectK386(page),resources=await inspectResources(page);
    if(cpu&&resources){record={cpu,resources};if(predicate(record))return record;}
    await pause(150);
  }
  throw new Error(`${label}: ${JSON.stringify(record?.resources)}`);
};
const run=async(id,path)=>{await key(id?'CTRL+O':'CTRL+N');await key('CTRL+L');await type(path+'\r');};
const prompt=()=>page.waitForFunction(()=>window.np2debug.np2.getScreenText().lines.some(line=>line.trim()==='A>'),null,{timeout:60000});
try{
  await mkdir(output,{recursive:true});
  await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=16&clk=8&worklet=0`,base).href);
  await wait('Ready');
  await key('F10');await wait('KDESK exited.');await prompt();
  await type('KRESCHK\r');
  await page.waitForFunction(()=>/K386 RESOURCE CHECK (PASS|FAIL)/.test(window.np2debug.np2.getScreenText().text),null,{timeout:120000});
  assert.ok((await text()).includes('K386 RESOURCE CHECK PASS'),await text());await prompt();
  pass('native DOS client: exact 4:1 real V86 runs, CPU counters, live ARTIC quota, retained RAM, AH=4Dh parent interrupt, fault journal, wrap and cleanup');
  await type('KDESK\r');await wait('Ready');
  await key('CTRL+N');await key('CTRL+O');
  let record=await until(r=>r.cpu.views.every(v=>v.state===2&&v.screen.includes('K386 DOS shell')),'two guest shells');
  assert.notEqual(record.resources.usage[0].generation,record.resources.usage[1].generation);
  await key('CTRL+T');for(let i=0;i<8;i++)await key('DOWN');
  await click(352,344);await wait('Priority: High');
  await key('DOWN');await type('PP');await wait('Priority: Low');
  record=await until(r=>r.resources.usage[0].priority===2&&r.resources.usage[1].priority===0,'GUI priority controls');
  const previous=record.resources.events.at(-2).sequence;
  await type('[');await wait(`Event #${previous}`);await type(']');
  await run(0,'COUNTER.COM');await run(1,'COUNTER.COM');
  record=await until(r=>r.resources.usage.every(u=>u.runs>2),'both real CPU loops');
  const before=record;
  await key('F4');await type('GUI WHILE PRIORITIES RUN');await wait('GUI WHILE PRIORITIES RUN');
  record=await until(r=>r.resources.usage.reduce((n,u,i)=>n+u.runs-before.resources.usage[i].runs,0)>=100,'weighted work with Memo focused');
  const runs=record.resources.usage.map((u,i)=>u.runs-before.resources.usage[i].runs);
  assert.ok(runs[1]>0&&runs[0]>=runs[1]*3&&runs[0]<=runs[1]*5,JSON.stringify(runs));
  assert.ok(record.cpu.views.every((v,i)=>v.counter>before.cpu.views[i].counter));
  assert.notEqual(record.cpu.views[0].physical,record.cpu.views[1].physical);
  snapshots.push({stage:'weighted-background',runs,...record});
  pass('PC-98 mouse priority button, keyboard/history controls and actual 4:1 background CPU progress with Memo active');

  await key('CTRL+T');await key('UP');await type('L');await wait('Limit: 1000 ms');
  record=await until(r=>r.cpu.views[0].state===3&&r.resources.usage[0].reason===4,'CPU budget automatically suspends DOS 1');
  const stopped=record;
  assert.ok(stopped.resources.usage[0].cpuTicks>=stopped.resources.usage[0].limitTicks);
  assert.ok(stopped.resources.usage[0].memoryKiB===664&&stopped.resources.usage[0].heapKiB>0);
  record=await until(r=>r.cpu.views[1].counter>stopped.cpu.views[1].counter,'DOS 2 continues after DOS 1 budget exhaustion');
  assert.equal(record.cpu.views[0].counter,stopped.cpu.views[0].counter);
  assert.equal(record.resources.usage[0].cpuTicks,stopped.resources.usage[0].cpuTicks);
  assert.deepEqual(record.cpu.diagnostics[0].frame,stopped.cpu.diagnostics[0].frame);
  assert.deepEqual(record.cpu.diagnostics[0].memory,stopped.cpu.diagnostics[0].memory);
  await wait('Reason: CPU limit');await tasksPresented();
  await page.screenshot({path:join(output,'budget-stopped.png')});
  await type('R');await wait('Cannot resume; raise or disable the CPU limit in Tasks');
  record=await until(r=>r.cpu.views[0].state===3,'exhausted resume denied');
  await key('CTRL+T');await type('L');await wait('Limit: 5000 ms');
  assert.equal((await inspectK386(page)).views[0].state,3,'raising the limit does not implicitly resume');
  await type('R');record=await until(r=>r.cpu.views[0].counter>stopped.cpu.views[0].counter,'explicit resume keeps old CPU and memory');
  assert.equal(record.resources.usage[0].generation,stopped.resources.usage[0].generation);
  assert.equal(record.cpu.views[0].physical,stopped.cpu.views[0].physical);
  assert.equal(record.cpu.views[0].cr3,stopped.cpu.views[0].cr3);
  await key('CTRL+T');await type('LL');await wait('Limit: off');
  snapshots.push({stage:'quota-resume',...record});
  pass('GUI CPU budget, automatic stop, unchanged frame/RAM/counter, other VM progress, denied exhausted resume and explicit recovery');

  await run(0,'INTWAIT.COM');
  record=await until(r=>r.resources.usage[0].depth===2&&r.resources.usage[0].program==='COUNTER.COM','nested child ready for Ctrl+C');
  const child=record.resources.usage[0];await key('CTRL+C');
  record=await until(r=>r.cpu.views[0].state===0&&r.cpu.views[0].screen.includes('INTERRUPT PARENT PASS'),'Ctrl+C restores and executes the real parent');
  assert.ok(record.resources.events.some(e=>e.type===7&&e.generation===child.generation&&e.psp===child.psp));
  await run(0,'KSH.COM');await until(r=>r.cpu.views[0].state===2,'KSH waits');
  await type('COUNTER\r');await until(r=>r.resources.usage[0].depth===2,'KSH child runs');
  await key('CTRL+T');await type('B');
  record=await until(r=>r.resources.usage[0].depth===1&&r.resources.usage[0].program==='KSH.COM'&&r.cpu.views[0].state===2,'task-manager Break returns to KSH');
  pass('Ctrl+C reports AH=4Dh 0103h to actual EXEC parent; task-manager Break returns from child to live KSH');

  await run(0,'FAULT.COM');
  record=await until(r=>r.cpu.views[0].state===4&&r.resources.usage[0].lastFault===14,'actual page fault journal');
  assert.equal(record.resources.usage[0].lastCR2,0xe0000);
  const fault=record.resources.events.at(-1);
  assert.equal(fault.type,3);assert.equal(fault.cr2,0xe0000);assert.equal(fault.cs,0x8000);
  assert.equal(fault.ip,record.cpu.diagnostics[0].frame.eip);
  await key('CTRL+T');await wait('Reason: Fault');await wait('Fault: 14');
  await tasksPresented();
  await page.screenshot({path:join(output,'fault-journal.png')});
  const generation=record.resources.usage[0].generation;
  await type('K');record=await until(r=>r.cpu.views[0].state===0&&r.resources.usage[0].memoryKiB===0,'End frees the XMS reservation');
  assert.equal(record.resources.usage[0].handles,0);assert.equal(record.resources.usage[0].depth,0);
  await type('R');record=await until(r=>r.resources.usage[0].generation>generation&&r.cpu.views[0].state===2,'restart gets a fresh ID and shell');
  assert.ok(record.resources.usage[0].memoryKiB===664);
  snapshots.push({stage:'fault-restart',fault,...record});
  pass('CPU-generated #PF address/CS:IP retained in journal; End releases memory/handles and restart gets a fresh independent generation');

  const disk=await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'));
  assert.equal(createHash('sha256').update(Buffer.from(disk.base64,'base64')).digest('hex'),manifest.sha256);
  assert.deepEqual(errors,[]);
  pass('whole exported disk SHA-256 unchanged; no browser page errors');
  await writeFile(join(output,'validation.json'),JSON.stringify({results,snapshots,source_commit:manifest.source_commit,image_sha256:manifest.sha256},null,2)+'\n');
  console.log(JSON.stringify({results},null,2));
}catch(error){
  await writeFile(join(output,'failure.txt'),`${error.stack}\n${await text().catch(()=> '')}\n${JSON.stringify(await inspectResources(page).catch(()=>null))}`);
  await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;
}finally{await browser.close();}
