import { useEffect, useState } from 'react'
import { newestTemporalEnd, sourceStatusLabel, variableLabel, type GlofasCatalog } from './lib/glofas'

type Props = { baseUrl: string }

export const formatHydrologyUtc = (value?: string) => {
  if (!value) return 'brak danych'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'nieprawidłowy znacznik czasu'
  return new Date(timestamp).toLocaleString('pl-PL', { timeZone: 'UTC' }) + ' UTC'
}

export function HydrologyPanel({ baseUrl }: Props) {
  const [catalog, setCatalog] = useState<GlofasCatalog | null>(null)
  const [error, setError] = useState('')

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

  const sources = catalog?.sources ?? []
  const variables = [...new Set(sources.flatMap(source => source.variables ?? []))]
  const newest = newestTemporalEnd(catalog)

  return <section className="workspace">
    <div className="workspace-head">
      <div><small>COPERNICUS CEMS · ECMWF EWDS · GLOFAS</small><h1>Woda i susza — rzeczywiste metadane hydrologiczne</h1></div>
      <span className="evidence-badge estimate">MODEL HYDROLOGICZNY</span>
    </div>
    <p className="notice">GloFAS jest systemem modelowym Copernicus CEMS. Nie przedstawiamy tych danych jako bezpośredniego pomiaru wód gruntowych ani jako samodzielnego alarmu powodziowego.</p>
    {error && <p className="notice">Nie udało się odczytać lokalnego manifestu GloFAS: {error}</p>}
    <div className="hero-actions">
      <a className="button-link" href={`${baseUrl}flood-map/`}>Otwórz mapę powodzi Sentinel-1</a>
      <a className="button-link" href={`${baseUrl}copernicus/`}>Otwórz panel Copernicus</a>
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
