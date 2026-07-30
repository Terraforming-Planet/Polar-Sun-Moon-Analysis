export type ScientificEarthLayerId = 'equator' | 'prime-meridian' | 'tropics' | 'polar-circles' | 'graticule'

export type ScientificEarthLayer = {
  id: ScientificEarthLayerId
  label: string
  description: string
  defaultVisible: boolean
  source: string
}

export const SCIENTIFIC_EARTH_LAYERS: readonly ScientificEarthLayer[] = [
  {
    id: 'equator',
    label: 'Równik',
    description: 'Wielkie koło o szerokości geograficznej 0°.',
    defaultVisible: true,
    source: 'WGS 84 / EPSG:4326',
  },
  {
    id: 'prime-meridian',
    label: 'Południk zerowy',
    description: 'Południk odniesienia 0° przechodzący przez Greenwich.',
    defaultVisible: true,
    source: 'IERS Reference Meridian / WGS 84',
  },
  {
    id: 'tropics',
    label: 'Zwrotniki',
    description: 'Zwrotnik Raka i Koziorożca, około ±23,44°.',
    defaultVisible: false,
    source: 'Earth axial tilt reference',
  },
  {
    id: 'polar-circles',
    label: 'Koła podbiegunowe',
    description: 'Koło podbiegunowe północne i południowe, około ±66,56°.',
    defaultVisible: false,
    source: 'Earth axial tilt reference',
  },
  {
    id: 'graticule',
    label: 'Siatka geograficzna',
    description: 'Linie szerokości i długości geograficznej co 10°.',
    defaultVisible: false,
    source: 'WGS 84 / EPSG:4326',
  },
] as const
