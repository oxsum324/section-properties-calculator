from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
from typing import Any, Callable, Iterator

from .receiver_governance_archive import _json_from_bytes
from .receiver_governance_archive_lifecycle_portfolio import (
    MAX_SCAN_DEPTH,
    MAX_UPCOMING_DAYS,
    TOOL_REPOSITORY_ROOT,
    _inside,
    _physical_directory,
    _same_path,
    exit_code_for_snapshot,
    scan_portfolio,
    validate_portfolio_snapshot,
)
from .receiver_governance_timestamp import _canonical_json_bytes, _iso, _now_iso


MONITOR_KIND = "governance-external-archive-lifecycle-monitor-state"
MONITOR_CONTEXT = "governance-external-archive-lifecycle-monitor-state-v1"
SIGNAL_KIND = "governance-external-archive-lifecycle-monitor-signal"
EVENT_KIND = "governance-external-archive-lifecycle-monitor-event"
DASHBOARD_STATUS_KIND = "governance-external-archive-lifecycle-monitor-dashboard-status"
DASHBOARD_HISTORY_KIND = "governance-external-archive-lifecycle-monitor-dashboard-history"
EVENT_DIRECTORY_NAME = "events"
LATEST_FILE_NAME = "GSM-外部歸檔生命週期監測-latest.json"
LOCK_FILE_NAME = ".GSM-monitor.lock"
EVENT_PATTERN = re.compile(r"^GSM-外部歸檔生命週期監測事件-(?P<sequence>[0-9]{6})-(?P<fingerprint>GME-[0-9A-F]{20})\.json$")
MAX_STATE_JSON_BYTES = 10_000_000
MAX_EVENT_COUNT = 100_000
ATTENTION_STATUSES = {"current", "upcoming", "review-due", "blocked"}
NOTIFICATION_KINDS = {"baseline-current", "baseline-attention", "unchanged", "attention-change", "recovered", "inventory-change"}
MONITOR_BOUNDARY = {
    "localGovernanceOnly": True,
    "readOnlySourceScan": True,
    "sameSignalDoesNotRepeatEventOrAlert": True,
    "alertOnlyOnAttentionChangeOrRecovery": True,
    "stateVerificationDoesNotRescanSource": True,
    "currentSourceStateRequiresMonitorRun": True,
    "doesNotModifyCheckpointOrArchive": True,
    "doesNotConstituteEngineeringApproval": True,
    "formalCalculationAttachment": False,
    "pagesPublication": False,
}
DASHBOARD_PRIVACY = {
    "scope": "local-only",
    "containsPaths": False,
    "containsCaseIdentifiers": False,
    "containsEvidenceFingerprints": False,
    "containsArchiveMetadata": False,
}


def _fingerprint(prefix: str, value: dict[str, Any], field: str) -> str:
    payload = {key: item for key, item in value.items() if key != field}
    return f"{prefix}-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


def monitor_signal_fingerprint(value: dict[str, Any]) -> str:
    return _fingerprint("GMS", value, "signalFingerprint")


def monitor_event_fingerprint(value: dict[str, Any]) -> str:
    return _fingerprint("GME", value, "eventFingerprint")


def monitor_state_fingerprint(value: dict[str, Any]) -> str:
    return _fingerprint("GSM", value, "monitorFingerprint")


def _require_exact(value: Any, fields: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError(f"{label}欄位不完整或含未知欄位。")
    return dict(value)


def _require_text(value: Any, label: str, *, maximum: int = 1000) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum or any(ord(char) < 32 for char in value):
        raise ValueError(f"{label}格式不正確。")
    return value


def _require_relative_path(value: Any, label: str) -> str:
    text = _require_text(value, label, maximum=4096)
    path = Path(text)
    if path.is_absolute() or ".." in path.parts or "\\" in text or text.startswith("/"):
        raise ValueError(f"{label}不是安全相對路徑。")
    return text


def _require_fingerprint(value: Any, prefix: str, label: str) -> str:
    text = str(value or "")
    if not re.fullmatch(rf"{re.escape(prefix)}-[0-9A-F]{{20}}", text):
        raise ValueError(f"{label}格式不正確。")
    return text


def _require_integer(value: Any, label: str, minimum: int = 0, maximum: int = 2_147_483_647) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= maximum:
        raise ValueError(f"{label}格式不正確。")
    return value


def _issue_codes(signal: dict[str, Any]) -> list[str]:
    codes = {str(item["code"]) for item in signal["issues"]}
    codes.update(str(item["errorCode"]) for item in signal["invalidPackages"])
    for chain in signal["chains"]:
        if chain["attentionStatus"] != "current":
            codes.update(str(item) for item in chain["reasons"])
    return sorted(codes)


def build_monitor_signal(snapshot: Any) -> dict[str, Any]:
    portfolio = validate_portfolio_snapshot(snapshot)
    signal: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": SIGNAL_KIND,
        "source": {
            "rootName": portfolio["source"]["rootName"],
            "maxScanDepth": portfolio["source"]["maxScanDepth"],
            "upcomingReminderDays": portfolio["source"]["upcomingReminderDays"],
        },
        "summary": dict(portfolio["summary"]),
        "chains": [{
            "chainId": chain["chainId"],
            "caseName": chain["selected"]["caseName"],
            "packageRelativePath": chain["selected"]["packageRelativePath"],
            "checkpointFingerprint": chain["selected"]["checkpointFingerprint"],
            "observedAt": chain["selected"]["observedAt"],
            "nextReviewDueAt": chain["selected"]["nextReviewDueAt"],
            "retentionUntil": chain["selected"]["retentionUntil"],
            "lifecycleStatus": chain["lifecycleStatus"],
            "attentionStatus": chain["attentionStatus"],
            "reasons": list(chain["reasons"]),
        } for chain in portfolio["chains"]],
        "invalidPackages": [{
            "caseName": item["caseName"],
            "packageRelativePath": item["packageRelativePath"],
            "errorCode": item["errorCode"],
            "message": item["message"],
        } for item in portfolio["invalidPackages"]],
        "issues": [{
            "level": item["level"],
            "code": item["code"],
            "message": item["message"],
            "entries": list(item["entries"]),
        } for item in portfolio["issues"]],
    }
    signal["signalFingerprint"] = monitor_signal_fingerprint(signal)
    return validate_monitor_signal(signal)


