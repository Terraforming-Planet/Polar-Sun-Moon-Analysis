# CODEX TASK — deterministic year-by-year terrain gallery

Repository: https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis

Goal: make the terrain study deterministic, fast and usable on mobile.

Requirements:
- `ostatnie 5 lat` must produce exactly 5 calendar-year slots/images;
- selected N years must immediately show N year cards (first 10 visible, the rest expandable);
- each year is fetched independently so one failing year cannot break the full batch;
- fetch years concurrently with a small safe concurrency limit;
- every yearly request has a hard timeout and becomes an explicit failed/missing card instead of an endless spinner;
- start yearly image loading immediately when the user submits the area, not only after the main `/research/analyze` AI response finishes;
- during multi-year research, hide the one-off adaptive observation-view card so it is not mistaken for the yearly result set and so its loader cannot dominate the UI;
- preserve exact-date mode unchanged: nearest original observation, clouds preserved;
- preserve the shared scale lock and original-source evidence;
- use the lowest-cloud official image / cloud-minimized Sentinel-2 where the Worker provides it;
- AI analysis must run in the background after study images become available and must never block the image gallery;
- ZIP/manifest export must describe the exact requested year count and returned images;
- do not merge until CI, PR Validation, Validate web application and Validate Terra Observation Planet Site are green.
