import './satellite-source-registry.css'

export type SatelliteSource = {
  id: string
  agency: string
  region: string
  missions: string[]
  catalogueUrl: string
  searchEndpoint?: string
  access: 'public-api' | 'account-required' | 'manual-download'
  originalProducts: boolean
  enabledInViewer: boolean
  note: string
}

export const SATELLITE_SOURCES: SatelliteSource[] = [
  {
    id: 'copernicus-cdse',
    agency: 'European Union / ESA — Copernicus Data Space Ecosystem',
    region: 'Europe / global coverage',
    missions: ['Sentinel-1 GRD', 'Sentinel-2 L2A', 'Sentinel-3 OLCI'],
    catalogueUrl: 'https://browser.dataspace.copernicus.eu/',
    searchEndpoint: 'https://stac.dataspace.copernicus.eu/v1/search',
    access: 'public-api',
    originalProducts: true,
    enabledInViewer: true,
    note: 'Primary live STAC source. The viewer selects one product ID and never labels a daily mosaic as an original scene.',
  },
  {
    id: 'usgs-landsat',
    agency: 'United States Geological Survey / NASA',
    region: 'United States / global coverage',
    missions: ['Landsat 8 Collection 2', 'Landsat 9 Collection 2'],
    catalogueUrl: 'https://landsatlook.usgs.gov/',
    searchEndpoint: 'https://landsatlook.usgs.gov/stac-server/search',
    access: 'public-api',
    originalProducts: true,
    enabledInViewer: false,
    note: 'Official Landsat scenes. Integration requires mapping Landsat STAC assets and preserving each scene footprint.',
  },
  {
    id: 'nasa-cmr',
    agency: 'NASA Earthdata',
    region: 'United States / global missions',
    missions: ['MODIS', 'VIIRS', 'ICESat-2', 'selected Earthdata granules'],
    catalogueUrl: 'https://search.earthdata.nasa.gov/',
    searchEndpoint: 'https://cmr.earthdata.nasa.gov/stac/',
    access: 'public-api',
    originalProducts: true,
    enabledInViewer: false,
    note: 'CMR-STAC exposes individual granules. Some full-resolution assets require Earthdata Login.',
  },
  {
    id: 'jaxa-gportal',
    agency: 'Japan Aerospace Exploration Agency — JAXA',
    region: 'Japan / global mission coverage',
    missions: ['ALOS', 'GCOM-C', 'GCOM-W'],
    catalogueUrl: 'https://gportal.jaxa.jp/gpr/?lang=en',
    access: 'account-required',
    originalProducts: true,
    enabledInViewer: false,
    note: 'Official original products; automated download requires a JAXA account and provider-approved authentication.',
  },
  {
    id: 'isro-bhoonidhi',
    agency: 'Indian Space Research Organisation — NRSC',
    region: 'India / selected global coverage',
    missions: ['EOS-04 SAR', 'EOS-06', 'Resourcesat'],
    catalogueUrl: 'https://bhoonidhi.nrsc.gov.in/bhoonidhi/home.html',
    access: 'account-required',
    originalProducts: true,
    enabledInViewer: false,
    note: 'Official catalogue. API and downloads can require registration, token approval or product licensing.',
  },
]

export function SatelliteSourceRegistry() {
  return (
    <section className="satellite-source-registry" aria-label="Global registry of original satellite sources">
      <h3>Global registry of original satellite products</h3>
      <p>Sources are maintained in one registry. Active APIs retrieve only products with a concrete product ID, acquisition time and footprint.</p>
      <div className="satellite-source-grid">
        {SATELLITE_SOURCES.map(source => (
          <article key={source.id} className={source.enabledInViewer ? 'is-enabled' : ''}>
            <strong>{source.agency}</strong>
            <span>{source.missions.join(' · ')}</span>
            <span>{source.enabledInViewer ? 'Synchronized with the viewer' : source.access === 'public-api' ? 'Ready for the next API adapter' : 'Provider authorization required'}</span>
            <small>{source.note}</small>
            <a href={source.catalogueUrl} target="_blank" rel="noreferrer">Open official catalogue</a>
          </article>
        ))}
      </div>
    </section>
  )
}
