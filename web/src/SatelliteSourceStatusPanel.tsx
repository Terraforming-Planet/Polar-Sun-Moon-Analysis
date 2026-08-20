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

  return <aside className="panel satellite-source-status" aria-label="Active satellite source status">
    <div className="fact"><span>Mode</span><b>{modeLabel}</b></div>
    <div className="fact"><span>Source</span><b>{status.source}</b></div>
    <div className="fact"><span>Product</span><b>{status.product}</b></div>
    <div className="fact"><span>LOD level</span><b>{logicalZoom}</b></div>
    <div className="fact"><span>Observation time</span><b>{status.observationTime}</b></div>
    <div className="fact"><span>Data age</span><b>{status.age}</b></div>
    <div className="fact"><span>Resolution</span><b>{status.resolution}</b></div>
    <div className="fact"><span>Cloud cover</span><b>{status.cloudCover}</b></div>
    <div className="fact"><span>Area coverage</span><b>{status.coverage}</b></div>
    <p className="muted">{status.rendering}</p>
  </aside>
}
