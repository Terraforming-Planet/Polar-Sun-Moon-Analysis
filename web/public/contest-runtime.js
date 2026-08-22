(() => {
  'use strict'

  const IMAGE_HOSTS = new Set([
    'gibs.earthdata.nasa.gov',
    'sh.dataspace.copernicus.eu',
    'landsatlook.usgs.gov',
  ])
  const processedImages = new WeakSet()
  const observedDocuments = new WeakSet()
  const state = { scheduled: false }

  const endpointMeta = document.querySelector('meta[name="terra-evidence-api"]')
  const endpointValue = endpointMeta?.getAttribute('content')?.trim() ?? ''
  const evidenceApi = endpointValue && !endpointValue.includes('%VITE_') ? endpointValue.replace(/\/+$/, '') : ''

  const exactTranslations = new Map([
    ['Prosty', 'Simple'],
    ['Zaawansowany', 'Advanced'],
    ['Wpisz miejsce. Resztę przygotuje system.', 'Enter a place. The system prepares the rest.'],
    ['Zbadaj teren', 'Research area'],
    ['Szukam…', 'Searching…'],
    ['Analizuję…', 'Analyzing…'],
    ['1990–dziś', '1990–today'],
    ['ostatnie 5 lat', 'last 5 years'],
    ['ostatni rok', 'last year'],
    ['Rok', 'Year'],
    ['Pora', 'Season'],
    ['cały rok', 'full year'],
    ['wiosna', 'spring'],
    ['lato', 'summer'],
    ['jesień', 'autumn'],
    ['zima', 'winter'],
    ['Odśwież wybrany okres', 'Refresh selected period'],
    ['Zapytaj asystenta', 'Ask the assistant'],
    ['Wyślij prywatnie', 'Send privately'],
    ['Nowe pytanie', 'New question'],
    ['TWOJE PYTANIE', 'YOUR QUESTION'],
    ['ODPOWIEDŹ ASYSTENTA', 'ASSISTANT ANSWER'],
    ['OPENAI · PYTANIE PRYWATNE · TYLKO SESJA', 'OPENAI · PRIVATE QUESTION · SESSION ONLY'],
    ['Przygotowuję prawdziwe dane', 'Preparing real data'],
    ['PRAWDZIWE OBRAZY · NASA GIBS · COPERNICUS', 'REAL IMAGERY · NASA GIBS · COPERNICUS'],
    ['WYBRANY ROK / PORA ROKU', 'SELECTED YEAR / SEASON'],
    ['Zdjęcia źródłowe z tego okresu', 'Source imagery from this period'],
    ['ZIEMIA 3D · KAFELKOWA MAPA REFERENCYJNA', '3D EARTH · TILED REFERENCE MAP'],
    ['MAPA POMOCNICZA · PAŃSTWA + RZEKI', 'REFERENCE MAP · COUNTRIES + RIVERS'],
    ['Otwórz pełną mapę', 'Open full map'],
    ['OPENAI · OFICJALNE/PUBLICZNE DOWODY', 'OPENAI · OFFICIAL/PUBLIC EVIDENCE'],
    ['Co widać', 'What is visible'],
    ['Zmiany w czasie', 'Change over time'],
    ['Woda / teren', 'Water / terrain'],
    ['Ograniczenia i pewność', 'Limitations and confidence'],
    ['Na co zwrócił uwagę AI', 'What AI flagged for review'],
    ['Zapisz obrazy + wnioski', 'Save images + findings'],
    ['Otwórz pełny stary widok zaawansowany', 'Open full advanced view'],
    ['ARCHIWUM OBRAZÓW · 1990–DZIŚ', 'IMAGE ARCHIVE · 1990–TODAY'],
    ['Rzeczywiste próbki czasowe i katalog Landsat', 'Real time samples and Landsat catalogue'],
    ['Rozwiń', 'Expand'],
    ['TRYB ZAAWANSOWANY · DOWODY', 'ADVANCED MODE · EVIDENCE'],
    ['Szczegółowa analiza', 'Detailed analysis'],
    ['CO WIDAĆ', 'WHAT IS VISIBLE'],
    ['ZMIANY W CZASIE', 'CHANGE OVER TIME'],
    ['WODA', 'WATER'],
    ['PEWNOŚĆ', 'CONFIDENCE'],
    ['Ograniczenia', 'Limitations'],
    ['Następny krok:', 'Next step:'],
    ['Zaawansowany obszar badawczy', 'Advanced research workspace'],
    ['kształt, dokładne daty, manifest i zapis projektu', 'shape, exact dates, manifest and project save'],
    ['ROZWIŃ', 'EXPAND'],
    ['Jak zacząć:', 'How to start:'],
    ['⚑ Flaga + wysokość', '⚑ Flag + elevation'],
    ['Flaga + wysokość', 'Flag + elevation'],
    ['Rysuj linię', 'Draw line'],
    ['Dodaj 3 punkty referencyjne Nilu', 'Add 3 Nile reference points'],
    ['Wyczyść', 'Clear'],
    ['Pokaż strzałki przepływu rzek', 'Show river flow arrows'],
    ['Źródło obrazu', 'Imagery source'],
    ['Rozmiar obrazu', 'Image size'],
    ['Otwórz techniczną Ziemię 3D', 'Open technical 3D Earth'],
    ['Pokaż oryginalny dzienny kontekst (może zawierać chmury)', 'Show original daily context (may contain clouds)'],
    ['Pokaż oryginalne sceny · natywna skala', 'Show original scenes · native scale'],
    ['Zapisz obrazy + wnioski', 'Save images + findings'],
    ['Brak danych', 'No data'],
    ['brak danych', 'no data'],
    ['Ładowanie…', 'Loading…'],
    ['Gotowe', 'Ready'],
    ['Błąd', 'Error'],
    ['Pokaż', 'Show'],
    ['Ukryj', 'Hide'],
    ['Zapisz', 'Save'],
    ['Wybierz', 'Select'],
    ['Wyszukaj', 'Search'],
    ['Otwórz', 'Open'],
    ['Zamknij', 'Close'],
    ['Powrót', 'Back'],
    ['Dalej', 'Next'],
  ])

  const phraseTranslations = [
    ['Po wyszukaniu obszaru pokazujemy prawdziwe obrazy z oficjalnych źródeł, obrazy z wybranego roku i pory roku, globus 3D oraz opis miejsca. Zmiana roku lub pory automatycznie odświeża analizę.', 'After selecting an area, the system shows real imagery from official sources, imagery for the chosen year and season, a 3D globe, and an evidence-based area summary. Changing the year or season refreshes the analysis automatically.'],
    ['Znalezione miejsca — wybierz właściwe, jeśli pierwszy wynik nie jest dokładny', 'Places found — select the correct result if the first match is not precise'],
    ['Odpowiedź pojawia się bezpośrednio tutaj, pod Twoim wpisem. Asystent dostaje kontekst wybranego miejsca, okresu i oficjalnych obrazów.', 'The answer appears here below your message. The assistant receives the selected place, time range, and official imagery as context.'],
    ['Zapytaj o wybrane miejsce, zdjęcia, rzeki, teren lub zmiany w czasie…', 'Ask about the selected place, imagery, rivers, terrain, or change over time…'],
    ['Analizuję dane dla wybranego miejsca i okresu…', 'Analyzing data for the selected place and period…'],
    ['Pobieram oficjalny katalog Landsat oraz reprezentatywne obrazy NASA/Copernicus dla wybranego okresu. Brak danych będzie pokazany jako brak danych, nie jako wygenerowany obraz.', 'Loading the official Landsat catalogue and representative NASA/Copernicus imagery for the selected period. Missing data is shown as missing data, never as generated imagery.'],
    ['Wybrany okres:', 'Selected period:'],
    ['Najpierw cztery skale ostatniej dostępnej obserwacji NASA, niżej wszystkie zwrócone prawdziwe obrazy z wybranego okresu.', 'The gallery is capped for fast review: four images in Simple mode and eight in Advanced mode. Official source links remain available.'],
    ['Każda karta ma datę i nazwę oficjalnego źródła. Kliknięcie otwiera obraz źródłowy w pełnym widoku.', 'Every card includes a date and official source. Open a card to inspect the source imagery in full view.'],
    ['Dla tego okresu nie zwrócono renderowalnego obrazu. Sprawdź katalog Landsat niżej lub wybierz inny rok/pora roku.', 'No browser-renderable image was returned for this period. Check the Landsat catalogue below or choose a different year/season.'],
    ['Warstwa wysokiej rozdzielczości służy do orientacji w terenie i śledzenia koryt. Datowane wnioski naukowe muszą pochodzić z oficjalnych obserwacji Copernicus/NASA/USGS.', 'The high-resolution reference layer is for terrain orientation and channel tracing. Dated scientific findings must come from official Copernicus/NASA/USGS observations.'],
    ['Natural Earth: państwa, główne rzeki i jeziora. Granice prowincji/admin-1 oraz gęste etykiety lokalne są celowo ukryte, aby mapa pomagała badać przebieg koryt.', 'Natural Earth: countries, major rivers and lakes. Dense local labels and admin-1 boundaries are intentionally reduced so river-channel geometry remains readable.'],
    ['NASA GIBS zapewnia wizualne próbki od 2000 r. Wcześniejszy okres jest weryfikowany przez katalog USGS Landsat; jeśli nie mamy renderowalnej sceny, pokazujemy to wprost zamiast udawać obraz.', 'NASA GIBS provides visual samples from 2000 onward. Earlier periods are checked against the USGS Landsat catalogue; if a renderable scene is unavailable, the interface says so explicitly.'],
    ['obrazów pokazanych', 'images shown'],
    ['obrazów obejrzanych przez AI', 'images inspected by AI'],
    ['scen w katalogu USGS', 'scenes in USGS catalogue'],
    ['Otwórz pełny oficjalny katalog USGS Landsat →', 'Open full official USGS Landsat catalogue →'],
    ['1. Wpisz miejscowość lub współrzędne.', '1. Enter a place name or coordinates.'],
    ['2. Wybierz rok i porę roku.', '2. Select a year and season.'],
    ['3. Zobacz prawdziwe obrazy i zapytaj asystenta.', '3. Inspect real imagery and ask the assistant.'],
    ['Wybrany punkt', 'Selected point'],
    ['Nie znaleziono dokładnego miejsca.', 'No precise place match was found.'],
    ['Dopisz gminę/powiat/kraj albo wpisz współrzędne WGS84.', 'Add the municipality/region/country or enter WGS84 coordinates.'],
    ['Wyszukiwarka korzysta z publicznego OpenStreetMap Nominatim.', 'Search uses public OpenStreetMap Nominatim.'],
    ['Zapisano', 'Saved'],
    ['Treść prywatnego pytania nie została zapisana.', 'The private question text was not archived.'],
    ['prawdziwy obraz źródłowy', 'real source image'],
    ['okres', 'period'],
    ['pewność:', 'confidence:'],
    ['wysoka', 'high'],
    ['średnia', 'medium'],
    ['niska', 'low'],
    ['miejsce → pytanie → obrazy → Ziemia 3D → wynik', 'place → question → imagery → 3D Earth → result'],
    ['stary pełny panel · obrazy HQ · pliki · modele · flagi · DEM · profile · raporty', 'full research panel · HQ imagery · files · models · flags · DEM · profiles · reports'],
  ]

  function translateString(value) {
    if (!value || typeof value !== 'string') return value
    const trimmed = value.trim()
    if (exactTranslations.has(trimmed)) {
      const replacement = exactTranslations.get(trimmed)
      return value.replace(trimmed, replacement)
    }
    let output = value
    for (const [source, target] of phraseTranslations) output = output.split(source).join(target)
    return output
  }

  function translateDocument(doc) {
    if (!doc?.documentElement) return
    doc.documentElement.lang = 'en'
    const root = doc.body || doc.documentElement
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes = []
    let node
    while ((node = walker.nextNode())) nodes.push(node)
    for (const textNode of nodes) {
      const parent = textNode.parentElement
      if (!parent || ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT'].includes(parent.tagName)) continue
      const translated = translateString(textNode.nodeValue || '')
      if (translated !== textNode.nodeValue) textNode.nodeValue = translated
    }
    for (const element of root.querySelectorAll('[placeholder],[title],[aria-label]')) {
      for (const attr of ['placeholder', 'title', 'aria-label']) {
        const current = element.getAttribute(attr)
        if (!current) continue
        const translated = translateString(current)
        if (translated !== current) element.setAttribute(attr, translated)
      }
    }
  }

  function dayString(date) {
    return date.toISOString().slice(0, 10)
  }

  function safeGibsDate(url) {
    if (url.hostname !== 'gibs.earthdata.nasa.gov') return url
    const time = url.searchParams.get('TIME')
    if (!time || time.includes('/')) return url
    const parsed = new Date(`${time}T12:00:00Z`)
    if (!Number.isFinite(parsed.getTime())) return url
    const safe = new Date()
    safe.setUTCHours(12, 0, 0, 0)
    safe.setUTCDate(safe.getUTCDate() - 2)
    if (parsed > safe) url.searchParams.set('TIME', dayString(safe))
    return url
  }

  function workerStreamUrl(sourceUrl) {
    if (!evidenceApi) return sourceUrl
    return `${evidenceApi}/research/image?url=${encodeURIComponent(sourceUrl)}`
  }

  function sourceCandidates(rawUrl) {
    let parsed
    try { parsed = new URL(rawUrl, location.href) } catch { return [] }
    if (!IMAGE_HOSTS.has(parsed.hostname)) return []
    parsed = safeGibsDate(parsed)
    const candidates = []
    if (parsed.hostname === 'gibs.earthdata.nasa.gov') {
      const baseDate = parsed.searchParams.get('TIME')
      if (baseDate && !baseDate.includes('/')) {
        const date = new Date(`${baseDate}T12:00:00Z`)
        for (let offset = 0; offset < 5; offset += 1) {
          const next = new URL(parsed.toString())
          const shifted = new Date(date)
          shifted.setUTCDate(shifted.getUTCDate() - offset)
          next.searchParams.set('TIME', dayString(shifted))
          candidates.push(next.toString())
        }
      }
    }
    if (!candidates.length) candidates.push(parsed.toString())
    return [...new Set(candidates)]
  }

  function isNearBlack(img) {
    if (!img.naturalWidth || !img.naturalHeight) return true
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 24
      canvas.height = 24
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return false
      context.drawImage(img, 0, 0, 24, 24)
      const data = context.getImageData(0, 0, 24, 24).data
      let dark = 0
      let total = 0
      let sum = 0
      for (let index = 0; index < data.length; index += 4) {
        const r = data[index]
        const g = data[index + 1]
        const b = data[index + 2]
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
        sum += luminance
        total += 1
        if (luminance < 5) dark += 1
      }
      return total > 0 && dark / total > 0.96 && sum / total < 4
    } catch {
      return false
    }
  }

  function markUnavailable(img, message = 'Official image temporarily unavailable') {
    const holder = img.closest('a') || img.parentElement
    if (!holder) return
    img.style.display = 'none'
    let note = holder.querySelector?.('.terra-image-unavailable')
    if (!note) {
      note = document.createElement('span')
      note.className = 'terra-image-unavailable'
      holder.appendChild(note)
    }
    note.textContent = message
  }

  function attachImageStreaming(img) {
    if (!(img instanceof HTMLImageElement) || processedImages.has(img)) return
    const raw = img.currentSrc || img.getAttribute('src') || ''
    const candidates = sourceCandidates(raw)
    if (!candidates.length) return
    processedImages.add(img)
    img.dataset.terraOriginalSrc = raw
    img.dataset.terraStream = evidenceApi ? 'worker' : 'direct'
    let candidateIndex = 0
    let directFallbackUsed = false

    const loadCandidate = () => {
      if (candidateIndex >= candidates.length) {
        if (!directFallbackUsed) {
          directFallbackUsed = true
          img.crossOrigin = ''
          img.src = candidates[0]
          return
        }
        markUnavailable(img)
        return
      }
      const candidate = candidates[candidateIndex]
      img.dataset.terraSource = candidate
      if (evidenceApi) {
        img.crossOrigin = 'anonymous'
        img.src = workerStreamUrl(candidate)
      } else {
        img.src = candidate
      }
    }

    img.addEventListener('load', () => {
      if (isNearBlack(img)) {
        candidateIndex += 1
        loadCandidate()
        return
      }
      img.style.display = ''
      const holder = img.closest('figure') || img.parentElement
      if (holder && !holder.querySelector('.terra-stream-badge')) {
        const badge = document.createElement('span')
        badge.className = 'terra-stream-badge'
        badge.textContent = evidenceApi ? 'OFFICIAL IMAGE · STREAMED + VERIFIED' : 'OFFICIAL IMAGE · DIRECT SOURCE'
        holder.appendChild(badge)
      }
    })

    img.addEventListener('error', () => {
      if (directFallbackUsed) {
        markUnavailable(img)
        return
      }
      candidateIndex += 1
      loadCandidate()
    })

    loadCandidate()
  }

  function activeResearchMode(doc) {
    const buttons = [...doc.querySelectorAll('.simple-console-mode button')]
    if (buttons.length >= 2 && buttons[1].classList.contains('active')) return 'advanced'
    return 'simple'
  }

  function enforceGalleryLimit(doc) {
    const gallery = doc.querySelector('.simple-context-gallery')
    if (!gallery) return
    const mode = activeResearchMode(doc)
    const limit = mode === 'advanced' ? 8 : 4
    const figures = [...gallery.querySelectorAll('figure')]
    figures.forEach((figure, index) => { figure.hidden = index >= limit })
    gallery.dataset.galleryMode = mode
    gallery.dataset.galleryLimit = String(limit)
    let status = gallery.querySelector('.terra-gallery-limit')
    if (!status) {
      status = doc.createElement('div')
      status.className = 'terra-gallery-limit'
      gallery.prepend(status)
    }
    status.textContent = `${mode === 'advanced' ? 'Advanced' : 'Simple'} mode · up to ${limit} official satellite images · Evidence Worker streaming`
  }

  function processDocument(doc) {
    if (!doc?.documentElement) return
    translateDocument(doc)
    for (const img of doc.querySelectorAll('img')) attachImageStreaming(img)
    enforceGalleryLimit(doc)
    for (const iframe of doc.querySelectorAll('iframe')) attachIframe(iframe)
  }

  function attachIframe(iframe) {
    if (!(iframe instanceof HTMLIFrameElement) || iframe.dataset.terraEnglishObserved === '1') return
    iframe.dataset.terraEnglishObserved = '1'
    const process = () => {
      try {
        const child = iframe.contentDocument
        if (child) observeDocument(child)
      } catch {
        // Cross-origin iframe: external provider controls its own language.
      }
    }
    iframe.addEventListener('load', process)
    process()
  }

  function schedule(doc) {
    if (state.scheduled) return
    state.scheduled = true
    requestAnimationFrame(() => {
      state.scheduled = false
      processDocument(doc)
    })
  }

  function observeDocument(doc) {
    if (!doc?.documentElement || observedDocuments.has(doc)) return
    observedDocuments.add(doc)
    processDocument(doc)
    const observer = new MutationObserver(() => schedule(doc))
    observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'src', 'placeholder', 'title', 'aria-label'] })
    doc.addEventListener('click', () => setTimeout(() => processDocument(doc), 0), true)
    doc.addEventListener('toggle', () => setTimeout(() => processDocument(doc), 0), true)
  }

  const style = document.createElement('style')
  style.textContent = `
    .terra-stream-badge{position:absolute;z-index:4;left:7px;top:7px;padding:4px 6px;border-radius:6px;background:rgba(0,12,20,.82);border:1px solid rgba(64,216,255,.45);color:#74e7ff;font:700 8px/1.2 system-ui;letter-spacing:.06em;pointer-events:none}
    .simple-context-gallery figure,.simple-image-grid figure{position:relative}
    .terra-image-unavailable{display:grid;place-items:center;min-height:180px;padding:18px;box-sizing:border-box;background:linear-gradient(145deg,#071a27,#0a2330);color:#a7c6d6;text-align:center;font:700 11px/1.5 system-ui}
    .terra-gallery-limit{margin:0 0 10px;padding:8px 10px;border:1px solid #1d6179;border-radius:8px;background:#08202d;color:#75ddfa;font:700 10px/1.35 system-ui;letter-spacing:.02em}
    [hidden]{display:none!important}
  `
  document.head.appendChild(style)
  observeDocument(document)
})()
