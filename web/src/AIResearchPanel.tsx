import { useEffect, useMemo, useState } from 'react'

import { EvidenceExplainer } from './EvidenceExplainer'
import {
  listPublishedCases,
  normalizeEvidenceApiUrl,
  type EvidenceCaseSummary,
  type TrainingContextSummary,
} from './lib/evidenceApi'

export function AIResearchPanel() {
  const endpoint = useMemo(() => normalizeEvidenceApiUrl(import.meta.env.VITE_EVIDENCE_API_URL), [])
  const [cases, setCases] = useState<EvidenceCaseSummary[]>([])
  const [trainings, setTrainings] = useState<TrainingContextSummary[]>([])
  const [selectedId, setSelectedId] = useState('test-001-forest-pond-kuchnia')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!endpoint) return
    const controller = new AbortController()
    listPublishedCases(endpoint, controller.signal)
      .then(result => {
        setCases(result.cases)
        setTrainings(result.training_context ?? [])
        setError('')
        if (result.cases.length && !result.cases.some(item => item.case_id === selectedId)) {
          setSelectedId(result.cases[0].case_id)
        }
      })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => controller.abort()
  }, [endpoint, selectedId])

  const selected = cases.find(item => item.case_id === selectedId)

  return <section className="workspace">
    <div className="workspace-head">
      <div>
        <small>OPENAI · PUBLISHED TEST REGISTRY · NVIDIA L4 · EVIDENCE BEFORE CLAIMS</small>
        <h1>AI Research — wszystkie zarejestrowane testy</h1>
      </div>
      <span className="evidence-badge observation">SERVER-SELECTED EVIDENCE</span>
    </div>

    <p className="notice">
      To jest centralny moduł AI dla całej platformy, nie tylko hydrologii. Worker udostępnia wyłącznie zarejestrowane, publiczne pakiety dowodów. OpenAI nie może samodzielnie przeszukiwać prywatnych plików, wybierać dowolnych URL-i ani omijać ograniczeń naukowych zapisanych przy teście.
    </p>
    <p className="notice">
      Każda analiza otrzymuje także wspólny kontekst z <b>trzech opublikowanych treningów NVIDIA L4</b>. Metryki treningowe opisują uczenie i pipeline danych — nie są automatycznie dowodem zmian środowiskowych.
    </p>

    {!endpoint && <p className="notice">Publiczny Worker AI nie jest skonfigurowany w tym buildzie.</p>}
    {error && <p className="notice" role="alert">Nie udało się pobrać rejestru testów: {error}</p>}

    <div className="workspace-head">
      <div><small>NVIDIA L4 · PUBLIC RESEARCH CONTEXT</small><h2>Trzy opublikowane treningi AI</h2></div>
      <span className="evidence-badge derived">TRAINING ≠ GROUND TRUTH</span>
    </div>
    <div className="water-grid">
      {trainings.map(item => <article key={item.training_id}>
        <span className="evidence-badge derived">{item.short_label}</span>
        <h2>{item.title}</h2>
        <p>{item.gpu} · {item.summary}</p>
        <p className="muted">Klasa dowodu: {item.evidence_class}. Wyniki treningu nie ustalają przyczyny ani wielkości zmian środowiskowych.</p>
        <a className="button-link" href={item.public_page}>Otwórz publiczny raport treningu</a>
      </article>)}
      {!trainings.length && endpoint && !error && <article><h2>Ładowanie treningów L4…</h2><p className="muted">Worker przygotowuje publiczny kontekst Training #1, #2 i #3.</p></article>}
    </div>

    <div className="selector-grid">
      <label>
        Test do analizy
        <select value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={!cases.length}>
          {cases.map(item => <option key={item.case_id} value={item.case_id}>{item.short_label} · {item.title}</option>)}
        </select>
      </label>
    </div>

    <div className="water-grid">
      {cases.map(item => <article key={item.case_id}>
        <span className={`evidence-badge ${item.case_id === selectedId ? 'observation' : 'derived'}`}>{item.short_label}</span>
        <h2>{item.title}</h2>
        <p>{item.category} · {item.temporal_scope ?? 'zakres zapisany w pakiecie'}</p>
        {(item.record_count !== undefined || item.accepted_count !== undefined) && <p className="muted">Rekordy: {item.record_count ?? 'brak'} · zaakceptowane: {item.accepted_count ?? 'brak'}</p>}
        <div className="hero-actions">
          <button type="button" onClick={() => setSelectedId(item.case_id)} disabled={item.case_id === selectedId}>Wybierz test</button>
          <a className="button-link" href={item.public_page}>Otwórz publiczny test</a>
        </div>
      </article>)}
    </div>

    {selected && <EvidenceExplainer apiUrl={endpoint} caseId={selected.case_id} caseLabel={selected.title} />}
  </section>
}
