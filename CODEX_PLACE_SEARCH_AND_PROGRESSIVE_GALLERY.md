# CODEX TASK — Global place search + responsive multi-year satellite gallery

Repository: Terraforming-Planet/Polar-Sun-Moon-Analysis

## Goals

1. Fix global place search for names copied from Google/other map UIs, including diacritics/transliterations and small remote settlements such as `Moudéri, Senegal` and `Eyl, Somalia`.
2. Never reload or freeze the whole research page when the user presses **Zbadaj teren**. The OpenAI terrain analysis should complete independently from long historical-image collection.
3. In seasonal/multi-year mode, if the user requests N years, retrieve one official image for every requested year when an official browser-renderable scene exists. Example: 20 selected years => 20 yearly image slots/results, not a hidden external-catalogue workflow.
4. Load the multi-year gallery progressively after the core AI analysis, in small bounded batches, so the interface remains usable on mobile.
5. Keep the default cloud policy as lowest-cloud available; allow the user to switch to cloud-allowed mode.
6. Preserve official/public sources only and never invent imagery for missing years.
7. Keep OpenAI visual input bounded for responsiveness; do not claim that every annual gallery image was visually inspected unless it was actually supplied to the model.

## Required implementation

- Strengthen the Nominatim proxy with Unicode normalization, accent-free variants, comma/space variants, structured `city + country` fallback and country-aware ranking.
- Add a dedicated `/research/yearly-gallery` Worker route. It must accept a small batch of explicit years, season, AOI and cloud mode, then return one selected image/slot per requested year. Use bounded parallelism and per-upstream timeout.
- `/research/analyze` must no longer wait for dozens of per-year catalogue queries. It should perform the canonical fast AI terrain analysis only (plus the existing bounded evidence sample).
- The React client must start annual gallery loading only after the core analysis result is visible. Request years in small batches and append results progressively.
- The UI must show progress such as `8 / 20 roczników` and keep all navigation/scrolling responsive.
- Missing years must be explicit `brak używalnego obrazu`, never silently dropped.
- Add regression tests for remote/diacritic geocode variants, exact N-year gallery contract, bounded concurrency/timeout behaviour, and non-blocking analysis/gallery separation.

Do not merge with red CI.
