from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import math
import re
from typing import Any, Iterable

from .schemas import BraceRow, CheckResult, ProjectState, SupportRow


SCHEMA_VERSION = 1
KIND = "excavation-removal-transfer-handoff"
RECEIPT_KIND = "receiver-capacity-verification-receipt"
TRANSFER_MODE_LABELS = {
    "outside_scope": "本構件檢核範圍外（另案檢核）",
    "floor": "移轉至樓版",
    "reshore": "移轉至重撐／回撐",
    "permanent_structure": "移轉至永久結構",
    "other": "其他人工指定處置",
}

_COLLECTIONS = (
    ("top_supports", "support", "top", "上層水平支撐", "include_top_supports", "support_checks"),
    ("bottom_supports", "support", "bottom", "下層水平支撐", "include_bottom_supports", "support_checks"),
    ("top_braces", "brace", "top", "上層斜撐", "include_top_braces", "brace_checks"),
    ("bottom_braces", "brace", "bottom", "下層斜撐", "include_bottom_braces", "brace_checks"),
)


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _digest(prefix: str, value: Any, length: int = 20) -> str:
    digest = hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()[:length].upper()
    return f"{prefix}-{digest}"


def _handoff_fingerprint(record: dict[str, Any]) -> str:
    unsigned = {key: value for key, value in record.items() if key != "handoffFingerprint"}
    return _digest("ERH", unsigned)


def _transfer_id(transfer: dict[str, Any], calculation_fingerprint: str) -> str:
    return _digest("ERT", {"sourceCalculationFingerprint": calculation_fingerprint, "transfer": transfer})


def _iter_rows_with_checks(project: ProjectState) -> Iterable[tuple[str, str, str, str, int, SupportRow | BraceRow, CheckResult]]:
    if project.calculation_results is None:
        raise ValueError("尚未完成最新計算，無法建立拆撐承接構造交接檔。")
    cursors = {"support_checks": 0, "brace_checks": 0}
    for collection, member_type, side, module_name, option_name, checks_name in _COLLECTIONS:
        if not bool(getattr(project.calculation_options, option_name)):
            continue
        rows = list(getattr(project, collection))
        checks = list(getattr(project.calculation_results, checks_name))
        for row_index, row in enumerate(rows):
            cursor = cursors[checks_name]
            if cursor >= len(checks):
                raise ValueError(f"{module_name}的計算結果與輸入列數不一致，請重新計算。")
            yield collection, member_type, side, module_name, row_index, row, checks[cursor]
            cursors[checks_name] = cursor + 1


def _control_case(row: SupportRow | BraceRow) -> Any:
    control_index = row.analysis_control_stage_index
    control_label = row.analysis_control_stage_label.strip()
    for case in row.analysis_stage_cases:
        if case.stage_index == control_index and case.stage_label.strip() == control_label:
            return case
    raise ValueError(f"{row.level_label or '未命名構件'}缺少可重現的控制分析階段。")


def _build_transfer(
    *,
    collection: str,
    member_type: str,
    side: str,
    module_name: str,
    row_index: int,
    row: SupportRow | BraceRow,
    check: CheckResult,
    calculation_fingerprint: str,
) -> dict[str, Any]:
    if check.status == "NG":
        raise ValueError(f"{module_name}第 {row_index + 1} 列尚未形成可交接的有效檢核結果。")
    if row.force_source != "analysis_import" or row.analysis_removal_stage_index is None:
        raise ValueError(f"{module_name}第 {row_index + 1} 列不是具拆撐階段的外部分析列。")
    mode = row.removal_transfer_mode
    if mode not in TRANSFER_MODE_LABELS or not row.removal_transfer_confirmed:
        raise ValueError(f"{module_name}第 {row_index + 1} 列尚未確認拆撐後荷重處置。")
    if not row.removal_transfer_basis.strip():
        raise ValueError(f"{module_name}第 {row_index + 1} 列缺少拆撐處置依據。")
    if mode != "outside_scope" and not row.removal_transfer_target.strip():
        raise ValueError(f"{module_name}第 {row_index + 1} 列缺少承接構造或指定對象。")

    control = _control_case(row)
    axial_force = float(control.axial_force_t)
    if not math.isfinite(axial_force) or axial_force < 0:
        raise ValueError(f"{module_name}第 {row_index + 1} 列的控制軸力不是非負有限數值。")
    if member_type == "support":
        design_axial_force = float(check.details.get("total_force_t", axial_force))
    else:
        design_axial_force = float(check.details.get("axial_force_t", axial_force))

    transfer = {
        "sourceMember": {
            "collection": collection,
            "memberType": member_type,
            "side": side,
            "rowIndex": row_index,
            "moduleName": module_name,
            "levelLabel": row.level_label,
            "sectionName": row.section_name,
        },
        "lifecycle": {
            "installationStage": {
                "index": row.analysis_install_stage_index,
                "label": row.analysis_install_stage_label,
            },
            "controlStage": {
                "index": control.stage_index,
                "label": control.stage_label,
            },
            "removalStage": {
                "index": row.analysis_removal_stage_index,
                "label": row.analysis_removal_stage_label,
            },
            "constructionStep": row.construction_step_label,
            "mappingBasis": row.analysis_mapping_basis,
        },
        "sourceDemand": {
            "unit": "tf",
            "analysisControlAxialForceTf": round(axial_force, 6),
            "memberDesignAxialForceTf": round(design_axial_force, 6),
            "analysisCases": [
                {
                    "stageIndex": case.stage_index,
                    "stageLabel": case.stage_label,
                    "axialForceTf": round(float(case.axial_force_t), 6),
                }
                for case in row.analysis_stage_cases
            ],
            "basis": "外部分析控制階段軸力；承接構造之實際分配、方向、偏心及載重組合尚待驗證。",
        },
        "receiver": {
            "mode": mode,
            "modeLabel": TRANSFER_MODE_LABELS[mode],
            "target": row.removal_transfer_target.strip(),
            "dispositionBasis": row.removal_transfer_basis.strip(),
            "receiverIdentityRequired": mode == "outside_scope" and not row.removal_transfer_target.strip(),
        },
        "sourceCheck": {
            "status": check.status,
            "formulaId": check.formula_id,
            "utilizationRatio": check.utilization_ratio,
            "controllingCondition": check.controlling_condition,
        },
        "verification": {
            "status": "pending",
            "required": True,
            "autoVerified": False,
            "acceptedReceiptKind": RECEIPT_KIND,
        },
    }
    transfer["transferId"] = _transfer_id(transfer, calculation_fingerprint)
    return transfer


