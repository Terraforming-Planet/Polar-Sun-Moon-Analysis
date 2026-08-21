export const SATELLITE_ARCHIVE_START = '1972-07-23'
export const SATELLITE_TIME_STORAGE_KEY = 'terra-observation-satellite-time/v1'
export const SATELLITE_TIME_EVENT = 'terra-satellite-time-selection'
export const SATELLITE_TIME_MATCH_EVENT = 'terra-analysis-time-match'

export type SatelliteTimePreset = 'archive' | 'from-1990' | 'from-2015' | 'five-years' | 'one-year' | 'custom' | 'exact'

export type SatelliteTimeSelection = {
  preset: SatelliteTimePreset
  startDate: string
  endDate: string
  exactDate: string
  exactTimeUtc: string
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

export function satelliteTodayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function shiftYears(date: string, years: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCFullYear(value.getUTCFullYear() + years)
  return value.toISOString().slice(0, 10)
}

function clampDate(value: string, fallback: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback
  if (value < SATELLITE_ARCHIVE_START) return SATELLITE_ARCHIVE_START
  const today = satelliteTodayUtc()
  if (value > today) return today
  return value
}

export function selectionForPreset(preset: SatelliteTimePreset, current?: SatelliteTimeSelection): SatelliteTimeSelection {
  const today = satelliteTodayUtc()
  const exactDate = clampDate(current?.exactDate ?? today, today)
  const exactTimeUtc = /^\d{2}:\d{2}$/.test(current?.exactTimeUtc ?? '') ? current!.exactTimeUtc : '12:00'
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
  } else if (preset === 'five-years') {
    startDate = shiftYears(today, -5)
    endDate = today
  } else if (preset === 'one-year') {
    startDate = shiftYears(today, -1)
    endDate = today
  } else if (preset === 'exact') {
    startDate = exactDate
    endDate = exactDate
  }

  startDate = clampDate(startDate, SATELLITE_ARCHIVE_START)
  endDate = clampDate(endDate, today)
  if (startDate > endDate) startDate = endDate

  return { preset, startDate, endDate, exactDate, exactTimeUtc }
}

export function defaultSatelliteTimeSelection() {
  return selectionForPreset('archive')
}

export function readSatelliteTimeSelection(): SatelliteTimeSelection {
  if (typeof window === 'undefined') return defaultSatelliteTimeSelection()
  try {
    const raw = window.localStorage.getItem(SATELLITE_TIME_STORAGE_KEY)
    if (!raw) return defaultSatelliteTimeSelection()
    const parsed = JSON.parse(raw) as Partial<SatelliteTimeSelection>
    const preset: SatelliteTimePreset = ['archive', 'from-1990', 'from-2015', 'five-years', 'one-year', 'custom', 'exact'].includes(String(parsed.preset))
      ? parsed.preset as SatelliteTimePreset
      : 'archive'
    return selectionForPreset(preset, {
      preset,
      startDate: String(parsed.startDate ?? SATELLITE_ARCHIVE_START),
      endDate: String(parsed.endDate ?? satelliteTodayUtc()),
      exactDate: String(parsed.exactDate ?? satelliteTodayUtc()),
      exactTimeUtc: String(parsed.exactTimeUtc ?? '12:00'),
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
