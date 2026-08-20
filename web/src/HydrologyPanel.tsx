import { useEffect, useMemo, useState } from 'react'
import { RealisticEarthGlobe } from './RealisticEarthGlobe'
import { newestTemporalEnd, sourceStatusLabel, variableLabel, type GlofasCatalog } from './lib/glofas'

type Props = { baseUrl: string }
type HazardFeature = {
  geometry: { type: string; coordinates: number[] | number[][][] }
  properties: { categories?: string[]; observation_time?: string; title?: string; source_url?: string }
}
type HazardData = { generated_at_utc?: string; generatedUtc?: string; features?: HazardFeature[] }
type Marker = { longitude: number; latitude: number; color: number; radius: number }

const GDO_HOME = 'https://drought.emergency.copernicus.eu/'
const GDO_MAP = 'https://drought.emergency.copernicus.eu/gdo/php/index.php?id=2050'

const droughtRegions = [
  {
    label: 'Central and Southern Europe',
    detail: 'Negative drought anomalies in the Copernicus GDO global overview; conditions remained critical in multiple European areas in mid-July 2026.',
  },
  {
    label: 'Central-Western Europe',
    detail: 'Copernicus GDO reported deteriorating conditions in parts of the region in mid-July 2026.',
  },
  {
    label: 'Baltic region · Iberian Peninsula · Italy',
    detail: 'Some areas showed improvement, while watch, warning and alert classes remained present elsewhere.',
  },
  {
    label: 'Northern North America · Central America',
    detail: 'Negative anomalies were identified in the GDO global overview for late June 2026.',
  },
  {
    label: 'Central-Eastern South America · Central-Southern Andes',
    detail: 'Negative anomalies were identified in the GDO global overview for late June 2026.',
  },
  {
    label: 'Central Africa · Madagascar · selected Asian regions',
    detail: 'Negative anomalies were identified in the GDO global overview for late June 2026.',
  },
]

export const formatHydrologyUtc = (value?: string) => {
  if (!value) return 'no data'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'invalid timestamp'
  return new Date(timestamp).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC'
}

function featurePoint(feature: HazardFeature): [number, number] | null {
  if (feature.geometry.type === 'Point') return feature.geometry.coordinates as [number, number]
  const polygon = feature.geometry.coordinates as number[][][]
  if (!polygon[0]?.length) return null
  const sum = polygon[0].reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0])
  return [sum[0] / polygon[0].length, sum[1] / polygon[0].length]
}

function isFlood(feature: HazardFeature) {
  return (feature.properties.categories ?? []).some(value => value.toLowerCase().includes('flood'))
}

function floodMarkers(data: HazardData | null): Marker[] {
  const features = Array.isArray(data?.features) ? data.features : []
  return features
    .filter(isFlood)
    .map(feature => {
      const point = featurePoint(feature)
      if (!point) return null
      return { longitude: point[0], latitude: point[1], color: 0x00a8ff, radius: 1.2 }
    })
    .filter((value): value is Marker => value !== null)
}

