/* RC 主頁共用 UI：保留各頁顯示、訊息與重新計算邊界。
 * page 選擇既有頁面規則；計算、人工複核與頁面模式由呼叫端提供。
 * 可讀來源不為體積門檻改寫。公開執行期由固定建置器產生。
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RcPageUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function commonHelpers(page, options) {
    const document = options.document || root.document;
    const $ = id => document.getElementById(id);
    function num(id) {
      if (page === 'foundation') {
        const value = parseFloat($(id)?.value);
        return isNaN(value) ? 0 : value;
      }
      const element = $(id);
      return parseFloat(['beam', 'column', 'wall'].includes(page) ? element.value : element?.value) || 0;
    }
    function setResult(id, val, unit, digits = 2, status = null) {
      const element = $(id);
      if (!element) return;
      element.classList.remove('rc-pending');
      const value = element.querySelector('.value');
      const unitNode = element.querySelector('.unit');
      if (page === 'shear-wall') {
        if (value) value.textContent = (val == null || (typeof val === 'number' && isNaN(val)))
          ? '—' : (typeof val === 'number' ? Number(val).toFixed(digits) : val);
      } else {
        value.textContent = (val == null || isNaN(val) || (page === 'slab' && !isFinite(val)))
          ? '—' : Number(val).toFixed(digits);
      }
      if (unitNode && unit !== undefined) unitNode.textContent = unit;
      element.classList.remove('ok', 'warn', 'fail');
      if (status) element.classList.add(status);
    }
    function setCheck(id, pass, text) {
      const element = $(id);
      if (!element) return;
      element.classList.remove('rc-pending');
      const value = element.querySelector('.value');
      const fallback = page === 'slab'
        ? (pass === true ? '✓ OK' : pass === false ? '✗ NG' : '—')
        : (pass ? '✓ OK' : '✗ NG');
      if (value || page !== 'shear-wall') value.textContent = text || fallback;
      element.classList.remove('ok', 'warn', 'fail');
      element.classList.add(pass === true ? 'ok' : pass === false ? 'fail' : 'warn');
    }
    function markAllResultsPending() {
      document.querySelectorAll('.result-item').forEach(element => element.classList.add('rc-pending'));
    }
    function syncDetailHelp() {
      document.body.classList.toggle('show-detail-help', !!$('showDetailHelp')?.checked);
    }
    function syncAdvancedCaseTools() {
      const panel = $('advancedCaseCard');
      if (panel) panel.classList.toggle('active', !!$('showCaseTools')?.checked);
    }
    function svgToDataURL(svg) {
      if (!svg) return '';
      const clone = svg.cloneNode(true);
      if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const Serializer = options.XMLSerializer || root.XMLSerializer;
      const serialized = new Serializer().serializeToString(clone);
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized);
    }
    return { num, setResult, setCheck, markAllResultsPending, syncDetailHelp, syncAdvancedCaseTools, svgToDataURL };
  }

  // beam：選擇器與文案保持原頁規則；不統一不同的工程判定。
  function createBeamPage(options) {
    const document = options.document || root.document;
    const window = options.window || root;
    const $ = id => document.getElementById(id);

    function applyPanel(tab) {
        document.querySelectorAll('.section-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.subpanel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
        document.querySelectorAll('[data-shows]').forEach(card => {
          const shows = card.dataset.shows.split(/\s+/);
          card.style.display = shows.includes(tab) ? '' : 'none';
        });
        // 細項過濾
        const topics = options.getTopicVisible()[tab];
        document.querySelectorAll('[data-topic]').forEach(item => {
          if (topics === 'all') { item.style.display = ''; return; }
          const t = item.dataset.topic;
          item.style.display = (topics && topics.has(t)) ? '' : 'none';
        });
    
        // 綜合結果分頁：依目前 toggle 狀態，再隱藏未啟用的項目與整張卡
        if (tab === 'summary') {
          const torsionOn   = $('enableTorsion')?.checked;
          const deflOn      = $('enableDefl')?.checked;
          const exactDeflOn = $('enableExactDefl')?.checked;
          const seismicOn   = $('seismicMode')?.checked;
          // 細項：扭力 / 撓度 topic 未啟用就隱藏
          if (!torsionOn) document.querySelectorAll('[data-topic="torsion"]').forEach(el => el.style.display = 'none');
          if (!deflOn)    document.querySelectorAll('[data-topic="defl"]').forEach(el => el.style.display = 'none');
          // 整張卡：耐震檢核與梁柱接頭輸出（含 seismic badge 的卡）
          document.querySelectorAll('.badge-seismic').forEach(badge => {
            const card = badge.closest('.card');
            if (card) card.style.display = seismicOn ? '' : 'none';
          });
          // 撓度計算卡：未啟用嚴謹撓度就隱藏
          const dCard = $('deflCard');
          if (dCard) dCard.style.display = exactDeflOn ? '' : 'none';
        }
        // 計算過程卡：未勾選 showSteps 一律隱藏；勾選時依本身 data-shows 規則
        const showStepsOn = $('showSteps')?.checked;
        document.querySelectorAll('.steps-card').forEach(card => {
          if (!showStepsOn) { card.style.display = 'none'; return; }
          const shows = (card.dataset.shows || '').split(/\s+/);
          card.style.display = shows.includes(tab) ? '' : 'none';
        });
        // 綜合結果分頁：未啟用的計算過程卡也跟著隱藏
        if (tab === 'summary' && showStepsOn) {
          const torsionOn   = $('enableTorsion')?.checked;
          const deflOn      = $('enableDefl')?.checked || $('enableExactDefl')?.checked;
          const seismicOn   = $('seismicMode')?.checked;
          if (!torsionOn) { const c = $('stepsTorsion'); if (c) c.style.display = 'none'; }
          if (!deflOn)    { const c = $('stepsDefl');    if (c) c.style.display = 'none'; }
          if (!seismicOn) { const c = $('stepsSeismic'); if (c) c.style.display = 'none'; }
        }
    
        // 結論 scope 文字
        const scopeMap = { geom:'幾何', loads:'載重', flex:'撓曲', shear:'剪力', torsion:'扭力', defl:'撓度', seismic:'耐震', summary:'整體' };
        const el = document.getElementById('conclusionScope');
        if (el) el.textContent = scopeMap[tab] || '';
        if (typeof options.calculate === 'function') options.calculate();
      }

    function syncDesignFields() {
        const isDesign = (options.getMode() === 'design');
        document.querySelectorAll('#botRebarStack input[id$="N"], #topRebarStack input[id$="N"]').forEach(el => {
          el.readOnly = isDesign;
          el.style.background = isDesign ? 'var(--bg-subtle)' : '';
          el.style.color = isDesign ? 'var(--hy-slate-700)' : '';
          el.title = isDesign ? '設計模式：由系統依 +Mu/−Mu 自動計算根數' : '檢核模式：請手動輸入根數';
        });
        const fmh = $('flexModeHint'); if (fmh) {
          fmh.textContent = isDesign
            ? '設計模式：依 +Mu/−Mu 自動推算所需根數，配筋面板根數欄位由系統填入（外排優先）。'
            : '檢核模式：請於上方「斷面配筋」手動輸入號數與根數。';
        }
      }

    function updateBanner(r) {
        const tab = document.querySelector('.section-tabs button.active')?.dataset.tab || 'geom';
        const banner = $('bannerStatus');
        const key = $('bannerKey');
        let checks = [];
        let kv = [];
        const manualReviewItems = options.collectManualReviewItems(r);
        const kfmt = (label, val, unit, ok) => ({ label, val: `${Number(val).toFixed(2)} ${unit||''}`, ok });
    
        if (tab !== 'geom' && r.methodApplicable === false) {
          checks.push(['一般梁方法適用性', false]);
        }
    
        if (tab === 'geom') {
          // 幾何與材料分頁：不顯示檢核，僅顯示輸入摘要
          banner.className = 'banner-status';
          banner.innerHTML = '幾何與材料 — 輸入區<div data-ui="banner-detail">受力與檢核請至「載重」與其他分頁</div>';
          key.innerHTML = [
            { label:'bw × h', val:`${r.bw??$('bw').value} × ${r.h??$('h').value} cm`, ok:null },
            { label:"fc'/fy", val:`${$('fc').value}/${$('fy').value}`, ok:null },
            { label:'底 As', val:`${r.AsBot.toFixed(2)} cm²`, ok:null },
            { label:'頂 As', val:`${r.AsTop.toFixed(2)} cm²`, ok:null }
          ].map(item => `<div class="k"><span class="k-label">${item.label}</span><span class="k-val">${item.val}</span></div>`).join('');
          return;
        } else if (tab === 'loads') {
          checks.push(['φMn⁺ ≥ +Mu', r.okFlexPos]);
          checks.push(['φMn⁻ ≥ −Mu', r.okFlexNeg]);
          checks.push(['φVn ≥ Vd', r.okShear]);
          kv.push(kfmt('+Mu', r.MuPos, 'tf·m', null));
          kv.push(kfmt('−Mu', r.MuNeg, 'tf·m', null));
          kv.push(kfmt('Vu', r.Vu, 'tf', null));
          if (r.seismic) kv.push({ label:'Vd', val:`${(r.shearDemand/1000).toFixed(2)} tf (${r.shearDemandSource})`, ok:r.okShear });
          kv.push(kfmt('φMn⁺', r.phiMnPos, 'tf·m', r.okFlexPos));
          kv.push(kfmt('φMn⁻', r.phiMnNeg, 'tf·m', r.okFlexNeg));
          kv.push(kfmt('φVn', r.phiVn, 'tf', r.okShear));
        } else if (tab === 'flex') {
          checks.push(['φMn⁺ ≥ +Mu', r.okFlexPos]);
          checks.push(['φMn⁻ ≥ −Mu', r.okFlexNeg]);
          checks.push([r.seismic ? '縱向主筋上限 εt / SMRF ρ (兩向)' : '拉力控制 εt (兩向)', r.okRhoMax]);
          checks.push(['最小撓曲鋼筋條文 (兩向)', r.okAsMin]);
          checks.push(['主筋裂縫間距', r.okCrackSpacing]);
          if (r.needSkin) checks.push(['表層筋', r.okSkin]);
          if (r.developmentData?.okExplicit !== null) checks.push(['錨定/搭接', r.developmentData.okExplicit]);
          if (r.developmentData?.developmentManualReview) checks.push(['錨定人工複核', null]);
          kv.push(kfmt('φMn⁺', r.phiMnPos, 'tf·m', r.okFlexPos));
          kv.push(kfmt('+Mu', r.MuPos, 'tf·m', null));
          kv.push(kfmt('φMn⁻', r.phiMnNeg, 'tf·m', r.okFlexNeg));
          kv.push(kfmt('−Mu', r.MuNeg, 'tf·m', null));
          kv.push({ label:'底 As/需', val:`${r.AsBot.toFixed(2)}/${r.AsReqPos.toFixed(2)}`, ok:(r.AsBot>=r.AsReqPos) });
          kv.push({ label:'頂 As/需', val:`${r.AsTop.toFixed(2)}/${r.AsReqNeg.toFixed(2)}`, ok:(r.AsTop>=r.AsReqNeg) });
          if (r.developmentData) {
            kv.push({ label:'ℓd,req', val:`${r.developmentData.ldReq.toFixed(1)} cm`, ok:null });
            kv.push({ label:'ℓs,req', val:`${r.developmentData.lapReq.toFixed(1)} cm`, ok:null });
            kv.push({ label:'端部錨定', val:`${r.developmentData.leftTypeLabel}/${r.developmentData.rightTypeLabel}`, ok:r.developmentData.developmentManualReview ? null : r.developmentData.okExplicit });
          }
        } else if (tab === 'shear') {
          checks.push(['φVn ≥ Vd', r.okShear]);
          checks.push(['Av,min', r.okShearMin]);
          checks.push(['剪力筋間距', r.okShearSpacing]);
          kv.push(kfmt('φVn', r.phiVn, 'tf', null));
          kv.push(kfmt('Vu', r.Vu, 'tf', null));
          if (r.seismic) kv.push({ label:'Vd', val:`${(r.shearDemand/1000).toFixed(2)} tf (${r.shearDemandSource})`, ok:r.okShear });
          kv.push({ label:'Av/s', val:`${r.AvProvidedPerS.toFixed(4)}/${r.AvMinPerS.toFixed(4)}`, ok:r.okShearMin });
        } else if (tab === 'torsion') {
          if (r.enableTorsion) checks.push([r.torsionNeedsDesign ? (r.torsionDetailOk == null ? '扭力詳算人工複核' : '22.7 扭力詳算') : '扭力門檻', r.torsionStatusOk]);
          else checks.push(['未啟用扭力', true]);
        } else if (tab === 'defl') {
          if (r.enableDefl) checks.push(['撓度', r.okDeflOverall]);
        } else if (tab === 'seismic') {
          if (!r.seismic) {
            banner.className = 'banner-status warn';
            banner.textContent = '⚠ 未啟用耐震模式 (SMRF)';
            key.innerHTML = '';
            return;
          }
          checks.push(['φMn⁺ ≥ +Mu', r.okFlexPos]);
          checks.push(['φMn⁻ ≥ −Mu', r.okFlexNeg]);
          checks.push(['φVn ≥ Vd', r.okShear]);
          checks.push(['剪力筋細則', r.okShearMin && r.okShearSpacing]);
          checks.push([`ρ⁺ ≤ ${r.rhoSmrfLimit.toFixed(4)}`, r.okSmrfRhoPos]);
          checks.push([`ρ⁻ ≤ ${r.rhoSmrfLimit.toFixed(4)}`, r.okSmrfRhoNeg]);
          checks.push(['SMRF 幾何', r.okBw && r.okLn]);
          checks.push(['跨內 Mn', r.okMnQuarter]);
          checks.push(['首支箍筋', r.okFirstHoop]);
          if (r.developmentData?.okLapZone !== null) checks.push(['搭接避開塑鉸區', r.developmentData.okLapZone]);
        } else { // summary
          checks.push(['φMn⁺ ≥ +Mu', r.okFlexPos]);
          checks.push(['φMn⁻ ≥ −Mu', r.okFlexNeg]);
          checks.push(['φVn ≥ Vd', r.okShear]);
          checks.push([r.seismic ? '縱向主筋上限（εt / SMRF ρ）' : '拉力控制 εt', r.okRhoMax]);
          checks.push(['最小撓曲鋼筋條文', r.okAsMin]);
          checks.push(['主筋裂縫間距', r.okCrackSpacing]);
          if (r.needSkin) checks.push(['表層筋', r.okSkin]);
          if (r.enableTorsion) checks.push([r.torsionNeedsDesign ? (r.torsionDetailOk == null ? '扭力詳算人工複核' : '22.7 扭力詳算') : '扭力門檻', r.torsionStatusOk]);
          if (r.seismic) checks.push(['跨內 Mn', r.okMnQuarter]);
          if (r.seismic) checks.push(['首支箍筋', r.okFirstHoop]);
          if (r.developmentData?.okExplicit !== null) checks.push(['錨定/搭接', r.developmentData.okExplicit]);
          if (r.developmentData?.developmentManualReview) checks.push(['錨定人工複核', null]);
          if (r.seismic) checks.push(['SMRF 幾何', r.okBw && r.okLn]);
          if (r.enableDefl) checks.push(['撓度', r.okDeflOverall]);
          kv.push(kfmt('φMn⁺', r.phiMnPos, 'tf·m', r.okFlexPos));
          kv.push(kfmt('+Mu', r.MuPos, 'tf·m', null));
          kv.push(kfmt('φMn⁻', r.phiMnNeg, 'tf·m', r.okFlexNeg));
          kv.push(kfmt('−Mu', r.MuNeg, 'tf·m', null));
          kv.push(kfmt('φVn', r.phiVn, 'tf', r.okShear));
          kv.push(kfmt('Vu', r.Vu, 'tf', null));
          if (r.seismic) kv.push({ label:'Vd', val:`${(r.shearDemand/1000).toFixed(2)} tf (${r.shearDemandSource})`, ok:r.okShear });
        }
    
        const pendingManualReview = tab === 'summary' && manualReviewItems.length > 0;
        const bannerChecks = pendingManualReview
          ? [...checks, [`人工複核：${manualReviewItems.join('、')}`, null]]
          : checks;
        const allOk = bannerChecks.length > 0 && bannerChecks.every(c => c[1] === true);
        const anyFail = bannerChecks.some(c => c[1] === false);
        banner.className = 'banner-status ' + (anyFail ? 'fail' : allOk ? 'ok' : 'warn');
        const icon = anyFail ? '✗' : allOk ? '✓' : '⚠';
        const txt = anyFail ? 'NG — 不符合規範' : pendingManualReview ? `部分項目需人工複核：${manualReviewItems.join('、')}` : allOk ? 'OK — 符合規範' : '部分項目待檢核';
        banner.innerHTML = `${icon} ${txt}` + (bannerChecks.length ? `<div data-ui="banner-detail">${bannerChecks.map(c => `${c[1]===true?'✓':c[1]===false?'✗':'·'} ${c[0]}`).join(' ｜ ')}</div>` : '');
        key.innerHTML = kv.map(item => {
          const cls = item.ok === true ? 'ok' : item.ok === false ? 'fail' : '';
          return `<div class="k ${cls}"><span class="k-label">${item.label}</span><span class="k-val">${item.val}</span></div>`;
        }).join('');
      }

    function attachFormulaTips() {
        if (!window.FormulaInfo) return;
        window.FormulaInfo.attach({
          'r-phiMnPos':  '正彎矩 (底拉) 嚴謹解\n多排筋 → 應變相容反覆求中性軸 c\nMn = ΣFi·yi − Cc·a/2 (對壓力面取矩)',
          'r-phiMnNeg':  '負彎矩 (頂拉) — 將梁倒置後相同算法',
          'r-AsBot':     '底層各排主筋面積總和\nΣ ni·ab,i',
          'r-AsTop':     '頂層各排主筋面積總和\nΣ ni·ab,i',
          'r-dPos':      'd⁺ = h − Σ(As·y)/ΣAs (底層筋形心到頂面距離)',
          'r-dNeg':      'd⁻ = h − Σ(As·y)/ΣAs (頂層筋形心到底面距離)',
          'r-rhoPos':    'ρ⁺ = AsBot / (bw·d⁺)',
          'r-rhoNeg':    'ρ⁻ = AsTop / (bw·d⁻)',
          'r-AsMin':     'As,min = max(14/fy,Asmin, 0.8·√fc/fy,Asmin)·b·d，fy,Asmin=min(fy,5600)\nT/L 梁翼板受拉且屬靜定梁時 b 取 min(bf, 2bw)，其餘取 bw\n一般梁若 As ≥ 4/3 As需求，可依 9.6.1.3 免 As,min；SMRF 依 18.3.3.1 須直接符合',
          'r-epsTPos':   '正彎矩最外端受拉鋼筋淨拉應變；拉力控制須 εt⁺ ≥ εty+0.003',
          'r-epsTNeg':   '負彎矩最外端受拉鋼筋淨拉應變；拉力控制須 εt⁻ ≥ εty+0.003',
          'r-Mcr':       '開裂彎矩 Mcr = fr·Ig / yt\nfr = 2·√fc\n供開裂狀態與撓度計算使用',
          'r-aPos':      '正彎矩應力方塊深 a⁺ = β1·c⁺',
          'r-aNeg':      '負彎矩應力方塊深 a⁻ = β1·c⁻',
          'r-phiVn':     'φVn = φ(Vc + Vs)\nVc 依 22.5.5.1：Av < Av,min 時納入 λs，Av ≥ Av,min 時可採簡化式或 ρw 式\nVs = Av·fyt·d / s',
          's-spacing':   '塑鉸區箍筋間距上限\nmin(d/4, 15 cm, 6db / 5.5db / 5db)\n對應 fy = 4200 / 5000 / 5600',
          's-lo':        '塑鉸區長度 ℓo = 2h (規範 18.3.4)',
          's-midSpacing':'中央區箍筋 ≤ d/2 (規範 18.3.4.6)',
          's-lapZone':   'SMRF 梁端塑鉸區取 2h\n搭接範圍須完全落在 2h 至 ℓn−2h 之間，並配置圍束',
          's-MnRatio':   '規範 18.3.3.2\n支承斷面 Mn⁺ ≥ Mn⁻ / 2',
          's-MnQuarter': '規範 18.3.3.2\n沿梁長任一斷面 Mn ≥ max(Mn⁺,Mn⁻) / 4',
          'r-jointMnb':  '送至柱工具之梁端標稱彎矩\nMnb = max(Mn⁺, Mn⁻)，供柱頁強柱弱梁 ΣMnb 使用',
          'r-jointMpr':  '以指定 Mpr 鋼筋強度倍率放大 fy 後重新計算 Mn⁺、Mn⁻\nMpr,total = Mpr⁺ + Mpr⁻',
          'r-jointVeCap':'梁控制柱剪力上限\nVe,cap = (Mpr⁺ + Mpr⁻) / ℓn，送至柱頁對應 X/Y 向梁 Mpr 控制剪力上限',
          'c-layerSpacing':'排間淨距 sv ≥ max(2.5 cm, db_outer)\n規範 25.2.2',
          'c-devLeft':    '直線錨定：可用長度 ≥ ℓd,req\n標準彎鉤、機械錨定或其他端部構造列為人工複核',
          'c-devRight':   '直線錨定：可用長度 ≥ ℓd,req\n標準彎鉤、機械錨定或其他端部構造列為人工複核',
          'c-lapLength':  '搭接長度 ℓs ≥ 規範 25.5.2 需求\nClass A = 1.0ℓd；Class B = 1.3ℓd',
          'd-Ec':         "彈性模數 Ec = 12000·√fc' (規範 19.2.2 常重混凝土)",
          'd-Mcr':        '開裂彎矩 Mcr = fr·Ig/yt\nMa ≤ (2/3)Mcr → 未開裂 (用 Ig)\nMa > (2/3)Mcr → 改用 Bischoff Ie',
          'd-IcrPos':     '開裂後 Icr (雙筋換算斷面)\nbw·kd²/2 + ((n−1)As\' + nAs)·kd − ((n−1)As\'·d\' + nAs·d) = 0\nIcr = bw·kd³/3 + (n−1)As\'(kd−d\')² + nAs(d−kd)²',
          'd-IePos':      'Bischoff 有效慣性矩\n1/Ie = 1/Icr − ((2Mcr/3Ma)²)·(1/Icr − 1/Ig)\n且 Ie ≤ Ig',
          'd-defImm':     '瞬時撓度 Δi = K·Ma·ℓn²/(Ec·Ie)\nK 依支承狀況：\n簡支 5/48；兩端連續 1/16；一端連續 0.073；懸臂 1/4',
          'd-defLong':    '長期撓度 Δlt = (1+λΔ)·Δi\nλΔ = ξ / (1+50ρ′)，ρ′ 為壓力筋比'
        });
      }
    return { ...commonHelpers(options.page, options) , applyPanel, syncDesignFields, updateBanner, attachFormulaTips };
  }

  // column：選擇器與文案保持原頁規則；不統一不同的工程判定。
  function createColumnPage(options) {
    const document = options.document || root.document;
    const window = options.window || root;
    const $ = id => document.getElementById(id);

    function applyPanel(tab) {
        document.querySelectorAll('.section-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.subpanel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
        document.querySelectorAll('[data-shows]').forEach(card => {
          const shows = card.dataset.shows.split(/\s+/);
          card.style.display = shows.includes(tab) ? '' : 'none';
        });
        // 計算過程卡：未勾選 showSteps 一律隱藏；勾選時依 data-shows 規則並依啟用條件
        const showStepsOn = document.getElementById('showSteps')?.checked;
        document.querySelectorAll('.steps-card').forEach(card => {
          if (!showStepsOn) { card.style.display = 'none'; return; }
          const shows = (card.dataset.shows || '').split(/\s+/);
          card.style.display = shows.includes(tab) ? '' : 'none';
        });
        if (showStepsOn && tab === 'summary') {
          const seismicOn = document.getElementById('seismicMode')?.checked;
          if (!seismicOn) { const c = document.getElementById('stepsSeismic'); if (c) c.style.display = 'none'; }
        }
        const scopeMap = { geom:'幾何', rebar:'配筋', loads:'載重', pm:'P-M 撓曲', shear:'剪力', summary:'整體' };
        // 螺箍筋卡僅圓形螺箍柱顯示；箍筋卡供矩形柱與圓形箍筋柱使用
        const ct = document.getElementById('colType')?.value;
        const isSpiralColumn = (ct === 'circle');
        const spiral = document.getElementById('spiralCard');
        const rectTie = document.getElementById('rectTieCard');
        const seisOn = document.getElementById('seismicMode')?.checked;
        const seismicDetail = document.getElementById('seismicDetailCard');
        if (spiral) spiral.style.display = (isSpiralColumn && tab === 'rebar') ? '' : 'none';
        if (rectTie) rectTie.style.display = (!isSpiralColumn && tab === 'rebar') ? '' : 'none';
        if (seismicDetail) seismicDetail.style.display = (seisOn && tab === 'rebar') ? '' : 'none';
        // 耐震載重卡僅 seismicMode 顯示
        const seisCard = document.getElementById('seismicLoadCard');
        if (seisCard && tab === 'loads') seisCard.style.display = seisOn ? '' : 'none';
        // 設計模式 + 配筋 tab：尚未有實際根數與繫筋量，先隱藏剖面示意圖
        const colSectionCard = document.getElementById('colSectionCard');
        if (colSectionCard && tab === 'rebar' && options.getMode() === 'design') {
          colSectionCard.style.display = 'none';
        }
        const el = document.getElementById('conclusionScope');
        if (el) el.textContent = scopeMap[tab] || '';
        if (typeof options.calculate === 'function') options.calculate();
      }

    function syncDesignFields() {
        // 設計模式下：主筋根數 / 箍筋與繫筋間距與數均由系統反算自動填入 (隱藏輸入)
        // 檢核模式下：使用者自行輸入主筋號數 / 根數 / 間距
        const isCheck = (options.getMode() === 'check');
        const nBarEl = document.getElementById('nBar');
        if (nBarEl) nBarEl.readOnly = !isCheck;
        const hideInDesign = ['nBarFG','tieSFG','crossTieSFG','spiralSFG',
                              'manualLayoutRow','manualLayoutFields',
                              'tieOverrideRow','tieOverrideHint','crossTieNumsRow'];
        hideInDesign.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          if (isCheck) {
            // 還原預設顯示 (manualLayoutFields 與 spiralSFG 由其他邏輯接管)
            if (id === 'manualLayoutFields') {
              el.style.display = document.getElementById('manualLayout')?.checked ? '' : 'none';
            } else {
              el.style.display = '';
            }
          } else {
            el.style.display = 'none';
          }
        });
        // Tab 順序：設計模式採用「幾何 → 載重 → 配筋 → P-M」流程；檢核模式維持「幾何 → 配筋 → 載重 → P-M」
        const tabOrder = isCheck
          ? ['geom','rebar','loads','pm','shear','summary']
          : ['geom','loads','rebar','pm','shear','summary'];
        const tabBar = document.querySelector('.section-tabs');
        if (tabBar) {
          tabOrder.forEach(name => {
            const btn = tabBar.querySelector(`button[data-tab="${name}"]`);
            if (btn) tabBar.appendChild(btn);
          });
        }
      }

    function updateBanner(r) {
        const tab = document.querySelector('.section-tabs button.active')?.dataset.tab || 'geom';
        const banner = $('bannerStatus');
        const key = $('bannerKey');
        let checks = [], kv = [];
        const manualReviewItems = options.collectManualReviewItems(r);
        const resolvedReviewSet = new Set(window.lastColumnAttachmentReadiness?.resolvedReviewItems || []);
        const unresolvedManualReviewItems = manualReviewItems.filter(item => !resolvedReviewSet.has(item));
        const resolvedManualReviewItems = manualReviewItems.filter(item => resolvedReviewSet.has(item));
        const anchorReviewResolved = resolvedReviewSet.has('柱端錨定');
        if (tab === 'geom') {
          // 幾何分頁：僅描述斷面分類 (短柱 / 長柱)，不視為合規檢核
          const isShortChk = r.klr <= 22;
          banner.className = 'banner-status';
          banner.innerHTML = isShortChk
            ? `📐 短柱 (k·ℓu/r = ${r.klr.toFixed(1)} ≤ 22)<div data-ui="banner-detail">可忽略細長效應，直接以斷面強度設計</div>`
            : `📐 長柱 (k·ℓu/r = ${r.klr.toFixed(1)} > 22)<div data-ui="banner-detail">需考慮 δns / δs 細長放大效應</div>`;
          key.innerHTML = [
            { label:'Ag', val:`${r.Ag.toFixed(0)} cm²` },
            { label:'k·ℓu/r', val:`${r.klr.toFixed(1)}` },
            { label:'Ast,min (1%)', val:`${(0.01*r.Ag).toFixed(1)} cm²` },
            { label:'Ast,max (8%)', val:`${(0.08*r.Ag).toFixed(1)} cm²` },
          ].map(item => `<div class="k"><span class="k-label">${item.label}</span><span class="k-val">${item.val}</span></div>`).join('');
          return;
        } else if (tab === 'pm') {
          const McShow = isFinite(r.Mc) ? r.Mc : r.Mux;
          checks.push(['(Pu, Mc) 落於 P-M 封包內', r.pmOk]);
          if (Math.abs(r.Mcy || 0) > 1e-9) checks.push(['P-Mx-My 角度掃描', r.biaxialSurfaceOk]);
          checks.push(['Ast ≥ Ast 需求', r.Ast >= r.AstReq]);
          kv.push({ label:'φMn @ Pu', val:`${(r.phiMnAtPu||0).toFixed(2)} tf·m`, ok:null });
          kv.push({ label:'Mc (放大後)', val:`${McShow.toFixed(2)} tf·m`, ok:null });
          if (Math.abs(r.Mcy || 0) > 1e-9) kv.push({ label:'P-Mx-My 比值', val:`${isFinite(r.biaxialSurfaceRatio)?r.biaxialSurfaceRatio.toFixed(3):'—'}`, ok:r.biaxialSurfaceOk });
          kv.push({ label:'Ast 配置', val:`${r.Ast.toFixed(2)} cm²`, ok:null });
          kv.push({ label:'Ast 需求', val:`${r.AstReq.toFixed(2)} cm²`, ok:r.Ast >= r.AstReq });
        } else if (tab === 'shear') {
          checks.push(['φVn ≥ Vd,x/Vd,y', r.okShearStrength]);
          checks.push(['10.6.2 Av,min', r.okShearAvMin]);
          checks.push(['22.5.1.2 斷面上限', r.okShearSize]);
          kv.push({ label:'φVn', val:`${r.phiVn.toFixed(2)} tf`, ok:null });
          kv.push({ label:'Vd,x', val:`${(r.designVxTf ?? r.Vu).toFixed(2)} tf`, ok:null });
          kv.push({ label:'Vd,y', val:`${((r.designVyTf ?? r.Vuy) || 0).toFixed(2)} tf`, ok:null });
        } else if (tab === 'ties') {
          checks.push(['ρg 範圍', r.okRhog]);
          if (r.seismic && (r.okLateralSupport === true || r.okLateralSupport === false)) checks.push(['18.4.5.2 側撐', r.okLateralSupport]);
          if (r.seismic) checks.push(['18.4.5.3 間距', r.okSeismicTieSpacing]);
          if (r.seismic) checks.push(['18.4.5.3 首支', r.okFirstHoop]);
          if (r.seismic && (r.okLapZone === true || r.okLapZone === false)) checks.push(['18.4.4.3 搭接', r.okLapZone]);
          if (r.seismic && (r.okLapLength === true || r.okLapLength === false)) checks.push(['25.5.2 搭接長度', r.okLapLength]);
          if (r.seismic) checks.push(['18.4.5.5 外間距', r.okOutsideTieSpacing]);
          if (r.seismic) checks.push(['表 18.4.5.4 圍束筋量', r.confinementOk]);
          kv.push({ label:'ρg', val:`${(r.rhog*100).toFixed(2)}%`, ok:r.okRhog });
        } else if (tab === 'seismic') {
          if (!r.seismic) {
            banner.className = 'banner-status warn';
            banner.textContent = '⚠ 未啟用耐震模式 (SMRF)';
            key.innerHTML = '';
            return;
          }
          checks.push(['(Pu, Mu) 在封包內', r.pmOk]);
          if (Math.abs(r.Mcy || 0) > 1e-9) checks.push(['P-Mx-My 角度掃描', r.biaxialSurfaceOk]);
          if (r.scwb?.active) checks.push(['強柱弱梁', r.scwb.ok]);
          checks.push(['Ve 設計剪力', true]);
          checks.push(['ρg ≤ 0.06', r.rhog <= 0.06]);
          if ((r.okLateralSupport === true || r.okLateralSupport === false)) checks.push(['18.4.5.2 側撐', r.okLateralSupport]);
          checks.push(['18.4.5.3 間距', r.okSeismicTieSpacing]);
          checks.push(['18.4.5.3 首支', r.okFirstHoop]);
          if ((r.okLapZone === true || r.okLapZone === false)) checks.push(['18.4.4.3 搭接', r.okLapZone]);
          if ((r.okLapLength === true || r.okLapLength === false)) checks.push(['25.5.2 搭接長度', r.okLapLength]);
          checks.push(['18.4.5.5 外間距', r.okOutsideTieSpacing]);
          checks.push(['表 18.4.5.4 圍束筋量', r.confinementOk]);
        } else {
          const McShow = isFinite(r.Mc) ? r.Mc : r.Mux;
          checks.push(['ρg 範圍', r.okRhog]);
          if (r.columnDevelopmentHasInput) checks.push([r.columnDevelopmentManual ? '25章錨定人工複核' : '25.4.2 錨定', r.columnDevelopmentManual && anchorReviewResolved ? true : r.okColumnDevelopment]);
          checks.push(['(Pu, Mc) 在封包內', r.pmOk]);
          if (Math.abs(r.Mcy || 0) > 1e-9) checks.push(['P-Mx-My 角度掃描', r.biaxialSurfaceOk]);
          checks.push(['φVn ≥ Vd,x/Vd,y', r.okShearStrength]);
          checks.push(['10.6.2 Av,min', r.okShearAvMin]);
          checks.push(['22.5.1.2 斷面上限', r.okShearSize]);
          if (r.seismic && r.scwb?.active) checks.push(['強柱弱梁', r.scwb.ok]);
          if (r.seismic && (r.okLateralSupport === true || r.okLateralSupport === false)) checks.push(['18.4.5.2 側撐', r.okLateralSupport]);
          if (r.seismic) checks.push(['18.4.5.3 間距', r.okSeismicTieSpacing]);
          if (r.seismic) checks.push(['18.4.5.3 首支', r.okFirstHoop]);
          if (r.seismic && (r.okLapZone === true || r.okLapZone === false)) checks.push(['18.4.4.3 搭接', r.okLapZone]);
          if (r.seismic && (r.okLapLength === true || r.okLapLength === false)) checks.push(['25.5.2 搭接長度', r.okLapLength]);
          if (r.seismic) checks.push(['18.4.5.5 外間距', r.okOutsideTieSpacing]);
          if (r.seismic) checks.push(['表 18.4.5.4 圍束筋量', r.confinementOk]);
          kv.push({ label:'φMn @ Pu', val:`${(r.phiMnAtPu||0).toFixed(2)} tf·m`, ok:null });
          kv.push({ label:'Mc (放大後)', val:`${McShow.toFixed(2)} tf·m`, ok:null });
          kv.push({ label:'φVn', val:`${r.phiVn.toFixed(2)} tf`, ok:null });
          kv.push({ label:'Vd,x/Vd,y', val:`${(r.designVxTf ?? r.Vu).toFixed(2)} / ${((r.designVyTf ?? r.Vuy) || 0).toFixed(2)} tf`, ok:null });
        }
        const pendingManualReview = tab === 'summary' && unresolvedManualReviewItems.length > 0;
        const bannerChecks = pendingManualReview
          ? [...checks, [`人工複核：${unresolvedManualReviewItems.join('、')}`, null]]
          : (tab === 'summary' && resolvedManualReviewItems.length
              ? [...checks, [`已複核：${resolvedManualReviewItems.join('、')}`, true]]
              : checks);
        const allOk = bannerChecks.length > 0 && bannerChecks.every(c => c[1] === true);
        const anyFail = bannerChecks.some(c => c[1] === false);
        banner.className = 'banner-status ' + (anyFail ? 'fail' : allOk ? 'ok' : 'warn');
        const icon = anyFail ? '✗' : allOk ? '✓' : '⚠';
        const txt = anyFail
          ? 'NG — 不符合規範'
          : pendingManualReview
            ? `部分項目需人工複核：${unresolvedManualReviewItems.join('、')}`
            : allOk
              ? (resolvedManualReviewItems.length ? '複核完成 — 可核可' : 'OK — 符合規範')
              : '部分項目待檢核';
        banner.innerHTML = `${icon} ${txt}` + (bannerChecks.length ? `<div data-ui="banner-detail">${bannerChecks.map(c => `${c[1]===true?'✓':c[1]===false?'✗':'·'} ${c[0]}`).join(' ｜ ')}</div>` : '');
        key.innerHTML = kv.map(item => {
          const cls = item.ok === true ? 'ok' : item.ok === false ? 'fail' : '';
          return `<div class="k ${cls}"><span class="k-label">${item.label}</span><span class="k-val">${item.val}</span></div>`;
        }).join('');
      }

    function attachFormulaTips() {
        if (!window.FormulaInfo) return;
        window.FormulaInfo.attach({
          'r-Po':       '純壓強度 Po = 0.85·fc·(Ag−Ast) + fy·Ast',
          'r-phiPnMax': 'φPn,max = φ·α·Po\nα = 0.80 (箍筋柱) 或 0.85 (螺箍柱)',
          'r-phiMnAtPu':'依 Pu 在 P-M 互制曲線上插值得到的 φMn',
          'r-deltaNS':  '非搖擺 δns = Cm / (1 − Pu/(0.75·Pc))\nPc = π²EI / (kℓu)²',
          'r-deltaS':   '搖擺架構 δs = 1 / (1 − ΣPu/(0.75·ΣPc))',
          'r-rhoS':     '螺箍配筋比 ρs = 4·Asp / (Dch·s)',
          'r-rhoSReq':  'ρs,min = max(0.45·(Ag/Ach−1)·fc/fyt, 0.12·fc/fyt；必要時含高軸力式)',
          'r-klr':      '細長比 k·ℓu/r；r = 0.3·min(b,h) 或 0.25·D',
          'r-biaxialSurface':'P-Mx-My 角度掃描利用率\n以纖維斷面在 Pu 水平面建立 Mx-My 容量邊界',
          'r-bresler':  'Bresler 倒數法\n1/Pn = 1/Pnx + 1/Pny − 1/Po',
          's-tieS':     'ℓo 內箍筋間距上限\nmin(b/4, 6db, 15)',
          's-lo':       'ℓo = max(ℓu/6, max(b,h), 45 cm)',
          's-midSpacing':'ℓo 外箍筋 ≤ min(6db, 15)',
          's-scwb':     '強柱弱梁 ΣMnc ≥ 1.2·ΣMnb (規範 18.4.3.2)'
        });
      }
    return { ...commonHelpers(options.page, options) , applyPanel, syncDesignFields, updateBanner, attachFormulaTips };
  }

  // wall：選擇器與文案保持原頁規則；不統一不同的工程判定。
  function createWallPage(options) {
    const document = options.document || root.document;
    const window = options.window || root;
    const $ = id => document.getElementById(id);

    function applyPanel(tab) {
        document.querySelectorAll('.section-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.subpanel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
        document.querySelectorAll('[data-shows]').forEach(card => {
          const shows = card.dataset.shows.split(/\s+/);
          card.style.display = shows.includes(tab) ? '' : 'none';
        });
        // 計算過程卡：未勾選 showSteps 一律隱藏；勾選時依 data-shows 規則
        const showStepsOn = document.getElementById('showSteps')?.checked;
        document.querySelectorAll('.steps-card').forEach(card => {
          if (!showStepsOn) { card.style.display = 'none'; return; }
          const shows = (card.dataset.shows || '').split(/\s+/);
          card.style.display = shows.includes(tab) ? '' : 'none';
        });
        const scopeMap = { geom:'幾何 ＆ 材料', load:'載重', rebar:'配筋', methods:'計算法', summary:'綜合檢核' };
        const el = document.getElementById('conclusionScope');
        if (el) el.textContent = scopeMap[tab] || '';
        if (typeof options.calculate === 'function') options.calculate();
      }

    function updateBanner(r) {
        const tab = document.querySelector('.section-tabs button.active')?.dataset.tab || 'geom';
        const banner = $('bannerStatus');
        const key = $('bannerKey');
        let checks = [], kv = [];
        if (tab === 'geom') {
          checks.push(['牆厚 ≥ 下限', r.okH]);
          kv.push({ label:'h', val:`${r.h} cm`, ok:null });
          kv.push({ label:'hmin', val:`${r.hmin.toFixed(1)} cm`, ok:r.okH });
        } else if (tab === 'load') {
          checks.push(['P-M 設計封包', r.okPM]);
          checks.push(['φVn ≥ Vu', r.okShear]);
          kv.push({ label:'φMn@Pu', val: Number.isFinite(r.phiMnInplane) ? `${r.phiMnInplane.toFixed(2)} tf·m` : '—', ok:r.okPM });
          kv.push({ label:'Pu', val:`${r.Pu.toFixed(2)} tf`, ok:null });
          kv.push({ label:'Mu', val:`${r.MuIn.toFixed(2)} tf·m`, ok:null });
          kv.push({ label:'φVn', val:`${r.phiVn.toFixed(2)} tf`, ok:r.okShear });
          kv.push({ label:'Vu', val:`${r.Vu.toFixed(2)} tf`, ok:null });
        } else if (tab === 'rebar') {
          checks.push(['ρℓ ≥ 下限', r.okRhol]);
          checks.push(['ρt ≥ 下限', r.okRhot]);
          checks.push(['鋼筋層數', r.okLayers]);
          kv.push({ label:'ρℓ', val:`${r.rhol.toFixed(4)}`, ok:r.okRhol });
          kv.push({ label:'ρt', val:`${r.rhot.toFixed(4)}`, ok:r.okRhot });
          kv.push({ label:'ρℓ,min', val:`${r.rholMin.toFixed(4)}`, ok:null });
          kv.push({ label:'ρt,min', val:`${r.rhotMin.toFixed(4)}`, ok:null });
        } else if (tab === 'methods') {
          kv.push({ label:'P-Δ', val: ($('slenderMethod')?.value === 'iter') ? '迭代' : '簡版', ok:null });
          kv.push({ label:'SBE 延伸', val: ($('sbeExtMethod')?.value === 'custom') ? '應力分布' : '線性', ok:null });
        } else if (tab === 'summary') {
          checks = options.collectSummaryChecks(r);
        }
        const allOk = checks.length > 0 && checks.every(c => c[1] === true);
        const anyFail = checks.some(c => c[1] === false);
        if (tab === 'summary') {
          const summary = options.summarizeResult(r, checks);
          banner.className = 'banner-status ' + (summary.ok === false ? 'fail' : summary.ok === true ? 'ok' : 'warn');
          const reviewText = summary.reviewWarnings.length
            ? `<div data-ui="banner-detail">待確認：${summary.reviewWarnings.join(' ｜ ')}</div>`
            : '';
          banner.innerHTML = summary.text + (checks.length ? `<div data-ui="banner-detail">${checks.map(c => `${c[1]===true?'✓':c[1]===false?'✗':'·'} ${c[0]}`).join(' ｜ ')}</div>` : '') + reviewText;
        } else {
          banner.className = 'banner-status ' + (anyFail ? 'fail' : allOk ? 'ok' : 'warn');
          const icon = anyFail ? '✗' : allOk ? '✓' : '⚠';
          const txt = anyFail ? 'NG — 不符合規範' : allOk ? 'OK — 符合規範' : '部分項目待檢核';
          banner.innerHTML = `${icon} ${txt}` + (checks.length ? `<div data-ui="banner-detail">${checks.map(c => `${c[1]===true?'✓':c[1]===false?'✗':'·'} ${c[0]}`).join(' ｜ ')}</div>` : '');
        }
        key.innerHTML = kv.map(item => {
          const cls = item.ok === true ? 'ok' : item.ok === false ? 'fail' : '';
          return `<div class="k ${cls}"><span class="k-label">${item.label}</span><span class="k-val">${item.val}</span></div>`;
        }).join('');
      }

    function attachFormulaTips() {
        if (!window.FormulaInfo) return;
        window.FormulaInfo.attach({
          'r-hmin':      '承重牆最小厚度 h ≥ max(ℓc/25, 10 cm)',
          'r-phiPn':     '簡易公式 φPn = 0.55·φ·fc·Ag·[1−(k·ℓc/(32h))²]',
          'r-rhol':      '縱向最小配筋比 ρℓ ≥ 0.0012 (#5 以下) 或 0.0015',
          'r-rhot':      '橫向最小配筋比 ρt ≥ 0.0020 (#5 以下) 或 0.0025',
          'r-Acv':       'Acv = ℓw·tw (剪力面積)',
          'r-phiVn':     'φVn = φ·(αc·√fc + ρt·fy)·Acv\nαc = 0.80 (hw/ℓw≤1.5) ~ 0.53 (≥2.0)',
          'r-VnLimit':   'Vn 上限 = 2.65·√fc·Acv (規範 11.5.4.3)',
          'r-oopMcr':    '2/3·Mcr = 2/3·fr·Ig/yt\nfr = 2·√fc',
          'r-oopIcr':    '裂面慣性矩 Icr = (As+Ase)·(d−c)² + b·c³/3',
          'r-oopDelta':  'Δs = 5·Mua·ℓc² / (48·Ec·Ie)',
          'r-oopMu':     'Mua = Mu + Pu·Δs (P-δ 放大)',
          'r-bwPa':      'Rankine 主動土壓 pa = Ka·γs·H (底部)',
          'r-bwModel':   '地下室外牆概算模型\n懸臂牆: 三角形 1/6、均布 1/2；簡支條帶: 三角形 0.0641、均布 1/8',
          'r-bwMtri':    '土三角彎矩\n懸臂牆: M = pa·H²/6；簡支條帶: M = 0.0641·pa·H²',
          'r-bwMuni':    '超載均布彎矩\n懸臂牆: M = q\'·H²/2；簡支條帶: M = q\'·H²/8',
          'r-bwMw':      '水壓彎矩\n懸臂牆: M = pw·hw²/6；簡支條帶: M = 0.0641·pw·hw²',
          'r-bwMutot':   'Mu = 1.6·(M土三角 + M超載 + M水)',
          'be-cLimit':   'BE 觸發 c ≥ ℓw / [600·(1.5·δu/hw)]',
          'be-extLen':   'BE 沿高延伸 = max(ℓw, Mu/(4Vu))',
          'be-horizLen': 'BE 水平長度 ≥ max(c−0.1ℓw, c/2)',
          // Phase C/D 新增
          'r-pierGate':  'Wall Pier 判定 (規範 18.7.1)\nHw/ℓw ≥ 2.0 且 ℓw/bw ≤ 2.5 → 應依柱設計',
          'r-fcLim':     'SSW fc′ 上限 (規範 18.7.2.4)\n特殊結構牆 fc′ ≤ 350 kgf/cm²',
          'r-bEff':      '有效翼版寬 (規範 18.7.5.2)\nb_eff = min(s/2, 0.25·hw, bf,act)',
          'r-bSection':  '總有效寬度 = h + sides·b_eff\n(L 形 sides=1, T/C/I 形 sides=2)',
          'r-Ig':        'Ig (含翼版近似) = Iweb + Σ(b_eff·tf)·(ℓw/2)²',
          'r-aggVnLimitTot': '全牆段 ΣVn 上限 = 2.12·λ·√fc′·ΣAcv (規範 18.7.4.4)',
          'c-aggSingle': '單段上限 Vn ≤ 2.65·√fc′·Acv (規範 18.7.4.4)',
          'c-aggConc':   '力集中警示：任一段 Vu/ΣVu > 65%',
          'sbe-extLen':  'SBE 沿水平延伸：壓應力降至 0.15·fc′ 處終止 (規範 18.7.6.3)',
          'r-oopIter':   'P-Δ 收斂法：M_(k+1) = Mu + Pu·Δs(M_k) 直到 |ΔM| < tol',
          'r-oopDeflLim':'規範 11.8.4: 服務載重撓度 Δs ≤ ℓc/150',
          'd-spMax':     '筋距上限 = min(3h, 45 cm) (規範 11.7.2)',
          'd-vSpInplane':'結構牆面內剪力：縱筋間距 ≤ ℓw/3',
          'd-hSpInplane':'結構牆面內剪力：橫筋間距 ≤ ℓw/5',
          'd-shearFric': '施工縫剪摩擦觸發 Vu > 1.1·λ·√fc′·Acv (規範 22.9)',
          'd-spliceBE':  'SBE 內鋼筋搭接禁區：min(610, ℓw) cm 以上 (規範 18.7.6.5)'
        });
      }
    return { ...commonHelpers(options.page, options) , applyPanel, updateBanner, attachFormulaTips };
  }

  // foundation：選擇器與文案保持原頁規則；不統一不同的工程判定。
  function createFoundationPage(options) {
    const document = options.document || root.document;
    const window = options.window || root;
    const $ = id => document.getElementById(id);

    function applyPanel(tab) {
        options.setCurrentTab(tab);
        document.querySelectorAll('.section-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        const showAdvancedOn = $('showAdvanced')?.checked;
        document.querySelectorAll('[data-shows]').forEach(card => {
          if (card.classList.contains('steps-card')) return; // steps 另處理
          const shows = card.dataset.shows.split(/\s+/);
          const visible = shows.includes(tab) && (!card.classList.contains('advanced-card') || showAdvancedOn);
          card.style.display = visible ? '' : 'none';
        });
        // showSteps 控制
        const showStepsOn = $('showSteps')?.checked;
        document.querySelectorAll('.steps-card').forEach(card => {
          if (!showStepsOn) { card.style.display = 'none'; return; }
          const shows = (card.dataset.shows || '').split(/\s+/);
          card.style.display = shows.includes(tab) ? '' : 'none';
        });
        // 結論 scope
        const scopeMap = { iso:'獨立基腳', combined:'聯合基腳', mat:'筏式基礎', pile:'樁基／樁帽', retain:'擋土牆', seismic:'耐震' };
        const el = $('conclusionScope');
        if (el) el.textContent = scopeMap[tab] || '';
        // 擋土牆扶壁切換
        const ci = $('counterfortInputs');
        if (ci) ci.style.display = ($('retainType')?.value === 'counterfort') ? '' : 'none';
        // 觸發計算
        options.calculate();
      }

    function syncDesignFields() {
        // 為了方便手機/平板現場調整，尺寸與配筋欄位不再依模式鎖定。
        // 設計/檢核模式僅影響提示文字與結果解讀方式。
        [
          'B','L','hf','barSpX','barSpY',
          'cB','cL','cHf','cBarSpX','cBarSpY',
          'pcB','pcL','pcH','pNBar',
          'mB','mL','mHf','mBarSpX','mBarSpY',
          'rNBar'
        ].forEach(id => {
          const e = $(id);
          if (e) e.readOnly = false;
        });
        ['barNoX','barNoY','cBarNoX','cBarNoY','pBarNo','mBarNoX','mBarNoY','rBarNo'].forEach(id => {
          const e = $(id);
          if (e) e.disabled = false;
        });
      }

    function attachFormulaTips() {
        if (!window.FormulaInfo) return;
        window.FormulaInfo.attach({
          'r-qmax':       '4 角土壓 q = P/A ± 6Mx/(BL²) ± 6My/(LB²)',
          'r-qmin':       '若 qmin < 0 → 偏心過大',
          'r-ecc':        '偏心率 ex/L + ey/B；≤ 1/6 為小偏心',
          'r-qu':         'qu = Pu/A — 因數化土壓',
          'r-Mu':         'Mux = qu·B·armX²/2',
          'r-phiMn':      'φMn = φ·As·fy·(d − a/2)',
          'r-phiVc1':     '單向剪力 φVc = φ·0.53·√fc·b·d',
          'r-phiVc2':     '雙向衝剪 φVc = φ·min(a,b,c)·bo·d',
          'r-AsMin':      'As,min = 0.0018·b·h (溫度收縮)',
          'r-dMin':       '有效深度 d ≥ 15 cm (規範)',
          'r-cbRatio':    '矩形基腳中央帶配筋比 = 2/(β+1)',
          'cr-FSslide':   '聯合基腳抗滑 FS = μ·N / H；H = max(|HDL|, |HDL+HE|)',
          'pr-Rmax':      'R_i = P/n ± Mx·y/Σy² ± My·x/Σx²',
          'pr-spacing':   '最小樁間距 ≥ 2.5·Dp',
          'rr-Pa':        'Pa = 0.5·Ka·γ·H² + Ka·qs·H',
          'rr-FSslide':   'FS = (μW + Pp) / Pa ≥ 1.5',
          'rr-FSover':    'FS = Mr / Mo ≥ 2.0',
          'sr-tie':       '繫材軸力 ≥ 0.1·SDS·Pmax',
          'sr-intReq':    '接合面 As,v ≥ 0.005·Ag'
        });
      }
    return { ...commonHelpers(options.page, options) , applyPanel, syncDesignFields, attachFormulaTips };
  }

  // slab：選擇器與文案保持原頁規則；不統一不同的工程判定。
  function createSlabPage(options) {
    const document = options.document || root.document;
    const window = options.window || root;
    const $ = id => document.getElementById(id);

    function syncDesignFields() {
        const isDesign = (options.getMode() === 'design');
        options.getSpacingIds().forEach(id => {
          const el = $(id); if (!el) return;
          el.readOnly = isDesign;
          el.style.background = isDesign ? 'var(--bg-subtle)' : '';
          el.style.color = isDesign ? 'var(--hy-slate-700)' : '';
          el.title = isDesign ? '設計模式：依 Mu 與所選鋼筋號數自動計算所需間距' : '檢核模式：請手動輸入間距';
        });
        const fmh = $('flexModeHint'); if (fmh) {
          fmh.textContent = isDesign ? '設計模式：給號數→反算間距' : '檢核模式：給號數與間距→檢核容量';
        }
      }
    return { ...commonHelpers(options.page, options) , syncDesignFields };
  }

  // shear-wall：選擇器與文案保持原頁規則；不統一不同的工程判定。
  function createShearWallPage(options) {
    const document = options.document || root.document;
    const window = options.window || root;
    const $ = id => document.getElementById(id);

    function applyPanel(tab) {
        document.querySelectorAll('.section-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.subpanel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
        document.querySelectorAll('[data-shows]').forEach(card => {
          const shows = card.dataset.shows.split(/\s+/);
          card.style.display = shows.includes(tab) ? '' : 'none';
        });
        const showStepsOn = $('showSteps')?.checked;
        document.querySelectorAll('.steps-card').forEach(card => {
          if (!showStepsOn) { card.style.display = 'none'; return; }
          const shows = (card.dataset.shows || '').split(/\s+/);
          card.style.display = shows.includes(tab) ? '' : 'none';
        });
        const scopeMap = { geom:'幾何 ＆ 材料', load:'載重', rebar:'配筋', pm:'面內 P-M', shear:'面內剪力', detail:'邊界 ＆ 細部', summary:'綜合檢核' };
        const el = $('conclusionScope');
        if (el) el.textContent = scopeMap[tab] || '';
        options.calculate();
      }

    function updateBanner(r) {
        const tab = document.querySelector('.section-tabs button.active')?.dataset.tab || 'geom';
        const banner = $('bannerStatus'); const key = $('bannerKey');
        let checks = [], kv = [];
        const f = (v,d=1)=> (v==null||isNaN(v))?'—':Number(v).toFixed(d);
        const reviewWarnings = Array.isArray(r.reviewWarnings) ? r.reviewWarnings : [];
        if (tab === 'geom') {
          checks.push(['非 Wall Pier', !r.isPier]);
          checks.push(['適用範圍', r.scopeOk ? true : null]);
          checks.push(['幾何模型', r.geomModelOk]);
          if (r.seismic) checks.push(["fc'≤350", r.fcOk]);
          kv.push({label:'hw/ℓw', val:f(r.hwlw,2), ok:null});
          kv.push({label:'Acv', val:`${f(r.Acv,0)} cm²`, ok:null});
        } else if (tab === 'pm' || tab === 'load') {
          checks.push(['Pu 軸力範圍', r.pmAxialOk]);
          checks.push(['Mu ≤ φMn', r.pmOk]);
          if (r.loadCasesActive || r.loadCaseParseErrors?.length) checks.push(['多工況封包', !r.loadCaseFailures]);
          kv.push({label:'φMn', val:`${f(r.phiMn)} tf·m`, ok:r.pmOk});
          kv.push({label:'Mu', val:`${f(r.Mu)} tf·m`, ok:null});
          kv.push({label:'利用率', val: isFinite(r.pmUtil)?f(r.pmUtil,2):'∞', ok:r.pmOk});
          kv.push({label:'c@Pu', val:`${f(r.cAtPu)} cm`, ok:null});
          if (r.loadCasesActive && r.loadCaseControls?.overall) kv.push({label:'控制工況', val:r.loadCaseControls.overall.name, ok:!r.loadCaseFailures});
        } else if (tab === 'rebar') {
          checks.push(['ρℓ ≥ 下限', r.rholOk]);
          checks.push(['ρt ≥ 下限', r.rhotOk]);
          if (options.getMode() === 'design') checks.push(['建議適用性', r.designSuggestionReady ? true : null]);
          kv.push({label:'ρℓ', val:f(r.rhol,4), ok:r.rholOk});
          kv.push({label:'ρt', val:f(r.rhot,4), ok:r.rhotOk});
        } else if (tab === 'shear') {
          checks.push(['φVn ≥ Ve', r.shearOk]);
          checks.push(['Ve ≤ 剪力上限', r.vnMaxOk]);
          kv.push({label:'φVn', val:`${f(r.phiVn/1000)} tf`, ok:r.shearOk});
          kv.push({label:'Ve', val:`${f(r.Ve)} tf`, ok:null});
          kv.push({label:'αc', val:f(r.alpha_c,3), ok:null});
        } else if (tab === 'detail') {
          if (r.seismic) checks.push(['SBE 提供量', r.sbeReq && !isFinite(r.sbeHoriz) ? null : r.sbeDesignOk]);
          checks.push(['筋距合規', r.spVOk && r.spHOk]);
          if (reviewWarnings.length) checks.push(['細部待確認', null]);
          kv.push({label:'SBE', val: r.seismic ? (r.sbeReq?'須設置':'免設置') : '非耐震', ok: r.seismic ? (r.sbeReq && !isFinite(r.sbeHoriz) ? null : r.sbeDesignOk) : null});
          kv.push({label:'c@Pu', val:`${f(r.cAtPu)} cm`, ok:null});
        } else if (tab === 'summary') {
          checks.push(['Pu 軸力範圍', r.pmAxialOk]);
          checks.push(['Mu ≤ φMn', r.pmOk]);
          checks.push(['φVn ≥ Ve', r.shearOk]);
          checks.push(['幾何模型', r.geomModelOk]);
          checks.push(['ρℓ', r.rholOk]); checks.push(['ρt', r.rhotOk]);
          if (options.getMode() === 'design') checks.push(['設計建議', r.designSuggestionReady ? true : null]);
          if (r.loadCasesActive || r.loadCaseParseErrors?.length) checks.push(['多工況封包', !r.loadCaseFailures]);
          checks.push(['筋距', r.spVOk && r.spHOk]);
          if (r.seismic) checks.push(['SBE 提供量', r.sbeReq && !isFinite(r.sbeHoriz) ? null : r.sbeDesignOk]);
          if (reviewWarnings.length) checks.push(['待確認事項', null]);
        }
        const allOk = checks.length>0 && checks.every(c=>c[1]===true);
        const anyFail = checks.some(c=>c[1]===false);
        banner.className = 'banner-status ' + (anyFail?'fail':allOk?'ok':'warn');
        const icon = anyFail?'✗':allOk?'✓':'⚠';
        const txt = anyFail
          ? 'NG — 不符合規範'
          : allOk
            ? 'OK — 符合規範'
            : (reviewWarnings.length ? `待確認 — ${reviewWarnings.length} 項需補充設計或圖說確認` : '部分項目待確認');
        const reviewText = (tab === 'summary' && reviewWarnings.length)
          ? `<div data-ui="banner-detail">待確認：${reviewWarnings.join(' ｜ ')}</div>`
          : '';
        banner.innerHTML = `${icon} ${txt}` + (checks.length? `<div data-ui="banner-detail">${checks.map(c=>`${c[1]===true?'✓':c[1]===false?'✗':'·'} ${c[0]}`).join(' ｜ ')}</div>`:'') + reviewText;
        key.innerHTML = kv.map(item=>{
          const cls = item.ok===true?'ok':item.ok===false?'fail':'';
          return `<div class="k ${cls}"><span class="k-label">${item.label}</span><span class="k-val">${item.val}</span></div>`;
        }).join('');
      }
    return { ...commonHelpers(options.page, options) , applyPanel, updateBanner };
  }

  const pageFactories = {
    'beam': createBeamPage,
    'column': createColumnPage,
    'wall': createWallPage,
    'foundation': createFoundationPage,
    'slab': createSlabPage,
    'shear-wall': createShearWallPage,
  };

  function createPage(options) {
    const factory = pageFactories[options.page];
    if (!factory) throw new Error('Unknown RC page: ' + options.page);
    return factory(options);
  }
  return { createPage };
});
