import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const origin = 'https://kumakumapon.github.io';
const base = origin + '/webnp2/';
const manifest = JSON.parse(readFileSync('dist/msdos4/manifest.json', 'utf8'));
const bootImage = './msdos4/' + manifest.image;
assert(existsSync('dist/index.html'));
assert(existsSync('dist/msdos4/' + manifest.image));
let helpLinks = 0;
for (const match of readFileSync('dist/help.html', 'utf8').matchAll(/href="([^"]*msdos4-retrobasic-[^"]+)"/g)) {
  const link = new URL(match[1].replaceAll('&amp;', '&'), base);
  assert.equal(link.searchParams.get('fd1'), bootImage);
  helpLinks++;
}
assert.equal(helpLinks, 2, 'both help languages link to the generated DOS4 image');
for (const [file, language] of [['README.md', 'en'], ['README.ja.md', 'ja']]) {
  const text = execFileSync('git', ['show', 'HEAD:' + file], {encoding:'utf8'});
  const link = text.split('\n').find(line => line.startsWith('- **MS-DOS 4.0 + RetroBasic '));
  assert(link, file + ' DOS4 boot menu entry');
  assert(link.includes('<' + base + '?lang=' + language + '>'), file + ' links to the stable boot menu');
  assert(!/msdos4-retrobasic-[0-9a-f]{12}\.xdf/.test(text), file + ' contains a generated image filename');
}
