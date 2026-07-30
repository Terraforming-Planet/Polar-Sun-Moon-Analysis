# Scientific True-Scale Earth — architecture audit

## Scope

This audit covers the current web globe implementation before adding scientific imagery assets or opening the final pull request.

## Current frontend architecture

- The web client is a React + TypeScript application built with Vite.
- Three.js is used directly. The project does not currently depend on `@react-three/fiber` or `@react-three/drei`.
- `web/src/RealisticEarthGlobe.tsx` owns the WebGL renderer, scene, camera, OrbitControls, model selector, marker meshes, resize handling and disposal.
- `web/src/main.tsx` supplies the selected UTC and hazard markers to `RealisticEarthGlobe`.
- `web/src/stable-earth-globe.css` provides the responsive shell, canvas sizing and model selector styles.

## Existing model modes

The current component already exposes two internal modes:

1. `legacy` — a spherical geometry.
2. `scientific` — the same sphere mesh scaled on the Y axis by the WGS84 polar/equatorial radius ratio.

The default is `scientific`, persisted through `web/src/lib/earthPreferences.ts` and localStorage.

Current visible labels are temporary English engineering labels (`Scientific WGS84`, `Legacy sphere`) and must be replaced with the requested model-comparison labels:

- `Dotychczasowy model`
- `Naukowy globus — rzeczywiste proporcje`

This selector is a model selector, not a language selector.

## Geographic coordinate model

`web/src/lib/wgs84.ts` is already the central geographic conversion module.

It currently provides:

- WGS84 semi-major axis: 6,378,137 m;
- WGS84 semi-minor axis: 6,356,752.314245 m;
- inverse flattening: 298.257223563;
- geodetic latitude/longitude to Three.js Cartesian conversion;
- +Y as north, +Z as Greenwich and +X as 90°E;
- validation for latitude and longitude ranges.

`web/src/lib/wgs84.test.ts` already checks Greenwich, 90°E, both poles, ±180°, WGS84 constants and finite positions for London, Warsaw, Cairo, Cape Town, Tokyo, Sydney and New York.

## Rendering and lifecycle

The globe currently creates one Three.js `WebGLRenderer` inside a React effect. The effect is recreated when the selected model, marker array or auto-rotation option changes.

Positive findings:

- one active renderer at a time;
- explicit geometry and material disposal;
- OrbitControls disposal;
- resize fallback when ResizeObserver is unavailable;
- constrained device pixel ratio for mobile stability;
- a visible WebGL error fallback instead of a blank page.

Risks requiring correction:

- switching model recreates the renderer and resets camera position;
- changing marker data also recreates the complete renderer;
- markers are parented to a rotated Earth mesh while their coordinates are calculated in the unrotated geographic frame, so geographic alignment must be verified before textures are introduced;
- the Earth mesh has a fixed visual rotation that is not yet documented as a texture-orientation correction;
- the scientific ellipsoid is currently produced by scaling a sphere mesh, while marker coordinates use geodetic ellipsoid conversion. The surface and marker relationship needs explicit tests;
- no texture loading state, fallback chain or GPU texture disposal exists yet because the current globe is colour-only;
- lighting direction is fixed and is not yet derived from the selected UTC or existing solar data.

## Imagery and texture status

The currently deployed stable globe does not load an external Earth surface texture. It renders a blue material, wireframe grid, atmosphere and event markers.

No scientific imagery asset should be described as integrated until all of the following are known and documented:

- institution and dataset name;
- product type: single full-disk image, multi-orbit mosaic, cloud-free composite or processed visualization;
- projection and geographic extent;
- pixel dimensions and effective ground resolution;
- observation date or compositing interval;
- licence or reuse terms;
- static optimized asset path used by GitHub Pages;
- expected memory cost for Low, Medium, High and Ultra quality.

The preferred base-surface format is a global equirectangular texture or an equivalently documented scientific mosaic. A six-face cubemap is optional and should be used only if it improves rendering quality without weakening geographic traceability.

## GitHub Pages and asset paths

`web/vite.config.ts` sets:

```text
base: /Polar-Sun-Moon-Analysis/
```

Runtime asset URLs must therefore use `import.meta.env.BASE_URL` or Vite-managed imports. Hard-coded root paths such as `/textures/earth.webp` would break on GitHub Pages.

The production build output is `web/dist`. Existing repository automation publishes a generated web build to the repository Pages output. The exact workflow files still need to be included in the final PR audit after the branch is rebased on the latest `main` and all active workflows are enumerated.

## Test architecture

Available web commands:

```bash
npm test
npm run build
```

Vitest is installed. There is no Playwright or Cypress dependency in the current `web/package.json`, so true browser E2E and screenshot verification are not yet available in the web package. Adding an E2E runner must be weighed against repository complexity and CI time.

Required additions before the final PR:

- component tests for model switching and localStorage;
- camera-state preservation test or an extracted camera-state unit test;
- texture fallback and source registry tests;
- static asset existence checks using the GitHub Pages base path;
- browser-level mobile and desktop smoke checks;
- checks for both pole presets and the ±180° seam;
- repeated switching test without WebGL context loss.

## Recommended implementation sequence

1. Stabilize the renderer architecture so model changes do not recreate the camera or WebGL renderer.
2. Rename and harden the model selector with keyboard and ARIA state.
3. Add typed Earth layer/source definitions and an imagery provenance registry.
4. Integrate one legally reusable, optimized scientific base mosaic with a colour-only fallback.
5. Verify geographic orientation using known control points and visible markers.
6. Add pole and regional camera presets.
7. Add optional clouds, night lights, atmosphere, grid and terminator as independent layers.
8. Add quality levels and lazy texture loading.
9. Run full Python and web validation, browser checks and GitHub Pages asset checks.
10. Open the final PR only after screenshots and deployed-path validation are complete.

## Non-regression constraints

The implementation must not alter unrelated JPL Horizons data, polar analysis results, hazard source records, flood products or other scientific datasets. The legacy globe must remain available throughout the work.
