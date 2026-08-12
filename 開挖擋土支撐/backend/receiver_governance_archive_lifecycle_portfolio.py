from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timedelta
import hashlib
import html
import json
import os
from pathlib import Path
import re
import secrets
import shutil
from typing import Any, Callable

from .receiver_governance_archive import _utc_datetime
from .receiver_governance_archive_lifecycle import verify_lifecycle_checkpoint_package
from .receiver_governance_timestamp import _canonical_json_bytes, _iso, _now_iso, find_openssl


PORTFOLIO_KIND = "governance-external-archive-lifecycle-portfolio-snapshot"
PORTFOLIO_CONTEXT = "governance-external-archive-lifecycle-portfolio-snapshot-v1"
PACKAGE_PREFIX = "GSC-外部歸檔生命週期檢查點-"
PACKAGE_NAME_PATTERN = re.compile(r"^GSC-外部歸檔生命週期檢查點-GSC-[0-9A-F]{20}$")
MAX_SCAN_DEPTH = 12
MAX_SCANNED_DIRECTORIES = 25_000
MAX_CANDIDATE_PACKAGES = 5_000
MAX_SNAPSHOT_JSON_BYTES = 5_000_000
MAX_SNAPSHOT_HTML_BYTES = 10_000_000
MAX_GUARD_FILE_BYTES = 300_000_000
MAX_GUARD_PACKAGE_BYTES = 500_000_000
MAX_UPCOMING_DAYS = 366
TOOL_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
IGNORED_DIRECTORY_NAMES = {".git", ".svn", "__pycache__", "node_modules"}
PORTFOLIO_STATUSES = {"current", "review-due", "blocked"}
ATTENTION_STATUSES = {"current", "upcoming", "review-due", "blocked"}
LIFECYCLE_STATUSES = {"current", "review-due", "blocked"}
STATUS_PRIORITY = {"current": 0, "upcoming": 1, "review-due": 2, "blocked": 3}
PORTFOLIO_BOUNDARY = {
    "readOnlySourceScan": True,
    "everySelectedCheckpointWasFullyReverified": True,
    "invalidPackagesCannotBeMaskedByOlderValidPackages": True,
    "sameTimeConflictingLatestCheckpointsBlockSelection": True,
    "duplicateCheckpointCopiesAreDeduplicated": True,
    "upcomingIsReminderOnlyAndDoesNotRewriteCheckpointStatus": True,
    "snapshotIntegrityDoesNotProveCurrentRepositoryState": True,
    "currentStateRequiresFreshSourceRescan": True,
    "providerStatusRemainsAttestationNotIndependentObservation": True,
    "doesNotConstituteEngineeringApproval": True,
    "formalCalculationAttachment": False,
    "pagesPublication": False,
}


def _fingerprint(prefix: str, value: dict[str, Any], field: str) -> str:
    payload = {key: item for key, item in value.items() if key != field}
    return f"{prefix}-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()


def portfolio_fingerprint(value: dict[str, Any]) -> str:
    return _fingerprint("GSP", value, "portfolioFingerprint")


def _linklike(path: Path) -> bool:
    try:
        return path.is_symlink() or getattr(path, "is_junction", lambda: False)()
    except OSError:
        return True


def _same_path(left: Path, right: Path) -> bool:
    return os.path.normcase(os.path.abspath(left)) == os.path.normcase(os.path.abspath(right))


