export type EarthModel = 'legacy' | 'scientific'

export const EARTH_MODEL_STORAGE_KEY = 'polar-sun-moon-analysis.earth-model'

type ReadStorage = Pick<Storage, 'getItem'>
type WriteStorage = Pick<Storage, 'setItem'>

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function readEarthModel(storage?: ReadStorage): EarthModel {
  try {
    const value = (storage ?? browserStorage())?.getItem(EARTH_MODEL_STORAGE_KEY)
    return value === 'legacy' || value === 'scientific' ? value : 'scientific'
  } catch {
    return 'scientific'
  }
}

export function writeEarthModel(model: EarthModel, storage?: WriteStorage): void {
  try {
    ;(storage ?? browserStorage())?.setItem(EARTH_MODEL_STORAGE_KEY, model)
  } catch {
    // Storage can be unavailable in private browsing, restricted embeds or hardened mobile browsers.
  }
}
