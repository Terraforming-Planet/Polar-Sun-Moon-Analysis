import { useEffect, useMemo, useState } from 'react'

import './satellite-time-selector.css'
import { installObservationHeightEnhancement } from './observationHeightEnhancement'
import { installResearchChatImageEnhancement } from './researchChatImageEnhancement'
import { installScaleLockEnhancement } from './scaleLockEnhancement'
import { installTerrainStudyEnhancement } from './terrainStudyEnhancement'
import {
  SATELLITE_ARCHIVE_START,
  SATELLITE_TIME_MATCH_EVENT,
  readSatelliteTimeSelection,
  requestedSatelliteDateTimeUtc,
  saveSatelliteTimeSelection,
  satelliteSeasonYearBounds,
  satelliteTodayUtc,
  selectionForPreset,
  type SatelliteSeason,
  type SatelliteTimeMatch,
  type SatelliteTimePreset,
  type SatelliteTimeSelection,
} from './satelliteTimeSelection'

const PRESETS: Array<{ id: SatelliteTimePreset; label: string }> = [
  { id: 'archive', label: '1972 → today' },
  { id: 'from-1990', label: '1990 → today' },
  { id: 'from-2015', label: '2015 → today' },
  { id: 'twenty-years', label: 'last 20 years' },
  { id: 'five-years', label: 'last 5 years' },
  { id: 'one-year', label: 'last year' },
]

const SEASONS: Array<{ id: SatelliteSeason; label: string }> = [
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' },
]

const SEASON_LABELS: Record<SatelliteSeason, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
}

