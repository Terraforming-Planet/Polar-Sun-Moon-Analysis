import { useEffect, useMemo, useState } from 'react'

import { normalizeEvidenceApiUrl } from './lib/evidenceApi'
import './research-satellite-image.css'

type ImageState = 'loading' | 'streamed' | 'direct' | 'error'

function streamedUrl(apiUrl: string, sourceUrl: string) {
  const endpoint = normalizeEvidenceApiUrl(apiUrl)
  if (!endpoint || !sourceUrl.startsWith('https://')) return sourceUrl
  if (sourceUrl.startsWith(`${endpoint}/research/image?`)) return sourceUrl
  return `${endpoint}/research/image?url=${encodeURIComponent(sourceUrl)}`
}

export function ResearchSatelliteImage({
  apiUrl,
  sourceUrl,
  alt,
  eager = false,
}: {
  apiUrl: string
  sourceUrl: string
  alt: string
  eager?: boolean
}) {
  const proxyUrl = useMemo(() => streamedUrl(apiUrl, sourceUrl), [apiUrl, sourceUrl])
  const [src, setSrc] = useState(proxyUrl)
  const [state, setState] = useState<ImageState>('loading')

  useEffect(() => {
    setSrc(proxyUrl)
    setState('loading')
  }, [proxyUrl])

  const handleError = () => {
    if (src !== sourceUrl) {
      setSrc(sourceUrl)
      setState('direct')
      return
    }
    setState('error')
  }

  if (state === 'error') {
    return <div className="research-satellite-image error" role="img" aria-label={`${alt} — image temporarily unavailable`}>
      <b>IMAGE TEMPORARILY UNAVAILABLE</b>
      <span>The official source did not return a browser-renderable image. Open the original source or try another date.</span>
    </div>
  }

  const streamed = proxyUrl !== sourceUrl && src === proxyUrl
  return <div className={`research-satellite-image ${state}`} data-delivery={streamed ? 'evidence-worker-stream' : 'direct-fallback'}>
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      crossOrigin={streamed ? 'anonymous' : undefined}
      onLoad={() => setState(streamed ? 'streamed' : 'direct')}
      onError={handleError}
    />
    {state === 'loading' && <span className="research-image-loading">Streaming official satellite image…</span>}
    {state === 'streamed' && <span className="research-image-delivery">EVIDENCE WORKER STREAM</span>}
    {state === 'direct' && <span className="research-image-delivery fallback">DIRECT SOURCE FALLBACK</span>}
  </div>
}
