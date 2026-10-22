(() => {
  'use strict';
  // 結構工具箱共用導覽頂欄（由 build-tool-chrome.js 以 Terser 產生根目錄 tool-chrome.js）。
  // 清冊資料由同目錄 tool-nav.manifest.js 提供（window.STRUCT_TOOL_NAV，先於本檔載入）。
  // 工具頁 <body> 之後有靜態占位 <div data-tool-chrome-slot>（高度由根目錄 tool-chrome.css 保留），本檔把固定 44px 高的 nav 渲染進占位，
  // 不插入新節點、不改變既有版面高度（CLS 貢獻 0）；找不到占位才退回插在 body 第一子節點。
  // 不碰計算、不碰計算書；計算書由字串建構，頂欄節點永不進入正式輸出，列印時亦整段隱藏。
  const manifest = window.STRUCT_TOOL_NAV;
  const SLOT_SELECTOR = '[data-tool-chrome-slot]';
  const HOME_LABEL = '結構工具箱';
  const NAV_HEIGHT = 44;
  const STYLE_ATTRIBUTE = 'data-tool-chrome-style';
  const CSS = [
    `.tool-chrome{box-sizing:border-box;display:flex;flex-wrap:nowrap;align-items:center;gap:10px;height:${NAV_HEIGHT}px;margin:0;padding:0 16px;overflow:visible;background:var(--hy-navy,#002060);color:var(--fg-on-navy,#fff);font-family:var(--font-ui,"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif);font-size:13px;line-height:1.5;text-align:left}`,
    '.tool-chrome__crumbs{display:flex;flex:1 1 auto;align-items:center;gap:8px;min-width:0;max-height:100%;white-space:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}',
    '.tool-chrome__crumbs::-webkit-scrollbar{display:none}',
    '.tool-chrome a{color:inherit;text-decoration:underline;text-decoration-color:var(--hy-navy-300,#9aa9cb);text-underline-offset:3px}',
    '.tool-chrome a:hover{text-decoration-color:currentColor}',
    '.tool-chrome a:focus-visible,.tool-chrome summary:focus-visible{outline:2px solid var(--hy-paper,#fff);outline-offset:-2px}',
    '.tool-chrome__home,.tool-chrome__family{flex:none}',
    '.tool-chrome__sep{flex:none;color:var(--fg-on-navy-muted,rgba(255,255,255,.72))}',
    '.tool-chrome__current{flex:0 1 auto;min-width:0;max-width:60vw;overflow:hidden;text-overflow:ellipsis;font-weight:600}',
    '.tool-chrome__siblings{position:relative;flex:none;margin-left:auto}',
    '.tool-chrome__siblings summary{cursor:pointer;list-style:none;padding:2px 10px;border:1px solid var(--hy-navy-300,#9aa9cb);border-radius:4px;white-space:nowrap}',
    '.tool-chrome__siblings summary::-webkit-details-marker{display:none}',
    '.tool-chrome__siblings summary::after{content:" \\25BE"}',
    '.tool-chrome__siblings[open] summary::after{content:" \\25B4"}',
    '.tool-chrome__siblings ul{position:absolute;right:0;top:100%;z-index:60;margin:4px 0 0;padding:6px 0;list-style:none;min-width:240px;max-height:60vh;overflow:auto;background:var(--hy-paper,#fff);color:var(--hy-ink,#111316);border:1px solid var(--hy-slate-300,#d4d7dc);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.18)}',
    '.tool-chrome__siblings li{margin:0;padding:0}',
    '.tool-chrome__siblings li a,.tool-chrome__siblings li span{display:block;padding:4px 12px;color:inherit;text-decoration:none;white-space:nowrap}',
    '.tool-chrome__siblings li a:hover,.tool-chrome__siblings li a:focus-visible{background:var(--hy-navy-50,#f3f5fa);text-decoration:underline;outline:none}',
    '.tool-chrome__siblings li [aria-current="page"]{font-weight:600;color:var(--hy-navy,#002060);background:var(--hy-navy-100,#e6eaf3)}',
    '.tool-chrome__sibling-version{margin-left:6px;font-size:12px;color:var(--hy-slate-500,#6b7280)}',
    '.tool-chrome__meta{display:inline-flex;flex:none;gap:6px;align-items:center}',
    '.tool-chrome__version,.tool-chrome__state{padding:1px 7px;border-radius:3px;background:rgba(255,255,255,.14);font-size:12px;white-space:nowrap}',
    '@media (max-width:480px){.tool-chrome{gap:6px;padding:0 10px}.tool-chrome__current{max-width:40vw}.tool-chrome__siblings summary{padding:2px 6px}.tool-chrome__state{display:none}}',
    '@media print{.page-only-tool-chrome{display:none !important}}',
  ].join('\n');

  function decodePath(value) {
    try { return decodeURIComponent(value); } catch (error) { return value; }
  }

  function currentScriptElement() {
    const current = document.currentScript;
    if (current && current.src) return current;
    return Array.from(document.scripts).find(script => /(?:^|\/)tool-chrome\.js(?:\?|$)/.test(script.src || '')) || null;
  }

  // 以腳本位址推得 repo 根目錄，再把本頁路徑換成 repo 相對路徑比對清冊；找不到即靜默。
  function locateTool() {
    if (!manifest || !Array.isArray(manifest.tools) || !Array.isArray(manifest.families)) return null;
    const script = currentScriptElement();
    if (!script) return null;
    let rootPath;
    try { rootPath = decodePath(new URL('.', script.src).pathname); } catch (error) { return null; }
    const pagePath = decodePath(window.location.pathname);
    const relative = pagePath.startsWith(rootPath) ? pagePath.slice(rootPath.length) : '';
    const exact = relative && manifest.tools.find(tool => tool.file === relative);
    if (exact) return exact;
    const bySuffix = manifest.tools
      .filter(tool => pagePath.endsWith(`/${tool.file}`))
      .sort((left, right) => right.file.length - left.file.length)[0];
    if (bySuffix) return bySuffix;
    // 本機 serve-local 與 vercel rewrite 會把 /section 這類路由直接改寫成檔案，路徑不含檔名時以路由比對。
    if (relative && !relative.includes('/')) return manifest.tools.find(tool => tool.route === `/${relative}`) || null;
    return null;
  }

  // 清冊存 repo 根目錄相對路徑；此處換算成相對於目前頁面的連結，file: 與 Pages 子目錄皆可用。
  function relativeHref(fromFile, target) {
    const queryIndex = target.search(/[?#]/);
    const targetPath = queryIndex >= 0 ? target.slice(0, queryIndex) : target;
    const suffix = queryIndex >= 0 ? target.slice(queryIndex) : '';
    const fromDirectory = fromFile.split('/').slice(0, -1);
    const toSegments = targetPath.split('/');
    let shared = 0;
    while (shared < fromDirectory.length && shared < toSegments.length - 1 && fromDirectory[shared] === toSegments[shared]) shared += 1;
    const segments = [];
    for (let index = shared; index < fromDirectory.length; index += 1) segments.push('..');
    segments.push(...toSegments.slice(shared));
    return `${segments.join('/') || targetPath}${suffix}`;
  }

  function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function separator() {
    const node = element('span', 'tool-chrome__sep', '›');
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  function buildNav(tool) {
    const family = manifest.families.find(item => item.id === tool.family);
    const nav = element('nav', 'tool-chrome page-only-tool-chrome');
    nav.setAttribute('aria-label', '工具箱導覽');
    nav.setAttribute('data-tool-chrome', '');
    nav.setAttribute('data-tool-route', tool.route);
    nav.setAttribute('data-tool-family', tool.family);

    const crumbs = element('div', 'tool-chrome__crumbs');
    const home = element('a', 'tool-chrome__home', HOME_LABEL);
    home.href = relativeHref(tool.file, manifest.home);
    crumbs.append(home, separator());
    if (family) {
      const familyLink = element('a', 'tool-chrome__family', family.label);
      familyLink.href = relativeHref(tool.file, family.file);
      crumbs.append(familyLink, separator());
    }
    const current = element('span', 'tool-chrome__current', tool.title);
    current.setAttribute('aria-current', 'page');
    current.title = tool.title;
    crumbs.appendChild(current);
    nav.appendChild(crumbs);

    const siblings = manifest.tools.filter(item => item.family === tool.family);
    if (siblings.length > 1) {
      const details = element('details', 'tool-chrome__siblings');
      const summary = element('summary', '', `同家族工具（${siblings.length}）`);
      const list = element('ul');
      siblings.forEach(item => {
        const row = element('li');
        if (item === tool) {
          const self = element('span', 'tool-chrome__sibling', item.title);
          self.setAttribute('aria-current', 'page');
          row.appendChild(self);
        } else {
          const link = element('a', 'tool-chrome__sibling', item.title);
          link.href = relativeHref(tool.file, item.file);
          link.setAttribute('data-tool-route', item.route);
          link.appendChild(element('span', 'tool-chrome__sibling-version', item.version));
          row.appendChild(link);
        }
        list.appendChild(row);
      });
      details.append(summary, list);
      nav.appendChild(details);
    }

    const meta = element('span', 'tool-chrome__meta');
    meta.append(element('span', 'tool-chrome__version', tool.version), element('span', 'tool-chrome__state', tool.stateLabel));
    nav.appendChild(meta);
    return nav;
  }

  function installStyle() {
    if (document.head.querySelector(`style[${STYLE_ATTRIBUTE}]`)) return;
    const style = element('style');
    style.setAttribute(STYLE_ATTRIBUTE, '');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function install() {
    const body = document.body;
    if (!body || body.querySelector('[data-tool-chrome]')) return;
    const slot = body.querySelector(SLOT_SELECTOR);
    const tool = locateTool();
    if (!tool) {
      // 錯誤路徑：本頁不在清冊或清冊未載入，釋放占位高度（允許此時的版面位移）。
      if (slot) slot.setAttribute('data-tool-chrome-empty', '');
      return;
    }
    if (!body.hasAttribute('data-family')) body.setAttribute('data-family', tool.family);
    installStyle();
    const nav = buildNav(tool);
    if (slot) slot.replaceChildren(nav);
    else body.insertBefore(nav, body.firstChild);
    document.addEventListener('click', event => {
      const open = body.querySelector('.tool-chrome__siblings[open]');
      if (open && !open.contains(event.target)) open.removeAttribute('open');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
