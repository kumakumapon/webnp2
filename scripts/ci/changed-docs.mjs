import { execFileSync } from 'node:child_process';

/** @param {string[]} paths */
export function documentationOnly(paths) {
  return paths.length > 0 && paths.every(path =>
    /^(?:README(?:\.ja)?\.md|docs\/.+\.md)$/.test(path));
}

if (process.argv[1]?.endsWith('/changed-docs.mjs')) {
  const base = process.env.DIFF_BASE ?? '';
  const head = process.env.DIFF_HEAD ?? '';
  let onlyDocs = false;
  if ([base, head].every(value => /^[0-9a-f]{40}$/.test(value) && !/^0+$/.test(value))) {
    try {
      const files = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, head], { encoding: 'utf8' });
      onlyDocs = documentationOnly(files.split('\0').filter(Boolean));
    } catch { /* Unknown revisions require the complete test matrix. */ }
  }
  console.log(`docs_only=${onlyDocs}`);
}
