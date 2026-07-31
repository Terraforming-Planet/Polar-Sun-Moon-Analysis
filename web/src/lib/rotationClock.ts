export type RotationClock = {
  angle: () => number
  advance: (elapsedSeconds: number) => number
  setEnabled: (enabled: boolean) => void
  isEnabled: () => boolean
}

/**
 * Keeps Earth rotation state outside React's render lifecycle.
 * Toggling pause/resume changes only this clock and must not recreate WebGL resources.
 */
export function createRotationClock(
  initialAngle: number,
  radiansPerSecond: number,
  initiallyEnabled: boolean,
): RotationClock {
  let currentAngle = Number.isFinite(initialAngle) ? initialAngle : 0
  let enabled = initiallyEnabled

  return {
    angle: () => currentAngle,
    advance: (elapsedSeconds: number) => {
      if (enabled && Number.isFinite(elapsedSeconds) && elapsedSeconds > 0) {
        currentAngle += elapsedSeconds * radiansPerSecond
      }
      return currentAngle
    },
    setEnabled: (next: boolean) => {
      enabled = next
    },
    isEnabled: () => enabled,
  }
}
