// CI client only. All input uses real keys/mouse; observation never writes RAM.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {toolsHarness,sha} from './kgui32-tools-harness.mjs';
import {inspectTerminal} from './kgui32-terminal-inspect.mjs';
import {cgGlyph} from './kgui32-shiftjis.mjs';
const [base='http://127.0.0.1:4173/',output='test-results/terminal',video='pegc',suite='paint']=process.argv.slice(2);
assert(['paint','lifecycle'].includes(suite));
const h=await toolsHarness(base,output,video),m=h.manifest;
assert.equal(m.dos_terminal.snapshot_bytes,8032);assert.equal(m.dos_terminal.diagnostic,'TERM98.COM');
const bmp=await readFile(new URL('../public/core/font.bmp',import.meta.url)),root=new URL('../public/kgui32/',import.meta.url),original=await readFile(new URL(m.standalone_hdd.image,root));
let last;
const inspect=()=>inspectTerminal(h.page());
async function until(f,label){console.log('CHECK',label);for(let end=Date.now()+120000;Date.now()<end;){const s=await inspect();if(s){last=s;if(f(s))return s;}await h.page().waitForTimeout(100);}throw Error(label+'; see terminal-failure.json');}
const t=(s,id=0)=>s.terminals?.slots[id];
const stable=(s,id=0)=>t(s,id)?.consistent&&s.cpu.views[id].keys===0;
const published=()=>until(s=>stable(s),'published terminal state');
async function command(c,test,label,id=0){await h.focus(id);await h.type(c);return until(s=>stable(s,id)&&test(t(s,id),s),label);}
async function stop(id=0){await h.focus(id);await h.key('CTRL+E');return h.until(s=>s.cpu.views[id].state===0,'Force End '+id);}
async function run(id=0,name='TERM98.COM'){
 await h.run(id,name);return until(s=>stable(s,id)&&s.cpu.views[id].state===2&&s.cpu.views[id].screen.includes('TERM98 READY')&&t(s,id).codes[160]===0xfc26&&t(s,id).attributes[160]===0xe1,'TERM98 '+id);
}
async function start(id=0,name='TERM98.COM'){
 const s=await h.inspect();await h.click(s.gui.width-280+id*92,15);await h.until(s=>s.cpu.views[id].state===2&&s.cpu.views[id].screen.includes('K386 DOS shell'),'KSH '+id);await stop(id);
 if(name==='TERM98.COM')return run(id);await h.run(id,name);return h.until(s=>s.cpu.views[id].kind===1&&s.cpu.views[id].state===1&&s.cpu.views[id].counter>0,'PM32 peer');
}
async function rect(row,col,width=8,id=0){
 const s=await until(s=>stable(s,id),'published terminal'),w=t(s,id).window,x=w.x+8+(col-w.sx)*8,y=w.y+70+(row-w.sy)*16;
 assert(col>=w.sx&&col+width/8<=w.sx+Math.floor((w.w-16)/8)&&row>=w.sy&&row<w.sy+Math.floor((w.h-104)/16),'visible native cell');
 return h.page().evaluate(({x,y,width})=>{const source=document.querySelector('#canvas'),c=document.createElement('canvas');c.width=source.width;c.height=source.height;const g=c.getContext('2d');g.drawImage(source,0,0);return Array.from(g.getImageData(x,y,width,16).data);},{x,y,width});
}
function expected(code,attr,half=0,phase=1){
 const bits=code===32?Buffer.alloc(32):cgGlyph(bmp,code).bits,rgb=[attr&64?255:0,attr&128?255:0,attr&32?255:0],out=[];
 for(let y=0;y<16;y++){let line=(attr&1)&&(!(attr&2)||phase)?bits[half*16+y]:0;if(attr&4)line^=255;if((attr&8)&&y===15)line=255;if(attr&16)line|=8;
  for(let x=0;x<8;x++)out.push(...(line&(128>>x)?rgb:[0,0,0]),255);
 }return out;
}
// Canvas conversion can round a channel by one (PEGC white is 255,254,255).
// Keep every glyph/background bit and alpha exact; permit only that DAC LSB.
const samePixels=(got,want)=>got.length===want.length&&got.every((v,i)=>i%4===3?v===want[i]:Math.abs(v-want[i])<=1);
async function glyph(row,col,code,attr,half=0,id=0){
 const want=expected(code,attr,half);let got;for(let end=Date.now()+15000;Date.now()<end;){got=await rect(row,col,8,id);if(samePixels(got,want))return;await h.page().waitForTimeout(100);}assert.deepEqual(got,want,`actual CG-ROM cell ${row},${col} code=${code.toString(16)} attr=${attr.toString(16)}`);
}
async function initial(id=0){
 const s=await until(s=>stable(s,id),'both raw planes equal accepted GUI snapshot'),a=t(s,id);
 assert.deepEqual(a.codes.slice(160,169),[0xfc26,0,0xdc2b,0,0xec18,0,32,0xb6,0xc5]);assert.equal(a.codes[240],0xfc26);
 assert.equal(s.gui.cpu.frame.cs,59);assert(s.cpu.diagnostics[id].frame.eflags&0x20000);assert.notEqual(s.gui.cpu.pd,s.cpu.views[id].cr3);
 await h.shot('initial-'+id+'.png');
 await glyph(2,0,0x93fa,0xe1,0,id);await glyph(2,1,0x93fa,0xe1,1,id);await glyph(2,2,0x967b,0xe1,0,id);await glyph(2,4,0x8cea,0xe1,0,id);
 await glyph(2,7,0xb6,0xe1,0,id);await glyph(2,8,0xc5,0xe1,0,id);await glyph(3,0,0x93fa,0xe1,0,id);
 for(const [c,ch,a] of [[0,'R',0x41],[3,'G',0x81],[8,'B',0x21],[12,'W',0xe1]])await glyph(4,c,ch.charCodeAt(0),a,0,id);
 await glyph(5,0,82,0xe5,0,id);await glyph(5,4,85,0xe9,0,id);await glyph(5,10,72,0xe0,0,id);
 await glyph(7,0,0x93fa,0x41,0,id);await glyph(7,1,0x93fa,0x81,1,id);await glyph(8,0,86,0xf1,0,id);
 h.pass('Real V86 DOS output, split INT21/INT29 SJIS, half-width kana, both private planes, exact CG-ROM pixels and PC-98 colours/effects');
}
async function finishBoot(vector,bytes=original,floppy=false){
 assert.equal(sha(await h.disk(floppy?'fd1':'hdd')),sha(bytes),'whole media unchanged');const s=await h.exit(vector);assert.equal(s.gui.stackGuard,1,'resident protected-stack sentinel intact');await h.unchangedFd();await h.closeContext();
}
async function paintSuite(){
 const vector=await h.bootHdd();await start();await initial();
 const seen=new Set();for(let end=Date.now()+20000;Date.now()<end&&seen.size<2;){const p=await rect(6,0);for(const phase of [0,1])if(samePixels(p,expected(66,0xe3,0,phase)))seen.add(phase);await h.page().waitForTimeout(120);}assert.equal(seen.size,2,'ARTIC blink changes actual pixels without keyboard input');
 let s=await published(),before=t(s);s=await command('a',v=>v.revision!==before.revision&&v.attributes.slice(160,166).every(a=>a===0x41),'attribute-only repaint');assert.deepEqual(t(s).codes,before.codes);await glyph(2,0,0x93fa,0x41);
 before=t(s);const low=s.cpu.views[0].screen;s=await command('j',v=>v.revision!==before.revision&&v.codes[160]===0xfb26,'upper-byte-only repaint');assert.equal(s.cpu.views[0].screen,low);await glyph(2,0,0x93f9,0x41);await glyph(2,1,0x93f9,0x41,1);
 before=t(s);s=await command('r',v=>v.revision!==before.revision&&v.row===2&&v.column===1,'cursor-only text revision');await h.shot('wide-cursor.png');const p=await rect(2,0,16);const bottom=p.slice(14*16*4);assert(bottom.some((v,i)=>i%4<3&&v!==0));for(let i=0;i<32;i++)assert.deepEqual(bottom.slice(i*4,i*4+4),bottom.slice(0,4),'16-pixel cursor snaps to wide lead');
 h.pass('Blink timer, attribute-only and high-byte-only repaint, cursor-only revision and a full-width cursor on the right half');
 let w=t(s).window;await h.click(w.x+8+48+22,w.y+w.h-16);s=await until(s=>stable(s)&&t(s).window.sx===8,'horizontal scroll');await glyph(10,8,0x93fa,0xe1,1);w=t(s).window;await h.click(w.x+8+22,w.y+w.h-16);await until(s=>stable(s)&&t(s).window.sx===0,'restore horizontal scroll');
 // Resize and move through the actual desktop hit testing, then repaint pixels.
 s=await published();w=t(s).window;await h.point(w.x+w.w-8,w.y+w.h-8);await h.page().evaluate(()=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,1]));await h.point(w.x+400-8,w.y+272-8);await h.page().evaluate(()=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,0]));
 s=await until(s=>stable(s)&&t(s).window.w===400&&t(s).window.h===272,'resize DOS window');w=t(s).window;
 await h.point(w.x+180,w.y+15);await h.page().evaluate(()=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,1]));await h.point(w.x+200,w.y+35);await h.page().evaluate(()=>window.Module.ccall('webnp2_mouse_button',null,['number','number'],[0,0]));await until(s=>stable(s)&&t(s).window.x===w.x+20&&t(s).window.y===w.y+20,'move DOS window');await h.shot('moved-resized.png');
 // Cursor is on row 2; use split INT29 row 3 for a pixel check after movement.
 await glyph(3,0,0x93fa,0xe1);h.pass('Right-half clipping and actual glyph pixels after mouse resize/move');
 const first=(await inspect()).cpu.views[0];await start(1);await command('a',v=>v.attributes[160]===0x41,'second terminal changes its own attributes',1);await h.focus(0);s=await until(s=>stable(s)&&stable(s,1),'two independent terminal snapshots');assert.equal(s.cpu.views[0].generation,first.generation);assert.equal(t(s).codes[160],0xfb26);assert.equal(t(s,1).codes[160],0xfc26);assert.notEqual(s.cpu.views[0].cr3,s.cpu.views[1].cr3);await glyph(3,0,0x93fa,0xe1);
 await finishBoot(vector);h.pass('Independent V86 terminal planes/generations, HDD-only shipping boot, stack guards and complete cleanup with whole-media invariance');
}
async function buffered(){
 await command('i',v=>v.row===19&&v.column===6,'buffered DOS input');await h.page().evaluate(()=>window.np2debug.np2.pasteText('日本'));await until(s=>stable(s)&&t(s).codes[19*80+8]===0xdc2b,'committed SJIS reaches focused DOS input');await h.key('BS');await h.page().evaluate(()=>window.np2debug.np2.pasteText('ｶ\r'));
 let s=await until(s=>stable(s)&&t(s).row===20&&t(s).column===9,'buffered echo complete');assert.deepEqual(t(s).codes.slice(20*80+6,20*80+9),[0xfc26,0,0xb6]);assert.deepEqual(t(s).codes.slice(19*80+6,19*80+10),[0xfc26,0,0xb6,32]);
 // Follow the cursor through the same viewport controls used by users.
 for(let i=0;i<6;i++){s=await published();const w=t(s).window;if(w.sy<=20&&20<w.sy+Math.floor((w.h-104)/16))break;await h.click(w.x+8+3*48+22,w.y+w.h-16);}
 await h.shot('buffered-sjis.png');await glyph(20,6,0x93fa,0xe1);await glyph(20,7,0x93fa,0xe1,1);await glyph(20,8,0xb6,0xe1);
 h.pass('Physical committed SJIS/kana input, whole-character Backspace and DOS 0Ah/40h echo with exact native pixels');
}
async function lifecycleSuite(){
 const vector=await h.bootHdd();await start();await start(1,'COUNT32.EXE 1');await h.focus(0);await buffered();
 let s=await published(),peer=s.cpu.views[1].counter;await command('w',v=>v.row===24&&v.column===2&&v.codes[24*80]===0xfc26,'wide wrap before column 80');s=await until(s=>stable(s)&&s.cpu.views[1].counter>peer,'peer CPU progress');assert.equal(t(s).codes[23*80+79],32);assert.deepEqual(t(s).attributes.slice(24*80,24*80+2),[0x21,0x21]);
 s=await command('s',v=>v.codes[23*80]===83&&v.codes[23*80+7]===0xfc26&&v.attributes[23*80]===0x41&&v.row===24,'both planes scroll');assert.equal(t(s).attributes[24*80],0xe1);await h.shot('scrolled.png');await glyph(23,7,0x93fa,0x41);
 await command('q',v=>v.state===0,'normal DOS exit retains final snapshot');await run();
 await command('i',v=>v.row===19&&v.column===6,'partial SJIS setup');await h.page().evaluate(()=>window.Module.ccall('webnp2_push_key_buffer','number',['number'],[0x93]));await until(s=>stable(s)&&s.gui.app.lastKey===0x93&&t(s).row===19&&t(s).column===6,'partial lead pending');const generation=(await published()).cpu.views[0].generation;await stop();await h.run(0,'KSH.EXE');s=await until(s=>stable(s)&&s.cpu.views[0].generation>generation&&s.cpu.views[0].screen.startsWith('K386 DOS shell'),'new generation clears pending SJIS');assert.equal(t(s).attributes[0],0xe1);assert.equal(t(s).codes[0],75);await stop();await run();
 peer=s.cpu.views[1].counter;await h.type('f');s=await until(s=>s.cpu.views[0].state===4&&s.cpu.views[0].fault===14&&s.cpu.views[1].counter>peer,'contained V86 page fault');assert.equal(s.cpu.views[0].cr2,0xe0000);assert.equal(s.gui.ready,1);await stop();await run();await finishBoot(vector);
 h.pass('Wide bottom-right wrap, character/attribute scrolling, peer progress, normal exit, partial-lead Force End, clean new generations and real #PF containment');
 const fdVector=await h.boot(null,h.legacy);await start();await initial();await buffered();await command('q',v=>v.state===0,'FD DOS exit');await finishBoot(fdVector,h.legacy,true);
 h.pass('Complete FD compatibility boot includes diagnostic and font path; whole FD, vectors, conventional/XMS memory and stack guards are preserved');
}
try{if(suite==='paint')await paintSuite();else await lifecycleSuite();await h.finish();}catch(e){await writeFile(join(output,'terminal-failure.json'),JSON.stringify({error:String(e),last:await inspect().catch(()=>last)},null,2)+'\n');await h.fail(e);throw e;}finally{await h.close();}
