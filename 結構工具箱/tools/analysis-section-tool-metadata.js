(function (root, factory) {
  const metadata = factory();
  if (typeof module === 'object' && module.exports) module.exports = metadata;
  if (root) root.AnalysisSectionToolMetadata = metadata;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const define = (entry) => Object.freeze(entry);
  return Object.freeze({
    'continuous-beam': define({
      route: '/beam-analysis',
      discipline: 'analysis',
      version: 'V1.4',
      calculationEngine: 'continuous-beam.inline.v1.3.0',
      state: 'assist',
      governance: 'continuous-beam',
    }),
    'frame-analysis': define({
      route: '/frame-analysis',
      discipline: 'analysis',
      version: 'V1.6',
      calculationEngine: 'plane-frame.inline.v0.3.0',
      state: 'assist',
      governance: 'frame-analysis',
    }),
    section: define({
      route: '/section',
      discipline: 'section',
      version: 'V2.1',
      calculationEngine: 'section-properties.inline.v2.1.0',
      state: 'reference',
      governance: 'section-tools',
    }),
    'composite-section': define({
      route: '/composite-section',
      discipline: 'section',
      version: 'V1.2',
      calculationEngine: 'composite-section.inline.v1.2.0',
      state: 'reference',
      governance: 'section-tools',
    }),
  });
});
