import { EARTH_SOURCES } from './data/earthSources'

export function EarthSourcePanel() {
  return (
    <details className="earth-source-panel">
      <summary>Źródła modelu Ziemi</summary>
      <p>
        Model rozróżnia geometrię, globalne mozaiki, warstwy obserwacyjne i elementy
        syntetyczne. Mozaika nie jest opisywana jako pojedyncze surowe zdjęcie całej Ziemi.
      </p>
      <div className="earth-source-list">
        {EARTH_SOURCES.map(source => (
          <article key={source.id} data-active={source.active ? 'true' : 'false'}>
            <div>
              <strong>{source.label}</strong>
              <span>{source.active ? 'Aktywne' : 'Planowane'}</span>
            </div>
            <dl>
              <dt>Instytucja</dt><dd>{source.institution}</dd>
              <dt>Typ produktu</dt><dd>{source.productType}</dd>
              <dt>Rozdzielczość</dt><dd>{source.resolution}</dd>
              <dt>Data / okres</dt><dd>{source.observationPeriod}</dd>
              <dt>Licencja</dt><dd>{source.license}</dd>
              <dt>Przetwarzanie</dt><dd>{source.processingNote}</dd>
            </dl>
          </article>
        ))}
      </div>
    </details>
  )
}
