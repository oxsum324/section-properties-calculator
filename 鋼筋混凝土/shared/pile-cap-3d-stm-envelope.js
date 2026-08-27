/* Multi-load-case envelope for the RC pile-cap 3D STM tool. */
(function (root, factory) {
  const api = factory(
    root.PileCap3DSTMBridge || (typeof require === 'function' ? require('./pile-cap-3d-stm-bridge.js') : null),
    root.PileCap3DSTM || (typeof require === 'function' ? require('./pile-cap-3d-stm.js') : null),
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PileCap3DSTMEnvelope = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Bridge, STM) {
  'use strict';

  function requireDependencies() {
    if (!Bridge || typeof Bridge.validatePayload !== 'function') throw new Error('缺少樁帽三維 STM 橋接核心。');
    if (!STM || typeof STM.assess !== 'function') throw new Error('缺少樁帽三維 STM 計算核心。');
  }

  function finite(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${label} 不是有限數值。`);
    return number;
  }

  function evaluate(rawPayload, baseInput) {
    requireDependencies();
    if (!baseInput || typeof baseInput !== 'object' || Array.isArray(baseInput)) throw new Error('包絡共同輸入必須是物件。');
    const payload = Bridge.validatePayload(rawPayload);
    const cases = payload.model.loadCases.map((loadCase, index) => {
      const fields = Bridge.toToolFields(payload, loadCase.id);
      const input = {
        ...baseInput,
        Pu:fields.Pu,
        Mx:fields.Mx,
        My:fields.My,
        pileReactions:fields.pileReactions,
      };
      const result = STM.assess(input);
      if (!result.valid) throw new Error(`${loadCase.combination} 無法建立包絡：${result.errors.join('；')}`);
      return {
        id:loadCase.id,
        combination:loadCase.combination,
        loads:{ ...loadCase.loads },
        result,
      };
    });

    const definitions = [
      { key:'xTie', label:'X 向拉桿', unit:'DCR', mode:'max', value:r => r.xTieDcr, ok:r => r.checks.xTieOk && r.checks.tieLayoutOk },
      { key:'yTie', label:'Y 向拉桿', unit:'DCR', mode:'max', value:r => r.yTieDcr, ok:r => r.checks.yTieOk && r.checks.tieLayoutOk },
      { key:'strut', label:'三維壓桿', unit:'DCR', mode:'max', value:r => r.maxStrutDcr, ok:r => r.checks.strutOk },
      { key:'topNode', label:'柱下 CCC 節點', unit:'DCR', mode:'max', value:r => r.topNodeDcr, ok:r => r.checks.topNodeOk },
      { key:'bottomNode', label:'樁頂 CCT 節點', unit:'DCR', mode:'max', value:r => Math.max(...r.bottomNodeResults.map(item => item.dcr)), ok:r => r.checks.bottomNodeOk },
      { key:'angle', label:'最小三維壓桿角', unit:'deg', mode:'min', value:r => r.minThetaDeg, utilization:r => 25 / r.minThetaDeg, ok:r => r.checks.angleOk },
      { key:'shearX', label:'23.4.4 X 向剪力', unit:'DCR', mode:'max', optional:true, include:r => r.check2344Required, value:r => r.shearX.demand / r.shearDesignLimitX, ok:r => r.checks.shearLimitXOk },
      { key:'shearY', label:'23.4.4 Y 向剪力', unit:'DCR', mode:'max', optional:true, include:r => r.check2344Required, value:r => r.shearY.demand / r.shearDesignLimitY, ok:r => r.checks.shearLimitYOk },
      { key:'pileReaction', label:'最大單樁壓反力', unit:'tf', mode:'max', demandOnly:true, value:r => Math.max(...r.nodes.map(node => node.reaction)), ok:() => true },
    ];

    const entries = definitions.flatMap(definition => {
      const candidates = cases.filter(item => !definition.include || definition.include(item.result)).map(item => {
        const value = finite(definition.value(item.result), `${item.combination} ${definition.label}`);
        const utilization = definition.demandOnly ? null : finite(
          definition.utilization ? definition.utilization(item.result) : value,
          `${item.combination} ${definition.label} 利用率`,
        );
        return { item, value, utilization };
      });
      if (!candidates.length && definition.optional) return [];
      if (!candidates.length) throw new Error(`${definition.label} 沒有可用的包絡結果。`);
      const selected = candidates.reduce((control, candidate) => {
        if (!control) return candidate;
        return definition.mode === 'min'
          ? (candidate.value < control.value ? candidate : control)
          : (candidate.value > control.value ? candidate : control);
      }, null);
      return [{
        key:definition.key,
        label:definition.label,
        unit:definition.unit,
        mode:definition.mode,
        value:selected.value,
        utilization:selected.utilization,
        demandOnly:definition.demandOnly === true,
        ok:definition.ok(selected.item.result) === true,
        caseId:selected.item.id,
        combination:selected.item.combination,
      }];
    });

    const strengthEntries = entries.filter(item => item.utilization != null);
    const overallControl = strengthEntries.reduce((control, entry) => (
      !control || entry.utilization > control.utilization ? entry : control
    ), null);
    const allStrengthPass = cases.every(item => item.result.strengthPass);
    return {
      schema:payload.schema,
      calculationFingerprint:payload.source.calculationFingerprint,
      caseCount:cases.length,
      cases,
      entries,
      overallControl,
      allStrengthPass,
    };
  }

  return { evaluate };
});
