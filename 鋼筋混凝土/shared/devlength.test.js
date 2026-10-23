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

// 拉力伸展長度 ℓd：112 年版表 25.4.2.3（原 PDF p.448），kgf/cm² 制
//   有利條件：D19 及較小 fy·ψt·ψe/(6.6λ√fc')·db；D22 及較大 /(5.3λ√fc')
//   其他情況：D19 及較小 /(4.4λ√fc')；D22 及較大 /(3.5λ√fc')；ψt·ψe ≤ 1.7（25.4.2.5）；ℓd ≥ 30 cm
// 手算 3：fc'=280、fy=4200、#6 (db=1.905 cm)、ψt=ψe=1
//   有利 4200/(6.6×16.7332)×1.905 = 72.447 cm；其他 4200/(4.4×16.7332)×1.905 = 108.670 cm
{
  const fav = DevLength.ldTension({ fc:280, fy:4200, db:1.905, condition:'favorable' });
  const oth = DevLength.ldTension({ fc:280, fy:4200, db:1.905, condition:'other' });
  assert.ok(Math.abs(fav - 72.447) < 0.001, `ℓd #6 favorable ${fav}`);
  assert.ok(Math.abs(oth - 108.670) < 0.001, `ℓd #6 other ${oth}`);
  assert.equal(DevLength.ldTension({ fc:280, fy:4200, db:1.905 }), oth, '未指定條件時採其他情況');
}
// 手算 4：fc'=280、fy=4200、#8 (db=2.54 cm)
//   有利 4200/(5.3×16.7332)×2.54 = 120.290 cm；其他 4200/(3.5×16.7332)×2.54 = 182.153 cm
{
  const fav = DevLength.ldTension({ fc:280, fy:4200, db:2.54, condition:'favorable' });
  const oth = DevLength.ldTension({ fc:280, fy:4200, db:2.54, condition:'other' });
  assert.ok(Math.abs(fav - 120.290) < 0.001, `ℓd #8 favorable ${fav}`);
  assert.ok(Math.abs(oth - 182.153) < 0.001, `ℓd #8 other ${oth}`);
}
// 手算 5：ψt·ψe = 1.3×1.5 = 1.95 → 取 1.7：#8 有利 120.290×1.7 = 204.493 cm
{
  const got = DevLength.ldTension({ fc:280, fy:4200, db:2.54, psit:1.3, psie:1.5, condition:'favorable' });
  assert.ok(Math.abs(got - 204.493) < 0.001, `ℓd ψtψe cap ${got}`);
}
// 條件判定：保護層 < db → 其他；淨間距 ≥ 2db 且保護層 ≥ db → 有利；db ≤ 淨間距 < 2db 需最少橫向筋
assert.equal(DevLength.spacingCondition({ db:2.54, clearSpacing:6, clearCover:2.0 }), 'other');
assert.equal(DevLength.spacingCondition({ db:2.54, clearSpacing:5.08, clearCover:2.54 }), 'favorable');
assert.equal(DevLength.spacingCondition({ db:2.54, clearSpacing:3.0, clearCover:5.0, minTransverse:true }), 'favorable');
assert.equal(DevLength.spacingCondition({ db:2.54, clearSpacing:3.0, clearCover:5.0, minTransverse:false }), 'other');
assert.equal(DevLength.spacingCondition({ db:2.54, clearSpacing:2.0, clearCover:5.0, minTransverse:true }), 'other');
assert.equal(DevLength.spacingCondition({ db:2.54 }), 'other', '缺資料時保守取其他情況');

console.log('devlength.test.js: PASS');
