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

  function readRcSlab() {
    const r = window.slabLast;
    if (!r) return null;
    const checks = r.flexRows.map(row => strength(ratio(row.Mu, row.phiMn), row.loc, 'flexTable'));
    checks.push(strength(ratio(r.VuX, r.shearX.phiVn), '短向剪力', 'c-vn1X'));
    if (r.shearY) checks.push(strength(ratio(r.VuY, r.shearY.phiVn), '長向剪力', 'c-vn1Y'));
    const punch = r.punchData;
    if (punch) {
      const value = punch.usesSectionLoads
        ? ratio(punch.sectionCheck?.maximumStress, punch.sectionCheck?.phiVc)
        : ratio(punch.VuPunch, punch.phiVnPunch);
      checks.push(strength(value, '雙向衝剪', 'shearTitle'));
    }
    return { spec: 'RC 板 厚 ' + r.h + ' cm', check: maximum(checks) };
  }

  function readRcWall() {
    const r = window.wallLast;
    if (!r) return null;
    return {
      spec: 'RC 牆 ' + r.lw + ' × ' + r.h + ' cm',
      check: maximum([
        strength(r.pmUtil, '面內 P-M', 'c-axial'),
        strength(ratio(r.Vu, r.phiVn), '面內剪力', 'c-shear'),
        strength(ratio(r.Mua_total_kgcm, r.phiMn_oop_kgcm), '面外撓曲', 'c-oopFlex')
      ])
    };
  }

  function readRcShearWall() {
    const r = window.swLast;
    if (!r) return null;
    const checks = [
      strength(r.pmUtil, 'P-M 封包', 'c-pmEnv'),
      strength(r.shearUtil, '面內剪力', 'c-shear')
    ];
    if (r.loadCasesActive) {
      for (const item of r.loadCases || []) {
        checks.push(strength(item.pmUtil, 'P-M 封包 ' + item.name, 'c-pmEnv'));
        checks.push(strength(item.shearUtil, '面內剪力 ' + item.name, 'c-shear'));
      }
    }
    return { spec: 'RC 剪力牆 ' + r.lw + ' × ' + r.tw + ' cm', check: maximum(checks) };
  }

  function readRcFoundation() {
    const r = window.ftLast;
    if (!r) return null;
    const item = (demand, capacity, name, target) => strength(ratio(demand, capacity), name, target);
    let spec, checks;
    switch (r.tab) {
      case 'iso':
        spec = '獨立基腳 ' + r.B + ' × ' + r.L + ' × ' + r.hf + ' cm';
        checks = [
          item(r.Mux_tfm, r.phiMnX_tfm, 'X 向彎矩', 'c-flex'),
          item(r.Muy_tfm, r.phiMnY_tfm, 'Y 向彎矩', 'c-flex'),
          item(r.Vu1, r.phiVc1, '單向剪力', 'c-v1'),
          item(r.punchingReview ? null : r.Vu2, r.phiVc2, '雙向衝剪', 'c-v2')
        ];
        break;
      case 'combined':
        spec = '聯合基腳 ' + r.B + ' × ' + r.L + ' × ' + r.hf + ' cm';
        checks = [
          item(r.Mu_tfm, r.phiMn_tfm, '撓曲', 'cc-flex'),
          item(r.Vu1, r.phiVc1, '單向剪力', 'cc-v1'),
          item(r.Vu2, r.phiVc2, '雙向衝剪', 'cc-v2')
        ];
        break;
      case 'mat':
        spec = '筏式基礎 ' + r.B + ' × ' + r.L + ' × ' + r.hf + ' cm';
        checks = [
          strength(r.controlFlex?.ratio, '撓曲', 'mc-flex'),
          item(r.Vu1_tf, r.phiVc1_tf, '單向剪力', 'mc-v1'),
          item(r.Vu2_tf, r.phiVc2_tf, '雙向衝剪', 'mc-v2')
        ];
        break;
      case 'pile':
        spec = '樁帽 ' + r.Bc + ' × ' + r.Lc + ' × ' + r.hc + ' cm，' + r.nPile + ' 支 Ø' + r.pileD + ' cm';
        checks = [
          item(r.serviceRmax, Math.min(r.QaEff, r.Qall * r.pileEta), '樁壓力', 'pc-R'),
          item(Math.max(0, -r.serviceRmin), r.pileQt, '樁拉力', 'pc-T'),
          item(r.Vu2_tf, r.phiVc2, '雙向衝剪', 'pc-v2'),
          item(r.capMu_tfm, r.capPhiMn_tfm, '樁帽撓曲', 'pc-capFlex'),
          item(r.capVuLongTf, r.capPhiVcLongTf, '樁帽長向剪力', 'pc-capShear'),
          item(r.capVuTransTf, r.capPhiVcTransTf, '樁帽短向剪力', 'pc-capShear')
        ];
        break;
      case 'retain':
        spec = '擋土牆 牆高 ' + r.Hw + ' cm，牆厚 ' + r.tw + ' cm';
        checks = [
          item(r.Mu_wall_tfm, r.phiMn_wall_tfm, '牆身撓曲', 'rc-flex'),
          item(r.Vu_stem, r.phiVc_wall_tfm, '牆身剪力', 'rc-shear'),
          item(r.baseDemand?.toe?.moment, r.toePhiMn, '牆趾撓曲', 'rc-toe-flex'),
          item(r.baseDemand?.toe?.shear, r.toePhiVc, '牆趾剪力', 'rc-toe-shear'),
          item(r.baseDemand?.heel?.moment, r.heelPhiMn, '牆踵撓曲', 'rc-heel-flex'),
          item(r.baseDemand?.heel?.shear, r.heelPhiVc, '牆踵剪力', 'rc-heel-shear')
        ];
        break;
      case 'seismic':
        if (!r.seismic) return null;
        spec = 'RC 基礎耐震檢核';
        checks = [
          item(r.intReq, r.Asv, '接合面鋼筋', 'sc-interface'),
          item(r.ld_seismic, r.ldAvail, '主筋錨定長度', 'sc-ld')
        ];
        break;
      default:
        return null;
    }
    return { spec, ratioLabel: '最大需求容量比', check: maximum(checks) };
  }

  function readSrcMember(member) {
    const checks = [];
    for (const card of byId('metricGrid').querySelectorAll('.src-metric')) {
      const name = card.querySelector('span')?.textContent.trim();
      const value = card.querySelector('strong')?.textContent.trim();
      if (!name || !/(需求比|控制比)/.test(name) || name === '控制需求比') continue;
      const percentage = value?.match(/([\d.]+)\s*%/);
      const measure = value?.includes('∞') ? Infinity : percentage ? Number(percentage[1]) / 100 : null;
      checks.push(strength(measure, name.split('需求比')[0], 'checkList'));
    }
    const isBeam = member === 'beam';
    const dimensions = isBeam ? ['bCm', 'hCm'] : ['widthCm', 'depthCm'];
    return {
      spec: 'SRC ' + (isBeam ? '梁 ' : '柱 ') + dimensions.map(id => byId(id).value).join(' × ') + ' cm',
      conclusion: byId('resultHeadline').textContent.trim(),
      check: maximum(checks)
    };
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
    'rc-slab': ['#bannerStatus', '.card', readRcSlab],
    'rc-wall': ['#bannerStatus', '#conclusionCard', readRcWall],
    'rc-shear-wall': ['#bannerStatus', '#conclusionCard', readRcShearWall],
    'rc-foundation': ['#bannerStatus', '#conclusionCard', readRcFoundation],
    'src-beam': ['#resultBadge', '.src-result-card', () => readSrcMember('beam')],
    'src-column': ['#resultBadge', '.src-result-card', () => readSrcMember('column')],
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
  const rcTabbed = ['rc-beam', 'rc-column', 'rc-wall', 'rc-shear-wall'].includes(page);
  let snapshot = null;
  let frame = 0;
  let copyTimer;

  function render() {
    frame = 0;
    const belowSummary = summary.getClientRects().length > 0 && summary.getBoundingClientRect().bottom <= 0;
    const current = !query('[data-hy-workflow][data-state="pending"]');
    const hasOverallResult = !rcTabbed || Boolean(query(activeRcSummary));
    const tone = banner.classList.contains('ng') ? 'fail'
      : banner.classList.contains('review') ? 'warn'
        : Object.keys(verdicts).find(value => banner.classList.contains(value));
    snapshot = belowSummary && current && hasOverallResult && tone ? read() : null;
    row.hidden = !snapshot?.check;
    if (row.hidden) return;
    const { check } = snapshot;
    const value = check.ratio === Infinity ? '∞' : Number.isFinite(check.ratio) ? check.ratio.toFixed(3) : '—';
    const verdict = verdicts[tone];
    badge.textContent = verdict;
    badge.dataset.tone = tone;
    dcr.textContent = `DCR ${value}`;
    const ratioLabel = snapshot.ratioLabel || '最大強度需求容量比';
    dcr.title = ratioLabel;
    label.textContent = check.label;
    label.title = check.label;
    const conclusion = snapshot.conclusion || banner.firstChild?.textContent.trim() || banner.textContent.trim();
    snapshot.copyText = `${snapshot.spec}\n控制檢核項：${check.label}\n${ratioLabel} DCR：${value}\n總判定：${verdict}｜${conclusion}`;
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
    if (!target.getClientRects().length) {
      target.closest('.mobile-fold.mobile-collapsed')?.querySelector(':scope > h2')?.click();
    }
    if (!target.getClientRects().length) return;
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
