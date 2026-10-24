import {describe,it,expect} from 'vitest';
import {buildCfg} from '../src/core/module';
describe('experimental Cirrus graphics adapter',()=>{
 it('keeps the normal PEGC configuration as the default',()=>{
  const cfg=buildCfg({fds:[]});
  expect(cfg).toContain('PEGCPLNE=true');expect(cfg).not.toContain('USE_CLGD=');
 });
 it('uses the native PC-9821 board, not IBM VGA or a palette setting',()=>{
  const cfg=buildCfg({fds:[],graphicsAdapter:'cirrus'});
  expect(cfg).toContain('USE_CLGD=true\nCLGDTYPE=90\nWAB_ANSW=1');
  expect(cfg).toContain('PEGCPLNE=true');
 });
});

// Keep the shipped hardware frontend tied to its reviewed source patch.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
it('pins the shipped core and the Cirrus patch',()=>{
 const m=JSON.parse(readFileSync('public/core/cirrus-build.json','utf8'));
 const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
 expect(m.source_commit).toMatch(/^[a-f0-9]{40}$/);
 expect(hash('patches/np2kai-cirrus-display.patch')).toBe(m.patch_sha256);
 for(const [name,digest] of Object.entries(m.files))expect(hash('public/core/'+name)).toBe(digest);
});
