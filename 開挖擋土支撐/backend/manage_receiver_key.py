from __future__ import annotations

import argparse
from getpass import getpass
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from .app.receiver_key_enrollment import build_receiver_key_enrollment


def _read_password(password_env: str | None) -> bytes:
    if password_env:
        password = os.environ.get(password_env)
        if password is None:
            raise ValueError(f"環境變數 {password_env} 尚未設定。")
    else:
        password = getpass("新私人金鑰密碼（至少 12 個字元）：")
        confirmation = getpass("再次輸入私人金鑰密碼：")
        if password != confirmation:
            raise ValueError("兩次輸入的私人金鑰密碼不一致。")
    if len(password) < 12:
        raise ValueError("私人金鑰密碼至少需要 12 個字元。")
    return password.encode("utf-8")


def create_receiver_key_package(
    output_directory: Path,
    organization: str,
    display_name: str,
    password: bytes,
    replaces_key_id: str | None = None,
) -> tuple[Path, Path, dict[str, object]]:
    private_key = Ed25519PrivateKey.generate()
    enrollment = build_receiver_key_enrollment(
        private_key,
        organization,
        display_name,
        replaces_key_id=replaces_key_id,
    )
    output_directory.mkdir(parents=True, exist_ok=True)
    key_id = str(enrollment["keyId"])
    private_path = output_directory / f"RVR-private-{key_id}.pem"
    enrollment_path = output_directory / f"RVR-public-enrollment-{key_id}.json"
    if private_path.exists() or enrollment_path.exists():
        raise ValueError("輸出目錄已有相同金鑰 ID 的檔案，為避免覆寫已停止。")
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.BestAvailableEncryption(password),
    )
    try:
        with private_path.open("xb") as stream:
            stream.write(private_pem)
        os.chmod(private_path, 0o600)
        with enrollment_path.open("x", encoding="utf-8", newline="\n") as stream:
            json.dump(enrollment, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
    except Exception:
        private_path.unlink(missing_ok=True)
        enrollment_path.unlink(missing_ok=True)
        raise
    return private_path, enrollment_path, enrollment


def main() -> int:
    parser = argparse.ArgumentParser(description="建立 RVR 組織 Ed25519 加密私鑰與公開登錄包。")
    subparsers = parser.add_subparsers(dest="command", required=True)
    create = subparsers.add_parser("create", help="建立全新或輪替用組織簽章金鑰")
    create.add_argument("--organization", required=True, help="公鑰所屬組織")
    create.add_argument("--display-name", required=True, help="金鑰名稱或用途")
    create.add_argument("--output-dir", required=True, type=Path, help="安全的本機輸出目錄")
    create.add_argument("--replaces-key-id", help="輪替時填入被取代的 RVK key ID")
    create.add_argument("--password-env", help="可選：提供新私鑰密碼的環境變數名稱")
    args = parser.parse_args()
    try:
        password = _read_password(args.password_env)
        private_path, enrollment_path, enrollment = create_receiver_key_package(
            args.output_dir,
            args.organization,
            args.display_name,
            password,
            args.replaces_key_id,
        )
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(f"加密私人金鑰已建立：{private_path}")
    print(f"公開登錄包已建立：{enrollment_path}")
    print(f"Key ID：{enrollment['keyId']}")
    print(f"登錄包指紋：{enrollment['packageFingerprint']}")
    print("請分開保管私人金鑰；只將公開登錄包交付來源端管理者。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
