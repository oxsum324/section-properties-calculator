# -*- coding: utf-8 -*-
"""
石材計算書伺服器 v2
- 以 http://127.0.0.1:8765 同時提供靜態檔案與 Word 產生 API
- CORS 僅允許本機工具頁；file:// 僅保留 /status 心跳。
"""
import json, os, sys, subprocess, time, threading, tempfile, hashlib
import http.server
from pathlib import Path
from urllib.parse import unquote

PORT     = 8765
TOOL_DIR = Path(__file__).parent          # …/石材固定/
ROOT_DIR = TOOL_DIR.parent                # …/小工具製作/，僅用來保留 /石材固定/... URL
TOOL_HTML = '石材計算書產生器_規範版V2.html'
TOOL_URL_PATH = f'/石材固定/{TOOL_HTML}'
SERVER_VERSION = '3.0.6'
LOCAL_HTTP_ORIGINS = {
    f'http://127.0.0.1:{PORT}',
    f'http://localhost:{PORT}',
}
MAX_POST_BYTES = 50 * 1024 * 1024
PAGE_ONLY_REVIEW_STATUS_NEEDLES = (
    '產報前檢查',
    '附件適用狀態',
    '優先建議報告閱讀狀態',
    '報告閱讀狀態',
    '可作附件',
    '暫勿作附件',
    '頁面輔助',
    '公司內部整理計算附件',
    '不會寫入計算書',
    '不會寫入計算書或列印 PDF',
)
PAGE_ONLY_REVIEW_STATUS_KEY_MARKERS = (
    'page_only',
    'report_reading_status',
    'priority_report_reading_status',
    'attachment_status',
    'calc_attachment_status',
    'reader_status',
)
_DROP_PAGE_ONLY_REVIEW_STATUS = object()

# ── 閒置自動關閉 ──────────────────────────────────────────
# 背景 pythonw 啟動時，超過 N 分鐘無任何請求則結束，避免長駐占記憶體。
IDLE_SHUTDOWN_MIN = 30
_last_request_ts = time.monotonic()

class PayloadError(ValueError):
    pass


def _idle_watchdog():
    while True:
        time.sleep(60)
        if time.monotonic() - _last_request_ts > IDLE_SHUTDOWN_MIN * 60:
            os._exit(0)


def server_status():
    return {
        'ok': True,
        'server_version': SERVER_VERSION,
        'tool_html': TOOL_HTML,
        'tool_url': TOOL_URL_PATH,
        'port': PORT,
        'static_scope': str(TOOL_DIR),
        'max_post_mb': MAX_POST_BYTES // 1024 // 1024,
        'idle_shutdown_min': IDLE_SHUTDOWN_MIN,
        'cors_origins': sorted(LOCAL_HTTP_ORIGINS),
    }


def safe_filename(name, fallback='石材固定構件'):
    cleaned = ''.join('_' if c in r'\/:*?"<>|' else c for c in str(name or ''))
    cleaned = ' '.join(cleaned.split()).strip()
    return cleaned or fallback


def export_timestamp():
    return time.strftime('%Y%m%d_%H%M%S')


def export_stem_from_payload(data, kind='計算書'):
    inp = data.get('inp') if isinstance(data.get('inp'), dict) else {}
    meta = data.get('meta') if isinstance(data.get('meta'), dict) else {}
    proj = safe_filename(inp.get('proj') or '石材固定構件')
    version = safe_filename(meta.get('app_version') or f'v{SERVER_VERSION}', 'V2')
    return safe_filename(f'{proj}_石材固定{kind}_{version}_{export_timestamp()}')


def payload_sha256(data):
    raw = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def _check_pass_value(check):
    if not isinstance(check, dict):
        return False
    status = str(check.get('status', '')).lower()
    if status == 'warning':
        return True
    return bool(check.get('pass', False))


def _finite_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in (float('inf'), float('-inf')) else None


