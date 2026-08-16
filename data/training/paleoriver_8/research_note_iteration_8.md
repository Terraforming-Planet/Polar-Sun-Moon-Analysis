# Iteration 8 — drainage stability across DEM extent

## Observation

The Sahara Station now compares hydrologic routing from two spatial extents around the same eight satellite-test locations: a single Copernicus DEM tile (~1°×1°, sampled 33×33) and a 3×3 Copernicus DEM mosaic (~3°×3°, stitched to 49×49). Both use numerically conditioned Priority-Flood terrain followed by D8 routing.

## New diagnostic

For each test the browser module records:

- bearing from the test centre to the dominant outlet in the 1° analysis,
- bearing from the test centre to the dominant outlet in the 3° mosaic,
- angular difference between those bearings,
- dominant-watershed fraction at both extents,
- absolute change in dominant-watershed fraction,
- maximum D8 accumulation at both extents.

A working model-quality label is then assigned:

- **stable**: direction change <= 45° and watershed-fraction change <= 0.15,
- **moderate**: direction change <= 90° and watershed-fraction change <= 0.30,
- **scale-sensitive**: larger disagreement.

These thresholds are engineering screening rules for model robustness. They are not geological criteria and they do not prove that a mapped linear feature is a paleoriver.

## Interpretation

A drainage interpretation that persists when the DEM extent is enlarged is less likely to be controlled only by the artificial edge of one elevation tile. A strong change in direction or watershed share is a warning that the 1° result should not be used as a stable basin-scale interpretation.

The preferred evidence chain remains:

**optical/SAR trace -> DEM morphology -> conditioned flow direction -> flow accumulation -> extent-stability test -> geology/sediment/field verification.**

## Water-storage relevance

For terrain-forming and water-storage experiments, stable convergence zones are better candidates for further study than isolated low points. This still does not provide reservoir capacity. Capacity and feasibility require unconditioned terrain geometry, outlet elevation, stage-area-volume relationships, infiltration, evaporation, sediment transport, geotechnical stability and environmental constraints.

## Next step

The next useful extension is to convert the extent comparison into spatial overlays: draw the 1° and 3° dominant drainage paths together on the regional 3D relief and export a training feature that expresses path agreement rather than only outlet-bearing agreement.
