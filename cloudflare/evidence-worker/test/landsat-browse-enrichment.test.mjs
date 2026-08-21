import assert from 'node:assert/strict'
import test from 'node:test'

import { chooseYearBrowseImage, extractLandsatBrowseImage, extractLandsatBrowseImages } from '../src/areaAnalysisWithLandsatBrowse.js'

function scene({ id, date, cloud = null, assets = {}, links = [], platform = 'LANDSAT_5' }) {
  return {
    id,
    properties: {
      datetime: `${date}T09:42:00Z`,
      platform,
      ...(cloud === null ? {} : { 'eo:cloud_cover': cloud }),
    },
    assets,
    links,
  }
}

test('extracts browser-renderable official USGS thumbnail instead of a GeoTIFF band', () => {
  const image = extractLandsatBrowseImage(scene({
    id: 'LT05_TEST_19900718',
    date: '1990-07-18',
    cloud: 8.5,
    assets: {
      red: { href: 'https://example.usgs.gov/B3.TIF', type: 'image/tiff; application=geotiff' },
      thumbnail: { href: 'https://example.usgs.gov/thumb.jpg', type: 'image/jpeg', roles: ['thumbnail'] },
    },
  }))

  assert.equal(image?.url, 'https://example.usgs.gov/thumb.jpg')
  assert.equal(image?.date, '1990-07-18')
  assert.equal(image?.cloud_cover, 8.5)
  assert.match(image?.source ?? '', /USGS Landsat Collection 2/)
})

test('accepts an official STAC preview link when assets do not expose a JPEG', () => {
  const image = extractLandsatBrowseImage(scene({
    id: 'LT05_LINK_TEST',
    date: '1991-06-03',
    assets: { sr_band: { href: 'https://example.usgs.gov/sr.tif', type: 'image/tiff' } },
    links: [{ rel: 'preview', href: 'https://example.usgs.gov/browse.jpeg', type: 'image/jpeg' }],
  }))
  assert.equal(image?.url, 'https://example.usgs.gov/browse.jpeg')
})

test('returns only real renderable browse images and prefers lower cloud cover', () => {
  const payload = {
    features: [
      scene({ id: 'CLOUDY', date: '1990-08-01', cloud: 70, assets: { thumbnail: { href: 'https://example.usgs.gov/cloudy.jpg', type: 'image/jpeg' } } }),
      scene({ id: 'CLEAR', date: '1990-07-11', cloud: 4, assets: { browse: { href: 'https://example.usgs.gov/clear.jpg', type: 'image/jpeg' } } }),
      scene({ id: 'TIFF_ONLY', date: '1990-06-01', cloud: 0, assets: { red: { href: 'https://example.usgs.gov/red.tif', type: 'image/tiff' } } }),
    ],
  }
  const images = extractLandsatBrowseImages(payload, 2)
  assert.deepEqual(images.map(item => item.scene_id), ['CLEAR', 'CLOUDY'])
})

test('selects one lowest-cloud image for a seasonal year in clear mode', () => {
  const images = [
    { scene_id: 'NEAR_BUT_CLOUDY', date: '2005-07-15', cloud_cover: 64 },
    { scene_id: 'CLEAR', date: '2005-08-02', cloud_cover: 3 },
    { scene_id: 'OTHER_YEAR', date: '2006-07-15', cloud_cover: 0 },
  ]
  assert.equal(chooseYearBrowseImage(images, 2005, 'summer', 'clear')?.scene_id, 'CLEAR')
  assert.equal(chooseYearBrowseImage(images, 2005, 'summer', 'any')?.scene_id, 'NEAR_BUT_CLOUDY')
})
