export type GlofasSource = {
  id: string
  title: string
  provider: string
  status: string
  status_checked_at_utc?: string
  catalogue_updated_at_utc?: string
  update_frequency?: string
  temporal_start_utc?: string
  temporal_end_utc?: string
  variables?: string[]
  catalogue_url: string
  retrieve_url?: string
  doi?: string
  checked_at_utc?: string
  evidence_class?: string
}

export type GlofasCatalog = {
  generated_at_utc?: string
  source?: string
  notice?: string
  sources?: GlofasSource[]
  errors?: string[]
}

const VARIABLE_LABELS: Record<string, string> = {
  river_discharge: 'Przepływ rzeczny',
  soil_wetness_index_root_zone: 'Wilgotność strefy korzeniowej',
  snow_water_equivalent: 'Ekwiwalent wodny śniegu',
  runoff_water_equivalent_surface_plus_subsurface: 'Spływ powierzchniowy i podpowierzchniowy',
}

export function variableLabel(variable: string) {
  return VARIABLE_LABELS[variable] ?? variable.replaceAll('_', ' ')
}

export function sourceStatusLabel(status?: string) {
  if (status === 'available') return 'DOSTĘPNE'
  if (status === 'down') return 'CHWILOWO NIEDOSTĘPNE'
  return status ? status.toUpperCase() : 'BRAK STATUSU'
}

export function newestTemporalEnd(catalog?: GlofasCatalog | null) {
  const values = (catalog?.sources ?? [])
    .map(source => source.temporal_end_utc)
    .filter((value): value is string => Boolean(value))
    .sort()
  return values.at(-1)
}
