export type EarthViewPresetId = 'global' | 'north-pole' | 'south-pole' | 'greenwich' | 'pacific'

export type EarthViewPreset = {
  id: EarthViewPresetId
  label: string
  longitude: number
  latitude: number
  heightM: number
  description: string
}

export const EARTH_VIEW_PRESETS: readonly EarthViewPreset[] = [
  {
    id: 'global',
    label: 'Widok globalny',
    longitude: 15,
    latitude: 15,
    heightM: 21_000_000,
    description: 'Cała elipsoida WGS84 z Europą i Afryką w centrum.',
  },
  {
    id: 'north-pole',
    label: 'Biegun północny',
    longitude: 0,
    latitude: 90,
    heightM: 12_000_000,
    description: 'Widok osiowy Arktyki bez projekcji płaskiej mapy.',
  },
  {
    id: 'south-pole',
    label: 'Biegun południowy',
    longitude: 0,
    latitude: -90,
    heightM: 12_000_000,
    description: 'Widok osiowy Antarktydy bez projekcji płaskiej mapy.',
  },
  {
    id: 'greenwich',
    label: 'Południk Greenwich',
    longitude: 0,
    latitude: 0,
    heightM: 16_000_000,
    description: 'Punkt odniesienia długości geograficznej 0°.',
  },
  {
    id: 'pacific',
    label: 'Ocean Spokojny',
    longitude: -160,
    latitude: 0,
    heightM: 18_000_000,
    description: 'Widok przeciwnej półkuli z linią zmiany daty.',
  },
] as const

export function getEarthViewPreset(id: EarthViewPresetId): EarthViewPreset {
  const preset = EARTH_VIEW_PRESETS.find(candidate => candidate.id === id)
  if (!preset) throw new RangeError(`Unknown Earth view preset: ${id}`)
  return preset
}
