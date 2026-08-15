async page => {
  const initialUrl = page.url();
  const initialBase = initialUrl.endsWith('/') ? initialUrl : `${initialUrl}/`;
  const base = await page.evaluate(candidateBase => {
    const storageKey = 'pages-browser-smoke-deployment-base';
    const preservedBase = sessionStorage.getItem(storageKey);
    if (preservedBase) return preservedBase;
    sessionStorage.setItem(storageKey, candidateBase);
    return candidateBase;
  }, initialBase);
  const viewports = [
    { key: 'desktop', width: 1280, height: 800 },
    { key: 'mobile', width: 390, height: 844 }
  ];
  const directPrintBoundaries = {
    '/excavation-support': { label: 'excavation launcher', heading: '開挖服務入口列印已封鎖' },
    '/rc': { label: 'RC launcher', heading: 'RC 工具箱入口列印已封鎖' },
    '/toolbox-classic': { label: 'classic compatibility launcher', heading: '舊網址相容入口列印已封鎖' },
    '/steel-formal': { label: 'steel launcher', heading: '鋼構正式工具主頁列印已封鎖', selector: '.steel-formal-direct-print-boundary', bodyClass: 'steel-formal-output-page' },
    '/steel-plate': { label: 'steel plate page', heading: '鋼構正式工具主頁列印已封鎖', selector: '.steel-formal-direct-print-boundary', bodyClass: 'steel-formal-output-page' },
    '/steel-beam-formal': { label: 'steel beam page', heading: '鋼構正式工具主頁列印已封鎖', selector: '.steel-formal-direct-print-boundary', bodyClass: 'steel-formal-output-page' },
    '/steel-column-formal': { label: 'steel column page', heading: '鋼構正式工具主頁列印已封鎖', selector: '.steel-formal-direct-print-boundary', bodyClass: 'steel-formal-output-page' },
    '/decking': { label: 'decking page', heading: '覆工板工具主頁列印已封鎖' },
    '/wind-force': { label: 'wind MWFRS page', heading: '正式工具主頁列印已封鎖' },
    '/wind-cc': { label: 'wind C&C page', heading: '正式工具主頁列印已封鎖' },
    '/wind-parapet': { label: 'wind parapet page', heading: '正式工具主頁列印已封鎖' },
    '/wind-open-roof': { label: 'wind open-roof page', heading: '正式工具主頁列印已封鎖' },
    '/wind-object-solid': { label: 'wind solid-object page', heading: '正式工具主頁列印已封鎖' },
    '/wind-object-frame': { label: 'wind frame-object page', heading: '正式工具主頁列印已封鎖' },
    '/wind-lattice-tower': { label: 'wind lattice-tower page', heading: '正式工具主頁列印已封鎖' },
    '/wind-object-tower': { label: 'wind tower-object page', heading: '正式工具主頁列印已封鎖' },
    '/wind-fence-sign': { label: 'wind fence-sign page', heading: '正式工具主頁列印已封鎖' },
    '/wind-sign-pole': { label: 'wind sign-pole page', heading: '正式工具主頁列印已封鎖' },
    '/seismic-force': { label: 'seismic static page', heading: '正式工具主頁列印已封鎖' },
    '/seismic-dynamic': { label: 'seismic dynamic page', heading: '正式工具主頁列印已封鎖' },
    '/seismic-appendage': { label: 'seismic appendage page', heading: '正式工具主頁列印已封鎖' },
    '/seismic-misc': { label: 'seismic miscellaneous page', heading: '正式工具主頁列印已封鎖' },
    '/stone-fixing': { label: 'stone fixing page', heading: '石材工具主頁列印已封鎖' },
  };
  const versionedHeadingRoutes = new Set([
    '/steel-formal', '/steel-plate', '/steel-beam-formal', '/steel-column-formal', '/anchor', '/decking',
    '/wind-overview', '/wind-kzt', '/wind-special', '/wind-force', '/wind-cc', '/wind-parapet', '/wind-open-roof',
    '/wind-object-solid', '/wind-object-frame', '/wind-lattice-tower', '/wind-object-tower', '/wind-fence-sign', '/wind-sign-pole',
    '/seismic-force', '/seismic-dynamic', '/seismic-appendage', '/seismic-misc', '/stone-fixing',
  ]);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${base}%E7%B5%90%E6%A7%8B%E5%B7%A5%E5%85%B7%E7%AE%B1/`, { waitUntil: 'networkidle' });
  const routeClaims = await page.evaluate(async () => {
    const response = await fetch('assets/home/home.js', { cache: 'no-store' });
    if (!response.ok) throw new Error(`home.js HTTP ${response.status}`);
    const source = await response.text();
    return [...source.matchAll(/\bversion:\s*['"]([^'"]+)['"][\s\S]*?\bhref:\s*['"](\/[^'"]+)['"]/g)]
      .map(match => ({ version: match[1], route: match[2] }));
  });
  const routes = routeClaims.map(claim => claim.route);
  const routeVersions = Object.fromEntries(routeClaims.map(claim => [claim.route, claim.version]));

  if (routes.length < 40 || new Set(routes).size !== routes.length) {
    throw new Error(`invalid homepage route inventory: total=${routes.length}, unique=${new Set(routes).size}`);
  }
  const homeRouteCount = routes.length;
  routes.push('/rc', '/toolbox-classic');
  routes.push('/audit-dashboard');

  const issues = [];
  const localArtifactPreview = /^http:\/\/127\.0\.0\.1:\d+\/$/.test(base);
  const ignoredUrl = value => {
    const url = String(value || '');
    if (url.includes('/favicon.ico')) return true;
    if (!localArtifactPreview) return false;
    return url === 'http://127.0.0.1:8765/status';
  };

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of routes) {
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      const failedResponses = [];
      const requests = [];
      const onConsole = message => {
        const location = message.location()?.url || '';
        if (message.type() === 'error' && !ignoredUrl(location) && !ignoredUrl(message.text())) {
          consoleErrors.push({ text: message.text(), location });
        }
      };
      const onPageError = error => pageErrors.push(error.message);
      const onRequest = request => requests.push(request.url());
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
      page.on('request', onRequest);
      page.on('requestfailed', onRequestFailed);
      page.on('response', onResponse);

      let navigationStatus = 0;
      let navigationError = '';
      const isDashboard = route === '/audit-dashboard';
      const overrideProbe = isDashboard && !localArtifactPreview ? '?audit_scope=local' : '';
      const targetUrl = isDashboard
        ? `${base}%E7%B5%90%E6%A7%8B%E5%B7%A5%E5%85%B7%E7%AE%B1/audit-dashboard.html${overrideProbe}`
        : `${base}${route.slice(1)}/`;
      try {
        const response = await page.goto(targetUrl, {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        navigationStatus = response?.status() || 0;
        if (isDashboard) {
          await page.waitForFunction(() => document.body?.dataset.auditScope === 'public' &&
            document.getElementById('loadedAt')?.textContent !== '尚未載入', null, { timeout: 30000 });
        }
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
          primaryHeading: ((routeName === '/stone-fixing'
            ? document.getElementById('tool-header')?.textContent
            : document.querySelector('h1')?.textContent) || '').replace(/\s+/g, ' ').trim(),
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
            : null,
          auditScope: document.body?.dataset.auditScope || '',
          dashboardTitles: [...document.querySelectorAll('.status-card .status-title')].map(node => node.textContent.trim()),
          dashboardBadges: [...document.querySelectorAll('.status-card .status-badge')].map(node => node.textContent.trim()),
          dashboardMeta: [...document.querySelectorAll('.status-card .status-meta')].map(node => node.textContent.replace(/\s+/g, ' ').trim()),
          dashboardPreviews: [...document.querySelectorAll('.summary-card pre')].map(node => node.textContent.trim()),
          publicReleaseHistory: (() => {
            const node = document.getElementById('publicReleaseHistoryWrap');
            return node ? {
              rowCount: node.querySelectorAll('tbody tr').length,
              text: node.textContent.replace(/\s+/g, ' ').trim(),
            } : null;
          })(),
          localDiagnosticSectionsVisible: [...document.querySelectorAll('.local-diagnostic-section')].filter(node => node.getClientRects().length > 0).map(node => node.id)
        };
      }, route);

      let directPrintBoundary = null;
      if (directPrintBoundaries[route]) {
        const config = directPrintBoundaries[route];
        const boundarySelector = config.selector || '.formal-direct-print-boundary';
        const boundaryBodyClass = config.bodyClass || 'formal-tool-output-page';
        const screenBoundary = await page.evaluate(({ selector, bodyClass }) => {
          const boundary = document.querySelector(selector);
          return {
            bodyClass: document.body.classList.contains(bodyClass),
            boundaryExists: Boolean(boundary),
            boundaryRects: boundary?.getClientRects().length || 0,
            stylesheetLoaded: [...document.styleSheets]
              .some(sheet => String(sheet.href || '').includes('direct-print-boundary.css')),
          };
        }, { selector: boundarySelector, bodyClass: boundaryBodyClass });
        await page.emulateMedia({ media: 'print' });
        const printBoundary = await page.evaluate(selector => {
          const boundary = document.querySelector(selector);
          return {
            boundaryRects: boundary?.getClientRects().length || 0,
            boundaryText: (boundary?.textContent || '').replace(/\s+/g, ' ').trim(),
            visibleOtherChildren: [...document.body.children]
              .filter(node => !node.matches(selector) && node.getClientRects().length > 0)
              .map(node => node.id || node.className || node.tagName),
          };
        }, boundarySelector);
        await page.emulateMedia({ media: 'screen' });
        directPrintBoundary = { screen: screenBoundary, print: printBoundary };
      }

      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('request', onRequest);
      page.off('requestfailed', onRequestFailed);
      page.off('response', onResponse);

      const routeIssues = [];
      if (navigationError) routeIssues.push(`navigation: ${navigationError}`);
      if (navigationStatus >= 400 || navigationStatus === 0) routeIssues.push(`navigation HTTP ${navigationStatus}`);
      if (!page.url().startsWith(base)) routeIssues.push(`left deployment origin: ${page.url()}`);
      if (!state.title || state.title === '正在開啟結構工具') routeIssues.push(`invalid title: ${state.title}`);
      if (versionedHeadingRoutes.has(route) && !state.primaryHeading.includes(routeVersions[route] || '')) {
        routeIssues.push(`primary heading does not expose canonical version ${routeVersions[route]}: ${state.primaryHeading}`);
      }
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
      if (directPrintBoundaries[route]) {
        const config = directPrintBoundaries[route];
        const screenBoundary = directPrintBoundary?.screen;
        const printBoundary = directPrintBoundary?.print;
        if (!screenBoundary?.bodyClass || !screenBoundary?.boundaryExists || screenBoundary.boundaryRects !== 0 || !screenBoundary.stylesheetLoaded) {
          routeIssues.push(`${config.label} screen print-boundary invalid: ${JSON.stringify(screenBoundary)}`);
        }
        if (!printBoundary || printBoundary.boundaryRects <= 0 || printBoundary.visibleOtherChildren.length ||
          !printBoundary.boundaryText.includes(config.heading) || !printBoundary.boundaryText.includes('本頁不得作為附件')) {
          routeIssues.push(`${config.label} print boundary invalid: ${JSON.stringify(printBoundary)}`);
        }
      }
      if (isDashboard) {
        const privateOutputRequests = requests.filter(value => {
          try { return decodeURIComponent(value).includes('/output/'); } catch { return value.includes('/output/'); }
        });
        if (state.auditScope !== 'public') routeIssues.push(`invalid audit scope: ${state.auditScope}`);
        const expectedTitles = ['正式 release 總覽', '鋼構正式附件證據', 'RC 正式附件證據', '風震與跨家族交付證據'];
        if (JSON.stringify(state.dashboardTitles) !== JSON.stringify(expectedTitles)) routeIssues.push(`invalid public evidence titles: ${JSON.stringify(state.dashboardTitles)}`);
        if (state.dashboardBadges.length !== 4 || state.dashboardBadges.some(value => value !== '公開證據完整')) routeIssues.push(`incomplete public evidence badges: ${JSON.stringify(state.dashboardBadges)}`);
        const completeCount = (meta, label) => {
          const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const match = String(meta || '').match(new RegExp(`${escapedLabel}｜(\\d+) \\/ (\\d+)`));
          return Boolean(match) && Number(match[1]) > 0 && match[1] === match[2];
        };
        const requiredMeta = [
          [0, '正式檢查'],
          [1, '結果鏈'],
          [2, '獨立列印'],
          [3, '檔案完整性'],
        ];
        if (requiredMeta.some(([index, label]) => !completeCount(state.dashboardMeta[index], label))) routeIssues.push(`invalid public evidence counts: ${JSON.stringify(state.dashboardMeta)}`);
        if (state.dashboardPreviews.length !== 4 || state.dashboardPreviews.some(value => !value.includes('僅限本機工作區'))) routeIssues.push(`invalid public evidence privacy boundaries: ${JSON.stringify(state.dashboardPreviews)}`);
        if (!state.publicReleaseHistory || state.publicReleaseHistory.rowCount < 1 || !state.publicReleaseHistory.text.includes('正式門檻') || !state.publicReleaseHistory.text.includes('受測來源') || !/(基準|門檻維持|門檻提升|範圍縮減|增減並存)/.test(state.publicReleaseHistory.text)) routeIssues.push(`invalid public release history: ${JSON.stringify(state.publicReleaseHistory)}`);
        if (/C:\\|Users\\|output\/preflight\/history|sourcePath|sourceHash/i.test(state.publicReleaseHistory?.text || '')) routeIssues.push('public release history leaks private implementation details');
        if (state.localDiagnosticSectionsVisible.length) routeIssues.push(`local diagnostic sections remain visible: ${JSON.stringify(state.localDiagnosticSectionsVisible)}`);
        if (privateOutputRequests.length) routeIssues.push(`private output requests: ${JSON.stringify(privateOutputRequests)}`);
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
    routes: homeRouteCount,
    viewports: viewports.map(viewport => viewport.key),
    checks: routes.length * viewports.length,
    issues: 0
  };
}
