export type AdapterStatus =
  | 'active-live'
  | 'active-analysis'
  | 'ready-public'
  | 'credential-gated'
  | 'registered'

export type AdapterCapability =
  | 'viewer'
  | 'catalog'
  | 'training'
  | 'near-real-time'
  | 'historical'
  | 'radar'
  | 'optical'
  | 'weather'
  | 'ocean'

export type EarthObservationAdapter = {
  id: string
  agency: string
  region: string
  missions: string[]
  endpoint: string
  docs: string
  access: 'public' | 'public-discovery' | 'account' | 'licence-dependent'
  status: AdapterStatus
  capabilities: AdapterCapability[]
  note: string
}

export const EARTH_OBSERVATION_ADAPTERS: EarthObservationAdapter[] = [
  {
    id: 'nasa-gibs',
    agency: 'NASA Earthdata — Global Imagery Browse Services (GIBS)',
    region: 'Global',
    missions: ['VIIRS', 'MODIS', 'GOES imagery distributed by NASA', 'Himawari imagery distributed by NASA'],
    endpoint: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi',
    docs: 'https://www.earthdata.nasa.gov/data/tools/gibs',
    access: 'public',
    status: 'active-live',
    capabilities: ['viewer', 'training', 'near-real-time', 'historical', 'optical', 'weather'],
    note: 'Primary tiled near-real-time imagery adapter. It is used directly by the Cesium viewer and by the dataset harvester without browser secrets.',
  },
  {
    id: 'noaa-goes-via-gibs',
    agency: 'NOAA GOES — distributed through NASA GIBS',
    region: 'Americas / Atlantic / Pacific',
    missions: ['GOES-East ABI', 'GOES-West ABI'],
    endpoint: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi',
    docs: 'https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/',
    access: 'public',
    status: 'active-live',
    capabilities: ['viewer', 'near-real-time', 'weather', 'optical'],
    note: 'Sub-daily geostationary GeoColor and infrared layers. The viewer keeps source boundaries visible instead of inventing missing coverage.',
  },
  {
    id: 'copernicus-sentinel-hub-ogc',
    agency: 'Copernicus Data Space Ecosystem — Sentinel Hub OGC',
    region: 'Global',
    missions: ['Sentinel-1', 'Sentinel-2', 'Sentinel-3'],
    endpoint: 'https://sh.dataspace.copernicus.eu/ogc/wms/<INSTANCE_ID>',
    docs: 'https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/OGC/WMS.html',
    access: 'account',
    status: 'active-live',
    capabilities: ['viewer', 'training', 'historical', 'radar', 'optical', 'ocean'],
    note: 'High-detail WMS/WMTS adapter. Public GitHub Pages contains no secret; only a non-secret instance identifier and configured layer names may be exposed.',
  },
  {
    id: 'copernicus-stac',
    agency: 'Copernicus Data Space Ecosystem — STAC',
    region: 'Global',
    missions: ['Sentinel-1 GRD', 'Sentinel-2 L2A', 'Sentinel-3 OLCI', 'Sentinel-5P'],
    endpoint: 'https://stac.dataspace.copernicus.eu/v1/search',
    docs: 'https://documentation.dataspace.copernicus.eu/APIs/STAC.html',
    access: 'public-discovery',
    status: 'active-analysis',
    capabilities: ['catalog', 'training', 'historical', 'radar', 'optical', 'ocean'],
    note: 'Scene-level discovery preserves product ID, acquisition time, footprint and provenance for AI analysis.',
  },
  {
    id: 'usgs-landsat',
    agency: 'USGS / NASA Landsat Collection 2',
    region: 'Global',
    missions: ['Landsat 5', 'Landsat 7', 'Landsat 8', 'Landsat 9'],
    endpoint: 'https://landsatlook.usgs.gov/stac-server/search',
    docs: 'https://www.usgs.gov/landsat-missions/landsat-collection-2',
    access: 'public',
    status: 'active-analysis',
    capabilities: ['catalog', 'training', 'historical', 'optical'],
    note: 'Historical backbone for long time series. The pipeline retries transient 5xx errors and never treats a failed endpoint as missing environmental data.',
  },
  {
    id: 'nasa-cmr-stac',
    agency: 'NASA Common Metadata Repository / CMR-STAC',
    region: 'Global',
    missions: ['MODIS', 'VIIRS', 'ICESat-2', 'GEDI', 'ECOSTRESS', 'SMAP', 'GPM'],
    endpoint: 'https://cmr.earthdata.nasa.gov/stac/',
    docs: 'https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/cmr',
    access: 'public-discovery',
    status: 'ready-public',
    capabilities: ['catalog', 'training', 'historical', 'optical'],
    note: 'Discovery is public; many full-resolution downloads require Earthdata Login. The adapter is kept server-side so no credentials can leak to Pages.',
  },
  {
    id: 'eumetview',
    agency: 'EUMETSAT — EUMETView',
    region: 'Europe / Africa / Atlantic / Indian Ocean',
    missions: ['Meteosat', 'Metop', 'Sentinel-3 products'],
    endpoint: 'https://view.eumetsat.int/geoserver/wms',
    docs: 'https://user.eumetsat.int/resources/user-guides/eumet-view-user-guide',
    access: 'public',
    status: 'ready-public',
    capabilities: ['viewer', 'near-real-time', 'weather', 'ocean'],
    note: 'Public OGC WMS with near-real-time imagery. A specific public layer name is configured before activation in the 3D viewer; no download token is needed for visualisation.',
  },
  {
    id: 'eumetsat-data-store',
    agency: 'EUMETSAT — Data Store',
    region: 'Global mission coverage',
    missions: ['Meteosat', 'Metop', 'Sentinel-3 marine products'],
    endpoint: 'https://api.eumetsat.int/data/browse/collections',
    docs: 'https://user.eumetsat.int/resources/user-guides/data-store-detailed-guide',
    access: 'public-discovery',
    status: 'ready-public',
    capabilities: ['catalog', 'training', 'historical', 'weather', 'ocean'],
    note: 'Catalogue search is public. Product downloads require a time-limited token and therefore remain a server/Jupyter adapter only.',
  },
  {
    id: 'digital-earth-australia',
    agency: 'Geoscience Australia — Digital Earth Australia',
    region: 'Australia',
    missions: ['Landsat 5/7/8/9', 'Sentinel-2A/B/C'],
    endpoint: 'https://explorer.dea.ga.gov.au/stac/search',
    docs: 'https://docs.dea.ga.gov.au/notebooks/How_to_guides/Downloading_data_with_STAC/',
    access: 'public',
    status: 'active-analysis',
    capabilities: ['catalog', 'training', 'historical', 'optical'],
    note: 'Public STAC and cloud-hosted analysis-ready products provide an independent Australian source for training and validation.',
  },
  {
    id: 'inpe-brazil-data-cube',
    agency: 'INPE — Brazil Data Cube STAC',
    region: 'Brazil / South America',
    missions: ['Amazonia-1 WFI', 'CBERS-4', 'CBERS-4A'],
    endpoint: 'https://data.inpe.br/bdc/stac/v1/search',
    docs: 'https://data.inpe.br/bdc/stac/v1/docs',
    access: 'public',
    status: 'active-analysis',
    capabilities: ['catalog', 'training', 'historical', 'optical'],
    note: 'Public STAC exposes original/analysis-ready Brazilian imagery and thumbnails, adding independent tropical and South American coverage.',
  },
  {
    id: 'canada-eodms',
    agency: 'Natural Resources Canada / CSA — EODMS',
    region: 'Canada / selected global coverage',
    missions: ['RADARSAT Constellation Mission', 'RADARSAT-2'],
    endpoint: 'https://api.eodms-sgdot.nrcan-rncan.gc.ca/',
    docs: 'https://www.eodms-sgdot.nrcan-rncan.gc.ca/',
    access: 'licence-dependent',
    status: 'credential-gated',
    capabilities: ['catalog', 'training', 'historical', 'radar'],
    note: 'Adapter contract is registered, but automated product use remains disabled until account/licence terms permit it.',
  },
  {
    id: 'jaxa-gportal',
    agency: 'JAXA G-Portal',
    region: 'Global mission coverage',
    missions: ['ALOS', 'ALOS-2', 'GCOM-C', 'GCOM-W', 'GOSAT'],
    endpoint: 'https://gportal.jaxa.jp/gpr/?lang=en',
    docs: 'https://gportal.jaxa.jp/gpr/?lang=en',
    access: 'account',
    status: 'credential-gated',
    capabilities: ['catalog', 'training', 'historical', 'radar', 'optical', 'ocean'],
    note: 'Planned server-side adapter. It is intentionally not called from the public browser because provider authentication is required.',
  },
  {
    id: 'isro-bhoonidhi',
    agency: 'ISRO / NRSC Bhoonidhi',
    region: 'India / selected global coverage',
    missions: ['Resourcesat', 'Cartosat', 'EOS-04 SAR', 'EOS-06 Oceansat'],
    endpoint: 'https://bhoonidhi.nrsc.gov.in/bhoonidhi-api/',
    docs: 'https://bhoonidhi.nrsc.gov.in/bhoonidhi/home.html',
    access: 'account',
    status: 'credential-gated',
    capabilities: ['catalog', 'training', 'historical', 'radar', 'optical', 'ocean'],
    note: 'Planned server-side adapter with provider authentication and licence checks. No token is stored in the static site.',
  },
]

export const LIVE_VIEWER_ADAPTERS = EARTH_OBSERVATION_ADAPTERS.filter(adapter =>
  adapter.capabilities.includes('viewer'),
)

export const AI_ANALYSIS_ADAPTERS = EARTH_OBSERVATION_ADAPTERS.filter(adapter =>
  adapter.capabilities.includes('training') || adapter.capabilities.includes('catalog'),
)
