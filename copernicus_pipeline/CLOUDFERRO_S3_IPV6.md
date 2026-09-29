# CloudFerro WAW3-2 S3: IPv6 readiness and rollback

## Maintenance and scope

The CREODIAS maintenance notice received on 2026-09-29 schedules dual-stack
activation for `s3.waw3-2.cloudferro.com` on **2026-10-08, 08:00-12:00 CEST**
(**06:00-10:00 UTC**). The provider does not announce removal of IPv4 or planned
S3 service downtime. This is a network-path change, not a bucket migration.
The date comes from the provider's customer notice; recheck provider updates
before the maintenance window. No private email content or credentials are
included here.

Repository audit at preparation time:

- `config/cdse.example.yaml` and `copernicus_pipeline/build_frame_manifest.py`
  use `stac.dataspace.copernicus.eu/v1`, not the affected endpoint.
- Repository code searches for `cloudferro`, `eodata`, `boto3` and `endpoint_url`
  found no matches before adding this diagnostic. This does **not** audit
  private environment variables, mounted storage, proxies, or external jobs.
- The pipeline README explicitly separates authenticated asset retrieval from
  the current public STAC manifest stage.

**Keep the existing Terra catalogue/data URLs unchanged.** Do not replace the
Copernicus STAC service or CDSE EO-data endpoint with the regional CloudFerro
object-storage address. Do not add unused environment variables and present
them as an active fix. No runtime network settings are changed by this update.

## Read-only check on the actual processing host

Requires Python 3.12+ and the `curl` executable on PATH (Linux or Windows).
Run from the repository root in the same VM/container used by the data job:

```bash
python scripts/check_cloudferro_s3_network.py
```

The tool checks IPv4 and IPv6 separately with HTTPS HEAD requests. It reads no
S3 credentials, does not list buckets or fetch imagery, follows no redirects,
and keeps certificate validation enabled. It deliberately bypasses proxy
environment settings **for this diagnostic only**, so each result measures
the origin address family. A proxy-required environment needs a separate test
of its actual proxied client; a failed direct-egress probe does not prove that
the proxy-based application is broken. Local curl configuration is disabled.
Each probe has a 5-second connect limit, 12-second curl limit and 15-second
subprocess watchdog.

JSON fields separate `transport_reachable`, `expected_s3_response`, and
`authenticated_bucket_access_tested` (always false). HTTP 401/403 can demonstrate
an HTTPS response but never proves permission to read a bucket. HTTP 3xx, 429,
and 5xx are not accepted as a successful S3 response; DNS, connection, timeout
and TLS failures remain explicit failures. No synthetic availability is used.

The default exit condition requires an acceptable **IPv4** response. IPv6 is
reported but is not required merely because the provider adds dual-stack:

```bash
python scripts/check_cloudferro_s3_network.py --require both
```

Use the stricter condition only when that host is supposed to support both
families. Missing IPv6 before activation is not evidence of an outage. Neither
command forces an address family in the application's real S3 client, nor does
a successful GitHub Actions probe certify a separate production VM.

## Preparing the real settings, only where this endpoint is in use

1. Inspect the running job's endpoint, S3 mounts and configured proxy without
   printing secrets. If none uses this hostname, record **not applicable** and
   leave the job unchanged. Audit private runtime configuration separately.
2. Run the diagnostic before and after the window from the processing host.
   Save results privately with their UTC timestamp; do not commit private
   environment/configuration dumps or authenticated request logs.
3. If IPv4 works but IPv6 is unavailable or unreliable, select IPv4 using the
   **actual client's documented per-request/per-job option**. With a curl-based
   job, use `--ipv4` on that job's existing command. Do not change unrelated
   jobs or disable IPv6 system-wide. Preserve the existing HTTPS hostname,
   credentials, bucket, signing and certificate checks. An endpoint-selection
   flag is not necessarily an IP-family selector; do not assume that it is.
4. For dual-stack operation, verify the host/container IPv6 route and matching
   outbound HTTPS firewall/security-group policy. Do not open all inbound IPv6
   traffic, weaken SSH/RDP rules, pin changing service IPs in `/etc/hosts`, or
   substitute an IP address for the HTTPS hostname.
5. With the real authenticated client, HEAD a known, authorized existing object
   or read a small known object and verify the result. An anonymous 403 is not
   a passed data-access test. Keep credentials in the existing secret store.

If the new IPv6 path fails, roll back **only the affected job's address-family
selection** to a verified IPv4 path, then repeat the authorized object check.
Do not reroute buckets to a different region or alter the Terra frontend.
After dual-stack is independently verified, any temporary IPv4-only override
can be removed and the same checks repeated.

## Offline regression test

```bash
python -m unittest discover -s tests -p test_cloudferro_s3_network.py -v
```

Mocks are confined to unit tests. Running the test suite does not contact S3
and must not be described as a live network or authenticated-data check.

## Primary references

- CREODIAS customer maintenance notice dated 2026-09-29 (schedule and hostname).
- Copernicus S3 documentation: `https://documentation.dataspace.copernicus.eu/APIs/S3.html`
- curl options and TLS/network behavior: `https://curl.se/docs/manpage.html`
