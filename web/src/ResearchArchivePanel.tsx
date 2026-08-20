import { useEffect, useMemo, useState } from 'react'

import { ResearchDataPreview } from './ResearchDataPreview'
import {
  deleteResearchManifestLocally,
  downloadResearchManifest,
  loadLocalResearchArchive,
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
  const [expandedLocalId, setExpandedLocalId] = useState<string | null>(null)

  const refreshLocalArchive = () => setLocalArchive(loadLocalResearchArchive())
  useEffect(refreshLocalArchive, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pl')
    return PUBLIC_RESEARCH_TESTS.filter(item => {
      const categoryMatch = category === 'wszystkie' || item.category === category
      const searchMatch = !needle || `${item.label} ${item.title} ${item.category} ${item.temporalScope}`.toLocaleLowerCase('pl').includes(needle)
      return categoryMatch && searchMatch
    })
  }, [category, query])

  const removeLocal = (id: string) => {
    deleteResearchManifestLocally(id)
    if (expandedLocalId === id) setExpandedLocalId(null)
    refreshLocalArchive()
  }

  return <section className="research-archive" aria-label="Archiwum badań Terra Observation">
    <div className="research-section-head archive-title">
      <div><small>PUBLIC RESEARCH ARCHIVE</small><h2>Archiwum TEST 001–016</h2></div>
      <span className="evidence-badge observation">16 PUBLISHED TESTS</span>
    </div>
    <p className="muted">Każdy opublikowany test ma stały numer i publiczny raport. Rejestr OpenAI jest celowo węższy: tylko testy z zatwierdzonym pakietem evidence mogą zostać wysłane do Explainera.</p>

    <div className="research-archive-toolbar">
      <label className="research-field">Szukaj<input value={query} onChange={event => setQuery(event.target.value)} placeholder="np. Wisła, jezioro, Himalaje…" /></label>
      <label className="research-field">Kategoria<select value={category} onChange={event => setCategory(event.target.value)}>{PUBLIC_RESEARCH_CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <div className="archive-count"><b>{filtered.length}</b><span>widocznych testów</span></div>
    </div>

    <div className="research-archive-table" role="table" aria-label="Publiczne testy badawcze">
      <div className="research-archive-row header" role="row">
        <span>Test</span><span>Badanie</span><span>Zakres</span><span>AI</span><span>Raport</span>
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
          }}>{selected ? 'Wybrany w AI' : 'Analizuj w AI'}</button> : <em className="archive-ai-pending">evidence pending</em>}</span>
          <span><a className="button-link compact" href={`${base}${item.publicPath}`}>Otwórz</a></span>
        </div>
      })}
    </div>

    <div className="research-section-head local-archive-title">
      <div><small>LOCAL DRAFT ARCHIVE</small><h2>Moje badania</h2></div>
      <span className="evidence-badge derived">DEVICE LOCAL</span>
    </div>
    <p className="muted">Szkice są zapisane lokalnie w tej przeglądarce. Możesz ponownie otworzyć dla nich oficjalne dane i obrazy satelitarne bez wysyłania szkicu do GitHuba ani OpenAI.</p>

    {localArchive.length ? <div className="local-research-list">
      {localArchive.map(item => {
        const expanded = item.id === expandedLocalId
        const shape = item.area.shape ?? 'circle'
        const mode = item.temporal_scope.mode ?? 'custom'
        return <article key={item.id} className={`local-research-item ${expanded ? 'expanded' : ''}`}>
          <div><span className="evidence-badge derived">DRAFT</span><h3>{item.title}</h3></div>
          <div className="local-research-meta">
            <span><b>Obszar</b>{item.area.latitude.toFixed(5)}°, {item.area.longitude.toFixed(5)}° · {researchShapeLabel(shape)} · {item.area.radius_km} km</span>
            <span><b>Zakres</b>{item.temporal_scope.start_date} → {item.temporal_scope.end_date} · {temporalPresetLabel(mode)}</span>
            <span><b>Analizy</b>{item.analyses.join(', ')}</span>
          </div>
          {item.notes && <p>{item.notes}</p>}
          <div className="hero-actions local-research-actions">
            <button type="button" className="primary" onClick={() => setExpandedLocalId(expanded ? null : item.id)}>{expanded ? 'Ukryj dane' : 'Dane i obrazy'}</button>
            <button type="button" className="secondary" onClick={() => downloadResearchManifest(item)}>Eksport JSON</button>
            <button type="button" className="research-delete" onClick={() => removeLocal(item.id)}>Usuń lokalny szkic</button>
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
    </div> : <div className="empty research-empty"><span>BRAK LOKALNYCH SZKICÓW</span><p>Utwórz nowe badanie w kreatorze obszaru. Po zapisaniu pojawi się tutaj i będzie można pobrać dla niego dane oraz obrazy.</p></div>}
  </section>
}
