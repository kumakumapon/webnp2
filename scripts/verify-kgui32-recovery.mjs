import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {toolsHarness,sha,fnv} from './kgui32-tools-harness.mjs';
import {withHddFile,inspectHdd,assertHddProtected} from './kgui32-hdd-fat.mjs';
import {inspectFat,assertProtected} from './kgui32-workspace-fat.mjs';
import {withFdWorkFile,withFaultHook} from './kgui32-tools-fixtures.mjs';
const [base='http://127.0.0.1:4173/',output='test-results/recovery',video='pegc']=process.argv.slice(2);
const h=await toolsHarness(base,output,video);
const texts=(s,id)=>s.canvases[id]?.texts??[];
async function recovery(id){await h.focus(id);await h.key('CTRL+T');return h.until(s=>s.editors[id]?.mode===6&&s.canvases[id]?.controls.includes(850)&&texts(s,id).includes('NOTE.TXT'),'Recovery candidates');}
async function inspectCandidate(id,expected){await h.control(id,850);return h.until(s=>s.canvases[id]?.controls.includes(860)&&texts(s,id).includes(expected),'Candidate bytes');}
async function destination(id,name){const s=await h.inspect();await h.input(id,112,s.canvases[id].height-96,name);}
async function prepare(id,name){await destination(id,name);await h.control(id,860);return h.until(s=>s.canvases[id]?.controls.includes(870)&&texts(s,id).includes(name),'Explicit move confirmation');}
async function closeRecovery(id){await h.control(id,862);return h.until(s=>s.editors[id]?.mode===0,'Recovery closed');}
function preserved(s,id,before){const e=s.editors[id];for(const k of ['hash','bytes','dirty','history','redo'])assert.equal(e[k],before[k],k);}
async function media(before){const saved=await h.disk('hdd');await h.unchangedFd();return {saved,state:assertHddProtected(before,saved)};}
function fixture(){let b=withHddFile(h.hdd,'NOTE.TXT',Buffer.from('original\n'));b=withHddFile(b,'NOTE.BAK',Buffer.from('backup version\n'));return withHddFile(b,'NOTE.TMP',Buffer.from('draft version\n'));}
async function negativeProbes(){
 await h.launchEditor(1);await h.end(1);
 for(const [name,minimum] of [['KGRECNEG.EXE',30],['KGRECNON.EXE',1]]){
  const gen=(await h.inspect()).cpu.views[1].generation;await h.run(1,name);const s=await h.until(s=>s.cpu.views[1].generation>gen&&s.cpu.views[1].state===0&&s.cpu.diagnostics[1].pm32?.samples[0]===0x3552474b,'CPL3 '+name);
  assert(s.cpu.diagnostics[1].pm32.samples[2]>=minimum);assert.equal(s.cpu.diagnostics[1].pm32.samples[3],0,JSON.stringify(s.cpu.diagnostics[1].pm32.samples));assert.equal(s.cpu.diagnostics[1].pm32.exitCode,0);assert.equal(s.cpu.diagnostics[1].pm32.openFiles,0);
 }
}
async function normal(){
 const bytes=fixture(),vector=await h.boot(bytes);await h.launchEditor();await negativeProbes();await h.open(0,'NOTE.TXT');await h.setText(0,'unsaved source\n');await h.key('CTRL+S');
 await h.until(s=>s.editors[0]?.error===117,'Save reports existing BAK');await h.key('ESC');const before=(await h.inspect()).editors[0],generation=(await h.inspect()).cpu.views[0].generation;
 await recovery(0);await inspectCandidate(0,'backup version');await prepare(0,'RESCUED.TXT');await h.control(0,871);await h.until(s=>s.canvases[0]?.controls.includes(860),'Cancel recovery');
 preserved(await h.inspect(),0,before);assert.equal(sha(await h.disk('hdd')),sha(bytes));
 await prepare(0,'NOTE.TXT');await h.control(0,870);let s=await h.until(s=>texts(s,0).some(t=>t.startsWith('Destination exists')),'Existing TXT refused');preserved(s,0,before);assert.equal(sha(await h.disk('hdd')),sha(bytes));
 // A second recovery owner changes another member of the revision set.
 await h.launchEditor(1);await h.setText(1,'peer document');const peer=(await h.inspect()).editors[1];
 await recovery(1);await inspectCandidate(1,'backup version');await h.control(1,852);await h.until(s=>texts(s,1).includes('draft version'),'Peer TMP preview');await prepare(1,'PEERTMP.TXT');await h.control(1,870);
 await h.until(s=>texts(s,1).includes('PEERTMP.TXT')&&texts(s,1).some(t=>t.startsWith('Recovered as')),'Peer explicit TMP recovery');await closeRecovery(1);
 await h.focus(0);await prepare(0,'RESCUED.TXT');await h.control(0,870);s=await h.until(s=>texts(s,0).some(t=>t.startsWith('Changed:')),'Stale revision refused');preserved(s,0,before);preserved(s,1,peer);assert.equal(s.cpu.views[0].generation,generation);assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);
 let m=await media(bytes);assert.equal(m.state.files.get('WORK/NOTE.TXT').toString(),'original\n');assert.equal(m.state.files.get('WORK/NOTE.BAK').toString(),'backup version\n');assert.equal(m.state.files.get('WORK/PEERTMP.TXT').toString(),'draft version\n');assert(!m.state.files.has('WORK/RESCUED.TXT'));
 await h.shot('stale-recovery-keeps-documents.png');
 await h.control(0,861);await h.until(s=>s.canvases[0]?.controls.includes(850)&&texts(s,0).includes('NOTE.TXT'),'Fresh recovery list');await inspectCandidate(0,'backup version');await prepare(0,'RESCUED.TXT');await h.control(0,870);
 s=await h.until(s=>texts(s,0).includes('RESCUED.TXT')&&texts(s,0).some(t=>t.startsWith('Recovered as')),'Backup recovered to unused TXT');preserved(s,0,before);preserved(s,1,peer);await closeRecovery(0);
 await h.save(0,Buffer.from('unsaved source\n'));m=await media(bytes);assert.equal(m.state.files.get('WORK/NOTE.TXT').toString(),'unsaved source\n');assert.equal(m.state.files.get('WORK/RESCUED.TXT').toString(),'backup version\n');assert.equal(m.state.files.get('WORK/PEERTMP.TXT').toString(),'draft version\n');assert(!m.state.files.has('WORK/NOTE.BAK'));assert(!m.state.files.has('WORK/NOTE.TMP'));
 // End the explicitly dirty peer only after checking both documents.
 await h.end(1);
 assert.equal(sha(await h.disk('hdd')),sha(m.saved));await h.exit(vector);await h.unchangedFd();await writeFile(join(output,'recovered.thd'),m.saved);await h.closeContext();
 h.pass('TMP/BAK previews, cancel, exclusive target and stale state refusal; two dirty documents retained; explicit native recovery, subsequent Save, real CPL3 negative probes and complete cleanup');
 const cold=await h.boot(m.saved);await h.launchEditor();await h.open(0,'RESCUED.TXT');await h.until(s=>s.editors[0]?.hash===fnv('backup version\n'),'Recovered copy after cold boot');assert.equal(sha(await h.disk('hdd')),sha(m.saved));await h.exit(cold);await h.unchangedFd();await h.closeContext();h.pass('Recovered bytes persist across cold boot and reopen');
}
async function fallback(){
 let floppy=withFdWorkFile(h.legacy,'NOTE.TMP',Buffer.from('orphan FD draft\r\n'));floppy=withFdWorkFile(floppy,'DENIED.BAK',Buffer.from('protected original\n'),1);
 const vector=await h.boot(null,floppy);await h.launchEditor();await h.setText(0,'live FD document');const live=(await h.inspect()).editors[0];
 await recovery(0);await inspectCandidate(0,'orphan FD draft');assert((await h.inspect()).canvases[0].texts.includes('TXT absent'));
 await prepare(0,'NOTE.TXT');await h.control(0,870);let s=await h.until(s=>texts(s,0).includes('NOTE.TXT')&&texts(s,0).some(t=>t.startsWith('Recovered as')),'Orphan restored to original TXT');preserved(s,0,live);
 // Remaining protected BAK is visible but cannot be previewed or restored.
 await h.until(s=>s.canvases[0]?.controls.includes(850)&&texts(s,0).includes('DENIED.TXT'),'Protected candidate list');await h.control(0,850);await h.control(0,853);await h.until(s=>texts(s,0).some(t=>t.startsWith('Protected file')),'Protected BAK refused');await h.control(0,860);await h.until(s=>!s.canvases[0]?.controls.includes(870),'No protected move confirmation');preserved(await h.inspect(),0,live);
 await closeRecovery(0);await h.end(0);await h.exit(vector);const saved=await h.disk('fd1'),state=assertProtected(floppy,saved);assert.equal(state.files.get('WORK/NOTE.TXT').toString(),'orphan FD draft\r\n');assert(!state.files.has('WORK/NOTE.TMP'));assert.equal(state.files.get('WORK/DENIED.BAK').toString(),'protected original\n');assert.deepEqual(state.entries.get('WORK/DENIED.BAK').raw,inspectFat(floppy).entries.get('WORK/DENIED.BAK').raw);await writeFile(join(output,'recovered-fallback.xdf'),saved);await h.closeContext();
 h.pass('Explicit FD Work fallback restores orphan TMP byte-for-byte, preserves dirty Editor and protected BAK, FAT12 boot files and resources');
}
async function driver(){return h.page().evaluate(()=>{const b=atob(window.np2debug.np2.readMemoryBase64(0x1000,0x9f000).base64),w=i=>b.charCodeAt(i)|b.charCodeAt(i+1)<<8,d=i=>(w(i)|w(i+2)<<16)>>>0;for(let at=b.indexOf('KHDDIOP1');at>=0;at=b.indexOf('KHDDIOP1',at+1))if(w(at+8)===1&&w(at+10)===64&&w(at+12)===1)return {biosErrors:d(at+44),partial:d(at+56)};return null;});}
async function fault(){
 const raw=Buffer.from('retain bytes on device error\n'),bytes=withHddFile(h.hdd,'NOTE.TMP',raw),floppy=withFaultHook(h.fd),vector=await h.boot(bytes,floppy);await h.launchEditor();await h.setText(0,'unsaved on I/O error');const live=(await h.inspect()).editors[0];
 await recovery(0);await inspectCandidate(0,'retain bytes on device error');await prepare(0,'NOTE.TXT');assert.equal((await driver()).biosErrors,0);await h.control(0,870);await h.until(s=>texts(s,0).some(t=>t.startsWith('Recovered as')||t.startsWith('I/O error')),'Device recovery outcome');const record=await driver();assert.equal(record.biosErrors,1);assert.equal(record.partial,1);preserved(await h.inspect(),0,live);
 const m=await media(bytes),retained=m.state.files.get('WORK/NOTE.TMP')??m.state.files.get('WORK/NOTE.TXT');assert.deepEqual(retained,raw);await h.shot('recovery-device-error.png');await closeRecovery(0);await h.end(0);await h.exit(vector);await h.unchangedFd();await h.closeContext();h.pass('Real INT1Bh partial write failure retains complete candidate bytes, dirty document, protected media and handle/vector ownership');
}
try{await normal();await fallback();await fault();await h.finish();}catch(e){await h.fail(e);throw e;}finally{await h.close();}
