// Independent reference values and CPU-record decoding for the two backends.
// Sorting here uses JavaScript's numeric sort, not the guest merge-sort code.
export const arrayWorkloads=[
 {id:1,key:'1',name:'fill'}, {id:2,key:'2',name:'seq'},
 {id:3,key:'3',name:'sort'}, {id:4,key:'4',name:'search'},
 {id:5,key:'5',name:'range'},
];
export function arrayExpected(name,identity=1){
 if(name==='fill')return {bytes:2097152,sum:2097152*255/2,detail:0,work:3*2097152};
 if(name==='seq')return {bytes:1048576,sum:0,detail:0,work:512};
 if(name==='search')return {bytes:65536,sum:1,detail:12285,work:65529};
 if(name==='range')return {bytes:10000,sum:0,detail:4,work:6};
 if(name!=='sort')throw Error('Unknown workload');
 let seed=(12345^(identity===2?0xa5a5a5a5:0))>>>0;const values=[];
 for(let i=0;i<8192;i++){seed=(Math.imul(seed,1103515245)+12345)>>>0;values.push((seed>>>8)&65535);}
 values.sort((a,b)=>a-b);return {bytes:16384,sum:values.reduce((a,b)=>a+b,0)>>>0,detail:values.at(-1),work:2*8192*(Math.log2(8192)+1)};
}
export function arrayRecord(cpu,id){
 const p=cpu.diagnostics[id].pm32,s=p?.samples;
 if(cpu.views[id].kind!==1||!s||s.length!==16||s[0]!==0x58413332||s[1]!==1)return null;
 return {sequence:s[2],scenario:s[3],state:s[4],error:s[5],bytes:s[6],sum:s[7],detail:s[8],work:s[9],allocations:s[10],frees:s[11],first:s[12],last:s[13],identity:s[15]};
}
export function legacyArrayResult(screen,name){
 const m=new RegExp('XARRAY RESULT '+name+' bytes=(\\d+) sum=(\\d+) detail=(\\d+) work=(\\d+)').exec(screen);
 return m?{bytes:+m[1],sum:+m[2],detail:+m[3],work:+m[4]}:null;
}
export function patternWord(at,identity){
 let word=0;for(let i=0;i<4;i++){const p=at+i;word|=((p^(p>>>8)^(p>>>16)^(identity===2?0x5a:0))&255)<<(i*8);}return word>>>0;
}
