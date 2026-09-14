import { describe, expect, it } from 'vitest'
import publishedHazards from '../../public/data/hazards.json'
import { summarizeFireFeed, type FireFeedData } from './summarizeFireFeed'

describe('published hazards fire-feed compatibility', () => {
  it('summarizes the repository snapshot without inventing live data', () => {
    const publicationTimestamp = publishedHazards.generated_at_utc ?? publishedHazards.generatedUtc
    expect(publicationTimestamp).toBeTruthy()

    const publicationTime = new Date(publicationTimestamp)
    expect(Number.isFinite(publicationTime.getTime())).toBe(true)

    const summary = summarizeFireFeed(publishedHazards as FireFeedData, publicationTime)

    expect(summary.publishedAt).not.toBeNull()
    expect(new Date(summary.publishedAt!).getTime()).toBe(publicationTime.getTime())
    expect(summary.publishedAgeHours).toBe(0)
    expect(summary.publishedInFuture).toBe(false)
    expect(summary.publicationTimestampInvalid).toBe(false)
    expect(Number.isInteger(summary.pointCount)).toBe(true)
    expect(summary.pointCount).toBeGreaterThanOrEqual(0)
    expect(summary.ignoredObservationTimestampCount).toBeGreaterThanOrEqual(0)
    expect(summary.ignoredObservationTimestampCount).toBeLessThanOrEqual(summary.pointCount)

    if (summary.latestObservationAt) {
      const latestObservationTime = new Date(summary.latestObservationAt).getTime()
      expect(Number.isFinite(latestObservationTime)).toBe(true)
      expect(latestObservationTime).toBeLessThanOrEqual(publicationTime.getTime())
      expect(summary.latestObservationAgeHours).not.toBeNull()
      expect(summary.latestObservationAgeHours!).toBeGreaterThanOrEqual(0)
    } else {
      expect(summary.latestObservationAgeHours).toBeNull()
    }
  })
})
