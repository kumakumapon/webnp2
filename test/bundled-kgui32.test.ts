import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {KGUI32_BOOT_URL,KGUI32_FD_BOOT_URL,KGUI32_HIGH_COLOR_BOOT_URL,KGUI32_PAIRED_BOOT_URL,KGUI32_EXPANDED_BOOT_URL,KGUI32_EXPANDED_HIGH_COLOR_BOOT_URL} from '../src/bundled-kgui32';
import {fatReadFile,fatList,fatFreeSpace,openDiskImage} from '../src/api/fat';
const manifest=JSON.parse(readFileSync('public/kgui32/manifest.json','utf8'));
describe('independent native PM32 GUI image',()=>{
 it('offers separate explicit boot choices only after generation',()=>{
  expect(KGUI32_FD_BOOT_URL).toBe(manifest.enabled?`./?fd1=./kgui32/${manifest.image}&run=1&mem=16`:undefined);
  expect(KGUI32_PAIRED_BOOT_URL).toBe(manifest.enabled&&manifest.application_distribution?`./?fd1=./kgui32/${manifest.application_distribution.image}&hdd=./kgui32/${manifest.application_distribution.hdd.image}&run=1&mem=16`:KGUI32_FD_BOOT_URL&&manifest.workspace_hdd?`${KGUI32_FD_BOOT_URL}&hdd=./kgui32/${manifest.workspace_hdd.image}`:KGUI32_FD_BOOT_URL);
  expect(KGUI32_BOOT_URL).toBe(manifest.enabled&&manifest.standalone_hdd?.hdd_boot_supported?`./?hdd=./kgui32/${manifest.standalone_hdd.image}&run=1&mem=16`:KGUI32_PAIRED_BOOT_URL);
  expect(KGUI32_HIGH_COLOR_BOOT_URL).toBe(KGUI32_BOOT_URL?KGUI32_BOOT_URL+'&video=cirrus':undefined);
  expect(KGUI32_EXPANDED_BOOT_URL).toBe(KGUI32_BOOT_URL&&manifest.runtime_profiles?.expanded?KGUI32_BOOT_URL.replace('mem=16','mem=32'):undefined);
  expect(KGUI32_EXPANDED_HIGH_COLOR_BOOT_URL).toBe(KGUI32_EXPANDED_BOOT_URL?KGUI32_EXPANDED_BOOT_URL+'&video=cirrus':undefined);
 });
 it('ships a separate native HDD boot profile with exact system files and no duplicate driver',()=>{
  if(!manifest.enabled)return;
  const h=manifest.standalone_hdd;
  expect(h.hdd_boot_supported).toBe(true);expect(h.fd_required).toBe(false);expect(h.dos_boot_drive).toBe('A:');
  const bytes=readFileSync('public/kgui32/'+h.image);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(h.sha256);
  expect(bytes.toString('ascii',256+4,256+8)).toBe('IPL1');expect(bytes.toString('ascii',256+4*256+3,256+4*256+11)).toBe('KHDS2V1!');
  const disk=openDiskImage(bytes,h.image),fd=openDiskImage(readFileSync('public/kgui32/'+manifest.image),manifest.image);
  for(const name of ['MSDOS.SYS','COMMAND.COM','K386.EXE','K32HOST.EXE','KGUILDR.EXE','KGUI32.EXE'])expect(fatReadFile(disk,name)).toEqual(fatReadFile(fd,name));
  const io=fatReadFile(disk,'IO.SYS');expect(createHash('sha256').update(io).digest('hex')).toBe(h.oem.io_sha256);
  expect(new TextDecoder().decode(io)).toContain('KHDDIOP1');
  expect(new TextDecoder().decode(fatReadFile(disk,'CONFIG.SYS'))).not.toContain('DEVICE=KHD98.SYS');
  expect(new TextDecoder().decode(fatReadFile(disk,'AUTOEXEC.BAT'))).toContain('SET COMSPEC=A:\\COMMAND.COM');
  expect(fatList(disk,'/WORK')).toEqual([]);
  expect(fatFreeSpace(disk).free).toBe(h.initial_free_bytes);
  for(const app of manifest.application_distribution.relocated){
   expect(fatList(disk,'/').some(e=>e.name===app)).toBe(false);
   expect(createHash('sha256').update(fatReadFile(disk,'APPS/'+app)).digest('hex')).toBe(h.applications.find((e:{name:string})=>e.name==='APPS/'+app).sha256);
  }
 });
 it('pins native sources, preserves the base disk and packages the private GUI ABI',()=>{
  if(!manifest.enabled)return;
  expect(manifest.source_dirty).toBe(false);
  const pin=readFileSync('scripts/prepare-msdos4-cpanel-ci.sh','utf8').match(/source_commit=([a-f0-9]{40})/)?.[1];
  const base=JSON.parse(readFileSync('public/k386/manifest.json','utf8'));
  expect(manifest.source_commit).toBe(pin);expect(base.source_commit).toBe(pin);expect(manifest.base_image_sha256).toBe(base.sha256);
  const image=readFileSync('public/kgui32/'+manifest.image);
  expect(createHash('sha256').update(image).digest('hex')).toBe(manifest.sha256);
  expect(manifest.files_workspace_browser).toBe(1);expect(manifest.files_editor_launch).toBe(1);expect(manifest.workspace_recovery_api).toBe(1);expect(manifest.keyboard_modifiers).toBe(1);expect(manifest.editor_tools).toEqual(['find','replace','shift-selection','lf-crlf','adaptive-viewport','recovery']);
  expect(manifest.text_encoding).toBe('shift-jis');expect(manifest.japanese_glyphs).toBe('pc98-cg-rom');expect(manifest.japanese_ime).toBe(true);
  const jp=fatReadFile(openDiskImage(image,manifest.image),'JPDEMO.TXT');expect(new TextDecoder('shift_jis').decode(jp)).toContain('日本語');expect(new TextDecoder('shift_jis').decode(jp)).toContain('ｶﾅ');
  expect(manifest.v86_hdd_read_only).toBe(1);expect(manifest.v86_private_drives).toBe(1);
  const vdos=fatReadFile(openDiskImage(image,manifest.image),'VDOS.EXE');expect(new TextDecoder().decode(vdos.slice(28,36))).toBe('K386APP1');
  expect(manifest.bitmap_sdk).toMatchObject({format:'rgb565',max_width:256,max_height:192,upload_chunk_bytes:3040,atomic_replace:true,owner_generation_checked:true,source_crop:true,canvas_clip:true,viewer:'KGIMAGE.EXE',disk_save:true,compact_elf_file_alignment:16});
  expect(manifest.widget_sdk).toBe(4);expect(manifest.graphical_clients).toContain('KGEDIT.EXE');
  const editor=fatReadFile(openDiskImage(image,manifest.image),'KGEDIT.EXE');expect(new TextDecoder().decode(editor.slice(72,80))).toBe('K32EXE01');expect(editor[92]).toBe(231);
  const files=fatReadFile(openDiskImage(image,manifest.image),'KGFILES.EXE');expect(files[92]).toBe(231);
  expect(manifest.runtime_profiles).toEqual({default:{extended_memory_mb:16,application_slots:2},expanded:{extended_memory_mb:32,application_slots:4},manager_version:2,manager_bytes:264,pm32_private_bytes:4194304,high_memory_driver:'KXMS32.SYS',capture_driver:'KXHIGH.SYS',physical_ceiling:33554432});expect(manifest.dedicated_gui_context).toBe(true);expect(manifest.application_slots).toBe(2);expect(manifest.gui_bits).toBe(32);expect(manifest.dos_files_read_only).toBe(false);expect(manifest.workspace_save_api).toBe(1);expect(manifest.workspace_information_api).toBe(1);expect(manifest.writable_workspace).toBe('auto: verified HDD / WORK');expect(manifest.workspace_fd_fallback).toBe('A:\\WORK');expect(manifest.root_browser_read_only).toBe(true);
  expect(manifest.omitted_base_fixtures).toEqual(['DATA32.BIN']);
  expect(manifest.files.some((f:{name:string})=>f.name==='DATA32.BIN')).toBe(false);
  const disk=openDiskImage(image,manifest.image),old=openDiskImage(readFileSync('public/k386/'+base.image),base.image);
  for(const name of ['IO.SYS','MSDOS.SYS','COMMAND.COM','KDESK.EXE','K386.EXE','K32HOST.EXE'])expect(fatReadFile(disk,name)).toEqual(fatReadFile(old,name));
  expect(new TextDecoder().decode(fatReadFile(disk,'CONFIG.SYS'))).toBe(new TextDecoder().decode(fatReadFile(old,'CONFIG.SYS')).replace('DEVICE=FDXMS286.SYS\r\n','DEVICE=KXHIGH.SYS\r\nDEVICE=FDXMS286.SYS\r\nDEVICE=KXMS32.SYS\r\n')+'LASTDRIVE=E\r\nDEVICE=KHD98.SYS\r\n');
  expect(fatReadFile(disk,'KHD98.SYS').length).toBeGreaterThan(0);expect(fatReadFile(disk,'HDDFLT.COM').length).toBeGreaterThan(0);
  const auto=new TextDecoder().decode(fatReadFile(disk,'AUTOEXEC.BAT'));
  expect(auto).toContain('K386.EXE\r\nK32HOST.EXE\r\nKGUILDR.EXE\r\n');expect(auto).not.toContain('\r\nKDESK.EXE\r\n');
  expect(auto).not.toContain('HDDFLT');
  const exe=fatReadFile(disk,'KGUI32.EXE');expect(new TextDecoder().decode(exe.slice(72,80))).toBe('K32EXE01');expect(exe[80]|exe[81]<<8).toBe(257);expect(exe[92]).toBe(23);
  for(const name of ['KGUILDR.EXE','KGUI32.EXE']){const b=fatReadFile(disk,name);expect(b[0]|b[1]<<8).toBe(0x5a4d);}
 });
 it('ships the same bounded original IME dictionary on all boot profiles',()=>{
  if(!manifest.enabled)return;
  expect(manifest.ime.schemes).toEqual(['romaji','jis-kana']);expect(manifest.ime.scripts).toEqual(['hiragana','katakana']);
  expect(manifest.ime.conversion).toBe('whole-reading-word');expect(manifest.ime.learning).toBe(false);
  expect(manifest.ime.preedit_bytes).toBe(96);expect(manifest.ime.candidate_limit).toBe(16);
  const info=manifest.ime.dictionary;
  for(const image of [manifest.image,manifest.application_distribution.image,manifest.standalone_hdd.image]){
   const d=fatReadFile(openDiskImage(readFileSync('public/kgui32/'+image),image),info.name);
   expect(d.length).toBe(info.bytes);expect(d.length).toBeLessThanOrEqual(32768);expect(createHash('sha256').update(d).digest('hex')).toBe(info.sha256);
   const b=Buffer.from(d);expect(b.subarray(0,8).toString('ascii')).toBe('KGIMED1\0');expect(b.readUInt32LE(8)).toBe(1);expect(b.readUInt32LE(12)).toBe(b.length);expect(b.readUInt32LE(16)).toBe(info.readings);expect(info.readings).toBeGreaterThan(700);
   let h=2166136261;for(const c of b.subarray(32))h=Math.imul(h^c,16777619)>>>0;expect(h).toBe(b.readUInt32LE(20));
   let count=0;for(let at=32;at<b.length;){const end=at+b.readUInt16LE(at);expect(end).toBeGreaterThan(at+4);expect(end).toBeLessThanOrEqual(b.length);const n=b[at+2],c=b[at+3];expect(n).toBeGreaterThan(0);expect(c).toBeGreaterThan(0);expect(c).toBeLessThanOrEqual(12);let p=at+4+n;for(let i=0;i<c;i++)p+=1+b[p];expect(p).toBe(end);count++;at=end;}expect(count).toBe(info.readings);
  }
 });
 it('ships native DOS Japanese terminal planes, diagnostic and concise guide',()=>{
  if(!manifest.enabled)return;
  expect(manifest.dos_terminal).toMatchObject({version:2,columns:80,rows:25,character_plane:'pc98-tvram-u16',attribute_plane:'pc98-u16',snapshot_bytes:8032,transport_chunk_bytes:992,shift_jis_output:true,pc98_attributes:true,blink:true,diagnostic:'TERM98.COM'});
  expect(manifest.shortened_base_guides).toEqual(['K386.TXT']);
  for(const image of [manifest.image,manifest.application_distribution.image,manifest.standalone_hdd.image]){
   const disk=openDiskImage(readFileSync('public/kgui32/'+image),image);
   expect(fatReadFile(disk,'TERM98.COM').length).toBeGreaterThan(100);
   const guide=fatReadFile(disk,'K386.TXT');expect(guide.length).toBeLessThan(4096);expect(new TextDecoder().decode(guide)).toContain('TERM98.COM');
  }
  const disk=openDiskImage(readFileSync('public/kgui32/'+manifest.image),manifest.image);
  const sample=fatReadFile(disk,'SAMPLE.BMP');expect(sample[0]).toBe(66);expect(sample[1]).toBe(77);
  const packed=Buffer.from(fatReadFile(disk,'KGIMAGE.EXE'));expect(packed.readUInt32LE(92)).toBe(239);const elf=packed.subarray(packed.readUInt32LE(84)),ph=elf.readUInt32LE(28);expect(elf.readUInt32LE(ph+28)).toBe(16);expect(elf.readUInt32LE(ph+8)%4096).toBe(0);
  expect(manifest.application_distribution.legacy_fd_free_bytes).toBeGreaterThanOrEqual(8192);
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
