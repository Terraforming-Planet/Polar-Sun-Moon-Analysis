import { describe, expect, it } from 'vitest'
import source from './RealisticEarthGlobe.tsx?raw'

describe('Earth model comparison controls', () => {
  it('uses the requested Polish model labels without a language selector', () => {
    expect(source).toContain('Dotychczasowy model')
    expect(source).toContain('Naukowy globus — rzeczywiste proporcje')
    expect(source).not.toContain('PL / EN')
    expect(source).not.toContain('English')
  })

  it('exposes the selected model to assistive technology', () => {
    expect(source).toContain("aria-pressed={model === 'legacy'}")
    expect(source).toContain("aria-pressed={model === 'scientific'}")
    expect(source).toContain('role="group" aria-label="Model Ziemi"')
  })

  it('preserves camera position and target while the renderer is recreated', () => {
    expect(source).toContain('const cameraState = useRef<CameraState>')
    expect(source).toContain('camera.position.copy(cameraState.current.position)')
    expect(source).toContain('controls.target.copy(cameraState.current.target)')
    expect(source).toContain('cameraState.current.position.copy(camera.position)')
    expect(source).toContain('cameraState.current.target.copy')
  })

  it('keeps model selection persisted in localStorage through the shared helper', () => {
    expect(source).toContain('readEarthModel()')
    expect(source).toContain('writeEarthModel(next)')
  })
})
