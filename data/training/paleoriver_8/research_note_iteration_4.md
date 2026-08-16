# Iteracja 4 — D8, akumulacja przepływu i dominujące zlewnie

## Zakres

Ta iteracja rozszerza osiem testów satelitarnych o analizę topograficzną opartą na regionalnych próbkach Copernicus DEM GLO-90. Dla każdego przypadku system nadal pobiera rzeczywiste dane DEM w przeglądarce, ale oprócz reliefu, średniego spadku, płaskich powierzchni i lokalnych obniżeń oblicza teraz również:

- kierunek odpływu D8 do jednego z ośmiu sąsiadów,
- akumulację przepływu wyrażoną liczbą komórek zasilających,
- dominujący punkt odpływu w analizowanej próbce,
- udział komórek należących do dominującej zlewni,
- udział komórek o wysokiej koncentracji odpływu.

## Co jest obserwacją, a co modelem

Obserwacją jest wysokość powierzchni reprezentowana przez Copernicus DEM oraz zobrazowania satelitarne zapisane w zestawie ośmiu testów. D8, akumulacja przepływu i granice zlewni są wynikiem modelu obliczeniowego zastosowanego do tej próbki DEM. Nie są bezpośrednim pomiarem przepływu wody i nie stanowią dowodu, że wykryty ślad jest dawną rzeką.

## Główna wskazówka badawcza

Silniejsza hipoteza paleokanału pojawia się wtedy, gdy niezależne warstwy danych są zgodne przestrzennie: liniowy lub meandrujący ślad na obrazie optycznym pokrywa się z obniżeniem topograficznym, kierunek D8 prowadzi wzdłuż tej struktury, a akumulacja przepływu rośnie w kierunku potencjalnego odbiornika. Rozbieżność między tymi warstwami jest sygnałem, że należy szukać innego wyjaśnienia formy terenowej.

## Wnioski dotyczące magazynowania wody

Do dalszego screeningu retencji najbardziej interesujące są miejsca, w których jednocześnie występują: duża powierzchnia zlewni zasilającej, koncentracja odpływu, lokalne obniżenie lub naturalny próg odpływu oraz małe nachylenie w strefie potencjalnego magazynowania. Sam niski punkt nie wystarcza, ponieważ może mieć małą zlewnię albo być artefaktem DSM.

## Ograniczenia

Copernicus DEM jest modelem DSM, więc zawiera wpływ obiektów powierzchniowych i nie jest hydrologicznie kondycjonowany. Aktualny D8 pozostawia płaskie powierzchnie i zamknięte depresje bez sztucznego wymuszania odpływu. Przed ilościowym szacowaniem pojemności retencyjnej potrzebne są co najmniej: hydrologiczne wypełnianie lub breaching depresji, większy zasięg DEM obejmujący pełne zlewnie, analiza geologii i przepuszczalności, parowanie, sedymentacja, dane opadowe oraz weryfikacja terenowa.

## Następny krok

Kolejna iteracja powinna dodać wizualną warstwę linii przepływu i akumulacji na regionalnym reliefie 3D oraz zapisywanie wyników ośmiu testów do ustandaryzowanego JSON/CSV, tak aby można było porównywać obraz optyczny, DEM, D8 i cechy treningowe w jednym rekordzie.
