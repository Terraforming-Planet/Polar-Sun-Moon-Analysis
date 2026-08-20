import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AIResearchPanel } from './AIResearchPanel'

describe('AIResearchPanel', () => {
  it('renders the English research console and keeps user prompt privacy explicit', () => {
    const html = renderToStaticMarkup(<AIResearchPanel />)

    expect(html).toContain('Research any place on Earth')
    expect(html).toContain('Research area')
    expect(html).toContain('Research archive')
    expect(html).toContain('Approved AI tests')
    expect(html).toContain('Simple')
    expect(html).toContain('Advanced')
    expect(html).toContain('HQ imagery · files · models · flags · DEM · profiles · reports')
    expect(html).toContain('Search any area and investigate it immediately')
    expect(html).toContain('Research assistant')
    expect(html).toContain('your question text is not shown in the transcript after sending')
    expect(html).toContain('high-resolution basemap')
    expect(html).not.toContain('YOU / RESEARCHER')
    expect(html).not.toContain('OPENAI_API_KEY')
    expect(html).not.toContain('terra-research-chat/v1')
  })

  it('renders a locked simple-only experience without archive or advanced research tabs', () => {
    const html = renderToStaticMarkup(<AIResearchPanel simpleOnly />)
    expect(html).toContain('SIMPLE VIEW')
    expect(html).toContain('Research any place on Earth')
    expect(html).toContain('Search any area and investigate it immediately')
    expect(html).not.toContain('Approved AI tests')
    expect(html).not.toContain('Research archive')
    expect(html).not.toContain('Technical research settings')
  })
})
