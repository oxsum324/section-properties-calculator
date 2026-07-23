/* RC 矩形柱橫向筋候選（DOM-free）。
 * 篩選：兩向剪力、Av,min、斷面上限、側撐、一般/耐震間距與耐震圍束量。
 */
(function (root) {
  'use strict';
  const DEFAULT_BARS = ['#3', '#4', '#5'];
  const DEFAULT_SPACINGS = [15, 12.5, 10, 7.5, 5, 2.5];
  const finite = value => Number.isFinite(Number(value));

  function confinementDemand({ Ag, Ach, fc, fyt, PuKgf, nl }) {
    if (!(Ach > 0 && fyt > 0 && Ag > Ach)) return { req:NaN, highTrigger:false };
    const kf = Math.max(1, fc / 1750 + 0.6);
    const kn = nl > 2 ? nl / (nl - 2) : 1;
    const highTrigger = PuKgf > 0.3 * Ag * fc || fc > 700;
    const a = 0.3 * (Ag / Ach - 1) * fc / fyt;
    const b = 0.09 * fc / fyt;
    const c = 0.2 * PuKgf * kf * kn / (fyt * Ach);
    return { req:highTrigger ? Math.max(a, b, c) : Math.max(a, b), highTrigger, parts:{ a, b, c }, kf, kn };
  }

  function lateralSupport(face, nSide, cover, tieDb, dbEq, seismic, hxLimit, requireEveryBarSupport) {
    if (nSide <= 2) return { ok:true, legsMin:2, crossTies:0, pitch:0, hx:0, unsupClear:0 };
    const pitch = (face - 2 * cover - 2 * tieDb - dbEq) / (nSide - 1);
    if (!(pitch > 0)) return { ok:false, legsMin:Infinity, crossTies:Infinity, pitch, hx:Infinity, unsupClear:Infinity };
    const nMid = nSide - 2;
    const crossTies = requireEveryBarSupport ? nMid : Math.ceil(nMid / 2);
    const unsupClear = requireEveryBarSupport ? 0 : (nMid <= 1 ? 0 : Math.max(0, pitch - dbEq));
    const hx = requireEveryBarSupport ? pitch : (nMid <= 1 ? pitch : 2 * pitch);
    const okClear = requireEveryBarSupport || unsupClear <= 15 + 1e-6;
    const okHx = !seismic || hx <= hxLimit + 1e-6;
    return { ok:okClear && okHx, legsMin:2 + crossTies, crossTies, pitch, hx, unsupClear, okClear, okHx };
  }

  function seismicSpacingLimit({ b, h, fy, mainDb, hx }) {
    const factor = fy <= 4200 ? 6 : (fy <= 5000 ? 5.5 : 5);
    const soRaw = hx > 0 ? 10 + (35 - hx) / 3 : 15;
    const so = Math.max(10, Math.min(15, soRaw));
    return { limit:Math.min(Math.min(b, h) / 4, factor * mainDb, so), factor, so, soRaw };
  }

  function evaluate(options) {
    const o = options || {};
    const required = ['b','h','cover','fc','fy','Pu','mainDb','bundle','nSide','dX','dY','designVx','designVy','tieDb','tieAb','tieFy','crossTieAb','crossTieFy','spacing'];
    if (!required.every(key => finite(o[key])) || !(o.b > 0 && o.h > 0 && o.fc > 0 && o.mainDb > 0 && o.tieDb > 0 && o.tieAb > 0 && o.spacing > 0)) {
      return { status:'invalid-input', ok:false, reason:'柱橫向筋 evaluator 輸入不完整' };
    }
    const Ag = finite(o.Ag) ? Number(o.Ag) : o.b * o.h;
    const phiShear = finite(o.phiShear) ? Number(o.phiShear) : 0.75;
    const lambda = finite(o.lambda) ? Number(o.lambda) : 1;
    const sqrtFc = Math.sqrt(o.fc);
    const Nu = o.Pu * 1000;
    const dbEq = Math.sqrt(Math.max(1, o.bundle)) * o.mainDb;
    const highHxTrigger = !!o.seismic && (Nu > 0.3 * Ag * o.fc || o.fc > 700);
    const hxLimit = highHxTrigger ? 20 : 35;
    const sideB = lateralSupport(o.b, o.nSide, o.cover, o.tieDb, dbEq, !!o.seismic, hxLimit, highHxTrigger);
    const sideH = lateralSupport(o.h, o.nSide, o.cover, o.tieDb, dbEq, !!o.seismic, hxLimit, highHxTrigger);
    const nctX = sideB.crossTies;
    const nctY = sideH.crossTies;
    const hx = Math.max(sideB.hx || 0, sideH.hx || 0);
    const spacingData = o.seismic
      ? seismicSpacingLimit({ b:o.b, h:o.h, fy:o.fy, mainDb:o.mainDb, hx })
      : { limit:Math.min(16 * o.mainDb, 48 * o.tieDb, Math.min(o.b, o.h)), factor:null, so:null };
    const spacingOk = o.spacing <= spacingData.limit + 1e-6;

    const vcBaseStress = 0.53 * lambda * sqrtFc;
    const vcNuRaw = Ag > 0 ? Nu / (6 * Ag) : 0;
    const vcNu = vcNuRaw > 0 ? Math.min(vcNuRaw, 0.05 * o.fc) : vcNuRaw;
    const vcStress = Math.max(0, vcBaseStress + vcNu);
    const VcX = Math.min(vcStress * o.b * o.dX, 1.33 * lambda * sqrtFc * o.b * o.dX);
    const VcY = Math.min(vcStress * o.h * o.dY, 1.33 * lambda * sqrtFc * o.h * o.dY);
    const phiVcX = o.forceVc0X ? 0 : phiShear * VcX;
    const phiVcY = o.forceVc0Y ? 0 : phiShear * VcY;
    const providedX = (2 * o.tieAb * o.tieFy + nctX * o.crossTieAb * o.crossTieFy) / o.spacing;
    const providedY = (2 * o.tieAb * o.tieFy + nctY * o.crossTieAb * o.crossTieFy) / o.spacing;
    const VsX = providedX * o.dX;
    const VsY = providedY * o.dY;
    const phiVnX = phiVcX + phiShear * VsX;
    const phiVnY = phiVcY + phiShear * VsY;
    const shearStrengthOk = phiVnX + 1e-6 >= o.designVx * 1000 && phiVnY + 1e-6 >= o.designVy * 1000;

    const sectionLimitX = phiShear * (VcX + 2.12 * lambda * sqrtFc * o.b * o.dX);
    const sectionLimitY = phiShear * (VcY + 2.12 * lambda * sqrtFc * o.h * o.dY);
    const shearSizeOk = sectionLimitX + 1e-6 >= o.designVx * 1000 && sectionLimitY + 1e-6 >= o.designVy * 1000;
    const triggerX = phiShear * 0.265 * lambda * sqrtFc * o.b * o.dX;
    const triggerY = phiShear * 0.265 * lambda * sqrtFc * o.h * o.dY;
    const avMinRequiredX = o.designVx * 1000 > triggerX + 1e-6;
    const avMinRequiredY = o.designVy * 1000 > triggerY + 1e-6;
    const avMinDemandX = Math.max(0.2 * lambda * sqrtFc * o.b, 3.5 * o.b);
    const avMinDemandY = Math.max(0.2 * lambda * sqrtFc * o.h, 3.5 * o.h);
    const avMinOkX = !avMinRequiredX || providedX + 1e-6 >= avMinDemandX;
    const avMinOkY = !avMinRequiredY || providedY + 1e-6 >= avMinDemandY;
    const avMinOk = avMinOkX && avMinOkY;

    const coreB = Math.max(0, o.b - 2 * o.cover);
    const coreH = Math.max(0, o.h - 2 * o.cover);
    const positionCount = Math.max(4, 4 * o.nSide - 4);
    const conf = confinementDemand({ Ag, Ach:coreB * coreH, fc:o.fc, fyt:Math.min(o.tieFy, o.crossTieFy), PuKgf:Nu, nl:positionCount });
    const ashRatioX = coreH > 0 ? ((2 * o.tieAb + nctX * o.crossTieAb) / o.spacing) / coreH : NaN;
    const ashRatioY = coreB > 0 ? ((2 * o.tieAb + nctY * o.crossTieAb) / o.spacing) / coreB : NaN;
    const fytLimitOk = Math.max(o.tieFy, o.crossTieFy) <= 7000;
    const confinementOk = !o.seismic || (ashRatioX + 1e-9 >= conf.req && ashRatioY + 1e-9 >= conf.req && fytLimitOk);
    const lateralSupportOk = sideB.ok && sideH.ok;

    const ratios = [
      o.designVx > 0 ? o.designVx * 1000 / phiVnX : 0,
      o.designVy > 0 ? o.designVy * 1000 / phiVnY : 0,
      avMinRequiredX ? avMinDemandX / providedX : 0,
      avMinRequiredY ? avMinDemandY / providedY : 0,
      o.spacing / spacingData.limit,
      o.seismic ? conf.req / Math.min(ashRatioX, ashRatioY) : 0,
      o.designVx > 0 ? o.designVx * 1000 / sectionLimitX : 0,
      o.designVy > 0 ? o.designVy * 1000 / sectionLimitY : 0,
    ].filter(Number.isFinite);
    const utilization = ratios.length ? Math.max(...ratios) : Infinity;
    const ok = lateralSupportOk && spacingOk && shearStrengthOk && shearSizeOk && avMinOk && confinementOk && utilization <= 1 + 1e-9;
    return {
      status:'evaluated', ok, utilization,
      nCrossTieX:nctX, nCrossTieY:nctY, legsX:2 + nctX, legsY:2 + nctY,
      hx, hxLimit, highHxTrigger, lateralSupportOk, sideB, sideH,
      spacing:o.spacing, spacingLimit:spacingData.limit, spacingOk, spacingData,
      phiVnX, phiVnY, shearStrengthOk, sectionLimitX, sectionLimitY, shearSizeOk,
      avMinRequiredX, avMinRequiredY, avMinDemandX, avMinDemandY,
      avMinProvidedX:providedX, avMinProvidedY:providedY, avMinOkX, avMinOkY, avMinOk,
      ashRatioX, ashRatioY, ashRatioReq:conf.req, confinementOk, confinementDemand:conf, fytLimitOk,
      transverseSteel:(2 * o.tieAb + (nctX + nctY) * o.crossTieAb) / o.spacing,
      reason:ok ? '' : '橫向筋方案未同時通過剪力、Av,min、斷面上限、側撐、間距或圍束量',
    };
  }

  function search(options) {
    const table = options?.barTable || root.Rebar?.REBAR_TABLE || root.REBAR_TABLE || {};
    const bars = [...new Set(options?.bars || DEFAULT_BARS)].filter(no => table[no]);
    const spacings = [...new Set(options?.spacings || DEFAULT_SPACINGS)].map(Number).filter(value => value > 0).sort((a, b) => b - a);
    const candidates = [];
    let evaluatedCount = 0;
    for (const tieNo of bars) {
      for (const spacing of spacings) {
        evaluatedCount += 1;
        const bar = table[tieNo];
        const result = evaluate({
          ...options,
          tieDb:bar.db, tieAb:bar.area, crossTieAb:bar.area,
          spacing,
        });
        if (!result.ok) continue;
        candidates.push({ tieNo, crossTieNo:tieNo, ...result });
      }
    }
    candidates.sort((a, b) => a.transverseSteel - b.transverseSteel || a.nCrossTieX + a.nCrossTieY - b.nCrossTieX - b.nCrossTieY || b.spacing - a.spacing || b.utilization - a.utilization);
    const limit = Math.max(1, Number(options?.limit) || 3);
    return {
      status:candidates.length ? 'evaluated' : 'no-solution',
      reason:candidates.length ? '' : '目前搜尋範圍內沒有同時通過剪力、Av,min、斷面上限、側撐、間距與耐震圍束量的橫向筋方案',
      candidates:candidates.slice(0, limit),
      evaluatedCount,
    };
  }

  root.ColumnTransverseDesigner = { evaluate, search, confinementDemand, lateralSupport, seismicSpacingLimit };
})(typeof window !== 'undefined' ? window : globalThis);
