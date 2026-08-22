import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const entryScript = readFileSync(new URL('../public/simple-agentic-entry.js', import.meta.url), 'utf8')

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
