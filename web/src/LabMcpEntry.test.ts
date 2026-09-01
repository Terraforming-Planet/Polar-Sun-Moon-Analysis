import { describe, expect, it } from 'vitest'

import mainSource from './main.tsx?raw'

describe('LabTerra WebMCP welcome entry', () => {
  it('places a dedicated LabTerra workbench below Simple and Advanced view', () => {
    const simplePosition = mainSource.indexOf('<b>Simple view</b>')
    const advancedPosition = mainSource.indexOf('<b>Advanced view</b>')
    const labPosition = mainSource.indexOf('<b>LabTerra WebMCP</b>')

    expect(simplePosition).toBeGreaterThan(-1)
    expect(advancedPosition).toBeGreaterThan(simplePosition)
    expect(labPosition).toBeGreaterThan(advancedPosition)
    expect(mainSource).toContain('className="entry-mode-button labmcp"')
    expect(mainSource).toContain('href={labMcpUrl}')
    expect(mainSource).toContain("ForgeMCP-Multi-Agent-Research---Game-Studio/#/labmcp")
    expect(mainSource).toContain('VITE_LABMCP_URL')
  })
})
