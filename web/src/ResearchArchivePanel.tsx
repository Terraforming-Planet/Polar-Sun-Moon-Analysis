import { useEffect, useMemo, useState } from 'react'

import { ResearchDataPreview } from './ResearchDataPreview'
import {
  deleteAssistantAnswerLocally,
  deleteResearchFindingLocally,
  deleteResearchManifestLocally,
  downloadAssistantAnswer,
  downloadResearchFinding,
  downloadResearchManifest,
  loadLocalAssistantAnswers,
  loadLocalResearchArchive,
  loadLocalResearchFindings,
  type ResearchAssistantAnswerRecord,
  type ResearchFindingRecord,
  type ResearchManifest,
} from './researchArchive'
import { PUBLIC_RESEARCH_CATEGORIES, PUBLIC_RESEARCH_TESTS } from './researchCatalog'
import { researchShapeLabel } from './researchGeometry'
import { temporalPresetLabel } from './researchTime'

const base = import.meta.env.BASE_URL

export function ResearchArchivePanel({
  aiCaseIds,
  selectedAiCaseId,
  onSelectAiCase,
  onOpenExplainer,
}: {
  aiCaseIds: Set<string>
  selectedAiCaseId: string
  onSelectAiCase: (caseId: string) => void
  onOpenExplainer: () => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('wszystkie')
  const [localArchive, setLocalArchive] = useState<ResearchManifest[]>([])
  const [findings, setFindings] = useState<ResearchFindingRecord[]>([])
  const [assistantAnswers, setAssistantAnswers] = useState<ResearchAssistantAnswerRecord[]>([])
  const [expandedLocalId, setExpandedLocalId] = useState<string | null>(null)
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null)

  const refreshLocalArchive = () => {
    setLocalArchive(loadLocalResearchArchive())
    setFindings(loadLocalResearchFindings())
    setAssistantAnswers(loadLocalAssistantAnswers())
  }
  useEffect(refreshLocalArchive, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('en')
    return PUBLIC_RESEARCH_TESTS.filter(item => {
      const categoryMatch = category === 'wszystkie' || item.category === category
      const searchMatch = !needle || `${item.label} ${item.title} ${item.category} ${item.temporalScope}`.toLocaleLowerCase('en').includes(needle)
      return categoryMatch && searchMatch
    })
  }, [category, query])

  const removeLocal = (id: string) => {
    deleteResearchManifestLocally(id)
    if (expandedLocalId === id) setExpandedLocalId(null)
    refreshLocalArchive()
  }

  const removeFinding = (id: string) => {
    deleteResearchFindingLocally(id)
    if (expandedFindingId === id) setExpandedFindingId(null)
    refreshLocalArchive()
  }

  const removeAssistantAnswer = (id: string) => {
    deleteAssistantAnswerLocally(id)
    refreshLocalArchive()
  }

  return <section className="research-archive" aria-label="Terra Observation research archive">
    <div className="research-section-head archive-title">
      <div><small>PUBLIC RESEARCH ARCHIVE</small><h2>TEST 001–016 archive</h2></div>
      <span className="evidence-badge observation">16 PUBLISHED TESTS</span>
    </div>
    <p className="muted">Each published test has a stable number and public report. The OpenAI registry is intentionally narrower: only tests with an approved evidence package can be sent to the Explainer.</p>

    <div className="research-archive-toolbar">
      <label className="research-field">Search<input value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. Vistula, lake, Himalayas…" /></label>
      <label className="research-field">Category<select value={category} onChange={event => setCategory(event.target.value)}>{PUBLIC_RESEARCH_CATEGORIES.map(item => <option key={item} value={item}>{item === 'wszystkie' ? 'all' : item}</option>)}</select></label>
      <div className="archive-count"><b>{filtered.length}</b><span>visible tests</span></div>
    </div>

    <div className="research-archive-table" role="table" aria-label="Published research tests">
      <div className="research-archive-row header" role="row">
        <span>Test</span><span>Research</span><span>Range</span><span>AI</span><span>Report</span>
      </div>
      {filtered.map(item => {
        const aiReady = Boolean(item.aiCaseId && aiCaseIds.has(item.aiCaseId))
        const selected = Boolean(item.aiCaseId && item.aiCaseId === selectedAiCaseId)
        return <div className={`research-archive-row ${selected ? 'selected' : ''}`} role="row" key={item.testId}>
          <span className="archive-test-id"><b>{item.label}</b><small>{item.category}</small></span>
          <span className="archive-test-title">{item.title}</span>
          <span>{item.temporalScope}</span>
          <span>{aiReady ? <button type="button" className="archive-ai-button" onClick={() => {
            if (!item.aiCaseId) return
            onSelectAiCase(item.aiCaseId)
            onOpenExplainer()
          }}>{selected ? 'Selected in AI' : 'Analyze with AI'}</button> : <em className="archive-ai-pending">evidence pending</em>}</span>
          <span><a className="button-link compact" href={`${base}${item.publicPath}`}>Open</a></span>
        </div>
      })}
    </div>

    <div className="research-section-head local-archive-title">
      <div><small>ASSISTANT ANSWERS · USER PROMPTS EXCLUDED</small><h2>Saved assistant answers</h2></div>
      <span className="evidence-badge observation">PROMPTS NOT STORED</span>
    </div>
    <p className="muted">This device-local archive can show where a research session was focused and what the assistant answered. It deliberately does not contain the user's question, prompt text or raw conversation history. Nothing in this section is a cross-user activity log.</p>

    {assistantAnswers.length ? <div className="local-research-list research-findings-list">
      {assistantAnswers.map(item => <article key={item.id} className="local-research-item finding-item">
        <div><span className="evidence-badge observation">ASSISTANT ANSWER</span><h3>{item.place?.label ?? 'Research session'}</h3></div>
        <div className="local-research-meta">
          <span><b>Saved</b>{new Date(item.saved_at_utc).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</span>
          <span><b>Model</b>{item.model}</span>
          <span><b>Location</b>{item.place ? `${item.place.latitude.toFixed(5)}°, ${item.place.longitude.toFixed(5)}°` : 'not recorded'}</span>
        </div>
        <div className="research-finding-details"><article className="research-answer-only"><small>ASSISTANT RESPONSE</small><p>{item.answer}</p></article></div>
        <p className="muted"><b>Privacy:</b> user prompt not stored.</p>
        <div className="hero-actions local-research-actions">
          <button type="button" className="secondary" onClick={() => downloadAssistantAnswer(item)}>Export JSON</button>
          <button type="button" className="research-delete" onClick={() => removeAssistantAnswer(item.id)}>Delete saved answer</button>
        </div>
      </article>)}
    </div> : <div className="empty research-empty"><span>NO SAVED ASSISTANT ANSWERS</span><p>Use “Save assistant answer only” after a response. The matching user question is never written into this archive.</p></div>}

    <div className="research-section-head local-archive-title">
      <div><small>SAVED RESEARCH FINDINGS · NO RAW CHAT</small><h2>Saved imagery and findings</h2></div>
      <span className="evidence-badge observation">CHAT EXCLUDED</span>
    </div>
    <p className="muted">These records contain explicitly saved evidence only: source-image links, dates/sensors, Landsat metadata and AI findings. Private user prompts are not part of the record.</p>

    {findings.length ? <div className="local-research-list research-findings-list">
      {findings.map(item => {
        const expanded = item.id === expandedFindingId
        return <article key={item.id} className={`local-research-item finding-item ${expanded ? 'expanded' : ''}`}>
          <div><span className="evidence-badge observation">FINDING</span><h3>{item.title}</h3></div>
          <div className="local-research-meta">
            <span><b>Area</b>{item.area.latitude.toFixed(5)}°, {item.area.longitude.toFixed(5)}° · {item.area.radius_km} km</span>
            <span><b>Range</b>{item.period.start_date} → {item.period.end_date}</span>
            <span><b>Sources</b>{item.source_images.length} images · {item.landsat_catalog.matched} Landsat scenes matched</span>
          </div>
          <p><b>{item.conclusion.headline}</b></p>
          <div className="hero-actions local-research-actions">
            <button type="button" className="primary" onClick={() => setExpandedFindingId(expanded ? null : item.id)}>{expanded ? 'Hide details' : 'Imagery and findings'}</button>
            <button type="button" className="secondary" onClick={() => downloadResearchFinding(item)}>Export JSON</button>
            <button type="button" className="research-delete" onClick={() => removeFinding(item.id)}>Delete saved finding</button>
          </div>
          {expanded && <div className="research-finding-details">
            <div className="research-finding-summary">
              <article><small>WHAT IS VISIBLE</small><p>{item.conclusion.what_is_visible}</p></article>
              <article><small>CHANGE</small><p>{item.conclusion.change_over_time}</p></article>
              <article><small>WATER / TERRAIN</small><p>{item.conclusion.water_assessment}</p></article>
              <article><small>CONFIDENCE</small><p>{item.conclusion.confidence.level} · {item.conclusion.confidence.reason}</p></article>
            </div>
            {item.source_images.length > 0 && <div className="research-finding-images">{item.source_images.map(image => <figure key={`${image.date}-${image.source}`}><a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={`${image.source} ${image.date}`} loading="lazy" /></a><figcaption><b>{image.date}</b><span>{image.source}</span></figcaption></figure>)}</div>}
            <p className="muted"><b>Privacy:</b> {item.privacy_note === 'raw-chat-not-included' ? 'raw chat and user prompts were not stored.' : item.privacy_note}</p>
          </div>}
        </article>
      })}
    </div> : <div className="empty research-empty"><span>NO SAVED FINDINGS</span><p>After an analysis, use “Save imagery + findings”. Saving is explicit and excludes raw chat and user prompt text.</p></div>}

    <div className="research-section-head local-archive-title">
      <div><small>LOCAL DRAFT ARCHIVE</small><h2>Area drafts</h2></div>
      <span className="evidence-badge derived">DEVICE LOCAL</span>
    </div>
    <p className="muted">Area drafts are stored locally in this browser. They contain research geometry/settings, not chat history.</p>

    {localArchive.length ? <div className="local-research-list">
      {localArchive.map(item => {
        const expanded = item.id === expandedLocalId
        const shape = item.area.shape ?? 'circle'
        const mode = item.temporal_scope.mode ?? 'custom'
        return <article key={item.id} className={`local-research-item ${expanded ? 'expanded' : ''}`}>
          <div><span className="evidence-badge derived">DRAFT</span><h3>{item.title}</h3></div>
          <div className="local-research-meta">
            <span><b>Area</b>{item.area.latitude.toFixed(5)}°, {item.area.longitude.toFixed(5)}° · {researchShapeLabel(shape)} · {item.area.radius_km} km</span>
            <span><b>Range</b>{item.temporal_scope.start_date} → {item.temporal_scope.end_date} · {temporalPresetLabel(mode)}</span>
            <span><b>Analyses</b>{item.analyses.join(', ')}</span>
          </div>
          {item.notes && <p>{item.notes}</p>}
          <div className="hero-actions local-research-actions">
            <button type="button" className="primary" onClick={() => setExpandedLocalId(expanded ? null : item.id)}>{expanded ? 'Hide data' : 'Data and imagery'}</button>
            <button type="button" className="secondary" onClick={() => downloadResearchManifest(item)}>Export JSON</button>
            <button type="button" className="research-delete" onClick={() => removeLocal(item.id)}>Delete local draft</button>
          </div>
          {expanded && <ResearchDataPreview
            latitude={item.area.latitude}
            longitude={item.area.longitude}
            radiusKm={item.area.radius_km}
            shape={shape}
            startDate={item.temporal_scope.start_date}
            endDate={item.temporal_scope.end_date}
          />}
        </article>
      })}
    </div> : <div className="empty research-empty"><span>NO LOCAL DRAFTS</span><p>Create a new area research draft in the advanced builder. It will appear here with access to its data and imagery.</p></div>}
  </section>
}
