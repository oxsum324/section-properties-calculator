/* core/loads/loadcombo.js
 * 載重組合產生器 — Taiwan 112 規範 (含風力 W)
 *
 * LRFD 簡化組合：
 *   1.4D
 *   1.2D + 1.6L
 *   1.2D + 1.0L + 1.0W   /  - 1.0W
 *   1.2D + 1.0L + 1.0E   /  - 1.0E
 *   0.9D + 1.0W          /  - 1.0W
 *   0.9D + 1.0E          /  - 1.0E
 *
 * ASD / 使用荷重簡化組合：
 *   D
 *   D + L
 *   D + 0.75L + 0.75W    /  - 0.75W
 *   D + 0.75L + 0.75E    /  - 0.75E
 *   0.6D + 0.6W          /  - 0.6W
 *   0.6D + 0.7E          /  - 0.7E
 */
(function () {
  const LRFD_COMBOS = [
    { name:'1.4D',                D:1.4, L:0,    W:0,     E:0    },
    { name:'1.2D+1.6L',           D:1.2, L:1.6,  W:0,     E:0    },
    { name:'1.2D+1.0L+1.0W',      D:1.2, L:1.0,  W:1.0,   E:0    },
    { name:'1.2D+1.0L-1.0W',      D:1.2, L:1.0,  W:-1.0,  E:0    },
    { name:'1.2D+1.0L+1.0E',      D:1.2, L:1.0,  W:0,     E:1.0  },
    { name:'1.2D+1.0L-1.0E',      D:1.2, L:1.0,  W:0,     E:-1.0 },
    { name:'0.9D+1.0W',           D:0.9, L:0,    W:1.0,   E:0    },
    { name:'0.9D-1.0W',           D:0.9, L:0,    W:-1.0,  E:0    },
    { name:'0.9D+1.0E',           D:0.9, L:0,    W:0,     E:1.0  },
    { name:'0.9D-1.0E',           D:0.9, L:0,    W:0,     E:-1.0 },
  ];

  const ASD_COMBOS = [
    { name:'D',                   D:1.0, L:0,    W:0,     E:0    },
    { name:'D+L',                 D:1.0, L:1.0,  W:0,     E:0    },
    { name:'D+0.75L+0.75W',       D:1.0, L:0.75, W:0.75,  E:0    },
    { name:'D+0.75L-0.75W',       D:1.0, L:0.75, W:-0.75, E:0    },
    { name:'D+0.75L+0.75E',       D:1.0, L:0.75, W:0,     E:0.75 },
    { name:'D+0.75L-0.75E',       D:1.0, L:0.75, W:0,     E:-0.75 },
    { name:'0.6D+0.6W',           D:0.6, L:0,    W:0.6,   E:0    },
    { name:'0.6D-0.6W',           D:0.6, L:0,    W:-0.6,  E:0    },
    { name:'0.6D+0.7E',           D:0.6, L:0,    W:0,     E:0.7  },
    { name:'0.6D-0.7E',           D:0.6, L:0,    W:0,     E:-0.7 },
  ];

  function getMethod(cfg) {
    if (typeof cfg.getMethod === 'function') return cfg.getMethod() || 'LRFD';
    return cfg.method || 'LRFD';
  }

  function getComboSet(cfg) {
    const method = getMethod(cfg) === 'ASD' ? 'ASD' : 'LRFD';
    if (method === 'ASD') {
      return { method, name:'ASD / 使用荷重組合', combos: ASD_COMBOS };
    }
    return { method, name:'LRFD / 因數化載重組合', combos: LRFD_COMBOS };
  }

  function buildPanel(cfg) {
    const p = cfg.prefix;
    const comboSet = getComboSet(cfg);
    const rows = cfg.forces.map(f => `
      <tr>
        <td style="padding:4px 6px; font-weight:600;">${f.label} <span class="hint" style="font-style:normal;">(${f.unit})</span></td>
        <td><input type="number" id="${p}_${f.key}_D" value="0" style="width:100%;"></td>
        <td><input type="number" id="${p}_${f.key}_L" value="0" style="width:100%;"></td>
        <td><input type="number" id="${p}_${f.key}_W" value="0" style="width:100%;"></td>
        <td><input type="number" id="${p}_${f.key}_E" value="0" style="width:100%;"></td>
        <td id="${p}_${f.key}_out" style="padding:4px 6px; font-weight:600; color:#1a3d5c;">—</td>
        <td id="${p}_${f.key}_gov" style="padding:4px 6px; color:#666; font-size:0.85em;">—</td>
      </tr>`).join('');
    return `
    <div class="hint" style="margin-bottom:6px;">目前使用 <strong>${comboSet.name}</strong>。輸入 D / L / W / E 各分量 (W 為風力，E 為地震力)，按下方按鈕產生主控組合並套用至設計欄位。</div>
    <div style="overflow-x:auto;">
    <table style="width:100%; border-collapse:collapse; font-size:0.92em;">
      <thead><tr style="background:#eef2f7;">
        <th style="padding:4px 6px; text-align:left;">力種</th>
        <th style="padding:4px;">D 靜載重</th>
        <th style="padding:4px;">L 活載重</th>
        <th style="padding:4px;">W 風力</th>
        <th style="padding:4px;">E 地震</th>
        <th style="padding:4px;">封包值</th>
        <th style="padding:4px;">主控組合</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
    <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
      <button type="button" id="${p}_btnApply" style="padding:6px 14px; background:#1a3d5c; color:#fff; border:0; border-radius:6px; cursor:pointer; font-family:inherit; font-weight:600;">產生封包並套用</button>
      <button type="button" id="${p}_btnClear" style="padding:6px 14px; background:#f0f0f0; color:#333; border:0; border-radius:6px; cursor:pointer; font-family:inherit;">清除</button>
    </div>`;
  }

  function compute(cfg) {
    const p = cfg.prefix;
    const comboSet = getComboSet(cfg);
    const result = {};
    for (const f of cfg.forces) {
      const D = parseFloat(document.getElementById(`${p}_${f.key}_D`).value) || 0;
      const L = parseFloat(document.getElementById(`${p}_${f.key}_L`).value) || 0;
      const W = parseFloat(document.getElementById(`${p}_${f.key}_W`).value) || 0;
      const E = parseFloat(document.getElementById(`${p}_${f.key}_E`).value) || 0;
      let bestAbs = 0, bestVal = 0, bestName = '';
      for (const c of comboSet.combos) {
        const v = c.D * D + c.L * L + c.W * W + c.E * E;
        if (Math.abs(v) > bestAbs) {
          bestAbs = Math.abs(v);
          bestVal = v;
          bestName = c.name;
        }
      }
      result[f.key] = { D, L, W, E, value: bestVal, abs: bestAbs, governing: bestName, method: comboSet.method };
    }
    return result;
  }

  function computeDetailed(cfg) {
    const p = cfg.prefix;
    const comboSet = getComboSet(cfg);
    const combos = comboSet.combos.map(c => {
      const values = {};
      for (const f of cfg.forces) {
        const D = parseFloat(document.getElementById(`${p}_${f.key}_D`).value) || 0;
        const L = parseFloat(document.getElementById(`${p}_${f.key}_L`).value) || 0;
        const W = parseFloat(document.getElementById(`${p}_${f.key}_W`).value) || 0;
        const E = parseFloat(document.getElementById(`${p}_${f.key}_E`).value) || 0;
        values[f.key] = c.D * D + c.L * L + c.W * W + c.E * E;
      }
      return { name: c.name, values };
    });

    const envelope = {};
    for (const f of cfg.forces) {
      const series = combos.map(c => ({ name: c.name, value: c.values[f.key] }));
      const max = series.reduce((a, b) => b.value > a.value ? b : a, { name:'—', value:-Infinity });
      const min = series.reduce((a, b) => b.value < a.value ? b : a, { name:'—', value: Infinity });
      const abs = series.reduce((a, b) => Math.abs(b.value) > Math.abs(a.value) ? b : a, { name:'—', value:0 });
      envelope[f.key] = { max, min, abs, series };
    }
    return { method: comboSet.method, comboName: comboSet.name, combos, envelope };
  }

  function drawEnvelopeChart(canvas, detail, forceKey, options) {
    const series = detail?.envelope?.[forceKey]?.series;
    if (!canvas || !canvas.getContext || !Array.isArray(series) || !series.length) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = options?.width || canvas.clientWidth || 560;
    const cssHeight = options?.height || 220;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const pad = { top: 20, right: 16, bottom: 42, left: 58 };
    const plotW = cssWidth - pad.left - pad.right;
    const plotH = cssHeight - pad.top - pad.bottom;
    const values = series.map(s => s.value);
    const maxVal = Math.max(...values, 0);
    const minVal = Math.min(...values, 0);
    const span = Math.max(maxVal - minVal, 1e-6);
    const y = v => pad.top + (maxVal - v) / span * plotH;
    const x = i => pad.left + (series.length === 1 ? plotW / 2 : i * plotW / (series.length - 1));
    const zeroY = y(0);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(pad.left + plotW, zeroY);
    ctx.stroke();

    const env = detail.envelope[forceKey];
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(pad.left, y(env.max.value));
    ctx.lineTo(pad.left + plotW, y(env.max.value));
    ctx.moveTo(pad.left, y(env.min.value));
    ctx.lineTo(pad.left + plotW, y(env.min.value));
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#0f766e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((pt, i) => {
      const px = x(i), py = y(pt.value);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    series.forEach((pt, i) => {
      const px = x(i), py = y(pt.value);
      ctx.beginPath();
      ctx.fillStyle = Math.abs(pt.value) === Math.abs(env.abs.value) ? '#dc2626' : '#2563eb';
      ctx.arc(px, py, Math.abs(pt.value) === Math.abs(env.abs.value) ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#334155';
    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'right';
    ctx.fillText(maxVal.toFixed(2), pad.left - 8, pad.top + 4);
    ctx.fillText('0', pad.left - 8, zeroY + 4);
    ctx.fillText(minVal.toFixed(2), pad.left - 8, pad.top + plotH + 4);

    ctx.textAlign = 'center';
    const labelStep = series.length > 6 ? 2 : 1;
    series.forEach((pt, i) => {
      if (i % labelStep !== 0) return;
      ctx.save();
      ctx.translate(x(i), cssHeight - 24);
      ctx.rotate(-Math.PI / 7);
      ctx.fillStyle = '#64748b';
      ctx.fillText(pt.name, 0, 0);
      ctx.restore();
    });
  }

  function apply(cfg) {
    const env = compute(cfg);
    const detail = computeDetailed(cfg);
    const p = cfg.prefix;
    for (const f of cfg.forces) {
      const r = env[f.key];
      document.getElementById(`${p}_${f.key}_out`).textContent = r.value.toFixed(2);
      document.getElementById(`${p}_${f.key}_gov`).textContent = r.governing || '—';
      const tgt = cfg.targetIds && cfg.targetIds[f.key];
      if (tgt) {
        const el = document.getElementById(tgt);
        if (el) {
          el.value = r.value.toFixed(3);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
    window.lastLoadCombo = window.lastLoadCombo || {};
    window.lastLoadCombo[p] = { method: getMethod(cfg), env, detail };
    if (typeof cfg.onApplied === 'function') cfg.onApplied(window.lastLoadCombo[p]);
    return env;
  }

  function clear(cfg) {
    const p = cfg.prefix;
    for (const f of cfg.forces) {
      ['D','L','W','E'].forEach(k => {
        document.getElementById(`${p}_${f.key}_${k}`).value = 0;
      });
      document.getElementById(`${p}_${f.key}_out`).textContent = '—';
      document.getElementById(`${p}_${f.key}_gov`).textContent = '—';
    }
  }

  function bind(cfg) {
    const p = cfg.prefix;
    document.getElementById(`${p}_btnApply`)?.addEventListener('click', () => apply(cfg));
    document.getElementById(`${p}_btnClear`)?.addEventListener('click', () => clear(cfg));
  }

  function toReportGroup(prefix, title) {
    const stored = window.lastLoadCombo && window.lastLoadCombo[prefix];
    if (!stored || !stored.env) return null;
    const items = [{ label:'組合模式', value: stored.method || 'LRFD' }];
    const env = stored.env;
    for (const k of Object.keys(env)) {
      const r = env[k];
      items.push({ label: `${k}_D`, value: r.D });
      items.push({ label: `${k}_L`, value: r.L });
      items.push({ label: `${k}_W`, value: r.W });
      items.push({ label: `${k}_E`, value: r.E });
      items.push({ label: `${k} 封包`, value: `${r.value.toFixed(2)} (${r.governing})` });
    }
    return { group: title || '載重組合', items };
  }

  window.LoadCombo = {
    COMBOS: { LRFD: LRFD_COMBOS, ASD: ASD_COMBOS },
    buildPanel, compute, computeDetailed, apply, clear, bind, toReportGroup, drawEnvelopeChart,
  };
})();
