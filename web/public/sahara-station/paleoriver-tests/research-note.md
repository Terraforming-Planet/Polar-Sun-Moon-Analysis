# Notatka badawcza — iteracja 1

## Obserwacje
- **Death Valley:** zamknięta misa i wachlarze aluwialne pokazują rolę progów odpływu; USGS dokumentuje dawne fazy jeziorne.
- **Bonneville:** suchy basen jest kontrolnym przykładem dawnego magazynu wody; konkretne kanały wymagają DEM/geologii.
- **Ebro / Aragón:** aktywna rzeka w półsuchym otoczeniu pokazuje znaczenie korytarza rzecznego i retencji; to analog zarządzania wodą, nie paleorzeka.
- **Po 2022:** niski stan odsłania łachy i zwęża aktywny kanał; to analog wrażliwości przepływu na zasilanie zlewni.
- **Tanezrouft:** ESA opisuje ślady dawnej erozji wodnej w dziś hiper suchym terenie.
- **Tsauchab / Sossusvlei:** rzeka efemeryczna kończy się w naturalnej niecce endoreicznej, która magazynuje wodę i sedyment podczas rzadkich epizodów.
- **Lop Nur:** terminalny basen nadaje się do badania dawnych kierunków dopływu, ale szczegółowe paleokanały wymagają SAR/DEM.
- **Aral:** pokazuje, że sam duży basen nie gwarantuje retencji, jeśli dopływy są ograniczone lub przekierowane.

## Wnioski modelowe do testowania, nie fakty wykonawcze
1. Najpierw wyznaczać zlewnie, obniżenia i progi odpływu z DEM.
2. Liczyć czas retencji, infiltrację, parowanie, erozję i sedymentację, a nie tylko objętość.
3. Testować kaskady mniejszych magazynów i istniejące niecki przed megastrukturami.
4. Oddzielać kanały aktywne, efemeryczne i kopalne; forma liniowa na RGB sama nie dowodzi paleorzeki.
5. Łączyć optykę z SAR i DEM na pustyniach.

## Trening
Zbudowano 8-obrazowy zestaw kontrolny i baseline K-means na histogramach RGB. To test pipeline’u, nie walidowany detektor. Następny etap wymaga ręcznie zweryfikowanych masek i cech topograficzno-radarowych.
