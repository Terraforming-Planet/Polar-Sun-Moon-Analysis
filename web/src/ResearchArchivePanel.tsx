import { useEffect, useMemo, useState } from 'react'

import { PUBLIC_RESEARCH_CATEGORIES, PUBLIC_RESEARCH_TESTS } from './researchCatalog'
import {
  deleteResearchManifestLocally,
  downloadResearchManifest,
  loadLocalResearchArchive,
  type ResearchManifest,
} from './researchArchive'

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
    <p className="muted">Te szkice są zapisane wyłącznie w tej przeglądarce. Nie trafiają automatycznie do GitHuba ani do OpenAI. Eksport JSON jest bezpiecznym formatem do późniejszego zatwierdzenia i uruchomienia w kontrolowanym pipeline.</p>

    {localArchive.length ? <div className="local-research-list">
      {localArchive.map(item => <article key={item.id} className="local-research-item">
        <div><span className="evidence-badge derived">DRAFT</span><h3>{item.title}</h3></div>
        <div className="local-research-meta">
          <span><b>Obszar</b>{item.area.latitude.toFixed(5)}°, {item.area.longitude.toFixed(5)}° · {item.area.radius_km} km</span>
          <span><b>Zakres</b>{item.temporal_scope.start_date} → {item.temporal_scope.end_date}</span>
          <span><b>Analizy</b>{item.analyses.join(', ')}</span>
        </div>
        {item.notes && <p>{item.notes}</p>}
        <div className="hero-actions">
          <button type="button" className="secondary" onClick={() => downloadResearchManifest(item)}>Eksport JSON</button>
          <button type="button" className="research-delete" onClick={() => removeLocal(item.id)}>Usuń lokalny szkic</button>
        </div>
      </article>)}
    </div> : <div className="empty research-empty"><span>BRAK LOKALNYCH SZKICÓW</span><p>Utwórz nowe badanie w kreatorze obszaru. Po zapisaniu pojawi się tutaj i będzie można je wyeksportować.</p></div>}
  </section>
}
