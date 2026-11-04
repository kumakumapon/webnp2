import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {KGUI32_BOOT_URL,KGUI32_HIGH_COLOR_BOOT_URL} from '../src/bundled-kgui32';
import {fatReadFile,openDiskImage} from '../src/api/fat';
const manifest=JSON.parse(readFileSync('public/kgui32/manifest.json','utf8'));
describe('independent native PM32 GUI image',()=>{
 it('offers separate explicit boot choices only after generation',()=>{
  expect(KGUI32_BOOT_URL).toBe(manifest.enabled?`./?fd1=./kgui32/${manifest.image}&run=1&mem=16`:undefined);
  expect(KGUI32_HIGH_COLOR_BOOT_URL).toBe(KGUI32_BOOT_URL?KGUI32_BOOT_URL+'&video=cirrus':undefined);
 });
 it('pins native sources, preserves the base disk and packages the private GUI ABI',()=>{
  if(!manifest.enabled)return;
  expect(manifest.source_dirty).toBe(false);
  const pin=readFileSync('scripts/prepare-msdos4-cpanel-ci.sh','utf8').match(/source_commit=([a-f0-9]{40})/)?.[1];
  const base=JSON.parse(readFileSync('public/k386/manifest.json','utf8'));
  expect(manifest.source_commit).toBe(pin);expect(base.source_commit).toBe(pin);expect(manifest.base_image_sha256).toBe(base.sha256);
  const image=readFileSync('public/kgui32/'+manifest.image);
  expect(createHash('sha256').update(image).digest('hex')).toBe(manifest.sha256);
  expect(manifest.dedicated_gui_context).toBe(true);expect(manifest.application_slots).toBe(2);expect(manifest.gui_bits).toBe(32);expect(manifest.dos_files_read_only).toBe(true);
  const disk=openDiskImage(image,manifest.image),old=openDiskImage(readFileSync('public/k386/'+base.image),base.image);
  for(const name of ['IO.SYS','MSDOS.SYS','COMMAND.COM','CONFIG.SYS','KDESK.EXE','K386.EXE','K32HOST.EXE'])expect(fatReadFile(disk,name)).toEqual(fatReadFile(old,name));
  const auto=new TextDecoder().decode(fatReadFile(disk,'AUTOEXEC.BAT'));
  expect(auto).toContain('K386.EXE\r\nK32HOST.EXE\r\nKGUILDR.EXE\r\n');expect(auto).not.toContain('\r\nKDESK.EXE\r\n');
  const exe=fatReadFile(disk,'KGUI32.EXE');expect(new TextDecoder().decode(exe.slice(72,80))).toBe('K32EXE01');expect(exe[80]|exe[81]<<8).toBe(257);expect(exe[92]).toBe(23);
  for(const name of ['KGUILDR.EXE','KGUI32.EXE']){const b=fatReadFile(disk,name);expect(b[0]|b[1]<<8).toBe(0x5a4d);}
 });
});