def validate_monitor_signal(value: Any) -> dict[str, Any]:
    record = _require_exact(value, {"schemaVersion", "kind", "source", "summary", "chains", "invalidPackages", "issues", "signalFingerprint"}, "GSM 訊號")
    if record["schemaVersion"] != 1 or record["kind"] != SIGNAL_KIND:
        raise ValueError("GSM 訊號版本或種類不受支援。")
    source = _require_exact(record["source"], {"rootName", "maxScanDepth", "upcomingReminderDays"}, "GSM 訊號來源")
    _require_text(source["rootName"], "GSM 訊號來源名稱", maximum=255)
    _require_integer(source["maxScanDepth"], "GSM 掃描深度", 1, MAX_SCAN_DEPTH)
    _require_integer(source["upcomingReminderDays"], "GSM 提醒天數", 0, MAX_UPCOMING_DAYS)
    summary = _require_exact(record["summary"], {"portfolioStatus", "attentionStatus", "chainCount", "currentCount", "upcomingCount", "reviewDueCount", "blockedCount", "invalidPackageCount", "errorIssueCount"}, "GSM 訊號摘要")
    if summary["portfolioStatus"] not in {"current", "review-due", "blocked"} or summary["attentionStatus"] not in ATTENTION_STATUSES:
        raise ValueError("GSM 訊號摘要狀態不受支援。")
    for field in ("chainCount", "currentCount", "upcomingCount", "reviewDueCount", "blockedCount", "invalidPackageCount", "errorIssueCount"):
        _require_integer(summary[field], f"GSM {field}")
    if not isinstance(record["chains"], list) or not isinstance(record["invalidPackages"], list) or not isinstance(record["issues"], list):
        raise ValueError("GSM 訊號清單格式不正確。")
    chain_ids: set[str] = set()
    package_paths: set[str] = set()
    for item in record["chains"]:
        chain = _require_exact(item, {"chainId", "caseName", "packageRelativePath", "checkpointFingerprint", "observedAt", "nextReviewDueAt", "retentionUntil", "lifecycleStatus", "attentionStatus", "reasons"}, "GSM 鏈")
        chain_id = _require_fingerprint(chain["chainId"], "GSL", "GSM 鏈指紋")
        if chain_id in chain_ids:
            raise ValueError("GSM 鏈指紋不得重複。")
        chain_ids.add(chain_id)
        _require_text(chain["caseName"], "GSM 案件名稱", maximum=255)
        relative = _require_relative_path(chain["packageRelativePath"], "GSM GSC 相對路徑")
        if relative in package_paths:
            raise ValueError("GSM GSC 相對路徑不得重複。")
        package_paths.add(relative)
        _require_fingerprint(chain["checkpointFingerprint"], "GSC", "GSM GSC 指紋")
        for field in ("observedAt", "nextReviewDueAt", "retentionUntil"):
            _iso(chain[field], f"GSM {field}")
        if chain["lifecycleStatus"] not in {"current", "review-due", "blocked"} or chain["attentionStatus"] not in ATTENTION_STATUSES:
            raise ValueError("GSM 鏈狀態不受支援。")
        if not isinstance(chain["reasons"], list) or chain["reasons"] != sorted(set(chain["reasons"])):
            raise ValueError("GSM 鏈原因必須是排序且不重複的清單。")
        for reason in chain["reasons"]:
            if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", str(reason)):
                raise ValueError("GSM 鏈原因代碼格式不正確。")
    invalid_paths: set[str] = set()
    for item in record["invalidPackages"]:
        invalid = _require_exact(item, {"caseName", "packageRelativePath", "errorCode", "message"}, "GSM 無效包")
        _require_text(invalid["caseName"], "GSM 無效包案件名稱", maximum=255)
        relative = _require_relative_path(invalid["packageRelativePath"], "GSM 無效包相對路徑")
        if relative in package_paths or relative in invalid_paths:
            raise ValueError("GSM 無效包相對路徑不得與其他項目重複。")
        invalid_paths.add(relative)
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", str(invalid["errorCode"])):
            raise ValueError("GSM 無效包代碼格式不正確。")
        _require_text(invalid["message"], "GSM 無效包訊息", maximum=2000)
    for item in record["issues"]:
        issue = _require_exact(item, {"level", "code", "message", "entries"}, "GSM 問題")
        if issue["level"] not in {"error", "warning"} or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", str(issue["code"])):
            raise ValueError("GSM 問題層級或代碼格式不正確。")
        _require_text(issue["message"], "GSM 問題訊息", maximum=2000)
        if not isinstance(issue["entries"], list) or issue["entries"] != sorted(set(issue["entries"]), key=lambda text: (str(text).casefold(), str(text))):
            raise ValueError("GSM 問題項目必須排序且不重複。")
        for entry in issue["entries"]:
            _require_relative_path(entry, "GSM 問題相對路徑")
    if summary["chainCount"] != len(record["chains"]) or summary["invalidPackageCount"] != len(record["invalidPackages"]):
        raise ValueError("GSM 訊號摘要數量與項目不一致。")
    if summary["currentCount"] != sum(item["lifecycleStatus"] == "current" for item in record["chains"]):
        raise ValueError("GSM current 數量不一致。")
    if summary["upcomingCount"] != sum(item["attentionStatus"] == "upcoming" for item in record["chains"]):
        raise ValueError("GSM upcoming 數量不一致。")
    if summary["reviewDueCount"] != sum(item["lifecycleStatus"] == "review-due" for item in record["chains"]):
        raise ValueError("GSM review-due 數量不一致。")
    if summary["blockedCount"] != sum(item["lifecycleStatus"] == "blocked" for item in record["chains"]):
        raise ValueError("GSM blocked 數量不一致。")
    if summary["errorIssueCount"] != sum(item["level"] == "error" for item in record["issues"]):
        raise ValueError("GSM error 問題數量不一致。")
    expected_portfolio_status = (
        "blocked" if record["invalidPackages"] or any(item["level"] == "error" for item in record["issues"]) or not record["chains"] or any(item["lifecycleStatus"] == "blocked" for item in record["chains"])
        else "review-due" if any(item["lifecycleStatus"] == "review-due" for item in record["chains"])
        else "current"
    )
    expected_attention_status = (
        "upcoming" if expected_portfolio_status == "current" and any(item["attentionStatus"] == "upcoming" for item in record["chains"])
        else expected_portfolio_status
    )
    if summary["portfolioStatus"] != expected_portfolio_status or summary["attentionStatus"] != expected_attention_status:
        raise ValueError("GSM 訊號總覽狀態與項目不一致。")
    fingerprint = _require_fingerprint(record["signalFingerprint"], "GMS", "GSM 訊號指紋")
    if fingerprint != monitor_signal_fingerprint(record):
        raise ValueError("GSM 訊號指紋驗證失敗。")
    return record


