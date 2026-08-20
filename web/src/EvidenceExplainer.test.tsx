import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EvidenceExplainer } from './EvidenceExplainer'

describe('EvidenceExplainer', () => {
  it('renders a safe disconnected state when the Worker URL is not configured', () => {
    const html = renderToStaticMarkup(<EvidenceExplainer apiUrl="" />)

    expect(html).toContain('AI Evidence / Research Explainer')
    expect(html).toContain('DISCONNECTED')
    expect(html).toContain('Explain Vistula evidence with OpenAI')
    expect(html).toContain('browser cannot send an arbitrary prompt')
    expect(html).toContain('does not claim a measured water-loss magnitude')
  })

  it('never renders an OpenAI API key prop because the component has no such input', () => {
    const html = renderToStaticMarkup(<EvidenceExplainer apiUrl="https://worker.example" caseId="vistula-test-014" />)

    expect(html).not.toContain('OPENAI_API_KEY')
    expect(html).not.toContain('sk-')
  })
})
