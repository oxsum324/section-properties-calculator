from __future__ import annotations

from copy import deepcopy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.receiver_governance_archive import finalize_archive_verification_package
from backend.receiver_governance_archive_lifecycle import finalize_lifecycle_checkpoint_package, issue_lifecycle_provider_status
from backend.receiver_governance_archive_lifecycle_monitor import (
    LATEST_FILE_NAME,
    _state_lock,
    build_dashboard_summaries,
    build_monitor_signal,
    monitor_state_fingerprint,
    read_monitor_events,
    run_monitor,
    validate_dashboard_history,
    validate_dashboard_status,
    validate_monitor_state,
    verify_monitor_state_directory,
    write_dashboard_summaries,
)
from backend.receiver_governance_archive_lifecycle_portfolio import PACKAGE_PREFIX, portfolio_fingerprint, scan_portfolio
from backend.tests import test_receiver_governance_archive as archive_tests


class ReceiverGovernanceArchiveLifecycleMonitorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workspace = tempfile.TemporaryDirectory()
        cls.root = Path(cls.workspace.name)
        helper = archive_tests.ReceiverGovernanceArchiveTests(methodName="runTest")
        helper.setUp()
        cls.openssl = helper.openssl
        cls.prepared = helper.prepare(cls.root)
        private_path = cls.root / "initial-provider-private.pem"
        helper.private_key(private_path)
        cls.initial_receipt = helper.issue(cls.root, cls.prepared, private_path)
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
            observation_reference="monitor-audit-event-20260901-0001",
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls.workspace.cleanup()

    @classmethod
    def create_package(cls, case_directory: Path, *, observed_at: str, signed_at: str, verified_at: str, retention_until: str, observation_reference: str) -> Path:
        case_directory.mkdir(parents=True, exist_ok=True)
        token = observation_reference.replace(":", "-")
        private_path = cls.root / f"monitor-provider-{token}.pem"
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
        self.state = self.case / "受控監測"
        self.state.mkdir()
        package = self.source / "案件甲" / self.base_package.name
        package.parent.mkdir(parents=True)
        shutil.copytree(self.base_package, package)

    def tearDown(self) -> None:
        shutil.rmtree(self.case, ignore_errors=True)

    def monitor_run(self, as_of: str) -> dict:
        return run_monitor(self.source, self.state, openssl_path=self.openssl, as_of=as_of)

    def test_transition_dedup_attention_recovery_and_windows_entrypoint(self) -> None:
        baseline = self.monitor_run("2026-09-02T00:00:00Z")
        self.assertEqual(baseline["status"], "transition-recorded")
        self.assertEqual(baseline["notification"], {"shouldNotify": False, "kind": "baseline-current"})
        self.assertEqual(baseline["eventCount"], 1)
        schema_path = Path(__file__).resolve().parents[2] / "GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_MONITOR_SCHEMA.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        dashboard_schema_path = Path(__file__).resolve().parents[2] / "GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_DASHBOARD_SCHEMA.json"
        dashboard_schema = json.loads(dashboard_schema_path.read_text(encoding="utf-8"))
        archive_tests.assert_json_schema(self, baseline["monitor"], schema, schema)

        unchanged = self.monitor_run("2026-09-03T00:00:00Z")
        self.assertEqual(unchanged["status"], "unchanged")
        self.assertEqual(unchanged["notification"], {"shouldNotify": False, "kind": "unchanged"})
        self.assertEqual(unchanged["eventCount"], 1)
        self.assertNotEqual(baseline["monitor"]["portfolioFingerprint"], unchanged["monitor"]["portfolioFingerprint"])
        self.assertEqual(baseline["monitor"]["signal"]["signalFingerprint"], unchanged["monitor"]["signal"]["signalFingerprint"])

        upcoming = self.monitor_run("2026-11-15T00:00:00Z")
        self.assertEqual(upcoming["attentionStatus"], "upcoming")
        self.assertEqual(upcoming["notification"], {"shouldNotify": True, "kind": "attention-change"})
        self.assertEqual(upcoming["eventCount"], 2)
        repeated = self.monitor_run("2026-11-16T00:00:00Z")
        self.assertEqual(repeated["status"], "unchanged")
        self.assertFalse(repeated["notification"]["shouldNotify"])
        self.assertEqual(repeated["eventCount"], 2)

        review = self.monitor_run("2026-12-01T00:00:00Z")
        self.assertEqual(review["attentionStatus"], "review-due")
        self.assertEqual(review["eventCount"], 3)
        self.create_package(
            self.source / "案件甲",
            observed_at="2026-12-02T00:00:00Z",
            signed_at="2026-12-02T00:01:00Z",
            verified_at="2026-12-02T00:02:00Z",
            retention_until="2038-08-12T00:00:00Z",
            observation_reference="monitor-audit-event-20261202-0002",
        )
        recovered = self.monitor_run("2026-12-03T00:00:00Z")
        self.assertEqual(recovered["attentionStatus"], "current")
        self.assertEqual(recovered["notification"], {"shouldNotify": True, "kind": "recovered"})
        self.assertEqual(recovered["eventCount"], 4)
        events = read_monitor_events(self.state)
        self.assertEqual([item["sequence"] for item in events], [1, 2, 3, 4])

        dashboard_status, dashboard_history = build_dashboard_summaries(
            self.state, as_of="2026-12-03T12:00:00Z", max_age_hours=36, max_items=3,
        )
        self.assertEqual(dashboard_status["status"], "trusted")
        self.assertEqual(dashboard_status["attentionStatus"], "current")
        self.assertEqual(dashboard_status["summary"]["chainCount"], 1)
        self.assertEqual(dashboard_history["itemCount"], 3)
        self.assertEqual(dashboard_history["items"][0]["notificationKind"], "recovered")
        archive_tests.assert_json_schema(self, dashboard_status, dashboard_schema, dashboard_schema)
        archive_tests.assert_json_schema(self, dashboard_history, dashboard_schema, dashboard_schema)
        private_text = json.dumps({"status": dashboard_status, "history": dashboard_history}, ensure_ascii=False)
        for forbidden in ("案件甲", str(self.source), str(self.state), "GSC-", "GME-", "GSM-", "GSP-"):
            self.assertNotIn(forbidden, private_text)
        stale_status, _ = build_dashboard_summaries(self.state, as_of="2026-12-05T00:00:01Z")
        self.assertEqual(stale_status["status"], "stale")
        self.assertIn("monitor-state-stale", stale_status["issueCodes"])
        dashboard_status_path = self.case / "dashboard" / "gsm-status.json"
        dashboard_history_path = self.case / "dashboard" / "gsm-history.json"
        written = write_dashboard_summaries(
            self.state, dashboard_status_path, dashboard_history_path, as_of="2026-12-03T12:00:00Z",
        )
        self.assertEqual(validate_dashboard_status(json.loads(dashboard_status_path.read_text(encoding="utf-8"))), written["status"])
        self.assertEqual(validate_dashboard_history(json.loads(dashboard_history_path.read_text(encoding="utf-8"))), written["history"])
        tampered_dashboard_status = deepcopy(dashboard_status)
        tampered_dashboard_status["ageSeconds"] += 1
        with self.assertRaisesRegex(ValueError, "年齡"):
            validate_dashboard_status(tampered_dashboard_status)
        tampered_dashboard_history = deepcopy(dashboard_history)
        tampered_dashboard_history["items"][0]["summary"]["upcomingCount"] = 2
        with self.assertRaisesRegex(ValueError, "即將到期計數"):
            validate_dashboard_history(tampered_dashboard_history)

        if os.name == "nt":
            launcher = Path(__file__).resolve().parents[2] / "receiver_governance_archive_lifecycle_monitor.ps1"
            windows_dashboard_status = self.case / "windows-dashboard-status.json"
            windows_dashboard_history = self.case / "windows-dashboard-history.json"
            powershell = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(launcher),
                    "-Mode", "Run", "-SourceRoot", str(self.source), "-StateDirectory", str(self.state),
                    "-AsOf", "2026-12-04T00:00:00Z", "-OpenSslPath", str(self.openssl),
                    "-DashboardStatusPath", str(windows_dashboard_status),
                    "-DashboardHistoryPath", str(windows_dashboard_history),
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(powershell.returncode, 0, powershell.stderr + powershell.stdout)
            result = json.loads(powershell.stdout)
            self.assertEqual(result["status"], "unchanged")
            self.assertEqual(result["dashboard"]["status"], "trusted")
            self.assertTrue(windows_dashboard_status.is_file())
            self.assertTrue(windows_dashboard_history.is_file())

            task_manager = Path(__file__).resolve().parents[2] / "manage_receiver_governance_archive_lifecycle_monitor_task.ps1"
            task_dashboard_path = self.case / "task-dashboard.json"
            task_status = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(task_manager),
                    "-Mode", "Status", "-TaskName", "Codex-GSM-monitor-test-task-that-must-not-exist",
                    "-DashboardTaskStatusPath", str(task_dashboard_path),
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(task_status.returncode, 3, task_status.stderr + task_status.stdout)
            status_result = json.loads(task_status.stdout)
            self.assertFalse(status_result["installed"])
            self.assertEqual(status_result["state"], "NotInstalled")
            task_dashboard = json.loads(task_dashboard_path.read_text(encoding="utf-8"))
            self.assertEqual(task_dashboard["kind"], "governance-external-archive-lifecycle-monitor-task-dashboard-status")
            self.assertEqual(task_dashboard["issueCodes"], ["task-not-installed"])
            archive_tests.assert_json_schema(self, task_dashboard, dashboard_schema, dashboard_schema)
            self.assertNotIn("taskName", task_dashboard)
            self.assertNotIn(str(self.case), json.dumps(task_dashboard, ensure_ascii=False))

            no_write_dashboard_path = self.case / "task-dashboard-no-write.json"
            no_write_dashboard_path.write_text('{"sentinel":true}\n', encoding="utf-8")
            no_write_status = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(task_manager),
                    "-Mode", "Status", "-TaskName", "Codex-GSM-monitor-test-task-that-must-not-exist",
                    "-DashboardTaskStatusPath", str(no_write_dashboard_path), "-NoDashboardWrite",
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(no_write_status.returncode, 3, no_write_status.stderr + no_write_status.stdout)
            self.assertEqual(no_write_dashboard_path.read_text(encoding="utf-8"), '{"sentinel":true}\n')

            preview_task_dashboard_path = self.case / "preview-task-dashboard.json"
            preview = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(task_manager),
                    "-Mode", "Preview", "-TaskName", "Codex-GSM-monitor-preview",
                    "-SourceRoot", str(self.source), "-StateDirectory", str(self.state),
                    "-DailyAt", "07:30", "-OpenSslPath", str(self.openssl), "-NoAlert",
                    "-DashboardStatusPath", str(windows_dashboard_status),
                    "-DashboardHistoryPath", str(windows_dashboard_history),
                    "-DashboardTaskStatusPath", str(preview_task_dashboard_path),
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(preview.returncode, 0, preview.stderr + preview.stdout)
            preview_result = json.loads(preview.stdout)
            self.assertTrue(preview_result["preview"])
            self.assertFalse(preview_result["installed"])
            self.assertTrue(preview_result["configurationMatchesCurrentTool"])
            self.assertRegex(preview_result["configurationFingerprint"], r"^GMI-[0-9A-F]{20}$")
            self.assertTrue(preview_result["confirmationRequired"])
            self.assertEqual(preview_result["previewSideEffects"], {
                "sourceScanExecuted": False,
                "monitorStateWritten": False,
                "taskRegistered": False,
            })
            self.assertFalse(preview_task_dashboard_path.exists())
            repeated_preview = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(task_manager),
                    "-Mode", "Preview", "-TaskName", "Codex-GSM-monitor-preview",
                    "-SourceRoot", str(self.source), "-StateDirectory", str(self.state),
                    "-DailyAt", "07:30", "-OpenSslPath", str(self.openssl), "-NoAlert",
                    "-DashboardStatusPath", str(windows_dashboard_status),
                    "-DashboardHistoryPath", str(windows_dashboard_history),
                    "-DashboardTaskStatusPath", str(preview_task_dashboard_path),
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(repeated_preview.returncode, 0, repeated_preview.stderr + repeated_preview.stdout)
            self.assertEqual(json.loads(repeated_preview.stdout)["configurationFingerprint"], preview_result["configurationFingerprint"])
            changed_preview = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(task_manager),
                    "-Mode", "Preview", "-TaskName", "Codex-GSM-monitor-preview",
                    "-SourceRoot", str(self.source), "-StateDirectory", str(self.state),
                    "-DailyAt", "07:31", "-OpenSslPath", str(self.openssl), "-NoAlert",
                    "-DashboardStatusPath", str(windows_dashboard_status),
                    "-DashboardHistoryPath", str(windows_dashboard_history),
                    "-DashboardTaskStatusPath", str(preview_task_dashboard_path),
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(changed_preview.returncode, 0, changed_preview.stderr + changed_preview.stdout)
            self.assertNotEqual(json.loads(changed_preview.stdout)["configurationFingerprint"], preview_result["configurationFingerprint"])
            rejected_install = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(task_manager),
                    "-Mode", "Install", "-TaskName", "Codex-GSM-monitor-install-reject",
                    "-SourceRoot", str(self.source), "-StateDirectory", str(self.state),
                    "-DailyAt", "07:30", "-OpenSslPath", str(self.openssl), "-NoAlert",
                    "-DashboardStatusPath", str(windows_dashboard_status),
                    "-DashboardHistoryPath", str(windows_dashboard_history),
                    "-DashboardTaskStatusPath", str(preview_task_dashboard_path),
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(rejected_install.returncode, 1)
            self.assertIn("exact configuration fingerprint returned by Preview", rejected_install.stderr + rejected_install.stdout)

            onboarding = Path(__file__).resolve().parents[2] / "onboard_receiver_governance_archive_lifecycle_monitor.ps1"
            state_entries_before = sorted(path.name for path in self.state.iterdir())
            onboarding_preview = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(onboarding),
                    "-Mode", "Preview", "-TaskName", "Codex-GSM-onboarding-preview",
                    "-SourceRoot", str(self.source), "-StateDirectory", str(self.state),
                    "-DailyAt", "07:30", "-OpenSslPath", str(self.openssl), "-NoAlert",
                    "-DashboardStatusPath", str(windows_dashboard_status),
                    "-DashboardHistoryPath", str(windows_dashboard_history),
                    "-DashboardTaskStatusPath", str(preview_task_dashboard_path),
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(onboarding_preview.returncode, 0, onboarding_preview.stderr + onboarding_preview.stdout)
            onboarding_result = json.loads(onboarding_preview.stdout)
            self.assertEqual(onboarding_result["kind"], "governance-external-archive-lifecycle-monitor-onboarding-preview")
            self.assertEqual(onboarding_result["outcome"], "preview-ready")
            self.assertFalse(onboarding_result["taskInstalled"])
            self.assertTrue(onboarding_result["previewSideEffects"]["readOnlySourceScanExecuted"])
            self.assertFalse(onboarding_result["previewSideEffects"]["monitorStateWritten"])
            self.assertFalse(onboarding_result["previewSideEffects"]["taskRegistered"])
            self.assertGreaterEqual(onboarding_result["scan"]["candidatePackageCount"], 1)
            self.assertNotIn(str(self.source), json.dumps(onboarding_result, ensure_ascii=False))
            self.assertNotIn(str(self.state), json.dumps(onboarding_result, ensure_ascii=False))
            self.assertEqual(sorted(path.name for path in self.state.iterdir()), state_entries_before)
            onboarding_cancel = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(onboarding),
                    "-Mode", "Cancel",
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(onboarding_cancel.returncode, 0, onboarding_cancel.stderr + onboarding_cancel.stdout)
            cancelled_result = json.loads(onboarding_cancel.stdout)
            self.assertEqual(cancelled_result["outcome"], "cancelled")
            self.assertFalse(cancelled_result["taskInstalled"])
            self.assertFalse(cancelled_result["sourceScanExecuted"])
            self.assertFalse(cancelled_result["monitorStateWritten"])
            rejected_preview = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(task_manager),
                    "-Mode", "Preview", "-SourceRoot", str(self.source), "-StateDirectory", str(self.source),
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(rejected_preview.returncode, 1)
            self.assertIn("completely separate", rejected_preview.stderr + rejected_preview.stdout)

            missing_source = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(launcher),
                    "-Mode", "Run", "-SourceRoot", str(self.case / "missing-source"),
                    "-StateDirectory", str(self.state), "-OpenSslPath", str(self.openssl),
                    "-DashboardStatusPath", str(windows_dashboard_status),
                    "-DashboardHistoryPath", str(windows_dashboard_history),
                ],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(missing_source.returncode, 1)
            self.assertIn("could not produce a trusted current state", missing_source.stderr + missing_source.stdout)
            failure_dashboard = json.loads(windows_dashboard_status.read_text(encoding="utf-8"))
            self.assertEqual(failure_dashboard["status"], "untrusted")
            self.assertIsNone(failure_dashboard["summary"])
            self.assertEqual(failure_dashboard["issueCodes"], ["monitor-operation-failed"])

    def test_baseline_attention_tamper_unknown_entry_and_staleness(self) -> None:
        attention = self.monitor_run("2026-11-15T00:00:00Z")
        self.assertEqual(attention["notification"], {"shouldNotify": True, "kind": "baseline-attention"})
        fresh = verify_monitor_state_directory(self.state, as_of="2026-11-15T12:00:00Z", max_age_hours=36)
        self.assertEqual(fresh["freshnessStatus"], "fresh")
        self.assertEqual(fresh["currentSourceStateStatus"], "not-assessed-requires-monitor-run")
        stale = verify_monitor_state_directory(self.state, as_of="2026-11-17T00:00:01Z", max_age_hours=36)
        self.assertEqual(stale["freshnessStatus"], "stale")

        latest = self.state / LATEST_FILE_NAME
        value = json.loads(latest.read_text(encoding="utf-8"))
        value["checkedAt"] = "tampered"
        latest.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        with self.assertRaises(ValueError):
            verify_monitor_state_directory(self.state, as_of="2026-11-15T12:00:00Z")
        with self.assertRaises(ValueError):
            self.monitor_run("2026-11-16T00:00:00Z")

        latest.unlink()
        self.state.joinpath("unexpected.txt").write_text("unexpected", encoding="utf-8")
        with self.assertRaises(ValueError):
            verify_monitor_state_directory(self.state)

        orphan_state = self.case / "孤兒監測"
        orphan_state.mkdir()
        (orphan_state / LATEST_FILE_NAME).write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "孤兒狀態"):
            run_monitor(self.source, orphan_state, openssl_path=self.openssl, as_of="2026-11-16T00:00:00Z")

        empty_source = self.case / "空案件群"
        empty_state = self.case / "空案件監測"
        empty_source.mkdir()
        empty_state.mkdir()
        empty = run_monitor(empty_source, empty_state, openssl_path=self.openssl, as_of="2026-11-15T00:00:00Z")
        self.assertEqual(empty["attentionStatus"], "blocked")
        self.assertEqual(empty["notification"], {"shouldNotify": True, "kind": "baseline-attention"})
        self.assertIn("portfolio-empty", empty["monitor"]["signal"]["issues"][0]["code"])
        missing_latest_state = self.case / "缺少latest監測"
        missing_latest_events = missing_latest_state / "events"
        missing_latest_events.mkdir(parents=True)
        shutil.copy2(next((empty_state / "events").glob("*.json")), missing_latest_events)
        with self.assertRaisesRegex(ValueError, "latest 狀態遺失"):
            run_monitor(empty_source, missing_latest_state, openssl_path=self.openssl, as_of="2026-11-16T00:00:00Z")

    def test_management_center_smoke_refresh_and_empty_snapshot_boundary(self) -> None:
        service_root = Path(__file__).resolve().parents[2]
        repository_root = service_root.parent
        center = service_root / "receiver_governance_archive_lifecycle_monitor_center.ps1"
        smoke_directory = repository_root / "output" / "playwright"
        smoke_directory.mkdir(parents=True, exist_ok=True)
        smoke_path = smoke_directory / f"gsm-monitor-center-test-{os.getpid()}.png"
        smoke_path.unlink(missing_ok=True)
        try:
            smoke = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(center),
                    "-Mode", "Smoke", "-SmokeOutputPath", str(smoke_path),
                ],
                cwd=repository_root, capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(smoke.returncode, 0, smoke.stderr + smoke.stdout)
            smoke_result = json.loads(smoke.stdout)
            self.assertEqual(smoke_result["status"], "ok")
            self.assertEqual(smoke_result["taskCount"], 3)
            self.assertTrue(smoke_result["refreshEventVerified"])
            self.assertFalse(smoke_result["actionsEnabled"])
            self.assertTrue(smoke_path.is_file())
            self.assertGreater(smoke_path.stat().st_size, 10_000)

            snapshot = subprocess.run(
                [
                    "powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(center),
                    "-Mode", "Snapshot", "-TaskNameFilter", f"Codex-GSM-center-none-{os.getpid()}-*",
                ],
                cwd=repository_root, capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(snapshot.returncode, 0, snapshot.stderr + snapshot.stdout)
            snapshot_result = json.loads(snapshot.stdout)
            self.assertEqual(snapshot_result["taskCount"], 0)
            self.assertEqual(snapshot_result["items"], [])
            self.assertEqual(snapshot_result["boundary"], {
                "localOnly": True,
                "containsPaths": True,
                "containsTaskNames": True,
                "containsCaseIdentifiers": True,
                "taskInventoryReadOnly": True,
                "sourceScanExecuted": False,
                "statusStateVerificationReadOnly": True,
                "formalCalculationAttachment": False,
                "pagesPublication": False,
                "persistedByDefault": False,
            })
        finally:
            smoke_path.unlink(missing_ok=True)

    def test_event_tamper_lock_overlap_repository_and_rollback(self) -> None:
        self.monitor_run("2026-09-02T00:00:00Z")
        event_path = next((self.state / "events").glob("*.json"))
        original = event_path.read_bytes()
        event = json.loads(original.decode("utf-8"))
        event["toAttentionStatus"] = "blocked"
        event_path.write_text(json.dumps(event, ensure_ascii=False), encoding="utf-8")
        with self.assertRaises(ValueError):
            read_monitor_events(self.state)
        event_path.write_bytes(original)
        external_link = self.case / "event-hardlink.json"
        try:
            os.link(event_path, external_link)
        except OSError:
            external_link = None
        if external_link is not None:
            with self.assertRaisesRegex(ValueError, "硬連結|連結數"):
                read_monitor_events(self.state)
            external_link.unlink()

        with _state_lock(self.state):
            with self.assertRaisesRegex(ValueError, "另一個 GSM"):
                self.monitor_run("2026-09-03T00:00:00Z")

        with self.assertRaisesRegex(ValueError, "完全分離"):
            run_monitor(self.source, self.source, openssl_path=self.openssl, as_of="2026-09-03T00:00:00Z")
        repository_state = Path(__file__).resolve().parents[3] / ".temporary-gsm-state"
        repository_state.mkdir()
        try:
            with self.assertRaisesRegex(ValueError, "工具程式庫"):
                run_monitor(self.source, repository_state, openssl_path=self.openssl, as_of="2026-09-03T00:00:00Z")
        finally:
            repository_state.rmdir()

        before_latest = (self.state / LATEST_FILE_NAME).read_bytes()
        before_events = [item.name for item in (self.state / "events").iterdir()]
        with mock.patch("backend.receiver_governance_archive_lifecycle_monitor._write_atomic_json", side_effect=OSError("simulated latest failure")):
            with self.assertRaises(OSError):
                self.monitor_run("2026-11-15T00:00:00Z")
        self.assertEqual((self.state / LATEST_FILE_NAME).read_bytes(), before_latest)
        self.assertEqual([item.name for item in (self.state / "events").iterdir()], before_events)

    def test_current_inventory_change_records_event_without_alert(self) -> None:
        self.monitor_run("2026-09-02T00:00:00Z")
        changed = scan_portfolio(self.source, openssl_path=self.openssl, as_of="2026-09-03T00:00:00Z")
        changed["chains"][0]["selected"]["caseName"] = "案件甲重新編組"
        changed["chains"][0]["selected"]["packageRelativePath"] = "重新編組/" + Path(changed["chains"][0]["selected"]["packageRelativePath"]).name
        changed["portfolioFingerprint"] = portfolio_fingerprint(changed)
        result = run_monitor(
            self.source,
            self.state,
            openssl_path=self.openssl,
            as_of="2026-09-03T00:00:00Z",
            scan_function=lambda *_args, **_kwargs: changed,
        )
        self.assertEqual(result["status"], "transition-recorded")
        self.assertEqual(result["attentionStatus"], "current")
        self.assertEqual(result["notification"], {"shouldNotify": False, "kind": "inventory-change"})
        self.assertEqual(result["eventCount"], 2)

    def test_signal_and_state_semantic_tamper(self) -> None:
        portfolio = scan_portfolio(self.source, openssl_path=self.openssl, as_of="2026-09-02T00:00:00Z")
        signal = build_monitor_signal(portfolio)
        tampered = deepcopy(signal)
        tampered["summary"]["chainCount"] = 2
        tampered["signalFingerprint"] = __import__("backend.receiver_governance_archive_lifecycle_monitor", fromlist=["monitor_signal_fingerprint"]).monitor_signal_fingerprint(tampered)
        with self.assertRaises(ValueError):
            build_monitor_signal({"not": "a portfolio"})
        from backend.receiver_governance_archive_lifecycle_monitor import validate_monitor_signal
        with self.assertRaisesRegex(ValueError, "數量"):
            validate_monitor_signal(tampered)

        result = self.monitor_run("2026-09-02T00:00:00Z")
        state = deepcopy(result["monitor"])
        state["boundary"]["pagesPublication"] = True
        state["monitorFingerprint"] = monitor_state_fingerprint(state)
        with self.assertRaisesRegex(ValueError, "責任邊界"):
            validate_monitor_state(state)


if __name__ == "__main__":
    unittest.main()
