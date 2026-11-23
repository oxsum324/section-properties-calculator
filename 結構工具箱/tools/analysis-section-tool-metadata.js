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
      version: 'V1.9.0',
      calculationEngine: 'continuous-beam.inline.v1.6.0',
      state: 'assist',
      governance: 'continuous-beam',
    }),
    'frame-analysis': define({
      route: '/frame-analysis',
      discipline: 'analysis',
      version: 'V2.0',
      calculationEngine: 'plane-frame.inline.v1.0.0',
      state: 'formal',
      governance: 'frame-analysis',
    }),
    section: define({
      route: '/section',
      discipline: 'section',
      version: 'V2.2',
      calculationEngine: 'section-properties.inline.v2.3.0',
      state: 'reference',
      governance: 'section-tools',
    }),
    'composite-section': define({
      route: '/composite-section',
      discipline: 'section',
      version: 'V1.3',
      calculationEngine: 'composite-section.inline.v1.3.0',
      state: 'reference',
      governance: 'section-tools',
    }),
  });
});
