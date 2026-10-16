import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireDataStatus, resolveHazardGeneratedAt } from './FireDataStatus'

describe('fire catalog generated timestamp compatibility', () => {
  it('prefers the current generated_at_utc field over the legacy generatedUtc field', () => {
    expect(resolveHazardGeneratedAt(
      '2026-08-02T10:00:00Z',
      '2026-08-01T10:00:00Z',
    )).toBe('2026-08-02T10:00:00Z')
  })

  it('uses the legacy generatedUtc timestamp when the current field is absent', () => {
    expect(resolveHazardGeneratedAt(undefined, '2026-08-02T09:30:00Z'))
      .toBe('2026-08-02T09:30:00Z')

    const html = renderToStaticMarkup(
      <FireDataStatus
        features={[]}
        generatedUtc="2026-08-02T09:30:00Z"
        nowMs={Date.parse('2026-08-02T10:30:00Z')}
      />,
    )

    expect(html).toContain('Czas publikacji katalogu')
    expect(html).toContain('09:30:00 UTC')
    expect(html).toContain('1.0 h')
    expect(html).toContain('aktualny opublikowany plik')
  })

  it('treats a blank current field as absent and uses the legacy timestamp', () => {
    expect(resolveHazardGeneratedAt('   ', ' 2026-08-02T09:30:00Z '))
      .toBe('2026-08-02T09:30:00Z')

    const html = renderToStaticMarkup(
      <FireDataStatus
        features={[]}
        generatedAtUtc="   "
        generatedUtc=" 2026-08-02T09:30:00Z "
        nowMs={Date.parse('2026-08-02T10:30:00Z')}
      />,
    )

    expect(html).toContain('09:30:00 UTC')
    expect(html).toContain('1.0 h')
    expect(html).toContain('aktualny opublikowany plik')
  })

  it('does not silently replace an invalid current timestamp with an older legacy timestamp', () => {
    expect(resolveHazardGeneratedAt('not-a-date', '2026-08-02T09:30:00Z'))
      .toBe('not-a-date')

    const html = renderToStaticMarkup(
      <FireDataStatus
        features={[]}
        generatedAtUtc="not-a-date"
        generatedUtc="2026-08-02T09:30:00Z"
        nowMs={Date.parse('2026-08-02T10:30:00Z')}
      />,
    )

    expect(html).toContain('nieprawidłowy czas publikacji')
    expect(html).toContain('brak poprawnego czasu publikacji')
    expect(html).toContain('nie można potwierdzić stanu punktów')
  })
})
