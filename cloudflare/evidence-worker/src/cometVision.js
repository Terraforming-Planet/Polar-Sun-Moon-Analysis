import { isAllowedOrigin } from './index.js'

export const COMET_VISION_PATH = '/space/comet-candidates'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const HELIOVIEWER_BASE = 'https://api.helioviewer.org/v2'
const SOURCES = [
  { id: 4, key: 'c2', label: 'SOHO LASCO C2' },
  { id: 5, key: 'c3', label: 'SOHO LASCO C3' },
]
const FRAME_OFFSETS_MINUTES = [60, 30, 0]
const MAX_BODY_BYTES = 2048

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidate: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    classification: {
      type: 'string',
      enum: ['comet_candidate', 'no_candidate', 'ambiguous', 'likely_cme', 'likely_planet_or_star', 'artifact'],
    },
    trajectory: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string' },
        c2: { type: 'string' },
        c3: { type: 'string' },
      },
      required: ['summary', 'c2', 'c3'],
    },
    motion_evidence: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    instrument_agreement: {
      type: 'string',
      enum: ['cross_instrument', 'single_instrument_only', 'no_consistent_motion'],
    },
    frame_times_utc: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
    limitations: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
    requires_human_review: { type: 'boolean' },
  },
  required: [
    'candidate',
    'confidence',
    'classification',
    'trajectory',
    'motion_evidence',
    'instrument_agreement',
    'frame_times_utc',
    'limitations',
    'requires_human_review',
  ],
}

function corsHeaders(origin, env = {}) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (origin && isAllowedOrigin(origin, env)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function jsonResponse(payload, status, origin, env = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin, env),
    },
  })
}

async function readBoundedBody(request) {
  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new Error('Request body is too large.')
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('Request body is too large.')
  if (!text.trim()) return {}
  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Request body must be one JSON object.')
  const keys = Object.keys(parsed)
  if (keys.some(key => key !== 'mode')) throw new Error('Unexpected request field.')
  if (parsed.mode !== undefined && parsed.mode !== 'latest') throw new Error('Only mode=latest is supported.')
  return parsed
}

function isoWithoutMillis(date) {
  return new Date(date).toISOString().replace('.000Z', 'Z')
}

async function closestImage(fetcher, sourceId, requestedDate) {
  const params = new URLSearchParams({ date: isoWithoutMillis(requestedDate), sourceId: String(sourceId) })
  const response = await fetcher(`${HELIOVIEWER_BASE}/getClosestImage/?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Helioviewer metadata failed with HTTP ${response.status}.`)
  const payload = await response.json()
  if (!payload?.id || !payload?.date) throw new Error('Helioviewer returned incomplete frame metadata.')
  const date = String(payload.date).replace(' ', 'T').replace(/Z?$/, 'Z')
  return {
    id: String(payload.id),
    date,
    image_url: `${HELIOVIEWER_BASE}/downloadImage/?id=${encodeURIComponent(payload.id)}&width=768&type=jpg`,
  }
}

export async function buildCometFrameBundle(fetcher = fetch, now = new Date()) {
  const frames = []
  for (const offsetMinutes of FRAME_OFFSETS_MINUTES) {
    const requested = new Date(now.getTime() - offsetMinutes * 60_000)
    for (const source of SOURCES) {
      const frame = await closestImage(fetcher, source.id, requested)
      frames.push({
        instrument: source.key,
        instrument_label: source.label,
        requested_utc: isoWithoutMillis(requested),
        ...frame,
      })
    }
  }

  for (const source of SOURCES) {
    const ids = new Set(frames.filter(frame => frame.instrument === source.key).map(frame => frame.id))
    if (ids.size < 2) throw new Error(`Insufficient temporal separation for ${source.label}.`)
  }
  return frames
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim()
  for (const item of payload?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (part?.type === 'output_text' && typeof part.text === 'string' && part.text.trim()) return part.text.trim()
    }
  }
  throw new Error('OpenAI response did not contain structured output text.')
}

