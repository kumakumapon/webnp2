import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {KGUI32_BOOT_URL,KGUI32_FD_BOOT_URL,KGUI32_HIGH_COLOR_BOOT_URL} from '../src/bundled-kgui32';
import {fatReadFile,fatList,fatFreeSpace,openDiskImage} from '../src/api/fat';
const manifest=JSON.parse(readFileSync('public/kgui32/manifest.json','utf8'));
describe('independent native PM32 GUI image',()=>{
 it('offers separate explicit boot choices only after generation',()=>{
  expect(KGUI32_FD_BOOT_URL).toBe(manifest.enabled?`./?fd1=./kgui32/${manifest.image}&run=1&mem=16`:undefined);
  expect(KGUI32_BOOT_URL).toBe(manifest.enabled&&manifest.application_distribution?`./?fd1=./kgui32/${manifest.application_distribution.image}&hdd=./kgui32/${manifest.application_distribution.hdd.image}&run=1&mem=16`:KGUI32_FD_BOOT_URL&&manifest.workspace_hdd?`${KGUI32_FD_BOOT_URL}&hdd=./kgui32/${manifest.workspace_hdd.image}`:KGUI32_FD_BOOT_URL);
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
  expect(manifest.widget_sdk).toBe(4);expect(manifest.graphical_clients).toContain('KGEDIT.EXE');
  const editor=fatReadFile(openDiskImage(image,manifest.image),'KGEDIT.EXE');expect(new TextDecoder().decode(editor.slice(72,80))).toBe('K32EXE01');expect(editor[92]).toBe(231);
  expect(manifest.dedicated_gui_context).toBe(true);expect(manifest.application_slots).toBe(2);expect(manifest.gui_bits).toBe(32);expect(manifest.dos_files_read_only).toBe(false);expect(manifest.workspace_save_api).toBe(1);expect(manifest.workspace_information_api).toBe(1);expect(manifest.writable_workspace).toBe('auto: verified HDD / WORK');expect(manifest.workspace_fd_fallback).toBe('A:\\WORK');expect(manifest.root_browser_read_only).toBe(true);
  const disk=openDiskImage(image,manifest.image),old=openDiskImage(readFileSync('public/k386/'+base.image),base.image);
  for(const name of ['IO.SYS','MSDOS.SYS','COMMAND.COM','KDESK.EXE','K386.EXE','K32HOST.EXE'])expect(fatReadFile(disk,name)).toEqual(fatReadFile(old,name));
  expect(new TextDecoder().decode(fatReadFile(disk,'CONFIG.SYS'))).toBe(new TextDecoder().decode(fatReadFile(old,'CONFIG.SYS'))+'LASTDRIVE=E\r\nDEVICE=KHD98.SYS\r\n');
  expect(fatReadFile(disk,'KHD98.SYS').length).toBeGreaterThan(0);expect(fatReadFile(disk,'HDDFLT.COM').length).toBeGreaterThan(0);
  const auto=new TextDecoder().decode(fatReadFile(disk,'AUTOEXEC.BAT'));
  expect(auto).toContain('K386.EXE\r\nK32HOST.EXE\r\nKGUILDR.EXE\r\n');expect(auto).not.toContain('\r\nKDESK.EXE\r\n');
  expect(auto).not.toContain('HDDFLT');
  const exe=fatReadFile(disk,'KGUI32.EXE');expect(new TextDecoder().decode(exe.slice(72,80))).toBe('K32EXE01');expect(exe[80]|exe[81]<<8).toBe(257);expect(exe[92]).toBe(23);
  for(const name of ['KGUILDR.EXE','KGUI32.EXE']){const b=fatReadFile(disk,name);expect(b[0]|b[1]<<8).toBe(0x5a4d);}
 });
 it('pairs a new marked FAT16 workspace with the unchanged FD fallback',()=>{
  if(!manifest.enabled)return;
  const hdd=manifest.workspace_hdd,bytes=readFileSync('public/kgui32/'+hdd.image);
  expect(bytes.length).toBe(hdd.bytes);expect(bytes.length).toBe(41564416);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(hdd.sha256);
  expect(hdd.filesystem).toBe('FAT16');expect(hdd.logical_sector_bytes).toBe(1024);
  const volume=openDiskImage(bytes,hdd.image);
  expect(new TextDecoder().decode(fatReadFile(volume,'HDD.ID'))).toBe('KHDPROOF');
  expect(fatList(volume,'/').some(e=>e.name==='WORK'&&e.isDir)).toBe(true);
  expect(fatList(volume,'/WORK')).toEqual([]);
  expect(fatFreeSpace(volume)).toEqual({total:41435136,free:hdd.initial_free_bytes});
  expect(hdd.initial_free_bytes).toBe(41426944);
 });
 it('ships relocated apps only on HDD and preserves an explicit complete FD',()=>{
  if(!manifest.enabled)return;
  const d=manifest.application_distribution;
  const compact=readFileSync('public/kgui32/'+d.image),hdd=readFileSync('public/kgui32/'+d.hdd.image);
  expect(createHash('sha256').update(compact).digest('hex')).toBe(d.sha256);
  expect(createHash('sha256').update(hdd).digest('hex')).toBe(d.hdd.sha256);
  const fd=openDiskImage(compact,d.image),hd=openDiskImage(hdd,d.hdd.image);
  const legacy=openDiskImage(readFileSync('public/kgui32/'+manifest.image),manifest.image);
  for(const name of d.relocated){
   expect(fatList(fd,'/').some(e=>e.name===name)).toBe(false);
   expect(fatReadFile(hd,'APPS/'+name)).toEqual(fatReadFile(legacy,name));
  }
  expect(fatFreeSpace(fd).free).toBe(d.fd_free_bytes);
  expect(d.fd_free_bytes).toBeGreaterThan(d.legacy_fd_free_bytes+65536);
  expect(fatFreeSpace(hd).free).toBe(d.hdd.initial_free_bytes);
  expect(d.hdd_boot_supported).toBe(false);
 });

});
