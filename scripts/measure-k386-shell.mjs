// Compare real guest shell latency at the same emulated clock and video mode.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import {inspectK386} from './k386-inspect.mjs';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/shell-latency',video='']=process.argv.slice(2);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const page=await browser.newPage(),samples=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const keys=s=>page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);
const type=s=>page.evaluate(s=>window.np2debug.np2.typeText(s),s);
const until=async(test,label)=>{const start=performance.now();let r;
 while(performance.now()-start<120000){r=await inspectK386(page);if(r&&test(r))return r;await page.waitForTimeout(30);}
 throw new Error(label+': '+JSON.stringify(r?.views));};
const prompt=v=>v.state===2&&v.screen.slice(v.row*80,v.row*80+80).trim()==='A:\\>';
try {
 const manifest=await (await fetch(new URL('k386/manifest.json',base))).json();
 await page.goto(new URL(`?fd1=./k386/${manifest.image}&run=1&mem=16&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);
 await page.waitForFunction(()=>{try{return window.np2debug.np2.getScreenText().text.includes('Ready');}catch{return false;}},null,{timeout:90000});
 await keys('CTRL+N');await until(r=>prompt(r.views[0]),'first prompt');
 await keys('CTRL+O');await until(r=>prompt(r.views[1]),'second prompt');
 await type('COUNTER\r');await until(r=>r.views[1].state===1&&r.views[1].screen.includes('V86 COUNTER:')&&r.views[1].counter>0,'background counter');
 await keys('CTRL+N');await page.waitForTimeout(500);
 for(let pass=0;pass<3;pass++)for(const command of ['ECHO LATENCY'+pass,'DIR *.EXE','TYPE KDESK.TXT']){
  const before=await inspectK386(page),start=performance.now();
  await type(command+'\r');
  const result=await until(r=>prompt(r.views[0])&&r.diagnostics[0].count>before.diagnostics[0].count+3,command);
  samples.push({command,milliseconds:Math.round(performance.now()-start),calls:result.diagnostics[0].count-before.diagnostics[0].count,
   backgroundProgress:(result.views[1].counter-before.views[1].counter)>>>0});
  console.log(JSON.stringify(samples.at(-1)));
 }
 assert.deepEqual(errors,[]);
 if(process.env.K386_LATENCY_GATE==='1')for(const name of ['ECHO','DIR','TYPE']) {
  const rows=samples.filter(s=>s.command.startsWith(name));
  const median=rows.map(s=>s.milliseconds).sort((a,b)=>a-b)[1];
  assert.ok(median<({ECHO:5000,DIR:20000,TYPE:30000})[name],name+' latency regression: '+median+' ms');
  assert.ok(rows.every(s=>s.backgroundProgress>0),name+' must retain background execution');
 }
 await page.screenshot({path:output+'/desktop.png'});
 await writeFile(output+'/latency.json',JSON.stringify({source:manifest.source_commit,image:manifest.sha256,browser:browser.version(),video:video||'pegc',clock:8,samples},null,2)+'\n');
}finally{await browser.close();}
