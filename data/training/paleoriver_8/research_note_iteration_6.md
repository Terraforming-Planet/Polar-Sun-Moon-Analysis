# Iteracja 6 — kondycjonowanie DEM przed D8

## Co zmieniono

Wspólny moduł hydrologiczny otrzymał etap **Priority-Flood** wykonywany na osobnej kopii roboczej DEM. Surowe wysokości Copernicus DEM pozostają bez zmian i nadal służą do opisu reliefu, lokalnych obniżeń i cech treningowych. Dopiero kopia przeznaczona do trasowania przepływu jest numerycznie podnoszona do najniższego poziomu umożliwiającego odpływ do brzegu analizowanego kafla.

Na powierzchniach płaskich stosowany jest minimalny gradient 0,001 m. Jego rolą jest wyłącznie usunięcie niejednoznaczności numerycznej D8; nie reprezentuje on rzeczywistej rzeźby terenu.

## Obserwacja, obliczenie i hipoteza

**Obserwacja:** surowy DEM może zawierać płaskie komórki i zamknięte obniżenia. Mogą to być prawdziwe formy terenu, ale również efekt rozdzielczości, DSM, resamplingu albo granicy pojedynczego kafla.

**Obliczenie:** Priority-Flood tworzy wersję DEM do trasowania, w której komórki wnętrza mają możliwą drogę odpływu. System raportuje udział komórek podniesionych, średnią i maksymalną głębokość korekty oraz czysto numeryczną sumę `fill depth × area`.

**Hipoteza do dalszego sprawdzenia:** miejsca, w których surowy DEM pokazuje obniżenie, obraz satelitarny pokazuje strukturę korytową, a po kondycjonowaniu D8 prowadzi do rosnącej akumulacji przepływu, są lepszymi kandydatami do dalszej analizy paleohydrologicznej niż miejsca wybrane tylko na podstawie RGB.

## Ważne ograniczenie

`conditionedNumericalFillVolumeM3` **nie jest objętością zbiornika, ilością dostępnej wody ani projektem retencji**. To diagnostyka algorytmu zależna od rozdzielczości próbki, granicy kafla i sposobu kondycjonowania. Realna ocena magazynowania wody wymaga większego DEM obejmującego pełną zlewnię, geologii, infiltracji, parowania, osadów, sezonowości i danych terenowych.

## Następny krok

Po ustabilizowaniu kondycjonowania należy rozszerzyć analizę z pojedynczego kafla 1°×1° na mozaikę kilku kafli i porównać wyniki przed/po kondycjonowaniu dla wszystkich ośmiu testów. Dopiero wtedy warto budować automatyczne maski potencjalnych paleokanałów i cechy do dalszego treningu.
