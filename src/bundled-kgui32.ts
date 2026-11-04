import manifest from '../public/kgui32/manifest.json';

/** Explicit independent native desktop; never replace the normal/KDESK disk. */
export const KGUI32_BOOT_URL = manifest.enabled
  ? `./?fd1=./kgui32/${'image' in manifest ? manifest.image : ''}&run=1&mem=16`
  : undefined;
export const KGUI32_HIGH_COLOR_BOOT_URL = KGUI32_BOOT_URL ? `${KGUI32_BOOT_URL}&video=cirrus` : undefined;
