# CODEX TASK — Final BUILD FOR GOOD demo hardening

Repository: `Terraforming-Planet/Polar-Sun-Moon-Analysis`

## Goal
Make the public contest demo reliable enough for a short judge review: satellite imagery must not degrade into black cards, the research gallery must stay bounded, and the public UI must be consistently English.

## Required implementation

1. **Restore visible official imagery**
   - Route browser display of NASA GIBS, Copernicus Sentinel Hub/CDSE and USGS Landsat browse imagery through the existing allowlisted `/research/image` Worker endpoint.
   - Keep upstream provenance visible.
   - Stream the upstream response body; do not generate or replace satellite pixels.
   - Preserve a direct official-source fallback.
   - Detect near-black returned frames in the browser and retry an earlier NASA GIBS daily observation when appropriate.
   - Do not request the newest two UTC days from NASA GIBS for contest display because daily imagery may still be incomplete while upstream products are publishing.

2. **Gallery limits**
   - Simple mode: display at most **4** official satellite images.
   - Advanced mode: display at most **8** official satellite images.
   - Keep AI visual inspection bounded to 4 quick / 8 deep images.
   - Images used by OpenAI must still pass Worker preflight.

3. **English contest UI**
   - Main public document declares `lang="en"`.
   - Translate dynamically rendered public UI labels to English.
   - Apply the same translation pass to same-origin embedded research/station tabs.
   - Do not alter scientific measurements, proper nouns, source identifiers or user-entered data.
   - Area-analysis OpenAI output defaults to English for the public contest interface.

4. **Tests**
   - Assert English public entry point.
   - Assert 4/8 gallery policy.
   - Assert Worker image streaming/provenance headers.
   - Assert black-frame and recent-GIBS fallback guards are present.
   - Preserve existing Worker and web tests.

5. **Contest documentation**
   - Add a final page audit.
   - Update README with the final demo behavior.
   - Add a ready-to-paste Discord BUILD FOR GOOD submission.

## Safety / science rules
- Official/public sources only.
- No fabricated satellite imagery.
- No unverified environmental causation.
- No secrets in browser code or repository files.
- If imagery is unavailable, show that state clearly instead of a permanent black panel.

## Merge gate
Do not merge until CI, PR Validation, Validate web application and Validate Terra Observation Planet Site are green.
