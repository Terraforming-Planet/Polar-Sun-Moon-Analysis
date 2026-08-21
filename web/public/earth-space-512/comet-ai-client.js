const FALLBACK_WORKER = 'https://terra-observation-evidence-explainer.xodobrox.workers.dev'

async function resolveWorkerUrl() {
  try {
    const response = await fetch('../data/evidence-worker.json', { cache: 'no-store' })
    if (response.ok) {
      const payload = await response.json()
      if (typeof payload.url === 'string' && payload.url.startsWith('https://')) return payload.url.replace(/\/$/, '')
    }
  } catch (error) {
    console.warn('Evidence worker config unavailable, using public fallback.', error)
  }
  return FALLBACK_WORKER
}

function setText(id, value) {
  const node = document.getElementById(id)
  if (node) node.textContent = value
}

function renderResult(payload) {
  const result = payload.result
  if (!result) throw new Error('Worker returned no analysis result.')
  const candidateLabel = result.candidate
    ? `Experimental candidate · ${Math.round(result.confidence * 100)}%`
    : `No gated candidate · ${Math.round(result.confidence * 100)}%`
  setText('candidate-state', candidateLabel)

  const frames = (payload.frames || []).map(frame => `${frame.instrument}: ${frame.observed_utc}`).join(' · ')
  const evidence = (result.motion_evidence || []).length
    ? result.motion_evidence.map(item => `• ${item}`).join('\n')
    : '• No persistent comet-like motion evidence returned.'
  const limitations = (result.limitations || []).map(item => `• ${item}`).join('\n')
  const output = document.getElementById('ai-output')
  if (output) {
    output.textContent = [
      `Classification: ${result.classification}`,
      `Trajectory: ${result.trajectory?.summary || 'not resolved'}`,
      `Instrument agreement: ${result.instrument_agreement}`,
      `Frames: ${frames || 'not returned'}`,
      'Motion evidence:',
      evidence,
      'Limitations:',
      limitations || '• Human review is required.',
      'Human review: REQUIRED. This is not a confirmed discovery.',
    ].join('\n')
  }
  setText('frame-readiness', `${payload.frames?.length || 0} time-separated SOHO/Helioviewer frames analyzed`)
}

async function runCometAnalysis(button) {
  button.disabled = true
  const originalLabel = button.textContent
  button.textContent = 'Analyzing 6 SOHO frames…'
  setText('candidate-state', 'No verified candidate asserted')
  setText('frame-readiness', 'Resolving time-separated LASCO C2/C3 frames…')
  setText('ai-output', 'The Cloudflare worker is resolving official SOHO frames through Helioviewer and sending only that fixed evidence bundle to OpenAI Vision. No user-supplied prompt or external image URL is accepted.')

  try {
    const worker = await resolveWorkerUrl()
    const response = await fetch(`${worker}/space/comet-candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'latest' }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || `Worker HTTP ${response.status}`)
    renderResult(payload)
  } catch (error) {
    setText('candidate-state', 'No verified candidate asserted')
    setText('frame-readiness', 'AI scan unavailable — fail-closed')
    setText('ai-output', `Comet AI scan stopped safely: ${String(error.message || error)}. No candidate is asserted. Use the official SOHO source links and retry later.`)
  } finally {
    button.disabled = false
    button.textContent = originalLabel === 'Run experimental readiness scan' ? 'Run OpenAI comet candidate scan' : originalLabel
  }
}

const button = document.getElementById('comet-scan')
if (button) {
  button.textContent = 'Run OpenAI comet candidate scan'
  button.addEventListener('click', () => runCometAnalysis(button))
}
