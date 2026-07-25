from __future__ import annotations

import re
from pathlib import Path

path = Path("web/src/main.tsx")
text = path.read_text(encoding="utf-8")

import_line = (
    "import { RealisticEarthGlobe } from './RealisticEarthGlobe'\n"
)
if import_line not in text:
    anchor = (
        "import { OrbitControls } from "
        "'three/examples/jsm/controls/OrbitControls.js'\n"
    )
    text = text.replace(anchor, anchor + import_line)

replacement = r'''function EarthGlobe({ data, selectedTime }: { data: HazardData; selectedTime: string }) {
  const markers = useMemo(() => {
    const selectedMs = new Date(selectedTime).getTime()
    return data.features
      .filter(feature => {
        const time = feature.properties.observation_time
        return !time || new Date(time).getTime() <= selectedMs
      })
      .map(feature => {
        const point = featurePoint(feature)
        if (!point) return null
        const [longitude, latitude] = point
        return { longitude, latitude, color: 0xff674f, radius: 1 }
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
  }, [data, selectedTime])

  return (
    <RealisticEarthGlobe
      selectedTime={selectedTime}
      markers={markers}
      autoRotate
    />
  )
}

function PolarObservatory'''

pattern = re.compile(
    r"function EarthGlobe\(.*?\n\}\n\nfunction PolarObservatory",
    re.DOTALL,
)
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise RuntimeError("Could not replace the legacy EarthGlobe implementation")

path.write_text(text, encoding="utf-8")
