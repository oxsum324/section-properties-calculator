const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scriptPath = path.join(__dirname, 'version-sync.js');
const source = fs.readFileSync(scriptPath, 'utf8');

const label = { textContent: '' };
const context = {
  window: {
    document: {
      getElementById(id){
        return id === 'tool-version-label' ? label : null;
      },
    },
  },
};

vm.runInNewContext(source, context, { filename: scriptPath });

if(!context.window.StoneVersionSync || typeof context.window.StoneVersionSync.syncToolHeaderVersion !== 'function'){
  throw new Error('StoneVersionSync.syncToolHeaderVersion was not exported');
}

if(context.window.StonePublicMetadata?.version !== 'V3.0.7'){
  throw new Error(`Unexpected canonical stone version: ${context.window.StonePublicMetadata?.version}`);
}

context.window.StoneVersionSync.syncToolHeaderVersion('V9.9.9');

if(!label.textContent.includes('V9.9.9 任務導向介面')){
  throw new Error(`Unexpected version label: ${label.textContent}`);
}

if(label.textContent.includes('目前使用版本：V2')){
  throw new Error(`Stale duplicate version remains: ${label.textContent}`);
}

console.log('StoneVersionSync smoke test passed.');
