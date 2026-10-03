const assert = require('node:assert/strict');
const workflow = require('./tool-workflow.js');

function keyEvent(values = {}) {
  return Object.assign({
    key: 'Enter', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
    target: { tagName: 'INPUT' }, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.stopped = true; }
  }, values);
}

// 最小 DOM fixture：測試公開行為（事件／待更新／生命週期），不用瀏覽器。
class Element {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.attributes = {}; this.children = []; this.listeners = new Map(); this.textContent = ''; this.hidden = false; this.order = 0; this.style = {}; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  appendChild(node) { this.children.push(node); node.parent = this; return node; }
  prepend(node) { this.children.unshift(node); node.parent = this; }
  insertAdjacentElement(_, node) { this.parent.appendChild(node); }
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, event) { this.listeners.get(type)?.forEach(callback => callback(event)); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  getClientRects() { return this.hidden ? [] : [{}]; }
  compareDocumentPosition(other) { return this.order < other.order ? 4 : 2; }
  matches(selector) {
    if (selector === ':modal') return !!this.modal;
    if (selector === 'input,select,textarea,[contenteditable="true"]') return ['INPUT', 'SELECT', 'TEXTAREA'].includes(this.tagName);
    return selector === this.selector;
  }
  closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
}

class Document extends Element {
  constructor() {
    super('document'); this.body = new Element('body'); this.head = new Element('head');
    this.appendChild(this.head); this.appendChild(this.body); this.modalNodes = [];
    this.defaultView = { getComputedStyle: node => node.style, console: { error() {} } };
  }
  createElement(tag) { return new Element(tag); }
  getElementById(id) { return this.head.children.find(node => node.id === id) || null; }
  querySelector() { return null; }
  querySelectorAll(selector) {
    return this.modalNodes.filter(node => {
      if (selector === 'dialog[open], [aria-modal="true"]') return (node.tagName === 'DIALOG' && node.open) || node.getAttribute('aria-modal') === 'true';
      return selector === 'dialog[open]' ? node.tagName === 'DIALOG' && node.open : node.selector === selector;
    });
  }
}

