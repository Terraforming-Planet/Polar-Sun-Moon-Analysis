import { describe, expect, it } from 'vitest'

import { yearsForTerrainStudy } from './terrainStudyEnhancement'
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

describe('terrain study selection', () => {
  it('creates one study slot for every selected year', () => {
    expect(yearsForTerrainStudy(selection())).toEqual([2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019])
  })

  it('does not create cloud-filtered yearly study slots in exact UTC mode', () => {
    expect(yearsForTerrainStudy(selection({ preset: 'exact', startYear: 2020, endYear: 2020 }))).toEqual([])
  })

  it('returns no years for an invalid reversed range', () => {
    expect(yearsForTerrainStudy(selection({ startYear: 2020, endYear: 2010 }))).toEqual([])
  })
})
