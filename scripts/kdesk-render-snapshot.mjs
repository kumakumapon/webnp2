// Serialized into one browser turn. The emulator cannot execute another slice
// between the idle producer check and the text/attribute/pixel reads.
export function readKdeskRenderSnapshot({width,height,left=11,top=4,columns=48,rows=16}){
 if(![width,height,left,top,columns,rows].every(Number.isInteger)||width<464||height<216||left<0||top<0||columns<1||rows<1||left+columns>80||top+rows>25)throw Error('invalid KDESK snapshot bounds');
 const n=window.np2debug?.np2,at=window.kdeskPerformanceAddress;
 if(!n||!Number.isInteger(at)||at<0x10000||at+64>0xa0000)return null;
 const read=(p,size)=>n.readMemoryBase64(p,size).base64;
 const header=atob(read(at,64)),w=o=>header.charCodeAt(o)|header.charCodeAt(o+1)<<8,d=o=>(w(o)|w(o+2)<<16)>>>0;
 if(header.length!==64||header.slice(0,8)!=='KDPERF01'||w(8)!==1||w(10)!==64||w(12)||w(14)!==1||!d(20))return null;
 const owner=d(16)*16;
 if(at<owner||at+64>owner+65536||w(56)!==width||w(58)!==height)return null;
 const source=document.querySelector('#canvas');
 if(!source||source.width!==width||source.height!==height)return null;
 const text=Array.from({length:rows},(_,i)=>top+i).flatMap(row=>[0xa0000,0xa2000].map(base=>read(base+row*160+left*2,columns*2)));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const context=canvas.getContext('2d');context.drawImage(source,0,0);
 const pixels=Array.from(context.getImageData(364,96,100,120).data);
 // Also reject a replaced producer or an intervening publication, rather than
 // returning a partially sampled frame if a future core changes its execution.
 if(atob(read(at,64))!==header)return null;
 return {text,pixels,metrics:{owner:d(16),cookie:d(20),fullScenes:d(32),clockPreserves:d(44),dosUpdates:d(52)}};
}
