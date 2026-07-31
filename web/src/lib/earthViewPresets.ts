export type EarthViewPresetId =
  | 'global'
  | 'north-pole'
  | 'south-pole'
  | 'africa'
  | 'europe'
  | 'asia'
  | 'americas'
  | 'pacific'

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
    label: 'Widok początkowy',
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
    description: 'Dokładny widok osiowy Arktyki.',
  },
  {
    id: 'south-pole',
    label: 'Biegun południowy',
    longitude: 0,
    latitude: -90,
    heightM: 12_000_000,
    description: 'Dokładny widok osiowy Antarktydy.',
  },
  {
    id: 'africa',
    label: 'Afryka',
    longitude: 20,
    latitude: 5,
    heightM: 15_000_000,
    description: 'Afryka na środku globusa bez projekcji Mercatora.',
  },
  {
    id: 'europe',
    label: 'Europa',
    longitude: 15,
    latitude: 50,
    heightM: 13_000_000,
    description: 'Europa i basen Morza Śródziemnego.',
  },
  {
    id: 'asia',
    label: 'Azja',
    longitude: 95,
    latitude: 35,
    heightM: 17_000_000,
    description: 'Azja widziana na globusie w rzeczywistych proporcjach.',
  },
  {
    id: 'americas',
    label: 'Ameryki',
    longitude: -90,
    latitude: 15,
    heightM: 17_000_000,
    description: 'Ameryka Północna i Południowa w jednym widoku.',
  },
  {
    id: 'pacific',
    label: 'Pacyfik',
    longitude: -160,
    latitude: 0,
    heightM: 18_000_000,
    description: 'Ocean Spokojny z linią zmiany daty.',
  },
] as const

export function getEarthViewPreset(id: EarthViewPresetId): EarthViewPreset {
  const preset = EARTH_VIEW_PRESETS.find(candidate => candidate.id === id)
  if (!preset) throw new RangeError(`Unknown Earth view preset: ${id}`)
  return preset
}
