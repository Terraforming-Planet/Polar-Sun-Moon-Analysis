import { useEffect, useMemo, useState } from 'react'

import './ai-research.css'
import { EvidenceExplainer } from './EvidenceExplainer'
import { ResearchArchivePanel } from './ResearchArchivePanel'
import { ResearchAreaBuilder } from './ResearchAreaBuilder'
import {
  listPublishedCases,
  normalizeEvidenceApiUrl,
  type EvidenceCaseSummary,
  type TrainingContextSummary,
} from './lib/evidenceApi'

type ResearchView = 'new' | 'archive' | 'explain'

export function AIResearchPanel() {
  const endpoint = useMemo(() => normalizeEvidenceApiUrl(import.meta.env.VITE_EVIDENCE_API_URL), [])
  const [cases, setCases] = useState<EvidenceCaseSummary[]>([])
  const [trainings, setTrainings] = useState<TrainingContextSummary[]>([])
  const [selectedId, setSelectedId] = useState('test-001-forest-pond-kuchnia')
  const [activeView, setActiveView] = useState<ResearchView>('new')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!endpoint) return
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
  }, [endpoint])

  const selected = cases.find(item => item.case_id === selectedId)
  const aiCaseIds = useMemo(() => new Set(cases.map(item => item.case_id)), [cases])

  return <section className="workspace ai-research-workspace">
    <div className="workspace-head ai-research-head">
      <div>
        <small>OPENAI · PUBLIC RESEARCH ARCHIVE · NVIDIA L4 · OFFICIAL DATA</small>
        <h1>AI Research Workspace</h1>
        <p>Wybierz obszar, przygotuj nowe badanie, wróć do archiwum TEST 001–016 albo uruchom OpenAI wyłącznie na zatwierdzonym pakiecie evidence.</p>
      </div>
      <span className="evidence-badge observation">RESEARCH CONTROL CENTER</span>
    </div>

    <div className="research-mode-tabs" role="tablist" aria-label="Tryb AI Research">
      <button type="button" className={activeView === 'new' ? 'active' : ''} onClick={() => setActiveView('new')}>
        <b>01</b><span>Nowe badanie<small>obszar · daty · manifest</small></span>
      </button>
      <button type="button" className={activeView === 'archive' ? 'active' : ''} onClick={() => setActiveView('archive')}>
        <b>02</b><span>Archiwum<small>TEST 001–016 + moje szkice</small></span>
      </button>
      <button type="button" className={activeView === 'explain' ? 'active' : ''} onClick={() => setActiveView('explain')}>
        <b>03</b><span>OpenAI Explainer<small>tylko zatwierdzone evidence</small></span>
      </button>
    </div>

    <div className="research-policy-strip">
      <span><b>Publiczne testy:</b> 16</span>
      <span><b>OpenAI evidence:</b> {cases.length || 'ładowanie…'}</span>
      <span><b>NVIDIA L4:</b> Training #1 + #2 + #3</span>
      <span><b>Zasada:</b> evidence before claims</span>
    </div>

    {!endpoint && <p className="notice">Publiczny Worker AI nie jest skonfigurowany w tym buildzie.</p>}
    {error && <p className="notice" role="alert">Nie udało się pobrać rejestru OpenAI: {error}</p>}

    <details className="research-training-context">
      <summary><span><small>NVIDIA L4 · PUBLIC RESEARCH CONTEXT</small><b>Trzy opublikowane treningi AI</b></span><em>Training ≠ ground truth · rozwiń</em></summary>
      <p className="muted">Każda analiza zatwierdzonego testu otrzymuje wspólny kontekst trzech opublikowanych treningów NVIDIA L4. Metryki treningowe opisują uczenie i pipeline danych — nie są automatycznie dowodem zmian środowiskowych.</p>
      <div className="research-training-list">
        {trainings.map(item => <article key={item.training_id}>
          <span className="evidence-badge derived">{item.short_label}</span>
          <div><h3>{item.title}</h3><p>{item.gpu} · {item.summary}</p></div>
          <a className="button-link compact" href={item.public_page}>Raport</a>
        </article>)}
        {!trainings.length && endpoint && !error && <p className="muted">Ładowanie Training #1, #2 i #3…</p>}
      </div>
      <span className="evidence-badge derived">TRAINING ≠ GROUND TRUTH</span>
    </details>

    {activeView === 'new' && <ResearchAreaBuilder onOpenArchive={() => setActiveView('archive')} />}

    {activeView === 'archive' && <ResearchArchivePanel
      aiCaseIds={aiCaseIds}
      selectedAiCaseId={selectedId}
      onSelectAiCase={setSelectedId}
      onOpenExplainer={() => setActiveView('explain')}
    />}

    {activeView === 'explain' && <section className="research-explainer-view">
      <div className="research-section-head">
        <div><small>REGISTERED OPENAI EVIDENCE</small><h2>Wyjaśnij zatwierdzony test</h2></div>
        <span className="evidence-badge observation">SERVER-SELECTED EVIDENCE</span>
      </div>
      <p className="muted">OpenAI nie może samodzielnie przeszukiwać prywatnych plików, wybierać dowolnych URL-i ani analizować nowego szkicu obszaru, dopóki dane nie przejdą kontrolowanego pipeline'u i nie zostaną zarejestrowane jako publiczny pakiet evidence.</p>
      <div className="research-explainer-selector">
        <label className="research-field">Test z aktywnym pakietem AI<select value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={!cases.length}>
          {cases.map(item => <option key={item.case_id} value={item.case_id}>{item.short_label} · {item.title}</option>)}
        </select></label>
        {selected && <div className="research-selected-case">
          <span className="evidence-badge observation">{selected.short_label}</span>
          <div><b>{selected.title}</b><small>{selected.category} · {selected.temporal_scope ?? 'zakres zapisany w pakiecie'}</small></div>
          <a className="button-link compact" href={selected.public_page}>Pełny test</a>
        </div>}
      </div>
      {selected ? <EvidenceExplainer apiUrl={endpoint} caseId={selected.case_id} caseLabel={selected.title} /> : <div className="empty"><span>BRAK AKTYWNEGO PAKIETU</span><p>Wybierz test z archiwum, który ma status „Analizuj w AI”.</p></div>}
    </section>}
  </section>
}
