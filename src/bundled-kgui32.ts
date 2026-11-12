import manifest from '../public/kgui32/manifest.json';

/** Explicit independent native desktop; never replace the normal/KDESK disk. */
export const KGUI32_FD_BOOT_URL = manifest.enabled
  ? `./?fd1=./kgui32/${'image' in manifest ? manifest.image : ''}&run=1&mem=16`
  : undefined;
const companion = (manifest as {workspace_hdd?: {image: string}}).workspace_hdd;
const distribution = (manifest as {application_distribution?: {image: string; hdd: {image: string}}}).application_distribution;
export const KGUI32_PAIRED_BOOT_URL = manifest.enabled && distribution
  ? `./?fd1=./kgui32/${distribution.image}&hdd=./kgui32/${distribution.hdd.image}&run=1&mem=16`
  : KGUI32_FD_BOOT_URL && companion?.image
  ? `${KGUI32_FD_BOOT_URL}&hdd=./kgui32/${companion.image}`
  : KGUI32_FD_BOOT_URL;
const standalone = (manifest as {standalone_hdd?: {image: string; hdd_boot_supported: boolean}}).standalone_hdd;
export const KGUI32_BOOT_URL = manifest.enabled && standalone?.hdd_boot_supported
  ? `./?hdd=./kgui32/${standalone.image}&run=1&mem=16`
  : KGUI32_PAIRED_BOOT_URL;
export const KGUI32_HIGH_COLOR_BOOT_URL = KGUI32_BOOT_URL ? `${KGUI32_BOOT_URL}&video=cirrus` : undefined;
