import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireDataStatus, resolveFireSourceLabel } from './FireDataStatus'

describe('FireDataStatus source label', () => {
  it('keeps an explicit documented source and trims accidental whitespace', () => {
    expect(resolveFireSourceLabel('  NASA FIRMS / VIIRS  ')).toBe('NASA FIRMS / VIIRS')
  })

  it('falls back to the documented catalog source when the adapter passes an empty label', () => {
    expect(resolveFireSourceLabel('   ')).toBe('NASA EONET')

    const html = renderToStaticMarkup(
      <FireDataStatus sourceLabel="   " generatedAtUtc="2026-08-02T12:00:00Z" nowMs={Date.parse('2026-08-02T13:00:00Z')} />,
    )

    expect(html).toContain('Źródło katalogu')
    expect(html).toContain('NASA EONET')
  })
})