async function main() {
  let calls = 0, shown = 0, refreshed = 0;
  const controller = workflow.createController({ calculate() { calls++; }, showResults() { shown++; }, refresh() { refreshed++; } });
  const event = keyEvent();
  assert.equal(controller.handleKeyDown(event), true);
  assert.deepEqual([calls, shown, refreshed], [1, 1, 1], 'input-focused Ctrl+Enter calculates exactly once before navigation');
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.stopped, true);
  controller.handleKeyDown(keyEvent({ ctrlKey: false, metaKey: true }));
  assert.equal(calls, 2, 'Mac shortcut uses the same single callback');
  for (const values of [{ ctrlKey: false }, { altKey: true }, { shiftKey: true }, { defaultPrevented: true }]) {
    assert.equal(controller.handleKeyDown(keyEvent(values)), false);
  }
  for (const values of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
    const ignored = keyEvent(values);
    assert.equal(controller.handleKeyDown(ignored), true);
    assert.equal(ignored.stopped, true, 'suppressed shortcut does not fall through to a legacy Ctrl+Enter handler');
  }
  assert.equal(calls, 2, 'ordinary Enter, IME, repeat and already handled events do not calculate');

  let resolve, asyncCalls = 0, asyncShown = 0;
  const busy = workflow.createController({ calculate() { asyncCalls++; return new Promise(done => { resolve = done; }); }, showResults() { asyncShown++; } });
  const pending = busy.run();
  busy.handleKeyDown(keyEvent());
  assert.deepEqual([asyncCalls, asyncShown, busy.busy], [1, 0, true], 'pending calculations cannot run twice');
  resolve(true); await pending;
  assert.deepEqual([asyncCalls, asyncShown, busy.busy], [1, 1, false], 'navigation waits for asynchronous result');

  let failures = 0, invalidations = 0;
  const invalid = workflow.createController({ calculate: () => false, showResults() { throw Error('must not navigate invalid result'); }, invalidate() { invalidations++; } });
  assert.equal(invalid.run(), false); assert.equal(invalidations, 1);
  const rejected = workflow.createController({ calculate: () => Promise.reject(Error('invalid input')), onError() { failures++; } });
  assert.equal(await rejected.run(), false); assert.equal(rejected.busy, false); assert.equal(failures, 1);
  const thrown = workflow.createController({ calculate() { throw Error('invalid input'); }, onError() { failures++; } });
  thrown.run(); assert.equal(thrown.busy, false); assert.equal(failures, 2);

  let modalOpen = true, closes = 0;
  const modalController = workflow.createController({ calculate() {}, closeModal() { if (!modalOpen) return false; closes++; modalOpen = false; return true; } });
  const escape = keyEvent({ key: 'Escape', ctrlKey: false });
  assert.equal(modalController.handleKeyDown(escape), true, 'Esc works while a modal input has focus');
  assert.equal(closes, 1); assert.equal(escape.stopped, true, 'legacy bubble handlers cannot close a second modal');
  const noModal = keyEvent({ key: 'Escape', ctrlKey: false });
  assert.equal(modalController.handleKeyDown(noModal), false); assert.equal(noModal.defaultPrevented, false, 'Esc without a modal keeps normal page behavior');
  let modalCalculations = 0, modalNavigations = 0, blocked = true;
  const guarded = workflow.createController({ calculate() { modalCalculations++; }, showResults() { modalNavigations++; }, blockedByModal: () => blocked });
  const blockedEnter = keyEvent();
  assert.equal(guarded.handleKeyDown(blockedEnter), true);
  assert.deepEqual([modalCalculations, modalNavigations], [0, 0], 'Ctrl+Enter while a modal is open cannot calculate or navigate underneath it');
  assert.equal(blockedEnter.defaultPrevented, true, 'blocked Ctrl+Enter cannot submit the modal command');
  assert.equal(blockedEnter.stopped, true, 'blocked Ctrl+Enter never reaches a modal target Enter handler');
  for (const values of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
    const repeatedModalKey = keyEvent(values);
    assert.equal(guarded.handleKeyDown(repeatedModalKey), true);
    assert.equal(repeatedModalKey.defaultPrevented, true, 'repeated/IME modified Enter cannot submit a modal command');
    assert.equal(repeatedModalKey.stopped, true);
  }
  assert.deepEqual([modalCalculations, modalNavigations], [0, 0]);
  blocked = false; guarded.handleKeyDown(keyEvent());
  assert.deepEqual([modalCalculations, modalNavigations], [1, 1], 'shortcut resumes after modal closes');
  controller.destroy(); controller.run(); assert.equal(calls, 2, 'destroyed callbacks never calculate');

  const documentRef = new Document();
  let source = { text: '原結果：需求／容量 0.75', tone: 'ok' }, calculated = 0, navigated = 0;
  const handle = workflow.install({ key: '/fixture', documentRef, createCalculateButton: true, calcButtonSelector: '#calculate', calculate() { calculated++; source = { text: '新結果：需求／容量 1.12', tone: 'fail' }; }, showResults() { navigated++; }, readSummary: () => source });
  const summary = handle.panel.children.find(node => node.getAttribute('data-workflow-summary') !== null);
  const input = new Element('input');
  documentRef.emit('input', { target: input });
  assert.equal(handle.pending, true); assert.equal(handle.panel.getAttribute('data-state'), 'pending');
  assert.equal(summary.textContent.includes('0.75'), false, 'modified input must not leave the previous conclusion visible');
  assert.equal(handle.panel.getAttribute('data-tone'), 'idle');
  documentRef.emit('keydown', keyEvent());
  assert.deepEqual([calculated, navigated, handle.pending], [1, 1, false]);
  assert.equal(summary.textContent, source.text); assert.equal(handle.panel.getAttribute('data-tone'), 'fail', 'only the existing result supplies engineering status');
  const existingButton = new Element('button'); existingButton.selector = '#calculate';
  calculated++; // 既有按鈕 callback 先執行，document 委派只能導向。
  documentRef.emit('click', { target: existingButton });
  assert.deepEqual([calculated, navigated], [2, 2], 'observing an existing button never invokes calculate again');
  assert.equal(workflow.install({ key: '/fixture', documentRef, calculate() { throw Error('duplicate install'); } }), handle);
  assert.equal(documentRef.listeners.get('keydown').size, 1, 'repeat installation does not add keyboard listeners');
  assert.equal(handle.panel.getAttribute('data-page-only'), 'true');
  assert.match(workflow.STYLE, /@media print\{\[data-hy-workflow\]\{display:none!important\}\}/);
  handle.destroy(); documentRef.emit('keydown', keyEvent()); assert.equal(calculated, 2);
  assert.equal(documentRef.body.children.length, 0, 'destroy removes the page-only panel');

  const buttonDocument = new Document();
  const wrappedButton = new Element('button'); wrappedButton.selector = '#calculate';
  let wrappedCalls = 0, wrappedNavigations = 0;
  const buttonHandle = workflow.install({
    key: '/button-fixture', documentRef: buttonDocument, calcButtonSelector: '#calculate',
    calculate() { wrappedCalls++; buttonDocument.emit('click', { target: wrappedButton }); },
    showResults() { wrappedNavigations++; }
  });
  buttonHandle.run();
  assert.deepEqual([wrappedCalls, wrappedNavigations], [1, 1], 'keyboard proxying an existing button cannot navigate or calculate twice');
  buttonHandle.destroy();

  const modalDocument = new Document();
  const lower = new Element(), upper = new Element(), hidden = new Element();
  lower.selector = '.modal'; lower.order = 1; lower.style.zIndex = '100';
  upper.selector = '.modal'; upper.order = 2; upper.style.zIndex = '200';
  hidden.selector = '.modal'; hidden.order = 3; hidden.style.zIndex = '999'; hidden.hidden = true;
  modalDocument.modalNodes = [lower, upper, hidden]; const closed = [];
  assert.equal(workflow.closeTopModal(modalDocument, [{ selector: '.modal', close: node => closed.push(node) }]), true);
  assert.deepEqual(closed, [upper], 'only the visually topmost visible registered modal closes');
  const native = new Element('dialog'); native.open = true; native.modal = true; native.order = 0; native.close = () => closed.push(native);
  modalDocument.modalNodes.push(native);
  workflow.closeTopModal(modalDocument, [{ selector: '.modal', close: node => closed.push(node) }]);
  assert.equal(closed.at(-1), native, 'native modal top layer has priority over custom z-index');
  assert.equal(workflow.hasOpenModal(modalDocument), true);
  native.modal = false;
  assert.equal(workflow.hasOpenModal(modalDocument), false, 'non-modal open dialog does not block page calculation');
  upper.setAttribute('aria-modal', 'true');
  assert.equal(workflow.hasOpenModal(modalDocument), true, 'visible ARIA modal also blocks page calculation');
  upper.setAttribute('aria-hidden', 'true');
  assert.equal(workflow.hasOpenModal(modalDocument), false, 'closed ARIA modal cannot disable the shortcut');
  upper.setAttribute('aria-hidden', 'false');
  let underlyingCalls = 0, underlyingResults = 0;
  const modalHandle = workflow.install({ key: '/modal-fixture', documentRef: modalDocument, calculate() { underlyingCalls++; }, showResults() { underlyingResults++; } });
  const blockedDocumentKey = keyEvent();
  modalDocument.emit('keydown', blockedDocumentKey);
  assert.deepEqual([underlyingCalls, underlyingResults], [0, 0], 'installed capture handler detects modal without calling its close adapter');
  assert.equal(blockedDocumentKey.defaultPrevented, true); assert.equal(blockedDocumentKey.stopped, true);
  modalHandle.destroy();
  assert.equal(workflow.closeTopModal(new Document()), false, 'ordinary panels are never treated as dialogs');

  console.log('tool-workflow: shortcut, one-call navigation, async/retry, pending state, modal priority and page-only lifecycle passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
