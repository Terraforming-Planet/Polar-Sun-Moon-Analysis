import { describe, expect, it } from 'vitest'

import indexHtml from '../index.html?raw'
import entryScript from '../public/simple-agentic-entry.js?raw'

describe('Simple view Agentic EO entry', () => {
  it('loads the Agentic EO helper in the production entry page', () => {
    expect(indexHtml).toContain('./simple-agentic-entry.js')
  })

  it('opens Advanced view and then the Agentic EO tab', () => {
    expect(entryScript).toContain(".simple-shell .mode-switch-bar")
    expect(entryScript).toContain("'Open Advanced view'")
    expect(entryScript).toContain("'Agentic EO'")
    expect(entryScript).toContain('agenticButton.click()')
  })
})
