async function sectionPropertiesBrowserSmoke(page) {
  const legacyUrl = await page.evaluate(() => new URL('斷面性質計算.html?pickI=1#legacy-bookmark', window.location.href).href);
  await page.goto(legacyUrl);
  await page.waitForURL(url => url.pathname.endsWith('/index.html') && url.search === '?pickI=1' && url.hash === '#legacy-bookmark');
  if (!await page.getByRole('button', { name: '導入至連續梁工具' }).isVisible()) throw new Error('相容入口未保留 pickI 模式');
  const canonicalUrl = await page.evaluate(() => new URL('index.html', window.location.href).href);
  await page.goto(canonicalUrl);

  const consoleErrors = [];
  const captureConsoleError = message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };
  page.on('console', captureConsoleError);
  for (const shapeName of ['圓管', '方管', '角鋼', '槽鋼', 'C 型鋼', '實心矩形', '實心圓形', '基本幾何斷面', '自訂組合斷面', 'H 型鋼']) {
    await page.getByRole('button', { name: shapeName, exact: true }).click();
    await page.waitForFunction(expected => document.querySelector('.tab-btn.active')?.textContent.trim() === expected, shapeName);
  }
  page.off('console', captureConsoleError);
  if (consoleErrors.length) throw new Error(`切換斷面形狀時發生瀏覽器錯誤：${consoleErrors.join(' | ')}`);

  const source = await page.evaluate(() => collectSectionProjectData());
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '儲存案例 JSON' }).click();
  const download = await downloadPromise;
  const savedPath = await download.path();

  await page.locator('#h-H').fill('777');
  await page.locator('#h-H').dispatchEvent('input');
  const perturbed = await page.evaluate(() => sectionCalculationFingerprint());
  if (perturbed === source.calculation.fingerprint) throw new Error('尺寸變更後計算指紋未改變');

  await page.locator('#sectionJsonFile').setInputFiles(savedPath);
  await page.waitForFunction(expected => document.querySelector('#exportStatus').textContent.includes(expected), source.calculation.fingerprint);
  const replay = await page.evaluate(() => ({
    data: collectSectionProjectData(),
    status: document.querySelector('#exportStatus').textContent,
  }));
  if (replay.data.calculation.fingerprint !== source.calculation.fingerprint) throw new Error('JSON 載入重算指紋不符');

  const beforeRejected = await page.evaluate(() => JSON.stringify(collectSectionProjectData().section));
  await page.evaluate(async payload => {
    const target = {
      files: [{ text: async () => JSON.stringify({ ...payload, schema: 'section-properties.project.v999' }) }],
      value: 'bad.json',
    };
    await loadSectionProjectFile({ target });
  }, source);
  await page.waitForFunction(() => document.querySelector('#exportStatus').textContent.includes('載入失敗'));
  const afterRejected = await page.evaluate(() => JSON.stringify(collectSectionProjectData().section));
  if (beforeRejected !== afterRejected) throw new Error('錯誤 JSON 改變了目前案例');

  const mismatchPreserved = await page.evaluate(payload => {
    const before = JSON.stringify(collectSectionProjectData().section);
    const tampered = JSON.parse(JSON.stringify(payload));
    tampered.section.inputs['h-H'] = '999';
    let rejected = false;
    try { applySectionProjectData(tampered); } catch (_) { rejected = true; }
    return rejected && JSON.stringify(collectSectionProjectData().section) === before;
  }, source);
  if (!mismatchPreserved) throw new Error('重算指紋不符時未回復原案例');

  await page.evaluate(payload => applySectionProjectData(payload), source);
  const firstResult = page.locator('.res-cb').first();
  await firstResult.uncheck();
  const selectionFingerprint = await page.evaluate(() => sectionCalculationFingerprint());
  if (selectionFingerprint === source.calculation.fingerprint) throw new Error('輸出欄位選取變更後計算指紋未改變');
  await firstResult.check();
  const restoredSelectionFingerprint = await page.evaluate(() => sectionCalculationFingerprint());
  if (restoredSelectionFingerprint !== source.calculation.fingerprint) throw new Error('輸出欄位選取還原後計算指紋未還原');

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: '計算書', exact: true }).click();
  const report = await popupPromise;
  await report.waitForLoadState('domcontentloaded');
  await report.waitForSelector('#repAttachmentApproval');
  let reportText = await report.locator('body').innerText();
  if (!reportText.includes('採用尺寸') || !reportText.includes('H - 全高') || !reportText.includes('588')) throw new Error('計算書缺少採用尺寸');
  if (!reportText.includes('文件狀態：內部審閱')) throw new Error('新計算書未預設為可列印的內部審閱');
  if (!reportText.includes(source.calculation.fingerprint)) throw new Error('計算書與來源 JSON 指紋不一致');
  if (reportText.includes('此頁是操作介面') || reportText.includes('載入失敗')) throw new Error('計算書混入操作頁訊息');

  await report.getByLabel('核可為正式附件').check();
  reportText = await report.locator('body').innerText();
  if (!reportText.includes('文件狀態：正式附件')) throw new Error('預覽內核可後未標示正式附件');
  await report.getByLabel('核可人，選填').fill('QA Reviewer');
  if (await report.getByLabel('核可為正式附件').isChecked()) throw new Error('核可紀錄異動後未撤銷正式核可');
  await report.getByLabel('核可為正式附件').check();

  const htmlDownloadPromise = report.waitForEvent('download');
  await report.getByRole('button', { name: '下載目前版本 HTML' }).click();
  const htmlDownload = await htmlDownloadPromise;
  const downloadedHtml = await htmlDownload.createReadStream().then(async stream => {
    let text = '';
    for await (const chunk of stream) text += chunk.toString('utf8');
    return text;
  });
  if (!downloadedHtml.includes('data-initial-approved="true"') || !downloadedHtml.includes('data-content-sha256="') || !downloadedHtml.includes('data-approval-sha256="')) {
    throw new Error('正式附件 HTML 未保存核可狀態與雙封印');
  }
  const serializedWindowStatus = downloadedHtml.match(/<span\b(?=[^>]*\brep-window-status\b)[^>]*>([\s\S]*?)<\/span>/i);
  if (serializedWindowStatus && serializedWindowStatus[1].replace(/<[^>]+>/g, '').trim()) {
    throw new Error('正式附件 HTML 保留了核可前的暫態撤銷訊息');
  }

  return JSON.stringify({
    downloadName: download.suggestedFilename(),
    reportDownloadName: htmlDownload.suggestedFilename(),
    fingerprint: source.calculation.fingerprint,
    replay: true,
    rejectedStatePreserved: true,
    mismatchRollback: true,
    selectionFingerprintBound: true,
    allShapeTabsSwitchable: true,
    approvalRevokedOnMetadata: true,
    sealedHtml: true,
    formalReport: true,
  });
}
