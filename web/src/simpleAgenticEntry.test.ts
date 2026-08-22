import { describe, expect, it } from 'vitest'

import indexHtml from '../index.html?raw'
import entryScript from '../public/simple-agentic-entry-v2.js?raw'
import mainSource from './main.tsx?raw'

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

  it('keeps the Simple home clean and places extra explanation only in the active Agentic EO tab', () => {
    expect(entryScript).not.toContain('simple-agentic-overview')
    expect(entryScript).not.toContain('shell.insertBefore(section, main)')
    expect(entryScript).toContain("if (document.querySelector('.simple-shell')) return")
    expect(entryScript).toContain("agenticButton?.classList.contains('active')")
    expect(entryScript).toContain('data-agentic-eo-advanced-details')
    expect(entryScript).toContain('Provenance before model memory')
    expect(entryScript).toContain('Scientific uncertainty is explicit')
    expect(entryScript).toContain('How the agents work together')
    expect(entryScript).toContain('What TEST 014 does not prove')

    expect(mainSource).toContain("tab === 'agentic'")
    expect(mainSource).toContain('Agentic EO — multi-agent research coordinator')
    expect(mainSource).toContain('Terra Agentic EO Coordinator')
    expect(mainSource).toContain('EO Source Scout')
    expect(mainSource).toContain('EO Evidence Verifier')
    expect(mainSource).toContain('Vistula TEST 014')
    expect(mainSource).toContain('environmental_finding_claim=false')
    expect(mainSource).toContain('water_loss_claim=false')
    expect(mainSource).toContain('causal_claim=false')
  })
})
