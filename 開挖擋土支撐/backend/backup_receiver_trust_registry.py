from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .app.config import get_settings
from .app.receiver_trust_recovery import (
    evaluate_receiver_trust_backup_directory,
    perform_receiver_trust_registry_recovery_drill,
    record_receiver_trust_backup_health_transition,
    validate_receiver_trust_registry_backup_file,
    write_receiver_trust_registry_backup,
)
from .app.receiver_trust_store import ReceiverTrustStore


def _print_result(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def _sanitized_health_history_result(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": payload["status"],
        "transitionCount": payload["transitionCount"],
        "dashboardItemCount": payload["dashboardItemCount"],
        "transition": payload["transition"],
    }


def main() -> int:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="備份、驗證並非破壞性演練 RVR 本機信任清冊。")
    parser.add_argument(
        "--registry",
        type=Path,
        default=settings.receiver_trust_registry_path,
        help="正式 RVR 信任清冊路徑；預設使用本工具設定值",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    backup_parser = subparsers.add_parser("backup", help="建立並回讀驗證公開信任清冊備份")
    backup_parser.add_argument("--output-dir", required=True, type=Path)

    verify_parser = subparsers.add_parser("verify", help="只讀驗證既有備份")
    verify_parser.add_argument("--backup", required=True, type=Path)
    verify_parser.add_argument("--max-age-days", type=int)

    drill_parser = subparsers.add_parser("drill", help="在隔離暫存清冊執行復原演練並產生 RDR 收據")
    drill_parser.add_argument("--backup", required=True, type=Path)
    drill_parser.add_argument("--receipt-dir", required=True, type=Path)
    drill_parser.add_argument("--max-age-days", type=int)

    cycle_parser = subparsers.add_parser("cycle", help="建立新備份後立即完成隔離復原演練")
    cycle_parser.add_argument("--output-dir", required=True, type=Path)
    cycle_parser.add_argument("--receipt-dir", type=Path)
    cycle_parser.add_argument("--max-age-days", type=int, default=30)

    health_parser = subparsers.add_parser("health", help="驗證最新備份與復原演練收據是否完整且仍在期限內")
    health_parser.add_argument("--backup-dir", required=True, type=Path)
    health_parser.add_argument("--max-age-days", type=int, default=8)

    history_parser = subparsers.add_parser("history", help="僅在健康狀態或問題代碼改變時新增去識別轉換紀錄")
    history_parser.add_argument("--current-status", required=True, type=Path)
    history_parser.add_argument("--history-dir", required=True, type=Path)
    history_parser.add_argument("--dashboard-history", required=True, type=Path)
    history_parser.add_argument("--max-items", type=int, default=24)

    args = parser.parse_args()
    try:
        store = ReceiverTrustStore(args.registry)
        if args.command == "backup":
            backup_path, backup = write_receiver_trust_registry_backup(store, args.output_dir)
            _print_result({
                "status": "backup-created-and-verified",
                "backupPath": str(backup_path),
                "backupFingerprint": backup["backupFingerprint"],
                "registryFingerprint": backup["registry"]["registryFingerprint"],
            })
        elif args.command == "verify":
            result = validate_receiver_trust_registry_backup_file(
                args.backup,
                max_age_days=args.max_age_days,
            )
            _print_result({
                "status": "backup-valid",
                "backupPath": str(args.backup),
                "backupFingerprint": result["backup"]["backupFingerprint"],
                "registryFingerprint": result["backup"]["registry"]["registryFingerprint"],
                "fileSha256": result["fileSha256"],
                "ageSeconds": result["ageSeconds"],
            })
        elif args.command == "drill":
            receipt_path, receipt = perform_receiver_trust_registry_recovery_drill(
                args.backup,
                args.receipt_dir,
                production_registry_path=args.registry,
                max_age_days=args.max_age_days,
            )
            _print_result({
                "status": "recovery-drill-passed",
                "receiptPath": str(receipt_path),
                "receiptFingerprint": receipt["receiptFingerprint"],
                "registryFingerprint": receipt["registryFingerprint"],
                "productionRegistryUnchanged": receipt["productionRegistryUnchanged"],
            })
        elif args.command == "cycle":
            receipt_directory = args.receipt_dir or args.output_dir
            backup_path, backup = write_receiver_trust_registry_backup(store, args.output_dir)
            receipt_path, receipt = perform_receiver_trust_registry_recovery_drill(
                backup_path,
                receipt_directory,
                production_registry_path=args.registry,
                max_age_days=args.max_age_days,
            )
            _print_result({
                "status": "backup-cycle-passed",
                "backupPath": str(backup_path),
                "receiptPath": str(receipt_path),
                "backupFingerprint": backup["backupFingerprint"],
                "registryFingerprint": backup["registry"]["registryFingerprint"],
                "receiptFingerprint": receipt["receiptFingerprint"],
                "productionRegistryUnchanged": receipt["productionRegistryUnchanged"],
            })
        elif args.command == "health":
            _print_result(evaluate_receiver_trust_backup_directory(
                args.backup_dir,
                max_age_days=args.max_age_days,
            ))
        else:
            try:
                current_status = json.loads(args.current_status.read_text(encoding="utf-8-sig"))
            except (OSError, json.JSONDecodeError) as exc:
                raise ValueError("無法讀取目前的備份健康摘要 JSON。") from exc
            result = record_receiver_trust_backup_health_transition(
                current_status,
                args.history_dir,
                args.dashboard_history,
                max_items=args.max_items,
            )
            _print_result(_sanitized_health_history_result(result))
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
