(function (root, factory) {
  const core = typeof module === 'object' && module.exports
    ? require('./cable-tension-frequency-core.js') : root.CableTensionFrequencyCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CableTensionFrequencySensitivity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';

  // Fixed demonstrative perturbations; these are not measured error bounds.
  function calculate(input) {
    const baseline = core.calculate(input);
    const rows = ['effectiveLengthM', 'massPerLengthKgM', 'frequencyHz'].map(parameter => {
      const scenarios = [-1, 1].map(changePct => {
        const scenario = { ...baseline.input,
          measurements: baseline.input.measurements.map(row => ({ ...row })) };
        const factor = 1 + changePct / 100;
        if (parameter === 'frequencyHz') {
          scenario.measurements.forEach(row => { row.frequencyHz *= factor; });
        } else scenario[parameter] *= factor;
        const tensionKn = core.calculate(scenario).fit.tensionKn;
        const tensionChangePct = (tensionKn / baseline.fit.tensionKn - 1) * 100;
        if (!Number.isFinite(tensionChangePct)) throw new RangeError('敏感度比較超出有限數值範圍。');
        return { changePct, tensionKn, tensionChangePct };
      });
      return { parameter, scenarios };
    });
    return { kind: 'cable-tension-fixed-sensitivity.v1', baselineTensionKn: baseline.fit.tensionKn, rows };
  }

  return Object.freeze({ calculate });
});
