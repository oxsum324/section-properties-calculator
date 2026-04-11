/* shared/loadcombo.js
 * 載重組合產生器 — Taiwan 112 規範
 * 用法：
 *   LoadCombo.buildPanel({
 *     prefix: 'lc',                   // 欄位 id 前綴
 *     forces: [                       // 要支援的力種
 *       {key:'M',  label:'彎矩 M', unit:'tf·m'},
 *       {key:'V',  label:'剪力 V', unit:'tf'},
 *     ],
 *     targetIds: { M:'Mu', V:'Vu' }, // 套用後寫入哪個既有欄位
 *   })
 *   → 回傳 HTML 字串塞入卡片
 *   並於 load 後呼叫 LoadCombo.bind(cfg)
 */
(function(){
  const COMBOS = [
    { name:'1.4D',             D:1.4, L:0,   E:0   },
    { name:'1.2D+1.6L',        D:1.2, L:1.6, E:0   },
    { name:'1.2D+1.0L+1.0E',   D:1.2, L:1.0, E:1.0 },
    { name:'1.2D+1.0L−1.0E',   D:1.2, L:1.0, E:-1.0},
    { name:'0.9D+1.0E',        D:0.9, L:0,   E:1.0 },
    { name:'0.9D−1.0E',        D:0.9, L:0,   E:-1.0},
  ];

  function buildPanel(cfg){
    const p = cfg.prefix;
    const rows = cfg.forces.map(f => `
      <tr>
        <td style="padding:4px 6px; font-weight:600;">${f.label} <span class="hint" style="font-style:normal;">(${f.unit})</span></td>
        <td><input type="number" id="${p}_${f.key}_D" value="0" style="width:100%;"></td>
        <td><input type="number" id="${p}_${f.key}_L" value="0" style="width:100%;"></td>
        <td><input type="number" id="${p}_${f.key}_E" value="0" style="width:100%;"></td>
        <td id="${p}_${f.key}_out" style="padding:4px 6px; font-weight:600; color:#1a3d5c;">—</td>
        <td id="${p}_${f.key}_gov" style="padding:4px 6px; color:#666; font-size:0.85em;">—</td>
      </tr>`).join('');
    return `
    <div class="hint" style="margin-bottom:6px;">輸入未因數化的 D/L/E 各分量，按下方按鈕自動產生封包並套用至設計欄位。E 為地震／風力分量，含號自動取絕對值最大。</div>
    <div style="overflow-x:auto;">
    <table style="width:100%; border-collapse:collapse; font-size:0.92em;">
      <thead><tr style="background:#eef2f7;">
        <th style="padding:4px 6px; text-align:left;">力種</th>
        <th style="padding:4px;">D 靜載重</th>
        <th style="padding:4px;">L 活載重</th>
        <th style="padding:4px;">E 地震/風</th>
        <th style="padding:4px;">封包值</th>
        <th style="padding:4px;">主控組合</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
    <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
      <button type="button" id="${p}_btnApply" style="padding:6px 14px; background:#1a3d5c; color:#fff; border:0; border-radius:6px; cursor:pointer; font-family:inherit; font-weight:600;">產生封包並套用</button>
      <button type="button" id="${p}_btnClear" style="padding:6px 14px; background:#f0f0f0; color:#333; border:0; border-radius:6px; cursor:pointer; font-family:inherit;">清除</button>
    </div>
    `;
  }

  function compute(cfg){
    const p = cfg.prefix;
    const result = {};
    for (const f of cfg.forces){
      const D = parseFloat(document.getElementById(`${p}_${f.key}_D`).value) || 0;
      const L = parseFloat(document.getElementById(`${p}_${f.key}_L`).value) || 0;
      const E = parseFloat(document.getElementById(`${p}_${f.key}_E`).value) || 0;
      let bestAbs = 0, bestVal = 0, bestName = '';
      for (const c of COMBOS){
        const v = c.D*D + c.L*L + c.E*E;
        if (Math.abs(v) > bestAbs){
          bestAbs = Math.abs(v); bestVal = v; bestName = c.name;
        }
      }
      result[f.key] = { D, L, E, value:bestVal, abs:bestAbs, governing:bestName };
    }
    return result;
  }

  function apply(cfg){
    const env = compute(cfg);
    const p = cfg.prefix;
    for (const f of cfg.forces){
      const r = env[f.key];
      document.getElementById(`${p}_${f.key}_out`).textContent = r.abs.toFixed(2);
      document.getElementById(`${p}_${f.key}_gov`).textContent = r.governing || '—';
      const tgt = cfg.targetIds && cfg.targetIds[f.key];
      if (tgt){
        const el = document.getElementById(tgt);
        if (el){
          el.value = r.abs.toFixed(3);
          el.dispatchEvent(new Event('input', {bubbles:true}));
          el.dispatchEvent(new Event('change', {bubbles:true}));
        }
      }
    }
    window.lastLoadCombo = window.lastLoadCombo || {};
    window.lastLoadCombo[p] = env;
    return env;
  }

  function clear(cfg){
    const p = cfg.prefix;
    for (const f of cfg.forces){
      document.getElementById(`${p}_${f.key}_D`).value = 0;
      document.getElementById(`${p}_${f.key}_L`).value = 0;
      document.getElementById(`${p}_${f.key}_E`).value = 0;
      document.getElementById(`${p}_${f.key}_out`).textContent = '—';
      document.getElementById(`${p}_${f.key}_gov`).textContent = '—';
    }
  }

  function bind(cfg){
    const p = cfg.prefix;
    document.getElementById(`${p}_btnApply`)?.addEventListener('click', () => apply(cfg));
    document.getElementById(`${p}_btnClear`)?.addEventListener('click', () => clear(cfg));
  }

  // 把載重組合資訊轉成 report.js inputs 區段
  function toReportGroup(prefix, title){
    const env = window.lastLoadCombo && window.lastLoadCombo[prefix];
    if (!env) return null;
    const items = [];
    for (const k of Object.keys(env)){
      const r = env[k];
      items.push({ label:`${k}_D`, value:r.D });
      items.push({ label:`${k}_L`, value:r.L });
      items.push({ label:`${k}_E`, value:r.E });
      items.push({ label:`${k} 封包`, value:`${r.abs.toFixed(2)} (${r.governing})` });
    }
    return { group: title || '載重組合', items };
  }

  window.LoadCombo = { COMBOS, buildPanel, compute, apply, clear, bind, toReportGroup };
})();
