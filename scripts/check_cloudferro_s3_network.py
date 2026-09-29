#!/usr/bin/env python3
"""Read-only, credential-free WAW3-2 IPv4/IPv6 HTTPS diagnostic.

Run on the actual data-processing host. This does not configure an S3 client,
change the firewall, or certify authenticated access to any bucket.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

ENDPOINT = "https://s3.waw3-2.cloudferro.com/"


@dataclass(frozen=True)
class ProbeResult:
    family: str
    transport_reachable: bool = False
    expected_s3_response: bool = False
    http_status: int | None = None
    error: str | None = None


def probe(ip_version: int) -> ProbeResult:
    """Check one family without credentials, redirects, or persistent changes."""
    if ip_version not in (4, 6):
        raise ValueError("ip_version must be 4 or 6")
    family = f"ipv{ip_version}"
    curl = shutil.which("curl")
    if curl is None:
        return ProbeResult(family, error="curl_not_installed")
    command = [
        curl,
        "--disable",  # Must be first: do not load a user's .curlrc.
        f"--ipv{ip_version}",
        "--proxy", "",  # Direct-origin test, not a test of a proxy's IP family.
        "--noproxy", "*",
        "--proto", "=https",
        "--head",
        "--silent",
        "--show-error",
        "--connect-timeout", "5",
        "--max-time", "12",
        "--output", os.devnull,
        "--write-out", "%{http_code}",
        "--url", ENDPOINT,
    ]
    try:
        completed = subprocess.run(
            command, capture_output=True, text=True, check=False, timeout=15,
        )
    except subprocess.TimeoutExpired:
        return ProbeResult(family, error="process_timeout")
    except OSError:
        return ProbeResult(family, error="curl_execution_failed")
    text = completed.stdout.strip()
    status = int(text) if len(text) == 3 and text.isascii() and text.isdigit() else None
    reachable = completed.returncode == 0 and status is not None and 100 <= status <= 599
    expected = reachable and status is not None and (200 <= status < 300 or status in (401, 403))
    if completed.returncode:
        error = {
            6: "dns_or_address_family_unavailable",
            7: "connection_failed",
            28: "network_timeout",
            35: "tls_handshake_failed",
            60: "tls_certificate_verification_failed",
        }.get(completed.returncode, f"curl_exit_{completed.returncode}")
    elif not reachable:
        error = "invalid_http_response"
    elif not expected:
        error = "unexpected_http_status"
    else:
        error = None
    return ProbeResult(family, reachable, expected, status, error)


def requirement_met(results: list[ProbeResult], require: str) -> bool:
    """Evaluate only unauthenticated endpoint response, never bucket access."""
    passed = {result.family for result in results if result.expected_s3_response}
    if require == "both":
        return {"ipv4", "ipv6"}.issubset(passed)
    if require == "either":
        return bool(passed)
    if require not in ("ipv4", "ipv6"):
        raise ValueError("Unknown address-family requirement")
    return require in passed


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--require", choices=("ipv4", "ipv6", "either", "both"), default="ipv4",
        help="Required probe result; this does NOT change the application's network settings.",
    )
    args = parser.parse_args(argv)
    results = [probe(4), probe(6)]
    passed = requirement_met(results, args.require)
    print(json.dumps({
        "schema_version": 1,
        "checked_at_utc": datetime.now(UTC).isoformat(),
        "endpoint": ENDPOINT,
        "scope": "direct_egress_from_this_runtime_only",
        "proxy_used": False,
        "required_family": args.require,
        "probe_requirement_met": passed,
        "authenticated_bucket_access_tested": False,
        "production_configuration_changed": False,
        "results": [asdict(result) for result in results],
        "notice": (
            "HTTP 401/403 proves an HTTPS response, not permission to read data. "
            "An IPv4 pass does not force IPv4 in any application. "
            "Verify the real authenticated client from its own runtime."
        ),
    }, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
