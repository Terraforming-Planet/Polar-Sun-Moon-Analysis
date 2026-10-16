import { describe, expect, it } from 'vitest'
import { normalizeHazardCategories } from './normalizeHazardCategories'

describe('normalizeHazardCategories', () => {
  it('supports string labels and official category objects without guessing unknown fields', () => {
    expect(normalizeHazardCategories([
      ' Wildfires ',
      { id: 'wildfires', title: ' Wildfires ' },
      { id: 'floods' },
      { title: ' Severe Storms ' },
      { id: 7, title: null },
      { name: 'Volcanoes' },
      '',
      null,
    ])).toEqual([
      'Wildfires',
      'Wildfires',
      'floods',
      'Severe Storms',
    ])
  })

  it('returns an empty list for malformed category metadata', () => {
    expect(normalizeHazardCategories(null)).toEqual([])
    expect(normalizeHazardCategories('Wildfires')).toEqual([])
    expect(normalizeHazardCategories({ title: 'Wildfires' })).toEqual([])
  })
})
