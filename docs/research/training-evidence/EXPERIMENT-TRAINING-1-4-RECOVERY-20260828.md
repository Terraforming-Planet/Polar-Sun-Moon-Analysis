# Scientific Experiment Record — Training #1–#4 Evidence Recovery

**Project:** Terra Observation System  
**Repository:** `Terraforming-Planet/Polar-Sun-Moon-Analysis`  
**Recovery date:** 2026-08-28/29 UTC  
**Execution environment:** original Windows NVIDIA L4 VM used for the historical training runs  
**Purpose:** recover, verify, classify, and preserve the surviving evidence for Training #1–#4 without modifying the original run artifacts.

## Research question

Can the original training evidence for Training #1, #2, #3 and Training #4 (Session A + Session B) be recovered from the original Windows NVIDIA L4 machine with a non-destructive process, and which parts can be verified cryptographically?

## Recovery protocol

The recovery process was restricted to non-destructive operations: READ, COPY, HASH, and ARCHIVE. No training was started. No historical checkpoints or evidence files were deleted, reset, cleaned, or overwritten.

The recovery first checked the known repository locations:

- `C:\TP\Polar-Sun-Moon-Analysis`
- `C:\Users\xodobrox\Polar-Sun-Moon-Analysis`

It then checked relevant `research_runs`, archive, Desktop, Documents, Downloads, PowerShell history/transcript-related locations, temporary locations, and finally performed a controlled read-only search of accessible `C:\` locations while excluding irrelevant system/dependency/cache trees where practical.

## Recovery-script failure and repair

The initial recovery script failed with:

`Invoke-Expression: Argument types do not match`

The failure was traced to Windows PowerShell 5.1 handling of a `List[object]` through an array-wrapping expression. The affected expressions were changed to use `.ToArray()`. A smoke test passed before the full export was repeated.

## Final evidence classification

| Run | Final status | Evidence result |
|---|---|---|
| Training #1 | **FULL-ARCHIVE-VERIFIED** | Historical `FULL_LOGS` archive physically recovered and SHA-256 matched the known reference value. No original target-session raw console/transcript was found. |
| Training #2 | **PARTIAL-EVIDENCE** | Supporting archive/structured evidence recovered, but no independent known archive hash and no original target-session raw console/transcript was found. |
| Training #3 | **FULL-ARCHIVE-VERIFIED** | Historical `FULL_LOGS` archive physically recovered and SHA-256 matched the known reference value. No original target-session raw console/transcript was found. |
| Training #4 — Session A | **METADATA-ONLY** | Summary/checkpoint metadata were physically verified, but no original target-session raw console/transcript was found. |
| Training #4 — Session B | **PARTIAL-EVIDENCE** | Summary/checkpoint/full-artifacts evidence was physically verified, but no original target-session 60-minute raw console/transcript was found. |

## Known historical archive verification

### Training #1

Recovered archive:

`20260819T202428Z_FULL_LOGS.zip`

Verified SHA-256:

`71B44F6151BBB8992795A144CC222C7A5D7E7D244A6183DED1758D1F230571212`

Result: **MATCH**

### Training #3

Recovered archive:

`stream_gibs_20260820T013036Z_FULL_LOGS.zip`

Verified SHA-256:

`40128DD94E8AEF7282835387625DEF270CF0F34F261775683C603EBFFD7F9F08`

Result: **MATCH**

## Training #4 evidence notes

Training #4 consists of exactly two 60-minute sessions and must not be renumbered as Training #5.

For the verified Training #4 evidence, the recovery identified session summaries/checkpoints and supporting artifacts. The original target-session raw stdout/stderr stream was not found for either Session A or Session B.

A file named `FULL-CONSOLE-RECOVERED.txt` exists for Session B, but it contains a later clipboard-recovery command and is **not** the original 60-minute training stdout. A `FULL-CONSOLE.log` also exists, but it is a later transcript displaying summary information, not the original training console. Screenshot-derived console reconstruction is retained only as auxiliary evidence and must never be described as an original raw transcript.

Genuine console files from separate Training #4 precursor/blocked streaming attempts were found, but they do not belong to the two target Training #4 sessions and are therefore classified separately.

## Final local evidence package

Final status-revised ZIP:

`TERRA_FULL_TRAINING_LOGS_1-4_20260828T222239Z_STATUS-REVISED_20260828T222804Z.zip`

Verified size:

`380,337,534 bytes`

Fresh SHA-256:

`e75984859da68292008f3f35ae1113bd94132c5e250ae432d48db56ba8e77175`

The companion `.zip.sha256.txt` contained the same SHA-256 and filename. The archive verification reported 239 entries and zero internal hash failures.

## Provenance limitations

The final read-only search did **not** find the original target-session raw console/transcript for Training #1, Training #2, Training #3, Training #4 Session A, or Training #4 Session B.

PowerShell history proves that relevant commands were invoked but does not preserve stdout/stderr. Codex session history, precursor logs, screenshot reconstructions, and later recovery transcripts are command/recovery history or auxiliary evidence and are not treated as original target-session console evidence.

Therefore, no reconstruction or precursor log is labeled as a full raw training log.

## Scientific interpretation

This recovery experiment demonstrates two different levels of reproducibility evidence:

1. **Cryptographically verified archival evidence** exists for Training #1 and Training #3.
2. **Incomplete provenance chains** remain for Training #2 and both Training #4 sessions because the original target-session console streams were not persisted or could not be recovered.

A run may still provide useful scientific artifacts, metrics, summaries, validation results, or checkpoints, but without the full evidence package it must not be presented as fully reproducible from raw execution evidence.

## Evidence standard established by this experiment

Future long GPU experiments must create the evidence directory and logging before compute begins. At minimum they should preserve:

- immutable run/session ID;
- complete stdout/stderr;
- PowerShell transcript where applicable;
- exact command line;
- Git SHA and branch;
- dataset/source/provenance manifests;
- Python/PyTorch/CUDA/dependency versions;
- `nvidia-smi` before and after execution;
- periodic metrics and failure/retry records;
- validation results;
- checkpoint and checkpoint SHA-256;
- final evidence manifest and archive SHA-256.

If logging initialization, smoke testing, or evidence initialization fails, a long training run must not start.

## Publication/security boundary

This document publishes the verified scientific recovery result and cryptographic identifiers only. The raw recovered evidence ZIP is **not** committed here because raw logs must first be reviewed for API keys, tokens, credentials, `.env` values, private data, and other secrets before public release.

## Conclusion

The recovery was successful in preserving and verifying a substantial portion of the historical evidence, including exact historical archive matches for Training #1 and Training #3. It also established, rather than concealing, the key limitation: original target-session raw console output was not recoverable for Training #1–#4 from the accessible locations on the original L4 machine.

That limitation is part of the scientific record.
