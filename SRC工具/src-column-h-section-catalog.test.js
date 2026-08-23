'use strict';

const assert = require('node:assert/strict');
const Catalog = require('./core/src-column-h-section-catalog.js');

function close(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: actual must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`);
}

assert.equal(Catalog.CATALOG_VERSION, 'src-column.h-section-catalog.v1.0.0', 'formal catalog is explicitly versioned');
assert.equal(Catalog.SOURCE.authority, '內政部建築研究所', 'catalog identifies the public source authority');
assert.equal(Catalog.SOURCE.printedPage, 289, 'catalog identifies the printed appendix page');
assert.equal(Catalog.SOURCE.pdfPage, 301, 'catalog identifies the PDF page used for visual verification');
assert.ok(Catalog.SOURCE.officialPage.startsWith('https://www.abri.gov.tw/'), 'catalog links to the official publication page');
assert.ok(Catalog.SOURCE.documentUrl.startsWith('https://ws.moi.gov.tw/'), 'catalog links to the official document download');
assert.ok(Catalog.SOURCE.availabilityBoundary.includes('不證明目前可供貨'), 'old appendix data is not overclaimed as current availability');

const sections = Catalog.listSections();
assert.equal(sections.length, 7, 'first verified catalog covers the complete H500x300 appendix group');
assert.equal(new Set(sections.map(item => item.id)).size, sections.length, 'catalog ids are unique');
assert.equal(new Set(sections.map(item => item.name)).size, sections.length, 'catalog names are unique');
assert.notEqual(sections, Catalog.SECTIONS, 'listSections does not expose the catalog array itself');

for (const item of sections) {
  assert.ok(Object.isFrozen(item) && Object.isFrozen(item.dimensions) && Object.isFrozen(item.properties), `${item.id} is immutable`);
  for (const [field, value] of Object.entries({ ...item.dimensions, ...item.properties })) {
    assert.ok(Number.isFinite(value) && value > 0, `${item.id}.${field} is positive and finite`);
  }
  close(item.properties.massKgM, item.properties.areaCm2 * 0.785, 0.8, `${item.id} mass follows the published rounded area`);
  close(item.properties.sxCm3, 2 * item.properties.ixCm4 / item.dimensions.depthCm, item.properties.sxCm3 * 0.015, `${item.id} published Sx is consistent with Ix`);
  close(item.properties.syCm3, 2 * item.properties.iyCm4 / item.dimensions.flangeWidthCm, item.properties.syCm3 * 0.015, `${item.id} published Sy is consistent with Iy`);
  assert.equal(item.source, Catalog.SOURCE, `${item.id} retains the shared source record`);
}

const example8 = Catalog.getSection('RH-500X304X15X24');
assert.equal(example8.name, 'H500×304×15×24', 'lookup is stable and case-insensitive');
assert.equal(example8.orderProducedAtPublication, true, 'the appendix order-production marker is preserved');
assert.deepEqual(example8.dimensions, {
  depthCm: 50,
  flangeWidthCm: 30.4,
  webThicknessCm: 1.5,
  flangeThicknessCm: 2.4,
  rootRadiusCm: 1.3,
}, 'example 8 dimensions match the official appendix row');
assert.deepEqual(example8.properties, {
  areaCm2: 215,
  massKgM: 169,
  ixCm4: 95000,
  iyCm4: 11300,
  sxCm3: 3800,
  syCm3: 740,
  zxCm3: 4270,
  zyCm3: 1140,
}, 'example 8 properties match the official appendix row');
close(Math.sqrt(example8.properties.ixCm4 / example8.properties.areaCm2), 21.02, 0.01, 'example 8 rx agrees with the design example');
close(Math.sqrt(example8.properties.iyCm4 / example8.properties.areaCm2), 7.25, 0.01, 'example 8 ry agrees with the design example');
assert.equal(Catalog.getSection('missing'), null, 'unknown catalog ids fail closed');

console.log('SRC column verified H-section catalog OK (7 sourced rows + source and consistency checks)');
