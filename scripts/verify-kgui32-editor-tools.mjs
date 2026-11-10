import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {toolsHarness,fnv,sha} from './kgui32-tools-harness.mjs';
import {withHddFile,assertHddProtected} from './kgui32-hdd-fat.mjs';
const [base='http://127.0.0.1:4173/',output='test-results/editor-tools',video='pegc']=process.argv.slice(2);
const h=await toolsHarness(base,output,video);
const original=Buffer.from('alpha beta alpha\nline two\n'),replaced='X beta X\nline two\n';
const view=Buffer.from('W'.repeat(80)+'\n'+Array.from({length:44},(_,i)=>'ROW '+String(i).padStart(2,'0')+' / short line\n').join(''));
let fixture=withHddFile(h.hdd,'EDIT.TXT',original);fixture=withHddFile(fixture,'VIEW.TXT',view);fixture=withHddFile(fixture,'MAX.TXT',Buffer.alloc(65536,97));fixture=withHddFile(fixture,'MAXLF.TXT',Buffer.concat([Buffer.alloc(65535,97),Buffer.from('\n')]));
const texts=(s,id=0)=>s.canvases[id]?.texts??[];
async function findOpen(replace=false){await h.focus(0);if(replace)await h.chord('CTRL','H');else await h.key('CTRL+F');return h.until(s=>s.editors[0]?.mode===5&&s.canvases[0]?.controls.includes(replace?842:840),'Find/Replace dialog');}
let query='',replacement='';
async function queryText(value){await h.input(0,40,46,value,query.length);query=value;}
async function replacementText(value){await h.input(0,40,90,value,replacement.length);replacement=value;}
async function tools(code){await h.control(0,605);await h.until(s=>s.editors[0]?.mode===7,'Tools menu');await h.control(0,code);return h.until(s=>s.editors[0]?.mode===0,'Tools action');}
async function doc(value){return h.until(s=>s.editors[0]?.bytes===value.length&&s.editors[0]?.hash===fnv(value),'Document contents');}
async function media(){const saved=await h.disk('hdd');await h.unchangedFd();return {saved,state:assertHddProtected(fixture,saved)};}
async function normal(){
 const vector=await h.boot(fixture);await h.launchEditor();await h.open(0,'EDIT.TXT');let s=await doc(original.toString());const generation=s.cpu.views[0].generation;
 // Legacy clock remains independently scheduled while the new Editor tools run.
 await h.key('F2');await h.click(268,192);s=await h.until(s=>s.apps[1]?.magic===0x324b474b&&s.apps[1].frames>0,'Legacy clock peer');const seconds=s.apps[1].seconds;assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);await h.focus(0);
 await findOpen();await queryText('alpha');await h.control(0,840);s=await h.until(s=>s.editors[0]?.mode===0&&s.editors[0].anchor===0&&s.editors[0].cursor===5,'First literal match');assert.equal(s.editors[0].dirty,0);
 await h.key('F3');await h.until(s=>s.editors[0]?.anchor===11&&s.editors[0].cursor===16,'Next literal match');await h.key('F3');await h.until(s=>s.editors[0]?.anchor===0&&s.editors[0].cursor===5,'Find wraps');
 const selected=(await h.inspect()).editors[0];await findOpen();await queryText('missing');await h.control(0,840);await h.until(s=>texts(s).includes('Not found'),'Failed search');await h.control(0,843);s=await h.until(s=>s.editors[0]?.mode===0,'Find cancel');for(const k of ['hash','bytes','dirty','history','anchor','cursor'])assert.equal(s.editors[0][k],selected[k]);
 await findOpen(true);await queryText('alpha');await replacementText('X');await h.control(0,842);s=await doc(replaced);assert.equal(s.editors[0].mode,0);assert.equal(s.editors[0].dirty,1);assert.equal(s.editors[0].history,selected.history+1);
 await h.key('CTRL+Z');s=await doc(original.toString());assert.equal(s.editors[0].dirty,0);await h.key('CTRL+Y');await doc(replaced);
 // A physical held Shift selects, while Ctrl+H opens Replace and Backspace edits.
 await h.key('HOME');await h.until(s=>s.editors[0]?.anchor===0&&s.editors[0].cursor===0,'Selection home');await h.chord('SHIFT','RIGHT');s=await h.until(s=>s.editors[0]?.anchor===0&&s.editors[0].cursor===1,'Shift Right selection');assert.equal(s.editors[0].hash,fnv(replaced));
 await h.chord('SHIFT','HELP');await h.until(s=>s.editors[0]?.anchor===0&&s.editors[0].cursor===8,'Shift End selection');await h.key('BS');await doc('\nline two\n');await h.key('CTRL+Z');await doc(replaced);
 const before=(await h.inspect()).editors[0];await findOpen(true);await h.control(0,843);s=await h.until(s=>s.editors[0]?.mode===0,'Replace cancel');for(const k of ['hash','bytes','history','dirty'])assert.equal(s.editors[0][k],before[k]);
 await tools(624);await h.until(s=>texts(s).some(t=>t.includes('CRLF /')),'CRLF selected');await h.save(0,Buffer.from(replaced));let m=await media();assert.equal(m.state.files.get('WORK/EDIT.TXT').toString(),replaced.replaceAll('\n','\r\n'));
 await tools(623);await h.until(s=>s.editors[0]?.dirty===1&&texts(s).some(t=>/^(?:Modified \/ )?LF \//.test(t)),'Format-only dirty');await h.key('CTRL+Z');await h.until(s=>!s.editors[0]?.dirty&&texts(s).some(t=>t.includes('CRLF /')),'Format undo restores saved state');await h.key('CTRL+Y');await h.until(s=>s.editors[0]?.dirty===1&&texts(s).some(t=>/^(?:Modified \/ )?LF \//.test(t)),'Format redo');await h.save(0,Buffer.from(replaced));m=await media();assert.equal(m.state.files.get('WORK/EDIT.TXT').toString(),replaced);
 h.pass('Literal wrapped search/cancel, single-step Replace All undo/redo, real Shift selection, Ctrl+H versus Backspace, LF/CRLF save and format dirty/history');
 // Maximum replacement and serialization are refused before changing text/media.
 await h.open(0,'MAX.TXT');s=await h.until(s=>s.editors[0]?.bytes===65536,'Full document');const full=s.editors[0];await findOpen(true);await queryText('a');await replacementText('aa');await h.control(0,842);s=await h.until(s=>texts(s).includes('Replacement exceeds 64 KiB'),'Oversized All refused');for(const k of ['hash','bytes','dirty','history'])assert.equal(s.editors[0][k],full[k]);await h.control(0,843);await h.until(s=>s.editors[0]?.mode===0,'Limit dialog cancelled');
 await h.open(0,'MAXLF.TXT');const old=(await h.inspect()).editors[0];await tools(624);await h.key('CTRL+S');s=await h.until(s=>s.editors[0]?.error===27&&texts(s).includes('Serialized text exceeds 64 KiB'),'Encoded CRLF limit refused');assert.equal(s.editors[0].hash,old.hash);assert.equal(s.editors[0].bytes,65536);assert.equal(s.editors[0].dirty,1);await h.key('ESC');await h.key('CTRL+Z');await h.until(s=>!s.editors[0]?.dirty,'Undo format after failed save');
 m=await media();assert.deepEqual(m.state.files.get('WORK/MAX.TXT'),Buffer.alloc(65536,97));assert.deepEqual(m.state.files.get('WORK/MAXLF.TXT'),Buffer.concat([Buffer.alloc(65535,97),Buffer.from('\n')]));
 h.pass('Overflowing Replace All and CRLF serialization retain full 64 KiB text, history and on-disk originals');
 await h.open(0,'VIEW.TXT');await doc(view.toString());s=await h.dragToMaximum(0);await h.until(s=>s.canvases[0]?.draws.some(d=>d.x>=384&&d.y===40),'Expanded horizontal text run');s=await h.inspect();assert(s.canvases[0].width>576);assert(s.canvases[0].count<=40);assert(s.canvases[0].controls.includes(605));if(video==='cirrus'){assert.equal(s.canvases[0].height,416);assert(s.canvases[0].draws.some(d=>d.y>=344&&d.y<384),'more than fourteen visible rows');}
 const frame=(await h.inspect()).editors[0].frames;await h.key('CTRL+A');s=await h.until(s=>s.editors[0]?.anchor===0&&s.editors[0].cursor===view.length&&s.editors[0].frames>frame,'Maximum viewport selection');assert.equal(s.editors[0].hash,fnv(view));assert(s.canvases[0].count<=40);assert.equal(s.cpu.views[0].generation,generation);assert.equal(s.cpu.diagnostics[0].frame.cs,59);assert.equal(s.cpu.diagnostics[0].frame.eflags&0x20000,0);assert(s.apps[1].seconds!==seconds);
 await h.shot('expanded-selected-editor.png');m=await media();assert.deepEqual(m.state.files.get('WORK/VIEW.TXT'),view);await h.exit(vector);await h.unchangedFd();await writeFile(join(output,'editor-tools.thd'),m.saved);await h.closeContext();h.pass('Expanded native viewport, split long text, complete bounded selected frame, isolated clock progress and full resource reclamation');
 const cold=await h.boot(m.saved);await h.launchEditor();await h.open(0,'EDIT.TXT');await doc(replaced);await h.until(s=>texts(s).some(t=>/^(?:Modified \/ )?LF \//.test(t)),'Saved LF after cold boot');assert.equal(sha(await h.disk('hdd')),sha(m.saved));await h.exit(cold);await h.unchangedFd();await h.closeContext();h.pass('Edited bytes and line ending choice survive save/export/cold boot');
}
try{await normal();await h.finish();}catch(e){await h.fail(e);throw e;}finally{await h.close();}
