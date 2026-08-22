export const SATELLITE_ARCHIVE_START = '1972-07-23'
export const SATELLITE_TIME_STORAGE_KEY = 'terra-observation-satellite-time/v1'
export const SATELLITE_TIME_EVENT = 'terra-satellite-time-selection'
export const SATELLITE_TIME_MATCH_EVENT = 'terra-analysis-time-match'

export type SatelliteTimePreset = 'archive' | 'from-1990' | 'from-2015' | 'twenty-years' | 'five-years' | 'one-year' | 'custom' | 'exact' | 'seasonal'
export type SatelliteSeason = 'spring' | 'summer' | 'autumn' | 'winter'

export type SatelliteTimeSelection = {
  preset: SatelliteTimePreset
  startDate: string
  endDate: string
  exactDate: string
  exactTimeUtc: string
  season: SatelliteSeason
  startYear: number
  endYear: number
}

export type SatelliteTimeMatch = {
  status: 'matched' | 'unavailable'
  requestedUtc: string
  nearestUtc?: string
  differenceMinutes?: number
  sceneId?: string
  platform?: string
  reason?: string
}

const SEASON_REFERENCE_MONTH_DAY: Record<SatelliteSeason, string> = {
  spring: '04-15',
  summer: '07-15',
  autumn: '10-15',
  winter: '01-15',
}

export function satelliteTodayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function clampDate(value: string, fallback: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback
  if (value < SATELLITE_ARCHIVE_START) return SATELLITE_ARCHIVE_START
  const today = satelliteTodayUtc()
  if (value > today) return today
  return value
}

function normalizeSeason(value: unknown): SatelliteSeason {
  return ['spring', 'summer', 'autumn', 'winter'].includes(String(value)) ? value as SatelliteSeason : 'summer'
}

export function seasonReferenceDate(year: number, season: SatelliteSeason) {
  return `${Math.trunc(year).toString().padStart(4, '0')}-${SEASON_REFERENCE_MONTH_DAY[season]}`
}

export function satelliteSeasonYearBounds(season: SatelliteSeason) {
  const archiveYear = Number(SATELLITE_ARCHIVE_START.slice(0, 4))
  const currentYear = Number(satelliteTodayUtc().slice(0, 4))
  const minYear = seasonReferenceDate(archiveYear, season) < SATELLITE_ARCHIVE_START ? archiveYear + 1 : archiveYear
  const maxYear = seasonReferenceDate(currentYear, season) > satelliteTodayUtc() ? currentYear - 1 : currentYear
  return { minYear, maxYear: Math.max(minYear, maxYear) }
}

function clampYear(value: unknown, minYear: number, maxYear: number, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maxYear, Math.max(minYear, Math.trunc(parsed)))
}

export function selectionForPreset(preset: SatelliteTimePreset, current?: SatelliteTimeSelection): SatelliteTimeSelection {
  const today = satelliteTodayUtc()
  const currentYear = Number(today.slice(0, 4))
  const exactDate = clampDate(current?.exactDate ?? today, today)
  const exactTimeUtc = /^\d{2}:\d{2}$/.test(current?.exactTimeUtc ?? '') ? current!.exactTimeUtc : '12:00'
  const season = normalizeSeason(current?.season)
  const seasonBounds = satelliteSeasonYearBounds(season)
  let startYear = clampYear(current?.startYear, seasonBounds.minYear, seasonBounds.maxYear, seasonBounds.minYear)
  let endYear = clampYear(current?.endYear, seasonBounds.minYear, seasonBounds.maxYear, seasonBounds.maxYear)
  if (startYear > endYear) startYear = endYear

  let startDate = current?.startDate ?? SATELLITE_ARCHIVE_START
  let endDate = current?.endDate ?? today

  if (preset === 'archive') {
    startDate = SATELLITE_ARCHIVE_START
    endDate = today
  } else if (preset === 'from-1990') {
    startDate = '1990-01-01'
    endDate = today
  } else if (preset === 'from-2015') {
    startDate = '2015-01-01'
    endDate = today
  } else if (preset === 'twenty-years') {
    startDate = `${currentYear - 19}-01-01`
    endDate = today
  } else if (preset === 'five-years') {
    startDate = `${currentYear - 4}-01-01`
    endDate = today
  } else if (preset === 'one-year') {
    startDate = `${currentYear}-01-01`
    endDate = today
  } else if (preset === 'exact') {
    startDate = exactDate
    endDate = exactDate
  } else if (preset === 'seasonal') {
    startDate = seasonReferenceDate(startYear, season)
    endDate = seasonReferenceDate(endYear, season)
  }

  if (preset !== 'seasonal') {
    startDate = clampDate(startDate, SATELLITE_ARCHIVE_START)
    endDate = clampDate(endDate, today)
    if (startDate > endDate) startDate = endDate
    startYear = Number(startDate.slice(0, 4))
    endYear = Number(endDate.slice(0, 4))
  }

  return { preset, startDate, endDate, exactDate, exactTimeUtc, season, startYear, endYear }
}

export function defaultSatelliteTimeSelection() {
  return selectionForPreset('five-years')
}

export function readSatelliteTimeSelection(): SatelliteTimeSelection {
  if (typeof window === 'undefined') return defaultSatelliteTimeSelection()
  try {
    const raw = window.localStorage.getItem(SATELLITE_TIME_STORAGE_KEY)
    if (!raw) return defaultSatelliteTimeSelection()
    const parsed = JSON.parse(raw) as Partial<SatelliteTimeSelection>
    const preset: SatelliteTimePreset = ['archive', 'from-1990', 'from-2015', 'twenty-years', 'five-years', 'one-year', 'custom', 'exact', 'seasonal'].includes(String(parsed.preset))
      ? parsed.preset as SatelliteTimePreset
      : 'five-years'
    return selectionForPreset(preset, {
      preset,
      startDate: String(parsed.startDate ?? SATELLITE_ARCHIVE_START),
      endDate: String(parsed.endDate ?? satelliteTodayUtc()),
      exactDate: String(parsed.exactDate ?? satelliteTodayUtc()),
      exactTimeUtc: String(parsed.exactTimeUtc ?? '12:00'),
      season: normalizeSeason(parsed.season),
      startYear: Number(parsed.startYear ?? SATELLITE_ARCHIVE_START.slice(0, 4)),
      endYear: Number(parsed.endYear ?? satelliteTodayUtc().slice(0, 4)),
    })
  } catch {
    return defaultSatelliteTimeSelection()
  }
}

export function saveSatelliteTimeSelection(selection: SatelliteTimeSelection) {
  const normalized = selectionForPreset(selection.preset, selection)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SATELLITE_TIME_STORAGE_KEY, JSON.stringify(normalized))
    window.dispatchEvent(new CustomEvent<SatelliteTimeSelection>(SATELLITE_TIME_EVENT, { detail: normalized }))
  }
  return normalized
}

export function requestedSatelliteDateTimeUtc(selection: SatelliteTimeSelection) {
  if (selection.preset !== 'exact') return null
  return `${selection.exactDate}T${selection.exactTimeUtc}:00Z`
}
