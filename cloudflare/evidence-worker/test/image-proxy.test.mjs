import assert from 'node:assert/strict'
import test from 'node:test'

import { parseSatelliteImageUrl } from '../src/imageProxy.js'

test('allows only the official image hosts used by the research gallery', () => {
  assert.equal(parseSatelliteImageUrl('https://landsatlook.usgs.gov/example.jpg').hostname, 'landsatlook.usgs.gov')
  assert.equal(parseSatelliteImageUrl('https://gibs.earthdata.nasa.gov/wms/example.jpg').hostname, 'gibs.earthdata.nasa.gov')
  assert.equal(parseSatelliteImageUrl('https://sh.dataspace.copernicus.eu/example.png').hostname, 'sh.dataspace.copernicus.eu')
  assert.throws(() => parseSatelliteImageUrl('https://example.com/not-allowed.jpg'), /not allowlisted/)
  assert.throws(() => parseSatelliteImageUrl('http://landsatlook.usgs.gov/insecure.jpg'), /HTTPS/)
})
