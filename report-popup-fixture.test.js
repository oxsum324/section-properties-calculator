'use strict';

function installReportPopupFixture() {
  const win = window;
  const fixtureKey = '__t23ReportPopupFixture';
  const previousFixture = Object.getOwnPropertyDescriptor(win, fixtureKey);
  const originalOpen = win.open;
  const originalCreateObjectURL = win.URL.createObjectURL;
  const originalRevokeObjectURL = win.URL.revokeObjectURL;
  const blobRecords = [];
  const blobsByUrl = new Map();
  const opened = [];
  const windows = [];
  const popupRecords = [];
  const revokedUrls = [];
  let nextBlobId = 1;
  let focusCalls = 0;
  let printCalls = 0;
  let restored = false;

  function createPopup() {
    let resolveLoad;
    let rejectLoad;
    let settled = false;
    const loadPromise = new Promise((resolve, reject) => {
      resolveLoad = resolve;
      rejectLoad = reject;
    });
    loadPromise.catch(() => {});
    const loadListeners = [];
    const state = {
      locationHref: 'about:blank',
      navigatedToBlob: false,
      loadEventFired: false,
      html: '',
      document: null,
    };
    const popup = {
      closed: false,
      document: null,
      location: {
        get href() {
          return state.locationHref;
        },
        replace(url) {
          const destination = String(url || '');
          state.locationHref = destination;
          state.navigatedToBlob = destination.startsWith('blob:');
          const blobRecord = blobsByUrl.get(destination);
          if (!blobRecord) {
            const error = new Error('Popup fixture received an unknown Blob URL: ' + destination);
            if (!settled) {
              settled = true;
              rejectLoad(error);
            }
            throw error;
          }
          blobRecord.navigationCount += 1;
          Promise.resolve()
            .then(() => blobRecord.blob.text())
            .then(html => {
              state.html = String(html);
              state.document = new win.DOMParser().parseFromString(state.html, 'text/html');
              popup.document = state.document;
              blobRecord.html = state.html;
              return new Promise(resolve => win.setTimeout(resolve, 0));
            })
            .then(() => {
              const event = new win.Event('load');
              state.loadEventFired = true;
              loadListeners.forEach(listener => listener.call(popup, event));
              if (!settled) {
                settled = true;
                resolveLoad({ url: destination, html: state.html, document: state.document });
              }
            })
            .catch(error => {
              if (!settled) {
                settled = true;
                rejectLoad(error);
              }
            });
        },
      },
      addEventListener(type, listener) {
        if (type === 'load' && typeof listener === 'function') loadListeners.push(listener);
      },
      focus() {
        focusCalls += 1;
      },
      print() {
        if (!state.loadEventFired) throw new Error('Report popup attempted to print before the document load event');
        printCalls += 1;
      },
      close() {
        this.closed = true;
      },
    };
    const popupRecord = { window: popup, state, loadPromise };
    windows.push(popup);
    popupRecords.push(popupRecord);
    return popupRecord;
  }

  win.URL.createObjectURL = function (blob) {
    const url = 'blob:t23-report-fixture-' + nextBlobId++;
    const record = {
      url,
      blob,
      blobType: String(blob && blob.type || ''),
      html: '',
      navigationCount: 0,
    };
    blobRecords.push(record);
    blobsByUrl.set(url, record);
    return url;
  };
  win.URL.revokeObjectURL = function (url) {
    revokedUrls.push(String(url || ''));
  };
  win.open = function (url, target) {
    opened.push({ url: String(url || ''), target: String(target || '') });
    return createPopup().window;
  };

  const fixture = {
    opened,
    windows,
    blobRecords,
    revokedUrls,
    waitForLoads() {
      return new Promise((resolve, reject) => {
        const timeout = win.setTimeout(() => reject(new Error('Report popup fixture timed out waiting for a Blob document load')), 5000);
        Promise.all(popupRecords.map(record => record.loadPromise)).then(() => {
          win.clearTimeout(timeout);
          resolve();
        }, error => {
          win.clearTimeout(timeout);
          reject(error);
        });
      });
    },
    restore() {
      if (restored) return;
      restored = true;
      windows.forEach(popup => { popup.closed = true; });
      win.open = originalOpen;
      win.URL.createObjectURL = originalCreateObjectURL;
      win.URL.revokeObjectURL = originalRevokeObjectURL;
      if (previousFixture) Object.defineProperty(win, fixtureKey, previousFixture);
      else delete win[fixtureKey];
    },
  };
  Object.defineProperties(fixture, {
    lastHtml: {
      enumerable: true,
      get() {
        return blobRecords.length ? blobRecords[blobRecords.length - 1].html : '';
      },
    },
    lastBlobType: {
      enumerable: true,
      get() {
        return blobRecords.length ? blobRecords[blobRecords.length - 1].blobType : '';
      },
    },
    navigatedToBlob: {
      enumerable: true,
      get() {
        return popupRecords.length > 0 && popupRecords.every(record => record.state.navigatedToBlob);
      },
    },
    loadEventFired: {
      enumerable: true,
      get() {
        return popupRecords.length > 0 && popupRecords.every(record => record.state.loadEventFired);
      },
    },
    documentParsed: {
      enumerable: true,
      get() {
        return popupRecords.length > 0 && popupRecords.every(record => Boolean(record.state.document));
      },
    },
    focusCalls: {
      enumerable: true,
      get() {
        return focusCalls;
      },
    },
    printCalls: {
      enumerable: true,
      get() {
        return printCalls;
      },
    },
  });
  Object.defineProperty(win, fixtureKey, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: fixture,
  });
  return true;
}

module.exports = { installReportPopupFixture };
