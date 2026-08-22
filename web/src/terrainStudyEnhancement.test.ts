import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  MAX_CONCURRENT_YEAR_REQUESTS,
  runYearTasksWithConcurrency,
  YEAR_REQUEST_TIMEOUT_MS,
  yearsForTerrainStudy,
} from './terrainStudyEnhancement'
import type { SatelliteTimeSelection } from './satelliteTimeSelection'

function selection(overrides: Partial<SatelliteTimeSelection> = {}): SatelliteTimeSelection {
  return {
    preset: 'seasonal',
    startDate: '2010-07-15',
    endDate: '2019-07-15',
    exactDate: '2020-07-15',
    exactTimeUtc: '12:00',
    season: 'summer',
    startYear: 2010,
    endYear: 2019,
    ...overrides,
  }
}

const source = readFileSync(fileURLToPath(new URL('./terrainStudyEnhancement.ts', import.meta.url)), 'utf8')

describe('terrain study selection', () => {
  it('creates one study slot for every selected seasonal year', () => {
    expect(yearsForTerrainStudy(selection())).toEqual([2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019])
  })

  it('maps the five-year preset to exactly five calendar-year image slots', () => {
    expect(yearsForTerrainStudy(selection({ preset: 'five-years', startYear: 2021, endYear: 2026 }))).toEqual([2022, 2023, 2024, 2025, 2026])
  })

  it('maps the twenty-year preset to exactly twenty calendar-year image slots', () => {
    expect(yearsForTerrainStudy(selection({ preset: 'twenty-years', startYear: 2000, endYear: 2026 }))).toEqual([
      2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016,
      2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ])
  })

  it('maps the one-year preset to exactly one image slot', () => {
    expect(yearsForTerrainStudy(selection({ preset: 'one-year', startYear: 2025, endYear: 2026 }))).toEqual([2026])
  })

  it('does not create cloud-filtered yearly study slots in exact UTC mode', () => {
    expect(yearsForTerrainStudy(selection({ preset: 'exact', startYear: 2020, endYear: 2020 }))).toEqual([])
  })

  it('returns no years for an invalid reversed range', () => {
    expect(yearsForTerrainStudy(selection({ startYear: 2020, endYear: 2010 }))).toEqual([])
  })

  it('caps yearly work at four concurrent tasks and actually runs in parallel', async () => {
    let active = 0
    let peak = 0
    await runYearTasksWithConcurrency(Array.from({ length: 12 }, (_, index) => 2000 + index), async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 2))
      active -= 1
    })
    expect(MAX_CONCURRENT_YEAR_REQUESTS).toBe(4)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(4)
  })

  it('uses a hard 28 second timeout for each yearly fetch', () => {
    expect(YEAR_REQUEST_TIMEOUT_MS).toBe(28_000)
  })

  it('renders all yearly placeholders before starting network work and never hides years 11+', () => {
    const placeholderRender = source.indexOf('renderStudy()\n\n  await runConcurrentYears')
    expect(placeholderRender).toBeGreaterThan(-1)
    expect(source).not.toContain('card.hidden =')
    expect(source).not.toContain('INITIAL_VISIBLE')
  })

  it('uses the yearly gallery as primary multi-year result and keeps single context optional', () => {
    expect(source).toContain('suppressSingleObservationCard(true)')
    expect(source).toContain('setDailyContextVisibility(true)')
    expect(source).toContain('selected years = ${totalYears} yearly study images')
  })

  it('starts AI from ready cards instead of waiting for the whole yearly run', () => {
    const processYear = source.indexOf('async function processYear')
    const pumpInsideYear = source.indexOf('pumpAi(request, currentRun, signal)', processYear)
    const awaitWholeRun = source.indexOf('await runConcurrentYears')
    expect(processYear).toBeGreaterThan(-1)
    expect(pumpInsideYear).toBeGreaterThan(processYear)
    expect(pumpInsideYear).toBeLessThan(awaitWholeRun)
  })
})
