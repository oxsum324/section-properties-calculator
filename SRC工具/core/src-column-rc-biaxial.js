/* SRC column RC biaxial strain-compatibility engine.
 *
 * Rectangular tied RC residual section only. Concrete compression uses an
 * exact rectangle/half-plane polygon clip; reinforcement remains discrete.
 * The design interaction contour at a requested Pu is solved continuously in
 * neutral-axis depth for each strain-plane angle, then intersected with the
 * demand ray. This module does not include the encased structural steel.
 *
 * Input bar coordinates are measured from the section's left/top faces.
 * Units: cm, cm2, kgf/cm2, tf, tf-m.
 */
(function initSrcColumnRcBiaxial(globalObject, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalObject) globalObject.SrcColumnRcBiaxial = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildSrcColumnRcBiaxial() {
  'use strict';

  const VERSION = 'src-column.rc-biaxial.v0.1.0-research';
  const EPS_CU = 0.003;
  const PHI_TIED = 0.65;
  const PHI_TENSION = 0.90;
  const PN_MAX_FACTOR = 0.80;
  const DEFAULT_ES_KGF_CM2 = 2_040_000;
  const AXIAL_TOLERANCE_TF = 1e-7;

  class SrcColumnBiaxialError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'SrcColumnBiaxialError';
      this.code = code;
    }
  }

  function finite(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new SrcColumnBiaxialError('invalid-number', `${label} 必須為有限數值。`);
    return number;
  }

  function positive(value, label) {
    const number = finite(value, label);
    if (!(number > 0)) throw new SrcColumnBiaxialError('positive-number-required', `${label} 必須大於 0。`);
    return number;
  }

  function beta1Of(fcKgfCm2) {
    const fc = positive(fcKgfCm2, 'fcKgfCm2');
    if (fc <= 280) return 0.85;
    if (fc >= 560) return 0.65;
    return 0.85 - 0.05 * (fc - 280) / 70;
  }

  function phiOf(epsT, fy, es) {
    const epsTy = fy / es;
    if (epsT <= epsTy) return PHI_TIED;
    if (epsT >= epsTy + 0.003) return PHI_TENSION;
    return PHI_TIED + (PHI_TENSION - PHI_TIED) * (epsT - epsTy) / 0.003;
  }

  function normalizeSection(section, materials) {
    const widthCm = positive(section?.widthCm, 'section.widthCm');
    const depthCm = positive(section?.depthCm, 'section.depthCm');
    const fcKgfCm2 = positive(materials?.fcKgfCm2, 'materials.fcKgfCm2');
    const fyKgfCm2 = positive(materials?.fyKgfCm2, 'materials.fyKgfCm2');
    const esKgfCm2 = materials?.esKgfCm2 == null
      ? DEFAULT_ES_KGF_CM2
      : positive(materials.esKgfCm2, 'materials.esKgfCm2');
    if (!Array.isArray(section?.bars) || section.bars.length < 4) {
      throw new SrcColumnBiaxialError('biaxial-bars-required', '雙軸 RC 互制至少需要 4 支具 x、y 座標的主筋。');
    }
    const bars = section.bars.map((bar, index) => {
      const xCm = finite(bar?.xCm, `section.bars[${index}].xCm`);
      const yCm = finite(bar?.yCm, `section.bars[${index}].yCm`);
      const areaCm2 = positive(bar?.areaCm2, `section.bars[${index}].areaCm2`);
      if (!(xCm > 0 && xCm < widthCm && yCm > 0 && yCm < depthCm)) {
        throw new SrcColumnBiaxialError('bar-outside-section', `section.bars[${index}] 必須位於斷面內。`);
      }
      return { x: xCm - widthCm / 2, y: depthCm / 2 - yCm, xCm, yCm, areaCm2 };
    });
    return {
      widthCm,
      depthCm,
      fcKgfCm2,
      fyKgfCm2,
      esKgfCm2,
      beta1: beta1Of(fcKgfCm2),
      bars,
    };
  }

  function clipPolygonToCompressionHalfPlane(polygon, nx, ny, edge) {
    const inside = point => point.x * nx + point.y * ny >= edge - 1e-12;
    const output = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const currentInside = inside(current);
      const nextInside = inside(next);
      if (currentInside) output.push(current);
      if (currentInside !== nextInside) {
        const currentZ = current.x * nx + current.y * ny;
        const nextZ = next.x * nx + next.y * ny;
        const t = (edge - currentZ) / (nextZ - currentZ);
        output.push({
          x: current.x + t * (next.x - current.x),
          y: current.y + t * (next.y - current.y),
        });
      }
    }
    return output;
  }

  function polygonAreaCentroid(polygon) {
    if (polygon.length < 3) return { areaCm2: 0, xCm: 0, yCm: 0 };
    let twiceArea = 0;
    let centroidXTerm = 0;
    let centroidYTerm = 0;
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const cross = current.x * next.y - next.x * current.y;
      twiceArea += cross;
      centroidXTerm += (current.x + next.x) * cross;
      centroidYTerm += (current.y + next.y) * cross;
    }
    if (Math.abs(twiceArea) < 1e-14) return { areaCm2: 0, xCm: 0, yCm: 0 };
    return {
      areaCm2: Math.abs(twiceArea) / 2,
      xCm: centroidXTerm / (3 * twiceArea),
      yCm: centroidYTerm / (3 * twiceArea),
    };
  }

  function nominalPointFromModel(cCm, thetaRad, model) {
    const c = positive(cCm, 'cCm');
    const theta = finite(thetaRad, 'thetaRad');
    const { widthCm: width, depthCm: depth, fcKgfCm2: fc, fyKgfCm2: fy, esKgfCm2: es, beta1, bars } = model;
    const nx = Math.sin(theta);
    const ny = Math.cos(theta);
    const zMax = Math.abs(nx) * width / 2 + Math.abs(ny) * depth / 2;
    const zMin = -zMax;
    const blockDepth = Math.min(beta1 * c, zMax - zMin);
    const blockEdge = zMax - blockDepth;
    const neutralEdge = zMax - c;
    const rectangle = [
      { x: -width / 2, y: -depth / 2 },
      { x: width / 2, y: -depth / 2 },
      { x: width / 2, y: depth / 2 },
      { x: -width / 2, y: depth / 2 },
    ];
    const compression = polygonAreaCentroid(clipPolygonToCompressionHalfPlane(rectangle, nx, ny, blockEdge));
    const concreteForceKgf = 0.85 * fc * compression.areaCm2;
    let nominalPKgf = concreteForceKgf;
    let nominalMxKgfCm = concreteForceKgf * compression.yCm;
    let nominalMyKgfCm = concreteForceKgf * compression.xCm;
    let zMinBar = Infinity;

    for (const bar of bars) {
      const z = bar.x * nx + bar.y * ny;
      zMinBar = Math.min(zMinBar, z);
      const strain = EPS_CU * (z - neutralEdge) / c;
      const stress = Math.max(-fy, Math.min(fy, es * strain));
      const inCompressionBlock = z >= blockEdge - 1e-12;
      const netStress = inCompressionBlock ? stress - 0.85 * fc : stress;
      const forceKgf = netStress * bar.areaCm2;
      nominalPKgf += forceKgf;
      nominalMxKgfCm += forceKgf * bar.y;
      nominalMyKgfCm += forceKgf * bar.x;
    }

    const epsT = EPS_CU * ((zMax - zMinBar) - c) / c;
    const phi = phiOf(epsT, fy, es);
    return {
      cCm: c,
      thetaRad: theta,
      blockDepthCm: blockDepth,
      blockAreaCm2: compression.areaCm2,
      epsT,
      epsTy: fy / es,
      phi,
      nominalPKgf,
      nominalMxKgfCm,
      nominalMyKgfCm,
    };
  }

  function axialLimits(model) {
    const grossAreaCm2 = model.widthCm * model.depthCm;
    const steelAreaCm2 = model.bars.reduce((sum, bar) => sum + bar.areaCm2, 0);
    const nominalPoTf = (0.85 * model.fcKgfCm2 * (grossAreaCm2 - steelAreaCm2)
      + model.fyKgfCm2 * steelAreaCm2) / 1000;
    return {
      nominalPoTf,
      phiPnMaxTf: PHI_TIED * PN_MAX_FACTOR * nominalPoTf,
      pureTensionTf: -PHI_TENSION * model.fyKgfCm2 * steelAreaCm2 / 1000,
    };
  }

  function designPointFromModel(cCm, thetaRad, model, limits) {
    const point = nominalPointFromModel(cCm, thetaRad, model);
    let designPTf = point.phi * point.nominalPKgf / 1000;
    if (point.nominalPKgf > 0) designPTf = Math.min(designPTf, limits.phiPnMaxTf);
    return {
      ...point,
      designPTf,
      designMxTfM: point.phi * point.nominalMxKgfCm / 100000,
      designMyTfM: point.phi * point.nominalMyKgfCm / 100000,
    };
  }

  function solveDirectionAtPu(model, limits, puTf, thetaRad) {
    const reference = Math.hypot(model.widthCm, model.depthCm);
    let low = Math.log(reference * 1e-8);
    let high = Math.log(reference * 1e6);
    let lowPoint = designPointFromModel(Math.exp(low), thetaRad, model, limits);
    let highPoint = designPointFromModel(Math.exp(high), thetaRad, model, limits);
    if (puTf < lowPoint.designPTf - AXIAL_TOLERANCE_TF || puTf > highPoint.designPTf + AXIAL_TOLERANCE_TF) {
      throw new SrcColumnBiaxialError('rc-root-not-bracketed', '指定軸力無法由雙軸 RC 應變相容解包夾。');
    }
    for (let iteration = 0; iteration < 140; iteration += 1) {
      const middle = (low + high) / 2;
      const middlePoint = designPointFromModel(Math.exp(middle), thetaRad, model, limits);
      if (middlePoint.designPTf < puTf) {
        low = middle;
        lowPoint = middlePoint;
      } else {
        high = middle;
        highPoint = middlePoint;
      }
    }
    return Math.abs(lowPoint.designPTf - puTf) <= Math.abs(highPoint.designPTf - puTf) ? lowPoint : highPoint;
  }

  function convexHull(points) {
    const unique = new Map();
    for (const point of points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const normalized = { x: Math.max(0, point.x), y: Math.max(0, point.y) };
      unique.set(`${normalized.x.toFixed(9)},${normalized.y.toFixed(9)}`, normalized);
    }
    const sorted = [...unique.values()].sort((left, right) => left.x === right.x ? left.y - right.y : left.x - right.x);
    if (sorted.length <= 1) return sorted;
    const cross = (origin, left, right) => (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
    const lower = [];
    for (const point of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
      lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const point = sorted[index];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
      upper.push(point);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function rayCapacity(hull, unitX, unitY) {
    const determinant = (ax, ay, bx, by) => ax * by - ay * bx;
    let capacity = 0;
    for (let index = 0; index < hull.length; index += 1) {
      const start = hull[index];
      const end = hull[(index + 1) % hull.length];
      const edgeX = end.x - start.x;
      const edgeY = end.y - start.y;
      const denominator = determinant(unitX, unitY, edgeX, edgeY);
      if (Math.abs(denominator) < 1e-12) continue;
      const rayDistance = determinant(start.x, start.y, edgeX, edgeY) / denominator;
      const edgeFraction = determinant(start.x, start.y, unitX, unitY) / denominator;
      if (rayDistance >= -1e-10 && edgeFraction >= -1e-10 && edgeFraction <= 1 + 1e-10) {
        capacity = Math.max(capacity, rayDistance);
      }
    }
    return capacity;
  }

  function checkDemand(section, materials, demand, options) {
    const model = normalizeSection(section, materials);
    const limits = axialLimits(model);
    const puTf = finite(demand?.puTf, 'demand.puTf');
    const muxTfM = Math.abs(finite(demand?.muxTfM || 0, 'demand.muxTfM'));
    const muyTfM = Math.abs(finite(demand?.muyTfM || 0, 'demand.muyTfM'));
    const axialOk = puTf >= limits.pureTensionTf - AXIAL_TOLERANCE_TF
      && puTf <= limits.phiPnMaxTf + AXIAL_TOLERANCE_TF;
    const momentDemandTfM = Math.hypot(muxTfM, muyTfM);
    const common = {
      method: 'exact-polygon-log-bisection',
      engineVersion: VERSION,
      demand: { puTf, muxTfM, muyTfM },
      ...limits,
      axialOk,
    };
    if (!axialOk) {
      return { ...common, ok: false, outOfRange: true, utilization: momentDemandTfM > 0 ? Infinity : 0, capacityTfM: 0, surface: [] };
    }
    if (momentDemandTfM <= 1e-12) {
      return { ...common, ok: true, outOfRange: false, utilization: 0, capacityTfM: Infinity, capacityMuxTfM: 0, capacityMuyTfM: 0, surface: [] };
    }

    const angleSteps = Math.max(24, Math.min(180, Math.round(Number(options?.angleSteps) || 72)));
    const points = [{ x: 0, y: 0 }];
    const solved = [];
    for (let index = 0; index < angleSteps; index += 1) {
      const thetaRad = 2 * Math.PI * index / angleSteps;
      const solution = solveDirectionAtPu(model, limits, puTf, thetaRad);
      const point = { x: Math.abs(solution.designMxTfM), y: Math.abs(solution.designMyTfM) };
      points.push(point);
      solved.push({ thetaRad, ...point, cCm: solution.cCm, phi: solution.phi, epsT: solution.epsT, designPTf: solution.designPTf });
    }
    const hull = convexHull(points);
    const unitX = muxTfM / momentDemandTfM;
    const unitY = muyTfM / momentDemandTfM;
    const capacityTfM = rayCapacity(hull, unitX, unitY);
    const utilization = capacityTfM > 0 ? momentDemandTfM / capacityTfM : Infinity;
    return {
      ...common,
      ok: utilization <= 1 + 1e-9,
      outOfRange: false,
      utilization,
      capacityTfM,
      capacityMuxTfM: capacityTfM * unitX,
      capacityMuyTfM: capacityTfM * unitY,
      angleSteps,
      pointCount: solved.length,
      hullCount: hull.length,
      surface: solved,
      hull,
    };
  }

  return Object.freeze({
    VERSION,
    SrcColumnBiaxialError,
    beta1Of,
    phiOf,
    nominalPoint: (cCm, thetaRad, section, materials) => nominalPointFromModel(cCm, thetaRad, normalizeSection(section, materials)),
    checkDemand,
  });
});