def _inside(parent: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(parent)
        return True
    except ValueError:
        return False


def _physical_directory(path: Path, label: str) -> Path:
    resolved = Path(os.path.abspath(path))
    if _linklike(resolved) or not resolved.is_dir():
        raise ValueError(f"{label}必須是既有實體資料夾。")
    real = resolved.resolve(strict=True)
    if not _same_path(real, resolved):
        raise ValueError(f"{label}不得透過符號連結或目錄連接重新導向。")
    return resolved


def _safe_relative(root: Path, path: Path) -> str:
    try:
        relative = path.relative_to(root)
    except ValueError as exc:
        raise ValueError("掃描項目逸出來源根目錄。") from exc
    text = relative.as_posix()
    if not text or text.startswith("/") or ".." in relative.parts or "\\" in text:
        raise ValueError("掃描項目的相對路徑不安全。")
    return text


def _issue(level: str, code: str, message: str, entries: list[str] | None = None) -> dict[str, Any]:
    return {
        "level": level,
        "code": code,
        "message": message,
        "entries": sorted(set(entries or []), key=lambda item: (item.casefold(), item)),
    }


def _discover_candidates(root: Path, max_depth: int) -> tuple[list[Path], list[dict[str, Any]], int]:
    candidates: list[Path] = []
    issues: list[dict[str, Any]] = []
    scanned = 0
    stack: list[tuple[Path, int]] = [(root, 0)]
    while stack:
        directory, depth = stack.pop()
        scanned += 1
        if scanned > MAX_SCANNED_DIRECTORIES:
            issues.append(_issue("error", "scan-directory-limit", "掃描資料夾數超過安全上限。"))
            break
        try:
            entries = sorted(os.scandir(directory), key=lambda item: (item.name.casefold(), item.name))
        except OSError:
            issues.append(_issue("error", "unreadable-directory", "來源資料夾無法安全讀取。", [_safe_relative(root, directory)] if directory != root else []))
            continue
        for entry in entries:
            child = Path(entry.path)
            if entry.name in IGNORED_DIRECTORY_NAMES:
                continue
            if _linklike(child):
                issues.append(_issue("error", "unsafe-linked-entry", "來源樹含連結或目錄連接，未跟隨該項目。", [_safe_relative(root, child)]))
                continue
            try:
                is_directory = entry.is_dir(follow_symlinks=False)
            except OSError:
                issues.append(_issue("error", "unreadable-entry", "來源項目無法安全辨識。", [_safe_relative(root, child)]))
                continue
            if not is_directory:
                continue
            if entry.name.startswith(PACKAGE_PREFIX):
                candidates.append(child)
                if len(candidates) > MAX_CANDIDATE_PACKAGES:
                    issues.append(_issue("error", "scan-package-limit", "GSC 候選包數超過安全上限。"))
                    return candidates[:MAX_CANDIDATE_PACKAGES], issues, scanned
                continue
            if depth >= max_depth:
                issues.append(_issue("error", "scan-depth-limit", "來源樹超過允許的掃描深度。", [_safe_relative(root, child)]))
                continue
            stack.append((child, depth + 1))
    candidates.sort(key=lambda path: (_safe_relative(root, path).casefold(), _safe_relative(root, path)))
    return candidates, issues, scanned


def _sha256_file(path: Path) -> tuple[str, int]:
    size = path.stat().st_size
    if size <= 0 or size > MAX_GUARD_FILE_BYTES:
        raise ValueError("GSC 來源檔大小不在安全範圍。")
    digest = hashlib.sha256()
    total = 0
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_GUARD_FILE_BYTES:
                raise ValueError("GSC 來源檔讀取大小超過安全上限。")
            digest.update(chunk)
    if total != size:
        raise ValueError("GSC 來源檔在讀取期間發生變更。")
    return digest.hexdigest(), total


def _package_guard(root: Path, package: Path) -> dict[str, Any]:
    if _linklike(package) or not package.is_dir():
        raise ValueError("GSC 候選包不是實體資料夾。")
    rows: list[dict[str, Any]] = []
    total = 0
    try:
        entries = sorted(os.scandir(package), key=lambda item: (item.name.casefold(), item.name))
    except OSError as exc:
        raise ValueError("GSC 候選包無法讀取。") from exc
    for entry in entries:
        path = Path(entry.path)
        if _linklike(path) or not entry.is_file(follow_symlinks=False):
            raise ValueError("GSC 候選包含連結、子資料夾或特殊項目。")
        digest, size = _sha256_file(path)
        total += size
        if total > MAX_GUARD_PACKAGE_BYTES:
            raise ValueError("GSC 候選包總大小超過安全上限。")
        rows.append({"fileName": entry.name, "fileSha256": digest, "fileSizeBytes": size})
    payload = {"packageRelativePath": _safe_relative(root, package), "files": rows}
    return {**payload, "packageGuardSha256": hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()}


def _discovery_signature(root: Path, candidates: list[Path], issues: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "candidatePaths": [_safe_relative(root, item) for item in candidates],
        "structuralIssues": [{"code": item["code"], "entries": item["entries"]} for item in issues],
    }


def _source_unchanged(root: Path, max_depth: int, discovery: dict[str, Any], guards: dict[str, dict[str, Any]]) -> bool:
    try:
        candidates, issues, _ = _discover_candidates(root, max_depth)
        if _discovery_signature(root, candidates, issues) != discovery:
            return False
        return all(_package_guard(root, candidate) == guards[_safe_relative(root, candidate)] for candidate in candidates)
    except (KeyError, OSError, ValueError):
        return False


def _clean_error(error: BaseException, root: Path) -> str:
    message = " ".join(str(error).replace(str(root), "<source-root>").split())
    return (message or error.__class__.__name__)[:500]


def _chain_identity(checkpoint: dict[str, Any]) -> dict[str, str]:
    archive = checkpoint["archive"]
    return {
        "providerOrganization": archive["providerOrganization"],
        "repositoryId": archive["repositoryId"],
        "archiveObjectId": archive["archiveObjectId"],
        "versionId": archive["versionId"],
    }


def _chain_id(identity: dict[str, str]) -> str:
    return "GSL-" + hashlib.sha256(_canonical_json_bytes(identity)).hexdigest()[:20].upper()


def _case_name(root: Path, package: Path) -> str:
    relative = package.relative_to(root)
    return relative.parts[0] if len(relative.parts) > 1 else root.name


def _seconds_until(value: str, assessed_at: str) -> int:
    delta = _utc_datetime(value, "期限") - _utc_datetime(assessed_at, "評估時間")
    return int(delta.total_seconds())


def _build_chain(root: Path, records: list[dict[str, Any]], assessed_at: str, upcoming_days: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    by_fingerprint: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        by_fingerprint[record["checkpoint"]["checkpointFingerprint"]].append(record)
    unique: list[dict[str, Any]] = []
    duplicates: list[dict[str, Any]] = []
    for fingerprint in sorted(by_fingerprint):
        copies = sorted(by_fingerprint[fingerprint], key=lambda item: (item["packageRelativePath"].casefold(), item["packageRelativePath"]))
        unique.append(copies[0])
        if len(copies) > 1:
            duplicates.append({
                "checkpointFingerprint": fingerprint,
                "selectedPackageRelativePath": copies[0]["packageRelativePath"],
                "duplicatePackageRelativePaths": [item["packageRelativePath"] for item in copies[1:]],
            })
    unique.sort(key=lambda item: (
        _utc_datetime(item["checkpoint"]["observation"]["observedAt"], "觀察時間"),
        _utc_datetime(item["checkpoint"]["verifiedAt"], "驗證時間"),
        item["checkpoint"]["checkpointFingerprint"],
    ), reverse=True)
    selected = unique[0]
    max_observed = selected["checkpoint"]["observation"]["observedAt"]
    latest = [item for item in unique if item["checkpoint"]["observation"]["observedAt"] == max_observed]
    identity = _chain_identity(selected["checkpoint"])
    object_summaries = {
        _canonical_json_bytes(item["checkpoint"]["source"]["archiveObject"]) for item in unique
    }
    ambiguous = len(latest) > 1
    conflict = len(object_summaries) > 1
    if ambiguous:
        issues.append(_issue("error", "ambiguous-latest-checkpoint", "同一外部物件具有相同最新觀察時間但內容不同的有效 GSC，禁止自動選定。", [item["packageRelativePath"] for item in latest]))
    if conflict:
        issues.append(_issue("error", "archive-object-identity-conflict", "同一保存端物件與版本對應到不同 GAP 摘要，禁止合併為單一生命週期鏈。", [item["packageRelativePath"] for item in unique]))
    assessment = selected["assessment"]
    lifecycle_status = "blocked" if ambiguous or conflict else assessment["lifecycleStatus"]
    reminder_reasons: list[str] = []
    attention_status = lifecycle_status
    review_seconds = _seconds_until(assessment["nextReviewDueAt"], assessed_at)
    retention_seconds = _seconds_until(assessment["retentionUntil"], assessed_at)
    if lifecycle_status == "current" and min(review_seconds, retention_seconds) <= upcoming_days * 86400:
        attention_status = "upcoming"
        if review_seconds <= upcoming_days * 86400:
            reminder_reasons.append("periodic-review-upcoming")
        if retention_seconds <= upcoming_days * 86400:
            reminder_reasons.append("retention-expiry-upcoming")
    elif lifecycle_status in {"review-due", "blocked"}:
        reminder_reasons.extend(assessment["reasons"])
    if ambiguous:
        reminder_reasons.append("ambiguous-latest-checkpoint")
    if conflict:
        reminder_reasons.append("archive-object-identity-conflict")
    checkpoint = selected["checkpoint"]
    chain = {
        "chainId": _chain_id(identity),
        "identity": identity,
        "archiveObject": checkpoint["source"]["archiveObject"],
        "legalHoldRequired": checkpoint["archive"]["legalHoldRequired"],
        "selected": {
            "caseName": selected["caseName"],
            "packageRelativePath": selected["packageRelativePath"],
            "checkpointFingerprint": checkpoint["checkpointFingerprint"],
            "statusFingerprint": checkpoint["source"]["statusFingerprint"],
            "observedAt": checkpoint["observation"]["observedAt"],
            "verifiedAt": checkpoint["verifiedAt"],
            "nextReviewDueAt": assessment["nextReviewDueAt"],
            "retentionUntil": assessment["retentionUntil"],
            "retentionWarningDays": checkpoint["policy"]["retentionWarningDays"],
        },
        "lifecycleStatus": lifecycle_status,
        "checkpointLifecycleStatus": assessment["lifecycleStatus"],
        "attentionStatus": attention_status,
        "reasons": sorted(set(reminder_reasons)),
        "secondsUntilReview": review_seconds,
        "secondsUntilRetention": retention_seconds,
        "superseded": [
            {
                "caseName": item["caseName"],
                "packageRelativePath": item["packageRelativePath"],
                "checkpointFingerprint": item["checkpoint"]["checkpointFingerprint"],
                "observedAt": item["checkpoint"]["observation"]["observedAt"],
                "verifiedAt": item["checkpoint"]["verifiedAt"],
            }
            for item in unique if item is not selected
        ],
        "duplicateCopies": duplicates,
    }
    return chain, issues


def _summary(chains: list[dict[str, Any]], invalid_packages: list[dict[str, Any]], issues: list[dict[str, Any]]) -> dict[str, Any]:
    error_issues = [item for item in issues if item["level"] == "error"]
    if invalid_packages or error_issues or not chains or any(item["lifecycleStatus"] == "blocked" for item in chains):
        portfolio_status = "blocked"
    elif any(item["lifecycleStatus"] == "review-due" for item in chains):
        portfolio_status = "review-due"
    else:
        portfolio_status = "current"
    attention_status = portfolio_status
    if portfolio_status == "current" and any(item["attentionStatus"] == "upcoming" for item in chains):
        attention_status = "upcoming"
    return {
        "portfolioStatus": portfolio_status,
        "attentionStatus": attention_status,
        "chainCount": len(chains),
        "currentCount": sum(item["lifecycleStatus"] == "current" for item in chains),
        "upcomingCount": sum(item["attentionStatus"] == "upcoming" for item in chains),
        "reviewDueCount": sum(item["lifecycleStatus"] == "review-due" for item in chains),
        "blockedCount": sum(item["lifecycleStatus"] == "blocked" for item in chains),
        "invalidPackageCount": len(invalid_packages),
        "errorIssueCount": len(error_issues),
    }


def _scan_portfolio(
    source_root: Path,
    *,
    openssl_path: Path | None = None,
    as_of: str | None = None,
    upcoming_days: int = 30,
    max_depth: int = MAX_SCAN_DEPTH,
    before_stability_check: Callable[[dict[str, Any]], None] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(upcoming_days, int) or isinstance(upcoming_days, bool) or not 0 <= upcoming_days <= MAX_UPCOMING_DAYS:
        raise ValueError(f"即將到期提醒天數必須為 0 至 {MAX_UPCOMING_DAYS}。")
    if not isinstance(max_depth, int) or isinstance(max_depth, bool) or not 1 <= max_depth <= MAX_SCAN_DEPTH:
        raise ValueError(f"掃描深度必須為 1 至 {MAX_SCAN_DEPTH}。")
    root = _physical_directory(source_root, "GSC 多案件來源根目錄")
    assessed_at = _iso(as_of or _now_iso(), "總覽評估時間")
    openssl = find_openssl(openssl_path)
    candidates, discovery_issues, scanned = _discover_candidates(root, max_depth)
    discovery = _discovery_signature(root, candidates, discovery_issues)
    guards: dict[str, dict[str, Any]] = {}
    valid_records: list[dict[str, Any]] = []
    invalid_packages: list[dict[str, Any]] = []
    for package in candidates:
        relative = _safe_relative(root, package)
        guard: dict[str, Any] | None = None
        try:
            guard = _package_guard(root, package)
            guards[relative] = guard
            if not PACKAGE_NAME_PATTERN.fullmatch(package.name):
                raise ValueError("GSC 候選包資料夾名稱格式不正確。")
            result = verify_lifecycle_checkpoint_package(package, openssl_path=openssl, as_of=assessed_at)
            valid_records.append({
                "caseName": _case_name(root, package),
                "packageRelativePath": relative,
                "packageGuardSha256": guard["packageGuardSha256"],
                **result,
            })
        except (OSError, ValueError) as exc:
            invalid_packages.append({
                "caseName": _case_name(root, package),
                "packageRelativePath": relative,
                "packageGuardSha256": guard["packageGuardSha256"] if guard else "",
                "errorCode": "gsc-package-verification-failed",
                "message": _clean_error(exc, root),
            })
    grouped: dict[bytes, list[dict[str, Any]]] = defaultdict(list)
    for record in valid_records:
        grouped[_canonical_json_bytes(_chain_identity(record["checkpoint"]))].append(record)
    chains: list[dict[str, Any]] = []
    chain_issues: list[dict[str, Any]] = []
    for key in sorted(grouped):
        chain, issues = _build_chain(root, grouped[key], assessed_at, upcoming_days)
        chains.append(chain)
        chain_issues.extend(issues)
    chains.sort(key=lambda item: (-STATUS_PRIORITY[item["attentionStatus"]], item["chainId"]))
    issues = [*discovery_issues, *chain_issues]
    if not candidates:
        issues.append(_issue("error", "portfolio-empty", "來源根目錄找不到任何 GSC 候選包。"))
    if invalid_packages:
        issues.append(_issue("error", "invalid-gsc-packages", "存在未通過完整重驗的 GSC 候選包，不得以其他有效舊包掩蓋。", [item["packageRelativePath"] for item in invalid_packages]))
    probe = {
        "sourceRootName": root.name,
        "candidateCount": len(candidates),
        "validPackageCount": len(valid_records),
        "invalidPackageCount": len(invalid_packages),
    }
    if before_stability_check:
        before_stability_check(probe)
    source_stable = len(guards) == len(candidates) and _source_unchanged(root, max_depth, discovery, guards)
    if not source_stable:
        issues.append(_issue("error", "source-changed-during-scan", "GSC 來源在掃描期間改變或無法完成封閉重驗，本次總覽禁止視為穩定快照。"))
    invalid_packages.sort(key=lambda item: (item["packageRelativePath"].casefold(), item["packageRelativePath"]))
    issues.sort(key=lambda item: (0 if item["level"] == "error" else 1, item["code"], item["entries"]))
    summary = _summary(chains, invalid_packages, issues)
    snapshot: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": PORTFOLIO_KIND,
        "snapshotContext": PORTFOLIO_CONTEXT,
        "assessedAt": assessed_at,
        "source": {
            "rootName": root.name,
            "maxScanDepth": max_depth,
            "upcomingReminderDays": upcoming_days,
            "sourceStableDuringScan": source_stable,
        },
        "discovery": {
            "scannedDirectoryCount": scanned,
            "candidatePackageCount": len(candidates),
            "validPackageCount": len(valid_records),
            "invalidPackageCount": len(invalid_packages),
            "duplicateCopyCount": sum(len(item["duplicatePackageRelativePaths"]) for chain in chains for item in chain["duplicateCopies"]),
        },
        "summary": summary,
        "chains": chains,
        "invalidPackages": invalid_packages,
        "issues": issues,
        "boundary": PORTFOLIO_BOUNDARY,
    }
    snapshot["portfolioFingerprint"] = portfolio_fingerprint(snapshot)
    guard = {"root": root, "maxDepth": max_depth, "discovery": discovery, "guards": guards}
    return validate_portfolio_snapshot(snapshot), guard


def scan_portfolio(
    source_root: Path,
    *,
    openssl_path: Path | None = None,
    as_of: str | None = None,
    upcoming_days: int = 30,
    max_depth: int = MAX_SCAN_DEPTH,
    before_stability_check: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    snapshot, _ = _scan_portfolio(
        source_root,
        openssl_path=openssl_path,
        as_of=as_of,
        upcoming_days=upcoming_days,
        max_depth=max_depth,
        before_stability_check=before_stability_check,
    )
    return snapshot


def _validate_relative(value: Any, label: str) -> str:
    text = str(value or "")
    path = Path(text)
    if not text or path.is_absolute() or ".." in path.parts or "\\" in text:
        raise ValueError(f"{label}不是安全相對路徑。")
    return text


def _require_exact(value: Any, fields: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError(f"{label}格式不正確或含有未識別欄位。")
    return value


def _require_int(value: Any, label: str, minimum: int = 0) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
        raise ValueError(f"{label}必須是有效整數。")
    return value


def validate_portfolio_snapshot(value: Any) -> dict[str, Any]:
    fields = {
        "schemaVersion", "kind", "snapshotContext", "assessedAt", "source", "discovery",
        "summary", "chains", "invalidPackages", "issues", "boundary", "portfolioFingerprint",
    }
    record = _require_exact(value, fields, "GSP 總覽")
    if record["schemaVersion"] != 1 or record["kind"] != PORTFOLIO_KIND or record["snapshotContext"] != PORTFOLIO_CONTEXT:
        raise ValueError("GSP 版本、種類或內容脈絡不受支援。")
    assessed_at = _iso(record["assessedAt"], "GSP 評估時間")
    source = _require_exact(record["source"], {"rootName", "maxScanDepth", "upcomingReminderDays", "sourceStableDuringScan"}, "GSP source")
    if (
        not isinstance(source["rootName"], str) or not source["rootName"] or len(source["rootName"]) > 255
        or source["rootName"] in {".", ".."} or "/" in source["rootName"] or "\\" in source["rootName"]
    ):
        raise ValueError("GSP 來源根目錄名稱不正確。")
    depth = _require_int(source["maxScanDepth"], "GSP 掃描深度", 1)
    upcoming = _require_int(source["upcomingReminderDays"], "GSP 提醒天數")
    if depth > MAX_SCAN_DEPTH or upcoming > MAX_UPCOMING_DAYS or not isinstance(source["sourceStableDuringScan"], bool):
        raise ValueError("GSP 掃描政策不受支援。")
    discovery = _require_exact(record["discovery"], {"scannedDirectoryCount", "candidatePackageCount", "validPackageCount", "invalidPackageCount", "duplicateCopyCount"}, "GSP discovery")
    for key in discovery:
        _require_int(discovery[key], f"GSP {key}")
    if discovery["candidatePackageCount"] != discovery["validPackageCount"] + discovery["invalidPackageCount"]:
        raise ValueError("GSP 候選包計數不一致。")
    if not isinstance(record["chains"], list) or not isinstance(record["invalidPackages"], list) or not isinstance(record["issues"], list):
        raise ValueError("GSP 清單欄位格式不正確。")
    chain_fields = {
        "chainId", "identity", "archiveObject", "legalHoldRequired", "selected", "lifecycleStatus",
        "checkpointLifecycleStatus", "attentionStatus", "reasons", "secondsUntilReview",
        "secondsUntilRetention", "superseded", "duplicateCopies",
    }
    chain_ids: set[str] = set()
    primary_paths: set[str] = set()
    duplicate_paths: set[str] = set()
    for chain in record["chains"]:
        chain = _require_exact(chain, chain_fields, "GSP chain")
        if not re.fullmatch(r"GSL-[0-9A-F]{20}", str(chain["chainId"])) or chain["chainId"] in chain_ids:
            raise ValueError("GSP 生命週期鏈識別碼不正確或重複。")
        chain_ids.add(chain["chainId"])
        identity = _require_exact(chain["identity"], {"providerOrganization", "repositoryId", "archiveObjectId", "versionId"}, "GSP identity")
        if any(not isinstance(identity[key], str) or not identity[key] for key in identity) or chain["chainId"] != _chain_id(identity):
            raise ValueError("GSP 生命週期鏈身分不完整。")
        archive_object = _require_exact(chain["archiveObject"], {"fileName", "fileSha256", "fileSizeBytes", "mediaType", "zipProfile"}, "GSP archiveObject")
        if not re.fullmatch(r"[0-9a-f]{64}", str(archive_object["fileSha256"])) or _require_int(archive_object["fileSizeBytes"], "GSP GAP bytes", 1) < 1:
            raise ValueError("GSP GAP 摘要不正確。")
        if not isinstance(chain["legalHoldRequired"], bool):
            raise ValueError("GSP legal hold 要求格式不正確。")
        selected = _require_exact(chain["selected"], {"caseName", "packageRelativePath", "checkpointFingerprint", "statusFingerprint", "observedAt", "verifiedAt", "nextReviewDueAt", "retentionUntil", "retentionWarningDays"}, "GSP selected")
        if not isinstance(selected["caseName"], str) or not selected["caseName"]:
            raise ValueError("GSP 案件名稱不正確。")
        _validate_relative(selected["packageRelativePath"], "GSP 選定包路徑")
        if selected["packageRelativePath"] in primary_paths:
            raise ValueError("GSP 選定或歷史包路徑重複。")
        primary_paths.add(selected["packageRelativePath"])
        if not re.fullmatch(r"GSC-[0-9A-F]{20}", str(selected["checkpointFingerprint"])) or not re.fullmatch(r"GSR-[0-9A-F]{20}", str(selected["statusFingerprint"])):
            raise ValueError("GSP 選定證據指紋不正確。")
        for key in ("observedAt", "verifiedAt", "nextReviewDueAt", "retentionUntil"):
            _iso(selected[key], f"GSP {key}")
        retention_warning_days = _require_int(selected["retentionWarningDays"], "GSP retention warning days")
        if retention_warning_days > 3660:
            raise ValueError("GSP retention warning days 不受支援。")
        if chain["lifecycleStatus"] not in LIFECYCLE_STATUSES or chain["checkpointLifecycleStatus"] not in LIFECYCLE_STATUSES or chain["attentionStatus"] not in ATTENTION_STATUSES:
            raise ValueError("GSP 狀態值不受支援。")
        if not isinstance(chain["reasons"], list) or any(not isinstance(item, str) or not item for item in chain["reasons"]):
            raise ValueError("GSP 提醒原因格式不正確。")
        if not isinstance(chain["secondsUntilReview"], int) or isinstance(chain["secondsUntilReview"], bool) or not isinstance(chain["secondsUntilRetention"], int) or isinstance(chain["secondsUntilRetention"], bool):
            raise ValueError("GSP 剩餘秒數格式不正確。")
        if chain["secondsUntilReview"] != _seconds_until(selected["nextReviewDueAt"], assessed_at) or chain["secondsUntilRetention"] != _seconds_until(selected["retentionUntil"], assessed_at):
            raise ValueError("GSP 剩餘秒數與期限不一致。")
        current_dt = _utc_datetime(assessed_at, "GSP 評估時間")
        next_review_dt = _utc_datetime(selected["nextReviewDueAt"], "GSP 下次重驗期限")
        retention_dt = _utc_datetime(selected["retentionUntil"], "GSP 保留期限")
        retention_warning_start = retention_dt - timedelta(days=retention_warning_days)
        base_reasons: list[str] = []
        if current_dt >= retention_dt:
            expected_checkpoint_status = "blocked"
            base_reasons.append("retention-expired")
        else:
            if current_dt >= next_review_dt:
                base_reasons.append("periodic-review-due")
            if current_dt >= retention_warning_start:
                base_reasons.append("retention-renewal-window")
            expected_checkpoint_status = "review-due" if base_reasons else "current"
        if chain["checkpointLifecycleStatus"] != expected_checkpoint_status:
            raise ValueError("GSP 選定 GSC 狀態與期限不一致。")
        conflict_reasons = [item for item in ("ambiguous-latest-checkpoint", "archive-object-identity-conflict") if item in chain["reasons"]]
        expected_lifecycle_status = "blocked" if conflict_reasons else expected_checkpoint_status
        expected_attention_status = expected_lifecycle_status
        expected_reasons = list(base_reasons)
        if expected_lifecycle_status == "current" and min(chain["secondsUntilReview"], chain["secondsUntilRetention"]) <= upcoming * 86400:
            expected_attention_status = "upcoming"
            if chain["secondsUntilReview"] <= upcoming * 86400:
                expected_reasons.append("periodic-review-upcoming")
            if chain["secondsUntilRetention"] <= upcoming * 86400:
                expected_reasons.append("retention-expiry-upcoming")
        expected_reasons.extend(conflict_reasons)
        if chain["lifecycleStatus"] != expected_lifecycle_status or chain["attentionStatus"] != expected_attention_status or chain["reasons"] != sorted(set(expected_reasons)):
            raise ValueError("GSP 提醒狀態或原因與期限／衝突資料不一致。")
        if not isinstance(chain["superseded"], list) or not isinstance(chain["duplicateCopies"], list):
            raise ValueError("GSP 歷史或複本清單格式不正確。")
        fingerprint_paths = {selected["checkpointFingerprint"]: selected["packageRelativePath"]}
        for item in chain["superseded"]:
            item = _require_exact(item, {"caseName", "packageRelativePath", "checkpointFingerprint", "observedAt", "verifiedAt"}, "GSP superseded")
            _validate_relative(item["packageRelativePath"], "GSP 歷史包路徑")
            if (
                not re.fullmatch(r"GSC-[0-9A-F]{20}", str(item["checkpointFingerprint"]))
                or item["checkpointFingerprint"] in fingerprint_paths
                or item["packageRelativePath"] in primary_paths
            ):
                raise ValueError("GSP 歷史檢查點指紋不正確。")
            fingerprint_paths[item["checkpointFingerprint"]] = item["packageRelativePath"]
            primary_paths.add(item["packageRelativePath"])
            _iso(item["observedAt"], "GSP 歷史觀察時間")
            _iso(item["verifiedAt"], "GSP 歷史驗證時間")
            if _utc_datetime(item["observedAt"], "GSP 歷史觀察時間") > _utc_datetime(selected["observedAt"], "GSP 選定觀察時間"):
                raise ValueError("GSP 選定檢查點不是生命週期鏈的最新觀察。")
        same_time_history = any(item["observedAt"] == selected["observedAt"] for item in chain["superseded"])
        if same_time_history != ("ambiguous-latest-checkpoint" in chain["reasons"]):
            raise ValueError("GSP 相同最新時間衝突標記與歷史清單不一致。")
        duplicate_fingerprints: set[str] = set()
        for item in chain["duplicateCopies"]:
            item = _require_exact(item, {"checkpointFingerprint", "selectedPackageRelativePath", "duplicatePackageRelativePaths"}, "GSP duplicate")
            _validate_relative(item["selectedPackageRelativePath"], "GSP 複本基準路徑")
            if (
                item["checkpointFingerprint"] not in fingerprint_paths
                or item["checkpointFingerprint"] in duplicate_fingerprints
                or item["selectedPackageRelativePath"] != fingerprint_paths[item["checkpointFingerprint"]]
                or not isinstance(item["duplicatePackageRelativePaths"], list)
                or not item["duplicatePackageRelativePaths"]
            ):
                raise ValueError("GSP 重複複本清單不完整。")
            duplicate_fingerprints.add(item["checkpointFingerprint"])
            for path in item["duplicatePackageRelativePaths"]:
                _validate_relative(path, "GSP 重複複本路徑")
                if path in primary_paths or path in duplicate_paths:
                    raise ValueError("GSP 重複複本路徑重複或與主檢查點衝突。")
                duplicate_paths.add(path)
    invalid_fields = {"caseName", "packageRelativePath", "packageGuardSha256", "errorCode", "message"}
    invalid_paths: set[str] = set()
    for item in record["invalidPackages"]:
        item = _require_exact(item, invalid_fields, "GSP invalid package")
        _validate_relative(item["packageRelativePath"], "GSP 無效包路徑")
        if item["packageRelativePath"] in primary_paths or item["packageRelativePath"] in duplicate_paths or item["packageRelativePath"] in invalid_paths:
            raise ValueError("GSP 無效包路徑與其他候選包重複。")
        invalid_paths.add(item["packageRelativePath"])
        if item["packageGuardSha256"] and not re.fullmatch(r"[0-9a-f]{64}", str(item["packageGuardSha256"])):
            raise ValueError("GSP 無效包 guard 不正確。")
        if item["errorCode"] != "gsc-package-verification-failed" or not isinstance(item["message"], str) or not item["message"]:
            raise ValueError("GSP 無效包錯誤摘要不正確。")
    issue_fields = {"level", "code", "message", "entries"}
    for item in record["issues"]:
        item = _require_exact(item, issue_fields, "GSP issue")
        if item["level"] not in {"error", "warning", "info"} or not isinstance(item["code"], str) or not item["code"] or not isinstance(item["message"], str) or not item["message"] or not isinstance(item["entries"], list):
            raise ValueError("GSP issue 內容不正確。")
        for entry in item["entries"]:
            _validate_relative(entry, "GSP issue 路徑")
    expected_summary = _summary(record["chains"], record["invalidPackages"], record["issues"])
    if record["summary"] != expected_summary:
        raise ValueError("GSP 彙整計數或狀態不一致。")
    if discovery["validPackageCount"] != len({item["selected"]["packageRelativePath"] for item in record["chains"]}) + sum(len(item["superseded"]) for item in record["chains"]) + discovery["duplicateCopyCount"]:
        raise ValueError("GSP 有效包數與鏈內容不一致。")
    if discovery["invalidPackageCount"] != len(record["invalidPackages"]):
        raise ValueError("GSP 無效包數不一致。")
    if discovery["candidatePackageCount"] != len(primary_paths | duplicate_paths | invalid_paths):
        raise ValueError("GSP 候選包路徑集合與計數不一致。")
    duplicate_count = sum(len(item["duplicatePackageRelativePaths"]) for chain in record["chains"] for item in chain["duplicateCopies"])
    if discovery["duplicateCopyCount"] != duplicate_count:
        raise ValueError("GSP 重複複本數不一致。")
    issue_codes = {item["code"] for item in record["issues"]}
    if bool(record["invalidPackages"]) != ("invalid-gsc-packages" in issue_codes):
        raise ValueError("GSP 無效包與總覽問題標記不一致。")
    if (not source["sourceStableDuringScan"]) != ("source-changed-during-scan" in issue_codes):
        raise ValueError("GSP 來源穩定性與總覽問題標記不一致。")
    if (discovery["candidatePackageCount"] == 0) != ("portfolio-empty" in issue_codes):
        raise ValueError("GSP 空總覽與問題標記不一致。")
    for code in ("ambiguous-latest-checkpoint", "archive-object-identity-conflict"):
        if any(code in chain["reasons"] for chain in record["chains"]) != (code in issue_codes):
            raise ValueError("GSP 生命週期鏈衝突與總覽問題標記不一致。")
    if record["boundary"] != PORTFOLIO_BOUNDARY:
        raise ValueError("GSP 責任邊界不完整。")
    fingerprint = str(record["portfolioFingerprint"])
    if not re.fullmatch(r"GSP-[0-9A-F]{20}", fingerprint) or fingerprint != portfolio_fingerprint(record):
        raise ValueError("GSP 指紋驗證失敗。")
    return json.loads(json.dumps(record, ensure_ascii=False))


def _status_label(status: str) -> str:
    return {"current": "目前有效", "upcoming": "即將重驗", "review-due": "應立即重驗", "blocked": "阻擋"}[status]


def _format_duration(seconds: int) -> str:
    if seconds == 0:
        return "現在"
    days = abs(seconds) // 86400
    hours = (abs(seconds) % 86400) // 3600
    text = f"{days} 日 {hours} 小時"
    return f"剩餘 {text}" if seconds > 0 else f"已逾 {text}"


def render_portfolio_html(snapshot: dict[str, Any]) -> str:
    snapshot = validate_portfolio_snapshot(snapshot)
    esc = lambda value: html.escape(str(value), quote=True)
    rows = []
    for chain in snapshot["chains"]:
        selected = chain["selected"]
        identity = chain["identity"]
        reasons = "、".join(chain["reasons"]) or "—"
        rows.append(
            f'<tr class="status-{esc(chain["attentionStatus"])}">'
            f'<td><span class="badge">{esc(_status_label(chain["attentionStatus"]))}</span></td>'
            f'<td>{esc(selected["caseName"])}</td>'
            f'<td>{esc(identity["providerOrganization"])}<br><small>{esc(identity["repositoryId"])}</small></td>'
            f'<td>{esc(identity["archiveObjectId"])}<br><small>{esc(identity["versionId"])}</small></td>'
            f'<td>{esc(selected["observedAt"])}</td>'
            f'<td>{esc(selected["nextReviewDueAt"])}<br><small>{esc(_format_duration(chain["secondsUntilReview"]))}</small></td>'
            f'<td>{esc(selected["retentionUntil"])}<br><small>{esc(_format_duration(chain["secondsUntilRetention"]))}</small></td>'
            f'<td>{esc(reasons)}<br><small>{esc(selected["checkpointFingerprint"])}</small></td>'
            '</tr>'
        )
    if not rows:
        rows.append('<tr><td colspan="8" class="empty">沒有可列示的有效 GSC 生命週期鏈。</td></tr>')
    invalid_rows = "".join(
        f'<li><code>{esc(item["packageRelativePath"])}</code>：{esc(item["message"])}</li>'
        for item in snapshot["invalidPackages"]
    ) or '<li>無</li>'
    issue_rows = "".join(
        f'<li><strong>{esc(item["code"])}</strong>：{esc(item["message"])}'
        f'{("<br><small>" + esc("、".join(item["entries"])) + "</small>") if item["entries"] else ""}</li>'
        for item in snapshot["issues"]
    ) or '<li>無</li>'
    summary = snapshot["summary"]
    return f'''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="gsp-fingerprint" content="{esc(snapshot["portfolioFingerprint"])}">
<title>外部歸檔生命週期總覽</title>
<style>
:root{{--ink:#172033;--muted:#5f6b7a;--line:#d7dee8;--ok:#1f7a4d;--soon:#9a6700;--due:#b54708;--bad:#b42318;--paper:#fff;--wash:#f5f7fa}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--wash);color:var(--ink);font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;line-height:1.55}}
main{{max-width:1440px;margin:24px auto;padding:28px;background:var(--paper);box-shadow:0 8px 30px #17203314}}
h1{{margin:0 0 4px;font-size:30px}}h2{{margin-top:30px;font-size:20px}}p{{margin:6px 0}}small{{color:var(--muted)}}
.boundary{{border:2px solid var(--bad);background:#fff4f2;padding:12px 16px;margin:20px 0;font-weight:700}}
.cards{{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:10px;margin:18px 0}}.card{{border:1px solid var(--line);padding:12px;border-radius:8px}}.card b{{display:block;font-size:24px}}
table{{width:100%;border-collapse:collapse;font-size:14px}}th,td{{border:1px solid var(--line);padding:9px;vertical-align:top;text-align:left}}th{{background:#eef2f7;position:sticky;top:0}}
.badge{{display:inline-block;border-radius:999px;padding:3px 9px;color:#fff;white-space:nowrap}}.status-current .badge{{background:var(--ok)}}.status-upcoming .badge{{background:var(--soon)}}.status-review-due .badge{{background:var(--due)}}.status-blocked .badge{{background:var(--bad)}}
code{{word-break:break-all}}.meta{{color:var(--muted)}}.empty{{text-align:center;color:var(--muted)}}ul{{padding-left:24px}}
@media(max-width:900px){{main{{margin:0;padding:16px}}.cards{{grid-template-columns:repeat(2,1fr)}}table{{display:block;overflow-x:auto}}}}
@media print{{body{{background:#fff}}main{{box-shadow:none;margin:0;max-width:none}}.boundary{{display:block}}th{{position:static}}}}
</style></head><body><main>
<h1>外部歸檔生命週期總覽</h1>
<p class="meta">評估時間：{esc(snapshot["assessedAt"])} ｜ 來源：{esc(snapshot["source"]["rootName"])} ｜ 指紋：{esc(snapshot["portfolioFingerprint"])}</p>
<div class="boundary">內部治理總覽｜不得作為計算書、主報告或正式附件。此快照只記錄當時掃描結果；目前狀態必須重新完整掃描 GSC。</div>
<section class="cards">
<div class="card">總鏈數<b>{summary["chainCount"]}</b></div><div class="card">目前有效<b>{summary["currentCount"]}</b></div>
<div class="card">即將重驗<b>{summary["upcomingCount"]}</b></div><div class="card">應立即重驗<b>{summary["reviewDueCount"]}</b></div>
<div class="card">阻擋<b>{summary["blockedCount"]}</b></div><div class="card">無效包<b>{summary["invalidPackageCount"]}</b></div>
</section>
<h2>逐鏈提醒</h2><table><thead><tr><th>狀態</th><th>案件</th><th>保存端／保存庫</th><th>物件／版本</th><th>觀察時間</th><th>下次重驗</th><th>保留期限</th><th>原因／指紋</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
<h2>未通過完整重驗的候選包</h2><ul>{invalid_rows}</ul>
<h2>掃描問題</h2><ul>{issue_rows}</ul>
<p class="meta">保存端 GSR 仍是供應者簽章證言，不是本工具對外部保存庫的獨立觀察；本總覽不構成工程核可。</p>
</main></body></html>'''


def _snapshot_bytes(snapshot: dict[str, Any]) -> tuple[bytes, bytes]:
    json_bytes = (json.dumps(validate_portfolio_snapshot(snapshot), ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    html_bytes = render_portfolio_html(snapshot).encode("utf-8")
    if len(json_bytes) > MAX_SNAPSHOT_JSON_BYTES or len(html_bytes) > MAX_SNAPSHOT_HTML_BYTES:
        raise ValueError("GSP 總覽輸出超過大小上限。")
    return json_bytes, html_bytes


def _snapshot_names(snapshot: dict[str, Any]) -> tuple[str, str, str]:
    fingerprint = snapshot["portfolioFingerprint"]
    directory = f"GSP-外部歸檔生命週期總覽-{fingerprint}"
    return directory, f"{directory}.json", f"{directory}.html"


def verify_portfolio_snapshot_package(directory: Path, *, require_directory_name: bool = True) -> dict[str, Any]:
    root = _physical_directory(directory, "GSP 總覽快照包")
    entries = sorted(os.scandir(root), key=lambda item: (item.name.casefold(), item.name))
    if any(_linklike(Path(item.path)) or not item.is_file(follow_symlinks=False) for item in entries):
        raise ValueError("GSP 快照包只能包含兩份一般檔案。")
    json_candidates = [Path(item.path) for item in entries if item.name.endswith(".json")]
    if len(json_candidates) != 1:
        raise ValueError("GSP 快照包必須恰有一份 JSON。")
    raw = json_candidates[0].read_bytes()
    if not raw or len(raw) > MAX_SNAPSHOT_JSON_BYTES:
        raise ValueError("GSP JSON 大小不正確。")
    try:
        snapshot = validate_portfolio_snapshot(json.loads(raw.decode("utf-8")))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("GSP JSON 不是有效 UTF-8 JSON。") from exc
    directory_name, json_name, html_name = _snapshot_names(snapshot)
    if require_directory_name and root.name != directory_name:
        raise ValueError("GSP 快照包資料夾名稱與指紋不一致。")
    if {item.name for item in entries} != {json_name, html_name} or json_candidates[0].name != json_name:
        raise ValueError("GSP 快照包檔名集合不完整或含有額外檔案。")
    expected_json, expected_html = _snapshot_bytes(snapshot)
    if raw != expected_json or (root / html_name).read_bytes() != expected_html:
        raise ValueError("GSP JSON 或 HTML 與決定性快照內容不一致。")
    return {
        "snapshot": snapshot,
        "historicalSnapshotIntegrityStatus": "valid",
        "currentSourceStateStatus": "not-assessed-requires-fresh-rescan",
        "boundary": {
            "selfVerificationDoesNotReverifySourceGscPackages": True,
            "doesNotProveCurrentRepositoryState": True,
            "formalCalculationAttachment": False,
            "pagesPublication": False,
        },
    }


def _nearest_existing(path: Path) -> Path:
    candidate = Path(os.path.abspath(path))
    while not candidate.exists():
        if candidate.parent == candidate:
            raise ValueError("找不到 GSP 輸出位置的既有上層。")
        candidate = candidate.parent
    return candidate


def publish_portfolio_snapshot(
    source_root: Path,
    output_root: Path,
    *,
    openssl_path: Path | None = None,
    as_of: str | None = None,
    upcoming_days: int = 30,
    max_depth: int = MAX_SCAN_DEPTH,
    before_publish: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    snapshot, guard = _scan_portfolio(
        source_root,
        openssl_path=openssl_path,
        as_of=as_of,
        upcoming_days=upcoming_days,
        max_depth=max_depth,
    )
    if not snapshot["source"]["sourceStableDuringScan"]:
        raise ValueError("GSC 來源不穩定，禁止發布 GSP 快照。")
    source = guard["root"]
    output = Path(os.path.abspath(output_root))
    nearest = _physical_directory(_nearest_existing(output), "GSP 輸出的既有上層")
    if _inside(source, output) or _inside(output, source):
        raise ValueError("GSP 快照存放根目錄不得位於 GSC 來源內，也不得包住來源。")
    if _inside(TOOL_REPOSITORY_ROOT, output):
        raise ValueError("GSP 快照存放根目錄不得位於工具程式庫內，以免內部治理資料進入版本控管或公開部署。")
    if output.exists():
        output = _physical_directory(output, "GSP 快照存放根目錄")
    else:
        output.mkdir(parents=True)
        output = _physical_directory(output, "GSP 快照存放根目錄")
    if not _inside(nearest, output) and not _same_path(nearest, output):
        raise ValueError("GSP 輸出位置解析結果不一致。")
    directory_name, json_name, html_name = _snapshot_names(snapshot)
    target = output / directory_name
    if target.exists():
        raise ValueError("同名 GSP 快照已存在；本工具不會覆寫。")
    staging = output / f".{directory_name}.tmp-{os.getpid()}-{secrets.token_hex(4)}"
    json_bytes, html_bytes = _snapshot_bytes(snapshot)
    published = False
    try:
        staging.mkdir()
        (staging / json_name).write_bytes(json_bytes)
        (staging / html_name).write_bytes(html_bytes)
        verify_portfolio_snapshot_package(staging, require_directory_name=False)
        if before_publish:
            before_publish(snapshot)
        if not _source_unchanged(source, guard["maxDepth"], guard["discovery"], guard["guards"]):
            raise ValueError("GSP 發布前 GSC 來源已改變。")
        if target.exists():
            raise ValueError("同名 GSP 快照已存在；本工具不會覆寫。")
        staging.rename(target)
        published = True
        verification = verify_portfolio_snapshot_package(target)
        if not _source_unchanged(source, guard["maxDepth"], guard["discovery"], guard["guards"]):
            raise ValueError("GSP 發布期間 GSC 來源已改變，快照已撤回。")
        return {
            "directory": str(target),
            "jsonPath": str(target / json_name),
            "htmlPath": str(target / html_name),
            "portfolioFingerprint": snapshot["portfolioFingerprint"],
            "portfolioStatus": snapshot["summary"]["portfolioStatus"],
            "attentionStatus": snapshot["summary"]["attentionStatus"],
            "historicalSnapshotIntegrityStatus": verification["historicalSnapshotIntegrityStatus"],
        }
    except Exception:
        if published and target.exists():
            shutil.rmtree(target, ignore_errors=True)
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        raise


def exit_code_for_snapshot(snapshot: dict[str, Any]) -> int:
    status = validate_portfolio_snapshot(snapshot)["summary"]["attentionStatus"]
    return 3 if status == "blocked" else 2 if status in {"review-due", "upcoming"} else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="完整重驗並彙整多案件 GSC 外部歸檔生命週期。")
    parser.add_argument("--openssl", type=Path, help="可選：OpenSSL 可執行檔路徑")
    commands = parser.add_subparsers(dest="command", required=True)
    for name, help_text in (
        ("scan", "即時只讀掃描多案件 GSC 並輸出 JSON"),
        ("publish", "掃描穩定來源並建立封閉 JSON/HTML GSP 快照"),
    ):
        command = commands.add_parser(name, help=help_text)
        command.add_argument("--source-root", required=True, type=Path)
        command.add_argument("--as-of")
        command.add_argument("--upcoming-days", type=int, default=30)
        command.add_argument("--max-depth", type=int, default=MAX_SCAN_DEPTH)
        if name == "publish":
            command.add_argument("--output-root", required=True, type=Path)
    verify = commands.add_parser("verify-snapshot", help="只驗證封閉 GSP 快照自身完整性，不宣稱目前來源狀態")
    verify.add_argument("--package", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.command == "scan":
            result = scan_portfolio(args.source_root, openssl_path=args.openssl, as_of=args.as_of, upcoming_days=args.upcoming_days, max_depth=args.max_depth)
            exit_code = exit_code_for_snapshot(result)
        elif args.command == "publish":
            result = publish_portfolio_snapshot(args.source_root, args.output_root, openssl_path=args.openssl, as_of=args.as_of, upcoming_days=args.upcoming_days, max_depth=args.max_depth)
            exit_code = 3 if result["attentionStatus"] == "blocked" else 2 if result["attentionStatus"] in {"review-due", "upcoming"} else 0
        else:
            result = verify_portfolio_snapshot_package(args.package)
            exit_code = 0
        os.sys.stdout.buffer.write((json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        os.sys.stdout.buffer.flush()
        return exit_code
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=os.sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
