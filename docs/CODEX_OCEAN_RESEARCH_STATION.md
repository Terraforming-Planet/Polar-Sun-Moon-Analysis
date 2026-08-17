# CODEX — Ocean Research Station / TP‑26 Ocean Integration

## Polecenie

Rozbuduj repozytorium `Terraforming-Planet/Polar-Sun-Moon-Analysis` o moduł **Stacja badawcza oceanów**, oparty na zasadach użytych w Stacji badawczej Sahara i na przestrzennej logice 8×8×8 = 512 komórek znanej z otwartego projektu gry Terraforming Planet.

## Cel

Stworzyć legalny, publiczny i naukowo ostrożny sandbox do analizy batymetrii, rowów oceanicznych, gór podwodnych, sejsmiczności, zmian masy i fuzji danych satelitarnych/sonarowych. Pierwszy punkt demonstracyjny: ocean na południe od Jawy w rejonie Rowu Sundajskiego / Jawajskiego (Indonezja).

## Zasady bezpieczeństwa i naukowej integralności

1. Symulator **nie jest projektem wykonawczym** i nie może podawać instrukcji fizycznego pogłębiania, wysadzania, obciążania ani przemieszczania dna oceanicznego.
2. Nie przedstawiać modelowania góra/dolina jako metody zatrzymywania trzęsień ziemi. Obecnie nie ma zweryfikowanej metody sterowania trzęsieniami przez lokalne przemieszczanie masy dna.
3. Każdy wniosek oznaczać jako: `obserwacja`, `wiedza ustalona`, `hipoteza`, `spekulacja`, `brak potwierdzenia`.
4. Surowe dane i ich pochodzenie zachować bez zmian. Wizualizacja i pionowe przewyższenie nie mogą zmieniać danych źródłowych.
5. Korzystać wyłącznie z legalnych, oficjalnych i publicznie dostępnych źródeł albo jasno oznaczonych źródeł wymagających konta/licencji.

## Zakres implementacji

### A. Nowa zakładka `docs/ocean-station/`

- `index.html` — raport badawczy + interaktywny model 3D.
- `ocean-lab.css` — responsywny interfejs.
- `ocean-lab.js` — WebGL/Three.js, proceduralna batymetria, woda, góra podwodna i rów.
- `research-registry.json` — źródła, status wiedzy, hipotezy i ograniczenia.

### B. Model 3D

- podwodny teren i półprzezroczysta powierzchnia oceanu,
- dodawanie **góry podwodnej**, **doliny/rowu** oraz pary 1:1 o zgodnej objętości,
- suwaki podstawy, szczytu i wysokości/głębokości,
- przesuwanie obiektów wyłącznie w scenie symulacyjnej,
- przełącznik pionowego przewyższenia,
- siatka 8×8×8 = 512 komórek renderowana przez GPU Instancing,
- warstwa poglądowa strefy subdukcji i punktów sejsmicznych,
- wskaźnik bilansu objętości i bezwymiarowy `mass-distribution proxy`, wyraźnie opisany jako wskaźnik scenariuszowy, nie prognoza sejsmiczna ani orbitalna.

### C. Dane i TP‑26

Zweryfikować i zarejestrować publiczne źródła:

- GEBCO / Seabed 2030 — GEBCO_2026, 15 arc‑sec, public domain, subset download / OPeNDAP,
- BMKG Indonesia — publiczne JSON/XML trzęsień ziemi, limit 60 req/min/IP, obowiązkowa atrybucja BMKG,
- Copernicus Data Space — aktualny STAC `https://stac.dataspace.copernicus.eu/v1/`,
- USGS LandsatLook STAC,
- NASA CMR/STAC,
- NOAA/NCEI/Ocean Exploration — batymetria i sonar,
- NASA altimetry / gravity jako warstwa pomocnicza.

Nie zapisywać sekretów w repo. Dla API wymagających konta/tokena pokazać status i oficjalną ścieżkę uzyskania dostępu.

### D. Geometria Ziemi i 90°N

W widocznym nagłówku badawczym użyć WGS‑84:

- obwód równikowy: ~40 075.017 km,
- pełny obwód południkowy: ~40 007.863 km,
- 90°N → 90°S po powierzchni południka: ~20 003.931 km,
- średnica równikowa: 12 756.274 km,
- średnica polarna: 12 713.505 km,
- dwie zdefiniowane na potrzeby symulatora przekątne referencyjne 45° w przekroju południkowym: ~12 734.835 km każda.

Wyjaśnić, że „przekątna Ziemi” nie jest standardową wielkością geodezyjną — to definicja robocza laboratorium.

Na stronie 90°N wyeksponować lukę orbitalną 88°N → 90°N: około **222 km** po powierzchni, a nie 250 km. 250 km pozostawić wyłącznie jako wcześniejsze przybliżenie.

### E. Raport naukowy

Opisać:

- dlaczego globalna batymetria satelitarna nie jest tym samym co sonar wysokiej rozdzielczości,
- aktualny stan GEBCO_2026: 28,7% dna zmapowanego do nowoczesnych standardów,
- dlaczego mapowanie trwa długo: statki, geometria wiązki, głębokość, kalibracja, prędkość dźwięku, pozycjonowanie, QA/QC i transfer danych,
- rolę AI/GPU w przyspieszaniu fuzji, klasyfikacji, wykrywaniu luk i priorytetyzacji tras, ale bez twierdzenia, że GPU może zastąpić brakujące pomiary,
- góry podwodne, guyoty, wzgórza abisalne i ~65 000 km grzbietów śródoceanicznych,
- ostrożną odpowiedź na pozorną sprzeczność „większość seamountów jest wulkaniczna vs. nie znamy całego dna”: jest to wniosek z geologii i zbadanej próbki, nie pełny spis każdego obiektu na Ziemi,
- głęboką wodę w minerałach płaszcza jako realny temat naukowy; odróżnić ją od niepotwierdzonego „drugiego ciekłego oceanu pod lawą”,
- rzeczywisty, mały wpływ globalnej redystrybucji masy na ruch bieguna i długość doby; oddzielić go od niepopartej tezy o zmianie orbity prowadzącej do zderzenia z planetą/kometą,
- hipotezy o pradawnej cywilizacji, 666/apokalipsie i interpretacji Edenu wyłącznie jako zapis spekulacyjno-kulturowy — nie jako dane treningowe prawdy,
- wpływ zazieleniania pustyń na albedo, ewapotranspirację, chmury, opady, wiatry, rolnictwo i ekosystemy jako temat dla sprzężonego modelu klimatycznego, bez prostego założenia „więcej zieleni = proporcjonalnie więcej tlenu”.

### F. Szacunki GPU

Pokazać **orientacyjne** czasy dla jednego przebiegu analizy istniejących kafli globalnej siatki GEBCO, nie dla pozyskania brakujących pomiarów:

- telefon: dziesiątki minut do kilku godzin / praca kaflami,
- standardowy RTX: kilka–kilkadziesiąt minut,
- NVIDIA L4: kilka–kilkanaście minut,
- H100: około 1–5 min obliczeń,
- 8×H100: dziesiątki sekund do kilku minut end‑to‑end zależnie od I/O.

Oznaczyć to jako rząd wielkości, nie benchmark. Czas zależy od modelu, formatu, pamięci, przepustowości i I/O.

### G. Kryteria akceptacji

- nowa zakładka działa na desktopie i telefonie,
- WebGL nie wymaga klucza API,
- przyciski góra/dolina/pair/reset/512 działają,
- brak instrukcji realnej ingerencji w dno,
- link z głównej strony działa,
- 90°N pokazuje 222 km i geometrię WGS‑84,
- TP‑26 pokazuje aktualny status zweryfikowanych źródeł i wymagania dostępu,
- HTML/JS nie zawiera sekretów,
- CI/PR Validation przechodzą przed scaleniem.

## Status

To polecenie jest wykonywane w branchu `agent/ocean-research-station` i powinno zakończyć się draft Pull Requestem do `main`.