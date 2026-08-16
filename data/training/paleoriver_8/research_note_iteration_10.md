# Iteracja 10 — zunifikowany rekord treningowy 8 przypadków

## Cel

Dotychczasowe moduły liczyły osobno cechy obrazu optycznego, lokalnego DEM 1°×1°, mozaiki DEM 3°×3°, stabilność kierunku drenażu oraz zgodność całych ścieżek D8. W tej iteracji te warstwy są łączone po identyfikatorze przypadku w jeden rekord treningowy dla każdego z ośmiu testów.

## Obserwacje i dane wejściowe

Warstwa optyczna pochodzi z zapisanych obrazów NASA GIBS / MODIS Terra true color i istniejącego pliku `training_features.csv`. Zawiera proste statystyki RGB. Wysokości terenu są pobierane z publicznego Copernicus DEM i analizowane w dwóch zasięgach przestrzennych.

Te wartości są danymi wejściowymi lub bezpośrednio wyliczonymi cechami obrazu/DEM. Nie są etykietą geologiczną.

## Wyniki modelowe dołączone do rekordu

Każdy rekord może zawierać m.in. relief, średni spadek, udział płaskiego terenu, screening retencji, maksymalną akumulację D8, udział dominującej zlewni, diagnostykę Priority-Flood, różnicę kierunku drenażu 1° vs 3°, zmianę udziału zlewni oraz zgodność całej głównej ścieżki odpływu w obu skalach.

Pola te opisują wynik konkretnego pipeline'u obliczeniowego. Nie są obserwowanym przepływem wody i nie potwierdzają, że widoczna struktura jest paleorzeką.

## Zasada etykietowania

W tej iteracji celowo nie dodano binarnej etykiety `paleoriver=true/false`. Zamiast tego każdy rekord otrzymuje status `screening-not-geological-proof`. Pozwala to trenować i testować pipeline bez mieszania hipotezy modelowej z niezależnym ground truth.

Do etykiet referencyjnych potrzebne są osobne, zweryfikowane źródła: publikacje geomorfologiczne, mapy geologiczne, osady, dane terenowe oraz ręcznie lub ekspercko zatwierdzone maski kanałów.

## Ograniczenie dotyczące SAR

Aktualny zunifikowany rekord łączy optykę RGB z DEM i hydrologią modelową. Sentinel-1 SAR nie jest jeszcze częścią tych konkretnych rekordów, dlatego nie należy opisywać tego etapu jako pełnego modelu multisensorowego.

## Wniosek dla badań retencji

Najbardziej wartościowym kandydatem do dalszej analizy nie jest sam niski punkt ani sam ciemny/jasny ślad na obrazie. Wyższy priorytet badawczy mają miejsca, w których kilka niezależnych sygnałów jest zgodnych: geometria terenu, koncentracja zlewni, stabilność drenażu po zwiększeniu zasięgu oraz podobny przebieg głównej ścieżki odpływu. Nadal konieczne są infiltracja, parowanie, geologia, sedymentacja i ograniczenia środowiskowe.

## Następny krok

Do każdego z 8 rekordów należy dołączyć niezależną warstwę Sentinel-1 SAR lub inną oficjalną warstwę radarową oraz cechy liniowości/korytowości obrazu. Dopiero po zbudowaniu zweryfikowanych masek referencyjnych można sensownie mierzyć precision, recall i skuteczność detekcji paleokanałów.
