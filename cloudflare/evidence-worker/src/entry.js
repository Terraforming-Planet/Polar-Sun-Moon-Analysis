import evidenceWorker from './index.js'
import { AREA_ANALYSIS_V2_PATH } from './areaAnalysisV2.js'
import { handleAreaAnalysisWithLandsatBrowse } from './areaAnalysisWithLandsatBrowse.js'
import { COMET_VISION_PATH, handleCometVision } from './cometVision.js'
import { ELEVATION_PATH, handleElevationProxy } from './elevationProxy.js'
import { GEOCODE_PATH, handleGeocodeProxy } from './geocodeProxy.js'
import { IMAGE_PROXY_PATH, handleSatelliteImageProxy } from './imageProxy.js'
import { LANDSAT_PROXY_PATH, handleLandsatProxy } from './landsatProxy.js'
import { RESEARCH_CHAT_PATH, handleResearchChat } from './researchChat.js'

export async function handleWorkerRequest(request, env = {}, context) {
  const url = new URL(request.url)
  if (url.pathname === GEOCODE_PATH) return handleGeocodeProxy(request, env)
  if (url.pathname === AREA_ANALYSIS_V2_PATH) return handleAreaAnalysisWithLandsatBrowse(request, env)
  if (url.pathname === IMAGE_PROXY_PATH) return handleSatelliteImageProxy(request, env)
  if (url.pathname === LANDSAT_PROXY_PATH) return handleLandsatProxy(request, env)
  if (url.pathname === ELEVATION_PATH) return handleElevationProxy(request, env)
  if (url.pathname === RESEARCH_CHAT_PATH) return handleResearchChat(request, env)
  if (url.pathname === COMET_VISION_PATH) return handleCometVision(request, env)
  return evidenceWorker.fetch(request, env, context)
}

export default {
  fetch(request, env, context) {
    return handleWorkerRequest(request, env, context)
  },
}
