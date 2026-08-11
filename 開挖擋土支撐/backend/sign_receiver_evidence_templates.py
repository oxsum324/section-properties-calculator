from __future__ import annotations

import argparse
import json
from pathlib import Path

from .app.receiver_evidence_template_package import build_receiver_evidence_template_publisher_package
from .sign_receiver_request import load_private_key


MAX_INPUT_BYTES = 1_000_000


def _read_library(path: Path) -> dict:
    if not path.is_file() or path.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError("補充證據範本庫必須是 1 MB 以下的 JSON 檔案。")
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("補充證據範本庫不是有效的 UTF-8 JSON。") from exc
    if not isinstance(value, dict):
        raise ValueError("補充證據範本庫最外層必須是 JSON 物件。")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(
        description="使用既有組織 Ed25519 私鑰離線簽署補充證據範本庫；私人金鑰不會離開本機。"
    )
    parser.add_argument("--library", required=True, type=Path, help="網頁匯出的補充證據範本庫 JSON")
    parser.add_argument("--private-key", required=True, type=Path, help="既有 Ed25519 PEM 私人金鑰")
    parser.add_argument("--organization", required=True, help="RKE 信任清冊所登錄的發布單位")
    parser.add_argument("--display-name", required=True, help="發布金鑰名稱或本次發布用途")
    parser.add_argument("--output", type=Path, help="組織簽章封包 JSON；預設輸出在範本庫旁")
    parser.add_argument("--password-env", help="可選：存放加密私鑰密碼的環境變數名稱")
    args = parser.parse_args()
    try:
        library = _read_library(args.library)
        private_key = load_private_key(args.private_key, args.password_env)
        package = build_receiver_evidence_template_publisher_package(
            library,
            private_key,
            args.organization,
            args.display_name,
        )
        output = args.output or args.library.with_name(
            f"組織簽章補充證據範本包-{package['packageFingerprint']}.json"
        )
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(f"組織簽章範本封包已建立：{output}")
    print(f"範本庫指紋：{package['libraryFingerprint']}")
    print(f"封包指紋：{package['packageFingerprint']}")
    print(f"發布金鑰：{package['publisherSignature']['keyId']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
