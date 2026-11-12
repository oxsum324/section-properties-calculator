(() => {
  const repository = 'oxsum324/section-properties-calculator';
  const ref = 'refs/heads/master';
  const mainUrl = 'https://api.github.com/repos/' + repository + '/git/ref/heads/master';
  const manifestUrl = 'https://oxsum324.github.io/section-properties-calculator/pages-deployment.json';
  const state = document.getElementById('publicationState');
  const refresh = document.getElementById('refreshPublicationStatus');
  const compare = document.getElementById('publicationCompare');
  const shaPattern = /^[a-f0-9]{40}$/i;

  async function commitFrom(url, source, timestamp) {
    const response = await fetch(url + '?check=' + timestamp, {
      cache:'no-store', credentials:'omit', signal:AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    let sha;
    if (source === 'master' && data.ref === ref && data.object?.type === 'commit') sha = data.object.sha;
    if (source === 'Pages' && data.kind === 'pages-deployment' && data.sourceRef === ref && data.sourceDirty === false) sha = data.commitSha;
    if (typeof sha !== 'string' || !shaPattern.test(sha)) throw new Error('來源或提交識別無法確認');
    return sha.toLowerCase();
  }

  async function check() {
    if (refresh.disabled) return;
    refresh.disabled = true;
    compare.hidden = true;
    const stamp = Date.now();
    const badge = state.querySelector('span');
    const detail = state.querySelector('p');
    badge.className = 'status-card__badge neutral';
    badge.textContent = '查詢中';
    detail.textContent = '讀取 GitHub master 與 Pages 部署清單。';
    try {
      const [main, live] = await Promise.allSettled([
        commitFrom(mainUrl, 'master', stamp), commitFrom(manifestUrl, 'Pages', stamp),
      ]);
      const known = main.status === 'fulfilled' && live.status === 'fulfilled';
      const same = known && main.value === live.value;
      if (known && !same) {
        compare.href = 'https://github.com/' + repository + '/compare/' + live.value + '...' + main.value;
        compare.hidden = false;
      }
      badge.textContent = known ? (same ? '版本一致' : '主線與公開站版本不一致') : '無法核對';
      badge.className = 'status-card__badge ' + (known ? (same ? 'ok' : 'warn') : 'neutral');
      const describe = r => r.status === 'fulfilled' ? r.value.slice(0,12) : (r.reason?.message || '讀取失敗');
      detail.textContent = `master　${describe(main)} ｜ Pages　${describe(live)} ｜ 核對於 ${new Date(stamp).toLocaleString('zh-TW',{hour12:false})}`;
    } finally {
      refresh.disabled = false;
    }
  }
  refresh.addEventListener('click', check);
  check();
})();
