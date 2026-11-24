import manifest from '../public/msdos4/manifest.json';

export const MSDOS4_STARTS_KDESK = 'desktop_autostart' in manifest && manifest.desktop_autostart === true;
export const MSDOS4_IMAGE_URL = `./msdos4/${manifest.image}`;
export const MSDOS4_BOOT_URL = `./?fd1=${MSDOS4_IMAGE_URL}&run=1`;
