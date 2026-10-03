import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../public/msdos2/manifest.json';
import { MSDOS2_BOOT_URL, MSDOS2_IMAGE_URL } from '../src/bundled-msdos2.ts';
import { fatReadFile, openDiskImage } from '../src/api/fat.ts';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const image = readFileSync(new URL(`../public/msdos2/${manifest.image}`, import.meta.url));

describe('bundled MS-DOS 2.0 PC-98 disk', () => {
  it('ships the exact image and all FAT12 files recorded in the source manifest', () => {
    expect(image.length).toBe(1261568);
    expect(hash(image)).toBe(manifest.sha256);
    expect(manifest.image).toContain(manifest.sha256.slice(0, 12));
    expect(image.subarray(1024, 3072)).toEqual(image.subarray(3072, 5120));
    const disk = openDiskImage(image, manifest.image);
    for (const file of manifest.files) {
      const bytes = fatReadFile(disk, file.name);
      expect(bytes.length, file.name).toBe(file.size);
      expect(hash(bytes), file.name).toBe(file.sha256);
    }
    expect(fatReadFile(disk, 'DOSLIC.TXT')).toEqual(
      new Uint8Array(readFileSync(new URL('../public/msdos2/LICENSE.txt', import.meta.url))),
    );
  });

  it('uses an image URL relative to the Pages project path and enables auto-boot', () => {
    const page = new URL(MSDOS2_BOOT_URL, 'https://kumakumapon.github.io/webnp2/');
    expect(page.pathname).toBe('/webnp2/');
    expect(page.searchParams.get('run')).toBe('1');
    expect(page.searchParams.get('fd1')).toBe(MSDOS2_IMAGE_URL);
    expect(new URL(page.searchParams.get('fd1')!, page).pathname)
      .toBe(`/webnp2/msdos2/${manifest.image}`);
  });
});
