import { describe, expect, it } from 'vitest'

import { buildStoredZip } from './researchGalleryEnhancements'

describe('research gallery export', () => {
  it('builds a valid stored ZIP with central directory and payload names', () => {
    const encoder = new TextEncoder()
    const zip = buildStoredZip([
      { name: 'manifest.json', data: encoder.encode('{"ok":true}') },
      { name: 'sources.txt', data: encoder.encode('NASA\nUSGS') },
    ])
    const bytes = [...zip]
    expect(bytes.slice(0, 4)).toEqual([0x50, 0x4b, 0x03, 0x04])
    const text = new TextDecoder().decode(zip)
    expect(text).toContain('manifest.json')
    expect(text).toContain('sources.txt')
    expect(bytes.slice(-22, -18)).toEqual([0x50, 0x4b, 0x05, 0x06])
  })
})
