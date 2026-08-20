import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'

import {
  sendResearchChat,
  type AreaAnalysisResponse,
  type ResearchAttachmentPayload,
  type ResearchChatMessage,
  type ResearchChatResponse,
  type ResearchModel,
} from './lib/evidenceApi'
import {
  buildAssistantAnswerRecord,
  saveAssistantAnswerLocally,
} from './researchArchive'
import type { ResearchLabPlace } from './ResearchTerrainLab'
import './research-chat-notebook.css'

const LEGACY_CHAT_STORAGE_KEYS = [
  'terra-research-chat/v1',
  'terra-research-chat',
  'terra-ai-research-chat-v1',
  'terra-ai-chat-v1',
]
const TERRAIN_STORAGE_KEY = 'terra-research-terrain-lab/v1'
const CHATGPT_EXPORT_HELP_URL = 'https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data'
const MAX_IMAGE_COUNT = 5
const MAX_FILE_COUNT = 5
const MAX_TOTAL_BYTES = 25 * 1024 * 1024

const MODELS: Array<{ id: ResearchModel; name: string; note: string }> = [
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', note: 'fast questions and iterations' },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', note: 'default quality / cost balance' },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', note: 'hardest analyses and reports' },
]

type LocalAttachment = {
  id: string
  kind: 'image' | 'file'
  file: File
}

function bytesLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(`Could not read ${file.name}.`))
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ResearchChatNotebook({ apiUrl, place, analysis, advancedControls = false }: {
  apiUrl: string
  place: ResearchLabPlace | null
  analysis: AreaAnalysisResponse | null
  advancedControls?: boolean
}) {
  const [model, setModel] = useState<ResearchModel>('gpt-5.6-terra')
  const [messages, setMessages] = useState<ResearchChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editNotice, setEditNotice] = useState('')
  const [archiveNotice, setArchiveNotice] = useState('')
  const [serverReceipt, setServerReceipt] = useState<ResearchChatResponse | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Remove every known legacy key that ever contained raw user chat text.
    // New chat text stays only in React memory for the current tab and vanishes on refresh/close.
    for (const key of LEGACY_CHAT_STORAGE_KEYS) localStorage.removeItem(key)
  }, [])

  const imageCount = attachments.filter(item => item.kind === 'image').length
  const fileCount = attachments.filter(item => item.kind === 'file').length
  const totalBytes = attachments.reduce((sum, item) => sum + item.file.size, 0)
  const selectedModel = useMemo(() => MODELS.find(item => item.id === model) ?? MODELS[1], [model])
  const lastUserIndex = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'user') return index
    }
    return -1
  }, [messages])
  const assistantMessages = useMemo(
    () => messages.map((message, index) => ({ message, index })).filter(item => item.message.role === 'assistant'),
    [messages],
  )
  const lastAssistant = assistantMessages.at(-1)?.message ?? null

  const addFiles = (requestedKind: 'image' | 'file', event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!selected.length) return

    const additions = selected.map(file => ({
      id: crypto.randomUUID(),
      kind: file.type.startsWith('image/') ? 'image' as const : requestedKind,
      file,
    }))
    const seen = new Set(attachments.map(item => `${item.file.name}:${item.file.size}:${item.file.lastModified}`))
    const deduplicated = additions.filter(item => {
      const signature = `${item.file.name}:${item.file.size}:${item.file.lastModified}`
      if (seen.has(signature)) return false
      seen.add(signature)
      return true
    })
    const candidate = [...attachments, ...deduplicated]
    const nextImages = candidate.filter(item => item.kind === 'image').length
    const nextFiles = candidate.filter(item => item.kind === 'file').length
    const nextBytes = candidate.reduce((sum, item) => sum + item.file.size, 0)

    if (nextImages > MAX_IMAGE_COUNT) {
      setError(`Maximum ${MAX_IMAGE_COUNT} images.`)
      return
    }
    if (nextFiles > MAX_FILE_COUNT) {
      setError(`Maximum ${MAX_FILE_COUNT} non-image files.`)
      return
    }
    if (candidate.length > MAX_IMAGE_COUNT + MAX_FILE_COUNT) {
      setError('Maximum 10 attachments in total.')
      return
    }
    if (nextBytes > MAX_TOTAL_BYTES) {
      setError('Attachments in one message cannot exceed 25 MB in total.')
      return
    }
    setAttachments(candidate)
    setServerReceipt(null)
    setError('')
  }

  const researchContext = () => {
    let terrainNotebook: unknown = null
    try { terrainNotebook = JSON.parse(localStorage.getItem(TERRAIN_STORAGE_KEY) ?? 'null') } catch { terrainNotebook = null }
    return {
      place,
      satellite_analysis: analysis ? {
        generated_at_utc: analysis.generated_at_utc,
        period: analysis.period,
        area: analysis.area,
        headline: analysis.analysis.headline,
        what_is_visible: analysis.analysis.what_is_visible,
        change_over_time: analysis.analysis.change_over_time,
        water_assessment: analysis.analysis.water_assessment,
        confidence: analysis.analysis.confidence,
        limitations: analysis.analysis.limitations,
        preview_images: analysis.preview_images.map(image => ({ date: image.date, source: image.source, url: image.url })),
        landsat_catalog: analysis.landsat_catalog,
      } : null,
      terrain_notebook: terrainNotebook,
      provenance_rules: [
        'User-drawn colored lines are annotations, not scientific observations.',
        'Elevation flags are Copernicus DEM raster samples when an elevation object is present.',
        'Satellite visual evidence is limited to the listed official/public image dates and sources.',
        'If no place has been selected yet, answer as a planning assistant and do not pretend that a terrain analysis has already run.',
        'Raw user prompts are session-only and must never be written into an archive record or public research page.',
        'Assistant answers may be kept in the device-local answer archive, but the matching user prompt must be omitted.',
      ],
    }
  }

  const makeAttachmentPayload = async (): Promise<ResearchAttachmentPayload[]> => Promise.all(attachments.map(async item => ({
    kind: item.kind,
    name: item.file.name,
    mime_type: item.file.type || 'application/octet-stream',
    data_url: await fileToDataUrl(item.file),
  })))

  const requestAssistant = async (outgoing: ResearchChatMessage[], reportMode = false) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError('')
    setArchiveNotice('')
    setServerReceipt(null)
    try {
      const payload = await makeAttachmentPayload()
      const response = await sendResearchChat(apiUrl, {
        model,
        messages: outgoing,
        context: researchContext(),
        attachments: payload,
        reportMode,
      }, controller.signal)
      const assistantMessage: ResearchChatMessage = { role: 'assistant', text: response.answer }
      setMessages(current => [...current, assistantMessage].slice(-16))
      setAttachments([])
      setServerReceipt(response)

      const archiveRecord = buildAssistantAnswerRecord({
        answer: response.answer,
        model: response.model,
        place: place ? { label: place.label, latitude: place.latitude, longitude: place.longitude } : null,
      })
      saveAssistantAnswerLocally(archiveRecord)
      setArchiveNotice('Assistant answer archived on this device. Your question was not stored. Refreshing the page removes the private conversation but keeps this answer/report archive.')
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const ask = async (text: string, reportMode = false) => {
    if (!text.trim() && !reportMode && attachments.length === 0) return
    const userMessage: ResearchChatMessage = {
      role: 'user',
      text: reportMode
        ? 'Prepare a complete research report from the current session, annotations, measurements and images. Do not archive private user prompt text as evidence; use it only as transient report context. If no place has been selected, state that limitation and do not invent measurements.'
        : (text.trim() || 'Analyze the attached files in the context of the current research area.'),
    }
    const outgoing = [...messages, userMessage].slice(-16)
    setMessages(outgoing)
    setDraft('')
    setEditNotice('')
    setArchiveNotice('')
    await requestAssistant(outgoing, reportMode)
  }

  const retryLastResponse = () => {
    const last = messages.at(-1)
    if (!last || last.role !== 'user' || busy) return
    void requestAssistant(messages, false)
  }

  const editUserMessage = (index: number) => {
    const message = messages[index]
    if (!message || message.role !== 'user' || busy) return
    setDraft(message.text)
    setMessages(current => current.slice(0, index))
    setAttachments([])
    setServerReceipt(null)
    setArchiveNotice('')
    setError('')
    setEditNotice('Editing your last private question. Its later answer was removed from this live session; update the text and send it again. Previously archived answers can be deleted from Research archive if no longer useful.')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void ask(draft)
  }

  const exportAssistantAnswers = () => {
    const answers = assistantMessages.map(item => item.message.text)
    if (!answers.length) return
    const body = [
      '# Terra Observation — assistant answers only',
      '',
      `Place: ${place?.label ?? 'not selected'}`,
      `WGS84: ${place ? `${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)}` : '—'}`,
      `Selected model: ${model}`,
      '',
      ...answers.flatMap((answer, index) => [`## Assistant answer ${index + 1}`, '', answer, '']),
      '',
      '> Privacy: user prompt text is intentionally excluded from this export.',
    ].join('\n')
    downloadText(`terra-assistant-answers-${new Date().toISOString().slice(0, 10)}.md`, body)
  }

  return <section className="research-chat panel" aria-label="Terrain research assistant">
    <div className="research-chat-head">
      <div>
        <small>OPENAI RESPONSES · PRIVATE PROMPTS · SESSION ONLY</small>
        <h2>Research assistant</h2>
        <p>{place ? `Active place: ${place.label}. Ask about the map, imagery, flags, DEM and findings.` : 'The assistant is available immediately. You can plan a study first; after selecting a place it receives the map and research-data context.'}</p>
      </div>
      {advancedControls && <label>Model<select value={model} onChange={event => setModel(event.target.value as ResearchModel)}>{MODELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>{selectedModel.note}</small></label>}
    </div>

    <div className="research-chat-privacy">
      <b>Privacy:</b> your question text is never written to the research archive or localStorage. It exists only in memory for the current browser tab so the assistant can keep conversational context and edit the last private question. Refreshing or closing the tab removes the private conversation. Assistant answers/reports are archived locally without the matching prompt so results can remain available after refresh.
    </div>

    {advancedControls && <div className="research-chat-export-policy">
      <div><b>Full conversation export</b><small>Terra Observation does not store a full transcript. “Sign in with ChatGPT” is intentionally not embedded in this chat. OpenAI currently states that ChatGPT sign-in shares identity information, not ChatGPT conversations, so this site cannot truthfully fetch your account chat history through that sign-in. For your ChatGPT account history, use OpenAI's official Data Controls export.</small></div>
      <a className="button-link compact" href={CHATGPT_EXPORT_HELP_URL} target="_blank" rel="noreferrer">Official ChatGPT data export ↗</a>
    </div>}

    <div className="research-chat-log" aria-live="polite">
      {assistantMessages.length === 0 && <div className="research-chat-empty"><b>Suggestions</b><button type="button" onClick={() => setDraft(place ? 'Analyze this area and list the most important things worth checking in more detail.' : 'Help me choose an area to study and tell me which official datasets would be useful.')}>{place ? 'What should I check here?' : 'Plan a study'}</button><button type="button" onClick={() => setDraft('Separate observations from hypotheses and identify what cannot yet be demonstrated.')}>Check confidence</button><button type="button" onClick={() => setDraft('Compare the available satellite imagery and identify which source gives the strongest material for further analysis.')}>Choose the best imagery</button></div>}
      {lastUserIndex >= 0 && <div className="research-chat-private-question"><b>Private question sent</b><span>The question text is hidden from the transcript and excluded from archives. It disappears completely when this tab is refreshed or closed.</span></div>}
      {assistantMessages.map(({ message, index }) => <article key={`assistant-${index}`} className="assistant">
        <div className="research-chat-message-head"><small>ASSISTANT</small></div>
        <p>{message.text}</p>
      </article>)}
      {busy && <div className="research-chat-thinking">Analyzing context and attachments…</div>}
    </div>

    <form className="research-chat-compose" onSubmit={submit}>
      <textarea rows={4} value={draft} onChange={event => setDraft(event.target.value)} placeholder={place ? 'Ask about terrain, imagery, rivers, mountains, water and change over time…' : 'Ask the assistant or search for a place first…'} />
      {editNotice && <p className="research-chat-edit-notice">{editNotice}</p>}
      {archiveNotice && <p className="research-chat-receipt" role="status">{archiveNotice}</p>}

      {advancedControls && <>
        <div className="research-attachment-actions">
          <label className="button-link compact">+ Images ({imageCount}/5)<input type="file" accept="image/*" multiple hidden onChange={event => addFiles('image', event)} /></label>
          <label className="button-link compact">+ Files ({fileCount}/5)<input type="file" multiple hidden onChange={event => addFiles('file', event)} /></label>
          <span><b>{attachments.length}/10</b> · images {imageCount}/5 · files {fileCount}/5 · {bytesLabel(totalBytes)} / 25 MB</span>
        </div>
        {attachments.length > 0 && <div className="research-attachment-list">{attachments.map(item => <span key={item.id}><b>{item.kind === 'image' ? 'IMG' : 'FILE'}</b>{item.file.name}<small>{bytesLabel(item.file.size)}</small><button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => setAttachments(current => current.filter(candidate => candidate.id !== item.id))}>×</button></span>)}</div>}
      </>}

      {serverReceipt && <p className="research-chat-receipt" role="status">Backend receipt: <b>{serverReceipt.attachment_count}</b> attachments ({serverReceipt.attachment_images} images + {serverReceipt.attachment_files} files), {bytesLabel(serverReceipt.attachment_bytes)}. Response model: {serverReceipt.model}.</p>}
      {error && <div className="research-chat-error" role="alert"><span>{error}</span><button type="button" onClick={retryLastResponse} disabled={busy || messages.at(-1)?.role !== 'user'}>Retry assistant response</button></div>}

      <div className="research-chat-actions">
        <button type="submit" className="primary" disabled={busy || (!draft.trim() && attachments.length === 0)}>{busy ? 'Analyzing…' : 'Send privately'}</button>
        {lastUserIndex >= 0 && <button type="button" className="secondary" disabled={busy} onClick={() => editUserMessage(lastUserIndex)}>Edit last private question</button>}
        {advancedControls && <button type="button" className="secondary" disabled={busy || messages.length === 0} onClick={() => void ask('', true)}>Generate report</button>}
        {advancedControls && <button type="button" className="secondary" disabled={assistantMessages.length === 0} onClick={exportAssistantAnswers}>Export answers only .md</button>}
        <button type="button" className="secondary" onClick={() => { setMessages([]); setAttachments([]); setError(''); setServerReceipt(null); setEditNotice(''); setArchiveNotice('') }}>New conversation</button>
      </div>
    </form>

    {advancedControls && <div className="research-chat-limits"><b>Advanced limits:</b> up to 5 images + 5 other files, maximum 10 items and 25 MB total input per message. The server returns an exact receipt. User prompt text is never written to the archive; assistant answers/reports are automatically retained only in this device-local archive.</div>}
  </section>
}