function imageContent(frames) {
  const content = [{
    type: 'input_text',
    text: [
      'Analyze this ordered SOHO LASCO sequence only for a possible comet-like moving compact object.',
      'Frames are ordered oldest to newest and alternate C2 then C3 at each time.',
      'Do not confuse stars, planets, CME/streamer structures, the occulting disk/support, compression artifacts, cosmic rays or sensor noise with a comet.',
      'A comet candidate requires persistent time-separated motion compatible with a compact object. If evidence is weak or ambiguous, candidate must be false.',
      'This result is an experimental candidate screen, never a discovery or confirmation. Human verification is always required.',
      `Frame metadata: ${JSON.stringify(frames.map(frame => ({ instrument: frame.instrument_label, time_utc: frame.date, id: frame.id })))}`,
    ].join('\n'),
  }]
  for (const frame of frames) {
    content.push({ type: 'input_image', image_url: frame.image_url, detail: 'original' })
  }
  return content
}

async function askOpenAI(frames, env, fetcher = fetch) {
  if (!env.OPENAI_API_KEY) throw new Error('OpenAI is not configured.')
  const response = await fetcher(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-5.6-luna',
      store: false,
      instructions: 'You are a cautious astronomical image triage system. Preserve uncertainty and never upgrade a candidate into a confirmed discovery.',
      input: [{ role: 'user', content: imageContent(frames) }],
      text: {
        format: {
          type: 'json_schema',
          name: 'soho_comet_candidate_screen',
          strict: true,
          schema: OUTPUT_SCHEMA,
        },
      },
      max_output_tokens: 1400,
    }),
  })
  if (!response.ok) throw new Error(`OpenAI comet analysis failed with HTTP ${response.status}.`)
  const payload = await response.json()
  if (payload?.status === 'incomplete' || payload?.incomplete_details) throw new Error('OpenAI comet analysis was incomplete.')
  return JSON.parse(extractOutputText(payload))
}

function enforceCandidateGate(result, frames) {
  const uniqueTimes = new Set(frames.map(frame => frame.date)).size
  const evidenceCount = Array.isArray(result.motion_evidence) ? result.motion_evidence.length : 0
  const confidence = Number(result.confidence) || 0
  const gatedCandidate = Boolean(
    result.candidate
      && result.classification === 'comet_candidate'
      && confidence >= 0.75
      && evidenceCount >= 2
      && uniqueTimes >= 2
      && result.instrument_agreement !== 'no_consistent_motion',
  )
  return {
    ...result,
    candidate: gatedCandidate,
    confidence,
    requires_human_review: true,
    gate: {
      threshold: 0.75,
      evidence_items_required: 2,
      candidate_label: 'experimental AI candidate only',
      confirmed_discovery: false,
    },
  }
}

export async function handleCometVision(request, env = {}, fetcher = fetch) {
  const origin = request.headers.get('Origin') ?? ''
  if (request.method === 'OPTIONS') {
    if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)
    return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin, env)
  if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)
  if (!env.OPENAI_API_KEY) return jsonResponse({ error: 'Comet AI is not configured.' }, 503, origin, env)

  try {
    await readBoundedBody(request)
    const frames = await buildCometFrameBundle(fetcher, new Date())
    const rawResult = await askOpenAI(frames, env, fetcher)
    const result = enforceCandidateGate(rawResult, frames)
    return jsonResponse({
      service: 'terra-observation-soho-comet-screen',
      generated_at_utc: new Date().toISOString(),
      evidence_class: 'AI_INTERPRETATION_OF_OFFICIAL_PUBLIC_IMAGES',
      sources: {
        soho: 'NASA/ESA SOHO LASCO',
        helioviewer: 'Helioviewer public API, SOHO source IDs 4 and 5',
      },
      frames: frames.map(frame => ({
        instrument: frame.instrument_label,
        observed_utc: frame.date,
        image_id: frame.id,
        image_url: frame.image_url,
      })),
      result,
    }, 200, origin, env)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Comet analysis failed safely.'
    const status = message.startsWith('OpenAI') ? 502 : 400
    return jsonResponse({
      error: message,
      candidate: false,
      confirmed_discovery: false,
      policy: 'fail-closed: no verified candidate asserted',
    }, status, origin, env)
  }
}
