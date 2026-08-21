import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ADVANCED_LEGACY_PATHS, AdvancedLegacyPanel } from './AdvancedLegacyPanel'

describe('AdvancedLegacyPanel', () => {
  it('keeps the old standalone modules and all 16 experiments reachable from Advanced view', () => {
    const html = renderToStaticMarkup(<AdvancedLegacyPanel />)

    expect(html).toContain('Stare zakładki i laboratoria')
    expect(html).toContain('Nic nie usuwamy.')

    const required = [
      'copernicus/',
      'flood-map/',
      'multi-angle/',
      'constellation/',
      'earth-space-512/',
      'investigation/',
      'research/',
      'river-helper-map/',
      'water-local/',
      'water-casebook/',
      'sahara-station/',
      'ocean-station/',
      'eclipse/',
      'eclipse-live/',
      'forum/',
      'arctic-90n/',
      'arctic-90n/real-ice-lab.html',
      'arctic-90n/measurement-gap.html',
      'arctic-90n/risk-demo.html',
      'arctic-90n/risk-simulation.html',
      'arctic-90n/lesson-hidden-water.html',
      'arctic-90n/mini-experiments-lab.html',
    ]

    for (const path of required) {
      expect(ADVANCED_LEGACY_PATHS).toContain(path)
      expect(html).toContain(path)
    }

    for (let number = 1; number <= 16; number += 1) {
      const path = `experiment-${String(number).padStart(3, '0')}/`
      expect(ADVANCED_LEGACY_PATHS).toContain(path)
      expect(html).toContain(path)
    }

    expect(new Set(ADVANCED_LEGACY_PATHS).size).toBe(ADVANCED_LEGACY_PATHS.length)
  })
})
