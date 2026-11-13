import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectGUI} from './kgui32-inspect.mjs';
import {inspectK386} from './k386-inspect.mjs';
const [base='http://127.0.0.1:4173/',output='test-results/kgui32',video='pegc']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/kgui32/manifest.json',import.meta.url)));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
let page;const results=[],snapshots=[],errors=[];
const pass=s=>{results.push(s);console.log('PASS '+s);};
const key=async s=>{await page.evaluate(s=>window.np2debug.np2.sendKeys(s),s);await page.waitForTimeout(180);};
const type=async s=>{await page.evaluate(s=>window.np2debug.np2.typeText(s),s);await page.waitForTimeout(180);};
const wait=s=>page.waitForFunction(s=>{try{return window.np2debug?.np2?.getScreenText().text.includes(s);}catch{return false;}},s,{timeout:120000});
const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function until(test,label){console.log('CHECK '+label);let last;for(let end=Date.now()+120000;Date.now()<end;){last=await inspectGUI(page).catch(()=>null);if(last&&test(last))return last;await page.waitForTimeout(100);}throw Error(label+': '+JSON.stringify(last));}
function save(label,s){snapshots.push({label,...s});}
function owned(s){const r=s.cpu;
 assert.equal(s.error,0);assert.equal(s.ready,1);assert.ok(r.handle);assert.equal(r.locked,1);assert.equal(r.error,0);assert.equal(r.a20Owned,0);
 assert.equal(r.pmCR0&1,1);assert.equal(r.pmCR0>>>31,1);assert.equal(r.pmCR3,r.pd);assert.equal(r.frame.cs,59);assert.equal(r.frame.ss,67);assert.equal(r.frame.eflags&0x20000,0);
 assert.equal(r.returnedCR0,r.savedCR0);assert.equal(r.returnedCR3,r.savedCR3);assert.equal(r.returnedFlags,r.savedFlags);assert.equal(r.returnedMask,r.savedMask);assert.equal(r.a20Before,r.a20After);
 assert.equal(r.ptes[0]&7,5);assert.equal(r.ptes[1021]&7,5);assert.equal(r.ptes[1022],0);assert.equal(r.ptes[1023]&7,7);assert.equal(r.pde0&7,3);assert.equal(r.features,31);assert.equal(s.app.error,0);
}
function reclaimed(s){const r=s.cpu;
 assert.equal(s.ready,0);assert.equal(s.graphics,0);assert.equal(s.scratch,0);assert.equal(s.tables,0);assert.equal(s.owned,0);
 assert.equal(r.handle,0);assert.equal(r.locked,0);assert.equal(r.a20Owned,0);assert.equal(r.heapPages,0);assert.equal(r.openFiles,0);assert.equal(r.opens,r.closes);assert.equal(r.allocations,r.frees);
 assert.equal(r.freeBefore,r.freeAfter);assert.equal(r.largestBefore,r.largestAfter);assert.equal(s.dosBefore,s.dosAfter);
 assert.equal(r.unmapped,1);assert.equal(r.tablesCleared,1);assert.equal(r.freed,1);
}
const point=async(x,y)=>{await page.evaluate(({x,y})=>window.np2debug.np2.mouseMoveTo(x,y),{x,y});await page.waitForTimeout(200);};
const button=async down=>{await page.evaluate(down=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,down]),down);await page.waitForTimeout(250);};
async function click(x,y){await point(x,y);await button(1);await button(0);}
async function pixels(points){return page.evaluate(points=>{const c=document.createElement('canvas'),source=document.querySelector('#canvas');c.width=source.width;c.height=source.height;const g=c.getContext('2d');g.drawImage(source,0,0);return points.map(([x,y])=>Array.from(g.getImageData(x,y,1,1).data));},points);}
async function boot(mem){page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 if(mem===16){await page.goto(base);const link=page.locator(video==='cirrus'?'.start-btn-kgui32-highcolor':'.start-btn-kgui32');await link.waitFor({state:'visible'});const href=await link.getAttribute('href'),url=new URL(href,page.url());const distribution=manifest.application_distribution;
  if(manifest.standalone_hdd?.hdd_boot_supported){assert(!url.searchParams.has('fd1')&&!url.searchParams.has('fd2'));assert.equal(url.searchParams.get('hdd'),'./kgui32/'+manifest.standalone_hdd.image);}
  else{assert.equal(url.searchParams.get('fd1'),'./kgui32/'+(distribution?.image??manifest.image));if(distribution)assert.equal(url.searchParams.get('hdd'),'./kgui32/'+distribution.hdd.image);}
  assert.equal(url.searchParams.get('mem'),'16');assert.equal(url.searchParams.get('video'),video==='cirrus'?'cirrus':null);
  // Keep this regression on the explicit complete-FD compatibility choice.
  // The shipping HDD-only profile has its own real-CPU/media acceptance suite.
  const fdLink=page.locator('.start-btn-kgui32-fd');await fdLink.waitFor({state:'visible'});
  const fdUrl=new URL(await fdLink.getAttribute('href'),page.url());
  assert.equal(fdUrl.searchParams.get('fd1'),'./kgui32/'+manifest.image);assert(!fdUrl.searchParams.has('hdd'));assert.equal(fdUrl.searchParams.get('mem'),'16');
  if(video==='cirrus')fdUrl.searchParams.set('video','cirrus');await page.goto(fdUrl.href);}
 else await page.goto(new URL(`?fd1=./kgui32/${manifest.image}&run=1&mem=${mem}&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);
}
async function command(mode){const previous=await inspectGUI(page);await page.evaluate(cookie=>{window.kgui32ExcludedCookie=cookie;delete window.kgui32Address;},previous?.cookie);await type('KGUILDR KGUI32.EXE '+mode+'\r');}
try{
 await boot(16);let s=await until(s=>s.ready&&s.app?.frames>=2&&s.cpu.a20Owned===0,'independent desktop');owned(s);save('desktop boot',s);
 assert.equal(hash(await disk()),manifest.sha256);assert.equal(s.width,video==='cirrus'?800:640);assert.equal(s.height,video==='cirrus'?600:400);assert.equal(s.bpp,video==='cirrus'?2:1);
 const graphics=await page.evaluate(()=>window.np2debug.np2.getGraphicsInfo());assert.equal(graphics.width,s.width);assert.equal(graphics.height,s.height);if(video==='cirrus')assert.equal(graphics.deviceBpp,16);
 const guestText=await page.evaluate(()=>window.np2debug.np2.getScreenText().text);assert.ok(!guestText.includes('Ready'));assert.equal((await inspectK386(page)).views.filter(v=>v.state!==0).length,0);
 await page.screenshot({path:join(output,'desktop.png')});pass('KDESK-free desktop, actual CPL3/PE/PG, supervisor low memory, RO code/argv and unmapped guard; two application slots remain free');
 // Move by odd x/y deltas and inspect actual pixels where the old window was.
 await point(72,75);await button(1);s=await until(s=>s.app?.drag===1,'title drag starts');await point(85,84);await button(0);
 s=await until(s=>s.app?.x0===61&&s.app.y0===73&&s.app.drag===0,'odd-coordinate release');assert.ok(s.rect[2]*s.rect[3]<s.width*s.height);
 await point(20,s.height-48);await page.waitForTimeout(250);const p=await pixels([[50,70],[20,70],[63,75]]);assert.deepEqual(p[0],p[1]);assert.notDeepEqual(p[2],p[1]);save('drag with restored pixels',s);
 await key('TAB');s=await until(s=>s.app?.active===1,'focus System');await key('LEFT');s=await until(s=>s.app?.x1===s.width-280,'keyboard window movement');
 const sy=s.app.y1,sx=s.app.x1;
 await click(sx+203,sy+12);await click(180,s.height-16);s=await until(s=>s.app?.active===1,'taskbar restore');
 await click(sx+225,sy+12);await click(180,s.height-16);await key('RIGHT');s=await until(s=>s.app?.x1===s.width-272,'taskbar reopen and keyboard input');
 await page.screenshot({path:join(output,'moved-windows.png')});pass('32bit hit testing, odd-coordinate mouse drag and release, exact old-area restoration, focus, keyboard move, minimize and close/taskbar reopen');
 await type('t');s=await until(s=>s.owned===3&&s.counters.every(n=>n>0)&&s.cpu.a20Owned===0,'GUI plus two independent PM32 workers');owned(s);
 let peers=await inspectK386(page);assert.ok(peers);assert.deepEqual(peers.views.map(v=>v.kind),[1,1]);
 for(let id=0;id<2;id++){assert.equal(peers.diagnostics[id].frame.cs,59);assert.equal(peers.diagnostics[id].frame.eflags&0x20000,0);assert.notEqual(s.cpu.pd,peers.views[id].cr3);assert.notEqual(s.cpu.physical,peers.views[id].physical);assert.equal(peers.diagnostics[id].pm32.samples[1],49+id);assert.equal(peers.diagnostics[id].pm32.heapPages,2);}
 assert.notEqual(peers.views[0].cr3,peers.views[1].cr3);assert.notEqual(peers.views[0].physical,peers.views[1].physical);
 save('three actual protected contexts',{...s,peers});const before=s;await type('a');await key('TAB');await key('RIGHT');
 s=await until(s=>s.counters.every((n,i)=>n>before.counters[i])&&s.app.heartbeat>before.app.heartbeat,'all three contexts progress');peers=await inspectK386(page);assert.deepEqual(s.generations,before.generations);assert.ok(peers.views.every(v=>v.keys===0));save('background progress and input isolation',{...s,peers});
 pass('dedicated GUI plus both PM32 app slots run concurrently with distinct CR3/backing, private heap data, continuing background counters and no GUI key leakage');
 await key('F10');await wait('KGUI32 DONE');s=await until(s=>!s.ready&&s.state===3,'clean exit');reclaimed(s);save('normal exit',s);assert.equal(hash(await disk()),manifest.sha256);
 pass('F10 returns to DOS and frees only GUI-owned workers, XMS, mappings, graphics/font/palette and all conventional allocations; whole FAT12 image unchanged');
 // Five original pointer/rectangle cases plus six CG-ROM request failures
 // (supervisor pointer, three codes, version and read-only output), plus four
 // terminal snapshot cases (supervisor/RO output, version and size).
 await command('badapi');await wait('KGUI32 DONE');s=await until(s=>s.state===3&&!s.ready&&s.rejected===15,'invalid GUI service pointers, rectangles, CG-ROM and terminal snapshots');reclaimed(s);assert.equal(s.cpu.exitCode,0);save('service boundary rejection',s);
 await command('fault');await wait('KGUI32 FAULT');s=await until(s=>s.state===4&&!s.ready,'contained GUI page fault');reclaimed(s);assert.equal(s.cpu.reason,14);assert.equal(s.cpu.cr2,0x10000);assert.equal(s.cpu.faultError,7);save('real user page fault',s);
 await command('spin');s=await until(s=>s.ready&&s.app?.heartbeat>100&&s.cpu.irqs>3,'uncooperative GUI preemption');assert.equal(s.app.frames,1);const heartbeat=s.app.heartbeat;
 await until(s=>s.app?.heartbeat>heartbeat&&s.cpu.irqs>5,'spin makes protected progress');await key('ESC');await wait('KGUI32 DONE');s=await until(s=>s.state===3&&!s.ready,'force-stop spin');reclaimed(s);assert.equal(s.cpu.reason,65);save('IRQ-preempted GUI stop',s);
 pass('real #PF containment and IRQ-preempted infinite GUI loop both return to usable DOS; invalid user/RO pointers and oversized rectangles are rejected');
 await type('KGPROOF\r');await page.waitForFunction(()=>/KGPROOF (PASS|FAIL)/.test(window.np2debug.np2.getScreenText().text),null,{timeout:120000});
 const parent=await page.evaluate(()=>{const n=window.np2debug.np2,b=atob(n.readMemoryBase64(0x10000,0x90000).base64),w=o=>b.charCodeAt(o)|b.charCodeAt(o+1)<<8,d=o=>(w(o)|w(o+2)<<16)>>>0;let at=-1;while((at=b.indexOf('KGPROOF1',at+1))>=0)if(d(at+8)===1&&d(at+12)===116&&d(at+16))return {tag:d(at+16),error:d(at+20),loops:d(at+24),generation:[d(at+28),d(at+32)],pd:[d(at+36),d(at+40)],physical:[d(at+44),d(at+48)],before:[d(at+52),d(at+56)],after:[d(at+60),d(at+64)],cs:[d(at+68),d(at+72)],flags:[d(at+76),d(at+80)],heap:[d(at+84),d(at+88)],freeBefore:d(at+92),freeAfter:d(at+96),largestBefore:d(at+100),largestAfter:d(at+104),dosBefore:d(at+108),dosAfter:d(at+112)};return null;});
 assert.ok(parent);assert.equal(parent.error,0);assert.equal(parent.loops,4);assert.deepEqual(parent.cs,[59,59]);assert.deepEqual(parent.heap,[2,2]);assert.ok(parent.after.every((v,i)=>v>parent.before[i]));assert.notEqual(parent.pd[0],parent.pd[1]);assert.notEqual(parent.physical[0],parent.physical[1]);assert.equal(parent.freeBefore,parent.freeAfter);assert.equal(parent.largestBefore,parent.largestAfter);assert.equal(parent.dosBefore,parent.dosAfter);save('live DOS parent owns existing workers',{parent});
 pass('four child GUI launches preserve pre-existing worker generations, page tables, backing and heaps through normal exit, invalid APIs and real #PF; parent proves DOS/XMS reclamation');
 await type('KDESK\r');await wait('Ready');await key('CTRL+K');await wait('Find apps');await type('math');await wait('1 results -');await key('ENTER');await wait('Value: 0');await type('6*7=');await wait('Value: 42');await page.screenshot({path:join(output,'kdesk-fallback.png')});await key('F10');await wait('KDESK exited.');assert.equal(hash(await disk()),manifest.sha256);await page.close();
 pass('original KDESK still boots from DOS and its calculator works after GUI failure/stop; disk bytes preserved');
 await boot(4);await wait('KGUI32 REFUSED/FAILED');s=await until(s=>s.state===6&&!s.ready,'real low-memory refusal');assert.equal(s.error,8);assert.equal(s.cpu.handle,0);assert.equal(s.cpu.locked,0);assert.equal(s.cpu.freeBefore,s.cpu.freeAfter);assert.equal(s.cpu.pmCR0,0);assert.equal(s.cpu.openFiles,0);assert.equal(s.dosBefore,s.dosAfter);save('4 MiB refusal',s);assert.equal(hash(await disk()),manifest.sha256);assert.deepEqual(errors,[]);
 pass('4 MiB XMS refusal leaves DOS usable without entering protected mode, leaking an allocation or changing any disk byte');
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,sourceDirty:manifest.source_dirty,image:manifest.image,sha256:manifest.sha256,video,graphics,results,snapshots},null,2)+'\n');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),text:await page?.evaluate(()=>window.np2debug?.np2?.getScreenText().text).catch(()=>null),gui:await inspectGUI(page).catch(()=>null),peers:await inspectK386(page).catch(()=>null),results,snapshots},null,2)+'\n');await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;}finally{await browser.close();}
