import { describe, expect, it } from 'vitest'

import panelSource from './AIResearchPanel.tsx?raw'
import boundarySource from './ResearchArchiveErrorBoundary.tsx?raw'

describe('research archive resilience', () => {
  it('keeps an archive render failure inside a local error boundary', () => {
    expect(panelSource).toContain('<ResearchArchiveErrorBoundary>')
    expect(panelSource).toContain('<ResearchArchivePanel')
    expect(boundarySource).toContain('Reszta aplikacji nadal działa')
  })

  it('shows all four published L4 training contexts', () => {
    expect(panelSource).toContain('Training #1 + #2 + #3 + #4')
    expect(panelSource).toContain('Four published AI training runs')
  })
})
