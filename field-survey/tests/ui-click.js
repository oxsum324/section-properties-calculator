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
  const ancestors = await target.evaluate(el => {
    const list=[]; for(let p=el.parentElement;p;p=p.parentElement) if(p.tagName==='DETAILS' && !p.open && !p.querySelector(':scope > summary')?.contains(el)) list.unshift(p.id);
    return list;
  });
  for (const id of ancestors) {
    if (id) await page.locator(`#${id}>summary`).click();
    else await target.evaluate(el => { for(let p=el.parentElement;p;p=p.parentElement) if(p.tagName==='DETAILS' && !p.id && !p.querySelector(':scope > summary')?.contains(el)) p.open=true; });
  }
  const targetView = await target.getAttribute('data-view');
  await target.click(); await page.locator('#busy').waitFor({state:'hidden'});
  // Existing editor workflows explicitly enter the full editor; V0.26 tests cover the mobile default separately.
  if (targetView === 'report' && await page.locator('#reportView').getAttribute('data-mode') === 'simple') {
    await page.locator('#reportModeToggle').click(); await page.locator('#busy').waitFor({state:'hidden'});
  }
}
