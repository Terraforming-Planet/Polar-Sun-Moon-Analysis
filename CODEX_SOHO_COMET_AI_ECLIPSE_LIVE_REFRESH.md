# CODEX TASK — SOHO Comet AI + Eclipse Live Observatory Refresh

Repository: `Terraforming-Planet/Polar-Sun-Moon-Analysis`

## Goals

1. Finish the experimental comet pipeline with official/public SOHO/Helioviewer data and OpenAI Vision through the existing Cloudflare Evidence Worker.
2. Refresh `/eclipse-live/` after the 12 Aug 2026 total solar eclipse: preserve the 2026 experiment as an archive, add a live countdown to the next eclipse, selectable observation test areas, and official planetary-eclipse/occultation examples.
3. Keep scientific evidence classes separate: official observation, ephemeris/model output, AI interpretation, UI visualization.
4. Never claim a comet unless multiple time-separated frames support a moving compact candidate and the response reports uncertainty/provenance.

## Comet pipeline

Implement `POST /space/comet-candidates` in `cloudflare/evidence-worker`.

- Browser sends no arbitrary prompt or external URLs.
- Worker selects SOHO LASCO C2/C3 sources itself.
- Resolve three time-separated SOHO LASCO C2/C3 frames using public Helioviewer (`sourceId=4` C2, `sourceId=5` C3) and `getClosestImage`, then use `downloadImage` JPG URLs as OpenAI image inputs.
- Send six ordered images (C2/C3 at three timestamps) to the OpenAI Responses API.
- Use `input_image` and strict JSON Schema Structured Outputs.
- Ask the model to distinguish compact moving candidates from stars, planets, coronal streamers/CME structure, occulter/support geometry, compression artifacts and sensor noise.
- Output: `candidate`, `confidence`, `classification`, `trajectory`, `motion_evidence`, `instrument_agreement`, `frame_times_utc`, `limitations`, `requires_human_review`.
- Set `candidate=false` unless evidence persists across time and is consistent with motion. Result is only an AI candidate, never a discovery.
- Keep `OPENAI_API_KEY` server-side only; reuse origin/CORS policy and safe request bounds.
- Add Worker tests and frontend regression tests.

## Earth–Space 512 frontend

- Replace placeholder comet button with a call to the Worker endpoint.
- Show scan state, source frame times, confidence, trajectory summary, evidence/limitations and human-review requirement.
- Keep direct official SOHO C2/C3 links visible.
- Fail closed: if the Worker or frames are unavailable, display `no verified candidate asserted` rather than guessing.

## Eclipse Live refresh

Preserve `close.html`, `gallery.html` and the 12 Aug 2026 research context as an archived experiment.

Add an archive record for the 12 Aug 2026 total solar eclipse including the existing Olszówka/Gardeja test point, NASA GSFC Besselian-model role and Meteosat/GOES observation provenance. Never convert Cesium/model output into observation evidence.

Main `/eclipse-live/` becomes a current observatory dashboard:

- Countdown updates every second to the next eclipse after 21 Aug 2026: partial lunar eclipse, 28 Aug 2026, greatest eclipse 04:14:04 UTC (NASA GSFC Five Millennium Catalog).
- Also show next solar eclipse: annular, 6 Feb 2027, and next total solar eclipse: 2 Aug 2027.
- Clearly label countdown as time to greatest eclipse, not first contact.
- Add selectable observation/test areas based on NASA visibility regions, not weather promises. Include representative presets in the Americas, western Europe and western Africa plus the existing Olszówka test point.
- For each area show coordinates, region rationale and reminder that local Moon altitude/weather must be checked.
- Add NASA GSFC catalog/archive links.
- Add a 2026 archive panel linking CLOSE/night-IR and gallery/animation.

## Planetary eclipse / occultation section

Use only official NASA/JPL examples and label them as archive observations, not live predictions:

- Mars: Curiosity/Perseverance observations of Phobos/Deimos transits/solar eclipses.
- Jupiter: Juno/JunoCam observation of Io's shadow on Jupiter.
- Include official source links/credits; no third-party imagery.
- Explain that these are eclipses/transits at other planets, not future Earth solar-eclipse predictions.

## Architecture / quality

- `web/public` is the source copied into GitHub Pages; mirror only where tests require it.
- Prefer modular JS/CSS instead of a monolithic HTML file.
- Add tests for countdown event constants, source links, archive separation, Worker guardrails and endpoint routing.
- Run Ruff, MyPy, Pytest, Worker tests, web tests/build and PR validation.
- Do not merge with red CI.
