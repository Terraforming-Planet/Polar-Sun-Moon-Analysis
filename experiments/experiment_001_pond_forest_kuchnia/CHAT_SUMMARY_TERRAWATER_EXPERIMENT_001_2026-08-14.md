# Terraforming Planet / TerraWater AI — podsumowanie kluczowych ustaleń z czatu

**Data zapisu:** 2026-08-14  
**Status:** robocza dokumentacja Experiment 001  
**Zasada:** dane satelitarne muszą być prawdziwe, oficjalne, publicznie dostępne i możliwe do odtworzenia. Nie używać generatywnego AI do uzupełniania braków ani sztucznej super-rozdzielczości przedstawianej jako realny detal.

---

## 1. Główny cel

Budujemy system **Terraforming Planet / TerraWater AI**, który ma wykrywać długoterminowe zmiany zasobów wodnych na Ziemi na podstawie danych satelitarnych.

Pierwszy formalny przypadek badawczy to:

### Experiment 001 — Forest Pond / Jezioro Kuchnia
- główny punkt analizy: **53.591400, 19.010717**
- standardowy wycinek obrazu: **2 km × 2 km**
- zakres czasu: **1990–2026**
- liczba roczników: **37**
- obiekt główny: zanikający staw leśny
- obiekt porównawczy: Jezioro Kuchnia i lokalny układ hydrologiczny

Celem nie jest tylko pokazanie, że zbiornik zmalał, ale stworzenie procedury, którą później będzie można powtarzać dla tysięcy jezior, rzek, stawów, kanałów i terenów mokradłowych.

---

## 2. Co uznajemy obecnie za obserwację, a co za hipotezę

### OBSERWACJA
- Starsze obrazy satelitarne pokazują wyraźnie większy sygnał otwartej wody w rejonie stawu leśnego.
- Nowsze obrazy pokazują silną redukcję powierzchni wody, a w niektórych latach prawie całkowity brak stabilnego lustra wody.
- Zmiana jest wystarczająco duża, by uzasadnić alarm środowiskowy i dokładną analizę.

### WSTĘPNY SZACUNEK — NIE FINALNY
- roboczy szacunek utraconej powierzchni otwartej wody: około **2,5 ha = 25 000 m²**
- wygląda na to, że staw mógł stracić blisko **100%** wcześniejszej widocznej powierzchni wody

Ta wartość **nie jest jeszcze wynikiem końcowym** i nie może być przedstawiana jako ostatecznie zmierzona, dopóki nie zakończymy:
- korekty geometrii stawu,
- pomiaru na wspólnej siatce,
- porównania sezonowego,
- analizy niepewności,
- kontroli między różnymi sensorami.

### NIEUSTALONE
Zdjęcia satelitarne same w sobie nie dowodzą przyczyny zaniku wody.

Hipotezy do późniejszego sprawdzenia:
- susza i zmiany opadów,
- zmiany odpływu,
- zablokowane lub zmienione połączenia hydrologiczne,
- gospodarka wodna,
- poziom wód gruntowych,
- wpływ Wisły i lokalnych kanałów,
- melioracja,
- zmiany użytkowania terenu.

---

## 3. Metoda sezonowa

Porównywanie przypadkowych miesięcy jest błędem. Dlatego Experiment 001 ma dwa główne sezonowe zestawy.

### Wiosna
Preferencja:
1. **maj**
2. kwiecień — fallback
3. czerwiec — fallback

Jeżeli maj jest zachmurzony lub uszkodzony, można użyć innego miesiąca, ale:
- musi to być zapisane w `manifest.json`,
- miesiąc nie może być ukrywany,
- dane nie mogą być oznaczone jako maj, jeśli pochodzą z innego miesiąca.

### Jesień
Preferencja:
1. **wrzesień**
2. październik — fallback
3. listopad — fallback

Jesień ma pokazać stan po sezonie letnim i pomóc oddzielić:
- trwały zanik wody
od
- zwykłych wahań sezonowych.

---

## 4. Zasada synchronizacji jakości

Nie wolno udawać, że wszystkie satelity mają tę samą rozdzielczość.

### 1990–1998
- głównie Landsat 5 TM
- realna rozdzielczość multispektralna około **30 m**

### 1999–2002
- Landsat 5 + Landsat 7
- Landsat 7 ma 15 m pasmo panchromatyczne
- kolor nadal pochodzi z niższej rozdzielczości multispektralnej

### 2003–2011
- preferować Landsat 5
- Landsat 7 po awarii SLC z 31 maja 2003 musi mieć mocno karane braki obrazu

### 2012
- trudny rok
- główny dostępny Landsat to Landsat 7 SLC-off
- ewentualny fallback: ASTER, jeśli istnieje dobra scena

