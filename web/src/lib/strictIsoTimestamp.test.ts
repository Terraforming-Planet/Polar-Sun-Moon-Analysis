import { describe, expect, it } from 'vitest'
import { strictIsoTimestamp } from './strictIsoTimestamp'

describe('strictIsoTimestamp', () => {
  it('accepts explicit valid ISO instants and normalizes offsets', () => {
    expect(strictIsoTimestamp('2026-08-06T00:15:30Z')).toBe('2026-08-06T00:15:30.000Z')
    expect(strictIsoTimestamp('2026-08-06T01:15:30+01:00')).toBe('2026-08-06T00:15:30.000Z')
    expect(strictIsoTimestamp(' 2024-02-29T23:59:59.250Z ')).toBe('2024-02-29T23:59:59.250Z')
  })

  it('rejects impossible calendar dates instead of allowing Date.parse normalization', () => {
    expect(strictIsoTimestamp('2026-02-29T10:00:00Z')).toBeNull()
    expect(strictIsoTimestamp('2026-02-30T10:00:00Z')).toBeNull()
    expect(strictIsoTimestamp('2026-04-31T10:00:00Z')).toBeNull()
    expect(strictIsoTimestamp('2026-13-01T10:00:00Z')).toBeNull()
    expect(strictIsoTimestamp('2026-00-01T10:00:00Z')).toBeNull()
  })

  it('rejects invalid clock and offset components', () => {
    expect(strictIsoTimestamp('2026-08-06T24:00:00Z')).toBeNull()
    expect(strictIsoTimestamp('2026-08-06T23:60:00Z')).toBeNull()
    expect(strictIsoTimestamp('2026-08-06T23:59:60Z')).toBeNull()
    expect(strictIsoTimestamp('2026-08-06T12:00:00+24:00')).toBeNull()
    expect(strictIsoTimestamp('2026-08-06T12:00:00+01:60')).toBeNull()
  })

  it('rejects ambiguous timestamps without an explicit full time and timezone', () => {
    expect(strictIsoTimestamp('2026-08-06')).toBeNull()
    expect(strictIsoTimestamp('2026-08-06T12:00:00')).toBeNull()
    expect(strictIsoTimestamp('08/06/2026 12:00')).toBeNull()
    expect(strictIsoTimestamp(null)).toBeNull()
  })
})
