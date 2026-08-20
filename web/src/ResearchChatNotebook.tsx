import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'

import {
  sendResearchChat,
  type AreaAnalysisResponse,
  type ResearchAttachmentPayload,
  type ResearchChatMessage,
  type ResearchModel,
} from './lib/evidenceApi'
import type { ResearchLabPlace } from './ResearchTerrainLab'
import './research-chat-notebook.css'

const CHAT_STORAGE_KEY = 'terra-research-chat/v1'
const TERRAIN_STORAGE_KEY = 'terra-research-terrain-lab/v1'
const MAX_IMAGE_COUNT = 5
const MAX_FILE_COUNT = 5
const MAX_TOTAL_BYTES = 25 * 1024 * 1024

const MODELS: Array<{ id: ResearchModel; name: string; note: string }> = [
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', note: 'szybkie pytania i iteracje' },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', note: 'balans jakości i kosztu' },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', note: 'najtrudniejsze analizy i raporty' },
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
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(`Nie udało się odczytać ${file.name}.`))
    reader.onerror = () => reject(new Error(`Nie udało się odczytać ${file.name}.`))
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

function restoreMessages() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) ?? '[]') as ResearchChatMessage[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(item => (item?.role === 'user' || item?.role === 'assistant') && typeof item?.text === 'string').slice(-16)
  } catch {
    return []
  }
}

