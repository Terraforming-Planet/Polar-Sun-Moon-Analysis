(() => {
  'use strict'

  const SKIP_SELECTOR = [
    'script',
    'style',
    'code',
    'pre',
    'textarea',
    'input',
    '[contenteditable="true"]',
    '[data-private-text]',
    '[data-role="user"]',
    '.user-message',
    '.research-chat-user',
    '.private-question-text',
  ].join(',')

  const EXACT = new Map([
    ['Prosty', 'Simple'],
    ['Zaawansowany', 'Advanced'],
    ['Stare moduły', 'Legacy modules'],
    ['wszystkie zachowane zakładki i laboratoria', 'all preserved tabs and laboratories'],
    ['MAPA · SATELITY · OPENAI', 'MAP · SATELLITES · OPENAI'],
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
    ['Asystent analizuje…', 'Assistant is analyzing…'],
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
    ['Dopływy, odpływy i ubytek wody', 'Tributaries, outflows and water loss'],
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
    ['Sieć wodna: rzeka główna, dopływy i odpływy', 'Water network: main river, tributaries and outflows'],
    ['Ograniczenia', 'Limitations'],
    ['Następny krok:', 'Next step:'],
    ['Zaawansowany obszar badawczy', 'Advanced research workspace'],
    ['kształt, dokładne daty, manifest i zapis projektu', 'shape, exact dates, manifest and project save'],
    ['ROZWIŃ', 'EXPAND'],
    ['Jak zacząć:', 'How to start:'],
    ['⚑ Flaga + wysokość', '⚑ Flag + elevation'],
    ['Flaga + wysokość', 'Flag + elevation'],
    ['✎ Rysuj linię', '✎ Draw line'],
    ['Rysuj linię', 'Draw line'],
    ['Dodaj 3 punkty referencyjne Nilu', 'Add 3 Nile reference points'],
    ['Wyczyść', 'Clear'],
    ['Pokaż strzałki przepływu rzek', 'Show river flow arrows'],
    ['Źródło obrazu', 'Imagery source'],
    ['Rozmiar obrazu', 'Image size'],
    ['Otwórz techniczną Ziemię 3D', 'Open technical 3D Earth'],
    ['Pokaż oryginalny dzienny kontekst (może zawierać chmury)', 'Show original daily context (may contain clouds)'],
    ['Pokaż oryginalne sceny · natywna skala', 'Show original scenes · native scale'],
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
    ['Poprzedni', 'Previous'],
    ['Następny', 'Next'],
    ['Dodaj', 'Add'],
    ['Usuń', 'Remove'],
    ['Pobierz', 'Download'],
    ['Uruchom', 'Run'],
    ['Wczytaj', 'Load'],
    ['Analiza', 'Analysis'],
    ['Wynik', 'Result'],
    ['Wyniki', 'Results'],
    ['Raport', 'Report'],
    ['Raporty', 'Reports'],
    ['Zdjęcia', 'Images'],
    ['Obrazy', 'Imagery'],
    ['Mapa', 'Map'],
    ['Dane', 'Data'],
    ['Źródła', 'Sources'],
    ['Badania', 'Research'],
    ['Stacja badawcza', 'Research station'],
    ['Wysokość', 'Elevation'],
    ['Odległość', 'Distance'],
    ['Kierunek', 'Direction'],
    ['Północ', 'North'],
    ['Południe', 'South'],
    ['Wschód', 'East'],
    ['Zachód', 'West'],
    ['Punkt', 'Point'],
    ['Linia', 'Line'],
    ['Warstwa', 'Layer'],
    ['Warstwy', 'Layers'],
    ['Satelita', 'Satellite'],
    ['Satelity', 'Satellites'],
    ['Pożary', 'Fires'],
    ['Powodzie', 'Floods'],
    ['Woda', 'Water'],
    ['Ziemia', 'Earth'],
    ['Słońce', 'Sun'],
    ['Księżyc', 'Moon'],
  ])

  const PHRASES = [
    ['Po wyszukaniu obszaru pokazujemy prawdziwe obrazy z oficjalnych źródeł, obrazy z wybranego roku i pory roku, globus 3D oraz opis miejsca. Zmiana roku lub pory automatycznie odświeża analizę.', 'After selecting an area, the system shows real imagery from official sources, imagery for the chosen year and season, a 3D globe, and an evidence-based area summary. Changing the year or season refreshes the analysis automatically.'],
    ['Znalezione miejsca — wybierz właściwe, jeśli pierwszy wynik nie jest dokładny', 'Places found — select the correct result if the first match is not precise'],
    ['Odpowiedź pojawia się bezpośrednio tutaj, pod Twoim wpisem. Asystent dostaje kontekst wybranego miejsca, okresu i oficjalnych obrazów.', 'The answer appears here below your message. The assistant receives the selected place, time range, and official imagery as context.'],
    ['Zapytaj o wybrane miejsce, zdjęcia, rzeki, teren lub zmiany w czasie…', 'Ask about the selected place, imagery, rivers, terrain, or change over time…'],
    ['Analizuję dane dla wybranego miejsca i okresu…', 'Analyzing data for the selected place and period…'],
    ['Pobieram oficjalny katalog Landsat oraz reprezentatywne obrazy NASA/Copernicus dla wybranego okresu. Brak danych będzie pokazany jako brak danych, nie jako wygenerowany obraz.', 'Loading the official Landsat catalogue and representative NASA/Copernicus imagery for the selected period. Missing data is shown as missing data, never as generated imagery.'],
    ['Najpierw cztery skale ostatniej dostępnej obserwacji NASA, niżej wszystkie zwrócone prawdziwe obrazy z wybranego okresu.', 'Four scales of the most recent available NASA observation are shown first, followed by all returned real imagery from the selected period.'],
    ['Każda karta ma datę i nazwę oficjalnego źródła. Kliknięcie otwiera obraz źródłowy w pełnym widoku.', 'Every card includes a date and official source. Open a card to inspect the source imagery in full view.'],
    ['Dla tego okresu nie zwrócono renderowalnego obrazu. Sprawdź katalog Landsat niżej lub wybierz inny rok/pora roku.', 'No browser-renderable image was returned for this period. Check the Landsat catalogue below or select a different year/season.'],
    ['Warstwa wysokiej rozdzielczości służy do orientacji w terenie i śledzenia koryt. Datowane wnioski naukowe muszą pochodzić z oficjalnych obserwacji Copernicus/NASA/USGS.', 'The high-resolution reference layer is for terrain orientation and channel tracing. Dated scientific findings must come from official Copernicus/NASA/USGS observations.'],
    ['Natural Earth: państwa, główne rzeki i jeziora. Granice prowincji/admin-1 oraz gęste etykiety lokalne są celowo ukryte, aby mapa pomagała badać przebieg koryt.', 'Natural Earth: countries, major rivers and lakes. Dense local labels and admin-1 boundaries are intentionally reduced so river-channel geometry remains readable.'],
    ['Przyczyna: nieustalona na podstawie samych obrazów. Wymagane są DEM, oficjalna sieć hydrograficzna, dane przepływu i weryfikacja terenowa.', 'Cause: not established from imagery alone. DEM, an official hydrographic network, flow data and field verification are required.'],
    ['NASA GIBS zapewnia wizualne próbki od 2000 r. Wcześniejszy okres jest weryfikowany przez katalog USGS Landsat; jeśli nie mamy renderowalnej sceny, pokazujemy to wprost zamiast udawać obraz.', 'NASA GIBS provides visual samples from 2000 onward. The earlier period is verified through the USGS Landsat catalogue; when no renderable scene is available, the interface states that explicitly instead of simulating an image.'],
    ['Otwórz pełny oficjalny katalog USGS Landsat →', 'Open full official USGS Landsat catalogue →'],
    ['1. Wpisz miejscowość lub współrzędne.', '1. Enter a place name or coordinates.'],
    ['2. Wybierz rok i porę roku.', '2. Select a year and season.'],
    ['3. Zobacz prawdziwe obrazy i zapytaj asystenta.', '3. Inspect real imagery and ask the assistant.'],
    ['Nie znaleziono dokładnego miejsca. Dopisz gminę/powiat/kraj albo wpisz współrzędne WGS84. Wyszukiwarka korzysta z publicznego OpenStreetMap Nominatim.', 'No precise place match was found. Add the municipality, region, or country, or enter WGS84 coordinates. Search uses public OpenStreetMap Nominatim.'],
    ['Oficjalny obraz zwrócony przez analizę. Nie przypisujemy mu sztucznej skali ani dodatkowej rozdzielczości.', 'Official image returned by the analysis. No synthetic scale or additional resolution is assigned.'],
    ['Ten sam prawdziwy dzień i warstwa NASA GIBS, inny zasięg AOI:', 'The same real observation date and NASA GIBS layer, with a different AOI extent:'],
    ['Treść prywatnego pytania nie została zapisana.', 'The private question text was not archived.'],
    ['prawdziwy obraz źródłowy', 'real source image'],
    ['Rzeczywista obserwacja', 'Real observation'],
    ['01 · Z bliska', '01 · Close view'],
    ['02 · Otoczenie lokalne', '02 · Local context'],
    ['03 · Widok regionalny', '03 · Regional view'],
    ['04 · Bardzo wysoki widok', '04 · Very high-altitude view'],
    ['Wybrany okres:', 'Selected period:'],
    ['Wybrany punkt', 'Selected point'],
    ['prawdziwy obraz źródłowy · okres', 'real source image · period'],
    ['obrazów pokazanych', 'images shown'],
    ['obrazów obejrzanych przez AI', 'images inspected by AI'],
    ['scen w katalogu USGS', 'scenes in USGS catalogue'],
    ['miejsce → pytanie → obrazy → Ziemia 3D → wynik', 'place → question → imagery → 3D Earth → result'],
    ['stary pełny panel · obrazy HQ · pliki · modele · flagi · DEM · profile · raporty', 'full research panel · HQ imagery · files · models · flags · DEM · profiles · reports'],
    ['prawdziwy obraz źródłowy', 'real source image'],
    ['pewność:', 'confidence:'],
    ['wysoka', 'high'],
    ['średnia', 'medium'],
    ['niska', 'low'],
    ['Nie udało się zapisać rekordu badawczego:', 'Could not save the research record:'],
    ['Nie udało się', 'Could not'],
    ['Nie można', 'Cannot'],
    ['Brak ', 'No '],
  ].sort((a, b) => b[0].length - a[0].length)

  const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt', 'value']

  function skipped(element) {
    return Boolean(element?.closest?.(SKIP_SELECTOR))
  }

  function translate(value) {
    if (!value || typeof value !== 'string') return value
    const trimmed = value.trim()
    if (EXACT.has(trimmed)) return value.replace(trimmed, EXACT.get(trimmed))

    let output = value
    for (const [source, target] of PHRASES) output = output.split(source).join(target)
    return output
  }

  function translateTextNode(node) {
    if (!node?.parentElement || skipped(node.parentElement)) return
    const next = translate(node.nodeValue)
    if (next !== node.nodeValue) node.nodeValue = next
  }

  function translateElement(element) {
    if (!(element instanceof Element) || skipped(element)) return
    for (const attribute of ATTRIBUTES) {
      if (!element.hasAttribute(attribute)) continue
      const current = element.getAttribute(attribute)
      const next = translate(current)
      if (next !== current) element.setAttribute(attribute, next)
    }
    if (element.tagName === 'META' && /description|og:title|og:description|twitter:title|twitter:description/i.test(element.getAttribute('name') || element.getAttribute('property') || '')) {
      const current = element.getAttribute('content')
      const next = translate(current)
      if (next !== current) element.setAttribute('content', next)
    }
  }

  function translateTree(root) {
    if (!root) return
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root)
      return
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return
    if (root.nodeType === Node.ELEMENT_NODE) translateElement(root)

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node)
      else translateElement(node)
      node = walker.nextNode()
    }
  }

  function install(doc = document) {
    if (!doc?.documentElement || doc.documentElement.dataset.terraEnglishOverlay === '1') return
    doc.documentElement.dataset.terraEnglishOverlay = '1'
    doc.documentElement.lang = 'en'
    translateTree(doc)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') translateTextNode(mutation.target)
        if (mutation.type === 'attributes') translateElement(mutation.target)
        for (const node of mutation.addedNodes || []) translateTree(node)
      }
    })
    observer.observe(doc.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    })

    for (const frame of doc.querySelectorAll('iframe')) {
      frame.addEventListener('load', () => {
        try {
          if (frame.contentDocument) install(frame.contentDocument)
        } catch {
          // Cross-origin frames remain untouched.
        }
      })
      try {
        if (frame.contentDocument) install(frame.contentDocument)
      } catch {
        // Cross-origin frames remain untouched.
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => install(), { once: true })
  } else {
    install()
  }
})()
