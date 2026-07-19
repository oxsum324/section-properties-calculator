async page => {
  const initialUrl = page.url();
  const base = initialUrl.endsWith('/') ? initialUrl : `${initialUrl}/`;
  const viewports = [
    { key: 'desktop', width: 1280, height: 800 },
    { key: 'mobile', width: 390, height: 844 }
  ];

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${base}%E7%B5%90%E6%A7%8B%E5%B7%A5%E5%85%B7%E7%AE%B1/`, { waitUntil: 'networkidle' });
  const routes = await page.evaluate(async () => {
    const response = await fetch('assets/home/home.js', { cache: 'no-store' });
    if (!response.ok) throw new Error(`home.js HTTP ${response.status}`);
    const source = await response.text();
    return [...source.matchAll(/\bhref:\s*['"](\/[^'"]+)['"]/g)].map(match => match[1]);
  });

  if (routes.length < 40 || new Set(routes).size !== routes.length) {
    throw new Error(`invalid homepage route inventory: total=${routes.length}, unique=${new Set(routes).size}`);
  }

  const issues = [];
  const localArtifactPreview = /^http:\/\/127\.0\.0\.1:\d+\/$/.test(base);
  const ignoredUrl = value => {
    const url = String(value || '');
    if (url.includes('/favicon.ico')) return true;
    if (!localArtifactPreview) return false;
    return url.includes('/%E9%8B%BC%E6%A7%8B%E5%B7%A5%E5%85%B7/output/audit/audit-status.json') ||
      url === 'http://127.0.0.1:8765/status';
  };

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of routes) {
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      const failedResponses = [];
      const onConsole = message => {
        const location = message.location()?.url || '';
        if (message.type() === 'error' && !ignoredUrl(location) && !ignoredUrl(message.text())) {
          consoleErrors.push({ text: message.text(), location });
        }
      };
      const onPageError = error => pageErrors.push(error.message);
      const onRequestFailed = request => {
        if (!ignoredUrl(request.url())) {
          failedRequests.push({ url: request.url(), error: request.failure()?.errorText || '' });
        }
      };
      const onResponse = response => {
        if (response.status() >= 400 && !ignoredUrl(response.url())) {
          failedResponses.push({ url: response.url(), status: response.status() });
        }
      };

      page.on('console', onConsole);
      page.on('pageerror', onPageError);
      page.on('requestfailed', onRequestFailed);
      page.on('response', onResponse);

      let navigationStatus = 0;
      let navigationError = '';
      try {
        const response = await page.goto(`${base}${route.slice(1)}/`, {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        navigationStatus = response?.status() || 0;
        await page.waitForTimeout(150);
      } catch (error) {
        navigationError = error.message;
      }

      const state = await page.evaluate(routeName => {
        const candidateTable = routeName === '/rc-pile'
          ? document.querySelector('#candidateTable')?.closest('.table-wrap')
          : null;
        const referenceImage = routeName === '/wind-cc'
          ? document.getElementById('refShot')
          : null;
        const stonePreview = routeName === '/stone-fixing'
          ? document.getElementById('preview-area')
          : null;
        return {
          title: document.title,
          bodyChars: (document.body?.innerText || '').trim().length,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          rootOverflowX: getComputedStyle(document.documentElement).overflowX,
          candidateTable: candidateTable
            ? { clientWidth: candidateTable.clientWidth, scrollWidth: candidateTable.scrollWidth }
            : null,
          referenceImage: referenceImage
            ? {
                complete: referenceImage.complete,
                naturalWidth: referenceImage.naturalWidth,
                naturalHeight: referenceImage.naturalHeight,
                visible: referenceImage.getClientRects().length > 0
              }
            : null,
          stonePreview: stonePreview
            ? { clientWidth: stonePreview.clientWidth, scrollWidth: stonePreview.scrollWidth }
            : null
        };
      }, route);

      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('requestfailed', onRequestFailed);
      page.off('response', onResponse);

      const routeIssues = [];
      if (navigationError) routeIssues.push(`navigation: ${navigationError}`);
      if (navigationStatus >= 400 || navigationStatus === 0) routeIssues.push(`navigation HTTP ${navigationStatus}`);
      if (!page.url().startsWith(base)) routeIssues.push(`left deployment origin: ${page.url()}`);
      if (!state.title || state.title === '正在開啟結構工具') routeIssues.push(`invalid title: ${state.title}`);
      if (state.bodyChars < 20) routeIssues.push(`body text too short: ${state.bodyChars}`);
      const containedStonePreview = route === '/stone-fixing' && viewport.key === 'mobile' &&
        state.rootOverflowX === 'clip' && state.stonePreview &&
        state.stonePreview.scrollWidth > state.stonePreview.clientWidth;
      if (state.scrollWidth > state.clientWidth + 2 && !containedStonePreview) {
        routeIssues.push(`horizontal overflow: ${state.scrollWidth} > ${state.clientWidth}`);
      }
      if (consoleErrors.length) routeIssues.push(`console errors: ${JSON.stringify(consoleErrors)}`);
      if (pageErrors.length) routeIssues.push(`page errors: ${JSON.stringify(pageErrors)}`);
      if (failedRequests.length) routeIssues.push(`failed requests: ${JSON.stringify(failedRequests)}`);
      if (failedResponses.length) routeIssues.push(`HTTP errors: ${JSON.stringify(failedResponses)}`);

      if (route === '/rc-pile' && viewport.key === 'mobile') {
        if (!state.candidateTable || state.candidateTable.scrollWidth <= state.candidateTable.clientWidth) {
          routeIssues.push(`RC pile wide table is not contained by its local scroll region: ${JSON.stringify(state.candidateTable)}`);
        }
      }
      if (route === '/wind-cc') {
        const image = state.referenceImage;
        if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0 || !image.visible) {
          routeIssues.push(`wind-cc reference image not rendered: ${JSON.stringify(image)}`);
        }
      }
      if (route === '/stone-fixing' && viewport.key === 'mobile' && !containedStonePreview) {
        routeIssues.push(`stone A4 preview is not contained by its local scroll region: ${JSON.stringify({ rootOverflowX: state.rootOverflowX, preview: state.stonePreview })}`);
      }

      if (routeIssues.length) {
        issues.push({ viewport: viewport.key, route, finalUrl: page.url(), issues: routeIssues });
      }
    }
  }

  if (issues.length) {
    throw new Error(`Pages live browser smoke failed (${issues.length} route/viewports):\n${JSON.stringify(issues.slice(0, 20), null, 2)}`);
  }

  return {
    routes: routes.length,
    viewports: viewports.map(viewport => viewport.key),
    checks: routes.length * viewports.length,
    issues: 0
  };
}
