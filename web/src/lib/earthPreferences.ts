export type EarthModel = 'legacy' | 'scientific'

export const EARTH_MODEL_STORAGE_KEY = 'polar-sun-moon-analysis.earth-model'

export function readEarthModel(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): EarthModel {
  try {
    const value = storage?.getItem(EARTH_MODEL_STORAGE_KEY)
    return value === 'legacy' || value === 'scientific' ? value : 'scientific'
  } catch {
    return 'scientific'
  }
}

export function writeEarthModel(
  model: EarthModel,
  storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(EARTH_MODEL_STORAGE_KEY, model)
  } catch {
    // Storage can be unavailable in private browsing or restricted embeds.
  }
}
