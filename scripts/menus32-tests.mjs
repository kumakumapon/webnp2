// Actions-only acceptance: real single-finger Canvas taps, never RAM writes.
import assert from 'node:assert/strict';
import {sha,fnv} from './practical32-harness.mjs';
const ITEM=24576,BACK=24608,NEXT=24610;
export async function menuTests(p,video){
 const {h,until,samples}=p;assert.equal(h.manifest.window_menu.right_click_required,false);
 const vector=await h.bootHdd();
 await h.page().evaluate(()=>{window.menuTouchProof={starts:0,ends:0,right:0};const c=document.querySelector('#canvas');c.addEventListener('touchstart',()=>window.menuTouchProof.starts++);c.addEventListener('touchend',()=>window.menuTouchProof.ends++);c.addEventListener('mousedown',e=>{if(e.button===2)window.menuTouchProof.right++;});});
 const draws=(s,id)=>s.bitmaps[id]?.draws??[];
 async function tap(x,y){
  const c=h.page().locator('#canvas');await c.scrollIntoViewIfNeeded();const box=await c.boundingBox();assert(box);
  const s=await p.inspect();await h.page().touchscreen.tap(box.x+x*box.width/s.gui.width,box.y+y*box.height/s.gui.height);
 }
 async function control(id,code){
  const s=await until(s=>draws(s,id).some(d=>d.op===3&&d.handle===code),'touch control '+code),d=draws(s,id).find(d=>d.op===3&&d.handle===code),r=s.bitmaps[id].window;
  await tap(r.x+8+d.x+Math.floor(d.w/2),r.y+70+d.y+Math.floor(d.h/2));
 }
 async function open(id){const s=await p.inspect(),r=s.bitmaps[id].window;await tap(r.x+36,r.y+16);return until(s=>draws(s,id).some(d=>d.op===3&&d.handle===BACK),'titlebar Menu '+id);}
 async function choose(id,index){
  await open(id);
  for(let page=0;page<12;page++){
   const s=await p.inspect();if(draws(s,id).some(d=>d.handle===ITEM+index)){await control(id,ITEM+index);await until(s=>s.expanded.slots[id].state===0||!draws(s,id).some(d=>d.handle===BACK),'menu command acknowledged');return;}
   const first=draws(s,id).find(d=>d.handle>=ITEM&&d.handle<ITEM+24)?.handle;assert(first!==undefined);
   await control(id,NEXT);await until(s=>draws(s,id).some(d=>d.handle>=ITEM&&d.handle<ITEM+24&&d.handle!==first)&&!draws(s,id).some(d=>d.handle===first),'touch menu next page');
  }
  throw Error('Menu index not reached '+index);
 }
 async function welcome(x,y){const s=await p.inspect();await tap(60,s.gui.height-16);await until(s=>s.gui.app.active===0,'touch Welcome');await tap(x,y);}
 await welcome(130,192);await until(s=>samples(s)[0]===0x3243474b&&samples(s)[2]>0,'real calculator from mobile launcher');
 for(const key of [52,50]){await control(0,key);await until(s=>samples(s)[6]===(key===52?4:42),'touch calculator digit');}
 await choose(0,0);await until(s=>!draws(s,0).some(d=>d.handle===BACK),'memory add exits menu');
 await control(0,99);await until(s=>samples(s)[6]===0,'clear calculation preserves memory');
 await choose(0,2);await until(s=>samples(s)[6]===42,'paged touch memory recall');
 await choose(0,3);await choose(0,4);await choose(0,2);await until(s=>samples(s)[6]===0,'touch memory clear');
 await h.key('F1');await until(s=>draws(s,0).some(d=>d.handle===BACK),'keyboard F1 opens menu');await h.key('TAB');await until(s=>s.gui.app.active===2&&draws(s,0).some(d=>d.handle===BACK),'Tab belongs to the open menu');await h.key('ESC');await until(s=>!draws(s,0).some(d=>d.handle===BACK),'Esc closes keyboard menu');
 p.pass('390px browser: single-finger launcher/titlebar menu, paged memory add/recall/clear and normal calculator controls', {video});
 await welcome(292,192);await until(s=>samples(s,1)[0]===0x324b474b&&samples(s,1)[2]>0,'second real clock owner');
 await choose(1,1);await until(s=>samples(s,1)[14]===1,'touch stopwatch mode');await control(1,115);
 await until(s=>samples(s,1)[6]>=1&&samples(s,1)[15]===1,'stopwatch advances');
 await open(1);const before=samples(await p.inspect(),1)[6];await until(s=>samples(s,1)[6]>before&&draws(s,1).some(d=>d.handle===BACK),'stopwatch continues under its menu');
 await control(1,BACK);await until(s=>draws(s,1).some(d=>d.handle===115),'return from menu to stopwatch');await control(1,115);
 const stopped=await until(s=>samples(s,1)[15]===0,'stop stopwatch'),seconds=samples(stopped,1)[6];await h.page().waitForTimeout(1300);assert.equal(samples(await p.inspect(),1)[6],seconds);
 await control(1,114);await until(s=>samples(s,1)[6]===0,'touch stopwatch reset');
 p.pass('Independent clock/stopwatch starts, advances through a menu, stops and resets with only visible taps');
 await choose(0,5);await until(s=>s.expanded.slots[0].state===0,'calculator menu close');
 await welcome(130,266);await until(s=>samples(s)[0]===0x3345474b&&samples(s)[2]>0,'touch Editor launcher');
 await p.appType(0,'menu memo');let s=await until(s=>samples(s)[4]===9&&samples(s)[5]===fnv('menu memo'),'all actual text bytes acknowledged');const hash=samples(s)[5];assert.equal(samples(s)[8],1);
 const r=s.bitmaps[0].window;await tap(r.x+17,r.y+118);await until(s=>samples(s)[6]===0&&samples(s)[7]===0,'touch selection start');await choose(0,7);await tap(r.x+49,r.y+118);await until(s=>samples(s)[6]===4&&samples(s)[7]===0&&samples(s)[5]===hash,'selection mode uses a tapped endpoint');await choose(0,7);
 await choose(0,6);await until(s=>samples(s)[6]!==samples(s)[7],'touch select all');
 await choose(0,8);await until(s=>!draws(s,0).some(d=>d.handle===BACK),'touch copy');
 await choose(0,14);await until(s=>draws(s,0).some(d=>d.text?.includes('CRLF')),'touch CRLF');
 await choose(0,4);await until(s=>samples(s)[9]===5,'touch find dialog');
 await open(0);s=await until(s=>draws(s,0).some(d=>d.handle===BACK)&&!draws(s,0).some(d=>d.handle>=ITEM&&d.handle<ITEM+24),'modal menu has no executable commands');assert.equal(samples(s)[5],hash);
 await control(0,BACK);await until(s=>draws(s,0).some(d=>d.handle===843),'return to original find dialog');await control(0,843);await until(s=>samples(s)[9]===0,'cancel find');
 await choose(0,17);await until(s=>samples(s)[9]===2,'menu Close requires unsaved confirmation');assert.equal(samples(await p.inspect())[5],hash);await control(0,802);await until(s=>samples(s)[9]===0&&samples(s)[8]===1,'cancel close retains document');
 await choose(0,17);await until(s=>samples(s)[9]===2,'repeat explicit close');await control(0,801);await until(s=>s.expanded.slots[0].state===0,'explicit discard closes Editor');
 p.pass('Editor menu reaches selection/copy/EOL/find; modal sheet prevents commands; cancelled close preserves the exact dirty document');
 await welcome(292,230);await until(s=>samples(s)[0]===0x3246474b&&samples(s)[2]>0,'touch Files launcher');await choose(0,2);await until(s=>samples(s)[9]&32,'Files menu switches to Work');await choose(0,6);await until(s=>s.expanded.slots[0].state===0,'Files menu close');
 await welcome(292,266);await until(s=>samples(s)[0]===0x3149474b&&samples(s)[2]>0&&s.bitmaps[0].consistent,'touch Images launcher');s=await p.inspect();const imageHash=s.bitmaps[0].hash;
 await choose(0,4);await until(s=>s.bitmaps[0].consistent&&s.bitmaps[0].hash!==imageHash,'Images menu invert with filename focus');await choose(0,6);await until(s=>s.bitmaps[0].consistent&&s.bitmaps[0].hash===imageHash,'Images menu undo');
 await choose(0,13);await until(s=>s.expanded.slots[0].state===0,'Images menu closes clean original');
 await welcome(292,164);await until(s=>samples(s)[0]===0x32574b47&&samples(s)[2]>0,'touch dictionary launcher');await choose(0,7);await until(s=>samples(s)[19]!==0,'dictionary IME menu');await choose(0,8);await until(s=>s.expanded.slots[0].state===0,'dictionary menu close');
 p.pass('Files, Images and dictionary menus execute owned commands; invert/Undo restores every image pixel without saving');
 const touch=await h.page().evaluate(()=>window.menuTouchProof);assert(touch.starts>40&&touch.ends>40);assert.equal(touch.right,0);assert.equal(sha(await h.disk('hdd')),sha(p.original));
 await p.cleanup(vector);p.pass('Actual browser touch events, zero right clicks, unchanged HDD/FD and complete CPU/XMS/handle reclamation',touch);
}
