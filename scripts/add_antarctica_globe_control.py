from pathlib import Path

path = Path("web/src/RealisticEarthGlobe.tsx")
text = path.read_text(encoding="utf-8")

focus_anchor = """  const focusUser = () => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls || !userLocation) return
    const direction = pointOnSphere(userLocation.longitude, userLocation.latitude, 1).normalize()
    camera.position.copy(direction.multiplyScalar(4.25))
    camera.lookAt(0, 0, 0)
    controls.target.set(0, 0, 0)
    controls.autoRotate = false
    controls.update()
  }
"""

focus_replacement = focus_anchor + """

  const focusCoordinates = (longitude: number, latitude: number, distance = 5.2) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const direction = pointOnSphere(longitude, latitude, 1).normalize()
    camera.position.copy(direction.multiplyScalar(distance))
    camera.lookAt(0, 0, 0)
    controls.target.set(0, 0, 0)
    controls.autoRotate = false
    controls.update()
  }

  const focusAntarctica = () => focusCoordinates(0, -82, 5.35)
"""

if "const focusAntarctica" not in text:
    if focus_anchor not in text:
        raise RuntimeError("Could not find focusUser anchor")
    text = text.replace(focus_anchor, focus_replacement)

button_anchor = """        <button type=\"button\" onClick={focusUser} disabled={!userLocation}>
          Przybliż do mojej pozycji
        </button>
"""

button_replacement = button_anchor + """        <button type=\"button\" onClick={focusAntarctica}>
          Antarktyda
        </button>
"""

if ">\n          Antarktyda\n        </button>" not in text:
    if button_anchor not in text:
        raise RuntimeError("Could not find location button anchor")
    text = text.replace(button_anchor, button_replacement)

path.write_text(text, encoding="utf-8")
