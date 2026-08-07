from __future__ import annotations

import hashlib
import json

from backend.app.schemas import ConstructionStageLoadSource


def make_verified_handoff_source(load_t: float = 64.32) -> ConstructionStageLoadSource:
    record = {
        "schemaVersion": 1,
        "kind": "construction-stage-decking-load-handoff",
        "generatedAt": "2026-08-07T00:00:00.000Z",
        "source": {
            "toolId": "fugongban",
            "toolName": "覆工板系統計算工具",
            "toolVersion": "v1.0",
            "projectName": "測試施工構台",
            "projectNo": "STAGE-001",
            "calculationFingerprint": "CF-0123456789ABCDEF",
        },
        "load": {
            "target": "excavation-composite-column",
            "unit": "tf",
            "controlAxialLoadTf": load_t,
            "controllingCases": ["Pu1"],
            "cases": [
                {"key": "Pu1", "label": "PC400 固定支座位於柱上", "valueTf": load_t},
                {"key": "Pu2", "label": "吊車支座距柱 0.5 m", "valueTf": load_t * 0.8},
                {"key": "Pu3", "label": "吊車支座位於相鄰跨間", "valueTf": load_t * 0.6},
            ],
        },
        "boundary": {
            "requiresExplicitAcceptance": True,
            "autoApplied": False,
            "scope": "僅供開挖擋土支撐工具之共構柱施工構台軸力輸入；支承位置、偏心、施工階段與載重組合仍須依施工計畫確認。",
        },
    }
    canonical = json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    record["handoffFingerprint"] = "CSH-" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:20].upper()
    return ConstructionStageLoadSource(
        handoff_fingerprint=record["handoffFingerprint"],
        source_tool=record["source"]["toolName"],
        source_version=record["source"]["toolVersion"],
        source_calculation_fingerprint=record["source"]["calculationFingerprint"],
        source_project_name=record["source"]["projectName"],
        source_project_no=record["source"]["projectNo"],
        controlling_cases=list(record["load"]["controllingCases"]),
        handoff_record=record,
    )