def _check_dcr_value(check):
    if not isinstance(check, dict):
        return None
    normalized = _finite_float(check.get('dcr'))
    if normalized is not None and normalized >= 0:
        return normalized
    value = _finite_float(check.get('v'))
    allow = _finite_float(check.get('a'))
    if value is None or allow is None or allow <= 0:
        return None
    sense = str(check.get('sense') or '').lower()
    formula = str(check.get('formula') or '')
    allow_text = str(check.get('allow') or '')
    if sense == 'range':
        min_value = _finite_float(check.get('min'))
        max_value = _finite_float(check.get('max'))
        ratios = []
        if min_value is not None and min_value > 0 and value > 0:
            ratios.append(min_value / value)
        if max_value is not None and max_value > 0:
            ratios.append(value / max_value)
        return max(ratios) if ratios else None
    if sense == 'min' or ('≥' in formula + allow_text) or ('>=' in formula + allow_text):
        return allow / value if value > 0 else None
    return abs(value / allow)


def summarize_results(data):
    cases = data.get('cases') if isinstance(data.get('cases'), list) else []
    results = data.get('results') if isinstance(data.get('results'), list) else []
    review_notes = data.get('reviewNotes') if isinstance(data.get('reviewNotes'), dict) else {}
    checks_total = 0
    checks_failed = 0
    warnings = 0
    worst = {'dcr': 0.0, 'case_name': '—', 'item': '—'}
    worst_warning = {'dcr': 0.0, 'case_name': '—', 'item': '—'}
    dcr_sense_counts = {'max': 0, 'min': 0, 'range': 0, 'info': 0, 'unknown': 0}
    case_summaries = []
    for idx, result in enumerate(results):
        if not isinstance(result, dict):
            continue
        checks = result.get('checks') if isinstance(result.get('checks'), list) else []
        failed = [c for c in checks if not _check_pass_value(c)]
        warning_count = sum(1 for c in checks if isinstance(c, dict) and str(c.get('status', '')).lower() == 'warning')
        checks_total += len(checks)
        checks_failed += len(failed)
        warnings += warning_count
        cd = cases[idx] if idx < len(cases) and isinstance(cases[idx], dict) else {}
        case_name = cd.get('name') or f'案例{idx + 1}'
        for check in checks:
            if not isinstance(check, dict):
                continue
            sense = str(check.get('sense') or 'max').lower()
            if sense not in dcr_sense_counts:
                sense = 'unknown'
            dcr_sense_counts[sense] += 1
            dcr = _check_dcr_value(check)
            if dcr is None:
                continue
            item = check.get('item') or check.get('no') or '檢核項目'
            if str(check.get('status', '')).lower() == 'warning':
                if dcr > worst_warning['dcr']:
                    worst_warning = {
                        'dcr': dcr,
                        'case_name': case_name,
                        'item': item,
                    }
                continue
            if dcr > worst['dcr']:
                worst = {
                    'dcr': dcr,
                    'case_name': case_name,
                    'item': item,
                }
        case_summaries.append({
            'name': case_name,
            'type': cd.get('type', ''),
            'all_ok': bool(result.get('all_ok', result.get('allOK', not failed))),
            'checks': len(checks),
            'failed_checks': len(failed),
            'warnings': warning_count,
        })
    return {
        'case_count': len(cases),
        'result_count': len(results),
        'checks_total': checks_total,
        'checks_failed': checks_failed,
        'warnings': warnings,
        'review_notes': len([v for v in review_notes.values() if str(v).strip()]),
        'worst': worst,
        'worst_warning': worst_warning,
        'dcr_method': 'normalized_by_check_sense',
        'dcr_sense_counts': dcr_sense_counts,
        'cases': case_summaries,
    }


