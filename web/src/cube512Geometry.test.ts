import { describe, expect, it } from 'vitest'
import {
  buildCube512CellCenters,
  buildCube512LatticeSegments,
  buildCube512LevelLoops,
  buildCube512OuterSegments,
  cube512GeometrySummary,
} from './cube512Geometry'

describe('512 evidence cube geometry', () => {
  it('keeps deterministic visual counts', () => {
    expect(buildCube512CellCenters()).toHaveLength(512)
    expect(buildCube512LatticeSegments()).toHaveLength(1944)
    expect(buildCube512OuterSegments()).toHaveLength(12)
    expect(buildCube512LevelLoops()).toHaveLength(8)
  })

  it('keeps all 512 cell centers unique', () => {
    const centers = buildCube512CellCenters()
    expect(new Set(centers.map(point => point.join(','))).size).toBe(512)
  })

  it('uses one white base plane and no side wall planes', () => {
    expect(cube512GeometrySummary()).toMatchObject({
      cells: 512,
      latticeSegments: 1944,
      outerSegments: 12,
      ledLoops: 8,
      sideWallPlanes: 0,
      basePlanes: 1,
    })
  })
})
