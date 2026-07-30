from __future__ import annotations

from pathlib import Path

PATH = Path("web/src/main.tsx")

OLD_TYPE = (
    "type HazardData = { generated_at_utc: string; notice: string; "
    "features: HazardFeature[] }"
)
NEW_TYPE = (
    "type HazardData = { generated_at_utc?: string; generatedUtc?: string; "
    "notice?: string; features?: HazardFeature[]; alerts?: unknown[] }"
)

OLD_MARKERS = (
    "  const markers = useMemo(() => {\n"
    "    if (!data) return []\n"
    "    const selectedMs = new Date(selectedTime).getTime()\n"
    "    return data.features"
)
NEW_MARKERS = (
    "  const markers = useMemo(() => {\n"
    "    const features = Array.isArray(data?.features) ? data.features : []\n"
    "    if (!features.length) return []\n"
    "    const selectedMs = new Date(selectedTime).getTime()\n"
    "    return features"
)

OLD_GENERATED = "<b>{formatUtc(hazards?.generated_at_utc)}</b>"
NEW_GENERATED = (
    "<b>{formatUtc(hazards?.generated_at_utc ?? hazards?.generatedUtc)}</b>"
)


def apply_change(text: str, old: str, new: str, label: str) -> str:
    """Apply one deterministic change or accept an already patched file."""
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Cannot patch {label}: expected old or new fragment")
    return text.replace(old, new, 1)


def main() -> None:
    """Prevent evolving hazard schemas from crashing the Earth 3D view."""
    text = PATH.read_text(encoding="utf-8")
    text = apply_change(text, OLD_TYPE, NEW_TYPE, "HazardData type")
    text = apply_change(text, OLD_MARKERS, NEW_MARKERS, "marker normalization")
    text = apply_change(
        text,
        OLD_GENERATED,
        NEW_GENERATED,
        "generated timestamp fallback",
    )
    PATH.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