export function ResearchChatNotebook({ apiUrl, place, analysis }: {
  apiUrl: string
  place: ResearchLabPlace
  analysis: AreaAnalysisResponse | null
}) {
  const [model, setModel] = useState<ResearchModel>('gpt-5.6-terra')
  const [messages, setMessages] = useState<ResearchChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => setMessages(restoreMessages()), [])
  useEffect(() => localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-16))), [messages])

  const imageCount = attachments.filter(item => item.kind === 'image').length
  const fileCount = attachments.length - imageCount
  const totalBytes = attachments.reduce((sum, item) => sum + item.file.size, 0)
  const selectedModel = useMemo(() => MODELS.find(item => item.id === model) ?? MODELS[1], [model])

  const addFiles = (kind: 'image' | 'file', event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!selected.length) return
    const normalized = kind === 'image' ? selected.filter(file => file.type.startsWith('image/')) : selected
    const candidate = [
      ...attachments,
      ...normalized.map(file => ({ id: crypto.randomUUID(), kind, file } as LocalAttachment)),
    ]
    const nextImages = candidate.filter(item => item.kind === 'image').length
    const nextFiles = candidate.length - nextImages
    const nextBytes = candidate.reduce((sum, item) => sum + item.file.size, 0)
    if (nextImages > MAX_IMAGE_COUNT) {
      setError(`Maksymalnie ${MAX_IMAGE_COUNT} obrazów.`)
      return
    }
    if (nextFiles > MAX_FILE_COUNT) {
      setError(`Maksymalnie ${MAX_FILE_COUNT} plików.`)
      return
    }
    if (nextBytes > MAX_TOTAL_BYTES) {
      setError('Łączny rozmiar załączników w jednej wiadomości nie może przekroczyć 25 MB.')
      return
    }
    setAttachments(candidate)
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
      ],
    }
  }

  const makeAttachmentPayload = async (): Promise<ResearchAttachmentPayload[]> => Promise.all(attachments.map(async item => ({
    kind: item.kind,
    name: item.file.name,
    mime_type: item.file.type || 'application/octet-stream',
    data_url: await fileToDataUrl(item.file),
  })))

  const ask = async (text: string, reportMode = false) => {
    if (!text.trim() && !reportMode && attachments.length === 0) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const userMessage: ResearchChatMessage = {
      role: 'user',
      text: reportMode
        ? 'Przygotuj pełny raport badawczy z obecnej sesji, zaznaczeń, pomiarów, obrazów i rozmowy.'
        : (text.trim() || 'Przeanalizuj dołączone załączniki w kontekście bieżącego badania.'),
    }
    const outgoing = [...messages, userMessage].slice(-16)
    setMessages(outgoing)
    setDraft('')
    setBusy(true)
    setError('')
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
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void ask(draft)
  }

  const exportConversation = () => {
    const body = [
      '# Terra Observation — notatnik rozmowy badawczej',
      '',
      `Miejsce: ${place.label}`,
      `WGS84: ${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)}`,
      `Model ostatnio wybrany: ${model}`,
      '',
      ...messages.flatMap(message => [`## ${message.role === 'user' ? 'Badacz' : 'Asystent'}`, '', message.text, '']),
      '',
      '> Uwaga: eksport rozmowy nie zamienia hipotez w wyniki naukowe. Weryfikuj liczby z widocznym źródłem/proweniencją.',
    ].join('\n')
    downloadText(`terra-research-${new Date().toISOString().slice(0, 10)}.md`, body)
  }

  return <section className="research-chat panel" aria-label="Asystent badań terenu">
    <div className="research-chat-head">
      <div><small>OPENAI RESPONSES · MULTIMODAL RESEARCH NOTEBOOK</small><h2>Asystent badawczy</h2><p>Możesz kontynuować rozmowę o zaznaczonych flagach, profilach DEM i obrazach satelitarnych. Kontekst sesji jest dołączany do kolejnych pytań.</p></div>
      <label>Model<select value={model} onChange={event => setModel(event.target.value as ResearchModel)}>{MODELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>{selectedModel.note}</small></label>
    </div>

    <div className="research-chat-log" aria-live="polite">
      {messages.length === 0 && <div className="research-chat-empty"><b>Przykładowe pytania</b><button type="button" onClick={() => setDraft('Porównaj wysokości moich flag i wskaż, gdzie teren ma największy spadek.')}>Porównaj wysokości flag</button><button type="button" onClick={() => setDraft('Czy narysowana przeze mnie linia może odpowiadać granicy zlewni? Oddziel obserwację od hipotezy.')}>Sprawdź hipotezę o zlewni</button><button type="button" onClick={() => setDraft('Połącz analizę satelitarną z profilem wysokości i wypisz, jakie dodatkowe dane są potrzebne.')}>Połącz satelity + DEM</button></div>}
      {messages.map((message, index) => <article key={`${message.role}-${index}`} className={message.role}><small>{message.role === 'user' ? 'TY / BADACZ' : 'ASYSTENT'}</small><p>{message.text}</p></article>)}
      {busy && <div className="research-chat-thinking">Analizuję kontekst i załączniki…</div>}
    </div>

    <form className="research-chat-compose" onSubmit={submit}>
      <textarea rows={4} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Zapytaj o zaznaczone miejsca, wysokości, zdjęcia, rzeki, góry, zmiany w czasie…" />
      <div className="research-attachment-actions">
        <label className="button-link compact">+ Obrazy ({imageCount}/5)<input type="file" accept="image/*" multiple hidden onChange={event => addFiles('image', event)} /></label>
        <label className="button-link compact">+ Pliki ({fileCount}/5)<input type="file" multiple hidden onChange={event => addFiles('file', event)} /></label>
        <span>{attachments.length}/10 · {bytesLabel(totalBytes)} / 25 MB łącznie</span>
      </div>
      {attachments.length > 0 && <div className="research-attachment-list">{attachments.map(item => <span key={item.id}><b>{item.kind === 'image' ? 'IMG' : 'FILE'}</b>{item.file.name}<small>{bytesLabel(item.file.size)}</small><button type="button" aria-label={`Usuń ${item.file.name}`} onClick={() => setAttachments(current => current.filter(candidate => candidate.id !== item.id))}>×</button></span>)}</div>}
      {error && <p className="research-error" role="alert">{error}</p>}
      <div className="research-chat-actions">
        <button type="submit" className="primary" disabled={busy || (!draft.trim() && attachments.length === 0)}>{busy ? 'Analizuję…' : 'Wyślij do asystenta'}</button>
        <button type="button" className="secondary" disabled={busy || messages.length === 0} onClick={() => void ask('', true)}>Generuj raport</button>
        <button type="button" className="secondary" disabled={messages.length === 0} onClick={exportConversation}>Eksportuj rozmowę .md</button>
        <button type="button" className="secondary" onClick={() => { setMessages([]); setAttachments([]); setError('') }}>Nowa rozmowa</button>
      </div>
    </form>

    <div className="research-chat-limits"><b>Limity tej wersji:</b> maks. 5 obrazów + 5 plików, maks. 10 elementów i 25 MB łącznie na jedną wiadomość. To ograniczenie chroni Worker i koszt analizy. Dane DEM/satelitarne są przekazywane z widoczną proweniencją; adnotacje użytkownika pozostają adnotacjami.</div>
  </section>
}
