# -*- coding: utf-8 -*-
"""Browser smoke test for the V2 UI dashboard and preview."""
from __future__ import annotations

import subprocess
import sys
import time
import urllib.error
import urllib.request

import server


ROOT_URL = 'http://127.0.0.1:8765'
TOOL_URL = f'{ROOT_URL}/石材固定/石材計算書產生器_規範版V2.html'
CHECK_MODAL_CLOSED_JS = """() => {
  const modal = document.querySelector('#v2-check-modal');
  return {
    hidden: modal?.getAttribute('aria-hidden') || '',
    focusInside: modal?.contains(document.activeElement) || false,
  };
}"""
FOCUS_FIRST_CHECK_MODAL_ITEM_JS = """() => {
  const modal = document.querySelector('#v2-check-modal');
  const focusable = Array.from(modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  focusable[0]?.focus({preventScroll:true});
}"""
VALIDATION_MODAL_CLOSED_JS = """() => {
  const modal = document.querySelector('#v2-validation-modal');
  return {
    hidden: modal?.getAttribute('aria-hidden') || '',
    focusInside: modal?.contains(document.activeElement) || false,
  };
}"""


def server_alive() -> bool:
    try:
        with urllib.request.urlopen(f'{ROOT_URL}/status', timeout=2) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def wait_for_server(timeout_sec: float = 8.0) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if server_alive():
            return True
        time.sleep(0.25)
    return False


def assert_check_modal_closed(page, label: str) -> None:
    page.wait_for_selector('#v2-check-modal.show', state='hidden', timeout=10000)
    page.wait_for_function(
        "() => document.activeElement?.classList.contains('dash-details')",
        timeout=10000,
    )
    state = page.evaluate(CHECK_MODAL_CLOSED_JS)
    if state != {'hidden': 'true', 'focusInside': False}:
        raise AssertionError(f'Expected {label} to restore focus outside modal: {state}')


def assert_validation_modal_closed(page, label: str) -> None:
    page.wait_for_selector('#v2-validation-modal.show', state='hidden', timeout=10000)
    page.wait_for_function(
        "() => document.activeElement?.id === 'v2_validation_open'",
        timeout=10000,
    )
    state = page.evaluate(VALIDATION_MODAL_CLOSED_JS)
    if state != {'hidden': 'true', 'focusInside': False}:
        raise AssertionError(f'Expected {label} to restore focus outside validation modal: {state}')