export function SatelliteTimeSelector() {
  const [selection, setSelection] = useState<SatelliteTimeSelection>(() => readSatelliteTimeSelection())
  const [timeMatch, setTimeMatch] = useState<SatelliteTimeMatch | null>(null)
  const today = satelliteTodayUtc()
  const seasonBounds = satelliteSeasonYearBounds(selection.season)
  const seasonYears = useMemo(
    () => Array.from({ length: seasonBounds.maxYear - seasonBounds.minYear + 1 }, (_, index) => seasonBounds.minYear + index),
    [seasonBounds.minYear, seasonBounds.maxYear],
  )

  const commit = (next: SatelliteTimeSelection) => {
    const saved = saveSatelliteTimeSelection(next)
    setSelection(saved)
    setTimeMatch(null)
  }

  const applyPreset = (preset: SatelliteTimePreset) => commit(selectionForPreset(preset, selection))

  useEffect(() => {
    saveSatelliteTimeSelection(readSatelliteTimeSelection())
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<SatelliteTimeMatch | null>).detail
      setTimeMatch(detail ?? null)
    }
    window.addEventListener(SATELLITE_TIME_MATCH_EVENT, receive)
    return () => window.removeEventListener(SATELLITE_TIME_MATCH_EVENT, receive)
  }, [])

  useEffect(() => {
    const cleanupObservationHeight = installObservationHeightEnhancement()
    const cleanupScaleLock = installScaleLockEnhancement()
    const cleanupTerrainStudy = installTerrainStudyEnhancement()
    const cleanupResearchChatImages = installResearchChatImageEnhancement()
    return () => {
      cleanupResearchChatImages()
      cleanupTerrainStudy()
      cleanupScaleLock()
      cleanupObservationHeight()
    }
  }, [])

  const requestedUtc = requestedSatelliteDateTimeUtc(selection)

  return <section className="satellite-time-selector panel" aria-label="Satellite imagery time selection">
    <div className="satellite-time-head">
      <div><small>OBSERVATION TIME · OFFICIAL SATELLITE ARCHIVES</small><h2>Select imagery date</h2></div>
      <span className="evidence-badge observation">1972 → TODAY</span>
    </div>
    <p className="satellite-time-note">The earliest date in this comparable land archive is <b>23 July 1972</b> — the launch of Landsat 1. <b>Seasonal</b> mode compares consecutive years within the same season. In multi-year research, the system searches each year for the least-cloudy image available for terrain analysis while preserving the original scene separately. <b>The scale selected with the slider is locked for the entire study</b>; views at 5/25/100/350 km are no longer mixed. <b>Exact date + time</b> always preserves the original observation, even when it contains clouds.</p>

    <div className="satellite-time-presets" role="group" aria-label="Quick time range">
      {PRESETS.map(item => <button key={item.id} type="button" className={selection.preset === item.id ? 'active' : ''} onClick={() => applyPreset(item.id)}>{item.label}</button>)}
      <button type="button" className={selection.preset === 'custom' ? 'active' : ''} onClick={() => applyPreset('custom')}>custom range</button>
      <button type="button" className={selection.preset === 'seasonal' ? 'active seasonal' : 'seasonal'} onClick={() => applyPreset('seasonal')}>seasons</button>
      <button type="button" className={selection.preset === 'exact' ? 'active' : ''} onClick={() => applyPreset('exact')}>exact date + time</button>
    </div>

    {selection.preset === 'seasonal' ? <>
      <div className="satellite-time-fields seasonal-fields">
        <label>Year from
          <select value={selection.startYear} onChange={event => commit(selectionForPreset('seasonal', { ...selection, preset: 'seasonal', startYear: Number(event.target.value) }))}>
            {seasonYears.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label>Year to
          <select value={selection.endYear} onChange={event => commit(selectionForPreset('seasonal', { ...selection, preset: 'seasonal', endYear: Number(event.target.value) }))}>
            {seasonYears.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label>Season
          <select value={selection.season} onChange={event => commit(selectionForPreset('seasonal', { ...selection, preset: 'seasonal', season: event.target.value as SatelliteSeason }))}>
            {SEASONS.map(season => <option key={season.id} value={season.id}>{season.label}</option>)}
          </select>
        </label>
        <div className="season-study-card"><b>Seasonal comparison</b><span>Same season · consecutive years · automatic selection of the least-cloudy scene.</span></div>
      </div>
      <div className="season-study-note">This mode is designed to study change between years at a comparable time of year. For each year, the Worker searches official archives; the research standard is a Landsat scene with ≤10% cloud cover or an explicitly labelled cloud-minimized Sentinel‑2 scene with MAXCC≤10. Original scenes remain available separately. For years supported by Sentinel‑2, the research image and AI use the same slider-defined scale.</div>
    </> : selection.preset === 'exact' ? <div className="satellite-time-fields exact-fields">
      <label>Exact date<input type="date" min={SATELLITE_ARCHIVE_START} max={today} value={selection.exactDate} onChange={event => commit(selectionForPreset('exact', { ...selection, preset: 'exact', exactDate: event.target.value }))} /></label>
      <label>UTC time<input type="time" step="60" value={selection.exactTimeUtc} onChange={event => commit(selectionForPreset('exact', { ...selection, preset: 'exact', exactTimeUtc: event.target.value }))} /></label>
    </div> : <div className="satellite-time-fields range-fields">
      <label>From<input type="date" min={SATELLITE_ARCHIVE_START} max={today} value={selection.startDate} onChange={event => commit(selectionForPreset('custom', { ...selection, preset: 'custom', startDate: event.target.value }))} /></label>
      <label>To<input type="date" min={SATELLITE_ARCHIVE_START} max={today} value={selection.endDate} onChange={event => commit(selectionForPreset('custom', { ...selection, preset: 'custom', endDate: event.target.value }))} /></label>
    </div>}

    <div className="satellite-time-status">
      {selection.preset === 'seasonal'
        ? <span><b>Season study:</b> {SEASON_LABELS[selection.season]} · years {selection.startYear} → {selection.endYear}</span>
        : <span><b>Active range:</b> {selection.startDate} → {selection.endDate}</span>}
      {requestedUtc && <span><b>Requested moment:</b> {requestedUtc.replace('T', ' ').replace(':00Z', ' UTC')} · cloud filter OFF</span>}
    </div>

    {selection.preset === 'exact' && <div className={`satellite-time-match ${timeMatch?.status ?? 'waiting'}`}>
      {!timeMatch && <span>After you run “Research area”, I will check Landsat scene timestamps. If the exact time does not exist, I will show the nearest real observation. Cloud cover remains unchanged.</span>}
      {timeMatch?.status === 'matched' && <span><b>Nearest Landsat scene:</b> {timeMatch.nearestUtc} · difference {timeMatch.differenceMinutes?.toFixed(1)} min{timeMatch.platform ? ` · ${timeMatch.platform}` : ''}{timeMatch.sceneId ? ` · ${timeMatch.sceneId}` : ''}</span>}
      {timeMatch?.status === 'unavailable' && <span><b>No exact scene time:</b> {timeMatch.reason ?? 'The catalogue did not return a timestamp for this day.'} The analysis still uses the selected day and explicitly shows the sources that are available.</span>}
    </div>}
  </section>
}
