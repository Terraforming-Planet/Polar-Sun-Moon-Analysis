# CODEX TASK — multi-turn research chat + satellite image display

Repository: https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis

## Goals

1. Fix the research-chat HTTP 400 that appears after the first answer.
2. Allow users to ask an unlimited number of questions during the current browser session. The UI may keep all session turns while the API transport uses a safe rolling recent-context window.
3. Let the chat show the exact currently loaded official/public satellite image when the user asks for an image, and offer a “show current satellite image” control on normal answers when an image is available.
4. Never fabricate satellite imagery, URLs, dates or sources.
5. Preserve the project privacy rule: raw user prompts remain session-only and are not archived.

## Required implementation

- Serialize previous assistant turns in a Responses-API-compatible way. Do not send assistant history as `input_text` content parts intended for user input.
- Keep a rolling recent context window rather than rejecting later turns.
- Add a frontend enhancement that can reuse the official satellite image already loaded in the current terrain-study UI. Prefer a requested year if the question names one; otherwise prefer the active scale-locked terrain image, then the active official context image.
- Clicking the image card must open the exact image URL currently used by the page.
- If the user explicitly asks for an image/satellite view, expand the image automatically. Otherwise show a compact button if imagery is available.
- Keep exact-date mode semantics unchanged: exact time means original observation, clouds preserved.

## Validation

Add tests for:
- a second/third chat turn containing prior assistant history;
- rolling context window without a one-question cap;
- image-request keyword/year detection;
- existing privacy and attachment limits.

Do not merge until CI, PR Validation, Validate web application and Validate Terra Observation Planet Site are green.
