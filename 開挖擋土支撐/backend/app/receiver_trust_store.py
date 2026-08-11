from __future__ import annotations

import base64
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from functools import wraps
import hashlib
import json
from pathlib import Path
import shutil
from threading import RLock
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

ROTATION_APPROVAL_WINDOW_HOURS = 72


def _canonical_json_bytes(value: dict[str, Any]) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _required_text(value: Any, label: str, maximum: int) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{label}不可空白。")
    if len(text) > maximum:
        raise ValueError(f"{label}不可超過 {maximum} 個字元。")
    return text


def _synchronized(method: Any) -> Any:
    @wraps(method)
    def wrapped(self: "ReceiverTrustStore", *args: Any, **kwargs: Any) -> Any:
        with self._lock:
            return method(self, *args, **kwargs)

    return wrapped


class ReceiverTrustStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or get_settings().receiver_trust_registry_path
        self._lock = RLock()

    def list_keys(self) -> list[dict[str, Any]]:
        return [dict(item) for item in self._read_registry()["keys"]]

    def list_events(self) -> list[dict[str, Any]]:
        return [dict(item) for item in self._read_registry()["events"]]

    def list_rotation_requests(self) -> list[dict[str, Any]]:
        registry = self._read_registry()
        return self._rotation_request_summaries(registry["keys"], registry["events"])

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
        keys_by_id = {item["keyId"]: item for item in normalized_keys}
        for key in normalized_keys:
            replacement = key.get("replacesKeyId")
            if replacement is not None:
                previous = keys_by_id.get(replacement)
                if previous is None or replacement == key["keyId"]:
                    raise ValueError("本機回簽公鑰輪替關聯指向無效的舊 Key ID。")
                if previous.get("organization") != key.get("organization"):
                    raise ValueError("本機回簽公鑰輪替關聯的新舊單位不一致。")
            completed_at = key.get("rotationCompletedAt")
            completion_event = key.get("rotationCompletionEventFingerprint")
            approval_request = key.get("rotationApprovalRequestFingerprint")
            if (completed_at is None) != (completion_event is None):
                raise ValueError("本機回簽公鑰的輪替完成資料不完整。")
            if approval_request is not None and completed_at is None:
                raise ValueError("本機回簽公鑰不得在輪替完成前保存覆核申請指紋。")
            if completed_at is not None:
                if replacement is None:
                    raise ValueError("本機回簽公鑰缺少輪替舊 Key ID，不得標記為輪替完成。")
                _required_text(completed_at, "輪替完成時間", 64)
                _required_text(completion_event, "輪替完成事件指紋", 24)
                if approval_request is not None:
                    _required_text(approval_request, "輪替覆核申請指紋", 24)
        for key in normalized_keys:
            replacement_key_id = key.get("replacedByKeyId")
            if replacement_key_id is None:
                continue
            replacement_key = keys_by_id.get(replacement_key_id)
            if replacement_key is None or replacement_key.get("replacesKeyId") != key["keyId"]:
                raise ValueError("本機回簽公鑰的輪替雙向關聯不一致。")
            if key.get("status") != "revoked" or key.get("revocationReasonCode") != "superseded-after-rotation":
                raise ValueError("舊金鑰尚未以輪替完成原因撤銷，不得標記為已被取代。")
            if replacement_key.get("rotationCompletionEventFingerprint") != key.get("revocationEventFingerprint"):
                raise ValueError("本機回簽公鑰的輪替完成事件指紋不一致。")
        cls._validate_event_chain(normalized_events)
        cls._validate_key_event_consistency(normalized_keys, normalized_events)
        return {"keys": normalized_keys, "events": normalized_events}

    @_synchronized
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

    @_synchronized
    def register_key(
        self,
        organization: str,
        display_name: str,
        public_key: str,
        independent_verification_confirmed: bool = False,
        *,
        registered_by: str | None = None,
        registered_by_operator_id: str | None = None,
    ) -> dict[str, Any]:
        if independent_verification_confirmed is not True:
            raise ValueError("登錄信任公鑰前，必須明確確認已透過獨立管道核對單位與 Key ID。")
        return self._register_key(
            organization,
            display_name,
            public_key,
            registered_by=registered_by,
            registered_by_operator_id=registered_by_operator_id,
        )

    @_synchronized
    def register_enrollment(
        self,
        enrollment: dict[str, Any],
        independent_verification_confirmed: bool = False,
        *,
        registered_by: str | None = None,
        registered_by_operator_id: str | None = None,
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
            if previous.get("status") != "trusted":
                raise ValueError("RKE 宣告的被取代金鑰已非受信任狀態，不得再建立輪替關聯。")
            active_replacement = next(
                (
                    item for item in keys
                    if item.get("replacesKeyId") == replacement and item.get("status") == "trusted"
                ),
                None,
            )
            if active_replacement is not None:
                raise ValueError(
                    f"被取代金鑰已有待完成輪替的新金鑰 {active_replacement.get('keyId')}。"
                )
        return self._register_key(
            validated["organization"],
            validated["displayName"],
            validated["publicKeyBase64"],
            enrollment_fingerprint=validated["packageFingerprint"],
            replaces_key_id=replacement,
            proof_of_possession_verified=True,
            registered_by=registered_by,
            registered_by_operator_id=registered_by_operator_id,
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
        registered_by: str | None = None,
        registered_by_operator_id: str | None = None,
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
            actor=registered_by or "本機信任清冊管理者",
            actor_role="接收端金鑰管理員" if registered_by_operator_id else None,
            actor_id=registered_by_operator_id,
            authentication_method="local-password-session" if registered_by_operator_id else None,
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

    @_synchronized
    def revoke_key(
        self,
        key_id: str,
        *,
        reason_code: str,
        reason: str,
        handled_by: str,
        handled_by_operator_id: str | None = None,
        incident_reference: str = "",
        revocation_confirmed: bool = False,
    ) -> dict[str, Any]:
        if revocation_confirmed is not True:
            raise ValueError("撤銷前必須明確確認此動作不可復原，且既有 RVR／SEV 將不再視為受信任簽章。")
        reason_code = str(reason_code or "").strip()
        if reason_code not in RECEIVER_KEY_REVOCATION_REASONS:
            raise ValueError("撤銷原因分類不受支援。")
        if reason_code == "superseded-after-rotation":
            raise ValueError("輪替完成必須由專用流程指定新金鑰，不得以一般撤銷取代。")
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
            actor_id=handled_by_operator_id,
            authentication_method="local-password-session" if handled_by_operator_id else None,
            reason_code=reason_code,
            reason=reason,
            incident_reference=incident_reference,
        )
        target["revocationEventFingerprint"] = event["eventFingerprint"]
        self._write(keys, events)
        return dict(target)

    @_synchronized
    def request_rotation_completion(
        self,
        new_key_id: str,
        *,
        reason: str,
        requested_by: str,
        requester_role: str,
        requested_by_operator_id: str | None = None,
        incident_reference: str,
        request_confirmed: bool = False,
    ) -> dict[str, Any]:
        if request_confirmed is not True:
            raise ValueError("提出輪替完成申請前，必須明確確認新金鑰已完成測試簽署與使用端切換。")
        reason = _required_text(reason, "輪替完成與切換摘要", 500)
        requested_by = _required_text(requested_by, "輪替申請人", 120)
        requester_role = _required_text(requester_role, "申請人職責", 120)
        incident_reference = _required_text(incident_reference, "輪替案件或變更編號", 160)

        registry = self._read_registry()
        keys = registry["keys"]
        events = registry["events"]
        new_key, old_key = self._linked_trusted_rotation_keys(keys, new_key_id)
        active_request = next(
            (
                item for item in self._rotation_request_summaries(keys, events)
                if item["newKeyId"] == new_key_id and item["status"] == "pending"
            ),
            None,
        )
        if active_request is not None:
            raise ValueError(f"此新金鑰已有待覆核申請 {active_request['requestFingerprint']}。")

        now_dt = datetime.now(timezone.utc)
        now = now_dt.isoformat().replace("+00:00", "Z")
        request_event = self._append_event(
            events,
            key_id=new_key_id,
            event_type="rotation-completion-requested",
            effective_at=now,
            actor=requested_by,
            actor_role=requester_role,
            actor_id=requested_by_operator_id,
            authentication_method="local-password-session" if requested_by_operator_id else None,
            reason_code="rotation-completion-request",
            reason=reason,
            incident_reference=incident_reference,
            related_key_id=old_key["keyId"],
            expires_at=(now_dt + timedelta(hours=ROTATION_APPROVAL_WINDOW_HOURS)).isoformat().replace("+00:00", "Z"),
        )
        self._write(keys, events)
        return self._rotation_request_summary(request_event, keys, events)

    @_synchronized
    def approve_rotation_completion(
        self,
        request_fingerprint: str,
        *,
        approved_by: str,
        approver_role: str,
        approved_by_operator_id: str | None = None,
        approval_confirmed: bool = False,
    ) -> dict[str, Any]:
        if approval_confirmed is not True:
            raise ValueError("第二人覆核前必須明確確認申請內容、切換證據與不可復原撤銷結果。")
        approved_by = _required_text(approved_by, "輪替覆核人", 120)
        approver_role = _required_text(approver_role, "覆核人職責", 120)
        request_fingerprint = _required_text(request_fingerprint, "輪替覆核申請指紋", 24)

        registry = self._read_registry()
        keys = registry["keys"]
        events = registry["events"]
        request_event = next(
            (
                item for item in events
                if item.get("eventFingerprint") == request_fingerprint
                and item.get("eventType") == "rotation-completion-requested"
            ),
            None,
        )
        if request_event is None:
            raise KeyError(request_fingerprint)
        summary = self._rotation_request_summary(request_event, keys, events)
        if summary["status"] == "completed":
            raise ValueError("此輪替完成申請已覆核執行，不得重複使用。")
        if summary["status"] == "expired":
            raise ValueError("此輪替完成申請已逾 72 小時有效期限，請重新提出申請。")
        if summary["status"] != "pending":
            raise ValueError("輪替新舊金鑰狀態已變更，此申請不得執行。")
        requester_operator_id = str(request_event.get("actorId") or "").strip()
        if requester_operator_id and not approved_by_operator_id:
            raise ValueError("此輪替申請須由已登入且具覆核角色的帳號完成。")
        if requester_operator_id and requester_operator_id == approved_by_operator_id:
            raise ValueError("輪替覆核帳號必須與申請帳號不同。")
        if not requester_operator_id and approved_by.casefold() == str(request_event.get("actor", "")).strip().casefold():
            raise ValueError("輪替覆核人必須與申請人不同。")

        new_key, old_key = self._linked_trusted_rotation_keys(keys, str(request_event.get("keyId", "")))
        if old_key["keyId"] != request_event.get("relatedKeyId"):
            raise ValueError("輪替申請指向的舊金鑰已與目前 RKE 關聯不一致。")

        reason = _required_text(request_event.get("reason"), "輪替完成與切換摘要", 500)
        incident_reference = _required_text(request_event.get("incidentReference"), "輪替案件或變更編號", 160)
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        old_key["status"] = "revoked"
        old_key["revokedAt"] = now
        old_key["revocationReasonCode"] = "superseded-after-rotation"
        old_key["revocationReason"] = reason
        old_key["revokedBy"] = approved_by
        old_key["revocationReference"] = incident_reference
        old_key["replacedByKeyId"] = new_key["keyId"]
        event = self._append_event(
            events,
            key_id=old_key["keyId"],
            event_type="key-revoked",
            effective_at=now,
            actor=approved_by,
            actor_role=approver_role,
            actor_id=approved_by_operator_id,
            authentication_method="local-password-session" if approved_by_operator_id else None,
            reason_code="superseded-after-rotation",
            reason=reason,
            incident_reference=incident_reference,
            related_key_id=new_key["keyId"],
            approval_request_fingerprint=request_fingerprint,
        )
        old_key["revocationEventFingerprint"] = event["eventFingerprint"]
        new_key["rotationCompletedAt"] = now
        new_key["rotationCompletionEventFingerprint"] = event["eventFingerprint"]
        new_key["rotationApprovalRequestFingerprint"] = request_fingerprint
        self._write(keys, events)
        return {
            "newKey": dict(new_key),
            "revokedKey": dict(old_key),
            "event": dict(event),
            "request": self._rotation_request_summary(request_event, keys, events),
        }

    def complete_rotation(self, *_args: Any, **_kwargs: Any) -> dict[str, Any]:
        raise ValueError("輪替完成已改為兩階段流程；請先提出申請，再由不同人員覆核。")

    @staticmethod
    def _linked_trusted_rotation_keys(
        keys: list[dict[str, Any]],
        new_key_id: str,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        new_key = next((item for item in keys if item.get("keyId") == new_key_id), None)
        if new_key is None:
            raise KeyError(new_key_id)
        old_key_id = str(new_key.get("replacesKeyId") or "").strip()
        if not old_key_id:
            raise ValueError("指定的新金鑰並非輪替 RKE，缺少 replacesKeyId。")
        old_key = next((item for item in keys if item.get("keyId") == old_key_id), None)
        if old_key is None:
            raise ValueError("輪替關聯的舊金鑰不存在於本機信任清冊。")
        if new_key.get("status") != "trusted":
            raise ValueError("新金鑰已非受信任狀態，不得用於完成輪替。")
        if old_key.get("status") != "trusted":
            raise ValueError("舊金鑰已撤銷，不得重複完成輪替或覆寫原撤銷紀錄。")
        if str(old_key.get("organization", "")).strip() != str(new_key.get("organization", "")).strip():
            raise ValueError("輪替新舊金鑰的登錄單位不一致。")
        return new_key, old_key

    @staticmethod
    def _parse_event_time(value: Any, label: str) -> datetime:
        text = _required_text(value, label, 64)
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"{label}格式不正確。") from exc
        if parsed.tzinfo is None:
            raise ValueError(f"{label}必須包含時區。")
        return parsed.astimezone(timezone.utc)

    @classmethod
    def _rotation_request_summary(
        cls,
        request_event: dict[str, Any],
        keys: list[dict[str, Any]],
        events: list[dict[str, Any]],
    ) -> dict[str, Any]:
        request_fingerprint = str(request_event.get("eventFingerprint", ""))
        completion = next(
            (item for item in events if item.get("approvalRequestFingerprint") == request_fingerprint),
            None,
        )
        keys_by_id = {item.get("keyId"): item for item in keys}
        new_key = keys_by_id.get(request_event.get("keyId"))
        old_key = keys_by_id.get(request_event.get("relatedKeyId"))
        expires_at = cls._parse_event_time(request_event.get("expiresAt"), "輪替覆核申請期限")
        if completion is not None:
            status = "completed"
        elif datetime.now(timezone.utc) > expires_at:
            status = "expired"
        elif (
            new_key is None
            or old_key is None
            or new_key.get("replacesKeyId") != old_key.get("keyId")
            or new_key.get("status") != "trusted"
            or old_key.get("status") != "trusted"
        ):
            status = "blocked"
        else:
            status = "pending"
        return {
            "requestFingerprint": request_fingerprint,
            "newKeyId": request_event.get("keyId"),
            "oldKeyId": request_event.get("relatedKeyId"),
            "organization": new_key.get("organization") if new_key else "",
            "requestedAt": request_event.get("effectiveAt"),
            "expiresAt": request_event.get("expiresAt"),
            "requestedBy": request_event.get("actor"),
            "requesterRole": request_event.get("actorRole"),
            "requestedByOperatorId": request_event.get("actorId"),
            "reason": request_event.get("reason"),
            "incidentReference": request_event.get("incidentReference"),
            "status": status,
            "approvedAt": completion.get("effectiveAt") if completion else None,
            "approvedBy": completion.get("actor") if completion else None,
            "approverRole": completion.get("actorRole") if completion else None,
            "approvedByOperatorId": completion.get("actorId") if completion else None,
            "identityAssurance": (
                "authenticated-local-account"
                if request_event.get("actorId")
                else "procedural-declaration"
            ),
            "completionEventFingerprint": completion.get("eventFingerprint") if completion else None,
        }

    @classmethod
    def _rotation_request_summaries(
        cls,
        keys: list[dict[str, Any]],
        events: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return [
            cls._rotation_request_summary(event, keys, events)
            for event in events
            if event.get("eventType") == "rotation-completion-requested"
        ]

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
            if event.get("eventType") not in {
                "key-registered",
                "key-revoked",
                "rotation-completion-requested",
            }:
                raise ValueError("本機回簽公鑰事件類型不受支援。")
            related_key_id = event.get("relatedKeyId")
            if related_key_id is not None and not isinstance(related_key_id, str):
                raise ValueError("本機回簽公鑰事件的關聯 Key ID 格式不正確。")
            if event.get("eventType") == "rotation-completion-requested":
                if not related_key_id or event.get("reasonCode") != "rotation-completion-request":
                    raise ValueError("輪替完成申請缺少舊 Key ID 或正確原因分類。")
                _required_text(event.get("actorRole"), "輪替申請人職責", 120)
                effective_at = cls._parse_event_time(event.get("effectiveAt"), "輪替申請時間")
                expires_at = cls._parse_event_time(event.get("expiresAt"), "輪替覆核申請期限")
                if expires_at <= effective_at:
                    raise ValueError("輪替覆核申請期限必須晚於申請時間。")
                if expires_at - effective_at > timedelta(hours=ROTATION_APPROVAL_WINDOW_HOURS):
                    raise ValueError("輪替覆核申請期限不得超過 72 小時。")
                _required_text(event.get("incidentReference"), "輪替案件或變更編號", 160)
            approval_request = event.get("approvalRequestFingerprint")
            if approval_request is not None:
                _required_text(approval_request, "輪替覆核申請指紋", 24)
                _required_text(event.get("actorRole"), "輪替覆核人職責", 120)
                if (
                    event.get("eventType") != "key-revoked"
                    or event.get("reasonCode") != "superseded-after-rotation"
                    or not related_key_id
                ):
                    raise ValueError("輪替覆核申請只能綁定輪替完成的舊金鑰撤銷事件。")
            actor_id = event.get("actorId")
            authentication_method = event.get("authenticationMethod")
            if actor_id is not None:
                _required_text(actor_id, "接收端操作帳號識別碼", 64)
                if authentication_method != "local-password-session":
                    raise ValueError("接收端操作帳號事件缺少正確的登入驗證方式。")
            elif authentication_method is not None:
                raise ValueError("接收端操作事件不得只有驗證方式而缺少帳號識別碼。")
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
        consumed_rotation_requests: set[str] = set()
        for event in events:
            target = keys_by_id.get(event.get("keyId"))
            if target is None:
                raise ValueError("本機回簽公鑰事件清冊指向不存在的 Key ID。")
            if event.get("relatedKeyId") is not None and event.get("eventType") not in {
                "key-revoked",
                "rotation-completion-requested",
            }:
                raise ValueError("只有撤銷事件或輪替申請可包含輪替關聯 Key ID。")
            if event.get("eventType") == "rotation-completion-requested":
                old_key = keys_by_id.get(event.get("relatedKeyId"))
                if (
                    old_key is None
                    or target.get("replacesKeyId") != old_key.get("keyId")
                    or target.get("organization") != old_key.get("organization")
                ):
                    raise ValueError("本機回簽公鑰的輪替完成申請與 RKE 關聯不一致。")
                continue
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
            related_key_id = event.get("relatedKeyId")
            if related_key_id is not None:
                replacement = keys_by_id.get(related_key_id)
                request_fingerprint = event.get("approvalRequestFingerprint")
                request_event = events_by_fingerprint.get(request_fingerprint) if request_fingerprint else None
                if (
                    event.get("reasonCode") != "superseded-after-rotation"
                    or replacement is None
                    or replacement.get("replacesKeyId") != target.get("keyId")
                    or target.get("replacedByKeyId") != related_key_id
                    or replacement.get("rotationCompletionEventFingerprint") != event.get("eventFingerprint")
                ):
                    raise ValueError("本機回簽公鑰的輪替完成事件關聯不一致。")
                if request_fingerprint is not None:
                    if request_fingerprint in consumed_rotation_requests:
                        raise ValueError("同一輪替完成申請不得被重複覆核執行。")
                    consumed_rotation_requests.add(request_fingerprint)
                    if (
                        request_event is None
                        or request_event.get("eventType") != "rotation-completion-requested"
                        or request_event.get("keyId") != related_key_id
                        or request_event.get("relatedKeyId") != target.get("keyId")
                        or request_event.get("reason") != event.get("reason")
                        or request_event.get("incidentReference") != event.get("incidentReference")
                        or str(request_event.get("actor", "")).strip().casefold()
                        == str(event.get("actor", "")).strip().casefold()
                        or ReceiverTrustStore._parse_event_time(event.get("effectiveAt"), "輪替完成時間")
                        > ReceiverTrustStore._parse_event_time(request_event.get("expiresAt"), "輪替覆核申請期限")
                        or replacement.get("rotationApprovalRequestFingerprint") != request_fingerprint
                    ):
                        raise ValueError("本機回簽公鑰的雙人輪替覆核關聯不一致。")
        for key in keys:
            fingerprint = key.get("revocationEventFingerprint")
            if fingerprint and fingerprint not in events_by_fingerprint:
                raise ValueError("本機回簽公鑰引用的撤銷事件不存在。")
            completion_fingerprint = key.get("rotationCompletionEventFingerprint")
            if completion_fingerprint:
                completion_event = events_by_fingerprint.get(completion_fingerprint)
                if (
                    completion_event is None
                    or completion_event.get("eventType") != "key-revoked"
                    or completion_event.get("keyId") != key.get("replacesKeyId")
                    or completion_event.get("relatedKeyId") != key.get("keyId")
                ):
                    raise ValueError("本機回簽公鑰引用的輪替完成事件不一致。")
                approval_request = key.get("rotationApprovalRequestFingerprint")
                if approval_request is not None and completion_event.get("approvalRequestFingerprint") != approval_request:
                    raise ValueError("本機回簽公鑰引用的雙人輪替申請指紋不一致。")

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
        related_key_id: str | None = None,
        actor_role: str | None = None,
        actor_id: str | None = None,
        authentication_method: str | None = None,
        expires_at: str | None = None,
        approval_request_fingerprint: str | None = None,
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
        if related_key_id is not None:
            event["relatedKeyId"] = related_key_id
        if actor_role is not None:
            event["actorRole"] = actor_role
        if actor_id is not None:
            event["actorId"] = actor_id
        if authentication_method is not None:
            event["authenticationMethod"] = authentication_method
        if expires_at is not None:
            event["expiresAt"] = expires_at
        if approval_request_fingerprint is not None:
            event["approvalRequestFingerprint"] = approval_request_fingerprint
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
