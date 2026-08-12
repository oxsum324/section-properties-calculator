from __future__ import annotations

from copy import deepcopy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.receiver_governance_archive import finalize_archive_verification_package
from backend.receiver_governance_archive_lifecycle import (
    finalize_lifecycle_checkpoint_package,
    issue_lifecycle_provider_status,
)
from backend.receiver_governance_archive_lifecycle_portfolio import (
    PACKAGE_PREFIX,
    exit_code_for_snapshot,
    portfolio_fingerprint,
    publish_portfolio_snapshot,
    render_portfolio_html,
    scan_portfolio,
    validate_portfolio_snapshot,
    verify_portfolio_snapshot_package,
)
from backend.tests import test_receiver_governance_archive as archive_tests


class ReceiverGovernanceArchiveLifecyclePortfolioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workspace = tempfile.TemporaryDirectory()
        cls.root = Path(cls.workspace.name)
        helper = archive_tests.ReceiverGovernanceArchiveTests(methodName="runTest")
        helper.setUp()
        cls.openssl = helper.openssl
        cls.prepared = helper.prepare(cls.root)
        cls.initial_private_path = cls.root / "initial-provider-private.pem"
        helper.private_key(cls.initial_private_path)
        cls.initial_receipt = helper.issue(cls.root, cls.prepared, cls.initial_private_path)
        cls.initial_approval = helper.approval_evidence(cls.root)
        cls.gav = finalize_archive_verification_package(
            prepared_directory=Path(cls.prepared["directory"]),
            provider_receipt_path=Path(cls.initial_receipt["receiptPath"]),
            provider_public_key_path=Path(cls.initial_receipt["providerPublicKeyPath"]),
            provider_key_approval_evidence_path=cls.initial_approval,
            provider_key_approval_basis="Records policy RP-12 approved provider key list, item 4",
            output_directory=cls.root / "gav",
            openssl_path=cls.openssl,
            verified_at="2026-08-12T08:03:00Z",
        )
        cls.request_path = next(Path(cls.prepared["directory"]).glob("GAD-*.json"))
        cls.receipt_path = Path(cls.initial_receipt["receiptPath"])
        cls.request = json.loads(cls.request_path.read_text(encoding="utf-8"))
        cls.fixture_root = cls.root / "fixture-source"
        cls.fixture_root.mkdir()
        cls.base_package = cls.create_package(
            cls.fixture_root / "案件甲",
            observed_at="2026-09-01T00:00:00Z",
            signed_at="2026-09-01T00:01:00Z",
            verified_at="2026-09-01T00:02:00Z",
            retention_until="2038-08-12T00:00:00Z",
            observation_reference="audit-event-20260901-0001",
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls.workspace.cleanup()

    @classmethod
    def create_package(
        cls,
        case_directory: Path,
        *,
        observed_at: str,
        signed_at: str,
        verified_at: str,
        retention_until: str,
        observation_reference: str,
    ) -> Path:
        case_directory.mkdir(parents=True, exist_ok=True)
        token = observation_reference.replace(":", "-")
        private_path = cls.root / f"portfolio-provider-{token}.pem"
        key = Ed25519PrivateKey.generate()
        private_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        status = issue_lifecycle_provider_status(
            archive_request_path=cls.request_path,
            provider_receipt_path=cls.receipt_path,
            private_key_path=private_path,
            observed_at=observed_at,
            object_status="present",
            content_hash_status="matched",
            observed_object_sha256=cls.request["archiveObject"]["fileSha256"],
            observed_object_size_bytes=cls.request["archiveObject"]["fileSizeBytes"],
            immutability_status="active",
            immutability_mode="worm-compliance",
            retention_policy_id="records-policy-RP-12",
            retention_until=retention_until,
            legal_hold_status="active",
            observation_method="repository-api-sha256",
            observation_reference=observation_reference,
            signed_at=signed_at,
            output_directory=cls.root / f"status-{token}",
        )
        approval = cls.root / f"approval-{token}.txt"
        approval.write_text(f"Approved lifecycle provider key for {observation_reference}.\n", encoding="utf-8")
        staging = case_directory / f".building-{token}"
        final = finalize_lifecycle_checkpoint_package(
            gav_package=Path(cls.gav["directory"]),
            provider_status_receipt_path=Path(status["statusReceiptPath"]),
            provider_public_key_path=Path(status["providerPublicKeyPath"]),
            provider_key_approval_evidence_path=approval,
            provider_key_approval_basis="Records policy RP-12 current provider lifecycle key register",
            review_interval_days=90,
            maximum_observation_age_hours=72,
            retention_warning_days=180,
            output_directory=staging,
            openssl_path=cls.openssl,
            verified_at=verified_at,
        )
        target = case_directory / f"{PACKAGE_PREFIX}{final['checkpointFingerprint']}"
        staging.rename(target)
        return target

    def setUp(self) -> None:
        self.case = Path(tempfile.mkdtemp(dir=self.root))
        self.source = self.case / "案件群"
        self.output = self.case / "受控快照"
        package = self.source / "案件甲" / self.base_package.name
        package.parent.mkdir(parents=True)
        shutil.copytree(self.base_package, package)
        self.package = package

    def tearDown(self) -> None:
        shutil.rmtree(self.case, ignore_errors=True)

    def scan(self, as_of: str, upcoming_days: int = 30) -> dict:
        return scan_portfolio(self.source, openssl_path=self.openssl, as_of=as_of, upcoming_days=upcoming_days)

    def test_current_upcoming_review_blocked_duplicate_and_cli_exit_codes(self) -> None:
        current = self.scan("2026-09-02T00:00:00Z")
        self.assertEqual(current["summary"]["portfolioStatus"], "current")
        self.assertEqual(current["summary"]["attentionStatus"], "current")
        self.assertEqual(exit_code_for_snapshot(current), 0)
        self.assertTrue(current["source"]["sourceStableDuringScan"])
        schema_path = Path(__file__).resolve().parents[2] / "GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_PORTFOLIO_SCHEMA.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        archive_tests.assert_json_schema(self, current, schema, schema)

        if os.name == "nt":
            launcher = Path(__file__).resolve().parents[2] / "receiver_governance_archive_lifecycle_portfolio.ps1"
            powershell = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(launcher),
                    "-Mode", "Scan", "-SourceRoot", str(self.source), "-AsOf", "2026-09-02T00:00:00Z",
                    "-OpenSslPath", str(self.openssl), "-NoOpen",
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(powershell.returncode, 0, powershell.stderr + powershell.stdout)

        upcoming = self.scan("2026-11-15T00:00:00Z")
        self.assertEqual(upcoming["chains"][0]["checkpointLifecycleStatus"], "current")
        self.assertEqual(upcoming["summary"]["attentionStatus"], "upcoming")
        self.assertIn("periodic-review-upcoming", upcoming["chains"][0]["reasons"])
        self.assertEqual(exit_code_for_snapshot(upcoming), 2)

        review = self.scan("2026-12-01T00:00:00Z")
        self.assertEqual(review["summary"]["portfolioStatus"], "review-due")
        self.assertEqual(exit_code_for_snapshot(review), 2)
        blocked = self.scan("2038-08-12T00:00:00Z")
        self.assertEqual(blocked["summary"]["portfolioStatus"], "blocked")
        self.assertEqual(exit_code_for_snapshot(blocked), 3)

        duplicate = self.source / "案件乙" / self.package.name
        duplicate.parent.mkdir()
        shutil.copytree(self.package, duplicate)
        deduplicated = self.scan("2026-09-02T00:00:00Z")
        self.assertEqual(deduplicated["summary"]["chainCount"], 1)
        self.assertEqual(deduplicated["discovery"]["validPackageCount"], 2)
        self.assertEqual(deduplicated["discovery"]["duplicateCopyCount"], 1)

        command = [
            os.sys.executable, "-m", "backend.receiver_governance_archive_lifecycle_portfolio", "--openssl", str(self.openssl),
            "scan", "--source-root", str(self.source), "--as-of", "2026-11-15T00:00:00Z",
        ]
        cli = subprocess.run(command, cwd=Path(__file__).resolve().parents[2], capture_output=True, check=False)
        self.assertEqual(cli.returncode, 2, cli.stderr.decode("utf-8", errors="replace"))
        self.assertEqual(json.loads(cli.stdout.decode("utf-8"))["summary"]["attentionStatus"], "upcoming")

    def test_invalid_package_ambiguity_and_source_change_fail_closed(self) -> None:
        invalid = self.source / "案件壞檔" / self.package.name
        invalid.parent.mkdir()
        shutil.copytree(self.package, invalid)
        status_path = next(invalid.glob("GSR-*.json"))
        status_path.write_bytes(status_path.read_bytes() + b" ")
        result = self.scan("2026-09-02T00:00:00Z")
        self.assertEqual(result["summary"]["portfolioStatus"], "blocked")
        self.assertEqual(result["summary"]["invalidPackageCount"], 1)
        self.assertEqual(result["summary"]["chainCount"], 1)
        self.assertIn("invalid-gsc-packages", {item["code"] for item in result["issues"]})
        shutil.rmtree(invalid.parent)

        ambiguous = self.create_package(
            self.source / "案件甲",
            observed_at="2026-09-01T00:00:00Z",
            signed_at="2026-09-01T00:01:30Z",
            verified_at="2026-09-01T00:03:00Z",
            retention_until="2038-08-12T00:00:00Z",
            observation_reference="audit-event-20260901-conflict",
        )
        conflict = self.scan("2026-09-02T00:00:00Z")
        self.assertEqual(conflict["summary"]["portfolioStatus"], "blocked")
        self.assertIn("ambiguous-latest-checkpoint", {item["code"] for item in conflict["issues"]})
        shutil.rmtree(ambiguous)

        def mutate(_: dict) -> None:
            (self.package / "late-file.txt").write_text("changed", encoding="utf-8")

        changed = scan_portfolio(
            self.source,
            openssl_path=self.openssl,
            as_of="2026-09-02T00:00:00Z",
            before_stability_check=mutate,
        )
        self.assertFalse(changed["source"]["sourceStableDuringScan"])
        self.assertEqual(changed["summary"]["portfolioStatus"], "blocked")
        self.assertIn("source-changed-during-scan", {item["code"] for item in changed["issues"]})

    def test_closed_snapshot_html_tamper_extra_file_and_publish_rollback(self) -> None:
        published = publish_portfolio_snapshot(
            self.source,
            self.output,
            openssl_path=self.openssl,
            as_of="2026-09-02T00:00:00Z",
        )
        package = Path(published["directory"])
        verified = verify_portfolio_snapshot_package(package)
        self.assertEqual(verified["historicalSnapshotIntegrityStatus"], "valid")
        self.assertEqual(verified["currentSourceStateStatus"], "not-assessed-requires-fresh-rescan")
        self.assertNotIn(str(self.source), Path(published["jsonPath"]).read_text(encoding="utf-8"))
        html_text = Path(published["htmlPath"]).read_text(encoding="utf-8")
        self.assertIn("不得作為計算書、主報告或正式附件", html_text)
        self.assertIn("目前狀態必須重新完整掃描 GSC", html_text)
        schema_path = Path(__file__).resolve().parents[2] / "GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_PORTFOLIO_SCHEMA.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        archive_tests.assert_json_schema(self, verified["snapshot"], schema, schema)

        if os.name == "nt":
            launcher = Path(__file__).resolve().parents[2] / "receiver_governance_archive_lifecycle_portfolio.ps1"
            windows_output = self.case / "windows-output"
            powershell_publish = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(launcher),
                    "-Mode", "Publish", "-SourceRoot", str(self.source), "-OutputRoot", str(windows_output),
                    "-AsOf", "2026-09-02T00:00:00Z", "-OpenSslPath", str(self.openssl), "-NoOpen",
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(powershell_publish.returncode, 0, powershell_publish.stderr + powershell_publish.stdout)
            windows_package = next(windows_output.glob("GSP-*"))
            powershell_verify = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(launcher),
                    "-Mode", "VerifySnapshot", "-PackagePath", str(windows_package), "-NoOpen",
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(powershell_verify.returncode, 0, powershell_verify.stderr + powershell_verify.stdout)

        html_path = Path(published["htmlPath"])
        original_html = html_path.read_bytes()
        html_path.write_bytes(original_html + b"tamper")
        with self.assertRaisesRegex(ValueError, "不一致"):
            verify_portfolio_snapshot_package(package)
        html_path.write_bytes(original_html)
        (package / "extra.txt").write_text("extra", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "額外檔案"):
            verify_portfolio_snapshot_package(package)
        (package / "extra.txt").unlink()

        with self.assertRaisesRegex(ValueError, "不得位於 GSC 來源"):
            publish_portfolio_snapshot(self.source, self.source / "snapshots", openssl_path=self.openssl, as_of="2026-09-02T00:00:00Z")
        repository_root = Path(__file__).resolve().parents[3]
        with self.assertRaisesRegex(ValueError, "不得位於工具程式庫"):
            publish_portfolio_snapshot(self.source, repository_root / "GSP-should-not-exist", openssl_path=self.openssl, as_of="2026-09-02T00:00:00Z")

        rollback_root = self.case / "rollback-output"
        def mutate(_: dict) -> None:
            (self.package / "late-before-publish.txt").write_text("changed", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "發布前 GSC 來源已改變"):
            publish_portfolio_snapshot(
                self.source,
                rollback_root,
                openssl_path=self.openssl,
                as_of="2026-09-02T00:00:00Z",
                before_publish=mutate,
            )
        self.assertFalse(list(rollback_root.glob("GSP-*")))

    def test_snapshot_validator_boundary_and_html_escape(self) -> None:
        snapshot = self.scan("2026-09-02T00:00:00Z")
        open_boundary = deepcopy(snapshot)
        open_boundary["boundary"]["unexpected"] = True
        open_boundary["portfolioFingerprint"] = portfolio_fingerprint(open_boundary)
        with self.assertRaisesRegex(ValueError, "責任邊界"):
            validate_portfolio_snapshot(open_boundary)

        false_status = deepcopy(snapshot)
        false_status["chains"][0]["checkpointLifecycleStatus"] = "review-due"
        false_status["chains"][0]["lifecycleStatus"] = "review-due"
        false_status["chains"][0]["attentionStatus"] = "review-due"
        false_status["chains"][0]["reasons"] = ["periodic-review-due"]
        false_status["summary"] = {
            **false_status["summary"],
            "portfolioStatus": "review-due",
            "attentionStatus": "review-due",
            "currentCount": 0,
            "reviewDueCount": 1,
        }
        false_status["portfolioFingerprint"] = portfolio_fingerprint(false_status)
        with self.assertRaisesRegex(ValueError, "狀態與期限"):
            validate_portfolio_snapshot(false_status)

        duplicate_path = deepcopy(snapshot)
        duplicate_path["invalidPackages"] = [{
            "caseName": "案件甲",
            "packageRelativePath": duplicate_path["chains"][0]["selected"]["packageRelativePath"],
            "packageGuardSha256": "a" * 64,
            "errorCode": "gsc-package-verification-failed",
            "message": "invalid",
        }]
        duplicate_path["discovery"]["candidatePackageCount"] += 1
        duplicate_path["discovery"]["invalidPackageCount"] = 1
        duplicate_path["issues"].append({"level": "error", "code": "invalid-gsc-packages", "message": "invalid", "entries": [duplicate_path["chains"][0]["selected"]["packageRelativePath"]]})
        duplicate_path["summary"] = {
            **duplicate_path["summary"],
            "portfolioStatus": "blocked",
            "attentionStatus": "blocked",
            "invalidPackageCount": 1,
            "errorIssueCount": 1,
        }
        duplicate_path["portfolioFingerprint"] = portfolio_fingerprint(duplicate_path)
        with self.assertRaisesRegex(ValueError, "路徑與其他候選包重複"):
            validate_portfolio_snapshot(duplicate_path)

        escaped = deepcopy(snapshot)
        escaped["chains"][0]["selected"]["caseName"] = "case & review"
        escaped["portfolioFingerprint"] = portfolio_fingerprint(escaped)
        text = render_portfolio_html(escaped)
        self.assertIn("case &amp; review", text)
        self.assertNotIn("case & review</td>", text)

    def test_empty_depth_malformed_name_and_linked_entry_are_fail_visible(self) -> None:
        empty = self.case / "空案件群"
        empty.mkdir()
        empty_snapshot = scan_portfolio(empty, openssl_path=self.openssl, as_of="2026-09-02T00:00:00Z")
        self.assertEqual(empty_snapshot["summary"]["portfolioStatus"], "blocked")
        self.assertIn("portfolio-empty", {item["code"] for item in empty_snapshot["issues"]})

        deep = self.case / "深層案件群"
        deep_package = deep / "一" / "二" / self.package.name
        deep_package.parent.mkdir(parents=True)
        shutil.copytree(self.package, deep_package)
        depth_snapshot = scan_portfolio(deep, openssl_path=self.openssl, as_of="2026-09-02T00:00:00Z", max_depth=1)
        self.assertEqual(depth_snapshot["summary"]["portfolioStatus"], "blocked")
        self.assertIn("scan-depth-limit", {item["code"] for item in depth_snapshot["issues"]})

        malformed = self.case / "名稱錯誤案件群"
        malformed_package = malformed / "案件" / f"{PACKAGE_PREFIX}NOT-A-FINGERPRINT"
        malformed_package.parent.mkdir(parents=True)
        shutil.copytree(self.package, malformed_package)
        malformed_snapshot = scan_portfolio(malformed, openssl_path=self.openssl, as_of="2026-09-02T00:00:00Z")
        self.assertEqual(malformed_snapshot["summary"]["invalidPackageCount"], 1)
        self.assertEqual(malformed_snapshot["summary"]["portfolioStatus"], "blocked")

        linked = self.case / "連結案件群"
        linked.mkdir()
        try:
            os.symlink(self.package.parent, linked / "linked-case", target_is_directory=True)
        except (OSError, NotImplementedError):
            return
        linked_snapshot = scan_portfolio(linked, openssl_path=self.openssl, as_of="2026-09-02T00:00:00Z")
        self.assertEqual(linked_snapshot["summary"]["portfolioStatus"], "blocked")
        self.assertIn("unsafe-linked-entry", {item["code"] for item in linked_snapshot["issues"]})


if __name__ == "__main__":
    unittest.main()
