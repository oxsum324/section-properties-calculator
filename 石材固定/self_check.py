# -*- coding: utf-8 -*-
"""Project consistency checks for the stone report tool."""
from __future__ import annotations

import re
import sys
import html as html_lib
from pathlib import Path


ROOT = Path(__file__).resolve().parent
TARGET_HTML = '石材計算書產生器_規範版V2.html'
ACTIVE_FILES = [
    'server.py',
    'auto_word.py',
    '開啟石材計算書.bat',
    'js/calculator.spec.js',
    TARGET_HTML,
]
DOC_FILES = [
    'README.md',
    'CHANGELOG.md',
    'RELEASE_CHECKLIST.md',
    'PROJECT_FILES.md',
]
PY_COMPILE_REQUIRED = [
    'server.py',
    'auto_word.py',
    'generate_docx.py',
    'verifier.py',
    'pdf_to_docx.py',
    'self_check.py',
    'server_smoke_test.py',
    'cleanup_temp.py',
    'cleanup_temp_test.py',
    'make_release_bundle.py',
    'release_bundle_smoke_test.py',
    'verify_release_bundle.py',
    'pre_delivery_check.py',
    'env_check.py',
    'ui_smoke_test.py',
    'audit_schema.py',
    'audit_schema_test.py',
    'audit_compare.py',
    'audit_compare_test.py',
]


def read_text(name: str) -> str:
    return (ROOT / name).read_text(encoding='utf-8-sig')


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def require_all(needles: list[tuple[str, bool]], message: str, errors: list[str]) -> None:
    missing = [label for label, haystack in needles if not haystack]
    if missing:
        errors.append(f'{message}: missing {", ".join(missing)}')


def strip_tags(text: str) -> str:
    return re.sub(r'<[^>]+>', '', text)


def icon_button_issues(text: str) -> list[str]:
    icon_chars = set('📋✕🔍⌨↶↷×💾🗂🖨📕📄⚡🔄▶⬇✓⚠')
    issues: list[str] = []
    for match in re.finditer(r'<button\b(?P<attrs>[^>]*)>(?P<body>.*?)</button>', text, re.DOTALL):
        attrs = match.group('attrs')
        body = html_lib.unescape(strip_tags(match.group('body'))).strip()
        has_accessible_name = 'aria-label=' in attrs or 'aria-labelledby=' in attrs
        has_clear_text = bool(re.search(r'[\w\u4e00-\u9fff]{2,}', body))
        is_icon_only = bool(body) and all(ch.isspace() or ch in icon_chars or ch in '-/｜' for ch in body)
        if is_icon_only and not has_accessible_name and not has_clear_text:
            line = text[:match.start()].count('\n') + 1
            issues.append(f'line {line}: {body!r}')
    return issues


def icon_button_scanner_self_test() -> list[str]:
    errors: list[str] = []
    bad = '<button type="button">🔍</button>'
    labelled = '<button type="button" aria-label="放大示意圖">🔍</button>'
    visible_text = '<button type="button">匯出 PDF</button>'
    labelledby = '<button type="button" aria-labelledby="zoom_label">🔍</button><span id="zoom_label">放大</span>'
    if not icon_button_issues(bad):
        errors.append('icon scanner should flag an unlabelled icon-only button')
    for sample_name, sample in [
        ('aria-label', labelled),
        ('visible text', visible_text),
        ('aria-labelledby', labelledby),
    ]:
        issues = icon_button_issues(sample)
        if issues:
            errors.append(f'icon scanner should accept {sample_name} sample, got {issues}')
    return errors


def single_quote_const(text: str, name: str) -> str | None:
    match = re.search(rf"\b{name}\s*=\s*'([^']+)'", text)
    return match.group(1) if match else None


def js_const(text: str, name: str) -> str | None:
    match = re.search(rf"\bconst\s+{name}\s*=\s*'([^']+)'", text)
    return match.group(1) if match else None


def calculator_version(text: str) -> str | None:
    match = re.search(r"\bconst\s+VERSION\s*=\s*'([^']+)'", text)
    return match.group(1) if match else None


def bat_var(text: str, name: str) -> str | None:
    match = re.search(rf'^set\s+"{re.escape(name)}=([^"]+)"\s*$', text, re.MULTILINE | re.IGNORECASE)
    return match.group(1) if match else None


