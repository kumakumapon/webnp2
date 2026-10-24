// Real DOS writes Cirrus VRAM. Verify every RGB565 color in the actual canvas.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const [base='http://127.0.0.1:4173/webnp2/',output='test-results/display-probe',image]=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/k386/manifest.json',import.meta.url)));
const diskPath=image??`./k386/${manifest.image}`;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const results=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 for(const accelerated of [true,false]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Read the guest's actual text VRAM. WAB output may suspend GDC timing updates.
  const text=()=>page.evaluate(()=>{
   const b=atob(window.np2debug.np2.readMemoryBase64(0xa0000,4000).base64);
   return Array.from({length:25},(_,y)=>Array.from({length:80},(_,x)=>String.fromCharCode(b.charCodeAt((y*80+x)*2))).join('')).join('\n');
  });
  const wait=async needle=>{for(let i=0;i<600;i++){if((await text().catch(()=>'' )).includes(needle))return;await page.waitForTimeout(200);}throw new Error('Guest did not report: '+needle);};
  const key=k=>page.evaluate(k=>window.np2debug.np2.sendKeys(k),k);
  const type=s=>page.evaluate(s=>window.np2debug.np2.typeText(s),s);
  const disk=async()=>Buffer.from((await page.evaluate(()=>window.np2debug.np2.exportDiskBase64('fd1'))).base64,'base64');
  try{
   await page.goto(new URL(`?fd1=${diskPath}&run=1&mem=16&clk=8&worklet=0${accelerated?'&video=cirrus':''}`,base).href);
   await wait('Ready');const before=hash(await disk());
   await key('F10');await wait('KDESK exited.');await type('KDISP\r');
   if(accelerated){
    await wait('KDISP: VRAM readback PASS');
    await page.waitForFunction(()=>document.querySelector('#canvas').width===800&&document.querySelector('#canvas').height===600,null,{timeout:60000});
    let pixels;
    for(let retry=0;retry<200;retry++){
     pixels=await page.evaluate(()=>{
      const source=document.querySelector('#canvas'),c=document.createElement('canvas');c.width=800;c.height=600;const g=c.getContext('2d');g.drawImage(source,0,0);
      const p=g.getImageData(0,0,256,256).data,colors=new Set();for(let i=0;i<p.length;i+=4)colors.add(p[i]<<16|p[i+1]<<8|p[i+2]);
      const pixel=(x,y)=>Array.from(p.slice((y*256+x)*4,(y*256+x)*4+3));
      return {count:colors.size,black:pixel(0,0),red:pixel(0,248),green:pixel(224,7),blue:pixel(31,0),greenLowBit:pixel(32,0)};
     });
     if(pixels.count===65536)break;await page.waitForTimeout(100);
    }
    assert.equal(pixels.count,65536,'all RGB565 codes must be distinguishable');
    assert.deepEqual(pixels.black,[0,0,0]);assert.deepEqual(pixels.red,[255,0,0]);assert.deepEqual(pixels.green,[0,255,0]);assert.deepEqual(pixels.blue,[0,0,255]);assert.deepEqual(pixels.greenLowBit,[0,4,0]);
    const info=await page.evaluate(()=>window.np2debug.np2.getGraphicsInfo());assert.equal(info.deviceBpp,16);assert.equal(info.hostBpp,32);assert.equal(info.relay,2);
    await page.screenshot({path:join(output,'rgb565-65536.png')});
    await type('X');await wait('KDISP: RGB565 probe returned to DOS');
    await page.waitForFunction(()=>document.querySelector('#canvas').width===640&&document.querySelector('#canvas').height===400,null,{timeout:60000});
    results.push({profile:'cirrus',pixels,info,diskUnchanged:hash(await disk())===before});
   }else{
    await wait('Cirrus unavailable; display unchanged');
    const info=await page.evaluate(()=>window.np2debug.np2.getGraphicsInfo());assert.equal(info.width,640);assert.equal(info.height,400);assert.equal(info.relay,0);
    results.push({profile:'absent',info,diskUnchanged:hash(await disk())===before});
   }
   assert.equal(hash(await disk()),before);assert.deepEqual(errors,[]);
   console.log('PASS display probe '+(accelerated?'800x600, 65536 distinct colors, primary colors, VRAM readback and DOS return':'absent device leaves PEGC unchanged'));
  }catch(e){console.error(await text().catch(()=>''));await page.screenshot({path:join(output,accelerated?'failure-cirrus.png':'failure-absent.png')}).catch(()=>{});throw e;}
  finally{await page.close();}
 }
 await writeFile(join(output,'verification.json'),JSON.stringify({source:manifest.source_commit,results},null,2)+'\n');
}finally{await browser.close();}
