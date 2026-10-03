'use strict';
// 不啟動瀏覽器：驗證 CDP 故障注入必須攔到真事件，且精確中止／清理。
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const { createCdpReportNetworkProbe } = require('./report-docx.browser.test.js');
const runtime = 'http://127.0.0.1:12345/' + encodeURI('石材固定/vendor/package/dist/index.iife.js');
class FakeSession extends EventEmitter {
  constructor() { super(); this.commands = []; this.detached = false; this.body = 'verified vendor bytes'; }
  async send(method, params) {
    this.commands.push({ method, params });
    if (method === 'Network.getResponseBody') return { body: this.body, base64Encoded: false };
    if (method === this.failMethod) throw Error('simulated protocol cleanup error');
    return {};
  }
  async detach() { this.detached = true; }
}
async function setup() {
  const session = new FakeSession(), fetchSession = new FakeSession(), record = { runtimeRequests: [] };
  const report = {}, opener = {};
  const probe = await createCdpReportNetworkProbe({ async newCDPSession(target) { return target === report ? session : fetchSession; } }, report, record, opener);
  return { session, fetchSession, record, probe };
}
async function main() {
  const { session, fetchSession, record, probe } = await setup();
  const failure = await probe.injectFailure('**/index.iife.js');
  await assert.rejects(failure.waitForPause(5), /未攔到實際請求/, '沒有事件就失敗，不能把產品逾時視為成功注入');
  session.emit('Network.requestWillBeSent', { requestId: 'network-1', frameId: 'written-popup', documentURL: '/beam.html', request: { url: runtime } });
  assert.equal(record.runtimeRequests.length, 1, '不依赖 Playwright context/request 的 frame 映射');
  fetchSession.emit('Fetch.requestPaused', { requestId: 'fetch-1', networkId: 'network-1', request: { url: runtime } });
  assert.equal((await failure.waitForPause()).networkId, 'network-1');
  assert.equal(fetchSession.commands.filter(command => command.method === 'Fetch.failRequest').length, 0, 'HTML 保存期间維持確實暫停');
  await failure.release();
  assert.deepEqual(fetchSession.commands.find(command => command.method === 'Fetch.failRequest').params, { requestId: 'fetch-1', errorReason: 'Failed' });
  session.emit('Network.loadingFailed', { requestId: 'network-1', errorText: 'net::ERR_FAILED', canceled: false });
  await failure.close();
  assert.equal(fetchSession.listenerCount('Fetch.requestPaused'), 0);
  assert.ok(fetchSession.commands.some(command => command.method === 'Fetch.disable'));

  session.emit('Network.requestWillBeSent', { requestId: 'network-2', frameId: 'written-popup', documentURL: '/beam.html', request: { url: runtime } });
  session.emit('Network.responseReceived', { requestId: 'network-2', response: { status: 200, fromDiskCache: false } });
  session.emit('Network.loadingFinished', { requestId: 'network-2', encodedDataLength: 999999 });
  await probe.flush();
  assert.equal(record.runtimeRequests.length, 2, '必須保留獨立失敗與重試兩次 request');
  const body = record.runtimeNetworkEvents.find(event => event.kind === 'response-body');
  assert.equal(body.bytes, Buffer.byteLength(session.body), 'body bytes 不得以含 headers 的 encodedDataLength 冒充');
  assert.equal(body.sha256, crypto.createHash('sha256').update(session.body).digest('hex'));
  assert.ok(record.runtimeNetworkEvents.some(event => event.kind === 'network-failed' && event.requestId === 'network-1'));
  assert.ok(record.runtimeNetworkEvents.some(event => event.kind === 'fail-request' && event.networkId === 'network-1'));

  const missing = await probe.injectFailure('**/__docx_qa_missing__.png');
  await missing.release();
  fetchSession.emit('Fetch.requestPaused', { requestId: 'fetch-image', networkId: 'network-image', request: { url: 'http://localhost/__docx_qa_missing__.png' } });
  await missing.waitForPause();
  await missing.close();
  assert.ok(fetchSession.commands.some(command => command.method === 'Fetch.failRequest' && command.params.requestId === 'fetch-image'));
  await probe.close();
  assert.equal(session.detached, true);
  assert.equal(fetchSession.detached, true);
  assert.equal(session.commands.some(command => command.method.startsWith('Fetch.')), false, 'popup session 只觀測 Network；不能把 Fetch 綁在錯 target');
  assert.equal(fetchSession.commands.some(command => command.method.startsWith('Network.')), false, 'opener session 僅處理繼承 loader 的 Fetch');
  assert.equal(session.eventNames().length, 0, 'probe 結束必須清除所有 CDP listeners');

  const cleanup = await setup();
  const pending = await cleanup.probe.injectFailure('**/index.iife.js');
  cleanup.fetchSession.emit('Fetch.requestPaused', { requestId: 'still-held', networkId: 'held-network', request: { url: runtime } });
  await cleanup.probe.close();
  assert.ok(cleanup.fetchSession.commands.some(command => command.method === 'Fetch.failRequest' && command.params.requestId === 'still-held'), '中途失敗也必須解除暫停請求');
  assert.equal(cleanup.session.detached, true);
  assert.equal(cleanup.fetchSession.detached, true);
  await pending.close();

  const broken = await setup();
  await broken.probe.injectFailure('**/index.iife.js');
  broken.fetchSession.failMethod = 'Fetch.disable';
  await assert.rejects(broken.probe.close(), /cleanup error/);
  assert.equal(broken.session.detached, true, 'Fetch cleanup 失敗仍須 detach popup');
  assert.equal(broken.fetchSession.detached, true, 'Fetch cleanup 失敗仍須 detach opener');
  assert.equal(broken.fetchSession.eventNames().length, 0);
  assert.equal(broken.session.eventNames().length, 0);
  console.log('RC CDP network probe: real pause/failure/retry body evidence and finally cleanup passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
