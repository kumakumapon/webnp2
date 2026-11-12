// CI browser client only. This script never starts a server.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {toolsHarness,sha,fnv} from './kgui32-tools-harness.mjs';
import {inspectHdd,assertHddProtected} from './kgui32-hdd-fat.mjs';
import {withAppFile,probe} from './v86-hdd-fixtures.mjs';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/hdd-boot',video='pegc',suite='boot']=process.argv.slice(2);
assert(['boot','v86','rejection'].includes(suite));
const h=await toolsHarness(base,output,video),profile=h.manifest.standalone_hdd;
assert(profile?.hdd_boot_supported&&!profile.fd_required&&profile.dos_boot_drive==='A:');
const original=await readFile(new URL('../public/kgui32/'+profile.image,import.meta.url));assert.equal(sha(original),profile.sha256);
const snapshots=[];
const capture=(label,s)=>snapshots.push({label,cpu:s.cpu,resources:s.resources,editors:s.editors,profile:probe(s)});
async function screen(){const p=h.page();if(!p)return '';const b=Buffer.from((await p.evaluate(()=>window.np2debug.np2.readMemoryBase64(0xa0000,4000))).base64,'base64');return Array.from({length:25},(_,r)=>Array.from({length:80},(_,c)=>String.fromCharCode(b[(r*80+c)*2])).join('')).join('\n');}
async function textUntil(pattern,label){console.log('CHECK',label);let text='';for(let end=Date.now()+120000;Date.now()<end;){text=await screen().catch(()=>'');if(pattern.test(text))return text;await h.page().waitForTimeout(100);}throw Error(label+' '+text);}
async function same(bytes){await h.unchangedFd();assert.equal(sha(await h.disk('hdd')),sha(bytes),'Entire HDD unchanged');}
async function shell(id=0){await h.key('F2');await h.click(130,230);return h.until(s=>s.cpu.views[id].kind===0&&s.cpu.views[id].state===2&&s.cpu.views[id].screen.includes('K386 DOS shell'),'HDD V86 shell '+id);}
async function end(id=0){await h.focus(id);await h.key('CTRL+E');return h.until(s=>s.cpu.views[id].state===0,'End V86 '+id);}
function good(s,min=1){const p=probe(s);assert(p,'executing V86 PSP evidence');assert.equal(p.error,0,JSON.stringify(p));assert(p.checks>=min,JSON.stringify(p));assert.equal(p.drive,0);assert.equal(s.cpu.views[0].kind,0);assert(s.cpu.diagnostics[0].frame.eflags&0x20000);return p;}
function location(s,id=0,hdd=true){assert.equal(s.editors[id].workspace>>>8,0);assert.equal(s.editors[id].workspace&3,hdd?1:2);assert.equal(s.cpu.diagnostics[id].frame.cs,59);assert.notEqual(s.cpu.views[id].cr3,s.gui.cpu.pd);}

