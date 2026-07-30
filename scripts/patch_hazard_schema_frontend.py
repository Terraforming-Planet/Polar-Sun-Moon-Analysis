from __future__ import annotations

from pathlib import Path

PATH = Path("web/src/main.tsx")


def replace_once(text: str, old: str, new: str) -> str:
    if old not in text:
        raise RuntimeError(f"Expected frontend fragment not found: {old[:100]!r}")
    return text.replace(old, new, 1)


def main() -> None:
    """Patch the live frontend so evolving hazard schemas cannot crash Earth 3D."""
    text = PATH.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "type HazardData = { generated_at_utc: string; notice: string; features: HazardFeature[] }",
        "type HazardData = { generated_at_utc?: string; generatedUtc?: string; notice?: string; features?: HazardFeature[]; alerts?: unknown[] }",
    )

    text = replace_once(
        text,
        "  const markers = useMemo(() => {\n    if (!data) return []\n    const selectedMs = new Date(selectedTime).getTime()\n    return data.features",
        "  const markers = useMemo(() => {\n    const features = Array.isArray(data?.features) ? data.features : []\n    if (!features.length) return []\n    const selectedMs = new Date(selectedTime).getTime()\n    return features",
    )

    text = replace_once(
        text,
        "<b>{formatUtc(hazards?.generated_at_utc)}</b>",
        "<b>{formatUtc(hazards?.generated_at_utc ?? hazards?.generatedUtc)}</b>",
    )

    PATH.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