def _action_items(signal: dict[str, Any]) -> list[dict[str, Any]]:
    return [{
        "chainId": item["chainId"],
        "caseName": item["caseName"],
        "packageRelativePath": item["packageRelativePath"],
        "attentionStatus": item["attentionStatus"],
        "nextReviewDueAt": item["nextReviewDueAt"],
        "retentionUntil": item["retentionUntil"],
        "reasons": list(item["reasons"]),
    } for item in signal["chains"] if item["attentionStatus"] != "current"]


def _notification(previous: dict[str, Any] | None, signal: dict[str, Any], changed: bool) -> dict[str, Any]:
    current_status = signal["summary"]["attentionStatus"]
    previous_status = previous["toAttentionStatus"] if previous else "unobserved"
    if not changed:
        kind = "unchanged"
        should_notify = False
    elif previous is None:
        kind = "baseline-current" if current_status == "current" else "baseline-attention"
        should_notify = current_status != "current"
    elif current_status != "current":
        kind = "attention-change"
        should_notify = True
    elif previous_status != "current":
        kind = "recovered"
        should_notify = True
    else:
        kind = "inventory-change"
        should_notify = False
    return {"shouldNotify": should_notify, "kind": kind}


def validate_monitor_event(value: Any) -> dict[str, Any]:
    record = _require_exact(value, {"schemaVersion", "kind", "sequence", "recordedAt", "fromSignalFingerprint", "toSignalFingerprint", "fromAttentionStatus", "toAttentionStatus", "summary", "issueCodes", "actionItems", "notification", "previousEventFingerprint", "eventFingerprint"}, "GSM 事件")
    if record["schemaVersion"] != 1 or record["kind"] != EVENT_KIND:
        raise ValueError("GSM 事件版本或種類不受支援。")
    _require_integer(record["sequence"], "GSM 事件序號", 1, MAX_EVENT_COUNT)
    _iso(record["recordedAt"], "GSM 事件時間")
    if record["fromSignalFingerprint"] is not None:
        _require_fingerprint(record["fromSignalFingerprint"], "GMS", "GSM 前訊號指紋")
    _require_fingerprint(record["toSignalFingerprint"], "GMS", "GSM 新訊號指紋")
    if record["fromAttentionStatus"] not in ATTENTION_STATUSES | {"unobserved"} or record["toAttentionStatus"] not in ATTENTION_STATUSES:
        raise ValueError("GSM 事件狀態不受支援。")
    summary = _require_exact(record["summary"], {"chainCount", "upcomingCount", "reviewDueCount", "blockedCount", "invalidPackageCount", "errorIssueCount"}, "GSM 事件摘要")
    for field in summary:
        _require_integer(summary[field], f"GSM 事件 {field}")
    if not isinstance(record["issueCodes"], list) or record["issueCodes"] != sorted(set(record["issueCodes"])):
        raise ValueError("GSM 事件問題代碼必須排序且不重複。")
    for code in record["issueCodes"]:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", str(code)):
            raise ValueError("GSM 事件問題代碼格式不正確。")
    if not isinstance(record["actionItems"], list):
        raise ValueError("GSM 事件處理項目格式不正確。")
    action_chain_ids: set[str] = set()
    action_status_counts = {"upcoming": 0, "review-due": 0, "blocked": 0}
    for item in record["actionItems"]:
        action = _require_exact(item, {"chainId", "caseName", "packageRelativePath", "attentionStatus", "nextReviewDueAt", "retentionUntil", "reasons"}, "GSM 事件處理項目")
        chain_id = _require_fingerprint(action["chainId"], "GSL", "GSM 事件鏈指紋")
        if chain_id in action_chain_ids:
            raise ValueError("GSM 事件處理鏈不得重複。")
        action_chain_ids.add(chain_id)
        _require_text(action["caseName"], "GSM 事件案件名稱", maximum=255)
        _require_relative_path(action["packageRelativePath"], "GSM 事件相對路徑")
        if action["attentionStatus"] not in {"upcoming", "review-due", "blocked"}:
            raise ValueError("GSM 事件處理狀態不受支援。")
        action_status_counts[action["attentionStatus"]] += 1
        _iso(action["nextReviewDueAt"], "GSM 事件下次重驗時間")
        _iso(action["retentionUntil"], "GSM 事件保留期限")
        if not isinstance(action["reasons"], list) or action["reasons"] != sorted(set(action["reasons"])):
            raise ValueError("GSM 事件處理原因格式不正確。")
    notification = _require_exact(record["notification"], {"shouldNotify", "kind"}, "GSM 事件通知")
    if not isinstance(notification["shouldNotify"], bool) or notification["kind"] not in NOTIFICATION_KINDS - {"unchanged"}:
        raise ValueError("GSM 事件通知格式不正確。")
    if notification["shouldNotify"] != (notification["kind"] in {"baseline-attention", "attention-change", "recovered"}):
        raise ValueError("GSM 事件通知與種類不一致。")
    expected_status = (
        "blocked" if summary["blockedCount"] or summary["invalidPackageCount"] or summary["errorIssueCount"]
        else "review-due" if summary["reviewDueCount"]
        else "upcoming" if summary["upcomingCount"]
        else "current"
    )
    if record["toAttentionStatus"] != expected_status:
        raise ValueError("GSM 事件狀態與摘要不一致。")
    if (
        action_status_counts["upcoming"] != summary["upcomingCount"]
        or action_status_counts["review-due"] != summary["reviewDueCount"]
        or action_status_counts["blocked"] != summary["blockedCount"]
    ):
        raise ValueError("GSM 事件處理項目與摘要數量不一致。")
    expected_notification_kind = (
        "baseline-current" if record["fromAttentionStatus"] == "unobserved" and record["toAttentionStatus"] == "current"
        else "baseline-attention" if record["fromAttentionStatus"] == "unobserved"
        else "recovered" if record["fromAttentionStatus"] != "current" and record["toAttentionStatus"] == "current"
        else "inventory-change" if record["fromAttentionStatus"] == "current" and record["toAttentionStatus"] == "current"
        else "attention-change"
    )
    if notification["kind"] != expected_notification_kind:
        raise ValueError("GSM 事件通知種類與狀態轉換不一致。")
    if record["previousEventFingerprint"] is not None:
        _require_fingerprint(record["previousEventFingerprint"], "GME", "GSM 前事件指紋")
    fingerprint = _require_fingerprint(record["eventFingerprint"], "GME", "GSM 事件指紋")
    if fingerprint != monitor_event_fingerprint(record):
        raise ValueError("GSM 事件指紋驗證失敗。")
    return record


