import { useMemo, useState } from 'react'

import { normalizeEvidenceApiUrl } from './lib/evidenceApi'
import {
  pointInResearchArea,
  researchAreaBounds,
  researchShapeLabel,
  type ResearchAreaShape,
  type ResearchPoint,
} from './researchGeometry'

type HazardFeature = {
  geometry?: { type?: string; coordinates?: unknown }
  properties?: {
    title?: string
    categories?: string[]
    source?: string
    observation_time?: string
    observationUtc?: string
  }
}

type HazardPayload = {
  generated_at_utc?: string
  generatedUtc?: string
  features?: HazardFeature[]
}

type StacAsset = {
  href?: string
  type?: string
  title?: string
  roles?: string[]
}

type StacItem = {
  id: string
  properties?: {
    datetime?: string
    platform?: string
    'eo:cloud_cover'?: number
  }
  assets?: Record<string, StacAsset>
  links?: Array<{ rel?: string; href?: string }>
}

type StacResponse = {
  features?: StacItem[]
  numberMatched?: number
  numberReturned?: number
  terra_source?: {
    agency?: string
    service?: string
    collection?: string
    upstream_url?: string
    relayed_by?: string
  }
}

type LandsatScene = {
  id: string
  datetime: string
  platform: string
  cloudCover: number | null
  previewUrl: string | null
  itemUrl: string | null
}

type AreaData = {
  hazards: HazardFeature[]
  hazardGeneratedAt: string | null
  landsatScenes: LandsatScene[]
  matchedScenes: number | null
  landsatRelayed: boolean
}

const LANDSAT_COLLECTION = 'landsat-c2l2-sr'
const LANDSAT_STAC = `https://landsatlook.usgs.gov/stac-server/collections/${LANDSAT_COLLECTION}/items`
const GIBS_START = '2000-02-24'

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

export function representativeResearchDates(startDate: string, endDate: string, now = new Date()) {
  const start = new Date(`${startDate}T00:00:00Z`)
  const endRequested = new Date(`${endDate}T00:00:00Z`)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const end = endRequested > today ? today : endRequested
  const gibsStart = new Date(`${GIBS_START}T00:00:00Z`)
  const effectiveStart = start < gibsStart ? gibsStart : start
  if (!Number.isFinite(effectiveStart.getTime()) || !Number.isFinite(end.getTime()) || effectiveStart > end) return []
  if (dateOnly(effectiveStart) === dateOnly(end)) return [dateOnly(effectiveStart)]
  const middle = new Date((effectiveStart.getTime() + end.getTime()) / 2)
  return [...new Set([dateOnly(effectiveStart), dateOnly(middle), dateOnly(end)])]
}