def _server_review_summary(meta, server_info):
    raw_review = meta.get('review_summary', {})
    review = _strip_page_only_review_status(raw_review) if isinstance(raw_review, dict) else {}
    if not isinstance(review, dict):
        review = {}
    app_tool_html = str(meta.get('tool_html') or '')
    html_match = (app_tool_html == TOOL_HTML)
    server_eval = {
        'evaluated_by': 'server',
        'tool_html_match': html_match,
        'payload_tool_html': app_tool_html,
        'server_tool_html': TOOL_HTML,
        'server_version': SERVER_VERSION,
    }
    review['server_status_not_evaluated'] = False
    review['server_evaluation'] = server_eval
    if not html_match:
        quality = dict(review.get('delivery_quality', {})) if isinstance(review.get('delivery_quality'), dict) else {}
        reasons = quality.get('reasons') if isinstance(quality.get('reasons'), list) else []
        reason = f"工具 HTML 與伺服器不一致：payload={app_tool_html or '未記錄'}，server={TOOL_HTML}"
        if reason not in reasons:
            reasons = [reason, *reasons]
        review['delivery_quality'] = {
            'code': 'C',
            'text': 'C 先修正',
            'class': 'ng',
            'reasons': reasons,
        }
    return review


def infer_result_source(data, mode):
    if mode == 'auto_word':
        return 'frontend_results'
    cases = data.get('cases') if isinstance(data.get('cases'), list) else []
    results = data.get('results') if isinstance(data.get('results'), list) else []
    if results and len(results) == len(cases):
        return 'frontend_results'
    return 'legacy_python_fallback'


def _contains_page_only_review_status(value):
    text = str(value or '')
    return any(needle in text for needle in PAGE_ONLY_REVIEW_STATUS_NEEDLES)


def _is_page_only_review_status_key(key):
    normalized = str(key or '').replace('-', '_').lower()
    return (
        any(marker in normalized for marker in PAGE_ONLY_REVIEW_STATUS_KEY_MARKERS)
        or _contains_page_only_review_status(key)
    )


def _strip_page_only_review_status(value):
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            if _is_page_only_review_status_key(key):
                continue
            cleaned_item = _strip_page_only_review_status(item)
            if cleaned_item is not _DROP_PAGE_ONLY_REVIEW_STATUS:
                cleaned[key] = cleaned_item
        return cleaned
    if isinstance(value, list):
        cleaned = []
        for item in value:
            cleaned_item = _strip_page_only_review_status(item)
            if cleaned_item is not _DROP_PAGE_ONLY_REVIEW_STATUS:
                cleaned.append(cleaned_item)
        return cleaned
    if isinstance(value, str) and _contains_page_only_review_status(value):
        return _DROP_PAGE_ONLY_REVIEW_STATUS
    return value


def write_export_audit(data, out_path, mode, result_source=None):
    out_path = Path(out_path)
    meta = data.get('meta') if isinstance(data.get('meta'), dict) else {}
    server_info = server_status()
    report = {
        'ok': True,
        'report_type': 'stone_calc_export_audit',
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'mode': mode,
        'server': server_info,
        'tool': {
            'app_version': meta.get('app_version', ''),
            'tool_html': meta.get('tool_html', TOOL_HTML),
            'calculator_build': meta.get('calculator_build', ''),
            'generator': meta.get('generator', ''),
            'workflow_mode': meta.get('workflow_mode', ''),
            'template': meta.get('template', {}),
            # V3.0.2：StoneGovernanceProtocol 版本號
            'governance_protocol_version': str(meta.get('governance_protocol_version', '') or ''),
        },
        'trace': {
            'input_hash': str(meta.get('input_hash', '')),
            'normalized_input_hash': str(meta.get('normalized_input_hash', '') or ''),
            'result_hash': str(meta.get('result_hash', '') or ''),
            'payload_sha256': payload_sha256(data),
            'result_source': result_source or infer_result_source(data, mode),
            'schema': data.get('schema', ''),
            'version': data.get('version', ''),
            # V3.0.2：protocol 版本號於 trace 鏡射，validate_governance_meta() 可直接讀
            'governance_protocol_version': str(meta.get('governance_protocol_version', '') or ''),
            # V2.6.1：把 governance fingerprint 也寫入稽核報告，audit_compare 可比對工具+規範雙治理狀態
            'governance_fingerprint': str(meta.get('governance_fingerprint', '') or ''),
            'calc_source_hash': str(meta.get('calc_source_hash', '') or ''),
            'code_profiles_hashes': meta.get('code_profiles_hashes') if isinstance(meta.get('code_profiles_hashes'), dict) else {},
            # V2.8.0：governance acknowledgment 文字 + 三方雜湊；防止匯出後文字被竄改
            'governance_ack': str(meta.get('governance_ack', '') or ''),
            'governance_ack_hash': str(meta.get('governance_ack_hash', '') or ''),
        },
        'summary': summarize_results(data),
        'review': _server_review_summary(meta, server_info),
        'output': {
            'file': str(out_path),
            'name': out_path.name,
            'size_bytes': out_path.stat().st_size if out_path.exists() else None,
        },
    }
    report_path = out_path.with_name(out_path.stem + '_驗證報告.json')
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report_path


