'use strict';

const assert = require('assert');
const adapter = require('./pile-cap-load-combinations.js');

const result = adapter.generate({
  Pu:{ D:300, L:50, W:0, E:0 },
  Mux:{ D:0, L:0, W:100, E:0 },
  Muy:{ D:0, L:0, W:0, E:100 },
});

assert.strictEqual(result.schema, 'pile-cap-stm-load-combinations-v1');
assert.strictEqual(result.loadComboSchema, 'loadcombo-tuples-v2');
assert.strictEqual(result.cases.length, 10);
assert.deepStrictEqual(result.activeLoads, { D:true, L:true, W:true, E:true });
assert.deepStrictEqual(result.cases[0], {
  id:'LC1',
  combination:'1.4D',
  PuTf:420,
  MuxTfm:0,
  MuyTfm:0,
  factors:{ D:1.4, L:0, W:0, E:0 },
});
assert.strictEqual(result.cases.find(item => item.combination === '1.2D + 1.0L + 1.0W').MuxTfm, 100);
assert.strictEqual(result.cases.find(item => item.combination === '1.2D + 1.0L - 1.0W').MuxTfm, -100);
assert.strictEqual(result.cases.find(item => item.combination === '0.9D + 1.0E').MuyTfm, 100);
assert.strictEqual(result.cases.find(item => item.combination === '0.9D - 1.0E').MuyTfm, -100);

const gravityOnly = adapter.generate({
  Pu:{ D:200, L:80 },
  Mux:{ D:10 },
  Muy:{},
});
assert.deepStrictEqual(gravityOnly.cases.map(item => item.combination), ['1.4D', '1.2D + 1.6L']);

assert.throws(() => adapter.generate({ Pu:{}, Mux:{ E:10 }, Muy:{} }), /Pu 必須大於 0/);
assert.throws(() => adapter.generate({ Pu:{ D:100 }, Mux:{ D:'bad' }, Muy:{} }), /Mux\.D 必須是有限數值/);
assert.throws(() => adapter.generate({ Pu:{ D:100 }, Mux:{}, Muy:{} }, { method:'ASD' }), /僅接受 LRFD/);

console.log('pile-cap load-combination adapter tests passed');
