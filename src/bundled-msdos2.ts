import manifest from '../public/msdos2/manifest.json';

// The content hash keeps updated images separate from saved disks in IndexedDB.
export const MSDOS2_IMAGE_URL = `./msdos2/${manifest.image}`;
export const MSDOS2_BOOT_URL = `./?fd1=${MSDOS2_IMAGE_URL}&run=1`;
