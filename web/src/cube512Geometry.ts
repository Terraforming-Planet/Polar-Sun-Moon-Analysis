export const CUBE512_SIZE = 8
export const CUBE512_HALF = CUBE512_SIZE / 2
export const CUBE512_LED_COLORS = [
  '#00B7FF', '#00E5D4', '#34D058', '#B8E600',
  '#FFD166', '#FF8A3D', '#A970FF', '#7FDBFF',
] as const

export type Segment3 = [[number, number, number], [number, number, number]]

export function buildCube512CellCenters(pitch = 1): [number, number, number][] {
  const halfCell = (CUBE512_SIZE - 1) / 2
  const centers: [number, number, number][] = []
  for (let z = 0; z < CUBE512_SIZE; z += 1) {
    for (let y = 0; y < CUBE512_SIZE; y += 1) {
      for (let x = 0; x < CUBE512_SIZE; x += 1) {
        centers.push([
          (x - halfCell) * pitch,
          (y - halfCell) * pitch,
          (z - halfCell) * pitch,
        ])
      }
    }
  }
  return centers
}

export function buildCube512LatticeSegments(pitch = 1): Segment3[] {
  const half = CUBE512_SIZE * pitch / 2
  const coords = Array.from({ length: CUBE512_SIZE + 1 }, (_, i) => -half + i * pitch)
  const segments: Segment3[] = []

  for (let yi = 0; yi <= CUBE512_SIZE; yi += 1) {
    for (let zi = 0; zi <= CUBE512_SIZE; zi += 1) {
      for (let xi = 0; xi < CUBE512_SIZE; xi += 1) {
        segments.push([[coords[xi], coords[yi], coords[zi]], [coords[xi + 1], coords[yi], coords[zi]]])
      }
    }
  }
  for (let xi = 0; xi <= CUBE512_SIZE; xi += 1) {
    for (let zi = 0; zi <= CUBE512_SIZE; zi += 1) {
      for (let yi = 0; yi < CUBE512_SIZE; yi += 1) {
        segments.push([[coords[xi], coords[yi], coords[zi]], [coords[xi], coords[yi + 1], coords[zi]]])
      }
    }
  }
  for (let xi = 0; xi <= CUBE512_SIZE; xi += 1) {
    for (let yi = 0; yi <= CUBE512_SIZE; yi += 1) {
      for (let zi = 0; zi < CUBE512_SIZE; zi += 1) {
        segments.push([[coords[xi], coords[yi], coords[zi]], [coords[xi], coords[yi], coords[zi + 1]]])
      }
    }
  }
  return segments
}

export function buildCube512OuterSegments(pitch = 1): Segment3[] {
  const h = CUBE512_SIZE * pitch / 2
  const c: [number, number, number][] = [
    [-h,-h,-h],[h,-h,-h],[h,h,-h],[-h,h,-h],
    [-h,-h,h],[h,-h,h],[h,h,h],[-h,h,h],
  ]
  const pairs = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]] as const
  return pairs.map(([a, b]) => [c[a], c[b]])
}

export function buildCube512LevelLoops(pitch = 1): [number, number, number][][] {
  const h = CUBE512_SIZE * pitch / 2
  return Array.from({ length: CUBE512_SIZE }, (_, level) => {
    const z = (level - 3.5) * pitch
    return [[-h,-h,z],[h,-h,z],[h,h,z],[-h,h,z],[-h,-h,z]]
  })
}

export function cube512GeometrySummary() {
  return {
    cells: buildCube512CellCenters().length,
    latticeSegments: buildCube512LatticeSegments().length,
    outerSegments: buildCube512OuterSegments().length,
    ledLoops: buildCube512LevelLoops().length,
    sideWallPlanes: 0,
    basePlanes: 1,
  }
}
