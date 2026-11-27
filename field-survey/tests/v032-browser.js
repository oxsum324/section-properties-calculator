import assert from 'node:assert/strict';

export async function verifyV032(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const idle = () => page.locator('#busy').waitFor({ state: 'hidden' });
  const openView = async view => { await page.locator('[data-view=' + view + ']').click(); await idle(); };
  const readProject = () => page.evaluate(async () => {
    const { getProject } = await import('./store.js');
    return getProject(document.querySelector('#caseSelect').value);
  });

  try {
    await page.goto(base);
    await page.locator('#contextStrip').waitFor();
    const seed = {
      format: 'field-case-seed.v1', caseCode: 'V032-TEST', caseName: 'V0.32 合成更正測試',
      surveyDate: '2026-11-27', units: [{ code: 'A戶', floor: '1F' }]
    };
    await page.locator('#seedInput').setInputFiles({
      name: 'synthetic.case-seed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed))
    });
    await page.locator('#caseSelect option').filter({ hasText: seed.caseCode }).waitFor({ state: 'attached' });
    await idle();
    await page.locator('#modeOfficeBtn').click();
    await openView('work');
    await page.locator('#addRecord').click();
    await idle();
    await openView('case');
    await page.locator('#sealAndHandoff').click();
    await page.locator('#downloadHandoff').waitFor();
    await page.locator('#closeModal').click();
    await idle();
    const original = await readProject();
    const [before] = original.records;
    assert.equal(before.observedOn, seed.surveyDate);
    assert(original.fieldHandoff.records[before.id]);

    await openView('work');
    if (await page.locator('#recordAdvanced:not([open])').count()) await page.locator('#recordAdvanced > summary').click();
    await page.locator('#observedOn').fill('');
    await page.locator('[data-view=case]').click();
    await page.locator('#correctionEditor').fill('合成驗收');
    await page.locator('#correctionChoice').selectOption('日期補登／核對');
    await page.locator('#correctionForm').getByRole('button', { name: '確認更正並保存' }).click();
    await idle();
    await page.locator('#backupView').waitFor();
    const corrected = await readProject();
    assert.deepEqual(corrected.fieldHandoff, original.fieldHandoff);
    const [record] = corrected.records;
    assert.equal(record.observedOn, '');
    assert.equal(record.editLog.length, 1);
    const [entry] = record.editLog;
    assert.equal(entry.editor, '合成驗收');
    assert.equal(entry.reason, '日期補登／核對');
    assert.equal(entry.before, original.fieldHandoff.records[before.id]);
    assert.equal(JSON.parse(entry.after).observedOn, '');

    await openView('work');
    if (await page.locator('#recordAdvanced:not([open])').count()) await page.locator('#recordAdvanced > summary').click();
    await page.locator('#observedOn').fill(before.observedOn);
    await page.locator('#cancelCorrection').click();
    await page.getByText('已取消更正，維持原保存內容', { exact: true }).waitFor();
    assert.equal(await page.locator('#observedOn').inputValue(), '');
    assert.deepEqual(await readProject(), corrected);
    assert.deepEqual(errors, []);
    console.log('PASS V0.32 sealed date corrections survive navigation and cancel preserves the audit trail');
  } finally {
    await context.close();
  }
}
