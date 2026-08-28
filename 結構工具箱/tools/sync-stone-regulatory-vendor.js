'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const toolboxRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(toolboxRoot, '..');
const stoneVendorRoot = path.join(repoRoot, '石材固定', 'vendor', 'loads');
const pairs = [
  ['core/loads/wind.js', 'wind.js'],
  ['core/loads/seismic-zones.js', 'seismic-zones.js'],
  ['core/loads/seismic.js', 'seismic.js'],
  ['core/loads/regulatory-locations.js', 'regulatory-locations.js'],
  ['core/loads/project-location.js', 'project-location.js'],
];

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sync() {
  fs.mkdirSync(stoneVendorRoot, { recursive: true });
  return pairs.map(([sourceRelative, targetName]) => {
    const sourcePath = path.join(toolboxRoot, sourceRelative);
    const targetPath = path.join(stoneVendorRoot, targetName);
    const source = fs.readFileSync(sourcePath);
    fs.writeFileSync(targetPath, source);
    const sourceHash = hash(source);
    const targetHash = hash(fs.readFileSync(targetPath));
    if (sourceHash !== targetHash) throw new Error(`vendor 同步後雜湊不一致：${targetName}`);
    return { source: sourceRelative.replace(/\\/g, '/'), target: `石材固定/vendor/loads/${targetName}`, sha256: sourceHash };
  });
}

if (require.main === module) {
  const result = sync();
  process.stdout.write(`${JSON.stringify({ synced: result.length, files: result }, null, 2)}\n`);
}

module.exports = { sync, pairs };