class Handler(http.server.SimpleHTTPRequestHandler):
    """僅提供 TOOL_DIR 內的靜態檔；/generate 僅作舊版相容 Word API。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def log_message(self, fmt, *args):
        pass  # 靜音 access log

    def handle_one_request(self):
        global _last_request_ts
        _last_request_ts = time.monotonic()
        return super().handle_one_request()

    # ── CORS preflight ──────────────────────────────────────────
    def do_OPTIONS(self):
        if not self._is_allowed_cors_origin(allow_file_status=False):
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def _request_origin(self):
        return self.headers.get('Origin')

    def _is_allowed_cors_origin(self, allow_file_status=True):
        origin = self._request_origin()
        if not origin:
            return True
        if origin in LOCAL_HTTP_ORIGINS:
            return True
        return allow_file_status and origin == 'null' and self.command == 'GET' and self.path == '/status'

    def _cors_headers(self):
        origin = self._request_origin()
        if origin in LOCAL_HTTP_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        elif origin == 'null' and self.command == 'GET' and self.path == '/status':
            self.send_header('Access-Control-Allow-Origin', 'null')
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _reject_forbidden_origin(self):
        if self._is_allowed_cors_origin(allow_file_status=False):
            return False
        self._json_resp(403, {
            'ok': False,
            'error': 'Forbidden origin. 請從本機石材計算書工具頁執行此操作。',
        })
        return True

    def _static_target(self):
        return Path(self.translate_path(self.path)).resolve()

    def _is_static_target_allowed(self, target):
        try:
            target.relative_to(TOOL_DIR.resolve())
        except ValueError:
            return False
        return True

    def _send_static_forbidden(self):
        body = 'Forbidden'.encode('utf-8')
        self.send_response(403)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_payload(self):
        content_type = (self.headers.get('Content-Type') or '').split(';', 1)[0].strip().lower()
        if content_type != 'application/json':
            raise PayloadError('請以 application/json 傳送資料。')
        try:
            length = int(self.headers.get('Content-Length', 0))
        except ValueError as exc:
            raise PayloadError('Content-Length 格式錯誤。') from exc
        if length <= 0:
            raise PayloadError('請求內容為空。')
        if length > MAX_POST_BYTES:
            raise PayloadError(f'請求內容過大，已超過 {MAX_POST_BYTES // 1024 // 1024} MB 上限。')
        body = self.rfile.read(length)
        try:
            data = json.loads(body.decode('utf-8'))
        except UnicodeDecodeError as exc:
            raise PayloadError('JSON 必須使用 UTF-8 編碼。') from exc
        except json.JSONDecodeError as exc:
            raise PayloadError(f'JSON 格式錯誤：{exc.msg}。') from exc
        if not isinstance(data, dict):
            raise PayloadError('JSON 根節點必須是物件。')
        return data

    # ── GET ─────────────────────────────────────────────────────
    def do_GET(self):
        # 根路徑 → meta refresh 跳到工具
        if self.path in ('', '/'):
            body = (
                '<!DOCTYPE html><html><head><meta charset="utf-8">'
                '<meta http-equiv="refresh" '
                f'content="0;url={TOOL_URL_PATH}">'
                '</head><body></body></html>'
            ).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return

        # /status 心跳
        if self.path == '/status':
            self._json_resp(200, server_status())
            return

        # 其餘靜態檔案：只允許工具資料夾內的明確檔案，不開放上層資料夾或目錄列表。
        target = self._static_target()
        if not self._is_static_target_allowed(target):
            self._send_static_forbidden()
            return
        if target.is_dir() and not (target / 'index.html').exists():
            self._send_static_forbidden()
            return
        super().do_GET()

    # ── POST /generate 舊版相容 與 /auto-word V2 ─────────────────
    def do_POST(self):
        if self._reject_forbidden_origin():
            return
        if self.path == '/generate':
            return self._handle_generate()
        if self.path == '/auto-word':
            return self._handle_auto_word()
        self.send_response(404)
        self.end_headers()

    def _handle_generate(self):
        """舊版相容：V2 payload 必須帶有效 results；舊 JSON 才允許 Python fallback。"""
        tmp_json = None
        try:
            data = self._read_json_payload()

            with tempfile.NamedTemporaryFile(
                'w',
                encoding='utf-8',
                dir=TOOL_DIR,
                prefix='_tmp_stone_report_',
                suffix='.json',
                delete=False,
            ) as fh:
                json.dump(data, fh, ensure_ascii=False, indent=2)
                tmp_json = Path(fh.name)

            sys.path.insert(0, str(TOOL_DIR))
            from generate_docx import generate_report, resolve_results
            out_path = generate_report(str(tmp_json))
            audit_data = data
            audit_result_source = infer_result_source(data, 'generate_legacy_compat')
            if not isinstance(data.get('results'), list) or not data.get('results'):
                computed_results, _result_source = resolve_results(
                    data,
                    data.get('inp', {}) if isinstance(data.get('inp'), dict) else {},
                    data.get('cases', []) if isinstance(data.get('cases'), list) else [],
                )
                audit_data = {**data, 'results': computed_results}
                audit_result_source = _result_source
            audit_path = write_export_audit(
                audit_data,
                out_path,
                'generate_legacy_compat',
                result_source=audit_result_source,
            )

            os.startfile(out_path)

            self._json_resp(200, {
                'ok': True,
                'file': str(out_path),
                'audit_file': str(audit_path),
                'mode': 'legacy_compat',
                'warning': '/generate 為舊版相容流程；V2 payload 只採用前端 results，不再靜默退回舊公式。',
            })

        except PayloadError as e:
            self._json_resp(400, {
                'ok': False,
                'error': str(e),
                'mode': 'bad_request',
            })
        except ValueError as e:
            self._json_resp(422, {
                'ok': False,
                'error': str(e),
                'mode': 'legacy_compat_blocked',
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._json_resp(500, {'ok': False, 'error': str(e)})
        finally:
            if tmp_json:
                tmp_json.unlink(missing_ok=True)

    def _handle_auto_word(self):
        """新版：HTML 工具 → Chromium 列印 PDF → pdf2docx → DOCX。
        版面與字級完全對齊「預覽列印」的視覺輸出。"""
        try:
            data = self._read_json_payload()

            sys.path.insert(0, str(TOOL_DIR))
            from auto_word import auto_export_word

            out_dir = TOOL_DIR / 'output'
            stem = f'{export_stem_from_payload(data, "計算書")}_{threading.get_ident()}'

            out_path = auto_export_word(data, out_dir, stem)
            audit_path = write_export_audit(data, out_path, 'auto_word')
            os.startfile(str(out_path))
            self._json_resp(200, {'ok': True, 'file': str(out_path), 'audit_file': str(audit_path)})

        except PayloadError as e:
            self._json_resp(400, {
                'ok': False,
                'error': str(e),
                'mode': 'bad_request',
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._json_resp(500, {'ok': False, 'error': str(e)})

    def _json_resp(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self._cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    # ThreadingHTTPServer：/auto-word 處理時仍可並行回應 Playwright 對本機靜態檔的請求
    threading.Thread(target=_idle_watchdog, daemon=True).start()
    try:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError as e:
        # port 已被佔用（通常是另一個實例已在背景跑），安靜離開
        sys.exit(0 if 'already in use' in str(e).lower() or 'WSA' in str(e) else 1)
    print(f'石材計算書伺服器已啟動 → http://127.0.0.1:{PORT}')
    print('按 Ctrl+C 停止。\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('已停止。')