### 2013–2015
- Landsat 8
- możliwy 15 m pan-sharpening do wizualizacji
- do pomiaru powierzchni lepiej trzymać wspólną siatkę

### 2016–2026
- Sentinel-2 10 m jako priorytet
- Landsat 8/9 jako fallback
- Sentinel-2C używany, jeśli jest dostępny dla danego roku i miejsca

---

## 5. Główne źródła danych

### Źródło 1 — NASA / USGS
**Landsat 5 / 7 / 8 / 9**

Rola:
- długi zapis od 1990 r.
- podstawowy szkielet historyczny

### Źródło 2 — ESA / Copernicus
**Sentinel-2**

Rola:
- obrazy optyczne 10 m
- wysoka jakość od 2015/2016

### Źródło 3 — ESA / Copernicus
**Sentinel-1 RTC**

Rola:
- radar
- niezależny od zachmurzenia
- inna fizyka pomiaru niż obraz optyczny

Ograniczenia:
- mały staw w lesie jest trudny do klasyfikacji radarowej
- wpływ drzew, mokrej gleby i pikseli mieszanych

### Źródło 4 — NASA ASTER
ASTER został dodany jako realny kandydat na czwarte niezależne źródło.

Automatyczny katalog NASA CMR dla punktu Experiment 001 znalazł **77 scen ASTER L1T** w sezonach wiosna/jesień.

Lata z przynajmniej jedną sceną wiosenną ASTER:
- 2002, 2003, 2006, 2008, 2010, 2011, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2024, 2025, 2026

Lata z przynajmniej jedną sceną jesienną ASTER:
- 2001, 2002, 2003, 2004, 2005, 2008, 2009, 2010, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025

### Dodatkowy kandydat — JAXA ALOS
- ALOS / AVNIR-2 / PALSAR
- szczególnie okres około 2006–2011
- interesujące jako niezależna kontrola

### Roscosmos i CNSA
Można używać **wyłącznie wtedy**, gdy:
- produkt jest oficjalny,
- publicznie dostępny,
- da się potwierdzić datę, sensor i pochodzenie,
- da się pobrać konkretne dane dla naszego AOI.

Nie dodajemy Roscosmos/CNSA tylko po to, aby sztucznie mieć „4 źródła”.

---

## 6. Najważniejsza zasada integralności danych

Każdy obraz musi przejść kontrolę.

### Twarde reguły
- ten sam plik nie może być użyty jako dwa różne lata,
- data na pliku musi zgadzać się z rokiem,
- obraz nie może być pusty, czarny, biały ani uszkodzony,
- zachmurzenie musi być oceniane lokalnie dla AOI,
- brakujące piksele muszą być wykrywane,
- źródło, ID sceny, data, sensor i rozdzielczość muszą być zapisane,
- żadnego generatywnego uzupełniania braków,
- żadnej AI super-resolution przedstawianej jako prawdziwy detal satelitarny.

---

## 7. Błędy znalezione w poprzednich zestawach

Błędy **nie są kasowane**. Trafiają do archiwum:

`errors/do_wyjasnienia/`

z:
- oryginalną nazwą,
- rokiem,
- SHA-256,
- powodem odrzucenia,
- źródłem,
- statusem.

### Znane problemy

#### 2002, 2012, 2013
W alternatywnym zestawie znaleziono **identyczne obrazy przypisane do różnych lat**. Nie mogą być używane jako niezależne obserwacje.

#### 1993
Alternatywny obraz był pusty/uszkodzony i miał problem z path/row względem głównego zestawu.

#### 1995
Oba obrazy optyczne miały słabą jakość / duże zachmurzenie.

#### 2010
Główny obraz wyglądał na uszkodzony/pusty, alternatywny miał niską jakość lokalną.

#### 1997
Obraz wygląda poprawnie i zgadza się między źródłami, ale QA/provenance daje sprzeczne wyniki.

#### 2014
Różny path/row, ale obrazy strukturalnie są zgodne — prawdopodobnie prawidłowe nakładające się sceny.

#### 2023
Źródła optyczne zgadzają się, ale automatyczna klasyfikacja radarowa Sentinel-1 daje inny sygnał. Nie wolno tego na siłę ujednolicać — wymaga analizy.

---

## 8. Niezależność źródeł

Dwa różne serwery nie zawsze oznaczają dwie różne obserwacje.

Jeżeli data, platforma, path/row i scena są te same, to mamy **jedną obserwację Ziemi dostarczoną dwoma kanałami**.

To jest dobre do kontroli integralności pliku, ale nie jest niezależnym dowodem środowiskowym.

---

## 9. Pomiar powierzchni wody

Do finalnego pomiaru nie porównujemy PNG „na oko”.

### Analiza optyczna
- Green
- NIR
- SWIR
- NDWI
- MNDWI
- maska chmur
- maska cienia
- maska śniegu
- connected-component extraction
- geometria badanego stawu