def main() -> int:
    started = None
    if not server_alive():
        started = subprocess.Popen(
            [sys.executable, 'server.py'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd='.',
        )
        if not wait_for_server():
            if started:
                started.terminate()
            print('UI smoke test failed: local server did not start.')
            return 1

    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.goto(TOOL_URL, wait_until='networkidle', timeout=60000)
            page.wait_for_selector('#review-dashboard .dash-card', timeout=30000)
            page.wait_for_function(
                """() => {
                  const text = document.querySelector('#review-dashboard')?.innerText || '';
                  return text.includes('伺服器') && !text.includes('確認中');
                }""",
                timeout=15000,
            )
            data = page.evaluate(
                """async () => ({
                  dashboard: document.querySelector('#review-dashboard')?.innerText || '',
                  header: document.querySelector('#tool-header')?.innerText || '',
                  cards: document.querySelectorAll('#review-dashboard .dash-card').length,
                  pages: document.querySelectorAll('#preview-sheets .a4').length,
                })"""
            )
            if data['cards'] < 10:
                raise AssertionError(f'Expected at least 10 dashboard cards, got {data["cards"]}')
            if data['pages'] < 1:
                raise AssertionError('Expected preview pages to render')
            if f'v{server.SERVER_VERSION} 一致' not in data['dashboard']:
                raise AssertionError('Expected dashboard to show server consistency')
            if f'V{server.SERVER_VERSION} 任務導向介面' not in data['header']:
                raise AssertionError('Expected header version to match server version')

            # Profile picker must update the editable values actually consumed by calc-core.
            # Use an isolated browser context so this stateful scenario cannot affect the
            # remaining dashboard and persistence checks in the main page.
            profile_context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            profile_page = profile_context.new_page()
            profile_page.goto(TOOL_URL, wait_until='networkidle', timeout=60000)
            profile_page.wait_for_selector('.ap-picker-select[data-scope="seismic"]', timeout=30000)
            profile_ids = profile_page.evaluate(
                """() => ({
                  defaultId: StoneCodeProfiles.DEFAULT_ACTIVE.seismic,
                  conservativeId: 'cns_seismic_113_conservative',
                  initialRp: document.getElementById('sp_seis_rp')?.value || '',
                })"""
            )
            if profile_ids != {
                'defaultId': 'cns_seismic_113',
                'conservativeId': 'cns_seismic_113_conservative',
                'initialRp': '2.5',
            }:
                raise AssertionError(f'Unexpected initial seismic profile state: {profile_ids}')

            seismic_picker = '.ap-picker-select[data-scope="seismic"]'
            profile_page.select_option(seismic_picker, profile_ids['conservativeId'])
            profile_page.wait_for_function(
                """profileId => {
                  const stored = JSON.parse(localStorage.getItem('stone_v2_profile_override') || '{}');
                  return stored.seismic === profileId
                    && document.getElementById('sp_seis_rp')?.value === '2'
                    && document.querySelector('.ap-picker-select[data-scope="seismic"]')?.value === profileId;
                }""",
                arg=profile_ids['conservativeId'],
                timeout=10000,
            )
            conservative_state = profile_page.evaluate(
                """() => ({
                  selected: document.querySelector('.ap-picker-select[data-scope="seismic"]')?.value || '',
                  stored: JSON.parse(localStorage.getItem('stone_v2_profile_override') || '{}').seismic || '',
                  rp: document.getElementById('sp_seis_rp')?.value || '',
                })"""
            )
            if conservative_state != {
                'selected': profile_ids['conservativeId'],
                'stored': profile_ids['conservativeId'],
                'rp': '2',
            }:
                raise AssertionError(f'Expected conservative profile to synchronize Rp: {conservative_state}')

            profile_page.select_option(seismic_picker, profile_ids['defaultId'])
            profile_page.wait_for_function(
                """() => {
                  const stored = JSON.parse(localStorage.getItem('stone_v2_profile_override') || '{}');
                  return !stored.seismic
                    && document.getElementById('sp_seis_rp')?.value === '2.5'
                    && document.querySelector('.ap-picker-select[data-scope="seismic"]')?.value === StoneCodeProfiles.DEFAULT_ACTIVE.seismic;
                }""",
                timeout=10000,
            )
            profile_page.evaluate("() => { document.getElementById('sp_seis_rp').value = '2.35'; }")
            profile_page.select_option(seismic_picker, profile_ids['conservativeId'])
            profile_page.wait_for_function(
                """profileId => {
                  const stored = JSON.parse(localStorage.getItem('stone_v2_profile_override') || '{}');
                  return stored.seismic === profileId
                    && document.querySelector('.ap-picker-select[data-scope="seismic"]')?.value === profileId;
                }""",
                arg=profile_ids['conservativeId'],
                timeout=10000,
            )
            preserved_rp = profile_page.locator('#sp_seis_rp').input_value()
            if preserved_rp != '2.35':
                raise AssertionError(f'Expected manual Rp override to be preserved, got {preserved_rp}')
            profile_context.close()

            # A saved/imported project owns its profile selection. Loading it in a
            # fresh browser must restore that selection before render/save can
            # overwrite the project, and a default/legacy project must clear an
            # unrelated browser override.
            project_profile_context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            project_profile_page = project_profile_context.new_page()
            project_profile_page.goto(TOOL_URL, wait_until='networkidle', timeout=60000)
            project_profile_page.wait_for_selector('.ap-picker-select[data-scope="seismic"]', timeout=30000)
            restored_project_state = project_profile_page.evaluate(
                """async () => {
                  const payload = await buildProjectPayload();
                  payload.inp.code_profiles = {seismic:'cns_seismic_113_conservative'};
                  payload.inp.sp_seis_rp = '2';
                  setStoredProjectRaw(JSON.stringify(payload));
                  load();
                  render();
                  await new Promise(resolve => setTimeout(resolve, 100));
                  const persisted = JSON.parse(getStoredProjectRaw().raw);
                  return {
                    projectProfile: persisted.inp.code_profiles?.seismic || '',
                    runtimeProfile: inputs().code_profiles?.seismic || '',
                    storedProfile: JSON.parse(localStorage.getItem(V2_PROFILE_OVERRIDE_KEY) || '{}').seismic || '',
                    selected: document.querySelector('.ap-picker-select[data-scope="seismic"]')?.value || '',
                    rp: document.getElementById('sp_seis_rp')?.value || '',
                  };
                }"""
            )
            expected_conservative_id = 'cns_seismic_113_conservative'
            expected_restored_project_state = {
                'projectProfile': expected_conservative_id,
                'runtimeProfile': expected_conservative_id,
                'storedProfile': expected_conservative_id,
                'selected': expected_conservative_id,
                'rp': '2',
            }
            if restored_project_state != expected_restored_project_state:
                raise AssertionError(
                    f'Expected saved project profile to replace fresh runtime state: {restored_project_state}'
                )

            migrated_profile_defaults = project_profile_page.evaluate(
                """async () => {
                  const payload = await buildProjectPayload();
                  payload.inp.code_profiles = {seismic:'cns_seismic_113_conservative'};
                  delete payload.inp.sp_ip_default;
                  delete payload.inp.sp_seis_ap;
                  delete payload.inp.sp_seis_rp;
                  setStoredProjectRaw(JSON.stringify(payload));
                  _v2MigrationToastShown = false;
                  load();
                  render();
                  v2DetectAndShowMigrationToast();
                  await new Promise(resolve => setTimeout(resolve, 100));
                  const persisted = JSON.parse(getStoredProjectRaw().raw);
                  return {
                    runtimeProfile: inputs().code_profiles?.seismic || '',
                    ip: document.getElementById('sp_ip_default')?.value || '',
                    ap: document.getElementById('sp_seis_ap')?.value || '',
                    rp: document.getElementById('sp_seis_rp')?.value || '',
                    appliedDefaults: persisted.meta?.applied_defaults || [],
                    persistStatus: persisted.meta?.migration_persist_status || '',
                    toastShown: document.getElementById('v2-migration-toast')?.classList.contains('show') || false,
                    toastHasActiveProfile: (document.getElementById('v2_migration_toast_body')?.innerText || '').includes('active profile'),
                  };
                }"""
            )
            expected_profile_default_fields = ['sp_ip_default', 'sp_seis_ap', 'sp_seis_rp']
            if migrated_profile_defaults != {
                'runtimeProfile': expected_conservative_id,
                'ip': '1.5',
                'ap': '1',
                'rp': '2',
                'appliedDefaults': expected_profile_default_fields,
                'persistStatus': 'saved',
                'toastShown': True,
                'toastHasActiveProfile': True,
            }:
                raise AssertionError(
                    f'Expected missing fields to follow active project profile: {migrated_profile_defaults}'
                )

            preserved_imported_manual_value = project_profile_page.evaluate(
                """async () => {
                  const payload = await buildProjectPayload();
                  payload.inp.code_profiles = {seismic:'cns_seismic_113_conservative'};
                  delete payload.inp.sp_ip_default;
                  delete payload.inp.sp_seis_ap;
                  payload.inp.sp_seis_rp = '2.35';
                  setStoredProjectRaw(JSON.stringify(payload));
                  load();
                  render();
                  await new Promise(resolve => setTimeout(resolve, 100));
                  const persisted = JSON.parse(getStoredProjectRaw().raw);
                  return {
                    ip: document.getElementById('sp_ip_default')?.value || '',
                    ap: document.getElementById('sp_seis_ap')?.value || '',
                    rp: document.getElementById('sp_seis_rp')?.value || '',
                    appliedDefaults: persisted.meta?.applied_defaults || [],
                  };
                }"""
            )
            if preserved_imported_manual_value != {
                'ip': '1.5',
                'ap': '1',
                'rp': '2.35',
                'appliedDefaults': ['sp_ip_default', 'sp_seis_ap'],
            }:
                raise AssertionError(
                    f'Expected explicit imported Rp to survive profile default migration: {preserved_imported_manual_value}'
                )

            cleared_legacy_state = project_profile_page.evaluate(
                """async () => {
                  const payload = await buildProjectPayload();
                  delete payload.inp.code_profiles;
                  payload.inp.sp_seis_rp = '2.5';
                  setStoredProjectRaw(JSON.stringify(payload));
                  load();
                  render();
                  await new Promise(resolve => setTimeout(resolve, 100));
                  const persisted = JSON.parse(getStoredProjectRaw().raw);
                  return {
                    projectProfile: persisted.inp.code_profiles?.seismic || '',
                    runtimeProfile: inputs().code_profiles?.seismic || '',
                    storagePresent: localStorage.getItem(V2_PROFILE_OVERRIDE_KEY) !== null,
                    selected: document.querySelector('.ap-picker-select[data-scope="seismic"]')?.value || '',
                    rp: document.getElementById('sp_seis_rp')?.value || '',
                  };
                }"""
            )
            expected_cleared_legacy_state = {
                'projectProfile': '',
                'runtimeProfile': '',
                'storagePresent': False,
                'selected': 'cns_seismic_113',
                'rp': '2.5',
            }
            if cleared_legacy_state != expected_cleared_legacy_state:
                raise AssertionError(
                    f'Expected default project to clear unrelated browser profile: {cleared_legacy_state}'
                )

            storage_failure_state = project_profile_page.evaluate(
                """() => {
                  const originalSetItem = Storage.prototype.setItem;
                  const originalNotify = window.v2Notify;
                  let storageAlerts = 0;
                  try {
                    localStorage.removeItem(V2_PROFILE_OVERRIDE_KEY);
                    _v2LastStorageAlertAt = 0;
                    window.v2Notify = msg => {
                      if (String(msg || '').includes('本機儲存空間不足')) storageAlerts += 1;
                    };
                    Storage.prototype.setItem = function(key, value) {
                      if (key === V2_PROFILE_OVERRIDE_KEY) {
                        const err = new Error('Quota exceeded');
                        err.name = 'QuotaExceededError';
                        throw err;
                      }
                      return originalSetItem.call(this, key, value);
                    };
                    v2SetRuntimeProfileOverride({seismic:'cns_seismic_113_conservative'});
                    return {
                      runtimeProfile: inputs().code_profiles?.seismic || '',
                      storagePresent: localStorage.getItem(V2_PROFILE_OVERRIDE_KEY) !== null,
                      storageAlerts,
                    };
                  } finally {
                    Storage.prototype.setItem = originalSetItem;
                    window.v2Notify = originalNotify;
                    v2SetRuntimeProfileOverride({}, {persist:false});
                  }
                }"""
            )
            expected_storage_failure_state = {
                'runtimeProfile': expected_conservative_id,
                'storagePresent': False,
                'storageAlerts': 1,
            }
            if storage_failure_state != expected_storage_failure_state:
                raise AssertionError(
                    f'Expected in-memory project profile to survive storage failure: {storage_failure_state}'
                )
            project_profile_context.close()

            keyboard_semantics = page.evaluate(
                """async () => ({
                  badAccordions: Array.from(document.querySelectorAll('#sidebar .acc-hd')).filter(el => el.getAttribute('role') !== 'button' || el.getAttribute('tabindex') !== '0' || !el.getAttribute('aria-controls') || !el.getAttribute('aria-expanded')).length,
                  badChips: Array.from(document.querySelectorAll('.chip')).filter(el => el.getAttribute('role') !== 'button' || el.getAttribute('tabindex') !== '0' || !el.hasAttribute('aria-pressed')).length,
                  badChipGroups: Array.from(document.querySelectorAll('.chips')).filter(el => el.getAttribute('role') !== 'group' || !el.getAttribute('aria-label')).length,
                  badMethods: Array.from(document.querySelectorAll('#v2_method_grid .v2-method-card')).filter(el => el.getAttribute('role') !== 'button' || el.getAttribute('tabindex') !== '0' || !el.hasAttribute('aria-pressed')).length,
                  badToggleButtons: Array.from(document.querySelectorAll('.v2-mode-switch .mode-btn,.v2-tier-bar .tier-btn')).filter(el => !el.hasAttribute('aria-pressed')).length,
                  toolbarRole: document.querySelector('#v2-toolbar')?.getAttribute('role') || '',
                  toolbarLabel: document.querySelector('#v2-toolbar')?.getAttribute('aria-label') || '',
                  methodGridRole: document.querySelector('#v2_method_grid')?.getAttribute('role') || '',
                  methodGridLabel: document.querySelector('#v2_method_grid')?.getAttribute('aria-label') || '',
                  tierGroupRole: document.querySelector('.v2-tier-bar')?.getAttribute('role') || '',
                  tierGroupLabel: document.querySelector('.v2-tier-bar')?.getAttribute('aria-label') || '',
                  modePressed: Array.from(document.querySelectorAll('.v2-mode-switch .mode-btn')).map(btn => `${btn.dataset.mode}:${btn.getAttribute('aria-pressed')}`).join('|'),
                  tierPressed: Array.from(document.querySelectorAll('.v2-tier-bar .tier-btn')).map(btn => `${btn.dataset.tier}:${btn.getAttribute('aria-pressed')}`).join('|'),
                  badIconToolbarButtons: Array.from(document.querySelectorAll('#v2-toolbar .mini')).filter(el => ['⌨','↶','↷'].includes(el.textContent.trim()) && !el.getAttribute('aria-label')).length,
                  toolbarShortcutKeys: Array.from(document.querySelectorAll('#v2-toolbar .mini')).filter(el => ['⌨','↶','↷'].includes(el.textContent.trim())).map(el => el.getAttribute('aria-keyshortcuts') || '').join('|'),
                  templateManagerPopup: document.querySelector('button[onclick="v2OpenTemplateManager()"]')?.getAttribute('aria-haspopup') || '',
                  templateManagerControls: document.querySelector('button[onclick="v2OpenTemplateManager()"]')?.getAttribute('aria-controls') || '',
                  shortcutControls: document.querySelector('#v2_shortcut_toggle')?.getAttribute('aria-controls') || '',
                  shortcutExpanded: document.querySelector('#v2_shortcut_toggle')?.getAttribute('aria-expanded') || '',
                  shortcutHintRole: document.querySelector('#v2-shortcut-hint')?.getAttribute('role') || '',
                  shortcutHintLabel: document.querySelector('#v2-shortcut-hint')?.getAttribute('aria-label') || '',
                  shortcutHintHidden: document.querySelector('#v2-shortcut-hint')?.getAttribute('aria-hidden') || '',
                  progressRole: document.querySelector('#v2-progress')?.getAttribute('role') || '',
                  progressLive: document.querySelector('#v2-progress')?.getAttribute('aria-live') || '',
                  progressHidden: document.querySelector('#v2-progress')?.getAttribute('aria-hidden') || '',
                  pdfApplyDefaultText: document.querySelector('#pdf_picker_apply')?.textContent.trim() || '',
                  pdfPickerRole: document.querySelector('#pdf_picker_modal')?.getAttribute('role') || '',
                  pdfPickerModal: document.querySelector('#pdf_picker_modal')?.getAttribute('aria-modal') || '',
                  pdfPickerHidden: document.querySelector('#pdf_picker_modal')?.getAttribute('aria-hidden') || '',
                  pdfPickerLabelledby: document.querySelector('#pdf_picker_modal')?.getAttribute('aria-labelledby') || '',
                  pdfPickerDescribedby: document.querySelector('#pdf_picker_modal')?.getAttribute('aria-describedby') || '',
                  badPdfPickerControls: Array.from(document.querySelectorAll('#pdf_picker_all,#pdf_picker_none,#pdf_picker_apply')).filter(el => el.getAttribute('aria-controls') !== 'pdf_picker_thumbs').length,
                  uiPreferenceStorageFailures: (() => {
                    const originalSetItem = Storage.prototype.setItem;
                    const originalNotify = window.v2Notify;
                    const oldMode = v2CurrentWorkflowMode();
                    const oldCollapsed = _v2DashboardCollapsed;
                    const oldModeStored = localStorage.getItem(V2_WORKFLOW_MODE_KEY);
                    const oldDashboardStored = localStorage.getItem('stone_review_dashboard_collapsed');
                    let alerts = 0;
                    try{
                      _v2LastStorageAlertAt = 0;
                      window.v2Notify = msg => { if(String(msg || '').includes('本機儲存空間不足')) alerts += 1; };
                      Storage.prototype.setItem = function(key, value){
                        if([V2_WORKFLOW_MODE_KEY, 'stone_review_dashboard_collapsed'].includes(key)){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalSetItem.call(this, key, value);
                      };
                      v2SetWorkflowMode(oldMode === 'full' ? 'basic' : 'full');
                      _v2LastStorageAlertAt = 0;
                      v2ToggleReviewDashboardCollapsed({preventDefault(){}, stopPropagation(){}});
                      return alerts === 2;
                    }finally{
                      Storage.prototype.setItem = originalSetItem;
                      window.v2Notify = originalNotify;
                      v2SetWorkflowMode(oldMode, {persist:false});
                      _v2DashboardCollapsed = oldCollapsed;
                      if(oldModeStored === null) localStorage.removeItem(V2_WORKFLOW_MODE_KEY);
                      else localStorage.setItem(V2_WORKFLOW_MODE_KEY, oldModeStored);
                      if(oldDashboardStored === null) localStorage.removeItem('stone_review_dashboard_collapsed');
                      else localStorage.setItem('stone_review_dashboard_collapsed', oldDashboardStored);
                      v2UpdateReviewDashboard(_v2DashboardLastInp || inputs(), _v2DashboardLastResults || [], false);
                    }
                  })(),
                  attachmentListEscapesAndLabels: (() => {
                    const html = attachmentListHtml([{name:'<b>x</b>"', src:'data:image/png;base64,AA" onerror="x', caption:'<script>x</script>'}], 'removeExtraImage', 'updateExtraImgCaption', 'empty');
                    const oldExtra = _extraImages;
                    _extraImages = [{ name:'keep-1', src:'data:image/png;base64,AA==', caption:'' }, { name:'keep-2', src:'data:image/png;base64,BB==', caption:'' }];
                    removeExtraImage(-1);
                    updateExtraImgCaption(9, 'bad');
                    const indexGuardOk = _extraImages.length === 2
                      && _extraImages[1].name === 'keep-2'
                      && _extraImages.every(img => img.caption === '');
                    _extraImages = oldExtra;
                    return html.includes('alt="&lt;b&gt;x&lt;/b&gt;&quot;"')
                      && html.includes('&lt;b&gt;x&lt;/b&gt;&quot;')
                      && html.includes('value="&lt;script&gt;x&lt;/script&gt;"')
                      && html.includes('aria-label="附件 1：&lt;b&gt;x&lt;/b&gt;&quot; 說明"')
                      && html.includes('aria-label="移除 附件 1：&lt;b&gt;x&lt;/b&gt;&quot;"')
                      && html.includes('src="data:image/png;base64,AA&quot; onerror=&quot;x"')
                      && v2IsValidAttachmentIndex([{x:1}], 0)
                      && !v2IsValidAttachmentIndex([{x:1}], -1)
                      && !v2IsValidAttachmentIndex([{x:1}], 1)
                      && indexGuardOk
                      && !html.includes('<b>x</b>')
                      && !html.includes('<script>x</script>');
                  })(),
                  extraPerPageNormalization: (() => {
                    const el = document.querySelector('#extra_per_page');
                    const oldValue = el?.value || '2';
                    if(el) el.value = '999';
                    const layoutFallback = extraLayout().perPage === 2;
                    if(el) el.value = oldValue;
                    return Array.isArray(V2_EXTRA_PER_PAGE_VALUES)
                      && V2_EXTRA_PER_PAGE_VALUES.join(',') === '1,2,4,6'
                      && v2NormalizeExtraPerPage(1) === 1
                      && v2NormalizeExtraPerPage('4') === 4
                      && v2NormalizeExtraPerPage(999) === 2
                      && v2NormalizeExtraPerPage('bad') === 2
                      && extraLayout({extra_per_page: 6}).perPage === 6
                      && layoutFallback;
                  })(),
                  extraAppendixSettingsUsePayload: (() => {
                    const onEl = document.querySelector('#extra_ann_on');
                    const titleEl = document.querySelector('#extra_ann_title');
                    const noteEl = document.querySelector('#extra_ann_note');
                    const oldOn = onEl?.checked || false;
                    const oldTitle = titleEl?.value || '';
                    const oldNote = noteEl?.value || '';
                    if(onEl) onEl.checked = true;
                    if(titleEl) titleEl.value = '<script>dom-title</script>';
                    if(noteEl) noteEl.value = '<script>dom-note</script>';
                    const payload = {
                      proj:'<b>payload-proj</b>',
                      extra_ann_on:false,
                      extra_ann_title:'Payload <b>Title</b>',
                      extra_ann_note:'Payload <script>Note</script>',
                      extra_per_page:6,
                    };
                    const tocHtml = toc(payload, 0, false, true, 'Z');
                    const appendixHtml = extraAppendix('Z', payload);
                    if(onEl) onEl.checked = oldOn;
                    if(titleEl) titleEl.value = oldTitle;
                    if(noteEl) noteEl.value = oldNote;
                    return !extraAppendixEnabled(payload)
                      && extraAppendixTitle(payload) === 'Payload <b>Title</b>'
                      && extraAppendixNote(payload) === 'Payload <script>Note</script>'
                      && tocHtml.includes('Payload &lt;b&gt;Title&lt;/b&gt;')
                      && appendixHtml.includes('Payload &lt;b&gt;Title&lt;/b&gt;')
                      && appendixHtml.includes('Payload &lt;script&gt;Note&lt;/script&gt;')
                      && !tocHtml.includes('<script>dom-title</script>')
                      && !appendixHtml.includes('<script>dom-note</script>');
                  })(),
                  extraAppendixEscapesAndLabels: (() => {
                    const oldImages = _extraImages;
                    const oldTitle = document.querySelector('#extra_ann_title')?.value || '';
                    const oldNote = document.querySelector('#extra_ann_note')?.value || '';
                    _extraImages = [{name:'<b>img</b>', src:'data:image/png;base64,BB" onerror="x', caption:'<script>cap</script>'}];
                    document.querySelector('#extra_ann_title').value = '<b>title</b>';
                    document.querySelector('#extra_ann_note').value = '<script>note</script>';
                    const html = extraAppendix('Z', {proj:'<b>proj</b>'});
                    _extraImages = oldImages;
                    document.querySelector('#extra_ann_title').value = oldTitle;
                    document.querySelector('#extra_ann_note').value = oldNote;
                    return html.includes('&lt;b&gt;proj&lt;/b&gt;')
                      && html.includes('&lt;b&gt;title&lt;/b&gt;')
                      && html.includes('alt="&lt;b&gt;img&lt;/b&gt;"')
                      && html.includes('src="data:image/png;base64,BB&quot; onerror=&quot;x"')
                      && html.includes('&lt;script&gt;cap&lt;/script&gt;')
                      && html.includes('&lt;script&gt;note&lt;/script&gt;')
                      && !html.includes('<b>proj</b>')
                      && !html.includes('<script>cap</script>');
                  })(),
                  certificateFrontmatterEscapesAndLabels: (() => {
                    const oldImages = _certImages;
                    _certImages = [{name:'<b>cert</b>', src:'data:image/png;base64,CC" onerror="x', caption:'<script>cert-cap</script>'}];
                    const html = certificateFrontmatter({proj:'<b>cert-proj</b>', cert_page_on:true});
                    _certImages = oldImages;
                    return html.includes('&lt;b&gt;cert-proj&lt;/b&gt;')
                      && html.includes('alt="&lt;b&gt;cert&lt;/b&gt;"')
                      && html.includes('src="data:image/png;base64,CC&quot; onerror=&quot;x"')
                      && html.includes('&lt;script&gt;cert-cap&lt;/script&gt;')
                      && !html.includes('<b>cert-proj</b>')
                      && !html.includes('<script>cert-cap</script>');
                  })(),
                  validationAndTemplateEscapes: await (async () => {
                    const oldTpl = localStorage.getItem(V2_USER_TPL_KEY);
                    const oldRefs = localStorage.getItem(V2_VALIDATION_KEY);
                    const originalConfirmAction = window.v2ConfirmAction;
                    window.v2ConfirmAction = async () => true;
                    localStorage.setItem(V2_USER_TPL_KEY, JSON.stringify([{
                      name:'<b>tpl</b>',
                      method:'bad"] .missing, [data-method="bk_4h',
                      saved:'2026-04-26<script>x</script>',
                      vals:{st_t:'30" autofocus onfocus="x', w_v:'37.5<script>x</script>', s_sds:'0.6<b>x</b>'}
                    }]));
                    v2RenderTemplateList();
                    const tplHtml = document.querySelector('#v2_tpl_list')?.innerHTML || '';
                    let selectorGuardOk = false;
                    try{
                      await window.v2LoadTemplate('__user__:0');
                      selectorGuardOk = v2MethodCardByKey('bad"] .missing, [data-method="bk_4h') === null
                        && v2TemplateOptionLabel('bad"]') === 'bad"]';
                    }catch(_err){
                      selectorGuardOk = false;
                    }
                    localStorage.setItem(V2_VALIDATION_KEY, JSON.stringify([{
                      id:'<b>ID</b>',
                      label:'<script>label</script>',
                      params:{},
                      caseParams:{},
                      expected:{Fph:'1" autofocus onfocus="x', Tmax:'<b>2</b>', Vmax:'3<script>x</script>', DCR:'4&5'}
                    }]));
                    v2RenderValidationTable();
                    const validationHtml = document.querySelector('#v2_validation_body')?.innerHTML || '';
                    if(oldTpl === null) localStorage.removeItem(V2_USER_TPL_KEY);
                    else localStorage.setItem(V2_USER_TPL_KEY, oldTpl);
                    if(oldRefs === null) localStorage.removeItem(V2_VALIDATION_KEY);
                    else localStorage.setItem(V2_VALIDATION_KEY, oldRefs);
                    window.v2ConfirmAction = originalConfirmAction;
                    v2RenderTemplateList();
                    return tplHtml.includes('&lt;b&gt;tpl&lt;/b&gt;')
                      && tplHtml.includes('bad"] .missing, [data-method="bk_4h')
                      && tplHtml.includes('30" autofocus onfocus="xmm')
                      && tplHtml.includes('37.5&lt;script&gt;x&lt;/script&gt;m/s')
                      && tplHtml.includes('0.6&lt;b&gt;x&lt;/b&gt;')
                      && selectorGuardOk
                      && !tplHtml.includes('<b>tpl</b>')
                      && !tplHtml.includes('data-method="bk_4h"')
                      && validationHtml.includes('&lt;b&gt;ID&lt;/b&gt;')
                      && validationHtml.includes('&lt;script&gt;label&lt;/script&gt;')
                      && validationHtml.includes('value="1&quot; autofocus onfocus=&quot;x"')
                      && validationHtml.includes('value="&lt;b&gt;2&lt;/b&gt;"')
                      && validationHtml.includes('value="3&lt;script&gt;x&lt;/script&gt;"')
                      && validationHtml.includes('value="4&amp;5"')
                      && !validationHtml.includes('<b>ID</b>')
                      && !validationHtml.includes('<script>label</script>');
                  })(),
                  storedArrayGuards: (() => {
                    const oldTpl = localStorage.getItem(V2_USER_TPL_KEY);
                    const oldRefs = localStorage.getItem(V2_VALIDATION_KEY);
                    const oldLog = localStorage.getItem(V2_CHANGE_LOG_KEY);
                    const originalSetItem = Storage.prototype.setItem;
                    const originalNotify = window.v2Notify;
                    let storageWriteFailuresReported = false;
                    localStorage.setItem(V2_USER_TPL_KEY, JSON.stringify({bad:true}));
                    localStorage.setItem(V2_VALIDATION_KEY, JSON.stringify({bad:true}));
                    localStorage.setItem(V2_CHANGE_LOG_KEY, JSON.stringify({bad:true}));
                    const objectFallbacks = Array.isArray(v2ReadUserTemplates())
                      && v2ReadUserTemplates().length === 0
                      && Array.isArray(v2LoadValidationRefs())
                      && v2LoadValidationRefs().length === V2_VALIDATION_DEFAULTS.length
                      && Array.isArray(v2ReadChangeLog())
                      && v2ReadChangeLog().length === 0;
                    localStorage.setItem(V2_USER_TPL_KEY, '{bad json');
                    localStorage.setItem(V2_VALIDATION_KEY, '{bad json');
                    localStorage.setItem(V2_CHANGE_LOG_KEY, '{bad json');
                    const parseFallbacks = Array.isArray(v2ReadUserTemplates())
                      && v2ReadUserTemplates().length === 0
                      && v2LoadValidationRefs().length === V2_VALIDATION_DEFAULTS.length
                      && v2ReadChangeLog().length === 0;
                    localStorage.setItem(V2_USER_TPL_KEY, JSON.stringify([null, 'bad', {name:'ok', vals:'bad'}]));
                    localStorage.setItem(V2_VALIDATION_KEY, JSON.stringify([null, 'bad', {id:'VX', label:'Case', expected:null}]));
                    localStorage.setItem(V2_CHANGE_LOG_KEY, JSON.stringify([null, 'bad', {rev:'r1', size:'12'}, {ts:'missing rev'}]));
                    const itemFallbacks = v2ReadUserTemplates().length === 1
                      && v2ReadUserTemplates()[0].name === 'ok'
                      && typeof v2ReadUserTemplates()[0].vals === 'object'
                      && v2LoadValidationRefs().length === 1
                      && v2LoadValidationRefs()[0].id === 'VX'
                      && typeof v2LoadValidationRefs()[0].expected === 'object'
                      && v2ReadChangeLog().length === 1
                      && v2ReadChangeLog()[0].rev === 'r1'
                      && v2ReadChangeLog()[0].size === 12;
                    try{
                      _v2LastStorageAlertAt = 0;
                      window.v2Notify = msg => { storageWriteFailuresReported = String(msg || '').includes('本機儲存空間不足'); };
                      Storage.prototype.setItem = function(key, value){
                        if([V2_USER_TPL_KEY, V2_VALIDATION_KEY, V2_CHANGE_LOG_KEY].includes(key)){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalSetItem.call(this, key, value);
                      };
                      storageWriteFailuresReported = v2WriteUserTemplates([{name:'x'}]) === false
                        && v2SaveValidationRefs(v2CloneJson(V2_VALIDATION_DEFAULTS)) === false
                        && storageWriteFailuresReported;
                    }finally{
                      Storage.prototype.setItem = originalSetItem;
                      window.v2Notify = originalNotify;
                    }
                    if(oldTpl === null) localStorage.removeItem(V2_USER_TPL_KEY);
                    else localStorage.setItem(V2_USER_TPL_KEY, oldTpl);
                    if(oldRefs === null) localStorage.removeItem(V2_VALIDATION_KEY);
                    else localStorage.setItem(V2_VALIDATION_KEY, oldRefs);
                    if(oldLog === null) localStorage.removeItem(V2_CHANGE_LOG_KEY);
                    else localStorage.setItem(V2_CHANGE_LOG_KEY, oldLog);
                    return objectFallbacks && parseFallbacks && itemFallbacks && storageWriteFailuresReported;
                  })(),
                  downloadFilenameGuards: (() => {
                    const longName = '專案'.repeat(100) + '.json';
                    return V2_DOWNLOAD_FILENAME_MAX === 180
                      && sanitizeFilename('A/B:C*D?E"F<G>H|I\\nJ') === 'A_B_C_D_E_F_G_H_I J'
                      && v2DownloadFilename('..bad/name?.json') === 'bad_name_.json'
                      && v2DownloadFilename(longName).endsWith('.json')
                      && v2DownloadFilename(longName).length <= V2_DOWNLOAD_FILENAME_MAX;
                  })(),
                  downloadBlobCleansUp: (() => {
                    const oldCreate = URL.createObjectURL;
                    const oldRevoke = URL.revokeObjectURL;
                    const oldClick = HTMLAnchorElement.prototype.click;
                    const oldSetTimeout = window.setTimeout;
                    let createdUrl = '';
                    let revokedUrl = '';
                    let clickedName = '';
                    try{
                      URL.createObjectURL = () => { createdUrl = 'blob:stone-test'; return createdUrl; };
                      URL.revokeObjectURL = url => { revokedUrl = url; };
                      HTMLAnchorElement.prototype.click = function(){ clickedName = this.download; };
                      window.setTimeout = fn => { fn(); return 1; };
                      const before = document.body.querySelectorAll('a[download]').length;
                      const ok = downloadBlob(new Blob(['ok'], { type:'text/plain' }), '../bad:name.txt') === true;
                      const after = document.body.querySelectorAll('a[download]').length;
                      return ok
                        && clickedName === '_bad_name.txt'
                        && createdUrl === 'blob:stone-test'
                        && revokedUrl === 'blob:stone-test'
                        && before === after;
                    }finally{
                      URL.createObjectURL = oldCreate;
                      URL.revokeObjectURL = oldRevoke;
                      HTMLAnchorElement.prototype.click = oldClick;
                      window.setTimeout = oldSetTimeout;
                    }
                  })(),
                  csvFormulaEscapes: (() => {
                    const oldDownloadBlob = window.downloadBlob;
                    let capturedName = '';
                    let capturedType = '';
                    window.downloadBlob = (blob, filename) => {
                      capturedName = filename;
                      capturedType = blob.type;
                    };
                    downloadCsv([csvLine(['=HYPERLINK(A1)', 'safe'])], 'safe.csv');
                    window.downloadBlob = oldDownloadBlob;
                    return csvSafeCell('=SUM(A1:A2)') === "'=SUM(A1:A2)"
                      && csvSafeCell('+cmd') === "'+cmd"
                      && csvSafeCell('-10+20') === "'-10+20"
                      && csvSafeCell('@HYPERLINK(A1)') === "'@HYPERLINK(A1)"
                      && csvSafeCell('  =1+1') === "'  =1+1"
                      && csvSafeCell('a,b') === '"a,b"'
                      && csvLine(['編號','案例說明','Fph_期望']).startsWith('編號,案例說明')
                      && csvLine(['ok', '=1+1', 'a"b']).includes("'=1+1")
                      && csvLine(['ok', '=1+1', 'a"b']).includes('"a""b"')
                      && csvBlob([csvLine(['=1+1'])]).type === 'text/csv;charset=utf-8'
                      && capturedName === 'safe.csv'
                      && capturedType === 'text/csv;charset=utf-8';
                  })(),
                  csvImportParsesQuotedNewlines: (() => {
                    const rows = v2ParseCsvText('name,tags\\n"案例一","A\\nB"\\n"案例二","C,D"');
                    return rows.length === 3
                      && rows[0][0] === 'name'
                      && rows[1][0] === '案例一'
                      && rows[1][1] === 'A\\nB'
                      && rows[2][0] === '案例二'
                      && rows[2][1] === 'C,D'
                      && v2ParseCsvLine('"A,B","C""D"').join('|') === 'A,B|C"D';
                  })(),
                  caseCsvImportGuards: (() => {
                    const csv = new File(['name,w\\nA,10'], 'cases.csv', { type: 'text/csv' });
                    const csvNoType = new File(['name,w\\nA,10'], 'cases.CSV', { type: '' });
                    const xlsCsv = new File(['name,w\\nA,10'], 'cases.xls', { type: 'application/vnd.ms-excel' });
                    const txt = new File(['name,w\\nA,10'], 'cases.txt', { type: 'text/plain' });
                    return document.querySelector('#v2_csv_import')?.getAttribute('accept') === '.csv'
                      && V2_CASE_CSV_MAX_BYTES === 2 * 1024 * 1024
                      && v2IsAllowedCaseCsvFile(csv)
                      && v2IsAllowedCaseCsvFile(csvNoType)
                      && v2IsAllowedCaseCsvFile(xlsCsv)
                      && !v2IsAllowedCaseCsvFile(txt);
                  })(),
                  uploadPreviewsUseDomNodes: (() => {
                    updateDiagramPreview('data:image/png;base64,AA==');
                    updateStampPreview('data:image/png;base64,AA==');
                    const diagram = document.querySelector('#diagram-preview img');
                    const stamp = document.querySelector('#stamp-preview img');
                    const imageOk = diagram?.getAttribute('alt') === '立面圖預覽'
                      && stamp?.getAttribute('alt') === '簽章預覽'
                      && diagram?.getAttribute('src') === 'data:image/png;base64,AA=='
                      && stamp?.getAttribute('src') === 'data:image/png;base64,AA==';
                    updateDiagramPreview(null);
                    updateStampPreview(null);
                    return imageOk
                      && document.querySelector('#diagram-preview')?.textContent.trim() === '未上傳'
                      && document.querySelector('#stamp-preview')?.textContent.trim() === '未上傳';
                  })(),
                  rasterImageGuards: (() => {
                    const rasterAccept = '.png,.jpg,.jpeg,.webp,.gif';
                    const rasterPdfAccept = `${rasterAccept},application/pdf,.pdf`;
                    const png = new File(['x'], 'ok.png', { type: 'image/png' });
                    const jpgNoType = new File(['x'], 'ok.jpg', { type: '' });
                    const svg = new File(['x'], 'bad.svg', { type: 'image/svg+xml' });
                    const html = new File(['x'], 'bad.html', { type: 'text/html' });
                    const pdf = new File(['%PDF-1.7'], 'attachment.pdf', { type: 'application/pdf' });
                    const bigRaster = { name:'large.png', size: V2_RASTER_IMAGE_MAX_BYTES + 1 };
                    const bigPdf = { name:'large.pdf', size: V2_PDF_ATTACHMENT_MAX_BYTES + 1 };
                    const oldStamp = localStorage.getItem(STAMP_KEY);
                    const oldDiagram = localStorage.getItem(DIAGRAM_KEY);
                    const oldExtra = _extraImages.slice();
                    const oldCert = _certImages.slice();
                    const oldCertOn = document.querySelector('#cert_page_on')?.checked;
                    const originalRemoveItem = Storage.prototype.removeItem;
                    const originalNotify = window.v2Notify;
                    let clearImageFailuresReported = false;
                    let storedCleanupFailureReported = false;
                    localStorage.setItem(STAMP_KEY, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
                    localStorage.setItem(DIAGRAM_KEY, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
                    const storedRejectsOldData = v2StoredRasterDataUrl(STAMP_KEY) === ''
                      && v2StoredRasterDataUrl(DIAGRAM_KEY) === ''
                      && !cover(inputs()).includes('data:image/svg+xml')
                      && !signatureStampHtml('engineer').includes('data:image/svg+xml');
                    v2NormalizeStoredRasterImages();
                    const storedCleanupRemovesOldData = localStorage.getItem(STAMP_KEY) === null
                      && localStorage.getItem(DIAGRAM_KEY) === null;
                    localStorage.setItem(STAMP_KEY, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
                    try{
                      _v2LastStorageAlertAt = 0;
                      window.v2Notify = msg => { storedCleanupFailureReported = String(msg || '').includes('本機儲存空間不足'); };
                      Storage.prototype.removeItem = function(key){
                        if(key === STAMP_KEY){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalRemoveItem.call(this, key);
                      };
                      v2NormalizeStoredRasterImages();
                    }finally{
                      Storage.prototype.removeItem = originalRemoveItem;
                      window.v2Notify = originalNotify;
                    }
                    _extraImages = [
                      { name:'bad-extra', src:'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', caption:'bad' },
                      { name:'good-extra', src:'data:image/png;base64,AA==', caption:'good' }
                    ];
                    _certImages = [
                      { name:'bad-cert', src:'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', caption:'bad' },
                      { name:'good-cert', src:'data:image/png;base64,AA==', caption:'good' }
                    ];
                    document.querySelector('#cert_page_on').checked = true;
                    v2NormalizeAttachmentStores();
                    const certHtml = certificateFrontmatter(inputs());
                    const attachmentStoresNormalized = _extraImages.length === 1
                      && _certImages.length === 1
                      && _extraImages[0].name === 'good-extra'
                      && _certImages[0].name === 'good-cert'
                      && certHtml.includes('data:image/png;base64,AA==')
                      && !certHtml.includes('data:image/svg+xml');
                    try{
                      _v2LastStorageAlertAt = 0;
                      window.v2Notify = msg => { clearImageFailuresReported = String(msg || '').includes('本機儲存空間不足'); };
                      Storage.prototype.removeItem = function(key){
                        if([STAMP_KEY, DIAGRAM_KEY].includes(key)){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalRemoveItem.call(this, key);
                      };
                      clearImageFailuresReported = clearDiagram() === false
                        && clearStamp() === false
                        && clearImageFailuresReported;
                    }finally{
                      Storage.prototype.removeItem = originalRemoveItem;
                      window.v2Notify = originalNotify;
                    }
                    if(oldStamp === null) localStorage.removeItem(STAMP_KEY);
                    else localStorage.setItem(STAMP_KEY, oldStamp);
                    if(oldDiagram === null) localStorage.removeItem(DIAGRAM_KEY);
                    else localStorage.setItem(DIAGRAM_KEY, oldDiagram);
                    _extraImages = oldExtra;
                    _certImages = oldCert;
                    document.querySelector('#cert_page_on').checked = Boolean(oldCertOn);
                    updateDiagramPreview('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
                    const fallback = document.querySelector('#diagram-preview')?.textContent.trim();
                    updateDiagramPreview(null);
                    return v2IsAllowedRasterImageFile(png)
                      && document.querySelector('#diagramFile')?.getAttribute('accept') === rasterAccept
                      && document.querySelector('#stampFile')?.getAttribute('accept') === rasterAccept
                      && document.querySelector('#extra_img_input')?.getAttribute('accept') === rasterPdfAccept
                      && document.querySelector('#cert_img_input')?.getAttribute('accept') === rasterPdfAccept
                      && v2IsAllowedRasterImageFile(jpgNoType)
                      && v2IsPdfAttachmentFile(pdf)
                      && V2_RASTER_IMAGE_MAX_BYTES === 5 * 1024 * 1024
                      && V2_PDF_ATTACHMENT_MAX_BYTES === 25 * 1024 * 1024
                      && V2_PDF_ATTACHMENT_MAX_PAGES === 30
                      && V2_PDF_SELECTION_MAX_PAGES === 12
                      && !v2FileWithinLimit(bigRaster, V2_RASTER_IMAGE_MAX_BYTES)
                      && !v2FileWithinLimit(bigPdf, V2_PDF_ATTACHMENT_MAX_BYTES)
                      && v2PdfPageCountWithinLimit(30)
                      && !v2PdfPageCountWithinLimit(31)
                      && v2PdfSelectionWithinLimit(12)
                      && !v2PdfSelectionWithinLimit(13)
                      && v2PdfRenderErrorMessage(new Error('boom')).includes('PDF 頁面轉圖失敗')
                      && v2PdfRenderErrorMessage(new Error('boom')).includes('boom')
                      && !v2IsAllowedRasterImageFile(svg)
                      && !v2IsAllowedRasterImageFile(html)
                      && v2IsSafeRasterDataUrl('data:image/png;base64,AA==')
                      && v2IsSafeRasterDataUrl('data:image/jpeg;base64,AA==')
                      && !v2IsSafeRasterDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')
                      && storedRejectsOldData
                      && storedCleanupRemovesOldData
                      && storedCleanupFailureReported
                      && attachmentStoresNormalized
                      && clearImageFailuresReported
                      && fallback === '不支援的圖片格式';
                  })(),
                  wordImageRejectsUnsafeData: (() => {
                    const bad = wordImageOrPlaceholder('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', '<b>x</b>', 'word-photo', '<b>fallback</b>');
                    const good = wordImageOrPlaceholder('data:image/png;base64,AA==', 'ok', 'word-photo', 'fallback');
                    return bad.includes('word-placeholder')
                      && bad.includes('&lt;b&gt;fallback&lt;/b&gt;')
                      && !bad.includes('data:image/svg+xml')
                      && good.includes('<img')
                      && good.includes('data:image/png;base64,AA==');
                  })(),
                  projectJsonImportGuards: await (async () => {
                    const json = new File(['{}'], 'project.json', { type: 'application/json' });
                    const jsonNoType = new File(['{}'], 'project.JSON', { type: '' });
                    const txt = new File(['{}'], 'project.txt', { type: 'text/plain' });
                    const legacyBefore = localStorage.getItem(STORAGE_KEY_LEGACY);
                    const canonicalBefore = localStorage.getItem(STORAGE_KEY);
                    const recoveryBefore = localStorage.getItem(STORAGE_RECOVERY_KEY);
                    localStorage.setItem(STORAGE_KEY_LEGACY, '{"schema":"stone-calc/test","inp":{}}');
                    const originalSetItem = Storage.prototype.setItem;
                    const originalRemoveItem = Storage.prototype.removeItem;
                    const originalNotify = window.v2Notify;
                    const originalConfirmAction = window.v2ConfirmAction;
                    const originalDownloadBlob = window.downloadBlob;
                    let storageErrorOk = false;
                    let storageAlertOk = false;
                    let recoveryRestoreDebug = {};
                    let migrationDebug = {};
                    let canonicalWriteSurvivesLegacyCleanupFailure = false;
                    let undoSnapshotUsesCanonicalStorage = false;
                    let recoveryBackupFailurePreservesData = false;
                    let recoveryCleanupFailurePreservesData = false;
                    let recoveryRestoreFailurePreservesCurrent = false;
                    let recoveryRestoreApplyFailurePreservesRecovery = false;
                    let recoveryRestoreCleanupFailurePreservesRecovery = false;
                    let recoveryRestoreConfirmShowsContext = false;
                    let recoveryRestoreConfirmReflectsCurrentState = false;
                    let projectImportBackupFailurePreservesCurrent = false;
                    let projectImportApplyFailurePreservesRecovery = false;
                    let recoveryDownloadFilenameIncludesContext = false;
                    let recoveryBrokenJsonDownloadsAsText = false;
                    let recoveryMalformedEnvelopeDownloadsAsText = false;
                    let recoveryInvalidEnvelopeDownloadsAsText = false;
                    let recoveryMissingPayloadDownloadsEnvelope = false;
                    let recoveryInvalidPayloadTypeDownloadsEnvelope = false;
                    let recoveryUnrecognizedJsonDownloadsAsText = false;
                    let recoveryDownloadReturnStatus = false;
                    let recoveryDownloadFailureReturnsFalse = false;
                    let recoveryCanRestoreChecks = false;
                    let recoveryActionButtonsAreLabelled = false;
                    let recoveryActionGroupIsLabelled = false;
                    let recoveryNoticeHasStatusSemantics = false;
                    let recoveryNoticeUsesProjectNameOnly = false;
                    let recoveryReasonLabelsAreReadable = false;
                    let clearRecoveryConfirmShowsContext = false;
                    let migrationPersistenceFailureStillLoads = false;
                    let clearRecoveryRequiresConfirm = false;
                    try{
                      window.v2Notify = msg => { storageAlertOk = String(msg || '').includes('本機儲存空間不足'); };
                      Storage.prototype.setItem = function(key, value){
                        if(key === STORAGE_KEY || key === STORAGE_RECOVERY_KEY){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalSetItem.call(this, key, value);
                      };
                      try{ setStoredProjectRaw('{"schema":"stone-calc/test","inp":{}}'); }
                      catch(err){
                        storageErrorOk = String(err.message || '').includes('本機儲存空間不足')
                          && localStorage.getItem(STORAGE_KEY_LEGACY) === '{"schema":"stone-calc/test","inp":{}}';
                      }
                      _v2LastStorageAlertAt = 0;
                      v2ReportStorageError(new DOMException('Quota exceeded', 'QuotaExceededError'));
                      recoveryBackupFailurePreservesData = backupStoredProjectRaw(STORAGE_KEY_LEGACY, '{"broken":', 'parse_error: test') === false
                        && localStorage.getItem(STORAGE_KEY_LEGACY) === '{"schema":"stone-calc/test","inp":{}}';
                    }finally{
                      Storage.prototype.setItem = originalSetItem;
                      window.v2Notify = originalNotify;
                    }
                    try{
                      localStorage.setItem(STORAGE_KEY_LEGACY, '{"schema":"stone-calc/legacy-cleanup","inp":{"proj":"OLD"}}');
                      _v2LastStorageAlertAt = 0;
                      window.v2Notify = msg => { storageAlertOk = storageAlertOk || String(msg || '').includes('本機儲存空間不足'); };
                      Storage.prototype.removeItem = function(key){
                        if(key === STORAGE_KEY_LEGACY){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalRemoveItem.call(this, key);
                      };
                      setStoredProjectRaw('{"schema":"stone-calc/new","inp":{"proj":"CANONICAL_OK"}}');
                      canonicalWriteSurvivesLegacyCleanupFailure = localStorage.getItem(STORAGE_KEY)?.includes('CANONICAL_OK')
                        && localStorage.getItem(STORAGE_KEY_LEGACY)?.includes('OLD');
                    }finally{
                      Storage.prototype.removeItem = originalRemoveItem;
                      window.v2Notify = originalNotify;
                    }
                    try{
                      localStorage.setItem(STORAGE_KEY, '{"schema":"stone-calc/new","inp":{"proj":"UNDO_SNAPSHOT"}}');
                      v2UndoStack = [];
                      v2RedoStack = ['stale'];
                      v2UndoSuspend = false;
                      v2SnapshotState();
                      _v2LastStorageAlertAt = 0;
                      window.v2Notify = msg => { storageAlertOk = storageAlertOk || String(msg || '').includes('本機儲存空間不足'); };
                      Storage.prototype.setItem = function(key, value){
                        if(key === STORAGE_KEY){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalSetItem.call(this, key, value);
                      };
                      undoSnapshotUsesCanonicalStorage = v2UndoStack.length === 1
                        && v2UndoStack[0].includes('UNDO_SNAPSHOT')
                        && v2RedoStack.length === 0
                        && v2ApplySnapshot('{"schema":"stone-calc/new","inp":{"proj":"UNDO_APPLY"}}') === false;
                      v2UndoStack = ['{"schema":"stone-calc/new","inp":{"proj":"UNDO_PREV"}}', '{"schema":"stone-calc/new","inp":{"proj":"UNDO_CURR"}}'];
                      v2RedoStack = [];
                      v2UndoRestore();
                      const undoFailureKeepsStacks = v2UndoStack.length === 2
                        && v2UndoStack[0].includes('UNDO_PREV')
                        && v2UndoStack[1].includes('UNDO_CURR')
                        && v2RedoStack.length === 0;
                      v2UndoStack = ['{"schema":"stone-calc/new","inp":{"proj":"REDO_BASE"}}'];
                      v2RedoStack = ['{"schema":"stone-calc/new","inp":{"proj":"REDO_NEXT"}}'];
                      v2RedoRestore();
                      const redoFailureKeepsStacks = v2UndoStack.length === 1
                        && v2UndoStack[0].includes('REDO_BASE')
                        && v2RedoStack.length === 1
                        && v2RedoStack[0].includes('REDO_NEXT');
                      undoSnapshotUsesCanonicalStorage = undoSnapshotUsesCanonicalStorage
                        && undoFailureKeepsStacks
                        && redoFailureKeepsStacks;
                      v2UndoSuspend = false;
                    }finally{
                      Storage.prototype.setItem = originalSetItem;
                      window.v2Notify = originalNotify;
                    }
                    try{
                      localStorage.setItem(STORAGE_KEY_LEGACY, '{"schema":"stone-calc/cleanup","inp":{"proj":"KEEP"}}');
                      _v2LastStorageAlertAt = 0;
                      window.v2Notify = msg => { storageAlertOk = storageAlertOk || String(msg || '').includes('本機儲存空間不足'); };
                      Storage.prototype.removeItem = function(key){
                        if(key === STORAGE_KEY_LEGACY){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalRemoveItem.call(this, key);
                      };
                      recoveryCleanupFailurePreservesData = backupStoredProjectRaw(STORAGE_KEY_LEGACY, '{"broken":', 'parse_error: cleanup') === false
                        && localStorage.getItem(STORAGE_KEY_LEGACY)?.includes('KEEP')
                        && getRecoveryProjectInfo()?.reason === 'parse_error: cleanup'
                        && _lastStoredProjectBackupStatus === 'cleanup_failed';
                    }finally{
                      Storage.prototype.removeItem = originalRemoveItem;
                      window.v2Notify = originalNotify;
                    }
                    try{
                      window.v2Notify = () => {};
                      localStorage.setItem(STORAGE_KEY, '{"schema":"stone-calc/current","inp":{"proj":"CURRENT"}}');
                      localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify({
                        source_key: STORAGE_KEY,
                        reason: 'pre_import_replace',
                        backed_up_at: new Date().toISOString(),
                        raw: '{"schema":"stone-calc/recovered","inp":{"proj":"RECOVERED"}}'
                      }));
                      Storage.prototype.setItem = function(key, value){
                        if(key === STORAGE_RECOVERY_KEY){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalSetItem.call(this, key, value);
                      };
                      let restoreConfirmMessage = '';
                      window.v2ConfirmAction = async msg => { restoreConfirmMessage = String(msg || ''); return false; };
                      const restoreCanceled = (await restoreRecoveryBackup()) === false;
                      recoveryRestoreConfirmShowsContext = restoreCanceled
                        && restoreConfirmMessage.includes('RECOVERED')
                        && restoreConfirmMessage.includes('備份原因')
                        && restoreConfirmMessage.includes('匯入新專案前')
                        && restoreConfirmMessage.includes('目前專案會先備份');
                      window.v2ConfirmAction = async () => true;
                      // Reset after the awaited cancel path: earlier UI scenarios may still
                      // finish an asynchronous auto-save while this monolithic smoke runs.
                      localStorage.setItem(STORAGE_KEY, '{"schema":"stone-calc/current","inp":{"proj":"CURRENT"}}');
                      const restorePromise = restoreRecoveryBackup({confirm:false});
                      const currentPreservedAtRestore = localStorage.getItem(STORAGE_KEY)?.includes('CURRENT');
                      const restoreResult = await restorePromise;
                      recoveryRestoreFailurePreservesCurrent = restoreResult === false && currentPreservedAtRestore;
                      recoveryRestoreDebug = {
                        restoreCanceled,
                        restoreConfirmMessage,
                        restoreResult,
                        currentPreservedAtRestore,
                        recoveryPreserved: localStorage.getItem(STORAGE_RECOVERY_KEY)?.includes('RECOVERED') || false,
                      };
                    }finally{
                      Storage.prototype.setItem = originalSetItem;
                      window.v2Notify = originalNotify;
                      window.v2ConfirmAction = originalConfirmAction;
                    }
                    try{
                      window.v2Notify = () => {};
                      localStorage.setItem(STORAGE_KEY, '{"schema":"stone-calc/current","inp":{"proj":"CURRENT_RESTORE_APPLY"}}');
                      localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify({
                        source_key: STORAGE_KEY,
                        reason: 'pre_import_replace',
                        backed_up_at: new Date().toISOString(),
                        raw: '{"schema":"stone-calc/recovered","inp":{"proj":"RECOVERED_APPLY"}}'
                      }));
                      const recoveryBeforeApply = localStorage.getItem(STORAGE_RECOVERY_KEY);
                      Storage.prototype.setItem = function(key, value){
                        if(key === STORAGE_KEY){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalSetItem.call(this, key, value);
                      };
                      recoveryRestoreApplyFailurePreservesRecovery = (await restoreRecoveryBackup({confirm:false})) === false
                        && localStorage.getItem(STORAGE_KEY)?.includes('CURRENT_RESTORE_APPLY')
                        && localStorage.getItem(STORAGE_RECOVERY_KEY) === recoveryBeforeApply;
                    }finally{
                      Storage.prototype.setItem = originalSetItem;
                      window.v2Notify = originalNotify;
                    }
                    try{
                      window.v2Notify = () => {};
                      localStorage.removeItem(STORAGE_KEY);
                      localStorage.removeItem(STORAGE_KEY_LEGACY);
                      localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify({
                        source_key: STORAGE_KEY,
                        reason: 'parse_error: restore-cleanup',
                        backed_up_at: new Date().toISOString(),
                        raw: '{"schema":"stone-calc/recovered","inp":{"proj":"RECOVERED_CLEANUP"}}'
                      }));
                      Storage.prototype.removeItem = function(key){
                        if(key === STORAGE_RECOVERY_KEY){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalRemoveItem.call(this, key);
                      };
                      let noCurrentRestoreConfirm = '';
                      window.v2ConfirmAction = async msg => { noCurrentRestoreConfirm = String(msg || ''); return false; };
                      await restoreRecoveryBackup();
                      recoveryRestoreConfirmReflectsCurrentState = noCurrentRestoreConfirm.includes('目前沒有可辨識的專案可先備份')
                        && !noCurrentRestoreConfirm.includes('目前專案會先備份');
                      window.v2ConfirmAction = async () => true;
                      await restoreRecoveryBackup({confirm:false});
                      recoveryRestoreCleanupFailurePreservesRecovery = localStorage.getItem(STORAGE_RECOVERY_KEY)?.includes('RECOVERED_CLEANUP')
                        && !localStorage.getItem(STORAGE_KEY)?.includes('RECOVERED_CLEANUP');
                    }finally{
                      Storage.prototype.removeItem = originalRemoveItem;
                      window.v2Notify = originalNotify;
                      window.v2ConfirmAction = originalConfirmAction;
                    }
                    try{
                      window.v2Notify = () => {};
                      localStorage.setItem(STORAGE_KEY, '{"schema":"stone-calc/current","inp":{"proj":"CURRENT_IMPORT"}}');
                      Storage.prototype.setItem = function(key, value){
                        if(key === STORAGE_RECOVERY_KEY){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalSetItem.call(this, key, value);
                      };
                      try{
                        v2ImportProjectText('{"schema":"stone-calc/new","inp":{"proj":"NEW_IMPORT"}}', 'pre_import_replace');
                      }catch(err){
                        projectImportBackupFailurePreservesCurrent = String(err.message || '').includes('匯入前無法備份目前專案')
                          && localStorage.getItem(STORAGE_KEY)?.includes('CURRENT_IMPORT');
                      }
                    }finally{
                      Storage.prototype.setItem = originalSetItem;
                      window.v2Notify = originalNotify;
                    }
                    try{
                      window.v2Notify = () => {};
                      localStorage.setItem(STORAGE_KEY, '{"schema":"stone-calc/current","inp":{"proj":"CURRENT_IMPORT_APPLY"}}');
                      localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify({
                        source_key: STORAGE_KEY,
                        reason: 'pre_existing_recovery',
                        backed_up_at: new Date().toISOString(),
                        raw: '{"schema":"stone-calc/recovered","inp":{"proj":"RECOVERY_IMPORT_APPLY"}}'
                      }));
                      const recoveryBeforeImportApply = localStorage.getItem(STORAGE_RECOVERY_KEY);
                      Storage.prototype.setItem = function(key, value){
                        if(key === STORAGE_KEY){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalSetItem.call(this, key, value);
                      };
                      try{
                        v2ImportProjectText('{"schema":"stone-calc/new","inp":{"proj":"NEW_IMPORT_APPLY"}}', 'pre_import_replace');
                      }catch(err){
                        projectImportApplyFailurePreservesRecovery = String(err.message || '').includes('本機儲存空間不足')
                          && localStorage.getItem(STORAGE_KEY)?.includes('CURRENT_IMPORT_APPLY')
                          && localStorage.getItem(STORAGE_RECOVERY_KEY) === recoveryBeforeImportApply;
                      }
                    }finally{
                      Storage.prototype.setItem = originalSetItem;
                      window.v2Notify = originalNotify;
                    }
                    try{
                      window.v2Notify = () => {};
                      localStorage.removeItem(STORAGE_KEY);
                      localStorage.setItem(STORAGE_KEY_LEGACY, '{"schema":"stone-calc/legacy","inp":{"proj":"LOAD_CONTINUES"},"cases":[]}');
                      Storage.prototype.setItem = function(key, value){
                        if(key === STORAGE_KEY){
                          const err = new Error('Quota exceeded');
                          err.name = 'QuotaExceededError';
                          throw err;
                        }
                        return originalSetItem.call(this, key, value);
                      };
                      load();
                      const migrationExportChecklistWarns = v2CollectExportChecklist({
                        inp: inputs(),
                        results: [],
                        cases: [{ name: '案例1' }],
                        meta: { migration_persist_status: 'failed' }
                      }).some(item => item.text.includes('匯出前請先下載專案 JSON'));
                      migrationPersistenceFailureStillLoads = document.getElementById('c_proj')?.value === 'LOAD_CONTINUES'
                        && _projectMigrationInfo?.migration_persist_status === 'failed'
                        && projectTraceabilityNotesInternal().some(note => note.includes('本機儲存寫回失敗'))
                        && migrationExportChecklistWarns;
                      migrationDebug = {
                        project: document.getElementById('c_proj')?.value || '',
                        persistStatus: _projectMigrationInfo?.migration_persist_status || '',
                        traceNotes: projectTraceabilityNotesInternal(),
                        migrationExportChecklistWarns,
                      };
                    }finally{
                      Storage.prototype.setItem = originalSetItem;
                      window.v2Notify = originalNotify;
                    }
                    try{
                      localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify({
                        source_key: STORAGE_KEY,
                        reason: 'pre_import_replace',
                        backed_up_at: new Date().toISOString(),
                        raw: '{"schema":"stone-calc/recovery-clear","inp":{"proj":"RECOVERY_EXPORT"}}'
                      }));
                      let downloadedRecoveryName = '';
                      window.downloadBlob = (_blob, filename) => { downloadedRecoveryName = filename; return true; };
                      refreshRecoveryNotice();
                      const recoveryNotice = document.querySelector('#recovery_notice');
                      recoveryNoticeHasStatusSemantics = recoveryNotice?.getAttribute('role') === 'status'
                        && recoveryNotice?.getAttribute('aria-live') === 'polite'
                        && recoveryNotice?.getAttribute('aria-label') === '隔離備份提示';
                      const labelledRecoveryActions = Array.from(document.querySelectorAll('#recovery_notice .recovery-actions button'))
                        .every(btn => Boolean(btn.getAttribute('aria-label')));
                      const recoveryActionGroup = document.querySelector('#recovery_notice .recovery-actions');
                      recoveryActionGroupIsLabelled = recoveryActionGroup?.getAttribute('role') === 'group'
                        && recoveryActionGroup?.getAttribute('aria-label') === '隔離備份操作';
                      const recoveryDownloadOk = downloadRecoveryBackup() === true;
                      recoveryCanRestoreChecks = recoveryBackupCanRestore(getRecoveryProjectInfo()) === true;
                      recoveryDownloadFilenameIncludesContext = downloadedRecoveryName.includes('RECOVERY_EXPORT')
                        && downloadedRecoveryName.includes('匯入前備份')
                        && !downloadedRecoveryName.includes('pre_import_replace')
                        && downloadedRecoveryName.endsWith('.json')
                        && recoveryDownloadOk;
                      localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify({
                        source_key: STORAGE_KEY,
                        reason: 'parse_error: smoke',
                        backed_up_at: new Date().toISOString(),
                        raw: '{"schema":"stone-calc/broken"'
                      }));
                      downloadedRecoveryName = '';
                      downloadRecoveryBackup();
                      recoveryBrokenJsonDownloadsAsText = downloadedRecoveryName.includes('資料解析失敗')
                        && downloadedRecoveryName.endsWith('.txt')
                        && !downloadedRecoveryName.endsWith('.json');
                      localStorage.setItem(STORAGE_RECOVERY_KEY, '{"source_key":');
                      downloadedRecoveryName = '';
                      refreshRecoveryNotice();
                      downloadRecoveryBackup();
                      const malformedInfo = getRecoveryProjectInfo();
                      recoveryMalformedEnvelopeDownloadsAsText = malformedInfo?.malformedEnvelope === true
                        && malformedInfo?.raw === '{"source_key":'
                        && downloadedRecoveryName.includes('隔離索引損壞')
                        && downloadedRecoveryName.endsWith('.txt')
                        && !downloadedRecoveryName.endsWith('.json')
                        && !document.querySelector('#recovery_notice .btn-blue');
                      const malformedRecoveryActions = Array.from(document.querySelectorAll('#recovery_notice .recovery-actions button'));
                      recoveryActionButtonsAreLabelled = labelledRecoveryActions
                        && malformedRecoveryActions.length === 2
                        && malformedRecoveryActions.every(btn => Boolean(btn.getAttribute('aria-label')));
                      localStorage.setItem(STORAGE_RECOVERY_KEY, '"not-an-envelope"');
                      downloadedRecoveryName = '';
                      downloadRecoveryBackup();
                      const invalidEnvelopeInfo = getRecoveryProjectInfo();
                      recoveryInvalidEnvelopeDownloadsAsText = invalidEnvelopeInfo?.malformedEnvelope === true
                        && invalidEnvelopeInfo?.reason === 'recovery_metadata_invalid'
                        && invalidEnvelopeInfo?.raw === '"not-an-envelope"'
                        && downloadedRecoveryName.includes('隔離索引格式不符')
                        && downloadedRecoveryName.endsWith('.txt')
                        && recoveryBackupCanRestore(invalidEnvelopeInfo) === false;
                      const missingPayloadEnvelope = JSON.stringify({
                        source_key: STORAGE_KEY,
                        reason: 'pre_import_replace',
                        backed_up_at: new Date().toISOString()
                      });
                      localStorage.setItem(STORAGE_RECOVERY_KEY, missingPayloadEnvelope);
                      downloadedRecoveryName = '';
                      downloadRecoveryBackup();
                      const missingPayloadInfo = getRecoveryProjectInfo();
                      recoveryMissingPayloadDownloadsEnvelope = missingPayloadInfo?.malformedEnvelope === true
                        && missingPayloadInfo?.reason === 'recovery_payload_missing'
                        && missingPayloadInfo?.raw === missingPayloadEnvelope
                        && downloadedRecoveryName.includes('隔離內容缺漏')
                        && downloadedRecoveryName.endsWith('.txt')
                        && recoveryBackupCanRestore(missingPayloadInfo) === false;
                      const invalidPayloadTypeEnvelope = JSON.stringify({
                        source_key: STORAGE_KEY,
                        reason: 'pre_import_replace',
                        backed_up_at: new Date().toISOString(),
                        raw: { schema: 'stone-calc/not-string' }
                      });
                      localStorage.setItem(STORAGE_RECOVERY_KEY, invalidPayloadTypeEnvelope);
                      downloadedRecoveryName = '';
                      downloadRecoveryBackup();
                      const invalidPayloadTypeInfo = getRecoveryProjectInfo();
                      recoveryInvalidPayloadTypeDownloadsEnvelope = invalidPayloadTypeInfo?.malformedEnvelope === true
                        && invalidPayloadTypeInfo?.reason === 'recovery_payload_type_invalid'
                        && invalidPayloadTypeInfo?.raw === invalidPayloadTypeEnvelope
                        && downloadedRecoveryName.includes('隔離內容型別不符')
                        && downloadedRecoveryName.endsWith('.txt')
                        && recoveryBackupCanRestore(invalidPayloadTypeInfo) === false;
                      recoveryCanRestoreChecks = recoveryCanRestoreChecks
                        && recoveryBackupCanRestore(malformedInfo) === false
                        && recoveryBackupCanRestore(invalidEnvelopeInfo) === false
                        && recoveryBackupCanRestore(missingPayloadInfo) === false
                        && recoveryBackupCanRestore(invalidPayloadTypeInfo) === false;
                      localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify({
                        source_key: STORAGE_KEY,
                        reason: 'unrecognized_project_payload',
                        backed_up_at: new Date().toISOString(),
                        raw: '{"hello":"world"}'
                      }));
                      downloadedRecoveryName = '';
                      downloadRecoveryBackup();
                      recoveryUnrecognizedJsonDownloadsAsText = downloadedRecoveryName.includes('格式不明')
                        && downloadedRecoveryName.endsWith('.txt')
                        && !downloadedRecoveryName.endsWith('.json');
                      localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify({
                        source_key: STORAGE_KEY,
                        reason: 'pre_import_replace',
                        backed_up_at: new Date().toISOString(),
                        raw: '{"schema":"stone-calc/blank-name","inp":{"proj":"   "}}'
                      }));
                      refreshRecoveryNotice();
                      recoveryNoticeUsesProjectNameOnly = !document.querySelector('#recovery_notice')?.textContent.includes('備份專案：');
                      localStorage.removeItem(STORAGE_RECOVERY_KEY);
                      recoveryDownloadReturnStatus = downloadRecoveryBackup() === false;
                      localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify({
                        source_key: STORAGE_KEY,
                        reason: 'pre_import_replace',
                        backed_up_at: new Date().toISOString(),
                        raw: '{"schema":"stone-calc/recovery-clear","inp":{"proj":"RECOVERY_EXPORT"}}'
                      }));
                      window.downloadBlob = () => { throw new Error('download blocked'); };
                      recoveryDownloadFailureReturnsFalse = downloadRecoveryBackup() === false;
                      window.downloadBlob = (_blob, filename) => { downloadedRecoveryName = filename; return true; };
                      recoveryReasonLabelsAreReadable = recoveryReasonLabel('hash_import_replace').includes('分享連結')
                        && !recoveryReasonLabel('hash_import_replace').includes('hash_import_replace')
                        && recoveryReasonLabel('unrecognized_project_payload').includes('不是石材計算書專案格式')
                        && recoveryReasonLabel('recovery_metadata_parse_error').includes('索引資料已損壞')
                        && recoveryReasonLabel('recovery_payload_type_invalid').includes('內容型別不符');
                      let confirmMessage = '';
                      window.v2ConfirmAction = async msg => { confirmMessage = String(msg || ''); return false; };
                      const canceled = (await clearRecoveryBackup()) === false && localStorage.getItem(STORAGE_RECOVERY_KEY) !== null;
                      clearRecoveryConfirmShowsContext = confirmMessage.includes('RECOVERY_EXPORT')
                        && confirmMessage.includes('備份原因')
                        && confirmMessage.includes('匯入新專案前');
                      window.v2ConfirmAction = async () => true;
                      const cleared = (await clearRecoveryBackup()) === true && localStorage.getItem(STORAGE_RECOVERY_KEY) === null;
                      clearRecoveryRequiresConfirm = canceled && cleared;
                    }finally{
                      window.v2ConfirmAction = originalConfirmAction;
                      window.downloadBlob = originalDownloadBlob;
                      Storage.prototype.setItem = originalSetItem;
                      window.v2Notify = originalNotify;
                      if(canonicalBefore === null) localStorage.removeItem(STORAGE_KEY);
                      else localStorage.setItem(STORAGE_KEY, canonicalBefore);
                      if(legacyBefore === null) localStorage.removeItem(STORAGE_KEY_LEGACY);
                      else localStorage.setItem(STORAGE_KEY_LEGACY, legacyBefore);
                      if(recoveryBefore === null) localStorage.removeItem(STORAGE_RECOVERY_KEY);
                      else localStorage.setItem(STORAGE_RECOVERY_KEY, recoveryBefore);
                    }
                    const checks = {
                      importAccept: document.querySelector('#importFile')?.getAttribute('accept') === '.json',
                      maxBytes: V2_PROJECT_JSON_MAX_BYTES === 10 * 1024 * 1024,
                      allowsJson: v2IsAllowedProjectJsonFile(json),
                      allowsJsonWithoutMime: v2IsAllowedProjectJsonFile(jsonNoType),
                      rejectsText: !v2IsAllowedProjectJsonFile(txt),
                      acceptsSmallText: v2ProjectJsonTextWithinLimit('{}'),
                      rejectsOversizedText: !v2ProjectJsonTextWithinLimit('x'.repeat(V2_PROJECT_JSON_MAX_BYTES + 1)),
                      decodesUtf8Base64: v2DecodeBase64Utf8('eyJ4Ijoi5bCI5qGIIn0=') === '{"x":"專案"}',
                      importFunctionExists: typeof v2ImportProjectText === 'function',
                      storageErrorOk,
                      storageAlertOk,
                      canonicalWriteSurvivesLegacyCleanupFailure,
                      undoSnapshotUsesCanonicalStorage,
                      recoveryBackupFailurePreservesData,
                      recoveryCleanupFailurePreservesData,
                      recoveryRestoreFailurePreservesCurrent,
                      recoveryRestoreApplyFailurePreservesRecovery,
                      recoveryRestoreCleanupFailurePreservesRecovery,
                      recoveryRestoreConfirmShowsContext,
                      recoveryRestoreConfirmReflectsCurrentState,
                      projectImportBackupFailurePreservesCurrent,
                      projectImportApplyFailurePreservesRecovery,
                      recoveryDownloadFilenameIncludesContext,
                      recoveryBrokenJsonDownloadsAsText,
                      recoveryMalformedEnvelopeDownloadsAsText,
                      recoveryInvalidEnvelopeDownloadsAsText,
                      recoveryMissingPayloadDownloadsEnvelope,
                      recoveryInvalidPayloadTypeDownloadsEnvelope,
                      recoveryUnrecognizedJsonDownloadsAsText,
                      recoveryDownloadReturnStatus,
                      recoveryDownloadFailureReturnsFalse,
                      recoveryCanRestoreChecks,
                      recoveryActionButtonsAreLabelled,
                      recoveryActionGroupIsLabelled,
                      recoveryNoticeHasStatusSemantics,
                      recoveryNoticeUsesProjectNameOnly,
                      recoveryReasonLabelsAreReadable,
                      clearRecoveryConfirmShowsContext,
                      migrationPersistenceFailureStillLoads,
                      clearRecoveryRequiresConfirm,
                    };
                    const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
                    return {
                      ok: failed.length === 0,
                      failed,
                      debug: failed.length ? { recoveryRestoreDebug, migrationDebug } : {},
                    };
                  })(),
                  badCaseIconButtons: Array.from(document.querySelectorAll('.case-card button')).filter(el => ['📋','✕'].includes(el.textContent.trim()) && !el.getAttribute('aria-label')).length,
                  badZoomButtons: Array.from(document.querySelectorAll('#v2_method_grid .zoom-btn')).filter(el => !el.getAttribute('aria-label')).length,
                  searchLabel: document.querySelector('#v2-search')?.getAttribute('aria-label') || '',
                  statusRole: document.querySelector('#v2-status-pill')?.getAttribute('role') || '',
                  statusTab: document.querySelector('#v2-status-pill')?.getAttribute('tabindex') || '',
                  statusPopup: document.querySelector('#v2-status-pill')?.getAttribute('aria-haspopup') || '',
                  statusControls: document.querySelector('#v2-status-pill')?.getAttribute('aria-controls') || '',
                  statusLabel: document.querySelector('#v2-status-pill')?.getAttribute('aria-label') || '',
                })"""
            )
            if keyboard_semantics['badAccordions'] != 0 or keyboard_semantics['badChips'] != 0 or keyboard_semantics['badChipGroups'] != 0 or keyboard_semantics['badMethods'] != 0 or keyboard_semantics['badToggleButtons'] != 0:
                raise AssertionError(f'Expected interactive div controls to expose keyboard semantics: {keyboard_semantics}')
            if keyboard_semantics['toolbarRole'] != 'toolbar' or keyboard_semantics['toolbarLabel'] != '快速工具列':
                raise AssertionError(f'Expected quick toolbar to expose a named toolbar landmark: {keyboard_semantics}')
            if keyboard_semantics['methodGridRole'] != 'group' or keyboard_semantics['methodGridLabel'] != '主要固定工法':
                raise AssertionError(f'Expected method picker to expose a named group: {keyboard_semantics}')
            if keyboard_semantics['tierGroupRole'] != 'group' or keyboard_semantics['tierGroupLabel'] != '規範模組篩選':
                raise AssertionError(f'Expected tier picker to expose a named group: {keyboard_semantics}')
            if 'basic:true' not in keyboard_semantics['modePressed'] or 'full:false' not in keyboard_semantics['modePressed'] or 'core:true' not in keyboard_semantics['tierPressed']:
                raise AssertionError(f'Expected default workflow/tier pressed states: {keyboard_semantics}')
            if keyboard_semantics['badIconToolbarButtons'] != 0:
                raise AssertionError(f'Expected icon-only toolbar buttons to expose readable labels: {keyboard_semantics}')
            if keyboard_semantics['toolbarShortcutKeys'] != 'F1|Control+Z|Control+Y':
                raise AssertionError(f'Expected toolbar shortcut buttons to expose aria-keyshortcuts: {keyboard_semantics}')
            if keyboard_semantics['templateManagerPopup'] != 'dialog' or keyboard_semantics['templateManagerControls'] != 'v2-tpl-mgr':
                raise AssertionError(f'Expected template manager trigger to expose dialog target: {keyboard_semantics}')
            if keyboard_semantics['shortcutControls'] != 'v2-shortcut-hint' or keyboard_semantics['shortcutExpanded'] != 'false':
                raise AssertionError(f'Expected shortcut hint trigger to expose controlled collapsed state: {keyboard_semantics}')
            if keyboard_semantics['shortcutHintRole'] != 'region' or keyboard_semantics['shortcutHintLabel'] != '快捷鍵說明' or keyboard_semantics['shortcutHintHidden'] != 'true':
                raise AssertionError(f'Expected shortcut hint to expose hidden labelled region state: {keyboard_semantics}')
            if keyboard_semantics['progressRole'] != 'status' or keyboard_semantics['progressLive'] != 'polite' or keyboard_semantics['progressHidden'] != 'true':
                raise AssertionError(f'Expected progress overlay to expose hidden live status semantics: {keyboard_semantics}')
            if keyboard_semantics['pdfApplyDefaultText'] != '加入所選頁面':
                raise AssertionError(f'Expected PDF picker apply button to expose stable default text: {keyboard_semantics}')
            if keyboard_semantics['pdfPickerRole'] != 'dialog' or keyboard_semantics['pdfPickerModal'] != 'true' or keyboard_semantics['pdfPickerHidden'] != 'true' or keyboard_semantics['pdfPickerLabelledby'] != 'pdf_picker_title' or keyboard_semantics['pdfPickerDescribedby'] != 'pdf_picker_thumbs':
                raise AssertionError(f'Expected PDF picker to expose hidden dialog semantics: {keyboard_semantics}')
            if keyboard_semantics['badPdfPickerControls'] != 0:
                raise AssertionError(f'Expected PDF picker controls to reference the thumbnail list: {keyboard_semantics}')
            if not keyboard_semantics['uiPreferenceStorageFailures']:
                raise AssertionError(f'Expected workflow and dashboard preference storage failures to report readable errors: {keyboard_semantics}')
            if not keyboard_semantics['attachmentListEscapesAndLabels']:
                raise AssertionError(f'Expected attachment list previews to escape user text and expose image alt text: {keyboard_semantics}')
            if not keyboard_semantics['extraPerPageNormalization']:
                raise AssertionError(f'Expected attachment appendix per-page setting to normalize unsupported values: {keyboard_semantics}')
            if not keyboard_semantics['extraAppendixSettingsUsePayload']:
                raise AssertionError(f'Expected attachment appendix settings to prefer payload values and escape TOC/report output: {keyboard_semantics}')
            if not keyboard_semantics['extraAppendixEscapesAndLabels']:
                raise AssertionError(f'Expected attachment appendix output to escape user text and expose image alt text: {keyboard_semantics}')
            if not keyboard_semantics['certificateFrontmatterEscapesAndLabels']:
                raise AssertionError(f'Expected certificate frontmatter output to escape user text and expose image alt text: {keyboard_semantics}')
            if not keyboard_semantics['validationAndTemplateEscapes']:
                raise AssertionError(f'Expected validation table and template manager to escape stored metadata: {keyboard_semantics}')
            if not keyboard_semantics['storedArrayGuards']:
                raise AssertionError(f'Expected stored template, validation and change-log readers to reject non-array localStorage payloads: {keyboard_semantics}')
            if not keyboard_semantics['downloadFilenameGuards']:
                raise AssertionError(f'Expected shared download helper to sanitize and cap generated filenames: {keyboard_semantics}')
            if not keyboard_semantics['downloadBlobCleansUp']:
                raise AssertionError(f'Expected shared download helper to return success and clean temporary object URLs/anchors: {keyboard_semantics}')
            if not keyboard_semantics['csvFormulaEscapes']:
                raise AssertionError(f'Expected CSV export helper to neutralize spreadsheet formulas and quote cells: {keyboard_semantics}')
            if not keyboard_semantics['csvImportParsesQuotedNewlines']:
                raise AssertionError(f'Expected CSV import parser to preserve quoted commas, quotes and newlines: {keyboard_semantics}')
            if not keyboard_semantics['caseCsvImportGuards']:
                raise AssertionError(f'Expected case CSV import to restrict file type, size and encoding: {keyboard_semantics}')
            if not keyboard_semantics['uploadPreviewsUseDomNodes']:
                raise AssertionError(f'Expected upload previews to use labelled DOM image nodes and text fallback: {keyboard_semantics}')
            if not keyboard_semantics['rasterImageGuards']:
                raise AssertionError(f'Expected image upload guards to reject SVG/non-image sources and keep raster previews: {keyboard_semantics}')
            if not keyboard_semantics['wordImageRejectsUnsafeData']:
                raise AssertionError(f'Expected Word image helper to replace unsafe data URLs with placeholders: {keyboard_semantics}')
            if not keyboard_semantics['projectJsonImportGuards']['ok']:
                raise AssertionError(
                    f'Expected project JSON import and recovery guards to pass: '
                    f'{keyboard_semantics["projectJsonImportGuards"]}'
                )
            migration_payload_meta = page.evaluate(
                """async () => {
                  const priorMigrationInfo = _projectMigrationInfo;
                  try{
                    _projectMigrationInfo = {
                      migration_applied: true,
                      source_schema: 'stone-calc/legacy',
                      source_version: 1,
                      migrated_at: '2026-04-26T00:00:00.000Z',
                      migration_persist_status: 'failed'
                    };
                    const payload = await buildProjectPayload();
                    const notes = projectTraceabilityNotesInternal();
                    return {
                      persistStatus: payload?.meta?.migration_persist_status || '',
                      applied: payload?.meta?.migration_applied === true,
                      sourceSchema: payload?.meta?.source_schema || '',
                      traceWarns: notes.some(note => note.includes('本機儲存寫回失敗')),
                    };
                  }finally{
                    _projectMigrationInfo = priorMigrationInfo;
                  }
                }"""
            )
            if migration_payload_meta != {
                'persistStatus': 'failed',
                'applied': True,
                'sourceSchema': 'stone-calc/legacy',
                'traceWarns': True,
            }:
                raise AssertionError(f'Expected migrated project persistence status to be exported in JSON meta: {migration_payload_meta}')
            change_log_write_failure = page.evaluate(
                """async () => {
                  const oldLog = localStorage.getItem(V2_CHANGE_LOG_KEY);
                  const originalSetItem = Storage.prototype.setItem;
                  const originalNotify = window.v2Notify;
                  const originalComputeRev = v2ComputeRev;
                  let alerted = false;
                  try{
                    localStorage.removeItem(V2_CHANGE_LOG_KEY);
                    _v2LastStorageAlertAt = 0;
                    v2ComputeRev = async () => ({ rev: 'SMOKE-CHANGE-LOG-WRITE', length: 123 });
                    window.v2Notify = msg => { alerted = String(msg || '').includes('本機儲存空間不足'); };
                    Storage.prototype.setItem = function(key, value){
                      if(key === V2_CHANGE_LOG_KEY){
                        const err = new Error('Quota exceeded');
                        err.name = 'QuotaExceededError';
                        throw err;
                      }
                      return originalSetItem.call(this, key, value);
                    };
                    const ok = await v2AppendChangeLog();
                    return ok === false && alerted;
                  }finally{
                    v2ComputeRev = originalComputeRev;
                    Storage.prototype.setItem = originalSetItem;
                    window.v2Notify = originalNotify;
                    if(oldLog === null) localStorage.removeItem(V2_CHANGE_LOG_KEY);
                    else localStorage.setItem(V2_CHANGE_LOG_KEY, oldLog);
                  }
                }"""
            )
            if not change_log_write_failure:
                raise AssertionError('Expected change-log localStorage write failures to report readable storage errors')
            if keyboard_semantics['badCaseIconButtons'] != 0:
                raise AssertionError(f'Expected case icon buttons to expose readable labels: {keyboard_semantics}')
            if keyboard_semantics['badZoomButtons'] != 0:
                raise AssertionError(f'Expected method zoom buttons to expose readable labels: {keyboard_semantics}')
            if keyboard_semantics['searchLabel'] != '搜尋欄位':
                raise AssertionError(f'Expected search input to expose a stable readable label: {keyboard_semantics}')
            if keyboard_semantics['statusRole'] != 'button' or keyboard_semantics['statusTab'] != '0' or keyboard_semantics['statusPopup'] != 'dialog' or keyboard_semantics['statusControls'] != 'v2-check-modal':
                raise AssertionError(f'Expected status pill to expose dialog trigger semantics: {keyboard_semantics}')
            if '檢核狀態' not in keyboard_semantics['statusLabel'] or '狀態提醒' not in keyboard_semantics['statusLabel']:
                raise AssertionError(f'Expected status pill to expose readable status label: {keyboard_semantics}')

            page.focus('.v2-mode-switch .mode-btn[data-mode="full"]')
            page.keyboard.press('Enter')
            page.wait_for_function(
                """() => document.querySelector('.v2-mode-switch .mode-btn[data-mode="full"]')?.getAttribute('aria-pressed') === 'true'
                  && document.querySelector('.v2-tier-bar .tier-btn[data-tier="all"]')?.getAttribute('aria-pressed') === 'true'""",
                timeout=10000,
            )
            page.focus('.v2-mode-switch .mode-btn[data-mode="basic"]')
            page.keyboard.press('Enter')
            page.wait_for_function(
                """() => document.querySelector('.v2-mode-switch .mode-btn[data-mode="basic"]')?.getAttribute('aria-pressed') === 'true'
                  && document.querySelector('.v2-tier-bar .tier-btn[data-tier="core"]')?.getAttribute('aria-pressed') === 'true'""",
                timeout=10000,
            )

            page.focus('#v2_shortcut_toggle')
            page.keyboard.press('Enter')
            page.wait_for_function(
                """() => document.querySelector('#v2_shortcut_toggle')?.getAttribute('aria-expanded') === 'true'
                  && document.querySelector('#v2-shortcut-hint')?.getAttribute('aria-hidden') === 'false'""",
                timeout=10000,
            )
            page.keyboard.press('Escape')
            page.wait_for_function(
                """() => document.querySelector('#v2_shortcut_toggle')?.getAttribute('aria-expanded') === 'false'
                  && document.querySelector('#v2-shortcut-hint')?.getAttribute('aria-hidden') === 'true'""",
                timeout=10000,
            )
            page.evaluate("() => v2ShowProgress('測試處理中…', 'UI smoke')")
            page.wait_for_function(
                "() => document.querySelector('#v2-progress')?.classList.contains('show') && document.querySelector('#v2-progress')?.getAttribute('aria-hidden') === 'false'",
                timeout=10000,
            )
            page.evaluate("() => v2HideProgress()")
            page.wait_for_function(
                "() => !document.querySelector('#v2-progress')?.classList.contains('show') && document.querySelector('#v2-progress')?.getAttribute('aria-hidden') === 'true'",
                timeout=10000,
            )
            page.evaluate(
                """() => {
                  const modal = document.querySelector('#pdf_picker_modal');
                  modal.style.display = 'flex';
                  modal.setAttribute('aria-hidden', 'false');
                  document.querySelector('#pdf_picker_apply')?.focus({preventScroll:true});
                }"""
            )
            page.keyboard.press('Tab')
            page.wait_for_function(
                "() => document.activeElement?.id === 'pdf_picker_all'",
                timeout=10000,
            )
            page.keyboard.press('Shift+Tab')
            page.wait_for_function(
                "() => document.activeElement?.id === 'pdf_picker_apply'",
                timeout=10000,
            )
            page.evaluate(
                """() => {
                  const modal = document.querySelector('#pdf_picker_modal');
                  modal.style.display = 'none';
                  modal.setAttribute('aria-hidden', 'true');
                }"""
            )

            page.evaluate(
                """() => Array.from(document.querySelectorAll('#sidebar .acc-hd'))
                  .find(el => el.textContent.includes('④ 材料參數'))?.focus({preventScroll:true})"""
            )
            before_accordion = page.evaluate("() => document.activeElement?.getAttribute('aria-expanded')")
            page.keyboard.press('Enter')
            page.wait_for_function(
                f"() => document.activeElement?.getAttribute('aria-expanded') !== {before_accordion!r}",
                timeout=10000,
            )

            page.evaluate("() => document.querySelector('#chips_w_src .chip[data-v=\"manual\"]')?.focus({preventScroll:true})")
            page.keyboard.press('Enter')
            page.wait_for_function(
                "() => document.querySelector('#chips_w_src .chip[data-v=\"manual\"]')?.getAttribute('aria-pressed') === 'true'",
                timeout=10000,
            )
            page.evaluate("() => document.querySelector('#chips_w_src .chip[data-v=\"cc\"]')?.focus({preventScroll:true})")
            page.keyboard.press('Enter')
            page.wait_for_function(
                "() => document.querySelector('#chips_w_src .chip[data-v=\"cc\"]')?.getAttribute('aria-pressed') === 'true'",
                timeout=10000,
            )

            page.evaluate("() => document.querySelector('#v2_method_grid .v2-method-card[data-method=\"bk_4h\"]')?.focus({preventScroll:true})")
            page.keyboard.press('Enter')
            page.wait_for_function(
                "() => document.querySelector('#v2_method_grid .v2-method-card[data-method=\"bk_4h\"]')?.getAttribute('aria-pressed') === 'true'",
                timeout=10000,
            )

            page.focus('#v2_method_grid .v2-method-card[data-method="bk_4h"] .zoom-btn')
            page.keyboard.press('Enter')
            page.wait_for_selector('#v2-lightbox.show', timeout=10000)
            page.wait_for_function(
                "() => document.activeElement?.id === 'v2-lightbox'",
                timeout=10000,
            )
            lightbox_a11y = page.evaluate(
                """() => {
                  const box = document.querySelector('#v2-lightbox');
                  const img = document.querySelector('#v2_lightbox_img');
                  return {
                    role: box?.getAttribute('role') || '',
                    modal: box?.getAttribute('aria-modal') || '',
                    hidden: box?.getAttribute('aria-hidden') || '',
                    labelledby: box?.getAttribute('aria-labelledby') || '',
                    titleExists: !!document.getElementById(box?.getAttribute('aria-labelledby') || ''),
                    focused: document.activeElement?.id || '',
                    alt: img?.getAttribute('alt') || '',
                    closeType: document.querySelector('#v2-lightbox .lightbox-close')?.type || '',
                  };
                }"""
            )
            if lightbox_a11y != {
                'role': 'dialog',
                'modal': 'true',
                'hidden': 'false',
                'labelledby': 'v2_lightbox_caption',
                'titleExists': True,
                'focused': 'v2-lightbox',
                'alt': '背扣雙角鐵示意圖',
                'closeType': 'button',
            }:
                raise AssertionError(f'Expected lightbox dialog semantics and focus: {lightbox_a11y}')
            page.keyboard.press('Escape')
            page.wait_for_selector('#v2-lightbox.show', state='hidden', timeout=10000)
            page.wait_for_function(
                "() => document.activeElement?.classList.contains('zoom-btn') && document.querySelector('#v2-lightbox')?.getAttribute('aria-hidden') === 'true'",
                timeout=10000,
            )

            page.focus('button[onclick="v2OpenTemplateManager()"]')
            page.keyboard.press('Enter')
            page.wait_for_selector('#v2-tpl-mgr.show', timeout=10000)
            page.wait_for_function(
                "() => document.activeElement?.id === 'v2_tpl_close'",
                timeout=10000,
            )
            template_modal_a11y = page.evaluate(
                """() => {
                  const modal = document.querySelector('#v2-tpl-mgr');
                  return {
                    role: modal?.getAttribute('role') || '',
                    modal: modal?.getAttribute('aria-modal') || '',
                    hidden: modal?.getAttribute('aria-hidden') || '',
                    labelledby: modal?.getAttribute('aria-labelledby') || '',
                    describedby: modal?.getAttribute('aria-describedby') || '',
                    titleExists: !!document.getElementById(modal?.getAttribute('aria-labelledby') || ''),
                    bodyExists: !!document.getElementById(modal?.getAttribute('aria-describedby') || ''),
                    closeType: document.querySelector('#v2_tpl_close')?.type || '',
                  };
                }"""
            )
            if template_modal_a11y != {
                'role': 'dialog',
                'modal': 'true',
                'hidden': 'false',
                'labelledby': 'v2_tpl_title',
                'describedby': 'v2_tpl_list',
                'titleExists': True,
                'bodyExists': True,
                'closeType': 'button',
            }:
                raise AssertionError(f'Expected template manager dialog semantics: {template_modal_a11y}')
            page.keyboard.press('Tab')
            page.wait_for_function(
                "() => document.querySelector('#v2-tpl-mgr.show')?.contains(document.activeElement)",
                timeout=10000,
            )
            page.keyboard.press('Escape')
            page.wait_for_selector('#v2-tpl-mgr.show', state='hidden', timeout=10000)
            page.wait_for_function(
                "() => document.activeElement?.getAttribute('onclick') === 'v2OpenTemplateManager()' && document.querySelector('#v2-tpl-mgr')?.getAttribute('aria-hidden') === 'true'",
                timeout=10000,
            )

            page.focus('#v2-status-pill')
            page.keyboard.press('Enter')
            page.wait_for_selector('#v2-check-modal.show', timeout=10000)
            page.wait_for_function(
                "() => document.activeElement?.id === 'v2_check_proceed'",
                timeout=10000,
            )
            status_modal = page.evaluate(
                """() => ({
                  title: document.querySelector('#v2_check_title')?.innerText || '',
                  body: document.querySelector('#v2_check_body')?.innerText || '',
                  hidden: document.querySelector('#v2-check-modal')?.getAttribute('aria-hidden') || '',
                })"""
            )
            if status_modal['title'] != '⚠ 狀態提醒' or status_modal['hidden'] != 'false' or '工具與伺服器' not in status_modal['body']:
                raise AssertionError(f'Expected status pill to open status modal: {status_modal}')
            page.keyboard.press('Escape')
            page.wait_for_selector('#v2-check-modal.show', state='hidden', timeout=10000)
            page.wait_for_function(
                "() => document.activeElement?.id === 'v2-status-pill' && document.querySelector('#v2-check-modal')?.getAttribute('aria-hidden') === 'true'",
                timeout=10000,
            )

            page.click('#review-dashboard .dash-toggle')
            page.wait_for_selector('#review-dashboard.is-collapsed', timeout=10000)
            collapsed = page.evaluate(
                """() => ({
                  expanded: document.querySelector('#review-dashboard .dash-toggle')?.getAttribute('aria-expanded'),
                  dashboardExpanded: document.querySelector('#review-dashboard')?.hasAttribute('aria-expanded') || false,
                  contentHidden: document.querySelector('#review-dashboard-content')?.getAttribute('aria-hidden') || '',
                  gridDisplay: getComputedStyle(document.querySelector('#review-dashboard .dash-grid')).display,
                  height: document.querySelector('#review-dashboard')?.getBoundingClientRect().height || 0,
                  modalOpen: document.querySelector('#v2-check-modal')?.classList.contains('show') || false,
                  button: document.querySelector('#review-dashboard .dash-toggle')?.innerText || '',
                  controls: document.querySelector('#review-dashboard .dash-toggle')?.getAttribute('aria-controls') || '',
                  label: document.querySelector('#review-dashboard')?.getAttribute('aria-label') || '',
                  role: document.querySelector('#review-dashboard')?.getAttribute('role') || '',
                  details: document.querySelector('#review-dashboard .dash-details')?.innerText || '',
                })"""
            )
            if collapsed['expanded'] != 'false' or collapsed['gridDisplay'] != 'none' or collapsed['height'] > 70:
                raise AssertionError('Expected review dashboard to collapse')
            if collapsed['dashboardExpanded'] or collapsed['contentHidden'] != 'true':
                raise AssertionError('Expected collapse ARIA state to be scoped to the button and content')
            if collapsed['modalOpen']:
                raise AssertionError('Dashboard collapse button should not open review details')
            if '展開' not in collapsed['button']:
                raise AssertionError('Expected collapsed dashboard button to show 展開')
            if collapsed['controls'] != 'review-dashboard-content':
                raise AssertionError('Expected collapse button to control dashboard content')
            if '審查儀表板' not in collapsed['label']:
                raise AssertionError('Expected dashboard to have an accessible label')
            if collapsed['role'] != 'region':
                raise AssertionError('Expected dashboard to use region semantics')
            if '明細' not in collapsed['details']:
                raise AssertionError('Expected dashboard details button to render')

            page.reload(wait_until='networkidle', timeout=60000)
            page.wait_for_selector('#review-dashboard.is-collapsed', timeout=30000)
            persisted = page.evaluate(
                """() => ({
                  storage: localStorage.getItem('stone_review_dashboard_collapsed'),
                  expanded: document.querySelector('#review-dashboard .dash-toggle')?.getAttribute('aria-expanded'),
                  contentHidden: document.querySelector('#review-dashboard-content')?.getAttribute('aria-hidden') || '',
                  gridDisplay: getComputedStyle(document.querySelector('#review-dashboard .dash-grid')).display,
                  button: document.querySelector('#review-dashboard .dash-toggle')?.innerText || '',
                })"""
            )
            if persisted['storage'] != '1' or persisted['expanded'] != 'false' or persisted['contentHidden'] != 'true':
                raise AssertionError('Expected collapsed dashboard state to persist after reload')
            if persisted['gridDisplay'] != 'none' or '展開' not in persisted['button']:
                raise AssertionError('Expected persisted collapsed dashboard UI after reload')

            page.evaluate("() => document.getElementById('v2_validation_open')?.focus({preventScroll:true})")
            page.evaluate("() => v2OpenValidationModal()")
            page.wait_for_selector('#v2-validation-modal.show', timeout=10000)
            page.wait_for_function(
                "() => document.activeElement?.id === 'v2_validation_close'",
                timeout=10000,
            )
            validation_a11y = page.evaluate(
                """() => {
                  const modal = document.querySelector('#v2-validation-modal');
                  return {
                    role: modal?.getAttribute('role') || '',
                    modal: modal?.getAttribute('aria-modal') || '',
                    hidden: modal?.getAttribute('aria-hidden') || '',
                    labelledby: modal?.getAttribute('aria-labelledby') || '',
                    describedby: modal?.getAttribute('aria-describedby') || '',
                    titleExists: !!document.getElementById(modal?.getAttribute('aria-labelledby') || ''),
                    bodyExists: !!document.getElementById(modal?.getAttribute('aria-describedby') || ''),
                  };
                }"""
            )
            if validation_a11y != {
                'role': 'dialog',
                'modal': 'true',
                'hidden': 'false',
                'labelledby': 'v2_validation_title',
                'describedby': 'v2_validation_body',
                'titleExists': True,
                'bodyExists': True,
            }:
                raise AssertionError(f'Expected validation modal dialog semantics: {validation_a11y}')
            sidebar_button_types = page.evaluate(
                """() => ({
                  csvImport: document.querySelector("button[onclick*='v2_csv_import']")?.type || '',
                  csvExport: document.querySelector("button[onclick='v2ExportCaseCsv()']")?.type || '',
                  xlsExport: document.querySelector("button[onclick='v2ExportXlsxSummary()']")?.type || '',
                })"""
            )
            if sidebar_button_types != {'csvImport': 'button', 'csvExport': 'button', 'xlsExport': 'button'}:
                raise AssertionError(f'Expected sidebar import/export buttons to be non-submit: {sidebar_button_types}')
            missing_button_types = page.evaluate(
                """() => Array.from(document.querySelectorAll('button:not([type])'))
                  .map(btn => (btn.textContent || btn.title || btn.className || btn.id || '').trim())
                  .filter(Boolean)"""
            )
            if missing_button_types:
                raise AssertionError(f'Expected all visible DOM buttons to declare type: {missing_button_types}')
            file_picker_controls = page.evaluate(
                """() => ['cert_img_input', 'diagramFile', 'stampFile', 'v2_csv_import', 'extra_img_input', 'importFile']
                  .map(id => {
                    const button = document.querySelector(`button[aria-controls="${id}"]`);
                    const input = document.getElementById(id);
                    return {
                      id,
                      hasButton: !!button,
                      buttonType: button?.type || '',
                      inputType: input?.type || '',
                      accepts: input?.getAttribute('accept') || '',
                    };
                  })"""
            )
            bad_file_picker_controls = [
                item for item in file_picker_controls
                if not item['hasButton'] or item['buttonType'] != 'button' or item['inputType'] != 'file' or not item['accepts']
            ]
            if bad_file_picker_controls:
                raise AssertionError(f'Expected file picker buttons to control valid file inputs: {bad_file_picker_controls}')
            page.keyboard.press('Tab')
            page.wait_for_function(
                "() => document.querySelector('#v2-validation-modal.show')?.contains(document.activeElement)",
                timeout=10000,
            )
            page.evaluate(
                """() => {
                  const modal = document.querySelector('#v2-validation-modal');
                  const focusable = Array.from(modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
                    .filter(el => !el.disabled && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
                  focusable[0]?.focus({preventScroll:true});
                }"""
            )
            page.keyboard.press('Shift+Tab')
            page.wait_for_function(
                "() => document.activeElement?.id === 'v2_validation_close'",
                timeout=10000,
            )
            page.keyboard.press('Escape')
            assert_validation_modal_closed(page, 'validation Escape close')

            page.keyboard.press('Enter')
            page.wait_for_selector('#v2-validation-modal.show', timeout=10000)
            page.wait_for_function(
                "() => document.activeElement?.id === 'v2_validation_close'",
                timeout=10000,
            )
            page.evaluate("() => v2OpenValidationModal()")
            page.wait_for_function(
                "() => document.activeElement?.id === 'v2_validation_close'",
                timeout=10000,
            )
            page.keyboard.press('Escape')
            assert_validation_modal_closed(page, 'validation rerender close')

            page.keyboard.press('Enter')
            page.wait_for_selector('#v2-validation-modal.show', timeout=10000)
            page.mouse.click(4, 4)
            assert_validation_modal_closed(page, 'validation backdrop close')

            page.keyboard.press('Enter')
            page.wait_for_selector('#v2-validation-modal.show', timeout=10000)
            page.click('#v2_validation_close')
            assert_validation_modal_closed(page, 'validation close button')

            page.click('#review-dashboard .dash-head')
            page.wait_for_selector('#v2-check-modal.show', timeout=10000)
            panel_modal_text = page.locator('#v2_check_body').inner_text(timeout=10000)
            if '審查狀態' not in panel_modal_text or '工具與伺服器' not in panel_modal_text:
                raise AssertionError('Expected dashboard panel click to open review details')
            page.evaluate("() => v2CloseCheckModal()")
            page.wait_for_selector('#v2-check-modal.show', state='hidden', timeout=10000)

            page.focus('#review-dashboard .dash-details')
            page.keyboard.press('Enter')
            page.wait_for_selector('#v2-check-modal.show', timeout=10000)
            modal_text = page.locator('#v2_check_body').inner_text(timeout=10000)
            for required in ['審查狀態', '交付品質', '未通過與警示', '公式來源覆核', 'formula-registry-2026.04.25', '工具與伺服器', 'HTML 一致性']:
                if required not in modal_text:
                    raise AssertionError(f'Missing modal text: {required}')
            page.wait_for_function(
                "() => document.activeElement?.id === 'v2_check_proceed'",
                timeout=10000,
            )
            modal_a11y = page.evaluate(
                """() => {
                  const modal = document.querySelector('#v2-check-modal');
                  return {
                    role: modal?.getAttribute('role') || '',
                    modal: modal?.getAttribute('aria-modal') || '',
                    hidden: modal?.getAttribute('aria-hidden') || '',
                    labelledby: modal?.getAttribute('aria-labelledby') || '',
                    describedby: modal?.getAttribute('aria-describedby') || '',
                    title: document.getElementById(modal?.getAttribute('aria-labelledby') || '')?.innerText || '',
                    cancelType: document.getElementById('v2_check_cancel')?.getAttribute('type') || '',
                    proceedType: document.getElementById('v2_check_proceed')?.getAttribute('type') || '',
                    titleExists: !!document.getElementById(modal?.getAttribute('aria-labelledby') || ''),
                    bodyExists: !!document.getElementById(modal?.getAttribute('aria-describedby') || ''),
                  };
                }"""
            )
            if modal_a11y != {
                'role': 'dialog',
                'modal': 'true',
                'hidden': 'false',
                'labelledby': 'v2_check_title',
                'describedby': 'v2_check_body',
                'title': '審查明細',
                'cancelType': 'button',
                'proceedType': 'button',
                'titleExists': True,
                'bodyExists': True,
            }:
                raise AssertionError(f'Expected check modal dialog semantics: {modal_a11y}')
            page.keyboard.press('Tab')
            page.wait_for_function(
                "() => document.querySelector('#v2-check-modal.show')?.contains(document.activeElement)",
                timeout=10000,
            )
            page.evaluate(FOCUS_FIRST_CHECK_MODAL_ITEM_JS)
            page.keyboard.press('Shift+Tab')
            page.wait_for_function(
                "() => document.activeElement?.id === 'v2_check_proceed'",
                timeout=10000,
            )
            page.keyboard.press('Escape')
            assert_check_modal_closed(page, 'Escape close')

            page.keyboard.press('Enter')
            page.wait_for_selector('#v2-check-modal.show', timeout=10000)
            page.mouse.click(4, 4)
            assert_check_modal_closed(page, 'backdrop close')

            page.keyboard.press('Enter')
            page.wait_for_selector('#v2-check-modal.show', timeout=10000)
            page.click('#v2_check_cancel')
            assert_check_modal_closed(page, 'cancel button close')

            compact = browser.new_page(viewport={'width': 900, 'height': 900})
            compact.goto(TOOL_URL, wait_until='networkidle', timeout=60000)
            compact.wait_for_selector('#review-dashboard .dash-card', timeout=30000)
            compact_layout = compact.evaluate(
                """() => {
                  const dash = document.querySelector('#review-dashboard');
                  const area = document.querySelector('#preview-area');
                  const top = document.querySelector('#review-dashboard .dash-top');
                  const actions = document.querySelector('#review-dashboard .dash-actions');
                  const title = document.querySelector('#review-dashboard .dash-title');
                  return {
                    dashOverflow: dash ? dash.scrollWidth - dash.clientWidth : 999,
                    topWrap: top ? getComputedStyle(top).flexWrap : '',
                    actionsWidth: actions ? actions.getBoundingClientRect().width : 0,
                    titleOverflow: title ? getComputedStyle(title).textOverflow : '',
                  };
                }"""
            )
            if compact_layout['dashOverflow'] > 2:
                raise AssertionError(f'Compact dashboard should not overflow horizontally: {compact_layout}')
            if compact_layout['topWrap'] != 'wrap' or compact_layout['titleOverflow'] != 'ellipsis':
                raise AssertionError(f'Compact dashboard should use wrapping header and ellipsis title: {compact_layout}')
            if compact_layout['actionsWidth'] <= 0:
                raise AssertionError('Compact dashboard actions should remain visible')
            compact.close()

            narrow = browser.new_page(viewport={'width': 390, 'height': 780})
            narrow.goto(TOOL_URL, wait_until='networkidle', timeout=60000)
            narrow.wait_for_selector('#review-dashboard .dash-details', timeout=30000)
            narrow.click('#review-dashboard .dash-details')
            narrow.wait_for_selector('#v2-check-modal.show', timeout=10000)
            narrow_modal = narrow.evaluate(
                """() => {
                  const panel = document.querySelector('#v2-check-modal .panel');
                  const body = document.querySelector('#v2-check-modal .body');
                  const foot = document.querySelector('#v2-check-modal .foot');
                  const buttons = Array.from(document.querySelectorAll('#v2-check-modal .foot button'));
                  const panelRect = panel?.getBoundingClientRect();
                  const footRect = foot?.getBoundingClientRect();
                  return {
                    panelWidth: panelRect?.width || 0,
                    viewportWidth: window.innerWidth,
                    panelLeft: panelRect?.left || 0,
                    panelRight: panelRect?.right || 9999,
                    bodyOverflowX: body ? getComputedStyle(body).overflowX : '',
                    footDisplay: foot ? getComputedStyle(foot).display : '',
                    footWrap: foot ? getComputedStyle(foot).flexWrap : '',
                    buttonsInside: buttons.every(btn => {
                      const rect = btn.getBoundingClientRect();
                      return rect.left >= footRect.left - 1 && rect.right <= footRect.right + 1;
                    }),
                  };
                }"""
            )
            if narrow_modal['panelWidth'] > narrow_modal['viewportWidth'] - 16:
                raise AssertionError(f'Narrow modal should fit viewport: {narrow_modal}')
            if narrow_modal['panelLeft'] < 0 or narrow_modal['panelRight'] > narrow_modal['viewportWidth']:
                raise AssertionError(f'Narrow modal should stay within viewport: {narrow_modal}')
            if narrow_modal['bodyOverflowX'] != 'auto':
                raise AssertionError(f'Narrow modal body should allow horizontal scroll for wide tables: {narrow_modal}')
            if narrow_modal['footDisplay'] != 'flex' or narrow_modal['footWrap'] != 'wrap' or not narrow_modal['buttonsInside']:
                raise AssertionError(f'Narrow modal footer buttons should stay inside panel: {narrow_modal}')
            narrow.close()

            narrow_validation = browser.new_page(viewport={'width': 390, 'height': 780})
            narrow_validation.goto(TOOL_URL, wait_until='networkidle', timeout=60000)
            narrow_validation.evaluate("() => v2OpenValidationModal()")
            narrow_validation.wait_for_selector('#v2-validation-modal.show', timeout=10000)
            validation_layout = narrow_validation.evaluate(
                """() => {
                  const panel = document.querySelector('#v2-validation-modal .panel');
                  const body = document.querySelector('#v2-validation-modal .body');
                  const foot = document.querySelector('#v2-validation-modal .foot');
                  const panelRect = panel?.getBoundingClientRect();
                  return {
                    panelWidth: panelRect?.width || 0,
                    viewportWidth: window.innerWidth,
                    panelLeft: panelRect?.left || 0,
                    panelRight: panelRect?.right || 9999,
                    bodyOverflowX: body ? getComputedStyle(body).overflowX : '',
                    footDisplay: foot ? getComputedStyle(foot).display : '',
                    footWrap: foot ? getComputedStyle(foot).flexWrap : '',
                  };
                }"""
            )
            if validation_layout['panelWidth'] > validation_layout['viewportWidth'] - 16:
                raise AssertionError(f'Narrow validation modal should fit viewport: {validation_layout}')
            if validation_layout['panelLeft'] < 0 or validation_layout['panelRight'] > validation_layout['viewportWidth']:
                raise AssertionError(f'Narrow validation modal should stay within viewport: {validation_layout}')
            if validation_layout['bodyOverflowX'] != 'auto' or validation_layout['footDisplay'] != 'flex' or validation_layout['footWrap'] != 'wrap':
                raise AssertionError(f'Narrow validation modal should keep scrollable body and wrapping footer: {validation_layout}')
            narrow_validation.close()

            narrow_template = browser.new_page(viewport={'width': 390, 'height': 780})
            narrow_template.goto(TOOL_URL, wait_until='networkidle', timeout=60000)
            narrow_template.evaluate("() => v2OpenTemplateManager()")
            narrow_template.wait_for_selector('#v2-tpl-mgr.show', timeout=10000)
            template_layout = narrow_template.evaluate(
                """() => {
                  const panel = document.querySelector('#v2-tpl-mgr .panel');
                  const list = document.querySelector('#v2-tpl-mgr .tpl-list');
                  const rect = panel?.getBoundingClientRect();
                  return {
                    panelWidth: rect?.width || 0,
                    viewportWidth: window.innerWidth,
                    panelLeft: rect?.left || 0,
                    panelRight: rect?.right || 9999,
                    listOverflowY: list ? getComputedStyle(list).overflowY : '',
                  };
                }"""
            )
            if template_layout['panelWidth'] > template_layout['viewportWidth'] - 16:
                raise AssertionError(f'Narrow template manager should fit viewport: {template_layout}')
            if template_layout['panelLeft'] < 0 or template_layout['panelRight'] > template_layout['viewportWidth']:
                raise AssertionError(f'Narrow template manager should stay within viewport: {template_layout}')
            if template_layout['listOverflowY'] != 'auto':
                raise AssertionError(f'Narrow template manager should keep template list scrollable: {template_layout}')
            narrow_template.close()
            browser.close()

        print('UI smoke test passed.')
        return 0
    except Exception as exc:
        print(f'UI smoke test failed: {exc}')
        return 1
    finally:
        if started and started.poll() is None:
            started.terminate()
            try:
                started.wait(timeout=3)
            except subprocess.TimeoutExpired:
                started.kill()


if __name__ == '__main__':
    raise SystemExit(main())
