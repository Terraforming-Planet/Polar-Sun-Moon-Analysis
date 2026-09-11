export type HazardCategoryValue = string | {
  id?: unknown
  title?: unknown
}

/**
 * Normalize category metadata from published hazard feeds.
 *
 * Internal adapters commonly emit string labels, while official APIs such as
 * NASA EONET can expose category objects. Only explicit string values are
 * returned; unknown object fields are ignored rather than guessed.
 */
export function normalizeHazardCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const categories: string[] = []

  for (const item of value as HazardCategoryValue[]) {
    if (typeof item === 'string') {
      const normalized = item.trim()
      if (normalized) categories.push(normalized)
      continue
    }

    if (!item || typeof item !== 'object') continue

    const title = typeof item.title === 'string' ? item.title.trim() : ''
    if (title) {
      categories.push(title)
      continue
    }

    const id = typeof item.id === 'string' ? item.id.trim() : ''
    if (id) categories.push(id)
  }

  return categories
}
