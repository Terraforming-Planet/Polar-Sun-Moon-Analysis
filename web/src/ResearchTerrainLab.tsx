import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'

import { RealisticEarthGlobe } from './RealisticEarthGlobe'
import { fetchResearchElevations, type ElevationDataset, type ElevationPoint } from './lib/evidenceApi'
import {
  applyViewerImageEvent,
  createViewerState,
  markViewerFallbackError,
  orientRiverCandidate,
  sampleRiverLine,
  selectMainMediumNaturalEarthRivers,
  selectMainMediumOsmRivers,
  viewerPhaseLabel,
  type DirectedRiver,
  type RiverBounds,
  type RiverCandidate,
} from './lib/terrainLabViewer'
import './research-terrain-lab.css'

export type ResearchLabPlace = {
  label: string
  latitude: number
  longitude: number
}

type Flag = {
  id: string
  number: number
  latitude: number
  longitude: number
  label: string
  color: string
  elevation?: ElevationPoint
}

type DrawPoint = { latitude: number; longitude: number }
type DrawPath = { id: string; color: string; points: DrawPoint[] }
type Tool = 'flag' | 'line'
type ImagerySource = 'sentinel2' | 'viirs' | 'modis'
type ImageQuality = 1024 | 2048
type RiverLoadStatus = 'off' | 'loading' | 'ready' | 'error'

type Profile = {
  pathId: string
  color: string
  points: ElevationPoint[]
  dataset: ElevationDataset
}

type ImageryCandidate = {
  source: ImagerySource
  url: string
  fallback: boolean
}

const STORAGE_KEY = 'terra-research-terrain-lab/v1'
const DRAW_COLORS = ['#ff2c2c', '#ffd91a', '#1dea50', '#245dff', '#ff20df', '#ffffff', '#121820']
const CDSE_INSTANCE = import.meta.env.VITE_CDSE_INSTANCE_ID || 'd708f736-b553-4328-9b5e-39bdb444790c'
const CDSE_WMS = `https://sh.dataspace.copernicus.eu/ogc/wms/${CDSE_INSTANCE}`
const CDSE_TRUE_COLOR_LAYER = import.meta.env.VITE_CDSE_TRUE_COLOR_LAYER || import.meta.env.VITE_CDSE_LAYER || 'NATURAL-COLOR'
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const NATURAL_EARTH_RIVERS_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson'
const IMAGE_ATTEMPT_TIMEOUT_MS = 10_000
const RIVER_REQUEST_TIMEOUT_MS = 15_000

const NILE_REFERENCE_FLAGS: Array<Omit<Flag, 'id' | 'number' | 'elevation'>> = [
  { latitude: 12.0, longitude: 37.25, label: 'Lake Tana — reference point for the Blue Nile source region', color: '#2ca8ff' },
  { latitude: 11.55, longitude: 37.6, label: 'Ethiopian Highlands — reference point for the upper Blue Nile basin', color: '#2ca8ff' },
  { latitude: 15.6031, longitude: 32.5265, label: 'Khartoum — White Nile / Blue Nile confluence region', color: '#f4c64e' },
]

function boundsForMap(place: ResearchLabPlace, radiusKm = 25) {
  const latDelta = Math.max(0.08, radiusKm / 111.32)
  const lonScale = Math.max(0.2, Math.cos(place.latitude * Math.PI / 180))
  const lonDelta = Math.max(0.08, radiusKm / (111.32 * lonScale))
  return {
    west: Math.max(-180, place.longitude - lonDelta),
    south: Math.max(-90, place.latitude - latDelta),
    east: Math.min(180, place.longitude + lonDelta),
    north: Math.min(90, place.latitude + latDelta),
  }
}

function imageDimensions(place: ResearchLabPlace, maxDimension: number, radiusKm = 25) {
  const bounds = boundsForMap(place, radiusKm)
  const lonSpan = Math.max(0.0001, bounds.east - bounds.west)
  const latSpan = Math.max(0.0001, bounds.north - bounds.south)
  const aspect = Math.max(0.35, Math.min(2.85, lonSpan / latSpan))
  if (aspect >= 1) return { width: maxDimension, height: Math.max(512, Math.round(maxDimension / aspect)) }
  return { width: Math.max(512, Math.round(maxDimension * aspect)), height: maxDimension }
}

function dateDaysBefore(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(parsed.getTime())) return date
  parsed.setUTCDate(parsed.getUTCDate() - days)
  return parsed.toISOString().slice(0, 10)
}

