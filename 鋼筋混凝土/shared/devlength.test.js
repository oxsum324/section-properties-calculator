// devlength.js 獨立手算測試（E1 審查新增）
// 壓力伸展長度 ℓdc：112 年版混凝土結構設計規範 25.4.9.2（原 PDF p.466），kgf/cm² 制：
//   ℓdc = max( 0.075·fy·ψr/(λ√fc')·db , 0.0044·fy·ψr·db )，且 ℓdc ≥ 20 cm（25.4.9.1）
// 預期值直接以規範 kgf 制係數手算（不使用 SI 換算值，0.043/10.197 = 0.00422 與規範 0.0044 不同）。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { Math, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'devlength.js'), 'utf8'), ctx);
const DevLength = ctx.window.DevLength;

const handLdc = ({ fc, fy, db, lambda = 1 }) => Math.max(
  Math.max((0.075 * fy) / (lambda * Math.sqrt(fc)) * db, 0.0044 * fy * db),
  20,
);
const close = (got, expected, label) => assert.ok(Math.abs(got - expected) <= 1e-9 * Math.max(1, expected), `${label}: got ${got} cm, expected ${expected} cm`);

// 手算 1：fc'=280、fy=4200、#8 (db=2.54 cm)：(a) 0.075×4200/√280×2.54 = 47.815 cm；(b) 0.0044×4200×2.54 = 46.94 cm → (a) 控制
{
  const expected = handLdc({ fc:280, fy:4200, db:2.54 });
  assert.ok(Math.abs(expected - 47.815) < 0.001, `hand value ${expected}`);
  close(DevLength.ldCompression({ fc:280, fy:4200, db:2.54 }), expected, 'ℓdc #8 fc280');
}

// 手算 2：fc'=560、fy=4200、#6 (db=1.905 cm)：(a) 25.36 cm；(b) 0.0044×4200×1.905 = 35.204 cm → (b) 控制
// （若誤用 0.0043 會得 34.404 cm，本例可分辨係數）
{
  const expected = handLdc({ fc:560, fy:4200, db:1.905 });
  assert.ok(Math.abs(expected - 35.2044) < 0.001, `hand value ${expected}`);
  close(DevLength.ldCompression({ fc:560, fy:4200, db:1.905 }), expected, 'ℓdc #6 fc560');
}

// 邊界：小筋觸發 20 cm 下限
{
  const got = DevLength.ldCompression({ fc:420, fy:2800, db:0.953 });
  assert.equal(got, 20);
}

console.log('devlength.test.js: PASS');
