export type ResearchTemporalPreset = 'custom' | 'date' | 'spring' | 'summer' | 'autumn' | 'winter' | 'year' | 'decade'

export type ResearchPeriod = {
  startDate: string
  endDate: string
}

function leapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

export function periodForPreset(
  preset: ResearchTemporalPreset,
  year: number,
  exactDate: string,
  current: ResearchPeriod,
): ResearchPeriod {
  if (preset === 'custom') return current
  if (preset === 'date') return { startDate: exactDate, endDate: exactDate }
  if (preset === 'spring') return { startDate: `${year}-03-01`, endDate: `${year}-05-31` }
  if (preset === 'summer') return { startDate: `${year}-06-01`, endDate: `${year}-08-31` }
  if (preset === 'autumn') return { startDate: `${year}-09-01`, endDate: `${year}-11-30` }
  if (preset === 'winter') {
    const previousYear = year - 1
    return {
      startDate: `${previousYear}-12-01`,
      endDate: `${year}-02-${leapYear(year) ? '29' : '28'}`,
    }
  }
  if (preset === 'year') return { startDate: `${year}-01-01`, endDate: `${year}-12-31` }
  const decadeStart = Math.floor(year / 10) * 10
  return { startDate: `${decadeStart}-01-01`, endDate: `${decadeStart + 9}-12-31` }
}

export function temporalPresetLabel(preset: ResearchTemporalPreset) {
  const labels: Record<ResearchTemporalPreset, string> = {
    custom: 'custom range',
    date: 'exact date',
    spring: 'spring',
    summer: 'summer',
    autumn: 'autumn',
    winter: 'winter',
    year: 'full year',
    decade: 'decade',
  }
  return labels[preset]
}
