# Iteracja 9 — zgodność całych ścieżek drenażu 1° vs 3°

## Obserwacja
Dotychczasowy screening porównywał przede wszystkim azymut dominującego odpływu i udział dominującej zlewni pomiędzy modelem 1°×1° a mozaiką 3°×3°. Taki test może przeoczyć sytuację, w której dwa modele kończą odpływ w podobnym kierunku, ale prowadzą wodę inną trasą.

## Zmiana metody
Dodano śledzenie głównej ścieżki D8 w dominującej zlewni. Dla obu skal wybierana jest najdłuższa ścieżka prowadząca do dominującego odpływu. Następnie porównywane są: długość ścieżki, średnia najbliższa odległość pomiędzy przebiegami, udział punktów ścieżki 1° znajdujących się do 25 km od przebiegu 3° oraz odległość pomiędzy punktami odpływu.

## Wizualizacja
Wyniki można nałożyć na glob 3D: ścieżka 1° jest pokazana osobno od ścieżki 3°. Pozwala to szybko zobaczyć, czy zgodność końcowego kierunku wynika z podobnego przebiegu drenażu, czy tylko z podobnego położenia odpływu.

## Interpretacja
Wysoka zgodność geometryczna dwóch modeli zwiększa odporność hipotezy kierunku drenażu na zmianę granicy analizowanego obszaru. Nie potwierdza jednak istnienia dawnej rzeki. Do takiego wniosku nadal potrzebna jest zgodność z obrazami optycznymi i SAR, geologią, osadami, geomorfologią oraz — tam gdzie są dostępne — danymi terenowymi.

## Następny krok
Po uruchomieniu ośmiu przypadków warto połączyć cechy ścieżki z istniejącymi cechami DEM i obrazów satelitarnych w jednym rekordzie treningowym na test. Kolejnym ulepszeniem powinno być porównanie ścieżek z automatycznie wykrywanymi liniowymi strukturami na obrazach optycznych/SAR, zamiast trenowania wyłącznie na cechach topograficznych.
