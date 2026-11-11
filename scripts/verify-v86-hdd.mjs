// Real native V86 services, keyboard input and exported media; no server started.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {toolsHarness,sha,fnv} from './kgui32-tools-harness.mjs';
import {inspectFat} from './kgui32-workspace-fat.mjs';
import {withAppFile,probe} from './v86-hdd-fixtures.mjs';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/v86-hdd',video='pegc',suite='hdd']=process.argv.slice(2);
assert(['hdd','isolation','fallback'].includes(suite));const h=await toolsHarness(base,output,video);assert.equal(h.manifest.v86_hdd_read_only,1);
const fd=inspectFat(h.fd),program=fd.files.get('VDOS.EXE');assert(program?.length);assert.equal(program.subarray(28,36).toString(),'K386APP1');
const raw=Buffer.from(Array.from({length:70001},(_,i)=>i%251));
let bytes=withAppFile(h.hdd,'HDDRUN.EXE',program);bytes=withAppFile(bytes,'HDDCHLD.EXE',program);bytes=withAppFile(bytes,'VDATA.BIN',raw);bytes=withAppFile(bytes,'OPEN.TXT',Buffer.from('Writable attributes / read-only V86 broker\r\n'),32);bytes=withAppFile(bytes,'DOSCMD.COM',fd.files.get('COMMAND.COM'));bytes=withAppFile(bytes,'HDBAD.EXE',Buffer.from('MZ'));bytes=withAppFile(bytes,'VDOS.EXE',Buffer.from('MZ'));
const snapshots=[];
function capture(label,s){snapshots.push({label,cpu:s.cpu,resources:s.resources,profile:probe(s),peer:probe(s,1)});}
function good(s,id=0,min=1){const p=probe(s,id);assert(p,'guest-produced V86 snapshot');assert.equal(p.error,0,JSON.stringify(p));assert(p.checks>=min,JSON.stringify(p));assert.equal(s.cpu.views[id].kind,0);assert(s.cpu.diagnostics[id].frame.eflags&0x20000);return p;}
async function ended(id=0){return h.until(s=>s.cpu.views[id].state===0&&probe(s,id)?.stage===9,'V86 probe complete '+id);}
async function end(id=0){await h.focus(id);await h.key('CTRL+E');return h.until(s=>s.cpu.views[id].state===0,'End native V86 '+id);}
async function shell(id=0){await h.key('F2');await h.click(130,230);return h.until(s=>s.cpu.views[id].kind===0&&s.cpu.views[id].state===2&&s.cpu.views[id].screen.includes('K386 DOS shell'),'V86 shell '+id);}
const rows=v=>Array.from({length:25},(_,i)=>v.screen.slice(i*80,i*80+80).trim()).filter(Boolean);
async function command(id,text,prompt){await h.focus(id);const before=await h.inspect(),events=before.gui.app.events,echo=rows(before.cpu.views[id]).at(-1)+text;await h.type(text+'\r');return h.until(s=>s.gui.app.events>events&&s.cpu.views[id].state===2&&s.cpu.views[id].keys===0&&s.cpu.views[id].screen.includes(echo)&&rows(s.cpu.views[id]).at(-1)===prompt,'V86 shell '+text);}
async function invalid(command){await h.focus(0);const before=await h.inspect();await h.key('CTRL+L');await h.type(command+'\r');const s=await h.until(s=>s.gui.rejected>before.gui.rejected,'Rejected '+command);assert.equal(s.cpu.views[0].generation,before.cpu.views[0].generation);assert.equal(s.cpu.views[0].state,before.cpu.views[0].state);assert.equal(s.cpu.views[0].screen,before.cpu.views[0].screen);await h.key('ESC');return s;}
async function unchanged(expected=bytes){await h.unchangedFd();assert.equal(sha(await h.disk('hdd')),sha(expected),'HDD is byte-identical after V86 reads/denials');}
async function clock(){await h.key('F2');await h.click(268,192);return h.until(s=>s.cpu.views[1].kind===1&&s.apps[1]?.magic===0x324b474b&&s.apps[1].frames>0,'PM32 clock peer');}
async function normal(){
 const vector=await h.boot(bytes);await shell();await end();const peer=await clock(),seconds=peer.apps[1].seconds;
 await h.run(0,'HDDRUN.EXE');let s=await h.until(s=>probe(s)?.stage===3||[0,4].includes(s.cpu.views[0].state),'Nested HDD child wait');const child=good(s,0,6);assert.equal(child.stage,3);assert.equal(child.environment,1501);const childPSP=s.cpu.views[0].psp;assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);assert.notEqual(s.cpu.views[0].physical,s.cpu.views[1].physical);capture('HDD child and streamed long environment',s);
 await h.key('Q');s=await ended();const parent=good(s,0,64);assert.equal(s.cpu.views[0].exit,0);assert.equal(parent.bytes,raw.length);assert.equal(parent.hash,fnv(raw));assert.notEqual(childPSP,s.cpu.views[0].psp);assert.notEqual(s.apps[1].seconds,seconds);assert.equal(s.resources.usage[0].handles,0);capture('HDD parent after child closes inherited handle',s);
 h.pass('Actual V86 HDD 70,001-byte reads/seek, device/foreign/write denial, private drives/CWD, owned DTA, nested EXEC, inherited file cursor and >1 KiB environment; isolated PM32 clock progresses');
 await h.run(0,'VDOS.EXE FD');s=await ended();good(s,0,5);assert.equal(probe(s).drive,0);assert.equal(s.cpu.views[0].exit,0);h.pass('Existing FD-root executable wins over corrupt same-name HDD file');
 await h.run(0,'DOSCMD.COM /C VER');s=await h.until(s=>s.cpu.views[0].state===0&&s.cpu.views[0].screen.includes('MS-DOS Version 4.00'),'Original HDD COMMAND.COM');assert.equal(s.cpu.views[0].exit,0);assert.equal(s.cpu.views[0].kind,0);capture('Original DOS program loaded from HDD',s);
 await invalid('HDBAD.EXE');await invalid('NOTFOUND.EXE');await unchanged();await h.shot('v86-hdd.png');await h.exit(vector);await unchanged();await h.closeContext();h.pass('Original DOS program on HDD, invalid/missing load generation retention, byte-identical FD/HDD and complete DOS/XMS/handle/vector reclamation');
}
async function isolation(){
 const vector=await h.boot(bytes);await shell();await end();await h.run(0,'HDDRUN.EXE HOLD');let s=await h.until(s=>probe(s)?.stage===5&&s.cpu.views[0].state===2,'Held HDD handle');const held=good(s,0,3),letter=String.fromCharCode(65+held.drive),generation=s.cpu.views[0].generation;assert(s.resources.usage[0].handles>=6);
 await shell(1);await command(1,letter+':',letter+':\\>');await command(1,'CD \\',letter+':\\>');await command(1,'A:','A:\\>');s=await h.inspect();assert.equal(s.cpu.views[0].generation,generation);assert.equal(probe(s).drive,held.drive);assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);capture('Two private V86 drive states',s);
 await h.focus(0);await h.key('Q');s=await ended();good(s,0,6);assert.equal(s.cpu.views[0].exit,0);h.pass('Two actual V86 contexts retain distinct default drives and per-drive CWDs while one owns a live HDD file');
 await end(1);await h.run(1,'KGCLOCK.EXE');await h.until(s=>s.apps[1]?.magic===0x324b474b&&s.apps[1].frames>0,'Clock after V86 peer');
 await h.run(0,'HDDRUN.EXE HOLD');s=await h.until(s=>probe(s)?.stage===5&&s.cpu.views[0].state===2,'Force-end live HDD owner');good(s,0,3);await end();s=await h.until(s=>s.resources.usage[0].handles===0&&s.resources.usage[0].memoryKiB===0,'Forced cleanup of HDD owner');capture('Forced End reclaims HDD ownership',s);
 await h.run(0,'HDDRUN.EXE X');s=await h.until(s=>probe(s)?.stage===5&&s.cpu.views[0].state===2,'Fault owner holds HDD handle');good(s,0,3);const seconds=s.apps[1].seconds;await h.key('Q');s=await h.until(s=>s.cpu.views[0].state===4,'Read-only firmware page fault');assert.equal(s.cpu.views[0].fault,14);assert.equal(s.resources.usage[0].handles,0);await h.until(s=>s.apps[1].seconds!==seconds,'PM32 peer survives V86 fault');capture('Fault reclaims file and retains peer',s);await end();
 await h.run(0,'VDOS.EXE FD');s=await ended();good(s,0,5);assert.equal(probe(s).drive,0);await unchanged();await h.shot('v86-isolation.png');await h.exit(vector);await unchanged();await h.closeContext();h.pass('Forced End and actual V86 fault reclaim HDD handles; fresh FD restart resets private drive state, PM32 peer survives, all media and final resources remain intact');
}
async function fallback(){
 for(const foreign of [false,true]){
  const disk=foreign?Buffer.from(bytes):null;if(disk)disk[528]^=1;
  const vector=await h.boot(disk,h.legacy);await shell();await end();await h.run(0,'VDOS.EXE FDN');let s=await ended();good(s,0,7);assert.equal(probe(s).drive,0);assert.equal(s.cpu.views[0].exit,0);
  await invalid('B:\\APPS\\HDDRUN.EXE');await invalid('HDDRUN.EXE');await h.unchangedFd();if(disk)assert.equal(sha(await h.disk('hdd')),sha(disk));capture(foreign?'Foreign HDD refused':'No HDD FD compatibility',s);
  await h.exit(vector);await h.unchangedFd();if(disk)assert.equal(sha(await h.disk('hdd')),sha(disk));await h.closeContext();h.pass(foreign?'Foreign HDD cannot authorize a V86 drive; FD reads and complete cleanup preserve both media':'Explicit standalone FD remains functional without HDD; HDD selection/launch is refused without changing generation or media');
 }
}
try{if(suite==='hdd')await normal();if(suite==='isolation')await isolation();if(suite==='fallback')await fallback();await writeFile(join(output,'snapshots.json'),JSON.stringify(snapshots,null,2)+'\n');await h.finish();}catch(e){await writeFile(join(output,'snapshots.json'),JSON.stringify(snapshots,null,2)+'\n');await h.fail(e);throw e;}finally{await h.close();}
