import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../public/msdos4/manifest.json';
import { MSDOS4_BOOT_URL, MSDOS4_IMAGE_URL } from '../src/bundled-msdos4.ts';
import { fatList, fatReadFile, openDiskImage } from '../src/api/fat.ts';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const image = readFileSync(new URL(`../public/msdos4/${manifest.image}`, import.meta.url));

describe('bundled MS-DOS 4.0 + RetroBasic PC-98 disk', () => {
  it('ships the clean release disk, both FATs, all recorded files and full MIT notices', () => {
    expect(image.length).toBe(1261568);
    expect(hash(image)).toBe(manifest.sha256);
    expect(manifest.image).toContain(manifest.sha256.slice(0, 12));
    expect(manifest.dos_version).toBe('4');
    expect(manifest.dos_commit).toBe(manifest.sources.msdos.commit);
    for (const source of Object.values(manifest.sources)) {
      expect(source.commit).toMatch(/^[a-f0-9]{40}$/);
      expect(source.license).toBe('MIT');
    }
    expect(image.subarray(1024, 3072)).toEqual(image.subarray(3072, 5120));
    const disk = openDiskImage(image, manifest.image);
    expect(fatList(disk, '/').map(file => file.name).sort())
      .toEqual(manifest.files.map(file => file.name).sort());
    for (const file of manifest.files) {
      const bytes = fatReadFile(disk, file.name);
      expect(bytes.length, file.name).toBe(file.size);
      expect(hash(bytes), file.name).toBe(file.sha256);
    }
    const notices = readFileSync(new URL('../public/msdos4/LICENSE.txt', import.meta.url));
    expect(fatReadFile(disk, 'LICENSE.TXT')).toEqual(new Uint8Array(notices));
    expect(notices.toString()).toContain('Copyright (c) Microsoft Corporation');
    expect(notices.toString()).toContain('Copyright (c) 2026 kumakumapon');
    expect(notices.toString().split('Permission is hereby granted')).toHaveLength(5);
    expect(notices.includes(fatReadFile(disk, 'DOSLIC.TXT'))).toBe(true);
    expect(notices.includes(fatReadFile(disk, 'FILERLIC.TXT'))).toBe(true);
    expect(notices.includes(fatReadFile(disk, 'EDITLIC.TXT'))).toBe(true);
    expect(fatReadFile(disk, 'EDIT.COM')).toEqual(fatReadFile(disk, 'EDIT98.COM'));
    expect(new TextDecoder('shift_jis').decode(fatReadFile(disk, 'JPHELLO.TXT'))).toContain('日本語表示のテスト');
    expect(fatReadFile(disk, 'EDIT.TXT')).toEqual(
      new Uint8Array(readFileSync(new URL('../public/msdos4/EDIT.txt', import.meta.url))),
    );
    expect(hash(readFileSync(new URL('../scripts/verify-editor.mjs', import.meta.url))))
      .toBe(manifest.editor_verifier_sha256);
    expect(manifest.sources.editor.commit).toBe(manifest.sources.msdos.commit);
    expect(manifest.memory_drivers['FDXMS286.SYS'].license).toBe('GPL-2.0-only');
    expect(manifest.memory_drivers['EMM386.EXE'].license).toBe('Artistic-1.0');
    expect(manifest.license).toBe('MIT + GPL-2.0-only + Artistic-1.0');
    expect(fatReadFile(disk, 'FILER.TXT')).toEqual(
      new Uint8Array(readFileSync(new URL('../public/msdos4/FILER.txt', import.meta.url))),
    );
    expect(hash(readFileSync(new URL('../scripts/verify-filer.mjs', import.meta.url))))
      .toBe(manifest.filer_verifier_sha256);
    expect(manifest.sources.filer.commit).toBe(manifest.sources.msdos.commit);
    expect(manifest.files.map(file => file.name)).toEqual(expect.arrayContaining([
      'MSDOS.SYS', 'COMMAND.COM', 'RBASIC.COM', 'P98TEST.COM', 'PRIMES.BAS',
      'GRAPHICS.BAS', 'MANDEL.BAS', 'MANSMOKE.BAS', 'FILEIO.BAS', 'FD98.COM', 'FILER.TXT', 'FILERLIC.TXT',
      'EDIT98.COM', 'EDIT.COM', 'EDIT.TXT', 'EDITLIC.TXT', 'JPHELLO.TXT',
      'FDXMS286.SYS', 'EMM386.EXE', 'XMSCHK.COM', 'EMSCHK.COM', 'XMSLIC.TXT', 'EMM386L.TXT',
    ]));
    const config = new TextDecoder().decode(fatReadFile(disk, 'CONFIG.SYS'));
    expect(config).toContain('DEVICE=FDXMS286.SYS');
    expect(config).toContain('DEVICE=EMM386.EXE EMM=8192');
    for (const [name, driver] of Object.entries(manifest.memory_drivers)) {
      expect(hash(fatReadFile(disk, name))).toBe(driver.sha256);
      expect(hash(fatReadFile(disk, driver.license_file))).toBe(driver.license_sha256);
    }
  });

  it('boots the bundled image relative to the Pages project path', () => {
    const page = new URL(MSDOS4_BOOT_URL, 'https://kumakumapon.github.io/webnp2/');
    expect(page.pathname).toBe('/webnp2/');
    expect(page.searchParams.get('run')).toBe('1');
    expect(page.searchParams.get('fd1')).toBe(MSDOS4_IMAGE_URL);
    expect(new URL(page.searchParams.get('fd1')!, page).pathname)
      .toBe(`/webnp2/msdos4/${manifest.image}`);
  });
});