function gibsUrl(place: ResearchLabPlace, date: string, layer: string, maxDimension: number, radiusKm = 25) {
  const bounds = boundsForMap(place, radiusKm)
  const dimensions = imageDimensions(place, maxDimension, radiusKm)
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.1.1',
    LAYERS: layer,
    STYLES: '',
    FORMAT: 'image/jpeg',
    TRANSPARENT: 'FALSE',
    SRS: 'EPSG:4326',
    BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    WIDTH: String(dimensions.width),
    HEIGHT: String(dimensions.height),
    TIME: date,
  })
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`
}

function copernicusUrl(place: ResearchLabPlace, date: string, maxDimension: number, radiusKm = 25) {
  const bounds = boundsForMap(place, radiusKm)
  const dimensions = imageDimensions(place, maxDimension, radiusKm)
  const start = dateDaysBefore(date, 14)
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.1.1',
    LAYERS: CDSE_TRUE_COLOR_LAYER,
    STYLES: '',
    FORMAT: 'image/jpeg',
    TRANSPARENT: 'FALSE',
    SRS: 'EPSG:4326',
    BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    WIDTH: String(dimensions.width),
    HEIGHT: String(dimensions.height),
    TIME: `${start}/${date}`,
    MAXCC: '35',
    SHOWLOGO: 'false',
  })
  return `${CDSE_WMS}?${params.toString()}`
}

function imageryUrl(source: ImagerySource, place: ResearchLabPlace, date: string, size: number) {
  if (source === 'sentinel2') return copernicusUrl(place, date, size)
  if (source === 'modis') return gibsUrl(place, date, 'MODIS_Terra_CorrectedReflectance_TrueColor', size)
  return gibsUrl(place, date, 'VIIRS_SNPP_CorrectedReflectance_TrueColor', size)
}

function imageryCandidates(
  source: ImagerySource,
  place: ResearchLabPlace,
  date: string,
  size: number,
): ImageryCandidate[] {
  const order: ImagerySource[] = source === 'sentinel2'
    ? ['sentinel2', 'viirs', 'modis']
    : source === 'viirs'
      ? ['viirs', 'modis']
      : ['modis', 'viirs']
  return order.map((candidateSource, index) => ({
    source: candidateSource,
    url: imageryUrl(candidateSource, place, date, size),
    fallback: index > 0,
  }))
}

function sourceLabel(source: ImagerySource) {
  if (source === 'sentinel2') return 'Copernicus Sentinel-2 L2A · true colour · 10 m bands where available'
  if (source === 'modis') return 'NASA GIBS · Terra MODIS Corrected Reflectance · historical continuity'
  return 'NASA GIBS · Suomi NPP VIIRS Corrected Reflectance · recent daily global imagery'
}

function sourceLimit(source: ImagerySource, date: string) {
  if (source === 'sentinel2') return `WMS searches the ${dateDaysBefore(date, 14)} → ${date} window with cloud limit 35%; optical coverage depends on revisit and clouds.`
  if (source === 'modis') return 'MODIS has lower spatial resolution than Sentinel-2 but provides a long daily record useful for historical comparison.'
  return 'VIIRS is a daily global visualization; it is much coarser than Sentinel-2 and must not be treated as 10 m imagery.'
}

function yesterdayUtc() {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function flagPosition(flag: DrawPoint, bounds: ReturnType<typeof boundsForMap>) {
  return {
    left: `${((flag.longitude - bounds.west) / Math.max(1e-9, bounds.east - bounds.west)) * 100}%`,
    top: `${((bounds.north - flag.latitude) / Math.max(1e-9, bounds.north - bounds.south)) * 100}%`,
  }
}

function pointFromClick(event: ReactMouseEvent<HTMLDivElement>, bounds: ReturnType<typeof boundsForMap>) {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)))
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height)))
  return {
    longitude: bounds.west + x * (bounds.east - bounds.west),
    latitude: bounds.north - y * (bounds.north - bounds.south),
  }
}

function haversineKm(a: DrawPoint, b: DrawPoint) {
  const r = 6371.0088
  const toRad = (value: number) => value * Math.PI / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)))
}

function samplePath(points: DrawPoint[], count = 20) {
  if (points.length < 2) return []
  const lengths = points.slice(1).map((point, index) => haversineKm(points[index], point))
  const total = lengths.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return []
  const samples: DrawPoint[] = []
  for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
    const target = (total * sampleIndex) / (count - 1)
    let travelled = 0
    let segmentIndex = 0
    while (segmentIndex < lengths.length - 1 && travelled + lengths[segmentIndex] < target) {
      travelled += lengths[segmentIndex]
      segmentIndex += 1
    }
    const segmentLength = Math.max(1e-9, lengths[segmentIndex])
    const fraction = Math.min(1, Math.max(0, (target - travelled) / segmentLength))
    const start = points[segmentIndex]
    const end = points[segmentIndex + 1]
    samples.push({
      latitude: start.latitude + (end.latitude - start.latitude) * fraction,
      longitude: start.longitude + (end.longitude - start.longitude) * fraction,
    })
  }
  return samples
}

function profilePolyline(points: ElevationPoint[]) {
  if (!points.length) return ''
  const values = points.map(point => point.elevation_m)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)
  return points.map((point, index) => {
    const x = 24 + (index / Math.max(1, points.length - 1)) * 672
    const y = 180 - ((point.elevation_m - min) / range) * 140
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

function fallbackMapUrl(place: ResearchLabPlace) {
  const params = new URLSearchParams({
    lat: String(place.latitude),
    lon: String(place.longitude),
    radius: '25',
    label: place.label,
    mode: 'hydrology',
  })
  return `${import.meta.env.BASE_URL}river-helper-map/index.html?${params.toString()}`
}

function overlayPoint(point: DrawPoint, bounds: ReturnType<typeof boundsForMap>) {
  return {
    x: ((point.longitude - bounds.west) / Math.max(1e-9, bounds.east - bounds.west)) * 1000,
    y: ((bounds.north - point.latitude) / Math.max(1e-9, bounds.north - bounds.south)) * 1000,
  }
}

function overpassQuery(bounds: RiverBounds) {
  return `[out:json][timeout:12];way["waterway"="river"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});out tags geom;`
}

function isAbortError(reason: unknown) {
  return reason instanceof DOMException && reason.name === 'AbortError'
}

async function fetchOsmRivers(bounds: RiverBounds, signal: AbortSignal) {
  const url = `${OVERPASS_URL}?data=${encodeURIComponent(overpassQuery(bounds))}`
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error(`OpenStreetMap Overpass HTTP ${response.status}`)
  const payload = await response.json()
  return selectMainMediumOsmRivers(payload)
}

async function fetchNaturalEarthRivers(bounds: RiverBounds, signal: AbortSignal) {
  const response = await fetch(NATURAL_EARTH_RIVERS_URL, {
    headers: { Accept: 'application/geo+json,application/json' },
    cache: 'force-cache',
    signal,
  })
  if (!response.ok) throw new Error(`Natural Earth HTTP ${response.status}`)
  const payload = await response.json()
  return selectMainMediumNaturalEarthRivers(payload, bounds)
}

async function fetchRiverCandidates(bounds: RiverBounds, signal: AbortSignal) {
  try {
    const osm = await fetchOsmRivers(bounds, signal)
    if (osm.length) return { candidates: osm, provider: 'OpenStreetMap waterway=river topology' }
  } catch (reason) {
    if (isAbortError(reason) || signal.aborted) throw reason
  }
  const naturalEarth = await fetchNaturalEarthRivers(bounds, signal)
  return { candidates: naturalEarth, provider: 'Natural Earth 1:50m major rivers' }
}

function directedRiverSamples(candidates: RiverCandidate[]) {
  return candidates.map(candidate => sampleRiverLine(candidate.points, 3))
}

function directionStatusMessage(rivers: DirectedRiver[], provider: string) {
  const demCount = rivers.filter(river => river.directionSource === 'dem').length
  const topologyCount = rivers.filter(river => river.directionSource === 'topology').length
  return `${rivers.length} main/medium river segments · ${demCount} directed by Copernicus DEM slope · ${topologyCount} by public waterway topology · geometry: ${provider}.`
}

export function ResearchTerrainLab({ apiUrl, place, satelliteDate }: {
  apiUrl: string
  place: ResearchLabPlace
  satelliteDate?: string
}) {
  const [tool, setTool] = useState<Tool>('flag')
  const [color, setColor] = useState(DRAW_COLORS[0])
  const [flags, setFlags] = useState<Flag[]>([])
  const [paths, setPaths] = useState<DrawPath[]>([])
  const [activePath, setActivePath] = useState<DrawPoint[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [status, setStatus] = useState('')
  const [imagerySource, setImagerySource] = useState<ImagerySource>('sentinel2')
  const [quality, setQuality] = useState<ImageQuality>(() => typeof window !== 'undefined' && window.innerWidth <= 700 ? 1024 : 2048)
  const [showRiverFlowArrows, setShowRiverFlowArrows] = useState(true)
  const [rivers, setRivers] = useState<DirectedRiver[]>([])
  const [riverLoadStatus, setRiverLoadStatus] = useState<RiverLoadStatus>('loading')
  const [riverStatusMessage, setRiverStatusMessage] = useState('Loading main and medium river geometry…')
  const [layoutRevision, setLayoutRevision] = useState(0)
  const [fallbackMapLoaded, setFallbackMapLoaded] = useState(false)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const riverRequestVersion = useRef(0)

  const date = satelliteDate ?? yesterdayUtc()
  const bounds = useMemo(() => boundsForMap(place, 25), [place])
  const dimensions = useMemo(() => imageDimensions(place, quality), [place, quality])
  const candidates = useMemo(
    () => imageryCandidates(imagerySource, place, date, quality),
    [imagerySource, place, date, quality],
  )
  const imageryRequestKey = useMemo(
    () => [imagerySource, place.latitude, place.longitude, date, quality].join('|'),
    [imagerySource, place.latitude, place.longitude, date, quality],
  )
  const [viewer, setViewer] = useState(() => createViewerState(imageryRequestKey))
  const currentViewer = viewer.requestKey === imageryRequestKey
    ? viewer
    : createViewerState(imageryRequestKey)
  const activeCandidate = candidates[currentViewer.candidateIndex] ?? candidates[0]
  const fullUrl = useMemo(
    () => imageryUrl(imagerySource, place, date, 4096),
    [imagerySource, place, date],
  )
  const baseFallbackUrl = useMemo(() => fallbackMapUrl(place), [place])

  useEffect(() => {
    setViewer(current => current.requestKey === imageryRequestKey
      ? current
      : createViewerState(imageryRequestKey))
  }, [imageryRequestKey])

  useEffect(() => {
    setFallbackMapLoaded(false)
  }, [baseFallbackUrl])

  useEffect(() => {
    if (viewer.requestKey !== imageryRequestKey || viewer.phase !== 'loading') return
    const requestKey = viewer.requestKey
    const candidateIndex = viewer.candidateIndex
    const timer = window.setTimeout(() => {
      setViewer(current => applyViewerImageEvent(current, {
        type: 'failed',
        requestKey,
        candidateIndex,
      }, candidates.length))
    }, IMAGE_ATTEMPT_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [viewer, imageryRequestKey, candidates.length])

  useEffect(() => {
    const node = mapRef.current
    if (!node) return
    let animationFrame = 0
    const refreshSize = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        if (node.clientWidth <= 0 || node.clientHeight <= 0) return
        setLayoutRevision(value => value + 1)
        const fallbackFrame = node.querySelector<HTMLIFrameElement>('.terrain-fallback-map')
        try {
          fallbackFrame?.contentWindow?.dispatchEvent(new Event('resize'))
        } catch {
          // The local fallback document remains usable even if a browser blocks resize dispatch.
        }
      })
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refreshSize) : null
    observer?.observe(node)
    window.addEventListener('resize', refreshSize)
    document.addEventListener('toggle', refreshSize, true)
    refreshSize()
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', refreshSize)
      document.removeEventListener('toggle', refreshSize, true)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    const requestVersion = riverRequestVersion.current + 1
    riverRequestVersion.current = requestVersion
    const controller = new AbortController()
    let timedOut = false

    if (!showRiverFlowArrows) {
      setRivers([])
      setRiverLoadStatus('off')
      setRiverStatusMessage('River flow arrows are hidden.')
      return () => {
        disposed = true
        controller.abort()
      }
    }

    setRiverLoadStatus('loading')
    setRiverStatusMessage('Loading main and medium rivers and validating downstream direction…')
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, RIVER_REQUEST_TIMEOUT_MS)

    const load = async () => {
      try {
        const { candidates: riverCandidates, provider } = await fetchRiverCandidates(bounds, controller.signal)
        if (disposed || requestVersion !== riverRequestVersion.current) return
        if (!riverCandidates.length) {
          setRivers([])
          setRiverLoadStatus('ready')
          setRiverStatusMessage('No main/medium river geometry was returned for this 25 km AOI.')
          return
        }

        const sampleGroups = directedRiverSamples(riverCandidates)
        const elevationRequests = sampleGroups.flatMap((samples, riverIndex) => samples.map((point, sampleIndex) => ({
          latitude: point.latitude,
          longitude: point.longitude,
          label: `River ${riverIndex + 1} direction sample ${sampleIndex + 1}`,
        })))

        let directed: DirectedRiver[] = []
        try {
          const elevationResponse = await fetchResearchElevations(apiUrl, elevationRequests, controller.signal)
          if (disposed || requestVersion !== riverRequestVersion.current) return
          let offset = 0
          directed = riverCandidates
            .map((candidate, index) => {
              const count = sampleGroups[index].length
              const elevations = elevationResponse.points
                .slice(offset, offset + count)
                .map(point => point.elevation_m)
              offset += count
              return orientRiverCandidate(candidate, elevations)
            })
            .filter((river): river is DirectedRiver => river !== null)
        } catch (reason) {
          if (isAbortError(reason) || controller.signal.aborted) throw reason
          directed = riverCandidates
            .map(candidate => orientRiverCandidate(candidate, []))
            .filter((river): river is DirectedRiver => river !== null)
        }

        if (disposed || requestVersion !== riverRequestVersion.current) return
        setRivers(directed)
        if (directed.length) {
          setRiverLoadStatus('ready')
          setRiverStatusMessage(directionStatusMessage(directed, provider))
        } else {
          setRiverLoadStatus('error')
          setRiverStatusMessage('River geometry was found, but no defensible downstream direction was available. No random arrows were drawn.')
        }
      } catch (reason) {
        if (disposed || requestVersion !== riverRequestVersion.current) return
        setRivers([])
        setRiverLoadStatus('error')
        if (timedOut) {
          setRiverStatusMessage('River direction lookup timed out. The viewer remains usable; no unverified arrows were drawn.')
        } else if (!isAbortError(reason)) {
          setRiverStatusMessage(reason instanceof Error ? reason.message : String(reason))
        }
      } finally {
        window.clearTimeout(timeout)
      }
    }

    void load()
    return () => {
      disposed = true
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [apiUrl, bounds.east, bounds.north, bounds.south, bounds.west, showRiverFlowArrows])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { flags?: Flag[]; paths?: DrawPath[] }
      if (Array.isArray(saved.flags)) setFlags(saved.flags)
      if (Array.isArray(saved.paths)) setPaths(saved.paths)
    } catch {
      // Corrupt local drafts are ignored; official measurements are always refetched on demand.
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ flags, paths }))
  }, [flags, paths])

  const addFlag = async (point: DrawPoint, label = '') => {
    const number = flags.reduce((max, item) => Math.max(max, item.number), 0) + 1
    const provisional: Flag = {
      id: crypto.randomUUID(),
      number,
      latitude: point.latitude,
      longitude: point.longitude,
      label: label || `Point ${number}`,
      color,
    }
    setFlags(current => [...current, provisional])
    setStatus(`Retrieving elevation for flag ${number}…`)
    try {
      const response = await fetchResearchElevations(apiUrl, [{ ...point, label: provisional.label }])
      setFlags(current => current.map(item => item.id === provisional.id ? { ...item, elevation: response.points[0] } : item))
      setStatus(`Flag ${number}: ${Math.round(response.points[0].elevation_m)} m a.s.l. · ${response.dataset.name}`)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const handleMapClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const point = pointFromClick(event, bounds)
    if (tool === 'flag') void addFlag(point)
    else setActivePath(current => [...current, point])
  }

  const finishPath = () => {
    if (activePath.length < 2) {
      setStatus('A line requires at least two points.')
      return
    }
    const path: DrawPath = { id: crypto.randomUUID(), color, points: activePath }
    setPaths(current => [...current, path])
    setActivePath([])
    setStatus('Line saved. You can now generate a 20-sample DEM profile.')
  }

  const buildProfile = async (path: DrawPath) => {
    const samples = samplePath(path.points, 20)
    if (!samples.length) return
    setStatus('Retrieving 20 DEM samples along the line…')
    try {
      const response = await fetchResearchElevations(apiUrl, samples.map((point, index) => ({ ...point, label: `Profile ${index + 1}` })))
      setProfile({ pathId: path.id, color: path.color, points: response.points, dataset: response.dataset })
      setStatus(`Profile ready: 20 samples · ${response.dataset.name} · nominal resolution ${response.dataset.nominal_horizontal_resolution_m} m.`)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const addNileReferences = async () => {
    const nextNumber = flags.reduce((max, item) => Math.max(max, item.number), 0) + 1
    setStatus('Adding three Nile reference points and retrieving their DEM elevations…')
    try {
      const response = await fetchResearchElevations(apiUrl, NILE_REFERENCE_FLAGS.map(item => ({
        latitude: item.latitude,
        longitude: item.longitude,
        label: item.label,
      })))
      const additions = NILE_REFERENCE_FLAGS.map((item, index): Flag => ({
        id: crypto.randomUUID(),
        number: nextNumber + index,
        ...item,
        elevation: response.points[index],
      }))
      setFlags(current => [...current, ...additions])
      setStatus('Three Nile reference points were added. Elevations come from the DEM; locations are explicitly described as reference points.')
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const localFlags = flags.filter(flag => flag.longitude >= bounds.west && flag.longitude <= bounds.east && flag.latitude >= bounds.south && flag.latitude <= bounds.north)
  const globeMarkers = flags.map(flag => ({ longitude: flag.longitude, latitude: flag.latitude, color: flag.color === '#2ca8ff' ? 0x2ca8ff : 0xff2c2c, radius: 1.25 }))
  const visiblePaths = paths.filter(path => path.points.some(point => point.longitude >= bounds.west && point.longitude <= bounds.east && point.latitude >= bounds.south && point.latitude <= bounds.north))
  const viewerLabel = viewerPhaseLabel(currentViewer.phase)
  const viewerDetail = currentViewer.phase === 'loading'
    ? `Trying ${sourceLabel(activeCandidate.source)}. The reference base layer stays visible while this request is pending.`
    : currentViewer.phase === 'ready'
      ? sourceLabel(activeCandidate.source)
      : currentViewer.phase === 'fallback-ready'
        ? currentViewer.hasImagery
          ? `${sourceLabel(activeCandidate.source)} loaded after the selected source failed.`
          : fallbackMapLoaded
            ? 'Public reference base map is visible because imagery sources failed or timed out.'
            : 'Local non-black fallback canvas is visible while the public reference map finishes loading.'
        : 'Public fallback tiles could not be confirmed. The local reference canvas remains visible instead of a black panel.'

  return <section className="terrain-lab panel" aria-label="Terrain elevation and annotation laboratory">
    <div className="terrain-lab-head">
      <div><small>ADVANCED · DEM · FLAGS · PROFILES · HIGH-QUALITY IMAGERY</small><h2>Terrain laboratory</h2></div>
      <span className="evidence-badge observation">PROVENANCE VISIBLE</span>
    </div>
    <p className="muted">These are technical tools. The WMS request dimensions follow the AOI geometry so the image is not forced into an unrelated square. Sentinel-2 is attempted first; NASA VIIRS/MODIS remain available as stable global alternatives. DEM elevations are retrieved, not guessed.</p>

    <div className="terrain-imagery-controls">
      <div className="terrain-source-buttons" role="group" aria-label="Satellite imagery source">
        <button type="button" className={imagerySource === 'sentinel2' ? 'active' : ''} onClick={() => setImagerySource('sentinel2')}>Copernicus Sentinel-2 · highest detail</button>
        <button type="button" className={imagerySource === 'viirs' ? 'active' : ''} onClick={() => setImagerySource('viirs')}>NASA VIIRS · recent global</button>
        <button type="button" className={imagerySource === 'modis' ? 'active' : ''} onClick={() => setImagerySource('modis')}>NASA MODIS · historical</button>
      </div>
      <label>Image size<select value={quality} onChange={event => setQuality(Number(event.target.value) as ImageQuality)}><option value={1024}>up to 1024 px · faster</option><option value={2048}>up to 2048 px · more detail</option></select></label>
      <a className="button-link compact" href={fullUrl} target="_blank" rel="noreferrer">Open up to 4096 px</a>
    </div>
    <div className="terrain-source-note"><b>{sourceLabel(imagerySource)}</b><span>{sourceLimit(imagerySource, date)}</span></div>

    <div className="terrain-lab-toolbar">
      <button type="button" className={tool === 'flag' ? 'active' : ''} onClick={() => setTool('flag')}>⚑ Flag + elevation</button>
      <button type="button" className={tool === 'line' ? 'active' : ''} onClick={() => setTool('line')}>✎ Draw line</button>
      {tool === 'line' && <button type="button" onClick={finishPath} disabled={activePath.length < 2}>Finish line ({activePath.length})</button>}
      <button type="button" onClick={() => void addNileReferences()}>Add 3 Nile reference points</button>
      <button type="button" onClick={() => { setFlags([]); setPaths([]); setActivePath([]); setProfile(null); setStatus('Local annotations cleared.') }}>Clear</button>
      <label className="terrain-river-toggle"><input type="checkbox" checked={showRiverFlowArrows} onChange={event => setShowRiverFlowArrows(event.target.checked)} />Show river flow arrows</label>
      <div className="terrain-colors" aria-label="Annotation color">{DRAW_COLORS.map(value => <button key={value} type="button" className={color === value ? 'selected' : ''} style={{ background: value }} aria-label={`Color ${value}`} onClick={() => setColor(value)} />)}</div>
    </div>

    <div className="terrain-map-wrap">
      <div
        ref={mapRef}
        className="terrain-map"
        style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
        role="application"
        aria-label="Satellite map for adding flags"
        data-viewer-phase={currentViewer.phase}
        data-layout-revision={layoutRevision}
        onClick={handleMapClick}
      >
        <iframe
          key={baseFallbackUrl}
          className="terrain-fallback-map"
          src={baseFallbackUrl}
          title="Public hydrology reference fallback map"
          tabIndex={-1}
          aria-hidden="true"
          onLoad={() => setFallbackMapLoaded(true)}
          onError={() => setViewer(current => markViewerFallbackError(current, imageryRequestKey))}
        />
        {activeCandidate && <img
          key={`${imageryRequestKey}-${currentViewer.candidateIndex}`}
          className={currentViewer.hasImagery ? 'terrain-imagery loaded' : 'terrain-imagery'}
          src={activeCandidate.url}
          alt={`${sourceLabel(activeCandidate.source)} · ${place.label} · ${date}`}
          draggable={false}
          loading="eager"
          decoding="async"
          onLoad={() => setViewer(current => applyViewerImageEvent(current, {
            type: 'loaded',
            requestKey: imageryRequestKey,
            candidateIndex: currentViewer.candidateIndex,
          }, candidates.length))}
          onError={() => setViewer(current => applyViewerImageEvent(current, {
            type: 'failed',
            requestKey: imageryRequestKey,
            candidateIndex: currentViewer.candidateIndex,
          }, candidates.length))}
        />}
        <div className={`terrain-viewer-state ${currentViewer.phase}`} role="status" aria-live="polite">
          <b>{viewerLabel}</b><span>{viewerDetail}</span>
        </div>
        {showRiverFlowArrows && rivers.length > 0 && <svg className="terrain-river-flow-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Downstream river flow arrows">
          <defs><marker id="terrain-river-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="18" markerHeight="18" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ff2c2c" /></marker></defs>
          {rivers.map(river => {
            const arrowCount = Math.max(3, Math.min(9, Math.ceil(river.lengthKm / 2)))
            const points = sampleRiverLine(river.points, arrowCount).map(point => {
              const projected = overlayPoint(point, bounds)
              return `${projected.x},${projected.y}`
            }).join(' ')
            return <g key={river.id}><title>{river.name} · downstream direction from {river.directionSource === 'dem' ? 'Copernicus DEM slope' : 'OSM waterway topology'}</title><polyline points={points} fill="none" stroke="#ff2c2c" strokeWidth="3.5" strokeOpacity=".58" strokeLinecap="round" strokeLinejoin="round" markerMid="url(#terrain-river-arrow)" markerEnd="url(#terrain-river-arrow)" /></g>
          })}
        </svg>}
        <svg className="terrain-path-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          {visiblePaths.map(path => <polyline key={path.id} points={path.points.map(point => {
            const projected = overlayPoint(point, bounds)
            return `${projected.x},${projected.y}`
          }).join(' ')} fill="none" stroke={path.color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />)}
          {activePath.length > 0 && <polyline points={activePath.map(point => {
            const projected = overlayPoint(point, bounds)
            return `${projected.x},${projected.y}`
          }).join(' ')} fill="none" stroke={color} strokeWidth="7" strokeDasharray="12 8" strokeLinecap="round" />}
        </svg>
        {localFlags.map(flag => <button key={flag.id} type="button" className="terrain-flag" style={{ ...flagPosition(flag, bounds), '--flag-color': flag.color } as CSSProperties} title={`${flag.label}${flag.elevation ? ` · ${Math.round(flag.elevation.elevation_m)} m a.s.l.` : ''}`} onClick={event => event.stopPropagation()}><span>{flag.number}</span></button>)}
      </div>
      <div className="terrain-map-meta"><b>{currentViewer.hasImagery ? sourceLabel(activeCandidate.source) : 'Public fallback reference layer'} · request end {date} · {dimensions.width}×{dimensions.height} px</b><span>Preview AOI: 25 km · WGS84 · lines/flags are user annotations. Optical imagery is not live video; the view shows the latest available layer for the selected period.</span></div>
      <div className={`terrain-river-status ${riverLoadStatus}`}><b>River flow:</b><span>{riverStatusMessage}</span></div>
    </div>

    <details className="terrain-globe-preview">
      <summary><b>🌍 Open technical 3D Earth</b><span>rotate, zoom and switch official NASA / Copernicus layers</span></summary>
      <RealisticEarthGlobe selectedTime={`${date}T12:00:00Z`} markers={globeMarkers.length ? globeMarkers : [{ longitude: place.longitude, latitude: place.latitude, color: 0x35cfff, radius: 1.3 }]} />
    </details>

    {status && <p className="terrain-status" role="status">{status}</p>}

    <div className="terrain-flags-table">
      <div className="terrain-section-title"><h3>Measurement flags ({flags.length})</h3><small>clicked points + explicit elevation source</small></div>
      {flags.length ? <div className="terrain-table-scroll"><table><thead><tr><th>#</th><th>Name</th><th>WGS84</th><th>Elevation</th><th>Source / limitation</th></tr></thead><tbody>{flags.map(flag => <tr key={flag.id}><td><span className="table-flag" style={{ background: flag.color }}>{flag.number}</span></td><td>{flag.label}</td><td>{flag.latitude.toFixed(5)}, {flag.longitude.toFixed(5)}</td><td>{flag.elevation ? `${Math.round(flag.elevation.elevation_m)} m` : 'loading / unavailable'}</td><td>{flag.elevation ? `Copernicus DEM GLO-90 · ${flag.elevation.sample_method} · cell ~${flag.elevation.nominal_cell_size_m} m` : '—'}</td></tr>)}</tbody></table></div> : <p className="muted">No flags have been added yet.</p>}
    </div>

    {paths.length > 0 && <div className="terrain-profiles-list">
      <div className="terrain-section-title"><h3>Drawn lines ({paths.length})</h3><small>retrieve 20 DEM samples from any line</small></div>
      {paths.map((path, index) => <button type="button" key={path.id} onClick={() => void buildProfile(path)}><i style={{ background: path.color }} />Line {index + 1} · {path.points.length} nodes → 20-point profile</button>)}
    </div>}

    {profile && <section className="terrain-profile">
      <div className="terrain-section-title"><h3>Elevation profile — 20 samples</h3><small>{profile.dataset.name} · nominal resolution {profile.dataset.nominal_horizontal_resolution_m} m</small></div>
      <svg viewBox="0 0 720 210" role="img" aria-label="Terrain elevation chart"><line x1="24" y1="180" x2="696" y2="180" stroke="currentColor" opacity=".35"/><polyline points={profilePolyline(profile.points)} fill="none" stroke={profile.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{profile.points.map((point, index) => {
        const values = profile.points.map(item => item.elevation_m)
        const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(1, max - min)
        const x = 24 + (index / Math.max(1, profile.points.length - 1)) * 672
        const y = 180 - ((point.elevation_m - min) / range) * 140
        return <circle key={`${point.latitude}-${point.longitude}-${index}`} cx={x} cy={y} r="4" fill={profile.color}><title>{index + 1}: {Math.round(point.elevation_m)} m</title></circle>
      })}</svg>
      <div className="terrain-profile-stats"><span>min <b>{Math.round(Math.min(...profile.points.map(point => point.elevation_m)))} m</b></span><span>max <b>{Math.round(Math.max(...profile.points.map(point => point.elevation_m)))} m</b></span><span>samples <b>{profile.points.length}</b></span></div>
      <p className="muted">The profile displays DEM raster samples. We do not invent an artificially exact measurement between points. On steep slopes, real elevation may vary significantly within one DEM cell.</p>
    </section>}
  </section>
}
