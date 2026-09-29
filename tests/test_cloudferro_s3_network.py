"""Offline unit tests. No simulated result is published as live availability."""
from __future__ import annotations

import contextlib
import io
import json
import subprocess
import unittest
from unittest.mock import patch

from scripts.check_cloudferro_s3_network import ENDPOINT, ProbeResult, main, probe, requirement_met

MODULE = "scripts.check_cloudferro_s3_network"


class CloudFerroNetworkTests(unittest.TestCase):
    def completed_probe(self, code: int, status: str, family: int = 4) -> ProbeResult:
        completed = subprocess.CompletedProcess([], code, stdout=status, stderr="")
        with (
            patch(f"{MODULE}.shutil.which", return_value="curl"),
            patch(f"{MODULE}.subprocess.run", return_value=completed),
        ):
            return probe(family)

    def test_success_and_auth_required_are_not_authenticated_access(self) -> None:
        for status in ("200", "204", "401", "403"):
            with self.subTest(status=status):
                result = self.completed_probe(0, status)
                self.assertTrue(result.transport_reachable)
                self.assertTrue(result.expected_s3_response)
                self.assertIsNone(result.error)

    def test_redirect_and_service_failure_are_not_success(self) -> None:
        for status in ("301", "404", "429", "500", "503"):
            with self.subTest(status=status):
                result = self.completed_probe(0, status)
                self.assertTrue(result.transport_reachable)
                self.assertFalse(result.expected_s3_response)
                self.assertEqual(result.error, "unexpected_http_status")

    def test_dns_connection_timeout_and_tls_failures(self) -> None:
        for code in (6, 7, 28, 35, 60, 99):
            with self.subTest(code=code):
                result = self.completed_probe(code, "000")
                self.assertFalse(result.transport_reachable)
                self.assertFalse(result.expected_s3_response)
                self.assertIsNotNone(result.error)

    def test_error_code_cannot_be_hidden_by_http_status(self) -> None:
        self.assertFalse(self.completed_probe(60, "200").expected_s3_response)

    def test_invalid_response_is_not_success(self) -> None:
        for status in ("", "000", "garbage", "200\n200", "999"):
            with self.subTest(status=status):
                self.assertFalse(self.completed_probe(0, status).expected_s3_response)

    def test_missing_curl(self) -> None:
        with patch(f"{MODULE}.shutil.which", return_value=None):
            self.assertEqual(probe(4).error, "curl_not_installed")

    def test_process_deadline_and_os_errors(self) -> None:
        for error in (subprocess.TimeoutExpired("curl", 15), OSError("unavailable")):
            with (
                self.subTest(error=type(error)),
                patch(f"{MODULE}.shutil.which", return_value="curl"),
                patch(f"{MODULE}.subprocess.run", side_effect=error),
            ):
                self.assertFalse(probe(6).expected_s3_response)

    def test_command_is_bounded_direct_https_and_read_only(self) -> None:
        with (
            patch(f"{MODULE}.shutil.which", return_value="curl"),
            patch(f"{MODULE}.subprocess.run") as run,
        ):
            run.return_value = subprocess.CompletedProcess([], 0, stdout="403", stderr="")
            for family in (4, 6):
                probe(family)
                command = run.call_args.args[0]
                self.assertEqual(command[1], "--disable")
                self.assertIn(f"--ipv{family}", command)
                self.assertIn("--head", command)
                self.assertIn("=https", command)
                self.assertEqual(command[-1], ENDPOINT)
                self.assertEqual(command[command.index("--proxy") + 1], "")
                self.assertEqual(run.call_args.kwargs["timeout"], 15)
                for forbidden in ("--insecure", "-k", "--location", "--netrc", "--user"):
                    self.assertNotIn(forbidden, command)

    def test_ipv6_absence_does_not_fail_ipv4_transition_check(self) -> None:
        results = [ProbeResult("ipv4", True, True, 403), ProbeResult("ipv6")]
        self.assertTrue(requirement_met(results, "ipv4"))
        self.assertTrue(requirement_met(results, "either"))
        self.assertFalse(requirement_met(results, "ipv6"))
        self.assertFalse(requirement_met(results, "both"))

    def test_both_requires_two_successful_families(self) -> None:
        results = [ProbeResult("ipv4", True, True, 403), ProbeResult("ipv6", True, True, 403)]
        self.assertTrue(requirement_met(results, "both"))
        self.assertFalse(requirement_met([], "either"))

    def test_invalid_arguments(self) -> None:
        with self.assertRaises(ValueError):
            probe(5)
        with self.assertRaises(ValueError):
            requirement_met([], "unknown")

    def test_json_and_exit_codes_do_not_claim_live_application_readiness(self) -> None:
        for require, expected_code in (("ipv4", 0), ("both", 1)):
            output = io.StringIO()
            with (
                patch(f"{MODULE}.probe", side_effect=[
                    ProbeResult("ipv4", True, True, 403), ProbeResult("ipv6"),
                ]),
                contextlib.redirect_stdout(output),
            ):
                self.assertEqual(main(["--require", require]), expected_code)
            report = json.loads(output.getvalue())
            self.assertFalse(report["authenticated_bucket_access_tested"])
            self.assertFalse(report["production_configuration_changed"])
            self.assertFalse(report["proxy_used"])
            self.assertEqual(report["endpoint"], ENDPOINT)


if __name__ == "__main__":
    unittest.main()
