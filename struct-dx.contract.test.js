const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

const pages = [
  '解題/struct_dx/frontend/diagnosis.html',
  '解題/struct_dx/frontend/verify_engine.html',
  '解題/struct_dx/frontend/struct_suite.html',
];

for (const page of pages) {
  const html = read(page);
  assert(!html.includes('alert('), `${page} uses inline feedback`, page);
  assert(html.includes('id="actionStatus"'), `${page} has action status outlet`, 'actionStatus');
  assert(html.includes('function setActionStatus'), `${page} has action status helper`, 'setActionStatus');
}

console.log('\nAll struct.dx frontend contract checks passed.');