export function HydrologyPanel({ baseUrl }: Props) {
  const [catalog, setCatalog] = useState<GlofasCatalog | null>(null)
  const [hazards, setHazards] = useState<HazardData | null>(null)
  const [error, setError] = useState('')
  const [hazardError, setHazardError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const url = `${baseUrl}data/hydrology/glofas-catalog.json?refresh=${Date.now()}`
    fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(value => {
        setCatalog(value as GlofasCatalog)
        setError('')
      })
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(String(reason))
      })
    return () => controller.abort()
  }, [baseUrl])

  useEffect(() => {
    const controller = new AbortController()
    const url = `${baseUrl}data/hazards.json?refresh=${Date.now()}`
    fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(value => {
        setHazards(value as HazardData)
        setHazardError('')
      })
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setHazardError(String(reason))
      })
    return () => controller.abort()
  }, [baseUrl])

  const sources = catalog?.sources ?? []
  const variables = [...new Set(sources.flatMap(source => source.variables ?? []))]
  const newest = newestTemporalEnd(catalog)
  const markers = useMemo(() => floodMarkers(hazards), [hazards])
  const selectedTime = hazards?.generated_at_utc ?? hazards?.generatedUtc ?? new Date().toISOString()

  return <section className="workspace">
    <div className="workspace-head">
      <div><small>COPERNICUS CEMS · ECMWF EWDS · GLOFAS · GDO</small><h1>Water & Drought — 3D context, hazard regions and hydrological metadata</h1></div>
      <span className="evidence-badge estimate">HYDROLOGICAL MODEL + OBSERVATIONS</span>
    </div>
    <p className="notice">GloFAS is a Copernicus CEMS modelling system. These data are not presented as direct groundwater measurements or a standalone local flood warning. Blue 3D markers come from the published flood-event catalogue; the drought regions below are an official descriptive Copernicus GDO overview, not a fabricated map.</p>
    <p className="notice"><b>Olszówka / Gardeja local validation area:</b> the project also combines recent Sentinel-1 and Sentinel-2 catalogue products, NASA VIIRS night radiance and EC JRC Global Surface Water history. A field report of water loss is treated as a priority hypothesis for verification, not an automatically confirmed disaster.</p>
    {error && <p className="notice">Could not read the local GloFAS manifest: {error}</p>}
    {hazardError && <p className="notice">Could not read the local hazard catalogue: {hazardError}</p>}

    <div className="hazard-layout">
      <div>
        <RealisticEarthGlobe selectedTime={selectedTime} markers={markers} autoRotate />
      </div>
      <aside className="panel">
        <h2>3D hydrological context</h2>
        <div className="fact"><span>Flood events in 3D catalogue</span><b>{markers.length}</b></div>
        <div className="fact"><span>Catalogue generated</span><b>{formatHydrologyUtc(hazards?.generated_at_utc ?? hazards?.generatedUtc)}</b></div>
        <p className="muted">The 3D Earth view shows currently published flood-event locations. Drought is reported separately from Copernicus GDO because descriptive regions are not converted into invented point markers.</p>
        <a className="button-link block" href={GDO_MAP} target="_blank" rel="noreferrer">Official Global Drought Observatory map ↗</a>
      </aside>
    </div>

    <div className="workspace-head drought-head">
      <div><small>COPERNICUS EMERGENCY MANAGEMENT SERVICE · GLOBAL DROUGHT OBSERVATORY</small><h2>Drought-affected regions — latest official overview</h2></div>
      <span className="evidence-badge observation">GDO · 2026</span>
    </div>
    <div className="water-grid">
      {droughtRegions.map(region => <article key={region.label}>
        <span className="evidence-badge estimate">DROUGHT</span>
        <h2>{region.label}</h2>
        <p>{region.detail}</p>
      </article>)}
    </div>
    <p className="muted">Source dates for this GDO overview: global overview — late June 2026; European overview — mid-July 2026. These descriptions are not elevated into a current local warning.</p>

    <div className="hero-actions">
      <a className="button-link" href={`${baseUrl}experiment-011/`}>Test 011 · Iława–Zalewo 1990–2026</a>
      <a className="button-link" href={`${baseUrl}water-local/`}>Olszówka multi-sensor validation</a>
      <a className="button-link" href={`${baseUrl}flood-map/`}>Open Sentinel-1 flood map</a>
      <a className="button-link" href={`${baseUrl}copernicus/`}>Open Copernicus panel</a>
      <a className="button-link" href={GDO_HOME} target="_blank" rel="noreferrer">Copernicus Drought Observatories ↗</a>
    </div>
    <div className="water-grid">
      <article><span className="evidence-badge observation">SENTINEL</span><h2>Surface water</h2><p>Sentinel-1 SAR and Sentinel-2 can show surface-water extent for real acquisition times. Use the Floods tab or the direct map link above for before/after comparisons.</p></article>
      <article><span className="evidence-badge estimate">GLOFAS</span><h2>Discharge and soil wetness</h2><p>Latest temporal end published in the manifest: <b>{formatHydrologyUtc(newest)}</b>.</p><p>{variables.length ? variables.map(variableLabel).join(' · ') : 'Loading GloFAS variables…'}</p></article>
      <article><span className="evidence-badge unknown">LIMITATION</span><h2>Groundwater</h2><p>Satellite imagery and GloFAS do not directly show water in deep rock fractures. Hydrogeological datasets and field measurements are required for such conclusions.</p></article>
    </div>
    <div className="source-list">
      {sources.map(source => <article key={source.id}>
        <div className="source-title"><span>{source.provider}</span><h2>{source.title}</h2></div>
        <p><b>Status:</b> {sourceStatusLabel(source.status)} · <b>catalogue update:</b> {formatHydrologyUtc(source.catalogue_updated_at_utc)} · <b>temporal end:</b> {formatHydrologyUtc(source.temporal_end_utc)} · <b>frequency:</b> {source.update_frequency ?? 'not provided'}</p>
        <p>{(source.variables ?? []).map(variableLabel).join(' · ')}</p>
        <a href={source.catalogue_url} target="_blank" rel="noreferrer">Official Copernicus/ECMWF catalogue ↗</a>
      </article>)}
    </div>
    {catalog?.notice && <p className="muted">{catalog.notice}</p>}
  </section>
}
