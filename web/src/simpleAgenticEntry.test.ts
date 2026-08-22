import { describe, expect, it } from 'vitest'

import indexHtml from '../index.html?raw'
import entryScript from '../public/simple-agentic-entry-v2.js?raw'

describe('Simple view Agentic EO entry', () => {
  it('loads the cache-busted Agentic EO helper in the production entry page', () => {
    expect(indexHtml).toContain('./simple-agentic-entry-v2.js')
    expect(indexHtml).not.toContain('./simple-agentic-entry.js"')
  })

  it('opens Advanced view without depending on translated button text', () => {
    expect(entryScript).toContain(".simple-shell .mode-switch-bar")
    expect(entryScript).toContain("!button.hasAttribute(BUTTON_ATTR)")
    expect(entryScript).toContain("buttons.find(button => button.textContent?.includes('Agentic EO')) ?? buttons[1]")
    expect(entryScript).toContain('fireRealClick(advancedButton)')
    expect(entryScript).toContain('fireRealClick(agenticButton)')
    expect(entryScript).toContain("new PointerEvent('pointerdown'")
    expect(entryScript).toContain("button.addEventListener('touchend'")
    expect(entryScript).not.toContain("findButtonByText(switchBar, 'Open Advanced view')")
  })

  it('publishes a detailed Agentic EO overview in Simple view', () => {
    expect(entryScript).toContain('Agentic EO — AI research that plans, checks sources and preserves uncertainty')
    expect(entryScript).toContain('Terra Agentic EO Coordinator')
    expect(entryScript).toContain('EO Source Scout')
    expect(entryScript).toContain('EO Evidence Verifier')
    expect(entryScript).toContain('Sentinel-1')
    expect(entryScript).toContain('Sentinel-2')
    expect(entryScript).toContain('Landsat')
    expect(entryScript).toContain('SWOT')
    expect(entryScript).toContain('Vistula TEST 014')
    expect(entryScript).toContain('environmental_finding_claim=false')
    expect(entryScript).toContain('water_loss_claim=false')
    expect(entryScript).toContain('causal_claim=false')
    expect(entryScript).toContain('How the agents work together')
    expect(entryScript).toContain('What TEST 014 does not prove')
    expect(entryScript).toContain('published/agentic-eo/vistula-test-014-live.json')
    expect(entryScript).toContain('docs/ESA_AGENTIC_EO.md')
  })
})