export function buildNasaGibsPreviewUrl(
  latitude: number,
  longitude: number,
  radiusKm: number,
  date: string,
) {
  const bounds = researchAreaBounds(latitude, longitude, Math.max(radiusKm, 2))
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.1.1',
    LAYERS: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    STYLES: '',
    FORMAT: 'image/jpeg',
    TRANSPARENT: 'FALSE',
    SRS: 'EPSG:4326',
    BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    WIDTH: '768',
    HEIGHT: '512',
    TIME: date,
  })
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`
}

export function buildLandsatStacUrl(
  latitude: number,
  longitude: number,
  radiusKm: number,
  startDate: string,
  endDate: string,
  limit = 12,
) {
  const bounds = researchAreaBounds(latitude, longitude, Math.max(radiusKm, 1))
  const params = new URLSearchParams({
    bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    datetime: `${startDate}T00:00:00Z/${endDate}T23:59:59Z`,
    limit: String(limit),
  })
  return `${LANDSAT_STAC}?${params.toString()}`
}

export function buildLandsatProxyUrl(
  workerUrl: string,
  latitude: number,
  longitude: number,
  radiusKm: number,
  startDate: string,
  endDate: string,
  limit = 12,
) {
  const endpoint = normalizeEvidenceApiUrl(workerUrl)
  if (!endpoint) return ''
  const bounds = researchAreaBounds(latitude, longitude, Math.max(radiusKm, 1))
  const params = new URLSearchParams({
    bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    start: startDate,
    end: endDate,
    limit: String(limit),
  })
  return `${endpoint}/research/landsat?${params.toString()}`
}

function stacScene(item: StacItem): LandsatScene {
  const assets = Object.entries(item.assets ?? {})
  const preview = assets.find(([key, asset]) => {
    const href = asset.href ?? ''
    return /preview|thumbnail|browse/i.test(key)
      || /preview|thumbnail|browse/i.test(asset.title ?? '')
      || /image\/(png|jpeg)/i.test(asset.type ?? '')
      || /\.(png|jpe?g)(?:\?|$)/i.test(href)
  })?.[1].href ?? null
  const itemUrl = item.links?.find(link => link.rel === 'self')?.href ?? null
  const cloud = item.properties?.['eo:cloud_cover']
  return {
    id: item.id,
    datetime: item.properties?.datetime ?? 'brak daty',
    platform: item.properties?.platform ?? 'Landsat',
    cloudCover: typeof cloud === 'number' ? cloud : null,
    previewUrl: preview,
    itemUrl,
  }
}

function featurePoint(feature: HazardFeature): ResearchPoint | null {
  const geometry = feature.geometry
  if (!geometry || !Array.isArray(geometry.coordinates)) return null
  if (geometry.type === 'Point') {
    const values = geometry.coordinates
    const longitude = Number(values[0])
    const latitude = Number(values[1])
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude }
    return null
  }
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as unknown[][]
    const firstRing = rings[0]
    if (!Array.isArray(firstRing) || !firstRing.length) return null
    const points = firstRing
      .filter(Array.isArray)
      .map(value => ({ longitude: Number(value[0]), latitude: Number(value[1]) }))
      .filter(value => Number.isFinite(value.latitude) && Number.isFinite(value.longitude))
    if (!points.length) return null
    return {
      longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
      latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    }
  }
  return null
}

function hazardTitle(feature: HazardFeature) {
  return feature.properties?.title ?? feature.properties?.categories?.[0] ?? 'Zdarzenie środowiskowe'
}

function hazardSource(feature: HazardFeature) {
  return feature.properties?.source ?? 'oficjalny feed projektu'
}

export function ResearchDataPreview({
  latitude,
  longitude,
  radiusKm,
  shape,
  startDate,
  endDate,
}: {
  latitude: number
  longitude: number
  radiusKm: number
  shape: ResearchAreaShape
  startDate: string
  endDate: string
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [data, setData] = useState<AreaData | null>(null)
  const [error, setError] = useState('')
  const dates = useMemo(() => representativeResearchDates(startDate, endDate), [startDate, endDate])
  const gibs = useMemo(() => dates.map(date => ({
    date,
    url: buildNasaGibsPreviewUrl(latitude, longitude, radiusKm, date),
  })), [dates, latitude, longitude, radiusKm])
  const landsatUrl = useMemo(
    () => buildLandsatStacUrl(latitude, longitude, radiusKm, startDate, endDate),
    [endDate, latitude, longitude, radiusKm, startDate],
  )
  const evidenceApiUrl = normalizeEvidenceApiUrl(import.meta.env.VITE_EVIDENCE_API_URL)
  const landsatProxyUrl = useMemo(
    () => buildLandsatProxyUrl(evidenceApiUrl, latitude, longitude, radiusKm, startDate, endDate),
    [endDate, evidenceApiUrl, latitude, longitude, radiusKm, startDate],
  )
  const landsatFetchUrl = landsatProxyUrl || landsatUrl

  const run = async () => {
    setStatus('loading')
    setError('')
    try {
      const [hazardResult, landsatResult] = await Promise.allSettled([
        fetch(`${import.meta.env.BASE_URL}data/hazards.json?research=${Date.now()}`, { cache: 'no-store' }).then(async response => {
          if (!response.ok) throw new Error(`hazards.json: HTTP ${response.status}`)
          return response.json() as Promise<HazardPayload>
        }),
        fetch(landsatFetchUrl, { headers: { Accept: 'application/geo+json,application/json' } }).then(async response => {
          const payload = await response.json().catch(() => ({})) as StacResponse & { error?: string }
          if (!response.ok) throw new Error(payload.error ?? `USGS STAC: HTTP ${response.status}`)
          return payload
        }),
      ])

      const center = { latitude, longitude }
      const hazardPayload = hazardResult.status === 'fulfilled' ? hazardResult.value : null
      const hazards = (hazardPayload?.features ?? []).filter(feature => {
        const point = featurePoint(feature)
        return point ? pointInResearchArea(point, center, radiusKm, shape) : false
      })
      const stacPayload = landsatResult.status === 'fulfilled' ? landsatResult.value : null
      const landsatScenes = (stacPayload?.features ?? []).map(stacScene)
      const failures = [hazardResult, landsatResult]
        .filter(result => result.status === 'rejected')
        .map(result => result.status === 'rejected' ? String(result.reason) : '')
        .filter(Boolean)

      setData({
        hazards,
        hazardGeneratedAt: hazardPayload?.generated_at_utc ?? hazardPayload?.generatedUtc ?? null,
        landsatScenes,
        matchedScenes: typeof stacPayload?.numberMatched === 'number' ? stacPayload.numberMatched : null,
        landsatRelayed: Boolean(stacPayload?.terra_source?.relayed_by),
      })
      if (failures.length === 2) throw new Error(failures.join(' · '))
      if (failures.length) setError(`Część źródeł nie odpowiedziała: ${failures.join(' · ')}`)
      setStatus('ready')
    } catch (reason) {
      setData(null)
      setError(reason instanceof Error ? reason.message : String(reason))
      setStatus('error')
    }
  }

  const bounds = researchAreaBounds(latitude, longitude, radiusKm)
  return <section className="research-data-preview panel" aria-label="Dane i obrazy badanego terenu">
    <div className="research-section-head">
      <div><small>OFFICIAL AREA DATA · NASA GIBS · USGS LANDSAT</small><h2>Dane i obrazy badanego terenu</h2></div>
      <span className="evidence-badge observation">ON DEMAND</span>
    </div>
    <p className="muted">Nic nie jest zgadywane. Po naciśnięciu pobieramy katalog scen Landsat dla wybranego AOI, filtrujemy zarejestrowane zdarzenia w obszarze i tworzymy podglądy NASA GIBS dla reprezentatywnych dat dostępnych od 2000 r. Katalog USGS jest przekazywany przez ograniczony publiczny Worker tylko po to, aby działał poprawnie w przeglądarce.</p>
    <div className="research-area-summary">
      <span><b>Kształt</b>{researchShapeLabel(shape)}</span>
      <span><b>Środek</b>{latitude.toFixed(5)}°, {longitude.toFixed(5)}°</span>
      <span><b>Zasięg</b>{radiusKm} km</span>
      <span><b>Okres</b>{startDate} → {endDate}</span>
      <span><b>BBOX</b>{bounds.west.toFixed(3)}, {bounds.south.toFixed(3)} → {bounds.east.toFixed(3)}, {bounds.north.toFixed(3)}</span>
    </div>
    <div className="hero-actions research-data-actions">
      <button type="button" className="primary" onClick={run} disabled={status === 'loading'}>
        {status === 'loading' ? 'Pobieranie oficjalnych danych…' : 'Pobierz dane i obrazy badanego terenu'}
      </button>
      <a className="button-link compact" href={landsatUrl} target="_blank" rel="noreferrer">Otwórz zapytanie USGS STAC</a>
    </div>
    {error && <p className="notice" role="alert">{error}</p>}

    {status === 'ready' && data && <div className="research-area-results">
      <div className="research-result-metrics">
        <article><b>{data.landsatScenes.length}</b><span>scen Landsat w tej odpowiedzi</span></article>
        <article><b>{data.matchedScenes ?? '—'}</b><span>scen dopasowanych wg katalogu</span></article>
        <article><b>{data.hazards.length}</b><span>zdarzeń w wybranym kształcie AOI</span></article>
        <article><b>{gibs.length}</b><span>podglądów NASA GIBS</span></article>
      </div>

      <div className="research-result-section">
        <div className="research-result-title"><h3>NASA GIBS · MODIS Terra True Color</h3><span>{GIBS_START} → teraz</span></div>
        {gibs.length ? <div className="research-satellite-grid">
          {gibs.map(item => <figure key={item.date}>
            <img src={item.url} loading="lazy" alt={`NASA GIBS MODIS Terra dla ${item.date}`} />
            <figcaption><b>{item.date}</b><span>NASA GIBS · MODIS Terra</span><a href={item.url} target="_blank" rel="noreferrer">Otwórz obraz</a></figcaption>
          </figure>)}
        </div> : <p className="notice">Wybrany okres kończy się przed 24.02.2000. Dla niego korzystaj z listy scen Landsat poniżej; MODIS Terra nie istniał jeszcze w tym okresie.</p>}
      </div>

      <div className="research-result-section">
        <div className="research-result-title"><h3>USGS Landsat Collection 2 · Surface Reflectance</h3><span>1982 → teraz · {data.landsatRelayed ? 'przez zabezpieczony relay' : 'bezpośrednio'}</span></div>
        {data.landsatScenes.length ? <div className="research-landsat-list">
          {data.landsatScenes.map(scene => <article key={scene.id}>
            {scene.previewUrl && <img src={scene.previewUrl} loading="lazy" alt={`Podgląd ${scene.id}`} />}
            <div><b>{scene.id}</b><span>{scene.datetime.slice(0, 10)} · {scene.platform}</span><small>zachmurzenie: {scene.cloudCover === null ? 'brak w metadanych' : `${scene.cloudCover.toFixed(1)}%`}</small></div>
            {scene.itemUrl && <a className="button-link compact" href={scene.itemUrl} target="_blank" rel="noreferrer">STAC</a>}
          </article>)}
        </div> : <p className="muted">Katalog nie zwrócił scen w pierwszej stronie odpowiedzi dla tego zakresu i AOI.</p>}
      </div>

      <div className="research-result-section">
        <div className="research-result-title"><h3>Zdarzenia z warstwy bezpieczeństwa</h3><span>{data.hazardGeneratedAt ?? 'czas źródła nieznany'}</span></div>
        {data.hazards.length ? <div className="research-hazard-list">
          {data.hazards.slice(0, 12).map((feature, index) => <article key={`${hazardTitle(feature)}-${index}`}><b>{hazardTitle(feature)}</b><span>{hazardSource(feature)}</span><small>{feature.properties?.observation_time ?? feature.properties?.observationUtc ?? 'brak czasu obserwacji'}</small></article>)}
        </div> : <p className="muted">Brak zarejestrowanych punktów zagrożeń wewnątrz wybranego kształtu w aktualnym pliku danych. To nie oznacza braku zagrożenia — tylko brak pasujących wpisów w tej warstwie.</p>}
      </div>
    </div>}
  </section>
}
