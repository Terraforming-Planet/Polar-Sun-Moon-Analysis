import { describe, expect, it } from 'vitest'
import { resolveEarthAssetUrl } from './earthTextureManagement'

describe('resolveEarthAssetUrl', () => {
  it('keeps assets below the GitHub Pages base path', () => {
    expect(resolveEarthAssetUrl(
      'textures/earth/blue-marble.webp',
      '/Polar-Sun-Moon-Analysis/',
    )).toBe('/Polar-Sun-Moon-Analysis/textures/earth/blue-marble.webp')
  })

  it('removes an accidental leading slash from an asset path', () => {
    expect(resolveEarthAssetUrl(
      '/textures/earth/blue-marble.webp',
      '/Polar-Sun-Moon-Analysis/',
    )).toBe('/Polar-Sun-Moon-Analysis/textures/earth/blue-marble.webp')
  })

  it('normalizes a base path without a trailing slash', () => {
    expect(resolveEarthAssetUrl('textures/earth/clouds.webp', '/app')).toBe(
      '/app/textures/earth/clouds.webp',
    )
  })
})
