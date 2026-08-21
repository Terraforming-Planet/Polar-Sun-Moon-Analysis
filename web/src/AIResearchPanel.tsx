import { useEffect, useMemo, useState } from 'react'

import './ai-research.css'
import './research-findings.css'
import './simple-mode-resources.css'
import { EvidenceExplainer } from './EvidenceExplainer'
import { ResearchArchivePanel } from './ResearchArchivePanel'
import { ResearchAreaBuilder } from './ResearchAreaBuilder'
import { SimpleContestQuickAccess } from './SimpleContestQuickAccess'
import { SimpleResearchAssistant } from './SimpleResearchAssistant'
import {
  listPublishedCases,
  normalizeEvidenceApiUrl,
  type EvidenceCaseSummary,
  type TrainingContextSummary,
} from './lib/evidenceApi'

type ResearchView = 'new' | 'archive' | 'explain'

export function AIResearchPanel({ simpleOnly = false }: { simpleOnly?: boolean }) {
  const endpoint = useMemo(() => normalizeEvidenceApiUrl(import.meta.env.VITE_EVIDENCE_API_URL), [])
  const [cases, setCases] = useState<EvidenceCaseSummary[]>([])
  const [trainings, setTrainings] = useState<TrainingContextSummary[]>([])
  const [selectedId, setSelectedId] = useState('test-001-forest-pond-kuchnia')
  const [activeView, setActiveView] = useState<ResearchView>('new')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!endpoint || simpleOnly) return
    const controller = new AbortController()
    listPublishedCases(endpoint, controller.signal)
      .then(result => {
        setCases(result.cases)
        setTrainings(result.training_context ?? [])
        setError('')
        setSelectedId(current => result.cases.some(item => item.case_id === current) ? current : (result.cases[0]?.case_id ?? current))
      })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => controller.abort()
  }, [endpoint, simpleOnly])

  const selected = cases.find(item => item.case_id === selectedId)
  const aiCaseIds = useMemo(() => new Set(cases.map(item => item.case_id)), [cases])
  const advancedBuilder = <ResearchAreaBuilder onOpenArchive={() => setActiveView('archive')} />

  if (simpleOnly) {
    return <section className="workspace ai-research-workspace simple-only-research">
      <div className="workspace-head ai-research-head">
        <div>
          <small>OPENAI · COPERNICUS · NASA · USGS · 3D EARTH</small>
          <h1>Research any place on Earth</h1>
          <p>Search a place, ask the private research assistant, then inspect the high-resolution 3D Earth reference view and official satellite evidence. Your question text stays only in the current browser-tab session.</p>
        </div>
        <span className="evidence-badge observation">SIMPLE VIEW</span>
      </div>
      <SimpleContestQuickAccess />
      {!endpoint && <p className="notice">The public AI Worker is not configured in this build.</p>}
      <SimpleResearchAssistant apiUrl={endpoint} advanced={advancedBuilder} modePolicy="simple" />
    </section>
  }

  return <section className="workspace ai-research-workspace">
    <div className="workspace-head ai-research-head">
      <div>
        <small>OPENAI · NASA · USGS · COPERNICUS · OPENSTREETMAP · NVIDIA L4</small>
        <h1>Research any place on Earth</h1>
        <p>Simple mode is designed for fast area searches. Advanced mode adds HQ imagery, files, model selection, flags, DEM profiles and reports. User question text remains private session context and is excluded from research archives.</p>
      </div>
      <span className="evidence-badge observation">AI RESEARCH</span>
    </div>

    <div className="research-mode-tabs" role="tablist" aria-label="AI Research sections">
      <button type="button" className={activeView === 'new' ? 'active' : ''} onClick={() => setActiveView('new')}>
        <b>01</b><span>Research area<small>simple console + advanced laboratory</small></span>
      </button>
      <button type="button" className={activeView === 'archive' ? 'active' : ''} onClick={() => setActiveView('archive')}>
        <b>02</b><span>Research archive<small>published tests + saved findings and assistant answers, no user prompts</small></span>
      </button>
      <button type="button" className={activeView === 'explain' ? 'active' : ''} onClick={() => setActiveView('explain')}>
        <b>03</b><span>Approved AI tests<small>published evidence packages</small></span>
      </button>
    </div>

    {!endpoint && <p className="notice">The public AI Worker is not configured in this build.</p>}
    {error && <p className="notice" role="alert">Could not retrieve the OpenAI evidence registry: {error}</p>}

    {activeView === 'new' && <SimpleResearchAssistant
      apiUrl={endpoint}
      advanced={advancedBuilder}
    />}

    {activeView !== 'new' && <>
      <div className="research-policy-strip">
        <span><b>Published tests:</b> 16</span>
        <span><b>OpenAI evidence:</b> {cases.length || 'loading…'}</span>
        <span><b>NVIDIA L4:</b> Training #1 + #2 + #3</span>
        <span><b>Rule:</b> evidence before claims</span>
      </div>

      <details className="research-training-context">
        <summary><span><small>NVIDIA L4 · PUBLIC RESEARCH CONTEXT</small><b>Three published AI training runs</b></span><em>Training ≠ ground truth · expand</em></summary>
        <p className="muted">Each approved test analysis receives the shared context of the three published NVIDIA L4 training runs. Training metrics describe learning and data pipelines; they are not automatically evidence of environmental change.</p>
        <div className="research-training-list">
          {trainings.map(item => <article key={item.training_id}>
            <span className="evidence-badge derived">{item.short_label}</span>
            <div><h3>{item.title}</h3><p>{item.gpu} · {item.summary}</p></div>
            <a className="button-link compact" href={item.public_page}>Report</a>
          </article>)}
          {!trainings.length && endpoint && !error && <p className="muted">Loading Training #1, #2 and #3…</p>}
        </div>
        <span className="evidence-badge derived">TRAINING ≠ GROUND TRUTH</span>
      </details>
    </>}

    {activeView === 'archive' && <ResearchArchivePanel
      aiCaseIds={aiCaseIds}
      selectedAiCaseId={selectedId}
      onSelectAiCase={setSelectedId}
      onOpenExplainer={() => setActiveView('explain')}
    />}

    {activeView === 'explain' && <section className="research-explainer-view">
      <div className="research-section-head">
        <div><small>REGISTERED OPENAI EVIDENCE</small><h2>Explain an approved test</h2></div>
        <span className="evidence-badge observation">SERVER-SELECTED EVIDENCE</span>
      </div>
      <p className="muted">This view is for published tests that passed the controlled evidence pipeline. Use the first tab for a new area.</p>
      <div className="research-explainer-selector">
        <label className="research-field">Test with active AI evidence<select value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={!cases.length}>
          {cases.map(item => <option key={item.case_id} value={item.case_id}>{item.short_label} · {item.title}</option>)}
        </select></label>
        {selected && <div className="research-selected-case">
          <span className="evidence-badge observation">{selected.short_label}</span>
          <div><b>{selected.title}</b><small>{selected.category} · {selected.temporal_scope ?? 'range recorded in the evidence package'}</small></div>
          <a className="button-link compact" href={selected.public_page}>Full test</a>
        </div>}
      </div>
      {selected ? <EvidenceExplainer apiUrl={endpoint} caseId={selected.case_id} caseLabel={selected.title} /> : <div className="empty"><span>NO ACTIVE EVIDENCE PACKAGE</span><p>Select a test from the archive that has an active AI analysis package.</p></div>}
    </section>}
  </section>
}
