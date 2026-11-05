import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectClients} from './kgui32-client-inspect.mjs';
const [base='http://127.0.0.1:4173/',output='test-results/kgui32-clients',video='pegc']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/kgui32/manifest.json',import.meta.url)));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const page=await browser.newPage({viewport:{width:1280,height:1000}}),results=[],snapshots=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const pass=s=>{results.push(s);console.log('PASS '+s);};
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await page.waitForTimeout(180);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await page.waitForTimeout(180);};
async function until(test,label){console.log('CHECK '+label);let last,report=Date.now();for(let end=Date.now()+120000;Date.now()<end;){last=await inspectClients(page).catch(()=>null);if(last&&test(last))return last;if(Date.now()-report>10000){console.log(JSON.stringify({label,gui:last?.gui?.app,bridge:last?.bridge,apps:last?.apps,states:last?.cpu.views.map(v=>v.state)}));report=Date.now();}await page.waitForTimeout(100);}throw Error(label+' timed out; see failure.json');}
const point=async(x,y)=>{await page.evaluate(({x,y})=>window.np2debug.np2.mouseMoveTo(x,y),{x,y});await page.waitForTimeout(180);};
const button=async down=>{await page.evaluate(down=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,down]),down);await page.waitForTimeout(220);};
async function composed(id){
 const first=await until(s=>s.gui.app?.active===id,'focused window '+id);
 return until(s=>s.gui.app?.active===id&&(s.gui.cpu.state===7||s.gui.app.frames>first.gui.app.frames),'composed window '+id);
}
async function drain(x,y,id){await point(x,y);await until(s=>s.gui.app?.mx===x&&s.gui.app.my===y,'mouse queue drained');return composed(id);}
async function click(x,y){await point(x,y);await button(1);await button(0);}
const hash=b=>createHash('sha256').update(b).digest('hex');
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
function live(s,id,magic){const v=s.cpu.views[id],p=s.cpu.diagnostics[id].pm32,u=s.resources.usage[id],a=s.apps[id];return v.kind===1&&(v.state===1||v.state===2)&&p?.handle>0&&a?.magic===magic&&a.frames>0&&a.error===0&&s.cpu.diagnostics[id].frame.cs===59&&!(s.cpu.diagnostics[id].frame.eflags&0x20000)&&u.generation===v.generation&&s.bridge?.generation[id]===v.generation&&s.bridge.tokens[id]===a.token;}
try{
 await page.goto(new URL(`?fd1=./kgui32/${manifest.image}&run=1&mem=16&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);
 let s=await until(s=>s.gui.ready&&s.gui.app?.frames>=1&&s.bridge?.ready,'desktop with native client service');
 assert.equal(s.bridge.currentVector,s.bridge.vector);assert.equal(hash(await disk()),manifest.sha256);
 await click(48+70,64+128);s=await until(s=>live(s,0,0x3243474b),'graphical calculator');
 await type('6*7=');s=await until(s=>live(s,0,0x3243474b)&&s.apps[0].value===42,'calculator key result 42');
 await key('F2');await until(s=>s.gui.app?.active===0,'launcher via F2');
 await click(48+220,64+128);s=await until(s=>live(s,1,0x324b474b),'graphical clock');
 const start=s.apps[1].seconds;s=await until(s=>live(s,0,0x3243474b)&&live(s,1,0x324b474b)&&s.apps[1].seconds!==start,'clock progresses beside calculator');
 assert.equal(s.apps[0].value,42);assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);assert.notEqual(s.gui.cpu.pd,s.cpu.views[0].cr3);assert.notEqual(s.gui.cpu.pd,s.cpu.views[1].cr3);
 await composed(3);await page.screenshot({path:join(output,'calculator-clock.png')});snapshots.push({label:'two native graphical clients',...s});pass('independent calculator and clock, real CPL3 contexts and continuing background time');
 const width=s.gui.width,height=s.gui.height;
 for(const id of [0,1]){assert.equal(s.cpu.diagnostics[id].pm32.features,47);assert.notEqual(s.gui.cpu.physical,s.cpu.views[id].physical);}
 assert.notEqual(s.cpu.views[0].physical,s.cpu.views[1].physical);
 const generations=s.cpu.views.map(v=>v.generation);
 await key('F2');await until(s=>s.gui.app?.active===0,'launcher with both slots occupied');await click(118,192);await drain(118,192,0);
 s=await until(s=>live(s,0,0x3243474b)&&live(s,1,0x324b474b),'busy launcher preserves both clients');assert.deepEqual(s.cpu.views.map(v=>v.generation),generations);assert.equal(s.apps[0].value,42);
 await click(330,height-16);await composed(2);
 const beforeClicks=s.apps[0].clicks,clockKeys=s.apps[1].keys;
 // Calculator canvas starts at (24,110); the SDK grid is 80 x 31 pixels.
 for(const [x,y] of [[70,288],[230,195],[310,195],[70,164],[230,257]])await click(x,y);
 s=await until(s=>live(s,0,0x3243474b)&&s.apps[0].clicks>=beforeClicks+5&&s.apps[0].value===42,'calculator mouse result 42');
 assert.equal(s.apps[1].keys,clockKeys);assert.deepEqual(s.cpu.views.map(v=>v.generation),generations);
 const calcKeys=s.apps[0].keys;await click(480,height-16);await type('t');
 s=await until(s=>live(s,1,0x324b474b)&&s.apps[1].mode===1,'clock receives t rather than desktop diagnostic command');assert.equal(s.apps[0].keys,calcKeys);assert.equal(s.apps[0].value,42);
 snapshots.push({label:'mouse and keyboard isolation',...s});pass('SDK buttons are clicked in the guest compositor; keys and mouse target only the focused generation');
 // The closed/minimized client retains state and keeps executing.
 const cx=width-360-16,cy=height-272-40;
 await click(cx+360-40,cy+12);const hidden=s.apps[1].heartbeat;
 s=await until(s=>live(s,1,0x324b474b)&&s.apps[1].heartbeat>hidden&&s.gui.app.active!==3,'hidden clock continues');
 await click(480,height-16);await composed(3);await key('CTRL+P');
 s=await until(s=>s.cpu.views[1].state===3,'pause clock');const paused=s.apps[1].heartbeat;
 await click(330,height-16);await type('c8*8=');s=await until(s=>s.apps[0].value===64&&s.apps[0].error===0,'calculator operates while clock is stopped');assert.equal(s.apps[1].heartbeat,paused);
 await click(480,height-16);await key('CTRL+R');s=await until(s=>live(s,1,0x324b474b)&&s.apps[1].heartbeat>paused,'resume same clock context');assert.equal(s.cpu.views[1].generation,generations[1]);
 pass('minimized clock progresses; stopped clock preserves state while calculator works, and resume keeps its owner');
 // Resize calculator, receive an actual resize event and repaint its widgets.
 await click(330,height-16);await composed(2);
 await point(368,336);await button(1);await point(408,320);await button(0);await drain(20,height-48,2);
 s=await until(s=>live(s,0,0x3243474b)&&s.apps[0].width===384&&s.apps[0].height===184,'client resize event and redraw');assert.equal(s.apps[0].value,64);
 await point(70,52);await button(1);await point(101,63);await button(0);await drain(20,height-48,2);
 await type('c6*7=');s=await until(s=>s.apps[0].value===42&&s.apps[0].error===0,'keys after graphical window move');
 await page.screenshot({path:join(output,'resized-clients.png')});snapshots.push({label:'client resize and movement',...s});pass('graphical resize delivers new canvas dimensions; moved client retains calculator input and value');
 // Real invalid client requests cannot affect a peer's window.
 await click(cx+292,cy+188);s=await until(s=>s.cpu.views[1].state===0&&s.cpu.diagnostics[1].pm32.exitCode===0,'clock SDK Close button');assert.equal(s.gui.ready,1);assert.equal(s.apps[0].value,42);
 await key('CTRL+L');await type('KGBAD.EXE '+s.apps[0].token+'\r');
 s=await until(s=>s.cpu.views[1].state===0&&s.resources.usage[1].program==='KGBAD.EXE'&&s.apps[1]?.magic===0x3242474b,'real user-mode negative requests');
 assert.equal(s.cpu.diagnostics[1].pm32.exitCode,0);assert.equal(s.apps[1].error,0);assert.equal(s.apps[1].value,14);assert.equal(s.apps[0].value,42);assert.equal(s.cpu.views[0].generation,generations[0]);
 snapshots.push({label:'rejected client requests',...s});pass('14 real CPL3 checks reject low/RO/overflow pointers, malformed commands, out-of-window drawing and peer/stale tokens');
 await key('CTRL+L');await type('KGCLOCK.EXE fault\r');
 s=await until(s=>s.cpu.views[1].state===4&&s.cpu.views[1].fault===14,'client write page fault');assert.equal(s.cpu.views[1].cr2,0x10000);assert.equal(s.cpu.diagnostics[1].pm32.handle,0);assert.equal(s.apps[0].value,42);assert.equal(s.gui.ready,1);
 const faultGeneration=s.cpu.views[1].generation;
 // The existing task toolbar restarts the exact root including its fault argument.
 await click(cx+8+4*64+20,cy+48);s=await until(s=>s.cpu.views[1].state===4&&s.cpu.views[1].generation!==faultGeneration,'restart exact faulting client');
 await key('CTRL+L');await type('KGCLOCK.EXE\r');s=await until(s=>live(s,1,0x324b474b),'recover with fresh clock');assert.equal(s.apps[0].value,42);
 pass('client #PF reclaims its private pages/window, exact restart changes generation, and peer/desktop survive recovery');
 // GUI + an actual DOS session, with the calculator's private state preserved.
 await key('CTRL+E');await until(s=>s.cpu.views[1].state===0,'end recovered clock');await key('CTRL+L');await type('KSH.EXE\r');
 s=await until(s=>s.cpu.views[1].kind===0&&s.cpu.views[1].screen.includes('K386 DOS shell'),'GUI and DOS shell');
 await type('ECHO GUI DOS MIX\r');await until(s=>s.cpu.views[1].screen.includes('GUI DOS MIX'),'focused DOS shell input');
 await type('COUNTER\r');s=await until(s=>s.cpu.views[1].state===1&&s.resources.usage[1].program==='COUNTER.EXE'&&s.cpu.views[1].screen.includes('V86 COUNTER:'),'DOS child counter');
 const counter=s.cpu.views[1].counter;await click(330,height-16);await type('c9*9=');s=await until(s=>s.apps[0].value===81&&s.cpu.views[1].counter>counter,'GUI calculator with continuing background DOS counter');
 assert.equal(s.cpu.views[0].generation,generations[0]);assert.ok(s.cpu.diagnostics[1].frame.eflags&0x20000);await composed(2);
 await page.screenshot({path:join(output,'calculator-and-dos.png')});snapshots.push({label:'GUI with independent DOS child',...s});pass('native GUI application and V86 DOS child coexist, retaining separate CPU/memory/input and continuing background execution');
 const peerCounter=s.cpu.views[1].counter;
 await type('q');s=await until(s=>s.cpu.views[0].state===0&&s.cpu.diagnostics[0].pm32.exitCode===0,'q closes calculator, not desktop');
 assert.equal(s.gui.ready,1);assert.equal(s.cpu.diagnostics[0].pm32.handle,0);
 await key('F2');await until(s=>s.gui.app.active===0,'launcher after normal client exit');await click(118,192);
 s=await until(s=>live(s,0,0x3243474b)&&s.cpu.views[0].generation!==generations[0]&&s.apps[0].value===0&&s.cpu.views[1].counter>peerCounter,'clean calculator relaunch with live DOS peer');
 snapshots.push({label:'normal close and fresh generation',...s});pass('SDK Close and q exit normally; relaunch gets clean state while DOS peer continues');
 await key('F10');s=await until(s=>!s.gui.ready&&s.gui.state===3,'desktop exit');
 assert.equal(s.bridge.ready,0);assert.equal(s.bridge.arena,0);assert.equal(s.bridge.currentVector,s.bridge.oldVector);assert.equal(s.gui.cpu.freeBefore,s.gui.cpu.freeAfter);assert.equal(s.gui.cpu.largestBefore,s.gui.cpu.largestAfter);assert.equal(s.gui.cpu.handle,0);assert.equal(s.gui.cpu.tablesCleared,1);assert.ok(s.cpu.views.every(v=>v.state===0));assert.equal(s.gui.dosBefore,s.gui.dosAfter);assert.equal(hash(await disk()),manifest.sha256);assert.deepEqual(errors,[]);
 snapshots.push({label:'reclaimed',...s});pass('client windows, hook, arena, DOS/XMS allocations reclaimed and complete FAT12 preserved');
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,sourceDirty:manifest.source_dirty,image:manifest.image,sha256:manifest.sha256,video,results,snapshots},null,2)+'\n');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),text:await page.evaluate(()=>window.np2debug?.np2?.getScreenText().text).catch(()=>null),last:await inspectClients(page).catch(()=>null),results,snapshots},null,2)+'\n');await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;}finally{await browser.close();}
