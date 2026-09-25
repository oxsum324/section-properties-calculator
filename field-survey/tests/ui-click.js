// Open the same phase and disclosure controls a person uses; never unhide inputs.
export async function revealSurveyControl(page, selector) {
  const target = typeof selector === 'string' ? page.locator(selector) : selector;
  const inCards = await target.evaluate(el => !!el.closest('#conditionCards'));
  if (inCards && await page.locator('#conditionPicker').evaluate(el => el.open)) await page.locator('#fillConditionDetails').click();
  const ancestors = target.locator('xpath=ancestor::details');
  for (let i = 0; i < await ancestors.count(); i++) {
    const detail = ancestors.nth(i);
    const mustOpen = await target.evaluate((el, ancestor) => !ancestor.open && !ancestor.querySelector(':scope > summary')?.contains(el), await detail.elementHandle());
    if (mustOpen) await detail.locator(':scope > summary').click();
  }
  return target;
}

// Follow the same explicit open/close controls a user uses for detail panels.
export async function clickSurvey(page, selector) {
  const target = page.locator(selector);
  const close = await target.evaluate(el => {
    const modal = document.querySelector('#modal');
    if (!modal?.open || modal.dataset.mode !== 'detail') return [];
    return [
      ...[...modal.querySelectorAll('.detail-menu[open]')].filter(menu => !menu.contains(el)).map(menu => `#${menu.id} [data-close-detail-panel]`),
      ...[...modal.querySelectorAll('#detailSymbols:not([hidden]),#detailChoices:not([hidden])')].filter(panel => !panel.contains(el) && el.id !== 'chooseDetail').map(panel => `#${panel.id} [data-close-detail-panel]`)
    ];
  });
  for (const summary of close) await page.locator(summary).click();
  await revealSurveyControl(page, target);
  const targetView = await target.getAttribute('data-view');
  await target.click(); await page.locator('#busy').waitFor({state:'hidden'});
  // Existing editor workflows explicitly enter the full editor; V0.26 tests cover the mobile default separately.
  if (targetView === 'report' && await page.locator('#reportView').getAttribute('data-mode') === 'simple') {
    await page.locator('#reportModeToggle').click(); await page.locator('#busy').waitFor({state:'hidden'});
  }
}
