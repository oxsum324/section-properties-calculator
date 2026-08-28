(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LocalQuickToolMetadata = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const entries = {
    'foundation-local': { route: '/foundation-local', discipline: 'foundation', version: 'V0.6', state: 'formal', governance: 'local-quick-contract' },
    'equipment-load': { route: '/equipment-load', discipline: 'equipment', version: 'V0.3', state: 'formal', governance: 'local-quick-contract' },
    'earth-pressure': { route: '/earth-pressure', discipline: 'geotechnical', version: 'V0.6', state: 'formal', governance: 'local-quick-contract' },
    'floor-slab-westergaard': { route: '/floor-slab-westergaard', discipline: 'floor-slab', version: 'V0.1', state: 'formal', governance: 'local-quick-contract' },
  };

  Object.values(entries).forEach(Object.freeze);
  return Object.freeze(entries);
});
