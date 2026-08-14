# 90°N Mini-Experiment Lab — calculation notes

Status: screening/demo only. These are simplified calculations used by the interactive web page, not CFD, FEM, geotechnical certification, tsunami forecasting, or a construction design.

## Shared geometry

The mountain is represented as a square frustum with base width `b`, summit width `t`, total height `h`, and water depth `d`.

Total volume:

`V = h/3 * (b² + b*t + t²)`

Width at sea level:

`b_w = b + (t-b)*(d/h)`

Submerged volume:

`V_s = d/3 * (b² + b*b_w + b_w²)`

Rock density used for screening: 2700 kg/m³. Seawater density: 1025 kg/m³.

## Experiment 1 — base-width sweep

For h=8 km, t=0.5 km, d=4 km:

| Base width | Volume | Rock mass | Mean effective base pressure | Mean flank angle |
|---:|---:|---:|---:|---:|
| 8 km | 182.0 km³ | 4.914×10¹⁴ kg | 51.0 MPa | 64.9° |
| 12 km | 400.7 km³ | 1.082×10¹⁵ kg | 49.7 MPa | 54.3° |
| 16 km | 704.7 km³ | 1.903×10¹⁵ kg | 49.0 MPa | 45.9° |
| 20 km | 1094.0 km³ | 2.954×10¹⁵ kg | 48.6 MPa | 39.4° |
| 24 km | 1568.7 km³ | 4.235×10¹⁵ kg | 48.4 MPa | 34.2° |

Important screening result: widening the base strongly reduces flank angle but only slightly reduces average base pressure because the required rock volume and mass increase rapidly.

## Experiment 2 — target flank angle

For a square frustum, a simple geometric base width for target flank angle `theta` is:

`b = t + 2h/tan(theta)`

This is geometry only. It is not a stability criterion.

## Experiment 3 — source excavation

If volume V is sourced from a circular excavation of diameter D, the mean excavation depth is:

`z = V / (π(D/2)²)`

This assumes a simple cylindrical-average excavation and ignores side slopes, unusable material, bulking, compaction, geology and environmental buffers.

## Experiment 4 — current drag proxy

The page uses a first-pass drag proxy:

`F = 0.5 * rho_water * Cd * A_projected * v²`

with `Cd=1.2` only as a screening coefficient. This is not CFD and should not be used as a structural design load.

## Experiment 5 — sea-ice encounter proxy

The page deliberately does not calculate ice force without an ice-mechanics model. It displays a dimensionless relative encounter index proportional to:

`I = b * v_ice²`

normalized to the baseline `b=8 km, v_ice=0.08 m/s`. It is a sensitivity visualization, not pressure, force, or failure probability.

## Experiment 6 — rapid-failure source volume

`V_failure = V * failure_fraction`

The result is only the amount of material hypothetically moving rapidly. Tsunami height cannot be inferred from this number alone. NOAA notes that landslide-tsunami generation depends on displaced material, motion speed and depth.

## Experiment 7 — static submerged-volume equivalent

For a pure thought experiment where submerged solid volume is added from outside the ocean basin:

`global_MSL_equivalent = V_s / ocean_area`

using ~361 million km² ocean area. If material is excavated from the same seabed, this simple displacement calculation is not a net sea-level model.

## Scientific references used by the risk screen

- NOAA — Tsunami Generation: Landslides.
- NSIDC — Science of Sea Ice / pressure-ridge definitions.
- USACE EM 1110-2-1902 — Slope Stability.
- USGS — submarine landslide / tsunami studies.
