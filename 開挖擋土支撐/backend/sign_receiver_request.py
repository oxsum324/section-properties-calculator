from __future__ import annotations

import argparse
import base64
from getpass import getpass
import json
import os
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from .app.receiver_governance_checkpoint import (
    CHECKPOINT_SIGNATURE_RESPONSE_KIND,
    CHECKPOINT_SIGNING_REQUEST_KIND,
    build_receiver_governance_signed_checkpoint,
    validate_receiver_governance_checkpoint_signing_request,
)
from .app.removal_transfer_handoff import (
    IDENTITY_SIGNING_REQUEST_KIND,
    IDENTITY_SIGNATURE_RESPONSE_KIND,
    SOURCE_EVIDENCE_SIGNATURE_RESPONSE_KIND,
    SOURCE_EVIDENCE_SIGNING_REQUEST_KIND,
    receiver_identity_key_id,
    validate_receiver_identity_signing_request,
    validate_source_evidence_identity_signing_request,
)


def build_signature_response(
    signing_request: dict[str, Any],
    private_key: Ed25519PrivateKey,
) -> dict[str, Any]:
    request_kind = signing_request.get("kind")
    if request_kind == CHECKPOINT_SIGNING_REQUEST_KIND:
        request = validate_receiver_governance_checkpoint_signing_request(signing_request)
        response_kind = CHECKPOINT_SIGNATURE_RESPONSE_KIND
    elif request_kind == SOURCE_EVIDENCE_SIGNING_REQUEST_KIND:
        request = validate_source_evidence_identity_signing_request(signing_request)
        response_kind = SOURCE_EVIDENCE_SIGNATURE_RESPONSE_KIND
    elif request_kind == IDENTITY_SIGNING_REQUEST_KIND:
        request = validate_receiver_identity_signing_request(signing_request)
        response_kind = IDENTITY_SIGNATURE_RESPONSE_KIND
    else:
        raise ValueError("簽署請求種類不受支援；只接受 RVR、SEV 或治理健康檢核點請求。")
    payload = base64.b64decode(request["payloadBase64"], validate=True)
    public_key = private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    signature = private_key.sign(payload)
    response = {
        "schemaVersion": 1,
        "kind": response_kind,
        "signingRequest": request,
        "signature": {
            "algorithm": "Ed25519",
            "keyId": receiver_identity_key_id(public_key),
            "publicKeyBase64": base64.b64encode(public_key).decode("ascii"),
            "signatureBase64": base64.b64encode(signature).decode("ascii"),
        },
    }
    if request_kind == CHECKPOINT_SIGNING_REQUEST_KIND:
        return build_receiver_governance_signed_checkpoint(request, response["signature"])
    return response


def load_private_key(path: Path, password_env: str | None = None) -> Ed25519PrivateKey:
    data = path.read_bytes()
    password = os.environ.get(password_env, "").encode("utf-8") if password_env else None
    try:
        key = serialization.load_pem_private_key(data, password=password or None)
    except TypeError:
        if password_env:
            raise ValueError(f"環境變數 {password_env} 未提供正確的私鑰密碼。") from None
        password_text = getpass("私人金鑰密碼：")
        key = serialization.load_pem_private_key(data, password=password_text.encode("utf-8"))
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("指定的私人金鑰不是 Ed25519 PEM。")
    return key


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file() or path.stat().st_size > 1_000_000:
        raise ValueError("簽署請求必須是 1 MB 以下的 JSON 檔案。")
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("簽署請求不是有效的 UTF-8 JSON。") from exc
    if not isinstance(value, dict):
        raise ValueError("簽署請求最外層必須是 JSON 物件。")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description="離線簽署 RVR、SEV 或治理健康檢核點請求；不會修改或保存私人金鑰。")
    parser.add_argument("--request", required=True, type=Path, help="網頁匯出的 RSR／SSR／GCR 簽署請求 JSON")
    parser.add_argument("--private-key", required=True, type=Path, help="既有 Ed25519 PEM 私人金鑰")
    parser.add_argument("--output", type=Path, help="簽章回應 JSON；預設輸出在請求檔旁")
    parser.add_argument("--password-env", help="可選：存放加密私鑰密碼的環境變數名稱")
    args = parser.parse_args()
    try:
        request = _read_json(args.request)
        key = load_private_key(args.private_key, args.password_env)
        response = build_signature_response(request, key)
        if request.get("kind") == CHECKPOINT_SIGNING_REQUEST_KIND:
            response_label = "治理健康簽章檢核點"
        elif request.get("kind") == SOURCE_EVIDENCE_SIGNING_REQUEST_KIND:
            response_label = "SEV-身分簽章回應"
        else:
            response_label = "RVR-身分簽章回應"
        output = args.output or args.request.with_name(
            f"{response_label}-{request.get('requestFingerprint', 'unknown')}.json"
        )
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(response, ensure_ascii=False, indent=2), encoding="utf-8")
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(f"簽章回應已建立：{output}")
    print(f"請求指紋：{request['requestFingerprint']}")
    print(f"公鑰識別：{response['signature']['keyId']}")
    if request.get("kind") == CHECKPOINT_SIGNING_REQUEST_KIND:
        print(f"治理歷程：{request['observationCount']} 筆；鏈首 {request['headFingerprint'] or '—'}")
        print("邊界：本檔具數位簽章，但不具外部時間戳；請另存於組織控制之外部紀錄位置。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
