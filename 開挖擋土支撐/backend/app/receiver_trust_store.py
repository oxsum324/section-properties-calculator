from __future__ import annotations

import base64
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .config import get_settings
from .receiver_key_enrollment import validate_receiver_key_enrollment
from .removal_transfer_handoff import receiver_identity_key_id


class ReceiverTrustStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or get_settings().receiver_trust_registry_path

    def list_keys(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError("本機回簽公鑰信任清冊無法讀取。") from exc
        if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
            raise ValueError("本機回簽公鑰信任清冊版本不受支援。")
        keys = payload.get("keys")
        if not isinstance(keys, list):
            raise ValueError("本機回簽公鑰信任清冊格式不正確。")
        return [dict(item) for item in keys if isinstance(item, dict)]

    def register_key(
        self,
        organization: str,
        display_name: str,
        public_key: str,
        independent_verification_confirmed: bool = False,
    ) -> dict[str, Any]:
        if independent_verification_confirmed is not True:
            raise ValueError("登錄信任公鑰前，必須明確確認已透過獨立管道核對單位與 Key ID。")
        return self._register_key(organization, display_name, public_key)

    def register_enrollment(
        self,
        enrollment: dict[str, Any],
        independent_verification_confirmed: bool = False,
    ) -> dict[str, Any]:
        if independent_verification_confirmed is not True:
            raise ValueError("登錄 RKE 公鑰包前，必須明確確認已透過獨立管道核對單位與 Key ID。")
        validated = validate_receiver_key_enrollment(enrollment)
        keys = self.list_keys()
        replacement = validated.get("replacesKeyId")
        if replacement:
            previous = next((item for item in keys if item.get("keyId") == replacement), None)
            if previous is None:
                raise ValueError("RKE 宣告的被取代金鑰尚未存在於本機信任清冊。")
            if str(previous.get("organization", "")).strip() != validated["organization"]:
                raise ValueError("RKE 新舊金鑰的登錄單位不一致。")
        return self._register_key(
            validated["organization"],
            validated["displayName"],
            validated["publicKeyBase64"],
            enrollment_fingerprint=validated["packageFingerprint"],
            replaces_key_id=replacement,
            proof_of_possession_verified=True,
        )

    def _register_key(
        self,
        organization: str,
        display_name: str,
        public_key: str,
        *,
        enrollment_fingerprint: str | None = None,
        replaces_key_id: str | None = None,
        proof_of_possession_verified: bool = False,
    ) -> dict[str, Any]:
        organization = organization.strip()
        display_name = display_name.strip()
        if not organization or not display_name:
            raise ValueError("登錄受信任公鑰時，必須填寫單位與金鑰名稱。")
        raw = self._parse_public_key(public_key)
        key_id = receiver_identity_key_id(raw)
        keys = self.list_keys()
        if any(item.get("keyId") == key_id for item in keys):
            raise ValueError("此 Ed25519 公鑰已存在於本機信任清冊。")
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        record = {
            "keyId": key_id,
            "algorithm": "Ed25519",
            "organization": organization,
            "displayName": display_name,
            "publicKeyBase64": base64.b64encode(raw).decode("ascii"),
            "status": "trusted",
            "registeredAt": now,
            "revokedAt": None,
            "registrationMethod": "enrollment-package" if enrollment_fingerprint else "manual",
            "enrollmentFingerprint": enrollment_fingerprint,
            "replacesKeyId": replaces_key_id,
            "proofOfPossessionVerified": proof_of_possession_verified,
            "independentVerificationConfirmedAt": now,
        }
        keys.append(record)
        self._write(keys)
        return dict(record)

    def revoke_key(self, key_id: str) -> dict[str, Any]:
        keys = self.list_keys()
        target = next((item for item in keys if item.get("keyId") == key_id), None)
        if target is None:
            raise KeyError(key_id)
        if target.get("status") != "revoked":
            target["status"] = "revoked"
            target["revokedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            self._write(keys)
        return dict(target)

    @staticmethod
    def _parse_public_key(value: str) -> bytes:
        text = value.strip()
        if not text:
            raise ValueError("Ed25519 公鑰不可空白。")
        try:
            if "BEGIN PUBLIC KEY" in text:
                key = serialization.load_pem_public_key(text.encode("ascii"))
                if not isinstance(key, Ed25519PublicKey):
                    raise ValueError("公鑰不是 Ed25519 格式。")
                return key.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
            raw = base64.b64decode(text, validate=True)
            Ed25519PublicKey.from_public_bytes(raw)
            return raw
        except (ValueError, TypeError, UnicodeEncodeError) as exc:
            raise ValueError("公鑰必須是 Ed25519 SubjectPublicKeyInfo PEM 或 32-byte raw Base64。") from exc

    def _write(self, keys: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "schemaVersion": 1,
            "kind": "receiver-verification-trust-registry",
            "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "keys": keys,
        }
        temporary = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)


__all__ = ["ReceiverTrustStore"]
