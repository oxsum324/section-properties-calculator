const assert = require('assert');
const FoundationPile = require('./foundation-pile.js');

function near(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: finite result required`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

// §5.3.1 and Table 5.3-2. For the 1 m bored pile, the last metre above
// the toe has N=10 and the first metre below N=80. Limit the average, not each reading.
{
  const profile = FoundationPile.parseAxialProfile('0,10,10,0,30,1,sand\n10,14,80,0,30,1,砂土');
  assert.deepEqual(profile.errors,[]);
  const [top,bottom] = profile.layers;
  const window = FoundationPile.nValueTip(profile.layers,10,1,'bored');
  assert.deepEqual([window.mean,window.adopted,window.qbUlt],[45,45,337.5]);
  near(FoundationPile.nValueTip(profile.layers,10,1,'driven').qbUlt,720,1e-10,'4D above and 1D below');
  assert.equal(FoundationPile.nValueTip([{...top,N:99},{...bottom,N:99}],10,1,'bored').qbUlt,375);
  assert.throws(()=>FoundationPile.nValueTip([top],10,1,'bored'),/資料不足/);
  assert.throws(()=>FoundationPile.nValueTip([top,{...bottom,from:10.1}],10,1,'bored'),/連續/);
  assert.throws(()=>FoundationPile.nValueTip([top,{...bottom,type:'gravel'}],10,1,'bored'),/砂性土/);
  assert.equal(FoundationPile.getLayerAtDepth(profile.layers,10),bottom);
  const rock = FoundationPile.parseAxialProfile('0,15,50,0,30,1,砂岩').layers[0];
  assert.equal(rock.type,'rock');
  const unknownInputs=FoundationPile.parseAxialProfile('0,15,,,,1,頁岩,0,900,試樁 R01');
  assert.deepEqual(unknownInputs.errors,[]);
  assert.equal(unknownInputs.layers[0].N,null);
  assert.equal(FoundationPile.calculateTipResistance(unknownInputs.layers,10,1,'bored').qbUlt,900);

  assert.throws(()=>FoundationPile.calculateTipResistance([rock],10,1,'bored'),/專案|依據/);
  assert.throws(()=>FoundationPile.integrateSkinFriction([rock],10,1,'bored'),/樁周/);
  const specified = {...rock,fsInput:0,qbInput:900,basis:'測試紀錄'};
  const capacity = FoundationPile.calculateAxialCapacity({layers:[specified],pileLength:10,pileDiameterM:1,pileInstall:'bored',safetyFactor:3});
  near(capacity.Qult,900*Math.PI/4,1e-9,'independent rock inputs including zero shaft resistance');
  assert.equal(FoundationPile.calculateTipResistance([{...specified,type:'gravel'}],10,1,'bored').qbUlt,750);
  assert.ok(FoundationPile.parseAxialProfile('0,15,50,0,30,1,砂岩,5,900,').errors.length);
}

const layers = [{ from:0, to:10, N:0, c:5, phi:0, gammaEff:1.8, type:'clay' }];
const capacity = FoundationPile.calculateAxialCapacity({
  layers, pileLength:10, pileDiameterM:0.5, pileInstall:'drilled', safetyFactor:2.5
});
near(capacity.Qs, 54.97787143782138, 1e-10, 'uniform clay shaft capacity');
near(capacity.Qb, 8.835729338221293, 1e-10, 'uniform clay tip capacity');
near(capacity.Qall, 25.525440310417068, 1e-10, 'uniform clay allowable capacity');

// 四支樁的壓力與兩向彎矩應分別平衡；調整服務工況不改變強度工況。
const service = FoundationPile.groupReactions({pileNL:2, pileNB:2, pileSL:250, pileSB:250, axial:240, mx:40, my:-20});
assert.deepEqual(service.reactions, [56,72,48,64]);
near(service.reactions.reduce((n,r,i) => n + r*service.ys[i]/100, 0), 40, 1e-12, 'service Mx equilibrium');
near(service.reactions.reduce((n,r,i) => n + r*service.xs[i]/100, 0), -20, 1e-12, 'service My equilibrium');
assert.throws(() => FoundationPile.groupReactions({pileNL:1,pileNB:2,pileSL:250,pileSB:250,axial:80,mx:0,my:1}), /無法/);

const working = {serviceLoad:60, toePercent:25, Qb:50, Qs:100, pileLength:22, pileD_m:0.4,
  pileArea_m2:Math.PI*0.4**2/4, fc:280, mode:'auto', qbUlt:400, allowable:2};
const settle = overrides => FoundationPile.workingSettlement({...working, ...overrides});
const parts = toe => {
  const shaft = 60 - toe;
  return [(toe + 0.67*shaft)*22*100/(working.pileArea_m2*120000*Math.sqrt(280)),
    0.09*toe*100/(0.4*400), (0.93+0.16*Math.sqrt(22/0.4))*0.09*shaft*100/(22*400)];
};
const w60 = settle({});
near(w60.Ep, 2007984.0636817813, 1e-8, '常重混凝土 Ec 轉 tf/m²');
const steelSettlement = settle({pileType:'steel-pipe'});
assert.strictEqual(steelSettlement.Ep, null);
assert.strictEqual(steelSettlement.Wo_cm, null);
assert.strictEqual(steelSettlement.ok, null);
assert.match(FoundationPile.settlementBasis(steelSettlement), /鋼管樁/);
[w60.Ws_cm,w60.Wpp_cm,w60.Wps_cm].forEach((v,i) => near(v,parts(15)[i],1e-12,'working-load component'));
near(settle({serviceLoad:120}).Wo_cm,2*w60.Wo_cm,1e-12,'constant proportion doubles settlement');
const envelope = settle({toePercent:null});
near(envelope.minWo_cm,parts(0).reduce((a,b)=>a+b),1e-12,'all shaft lower end');
near(envelope.Wo_cm,parts(50).reduce((a,b)=>a+b),1e-12,'toe capacity upper end');
assert.strictEqual(envelope.ok,null);
assert.strictEqual(settle({toePercent:null,allowable:4}).ok,true);
assert.strictEqual(settle({toePercent:null,allowable:0.01}).ok,false);
assert.strictEqual(settle({serviceLoad:0}).Wo_cm,0);
assert.strictEqual(settle({serviceLoad:null}).Wo_cm,null);
assert.strictEqual(settle({serviceLoad:151,toePercent:null}).Wo_cm,null);
assert.strictEqual(settle({toePercent:100}).Wo_cm,null);
assert.strictEqual(settle({toePercent:0}).toe,0);
assert.strictEqual(settle({toePercent:100,serviceLoad:40}).shaft,0);
assert.strictEqual(settle({qbUlt:0}).Wo_cm,null);

const group = FoundationPile.calculateGroupAndCap({
  fc:280, fy:4200, phiShear:0.75, lambda:1,
  c1:60, c2:60, pileD:50, pileNL:2, pileNB:2, pileSL:250, pileSB:250,
  PuTf:400, MxTfm:80, MyTfm:40,
  hc:100, cover:7.5, db:2.222, capSteelAreaTotal:80, capB:350, capL:350
});
assert.deepEqual(group.reactions, [76, 108, 92, 124], '2x2 group resolves signed biaxial pile reactions');
near(group.reactions.reduce((sum, value) => sum + value, 0), 400, 1e-10, 'pile reactions preserve axial equilibrium');
near(group.rMax, 124, 1e-12, 'maximum pile reaction');
near(group.rMin, 76, 1e-12, 'minimum pile reaction');
assert.equal(group.excludedCount, 0, 'benchmark piles remain outside punching exclusion zone');
near(group.Vu2Tf, 400, 1e-10, 'pile-cap punching demand');
// 樁帽由基樁支撐，不適用 13.2.6.2，λs 依 22.5.5.1.3（d = 100 − 7.5 − 2.222 = 90.278 cm > 25 cm）：
// λs = √(2/(1 + 90.278/25)) = √(2/4.61112) = 0.658585
// 衝剪 22.6.5.2：bo = 4×(60 + 90.278) = 601.112；vc = min(1.06, 0.27×(2+4/1), 0.27×(40×90.278/601.112+2))·λs·√280
//   = min(1.06, 1.62, 2.16200)×0.658585×16.7332 = 1.06×0.658585×16.7332 = 11.6814 kgf/cm²
// φVc = 0.75×11.6814×601.112×90.278 = 475,439 kgf = 475.44 tf（未計 λs 時為 721.91 tf）
const capD = 90.278;
const capLambdaS = Math.sqrt(2 / (1 + capD / 25));
near(group.lambdaS, capLambdaS, 1e-12, 'pile cap size effect factor follows 22.5.5.1.3');
near(group.lambdaS, 0.658585, 1e-6, 'pile cap size effect factor hand value');
near(group.phiVc2Kgf / 1000, 0.75 * 1.06 * capLambdaS * Math.sqrt(280) * 601.112 * capD / 1000, 1e-9, 'pile-cap punching capacity includes lambda_s');
near(group.phiVc2Kgf / 1000, 475.439, 0.001, 'pile-cap punching capacity hand value');
assert.deepEqual(group.pileReactionRowsL, [184, 216], 'long-direction row reactions');
assert.deepEqual(group.pileReactionRowsB, [168, 232], 'transverse row reactions');
// Independent hand calculation (column-face moment, 13.2.7.1; one-way shear at d, 13.2.7.2 with 13.4.6.5 interpolation):
// arm to column face = 125 - 60/2 = 95 cm; +y piles 108 + 124 = 232 tf -> Mu,trans = 232 x 0.95 = 220.4 tf-m.
near(group.capMuTransTfm, 220.4, 1e-9, 'pile-cap transverse column-face moment');
near(group.capMuLongTfm, 216 * 0.95, 1e-9, 'pile-cap long column-face moment');
// one-way section at c/2 + d = 30 + 90.278 = 120.278 cm; pile centre 4.722 cm outside -> factor (4.722 + 25) / 50.
near(group.capVuTf, 232 * (4.722 + 25) / 50, 1e-9, 'pile-cap one-way shear with partial pile reaction');
// 單向剪力 表 22.5.5.1(c)（無剪力筋，Vs = 0），兩向斷面寬皆 350 cm、每方向 As = 80 cm²：
// ρw = 80/(350 × 90.278) = 0.0025319；ρw^(1/3) = 0.136295
// vc = 2.12 × 0.658585 × 0.136295 × 16.7332 = 3.18425 kgf/cm²
// φVc = 0.75 × 3.18425 × 350 × 90.278 / 1000 = 75.460 tf（舊式 0.53√fc′、無 λs 為 210.17 tf）
const capRho = 80 / (350 * capD);
near(group.capRhoWLong, capRho, 1e-15, 'pile-cap rho_w uses provided steel over cap width and d');
near(group.capPhiVnTf, 0.75 * 2.12 * capLambdaS * Math.cbrt(capRho) * Math.sqrt(280) * 350 * capD / 1000, 1e-9, 'pile-cap one-way shear capacity follows Table 22.5.5.1(c) with lambda_s');
near(group.capPhiVnTf, 75.460, 0.001, 'pile-cap one-way shear capacity hand value');
near(group.capVsTf, 0, 0, 'pile-cap Vs is not assumed without stirrup input');
assert.equal(group.okCapShear, false, 'Vu = 137.91 tf exceeds phiVc = 75.46 tf once lambda_s and rho_w are applied');
// As,req: 0.9 As fy (d - As fy / (1.7 fc b)) = 220.4e5 with b = 350 -> 65.795 cm2 (> 0.0018 x 350 x 100 = 63.0).
near(group.capAsReq, 65.79477945552841, 0.05, 'pile-cap reinforcement demand over full cap width');
assert.equal(group.okCapFlex, true, 'As = 80 cm2 per direction satisfies 65.8 cm2 demand');
assert.equal(group.okCapFlexStrength, true, 'pile-cap phiMn >= Mu reported separately');
near(group.capAsMin, 0.0018 * 350 * 100, 1e-12, 'pile-cap minimum steel 0.0018 b h');
assert.equal(group.okCapAsMin, true, 'As = 80 >= 63.0 cm2 minimum steel');

// 撓曲強度足夠但未達最小鋼筋量：分列判定，φMn ≥ Mu 依實際比較為 ✓，最小鋼筋量為 ✗，整體 okCapFlex 仍為 ✗。
// 2×2 樁、Pu = 200 tf、無彎矩 → 每樁 50 tf；柱面臂 = 125 − 30 = 95 cm → Mu = 2 × 50 × 0.95 = 95 tf·m
// As = 60 cm²：a = 60×4200/(0.85×280×350) = 3.025 cm；φMn ≈ 0.9×60×4200×(90.278 − 1.513)/1e5 = 201.3 tf·m ≥ 95
// As,min = 0.0018 × 350 × 100 = 63.0 cm² > 60 → 最小鋼筋量不足
const minSteelCap = FoundationPile.calculateGroupAndCap({
  fc:280, fy:4200, phiShear:0.75, lambda:1,
  c1:60, c2:60, pileD:50, pileNL:2, pileNB:2, pileSL:250, pileSB:250,
  PuTf:200, MxTfm:0, MyTfm:0,
  hc:100, cover:7.5, db:2.222, capSteelAreaTotal:60, capB:350, capL:350
});
near(minSteelCap.capMuTfm, 95, 1e-9, 'minimum-steel cap moment hand value');
assert.ok(minSteelCap.capPhiMnTfm >= minSteelCap.capMuTfm, 'minimum-steel cap phiMn exceeds Mu');
near(minSteelCap.capPhiMnTfm, 0.9 * 60 * 4200 * (capD - 60 * 4200 / (0.85 * 280 * 350) / 2) / 1e5, 0.5, 'minimum-steel cap phiMn hand value');
assert.equal(minSteelCap.okCapFlexStrength, true, 'phiMn >= Mu row passes on actual comparison');
assert.equal(minSteelCap.okCapAsMin, false, 'minimum steel row fails: 60 < 63 cm2');
assert.equal(minSteelCap.okCapFlex, false, 'overall pile-cap flexure verdict stays NG');

// Provided steel must not be raised to the demand: 4 cm2 per direction cannot pass flexure.
const weakCap = FoundationPile.calculateGroupAndCap({
  fc:280, fy:4200, phiShear:0.75, lambda:1,
  c1:60, c2:60, pileD:50, pileNL:2, pileNB:2, pileSL:250, pileSB:250,
  PuTf:400, MxTfm:80, MyTfm:40,
  hc:100, cover:7.5, db:2.222, capSteelAreaTotal:4, capB:350, capL:350
});
assert.equal(weakCap.capAsProv, 4, 'provided cap steel is reported as input, not max(input, demand)');
assert.equal(weakCap.okCapFlex, false, 'under-reinforced pile cap fails flexure');
assert.ok(weakCap.capPhiMnTfm < weakCap.capMuTfm, 'under-reinforced cap phiMn < Mu');

// Punching (13.4.6.5): 2x2 piles at +/-90 cm, D = 50, column 60, d = 90.278 -> critical half-width 75.139 cm.
// Pile centre is outside by hypot(14.861, 14.861) = 21.017 cm < D/2 -> factor (21.017 + 25) / 50 = 0.92033.
const nearCap = FoundationPile.calculateGroupAndCap({
  fc:280, fy:4200, phiShear:0.75, lambda:1,
  c1:60, c2:60, pileD:50, pileNL:2, pileNB:2, pileSL:180, pileSB:180,
  PuTf:368, MxTfm:0, MyTfm:0,
  hc:100, cover:7.5, db:2.222, capSteelAreaTotal:80, capB:280, capL:280
});
near(nearCap.Vu2Tf, 368 * (Math.hypot(14.861, 14.861) + 25) / 50, 1e-6, 'punching demand interpolates piles within D/2 of the critical section');
assert.equal(nearCap.excludedCount, 0, 'piles just outside the critical section are not excluded');
// Piles 5.139 cm inside the critical section contribute (25 - 5.139) / 50 = 0.39722.
const insideCap = FoundationPile.calculateGroupAndCap({
  fc:280, fy:4200, phiShear:0.75, lambda:1,
  c1:60, c2:60, pileD:50, pileNL:2, pileNB:2, pileSL:140, pileSB:140,
  PuTf:368, MxTfm:0, MyTfm:0,
  hc:100, cover:7.5, db:2.222, capSteelAreaTotal:80, capB:240, capL:240
});
near(insideCap.Vu2Tf, 368 * (25 - 5.139) / 50, 1e-6, 'punching demand keeps partial share of piles just inside the critical section');
// Without cap plan dimensions the cap strength fails closed instead of using a 1 m strip.
const noGeom = FoundationPile.calculateGroupAndCap({
  fc:280, fy:4200, phiShear:0.75, lambda:1,
  c1:60, c2:60, pileD:50, pileNL:2, pileNB:2, pileSL:250, pileSB:250,
  PuTf:400, MxTfm:0, MyTfm:0, hc:100, cover:7.5, db:2.222, capSteelAreaTotal:80
});
assert.equal(noGeom.okCapFlex, false, 'missing cap width fails flexure closed');
assert.equal(noGeom.okCapShear, false, 'missing cap width fails shear closed');

assert.throws(() => FoundationPile.calculateGroupAndCap({}), /invalid-pile-group-cap-input/, 'invalid pile group input is rejected');
console.log('foundation pile and pile-cap core tests passed.');
