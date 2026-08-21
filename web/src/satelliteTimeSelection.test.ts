import { describe, expect, it } from 'vitest'

import {
  SATELLITE_ARCHIVE_START,
  requestedSatelliteDateTimeUtc,
  selectionForPreset,
} from './satelliteTimeSelection'

describe('satellite time selection', () => {
  it('starts the full comparable land archive at Landsat 1', () => {
    const selection = selectionForPreset('archive')
    expect(selection.startDate).toBe(SATELLITE_ARCHIVE_START)
    expect(selection.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('provides the requested quick historical ranges', () => {
    expect(selectionForPreset('from-1990').startDate).toBe('1990-01-01')
    expect(selectionForPreset('from-2015').startDate).toBe('2015-01-01')
  })

  it('clamps custom ranges to the supported archive and today', () => {
    const selection = selectionForPreset('custom', {
      preset: 'custom',
      startDate: '1900-01-01',
      endDate: '2999-12-31',
      exactDate: '1900-01-01',
      exactTimeUtc: '09:30',
    })
    expect(selection.startDate).toBe(SATELLITE_ARCHIVE_START)
    expect(selection.endDate).not.toBe('2999-12-31')
  })

  it('builds an exact UTC timestamp only in exact mode', () => {
    const selection = selectionForPreset('exact', {
      preset: 'exact',
      startDate: '2026-08-20',
      endDate: '2026-08-20',
      exactDate: '2026-08-20',
      exactTimeUtc: '14:45',
    })
    expect(requestedSatelliteDateTimeUtc(selection)).toBe('2026-08-20T14:45:00Z')
    expect(requestedSatelliteDateTimeUtc(selectionForPreset('from-2015', selection))).toBeNull()
  })
})