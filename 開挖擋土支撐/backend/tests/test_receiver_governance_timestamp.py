from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

from backend.app.receiver_governance_checkpoint import (
    build_receiver_governance_checkpoint_signing_request,
)
from backend.app.receiver_governance_health import (
    build_receiver_governance_health_history_export,
    build_receiver_governance_health_snapshot,
)
from backend.app.receiver_key_enrollment import build_receiver_key_enrollment
from backend.app.receiver_operator_auth import ReceiverOperatorStore
from backend.app.receiver_trust_backup import build_receiver_trust_registry_backup
from backend.app.receiver_trust_store import ReceiverTrustStore
from backend.receiver_governance_timestamp import (
    finalize_timestamp_package,
    find_openssl,
    prepare_timestamp_request,
    validate_archive_manifest,
    verify_timestamp_package,
)
from backend.sign_receiver_request import build_signature_response
from backend.verify_receiver_governance_checkpoint import (
    build_receiver_governance_checkpoint_verification_receipt,
)


FIXED_NOW = datetime(2026, 8, 12, 6, 0, tzinfo=timezone.utc)


class ReceiverGovernanceTimestampTests(unittest.TestCase):
    def test_explicit_missing_openssl_never_falls_back(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "missing-openssl.exe"
            with self.assertRaisesRegex(ValueError, "找不到可執行的 OpenSSL"):
                find_openssl(missing)

    def source_files(self, root: Path) -> dict[str, Path]:
        root.mkdir(parents=True, exist_ok=True)
        operator_store = ReceiverOperatorStore(root / "operators.sqlite3")
        trust_store = ReceiverTrustStore(root / "trust.json")
        admin = operator_store.bootstrap("root-admin", "管理員", "Strong-Secure-2026!")
        health = build_receiver_governance_health_snapshot(
            operator_store,
            trust_store,
            generated_at=FIXED_NOW,
        )
        operator_store.record_governance_health_observation(
            health,
            change_type="operator-bootstrap",
            actor_operator_id=admin["id"],
        )
        history = operator_store.governance_health_history()
        key = Ed25519PrivateKey.generate()
        trust_store.register_enrollment(
            build_receiver_key_enrollment(key, "治理單位", "治理健康簽章"),
            True,
        )
        checkpoint = build_signature_response(
            build_receiver_governance_checkpoint_signing_request(
                history,
                signed_at=FIXED_NOW,
            ),
            key,
        )
        backup = build_receiver_trust_registry_backup(
            trust_store,
            exported_at="2026-08-12T06:01:00Z",
        )
        current = build_receiver_governance_health_history_export(
            history,
            exported_at=datetime(2026, 8, 12, 6, 2, tzinfo=timezone.utc),
        )
        paths = {
            "checkpoint": root / "governance-checkpoint.json",
            "trustRegistryBackup": root / "trust-registry-backup.json",
            "currentHistoryExport": root / "current-history.json",
            "verificationReceipt": root / "governance-verification.json",
        }
        paths["checkpoint"].write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")
        paths["trustRegistryBackup"].write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
        paths["currentHistoryExport"].write_text(json.dumps(current, ensure_ascii=False), encoding="utf-8")
        source_summaries = {}
        for key_name in ("checkpoint", "trustRegistryBackup", "currentHistoryExport"):
            raw = paths[key_name].read_bytes()
            import hashlib
            source_summaries[key_name] = {
                "fileName": paths[key_name].name,
                "fileSha256": hashlib.sha256(raw).hexdigest(),
            }
        receipt = build_receiver_governance_checkpoint_verification_receipt(
            checkpoint,
            source_files=source_summaries,
            trust_registry_backup=backup,
            current_history_export=current,
            verified_at="2026-08-12T06:03:00Z",
        )
        paths["verificationReceipt"].write_text(
            json.dumps(receipt, ensure_ascii=False),
            encoding="utf-8",
        )
        return paths

    def tsa(self, root: Path, openssl: Path, query: Path) -> tuple[Path, Path]:
        root.mkdir(parents=True, exist_ok=True)
        root_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        root_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test RFC3161 Root")])
        now = datetime.now(timezone.utc)
        root_cert = (
            x509.CertificateBuilder()
            .subject_name(root_name)
            .issuer_name(root_name)
            .public_key(root_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=365))
            .add_extension(x509.BasicConstraints(ca=True, path_length=1), critical=True)
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    content_commitment=False,
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=True,
                    crl_sign=True,
                    encipher_only=None,
                    decipher_only=None,
                ),
                critical=True,
            )
            .sign(root_key, hashes.SHA256())
        )
        tsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        tsa_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test RFC3161 TSA")])
        tsa_cert = (
            x509.CertificateBuilder()
            .subject_name(tsa_name)
            .issuer_name(root_name)
            .public_key(tsa_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=30))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    content_commitment=True,
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=False,
                    crl_sign=False,
                    encipher_only=None,
                    decipher_only=None,
                ),
                critical=True,
            )
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.TIME_STAMPING]), critical=True)
            .sign(root_key, hashes.SHA256())
        )
        root_cert_path = root / "root.pem"
        tsa_cert_path = root / "tsa.pem"
        tsa_key_path = root / "tsa-key.pem"
        root_cert_path.write_bytes(root_cert.public_bytes(serialization.Encoding.PEM))
        tsa_cert_path.write_bytes(tsa_cert.public_bytes(serialization.Encoding.PEM))
        tsa_key_path.write_bytes(
            tsa_key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
        )
        (root / "tsa-serial.txt").write_text("01\n", encoding="ascii")
        location = root.as_posix()
        config = root / "tsa.cnf"
        config.write_text(
            "\n".join([
                "[ tsa ]",
                "default_tsa = tsa_config",
                "[ tsa_config ]",
                f"dir = {location}",
                "serial = $dir/tsa-serial.txt",
                "crypto_device = builtin",
                "signer_cert = $dir/tsa.pem",
                "certs = $dir/root.pem",
                "signer_key = $dir/tsa-key.pem",
                "signer_digest = sha256",
                "default_policy = 1.2.3.4.1",
                "other_policies = 1.2.3.4.2",
                "digests = sha256",
                "accuracy = secs:1",
                "ordering = yes",
                "tsa_name = yes",
                "ess_cert_id_chain = no",
                "ess_cert_id_alg = sha256",
                "",
            ]),
            encoding="ascii",
        )
        response = root / "response.tsr"
        completed = subprocess.run(
            [str(openssl), "ts", "-reply", "-config", str(config), "-queryfile", str(query), "-out", str(response)],
            capture_output=True,
            check=False,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        return response, root_cert_path

    def unrelated_root(self, path: Path) -> Path:
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Unrelated Test Root")])
        now = datetime.now(timezone.utc)
        certificate = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=30))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .sign(key, hashes.SHA256())
        )
        path.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
        return path

    def test_prepare_revalidates_gcv_and_builds_closed_sha256_nonce_query(self) -> None:
        openssl = find_openssl()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = self.source_files(root)
            prepared = prepare_timestamp_request(
                verification_receipt_path=paths["verificationReceipt"],
                checkpoint_path=paths["checkpoint"],
                trust_backup_path=paths["trustRegistryBackup"],
                current_history_path=paths["currentHistoryExport"],
                output_directory=root / "prepared",
                openssl_path=openssl,
                created_at="2026-08-12T06:04:00Z",
            )
            prepared_root = Path(prepared["directory"])
            manifest_path = Path(prepared["manifestPath"])
            manifest = validate_archive_manifest(json.loads(manifest_path.read_text(encoding="utf-8")))
            self.assertEqual(manifest["timestampRequest"]["messageImprintAlgorithm"], "sha256")
            self.assertTrue(manifest["timestampRequest"]["nonceRequired"])
            self.assertEqual(len(list(prepared_root.iterdir())), 6)

            copied_checkpoint = prepared_root / paths["checkpoint"].name
            copied_checkpoint.write_bytes(copied_checkpoint.read_bytes() + b" ")
            with self.assertRaisesRegex(ValueError, "bytes.*清單不一致"):
                finalize_timestamp_package(
                    prepared_directory=prepared_root,
                    timestamp_response_path=root / "missing.tsr",
                    trust_anchor_path=root / "missing.pem",
                    openssl_path=openssl,
                )

    def test_real_rfc3161_round_trip_and_complete_package_reverification(self) -> None:
        openssl = find_openssl()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = self.source_files(root)
            prepared = prepare_timestamp_request(
                verification_receipt_path=paths["verificationReceipt"],
                checkpoint_path=paths["checkpoint"],
                trust_backup_path=paths["trustRegistryBackup"],
                current_history_path=paths["currentHistoryExport"],
                output_directory=root / "prepared",
                openssl_path=openssl,
            )
            response, trust_anchor = self.tsa(root, openssl, Path(prepared["queryPath"]))
            finalized = finalize_timestamp_package(
                prepared_directory=Path(prepared["directory"]),
                timestamp_response_path=response,
                trust_anchor_path=trust_anchor,
                output_directory=root / "final",
                openssl_path=openssl,
                verified_at="2026-08-12T06:05:00Z",
            )
            package = Path(finalized["directory"])
            receipt = verify_timestamp_package(package, openssl_path=openssl)
            self.assertEqual(receipt["timestamp"]["status"], "trusted-timestamp-valid")
            self.assertTrue(receipt["timestamp"]["queryNonceVerified"])
            self.assertTrue(receipt["timestamp"]["manifestBytesVerified"])
            self.assertTrue(receipt["boundary"]["tsaRevocationStatusNotEstablished"])
            self.assertFalse(receipt["boundary"]["formalCalculationAttachment"])

            unavailable_db = root / "must-not-be-created.sqlite3"
            completed = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "backend.receiver_governance_timestamp",
                    "--openssl",
                    str(openssl),
                    "verify",
                    "--package",
                    str(package),
                ],
                cwd=Path(__file__).resolve().parents[2],
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                env={
                    **os.environ,
                    "PYTHONUTF8": "1",
                    "STRUT_DB_PATH": str(unavailable_db),
                    "STRUT_RECEIVER_TRUST_REGISTRY_PATH": str(root / "must-not-be-read.json"),
                },
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIn("GTV 可信時間證據包驗證通過", completed.stdout)
            self.assertFalse(unavailable_db.exists())

            if os.name == "nt":
                launcher = Path(__file__).resolve().parents[2] / "receiver_governance_timestamp.ps1"
                powershell = subprocess.run(
                    [
                        "powershell",
                        "-NoProfile",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-File",
                        str(launcher),
                        "-Mode",
                        "Verify",
                        "-PackagePath",
                        str(package),
                        "-OpenSslPath",
                        str(openssl),
                    ],
                    check=False,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    env={**os.environ, "PYTHONUTF8": "1"},
                )
                self.assertEqual(powershell.returncode, 0, powershell.stderr)
                self.assertIn("GTV 可信時間證據包驗證通過", powershell.stdout)

            (package / "extra.txt").write_text("not allowed", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "額外檔案"):
                verify_timestamp_package(package, openssl_path=openssl)
            (package / "extra.txt").unlink()

            copied_checkpoint = package / paths["checkpoint"].name
            copied_checkpoint.write_bytes(copied_checkpoint.read_bytes() + b" ")
            with self.assertRaisesRegex(ValueError, "bytes.*收據不一致"):
                verify_timestamp_package(package, openssl_path=openssl)

    def test_unrelated_query_response_and_wrong_trust_anchor_fail_closed(self) -> None:
        openssl = find_openssl()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first_paths = self.source_files(root / "first")
            first = prepare_timestamp_request(
                verification_receipt_path=first_paths["verificationReceipt"],
                checkpoint_path=first_paths["checkpoint"],
                trust_backup_path=first_paths["trustRegistryBackup"],
                current_history_path=first_paths["currentHistoryExport"],
                output_directory=root / "first-prepared",
                openssl_path=openssl,
            )
            response, trust_anchor = self.tsa(root / "tsa", openssl, Path(first["queryPath"]))
            wrong_anchor = self.unrelated_root(root / "wrong-root.pem")
            mixed_private_material = root / "mixed-private-material.pem"
            mixed_private_material.write_bytes(
                trust_anchor.read_bytes()
                + b"\n-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----\n"
            )
            with self.assertRaisesRegex(ValueError, "不得包含私鑰"):
                finalize_timestamp_package(
                    prepared_directory=Path(first["directory"]),
                    timestamp_response_path=response,
                    trust_anchor_path=mixed_private_material,
                    output_directory=root / "private-material-output",
                    openssl_path=openssl,
                )
            with self.assertRaisesRegex(ValueError, "憑證鏈驗證.*失敗"):
                finalize_timestamp_package(
                    prepared_directory=Path(first["directory"]),
                    timestamp_response_path=response,
                    trust_anchor_path=wrong_anchor,
                    output_directory=root / "wrong-anchor-output",
                    openssl_path=openssl,
                )

            second_paths = self.source_files(root / "second")
            second = prepare_timestamp_request(
                verification_receipt_path=second_paths["verificationReceipt"],
                checkpoint_path=second_paths["checkpoint"],
                trust_backup_path=second_paths["trustRegistryBackup"],
                current_history_path=second_paths["currentHistoryExport"],
                output_directory=root / "second-prepared",
                openssl_path=openssl,
            )
            with self.assertRaisesRegex(ValueError, "nonce.*失敗"):
                finalize_timestamp_package(
                    prepared_directory=Path(second["directory"]),
                    timestamp_response_path=response,
                    trust_anchor_path=trust_anchor,
                    output_directory=root / "wrong-query-output",
                    openssl_path=openssl,
                )


if __name__ == "__main__":
    unittest.main()