async function boot(){
 let vector=await h.bootHdd();await h.unchangedFd();assert(!new URL(h.page().url()).searchParams.has('fd1'));await h.launchEditor();let s=await h.inspect();location(s);
 const document='HDD boot document\nSecond line\n';await h.setText(0,document);await h.key('CTRL+S');await h.until(s=>s.editors[0]?.mode===3&&s.canvases[0]?.texts.some(t=>t.includes('A:\\WORK')),'Native A: HDD save picker');
 await h.key('HOME');for(let i=0;i<12;i++)await h.key('DEL');await h.type('BOOTDOC.TXT');await h.key('ENTER');s=await h.until(s=>s.editors[0]?.mode===0&&!s.editors[0].dirty&&s.editors[0].hash===fnv(document),'Native HDD save');capture('HDD A: Editor saved',s);
 await h.key('F2');await h.click(268,230);s=await h.until(s=>s.apps[1]?.magic===0x3246474b&&s.apps[1].frames>0,'HDD Files peer');assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);
 const saved=await h.disk('hdd');assert.equal(assertHddProtected(original,saved).files.get('WORK/BOOTDOC.TXT').toString(),document);await h.unchangedFd();await h.shot('hdd-boot-files-editor.png');await h.exit(vector);assertHddProtected(original,await h.disk('hdd'));await h.closeContext();h.pass('Shipping HDD boots without either FD; real CPL3 APPS, verified A: Work save and complete GUI/DOS/XMS/handle/vector cleanup');
 vector=await h.bootHdd(saved);await h.launchEditor();location(await h.inspect());await h.open(0,'BOOTDOC.TXT');s=await h.until(s=>s.editors[0]?.hash===fnv(document),'HDD document survives cold boot');capture('Cold boot HDD readback',s);await same(saved);await h.shot('hdd-boot-cold.png');await h.exit(vector);await same(saved);
 // Run the original native block-driver probe in real DOS after GUI teardown.
 await textUntil(/DOS fallback: type KDESK/,'Real DOS after HDD GUI');const before=await h.page().evaluate(()=>window.np2debug.np2.readMemoryBase64(0x1b*4,4).base64);await h.type('HDDTEST B\r');const text=await textUntil(/BOUNDS PASS/,'Native HDD transport bounds, 64K crossing, verify and partial failure');assert(text.includes('HDD DRIVE=A BPS=1024 SPC=4 CLUSTERS=10116'));assert.equal(await h.page().evaluate(()=>window.np2debug.np2.readMemoryBase64(0x1b*4,4).base64),before);await same(saved);await h.page().screenshot({path:join(output,'hdd-native-bounds.png')});await writeFile(join(output,'saved.thd'),saved);await h.closeContext();
 h.pass('Cold boot retains Work and immutable system/APPS files; actual built-in KHD98 driver passes native bounds/crossing/write-verify/partial-I/O tests and restores INT1B without media changes');
}

async function v86(){
 const fat=inspectHdd(original),program=fat.files.get('VDOS.EXE');assert(program);const raw=Buffer.from(Array.from({length:70001},(_,i)=>i%251));
 let bytes=withAppFile(original,'HDDRUN.EXE',program);bytes=withAppFile(bytes,'HDDCHLD.EXE',program);bytes=withAppFile(bytes,'VDATA.BIN',raw);bytes=withAppFile(bytes,'OPEN.TXT',Buffer.from('Writable attributes / protected broker\n'),32);bytes=withAppFile(bytes,'DOSCMD.COM',fat.files.get('COMMAND.COM'));
 const vector=await h.bootHdd(bytes);await shell();await end();await h.run(0,'HDDRUN.EXE');let s=await h.until(s=>probe(s)?.stage===3||[0,4].includes(s.cpu.views[0].state),'A: nested child waits');const child=good(s,6);assert.equal(child.stage,3);assert.equal(child.environment,1501);const childPSP=s.cpu.views[0].psp;capture('HDD-only V86 child',s);
 await h.key('F2');await h.click(268,192);s=await h.until(s=>s.apps[1]?.magic===0x324b474b&&s.apps[1].frames>0,'HDD PM32 clock peer');const seconds=s.apps[1].seconds;assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);await h.focus(0);await h.key('Q');s=await h.until(s=>s.cpu.views[0].state===0&&probe(s)?.stage===9,'HDD V86 parent complete');const parent=good(s,64);assert.equal(parent.bytes,70001);assert.equal(parent.hash,fnv(raw));assert.notEqual(s.cpu.views[0].psp,childPSP);assert.equal(s.cpu.views[0].exit,0);assert.equal(s.resources.usage[0].handles,0);await h.until(s=>s.apps[1].seconds!==seconds,'HDD PM32 peer progress');capture('A: parent reads complete',s);
 await h.run(0,'DOSCMD.COM /C VER');s=await h.until(s=>s.cpu.views[0].state===0&&s.cpu.views[0].screen.includes('MS-DOS Version 4.00'),'Original COMMAND on A: HDD');assert.equal(s.cpu.views[0].exit,0);await same(bytes);
 await h.run(0,'HDDRUN.EXE HOLD');s=await h.until(s=>probe(s)?.stage===5&&s.cpu.views[0].state===2,'A: held HDD file');good(s,3);assert(s.resources.usage[0].handles>=6);await end();await h.until(s=>s.resources.usage[0].handles===0&&s.resources.usage[0].memoryKiB===0,'Forced HDD handle cleanup');
 await h.run(0,'HDDRUN.EXE X');s=await h.until(s=>probe(s)?.stage===5&&s.cpu.views[0].state===2,'HDD fault owner');good(s,3);const tick=s.apps[1].seconds;await h.key('Q');s=await h.until(s=>s.cpu.views[0].state===4,'Actual V86 page fault');assert.equal(s.cpu.views[0].fault,14);assert.equal(s.resources.usage[0].handles,0);await h.until(s=>s.apps[1].seconds!==tick,'PM32 peer survives HDD fault');capture('HDD V86 fault reclaimed',s);await end();
 await h.run(0,'VDOS.EXE FD');s=await h.until(s=>s.cpu.views[0].state===0&&probe(s)?.stage===9,'Fresh boot-root process');good(s,5);await same(bytes);await h.shot('hdd-boot-v86.png');await h.exit(vector);await same(bytes);await h.closeContext();h.pass('Actual A: HDD V86 long reads/seek, private CWD, write denial, owned DTA, inherited handles, long-environment EXEC, original COMMAND, PM32 progress and force/fault/fresh-root cleanup preserve the complete disk');
}

