import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectGUI} from './kgui32-inspect.mjs';
import {inspectK386} from './k386-inspect.mjs';
import {inspectResources} from './k386-resources.mjs';
import {pm32CounterReady} from './k386-counter-progress.mjs';
const [base='http://127.0.0.1:4173/',output='test-results/kgui32-sessions',video='pegc']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/kgui32/manifest.json',import.meta.url)));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const page=await browser.newPage({viewport:{width:1280,height:1000}}),results=[],snapshots=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const pass=s=>{results.push(s);console.log('PASS '+s);};
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await page.waitForTimeout(180);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await page.waitForTimeout(180);};
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
const hasLine=(v,line)=>v&&v.state===2&&v.keys===0&&Array.from({length:25},(_,i)=>v.screen.slice(i*80,i*80+80).trim()).includes(line);
const hash=b=>createHash('sha256').update(b).digest('hex');
async function until(test,label){console.log('CHECK '+label);let last,report=Date.now();for(let end=Date.now()+120000;Date.now()<end;){last={gui:await inspectGUI(page).catch(()=>null),peers:await inspectK386(page).catch(()=>null),resources:await inspectResources(page).catch(()=>null)};if(test(last))return last;if(Date.now()-report>10000){console.log(JSON.stringify({label,frames:last.gui?.app?.frames,events:last.gui?.app?.events,irqs:last.gui?.cpu?.irqs,eip:last.gui?.cpu?.frame.eip,keys:last.peers?.views.map(v=>v.keys)}));report=Date.now();}await page.waitForTimeout(100);}throw Error(label+' timed out; see failure.json');}
const point=async(x,y)=>{await page.evaluate(({x,y})=>window.np2debug.np2.mouseMoveTo(x,y),{x,y});await page.waitForTimeout(180);};
const button=async down=>{await page.evaluate(down=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,down]),down);await page.waitForTimeout(220);};
async function idle(id){return until(s=>s.gui?.app?.active===id&&s.gui.cpu.state===7,'GUI finished composing window '+id);}
async function pixels(points){return page.evaluate(points=>{const c=document.createElement('canvas'),source=document.querySelector('#canvas');c.width=source.width;c.height=source.height;const g=c.getContext('2d');g.drawImage(source,0,0);return points.map(([x,y])=>Array.from(g.getImageData(x,y,1,1).data));},points);}
async function click(x,y){await point(x,y);await button(1);await button(0);}
try{
 await page.goto(new URL(`?fd1=./kgui32/${manifest.image}&run=1&mem=16&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);
 let s=await until(s=>s.gui?.ready&&s.gui.app?.frames>=1,'GUI boot');
 assert.equal(hash(await disk()),manifest.sha256);
 const width=s.gui.width,height=s.gui.height;
 await click(width-280,15);
 s=await until(s=>s.peers?.views[0].screen.includes('K386 DOS shell'),'DOS 1 shell');
 await click(width-188,15);
 s=await until(s=>s.gui?.owned===3&&s.peers?.views[1].screen.includes('K386 DOS shell'),'DOS 2 shell');
 assert.deepEqual(s.peers.views.map(v=>v.kind),[0,0]);assert.equal(s.gui.owned,3);
 await idle(3);await page.screenshot({path:join(output,'two-shells.png')});
 snapshots.push({label:'two shells',...s});pass('two V86 shells in native GUI windows');
 await type('echo SECOND\r');s=await until(s=>hasLine(s.peers?.views[1],'SECOND'),'input to focused DOS 2');
 assert.ok(!s.peers.views[0].screen.includes('SECOND'));
 await click(330,height-16);await type('echo FIRST\r');s=await until(s=>hasLine(s.peers?.views[0],'FIRST'),'input to restored DOS 1');
 assert.ok(!s.peers.views[1].screen.includes('FIRST'));snapshots.push({label:'input isolation',...s});
 pass('focused keys and taskbar restoration do not leak between V86 sessions');
 // End the first root, then run a native PM32 counter in the same GUI window.
 const firstGeneration=s.peers.views[0].generation;
 await key('CTRL+E');await until(s=>s.peers?.views[0].state===0,'end DOS 1');
 await key('CTRL+L');await type('COUNT32.EXE 1\r');
 s=await until(s=>pm32CounterReady({cpu:s.peers,resources:s.resources},0,firstGeneration),'PM32 counter in DOS 1 window');
 const pmGeneration=s.peers.views[0].generation;
 assert.notEqual(s.gui.cpu.pd,s.peers.views[0].cr3);assert.notEqual(s.gui.cpu.physical,s.peers.views[0].physical);
 await click(480,height-16);await type('COUNTER\r');
 s=await until(s=>s.peers?.views[1].state===1&&s.resources?.usage[1].program==='COUNTER.EXE'&&s.resources.usage[1].psp===s.peers.views[1].psp&&s.peers.views[1].screen.includes('V86 COUNTER: independent background CPU loop'),'background V86 counter');
 const before=s.peers;
 s=await until(s=>s.peers?.views.every((v,i)=>v.counter>before.views[i].counter),'mixed-mode background progress');
 assert.deepEqual(s.peers.views.map(v=>v.kind),[1,0]);
 assert.ok(s.peers.diagnostics[1].frame.eflags&0x20000);
 assert.notEqual(s.peers.views[0].cr3,s.peers.views[1].cr3);assert.notEqual(s.peers.views[0].physical,s.peers.views[1].physical);
 snapshots.push({label:'mixed-mode progress',...s});pass('GUI CPL3 + PM32 counter + independent V86 child: private CR3/backing and inactive CPU progress');
 await click(330,height-16);await key('CTRL+P');s=await until(s=>s.peers?.views[0].state===3,'pause PM32 counter');
 const stopped=s.peers.views[0].counter,peer=s.peers.views[1].counter;
 s=await until(s=>s.peers?.views[1].counter>peer,'peer continues while stopped');assert.equal(s.peers.views[0].counter,stopped);assert.equal(s.peers.views[0].generation,pmGeneration);
 await key('CTRL+R');s=await until(s=>s.peers?.views[0].state===1&&s.peers.views[0].counter>stopped,'resume same PM32 context');
 // Minimize keeps the CPU running; restoring routes subsequent commands correctly.
 const ww=width>688?656:width-32,wh=height>576?496:height-80;
 await click(16+ww-40,52);const hidden=s.peers.views[0].counter;
 s=await until(s=>s.peers?.views[0].counter>hidden&&s.gui?.app?.active===3,'minimized counter continues');
 await click(330,height-16);await until(s=>s.gui?.app?.active===2,'restore minimized session');
 snapshots.push({label:'pause/resume/minimize',...s});pass('pause preserves generation and counter; resume/minimize/restore leave the other task running');
 // Replace the V86 child with the actual read-only PM32 file viewer.
 await click(480,height-16);await key('CTRL+E');await until(s=>s.peers?.views[1].state===0,'end second root');
 await key('CTRL+L');await type('VIEW32.EXE VIEWDATA.TXT\r');
 s=await until(s=>s.peers?.views[1].kind===1&&s.peers.views[1].screen.includes('LINE 000'),'PM32 file viewer');
 assert.equal(s.peers.diagnostics[1].pm32.openFiles,1);assert.ok(s.peers.diagnostics[1].pm32.readBytes>2000);
 const count=s.peers.views[0].counter;
 await key('ROLLDOWN');s=await until(s=>s.peers?.views[1].screen.includes('LINE 018'),'focused viewer PgDn');
 assert.ok(s.peers.views[0].counter>count);assert.equal(s.peers.views[0].generation,pmGeneration);
 await idle(3);await page.screenshot({path:join(output,'viewer-and-counter.png')});snapshots.push({label:'two PM32 applications',...s});
 await type('q');s=await until(s=>s.peers?.views[1].state===0,'q exits viewer, not desktop');
 assert.equal(s.gui.ready,1);assert.equal(s.gui.app.error,0);assert.equal(s.peers.diagnostics[1].pm32.openFiles,0);assert.equal(s.peers.diagnostics[1].pm32.handle,0);
 pass('two PM32 application windows: real file read, PgDn input, continuing background counter and clean viewer exit');
 // Failed loads preserve the ended generation and screen; cancel the command editor with Esc.
 const ended=s.peers.views[1];await key('CTRL+L');await type('MISSING.EXE\r');await page.waitForTimeout(600);
 s=await until(s=>s.gui?.rejected>0,'missing file rejected');assert.equal(s.peers.views[1].generation,ended.generation);assert.equal(s.peers.views[1].state,0);assert.equal(s.peers.views[1].screen,ended.screen);await key('ESC');
 await key('CTRL+L');await type('FAULT32.EXE\r');s=await until(s=>s.peers?.views[1].state===4&&s.peers.views[1].fault===14,'contained application page fault');
 assert.equal(s.gui.ready,1);assert.equal(s.gui.app.error,0);assert.equal(s.peers.views[1].cr2,0x10000);
 const faultGen=s.peers.views[1].generation,faultPeer=s.peers.views[0].counter;
 await click(24+8+4*64+20,48+48); // Again, using the second window's fixed toolbar.
 s=await until(s=>s.peers?.views[1].state===4&&s.peers.views[1].generation!==faultGen,'restart exact faulted program');
 assert.ok(s.peers.views[0].counter>faultPeer);assert.equal(s.gui.ready,1);
 await key('CTRL+L');await type('KSH.EXE\r');s=await until(s=>s.peers?.views[1].kind===0&&s.peers.views[1].screen.includes('K386 DOS shell'),'recover faulted window with shell');
 snapshots.push({label:'failure containment and recovery',...s});pass('failed load rollback, real application #PF, generation-changing restart and shell recovery preserve desktop and peer');
 // Actual framebuffer assertions prove resize/move, not merely requested coordinates.
 await idle(3);await point(20,height-48);
 const [accent,border]=await pixels([[24+399,60],[24,100]]);
 await point(24+ww-8,48+wh-8);await button(1);await point(24+400-8,48+240-8);await button(0);
 await idle(3);await point(20,height-48);
 assert.deepEqual((await pixels([[24+399,60]]))[0],border);
 const newX=width-408,newY=height-280;
 await point(72,60);await button(1);await point(newX+48,newY+12);await button(0);
 await idle(3);await point(20,height-48);
 const moved=await pixels([[newX+250,newY+20],[274,68]]);
 assert.deepEqual(moved[0],accent);assert.notDeepEqual(moved[1],accent);
 await page.screenshot({path:join(output,'resized-moved-session.png')});
 await type('echo AFTERMOVE\r');await until(s=>hasLine(s.peers?.views[1],'AFTERMOVE'),'input after resize and move');
 pass('native session resize and title drag restore actual framebuffer pixels and preserve focused input');
 await key('F10');
 s=await until(s=>s.gui&&!s.gui.ready&&s.gui.state===3,'GUI teardown');
 assert.equal(s.gui.owned,0);assert.equal(s.gui.cpu.handle,0);assert.equal(s.gui.dosBefore,s.gui.dosAfter);
 assert.equal(hash(await disk()),manifest.sha256);assert.deepEqual(errors,[]);
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,sourceDirty:manifest.source_dirty,sha256:manifest.sha256,video,results,snapshots},null,2)+'\n');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),gui:await inspectGUI(page).catch(()=>null),peers:await inspectK386(page).catch(()=>null),results,snapshots},null,2)+'\n');await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;}finally{await browser.close();}
