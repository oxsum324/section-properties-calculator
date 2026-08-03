async function sectionPropertiesBrowserSmoke(page) {
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

  await page.getByLabel('核可為正式附件').check();
  await page.locator('#h-H').fill('589');
  await page.locator('#h-H').dispatchEvent('input');
  if (await page.getByLabel('核可為正式附件').isChecked()) throw new Error('輸入變更後未撤銷附件核可');
  await page.evaluate(payload => applySectionProjectData(payload), source);
  await page.getByLabel('核可為正式附件').check();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: '計算書 PDF' }).click();
  const report = await popupPromise;
  await report.waitForLoadState('domcontentloaded');
  const reportText = await report.locator('body').innerText();
  if (!reportText.includes('採用尺寸') || !reportText.includes('H - 全高') || !reportText.includes('588')) throw new Error('計算書缺少採用尺寸');
  if (!reportText.includes('文件狀態：正式附件')) throw new Error('核可計算書未標示正式附件');
  if (!reportText.includes(source.calculation.fingerprint)) throw new Error('計算書與來源 JSON 指紋不一致');
  if (reportText.includes('此頁是操作介面') || reportText.includes('載入失敗')) throw new Error('計算書混入操作頁訊息');

  return JSON.stringify({
    downloadName: download.suggestedFilename(),
    fingerprint: source.calculation.fingerprint,
    replay: true,
    rejectedStatePreserved: true,
    mismatchRollback: true,
    approvalRevokedOnInput: true,
    formalReport: true,
  });
}
