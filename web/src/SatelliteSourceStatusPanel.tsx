import { formatSatelliteSourceStatus, type SatelliteSource, type SourceObservation } from './lib/satelliteSources'

type Props = {
  source: SatelliteSource
  observation?: SourceObservation
  logicalZoom: number
  modeLabel: string
  nowMs?: number
}

export function SatelliteSourceStatusPanel({
  source,
  observation = {},
  logicalZoom,
  modeLabel,
  nowMs = Date.now(),
}: Props) {
  const status = formatSatelliteSourceStatus(source, observation, nowMs)

  return <aside className="panel satellite-source-status" aria-label="Status aktywnego źródła satelitarnego">
    <div className="fact"><span>Tryb</span><b>{modeLabel}</b></div>
    <div className="fact"><span>Źródło</span><b>{status.source}</b></div>
    <div className="fact"><span>Produkt</span><b>{status.product}</b></div>
    <div className="fact"><span>Poziom LOD</span><b>{logicalZoom}</b></div>
    <div className="fact"><span>Czas obserwacji</span><b>{status.observationTime}</b></div>
    <div className="fact"><span>Wiek danych</span><b>{status.age}</b></div>
    <div className="fact"><span>Rozdzielczość</span><b>{status.resolution}</b></div>
    <div className="fact"><span>Zachmurzenie</span><b>{status.cloudCover}</b></div>
    <div className="fact"><span>Pokrycie obszaru</span><b>{status.coverage}</b></div>
    <p className="muted">{status.rendering}</p>
  </aside>
}
