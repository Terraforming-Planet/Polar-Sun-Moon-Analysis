import evidenceWorker from './index.js'
import { LANDSAT_PROXY_PATH, handleLandsatProxy } from './landsatProxy.js'

export async function handleWorkerRequest(request, env = {}, context) {
  const url = new URL(request.url)
  if (url.pathname === LANDSAT_PROXY_PATH) return handleLandsatProxy(request, env)
  return evidenceWorker.fetch(request, env, context)
}

export default {
  fetch(request, env, context) {
    return handleWorkerRequest(request, env, context)
  },
}
