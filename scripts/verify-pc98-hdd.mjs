// Real DOS4 file I/O through KHD98.SYS, independently checked against THD bytes.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const [base='http://127.0.0.1:4179/',output='test-results/hdd-proof',video='pegc']=process.argv.slice(2);
const manifest=JSON.parse(await readFile(new URL('../public/hdd-proof/manifest.json',import.meta.url)));
assert.equal(manifest.enabled,true,'run prepare-pc98-hdd-ci.sh first');
const fd=await readFile(new URL('../public/hdd-proof/'+manifest.fd.image,import.meta.url));
const original=await readFile(new URL('../public/hdd-proof/'+manifest.hdd.image,import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(fd),manifest.fd.sha256);assert.equal(sha(original),manifest.hdd.sha256);
await mkdir(output,{recursive:true});
const results=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:process.env.WEBNP2_NO_SANDBOX==='1'?['--no-sandbox']:[]});
let page;
const text=()=>page.evaluate(()=>window.np2debug.np2.getScreenText().text);
const wait=s=>page.waitForFunction(s=>{try{return window.np2debug.np2.getScreenText().text.includes(s);}catch{return false;}},s,{timeout:90000});
const prompt=()=>page.waitForFunction(()=>window.np2debug.np2.getScreenText().lines.some(l=>l.trim()==='A>'),null,{timeout:60000});
const command=async(s,expected,allowFailure=false)=>{
 console.log('guest:',s);
 await prompt();await page.evaluate(s=>window.np2debug.np2.typeText(s+'\r'),s);await page.waitForTimeout(250);await wait(expected);await prompt();
 if(!allowFailure)assert(!/FAIL|UNEXPECTED/.test(await text()),await text());
};
const disk=async slot=>{
 if(slot!=='hdd')return Buffer.from((await page.evaluate(slot=>window.np2debug.np2.exportDiskBase64(slot),slot)).base64,'base64');
 const download=page.waitForEvent('download');await page.evaluate(()=>window.np2debug.np2.exportDisk('hdd'));return readFile(await (await download).path());
};
const memory=async(at,n)=>Buffer.from((await page.evaluate(({at,n})=>window.np2debug.np2.readMemoryBase64(at,n),{at,n})).base64,'base64');
async function record(){
 const m=await memory(0x1000,0x9f000);let at=-1;
 for(let i=m.indexOf('KHDDIOP1');i>=0;i=m.indexOf('KHDDIOP1',i+1))if(m.readUInt16LE(i+8)===1&&m.readUInt16LE(i+10)===64&&m.readUInt16LE(i+12)===1){assert.equal(at,-1);at=i;}
 assert(at>=0,'resident driver record');const u=n=>m.readUInt32LE(at+n);
 return {address:at+0x1000,sectors:u(16),start:u(20),physical:u(24),requests:u(28),reads:u(32),writes:u(36),rejected:u(40),biosErrors:u(44),drive:m.readUInt16LE(at+50),completed:u(52),partial:u(56)};
}
async function boot(hdd=original){
 const ctx=await browser.newContext();page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(hdd)await page.route('**/hdd-proof/'+manifest.hdd.image,route=>route.fulfill({body:hdd,contentType:'application/octet-stream'}));
 await page.goto(new URL(`?fd1=./hdd-proof/${manifest.fd.image}${hdd?'&hdd=./hdd-proof/'+manifest.hdd.image:''}&run=1&mem=16&clk=8&worklet=0${video==='cirrus'?'&video=cirrus':''}`,base).href);
 await wait('PC98 HDD basic I/O proof');await prompt();return {ctx,errors};
}
function fat(bytes,alternate){
 const start=256+264*256,f1=start+1024,f2=start+21*1024,root=start+41*1024,data=start+57*1024;
 assert.deepEqual(bytes.subarray(0,f1),original.subarray(0,f1),'container, IPL, partitions and BPB preserved');
 assert.deepEqual(bytes.subarray(f1,f2),bytes.subarray(f2,f2+20*1024),'both FAT copies');
 assert.equal(bytes.toString('ascii',data,data+8),'KHDPROOF');
 const allocated=new Set([2]),files={};
 for(let at=root;at<root+16384&&bytes[at];at+=32){
  assert.notEqual(bytes[at],0xe5,'no deleted directory slots');assert.equal(bytes[at+11]&0x18,0,'regular proof files only');
  const name=bytes.toString('ascii',at,at+8).trim()+'.'+bytes.toString('ascii',at+8,at+11).trim();
  let cluster=bytes.readUInt16LE(at+26),size=bytes.readUInt32LE(at+28),chunks=[];const seen=new Set();
  while(cluster<0xfff8){assert(cluster>=2&&cluster<=10117);assert(!seen.has(cluster),'FAT cycle');seen.add(cluster);
   if(name!=='HDD.ID'){assert(!allocated.has(cluster),'cross linked file');allocated.add(cluster);}
   chunks.push(bytes.subarray(data+(cluster-2)*4096,data+(cluster-1)*4096));cluster=bytes.readUInt16LE(f1+cluster*2);
  }
  assert.equal(seen.size,Math.ceil(size/4096));files[name]=Buffer.concat(chunks).subarray(0,size);
 }
 assert.deepEqual(Object.keys(files).sort(),['HDD.ID','IOPROOF.DAT']);assert.equal(files['HDD.ID'].toString(),'KHDPROOF');
 const expected=Buffer.alloc(131073);for(let i=0;i<expected.length;i++)expected[i]=(i*(alternate?3:1)+(alternate?7:0))%251;
 assert.deepEqual(files['IOPROOF.DAT'],expected,'independent FAT16 file readback');
 for(let c=2;c<=10117;c++)assert.equal(bytes.readUInt16LE(f1+c*2)!==0,allocated.has(c),'no orphan allocations');
 // No writes beyond partition data or into the last unused test sector.
 assert.deepEqual(bytes.subarray(data+10116*4096),original.subarray(data+10116*4096));
 return {bytes:expected.length,sha256:sha(expected),allocatedClusters:allocated.size};
}
try{
 console.log('profile:',video);let {ctx,errors}=await boot();await wait('READ PASS');assert((await text()).includes('BYTES=41435136'));
 let initial=await record();assert.equal(initial.sectors,40524);assert.equal(initial.start,264);assert.equal(initial.physical,162360);assert.equal(initial.drive,1);
 assert.equal(sha(await disk('hdd')),sha(original));const vector=await memory(0x1b*4,4);
 await command('HDDTEST B','BOUNDS PASS 11');assert.deepEqual(await memory(0x1b*4,4),vector,'INT 1B restored');
 let bounded=await record();assert(bounded.rejected>=6);assert.equal(bounded.biosErrors,1);assert.equal(bounded.partial,1);assert.equal(bounded.writes,1);assert.equal(sha(await disk('hdd')),sha(original),'bounds, DMA crossing and failure injection preserve disk');
 await command('HDDTEST W','WRITE PASS BYTES=131073');await command('HDDTEST V','VERIFY PASS BYTES=131073');
 const first=await disk('hdd'),created=fat(first,false);
 // Clear screen before a second identical success message, so waits cannot match stale output.
 await command('CLS','A>');await command('HDDTEST O','WRITE PASS BYTES=131073');await command('HDDTEST T','VERIFY PASS BYTES=131073');
 const saved=await disk('hdd'),overwritten=fat(saved,true);assert.notEqual(created.sha256,overwritten.sha256);
 assert.equal(sha(await disk('fd1')),sha(fd),'boot FD unchanged');const final=await record();assert(final.writes>1&&final.reads>0);assert.deepEqual(errors,[]);
 await page.screenshot({path:join(output,'write-overwrite.png')});await writeFile(join(output,'saved.thd'),saved);
 results.push({name:'read-write-overwrite-bounds',initial,bounded,final,created,overwritten,fdUnchanged:true});await ctx.close();
 ({ctx,errors}=await boot(saved));await wait('READ PASS');await command('HDDTEST T','VERIFY PASS BYTES=131073');
 assert.equal(sha(await disk('hdd')),sha(saved),'cold boot read-only');assert.equal(sha(await disk('fd1')),sha(fd));assert.deepEqual(errors,[]);
 await page.screenshot({path:join(output,'cold-boot.png')});results.push({name:'cold-boot',file:fat(await disk('hdd'),true),record:await record()});await ctx.close();
 // Construct a nearly-full disposable volume BEFORE boot, never through live host FAT editing.
 const full=Buffer.from(original),start=256+264*256,f1=start+1024,f2=start+21*1024,root=start+41*1024,data=start+57*1024;
 for(let c=3;c<=10116;c++)for(const f of [f1,f2])full.writeUInt16LE(c===10116?0xffff:c+1,f+c*2);
 full.write('FILLER  DAT',root+32,'ascii');full[root+43]=32;full.writeUInt16LE(0x21,root+56);full.writeUInt16LE(3,root+58);full.writeUInt32LE(10114*4096,root+60);
 ({ctx,errors}=await boot(full));await wait('READ PASS');await command('HDDTEST W','IO FAIL 5',true);
 const exhausted=await disk('hdd');assert.equal(sha(await disk('fd1')),sha(fd));assert.deepEqual(errors,[]);
 assert.deepEqual(exhausted.subarray(0,f1),full.subarray(0,f1));assert.deepEqual(exhausted.subarray(f1,f2),exhausted.subarray(f2,f2+20480));
 assert.deepEqual(exhausted.subarray(root,root+64),full.subarray(root,root+64),'existing directory entries');
 assert.equal(exhausted.toString('ascii',root+64,root+75),'IOPROOF DAT');assert.equal(exhausted.readUInt16LE(root+90),10117);assert.equal(exhausted.readUInt32LE(root+92),4096);
 for(let c=2;c<=10117;c++)assert.equal(exhausted.readUInt16LE(f1+c*2),c>=3&&c<10116?c+1:0xffff);
 assert.deepEqual(exhausted.subarray(data,data+10115*4096),full.subarray(data,data+10115*4096),'marker and existing filler file untouched');
 for(let i=0;i<4096;i++)assert.equal(exhausted[data+10115*4096+i],i%251);
 assert.deepEqual(exhausted.subarray(data+10116*4096),original.subarray(data+10116*4096));
 await page.screenshot({path:join(output,'disk-full.png')});results.push({name:'disk-full',shortWriteHandled:true,partialFileBytes:4096,existingDataPreserved:true,record:await record()});await ctx.close();
 for(const kind of ['absent','foreign-marker','unsupported-bpb','truncated']){
  let bad=kind==='absent'?null:Buffer.from(original);
  if(kind==='foreign-marker')bad[512+16]^=1;
  if(kind==='unsupported-bpb')bad.writeUInt16LE(2048,256+264*256+11);
  if(kind==='truncated')bad=bad.subarray(0,bad.length-256);
  ({ctx,errors}=await boot(bad));await command('HDDTEST N','NO HDD');
  assert.equal(sha(await disk('fd1')),sha(fd));if(bad)assert.equal(sha(await disk('hdd')),sha(bad));assert.deepEqual(errors,[]);
  results.push({name:kind,rejected:true,disksUnchanged:true});await ctx.close();
 }
 await writeFile(join(output,'results.json'),JSON.stringify({manifest,results},null,2)+'\n');console.log(JSON.stringify(results,null,2));
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(e),text:await text().catch(()=>null),record:await record().catch(()=>null),results},null,2)+'\n');await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw e;}finally{await browser.close();}
