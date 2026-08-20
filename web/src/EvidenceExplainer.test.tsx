import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EvidenceExplainer } from './EvidenceExplainer'

describe('EvidenceExplainer', () => {
  it('renders a safe disconnected state when the Worker URL is not configured', () => {
    const html = renderToStaticMarkup(<EvidenceExplainer apiUrl="" caseLabel="Test 011" caseId="test-011-ilawa-zalewo" />)

    expect(html).toContain('AI Evidence / Research Explainer')
    expect(html).toContain('DISCONNECTED')
    expect(html).toContain('Explain selected test with OpenAI')
    expect(html).toContain('browser cannot send an arbitrary prompt')
    expect(html).toContain('must preserve every scientific limitation')
  })

  it('renders the selected test label without exposing an OpenAI key prop', () => {
    const html = renderToStaticMarkup(<EvidenceExplainer apiUrl="https://worker.example" caseId="test-015-himalaya-tibet" caseLabel="Himalaya / Tibetan Plateau" />)

    expect(html).toContain('Himalaya / Tibetan Plateau')
    expect(html).not.toContain('OPENAI_API_KEY')
    expect(html).not.toContain('sk-')
  })
})