def _event_filename(event: dict[str, Any]) -> str:
    return f"GSM-外部歸檔生命週期監測事件-{event['sequence']:06d}-{event['eventFingerprint']}.json"


def _read_json_file(path: Path, label: str) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"{label}必須是實體一般檔案。")
    stat = path.stat()
    if stat.st_nlink != 1 or stat.st_size <= 0 or stat.st_size > MAX_STATE_JSON_BYTES:
        raise ValueError(f"{label}檔案連結數或大小不在安全範圍。")
    raw = path.read_bytes()
    if len(raw) != stat.st_size:
        raise ValueError(f"{label}讀取期間發生變更。")
    return _json_from_bytes(raw, label)


def read_monitor_events(state_directory: Path) -> list[dict[str, Any]]:
    state = _physical_directory(state_directory, "GSM 監測狀態資料夾")
    event_directory = state / EVENT_DIRECTORY_NAME
    if not event_directory.exists():
        return []
    if event_directory.is_symlink() or not event_directory.is_dir() or not _same_path(event_directory, event_directory.resolve(strict=True)):
        raise ValueError("GSM 事件資料夾必須是實體資料夾。")
    events: list[dict[str, Any]] = []
    entries = sorted(os.scandir(event_directory), key=lambda item: (item.name.casefold(), item.name))
    if len(entries) > MAX_EVENT_COUNT:
        raise ValueError("GSM 事件數超過安全上限。")
    for entry in entries:
        match = EVENT_PATTERN.fullmatch(entry.name)
        if not match or entry.is_symlink() or not entry.is_file(follow_symlinks=False):
            raise ValueError("GSM 事件資料夾含未知、連結或非一般檔案項目。")
        event = validate_monitor_event(_read_json_file(Path(entry.path), "GSM 事件"))
        if int(match.group("sequence")) != event["sequence"] or match.group("fingerprint") != event["eventFingerprint"]:
            raise ValueError("GSM 事件檔名與內容不一致。")
        events.append(event)
    previous_fingerprint: str | None = None
    previous_signal: str | None = None
    previous_status = "unobserved"
    previous_time: datetime | None = None
    for index, event in enumerate(events, start=1):
        event_time = datetime.fromisoformat(event["recordedAt"].replace("Z", "+00:00")).astimezone(timezone.utc)
        if event["sequence"] != index or event["previousEventFingerprint"] != previous_fingerprint:
            raise ValueError("GSM 事件序號或前筆指紋串鏈驗證失敗。")
        if event["fromSignalFingerprint"] != previous_signal or event["fromAttentionStatus"] != previous_status:
            raise ValueError("GSM 事件前後訊號或狀態串鏈驗證失敗。")
        if previous_time is not None and event_time <= previous_time:
            raise ValueError("GSM 事件時間必須嚴格遞增。")
        previous_fingerprint = event["eventFingerprint"]
        previous_signal = event["toSignalFingerprint"]
        previous_status = event["toAttentionStatus"]
        previous_time = event_time
    return events


def _state_root_entries_are_safe(state: Path) -> None:
    allowed = {EVENT_DIRECTORY_NAME, LATEST_FILE_NAME, LOCK_FILE_NAME}
    with os.scandir(state) as entries:
        for entry in entries:
            if entry.name not in allowed:
                raise ValueError("GSM 監測狀態資料夾必須專用，不得含其他項目。")
            if entry.is_symlink():
                raise ValueError("GSM 監測狀態資料夾不得含連結項目。")


@contextmanager
def _state_lock(state: Path) -> Iterator[None]:
    lock_path = state / LOCK_FILE_NAME
    if lock_path.exists() and (lock_path.is_symlink() or not lock_path.is_file() or not _same_path(lock_path, lock_path.resolve(strict=True))):
        raise ValueError("GSM 監測鎖必須是實體一般檔案。")
    handle = lock_path.open("a+b")
    try:
        handle_stat = os.fstat(handle.fileno())
        path_stat = lock_path.stat()
        if lock_path.is_symlink() or not _same_path(lock_path, lock_path.resolve(strict=True)):
            raise ValueError("GSM 監測鎖在開啟期間遭重新導向。")
        if (handle_stat.st_dev, handle_stat.st_ino) != (path_stat.st_dev, path_stat.st_ino):
            raise ValueError("GSM 監測鎖在開啟期間遭替換。")
        if handle_stat.st_nlink != 1:
            raise ValueError("GSM 監測鎖不得是硬連結。")
        handle.seek(0, os.SEEK_END)
        lock_size = handle.tell()
        if lock_size not in {0, 1}:
            raise ValueError("GSM 監測鎖內容大小不正確。")
        if lock_size == 0:
            handle.write(b"0")
            handle.flush()
            os.fsync(handle.fileno())
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise ValueError("另一個 GSM 監測程序正在使用此狀態資料夾。") from exc
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    finally:
        handle.close()


def _write_exclusive_json(path: Path, value: dict[str, Any]) -> None:
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    created = False
    try:
        with path.open("xb") as stream:
            created = True
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
    except Exception:
        if created:
            path.unlink(missing_ok=True)
        raise


