# Audyt modelu 3D i nawigacji — 2026-08-15

## Zakres

Audyt dotyczy aktywnej rodziny rendererów Ziemi w `web/src/` oraz dwóch poziomów nawigacji strony:

- `RealisticEarthGlobe.tsx` — przełącznik modelu naukowego/fallback,
- `CleanRealisticEarthGlobe.tsx` — aktywny glob Cesium/WGS84,
- `StableEarthGlobe.tsx` — lekki fallback Three.js,
- `LiveNrtEarthGlobe.tsx` — eksperymentalny, regionalny widok NRT,
- `control-center.css` — układ zakładek aplikacji,
- `web/index.html` — nawigacja całego projektu.

## Znalezione problemy

### 1. Nakładanie się zakładek na zawartość

`styles.css` ustawia ogólny `header` na stałą wysokość `76px`. Nagłówek aplikacji `app-header` na mniejszych ekranach przechodzi na kilka rzędów, ale wcześniej nie kasował tej stałej wysokości. Powodowało to wizualne nachodzenie zakładek na panel czasu i wrażenie, że część elementów jest „rozjechana”.

**Korekta:** `app-header` ma teraz `height:auto`, responsywną siatkę, stałą wysokość wierszy przycisków i osobny próg 2-kolumnowy dla bardzo wąskich ekranów.

### 2. Ryzyko utraty TEST 001–010 przy kolejnym wdrożeniu

Opublikowany `docs/index.html` zawierał TEST 001–010 i 90°N, natomiast źródłowy `web/index.html` był starszy. Workflow produkcyjny buduje `docs/index.html` z `web/index.html`, więc kolejna zmiana aplikacji mogła usunąć te zakładki z GitHub Pages.

**Korekta:** pełna lista zakładek została przeniesiona do źródłowego `web/index.html` i objęta testem regresji.

### 3. Charakterystyczny szew/pas na chmurach globu

Widok `full-live-earth` nakładał jednocześnie regionalne obrazy geostacjonarne GOES-East, GOES-West i Himawari na cały glob. Każdy z tych sensorów ma własny obszar widzenia i granice obrazu. Złożenie ich jako pełnoglobowych półprzezroczystych warstw tworzy widoczne granice/szwy i różnice jasności.

**Korekta:** globalny widok nie składa już regionalnych pełnych dysków. Dla całej planety używana jest jedna globalna kafelkowa warstwa NASA GIBS `VIIRS_SNPP_CorrectedReflectance_TrueColor`, która zawiera rzeczywiste zachmurzenie w dziennej mozaice. Regionalne dane około 10-minutowe zostały przeniesione do osobnego trybu diagnostycznego i są nakładane z małą przezroczystością na globalny VIIRS.

Oficjalne źródła:

- NASA GIBS: https://gibs.earthdata.nasa.gov/
- NASA Worldview: https://worldview.earthdata.nasa.gov/
- Copernicus Data Space: https://dataspace.copernicus.eu/

### 4. Nieprawidłowa interpretacja częstotliwości aktualizacji

`full-live-earth` był traktowany jako animacja 10-minutowa, mimo że globalna warstwa VIIRS jest produktem dziennym. To mieszało częstotliwość regionalnych sensorów geostacjonarnych z globalną mozaiką polarną.

**Korekta:** animacja 10-minutowa działa tylko dla trybu regionalnych chmur i danych fal. Globalny widok zachowuje uczciwy opis częstotliwości danych.

### 5. Kontrolki odtwarzania mogły znaleźć się pod canvasem Cesium

Canvas jest pozycjonowany absolutnie. Kontrolki odtwarzania nie miały własnego pozycjonowania i warstwy `z-index`, więc mogły być zasłaniane przez renderer.

**Korekta:** dodano `tiled-earth-playback` z warstwą nad canvasem oraz osobnym układem mobilnym.

## Stan rodziny modeli po korekcie

- **Cesium / WGS84** — główny renderer; kafelki, LOD, cache Cesium, markery zagrożeń.
- **Globalne chmury** — NASA VIIRS True Color; bez sztucznego łączenia regionalnych prostokątów.
- **Regionalne chmury NRT** — GOES/Himawari jako tryb diagnostyczny; nie są prezentowane jako globalne pokrycie.
- **StableEarthGlobe** — pozostaje awaryjnym rendererem Three.js i nie jest traktowany jako źródło satelitarne.
- **LiveNrtEarthGlobe** — pozostaje eksperymentalnym komponentem regionalnym i nie jest aktywnym domyślnym rendererem.

## Testy regresji

Dodano/rozszerzono testy sprawdzające:

1. brak stałej wysokości wielorzędowego nagłówka,
2. obecność TEST 001–010 w źródłowym menu,
3. globalny VIIRS jako baza chmur,
4. brak GOES/Himawari w globalnym bloku kompozycji,
5. ograniczenie ciężkich nakładek na urządzeniach mobilnych,
6. pozycję kontrolek odtwarzania ponad canvasem Cesium.

## Następny etap

Po tej poprawce dalsze prace nad globem powinny koncentrować się na osobnym module kompozycji chmur z kontrolą pokrycia, czasu obserwacji i jakości źródła. Jeżeli powstanie prawdziwa globalna kompozycja subdobowa, powinna być generowana jako jawny produkt mozaikowy z metadanymi o czasie i zasięgu każdego sensora, zamiast nakładania surowych pełnych dysków bez maski przejścia.
