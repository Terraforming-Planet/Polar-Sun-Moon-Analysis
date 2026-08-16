# Notatka badawcza — iteracje 1–3

## Obserwacje z 8 testów satelitarnych
- **Death Valley:** zamknięta misa i wachlarze aluwialne pokazują rolę progów odpływu; USGS dokumentuje dawne fazy jeziorne.
- **Bonneville:** suchy basen jest kontrolnym przykładem dawnego magazynu wody; konkretne kanały wymagają DEM/geologii.
- **Ebro / Aragón:** aktywna rzeka w półsuchym otoczeniu pokazuje znaczenie korytarza rzecznego i retencji; to analog zarządzania wodą, nie paleorzeka.
- **Po 2022:** niski stan odsłania łachy i zwęża aktywny kanał; to analog wrażliwości przepływu na zasilanie zlewni.
- **Tanezrouft:** ESA opisuje ślady dawnej erozji wodnej w dziś hiper suchym terenie.
- **Tsauchab / Sossusvlei:** rzeka efemeryczna kończy się w naturalnej niecce endoreicznej, która magazynuje wodę i sedyment podczas rzadkich epizodów.
- **Lop Nur:** terminalny basen nadaje się do badania dawnych kierunków dopływu, ale szczegółowe paleokanały wymagają SAR/DEM.
- **Aral:** pokazuje, że sam duży basen nie gwarantuje retencji, jeśli dopływy są ograniczone lub przekierowane.

## Iteracja 2 — warstwa wysokościowa
Do globalnego widoku NASA GIBS dołączono regionalną siatkę wysokościową Copernicus DEM GLO-90 dla aktualnie wybranego miejsca. Siatka jest próbkowana do 33×33 punktów z jednego kafla 1°×1°. Wysokość jest najpierw przeliczana zgodnie z fizycznym promieniem Ziemi, a następnie wizualnie wyolbrzymiana 24×, ponieważ rzeczywista rzeźba byłaby niemal niewidoczna na globie tej skali. Wyolbrzymienie jest wyłącznie sposobem prezentacji i nie zmienia wartości DEM używanych do odczytu minimum/maksimum.

Ta warstwa pozwala porównywać zdjęcie satelitarne z realną rzeźbą terenu w tych samych lokalizacjach. Nie jest jeszcze pełnym globalnym DEM: ładowany jest regionalny kafel wokół wybranego punktu. Jest to krok pośredni przed pełnym kafelkowaniem geometrii wysokościowej i selekcją kafli według pola widzenia.

## Iteracja 3 — przesiew topograficzny DEM
Dodano porównywalną analizę 33×33 dla środka każdego z 8 testów. Wyliczane są: zakres wysokości, relief, średnie nachylenie, udział komórek o spadku poniżej 2°, udział lokalnych obniżeń oraz jawnie heurystyczny screening retencji 0–100. Screening służy wyłącznie do wyboru miejsc wymagających dokładniejszej analizy i nie jest obliczeniem pojemności ani prognozą hydrologiczną.

Nowa zasada robocza: zdjęcie optyczne wskazuje formę, DEM sprawdza geometrię, a dopiero model zlewni i dane terenowe mogą oceniać realną możliwość magazynowania wody. Lokalna depresja w DSM może być artefaktem rozdzielczości lub pokrycia terenu, dlatego nie jest automatycznie naturalnym zbiornikiem.

## Wnioski modelowe do testowania, nie fakty wykonawcze
1. Najpierw wyznaczać zlewnie, obniżenia i progi odpływu z DEM.
2. Liczyć czas retencji, infiltrację, parowanie, erozję i sedymentację, a nie tylko objętość.
3. Testować kaskady mniejszych magazynów i istniejące niecki przed megastrukturami.
4. Oddzielać kanały aktywne, efemeryczne i kopalne; forma liniowa na RGB sama nie dowodzi paleorzeki.
5. Łączyć optykę z SAR i DEM na pustyniach.
6. Porównywać liniowe ślady widoczne na RGB z kierunkiem spadku DEM; zgodność zwiększa wiarygodność hipotezy o dawnym spływie, ale nadal nie stanowi samodzielnego dowodu paleohydrologicznego.
7. Przy projektowaniu retencji szukać najpierw naturalnych niecek i przewężeń odpływu, ponieważ wymagają mniejszej ingerencji niż sztuczne formowanie całego krajobrazu.
8. Ranking retencji traktować jako filtr do dalszych badań, nie jako wynik projektowy; kolejnym krokiem jest kierunek przepływu, akumulacja przepływu i pełna zlewnia.

## Trening
Zbudowano 8-obrazowy zestaw kontrolny i baseline K-means na histogramach RGB. To test pipeline’u, nie walidowany detektor. Iteracja 2 dodała warstwę DEM do wizualnej weryfikacji lokalizacji. Iteracja 3 dodaje cechy topograficzne do interaktywnego przesiewu: lokalne nachylenie, relief, udział płaskiego terenu i lokalnych obniżeń. Następny etap powinien dodać kierunek i akumulację przepływu, a następnie połączyć te cechy z Sentinel-1 SAR i ręcznie zweryfikowanymi maskami.
