# Privacy by design

This project analyzes environmental phenomena, not people.

The public processing boundary prohibits face recognition, number-plate recognition, person
tracking and vehicle tracking. Public layers should contain environmental derivatives rather than
unfiltered high-resolution household imagery.

`PrivacyFilter` removes public point observations that fall within protected building polygons.
In strict mode, the default, all known building footprints are protected. In residential mode,
`residential`, `house`, `apartments` and `dormitory` features are protected. Unknown building types
remain protected in strict mode.

Building masks must be applied before a public derivative is stored or published. The implementation
includes a regression test proving that a point inside an unknown building is removed in strict mode.
Raster integrations added later must apply an equivalent no-data mask before export.

No privacy filter can make an unrestricted raw image private. Access control, resolution limits,
data minimization, audit logs and licensing requirements remain necessary.
