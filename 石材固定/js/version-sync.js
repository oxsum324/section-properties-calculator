(function(global){
  'use strict';

  const metadata = Object.freeze({
    id: 'stone-fixing',
    name: '石材外牆固定構件計算書產生器',
    version: 'V3.0.8',
    state: 'formal',
    governance: 'stone-v2',
  });

  function syncToolHeaderVersion(appVersion = metadata.version){
    const el = global.document && global.document.getElementById('tool-version-label');
    if(el){
      el.textContent = `${appVersion} 任務導向介面 ‧ 弘一工程顧問有限公司`;
    }
  }

  global.StonePublicMetadata = metadata;
  global.StoneVersionSync = {
    syncToolHeaderVersion,
  };
})(window);