async function rejection(){
 const state=inspectHdd(original),io=state.entries.get('IO.SYS'),ioCluster=io.cluster;
 const cases=[['foreign partition',b=>b[256+256+16]^=1,/HDD BOOT ERROR/],['unsupported BPB',b=>b[state.partition+13]^=1,/HDD BOOT ERROR/],['missing IO',b=>b[io.offset]=0xe5,/HDD BOOT ERROR/],['broken system chain',b=>{for(let i=0;i<2;i++)b.writeUInt16LE(0xffff,state.fat+i*state.fatSectors*state.bps+ioCluster*2);},/HDD BOOT ERROR/],['unbounded descriptor',b=>b.writeUInt16LE(40524,256+profile.descriptor_physical_offset+12),/HDD BOOT ERROR/],['invalid second stage',b=>b[256+4*256+3]^=1,/^H1/]];
 for(const [name,mutate,expected] of cases){const bytes=Buffer.from(original);mutate(bytes);await h.bootHdd(bytes,false);await textUntil(expected,'Refuse '+name);await same(bytes);await h.page().screenshot({path:join(output,'refused-'+name.replaceAll(' ','-')+'.png')});await h.closeContext();h.pass(name+' refuses HDD-only boot before DOS and leaves every media byte intact');}
 const vector=await h.boot(null,h.legacy);await h.launchEditor();location(await h.inspect(),0,false);await h.exit(vector);await h.unchangedFd();await h.closeContext();h.pass('Explicit standalone FD compatibility still boots and routes Work to FD without HDD');
}

try{if(suite==='boot')await boot();if(suite==='v86')await v86();if(suite==='rejection')await rejection();await writeFile(join(output,'snapshots.json'),JSON.stringify(snapshots,null,2)+'\n');await h.finish();}catch(e){await writeFile(join(output,'boot-evidence.json'),JSON.stringify({error:String(e),text:await screen().catch(()=>''),mounted:await h.page()?.evaluate(()=>window.np2debug?.np2?.getMountedImages()).catch(()=>null),snapshots},null,2)+'\n');await h.fail(e);throw e;}finally{await h.close();}
