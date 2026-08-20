import { useEffect, useMemo, useState } from 'react'

import {
  checkEvidenceApiHealth,
  explainPublishedCase,
  normalizeEvidenceApiUrl,
  type EvidenceExplanation,
} from './lib/evidenceApi'

type Status = 'disconnected' | 'checking' | 'ready' | 'explaining' | 'error'

type Props = {
  apiUrl?: string
  caseId?: string
}

const statusLabel: Record<Status, string> = {
  disconnected: 'DISCONNECTED',
  checking: 'CHECKING',
  ready: 'READY',
  explaining: 'EXPLAINING',
  error: 'ERROR',
}

export function EvidenceExplainer({
  apiUrl = import.meta.env.VITE_EVIDENCE_API_URL,
  caseId = 'vistula-test-014',
}: Props) {
  const endpoint = useMemo(() => normalizeEvidenceApiUrl(apiUrl), [apiUrl])
  const [status, setStatus] = useState<Status>(endpoint ? 'checking' : 'disconnected')
  const [healthReady, setHealthReady] = useState(false)
  const [error, setError] = useState('')
  const [explanation, setExplanation] = useState<EvidenceExplanation | null>(null)
  const [caseTitle, setCaseTitle] = useState('Vistula Test 014')

  useEffect(() => {
    setExplanation(null)
    setError('')
    setHealthReady(false)
    if (!endpoint) {
      setStatus('disconnected')
      return
    }

    const controller = new AbortController()
    setStatus('checking')
    checkEvidenceApiHealth(endpoint, controller.signal)
      .then(health => {
        if (!health.openai_configured) throw new Error('OpenAI is not configured in the evidence Worker.')
        if (!health.supported_case_ids.includes(caseId)) throw new Error('This published evidence case is not available in the Worker.')
        setHealthReady(true)
        setStatus('ready')
      })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setHealthReady(false)
        setError(reason instanceof Error ? reason.message : String(reason))
        setStatus('error')
      })
    return () => controller.abort()
  }, [caseId, endpoint])

  const explain = async () => {
    if (!endpoint || !healthReady || status === 'explaining') return
    setStatus('explaining')
    setError('')
    try {
      const result = await explainPublishedCase(endpoint, caseId)
      setCaseTitle(result.case_title)
      setExplanation(result.explanation)
      setStatus('ready')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setStatus('error')
    }
  }

  const canExplain = healthReady && status !== 'checking' && status !== 'explaining'

  return <section className="panel" aria-labelledby="ai-evidence-title">
    <div className="workspace-head">
      <div>
        <small>OPENAI RESPONSES API · CLOUDFLARE WORKER · FIXED PUBLISHED EVIDENCE</small>
        <h2 id="ai-evidence-title">AI Evidence / Research Explainer</h2>
      </div>
      <span className={`evidence-badge ${status === 'ready' ? 'observation' : status === 'error' ? 'unknown' : 'estimate'}`} aria-live="polite">
        {statusLabel[status]}
      </span>
    </div>

    <p>
      OpenAI explains a fixed, published evidence bundle for <b>{caseTitle}</b>: real Test 014 satellite-data integrity records plus NVIDIA L4 Training #2 and #3 context. The browser cannot send an arbitrary prompt, model name or source URL.
    </p>
    <p className="muted">
      AI does not create the underlying satellite measurement. The current Vistula evidence explicitly does not claim a measured water-loss magnitude or confirmed hydrological cause.
    </p>

    {status === 'disconnected' && <p className="notice">Public AI explanation is not connected in this Pages build yet. Configure the public Worker URL as <code>VITE_EVIDENCE_API_URL</code>; never place the OpenAI key in the browser.</p>}
    {status === 'checking' && <p className="notice">Checking the evidence Worker…</p>}
    {error && <p className="notice" role="alert">Evidence explainer: {error} {healthReady && 'You can retry without reloading the page.'}</p>}

    <div className="hero-actions">
      <button className="primary" type="button" onClick={explain} disabled={!canExplain}>
        {status === 'explaining' ? 'Explaining evidence…' : status === 'error' && healthReady ? 'Retry OpenAI evidence explanation' : 'Explain Vistula evidence with OpenAI'}
      </button>
    </div>

    {explanation && <div className="water-grid" aria-live="polite">
      <article><span className="evidence-badge derived">SUMMARY</span><h2>What the evidence establishes</h2><p>{explanation.summary}</p></article>
      <article><span className="evidence-badge observation">IMPACT</span><h2>Why it matters</h2><p>{explanation.why_it_matters}</p></article>
      <article><span className="evidence-badge unknown">UNCERTAINTY</span><h2>What it does not prove</h2><p>{explanation.uncertainty}</p></article>
      <article><span className="evidence-badge estimate">NEXT</span><h2>What should be checked next</h2><p>{explanation.next_checks}</p></article>
    </div>}
  </section>
}
