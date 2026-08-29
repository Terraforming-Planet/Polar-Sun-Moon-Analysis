# CODEX TASK — Terra native ForgeMCP integration

Repository: Terraforming-Planet/Polar-Sun-Moon-Analysis
Branch: forgemcp-native-integration

Goal: complete the ForgeMCP WebMCP Challenge integration in the existing Terra public application without rebuilding or breaking Terra.

## Required implementation

1. Audit current branch/main including merged PR #254.
2. Add a real native **ForgeMCP** tab to the existing React Advanced View tab system in `web/src/main.tsx` (or a clean component imported there). Do not rely only on the floating/shortcut button.
3. The ForgeMCP tab must visibly explain:
   - ForgeMCP — Multi-Agent Research & Game Studio;
   - Observe the Real World · Learn & Compete · Create · Verify;
   - Terra is a pre-existing real Earth-observation laboratory; ForgeMCP is new WebMCP Challenge work;
   - architecture: HUMAN → FORGEMCP COORDINATOR → SPECIALIST AGENTS → WEBMCP TOOLS → TERRA → REAL DATA / DETERMINISTIC ANALYSIS → VERIFICATION → HUMAN DECISION;
   - current truthful statuses: WebMCP foundation/runtime detection/registerTool path implemented where supported; `search_location` via OpenStreetMap Nominatim and `find_observations` via NASA EONET are initial/partial tool boundaries; further Terra tools are not to be claimed connected until they really are;
   - scientific classes: OBSERVATION, ANOMALY, HYPOTHESIS, PRELIMINARY RISK ALERT, VERIFIED FINDING, INSUFFICIENT DATA;
   - preliminary alerts require independent/field verification as appropriate.
4. Add buttons/links to:
   - https://github.com/Terraforming-Planet/ForgeMCP-Multi-Agent-Research---Game-Studio
   - the existing Terra `/forgemcp/` page;
   - Cube Chess public app: https://teslaeco.github.io/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/
5. Keep the existing `/forgemcp/` page working and add clear cross-links between Terra, ForgeMCP and Cube if missing.
6. Update the existing `README.md` near the top. DO NOT replace, shorten or delete existing content. Add section:

   `## ForgeMCP — Multi-Agent Research & Game Studio`

   Explain that Terra predates the Challenge and that new Challenge work is WebMCP integration, agent-facing tools, orchestration, verification and human control. State that real data, provenance and deterministic analysis remain authoritative. Include the ForgeMCP repository and public `/forgemcp/` URL.
7. Preserve all existing scientific claims and guardrails. Do not invent a connected tool, environmental finding, partnership, alert, benchmark result or integration state.
8. Mobile/responsive behavior must remain usable.
9. ZERO secrets. Do not modify credentials, `.env`, API keys or tokens.

## Verification

Run the repository's normal web validation. At minimum run the commands used by existing CI for the web application (install/typecheck/tests/build as appropriate). Run the tracked-secret scan if available.

Do not modify this brief or `.github/workflows/forgemcp-native-one-shot.yml`.

Finish with a clean implementation on this branch. Do not merge main yourself; the caller will open/merge the PR after required CI passes.