# Sahara Station — research note, iteration 13

## Scope

This iteration connects the live mountain/valley editor to a separate hypothetical DEM-delta layer and compares hydrologic routing **before** and **after** the scenario. The source elevation remains the public Copernicus DEM sample. The scenario is derived in memory and is never written back into the source values.

## Observation layer

The observation layer is the sampled Copernicus DEM tile covering the Sahara Station point at 23.515002°N, 11.998501°E. The browser reads a 33×33 sample from the public Cloud Optimized GeoTIFF used by the existing regional DEM module.

The live Three.js editor is instrumented without changing the geometry engine itself. The registry records the actual current positions, rotations, dimensions, object type and 1:1 material pairing of the mountain and valley groups. Moving an object therefore changes the next scenario calculation because the comparison reads the live object positions at calculation time.

## Scenario layer

For every DEM sample cell, the code evaluates a trapezoidal footprint matching the editor geometry:

- mountain → positive elevation delta,
- valley → negative elevation delta,
- plateau/bottom → full requested height/depth,
- side walls → linear transition between top/bottom and outer base.

Overlapping hypothetical edits are summed. The source DEM array is first copied, and only the copy receives the deltas.

The exported field `sourceDemMutated` must remain `false`. A `true` value is treated as a software error rather than a scientific result.

## Before/after hydrology

Both the source and scenario grids are passed through the same Priority-Flood and D8 routing sequence. The comparison records:

- changed D8 receiver fraction,
- dominant-watershed fraction before and after,
- maximum flow accumulation before and after,
- distance between dominant outlets,
- principal drainage-path length before and after,
- path agreement within 5 km,
- number and fraction of DEM cells affected by the hypothetical delta.

The scenario flow helper intentionally accepts the large hypothetical elevation range used by the editor instead of clipping kilometre-scale valleys to the normal physical range of the source Copernicus DEM. This is a numerical scenario capability; it is not a claim that such terrain exists or should be constructed.

## Volume accounting

Two different volume concepts are retained and must not be confused:

1. **Design volume** — exact analytical frustum volume from the editor and the 1:1 cut/fill material bank.
2. **Rasterized diagnostic volume** — elevation delta multiplied by the coarse 33×33 cell area.

The rasterized value is resolution-dependent and is not used to replace the design-volume balance.

## Current conclusion

The project can now ask a reproducible question on real topography: **if this exact hypothetical mountain/valley configuration were superimposed on the sampled DEM, how would the D8 routing result change?**

A change in outlet, watershed or D8 path is a result of this numerical terrain experiment only. It is not a prediction of rainfall, groundwater response, erosion, geotechnical stability, ecological outcome or real-world feasibility.

## Next step

The next useful extension is to apply the same immutable-source / derived-scenario architecture to a larger 3×3 DEM mosaic and to selectable locations such as the Himalaya/Tibet experiment. That will reduce single-tile boundary effects and allow direct comparison of multiple terrain scenarios without modifying any official source dataset.
