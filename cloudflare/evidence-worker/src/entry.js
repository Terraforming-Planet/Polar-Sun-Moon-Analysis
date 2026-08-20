import evidenceWorker from './index.js'
import { AREA_ANALYSIS_PATH, handleAreaAnalysis } from './areaAnalysis.js'
import { GEOCODE_PATH, handleGeocodeProxy } from './geocodeProxy.js'
import { LANDSAT_PROXY_PATH, handleLandsatProxy } from './landsatProxy.js'

export async function handleWorkerRequest(request, env = {}, context) {
  const url = new URL(request.url)
  if (url.pathname === GEOCODE_PATH) return handleGeocodeProxy(request, env)
  if (url.pathname === AREA_ANALYSIS_PATH) return handleAreaAnalysis(request, env)
  if (url.pathname === LANDSAT_PROXY_PATH) return handleLandsatProxy(request, env)
  return evidenceWorker.fetch(request, env, context)
}

export default {
  fetch(request, env, context) {
    return handleWorkerRequest(request, env, context)
  },
}
