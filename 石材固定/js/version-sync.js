(function(global){
  'use strict';

  function syncToolHeaderVersion(appVersion){
    const el = global.document && global.document.getElementById('tool-version-label');
    if(el){
      el.textContent = `${appVersion} 任務導向介面 ‧ 弘一工程顧問有限公司 ‧ 目前使用版本：V2`;
    }
  }

  global.StoneVersionSync = {
    syncToolHeaderVersion,
  };
})(window);