def build_removal_transfer_handoff(
    project: ProjectState,
    calculation_fingerprint: str,
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    if not re.fullmatch(r"CF-[0-9A-F]{16}", calculation_fingerprint):
        raise ValueError("缺少有效的來源計算指紋，無法建立拆撐承接構造交接檔。")

    transfers: list[dict[str, Any]] = []
    for collection, member_type, side, module_name, row_index, row, check in _iter_rows_with_checks(project):
        if row.analysis_removal_stage_index is None:
            continue
        transfers.append(
            _build_transfer(
                collection=collection,
                member_type=member_type,
                side=side,
                module_name=module_name,
                row_index=row_index,
                row=row,
                check=check,
                calculation_fingerprint=calculation_fingerprint,
            )
        )
    if not transfers:
        raise ValueError("目前沒有已完成計算且已確認拆撐處置的支撐或斜撐可建立交接檔。")

    record = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": KIND,
        "generatedAt": generated_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": {
            "toolId": "excavation-support",
            "toolName": "開挖擋土支撐工具",
            "toolVersion": "v0.1.0",
            "projectId": project.metadata.id or "",
            "projectName": project.metadata.name,
            "projectNo": project.metadata.project_code,
            "calculationFingerprint": calculation_fingerprint,
        },
        "transfers": transfers,
        "verificationSummary": {
            "status": "pending",
            "required": len(transfers),
            "verified": 0,
            "receiptKind": RECEIPT_KIND,
        },
        "boundary": {
            "requiresReceiverVerification": True,
            "autoApplied": False,
            "autoVerified": False,
            "scope": "本檔只交接拆撐來源構件、生命週期、控制軸力與人工採用之承接對象；不代表樓版、重撐、永久結構或其他承接構造已完成容量、傳力方向、分配、偏心或載重組合檢核。",
        },
    }
    record["handoffFingerprint"] = _handoff_fingerprint(record)
    return validate_removal_transfer_handoff(record)


def validate_removal_transfer_handoff(record: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise ValueError("拆撐承接構造交接檔格式不正確。")
    if record.get("schemaVersion") != SCHEMA_VERSION or record.get("kind") != KIND:
        raise ValueError("拆撐承接構造交接檔版本或種類不受支援。")
    if not re.fullmatch(r"CF-[0-9A-F]{16}", str(record.get("source", {}).get("calculationFingerprint", ""))):
        raise ValueError("拆撐承接構造交接檔缺少有效來源計算指紋。")
    fingerprint = str(record.get("handoffFingerprint", ""))
    if not re.fullmatch(r"ERH-[0-9A-F]{20}", fingerprint) or fingerprint != _handoff_fingerprint(record):
        raise ValueError("拆撐承接構造交接內容與交接指紋不一致。")
    transfers = record.get("transfers")
    if not isinstance(transfers, list) or not transfers:
        raise ValueError("拆撐承接構造交接檔沒有可驗證的交接列。")
    source_fingerprint = str(record["source"]["calculationFingerprint"])
    seen_ids: set[str] = set()
    for transfer in transfers:
        transfer_id = str(transfer.get("transferId", ""))
        unsigned = {key: value for key, value in transfer.items() if key != "transferId"}
        if transfer_id != _transfer_id(unsigned, source_fingerprint) or transfer_id in seen_ids:
            raise ValueError("拆撐承接構造交接列識別或內容不一致。")
        seen_ids.add(transfer_id)
        verification = transfer.get("verification", {})
        if verification.get("status") != "pending" or verification.get("required") is not True or verification.get("autoVerified") is not False:
            raise ValueError("未回簽的拆撐交接列必須維持待驗證，且不得自動標示完成。")
    boundary = record.get("boundary", {})
    if boundary.get("requiresReceiverVerification") is not True or boundary.get("autoApplied") is not False or boundary.get("autoVerified") is not False:
        raise ValueError("拆撐承接構造交接檔未保留接收端明確驗證邊界。")
    return deepcopy(record)


__all__ = [
    "SCHEMA_VERSION",
    "KIND",
    "RECEIPT_KIND",
    "build_removal_transfer_handoff",
    "validate_removal_transfer_handoff",
]