def _write_atomic_json(path: Path, value: dict[str, Any]) -> None:
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    temporary = path.with_name(f".{path.name}.{secrets.token_hex(8)}.tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def validate_monitor_state(value: Any) -> dict[str, Any]:
    record = _require_exact(value, {"schemaVersion", "kind", "stateContext", "checkedAt", "portfolioFingerprint", "signal", "event", "notification", "boundary", "monitorFingerprint"}, "GSM 狀態")
    if record["schemaVersion"] != 1 or record["kind"] != MONITOR_KIND or record["stateContext"] != MONITOR_CONTEXT:
        raise ValueError("GSM 狀態版本、種類或脈絡不受支援。")
    _iso(record["checkedAt"], "GSM 檢查時間")
    _require_fingerprint(record["portfolioFingerprint"], "GSP", "GSM GSP 指紋")
    signal = validate_monitor_signal(record["signal"])
    event = _require_exact(record["event"], {"count", "latestFingerprint"}, "GSM 事件摘要")
    count = _require_integer(event["count"], "GSM 事件數", 1, MAX_EVENT_COUNT)
    _require_fingerprint(event["latestFingerprint"], "GME", "GSM 最新事件指紋")
    notification = _require_exact(record["notification"], {"shouldNotify", "kind"}, "GSM 通知")
    if not isinstance(notification["shouldNotify"], bool) or notification["kind"] not in NOTIFICATION_KINDS:
        raise ValueError("GSM 通知格式不正確。")
    if notification["shouldNotify"] != (notification["kind"] in {"baseline-attention", "attention-change", "recovered"}):
        raise ValueError("GSM 通知旗標與種類不一致。")
    if record["boundary"] != MONITOR_BOUNDARY:
        raise ValueError("GSM 責任邊界不符合封閉契約。")
    if count <= 0 or not signal["signalFingerprint"]:
        raise ValueError("GSM 狀態缺少事件或訊號。")
    fingerprint = _require_fingerprint(record["monitorFingerprint"], "GSM", "GSM 狀態指紋")
    if fingerprint != monitor_state_fingerprint(record):
        raise ValueError("GSM 狀態指紋驗證失敗。")
    return record


def _validate_latest_against_events(state: Path, events: list[dict[str, Any]]) -> dict[str, Any] | None:
    latest_path = state / LATEST_FILE_NAME
    if not events:
        if latest_path.exists():
            raise ValueError("GSM latest 存在但事件鏈為空，禁止覆寫孤兒狀態。")
        return None
    if not latest_path.exists():
        raise ValueError("GSM 事件鏈存在但 latest 狀態遺失。")
    latest = validate_monitor_state(_read_json_file(latest_path, "GSM latest 狀態"))
    last_event = events[-1]
    signal = latest["signal"]
    if latest["event"]["count"] != len(events) or latest["event"]["latestFingerprint"] != last_event["eventFingerprint"]:
        raise ValueError("GSM latest 狀態與事件鏈不一致。")
    if last_event["toSignalFingerprint"] != signal["signalFingerprint"] or last_event["toAttentionStatus"] != signal["summary"]["attentionStatus"]:
        raise ValueError("GSM latest 訊號與事件鏈尾端不一致。")
    if latest["notification"]["kind"] != "unchanged" and latest["notification"] != last_event["notification"]:
        raise ValueError("GSM latest 通知與最新事件不一致。")
    return latest


def _validate_state_location(source_root: Path, state_directory: Path) -> tuple[Path, Path]:
    source = _physical_directory(source_root, "GSC 多案件來源根目錄")
    state = _physical_directory(state_directory, "GSM 監測狀態資料夾")
    repository = TOOL_REPOSITORY_ROOT.resolve(strict=True)
    if _inside(source, state) or _inside(state, source):
        raise ValueError("GSM 監測狀態資料夾必須與 GSC 來源樹完全分離。")
    if _inside(repository, state):
        raise ValueError("GSM 監測狀態資料夾不得位於工具程式庫內。")
    return source, state


def run_monitor(
    source_root: Path,
    state_directory: Path,
    *,
    openssl_path: Path | None = None,
    as_of: str | None = None,
    upcoming_days: int = 30,
    max_depth: int = MAX_SCAN_DEPTH,
    scan_function: Callable[..., dict[str, Any]] = scan_portfolio,
) -> dict[str, Any]:
    source, state = _validate_state_location(source_root, state_directory)
    _state_root_entries_are_safe(state)
    with _state_lock(state):
        _state_root_entries_are_safe(state)
        events = read_monitor_events(state)
        _validate_latest_against_events(state, events)
        portfolio = validate_portfolio_snapshot(scan_function(source, openssl_path=openssl_path, as_of=as_of, upcoming_days=upcoming_days, max_depth=max_depth))
        signal = build_monitor_signal(portfolio)
        latest_event = events[-1] if events else None
        changed = latest_event is None or latest_event["toSignalFingerprint"] != signal["signalFingerprint"]
        notification = _notification(latest_event, signal, changed)
        event_path: Path | None = None
        if changed:
            recorded_at = portfolio["assessedAt"]
            if latest_event:
                previous_time = datetime.fromisoformat(latest_event["recordedAt"].replace("Z", "+00:00")).astimezone(timezone.utc)
                current_time = datetime.fromisoformat(recorded_at.replace("Z", "+00:00")).astimezone(timezone.utc)
                if current_time <= previous_time:
                    raise ValueError("新的 GSM 事件時間必須晚於既有事件。")
            summary = signal["summary"]
            event: dict[str, Any] = {
                "schemaVersion": 1,
                "kind": EVENT_KIND,
                "sequence": len(events) + 1,
                "recordedAt": recorded_at,
                "fromSignalFingerprint": latest_event["toSignalFingerprint"] if latest_event else None,
                "toSignalFingerprint": signal["signalFingerprint"],
                "fromAttentionStatus": latest_event["toAttentionStatus"] if latest_event else "unobserved",
                "toAttentionStatus": summary["attentionStatus"],
                "summary": {key: summary[key] for key in ("chainCount", "upcomingCount", "reviewDueCount", "blockedCount", "invalidPackageCount", "errorIssueCount")},
                "issueCodes": _issue_codes(signal),
                "actionItems": _action_items(signal),
                "notification": notification,
                "previousEventFingerprint": latest_event["eventFingerprint"] if latest_event else None,
            }
            event["eventFingerprint"] = monitor_event_fingerprint(event)
            event = validate_monitor_event(event)
            event_directory = state / EVENT_DIRECTORY_NAME
            event_directory.mkdir(exist_ok=True)
            if event_directory.is_symlink() or not _same_path(event_directory, event_directory.resolve(strict=True)):
                raise ValueError("GSM 事件資料夾不得透過連結重新導向。")
            event_path = event_directory / _event_filename(event)
            _write_exclusive_json(event_path, event)
            try:
                saved_event = validate_monitor_event(_read_json_file(event_path, "GSM 新事件"))
                if saved_event != event:
                    raise ValueError("GSM 新事件落地內容不一致。")
                events.append(saved_event)
            except Exception:
                event_path.unlink(missing_ok=True)
                raise
        current_event = events[-1]
        state_record: dict[str, Any] = {
            "schemaVersion": 1,
            "kind": MONITOR_KIND,
            "stateContext": MONITOR_CONTEXT,
            "checkedAt": portfolio["assessedAt"],
            "portfolioFingerprint": portfolio["portfolioFingerprint"],
            "signal": signal,
            "event": {"count": len(events), "latestFingerprint": current_event["eventFingerprint"]},
            "notification": notification,
            "boundary": MONITOR_BOUNDARY,
        }
        state_record["monitorFingerprint"] = monitor_state_fingerprint(state_record)
        state_record = validate_monitor_state(state_record)
        latest_path = state / LATEST_FILE_NAME
        previous_latest = latest_path.read_bytes() if latest_path.is_file() and not latest_path.is_symlink() else None
        try:
            _write_atomic_json(latest_path, state_record)
            saved_state = validate_monitor_state(_read_json_file(latest_path, "GSM latest 狀態"))
            if saved_state != state_record:
                raise ValueError("GSM latest 狀態落地內容不一致。")
            verified_events = read_monitor_events(state)
            if len(verified_events) != len(events) or verified_events[-1]["eventFingerprint"] != current_event["eventFingerprint"]:
                raise ValueError("GSM 狀態發布後事件鏈發生變更。")
        except Exception:
            if event_path is not None:
                event_path.unlink(missing_ok=True)
            if previous_latest is None:
                latest_path.unlink(missing_ok=True)
            else:
                temporary = latest_path.with_name(f".{latest_path.name}.{secrets.token_hex(8)}.rollback.tmp")
                try:
                    with temporary.open("xb") as stream:
                        stream.write(previous_latest)
                        stream.flush()
                        os.fsync(stream.fileno())
                    temporary.replace(latest_path)
                finally:
                    temporary.unlink(missing_ok=True)
            raise
        return {
            "status": "transition-recorded" if changed else "unchanged",
            "attentionStatus": signal["summary"]["attentionStatus"],
            "exitCode": exit_code_for_snapshot(portfolio),
            "latestPath": str(latest_path),
            "eventPath": str(event_path) if event_path else None,
            "eventCount": len(events),
            "notification": notification,
            "monitor": state_record,
        }


def verify_monitor_state_directory(
    state_directory: Path,
    *,
    as_of: str | None = None,
    max_age_hours: int = 36,
) -> dict[str, Any]:
    if not isinstance(max_age_hours, int) or isinstance(max_age_hours, bool) or not 1 <= max_age_hours <= 24 * 366:
        raise ValueError("GSM 狀態新鮮度時數必須為 1 至 8784。")
    state = _physical_directory(state_directory, "GSM 監測狀態資料夾")
    _state_root_entries_are_safe(state)
    with _state_lock(state):
        _state_root_entries_are_safe(state)
        events = read_monitor_events(state)
        if not events:
            raise ValueError("GSM 監測狀態資料夾沒有事件鏈。")
        latest = _validate_latest_against_events(state, events)
        if latest is None:
            raise ValueError("GSM latest 狀態不存在。")
        last_event = events[-1]
        signal = latest["signal"]
        current = datetime.fromisoformat(_iso(as_of or _now_iso(), "GSM 自檢時間").replace("Z", "+00:00")).astimezone(timezone.utc)
        checked = datetime.fromisoformat(latest["checkedAt"].replace("Z", "+00:00")).astimezone(timezone.utc)
        age_seconds = int((current - checked).total_seconds())
        if age_seconds < -300:
            raise ValueError("GSM latest 檢查時間不可晚於自檢時間。")
        freshness = "fresh" if age_seconds <= max_age_hours * 3600 else "stale"
        return {
            "status": "verified" if freshness == "fresh" else "attention-required",
            "integrityStatus": "verified",
            "freshnessStatus": freshness,
            "ageSeconds": max(0, age_seconds),
            "maxAgeHours": max_age_hours,
            "attentionStatus": signal["summary"]["attentionStatus"],
            "eventCount": len(events),
            "latestEventFingerprint": last_event["eventFingerprint"],
            "monitorFingerprint": latest["monitorFingerprint"],
            "currentSourceStateStatus": "not-assessed-requires-monitor-run",
        }


def _dashboard_issue_codes(status: str, summary: dict[str, Any] | None) -> list[str]:
    if status == "untrusted":
        return ["monitor-operation-failed"]
    if summary is None:
        raise ValueError("GSM 儀表板摘要缺少計數。")
    codes: list[str] = []
    if summary["upcomingCount"]:
        codes.append("monitor-upcoming")
    if summary["reviewDueCount"]:
        codes.append("monitor-review-due")
    if summary["blockedCount"]:
        codes.append("monitor-blocked")
    if summary["invalidPackageCount"]:
        codes.append("monitor-invalid-package")
    if summary["errorIssueCount"]:
        codes.append("monitor-scan-error")
    if status == "stale":
        codes.append("monitor-state-stale")
    return codes


def validate_dashboard_status(value: Any) -> dict[str, Any]:
    record = _require_exact(
        value,
        {"schemaVersion", "kind", "generatedAt", "checkedAt", "status", "attentionStatus", "statusMaxAgeHours", "ageSeconds", "eventCount", "summary", "issueCodes", "privacy"},
        "GSM 儀表板狀態",
    )
    if record["schemaVersion"] != 1 or record["kind"] != DASHBOARD_STATUS_KIND:
        raise ValueError("GSM 儀表板狀態版本或種類不受支援。")
    _iso(record["generatedAt"], "GSM 儀表板產生時間")
    if record["status"] not in {"trusted", "stale", "untrusted"}:
        raise ValueError("GSM 儀表板信任狀態不受支援。")
    _require_integer(record["statusMaxAgeHours"], "GSM 儀表板新鮮度時數", 1, 24 * 366)
    _require_integer(record["ageSeconds"], "GSM 儀表板狀態年齡", 0)
    _require_integer(record["eventCount"], "GSM 儀表板事件數", 0, MAX_EVENT_COUNT)
    if record["status"] == "untrusted":
        if record["checkedAt"] is not None or record["attentionStatus"] is not None or record["summary"] is not None:
            raise ValueError("不可信 GSM 儀表板狀態不得保留舊案件狀態或計數。")
    else:
        generated = datetime.fromisoformat(record["generatedAt"].replace("Z", "+00:00")).astimezone(timezone.utc)
        checked_at = _iso(record["checkedAt"], "GSM 儀表板檢查時間")
        checked = datetime.fromisoformat(checked_at.replace("Z", "+00:00")).astimezone(timezone.utc)
        expected_age_seconds = max(0, int((generated - checked).total_seconds()))
        if record["ageSeconds"] != expected_age_seconds:
            raise ValueError("GSM 儀表板狀態年齡與產生、檢查時間不一致。")
        expected_status = "trusted" if expected_age_seconds <= record["statusMaxAgeHours"] * 3600 else "stale"
        if record["status"] != expected_status:
            raise ValueError("GSM 儀表板信任狀態與新鮮度不一致。")
        if record["attentionStatus"] not in ATTENTION_STATUSES:
            raise ValueError("GSM 儀表板注意狀態不受支援。")
        summary = _require_exact(
            record["summary"],
            {"chainCount", "currentCount", "upcomingCount", "reviewDueCount", "blockedCount", "invalidPackageCount", "errorIssueCount"},
            "GSM 儀表板計數",
        )
        for field in summary:
            _require_integer(summary[field], f"GSM 儀表板 {field}", 0)
        if summary["chainCount"] != summary["currentCount"] + summary["reviewDueCount"] + summary["blockedCount"]:
            raise ValueError("GSM 儀表板鏈計數不一致。")
        expected_attention = (
            "blocked" if summary["blockedCount"] or summary["invalidPackageCount"] or summary["errorIssueCount"]
            else "review-due" if summary["reviewDueCount"]
            else "upcoming" if summary["upcomingCount"]
            else "current"
        )
        if record["attentionStatus"] != expected_attention:
            raise ValueError("GSM 儀表板注意狀態與計數不一致。")
    if not isinstance(record["issueCodes"], list) or record["issueCodes"] != _dashboard_issue_codes(record["status"], record["summary"]):
        raise ValueError("GSM 儀表板問題代碼與狀態不一致。")
    if record["privacy"] != DASHBOARD_PRIVACY:
        raise ValueError("GSM 儀表板隱私邊界不符合契約。")
    return record


def validate_dashboard_history(value: Any) -> dict[str, Any]:
    record = _require_exact(value, {"schemaVersion", "kind", "generatedAt", "itemCount", "items", "privacy"}, "GSM 儀表板歷程")
    if record["schemaVersion"] != 1 or record["kind"] != DASHBOARD_HISTORY_KIND:
        raise ValueError("GSM 儀表板歷程版本或種類不受支援。")
    _iso(record["generatedAt"], "GSM 儀表板歷程產生時間")
    if not isinstance(record["items"], list) or len(record["items"]) > 100:
        raise ValueError("GSM 儀表板歷程清單格式不正確。")
    _require_integer(record["itemCount"], "GSM 儀表板歷程筆數", 0, 100)
    if record["itemCount"] != len(record["items"]):
        raise ValueError("GSM 儀表板歷程筆數不一致。")
    previous_time: datetime | None = None
    for item in record["items"]:
        entry = _require_exact(item, {"observedAt", "fromAttentionStatus", "toAttentionStatus", "notificationKind", "summary"}, "GSM 儀表板歷程項目")
        observed = datetime.fromisoformat(_iso(entry["observedAt"], "GSM 儀表板歷程時間").replace("Z", "+00:00")).astimezone(timezone.utc)
        if previous_time is not None and observed >= previous_time:
            raise ValueError("GSM 儀表板歷程必須由新到舊排序。")
        previous_time = observed
        if entry["fromAttentionStatus"] not in ATTENTION_STATUSES | {"unobserved"} or entry["toAttentionStatus"] not in ATTENTION_STATUSES:
            raise ValueError("GSM 儀表板歷程狀態不受支援。")
        if entry["notificationKind"] not in NOTIFICATION_KINDS - {"unchanged"}:
            raise ValueError("GSM 儀表板歷程通知種類不受支援。")
        summary = _require_exact(entry["summary"], {"chainCount", "upcomingCount", "reviewDueCount", "blockedCount", "invalidPackageCount", "errorIssueCount"}, "GSM 儀表板歷程計數")
        for field in summary:
            _require_integer(summary[field], f"GSM 儀表板歷程 {field}", 0)
        if summary["reviewDueCount"] + summary["blockedCount"] > summary["chainCount"]:
            raise ValueError("GSM 儀表板歷程鏈計數不一致。")
        if summary["upcomingCount"] > summary["chainCount"]:
            raise ValueError("GSM 儀表板歷程即將到期計數不一致。")
    if record["privacy"] != DASHBOARD_PRIVACY:
        raise ValueError("GSM 儀表板歷程隱私邊界不符合契約。")
    return record


def _dashboard_output_path(path: Path, label: str) -> Path:
    output = Path(path)
    parent = output.parent
    existing_parent = parent
    while not existing_parent.exists() and existing_parent != existing_parent.parent:
        existing_parent = existing_parent.parent
    if not existing_parent.exists() or existing_parent.is_symlink() or not existing_parent.is_dir() or not _same_path(existing_parent, existing_parent.resolve(strict=True)):
        raise ValueError(f"{label}既有上層必須是實體資料夾。")
    parent.mkdir(parents=True, exist_ok=True)
    if parent.is_symlink() or not parent.is_dir() or not _same_path(parent, parent.resolve(strict=True)):
        raise ValueError(f"{label}資料夾必須是實體資料夾。")
    if output.exists():
        if output.is_symlink() or not output.is_file() or output.stat().st_nlink != 1:
            raise ValueError(f"{label}必須是實體一般檔案。")
    return output


def build_dashboard_summaries(
    state_directory: Path,
    *,
    as_of: str | None = None,
    max_age_hours: int = 36,
    max_items: int = 24,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(max_age_hours, int) or isinstance(max_age_hours, bool) or not 1 <= max_age_hours <= 24 * 366:
        raise ValueError("GSM 儀表板新鮮度時數必須為 1 至 8784。")
    if not isinstance(max_items, int) or isinstance(max_items, bool) or not 1 <= max_items <= 100:
        raise ValueError("GSM 儀表板歷程筆數必須為 1 至 100。")
    state = _physical_directory(state_directory, "GSM 監測狀態資料夾")
    _state_root_entries_are_safe(state)
    with _state_lock(state):
        _state_root_entries_are_safe(state)
        events = read_monitor_events(state)
        if not events:
            raise ValueError("GSM 監測狀態資料夾沒有事件鏈。")
        latest = _validate_latest_against_events(state, events)
        if latest is None:
            raise ValueError("GSM latest 狀態不存在。")
        generated_at = _iso(as_of or _now_iso(), "GSM 儀表板時間")
        current = datetime.fromisoformat(generated_at.replace("Z", "+00:00")).astimezone(timezone.utc)
        checked = datetime.fromisoformat(latest["checkedAt"].replace("Z", "+00:00")).astimezone(timezone.utc)
        age_seconds = int((current - checked).total_seconds())
        if age_seconds < -300:
            raise ValueError("GSM latest 檢查時間不可晚於儀表板時間。")
        status = "trusted" if age_seconds <= max_age_hours * 3600 else "stale"
        source_summary = latest["signal"]["summary"]
        summary = {key: source_summary[key] for key in ("chainCount", "currentCount", "upcomingCount", "reviewDueCount", "blockedCount", "invalidPackageCount", "errorIssueCount")}
        dashboard_status = validate_dashboard_status({
            "schemaVersion": 1,
            "kind": DASHBOARD_STATUS_KIND,
            "generatedAt": generated_at,
            "checkedAt": latest["checkedAt"],
            "status": status,
            "attentionStatus": source_summary["attentionStatus"],
            "statusMaxAgeHours": max_age_hours,
            "ageSeconds": max(0, age_seconds),
            "eventCount": len(events),
            "summary": summary,
            "issueCodes": _dashboard_issue_codes(status, summary),
            "privacy": DASHBOARD_PRIVACY,
        })
        history_items = [{
            "observedAt": event["recordedAt"],
            "fromAttentionStatus": event["fromAttentionStatus"],
            "toAttentionStatus": event["toAttentionStatus"],
            "notificationKind": event["notification"]["kind"],
            "summary": dict(event["summary"]),
        } for event in reversed(events[-max_items:])]
        dashboard_history = validate_dashboard_history({
            "schemaVersion": 1,
            "kind": DASHBOARD_HISTORY_KIND,
            "generatedAt": generated_at,
            "itemCount": len(history_items),
            "items": history_items,
            "privacy": DASHBOARD_PRIVACY,
        })
    return dashboard_status, dashboard_history


def write_dashboard_summaries(
    state_directory: Path,
    status_path: Path,
    history_path: Path,
    *,
    as_of: str | None = None,
    max_age_hours: int = 36,
    max_items: int = 24,
) -> dict[str, Any]:
    status_output = _dashboard_output_path(status_path, "GSM 儀表板狀態輸出")
    history_output = _dashboard_output_path(history_path, "GSM 儀表板歷程輸出")
    if _same_path(status_output, history_output):
        raise ValueError("GSM 儀表板狀態與歷程輸出不得是同一檔案。")
    status, history = build_dashboard_summaries(state_directory, as_of=as_of, max_age_hours=max_age_hours, max_items=max_items)
    previous = {
        status_output: status_output.read_bytes() if status_output.exists() else None,
        history_output: history_output.read_bytes() if history_output.exists() else None,
    }
    try:
        _write_atomic_json(history_output, history)
        _write_atomic_json(status_output, status)
    except Exception:
        for output, content in previous.items():
            if content is None:
                output.unlink(missing_ok=True)
            else:
                temporary = output.with_name(f".{output.name}.{secrets.token_hex(8)}.rollback.tmp")
                try:
                    with temporary.open("xb") as stream:
                        stream.write(content)
                        stream.flush()
                        os.fsync(stream.fileno())
                    temporary.replace(output)
                finally:
                    temporary.unlink(missing_ok=True)
        raise
    saved_status = validate_dashboard_status(_read_json_file(status_output, "GSM 儀表板狀態輸出"))
    saved_history = validate_dashboard_history(_read_json_file(history_output, "GSM 儀表板歷程輸出"))
    return {"status": saved_status, "history": saved_history, "statusPath": str(status_output), "historyPath": str(history_output)}


def main() -> int:
    parser = argparse.ArgumentParser(description="排程完整重驗 GSC，並只在狀態訊號改變時追加 GSM 事件。")
    parser.add_argument("--openssl", type=Path, help="可選：OpenSSL 可執行檔路徑")
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run", help="完整掃描來源並更新本機 GSM 監測狀態")
    run.add_argument("--source-root", required=True, type=Path)
    run.add_argument("--state-dir", required=True, type=Path)
    run.add_argument("--as-of")
    run.add_argument("--upcoming-days", type=int, default=30)
    run.add_argument("--max-depth", type=int, default=MAX_SCAN_DEPTH)
    run.add_argument("--dashboard-status-output", type=Path)
    run.add_argument("--dashboard-history-output", type=Path)
    run.add_argument("--dashboard-status-max-age-hours", type=int, default=36)
    run.add_argument("--dashboard-history-max-items", type=int, default=24)
    verify = commands.add_parser("verify-state", help="只驗證既有 GSM 狀態、事件鏈與新鮮度；不重掃來源")
    verify.add_argument("--state-dir", required=True, type=Path)
    verify.add_argument("--as-of")
    verify.add_argument("--max-age-hours", type=int, default=36)
    args = parser.parse_args()
    try:
        if args.command == "run":
            result = run_monitor(args.source_root, args.state_dir, openssl_path=args.openssl, as_of=args.as_of, upcoming_days=args.upcoming_days, max_depth=args.max_depth)
            if bool(args.dashboard_status_output) != bool(args.dashboard_history_output):
                raise ValueError("GSM 儀表板狀態與歷程輸出必須同時指定。")
            if args.dashboard_status_output:
                dashboard = write_dashboard_summaries(
                    args.state_dir,
                    args.dashboard_status_output,
                    args.dashboard_history_output,
                    as_of=args.as_of,
                    max_age_hours=args.dashboard_status_max_age_hours,
                    max_items=args.dashboard_history_max_items,
                )
                result["dashboard"] = {
                    "status": dashboard["status"]["status"],
                    "historyItemCount": dashboard["history"]["itemCount"],
                }
            exit_code = int(result["exitCode"])
        else:
            result = verify_monitor_state_directory(args.state_dir, as_of=args.as_of, max_age_hours=args.max_age_hours)
            exit_code = 0 if result["freshnessStatus"] == "fresh" else 3
        os.sys.stdout.buffer.write((json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        os.sys.stdout.buffer.flush()
        return exit_code
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=os.sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
