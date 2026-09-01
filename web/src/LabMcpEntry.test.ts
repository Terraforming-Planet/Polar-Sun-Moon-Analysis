import { describe, expect, it } from 'vitest'

import mainSource from './main.tsx?raw'

describe('LabMCP welcome entry', () => {
  it('places a dedicated LabMCP workbench below Simple and Advanced view', () => {
    const simplePosition = mainSource.indexOf('<b>Simple view</b>')
    const advancedPosition = mainSource.indexOf('<b>Advanced view</b>')
    const labPosition = mainSource.indexOf('<b>LabMCP</b>')

    expect(simplePosition).toBeGreaterThan(-1)
    expect(advancedPosition).toBeGreaterThan(simplePosition)
    expect(labPosition).toBeGreaterThan(advancedPosition)
    expect(mainSource).toContain('className="entry-mode-button labmcp"')
    expect(mainSource).toContain("ForgeMCP-Multi-Agent-Research---Game-Studio/#/labmcp")
    expect(mainSource).toContain('VITE_LABMCP_URL')
  })
})
