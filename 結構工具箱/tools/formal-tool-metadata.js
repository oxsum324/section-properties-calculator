(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FormalToolMetadata = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const entries = {
    'wind-overview': { route: '/wind-overview', discipline: 'wind', version: 'V1', state: 'workflow' },
    'wind-kzt': { route: '/wind-kzt', discipline: 'wind', version: 'V1', state: 'reference' },
    'wind-special': { route: '/wind-special', discipline: 'wind', version: 'V3', state: 'reference' },
    'wind-force': { route: '/wind-force', discipline: 'wind', version: 'V3', state: 'formal', governance: 'formal-tools' },
    'wind-cc': { route: '/wind-cc', discipline: 'wind', version: 'V3', state: 'formal', governance: 'formal-tools' },
    'wind-parapet': { route: '/wind-parapet', discipline: 'wind', version: 'V3', state: 'formal', governance: 'formal-tools' },
    'wind-open-roof': { route: '/wind-open-roof', discipline: 'wind', version: 'V3', state: 'formal', governance: 'formal-tools' },
    'wind-object-solid': { route: '/wind-object-solid', discipline: 'wind', version: 'V4.0', state: 'formal', governance: 'formal-tools' },
    'wind-object-frame': { route: '/wind-object-frame', discipline: 'wind', version: 'V3.3', state: 'formal', governance: 'formal-tools' },
    'wind-lattice-tower': { route: '/wind-lattice-tower', discipline: 'wind', version: 'V1.1', state: 'formal', governance: 'formal-tools' },
    'wind-object-tower': { route: '/wind-object-tower', discipline: 'wind', version: 'V3.2', state: 'formal', governance: 'formal-tools' },
    'wind-fence-sign': { route: '/wind-fence-sign', discipline: 'wind', version: 'V2.1', state: 'formal', governance: 'formal-tools' },
    'wind-sign-pole': { route: '/wind-sign-pole', discipline: 'wind', version: 'V1.0', state: 'formal', governance: 'formal-tools' },
    'seismic-force': { route: '/seismic-force', discipline: 'seismic', version: 'V3', state: 'formal', governance: 'formal-tools' },
    'seismic-dynamic': { route: '/seismic-dynamic', discipline: 'seismic', version: 'V3.8', state: 'report', governance: 'formal-tools' },
    'seismic-appendage': { route: '/seismic-appendage', discipline: 'seismic', version: 'V2.5', state: 'formal', governance: 'formal-tools' },
    'seismic-misc': { route: '/seismic-misc', discipline: 'seismic', version: 'V3.4', state: 'formal', governance: 'formal-tools' },
  };

  Object.values(entries).forEach(Object.freeze);
  return Object.freeze(entries);
});
