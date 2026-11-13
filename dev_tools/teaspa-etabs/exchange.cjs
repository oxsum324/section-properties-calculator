'use strict';
const fs = require('node:fs');
const path = require('node:path');
const pm3 = require('../../結構工具箱/tools/rc/teaspa-pm3.js');
const [action, folder] = process.argv.slice(2);
const file = name => path.join(folder, name);
const json = name => JSON.parse(fs.readFileSync(file(name), 'utf8').replace(/^\uFEFF/,''));
if (action === 'example') {
  const example = require('../../結構工具箱/tools/rc/teaspa-column-reference.js');
  fs.writeFileSync(file('source.json'), JSON.stringify(example, null, 2), {flag:'wx'});
  process.exit(0);
}
const source = pm3.validate(json('source.json'));
if (action === 'prepare') {
  const data = pm3.tables(source);
  fs.writeFileSync(file('pm3.tsv'), pm3.tsv(data.hinges));
  fs.writeFileSync(file('assign.tsv'), pm3.tsv(data.ends));
} else if (action === 'compare') {
  const result = pm3.compare(source, json('readback.json'));
  fs.writeFileSync(file('comparison.json'), JSON.stringify(result, null, 2));
  console.log(result.matched ? 'ETABS reopened model matches source.' : JSON.stringify(result.differences));
  if (!result.matched) process.exitCode = 2;
} else {
  throw new Error('Expected prepare or compare.');
}
