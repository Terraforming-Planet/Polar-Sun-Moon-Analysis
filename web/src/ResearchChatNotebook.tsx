import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'

import {
  sendResearchChat,
  type AreaAnalysisResponse,
  type ResearchAttachmentPayload,
  type ResearchChatMessage,
  type ResearchChatResponse,
  type ResearchModel,
} from './lib/evidenceApi'
import type { ResearchLabPlace } from './ResearchTerrainLab'
import './research-chat-notebook.css'

const LEGACY_CHAT_STORAGE_KEY = 'terra-research-chat/v1'
const TERRAIN_STORAGE_KEY = 'terra-research-terrain-lab/v1'
const MAX_IMAGE_COUNT = 5
const MAX_FILE_COUNT = 5
const MAX_TOTAL_BYTES = 25 * 1024 * 1024

const MODELS: Array<{ id: ResearchModel; name: string; note: string }> = [
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', note: 'szybkie pytania i iteracje' },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', note: 'domyślny balans jakości i kosztu' },
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
  const [serverReceipt, setServerReceipt] = useState<ResearchChatResponse | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const chatGptAuthUrl = String(import.meta.env.VITE_CHATGPT_SIGNIN_URL ?? '').trim()

  useEffect(() => {
    // PR #195 temporarily persisted raw chat text in localStorage. Purge that legacy key
    // and keep all new conversation text only in React memory for the current tab/session.
    localStorage.removeItem(LEGACY_CHAT_STORAGE_KEY)
  }, [])

  const imageCount = attachments.filter(item => item.kind === 'image').length
  const fileCount = attachments.filter(item => item.kind === 'file').length
  const totalBytes = attachments.reduce((sum, item) => sum + item.file.size, 0)
  const selectedModel = useMemo(() => MODELS.find(item => item.id === model) ?? MODELS[1], [model])

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
      setError(`Maksymalnie ${MAX_IMAGE_COUNT} obrazów.`)
      return
    }
    if (nextFiles > MAX_FILE_COUNT) {
      setError(`Maksymalnie ${MAX_FILE_COUNT} plików innych niż obrazy.`)
      return
    }
    if (candidate.length > MAX_IMAGE_COUNT + MAX_FILE_COUNT) {
      setError('Maksymalnie 10 załączników łącznie.')
      return
    }
    if (nextBytes > MAX_TOTAL_BYTES) {
      setError('Łączny rozmiar załączników w jednej wiadomości nie może przekroczyć 25 MB.')
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
        'Raw chat text is session-only in this application and must not be treated as an archived research record.',
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
        ? 'Przygotuj pełny raport badawczy z obecnej sesji, zaznaczeń, pomiarów i obrazów. Nie archiwizuj treści prywatnej rozmowy jako evidence; użyj jej wyłącznie jako kontekstu do raportu. Jeśli miejsce nie zostało jeszcze wybrane, zaznacz to jako ograniczenie i nie wymyślaj pomiarów.'
        : (text.trim() || 'Przeanalizuj dołączone załączniki w kontekście bieżącego badania.'),
    }
    const outgoing = [...messages, userMessage].slice(-16)
    setMessages(outgoing)
    setDraft('')
    setEditNotice('')
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
    setError('')
    setEditNotice('Edytujesz wcześniejsze pytanie. Odpowiedzi po nim zostały usunięte z bieżącej sesji; popraw tekst i wyślij ponownie.')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void ask(draft)
  }

  const exportConversation = () => {
    const body = [
      '# Terra Observation — prywatny eksport rozmowy badawczej',
      '',
      `Miejsce: ${place?.label ?? 'nie wybrano'}`,
      `WGS84: ${place ? `${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)}` : '—'}`,
      `Model ostatnio wybrany: ${model}`,
      '',
      ...messages.flatMap(message => [`## ${message.role === 'user' ? 'Badacz' : 'Asystent'}`, '', message.text, '']),
      '',
      '> Ten plik powstaje wyłącznie po ręcznym eksporcie. Aplikacja nie zapisuje automatycznie surowej rozmowy do archiwum badań ani localStorage.',
    ].join('\n')
    downloadText(`terra-private-chat-${new Date().toISOString().slice(0, 10)}.md`, body)
  }

  return <section className="research-chat panel" aria-label="Asystent badań terenu">
    <div className="research-chat-head">
      <div>
        <small>OPENAI RESPONSES · SESSION-ONLY CHAT</small>
        <h2>Asystent badawczy</h2>
        <p>{place ? `Aktywne miejsce: ${place.label}. Pytaj o mapę, obrazy, flagi, DEM i wnioski.` : 'Czat działa od razu. Możesz najpierw zaplanować badanie, a po wybraniu miejsca asystent dostanie kontekst mapy i danych.'}</p>
      </div>
      {advancedControls && <label>Model<select value={model} onChange={event => setModel(event.target.value as ResearchModel)}>{MODELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>{selectedModel.note}</small></label>}
    </div>

    <div className="research-chat-privacy">
      <b>Prywatność aplikacji:</b> treść rozmowy jest tylko w pamięci tej karty. Nie zapisujemy jej do localStorage ani do „Archiwum”. Po odświeżeniu strony znika. Załączniki są wysyłane tylko z bieżącym zapytaniem do skonfigurowanego backendu AI.
    </div>

    {advancedControls && <div className="research-chat-auth">
      <div><b>Konto badacza · Sign in with ChatGPT</b><small>Oficjalne „Sign in with ChatGPT” wymaga, aby ta aplikacja była zarejestrowana jako wspierana aplikacja/partner i miała poprawny adres logowania. Nie używamy nieoficjalnego OAuth ani nie prosimy o hasło ChatGPT.</small></div>
      {chatGptAuthUrl
        ? <a className="button-link compact" href={chatGptAuthUrl}>Kontynuuj z ChatGPT</a>
        : <button type="button" className="secondary" disabled title="Brak VITE_CHATGPT_SIGNIN_URL dla zatwierdzonej aplikacji">Kontynuuj z ChatGPT — konfiguracja oczekuje</button>}
    </div>}

    <div className="research-chat-log" aria-live="polite">
      {messages.length === 0 && <div className="research-chat-empty"><b>Wskazówki</b><button type="button" onClick={() => setDraft(place ? 'Przeanalizuj ten teren i wypisz najważniejsze rzeczy, które warto sprawdzić dokładniej.' : 'Pomóż mi wybrać teren do badania i powiedz, jakie oficjalne dane warto zebrać.')}>{place ? 'Co tu warto sprawdzić?' : 'Zaplanuj badanie'}</button><button type="button" onClick={() => setDraft('Oddziel obserwacje od hipotez i wskaż, czego nie da się jeszcze udowodnić.')}>Sprawdź pewność wniosków</button><button type="button" onClick={() => setDraft('Porównaj dostępne zdjęcia satelitarne i wskaż, które daje najlepszy materiał do dalszej analizy.')}>Wybierz najlepsze zdjęcia</button></div>}
      {messages.map((message, index) => <article key={`${message.role}-${index}`} className={message.role}>
        <div className="research-chat-message-head"><small>{message.role === 'user' ? 'TY / BADACZ' : 'ASYSTENT'}</small>{message.role === 'user' && <button type="button" onClick={() => editUserMessage(index)} disabled={busy}>Edytuj</button>}</div>
        <p>{message.text}</p>
      </article>)}
      {busy && <div className="research-chat-thinking">Analizuję kontekst i załączniki…</div>}
    </div>

    <form className="research-chat-compose" onSubmit={submit}>
      <textarea rows={4} value={draft} onChange={event => setDraft(event.target.value)} placeholder={place ? 'Zapytaj o teren, obrazy, rzeki, góry, wodę i zmiany w czasie…' : 'Zapytaj asystenta albo najpierw wyszukaj miejsce…'} />
      {editNotice && <p className="research-chat-edit-notice">{editNotice}</p>}

      {advancedControls && <>
        <div className="research-attachment-actions">
          <label className="button-link compact">+ Obrazy ({imageCount}/5)<input type="file" accept="image/*" multiple hidden onChange={event => addFiles('image', event)} /></label>
          <label className="button-link compact">+ Pliki ({fileCount}/5)<input type="file" multiple hidden onChange={event => addFiles('file', event)} /></label>
          <span><b>{attachments.length}/10</b> · obrazy {imageCount}/5 · pliki {fileCount}/5 · {bytesLabel(totalBytes)} / 25 MB</span>
        </div>
        {attachments.length > 0 && <div className="research-attachment-list">{attachments.map(item => <span key={item.id}><b>{item.kind === 'image' ? 'IMG' : 'FILE'}</b>{item.file.name}<small>{bytesLabel(item.file.size)}</small><button type="button" aria-label={`Usuń ${item.file.name}`} onClick={() => setAttachments(current => current.filter(candidate => candidate.id !== item.id))}>×</button></span>)}</div>}
      </>}

      {serverReceipt && <p className="research-chat-receipt" role="status">Backend potwierdził odbiór: <b>{serverReceipt.attachment_count}</b> załączników ({serverReceipt.attachment_images} obrazów + {serverReceipt.attachment_files} plików), {bytesLabel(serverReceipt.attachment_bytes)}. Odpowiedź: {serverReceipt.model}.</p>}
      {error && <div className="research-chat-error" role="alert"><span>{error}</span><button type="button" onClick={retryLastResponse} disabled={busy || messages.at(-1)?.role !== 'user'}>Spróbuj odpowiedzieć ponownie</button></div>}

      <div className="research-chat-actions">
        <button type="submit" className="primary" disabled={busy || (!draft.trim() && attachments.length === 0)}>{busy ? 'Analizuję…' : 'Wyślij'}</button>
        {advancedControls && <button type="button" className="secondary" disabled={busy || messages.length === 0} onClick={() => void ask('', true)}>Generuj raport</button>}
        {advancedControls && <button type="button" className="secondary" disabled={messages.length === 0} onClick={exportConversation}>Prywatny eksport .md</button>}
        <button type="button" className="secondary" onClick={() => { setMessages([]); setAttachments([]); setError(''); setServerReceipt(null); setEditNotice('') }}>Nowa rozmowa</button>
      </div>
    </form>

    {advancedControls && <div className="research-chat-limits"><b>Zaawansowane:</b> maks. 5 obrazów + 5 innych plików, maks. 10 elementów i 25 MB danych wejściowych łącznie na wiadomość. Serwer zwraca potwierdzenie liczby odebranych plików. Surowe rozmowy nie trafiają automatycznie do archiwum; do evidence powinny trafiać wyłącznie jawnie wybrane obrazy i zatwierdzone wnioski/raporty.</div>}
  </section>
}
