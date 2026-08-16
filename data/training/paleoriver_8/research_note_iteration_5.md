# Sahara Station — iteracja 5: wizualizacja 3D przepływu i eksport cech

## Co dodano

Regionalny relief Copernicus DEM GLO-90 na globie pokazuje teraz nie tylko samą powierzchnię wysokościową, ale również najbardziej skoncentrowane odcinki przepływu D8. Linie są tworzone wyłącznie dla komórek o wysokiej akumulacji przepływu w obrębie analizowanego kafla. Dominujący punkt odpływu jest oznaczony osobnym markerem.

Obliczenia D8 przeniesiono do wspólnego modułu `sahara-flow-core.js`, aby ta sama implementacja była używana przez screening 8 testów i wizualizację 3D. Ogranicza to ryzyko rozbieżności między tabelą wyników a widokiem na reliefie.

Po uruchomieniu analizy 8 testów użytkownik może zapisać aktualne cechy jako JSON/CSV. Eksport obejmuje m.in. relief, średni spadek, udział lokalnych obniżeń, wskaźnik screeningowy retencji, maksymalną akumulację D8 oraz udział dominującej zlewni.

## Obserwacja

Wizualizacja 3D pomaga odróżnić dwa typy sygnałów, które na obrazie optycznym mogą wyglądać podobnie: liniowe struktury zgodne z lokalnym spadkiem terenu oraz struktury przecinające spadek w sposób, którego prosty model D8 nie wspiera. Zgodność śladu z DEM i rosnącą akumulacją przepływu zwiększa wartość hipotezy hydrologicznej, ale sama nie jest dowodem paleorzeki.

## Ograniczenia

- D8 przypisuje odpływ tylko do jednego z ośmiu sąsiadów i upraszcza przepływ rozproszony.
- Płaskie powierzchnie i zamknięte obniżenia wymagają hydrologicznego kondycjonowania DEM.
- Copernicus DEM jest modelem DSM; lokalne obiekty powierzchniowe mogą wpływać na wysokość.
- Próbka 33×33 i pojedynczy kafel 1°×1° nie obejmują całej dużej zlewni.
- Wskaźnik retencji jest przesiewem geometrycznym, a nie prognozą objętości magazynowanej wody.

## Wniosek roboczy dla formowania terenu

Przed projektowaniem nowej doliny lub zbiornika warto najpierw wyświetlić na rzeczywistym DEM linie koncentracji odpływu i dominujące ujście. Najbardziej interesujące miejsca do dalszej analizy to te, gdzie naturalna akumulacja przepływu łączy się z niewielkim spadkiem i możliwym obniżeniem terenu. Dopiero kolejne warstwy — geologia, infiltracja, parowanie, sedymentacja, opady i obserwacje terenowe — mogą odpowiedzieć, czy miejsce nadaje się do rzeczywistej retencji.
