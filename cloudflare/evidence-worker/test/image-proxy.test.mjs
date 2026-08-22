import assert from 'node:assert/strict'
import test from 'node:test'

import { handleSatelliteImageProxy, parseSatelliteImageUrl } from '../src/imageProxy.js'

const allowedOrigin = 'https://terraforming-planet.github.io'

test('allows only the official image hosts used by the research gallery', () => {
  assert.equal(parseSatelliteImageUrl('https://landsatlook.usgs.gov/example.jpg').hostname, 'landsatlook.usgs.gov')
  assert.equal(parseSatelliteImageUrl('https://gibs.earthdata.nasa.gov/wms/example.jpg').hostname, 'gibs.earthdata.nasa.gov')
  assert.equal(parseSatelliteImageUrl('https://sh.dataspace.copernicus.eu/example.png').hostname, 'sh.dataspace.copernicus.eu')
  assert.throws(() => parseSatelliteImageUrl('https://example.com/not-allowed.jpg'), /not allowlisted/)
  assert.throws(() => parseSatelliteImageUrl('http://landsatlook.usgs.gov/insecure.jpg'), /HTTPS/)
})

test('streams official image bytes and exposes provenance headers', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async url => {
    assert.equal(String(url), 'https://gibs.earthdata.nasa.gov/example.jpg')
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': '4',
        ETag: '"test-etag"',
        'Last-Modified': 'Sat, 22 Aug 2026 00:00:00 GMT',
      },
    })
  }

  try {
    const response = await handleSatelliteImageProxy(new Request(
      'https://worker.example/research/image?url=https%3A%2F%2Fgibs.earthdata.nasa.gov%2Fexample.jpg',
      { headers: { Origin: allowedOrigin } },
    ))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Type'), 'image/jpeg')
    assert.equal(response.headers.get('X-Terra-Source-Host'), 'gibs.earthdata.nasa.gov')
    assert.equal(response.headers.get('X-Terra-Delivery'), 'streamed-official-imagery')
    assert.equal(response.headers.get('X-Terra-Provenance'), 'official-public-source; no image generation')
    assert.equal(response.headers.get('ETag'), '"test-etag"')
    assert.equal((await response.arrayBuffer()).byteLength, 4)
  } finally {
    globalThis.fetch = originalFetch
  }
})
