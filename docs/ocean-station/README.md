# Ocean Research Station

Moduł badawczy Terraforming Planet do bezpiecznej analizy batymetrii, rowów oceanicznych, gór podwodnych, geometrii dna, danych sonarowych i satelitarnych.

## Zakres

- WebGL / Three.js proceduralny sandbox 3D,
- podwodna góra, rów/dolina oraz para objętościowa 1:1,
- siatka badawcza 8×8×8 = 512 komórek przez GPU Instancing,
- WGS‑84 i geometria referencyjna Ziemi,
- GEBCO / NOAA / BMKG / CDSE / USGS / NASA jako oficjalne źródła startowe,
- rejestr wiedzy rozdzielający obserwacje, wiedzę ustaloną, hipotezy i spekulacje,
- orientacyjne scenariusze GPU dotyczące przetwarzania istniejących danych.

## Bezpieczeństwo

To laboratorium numeryczne, nie projekt wykonawczy. Nie dostarcza instrukcji fizycznego pogłębiania, wysadzania, obciążania ani przemieszczania dna. Nie przedstawia lokalnej modyfikacji masy jako zweryfikowanej metody zatrzymywania trzęsień ziemi.

## Pliki

- `index.html` — raport i interfejs laboratorium,
- `ocean-lab.js` — model 3D i logika scenariuszy,
- `ocean-lab.css` — interfejs responsywny,
- `research-registry.json` — źródła, geometria, statusy hipotez i założenia.
