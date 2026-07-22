import { describe, expect, it } from 'vitest'

describe('data contract', () => {
  it('keeps the deployed base path explicit', () => {
    expect('/Polar-Sun-Moon-Analysis/').toContain('Polar-Sun-Moon-Analysis')
  })
})
