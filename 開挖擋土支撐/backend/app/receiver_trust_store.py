from __future__ import annotations

import base64
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .config import get_settings
from .receiver_key_enrollment import validate_receiver_key_enrollment
from .removal_transfer_handoff import receiver_identity_key_id


RECEIVER_KEY_REVOCATION_REASONS = {
    "suspected-compromise",
    "confirmed-compromise",
    "lost-key-or-password",
    "custodian-change",
    "organization-change",
    "superseded-after-rotation",
    "retired",
    "other",
}


def _canonical_json_bytes(value: dict[str, Any]) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _required_text(value: Any, label: str, maximum: int) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{label}不可空白。")
    if len(text) > maximum:
        raise ValueError(f"{label}不可超過 {maximum} 個字元。")
    return text


class ReceiverTrustStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or get_settings().receiver_trust_registry_path

    def list_keys(self) -> list[dict[str, Any]]:
        return [dict(item) for item in self._read_registry()["keys"]]

    def list_events(self) -> list[dict[str, Any]]:
        return [dict(item) for item in self._read_registry()["events"]]

    def snapshot(self) -> dict[str, list[dict[str, Any]]]:
        return deepcopy(self._read_registry())

    def _read_registry(self) -> dict[str, list[dict[str, Any]]]:
        if not self.path.exists():
            return {"keys": [], "events": []}
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError("本機回簽公鑰信任清冊無法讀取。") from exc
        if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
            raise ValueError("本機回簽公鑰信任清冊版本不受支援。")
        return self.validate_snapshot(payload.get("keys"), payload.get("events", []))

    @classmethod
    def validate_snapshot(cls, keys: Any, events: Any) -> dict[str, list[dict[str, Any]]]:
        if not isinstance(keys, list):
            raise ValueError("本機回簽公鑰信任清冊格式不正確。")
        if any(not isinstance(item, dict) for item in keys):
            raise ValueError("本機回簽公鑰信任清冊包含無效的金鑰記錄。")
        if not isinstance(events, list) or any(not isinstance(item, dict) for item in events):
            raise ValueError("本機回簽公鑰事件清冊格式不正確。")
        normalized_keys = deepcopy(keys)
        normalized_events = deepcopy(events)
        seen_key_ids: set[str] = set()
        for key in normalized_keys:
            key_id = _required_text(key.get("keyId"), "Key ID", 24)
            if key_id in seen_key_ids:
                raise ValueError("本機回簽公鑰信任清冊包含重複的 Key ID。")
            seen_key_ids.add(key_id)
            if key.get("algorithm") != "Ed25519":
                raise ValueError("本機回簽公鑰信任清冊包含非 Ed25519 金鑰。")
            raw = cls._parse_public_key(str(key.get("publicKeyBase64", "")))
            if receiver_identity_key_id(raw) != key_id:
                raise ValueError("本機回簽公鑰的 Key ID 與公開金鑰不一致。")
            _required_text(key.get("organization"), "公鑰所屬單位", 200)
            _required_text(key.get("displayName"), "金鑰名稱", 200)
            if key.get("status") not in {"trusted", "revoked"}:
                raise ValueError("本機回簽公鑰狀態不受支援。")
        cls._validate_event_chain(normalized_events)
        cls._validate_key_event_consistency(normalized_keys, normalized_events)
        return {"keys": normalized_keys, "events": normalized_events}

    def replace_snapshot(
        self,
        keys: Any,
        events: Any,
        *,
        restore_confirmed: bool = False,
    ) -> dict[str, Any]:
        if restore_confirmed is not True:
            raise ValueError("復原前必須明確確認以備份內容取代目前本機信任清冊。")
        validated = self.validate_snapshot(keys, events)
        safeguard_path: Path | None = None
        if self.path.exists():
            stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
            suffix = self.path.suffix or ".json"
            safeguard_path = self.path.with_name(f"{self.path.stem}.pre-restore-{stamp}{suffix}")
            try:
                safeguard_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(self.path, safeguard_path)
            except OSError as exc:
                raise ValueError("無法建立復原前的本機信任清冊保護副本。") from exc
        try:
            self._write(validated["keys"], validated["events"])
            restored = self._read_registry()
        except (OSError, ValueError) as exc:
            if safeguard_path is not None and safeguard_path.exists():
                shutil.copy2(safeguard_path, self.path)
            elif self.path.exists():
                self.path.unlink(missing_ok=True)
            raise ValueError("本機信任清冊復原失敗，已嘗試回復原始狀態。") from exc
        return {
            "keys": restored["keys"],
            "events": restored["events"],
            "safeguardPath": str(safeguard_path) if safeguard_path else None,
        }

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
        registry = self._read_registry()
        keys = registry["keys"]
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
        registry = self._read_registry()
        keys = registry["keys"]
        events = registry["events"]
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
        registration_method = record["registrationMethod"]
        self._append_event(
            events,
            key_id=key_id,
            event_type="key-registered",
            effective_at=now,
            actor="本機信任清冊管理者",
            reason_code="rotation-registration" if replaces_key_id else "new-registration",
            reason=(
                "RKE 持有證明與組織身分經獨立管道核對後登錄。"
                if registration_method == "enrollment-package"
                else "公鑰與組織身分經獨立管道核對後手動登錄。"
            ),
            incident_reference=enrollment_fingerprint or "",
        )
        self._write(keys, events)
        return dict(record)

    def revoke_key(
        self,
        key_id: str,
        *,
        reason_code: str,
        reason: str,
        handled_by: str,
        incident_reference: str = "",
        revocation_confirmed: bool = False,
    ) -> dict[str, Any]:
        if revocation_confirmed is not True:
            raise ValueError("撤銷前必須明確確認此動作不可復原，且既有 RVR／SEV 將不再視為受信任簽章。")
        reason_code = str(reason_code or "").strip()
        if reason_code not in RECEIVER_KEY_REVOCATION_REASONS:
            raise ValueError("撤銷原因分類不受支援。")
        reason = _required_text(reason, "撤銷原因說明", 500)
        handled_by = _required_text(handled_by, "處理者", 120)
        incident_reference = str(incident_reference or "").strip()
        if len(incident_reference) > 160:
            raise ValueError("事故或案件編號不可超過 160 個字元。")

        registry = self._read_registry()
        keys = registry["keys"]
        events = registry["events"]
        target = next((item for item in keys if item.get("keyId") == key_id), None)
        if target is None:
            raise KeyError(key_id)
        if target.get("status") == "revoked":
            raise ValueError("此公鑰已撤銷；既有撤銷原因與事件記錄不可覆寫。")
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        target["status"] = "revoked"
        target["revokedAt"] = now
        target["revocationReasonCode"] = reason_code
        target["revocationReason"] = reason
        target["revokedBy"] = handled_by
        target["revocationReference"] = incident_reference or None
        event = self._append_event(
            events,
            key_id=key_id,
            event_type="key-revoked",
            effective_at=now,
            actor=handled_by,
            reason_code=reason_code,
            reason=reason,
            incident_reference=incident_reference,
        )
        target["revocationEventFingerprint"] = event["eventFingerprint"]
        self._write(keys, events)
        return dict(target)

    @staticmethod
    def _event_fingerprint(event: dict[str, Any]) -> str:
        payload = {key: value for key, value in event.items() if key != "eventFingerprint"}
        return "RVE-" + hashlib.sha256(_canonical_json_bytes(payload)).hexdigest()[:20].upper()

    @classmethod
    def _validate_event_chain(cls, events: list[dict[str, Any]]) -> None:
        previous: str | None = None
        seen_fingerprints: set[str] = set()
        for event in events:
            if event.get("schemaVersion") != 1 or event.get("kind") != "receiver-verification-key-event":
                raise ValueError("本機回簽公鑰事件清冊版本不受支援。")
            if event.get("eventType") not in {"key-registered", "key-revoked"}:
                raise ValueError("本機回簽公鑰事件類型不受支援。")
            if event.get("previousEventFingerprint") != previous:
                raise ValueError("本機回簽公鑰事件清冊的串接順序不一致。")
            expected = cls._event_fingerprint(event)
            if event.get("eventFingerprint") != expected:
                raise ValueError("本機回簽公鑰事件清冊指紋驗證失敗。")
            if expected in seen_fingerprints:
                raise ValueError("本機回簽公鑰事件清冊包含重複指紋。")
            seen_fingerprints.add(expected)
            previous = expected

    @staticmethod
    def _validate_key_event_consistency(
        keys: list[dict[str, Any]],
        events: list[dict[str, Any]],
    ) -> None:
        keys_by_id = {item.get("keyId"): item for item in keys}
        events_by_fingerprint = {item.get("eventFingerprint"): item for item in events}
        for event in events:
            target = keys_by_id.get(event.get("keyId"))
            if target is None:
                raise ValueError("本機回簽公鑰事件清冊指向不存在的 Key ID。")
            if event.get("eventType") != "key-revoked":
                continue
            if target.get("status") != "revoked":
                raise ValueError("本機回簽公鑰狀態與撤銷事件不一致。")
            if target.get("revocationEventFingerprint") != event.get("eventFingerprint"):
                raise ValueError("本機回簽公鑰的撤銷事件指紋不一致。")
            expected_fields = {
                "revokedAt": event.get("effectiveAt"),
                "revocationReasonCode": event.get("reasonCode"),
                "revocationReason": event.get("reason"),
                "revokedBy": event.get("actor"),
                "revocationReference": event.get("incidentReference"),
            }
            if any(target.get(field) != value for field, value in expected_fields.items()):
                raise ValueError("本機回簽公鑰的撤銷資料與事件清冊不一致。")
        for key in keys:
            fingerprint = key.get("revocationEventFingerprint")
            if fingerprint and fingerprint not in events_by_fingerprint:
                raise ValueError("本機回簽公鑰引用的撤銷事件不存在。")

    def _append_event(
        self,
        events: list[dict[str, Any]],
        *,
        key_id: str,
        event_type: str,
        effective_at: str,
        actor: str,
        reason_code: str,
        reason: str,
        incident_reference: str,
    ) -> dict[str, Any]:
        event = {
            "schemaVersion": 1,
            "kind": "receiver-verification-key-event",
            "eventType": event_type,
            "keyId": key_id,
            "effectiveAt": effective_at,
            "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "actor": actor,
            "reasonCode": reason_code,
            "reason": reason,
            "incidentReference": incident_reference or None,
            "previousEventFingerprint": events[-1]["eventFingerprint"] if events else None,
        }
        event["eventFingerprint"] = self._event_fingerprint(event)
        events.append(event)
        return event

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

    def _write(self, keys: list[dict[str, Any]], events: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "schemaVersion": 1,
            "kind": "receiver-verification-trust-registry",
            "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "keys": keys,
            "events": events,
        }
        temporary = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)


__all__ = ["RECEIVER_KEY_REVOCATION_REASONS", "ReceiverTrustStore"]
