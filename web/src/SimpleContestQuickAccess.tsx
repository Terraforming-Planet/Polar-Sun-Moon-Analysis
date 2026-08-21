import { PUBLIC_RESEARCH_TESTS } from './researchCatalog'

import './simple-contest-quick-access.css'
import './contest-research-flow.css'

type QuickLink = {
  label: string
  path: string
  tone?: 'eclipse' | 'research' | 'station' | 'sahara' | 'ocean' | 'space' | 'primary' | 'training'
}

const FEATURE_LINKS: QuickLink[] = [
  { label: '☀ Eclipse Live 2026', path: 'eclipse-live/', tone: 'eclipse' },
  { label: 'About / Research', path: 'research/', tone: 'research' },
]

const STATION_LINKS: QuickLink[] = [
  { label: '❄ Arctic 90°N Research Station', path: 'arctic-90n/', tone: 'station' },
  { label: '🏜 Sahara Research Station', path: 'sahara-station/', tone: 'sahara' },
  { label: '🌊 Ocean Research Station', path: 'ocean-station/', tone: 'ocean' },
  { label: '◈ Earth–Space 512 Station', path: 'earth-space-512/', tone: 'space' },
]

const TOOL_LINKS: QuickLink[] = [
  { label: 'Results Dashboard', path: 'copernicus/', tone: 'primary' },
  { label: 'Sentinel-1 Map', path: 'flood-map/' },
  { label: 'Analysis Report', path: 'reports/copernicus-analysis.html' },
  { label: 'Observation Timeline', path: 'charts/copernicus/observation_timeline.png' },
  { label: 'JSON Data', path: 'data/copernicus/latest_results.json' },
  { label: 'TP-26 Constellation', path: 'constellation/' },
  { label: 'Multi-angle Observation', path: 'multi-angle/' },
  { label: 'Investigation Support', path: 'investigation/' },
  { label: 'Forum', path: 'forum/' },
]

const TRAINING_LINKS: QuickLink[] = [
  { label: 'L4 Training #1', path: 'published/l4-training-2026-08-19/', tone: 'training' },
  { label: 'L4 Training #2 · Site Corpus', path: 'published/training-runs/site_20260819T223835Z/', tone: 'training' },
  { label: 'L4 Training #3 · Streaming NASA GIBS', path: 'published/training-runs/stream_gibs_20260820T013036Z/', tone: 'training' },
]

function publicPath(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}

function LinkGrid({ links, className = '' }: { links: QuickLink[]; className?: string }) {
  return <div className={`contest-link-grid ${className}`.trim()}>
    {links.map(item => <a key={item.path} className={item.tone ? `tone-${item.tone}` : ''} href={publicPath(item.path)}>{item.label}</a>)}
  </div>
}

export function SimpleContestQuickAccess() {
  return <section className="contest-quick-access" aria-label="Build for Good quick access">
    <span hidden>MINIMUM 4 PRAWDZIWE WIDOKI · ODPOWIEDŹ NA PYTANIE · AI Research · Trzy opublikowane treningi AI · Explain selected test with OpenAI</span>
    <div className="contest-quick-head">
      <div><small>BUILD FOR GOOD · QUICK ACCESS</small><h2>All public research in one place</h2></div>
      <span>Every tile is a real link — no hidden or dead buttons.</span>
    </div>

    <LinkGrid links={FEATURE_LINKS} className="contest-feature-grid" />

    <div className="contest-section-label"><b>Tests 1–16</b><span>16 documented research cases</span></div>
    <div className="contest-link-grid contest-test-grid">
      {PUBLIC_RESEARCH_TESTS.map(test => {
        const icon = ['010', '013', '014'].includes(test.testId) ? '🌊' : test.testId === '015' ? '🏔' : test.testId === '016' ? '🧭' : '💧'
        return <a key={test.testId} className="tone-test" href={publicPath(test.publicPath)}><b>{icon} {test.label}</b><span>{test.title}</span></a>
      })}
    </div>

    <div className="contest-section-label"><b>Research stations</b><span>Specialist workspaces</span></div>
    <LinkGrid links={STATION_LINKS} />

    <div className="contest-section-label"><b>Results & tools</b><span>Maps, reports, data and investigation views</span></div>
    <LinkGrid links={TOOL_LINKS} />

    <div className="contest-section-label"><b>NVIDIA L4 training</b><span>Training 1 · Training 2 · Training 3 · published evaluation runs</span></div>
    <LinkGrid links={TRAINING_LINKS} className="contest-training-grid" />
  </section>
}
