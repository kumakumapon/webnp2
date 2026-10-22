// Read the DOS loader's real module, relocation words, PSP and owning MCB.
import assert from 'node:assert/strict';

async function moduleRecord(page, name) {
  const executable=Buffer.from(await page.evaluate(async name=>
    Array.from(await window.np2debug.np2.diskReadFile('fd1',name)),name));
  assert.equal(executable.readUInt16LE(0),0x5a4d,`${name} has a DOS MZ header`);
  const h=Array.from({length:14},(_,i)=>executable.readUInt16LE(i*2));
  assert.equal((h[2]-1)*512+(h[1]||512),executable.length);
  assert.equal(h[5],h[6],'MZ allocation has a fixed upper bound');
  const payload=executable.subarray(h[4]*16),relocations=[];
  for(let i=0;i<h[3];i++){
    const at=h[12]+i*4,offset=executable.readUInt16LE(at)+16*executable.readUInt16LE(at+2);
    assert.ok(offset+2<=payload.length);relocations.push(offset);
  }
  const ram=Buffer.from(await page.evaluate(()=>window.np2debug.np2.readMemoryBase64(0,0xa0000).base64),'base64');
  const signature=payload.subarray(h[10],h[10]+Math.min(16,...relocations.map(at=>at-h[10])));
  assert.ok(signature.length>=8,'Sufficient immutable entry bytes');
  const matches=[];
  for(let at=ram.indexOf(signature);at>=0;at=ram.indexOf(signature,at+1)){
    const base=at-h[10]-h[11]*16,psp=base/16-16;
    if(base<0x110||base%16||base+payload.length>ram.length)continue;
    const p=psp*16,m=p-16;
    if(ram.readUInt16LE(p)!==0x20cd||![0x4d,0x5a].includes(ram[m])||ram.readUInt16LE(m+1)!==psp)continue;
    const paragraphs=ram.readUInt16LE(m+3);
    if(paragraphs!==16+Math.ceil(payload.length/16)+h[5])continue;
    if(!relocations.every(offset=>ram.readUInt16LE(base+offset)===payload.readUInt16LE(offset)+base/16))continue;
    matches.push({name,psp,cs:base/16+h[11],ds:base/16+h[7],ss:base/16+h[7],
      ip:h[10],stackTop:h[8],paragraphs,relocations:relocations.length,base});
  }
  assert.equal(matches.length,1,`${name}: exactly one live DOS-owned module`);
  return matches[0];
}

export async function inspectNativeMZ(page, enhanced) {
  const gui=await moduleRecord(page,'KDESK.EXE');
  assert.equal(gui.relocations,1);assert.notEqual(gui.cs,gui.ds);
  assert.equal(gui.cs,gui.psp+16);assert.ok(gui.stackTop>=0x3000);
  // Sample actual CPU registers while it is executing native GUI code, avoiding
  // firmware/interrupt frames and the monitor's temporary protected selectors.
  const registers=await (await page.waitForFunction(gui=>{
    const r=window.np2debug.np2.dbgReadRegs();
    return (!(r.cr0&1)||(r.eflags&0x20000))&&r.cs===gui.cs&&r.ds===gui.ds&&r.ss===gui.ss?r:false;
  },gui,{timeout:60000,polling:25})).jsonValue();
  assert.ok(registers.esp<=gui.stackTop&&registers.esp>=gui.stackTop-0x3000);
  let monitor;
  if(enhanced){
    monitor=await moduleRecord(page,'K386.EXE');
    assert.equal(monitor.relocations,0);assert.equal(monitor.cs,monitor.psp+16);
    assert.equal(monitor.paragraphs,0x1010);assert.notEqual(monitor.psp,gui.psp);
    const vector=Buffer.from(await page.evaluate(()=>window.np2debug.np2.readMemoryBase64(0x2f*4,4).base64),'base64');
    assert.equal(vector.readUInt16LE(2),monitor.cs,'INT 2Fh points into the retained MZ module');
  }
  return {gui,registers,monitor};
}
