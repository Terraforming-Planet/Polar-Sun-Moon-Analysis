import { describe, expect, it } from 'vitest'

import { extractLandsatBrowseImage } from '../../cloudflare/evidence-worker/src/areaAnalysisWithLandsatBrowse.js'

describe('Landsat yearly gallery image quality', () => {
  it('prefers a full browse over a 300x300 catalogue thumbnail and labels it honestly', () => {
    const image = extractLandsatBrowseImage({
      id: 'LC09_TEST_SCENE',
      properties: { datetime: '2025-08-12T10:00:00Z', platform: 'landsat-9', 'eo:cloud_cover': 3 },
      assets: {
        thumbnail: { href: 'https://example.org/thumb.jpg', type: 'image/jpeg', title: 'Thumbnail 300x300', roles: ['thumbnail'] },
        browse: { href: 'https://example.org/full-browse.jpg', type: 'image/jpeg', title: 'Full Resolution Browse', roles: ['overview'] },
      },
    })

    expect(image?.url).toBe('https://example.org/full-browse.jpg')
    expect(image?.asset_kind).toBe('FULL_RESOLUTION_BROWSE')
    expect(image?.aoi_cropped).toBe(false)
    expect(image?.analysis_eligible).toBe(false)
    expect(image?.source).toContain('Full Resolution Browse')
  })

  it('does not call a thumbnail full resolution when no browse exists', () => {
    const image = extractLandsatBrowseImage({
      id: 'LC08_THUMB_ONLY',
      properties: { datetime: '2014-05-02T10:00:00Z', platform: 'landsat-8' },
      assets: {
        thumbnail: { href: 'https://example.org/only-thumb.jpg', type: 'image/jpeg', title: 'Thumbnail 300x300', roles: ['thumbnail'] },
      },
    })

    expect(image?.asset_kind).toBe('CATALOGUE_THUMBNAIL')
    expect(image?.source).toContain('Catalogue Thumbnail')
    expect(image?.quality_note).toContain('300×300')
  })
})
