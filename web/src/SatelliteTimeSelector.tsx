import { useEffect, useMemo, useState } from 'react'

import './satellite-time-selector.css'
import { installResearchGalleryEnhancements } from './researchGalleryEnhancements'
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
  { id: 'archive', label: '1972 → dziś' },
  { id: 'from-1990', label: '1990 → dziś' },
  { id: 'from-2015', label: '2015 → dziś' },
  { id: 'five-years', label: 'ostatnie 5 lat' },
  { id: 'one-year', label: 'ostatni rok' },
]

const SEASONS: Array<{ id: SatelliteSeason; label: string }> = [
  { id: 'spring', label: 'Wiosna' },
  { id: 'summer', label: 'Lato' },
  { id: 'autumn', label: 'Jesień' },
  { id: 'winter', label: 'Zima' },
]

const SEASON_LABELS: Record<SatelliteSeason, string> = {
  spring: 'Wiosna',
  summer: 'Lato',
  autumn: 'Jesień',
  winter: 'Zima',
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

  useEffect(() => installResearchGalleryEnhancements(), [])

  const requestedUtc = requestedSatelliteDateTimeUtc(selection)

  return <section className="satellite-time-selector panel" aria-label="Wybór czasu zdjęć satelitarnych">
    <div className="satellite-time-head">
      <div><small>CZAS OBSERWACJI · OFICJALNE ARCHIWA SATELITARNE</small><h2>Wybierz datę zdjęć</h2></div>
      <span className="evidence-badge observation">1972 → DZIŚ</span>
    </div>
    <p className="satellite-time-note">Najwcześniejsza data tego porównywalnego archiwum lądowego to <b>23.07.1972</b> — start Landsat 1. Tryb <b>Pory roku</b> celowo ukrywa miesiące i dni: wybierasz tylko roczniki i sezon, a system dobiera porównywalny punkt tej samej pory roku w kolejnych latach.</p>

    <div className="satellite-time-presets" role="group" aria-label="Szybki zakres czasu">
      {PRESETS.map(item => <button key={item.id} type="button" className={selection.preset === item.id ? 'active' : ''} onClick={() => applyPreset(item.id)}>{item.label}</button>)}
      <button type="button" className={selection.preset === 'custom' ? 'active' : ''} onClick={() => applyPreset('custom')}>własny zakres</button>
      <button type="button" className={selection.preset === 'seasonal' ? 'active seasonal' : 'seasonal'} onClick={() => applyPreset('seasonal')}>pory roku</button>
      <button type="button" className={selection.preset === 'exact' ? 'active' : ''} onClick={() => applyPreset('exact')}>dokładna data + godzina</button>
    </div>

    {selection.preset === 'seasonal' ? <>
      <div className="satellite-time-fields seasonal-fields">
        <label>Rok od
          <select value={selection.startYear} onChange={event => commit(selectionForPreset('seasonal', { ...selection, preset: 'seasonal', startYear: Number(event.target.value) }))}>
            {seasonYears.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label>Rok do
          <select value={selection.endYear} onChange={event => commit(selectionForPreset('seasonal', { ...selection, preset: 'seasonal', endYear: Number(event.target.value) }))}>
            {seasonYears.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label>Pora roku
          <select value={selection.season} onChange={event => commit(selectionForPreset('seasonal', { ...selection, preset: 'seasonal', season: event.target.value as SatelliteSeason }))}>
            {SEASONS.map(season => <option key={season.id} value={season.id}>{season.label}</option>)}
          </select>
        </label>
        <div className="season-study-card"><b>Porównanie sezonowe</b><span>Ten sam sezon · kolejne roczniki · bez ręcznego wyboru miesięcy.</span></div>
      </div>
      <div className="season-study-note">Tryb służy do badań zmian między rocznikami przy możliwie zbliżonej porze roku. To ogranicza błąd porównania wynikający z zestawiania np. zdjęcia letniego ze zdjęciem zimowym.</div>
    </> : selection.preset === 'exact' ? <div className="satellite-time-fields exact-fields">
      <label>Dokładna data<input type="date" min={SATELLITE_ARCHIVE_START} max={today} value={selection.exactDate} onChange={event => commit(selectionForPreset('exact', { ...selection, preset: 'exact', exactDate: event.target.value }))} /></label>
      <label>Godzina UTC<input type="time" step="60" value={selection.exactTimeUtc} onChange={event => commit(selectionForPreset('exact', { ...selection, preset: 'exact', exactTimeUtc: event.target.value }))} /></label>
    </div> : <div className="satellite-time-fields range-fields">
      <label>Od<input type="date" min={SATELLITE_ARCHIVE_START} max={today} value={selection.startDate} onChange={event => commit(selectionForPreset('custom', { ...selection, preset: 'custom', startDate: event.target.value }))} /></label>
      <label>Do<input type="date" min={SATELLITE_ARCHIVE_START} max={today} value={selection.endDate} onChange={event => commit(selectionForPreset('custom', { ...selection, preset: 'custom', endDate: event.target.value }))} /></label>
    </div>}

    <div className="satellite-time-status">
      {selection.preset === 'seasonal'
        ? <span><b>Badanie pory roku:</b> {SEASON_LABELS[selection.season]} · roczniki {selection.startYear} → {selection.endYear}</span>
        : <span><b>Aktywny zakres:</b> {selection.startDate} → {selection.endDate}</span>}
      {requestedUtc && <span><b>Żądany moment:</b> {requestedUtc.replace('T', ' ').replace(':00Z', ' UTC')}</span>}
    </div>

    {selection.preset === 'exact' && <div className={`satellite-time-match ${timeMatch?.status ?? 'waiting'}`}>
      {!timeMatch && <span>Po uruchomieniu „Zbadaj teren” sprawdzę timestampy scen Landsat. Jeśli dokładna godzina nie istnieje, pokażę najbliższą rzeczywistą obserwację.</span>}
      {timeMatch?.status === 'matched' && <span><b>Najbliższa scena Landsat:</b> {timeMatch.nearestUtc} · różnica {timeMatch.differenceMinutes?.toFixed(1)} min{timeMatch.platform ? ` · ${timeMatch.platform}` : ''}{timeMatch.sceneId ? ` · ${timeMatch.sceneId}` : ''}</span>}
      {timeMatch?.status === 'unavailable' && <span><b>Brak dokładnego czasu sceny:</b> {timeMatch.reason ?? 'Katalog nie zwrócił timestampu dla tego dnia.'} Analiza nadal używa wybranego dnia i jawnie pokazuje dostępne źródła.</span>}
    </div>}
  </section>
}
