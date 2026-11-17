import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const suites = JSON.parse(readFileSync(new URL('./suites.json', import.meta.url), 'utf8'));
export function listCases() {
  return Object.entries(suites).flatMap(([name, suite]) => {
    let combinations = [{}];
    for (const [key, values] of Object.entries(suite.matrix)) {
      combinations = combinations.flatMap(current => values.map(value => ({ ...current, [key]: value })));
    }
    return combinations.map(values => {
      const expand = word => word.replace(/\{(\w+)\}/g, (_, key) => values[key]);
      return {
        id: [name, ...Object.values(values)].join('-'), timeout: suite.timeout, base: suite.base,
        directories: suite.directories ?? [],
        commands: suite.commands.map(command => ({ argv: command.argv.map(expand), env: command.env ?? {} })),
      };
    });
  });
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const include = listCases().map(item => ({ case: item.id, timeout: item.timeout }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify({include})}\n`);
  else console.log(JSON.stringify({include}));
}
