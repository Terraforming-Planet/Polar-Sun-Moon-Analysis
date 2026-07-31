import * as THREE from 'three'

export type EarthTextureLoadResult = {
  texture: THREE.Texture | null
  sourceUrl: string | null
  fallbackUsed: boolean
  error?: string
}

export function resolveEarthAssetUrl(path: string, baseUrl: string): string {
  const trimmedPath = path.replace(/^\/+/, '')
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${normalizedBase}${trimmedPath}`
}

export async function loadEarthTexture(
  path: string | undefined,
  baseUrl: string,
  loader: THREE.TextureLoader = new THREE.TextureLoader(),
): Promise<EarthTextureLoadResult> {
  if (!path) {
    return { texture: null, sourceUrl: null, fallbackUsed: true }
  }

  const sourceUrl = resolveEarthAssetUrl(path, baseUrl)

  try {
    const texture = await loader.loadAsync(sourceUrl)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.anisotropy = 4
    texture.needsUpdate = true
    return { texture, sourceUrl, fallbackUsed: false }
  } catch (reason) {
    return {
      texture: null,
      sourceUrl,
      fallbackUsed: true,
      error: reason instanceof Error ? reason.message : String(reason),
    }
  }
}
