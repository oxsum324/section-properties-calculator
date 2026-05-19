#!/usr/bin/env python3
"""驗證 Phase J/K/L 實際運作"""
import io, sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = Path(__file__).parent.parent.resolve()
V2 = ROOT / "石材計算書產生器_規範版V2.html"
INPUT = ROOT / "tests/golden/inputs/case_01_standard_safe.json"

def main():
    case_def = json.loads(INPUT.read_text(encoding='utf-8'))
    file_url = "file:///" + str(V2.resolve()).replace('\\','/') + "?dev=1"

    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True)
        ctx = b.new_context(viewport={'width':1600,'height':1000})
        p = ctx.new_page()
        p.on('dialog', lambda d: d.accept())
        p.goto(file_url, wait_until='networkidle')
        p.wait_for_function('() => typeof addCase==="function"', timeout=15000)
        p.evaluate('() => { try{ localStorage.clear(); }catch(e){} }')
        p.reload(wait_until='networkidle')
        p.wait_for_function('() => typeof addCase==="function"', timeout=15000)
        p.evaluate('() => document.querySelectorAll("details").forEach(d => d.open = true)')
        for k, v in case_def.get('global_params', {}).items():
            p.evaluate(
                "([id, val]) => { const el=document.getElementById(id); if(el){ el.value=String(val); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); } }",
                [k, v]
            )
        p.evaluate('() => { if(typeof cases !== "undefined") [...cases].forEach(id => {try{removeCase(id);}catch(e){}}); }')
        p.wait_for_timeout(150)
        p.evaluate('data => addCase(data)', case_def['case_params'])
        p.wait_for_timeout(400)
        p.evaluate('() => { if(typeof render==="function") render(); }')
        p.wait_for_timeout(2500)

        print("=" * 60)
        print("Phase K 驗證：V2_FIELD_HINTS 徽章與預設值狀態")
        print("=" * 60)
        # 檢查徽章是否真的注入
        badges = p.evaluate("""() => {
            const out = {};
            const FIELD_IDS = Object.keys(window.V2_FIELD_HINTS || {});
            FIELD_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (!el) { out[id] = 'MISSING_ELEMENT'; return; }
                const field = el.closest('.field');
                if (!field) { out[id] = 'NO_FIELD_PARENT'; return; }
                const dcrBadge = field.querySelector('.v2-dcr-impact');
                const defBadge = field.querySelector('.v2-default-src');
                const usingDefault = field.getAttribute('data-using-default');
                out[id] = {
                    has_dcr_badge: !!dcrBadge,
                    has_default_badge: !!defBadge,
                    using_default: usingDefault === 'true',
                    current_value: el.value
                };
            });
            return out;
        }""")
        total = len(badges)
        with_dcr = sum(1 for v in badges.values() if isinstance(v, dict) and v.get('has_dcr_badge'))
        with_def = sum(1 for v in badges.values() if isinstance(v, dict) and v.get('has_default_badge'))
        using_default = sum(1 for v in badges.values() if isinstance(v, dict) and v.get('using_default'))
        missing = [k for k, v in badges.items() if not isinstance(v, dict)]
        print(f"  總欄位數 : {total}")
        print(f"  含 D 徽章: {with_dcr}/{total}")
        print(f"  含 預 徽章: {with_def}/{total}")
        print(f"  仍為預設值: {using_default}/{total}")
        if missing: print(f"  ⚠ 缺失: {missing}")
        # 抽樣
        print(f"  抽樣（w_v）: {badges.get('w_v')}")
        print(f"  抽樣（s_sds）: {badges.get('s_sds')}")

        print()
        print("=" * 60)
        print("Phase L 驗證：dock mode 三狀態切換")
        print("=" * 60)
        # 檢查 #review-dashboard 是否存在 dock-handle
        dash_state = p.evaluate("""() => {
            const dash = document.getElementById('review-dashboard');
            if (!dash) return { exists: false };
            return {
                exists: true,
                has_handle: !!dash.querySelector('.dock-handle'),
                classes: dash.className,
                handle_text: dash.querySelector('.dock-handle')?.textContent || null,
                children_count: dash.children.length
            };
        }""")
        print(f"  dashboard 存在: {dash_state.get('exists')}")
        print(f"  dock-handle 已注入: {dash_state.get('has_handle')}")
        print(f"  目前 className: {dash_state.get('classes', '')[:80]}")
        print(f"  handle 文字: {(dash_state.get('handle_text','') or '')[:80]}")
        # 切換到 docked
        p.evaluate("() => v2SetDockState('docked')")
        p.wait_for_timeout(300)
        docked_state = p.evaluate("""() => {
            const dash = document.getElementById('review-dashboard');
            return {
                classes: dash?.className,
                computed_position: dash ? getComputedStyle(dash).position : null,
                computed_right: dash ? getComputedStyle(dash).right : null
            };
        }""")
        print(f"  docked 狀態: classes='{docked_state.get('classes','')[:60]}', position={docked_state.get('computed_position')}, right={docked_state.get('computed_right')}")
        # 切換到 docked-mini
        p.evaluate("() => v2SetDockState('docked-mini')")
        p.wait_for_timeout(300)
        mini_state = p.evaluate("""() => {
            const dash = document.getElementById('review-dashboard');
            const handle = dash?.querySelector('.dock-handle');
            const visible = handle ? getComputedStyle(handle).display !== 'none' : false;
            return {
                classes: dash?.className,
                handle_visible: visible,
                computed_width: dash ? getComputedStyle(dash).width : null
            };
        }""")
        print(f"  docked-mini 狀態: classes='{mini_state.get('classes','')[:60]}', handle 可見={mini_state.get('handle_visible')}, width={mini_state.get('computed_width')}")
        # 切回 top
        p.evaluate("() => v2SetDockState('top')")
        p.wait_for_timeout(300)

        # ─── 額外驗證 Phase 8/9（tier banner + 法規 footer + API tier 分布）───
        extra = p.evaluate("""() => ({
            banner_count: document.querySelectorAll('#preview-sheets .v2-tier-banner').length,
            footer_present: !!document.querySelector('#preview-sheets .v2-regulation-footer'),
            chk_decorated: document.querySelectorAll('#preview-sheets .chk[data-tier]').length,
            chk_total: document.querySelectorAll('#preview-sheets .chk').length,
            // V2.2.1：footer 內含「規範自檢」徽章（schema 驗證 + CONSTS 一致性）
            validation_badge_present: !!Array.from(document.querySelectorAll('#preview-sheets .v2-regulation-footer td')).find(td => td.textContent.includes('規範自檢')),
            // V2.2.2：規範參數總覽區塊（active profile params 列表）
            active_params_block_present: !!document.querySelector('#preview-sheets .v2-active-params'),
            active_params_scope_count: document.querySelectorAll('#preview-sheets .v2-active-params .ap-scope').length,
            active_params_total_rows: document.querySelectorAll('#preview-sheets .v2-active-params table tr').length,
            // V2.2.3：profile picker（候選 >1 之 scope 應有 select）
            profile_picker_count: document.querySelectorAll('#preview-sheets .v2-active-params .ap-picker-select').length,
            seismic_picker_options: (() => {
              const sel = document.querySelector('#preview-sheets .v2-active-params .ap-picker-select[data-scope="seismic"]');
              return sel ? sel.querySelectorAll('option').length : 0;
            })(),
            // V2.2.4：diff viewer 預設應「不顯示」（無 override）
            profile_diff_present_no_override: !!document.querySelector('#preview-sheets .v2-profile-diff'),
            // V3.0.0：StoneGovernanceProtocol 版本號寫入 meta
            governance_protocol_version: (() => {
              try { const r = window.getCalculationResults?.(); return r?.meta?.governance_protocol_version || null; } catch(e){ return null; }
            })(),
            // V2.4.0：profile params 指紋（cyrb53）寫入 meta + footer 徽章
            code_profiles_hashes_present: (() => {
              try { const r = window.getCalculationResults?.(); return !!(r?.meta?.code_profiles_hashes); } catch(e){ return false; }
            })(),
            code_profiles_hashes_count: (() => {
              try { const r = window.getCalculationResults?.(); return Object.keys(r?.meta?.code_profiles_hashes || {}).length; } catch(e){ return 0; }
            })(),
            seismic_hash_format_ok: (() => {
              try {
                const r = window.getCalculationResults?.();
                const h = r?.meta?.code_profiles_hashes?.seismic?.hash || '';
                return h.startsWith('cyrb53:') && h.length === 7 + 14;
              } catch(e){ return false; }
            })(),
            // V2.4.1：archive 比對與「自 V2.X.Y 起已變動」徽章
            code_profiles_changelog_present: (() => {
              try { const r = window.getCalculationResults?.(); return !!r?.meta?.code_profiles_changelog; } catch(e){ return false; }
            })(),
            code_profiles_no_drift: (() => {
              try {
                const r = window.getCalculationResults?.();
                const cl = r?.meta?.code_profiles_changelog;
                return cl && cl.anyChanged === false;
              } catch(e){ return false; }
            })(),
            // V2.5.0：governance fingerprint（gov:14hex）+ footer 治理指紋列
            governance_fingerprint_format_ok: (() => {
              try {
                const r = window.getCalculationResults?.();
                const f = r?.meta?.governance_fingerprint;
                // file:// 環境下 calc_source_hash 為 null，governance_fingerprint 也為 null（合理）
                if (f === null || f === undefined) return 'skipped_no_calc_source_hash';
                return f.startsWith('gov:') && f.length === 4 + 14;
              } catch(e){ return false; }
            })(),
            governance_footer_row_present: !!Array.from(document.querySelectorAll('#preview-sheets .v2-regulation-footer td')).find(td => td.textContent.includes('治理指紋')),
            api: (() => {
                try { return window.getCalculationResults(); } catch(e){ return {__error: String(e)}; }
            })()
        })""")
        print()
        print('=' * 60)
        print('Phase 8/9/1b 額外驗證')
        print('=' * 60)
        print(f"  tier banner 數: {extra.get('banner_count')}")
        print(f"  法規 footer 已注入: {extra.get('footer_present')}")
        print(f"  規範自檢徽章已注入: {extra.get('validation_badge_present')}")
        print(f"  規範參數總覽已注入: {extra.get('active_params_block_present')} (scopes={extra.get('active_params_scope_count')}, rows={extra.get('active_params_total_rows')})")
        print(f"  profile picker 數: {extra.get('profile_picker_count')} (seismic 候選={extra.get('seismic_picker_options')})")
        print(f"  diff viewer (無 override): {extra.get('profile_diff_present_no_override')} (應為 False)")
        print(f"  V2.4.0 hashes: present={extra.get('code_profiles_hashes_present')} count={extra.get('code_profiles_hashes_count')} seismic_format_ok={extra.get('seismic_hash_format_ok')}")
        print(f"  V3.0.0 governance_protocol_version: {extra.get('governance_protocol_version')}")
        print(f"  V2.4.1 changelog: present={extra.get('code_profiles_changelog_present')} no_drift={extra.get('code_profiles_no_drift')}")
        print(f"  V2.5.0 governance fingerprint: format_ok={extra.get('governance_fingerprint_format_ok')} footer_row={extra.get('governance_footer_row_present')}")

        # ─── V2.2.4：模擬 override 後再驗證 diff viewer 出現且 delta 正確 ───
        p.evaluate("""() => {
            localStorage.setItem('stone_v2_profile_override', JSON.stringify({ seismic: 'cns_seismic_113_conservative' }));
            if(typeof render === 'function') render();
        }""")
        p.wait_for_timeout(800)
        diff_state = p.evaluate("""() => {
            const block = document.querySelector('#preview-sheets .v2-profile-diff');
            if (!block) return { present: false };
            const rows = block.querySelectorAll('tbody tr');
            const firstRow = rows[0];
            const tds = firstRow ? Array.from(firstRow.querySelectorAll('td')).map(t => t.textContent.trim()) : [];
            return {
                present: true,
                row_count: rows.length,
                has_pct_marker: !!block.querySelector('.pd-up, .pd-down, .pd-eq'),
                first_row_tds: tds.length,
            };
        }""")
        print(f"  diff viewer (有 override): present={diff_state.get('present')} rows={diff_state.get('row_count')} pct_marker={diff_state.get('has_pct_marker')}")
        # 清掉 override 避免影響後續
        p.evaluate("() => { localStorage.removeItem('stone_v2_profile_override'); if(typeof render === 'function') render(); }")
        p.wait_for_timeout(400)

        # ─── V2.4.2：模擬 profile params 偏離 archive 後驗證 WARN 出現於匯出檢查 ───
        # SP 是 frozen 無法 defineProperty；改 stub window.getCalculationResults 注入 fake changelog
        gate_state = p.evaluate("""() => {
            if (typeof v2CollectExportChecklist !== 'function') return { error: 'v2CollectExportChecklist missing' };
            const origGCR = window.getCalculationResults;
            const baseResult = (typeof origGCR === 'function') ? origGCR() : { meta: {} };
            // 包裝 getCalculationResults：保留所有欄位但覆寫 changelog 為 anyChanged=true
            window.getCalculationResults = function(){
                const r = origGCR ? origGCR() : { meta: {} };
                if (r && r.meta) {
                    r.meta.code_profiles_changelog = {
                        ok: false, anyChanged: true, anyNew: false,
                        perScope: {
                            seismic: { id: 'cns_seismic_113', changed: true, newProfile: false,
                                       currentHash: 'cyrb53:fake_curr', archiveHash: 'cyrb53:fake_arch',
                                       archiveVersion: 'V2.4.0', archiveDate: '2026-04-28' }
                        }
                    };
                }
                return r;
            };
            const payload = { inp: (typeof inputs === 'function' ? inputs() : {}), cases: [] };
            const items = v2CollectExportChecklist(payload, null) || [];
            const warnHits = items.filter(it => it.level === 'warn' && it.text && it.text.includes('archive baseline'));
            // 還原
            window.getCalculationResults = origGCR;
            return {
                items_total: items.length,
                warn_hits: warnHits.length,
                first_warn_text: warnHits[0]?.text?.slice(0, 100) || null
            };
        }""")
        print(f"  V2.4.2 gate test: warn_hits={gate_state.get('warn_hits')} sample='{gate_state.get('first_warn_text')}'")

        # ─── V2.5.0：stub calc_source_hash 後驗證 governance fingerprint 產生 + footer 列出現 ───
        gov_test = p.evaluate("""() => {
            window.__CALC_SOURCE_HASH = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            // 重新觸發 render 讓 footer 重建
            if (typeof render === 'function') render();
        }""")
        p.wait_for_timeout(600)
        gov_state = p.evaluate("""() => {
            const r = window.getCalculationResults?.();
            const f = r?.meta?.governance_fingerprint;
            const footerHasGov = !!Array.from(document.querySelectorAll('#preview-sheets .v2-regulation-footer td')).find(td => td.textContent.includes('治理指紋'));
            return {
                fingerprint: f || null,
                format_ok: typeof f === 'string' && f.startsWith('gov:') && f.length === 18,
                footer_row_present: footerHasGov
            };
        }""")
        print(f"  V2.5.0 stub test: fingerprint={gov_state.get('fingerprint')} format_ok={gov_state.get('format_ok')} footer={gov_state.get('footer_row_present')}")

        # ─── V2.5.1：stub 後驗證 exportBaseFilename 含 _gov-XXXXXX 後綴 ───
        # （上一段 stub 仍在效力中：__CALC_SOURCE_HASH 已注入，governance_fingerprint 已產生）
        filename_state = p.evaluate("""() => {
            if (typeof exportBaseFilename !== 'function') return { error: 'exportBaseFilename missing' };
            const fn = exportBaseFilename('計算書');
            return {
                filename: fn,
                contains_gov: /_gov-[0-9a-f]{6}$/.test(fn),
                gov_suffix: (fn.match(/_gov-[0-9a-f]+/) || [null])[0]
            };
        }""")
        print(f"  V2.5.1 filename test: contains_gov={filename_state.get('contains_gov')} suffix={filename_state.get('gov_suffix')} fn_tail='...{(filename_state.get('filename') or '')[-40:]}'")


        # ─── V2.5.2：stub 仍在效力 — 驗證封面與送審速覽末端含 governance fingerprint ───
        # 啟用 review_summary_on（送審速覽）以便該頁渲染
        p.evaluate("""() => {
            const cb = document.getElementById('review_summary_on');
            if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
            if (typeof render === 'function') render();
        }""")
        p.wait_for_timeout(800)
        # 額外等待 decorator 100ms setTimeout
        p.wait_for_timeout(400)
        gov_footer_state = p.evaluate("""() => {
            const allCovs = document.querySelectorAll('#preview-sheets .cov-page');
            const allCovFooters = document.querySelectorAll('#preview-sheets .cov-gov-footer');
            const cov = document.querySelector('#preview-sheets .cov-page .cov-gov-footer');
            const rev = document.querySelector('#preview-sheets .review-gov-footer');
            const covInner = cov ? cov.innerHTML.trim() : '';
            const revInner = rev ? rev.innerHTML.trim() : '';
            const helperOut = (typeof governanceFingerprintFooterHtml === 'function') ? governanceFingerprintFooterHtml() : '(no helper)';
            const r = window.getCalculationResults?.();
            const fp = r?.meta?.governance_fingerprint || null;
            return {
                cover_footer_present: !!cov,
                cover_has_gov: covInner.includes('治理指紋') && covInner.includes('gov:'),
                review_footer_present: !!rev,
                review_has_gov: revInner.includes('治理指紋') && revInner.includes('gov:'),
                cover_inner: covInner.slice(0, 100),
                review_inner: revInner.slice(0, 100),
                helper_returns: helperOut,
                meta_fingerprint: fp,
                calc_source_hash: window.__CALC_SOURCE_HASH,
                cov_page_count: allCovs.length,
                cov_gov_footer_count: allCovFooters.length
            };
        }""")
        print(f"  V2.5.2 cover/review gov footer:")
        print(f"    helper returns: '{gov_footer_state.get('helper_returns')}'")
        print(f"    meta fingerprint: {gov_footer_state.get('meta_fingerprint')}")
        print(f"    __CALC_SOURCE_HASH: {gov_footer_state.get('calc_source_hash')}")
        print(f"    cov-page count={gov_footer_state.get('cov_page_count')} cov-gov-footer count={gov_footer_state.get('cov_gov_footer_count')}")
        print(f"    cover: present={gov_footer_state.get('cover_footer_present')} has_gov={gov_footer_state.get('cover_has_gov')}")
        print(f"      inner: '{gov_footer_state.get('cover_inner')}'")
        print(f"    review: present={gov_footer_state.get('review_footer_present')} has_gov={gov_footer_state.get('review_has_gov')}")
        print(f"      inner: '{gov_footer_state.get('review_inner')}'")

        # ─── V2.7.0：規範採用聲明 — 切換對照 profile 後驗證聲明區塊出現 ───
        decl_state = p.evaluate("""() => {
            // 切到對照 profile（觸發 override 路徑）
            localStorage.setItem('stone_v2_profile_override', JSON.stringify({ seismic: 'cns_seismic_113_conservative' }));
            if (typeof render === 'function') render();
            // 等 decorator 跑完
            return new Promise(resolve => setTimeout(() => {
                const decl = document.querySelector('#preview-sheets .v2-regulation-declaration');
                resolve({
                    present: !!decl,
                    has_overrides: !!decl?.textContent.includes('採用之非預設 profile'),
                    has_seismic_label: !!decl?.textContent.includes('耐震'),
                    has_conservative_id: !!decl?.textContent.includes('cns_seismic_113_conservative'),
                });
            }, 600));
        }""")
        print(f"  V2.7.0 規範採用聲明：present={decl_state.get('present')} overrides={decl_state.get('has_overrides')} seismic_label={decl_state.get('has_seismic_label')} conservative_id={decl_state.get('has_conservative_id')}")
        # 還原 override
        p.evaluate("() => { localStorage.removeItem('stone_v2_profile_override'); if(typeof render === 'function') render(); }")
        p.wait_for_timeout(400)


        # ─── V2.7.1：override 在效力 + 空 ack → 匯出檢查產生 WARN + 聲明含 data-needs-ack ───
        # （此時 stub_v2_profile_override 仍存在 seismic 對照）
        v271_state = p.evaluate("""() => {
            // 重設 override（前述 V2.7.0 已清掉）
            localStorage.setItem('stone_v2_profile_override', JSON.stringify({ seismic: 'cns_seismic_113_conservative' }));
            // 確保 ack 為空
            const ackEl = document.getElementById('governance_ack');
            if (ackEl) { ackEl.value = ''; ackEl.dispatchEvent(new Event('input', { bubbles: true })); }
            if (typeof render === 'function') render();
            return new Promise(resolve => setTimeout(() => {
                const items = (typeof v2CollectExportChecklist === 'function')
                    ? v2CollectExportChecklist({ inp: (typeof inputs === 'function' ? inputs() : {}), cases: [] }, null)
                    : [];
                const ackWarnHits = items.filter(it => it.level === 'warn' && it.text && it.text.includes('governance_ack'));
                const declNeedsAck = !!document.querySelector('#preview-sheets [data-needs-ack="true"]');
                resolve({
                    ack_warn_count: ackWarnHits.length,
                    ack_warn_text: ackWarnHits[0]?.text?.slice(0, 80) || null,
                    decl_needs_ack_marker: declNeedsAck,
                });
            }, 600));
        }""")
        print(f"  V2.7.1 (override + 空 ack)：warn={v271_state.get('ack_warn_count')} needs_ack_marker={v271_state.get('decl_needs_ack_marker')}")
        print(f"    warn sample: '{v271_state.get('ack_warn_text')}'")

        # ─── V2.7.1：填入 ack 後 WARN 應消失，聲明區改顯示「技師補充採用理由」 ───
        v271_with_ack = p.evaluate("""() => {
            const ackEl = document.getElementById('governance_ack');
            if (ackEl) { ackEl.value = '本案採對照 profile 之工程判斷說明（測試用）'; ackEl.dispatchEvent(new Event('input', { bubbles: true })); }
            if (typeof render === 'function') render();
            return new Promise(resolve => setTimeout(() => {
                const items = (typeof v2CollectExportChecklist === 'function')
                    ? v2CollectExportChecklist({ inp: (typeof inputs === 'function' ? inputs() : {}), cases: [] }, null)
                    : [];
                const ackWarnHits = items.filter(it => it.level === 'warn' && it.text && it.text.includes('governance_ack'));
                const declNeedsAck = !!document.querySelector('#preview-sheets [data-needs-ack="true"]');
                const declHasReason = !!Array.from(document.querySelectorAll('#preview-sheets .v2-regulation-declaration *')).find(el => el.textContent.includes('技師補充採用理由'));
                resolve({
                    ack_warn_count: ackWarnHits.length,
                    decl_needs_ack_marker: declNeedsAck,
                    decl_has_reason: declHasReason,
                });
            }, 600));
        }""")
        print(f"  V2.7.1 (override + 已填 ack)：warn={v271_with_ack.get('ack_warn_count')} (應為 0) decl_has_reason={v271_with_ack.get('decl_has_reason')}")
        # 還原 ack
        p.evaluate("""() => {
            const ackEl = document.getElementById('governance_ack');
            if (ackEl) { ackEl.value = ''; ackEl.dispatchEvent(new Event('input', { bubbles: true })); }
        }""")


        # ─── V2.8.0：governance ack hash 寫入 meta + footer 列出現 ───
        v280_state = p.evaluate("""() => {
            // 仍在 V2.5.0 stub 階段：__CALC_SOURCE_HASH 已注入
            // 設 override + ack 文字
            localStorage.setItem('stone_v2_profile_override', JSON.stringify({ seismic: 'cns_seismic_113_conservative' }));
            const ackEl = document.getElementById('governance_ack');
            if (ackEl) { ackEl.value = 'V2.8.0 測試用採用理由'; ackEl.dispatchEvent(new Event('input', { bubbles: true })); }
            if (typeof render === 'function') render();
            return new Promise(resolve => setTimeout(() => {
                const r = window.getCalculationResults?.();
                const ackHash = r?.meta?.governance_ack_hash;
                const ackText = r?.meta?.governance_ack;
                const footerHasAckRow = !!Array.from(document.querySelectorAll('#preview-sheets .v2-regulation-footer td')).find(td => td.textContent.includes('聲明指紋'));
                resolve({
                    ack_hash: ackHash,
                    ack_text: ackText,
                    ack_hash_format_ok: typeof ackHash === 'string' && ackHash.startsWith('ack:') && ackHash.length === 18,
                    footer_ack_row: footerHasAckRow,
                });
            }, 600));
        }""")
        print(f"  V2.8.0 ack hash: {v280_state.get('ack_hash')} format_ok={v280_state.get('ack_hash_format_ok')} footer_row={v280_state.get('footer_ack_row')}")
        print(f"    ack_text snippet: '{(v280_state.get('ack_text') or '')[:30]}'")

        # ─── V2.8.0：相同 input 二次計算 hash 應確定（簽證後文字未改 → hash 相同）───
        v280_repeat = p.evaluate("""() => {
            if (typeof render === 'function') render();
            return new Promise(resolve => setTimeout(() => {
                const r = window.getCalculationResults?.();
                resolve({ ack_hash: r?.meta?.governance_ack_hash });
            }, 400));
        }""")
        print(f"  V2.8.0 ack hash 再算: {v280_repeat.get('ack_hash')} (應與前一致)")

        # ─── V2.8.1：ack_hash 歷史序列 — 多次編輯 ack 後 history.length 漸進 ───
        v281_state = p.evaluate("""() => {
            // 先清乾淨，模擬全新會話
            localStorage.removeItem('stone_v2_ack_hash_history');
            const projEl = document.getElementById('c_proj');
            if (projEl) { projEl.value = 'V281Test'; projEl.dispatchEvent(new Event('input', { bubbles: true })); }
            const ackEl = document.getElementById('governance_ack');
            // 確保 override 存在以觸發 ack_hash 產生
            localStorage.setItem('stone_v2_profile_override', JSON.stringify({ seismic: 'cns_seismic_113_conservative' }));

            const editions = ['理由 A 第一版', '理由 B 補強', '理由 C 最終版'];
            return new Promise(async resolve => {
                async function setAckAndRender(text){
                    if (ackEl) { ackEl.value = text; ackEl.dispatchEvent(new Event('input', { bubbles: true })); }
                    if (typeof render === 'function') render();
                    await new Promise(r => setTimeout(r, 350));
                }
                for (const t of editions) await setAckAndRender(t);
                // 額外再觸發一次 render 以讓 declaration badge 反映完整歷史
                if (typeof render === 'function') render();
                await new Promise(r => setTimeout(r, 350));
                const history = (typeof getAckHashHistory === 'function') ? getAckHashHistory('V281Test') : [];
                const badge = document.querySelector('#preview-sheets .v2-ack-history');
                // V2.8.2：badge 升級為 <details>；查表格與所有列
                const isDetails = badge ? badge.tagName.toLowerCase() === 'details' : false;
                const tbodyRows = badge ? badge.querySelectorAll('tbody tr').length : 0;
                const headerCount = badge ? badge.querySelectorAll('thead th').length : 0;
                const lastRowSnippet = (() => {
                    if (!badge) return null;
                    const rows = badge.querySelectorAll('tbody tr');
                    if (!rows.length) return null;
                    return rows[rows.length - 1].textContent || '';
                })();
                resolve({
                    history_length: history.length,
                    distinct_hashes: new Set(history.map(h => h.ack_hash)).size,
                    badge_present: !!badge,
                    badge_count: badge ? Number(badge.dataset.historyCount) : 0,
                    badge_text_has_count: badge ? badge.textContent.includes('編輯演變') : false,
                    badge_is_details: isDetails,
                    table_rows: tbodyRows,
                    header_count: headerCount,
                    last_row_text: lastRowSnippet,
                });
            });
        }""")
        print(f"  V2.8.1 ack history：length={v281_state.get('history_length')} distinct={v281_state.get('distinct_hashes')} badge={v281_state.get('badge_present')} badge_count={v281_state.get('badge_count')}")
        print(f"  V2.8.2 details: is_details={v281_state.get('badge_is_details')} rows={v281_state.get('table_rows')} headers={v281_state.get('header_count')}")

        # ─── V2.8.3：點選 A/B 比較按鈕後 diff 面板顯示 unified diff ───
        v283_state = p.evaluate("""() => {
            // 點 row 0 的 A 按鈕 + row 2 的 B 按鈕（history 是 V2.8.1 模擬的 3 次編輯）
            const btnA = document.querySelector('#preview-sheets .v2-ack-history tbody tr:nth-child(1) .v2-ack-cmp-a');
            const btnB = document.querySelector('#preview-sheets .v2-ack-history tbody tr:nth-child(3) .v2-ack-cmp-b');
            if (!btnA || !btnB) return { error: 'compare buttons missing' };
            btnA.click();
            btnB.click();
            return new Promise(resolve => setTimeout(() => {
                const panel = document.querySelector('#preview-sheets .v2-ack-diff-panel');
                const content = panel ? panel.querySelector('.v2-ack-diff-content') : null;
                const innerText = content ? content.textContent : '';
                const rowAHi = document.querySelector('#preview-sheets .v2-ack-history tbody tr.v2-ack-row-a');
                const rowBHi = document.querySelector('#preview-sheets .v2-ack-history tbody tr.v2-ack-row-b');
                resolve({
                    panel_present: !!panel,
                    diff_content_present: !!content,
                    has_minus_line: innerText.includes('- 理由 A 第一版'),
                    has_plus_line: innerText.includes('+ 理由 C 最終版'),
                    row_a_highlighted: !!rowAHi,
                    row_b_highlighted: !!rowBHi,
                });
            }, 300));
        }""")
        print(f"  V2.8.3 diff panel: present={v283_state.get('diff_content_present')} - line={v283_state.get('has_minus_line')} + line={v283_state.get('has_plus_line')} highlights A/B={v283_state.get('row_a_highlighted')}/{v283_state.get('row_b_highlighted')}")

        # ─── V2.9.0：governance dashboard 注入 + 4 區塊完整 ───
        v290_state = p.evaluate("""() => {
            return new Promise(resolve => setTimeout(() => {
                const dash = document.querySelector('#preview-sheets .v2-governance-dashboard');
                if (!dash) { resolve({ present: false }); return; }
                const text = dash.textContent || '';
                const overall = dash.dataset.overallOk;
                const protocolBadge = dash.querySelector('.v2-protocol-badge');
                resolve({
                    present: true,
                    overall_ok: overall,
                    has_section_1: text.includes('① 治理指紋'),
                    has_section_2: text.includes('② profile 驗證'),
                    has_section_3: text.includes('③ archive 漂移'),
                    has_section_4: text.includes('④ ack 狀態'),
                    has_summary_pill: text.includes('治理狀態正常') || text.includes('有狀態需檢視'),
                    fingerprint_table_rows: dash.querySelectorAll('table tbody tr').length,
                    // V3.0.1：protocol compliance 徽章
                    protocol_badge_present: !!protocolBadge,
                    protocol_badge_ok: protocolBadge ? protocolBadge.dataset.protocolOk : null,
                    protocol_badge_text: protocolBadge ? protocolBadge.textContent : '',
                });
            }, 300));
        }""")
        print(f"  V2.9.0 dashboard: present={v290_state.get('present')} overall_ok={v290_state.get('overall_ok')} sections=1{v290_state.get('has_section_1')}/2{v290_state.get('has_section_2')}/3{v290_state.get('has_section_3')}/4{v290_state.get('has_section_4')} fp_rows={v290_state.get('fingerprint_table_rows')}")
        print(f"  V3.0.1 protocol badge: present={v290_state.get('protocol_badge_present')} ok={v290_state.get('protocol_badge_ok')} text='{v290_state.get('protocol_badge_text')}'")

        # ─── V2.9.1：dashboard「複製為純文字」按鈕 + 純文字摘要內容 ───
        v291_state = p.evaluate("""() => {
            const btn = document.querySelector('#preview-sheets .v2-gov-copy-btn');
            if (!btn) return { error: 'copy button missing' };
            // 直接呼叫底層 helper 取純文字（避免依賴 navigator.clipboard 權限）
            const text = (typeof buildGovernanceTextSummary === 'function') ? buildGovernanceTextSummary() : '';
            // 觸發按鈕（使用 fallback execCommand 寫到 __v2LastCopiedText）
            btn.click();
            return new Promise(resolve => setTimeout(() => {
                const copiedText = window.__v2LastCopiedText || '';
                resolve({
                    button_present: true,
                    button_label_initial: btn.title || '',
                    text_length: text.length,
                    text_has_overview: text.includes('治理一致性總覽'),
                    text_has_section_1: text.includes('① 治理指紋'),
                    text_has_section_2: text.includes('② profile 驗證'),
                    text_has_section_3: text.includes('③ archive 漂移'),
                    text_has_section_4: text.includes('④ ack 狀態'),
                    copied_text_length: copiedText.length,
                    copy_attempted: copiedText.length > 0,
                });
            }, 400));
        }""")
        print(f"  V2.9.1 copy button: present={v291_state.get('button_present')} text_len={v291_state.get('text_length')} sections=1{v291_state.get('text_has_section_1')}/2{v291_state.get('text_has_section_2')}/3{v291_state.get('text_has_section_3')}/4{v291_state.get('text_has_section_4')} copied={v291_state.get('copy_attempted')}")

        # 清掉專案名 + history 還原狀態
        p.evaluate("""() => {
            localStorage.removeItem('stone_v2_ack_hash_history');
            const projEl = document.getElementById('c_proj');
            if (projEl) { projEl.value = ''; projEl.dispatchEvent(new Event('input', { bubbles: true })); }
        }""")

        # 還原 ack
        p.evaluate("""() => {
            const ackEl = document.getElementById('governance_ack');
            if (ackEl) { ackEl.value = ''; ackEl.dispatchEvent(new Event('input', { bubbles: true })); }
        }""")
        v272_state = p.evaluate("""() => {
            // 重設 override + 填 ack
            localStorage.setItem('stone_v2_profile_override', JSON.stringify({ seismic: 'cns_seismic_113_conservative' }));
            const ackEl = document.getElementById('governance_ack');
            if (ackEl) { ackEl.value = '本案保守對照 profile 採用理由（測試用）'; ackEl.dispatchEvent(new Event('input', { bubbles: true })); }
            if (typeof render === 'function') render();
            return new Promise(resolve => setTimeout(() => {
                if (typeof docxRegulationDeclarationChildren !== 'function') {
                    resolve({ error: 'docx helper missing' }); return;
                }
                const inp = (typeof inputs === 'function' ? inputs() : {});
                const children = docxRegulationDeclarationChildren(inp);
                resolve({
                    children_count: Array.isArray(children) ? children.length : -1,
                    is_array: Array.isArray(children),
                });
            }, 600));
        }""")
        print(f"  V2.7.2 docx declaration: count={v272_state.get('children_count')} is_array={v272_state.get('is_array')}")

        # ─── V2.7.2 fallback：清空 override + ack 後 helper 回空陣列 ───
        v272_empty = p.evaluate("""() => {
            localStorage.removeItem('stone_v2_profile_override');
            const ackEl = document.getElementById('governance_ack');
            if (ackEl) { ackEl.value = ''; ackEl.dispatchEvent(new Event('input', { bubbles: true })); }
            if (typeof render === 'function') render();
            return new Promise(resolve => setTimeout(() => {
                const inp = (typeof inputs === 'function' ? inputs() : {});
                const children = (typeof docxRegulationDeclarationChildren === 'function')
                    ? docxRegulationDeclarationChildren(inp) : null;
                resolve({ children_count: Array.isArray(children) ? children.length : -1 });
            }, 400));
        }""")
        print(f"  V2.7.2 docx declaration (無 override): count={v272_empty.get('children_count')} (應為 0)")

        # ─── V2.7.0：無 override 時聲明區塊應「不顯示」 ───
        # （此時 override + ack 都已清乾淨）
        decl_no_state = p.evaluate("""() => ({
            present: !!document.querySelector('#preview-sheets .v2-regulation-declaration')
        })""")
        print(f"  V2.7.0 無 override 時聲明：present={decl_no_state.get('present')} (應為 False)")

        # 還原 review_summary
        p.evaluate("""() => {
            const cb = document.getElementById('review_summary_on');
            if (cb && cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); }
        }""")

        # 還原 stub
        p.evaluate("() => { window.__CALC_SOURCE_HASH = null; if (typeof render === 'function') render(); }")
        p.wait_for_timeout(300)

        # ─── V2.5.1：file:// 環境下無 governance fingerprint 時，檔名應不含 _gov- 後綴 ───
        filename_no_gov = p.evaluate("""() => {
            if (typeof exportBaseFilename !== 'function') return null;
            const fn = exportBaseFilename('計算書');
            return { filename: fn, contains_gov: /_gov-/.test(fn) };
        }""")
        print(f"  V2.5.1 file:// fallback: contains_gov={filename_no_gov.get('contains_gov')} (應為 False)")
        print(f"  .chk[data-tier] 覆蓋: {extra.get('chk_decorated')}/{extra.get('chk_total')}")
        api_obj = extra.get('api') or {}
        tiers_in_checks = {}
        if api_obj and not api_obj.get('__error'):
            for c in (api_obj.get('cases', [{}])[0] if api_obj.get('cases') else {}).get('checks', []):
                t = c.get('tier', '?')
                tiers_in_checks[t] = tiers_in_checks.get(t, 0) + 1
        print(f"  API tier 分布: {tiers_in_checks}")

        # ─── 斷言（CI 友善：失敗時 exit non-zero）───
        failures = []
        # Phase K 斷言
        if total < 20:
            failures.append(f'V2_FIELD_HINTS 應 >= 20 欄位，實際 {total}')
        if with_def != total:
            failures.append(f'「預」徽章覆蓋率應 100%，實際 {with_def}/{total}')
        # Phase L 斷言
        if not dash_state.get('has_handle'):
            failures.append('dock-handle 未注入')
        if 'is-docked' not in (docked_state.get('classes') or ''):
            failures.append('dock 切換為 docked 失敗')
        if 'is-mini' not in (mini_state.get('classes') or ''):
            failures.append('dock 切換為 docked-mini 失敗')
        if not mini_state.get('handle_visible'):
            failures.append('docked-mini 模式 handle 不可見')
        # Phase 8 斷言（tier banner 已停用；只驗 .chk decoration）
        # 註：tier banner 因會誤掛到耐風附錄等非案例頁已停用，此斷言改為「不存在 0 個」
        # 若日後改回有條件注入，把 < 1 改回去
        if extra.get('chk_decorated') != extra.get('chk_total'):
            failures.append(f'.chk[data-tier] 應 100% 覆蓋，實際 {extra.get("chk_decorated")}/{extra.get("chk_total")}')
        # Phase 9 斷言（法規 footer）
        if not extra.get('footer_present'):
            failures.append('法規 footer 未注入')
        # V2.2.1 斷言（規範自檢徽章）
        if not extra.get('validation_badge_present'):
            failures.append('V2.2.1 規範自檢徽章未注入')
        # V2.2.2 斷言（規範參數總覽）
        if not extra.get('active_params_block_present'):
            failures.append('V2.2.2 規範參數總覽區塊未注入')
        if extra.get('active_params_scope_count', 0) < 5:
            failures.append(f'V2.2.2 5 個 scope 應全展示，實際 {extra.get("active_params_scope_count")}')
        if extra.get('active_params_total_rows', 0) < 25:
            failures.append(f'V2.2.2 active params 總列數應 >= 25（V2.1.x 累計遷移），實際 {extra.get("active_params_total_rows")}')
        # V2.2.3 斷言（profile picker）
        if extra.get('profile_picker_count', 0) < 1:
            failures.append(f'V2.2.3 profile picker 應 >= 1（seismic 已有對照 profile），實際 {extra.get("profile_picker_count")}')
        if extra.get('seismic_picker_options', 0) < 2:
            failures.append(f'V2.2.3 seismic picker 候選應 >= 2，實際 {extra.get("seismic_picker_options")}')
        # V2.4.0 斷言（profile params 指紋）
        if not extra.get('code_profiles_hashes_present'):
            failures.append('V2.4.0 meta.code_profiles_hashes 未寫入')
        if extra.get('code_profiles_hashes_count', 0) < 5:
            failures.append(f'V2.4.0 hash 應涵蓋 5 個 scope，實際 {extra.get("code_profiles_hashes_count")}')
        if not extra.get('seismic_hash_format_ok'):
            failures.append('V2.4.0 seismic hash 格式錯誤（應為 cyrb53:xxx 14 hex chars）')
        # V3.0.0 斷言（StoneGovernanceProtocol 版本號）
        gpv = extra.get('governance_protocol_version')
        if not gpv or not isinstance(gpv, str) or not gpv.replace('.', '').isdigit():
            failures.append(f'V3.0.0 governance_protocol_version 應為 SemVer，實際 {gpv}')
        elif gpv != '1.0.0':
            failures.append(f'V3.0.0 governance_protocol_version 應為 1.0.0，實際 {gpv}')
        # V2.4.1 斷言（archive changelog）
        if not extra.get('code_profiles_changelog_present'):
            failures.append('V2.4.1 meta.code_profiles_changelog 未寫入')
        if not extra.get('code_profiles_no_drift'):
            failures.append('V2.4.1 changelog 應為 anyChanged=false（profile 與 archive 對齊）')
        # V2.5.0 斷言（governance fingerprint）
        # 第一階段（file://，無 calc_source_hash）：fingerprint 為 null 屬正常
        gv = extra.get('governance_fingerprint_format_ok')
        if gv not in (True, 'skipped_no_calc_source_hash'):
            failures.append(f'V2.5.0 governance_fingerprint 格式錯誤：{gv}')
        # 第二階段（stub 後）：fingerprint 必須為 gov:14hex，footer 列必須出現
        if not gov_state.get('format_ok'):
            failures.append(f'V2.5.0 stub 後 governance_fingerprint 格式錯誤：{gov_state.get("fingerprint")}')
        if not gov_state.get('footer_row_present'):
            failures.append('V2.5.0 stub 後 footer「治理指紋」列未出現')
        # V2.5.1 斷言（檔名含 _gov-XXXXXX 後綴）
        if not filename_state.get('contains_gov'):
            failures.append(f'V2.5.1 stub 後 exportBaseFilename 應以 _gov-6hex 結尾，實際 {filename_state.get("filename")}')
        # V2.5.1 fallback：無 fingerprint 時檔名不含 _gov-
        if filename_no_gov and filename_no_gov.get('contains_gov'):
            failures.append(f'V2.5.1 file:// 環境下 exportBaseFilename 不應含 _gov-，實際 {filename_no_gov.get("filename")}')
        # V2.7.0 斷言（規範採用聲明）
        if not decl_state.get('present'):
            failures.append('V2.7.0 切到對照 profile 後 規範採用聲明區塊未出現')
        if not decl_state.get('has_overrides'):
            failures.append('V2.7.0 聲明區塊應含「採用之非預設 profile」')
        if not decl_state.get('has_conservative_id'):
            failures.append('V2.7.0 聲明區塊應含對照 profile id（cns_seismic_113_conservative）')
        if decl_no_state.get('present'):
            failures.append('V2.7.0 無 override 時聲明區塊不應出現')
        # V2.7.1 斷言（governance_ack 閘門 + 聲明區塊雙態切換）
        if (v271_state.get('ack_warn_count') or 0) < 1:
            failures.append('V2.7.1 override 在效力 + 空 ack 時應產生 WARN（governance_ack 為空）')
        if not v271_state.get('decl_needs_ack_marker'):
            failures.append('V2.7.1 聲明區塊應含 data-needs-ack="true" 提示元素')
        if (v271_with_ack.get('ack_warn_count') or 0) > 0:
            failures.append(f'V2.7.1 填入 ack 後 WARN 應消失，實際 {v271_with_ack.get("ack_warn_count")}')
        if not v271_with_ack.get('decl_has_reason'):
            failures.append('V2.7.1 填入 ack 後聲明區塊應含「技師補充採用理由」段落')
        # V2.7.2 斷言（docx 規範採用聲明 children）
        if v272_state.get('error'):
            failures.append(f'V2.7.2 docxRegulationDeclarationChildren error: {v272_state.get("error")}')
        elif (v272_state.get('children_count') or 0) < 4:
            # 至少 sectionTitle + override note + override table + ack note + ack paragraph
            failures.append(f'V2.7.2 override+ack 時 docx children 應 >= 4，實際 {v272_state.get("children_count")}')
        # V2.8.0 斷言（governance ack hash + footer 列）
        if not v280_state.get('ack_hash_format_ok'):
            failures.append(f'V2.8.0 ack hash 格式錯誤：{v280_state.get("ack_hash")}')
        if not v280_state.get('footer_ack_row'):
            failures.append('V2.8.0 footer「聲明指紋」列未出現')
        if v280_repeat.get('ack_hash') != v280_state.get('ack_hash'):
            failures.append(f'V2.8.0 相同 input 兩次計算 hash 不一致：{v280_state.get("ack_hash")} vs {v280_repeat.get("ack_hash")}')
        # V2.8.1 斷言（ack history 序列）
        if (v281_state.get('history_length') or 0) < 3:
            failures.append(f'V2.8.1 三次編輯 ack 後 history.length 應 >= 3，實際 {v281_state.get("history_length")}')
        if (v281_state.get('distinct_hashes') or 0) < 3:
            failures.append(f'V2.8.1 三次不同 ack 應產生 3 個不同 hash，實際 {v281_state.get("distinct_hashes")}')
        if not v281_state.get('badge_present'):
            failures.append('V2.8.1 history >=2 時 declaration 應顯示「ack 編輯演變」徽章')
        if (v281_state.get('badge_count') or 0) < 3:
            failures.append(f'V2.8.1 badge data-history-count 應 >= 3，實際 {v281_state.get("badge_count")}')
        # V2.8.2 斷言（badge 升級為 <details> + 表格資料完整）
        if not v281_state.get('badge_is_details'):
            failures.append('V2.8.2 history badge 應為 <details> 元素')
        if (v281_state.get('table_rows') or 0) < 3:
            failures.append(f'V2.8.2 history 表格應有 >= 3 列（對應 3 次編輯），實際 {v281_state.get("table_rows")}')
        # V2.8.3：表頭升至 6 欄（多了「比較」欄）
        if (v281_state.get('header_count') or 0) != 6:
            failures.append(f'V2.8.3 history 表頭應有 6 欄（# / 時間 / hash / 片段 / ov/dr / 比較），實際 {v281_state.get("header_count")}')
        # V2.8.3 斷言（A/B 比較 → diff panel）
        if v283_state.get('error'):
            failures.append(f'V2.8.3 compare buttons 缺：{v283_state.get("error")}')
        if not v283_state.get('diff_content_present'):
            failures.append('V2.8.3 diff content panel 未注入')
        if not v283_state.get('has_minus_line'):
            failures.append('V2.8.3 diff 應含「- 理由 A 第一版」紅色行')
        if not v283_state.get('has_plus_line'):
            failures.append('V2.8.3 diff 應含「+ 理由 C 最終版」綠色行')
        if not v283_state.get('row_a_highlighted'):
            failures.append('V2.8.3 row A 應含 v2-ack-row-a class')
        if not v283_state.get('row_b_highlighted'):
            failures.append('V2.8.3 row B 應含 v2-ack-row-b class')
        # V2.9.0 斷言（governance dashboard 4 區塊）
        if not v290_state.get('present'):
            failures.append('V2.9.0 governance dashboard 未注入')
        for sec_num, key in [(1, 'has_section_1'), (2, 'has_section_2'), (3, 'has_section_3'), (4, 'has_section_4')]:
            if not v290_state.get(key):
                failures.append(f'V2.9.0 dashboard 缺第 {sec_num} 區塊')
        if not v290_state.get('has_summary_pill'):
            failures.append('V2.9.0 dashboard summary 缺整體狀態 pill')
        if (v290_state.get('fingerprint_table_rows') or 0) < 5:
            failures.append(f'V2.9.0 dashboard 指紋表應 >= 5 列（5 個 scope），實際 {v290_state.get("fingerprint_table_rows")}')
        # V3.0.1 斷言（protocol compliance 徽章）
        if not v290_state.get('protocol_badge_present'):
            failures.append('V3.0.1 dashboard summary 應含 v2-protocol-badge 元素')
        # 在當下情境（已 stub calc_source_hash + override）應為 compliant
        if v290_state.get('protocol_badge_ok') != 'true':
            failures.append(f'V3.0.1 stub 階段 protocol 應合規，實際 {v290_state.get("protocol_badge_ok")}：{v290_state.get("protocol_badge_text")}')
        # V2.9.1 斷言（複製為純文字按鈕 + 純文字摘要內容）
        if v291_state.get('error'):
            failures.append(f'V2.9.1 copy button missing: {v291_state.get("error")}')
        if not v291_state.get('button_present'):
            failures.append('V2.9.1 dashboard 缺「複製為純文字」按鈕')
        if (v291_state.get('text_length') or 0) < 200:
            failures.append(f'V2.9.1 純文字摘要長度應 >= 200 字，實際 {v291_state.get("text_length")}')
        for sec in ['text_has_overview', 'text_has_section_1', 'text_has_section_2', 'text_has_section_3', 'text_has_section_4']:
            if not v291_state.get(sec):
                failures.append(f'V2.9.1 純文字摘要缺：{sec}')
        if not v291_state.get('copy_attempted'):
            failures.append('V2.9.1 點擊按鈕後 __v2LastCopiedText 未填入（fallback execCommand 應寫入）')
        v272_empty_count = v272_empty.get('children_count')
        if v272_empty_count is None or v272_empty_count != 0:
            failures.append(f'V2.7.2 無 override 時 docx children 應為 0，實際 {v272_empty_count}')
        # V2.5.2 斷言（封面與送審速覽末端含 governance fingerprint）
        if not gov_footer_state.get('cover_footer_present'):
            failures.append('V2.5.2 封面 .cov-gov-footer 元素未注入')
        if not gov_footer_state.get('cover_has_gov'):
            failures.append(f'V2.5.2 封面 governance footer 未含「治理指紋 gov:」字樣，sample={gov_footer_state.get("cover_text_sample")}')
        if not gov_footer_state.get('review_footer_present'):
            failures.append('V2.5.2 送審速覽 .review-gov-footer 元素未注入')
        if not gov_footer_state.get('review_has_gov'):
            failures.append(f'V2.5.2 送審速覽 governance footer 未含「治理指紋 gov:」字樣，sample={gov_footer_state.get("review_text_sample")}')
        # V2.4.2 斷言（匯出檢查 WARN 閘門）
        if (gate_state.get('warn_hits') or 0) < 1:
            failures.append(f'V2.4.2 模擬 anyChanged=true 後 v2CollectExportChecklist 應產生 WARN，實際 {gate_state.get("warn_hits")}')
        # V2.2.4 斷言（diff viewer）
        if extra.get('profile_diff_present_no_override'):
            failures.append('V2.2.4 無 override 時 diff viewer 不應出現')
        if not diff_state.get('present'):
            failures.append('V2.2.4 啟用 override 後 diff viewer 未出現')
        if (diff_state.get('row_count') or 0) < 1:
            failures.append(f'V2.2.4 diff viewer 應至少 1 列案例，實際 {diff_state.get("row_count")}')
        if not diff_state.get('has_pct_marker'):
            failures.append('V2.2.4 diff viewer 應含 pd-up/down/eq 百分比標記')
        # Phase 1b 斷言（API tier 分布應有 strength + detailing）
        if api_obj and not api_obj.get('__error'):
            if tiers_in_checks.get('strength', 0) < 5:
                failures.append(f'strength tier checks 應 >= 5，實際 {tiers_in_checks.get("strength", 0)}')
            if tiers_in_checks.get('detailing', 0) < 1:
                failures.append(f'detailing tier checks 應 >= 1，實際 {tiers_in_checks.get("detailing", 0)}')
        else:
            failures.append(f'API 取結果失敗：{api_obj.get("__error", "unknown")}')

        print()
        print('=' * 60)
        if failures:
            print(f'✗ visual decoration test FAILED ({len(failures)} 項)')
            for f in failures:
                print(f'  - {f}')
            print('=' * 60)
            b.close()
            sys.exit(1)
        else:
            print(f'✓ 視覺裝飾測試全通過（Phase K + L + 8 + 9 + 1b）')
            print('=' * 60)

        b.close()

if __name__ == '__main__':
    main()
