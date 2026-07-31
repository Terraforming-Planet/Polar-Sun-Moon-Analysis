export type EarthSourceKind =
  | 'geometry'
  | 'surface-mosaic'
  | 'night-lights'
  | 'cloud-layer'
  | 'terrain-model'
  | 'atmosphere-visualization'

export type EarthSource = {
  id: string
  label: string
  institution: string
  kind: EarthSourceKind
  productType: string
  resolution: string
  observationPeriod: string
  license: string
  processingNote: string
  active: boolean
}

export const EARTH_SOURCES: readonly EarthSource[] = [
  {
    id: 'wgs84',
    label: 'WGS 84 reference ellipsoid',
    institution: 'NGA / NIMA',
    kind: 'geometry',
    productType: 'Geodetic reference ellipsoid',
    resolution: 'Semi-major axis 6,378,137 m; semi-minor axis 6,356,752.314245 m',
    observationPeriod: 'Reference definition',
    license: 'Public geodetic standard',
    processingNote: 'Used directly for the scientific globe geometry and marker placement.',
    active: true,
  },
  {
    id: 'nasa-blue-marble',
    label: 'NASA Blue Marble Next Generation',
    institution: 'NASA Earth Observatory',
    kind: 'surface-mosaic',
    productType: 'Cloud-free global satellite mosaic; not one simultaneous raw photograph',
    resolution: 'Planned optimized web derivative; source product resolution documented with the final asset',
    observationPeriod: 'Monthly composite product; exact month will be recorded with the committed asset',
    license: 'NASA media and data usage guidelines; attribution retained',
    processingNote: 'Candidate scientific surface layer. The optimized file is not yet committed or active.',
    active: false,
  },
  {
    id: 'nasa-black-marble',
    label: 'NASA Black Marble',
    institution: 'NASA / VIIRS',
    kind: 'night-lights',
    productType: 'Processed nighttime lights product',
    resolution: 'To be recorded with the selected web derivative',
    observationPeriod: 'To be recorded with the selected product',
    license: 'NASA data usage guidelines; attribution retained',
    processingNote: 'Optional layer. It must only be blended mainly on the night side of the globe.',
    active: false,
  },
  {
    id: 'clouds',
    label: 'Scientific cloud layer',
    institution: 'NASA GIBS or Copernicus',
    kind: 'cloud-layer',
    productType: 'Separate transparent cloud observation or composite',
    resolution: 'Not selected yet',
    observationPeriod: 'Not selected yet',
    license: 'Must be verified before an asset is committed',
    processingNote: 'Clouds will remain separate from the cloud-free surface and rotate only subtly.',
    active: false,
  },
  {
    id: 'terrain',
    label: 'Global elevation model',
    institution: 'NASA SRTM / ASTER or Copernicus DEM',
    kind: 'terrain-model',
    productType: 'Digital elevation model',
    resolution: 'Not selected yet',
    observationPeriod: 'Dataset dependent',
    license: 'Must be verified before an asset is committed',
    processingNote: 'Optional. Any vertical exaggeration must be displayed explicitly and must not move coastlines.',
    active: false,
  },
  {
    id: 'atmosphere',
    label: 'Atmosphere visualization',
    institution: 'Terraforming Planet visualization',
    kind: 'atmosphere-visualization',
    productType: 'Synthetic rendering layer, not satellite imagery',
    resolution: 'Procedural Three.js mesh',
    observationPeriod: 'Rendered in real time',
    license: 'Project source-code license',
    processingNote: 'A subtle visual aid. It does not represent measured atmospheric thickness.',
    active: true,
  },
] as const

export function activeEarthSources(): readonly EarthSource[] {
  return EARTH_SOURCES.filter(source => source.active)
}