def main() -> int:
    errors: list[str] = []
    errors.extend(icon_button_scanner_self_test())

    for name in [*ACTIVE_FILES, *DOC_FILES]:
        require((ROOT / name).is_file(), f'Missing required file: {name}', errors)
    if errors:
        return report(errors)

    server = read_text('server.py')
    auto_word = read_text('auto_word.py')
    launcher = read_text('開啟石材計算書.bat')
    self_check_bat = read_text('自我檢查.bat')
    audit_compare_bat = read_text('比對稽核報告.bat')
    calculator = read_text('js/calculator.spec.js')
    html = read_text(TARGET_HTML)
    readme = read_text('README.md')
    changelog = read_text('CHANGELOG.md')
    release_checklist = read_text('RELEASE_CHECKLIST.md')
    project_files = read_text('PROJECT_FILES.md')
    release_bundle = read_text('make_release_bundle.py')
    release_bundle_test = read_text('release_bundle_smoke_test.py')
    pre_delivery = read_text('pre_delivery_check.py')
    ui_smoke = read_text('ui_smoke_test.py')
    review_dashboard = read_text('js/review-dashboard.js')
    review_dashboard_test = read_text('js/review-dashboard-smoke.test.js')

    server_html = single_quote_const(server, 'TOOL_HTML')
    auto_word_url = single_quote_const(auto_word, 'TOOL_URL')
    launcher_url = bat_var(launcher, 'URL')
    app_version = js_const(html, 'APP_VERSION')
    html_filename = js_const(html, 'TOOL_HTML_FILENAME')
    auto_word_http_url = js_const(html, 'AUTO_WORD_HTTP_URL')
    template_version = js_const(html, 'TEMPLATE_CATALOG_VERSION')
    calc_version = calculator_version(calculator)
    server_version = single_quote_const(server, 'SERVER_VERSION')

    require(server_html == TARGET_HTML, f'server.py TOOL_HTML should be {TARGET_HTML!r}, got {server_html!r}', errors)
    require(html_filename == TARGET_HTML, f'HTML TOOL_HTML_FILENAME should be {TARGET_HTML!r}, got {html_filename!r}', errors)
    require(bool(auto_word_url and TARGET_HTML in auto_word_url), 'auto_word.py TOOL_URL should point to the V2 HTML file', errors)
    require(bool(launcher_url and TARGET_HTML in launcher_url), '開啟石材計算書.bat URL should point to the V2 HTML file', errors)
    require(bool(auto_word_http_url and TARGET_HTML in auto_word_http_url), 'V2 HTML AUTO_WORD_HTTP_URL should point to the V2 HTML file', errors)
    require('./js/formula-registry.spec.js' in html, 'V2 HTML should load js/formula-registry.spec.js', errors)
    require('./js/version-sync.js' in html, 'V2 HTML should load js/version-sync.js', errors)
    require('./js/review-dashboard.js' in html, 'V2 HTML should load js/review-dashboard.js', errors)
    require('id="tool-version-label"' in html, 'V2 HTML should render a version label target in the header', errors)
    require('syncToolHeaderVersion' in html, 'V2 HTML should sync the header version from APP_VERSION', errors)
    require('function v2ExportChecklistHtml' in html, 'V2 HTML should keep export checklist HTML fallback wrapper', errors)
    require('function v2ExportChecklistNeedsConfirmation' in html, 'V2 HTML should keep export checklist confirmation fallback wrapper', errors)
    require('function v2DeliveryQualityChecklistItem' in html, 'V2 HTML should keep delivery quality checklist fallback wrapper', errors)
    require('function v2ToggleReviewDashboardCollapsed' in html, 'V2 HTML should support folding the review dashboard', errors)
    require('function v2ShowReviewDashboardDetailsFromButton' in html, 'V2 HTML should expose a keyboard-friendly review dashboard details button', errors)
    require('role="region"' in html, 'V2 HTML review dashboard should use region semantics', errors)
    require('dash-details' in html, 'V2 HTML review dashboard should render a dedicated details button', errors)
    require('aria-label="審查儀表板' in html, 'V2 HTML review dashboard should have an accessible label', errors)
    require('aria-controls="review-dashboard-content"' in html, 'V2 HTML dashboard collapse button should reference controlled content', errors)
    require("body.setAttribute('aria-hidden'" in html, 'V2 HTML dashboard content should expose collapsed state with aria-hidden', errors)
    require("el.removeAttribute('aria-expanded')" in html, 'V2 HTML dashboard region should not duplicate button aria-expanded state', errors)
    require_all([
        ('dashboard control stops click propagation', 'event.stopPropagation()' in html),
        ('dashboard control prevents default button action', 'event.preventDefault()' in html),
    ], 'V2 HTML dashboard controls should not bubble into panel click handlers', errors)
    require_all([
        ('keyboard semantic refresh helper exists', 'function v2RefreshKeyboardSemanticStates' in html),
        ('keyboard activation delegates to click handler', "target.click();" in html),
    ], 'V2 HTML should add keyboard semantics and Enter/Space activation for clickable div controls', errors)
    require_all([
        ('clickable divs expose button role', "el.setAttribute('role', 'button')" in html),
        ('clickable divs enter tab order', "el.setAttribute('tabindex', '0')" in html),
    ], 'V2 HTML clickable div controls should expose button role and tab focus', errors)
    require_all([
        ('clickable divs expose pressed state', "el.setAttribute('aria-pressed'" in html),
        ('clickable divs expose expanded state', "el.setAttribute('aria-expanded'" in html),
    ], 'V2 HTML clickable div controls should expose pressed and expanded state', errors)
    require_all([
        ('option groups get fallback accessible label', "el.setAttribute('aria-label', label || '選項群組')" in html),
        ('method grid gets explicit accessible label', "methodGrid.setAttribute('aria-label', '主要固定工法')" in html),
    ], 'V2 HTML option groups should expose accessible group labels', errors)
    require_all([
        ('mode/tier pressed refresh helper exists', 'function v2RefreshButtonToggleStates' in html),
        ('pressed refresh covers mode and tier buttons', '.v2-mode-switch .mode-btn,.v2-tier-bar .tier-btn' in html),
    ], 'V2 HTML mode and tier buttons should synchronize pressed state', errors)
    require('id="v2-toolbar" role="toolbar" aria-label="快速工具列"' in html, 'V2 HTML quick toolbar should expose a named toolbar role', errors)
    require_all([
        ('tier picker markup has named group role', 'class="v2-tier-bar" role="group" aria-label="規範模組篩選"' in html),
        ('tier picker initialization preserves label', "el.setAttribute('aria-label', '規範模組篩選')" in html),
    ], 'V2 HTML tier picker should expose a named group before and after initialization', errors)
    require_all([
        ('basic mode button starts pressed', 'class="mode-btn active" data-mode="basic" aria-pressed="true"' in html),
        ('all tier button starts pressed', 'class="tier-btn active" data-tier="all" aria-pressed="true"' in html),
    ], 'V2 HTML mode and tier buttons should include initial pressed state in markup', errors)
    require_all([
        ('shortcut help button has readable label', 'aria-label="顯示快捷鍵說明"' in html),
        ('undo button has readable label', 'aria-label="回到上一個自動快照"' in html),
        ('redo button has readable label', 'aria-label="回到下一個自動快照"' in html),
    ], 'V2 HTML icon-only toolbar buttons should expose readable labels', errors)
    require_all([
        ('shortcut help exposes F1 key', 'aria-keyshortcuts="F1"' in html),
        ('undo exposes Control+Z key', 'aria-keyshortcuts="Control+Z"' in html),
        ('redo exposes Control+Y key', 'aria-keyshortcuts="Control+Y"' in html),
    ], 'V2 HTML shortcut toolbar buttons should expose aria-keyshortcuts', errors)
    require('onclick="v2OpenTemplateManager()" aria-haspopup="dialog" aria-controls="v2-tpl-mgr"' in html, 'V2 HTML template manager trigger should expose dialog target', errors)
    require_all([
        ('shortcut hint trigger has stable id', 'id="v2_shortcut_toggle"' in html),
        ('shortcut hint trigger references and initializes expanded state', 'aria-controls="v2-shortcut-hint" aria-expanded="false"' in html),
        ('shortcut hint state synchronizer helper', 'function v2SetShortcutHintOpen' in html),
    ], 'V2 HTML shortcut hint trigger should expose and synchronize expanded state', errors)
    require('id="v2-shortcut-hint" role="region" aria-label="快捷鍵說明" aria-hidden="true"' in html, 'V2 HTML shortcut hint should expose a hidden labelled region', errors)
    require_all([
        ('progress overlay has live status semantics', 'id="v2-progress" role="status" aria-live="polite" aria-hidden="true"' in html),
        ('progress overlay is exposed while active', "progress?.setAttribute('aria-hidden', 'false')" in html),
        ('progress overlay is hidden after completion', "progress?.setAttribute('aria-hidden', 'true')" in html),
    ], 'V2 HTML progress overlay should expose and synchronize live status visibility', errors)
    require_all([
        ('PDF picker modal has stable id', 'id="pdf_picker_modal"' in html),
        ('PDF picker modal exposes dialog role', 'role="dialog"' in html),
        ('PDF picker modal exposes aria-modal', 'aria-modal="true"' in html),
        ('PDF picker modal starts hidden from assistive tech', 'aria-hidden="true"' in html),
        ('PDF picker modal is labelled by title', 'aria-labelledby="pdf_picker_title"' in html),
        ('PDF picker modal is described by thumbnails', 'aria-describedby="pdf_picker_thumbs"' in html),
        ('PDF picker modal can receive focus', 'tabindex="-1"' in html),
    ], 'V2 HTML PDF picker should expose dialog semantics and hidden state', errors)
    require_all([
        ('PDF picker select-all references thumbnail list', 'id="pdf_picker_all" aria-controls="pdf_picker_thumbs"' in html),
        ('PDF picker select-none references thumbnail list', 'id="pdf_picker_none" aria-controls="pdf_picker_thumbs"' in html),
        ('PDF picker apply references thumbnail list', 'id="pdf_picker_apply" aria-controls="pdf_picker_thumbs"' in html),
    ], 'V2 HTML PDF picker controls should reference the thumbnail list', errors)
    require_all([
        ('PDF picker close helper exists', 'function v2ClosePdfPagePicker' in html),
        ('PDF picker stores return focus target', '_pdfPickerReturnFocus' in html),
        ('PDF picker exposes modal when opened', "modal.setAttribute('aria-hidden', 'false')" in html),
    ], 'V2 HTML PDF picker should restore focus and synchronize aria-hidden', errors)
    require_all([
        ('PDF picker focus trap helper exists', 'function v2TrapPdfPagePicker' in html),
        ('PDF picker traps Tab key', "if(e.key==='Tab' && v2TrapPdfPagePicker(e)) return" in html),
    ], 'V2 HTML PDF picker should trap Tab focus while open', errors)
    require_all([
        ('case copy button has readable label', 'class="v2-case-copy" onclick="v2CopyCase({ID})" aria-label="複製此案例"' in html),
        ('case delete button has readable label', 'onclick="removeCase({ID})" aria-label="刪除此案例"' in html),
    ], 'V2 HTML case icon buttons should expose readable labels', errors)
    require_all([
        ('pin method zoom button has readable label', 'aria-label="放大插銷式固定示意圖"' in html),
        ('back anchor method zoom button has readable label', 'aria-label="放大背扣雙角鐵示意圖"' in html),
        ('attachment remove button uses readable dynamic label', 'aria-label="移除 ${label}"' in html),
    ], 'V2 HTML zoom and attachment icon buttons should expose readable labels', errors)
    require_all([
        ('attachment preview escapes image name', 'const name = escapeHtml(img.name' in html),
        ('attachment preview escapes caption', 'const caption = escapeHtml(img.caption' in html),
        ('attachment preview escapes generated label', 'const label = escapeHtml(`附件 ${i + 1}' in html),
        ('attachment preview image uses escaped alt text', '<img src="${src}" alt="${name}"' in html),
        ('attachment caption control uses labelled aria text', 'aria-label="${label} 說明"' in html),
    ], 'V2 HTML attachment preview list should escape user text and expose labelled image/caption controls', errors)
    require_all([
        ('attachment index guard helper exists', 'function v2IsValidAttachmentIndex' in html),
        ('extra attachment updates guard stale indexes', 'if(!v2IsValidAttachmentIndex(_extraImages, idx)) return' in html),
        ('certificate attachment updates guard stale indexes', 'if(!v2IsValidAttachmentIndex(_certImages, idx)) return' in html),
        ('UI smoke attachment index guard coverage', 'indexGuardOk' in ui_smoke),
    ], 'V2 attachment remove and caption updates should ignore stale or invalid indexes', errors)
    require_all([
        ('attachment appendix escapes title', 'const safeTitle = escapeHtml(title)' in html),
        ('attachment appendix escapes project name', 'const safeProject = escapeHtml(inp.proj' in html),
        ('attachment appendix image uses escaped alt text', '<img src="${src}" alt="${name}"' in html),
        ('attachment appendix escapes multiline note', '${escapeHtmlWithBreaks(note)}' in html),
    ], 'V2 HTML attachment appendix should escape user text and expose image alt text', errors)
    require('id="v2-search" type="search" aria-label="搜尋欄位"' in html, 'V2 HTML search input should expose a stable readable label', errors)
    require_all([
        ('status pill declares dialog popup', "status.setAttribute('aria-haspopup', 'dialog')" in html),
        ('status pill references check modal', "status.setAttribute('aria-controls', 'v2-check-modal')" in html),
    ], 'V2 HTML status pill should expose dialog trigger semantics', errors)
    require_all([
        ('status pill dynamic label prefix exists', "pill.setAttribute('aria-label', '檢核狀態" in html),
        ('status pill label announces warning modal affordance', '可開啟狀態提醒' in html),
    ], 'V2 HTML status pill should expose a readable dynamic status label', errors)
    require_all([
        ('lightbox has stable id', 'id="v2-lightbox"' in html),
        ('lightbox exposes dialog role', 'role="dialog"' in html),
        ('lightbox exposes aria-modal', 'aria-modal="true"' in html),
        ('lightbox starts hidden from assistive tech', 'aria-hidden="true"' in html),
    ], 'V2 HTML lightbox should expose dialog semantics and hidden state', errors)
    require_all([
        ('lightbox stores return focus target', '_v2LightboxReturnFocus' in html),
        ('lightbox moves focus into dialog', "box?.focus({preventScroll:true})" in html),
    ], 'V2 HTML lightbox should move focus in and restore focus after close', errors)
    require("img.alt = name ? `${name}示意圖` : '工法示意圖'" in html, 'V2 HTML lightbox should provide a descriptive image alt', errors)
    require_all([
        ('template manager has stable id', 'id="v2-tpl-mgr"' in html),
        ('template manager exposes dialog role', 'role="dialog"' in html),
        ('template manager exposes aria-modal', 'aria-modal="true"' in html),
        ('template manager starts hidden from assistive tech', 'aria-hidden="true"' in html),
    ], 'V2 HTML template manager should expose dialog semantics and hidden state', errors)
    require_all([
        ('template manager stores return focus target', '_v2TemplateManagerReturnFocus' in html),
        ('template manager focus trap helper exists', 'function v2TrapTemplateManagerFocus' in html),
        ('template manager traps Tab key', "if(e.key==='Tab' && v2TrapTemplateManagerFocus(e)) return" in html),
    ], 'V2 HTML template manager should trap focus and restore its opener', errors)
    require_all([
        ('template manager close button has stable id', 'id="v2_tpl_close"' in html),
        ('template manager focuses close button when opened', "v2_tpl_close')?.focus" in html),
    ], 'V2 HTML template manager should focus a stable close button when opened', errors)
    require('#v2-tpl-mgr .panel{background:#fff;border-radius:6px;width:min(500px,calc(100vw - 32px))' in html, 'V2 HTML template manager should fit narrow viewports', errors)
    require_all([
        ('check modal open helper exists', 'function v2OpenCheckModal' in html),
        ('check modal stores return focus target', '_v2CheckModalReturnFocus' in html),
    ], 'V2 HTML check modal should centralize focus handling', errors)
    require('function v2SetCheckModalTitle' in html, 'V2 HTML check modal should support context-specific titles', errors)
    require_all([
        ('check modal focus trap helper exists', 'function v2TrapCheckModalFocus' in html),
        ('check modal traps Tab key', "if(e.key==='Tab' && v2TrapCheckModalFocus(e)) return" in html),
    ], 'V2 HTML check modal should trap tab focus while open', errors)
    require('id="v2_check_cancel"' in html, 'V2 HTML check modal cancel button should have a stable focus target', errors)
    require_all([
        ('check modal cancel button is non-submit', 'type="button" class="btn btn-gray" id="v2_check_cancel"' in html),
        ('check modal proceed button is non-submit', 'type="button" class="btn btn-blue" id="v2_check_proceed"' in html),
    ], 'V2 HTML check modal action buttons should be explicit non-submit buttons', errors)
    require_all([
        ('PDF picker select-all button is non-submit', 'type="button" id="pdf_picker_all"' in html),
        ('PDF picker apply button is non-submit', 'type="button" id="pdf_picker_apply"' in html),
    ], 'V2 HTML PDF picker buttons should be explicit non-submit buttons', errors)
    require('type="button" class="btn btn-blue" onclick="v2RunValidation()"' in html, 'V2 HTML validation modal buttons should be explicit non-submit buttons', errors)
    require_all([
        ('validation modal open target has stable id', 'id="v2_validation_open"' in html),
        ('validation modal close target has stable id', 'id="v2_validation_close"' in html),
    ], 'V2 HTML validation modal should have stable focus targets', errors)
    require_all([
        ('validation modal remembers return focus helper', 'function v2RememberValidationModalFocus' in html),
        ('validation modal stores return focus target', '_v2ValidationModalReturnFocus' in html),
    ], 'V2 HTML validation modal should restore focus after close', errors)
    require("v2_validation_close')?.focus" in html, 'V2 HTML validation modal should focus its close button when opened', errors)
    require_all([
        ('validation modal focus trap helper exists', 'function v2TrapValidationModalFocus' in html),
        ('validation modal traps Tab key', "if(e.key==='Tab' && v2TrapValidationModalFocus(e)) return" in html),
    ], 'V2 HTML validation modal should trap tab focus while open', errors)
    require_all([
        ('validation modal restore focus helper exists', 'function v2RestoreValidationModalFocus' in html),
        ('validation modal checks active element before hiding', "document.getElementById('v2-validation-modal')?.contains(document.activeElement)" in html),
    ], 'V2 HTML validation modal should restore or clear focus before hiding', errors)
    require_all([
        ('validation modal detects already-open rerender', "const alreadyOpen = modal?.classList.contains('show')" in html),
        ('validation modal preserves current focus while already open', '!alreadyOpen || !modal.contains(document.activeElement)' in html),
    ], 'V2 HTML validation modal should preserve its original return focus when rerendered while open', errors)
    require('v2CloseValidationModal();' in html, 'V2 HTML Escape handler should close validation modal', errors)
    require('id="v2-validation-modal" role="dialog" aria-modal="true" aria-hidden="true"' in html, 'V2 HTML validation modal should expose dialog semantics', errors)
    require_all([
        ('validation modal is labelled by title', 'aria-labelledby="v2_validation_title"' in html),
        ('validation modal is described by body', 'aria-describedby="v2_validation_body"' in html),
    ], 'V2 HTML validation modal should connect title and body for assistive technology', errors)
    require('#v2-validation-modal .panel{background:#fff;border-radius:6px;width:min(960px,calc(100vw - 32px))' in html, 'V2 HTML validation modal should fit narrow viewports', errors)
    require_all([
        ('validation modal body allows overflow scrolling', '#v2-validation-modal .body{padding:10px 14px;overflow:auto' in html),
        ('validation modal footer wraps controls', '#v2-validation-modal .foot{flex-wrap:wrap' in html),
    ], 'V2 HTML validation modal should keep wide tables and footer usable on narrow viewports', errors)
    require_all([
        ('modal visibility exposes active dialog', "modal?.setAttribute('aria-hidden', 'false')" in html),
        ('modal visibility hides inactive dialog', "modal?.setAttribute('aria-hidden', 'true')" in html),
    ], 'V2 HTML modal visibility should synchronize aria-hidden', errors)
    require('type="button" class="btn btn-gray" id="v2_tpl_close" onclick="v2CloseTemplateManager()"' in html, 'V2 HTML template manager close button should be an explicit non-submit button', errors)
    require_all([
        ('CSV import trigger clicks stable file input', "document.getElementById('v2_csv_import').click()" in html),
        ('CSV import trigger references file input', 'aria-controls="v2_csv_import"' in html),
    ], 'V2 HTML CSV import button should be an explicit non-submit button with a stable file input target', errors)
    require('type="button" class="btn btn-gray" style="flex:1;font-size:10.5px;padding:4px 6px" onclick="v2ExportCaseCsv()"' in html, 'V2 HTML CSV export button should be an explicit non-submit button', errors)
    require('type="button" class="btn" style="flex:1;font-size:10.5px;padding:4px 6px;background:#196019;color:#fff" onclick="v2ExportXlsxSummary()"' in html, 'V2 HTML XLS summary export button should be an explicit non-submit button', errors)
    require(not re.search(r'<button(?![^>]*\btype=)', html), 'V2 HTML every button should declare an explicit type attribute', errors)
    icon_issues = icon_button_issues(html)
    require(not icon_issues, 'V2 HTML icon-only buttons should expose accessible names: ' + '; '.join(icon_issues[:8]), errors)
    for file_input_id in ['cert_img_input', 'diagramFile', 'stampFile', 'v2_csv_import', 'extra_img_input', 'importFile']:
        require_all([
            (f'{file_input_id} referenced by aria-controls', f'aria-controls="{file_input_id}"' in html),
            (f'{file_input_id} input exists', f'id="{file_input_id}"' in html),
        ], f'V2 HTML file picker button should reference {file_input_id}', errors)
    require("v2OpenCheckModal(document.activeElement, '審查明細')" in html, 'V2 HTML review details modal should use a context-specific title', errors)
    require("v2OpenCheckModal(document.activeElement, '⚠ 狀態提醒')" in html, 'V2 HTML status warning modal should use a context-specific title', errors)
    require_all([
        ('check modal exposes dialog role', 'role="dialog"' in html),
        ('check modal exposes aria-modal', 'aria-modal="true"' in html),
    ], 'V2 HTML check modal should expose dialog semantics', errors)
    require_all([
        ('check modal starts hidden from assistive tech', 'aria-hidden="true"' in html),
        ('check modal clears hidden state when opened', "modal?.setAttribute('aria-hidden', 'false')" in html),
        ('check modal restores hidden state when closed', "modal?.setAttribute('aria-hidden', 'true')" in html),
    ], 'V2 HTML check modal should synchronize aria-hidden with visibility', errors)
    require_all([
        ('check modal is labelled by title', 'aria-labelledby="v2_check_title"' in html),
        ('check modal is described by body', 'aria-describedby="v2_check_body"' in html),
    ], 'V2 HTML check modal should connect title and body for assistive technology', errors)
    require("v2_check_proceed')?.focus" in html, 'V2 HTML check modal should focus the primary action when opened', errors)
    require_all([
        ('check modal restore focus helper exists', 'function v2RestoreCheckModalFocus' in html),
        ('check modal restore uses preventScroll focus', "target.focus({preventScroll:true})" in html),
    ], 'V2 HTML check modal should restore focus before hiding', errors)
    require('document.activeElement.blur()' in html, 'V2 HTML check modal should blur stale focus when return target is unavailable', errors)
    require_all([
        ('check modal has constrained responsive width', 'width:min(760px,calc(100vw - 32px))' in html),
        ('check modal has narrow viewport media query', '@media (max-width:520px)' in html),
    ], 'V2 HTML check modal should fit narrow viewports', errors)
    require_all([
        ('check modal body style exists', '#v2-check-modal .body' in html),
        ('check modal body allows overflow scrolling', 'overflow:auto' in html),
    ], 'V2 HTML check modal body should allow horizontal scrolling for wide review tables', errors)
    require('#v2-check-modal .foot{display:flex;flex-wrap:wrap' in html, 'V2 HTML check modal should keep footer controls usable on narrow viewports', errors)
    require_all([
        ('check modal close assertion helper exists', 'def assert_check_modal_closed' in ui_smoke),
        ('check modal closed-state JS constant exists', 'CHECK_MODAL_CLOSED_JS' in ui_smoke),
    ], 'ui_smoke_test.py should centralize modal close state checks', errors)
    require_all([
        ('validation modal close assertion helper exists', 'def assert_validation_modal_closed' in ui_smoke),
        ('validation modal closed-state JS constant exists', 'VALIDATION_MODAL_CLOSED_JS' in ui_smoke),
    ], 'ui_smoke_test.py should centralize validation modal close state checks', errors)
    require_all([
        ('keyboard semantics smoke coverage', 'keyboard_semantics' in ui_smoke),
        ('chip group label smoke coverage', 'badChipGroups' in ui_smoke),
        ('toolbar role smoke coverage', 'toolbarRole' in ui_smoke),
        ('toolbar label smoke coverage', 'toolbarLabel' in ui_smoke),
        ('method grid label smoke coverage', 'methodGridLabel' in ui_smoke),
        ('toggle button smoke coverage', 'badToggleButtons' in ui_smoke),
        ('icon toolbar button smoke coverage', 'badIconToolbarButtons' in ui_smoke),
        ('case icon button smoke coverage', 'badCaseIconButtons' in ui_smoke),
        ('zoom button smoke coverage', 'badZoomButtons' in ui_smoke),
        ('attachment preview escape smoke coverage', 'attachmentListEscapesAndLabels' in ui_smoke),
        ('extra appendix escape smoke coverage', 'extraAppendixEscapesAndLabels' in ui_smoke),
        ('certificate frontmatter escape smoke coverage', 'certificateFrontmatterEscapesAndLabels' in ui_smoke),
        ('validation/template escape smoke coverage', 'validationAndTemplateEscapes' in ui_smoke),
        ('CSV formula escape smoke coverage', 'csvFormulaEscapes' in ui_smoke),
        ('CSV quoted newline import smoke coverage', 'csvImportParsesQuotedNewlines' in ui_smoke),
        ('case CSV import guard smoke coverage', 'caseCsvImportGuards' in ui_smoke),
        ('upload preview DOM smoke coverage', 'uploadPreviewsUseDomNodes' in ui_smoke),
        ('raster image guard smoke coverage', 'rasterImageGuards' in ui_smoke),
        ('Word image unsafe data smoke coverage', 'wordImageRejectsUnsafeData' in ui_smoke),
        ('project JSON import guard smoke coverage', 'projectJsonImportGuards' in ui_smoke),
        ('toolbar shortcut key smoke coverage', 'toolbarShortcutKeys' in ui_smoke),
        ('template manager popup smoke coverage', 'templateManagerPopup' in ui_smoke),
        ('shortcut hint hidden smoke coverage', 'shortcutHintHidden' in ui_smoke),
        ('progress hidden smoke coverage', 'progressHidden' in ui_smoke),
        ('PDF apply default text smoke coverage', 'pdfApplyDefaultText' in ui_smoke),
        ('PDF picker role smoke coverage', 'pdfPickerRole' in ui_smoke),
        ('PDF picker description smoke coverage', 'pdfPickerDescribedby' in ui_smoke),
        ('PDF picker control smoke coverage', 'badPdfPickerControls' in ui_smoke),
        ('PDF picker apply button smoke coverage', 'pdf_picker_apply' in ui_smoke),
        ('search label smoke coverage', 'searchLabel' in ui_smoke),
        ('mode pressed state smoke coverage', 'modePressed' in ui_smoke),
        ('tier pressed state smoke coverage', 'tierPressed' in ui_smoke),
        ('manual chip keyboard target smoke coverage', "chip[data-v=\\\"manual\\\"]" in ui_smoke),
        ('back anchor method keyboard target smoke coverage', "v2-method-card[data-method=\\\"bk_4h\\\"]" in ui_smoke),
    ], 'ui_smoke_test.py should cover keyboard activation and group labels for clickable controls', errors)
    require_all([
        ('attachment appendix per-page allow-list', 'const V2_EXTRA_PER_PAGE_VALUES = Object.freeze([1, 2, 4, 6])' in html),
        ('attachment appendix per-page normalizer', 'function v2NormalizeExtraPerPage' in html),
        ('attachment appendix enabled helper', 'function extraAppendixEnabled' in html),
        ('attachment appendix title helper', 'function extraAppendixTitle' in html),
        ('attachment appendix note helper', 'function extraAppendixNote' in html),
        ('attachment appendix layout helper', 'function extraLayout(inp)' in html),
        ('imported payload per-page value is normalized', 'inp.extra_per_page  = v2NormalizeExtraPerPage' in html),
        ('appendix enabled checkbox is synchronized', 'if(cb) cb.checked = on' in html),
        ('appendix title is escaped before rendering', 'escapeHtml(extraAppendixTitle(inp))' in html),
        ('UI smoke per-page normalization coverage', 'extraPerPageNormalization' in ui_smoke),
        ('UI smoke payload-aware appendix settings coverage', 'extraAppendixSettingsUsePayload' in ui_smoke),
    ], 'V2 attachment appendix settings should normalize imported, saved and layout values through payload-aware helpers', errors)
    require_all([
        ('project title avoids raw interpolation', '<span>${inp.proj' not in html),
        ('document title avoids raw interpolation', '<div class="doc-title">${title}' not in html),
        ('case name avoids raw fallback interpolation', '${cd.name||' not in html),
    ], 'V2 HTML report titles should escape project, appendix and case names before rendering', errors)
    require_all([
        ('report images avoid raw page source interpolation', '<img src="${p.src}"' not in html),
        ('stamp image avoids raw source interpolation', '<img src="${stampImg}"' not in html),
        ('attachment image avoids raw source interpolation', '<img src="${img.src}"' not in html),
        ('image alt avoids inline escape anti-pattern', '<img src="${src}" alt="${escapeHtml' not in html),
        ('Word document title avoids raw interpolation', '<div class="word-doc-title">${title}' not in html),
    ], 'V2 HTML and Word image/title output should escape dynamic src/title values before rendering', errors)
    require_all([
        ('formula topic cell avoids raw interpolation', '<td>${row.topic}</td>' not in html),
        ('formula scope cell avoids raw interpolation', '<td>${row.scope}</td>' not in html),
        ('formula reference cell avoids raw interpolation', '<td>${row.ref}</td>' not in html),
        ('formula name cell avoids raw interpolation', '<td>${row.name}</td>' not in html),
        ('anchor basis avoids raw fallback interpolation', '${row.anchor?.basis ||' not in html),
        ('anchor psi basis avoids raw interpolation', '${row.anchor.psiBasisLabel}' not in html),
        ('check row item avoids raw interpolation', '${c.no} ${c.item}' not in html),
    ], 'V2 HTML report tables and check rows should escape row/check text before rendering', errors)
    require_all([
        ('case width cell avoids raw interpolation', '<td>${r.w}</td>' not in html),
        ('case height cell avoids raw interpolation', '<td>${r.h}</td>' not in html),
        ('case type cell avoids raw interpolation', '<td>${r.type}</td>' not in html),
        ('case tag cell avoids raw join interpolation', "<td>${r.tags.join('、')}</td>" not in html),
        ('template method label avoids direct map lookup', "const methodLabel = V2_METHOD_MAP[tpl.method]?.label" not in html),
    ], 'V2 helper exports and template manager should escape case/template metadata before rendering', errors)
    require_all([
        ('validation expected input avoids raw value interpolation', 'value="${r.expected?.Fph||\'\'}"' not in html),
        ('validation row id avoids raw HTML interpolation', '<td style="text-align:center"><b>${r.id}</b></td>' not in html),
        ('anchor lookup note avoids raw innerHTML', 'info.innerHTML = `查表 <b>${key}</b>' not in html),
        ('city options avoid raw interpolation', 'cities.map(c=>`<option value="${c}">${c}</option>`)' not in html),
        ('district options avoid raw interpolation', 'dists.map(d=>`<option value="${d}">${d}</option>`)' not in html),
    ], 'V2 validation table, anchor lookup note and location options should escape dynamic UI values before rendering', errors)
    require_all([
        ('CSV cell sanitizer helper', 'function csvSafeCell' in html),
        ('CSV line helper', 'function csvLine' in html),
        ('CSV blob helper', 'function csvBlob' in html),
        ('CSV download helper', 'function downloadCsv' in html),
        ('formula prefix guard', '^[\\s]*[=+\\-@]' in html),
        ('case rows use csvLine', 'rows.map(csvLine)' in html),
        ('case import template header uses csvLine', "csvLine(['編號','案例說明','Fph_期望'" in html),
        ('change log export header uses csvLine', "csvLine(['序號','版次','時間','JSON 位元組數'])" in html),
        ('batch audit CSV header uses csvLine', "csvLine(['SDS', 'WindV', 'Size'" in html),
        ('CSV downloads use shared helper', 'downloadCsv(lines,' in html),
        ('mixed row downloads normalize through csvLine', 'downloadCsv(lines.map(row => Array.isArray(row) ? csvLine(row) : row)' in html),
        ('UI smoke formula injection coverage', 'capturedName === \'safe.csv\'' in ui_smoke),
    ], 'V2 CSV exports should neutralize spreadsheet formulas via shared CSV cell and download helpers', errors)
    require_all([
        ('filename cap constant', 'const V2_DOWNLOAD_FILENAME_MAX = 180' in html),
        ('filename sanitizer helper', 'function v2DownloadFilename' in html),
        ('anchor download assignment uses sanitizer', 'a.download = v2DownloadFilename(filename)' in html),
        ('UI smoke filename guard', 'downloadFilenameGuards' in ui_smoke),
    ], 'V2 download helper should sanitize and cap filenames before assigning anchor downloads', errors)
    require("downloadBlob(new Blob(['\\uFEFF'+html], {type:'application/vnd.ms-excel'})" in html and "downloadBlob(new Blob([data], {type:'application/json'}), `${exportBaseFilename('專案')}.json`)" in html, 'V2 XLS and JSON exports should use the shared download helper for object URL cleanup', errors)
    require_all([
        ('CSV parser helper', 'function v2ParseCsvText' in html),
        ('case CSV import parses whole text', 'const rows = v2ParseCsvText(text)' in html),
        ('single-line CSV parser reuses shared parser', "v2ParseCsvText(String(line || ''))[0]" in html),
    ], 'V2 CSV import should parse whole CSV text so quoted newlines stay inside cells', errors)
    require_all([
        ('case CSV byte cap constant', 'const V2_CASE_CSV_MAX_BYTES = 2 * 1024 * 1024' in html),
        ('case CSV file guard helper', 'function v2IsAllowedCaseCsvFile' in html),
        ('case CSV reader uses explicit UTF-8', "reader.readAsText(file, 'utf-8')" in html),
        ('UI smoke case CSV guard coverage', 'caseCsvImportGuards' in ui_smoke),
    ], 'V2 case CSV import should restrict file type, size and encoding before parsing', errors)
    require_all([
        ('stored array reader helper', 'function v2ReadStoredArray' in html),
        ('stored array fallback guard', 'Array.isArray(parsed) ? parsed : fallback' in html),
        ('plain object guard helper', 'function v2PlainObject' in html),
        ('user template normalizer', 'function v2NormalizeUserTemplate' in html),
        ('validation reference normalizer', 'function v2NormalizeValidationRef' in html),
        ('change log row normalizer', 'function v2NormalizeChangeLogRow' in html),
        ('change log reader helper', 'function v2ReadChangeLog' in html),
        ('template write failure reporting', 'v2WriteUserTemplates failed' in html),
        ('validation reference write failure reporting', 'v2SaveValidationRefs failed' in html),
        ('change log append failure reporting', 'v2AppendChangeLog failed' in html),
        ('UI smoke malformed array coverage', 'storedArrayGuards' in ui_smoke),
        ('UI smoke item fallback coverage', 'itemFallbacks' in ui_smoke),
        ('UI smoke storage write failure coverage', 'storageWriteFailuresReported' in ui_smoke),
        ('UI smoke change log write failure coverage', 'change_log_write_failure' in ui_smoke),
    ], 'V2 localStorage array readers and writers should reject malformed data and report setting write failures before rendering/exporting', errors)
    require_all([
        ('CSS selector escape helper', 'function v2CssEscape' in html),
        ('method card lookup helper', 'function v2MethodCardByKey' in html),
        ('template option label helper', 'function v2TemplateOptionLabel' in html),
        ('stored template method uses guarded lookup', 'v2MethodCardByKey(tpl.method)' in html),
        ('UI smoke selector guard coverage', 'selectorGuardOk' in ui_smoke),
    ], 'V2 template loading should escape dynamic selector values from stored templates and built-in keys', errors)
    require_all([
        ('PDF parse errors rendered with textContent', 'msg.textContent = `PDF 解析失敗：${err?.message || err}`' in html),
        ('PDF parse errors avoid raw HTML injection', '<p class="note" style="color:#c00">PDF 解析失敗：${err.message||err}</p>' not in html),
    ], 'V2 PDF picker should render parse failures as text, not raw HTML', errors)
    require_all([
        ('diagram preview image has alt text', "img.alt = '立面圖預覽'" in html),
        ('stamp preview image has alt text', "img.alt = '簽章預覽'" in html),
        ('upload previews avoid raw base64 HTML', '<img src="${b64}"' not in html),
        ('empty upload preview uses text fallback', "el.textContent = '未上傳'" in html),
    ], 'V2 upload previews should use DOM image nodes with alt text and text fallback', errors)
    require_all([
        ('raster image type allow-list', 'V2_ALLOWED_RASTER_IMAGE_TYPES' in html),
        ('raster image file guard helper', 'function v2IsAllowedRasterImageFile' in html),
        ('safe raster data URL guard helper', 'function v2IsSafeRasterDataUrl' in html),
        ('stored raster data URL reader', 'function v2StoredRasterDataUrl' in html),
        ('stored raster cleanup helper', 'function v2NormalizeStoredRasterImages' in html),
        ('stored raster cleanup error reporting', 'v2NormalizeStoredRasterImages remove failed' in html),
        ('attachment list sanitizer helper', 'function v2SanitizeAttachmentList' in html),
        ('attachment store normalization helper', 'function v2NormalizeAttachmentStores' in html),
        ('DOCX stamp export re-checks stored raster', 'imageSourceToDocxAsset(v2StoredRasterDataUrl(STAMP_KEY))' in html),
        ('DOCX diagram export re-checks stored raster', 'imageSourceToDocxAsset(v2StoredRasterDataUrl(DIAGRAM_KEY))' in html),
        ('UI smoke SVG rejection coverage', 'image/svg+xml' in ui_smoke),
        ('UI smoke old stored image rejection coverage', 'storedRejectsOldData' in ui_smoke),
        ('UI smoke old stored image cleanup coverage', 'storedCleanupRemovesOldData' in ui_smoke),
        ('UI smoke cleanup failure coverage', 'storedCleanupFailureReported' in ui_smoke),
        ('UI smoke attachment store normalization coverage', 'attachmentStoresNormalized' in ui_smoke),
        ('user-facing unsupported image message', '不支援的圖片格式' in html),
    ], 'V2 image uploads and exports should allow only raster data URLs, reject SVG/non-image files, and report cleanup failures', errors)
    require_all([
        ('raster image byte cap constant', 'const V2_RASTER_IMAGE_MAX_BYTES = 5 * 1024 * 1024' in html),
        ('PDF attachment byte cap constant', 'const V2_PDF_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024' in html),
        ('PDF total page cap constant', 'const V2_PDF_ATTACHMENT_MAX_PAGES = 30' in html),
        ('PDF selection page cap constant', 'const V2_PDF_SELECTION_MAX_PAGES = 12' in html),
        ('generic file size helper', 'function v2FileWithinLimit' in html),
        ('PDF file type helper', 'function v2IsPdfAttachmentFile' in html),
        ('PDF total page guard helper', 'function v2PdfPageCountWithinLimit' in html),
        ('PDF selection guard helper', 'function v2PdfSelectionWithinLimit' in html),
        ('oversized file rejection helper', 'function v2RejectOversizedFile' in html),
        ('UI smoke oversized raster coverage', 'bigRaster' in ui_smoke),
        ('UI smoke oversized PDF coverage', 'bigPdf' in ui_smoke),
    ], 'V2 image and PDF attachment imports should cap file sizes and page counts before reading into memory', errors)
    require_all([
        ('PDF picker rejects too many total pages', 'v2RejectTooManyPdfPages(file, pdf.numPages)' in html),
        ('PDF picker rejects too many selected pages', 'v2RejectTooManyPdfSelections(picked.length)' in html),
        ('UI smoke total page limit coverage', 'v2PdfPageCountWithinLimit(30)' in ui_smoke),
        ('UI smoke selection page limit coverage', 'v2PdfSelectionWithinLimit(12)' in ui_smoke),
    ], 'V2 PDF picker should limit total PDF pages and selected pages per import', errors)
    require_all([
        ('PDF render error message helper', 'function v2PdfRenderErrorMessage' in html),
        ('PDF page render failure is logged', "console.warn('PDF page render failed', err)" in html),
        ('PDF page import stages images before commit', 'const pending = []' in html),
        ('PDF page import commits only staged images', 'attachmentStore(target).push(...pending)' in html),
        ('PDF apply button state is restored after page failure', "applyBt.disabled = false; applyBt.textContent = '加入所選頁面';" in html),
        ('UI smoke PDF page render failure coverage', 'PDF 頁面轉圖失敗' in ui_smoke),
    ], 'V2 PDF picker should recover apply button state and avoid partial attachment writes when page rendering fails', errors)
    require_all([
        ('PDF thumbnail render failure is logged', "console.warn('PDF thumbnail render failed', err)" in html),
        ('PDF apply remains disabled before thumbnails are ready', "applyBt.disabled = true;" in html),
        ('PDF thumbnail errors render via shared text helper', "msg.textContent = v2PdfRenderErrorMessage(err)" in html),
        ('UI smoke PDF apply default text coverage', "if keyboard_semantics['pdfApplyDefaultText'] != '加入所選頁面'" in ui_smoke),
    ], 'V2 PDF picker should keep apply disabled until thumbnails are ready and show thumbnail render errors as text', errors)
    require_all([
        ('diagram upload storage failure reporting', 'uploadDiagram local save failed' in html),
        ('stamp upload storage failure reporting', 'uploadStamp local save failed' in html),
        ('diagram clear storage failure reporting', 'clearDiagram local remove failed' in html),
        ('stamp clear storage failure reporting', 'clearStamp local remove failed' in html),
        ('UI smoke image clear failure coverage', 'clearImageFailuresReported' in ui_smoke),
        ('image storage errors use readable reporter', 'v2ReportStorageError(err)' in html),
    ], 'V2 diagram and stamp uploads/clears should show readable storage errors when localStorage fails', errors)
    require_all([
        ('stamp export reads through stored raster guard', 'const stampImg = v2StoredRasterDataUrl(STAMP_KEY)' in html),
        ('diagram export reads through stored raster guard', 'const diagramImg = v2StoredRasterDataUrl(DIAGRAM_KEY)' in html),
        ('exports avoid raw diagram image interpolation', '<img src="${diagramImg}"' not in html),
    ], 'V2 HTML/Word exports should re-check stored stamp and diagram images before rendering', errors)
    require_all([
        ('Word image helper checks data image prefix', 'const safeSrc = /^data:image\\//i.test(imageSrc)' in html),
        ('DOCX image conversion rejects unsafe raster URL', "if(!v2IsSafeRasterDataUrl(src)) throw new Error('Unsupported image data URL')" in html),
        ('UI smoke unsafe Word image coverage', 'wordImageRejectsUnsafeData' in ui_smoke),
    ], 'V2 Word image helper and DOCX image conversion should reject unsafe image data URLs', errors)
    require_all([
        ('raster file pickers advertise explicit formats', 'accept=".png,.jpg,.jpeg,.webp,.gif"' in html),
        ('attachment picker advertises raster plus PDF formats', 'accept=".png,.jpg,.jpeg,.webp,.gif,application/pdf,.pdf"' in html),
        ('file pickers avoid broad image wildcard', 'image/*' not in html),
        ('UI smoke diagram accept coverage', "document.querySelector('#diagramFile')?.getAttribute('accept') === rasterAccept" in ui_smoke),
    ], 'V2 file pickers should advertise only supported raster/PDF formats', errors)
    require_all([
        ('project JSON size cap constant', 'const V2_PROJECT_JSON_MAX_BYTES = 10 * 1024 * 1024' in html),
        ('project JSON file guard helper', 'function v2IsAllowedProjectJsonFile' in html),
        ('project JSON shared import helper', 'function v2ImportProjectText' in html),
        ('base64 UTF-8 decoder helper', 'function v2DecodeBase64Utf8' in html),
        ('raw project JSON text size guard', 'v2ProjectJsonTextWithinLimit(raw)' in html),
        ('file reader uses explicit UTF-8', "reader.readAsText(file, 'utf-8')" in html),
        ('file picker advertises JSON only', "document.querySelector('#importFile')?.getAttribute('accept') === '.json'" in ui_smoke),
    ], 'V2 project JSON import should restrict file type, size and encoding before parsing', errors)
    require_all([
        ('hash import uses shared validated import path', "v2ImportProjectText(json, 'hash_import_replace')" in html),
        ('hash import avoids direct storage write', 'localStorage.setItem(STORAGE_KEY, json)' not in html),
        ('UI smoke covers base64 UTF-8 decoding', "v2DecodeBase64Utf8('eyJ4Ijoi5bCI5qGIIn0=')" in ui_smoke),
    ], 'V2 hash project import should share the validated project import path', errors)
    require_all([
        ('storage error message helper exists', 'function v2StorageErrorMessage' in html),
        ('storage error reporter helper exists', 'function v2ReportStorageError' in html),
        ('canonical project write failure is logged', 'setStoredProjectRaw failed' in html),
        ('legacy cleanup failure is warning-only', 'setStoredProjectRaw legacy cleanup failed' in html),
        ('snapshot failure is logged', 'v2SnapshotState failed' in html),
        ('snapshot apply failure is logged', 'v2ApplySnapshot failed' in html),
        ('undo applies through guarded snapshot helper', 'if(!v2ApplySnapshot(prev))' in html),
        ('redo applies through guarded snapshot helper', 'if(!v2ApplySnapshot(next))' in html),
        ('local save failure is reported', 'save local storage failed' in html),
        ('storage quota message is user-readable', '本機儲存空間不足' in html),
        ('backup status field exists', 'let _lastStoredProjectBackupStatus' in html),
        ('snapshot failure status is tracked', "_lastStoredProjectBackupStatus = 'snapshot_failed'" in html),
        ('cleanup failure status is tracked', "_lastStoredProjectBackupStatus = 'cleanup_failed'" in html),
    ], 'V2 storage writes should report readable errors and keep undo/redo guarded', errors)
    require_all([
        ('recovery snapshot failure aborts backup isolation', 'if(!storeRecoverySnapshot(key, raw, reason))' in html),
        ('backup cleanup failure is logged', 'backupStoredProjectRaw cleanup failed' in html),
        ('restore cleanup failure is logged', 'restoreRecoveryBackup cleanup failed' in html),
        ('restore apply failure is logged', 'restoreRecoveryBackup apply failed' in html),
        ('restore rollback failure is logged', 'restoreRecoveryBackup rollback failed' in html),
        ('project import apply failure is logged', 'v2ImportProjectText apply failed' in html),
        ('project import rollback failure is logged', 'v2ImportProjectText rollback failed' in html),
    ], 'V2 recovery restore/import flows should log apply, cleanup and rollback failures', errors)
    require_all([
        ('recovery download filename helper exists', 'function recoveryBackupDownloadFilename' in html),
        ('recovery project-name helper exists', 'function recoveryBackupProjectName' in html),
        ('recovery display-name helper exists', 'function recoveryBackupDisplayName' in html),
        ('recovery restorable-state helper exists', 'function recoveryBackupCanRestore' in html),
        ('recovery time label helper exists', 'function recoveryBackupTimeLabel' in html),
        ('recovery notice uses shared time label', 'const backedUpAt = recoveryBackupTimeLabel(info)' in html),
        ('recovery confirmation can omit missing time label', "const backedUpAt = recoveryBackupTimeLabel(info, '')" in html),
        ('recovery download failure is logged', 'downloadRecoveryBackup failed' in html),
        ('UI smoke recovery download failure coverage', 'recoveryDownloadFailureReturnsFalse' in ui_smoke),
    ], 'V2 recovery backup display, time and download helpers should be shared and covered', errors)
    require_all([
        ('invalid recovery envelope guard exists', 'if(!info || typeof info !==' in html),
        ('invalid recovery metadata status exists', 'recovery_metadata_invalid' in html),
        ('invalid recovery metadata message is readable', '隔離索引格式不符' in html),
        ('UI smoke invalid recovery envelope coverage', 'recoveryInvalidEnvelopeDownloadsAsText' in ui_smoke),
        ('invalid recovery raw payload type guard exists', 'hasSnapshotRaw && typeof info.raw !==' in html),
        ('invalid recovery payload type status exists', 'recovery_payload_type_invalid' in html),
        ('invalid recovery payload type message is readable', '隔離內容型別不符' in html),
        ('UI smoke invalid recovery payload type coverage', 'recoveryInvalidPayloadTypeDownloadsEnvelope' in ui_smoke),
        ('missing recovery payload status exists', 'recovery_payload_missing' in html),
        ('missing recovery payload message is readable', '隔離內容缺漏' in html),
        ('UI smoke missing recovery payload coverage', 'recoveryMissingPayloadDownloadsEnvelope' in ui_smoke),
    ], 'V2 recovery metadata diagnostics should distinguish invalid envelope, invalid payload and missing payload', errors)
    require_all([
        ('recovery restore rejects non-restorable backups', 'if(!recoveryBackupCanRestore(info)) return false' in html),
        ('recovery restore button follows restorable helper', 'const restoreBtn = recoveryBackupCanRestore(info)' in html),
        ('UI smoke recovery restorable-state coverage', 'recoveryCanRestoreChecks' in ui_smoke),
        ('malformed recovery envelope flag exists', 'malformedEnvelope: true' in html),
        ('download without recovery info returns false', 'if(!info) return false' in html),
        ('download success path returns true', 'return true' in html),
    ], 'V2 recovery restore/download actions should distinguish restorable and diagnostic-only backups', errors)
    require_all([
        ('recovery notice uses project-name helper', "const projectName = recoveryBackupProjectName(info)" in html),
        ('recovery download uses display name fallback', "const baseName = recoveryBackupDisplayName(info, '未命名專案')" in html),
        ('recovery clear confirmation uses display name', 'const displayName = recoveryBackupDisplayName(info)' in html),
        ('recovery restore confirmation uses display name fallback', "const projectName = recoveryBackupDisplayName(info, '未命名專案')" in html),
        ('UI smoke recovery notice project-name-only coverage', 'recoveryNoticeUsesProjectNameOnly' in ui_smoke),
    ], 'V2 recovery labels should use project/display-name helpers without leaking storage keys', errors)
    require_all([
        ('recovery reason filename token helper exists', 'function recoveryReasonFilenameToken' in html),
        ('hash import recovery reason is readable', '分享連結匯入前備份' in html),
        ('broken recovery envelope reason is readable', '隔離索引損壞' in html),
        ('UI smoke recovery reason labels coverage', 'recoveryReasonLabelsAreReadable' in ui_smoke),
        ('UI smoke internal recovery reason is hidden in filename', "!downloadedRecoveryName.includes('pre_import_replace')" in ui_smoke),
    ], 'V2 recovery reasons should be user-readable and avoid internal codes in filenames', errors)
    require_all([
        ('recovery notice exposes live status semantics', 'role="status" aria-live="polite" aria-label="隔離備份提示"' in html),
        ('recovery actions expose named group semantics', 'role="group" aria-label="隔離備份操作"' in html),
        ('recovery restore button has readable label', 'aria-label="還原隔離備份"' in html),
        ('recovery download button has readable label', 'aria-label="下載隔離備份"' in html),
        ('recovery clear button has readable label', 'aria-label="清除隔離備份提示"' in html),
        ('recovery download extension follows recognizable project state', 'const asJson = Boolean(info.recognizable)' in html),
        ('UI smoke recovery button labels coverage', 'recoveryActionButtonsAreLabelled' in ui_smoke),
        ('UI smoke recovery action group coverage', 'recoveryActionGroupIsLabelled' in ui_smoke),
        ('UI smoke recovery notice status coverage', 'recoveryNoticeHasStatusSemantics' in ui_smoke),
    ], 'V2 recovery notice and action buttons should expose readable accessible semantics', errors)
    require_all([
        ('clear recovery confirmation helper exists', 'function clearRecoveryConfirmMessage' in html),
        ('current project info helper exists', 'function currentStoredProjectInfo' in html),
        ('restore recovery confirmation helper exists', 'function restoreRecoveryConfirmMessage' in html),
        ('restore confirmation warns when current project cannot be backed up', '目前沒有可辨識的專案可先備份' in html),
        ('restore confirmation asks before replacing current project', '還原這份隔離備份？' in html),
        ('recovery confirmation includes backup reason', '備份原因：' in html),
        ('recovery download filename includes product label', '石材固定隔離備份' in html),
        ('modal confirmation helper is defined', 'function v2ConfirmAction' in html),
        ('clear confirmation is shown before clearing backup', 'v2ConfirmAction(clearRecoveryConfirmMessage(info)' in html),
        ('restore confirmation is shown before restoring backup', 'v2ConfirmAction(restoreRecoveryConfirmMessage(info)' in html),
        ('UI smoke clear confirmation context coverage', 'clearRecoveryConfirmShowsContext' in ui_smoke),
        ('UI smoke restore confirmation context coverage', 'recoveryRestoreConfirmShowsContext' in ui_smoke),
        ('UI smoke restore confirmation current-state coverage', 'recoveryRestoreConfirmReflectsCurrentState' in ui_smoke),
        ('UI smoke clear requires confirmation coverage', 'clearRecoveryRequiresConfirm' in ui_smoke),
    ], 'V2 recovery clear/restore confirmations should show context and require confirmation', errors)
    require_all([
        ('hash-import recovery reason branch exists', "if(key === 'hash_import_replace')" in html),
        ('invalid project storage is kept when backup fails', 'load kept invalid project storage because recovery backup failed' in html),
        ('invalid project storage is kept when cleanup fails', 'load kept invalid project storage because recovery cleanup failed after backup' in html),
        ('unrecognized project storage is kept when backup fails', 'load kept unrecognized project storage because recovery backup failed' in html),
        ('unrecognized project storage is kept when cleanup fails', 'load kept unrecognized project storage because recovery cleanup failed after backup' in html),
        ('migration persistence failure continues in memory', 'load migration persistence failed; continuing with in-memory project' in html),
        ('migration persistence failure status is exported', "meta.migration_persist_status = 'failed'" in html),
        ('migration metadata includes persistence status', 'migrationMeta.migration_persist_status' in html),
        ('source integrity hashes source payload before migration', "stableSerialize({ inp: source?.inp || {}, cases: source?.cases || [] })" in html),
        ('migration toast uses transient load event', 'const info = _projectMigrationEventInfo' in html),
        ('migration persistence removes stale source hash while pending', "meta.input_hash = '';" in html and "meta.migration_persist_status = 'pending'" in html),
        ('migration persistence recomputes normalized input hash', 'startProjectMigrationPersistence' in html and 'meta.input_hash = inputHash' in html),
        ('project save hashes and writes the same immutable snapshot', 'const inputSnapshot = v2CloneJson({ inp, cases: casesSave })' in html and 'stableSerialize(inputSnapshot)' in html and 'inp: inputSnapshot.inp' in html and 'cases: inputSnapshot.cases' in html),
        ('latest asynchronous project save wins', 'let _projectPersistenceRequestToken = 0' in html and 'const requestToken = ++_projectPersistenceRequestToken' in html and 'if(requestToken !== _projectPersistenceRequestToken) return payload' in html and 'rapid_save_latest_wins' in ui_smoke),
        ('project replacement invalidates pending asynchronous writes', '使先前尚在計算 hash 的 save/export 寫回失效' in html and '_projectPersistenceRequestToken++;' in html and 'project_replacement_invalidates_pending_save' in ui_smoke),
        ('project load replaces rather than appends cases', "document.getElementById('cases-list')?.replaceChildren()" in html and 'caseCountStable' in ui_smoke),
        ('pending or failed migration persistence retries on reload', "priorMigrationPersistStatus === 'pending'" in html and "priorMigrationPersistStatus === 'failed'" in html and '|| persistenceRetry' in html),
        ('pending migration persistence blocks export', "migrationPersistStatus === 'pending'" in html and '稍候完成後再匯出' in html),
        ('migration failure message is readable', '本機儲存寫回失敗' in html),
        ('migration checklist asks user to export JSON', '匯出前請先下載專案 JSON' in html),
        ('UI smoke migration checklist warning coverage', 'migrationExportChecklistWarns' in ui_smoke),
        ('UI smoke migration payload metadata coverage', 'migration_payload_meta' in ui_smoke),
        ('UI smoke migration payload persistence status coverage', "payload?.meta?.migration_persist_status" in ui_smoke),
        ('UI smoke migration load still succeeds coverage', 'migrationPersistenceFailureStillLoads' in ui_smoke),
        ('UI smoke migrated source integrity coverage', "'integrityStatus': 'verified'" in ui_smoke),
        ('UI smoke normalized reload toast coverage', 'normalized_reload_state' in ui_smoke),
        ('UI smoke external tamper mismatch coverage', 'tampered_project_integrity' in ui_smoke),
        ('UI smoke interrupted migration retry coverage', 'pending_migration_retry' in ui_smoke and 'pendingExportBlocked' in ui_smoke),
    ], 'V2 migration and invalid-storage handling should preserve data and expose persistence warnings', errors)
    require_all([
        ('restore pre-replacement snapshot is mandatory', "if(!storeRecoverySnapshot(current.key || STORAGE_KEY, current.raw, 'pre_restore_replace')) return false" in html),
        ('import backs up current recognizable project', 'if(current.recognizable && current.raw)' in html),
        ('import stores recovery snapshot before replacement', 'storeRecoverySnapshot(current.key || STORAGE_KEY, current.raw, recoveryReason)' in html),
        ('import abort message is readable when backup fails', '匯入前無法備份目前專案，已保留現有資料。' in html),
        ('clear recovery failure is logged', 'clearRecoveryBackup failed' in html),
        ('UI smoke restore without confirmation path coverage', 'restoreRecoveryBackup({confirm:false})' in ui_smoke),
        ('UI smoke project import backup failure coverage', 'projectImportBackupFailurePreservesCurrent' in ui_smoke),
        ('UI smoke project import apply failure coverage', 'projectImportApplyFailurePreservesRecovery' in ui_smoke),
        ('UI smoke recovery restore failure coverage', 'recoveryRestoreFailurePreservesCurrent' in ui_smoke),
        ('UI smoke recovery restore apply failure coverage', 'recoveryRestoreApplyFailurePreservesRecovery' in ui_smoke),
        ('UI smoke recovery restore cleanup failure coverage', 'recoveryRestoreCleanupFailurePreservesRecovery' in ui_smoke),
    ], 'V2 restore/import replacement flows should require backups and preserve recoverable data on failure', errors)
    require_all([
        ('UI smoke storage setItem monkeypatch exists', 'Storage.prototype.setItem' in ui_smoke),
        ('UI smoke storage removeItem monkeypatch exists', 'Storage.prototype.removeItem' in ui_smoke),
        ('UI smoke storage error path coverage', 'storageErrorOk' in ui_smoke),
        ('UI smoke storage alert path coverage', 'storageAlertOk' in ui_smoke),
        ('UI smoke legacy cleanup failure coverage', 'canonicalWriteSurvivesLegacyCleanupFailure' in ui_smoke),
        ('UI smoke undo canonical storage coverage', 'undoSnapshotUsesCanonicalStorage' in ui_smoke),
        ('UI smoke undo failure stack preservation coverage', 'undoFailureKeepsStacks' in ui_smoke),
        ('UI smoke redo failure stack preservation coverage', 'redoFailureKeepsStacks' in ui_smoke),
        ('UI smoke recovery backup failure coverage', 'recoveryBackupFailurePreservesData' in ui_smoke),
        ('UI smoke recovery cleanup failure coverage', 'recoveryCleanupFailurePreservesData' in ui_smoke),
        ('UI smoke cleanup-failed status coverage', "_lastStoredProjectBackupStatus === 'cleanup_failed'" in ui_smoke),
        ('UI smoke recovery download filename coverage', 'recoveryDownloadFilenameIncludesContext' in ui_smoke),
        ('UI smoke broken recovery JSON coverage', 'recoveryBrokenJsonDownloadsAsText' in ui_smoke),
        ('UI smoke malformed recovery envelope coverage', 'recoveryMalformedEnvelopeDownloadsAsText' in ui_smoke),
        ('UI smoke unrecognized recovery JSON coverage', 'recoveryUnrecognizedJsonDownloadsAsText' in ui_smoke),
        ('UI smoke recovery download return status coverage', 'recoveryDownloadReturnStatus' in ui_smoke),
    ], 'ui_smoke_test.py should cover storage failures, recovery isolation, undo/redo safety and recovery downloads', errors)
    require('function v2StorageErrorMessage' in html and 'function v2ReportStorageError' in html and 'setStoredProjectRaw failed' in html and 'setStoredProjectRaw legacy cleanup failed' in html and 'v2SnapshotState failed' in html and 'v2ApplySnapshot failed' in html and 'if(!v2ApplySnapshot(prev))' in html and 'if(!v2ApplySnapshot(next))' in html and 'save local storage failed' in html and '本機儲存空間不足' in html and 'let _lastStoredProjectBackupStatus' in html and "_lastStoredProjectBackupStatus = 'snapshot_failed'" in html and "_lastStoredProjectBackupStatus = 'cleanup_failed'" in html and 'if(!storeRecoverySnapshot(key, raw, reason))' in html and 'backupStoredProjectRaw cleanup failed' in html and 'restoreRecoveryBackup cleanup failed' in html and 'restoreRecoveryBackup apply failed' in html and 'restoreRecoveryBackup rollback failed' in html and 'v2ImportProjectText apply failed' in html and 'v2ImportProjectText rollback failed' in html and 'function recoveryBackupDownloadFilename' in html and 'function recoveryBackupProjectName' in html and 'function recoveryBackupDisplayName' in html and 'function recoveryBackupCanRestore' in html and 'function recoveryBackupTimeLabel' in html and 'const backedUpAt = recoveryBackupTimeLabel(info)' in html and "const backedUpAt = recoveryBackupTimeLabel(info, '')" in html and 'downloadRecoveryBackup failed' in html and 'recoveryDownloadFailureReturnsFalse' in ui_smoke and 'if(!info || typeof info !==' in html and 'recovery_metadata_invalid' in html and '隔離索引格式不符' in html and 'recoveryInvalidEnvelopeDownloadsAsText' in ui_smoke and 'hasSnapshotRaw && typeof info.raw !==' in html and 'recovery_payload_type_invalid' in html and '隔離內容型別不符' in html and 'recoveryInvalidPayloadTypeDownloadsEnvelope' in ui_smoke and 'if(!recoveryBackupCanRestore(info)) return false' in html and 'const restoreBtn = recoveryBackupCanRestore(info)' in html and 'recoveryCanRestoreChecks' in ui_smoke and "const projectName = recoveryBackupProjectName(info)" in html and "const baseName = recoveryBackupDisplayName(info, '未命名專案')" in html and 'const displayName = recoveryBackupDisplayName(info)' in html and "const projectName = recoveryBackupDisplayName(info, '未命名專案')" in html and 'recoveryNoticeUsesProjectNameOnly' in ui_smoke and 'function recoveryReasonFilenameToken' in html and '分享連結匯入前備份' in html and '隔離索引損壞' in html and 'recovery_payload_missing' in html and '隔離內容缺漏' in html and 'recoveryMissingPayloadDownloadsEnvelope' in ui_smoke and 'malformedEnvelope: true' in html and 'if(!info) return false' in html and 'return true' in html and 'role="status" aria-live="polite" aria-label="隔離備份提示"' in html and 'role="group" aria-label="隔離備份操作"' in html and 'aria-label="還原隔離備份"' in html and 'aria-label="下載隔離備份"' in html and 'aria-label="清除隔離備份提示"' in html and 'const asJson = Boolean(info.recognizable)' in html and 'function clearRecoveryConfirmMessage' in html and 'function currentStoredProjectInfo' in html and 'function restoreRecoveryConfirmMessage' in html and '目前沒有可辨識的專案可先備份' in html and '還原這份隔離備份？' in html and '備份原因：' in html and '石材固定隔離備份' in html and "if(key === 'hash_import_replace')" in html and 'load kept invalid project storage because recovery backup failed' in html and 'load kept invalid project storage because recovery cleanup failed after backup' in html and 'load kept unrecognized project storage because recovery backup failed' in html and 'load kept unrecognized project storage because recovery cleanup failed after backup' in html and 'load migration persistence failed; continuing with in-memory project' in html and "meta.migration_persist_status = 'failed'" in html and 'migrationMeta.migration_persist_status' in html and '本機儲存寫回失敗' in html and '匯出前請先下載專案 JSON' in html and 'migrationExportChecklistWarns' in ui_smoke and 'migration_payload_meta' in ui_smoke and "payload?.meta?.migration_persist_status" in ui_smoke and "if(!storeRecoverySnapshot(current.key || STORAGE_KEY, current.raw, 'pre_restore_replace')) return false" in html and 'if(current.recognizable && current.raw)' in html and 'storeRecoverySnapshot(current.key || STORAGE_KEY, current.raw, recoveryReason)' in html and '匯入前無法備份目前專案，已保留現有資料。' in html and 'function v2ConfirmAction' in html and 'v2ConfirmAction(clearRecoveryConfirmMessage(info)' in html and 'v2ConfirmAction(restoreRecoveryConfirmMessage(info)' in html and 'clearRecoveryBackup failed' in html and 'Storage.prototype.setItem' in ui_smoke and 'Storage.prototype.removeItem' in ui_smoke and 'storageErrorOk' in ui_smoke and 'storageAlertOk' in ui_smoke and 'canonicalWriteSurvivesLegacyCleanupFailure' in ui_smoke and 'undoSnapshotUsesCanonicalStorage' in ui_smoke and 'undoFailureKeepsStacks' in ui_smoke and 'redoFailureKeepsStacks' in ui_smoke and 'recoveryBackupFailurePreservesData' in ui_smoke and 'recoveryCleanupFailurePreservesData' in ui_smoke and "_lastStoredProjectBackupStatus === 'cleanup_failed'" in ui_smoke and 'recoveryRestoreFailurePreservesCurrent' in ui_smoke and 'recoveryRestoreApplyFailurePreservesRecovery' in ui_smoke and 'recoveryRestoreCleanupFailurePreservesRecovery' in ui_smoke and 'recoveryRestoreConfirmShowsContext' in ui_smoke and 'recoveryRestoreConfirmReflectsCurrentState' in ui_smoke and 'restoreRecoveryBackup({confirm:false})' in ui_smoke and 'projectImportBackupFailurePreservesCurrent' in ui_smoke and 'projectImportApplyFailurePreservesRecovery' in ui_smoke and 'recoveryDownloadFilenameIncludesContext' in ui_smoke and 'recoveryBrokenJsonDownloadsAsText' in ui_smoke and 'recoveryMalformedEnvelopeDownloadsAsText' in ui_smoke and 'recoveryUnrecognizedJsonDownloadsAsText' in ui_smoke and 'recoveryDownloadReturnStatus' in ui_smoke and 'recoveryActionButtonsAreLabelled' in ui_smoke and 'recoveryActionGroupIsLabelled' in ui_smoke and 'recoveryNoticeHasStatusSemantics' in ui_smoke and "!downloadedRecoveryName.includes('pre_import_replace')" in ui_smoke and 'recoveryReasonLabelsAreReadable' in ui_smoke and 'clearRecoveryConfirmShowsContext' in ui_smoke and 'migrationPersistenceFailureStillLoads' in ui_smoke and 'clearRecoveryRequiresConfirm' in ui_smoke, 'V2 project storage and recovery backup writes should preserve existing data and show readable errors when localStorage fails', errors)
    require_all([
        ('project JSON export uses shared download helper', "downloadBlob(new Blob([data], {type:'application/json'}), `${exportBaseFilename('專案')}.json`)" in html),
        ('temporary anchor attached flag', 'let attached = false' in html),
        ('temporary anchor cleanup', 'if(attached) a.remove()' in html),
        ('object URL revoke', 'URL.revokeObjectURL(url)' in html),
        ('UI smoke cleanup coverage', 'downloadBlobCleansUp' in ui_smoke),
    ], 'V2 project JSON export should use the shared download helper that revokes object URLs and cleans temporary anchors', errors)
    require_all([
        ('project JSON export reports local save failure', 'exportJSON local save failed' in html),
        ('project JSON export still downloads via shared helper', "downloadBlob(new Blob([data], {type:'application/json'}), `${exportBaseFilename('專案')}.json`)" in html),
    ], 'V2 project JSON export should continue downloading even if localStorage save fails', errors)
    require_all([
        ('UI smoke lightbox a11y coverage', 'lightbox_a11y' in ui_smoke),
        ('UI smoke lightbox focus restore fixture', '背扣雙角鐵示意圖' in ui_smoke),
    ], 'ui_smoke_test.py should cover lightbox dialog semantics and focus restore', errors)
    require_all([
        ('UI smoke template modal a11y coverage', 'template_modal_a11y' in ui_smoke),
        ('UI smoke template modal layout coverage', 'template_layout' in ui_smoke),
    ], 'ui_smoke_test.py should cover template manager dialog semantics and narrow layout', errors)
    require_all([
        ('UI smoke status modal coverage', 'status_modal' in ui_smoke),
        ('UI smoke status pill trigger coverage', 'v2-status-pill' in ui_smoke),
        ('UI smoke warning modal title coverage', '⚠ 狀態提醒' in ui_smoke),
    ], 'ui_smoke_test.py should cover status pill keyboard modal flow', errors)
    require_all([
        ('global focus-visible styles exist', ':focus-visible' in html),
        ('mode button focus-visible style exists', '.v2-mode-switch .mode-btn:focus-visible' in html),
        ('tier button focus-visible style exists', '.v2-tier-bar .tier-btn:focus-visible' in html),
        ('generic button focus-visible style exists', '.btn:focus-visible' in html),
        ('method zoom focus-visible style exists', '.v2-method-card .zoom-btn:focus-visible' in html),
        ('case copy focus-visible style exists', '.case-card .v2-case-copy:focus-visible' in html),
        ('case delete focus-visible style exists', 'button[aria-label="刪除此案例"]:focus-visible' in html),
        ('attachment remove focus-visible style exists', 'button[aria-label="移除此附件"]:focus-visible' in html),
    ], 'V2 HTML should show visible focus states for review dashboard, toggle and small action controls', errors)
    require_all([
        ('dashboard collapse preference key exists', 'stone_review_dashboard_collapsed' in html),
        ('workflow mode storage failure is reported', 'v2SetWorkflowMode persist failed' in html),
        ('dashboard collapse storage failure is reported', 'v2ToggleReviewDashboardCollapsed persist failed' in html),
        ('UI smoke preference storage failure coverage', 'uiPreferenceStorageFailures' in ui_smoke),
    ], 'V2 HTML should persist workflow/dashboard preferences and report readable errors when preference storage fails', errors)
    require_all([
        ('dashboard collapse control exists', 'dash-toggle' in html),
        ('dashboard collapsed style state exists', 'is-collapsed' in html),
    ], 'V2 HTML should render and style the review dashboard collapse control', errors)
    require_all([
        ('compact dashboard media query exists', '@media (max-width:900px)' in html),
        ('compact dashboard uses wrapping layout', 'flex-wrap:wrap' in html),
    ], 'V2 HTML should keep compact dashboard wrapping styles', errors)
    require('text-overflow:ellipsis' in html, 'V2 HTML dashboard title should avoid compact-width overflow', errors)
    require("return rows.some(item => item.level !== 'info')" in html, 'V2 HTML export fallback should conservatively confirm non-info checklist items', errors)
    require('匯出前有 ${rows.length} 項需確認' in html, 'V2 HTML export fallback should render a readable checklist modal', errors)
    require('deliveryQualityReasonText(quality)' in html, 'V2 HTML delivery quality fallback should preserve quality reasons', errors)
    for helper_name in [
        'dashboardServerInfo',
        'deliveryQualityGradeFromSummary',
        'deliveryQualityChecklistItem',
        'exportChecklistNeedsConfirmation',
        'exportChecklistHtml',
        'deliveryQualityReasonText',
    ]:
        require(helper_name in review_dashboard, f'js/review-dashboard.js should export {helper_name}', errors)
        require(helper_name in review_dashboard_test, f'js/review-dashboard-smoke.test.js should cover {helper_name}', errors)

    require(bool(app_version), 'HTML APP_VERSION is missing', errors)
    require(bool(server_version), 'server.py SERVER_VERSION is missing', errors)
    require(bool(template_version), 'HTML TEMPLATE_CATALOG_VERSION is missing', errors)
    require(bool(calc_version), 'HTML calculator core version is missing', errors)
    if app_version and server_version:
        require(
            app_version.lstrip('Vv') == server_version,
            f'APP_VERSION ({app_version}) and SERVER_VERSION ({server_version}) should match',
            errors,
        )

    old_html_pattern = re.compile(r'石材計算書產生器_規範版(?!V2)\.html')
    for name, text in [
        ('server.py', server),
        ('auto_word.py', auto_word),
        ('開啟石材計算書.bat', launcher),
        (TARGET_HTML, html),
    ]:
        require(not old_html_pattern.search(text), f'{name} still references the legacy non-V2 HTML file', errors)

    if app_version:
        require(f'## {app_version}' in changelog, f'CHANGELOG.md should include a section for {app_version}', errors)
        require(app_version in release_checklist, f'RELEASE_CHECKLIST.md should mention current app version {app_version}', errors)
    if server_version:
        require(f'SERVER_VERSION = {server_version}' in changelog, f'CHANGELOG.md should mention SERVER_VERSION = {server_version}', errors)
        require('server.SERVER_VERSION' in release_bundle, 'make_release_bundle.py should use server.SERVER_VERSION for output names', errors)
        for name in ['server_smoke_test.py', 'audit_schema_test.py', 'audit_compare_test.py', 'ui_smoke_test.py', 'js/review-dashboard-smoke.test.js']:
            text = read_text(name)
            require(f"'{server_version}'" not in text and f'"{server_version}"' not in text, f'{name} should not hard-code current server version', errors)
            require(f"'V{server_version}'" not in text and f'"V{server_version}"' not in text, f'{name} should not hard-code current app version', errors)
    if template_version:
        require(template_version in changelog, f'CHANGELOG.md should mention template version {template_version}', errors)
    if calc_version:
        require(calc_version in changelog, f'CHANGELOG.md should mention calculator version {calc_version}', errors)
        regression_smoke = read_text('js/regression-smoke.test.js')
        require(
            f"'{calc_version}'" not in regression_smoke and f'"{calc_version}"' not in regression_smoke,
            'js/regression-smoke.test.js should not hard-code current calculator version',
            errors,
        )

    require('CHANGELOG.md' in readme, 'README.md should link to CHANGELOG.md', errors)
    require('RELEASE_CHECKLIST.md' in readme, 'README.md should link to RELEASE_CHECKLIST.md', errors)
    require('PROJECT_FILES.md' in readme, 'README.md should link to PROJECT_FILES.md', errors)
    require('自我檢查.bat' in readme, 'README.md should mention 自我檢查.bat', errors)
    require('audit_schema_test.py' in readme, 'README.md should mention audit_schema_test.py', errors)
    require('比對稽核報告.bat' in readme, 'README.md should mention 比對稽核報告.bat', errors)
    require('建立交接包.bat' in readme, 'README.md should mention 建立交接包.bat', errors)
    require('交付前檢查.bat' in readme, 'README.md should mention 交付前檢查.bat', errors)
    require('--latest --fail-on-regression' in readme, 'README.md should mention latest audit regression gate', errors)
    require('--latest --fail-on-regression' in release_checklist, 'RELEASE_CHECKLIST.md should mention latest audit regression gate', errors)
    require('--fail-on-regression' in audit_compare_bat, '比對稽核報告.bat should enable --fail-on-regression', errors)
    require('Quality gate' in audit_compare_bat, '比對稽核報告.bat should display quality gate status', errors)
    require(TARGET_HTML in project_files, f'PROJECT_FILES.md should mention {TARGET_HTML}', errors)
    require('server.py' in project_files, 'PROJECT_FILES.md should mention server.py', errors)
    require('js/regression-smoke.test.js' in project_files, 'PROJECT_FILES.md should mention js/regression-smoke.test.js', errors)
    require('js/formula-registry.spec.js' in project_files, 'PROJECT_FILES.md should mention js/formula-registry.spec.js', errors)
    require('js/formula-registry-smoke.test.js' in project_files, 'PROJECT_FILES.md should mention js/formula-registry-smoke.test.js', errors)
    require('js/version-sync.js' in project_files, 'PROJECT_FILES.md should mention js/version-sync.js', errors)
    require('js/version-sync-smoke.test.js' in project_files, 'PROJECT_FILES.md should mention js/version-sync-smoke.test.js', errors)
    require('js/review-dashboard.js' in project_files, 'PROJECT_FILES.md should mention js/review-dashboard.js', errors)
    require('js/review-dashboard-smoke.test.js' in project_files, 'PROJECT_FILES.md should mention js/review-dashboard-smoke.test.js', errors)
    require('env_check.py' in project_files, 'PROJECT_FILES.md should mention env_check.py', errors)
    require('make_release_bundle.py' in project_files, 'PROJECT_FILES.md should mention make_release_bundle.py', errors)
    require('release_bundle_smoke_test.py' in project_files, 'PROJECT_FILES.md should mention release_bundle_smoke_test.py', errors)
    require('cleanup_temp_test.py' in project_files, 'PROJECT_FILES.md should mention cleanup_temp_test.py', errors)
    require('ui_smoke_test.py' in project_files, 'PROJECT_FILES.md should mention ui_smoke_test.py', errors)
    require('audit_compare.py' in project_files, 'PROJECT_FILES.md should mention audit_compare.py', errors)
    require('audit_schema.py' in project_files, 'PROJECT_FILES.md should mention audit_schema.py', errors)
    require('audit_schema_test.py' in project_files, 'PROJECT_FILES.md should mention audit_schema_test.py', errors)
    require('audit_compare_test.py' in project_files, 'PROJECT_FILES.md should mention audit_compare_test.py', errors)
    require('比對稽核報告.bat' in project_files, 'PROJECT_FILES.md should mention 比對稽核報告.bat', errors)
    require('交付前檢查.bat' in project_files, 'PROJECT_FILES.md should mention 交付前檢查.bat', errors)
    require('audit schema/comparison' in self_check_bat, '自我檢查.bat should label audit schema/comparison tests', errors)
    require('cleanup/release bundle' in self_check_bat, '自我檢查.bat should label cleanup/release bundle tests', errors)
    require('js\\version-sync.js' in self_check_bat, '自我檢查.bat should syntax-check js/version-sync.js', errors)
    require('js\\\\version-sync.js' in pre_delivery, 'pre_delivery_check.py should syntax-check js/version-sync.js', errors)
    require('js\\version-sync-smoke.test.js' in self_check_bat, '自我檢查.bat should run js/version-sync-smoke.test.js', errors)
    require('js\\\\version-sync-smoke.test.js' in pre_delivery, 'pre_delivery_check.py should run js/version-sync-smoke.test.js', errors)
    require('js\\review-dashboard-smoke.test.js' in self_check_bat, '自我檢查.bat should run js/review-dashboard-smoke.test.js', errors)
    require('js\\\\review-dashboard-smoke.test.js' in pre_delivery, 'pre_delivery_check.py should run js/review-dashboard-smoke.test.js', errors)
    require('RELEASE_MANIFEST.json' in release_bundle, 'make_release_bundle.py should write RELEASE_MANIFEST.json', errors)
    require('RELEASE_MANIFEST.json' in release_bundle_test, 'release_bundle_smoke_test.py should verify RELEASE_MANIFEST.json', errors)
    require('RELEASE_MANIFEST.json' in readme, 'README.md should mention RELEASE_MANIFEST.json', errors)
    require('verify_release_bundle.py' in readme, 'README.md should mention verify_release_bundle.py', errors)
    require('verify_release_bundle.py' in project_files, 'PROJECT_FILES.md should mention verify_release_bundle.py', errors)
    require('verify_release_bundle.py' in release_bundle_test, 'release_bundle_smoke_test.py should exercise verify_release_bundle.py', errors)
    for name in ['audit_schema.py', 'audit_schema_test.py', 'audit_compare.py', 'audit_compare_test.py']:
        require(name in readme, f'README.md should mention {name}', errors)
        require(name in self_check_bat, f'自我檢查.bat should mention {name}', errors)
    for name in PY_COMPILE_REQUIRED:
        require(name in readme, f'README.md py_compile example should include {name}', errors)
        require(name in self_check_bat, f'自我檢查.bat py_compile step should include {name}', errors)
        require(name in project_files, f'PROJECT_FILES.md should mention Python core file {name}', errors)
        require(name in release_bundle, f'make_release_bundle.py CORE_FILES should include {name}', errors)

    return report(errors)


def report(errors: list[str]) -> int:
    if errors:
        print('Project consistency checks failed:')
        for error in errors:
            print(f' - {error}')
        return 1
    print('Project consistency checks passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
