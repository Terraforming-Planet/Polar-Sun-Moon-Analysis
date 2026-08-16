export const MOSAIC_TILE_RADIUS = 1;
export const MOSAIC_TILE_SAMPLE_SIZE = 17;

export function mosaicTileOrigins(lat, lon, radius = MOSAIC_TILE_RADIUS) {
  const baseLat = Math.floor(lat);
  const baseLon = Math.floor(lon);
  const origins = [];
  for (let row = 0; row < radius * 2 + 1; row += 1) {
    const latFloor = baseLat + radius - row;
    for (let col = 0; col < radius * 2 + 1; col += 1) {
      origins.push({ row, col, latFloor, lonFloor: baseLon - radius + col });
    }
  }
  return origins;
}

export function stitchedSize(radius = MOSAIC_TILE_RADIUS, tileSampleSize = MOSAIC_TILE_SAMPLE_SIZE) {
  return (radius * 2 + 1) * (tileSampleSize - 1) + 1;
}

export function stitchDemTiles(tiles, radius = MOSAIC_TILE_RADIUS, tileSampleSize = MOSAIC_TILE_SAMPLE_SIZE) {
  const size = stitchedSize(radius, tileSampleSize);
  const values = new Float64Array(size * size);
  const written = new Uint8Array(size * size);

  for (const tile of tiles) {
    if (!tile || tile.values.length !== tileSampleSize * tileSampleSize) {
      throw new Error('Invalid DEM tile sample for mosaic');
    }
    const rowStart = tile.row * (tileSampleSize - 1);
    const colStart = tile.col * (tileSampleSize - 1);
    for (let row = 0; row < tileSampleSize; row += 1) {
      for (let col = 0; col < tileSampleSize; col += 1) {
        const target = (rowStart + row) * size + colStart + col;
        const source = row * tileSampleSize + col;
        if (!written[target]) {
          values[target] = Number(tile.values[source]);
          written[target] = 1;
        }
      }
    }
  }

  for (const flag of written) {
    if (!flag) throw new Error('DEM mosaic has unwritten cells');
  }
  return { values, width: size, height: size };
}
