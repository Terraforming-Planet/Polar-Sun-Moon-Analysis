import {
  MOSAIC_TILE_RADIUS,
  MOSAIC_TILE_SAMPLE_SIZE,
  mosaicTileOrigins,
  stitchDemTiles,
} from './sahara-dem-mosaic-core.js';

const COPERNICUS_DEM_90M = 'https://copernicus-dem-90m.s3.amazonaws.com';
const GEOTIFF_MODULE_URL = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm';

function tileCode(latFloor, lonFloor) {
  const latHemisphere = latFloor >= 0 ? 'N' : 'S';
  const lonHemisphere = lonFloor >= 0 ? 'E' : 'W';
  const latCode = `${latHemisphere}${String(Math.abs(latFloor)).padStart(2, '0')}_00`;
  const lonCode = `${lonHemisphere}${String(Math.abs(lonFloor)).padStart(3, '0')}_00`;
  return `${latCode}_${lonCode}`;
}

export function mosaicDemTileUrl(latFloor, lonFloor) {
  const code = tileCode(latFloor, lonFloor);
  const name = `Copernicus_DSM_COG_30_${code}_DEM`;
  return `${COPERNICUS_DEM_90M}/${name}/${name}.tif`;
}

async function loadTile(fromUrl, origin, tileSampleSize) {
  const url = mosaicDemTileUrl(origin.latFloor, origin.lonFloor);
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  const values = await image.readRasters({
    width: tileSampleSize,
    height: tileSampleSize,
    interleave: true,
    resampleMethod: 'bilinear',
  });
  return { ...origin, values, url };
}

export async function loadCopernicusDemMosaic(lat, lon, options = {}) {
  const radius = options.radius ?? MOSAIC_TILE_RADIUS;
  const tileSampleSize = options.tileSampleSize ?? MOSAIC_TILE_SAMPLE_SIZE;
  const origins = mosaicTileOrigins(lat, lon, radius);
  const { fromUrl } = await import(GEOTIFF_MODULE_URL);
  const tiles = await Promise.all(origins.map((origin) => loadTile(fromUrl, origin, tileSampleSize)));
  const stitched = stitchDemTiles(tiles, radius, tileSampleSize);
  const baseLat = Math.floor(lat);
  const baseLon = Math.floor(lon);
  return {
    ...stitched,
    tiles,
    tileCount: tiles.length,
    latNorth: baseLat + radius + 1,
    latSouth: baseLat - radius,
    lonWest: baseLon - radius,
    lonEast: baseLon + radius + 1,
    latSpanDeg: radius * 2 + 1,
    lonSpanDeg: radius * 2 + 1,
  };
}
