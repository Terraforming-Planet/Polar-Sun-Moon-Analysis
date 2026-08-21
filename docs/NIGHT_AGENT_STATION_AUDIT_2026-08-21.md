# Terra Observation — Night-agent station audit (2026-08-21)

This document tracks the current verified state of the four specialist research stations and the main Simple/Advanced 3D flow. It is intentionally conservative: a feature is marked **verified** only when it is present in the current repository or was merged through a tested PR. Scientific claims remain tied to official/public data provenance.

## Current baseline

- Repository baseline at audit start: `main` after the automated official hazard-feed refresh on 2026-08-21.
- Ocean Research Station repair landed through PR #202 and is present in current `main`.
- Simple-mode redesign from issue #200 was implemented and locally tested twice by Codex, but the implementation commit was not pushed from the Codex sandbox and the literal patch was not preserved. It therefore remains **not deployed** and must be rebuilt on a hosted branch before merge.
- Shared AI Station Builder / portable workspace work from issue #203 was locally implemented and tested by Codex, but likewise was not pushed from the sandbox. It remains **not deployed** until recreated on a real branch and verified by hosted CI.

## Audit matrix

| Area | 3D model / canvas | Move / zoom / select | Lighting / visibility | Save / load / export | AI builder | Current status / next action |
|---|---|---|---|---|---|---|
| Ocean Research Station | Present: procedural ocean-floor WebGL/bathymetry sandbox | **Verified repaired** by PR #202: orbit/drag, pan, zoom/touch and safer selection/numbered annotations | Improved by PR #202; scene remains explicitly synthetic where appropriate and must not imply bathymetric precision beyond source data | **Verified repaired** by PR #202 with browser-local save/load and JSON export; private prompts excluded | Not yet hosted | Keep regression coverage from #202; next hosted change should add the shared builder without regressing controls |
| Arctic Research Station | Existing public station and 3D research content present in `docs/arctic-90n/` | Needs targeted runtime regression check on current mobile/desktop build | Needs explicit default-lighting/reset audit | No shared portable workspace verified on hosted `main` | Not yet hosted | Recreate #203 work as a focused hosted PR, then smoke-test public page |
| Sahara Research Station | Existing public station / Sahara 3D research workspace present | Existing controls need current-main runtime regression check after many iterations | Needs explicit reset-lighting / minimum workspace verification | No shared portable workspace verified on hosted `main` | Not yet hosted | Recreate #203 work and keep existing DEM/scenario provenance intact |
| Earth–Space 512 Station | Existing constellation / Earth–Space 512 material present | Needs current mobile/desktop interaction audit and non-zero canvas check | Needs explicit readable default lighting / reset path | No shared portable workspace verified on hosted `main` | Not yet hosted | Recreate shared workspace/assistant and verify it does not alter scientific geometry/evidence rules |
| Simple mode | Existing Simple/Advanced shell and current research tools | Existing 3D Earth remains the high-resolution reference context | Existing globe must retain fallback and avoid blank canvases | Assistant findings can be saved according to current privacy rules; raw prompt must remain session-only | Existing assistant architecture present, but requested summary-first redesign not deployed | Issue #200 is blocked by lost sandbox patches. Rebuild directly on a GitHub-hosted branch, then run full CI/Pages/Worker gates |
| Advanced mode | Existing expert tools (DEM, flags, lines, profiles, reports) must remain intact | Preserve current expert interactions | Preserve existing controls | Preserve existing report/export paths | Existing OpenAI integration only where evidence-aware | Treat Advanced mode as a regression boundary while #200/#203 are recreated |

## Verified Ocean Station details from current source

The public Ocean Station exposes an interactive `#oceanViewer` WebGL workspace, controls for procedural mountain/trench pairs, grid/reset controls, scientific disclaimers, and explicit provenance/limitations text. The page distinguishes its procedural scenario from real bathymetry and does not claim that the synthetic scene is a real intervention or earthquake-control model.

The PR #202 repair added the user-facing interaction/persistence layer requested in issue #201. Any future shared builder must preserve those working controls and must not reintroduce click-selection while a user is dragging/panning.

## Highest-priority blockers

### 1. Issue #200 — Simple-mode redesign is not deployable yet

Codex produced locally tested implementations (`7de0616`, then rebuilt as `ddc335ef67d248fc91c0242f35951d492ae95e6e`) covering the Polish cosmic chooser, hero, session-only prompt handling, summary-first output, and four NASA GIBS context views. Both commits lived only in ephemeral Codex sandboxes. The exact patch was not preserved, so hosted GitHub CI never ran against that code.

**Required fix:** re-implement directly against current `main` using GitHub-hosted file/branch operations or another environment that can push. Do not merge a reconstructed approximation without full hosted checks.

### 2. Issue #203 — shared AI Station Builder is also sandbox-only

Codex reported a locally tested shared module (`terra-station-workspace/v1`) with prompt stripping, save/load/export, reset view/lighting and a shared assistant used by all four stations. That work was committed only in the sandbox as `19b23d5` and was not pushed.

**Required fix:** rebuild the shared module on a real branch. Preserve the intended scientific contract:

- OpenAI may explain selected official data, propose evidence checks, structure a station plan and draft reports.
- OpenAI must not invent coordinates, acquisition dates, sensor resolution, DEM/bathymetry values, water-loss magnitude, or causation.
- Raw prompts remain session-only and are never silently persisted to public archive/localStorage.
- Station editing and save/load/export must continue to work when OpenAI is unavailable.

## OpenAI additions worth keeping

The highest-value OpenAI uses for this project are evidence-aware rather than decorative:

1. explain selected markers/regions from already fetched official data;
2. compare selected dates/images and clearly separate observation from inference;
3. produce a missing-evidence checklist before a scientific claim is made;
4. guide station setup (layers, viewpoints, measurements) without fabricating measurements;
5. generate structured reports containing provenance, limitations and confidence;
6. answer natural-language questions over data already loaded into the workspace.

Every OpenAI response should fail gracefully and never block the core 3D/editor workflow.

## Merge gate for the next feature PRs

Do not merge unless the relevant checks are green:

- tracked-secret scan;
- Ruff;
- CI-scope MyPy;
- Pytest;
- Worker guardrail tests when Worker code changes;
- web unit tests and production build;
- PR Validation;
- Validate web application where the changed paths trigger it;
- full CI;
- after merge: GitHub Pages deployment/source-SHA verification and Worker deployment verification when touched.

## Next focused PR order

1. Rebuild #200 on a real hosted branch and verify full CI/deployment.
2. Rebuild #203 shared workspace/AI builder on a real hosted branch.
3. Runtime smoke audit Arctic/Sahara/Earth–Space 512 on mobile and desktop, fixing blank/missing 3D, undersized canvas and dark lighting one focused PR at a time.
4. Add further advanced-user tools only after existing interactions are stable.
