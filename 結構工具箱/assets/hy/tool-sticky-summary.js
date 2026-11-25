(() => {
  'use strict';

  const page = document.currentScript?.dataset.stickySummary;
  const query = selector => document.querySelector(selector);
  const byId = id => document.getElementById(id);
  const ratio = (demand, capacity) => {
    if (demand === Infinity || (demand > 0 && capacity === 0)) return Infinity;
    if (!Number.isFinite(demand) || !Number.isFinite(capacity) || capacity < 0) return null;
    return demand <= 0 ? 0 : demand / capacity;
  };
  const strength = (value, label, target) => ({ ratio: value, label, target });
  const maximum = checks => checks.reduce((best, check) => {
    const valid = Number.isFinite(check.ratio) || check.ratio === Infinity;
    return valid && (!best || check.ratio > best.ratio) ? check : best;
  }, null);

  function readRcBeam() {
    const result = window.beamLast;
    if (!result || result.methodApplicable === false) return null;
    const { sectionType, bw, h, actualBf, hf } = result;
    const shape = byId('sectionType').querySelector(`option[value="${sectionType}"]`)?.textContent;
    const flange = sectionType === 'rect' ? '' : `，翼板 ${actualBf} × ${hf} cm`;
    return {
      spec: `RC 梁 ${shape || ''} ${bw} × ${h} cm${flange}`,
      check: maximum([
        strength(ratio(result.MuPos_in, result.phiMnPos), '正彎矩', 'c-flexPos'),
        strength(ratio(result.MuNeg_in, result.phiMnNeg), '負彎矩', 'c-flexNeg'),
        strength(ratio(result.shearDemand, result.phiVn_kgf), '剪力', 'c-shear')
      ])
    };
  }

  function readRcColumn() {
    const result = window.colLast;
    if (!result) return null;
    const shape = result.colType === 'rect' ? `${result.b} × ${result.h}` : `Ø${result.b}`;
    const checks = [
      strength(ratio(result.Pu, result.phiPnMax), '軸壓', 'c-pmEnv'),
      strength(ratio(result.Mc, result.phiMnAtPu), '主軸 P-M 互制', 'c-pmEnv'),
      strength(ratio(result.designVxTf ?? result.Vu, result.phiVn), 'X 向剪力', 'c-shear'),
      strength(ratio(result.designVyTf ?? result.Vuy, result.phiVnY), 'Y 向剪力', 'c-shear')
    ];
    if (Math.abs(result.Mcy) > 1e-9) {
      checks.push(strength(result.biaxialSurfaceRatio, '雙向 P-Mx-My 互制', 'c-biaxial'));
    }
    return { spec: `RC 柱 ${shape} cm`, check: maximum(checks) };
  }

  function steelSection() {
    const shape = byId('sectionTypeSelect').value;
    const dimensions = {
      h: ['H', ['inH', 'inB', 'inTw', 'inTf']],
      shs: ['SHS', ['inShsB', 'inShsT']],
      rhs: ['RHS', ['inRhsH', 'inRhsB', 'inRhsT']],
      chs: ['CHS', ['inChsD', 'inChsT']]
    }[shape];
    if (!dimensions) return byId('sectionTypeSelect').selectedOptions[0]?.textContent.trim() || '';
    const [label, ids] = dimensions;
    return `${label} ${ids.map(id => byId(id).value).join(' × ')} mm`;
  }

  function readSteelMember(member) {
    const cards = byId(`${member}SummaryGrid`).querySelectorAll('.member-summary-card');
    const isBeam = member === 'beam';
    const fields = isBeam ? {
      '彎矩需求比': ['彎矩', 'flexResult'],
      '剪力需求比': ['剪力', 'shearResult']
    } : {
      '軸力需求比': ['軸力', 'axialResult'],
      '互制需求比': ['軸力與彎矩互制', 'interResult']
    };
    const checks = [];
    for (const card of cards) {
      const field = fields[card.querySelector('.label')?.textContent.trim()];
      const percent = card.querySelector('.value')?.textContent.match(/([\d.]+)\s*%/);
      if (field && percent) checks.push(strength(Number(percent[1]) / 100, ...field));
    }
    return { spec: `${isBeam ? '鋼梁' : '鋼柱'} ${steelSection()}`, check: maximum(checks) };
  }

  function readSteelConnection() {
    const result = window.latestSteelConnectionResult;
    if (!result?.governing) return null;
    const { state, governing, reportTitle } = result;
    const thickness = {
      single_plate: state.plateThickness,
      plate_check: state.plateThickness,
      brace_gusset: state.gussetThickness,
      tension_member: state.memberThickness,
      beam_column_moment: state.momentPlateThickness,
      column_splice: state.spliceMaxThickness
    }[state.connectionType];
    const spec = [reportTitle, state.connectionTag, thickness > 0 && `厚度 ${thickness} mm`].filter(Boolean).join('，');
    const value = typeof governing.ratio === 'number' ? governing.ratio : null;
    return { spec, check: strength(value, governing.label || '控制檢核', 'jumpToGoverningBtn') };
  }

  const configs = {
    'rc-beam': ['#bannerStatus', '#conclusionCard', readRcBeam],
    'rc-column': ['#bannerStatus', '#conclusionCard', readRcColumn],
    'steel-beam': ['#beamSummaryBanner', '.report-summary', () => readSteelMember('beam')],
    'steel-column': ['#columnSummaryBanner', '.report-summary', () => readSteelMember('column')],
    'steel-connection': ['#reportBanner', '.report-summary', readSteelConnection]
  };
  const config = configs[page];
  if (!config) return;

  const [bannerSelector, summarySelector, read] = config;
  const banner = query(bannerSelector);
  const summary = banner?.closest(summarySelector);
  if (!summary) return;

  const shell = document.createElement('aside');
  shell.id = 'tool-sticky-summary';
  shell.className = 'tool-sticky-summary no-print';
  shell.dataset.pageOnly = 'true';
  shell.setAttribute('aria-label', '構件檢核摘要');
  shell.innerHTML = `
    <div class="tool-sticky-summary__row" hidden>
      <span class="tool-sticky-summary__badge"></span>
      <span class="tool-sticky-summary__ratio"></span>
      <span class="tool-sticky-summary__check"></span>
      <button type="button" data-sticky-jump>跳至檢核表</button>
      <button type="button" data-sticky-copy aria-live="polite">複製摘要</button>
    </div>`;
  document.body.prepend(shell);

  const row = shell.firstElementChild;
  const [badge, dcr, label, jump, copy] = row.children;
  const verdicts = { ok: 'OK', fail: 'NG', warn: '待複核' };
  const activeRcSummary = '.section-tabs [data-tab="summary"].active';
  let snapshot = null;
  let frame = 0;
  let copyTimer;

  function render() {
    frame = 0;
    const belowSummary = summary.getClientRects().length > 0 && summary.getBoundingClientRect().bottom <= 0;
    const current = !query('[data-hy-workflow][data-state="pending"]');
    const hasOverallResult = !page.startsWith('rc-') || Boolean(query(activeRcSummary));
    const tone = Object.keys(verdicts).find(value => banner.classList.contains(value));
    snapshot = belowSummary && current && hasOverallResult && tone ? read() : null;
    row.hidden = !snapshot?.check;
    if (row.hidden) return;
    const { check } = snapshot;
    const value = check.ratio === Infinity ? '∞' : Number.isFinite(check.ratio) ? check.ratio.toFixed(3) : '—';
    const verdict = verdicts[tone];
    badge.textContent = verdict;
    badge.dataset.tone = tone;
    dcr.textContent = `DCR ${value}`;
    dcr.title = '最大強度需求容量比';
    label.textContent = check.label;
    label.title = check.label;
    const conclusion = banner.firstChild?.textContent.trim() || banner.textContent.trim();
    snapshot.copyText = `${snapshot.spec}\n控制檢核項：${check.label}\n最大強度 DCR：${value}\n總判定：${verdict}｜${conclusion}`;
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  jump.addEventListener('click', () => {
    const target = byId(snapshot?.check?.target);
    if (!target) return;
    if (target instanceof HTMLButtonElement) {
      target.click();
      return;
    }
    target.closest('details:not([open])')?.setAttribute('open', '');
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center' });
  });

  copy.addEventListener('click', async () => {
    if (!snapshot?.copyText) return;
    clearTimeout(copyTimer);
    try {
      await navigator.clipboard.writeText(snapshot.copyText);
      copy.textContent = '已複製';
    } catch {
      copy.textContent = '複製失敗';
    }
    copyTimer = setTimeout(() => { copy.textContent = '複製摘要'; }, 1500);
  });

  const observer = new MutationObserver(schedule);
  observer.observe(summary, { attributes: true, childList: true, subtree: true, characterData: true });
  const workflow = query('[data-hy-workflow]');
  if (workflow) observer.observe(workflow, { attributes: true, attributeFilter: ['data-state'] });
  document.addEventListener('click', schedule);
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  window.addEventListener('resize', schedule);
  schedule();
})();
