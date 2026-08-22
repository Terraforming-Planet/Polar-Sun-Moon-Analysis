# Terra Observation System — final BUILD FOR GOOD audit

Date: 2026-08-22

## Executive assessment

Terra Observation System has a strong BUILD FOR GOOD story because the project is not a generic chatbot or a decorative globe. Its central workflow is environmental investigation using official/public Earth-observation evidence, with OpenAI used as an explanation and research-assistance layer rather than as a substitute for measurements.

The strongest contest narrative is:

> **Help communities, researchers, students, NGOs and environmental teams investigate water loss, changing rivers and lakes, drylands and hazards using official satellite evidence, an interactive 3D Earth and an evidence-grounded OpenAI assistant.**

### Current readiness after this hardening branch

| Area | Assessment | Notes |
|---|---:|---|
| Public-good purpose | 9.5 / 10 | Clear benefit for water, land, environmental research and preparedness. |
| Technical ambition | 9.2 / 10 | 3D Earth, multi-source EO data, Cloudflare Worker, OpenAI, DEM, hydrology and published L4 work. |
| Scientific honesty | 9.4 / 10 | Evidence classes, provenance, limitations and explicit separation of observation vs hypothesis. |
| OpenAI relevance | 8.8 / 10 | OpenAI receives bounded evidence and explains/researches it instead of manufacturing measurements. |
| First-minute judge clarity | 8.4 / 10 | Strong once the judge starts in Simple research mode; still a large platform with many modules. |
| Mobile reliability | 8.2 / 10 | Responsive layout is good; satellite-card delivery was the highest visible risk and is addressed by this patch. |
| Language consistency | 8.8 / 10 | Main contest UI and same-origin embedded tabs are normalized to English by the contest runtime. |
| Submission readiness | **8.8 / 10 code-level** | Final score depends on green CI and deployed smoke verification. |

## Critical issue found from the final mobile screenshot

The most damaging visible problem was a **black satellite-image card** even though the card metadata and source label were present. In a 60–90 second judge review, a black evidence card can make the application look broken even when the underlying analysis pipeline is working.

### Root causes / risk factors

1. Browser cards used direct upstream image URLs even though the project already had an allowlisted `/research/image` Worker endpoint.
2. The newest NASA GIBS daily observation can still be incomplete while upstream products are publishing.
3. A successful HTTP image response can still contain an effectively black frame, so `onerror` alone is not sufficient.
4. The gallery could expose too many cards relative to the intended Simple/Advanced experience.

### Hardening implemented

- NASA GIBS, Copernicus/CDSE and USGS Landsat browser images are routed through the existing allowlisted Evidence Worker image stream when the Worker URL is configured.
- The Worker streams official upstream bytes and adds provenance/delivery headers; it does **not** generate satellite imagery.
- The browser keeps a direct official-source fallback.
- Daily NASA GIBS display is clamped away from the newest two UTC days.
- For GIBS daily imagery, the browser can retry several earlier official dates if a loaded image is almost entirely black.
- A true unavailable state replaces a permanently black image after retries are exhausted.
- Simple mode is limited to **4** visible satellite cards; Advanced mode is limited to **8**.
- OpenAI image inspection remains independently bounded to **4 quick / 8 deep** Worker-preflighted images.

## English-language audit

The public entry point is changed from `lang="pl"` to `lang="en"`.

A site-level contest runtime translates dynamically rendered UI labels and watches subsequent React mutations. It also applies the English pass to same-origin embedded research/station documents, which covers the tabs a judge reaches through the main application.

Scientific values, coordinates, dataset identifiers, URLs, proper nouns and user-entered content are not rewritten. Area-analysis OpenAI output is explicitly requested in English.

### Remaining language limitation

A legacy static HTML page opened directly by its standalone URL, outside the main contest application, may still contain historical Polish copy if that page does not load the contest runtime itself. This is not part of the primary judge path, but it is a reasonable post-contest cleanup item. The main application and same-origin tabs embedded through it receive the English pass.

## What judges should see first

The first review path should be intentionally short:

1. Open the live application.
2. Enter **AI Research / Research any place on Earth**.
3. Search a real location such as a lake, river reach or dryland area.
4. Show the **4-image Simple evidence view** with official NASA/Copernicus/USGS provenance.
5. Show the 3D Earth and the evidence-based analysis.
6. Ask one concrete OpenAI question about what is visible, uncertainty and what should be checked next.
7. If time remains, switch to **Advanced** to show up to 8 images, terrain/DEM tools, flags, river-flow direction and reports.

Do not lead with every research station or astronomy module. They are valuable depth, but the contest story is strongest when water, land and community protection are immediately understandable.

## Strongest evidence for the submission

- Public GitHub repository and public GitHub Pages demo.
- Official/public Earth-observation sources.
- Real NASA GIBS streaming L4 research with a published run covering 200,016 geospatial/time windows across 75 research regions.
- Reproducible experiment artifacts and provenance fields.
- OpenAI integration with scientific guardrails.
- Terrain laboratory with DEM/elevation tools and public hydrology direction logic.
- Clear long-term purpose: water resilience, river/lake monitoring, dryland research, environmental restoration research and hazard situational awareness.

## Remaining risks before submission

### Must pass

- CI
- PR Validation
- Validate web application
- Validate Terra Observation Planet Site

### Smoke checks after deployment

- Open the page on Android/mobile width.
- Search one real place.
- Confirm 4 cards are visible in Simple mode.
- Switch to Advanced and confirm up to 8 cards are visible.
- Confirm at least one NASA/Copernicus/USGS card shows real pixels instead of a black rectangle.
- Open Terrain laboratory and confirm its fallback/ready state is visible.
- Confirm the primary navigation and research interface are English.

## Submission recommendation

Submit the project as an **evidence-first environmental research and monitoring platform**, not as a claim that AI can automatically diagnose every environmental cause.

The strongest phrasing is that Terra Observation System helps people **find, compare and understand evidence earlier**, so water-system changes, dryland problems and hazards can be investigated before they become harder or more expensive to address.

That positioning is credible, technically supported by the repository, and directly aligned with BUILD FOR GOOD.
