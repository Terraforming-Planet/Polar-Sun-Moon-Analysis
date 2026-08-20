import { useEffect, useMemo, useState } from 'react'

import { ResearchDataPreview } from './ResearchDataPreview'
import {
  deleteResearchFindingLocally,
  deleteResearchManifestLocally,
  downloadResearchFinding,
  downloadResearchManifest,
  loadLocalResearchArchive,
  loadLocalResearchFindings,
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
  const [expandedLocalId, setExpandedLocalId] = useState<string | null>(null)
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null)

  const refreshLocalArchive = () => {
    setLocalArchive(loadLocalResearchArchive())
    setFindings(loadLocalResearchFindings())
  }
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

  const removeFinding = (id: string) => {
    deleteResearchFindingLocally(id)
    if (expandedFindingId === id) setExpandedFindingId(null)
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
      <div><small>SAVED RESEARCH FINDINGS · NO RAW CHAT</small><h2>Zapisane obrazy i wnioski</h2></div>
      <span className="evidence-badge observation">CHAT EXCLUDED</span>
    </div>
    <p className="muted">Tutaj zapisujemy tylko jawnie wybrane wyniki: linki do obrazów źródłowych, daty/sensory, metadane Landsat i wnioski AI. Treść prywatnej rozmowy nie jest częścią tego rekordu.</p>

    {findings.length ? <div className="local-research-list research-findings-list">
      {findings.map(item => {
        const expanded = item.id === expandedFindingId
        return <article key={item.id} className={`local-research-item finding-item ${expanded ? 'expanded' : ''}`}>
          <div><span className="evidence-badge observation">FINDING</span><h3>{item.title}</h3></div>
          <div className="local-research-meta">
            <span><b>Obszar</b>{item.area.latitude.toFixed(5)}°, {item.area.longitude.toFixed(5)}° · {item.area.radius_km} km</span>
            <span><b>Zakres</b>{item.period.start_date} → {item.period.end_date}</span>
            <span><b>Źródła</b>{item.source_images.length} obrazów · {item.landsat_catalog.matched} scen Landsat w katalogu</span>
          </div>
          <p><b>{item.conclusion.headline}</b></p>
          <div className="hero-actions local-research-actions">
            <button type="button" className="primary" onClick={() => setExpandedFindingId(expanded ? null : item.id)}>{expanded ? 'Ukryj szczegóły' : 'Obrazy i wnioski'}</button>
            <button type="button" className="secondary" onClick={() => downloadResearchFinding(item)}>Eksport JSON</button>
            <button type="button" className="research-delete" onClick={() => removeFinding(item.id)}>Usuń zapis</button>
          </div>
          {expanded && <div className="research-finding-details">
            <div className="research-finding-summary">
              <article><small>CO WIDAĆ</small><p>{item.conclusion.what_is_visible}</p></article>
              <article><small>ZMIANY</small><p>{item.conclusion.change_over_time}</p></article>
              <article><small>WODA / TEREN</small><p>{item.conclusion.water_assessment}</p></article>
              <article><small>PEWNOŚĆ</small><p>{item.conclusion.confidence.level} · {item.conclusion.confidence.reason}</p></article>
            </div>
            {item.source_images.length > 0 && <div className="research-finding-images">{item.source_images.map(image => <figure key={`${image.date}-${image.source}`}><a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={`${image.source} ${image.date}`} loading="lazy" /></a><figcaption><b>{image.date}</b><span>{image.source}</span></figcaption></figure>)}</div>}
            <p className="muted"><b>Prywatność:</b> {item.privacy_note === 'raw-chat-not-included' ? 'surowa rozmowa nie została zapisana.' : item.privacy_note}</p>
          </div>}
        </article>
      })}
    </div> : <div className="empty research-empty"><span>BRAK ZAPISANYCH WYNIKÓW</span><p>Po wykonaniu analizy użyj przycisku „Zapisz obrazy + wnioski”. Zapis nastąpi jawnie — nie zapisujemy automatycznie czatu.</p></div>}

    <div className="research-section-head local-archive-title">
      <div><small>LOCAL DRAFT ARCHIVE</small><h2>Szkice obszarów</h2></div>
      <span className="evidence-badge derived">DEVICE LOCAL</span>
    </div>
    <p className="muted">Szkice obszaru są zapisane lokalnie w tej przeglądarce. Nie zawierają historii czatu.</p>

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
