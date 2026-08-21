import { describe, expect, it } from 'vitest'

import {
  CHAT_CONTEXT_WINDOW_MESSAGES,
  requestedSatelliteImageYear,
  trimResearchChatMessages,
  wantsSatelliteImage,
} from './researchChatImageEnhancement'

describe('research chat multi-turn helpers', () => {
  it('keeps an unlimited session possible by sending only a rolling recent context window', () => {
    const values = Array.from({ length: 75 }, (_, index) => index + 1)
    const trimmed = trimResearchChatMessages(values)
    expect(trimmed).toHaveLength(CHAT_CONTEXT_WINDOW_MESSAGES)
    expect(trimmed[0]).toBe(36)
    expect(trimmed.at(-1)).toBe(75)
  })

  it('detects requests for an exact satellite image in Polish and English', () => {
    expect(wantsSatelliteImage('Pokaż mi dokładne zdjęcie satelitarne z tego miejsca')).toBe(true)
    expect(wantsSatelliteImage('Show the satellite image for this year')).toBe(true)
    expect(wantsSatelliteImage('Czy ten teren da się zazielenić?')).toBe(false)
  })

  it('extracts a requested year so the chat can prefer that loaded terrain-study card', () => {
    expect(requestedSatelliteImageYear('Pokaż zdjęcie z 2021 roku')).toBe(2021)
    expect(requestedSatelliteImageYear('Pokaż obecny obraz')).toBeNull()
  })
})
