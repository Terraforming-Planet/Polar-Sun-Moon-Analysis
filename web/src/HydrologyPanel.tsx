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
    label: 'Europa środkowa i południowa',
    detail: 'Ujemne anomalie suszy w globalnym przeglądzie GDO; w Europie warunki pozostawały krytyczne w wielu obszarach w połowie lipca 2026.',
  },
  {
    label: 'Europa środkowo-zachodnia',
    detail: 'Copernicus GDO wskazywał pogorszenie warunków w połowie lipca 2026.',
  },
  {
    label: 'Region Morza Bałtyckiego · Półwysep Iberyjski · Włochy',
    detail: 'W części obszarów występowała poprawa, ale nadal utrzymywały się klasy watch, warning i alert.',
  },
  {
    label: 'Północna część Ameryki Północnej · Ameryka Środkowa',
    detail: 'Ujemne anomalie wskazane w globalnym przeglądzie GDO za koniec czerwca 2026.',
  },
  {
    label: 'Środkowo-wschodnia Ameryka Południowa · środkowo-południowe Andy',
    detail: 'Ujemne anomalie wskazane w globalnym przeglądzie GDO za koniec czerwca 2026.',
  },
  {
    label: 'Afryka środkowa · Madagaskar · wybrane regiony Azji',
    detail: 'Ujemne anomalie wskazane w globalnym przeglądzie GDO za koniec czerwca 2026.',
  },
]

export const formatHydrologyUtc = (value?: string) => {
  if (!value) return 'brak danych'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'nieprawidłowy znacznik czasu'
  return new Date(timestamp).toLocaleString('pl-PL', { timeZone: 'UTC' }) + ' UTC'
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
      <div><small>COPERNICUS CEMS · ECMWF EWDS · GLOFAS · GDO</small><h1>Woda i susza — 3D, zagrożone obszary i metadane hydrologiczne</h1></div>
      <span className="evidence-badge estimate">MODEL HYDROLOGICZNY + OBSERWACJE</span>
    </div>
    <p className="notice">GloFAS jest systemem modelowym Copernicus CEMS. Nie przedstawiamy tych danych jako bezpośredniego pomiaru wód gruntowych ani jako samodzielnego alarmu powodziowego. Niebieskie markery 3D pochodzą z opublikowanego katalogu zdarzeń powodziowych; obszary suszy poniżej są najnowszym opisowym przeglądem Copernicus GDO, a nie sztucznie wygenerowaną mapą.</p>
    {error && <p className="notice">Nie udało się odczytać lokalnego manifestu GloFAS: {error}</p>}
    {hazardError && <p className="notice">Nie udało się odczytać lokalnego katalogu zagrożeń: {hazardError}</p>}

    <div className="hazard-layout">
      <div>
        <RealisticEarthGlobe selectedTime={selectedTime} markers={markers} autoRotate />
      </div>
      <aside className="panel">
        <h2>Hydrologiczny kontekst 3D</h2>
        <div className="fact"><span>Powodzie w katalogu 3D</span><b>{markers.length}</b></div>
        <div className="fact"><span>Wygenerowano katalog</span><b>{formatHydrologyUtc(hazards?.generated_at_utc ?? hazards?.generatedUtc)}</b></div>
        <p className="muted">Model 3D pokazuje aktualnie opublikowane lokalizacje zdarzeń powodziowych. Suszę raportujemy osobno z Copernicus GDO, ponieważ nie zamieniamy opisowych regionów na zmyślone punkty na globie.</p>
        <a className="button-link block" href={GDO_MAP} target="_blank" rel="noreferrer">Oficjalna mapa Global Drought Observatory ↗</a>
      </aside>
    </div>

    <div className="workspace-head drought-head">
      <div><small>COPERNICUS EMERGENCY MANAGEMENT SERVICE · GLOBAL DROUGHT OBSERVATORY</small><h2>Zagrożone obszary — najnowszy oficjalny przegląd</h2></div>
      <span className="evidence-badge observation">GDO · 2026</span>
    </div>
    <div className="water-grid">
      {droughtRegions.map(region => <article key={region.label}>
        <span className="evidence-badge estimate">SUSZA</span>
        <h2>{region.label}</h2>
        <p>{region.detail}</p>
      </article>)}
    </div>
    <p className="muted">Daty źródłowe przeglądu GDO: globalny obraz — koniec czerwca 2026; europejski przegląd — połowa lipca 2026. System nie podnosi tych opisów do rangi bieżącego alarmu lokalnego.</p>

    <div className="hero-actions">
      <a className="button-link" href={`${baseUrl}flood-map/`}>Otwórz mapę powodzi Sentinel-1</a>
      <a className="button-link" href={`${baseUrl}copernicus/`}>Otwórz panel Copernicus</a>
      <a className="button-link" href={GDO_HOME} target="_blank" rel="noreferrer">Copernicus Drought Observatories ↗</a>
    </div>
    <div className="water-grid">
      <article><span className="evidence-badge observation">SENTINEL</span><h2>Woda powierzchniowa</h2><p>Sentinel-1 SAR i Sentinel-2 mogą pokazywać zasięg wody dla rzeczywistych momentów przelotu. Do porównania przed/po użyj zakładki Powodzie lub bezpośredniego przycisku mapy powyżej.</p></article>
      <article><span className="evidence-badge estimate">GLOFAS</span><h2>Przepływ i wilgotność gleby</h2><p>Najnowszy koniec zakresu opublikowanego w manifestach: <b>{formatHydrologyUtc(newest)}</b>.</p><p>{variables.length ? variables.map(variableLabel).join(' · ') : 'Ładowanie zmiennych GloFAS…'}</p></article>
      <article><span className="evidence-badge unknown">OGRANICZENIE</span><h2>Woda podziemna</h2><p>Satelity i GloFAS nie pokazują bezpośrednio wody w szczelinach skalnych. Do takich wniosków potrzebne są dane hydrogeologiczne i pomiary terenowe.</p></article>
    </div>
    <div className="source-list">
      {sources.map(source => <article key={source.id}>
        <div className="source-title"><span>{source.provider}</span><h2>{source.title}</h2></div>
        <p><b>Status:</b> {sourceStatusLabel(source.status)} · <b>aktualizacja katalogu:</b> {formatHydrologyUtc(source.catalogue_updated_at_utc)} · <b>koniec zakresu:</b> {formatHydrologyUtc(source.temporal_end_utc)} · <b>częstotliwość:</b> {source.update_frequency ?? 'brak'}</p>
        <p>{(source.variables ?? []).map(variableLabel).join(' · ')}</p>
        <a href={source.catalogue_url} target="_blank" rel="noreferrer">Oficjalny katalog Copernicus/ECMWF ↗</a>
      </article>)}
    </div>
    {catalog?.notice && <p className="muted">{catalog.notice}</p>}
  </section>
}
