import manifest from '../public/k386/manifest.json';

/** Generated only by the pinned-source importer; keep the normal OS choice. */
export const K386_BOOT_URL = manifest.enabled
  ? `./?fd1=./k386/${manifest.image}&run=1&mem=16`
  : undefined;

/** Native Cirrus RGB565 desktop; the same immutable guest image. */
export const K386_HIGH_COLOR_BOOT_URL = K386_BOOT_URL ? `${K386_BOOT_URL}&video=cirrus` : undefined;
