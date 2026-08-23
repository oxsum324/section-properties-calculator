'use strict';

const assert = require('node:assert/strict');
const Biaxial = require('./core/src-column-rc-biaxial.js');

function close(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: actual must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`);
}

function section65x80() {
  const areaCm2 = 5.07;
  return {
    widthCm: 65,
    depthCm: 80,
    bars: [
      { xCm: 7, yCm: 7, areaCm2 }, { xCm: 17, yCm: 7, areaCm2 },
      { xCm: 48, yCm: 7, areaCm2 }, { xCm: 58, yCm: 7, areaCm2 },
      { xCm: 7, yCm: 17, areaCm2 }, { xCm: 58, yCm: 17, areaCm2 },
      { xCm: 7, yCm: 63, areaCm2 }, { xCm: 58, yCm: 63, areaCm2 },
      { xCm: 7, yCm: 73, areaCm2 }, { xCm: 17, yCm: 73, areaCm2 },
      { xCm: 48, yCm: 73, areaCm2 }, { xCm: 58, yCm: 73, areaCm2 },
    ],
  };
}

const materials = { fcKgfCm2: 280, fyKgfCm2: 4200, esKgfCm2: 2_040_000 };

assert.equal(Biaxial.VERSION, 'src-column.rc-biaxial.v1.0.0', 'formal biaxial RC engine is explicitly versioned');
assert.equal(Biaxial.beta1Of(280), 0.85, 'beta1 lower-strength branch is explicit');
assert.equal(Biaxial.beta1Of(560), 0.65, 'beta1 high-strength floor is explicit');
const epsTy = materials.fyKgfCm2 / materials.esKgfCm2;
assert.equal(Biaxial.phiOf(epsTy, materials.fyKgfCm2, materials.esKgfCm2), 0.65, 'phi transition begins at fy/Es');
close(Biaxial.phiOf(epsTy + 0.0015, materials.fyKgfCm2, materials.esKgfCm2), 0.775, 1e-12, 'phi transition midpoint');

const nominal = Biaxial.nominalPoint(20, 0, section65x80(), materials);
close(nominal.blockDepthCm, 17, 1e-12, 'theta=0 Whitney block depth');
close(nominal.blockAreaCm2, 65 * 17, 1e-9, 'theta=0 exact rectangular compression area');
close(nominal.nominalMyKgfCm, 0, 1e-7, 'doubly symmetric layout has no weak-axis moment at theta=0');

const uniaxial = Biaxial.checkDemand(section65x80(), materials, { puTf: 416.4, muxTfM: 64.2, muyTfM: 0 });
assert.equal(uniaxial.method, 'exact-polygon-log-bisection', 'engine reports its exact concrete integration method');
assert.equal(uniaxial.axialOk, true, 'guide residual axial demand lies in the RC range');
close(uniaxial.capacityMuxTfM, 121.4, 0.15, 'biaxial engine degenerates to the verified x-axis capacity');
close(uniaxial.capacityMuyTfM, 0, 1e-12, 'x-axis demand ray has zero y component');

const combined = Biaxial.checkDemand(section65x80(), materials, { puTf: 416.4, muxTfM: 64.2, muyTfM: 20 });
assert.equal(combined.angleSteps, 72, 'default contour resolution is governed');
assert.equal(combined.pointCount, 72, 'every governed angle produces a reviewable point');
assert.ok(combined.hullCount >= 3, 'constant-Pu interaction contour forms a hull');
assert.ok(combined.capacityMuxTfM > 0 && combined.capacityMuyTfM > 0, 'demand ray returns both capacity components');

const swappedSection = {
  widthCm: 80,
  depthCm: 65,
  bars: section65x80().bars.map(bar => ({ xCm: bar.yCm, yCm: bar.xCm, areaCm2: bar.areaCm2 })),
};
const swapped = Biaxial.checkDemand(swappedSection, materials, { puTf: 416.4, muxTfM: 20, muyTfM: 64.2 });
close(swapped.utilization, combined.utilization, 1e-9, 'swapping section axes and moments preserves utilization');
close(swapped.capacityMuxTfM, combined.capacityMuyTfM, 1e-8, 'axis swap preserves the x/y capacity mapping');
close(swapped.capacityMuyTfM, combined.capacityMuxTfM, 1e-8, 'axis swap preserves the y/x capacity mapping');

const highMoment = Biaxial.checkDemand(section65x80(), materials, { puTf: 416.4, muxTfM: 500, muyTfM: 500 });
assert.equal(highMoment.ok, false, 'large biaxial demand fails the interaction contour');
const highAxial = Biaxial.checkDemand(section65x80(), materials, { puTf: 1000, muxTfM: 1, muyTfM: 1 });
assert.equal(highAxial.axialOk, false, 'demand above tied-column axial cap is rejected');
assert.equal(highAxial.outOfRange, true, 'axial rejection is explicit');

const outside = section65x80();
outside.bars[0].xCm = 0;
assert.throws(
  () => Biaxial.checkDemand(outside, materials, { puTf: 100, muxTfM: 10, muyTfM: 10 }),
  error => error instanceof Biaxial.SrcColumnBiaxialError && error.code === 'bar-outside-section',
  'bar coordinate outside the section fails closed'
);

console.log('SRC column RC biaxial engine OK (exact polygon, axis-swap, cap and fail-closed checks)');
