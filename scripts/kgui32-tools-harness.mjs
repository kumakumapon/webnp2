// Test client only: no HTTP server or preview process is started here.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectWorkspace} from './kgui32-workspace-inspect.mjs';
import {guiCleanupPublished} from './gui-cleanup-state.mjs';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const fnv=b=>{let h=2166136261;for(const c of Buffer.from(b))h=Math.imul(h^c,16777619)>>>0;return h;};
export async function toolsHarness(base,output,video){
 assert(['pegc','cirrus'].includes(video));await mkdir(output,{recursive:true});
 const manifest=JSON.parse(await readFile(new URL('../public/kgui32/manifest.json',import.meta.url))),distribution=manifest.application_distribution;assert(distribution);
 const root=new URL('../public/kgui32/',import.meta.url),fd=await readFile(new URL(distribution.image,root)),hdd=await readFile(new URL(distribution.hdd.image,root)),legacy=await readFile(new URL(manifest.image,root));
 assert.equal(sha(fd),distribution.sha256);assert.equal(sha(hdd),distribution.hdd.sha256);assert.equal(manifest.workspace_recovery_api,1);
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
 let page,ctx,errors=[],fdBefore=fd,last;const results=[];
 const inspect=()=>inspectWorkspace(page);
 async function until(f,label){console.log('CHECK',label);let s,observerError;for(let end=Date.now()+120000;Date.now()<end;){s=await inspect().catch(e=>{observerError=String(e);return null;});if(s&&f(s)){last=s;return s;}await page.waitForTimeout(100);}throw Error(label+' '+JSON.stringify({observerError,editors:s?.editors,imes:s?.imes,gui:s?.gui.app,canvases:s?.canvases,states:s?.cpu.views.map(v=>({state:v.state,generation:v.generation}))}));}
 async function key(value){await page.evaluate(v=>window.np2debug.np2.sendKeys(v),value);await page.waitForTimeout(200);}
 async function type(value){await page.evaluate(v=>window.np2debug.np2.typeText(v),value);await page.waitForTimeout(200);}
 async function chord(modifier,value){await page.evaluate(({modifier,value})=>window.np2debug.np2.runKeySequence([{type:'down',keys:modifier},{type:'wait',ms:200},{type:'press',keys:value,holdMs:60},{type:'wait',ms:700},{type:'up',keys:modifier}]),{modifier,value});}
 async function point(x,y){await page.evaluate(p=>window.np2debug.np2.mouseMoveTo(p.x,p.y),{x,y});return until(s=>s.gui.app.mx===x&&s.gui.app.my===y,'pointer');}
 async function button(d){const hb=(await inspect()).gui.app.heartbeat;await page.evaluate(d=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,d]),d);await until(s=>s.gui.app.heartbeat>=hb+3,'mouse '+d);}
 async function click(x,y){await point(x,y);await button(1);await button(0);}
 async function focus(id){let s=await inspect();if(s.gui.app.active!==id+2)await click(330+146*id,s.gui.height-16);return until(s=>s.gui.app.active===id+2,'active '+id);}
 function origin(s,id){const c=s.canvases[id];return {x:id?s.gui.width-c.width-32:16,y:id?Math.max(40,s.gui.height-c.height-144):40};}
 async function control(id,code){await focus(id);const s=await until(s=>s.canvases[id]?.buttons.some(b=>b.id===code),'control '+code),b=s.canvases[id].buttons.find(b=>b.id===code),o=origin(s,id);await click(o.x+8+b.x+Math.floor(b.w/2),o.y+70+b.y+Math.floor(b.h/2));}
 async function input(id,x,y,value,oldLength=12){
  await focus(id);const s=await inspect(),o=origin(s,id);await click(o.x+8+x,o.y+70+y);
  const fields=(await inspect()).canvases[id].draws.filter(d=>d.x<=x&&d.y<=y&&y-d.y<20).sort((a,b)=>b.x-a.x||b.y-a.y),field=fields[0];assert(field,'retained input field');
  const shown=s=>s.canvases[id]?.draws.find(d=>d.x===field.x&&d.y===field.y)?.text;
  await key('HOME');let text=shown(await inspect());
  // Wait for actual retained input after each real key. A 200 ms host delay
  // cannot acknowledge a CPL3 frame while another large window is painting.
  for(let i=0;i<oldLength&&text;i++){const c=text.charCodeAt(0),unit=(c>=0x81&&c<=0x9f||c>=0xe0&&c<=0xef)?2:1;text=text.slice(unit);await key('DEL');await until(s=>shown(s)===text,'input deletion '+id);}
  for(const c of value){text+=c;await type(c);await until(s=>shown(s)===text,'input character '+id+' '+text.length);}
 }
 async function boot(bytes=hdd,floppy=fd,memory=16){
  ctx=await browser.newContext({viewport:{width:1280,height:1000}});page=await ctx.newPage();errors=[];fdBefore=floppy;page.on('pageerror',e=>errors.push(e.message));
  if(bytes)await page.route('**/kgui32/'+distribution.hdd.image,r=>r.fulfill({body:bytes,contentType:'application/octet-stream'}));
  if(!floppy.equals(fd))await page.route('**/kgui32/'+distribution.image,r=>r.fulfill({body:floppy,contentType:'application/octet-stream'}));
  await page.goto(new URL(`?fd1=./kgui32/${distribution.image}${bytes?'&hdd=./kgui32/'+distribution.hdd.image:''}&run=1&mem=${memory}&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);
  await until(s=>s.gui.ready&&s.gui.app?.frames&&s.bridge?.ready,'desktop');return page.evaluate(()=>window.np2debug.np2.readMemoryBase64(0x24*4,4).base64);
 }
 async function launchEditor(id=0){const before=await inspect(),generation=before.cpu.views[id].generation;await key('F2');await click(130,266);return until(s=>s.cpu.views[id].generation>generation&&[1,2].includes(s.cpu.views[id].state)&&s.bridge.generation[id]===s.cpu.views[id].generation&&s.bridge.tokens[id]>0&&s.editors[id]?.frames>0,'Editor '+id);}
 async function bootHdd(bytes,ready=true,memory=16){
  const profile=manifest.standalone_hdd;assert(profile?.hdd_boot_supported);
  if(bytes===undefined)bytes=await readFile(new URL(profile.image,root));
  ctx=await browser.newContext({viewport:{width:1280,height:1000}});page=await ctx.newPage();errors=[];fdBefore=null;page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/kgui32/'+profile.image,r=>r.fulfill({body:bytes,contentType:'application/octet-stream'}));
  await page.goto(base);
  const choice=page.locator(memory===32?(video==='cirrus'?'.start-btn-kgui32-expanded-highcolor':'.start-btn-kgui32-expanded'):(video==='cirrus'?'.start-btn-kgui32-highcolor':'.start-btn-kgui32'));
  const target=new URL(await choice.getAttribute('href'),base);
  assert.equal(target.searchParams.get('hdd'),'./kgui32/'+profile.image);
  assert(!target.searchParams.has('fd1')&&!target.searchParams.has('fd2'),'Shipping start choice boots HDD only');
  target.searchParams.set('mem',String(memory));target.searchParams.set('clk','8');target.searchParams.set('worklet','0');
  await page.goto(target.href);
  if(!ready)return null;
  await until(s=>s.gui.ready&&s.gui.app?.frames&&s.bridge?.ready,'HDD-only desktop');
  return page.evaluate(()=>window.np2debug.np2.readMemoryBase64(0x24*4,4).base64);
 }
 async function setText(id,value){await focus(id);await key('CTRL+A');await until(s=>s.editors[id]?.anchor===0&&s.editors[id]?.cursor===s.editors[id]?.bytes,'selection');let prefix='';for(const c of value){await type(c==='\n'?'\r':c);prefix+=c;await until(s=>s.editors[id]?.bytes===prefix.length&&s.editors[id]?.hash===fnv(prefix),'typed '+prefix.length+'/'+value.length);}}
 async function open(id,name){await focus(id);await key('CTRL+O');await until(s=>s.editors[id]?.mode===1,'Open dialog');await type(name);await key('TAB');await key('ENTER');return until(s=>s.editors[id]?.mode===0&&!s.editors[id].dirty,'Open '+name);}
 async function save(id,raw){await focus(id);await key('CTRL+S');return until(s=>s.editors[id]?.mode===0&&!s.editors[id].dirty&&s.editors[id].hash===fnv(raw.toString().replaceAll('\r','')),'Saved');}
 async function end(id){await focus(id);const s=await inspect(),o=origin(s,id);await click(o.x+230,o.y+48);return until(s=>s.cpu.views[id].state===0,'End '+id);}
 async function run(id,command){await focus(id);const generation=(await inspect()).cpu.views[id].generation;await key('CTRL+L');await type(command+'\r');return until(s=>s.cpu.views[id].generation>generation,'Run '+command);}
 async function disk(slot){if(slot==='fd1')return Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');const wait=page.waitForEvent('download');await page.evaluate(()=>window.np2debug.np2.exportDisk('hdd'));return readFile(await(await wait).path());}
 async function exit(vector){await key('F10');const s=await until(s=>guiCleanupPublished(s.gui)&&s.gui.state===3,'DOS and complete cleanup');assert.equal(s.bridge.ready,0);assert.equal(s.bridge.arena,0);assert.equal(s.bridge.currentVector,s.bridge.oldVector);assert.equal(s.gui.cpu.freeBefore,s.gui.cpu.freeAfter);assert.equal(s.gui.cpu.largestBefore,s.gui.cpu.largestAfter);assert.equal(s.gui.cpu.handle,0);assert.equal(s.gui.cpu.tablesCleared,1);assert.equal(s.gui.dosBefore,s.gui.dosAfter);assert(s.cpu.views.every(v=>v.state===0));assert.equal(await page.evaluate(()=>window.np2debug.np2.readMemoryBase64(0x24*4,4).base64),vector);assert.deepEqual(errors,[]);return s;}
 async function unchangedFd(){if(fdBefore===null){const mounted=await page.evaluate(()=>window.np2debug.np2.getMountedImages());assert(!mounted.some(m=>m.slot==='fd1'||m.slot==='fd2'),'No FD is attached to the HDD-only boot');}else assert.equal(sha(await disk('fd1')),sha(fdBefore));}
 async function shot(name){for(let i=0;i<2;i++){const s=await inspect();await point(s.gui.app.mx===10?12:10,s.gui.height-48);await until(t=>t.gui.app.frames>s.gui.app.frames&&t.gui.app.heartbeat>=s.gui.app.heartbeat+2,'compose');}await page.screenshot({path:join(output,name)});}
 async function dragToMaximum(id){await focus(id);const s=await inspect(),o=origin(s,id),c=s.canvases[id];await point(o.x+c.width+8,o.y+c.height+96);await button(1);await point(s.gui.width-8,s.gui.height-48);await button(0);return until(t=>t.canvases[id]?.width>c.width||t.canvases[id]?.height>c.height,'Expanded Editor');}
 function pass(name){results.push(name);console.log('PASS',name);}
 async function finish(){await writeFile(join(output,'verification.json'),JSON.stringify({video,source:manifest.source_commit,results},null,2)+'\n');}
 async function fail(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),last:await inspect().catch(()=>last),results},null,2)+'\n');await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{});}
 return {manifest,distribution,fd,hdd,legacy,inspect,until,key,type,chord,click,point,button,focus,origin,control,input,boot,bootHdd,launchEditor,setText,open,save,end,run,disk,exit,unchangedFd,shot,dragToMaximum,pass,finish,fail,closeContext:()=>ctx.close(),close:()=>browser.close(),page:()=>page,output};
}
