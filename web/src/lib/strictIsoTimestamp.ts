const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/i

/**
 * Parse a hazard-feed timestamp only when it is an explicit ISO 8601 instant
 * and every calendar/time component is valid. JavaScript Date.parse normalizes
 * impossible dates such as 30 February, which would make feed-age metadata
 * look trustworthy when the producer timestamp is actually corrupt.
 */
export function strictIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim()
  const match = ISO_TIMESTAMP_PATTERN.exec(normalized)
  if (!match) return null

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText)
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText)

  if (month < 1 || month > 12) return null
  if (hour > 23 || minute > 59 || second > 59) return null
  if (offsetHour > 23 || offsetMinute > 59) return null

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day < 1 || day > daysInMonth) return null

  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}