### Wspólna siatka
Dla porównania 1990–2026 używamy wspólnej siatki około **30 m**.

Dzięki temu:
- Landsat 30 m i Sentinel-2 10 m nie są traktowane jak identyczne dane,
- Sentinel-2 może być używany do lepszego wykrycia kształtu,
- trend długoterminowy pozostaje porównywalny.

### Wynik
Każdy pomiar powinien mieć:
- m²
- hektary
- dolną granicę
- górną granicę
- poziom ufności
- datę
- sensor
- sezon

---

## 10. Alarm TerraWater

Jeżeli analiza potwierdzi, że trwały zbiornik o skali hektarowej stracił większość lub prawie całość otwartej wody, system powinien oznaczyć:

**HIGH-PRIORITY ENVIRONMENTAL MONITORING ANOMALY**

Alarm oznacza: **miejsce wymaga dalszego badania**.  
Alarm nie oznacza automatycznie, że znamy przyczynę.

---

## 11. Pliki i automatyzacje utworzone w Polar-Sun-Moon-Analysis

Branch:

`annual-best-53-591400-19-010717`

### Główne skrypty
- `tools/build_may_1990_2026_53_591400_19_010717.py`
- `tools/build_experiment_001_seasonal_evidence.py`
- `tools/measure_experiment_001_seasonal_water.py`
- `tools/catalog_experiment_001_nasa_aster.py`
- `tools/audit_three_satellite_sources_image_first.py`
- `tools/build_third_source_sentinel1_rtc_water_2015_2025.py`
- `tools/build_alternate_source_may_1990_2025_53_591400_19_010717.py`

### Workflows GitHub Actions
- `.github/workflows/experiment-001-seasonal-evidence.yml`
- `.github/workflows/experiment-001-seasonal-measurements.yml`
- `.github/workflows/experiment-001-source4-aster-catalog.yml`

### Katalog ASTER
- `experiments/experiment_001_pond_forest_kuchnia/source4/nasa_aster/nasa_aster_scene_catalog.json`

---

## 12. Repozytorium TerraWater AI

Repo:
`teslaeco/Terraforming-Planet-TerraWater-AI-Global-Water-Recovery`

Branch:
`experiment-001-water-loss-53-591400-19-010717`

Główny dokument Experiment 001:
- `experiments/experiment_001_forest_pond_kuchnia/EXPERIMENT_001_REPORT.md`

W repo TerraWater przechowujemy:
- opis przypadku,
- metodologię,
- decyzje badawcze,
- stan eksperymentu,
- późniejsze etykiety treningowe AI.

Cięższe dane satelitarne i surowe evidence pozostają w repo Polar-Sun-Moon-Analysis.

---

## 13. Istniejące paczki danych

### Główna seria majowa 1990–2026
`MAY_1990_2026_37_YEARS_2km_53.591400_19.010717.zip`

### Alternatywna seria majowa 1990–2025
`ALT_SOURCE_MAY_1990_2025_36_YEARS_2km_53.591400_19.010717.zip`

### Sentinel-1 RTC
`THIRD_SOURCE_SENTINEL1_RTC_MAY_2015_2025_WATER_2km_53.591400_19.010717.zip`

---

## 14. Najbliższe kroki

1. Dokończyć poprawioną serię **wiosna 1990–2026**.
2. Dokończyć pełną serię **jesień 1990–2026**.
3. Zachować wszystkie odrzucone sceny w `errors/do_wyjasnienia/`.
4. Zweryfikować geometrię badanego stawu.
5. Wykonać finalny pomiar 1990 vs 2026 na wspólnej siatce.
6. Porównać wiosna vs jesień.
7. Sprawdzić ASTER jako 4. niezależne źródło.
8. Sprawdzić JAXA ALOS dla lat, gdzie może poprawić dowód.
9. Nie używać Roscosmos/CNSA bez oficjalnego i możliwego do zweryfikowania produktu.
10. Po zamknięciu Evidence 001 znaleźć około **4 kolejne przypadki**.
11. Dopiero po kilku potwierdzonych przypadkach budować zestaw treningowy AI.
12. Następnie testować na **NVIDIA L4**.
13. Potem skanować obszar około **100 km** od Experiment 001 pod kątem podobnych zmian.
14. Docelowo rozszerzyć system globalnie.

---

## 15. Zasada końcowa projektu

System ma pomagać wykrywać prawdziwe zmiany środowiskowe, a nie tworzyć ładne, ale nieweryfikowalne obrazy.

Każdy ważny wynik musi mieć:
- źródło,
- datę,
- sensor,
- rzeczywistą rozdzielczość,
- kontrolę jakości,
- ścieżkę reprodukcji,
- informację o niepewności.

**Najpierw dowody, potem AI.**
