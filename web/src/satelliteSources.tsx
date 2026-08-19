import { EARTH_OBSERVATION_ADAPTERS } from './earthObservationAdapters'

function adapterState(status: string) {
  if (status === 'active-live') return 'LIVE VIEWER ADAPTER'
  if (status === 'active-analysis') return 'ACTIVE AI / DATA ADAPTER'
  if (status === 'ready-public') return 'PUBLIC ADAPTER READY'
  if (status === 'credential-gated') return 'SERVER-SIDE / AUTH REQUIRED'
  return 'REGISTERED SOURCE'
}

export function SatelliteSourceRegistry() {
  return (
    <section
      className="satellite-source-registry"
      aria-label="Global registry of official Earth observation adapters"
    >
      <h3>Global official satellite and Earth-observation adapters</h3>
      <p>
        Live viewer layers and AI-training sources use one provenance registry. Public browser
        adapters never contain account secrets; credential-gated providers stay server-side.
      </p>
      <div className="satellite-source-grid">
        {EARTH_OBSERVATION_ADAPTERS.map(source => {
          const enabled = source.status === 'active-live' || source.status === 'active-analysis'
          return (
            <article key={source.id} className={enabled ? 'is-enabled' : ''}>
              <strong>{source.agency}</strong>
              <span>{source.missions.join(' · ')}</span>
              <span>{adapterState(source.status)}</span>
              <small>{source.note}</small>
              <a href={source.docs} target="_blank" rel="noreferrer">
                Official documentation
              </a>
            </article>
          )
        })}
      </div>
    </section>
  )
}
