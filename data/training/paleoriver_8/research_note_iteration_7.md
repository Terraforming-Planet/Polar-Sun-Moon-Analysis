# Sahara Station — research note, iteration 7

## Observation

Dotychczasowe trasowanie D8 używało pojedynczego kafla DEM 1°×1°. Punkt odpływu mógł więc być wymuszany przez sztuczną granicę próbki, a zlewnia mogła być ucięta przed naturalnym dalszym biegiem.

## Zmiana techniczna

Dodano mozaikę 3×3 kafle Copernicus DEM wokół każdego z ośmiu przypadków. Każdy kafel jest próbkowany do 17×17 komórek i składany bez podwajania wspólnych krawędzi do siatki 49×49 obejmującej około 3°×3°. D8 i Priority-Flood działają teraz także na tej większej siatce. Centralny screening 33×33 pozostaje równolegle, aby zachować porównywalność z poprzednimi iteracjami.

## Wniosek roboczy

Jeżeli dominujący odpływ i koncentracja przepływu pozostają podobne po rozszerzeniu z 1°×1° do 3°×3°, hipoteza lokalnego kierunku drenażu staje się odporniejsza na artefakt granicy kafla. Jeżeli wynik zmienia się mocno, wcześniejszy pojedynczy kafel należy traktować jako niewystarczający.

## Ograniczenia

To nadal screening geomorfologiczny. Copernicus DEM jest DSM, a D8 po Priority-Flood nie dowodzi istnienia dawnej rzeki ani nie wylicza realnej pojemności retencyjnej. Potwierdzenie wymaga zgodności z obrazami optycznymi/SAR, geologią, osadami, większą zlewnią oraz — tam gdzie dostępne — obserwacjami terenowymi.
