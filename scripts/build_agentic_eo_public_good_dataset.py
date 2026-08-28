from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

SCHEMA = "terra-agentic-eo-public-good-v1"
SYSTEM = (
    "You are an Earth Observation research assistant. Use only supplied official/public "
    "source facts, preserve provenance, state sensor limitations, separate evidence from "
    "inference, and never invent observations or causal findings."
)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        row = json.loads(line)
        if not isinstance(row, dict):
            raise ValueError(f"{path}:{line_number}: JSONL row must be an object")
        rows.append(row)
    return rows


def stable_split(group_key: str) -> str:
    """Keep variants from one logical group together to reduce near-duplicate leakage."""
    bucket = int(hashlib.sha256(group_key.encode("utf-8")).hexdigest()[:8], 16) % 100
    if bucket < 72:
        return "train"
    if bucket < 86:
        return "validation"
    return "holdout"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_source(source: dict[str, Any]) -> dict[str, Any]:
    required = (
        "id",
        "agency",
        "mission",
        "instrument",
        "phenomena",
        "temporal_coverage",
        "spatial_resolution",
        "access",
        "url",
        "limitations",
    )
    missing = [key for key in required if key not in source]
    if missing:
        raise ValueError(f"Source {source.get('id', '<unknown>')} missing fields: {missing}")
    if not isinstance(source["phenomena"], list) or not source["phenomena"]:
        raise ValueError(f"Source {source['id']} must list at least one phenomenon")
    return source


def example(
    *,
    example_id: str,
    group_key: str,
    task: str,
    user: str,
    assistant: str,
    capabilities: list[str],
    provenance: list[str],
    safety_tags: list[str],
) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "id": example_id,
        "split": stable_split(group_key),
        "group_key": group_key,
        "task": task,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user},
            {"role": "assistant", "content": assistant},
        ],
        "expected_capabilities": capabilities,
        "provenance": provenance,
        "safety_tags": safety_tags,
    }


def source_limit_examples(source: dict[str, Any]) -> list[dict[str, Any]]:
    sid = str(source["id"])
    mission = str(source["mission"])
    instrument = str(source["instrument"])
    resolution = str(source["spatial_resolution"])
    limitation = str(source["limitations"])
    access = str(source["access"])
    temporal = str(source["temporal_coverage"])
    provenance = [f"terra_hazards/data_sources.json#{sid}", str(source["url"])]

    templates = [
        (
            "sensor_limitation",
            f"What is the most important limitation to state when using {mission} ({instrument})?",
            f"Registered limitation: {limitation} Report the source as {source['agency']} / {mission}, "
            f"with spatial scale noted as {resolution}. Do not claim a quantity the instrument does not measure.",
            ["sensor_limitation", "provenance", "claim_boundary"],
            ["no_hidden_limitation"],
        ),
        (
            "provenance",
            f"Give a provenance-safe description of {mission} for an EO research manifest.",
            f"Agency: {source['agency']}. Mission/source: {mission}. Instrument: {instrument}. "
            f"Temporal coverage: {temporal}. Spatial resolution: {resolution}. Access: {access}. "
            f"Limitation: {limitation}",
            ["provenance", "metadata_fidelity"],
            ["official_public_only"],
        ),
        (
            "temporal_reasoning",
            f"A study proposes using {mission}. What temporal-coverage warning belongs in the plan?",
            f"Use the registered coverage exactly as documented: {temporal}. Do not imply observations "
            "exist outside that coverage, and record missing or unsuitable acquisitions explicitly.",
            ["temporal_reasoning", "missing_data"],
            ["no_temporal_anachronism", "no_fabricated_observation"],
        ),
        (
            "access_reasoning",
            f"Before an agent promises that it can retrieve {mission} data, what access fact must it check?",
            f"The registered access path is: {access}. A catalogue or source description does not prove "
            "that credentials, a suitable acquisition, or a downloaded/analysed product are available for this run.",
            ["access_reasoning", "claim_boundary", "provenance"],
            ["no_fake_download", "no_fake_analysis"],
        ),
    ]

    rows: list[dict[str, Any]] = []
    for index, (task, user, assistant, capabilities, safety) in enumerate(templates, start=1):
        rows.append(
            example(
                example_id=f"registry-{sid}-{task}-{index:02d}",
                group_key=f"registry|{sid}|{task}",
                task=task,
                user=user,
                assistant=assistant,
                capabilities=capabilities,
                provenance=provenance,
                safety_tags=safety,
            )
        )
    return rows


def phenomenon_examples(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_phenomenon: dict[str, list[dict[str, Any]]] = {}
    for source in sources:
        for raw in source["phenomena"]:
            phenomenon = str(raw)
            by_phenomenon.setdefault(phenomenon, []).append(source)

    rows: list[dict[str, Any]] = []
    variants = (
        "Which registered official/public source or sources are relevant to {phenomenon}? State the main limitation for every source you name.",
        "Build a conservative source shortlist for {phenomenon}. Use only the controlled registry and do not imply that a listed source has already been analysed.",
    )
    for phenomenon in sorted(by_phenomenon):
        matches = sorted(by_phenomenon[phenomenon], key=lambda item: str(item["id"]))
        source_lines = [
            f"{item['mission']} ({item['agency']}): {item['limitations']}" for item in matches
        ]
        answer = (
            "Registry-backed options: "
            + " | ".join(source_lines)
            + " A registry match identifies a scientifically relevant official/public source; it does not prove that a suitable scene/product was retrieved or analysed."
        )
        provenance = [f"terra_hazards/data_sources.json#{item['id']}" for item in matches]
        for index, template in enumerate(variants, start=1):
            rows.append(
                example(
                    example_id=f"phenomenon-{phenomenon}-{index:02d}",
                    group_key=f"phenomenon|{phenomenon}",
                    task="source_selection",
                    user=template.format(phenomenon=phenomenon),
                    assistant=answer,
                    capabilities=["source_selection", "sensor_limitation", "claim_boundary"],
                    provenance=provenance,
                    safety_tags=["official_public_only", "no_fake_analysis"],
                )
            )
    return rows


def complementarity_examples() -> list[dict[str, Any]]:
    scenarios = [
        {
            "id": "river-long-record-cloud",
            "question": "Plan a long-term river morphology study from the 1980s to today when recent optical scenes can be cloudy.",
            "answer": "Use Landsat for the long multispectral record, Sentinel-2 for newer higher-resolution optical context, and Sentinel-1 SAR for complementary all-weather observations. Match seasons, preserve acquisition provenance, and do not infer depth, volume or physical cause from morphology alone.",
            "sources": ["usgs-landsat", "esa-sentinel-2", "esa-sentinel-1"],
        },
        {
            "id": "flood-event-to-map",
            "question": "An event catalogue reports a flood. Design the next EO step without treating the catalogue as the measurement.",
            "answer": "Treat NASA EONET as event metadata, then use an appropriate sensor such as Sentinel-1 SAR for flood/water-extent mapping, with Sentinel-2 optical context when cloud conditions permit. Keep the catalogue record and pixel-level analysis as different evidence types.",
            "sources": ["nasa-eonet", "esa-sentinel-1", "esa-sentinel-2"],
        },
        {
            "id": "surface-area-elevation-volume",
            "question": "A study needs mapped water extent, water-surface elevation and a defensible statement about volume change. How should the sources and quantities be separated?",
            "answer": "Use optical/radar sources such as Sentinel-1, Sentinel-2 or Landsat for mapped extent and SWOT for water-surface elevation/slope where suitable. Do not claim volume change unless bathymetry or a defensible area-elevation-volume relationship is available.",
            "sources": ["esa-sentinel-1", "esa-sentinel-2", "usgs-landsat", "nasa-cnes-swot"],
        },
        {
            "id": "groundwater-scale",
            "question": "Design a groundwater-context workflow without pretending a regional satellite product can locate a small aquifer.",
            "answer": "Use GRACE/GRACE-FO for regional terrestrial-water-storage or groundwater-anomaly context. Do not use it to locate an individual aquifer or fracture. Local attribution requires independent higher-resolution hydrogeological evidence.",
            "sources": ["nasa-grace-fo"],
        },
        {
            "id": "fire-detection-temperature",
            "question": "Separate near-real-time active-fire detection from land-surface-temperature context in a public safety workflow.",
            "answer": "Use NASA FIRMS VIIRS for near-real-time active-fire detections and Sentinel-3 SLSTR for land-surface-temperature context. Neither source should be overinterpreted: FIRMS can miss/delay detections and SLSTR thermal infrared does not observe through opaque cloud.",
            "sources": ["nasa-firms-viirs", "esa-sentinel-3-slstr"],
        },
    ]
    rows: list[dict[str, Any]] = []
    for scenario in scenarios:
        provenance = [f"terra_hazards/data_sources.json#{sid}" for sid in scenario["sources"]]
        for index, suffix in enumerate(("standard", "challenge"), start=1):
            user = str(scenario["question"])
            if suffix == "challenge":
                user += " The answer must explicitly identify what remains unknown or requires another check."
            rows.append(
                example(
                    example_id=f"plan-{scenario['id']}-{index:02d}",
                    group_key=f"plan|{scenario['id']}",
                    task="multi_source_plan",
                    user=user,
                    assistant=str(scenario["answer"]),
                    capabilities=["multi_source_plan", "sensor_complementarity", "claim_boundary"],
                    provenance=provenance,
                    safety_tags=["public_good", "no_unsupported_causality"],
                )
            )
    return rows


def calculation_examples() -> list[dict[str, Any]]:
    pairs = [
        (10.0, 9.0),
        (10.0, 7.0),
        (12.0, 9.0),
        (20.0, 25.0),
        (8.0, 8.0),
        (4.0, 3.2),
        (15.0, 12.0),
        (2.5, 2.0),
        (50.0, 40.0),
        (7.5, 9.0),
    ]
    rows: list[dict[str, Any]] = []
    for index, (before, after) in enumerate(pairs, start=1):
        difference = after - before
        percent = difference / before * 100.0
        answer = (
            f"Mapped-area difference: {difference:.3f} km2. Percentage change: {percent:.3f}%. "
            "Evidence class: DERIVED_VALUE. Water-volume change and physical cause remain UNKNOWN "
            "from mapped area alone."
        )
        rows.append(
            example(
                example_id=f"calc-area-{index:03d}",
                group_key=f"calculation|area|{index:03d}",
                task="deterministic_calculation",
                user=(
                    f"A reproducible mapping reports {before:.3f} km2 before and {after:.3f} km2 after. "
                    "Calculate mapped-area difference and percentage change, then state what cannot be inferred."
                ),
                assistant=answer,
                capabilities=["deterministic_calculation", "evidence_classification", "claim_boundary"],
                provenance=["deterministic_arithmetic"],
                safety_tags=["no_volume_inference", "no_causal_claim"],
            )
        )
    return rows


def recovery_examples() -> list[dict[str, Any]]:
    failures = [
        ("catalogue timeout", "retry within policy or report temporary source unavailability"),
        ("HTTP 429 rate limit", "respect backoff/rate limits and do not fabricate a response"),
        ("empty scene search", "record no suitable observation under the requested criteria"),
        ("missing credential for an approved API", "report the access blocker without exposing or inventing credentials"),
        ("malformed upstream JSON", "reject the malformed payload and preserve the failure in provenance logs"),
    ]
    rows: list[dict[str, Any]] = []
    for index, (failure, recovery) in enumerate(failures, start=1):
        rows.append(
            example(
                example_id=f"recovery-{index:03d}",
                group_key=f"recovery|{failure}",
                task="tool_recovery",
                user=f"An approved official EO tool returns {failure}. What is the scientifically safe next action?",
                assistant=(
                    f"Treat the tool call as failed: {recovery}. Keep the failed attempt in the run record. "
                    "Do not invent a scene, measurement, catalogue result, credential or successful analysis."
                ),
                capabilities=["tool_recovery", "scientific_honesty", "provenance"],
                provenance=["agent_policy"],
                safety_tags=["no_fabricated_tool_result"],
            )
        )
    return rows


def validate_example(row: dict[str, Any]) -> None:
    required = {
        "schema",
        "id",
        "split",
        "group_key",
        "task",
        "messages",
        "expected_capabilities",
        "provenance",
        "safety_tags",
    }
    missing = required - row.keys()
    if missing:
        raise ValueError(f"Example {row.get('id', '<unknown>')} missing {sorted(missing)}")
    if row["schema"] != SCHEMA:
        raise ValueError(f"Example {row['id']} has unsupported schema")
    if row["split"] not in {"train", "validation", "holdout"}:
        raise ValueError(f"Example {row['id']} has invalid split")
    messages = row["messages"]
    if not isinstance(messages, list) or [item.get("role") for item in messages] != [
        "system",
        "user",
        "assistant",
    ]:
        raise ValueError(f"Example {row['id']} must contain system/user/assistant messages")
    public_blob = json.dumps(row, ensure_ascii=False).casefold()
    forbidden = ("openai_api_key", "authorization: bearer", "chain-of-thought", "sk-proj-")
    hits = [marker for marker in forbidden if marker in public_blob]
    if hits:
        raise ValueError(f"Example {row['id']} contains forbidden markers: {hits}")


def build_dataset(registry_path: Path, seed_path: Path) -> list[dict[str, Any]]:
    raw_registry = load_json(registry_path)
    if not isinstance(raw_registry, list):
        raise ValueError("EO source registry must be a JSON list")
    sources = [normalize_source(dict(item)) for item in raw_registry if isinstance(item, dict)]
    if not sources:
        raise ValueError("EO source registry is empty")

    rows: list[dict[str, Any]] = []
    for source in sources:
        rows.extend(source_limit_examples(source))
    rows.extend(phenomenon_examples(sources))
    rows.extend(complementarity_examples())
    rows.extend(calculation_examples())
    rows.extend(recovery_examples())

    for seed in load_jsonl(seed_path):
        group_key = str(seed.get("group_key", seed.get("id", "seed")))
        normalized = {
            "schema": SCHEMA,
            "id": str(seed["id"]),
            "split": stable_split(group_key),
            "group_key": group_key,
            "task": str(seed["task"]),
            "messages": seed["messages"],
            "expected_capabilities": seed.get("expected_capabilities", []),
            "provenance": seed.get("provenance", []),
            "safety_tags": seed.get("safety_tags", []),
        }
        rows.append(normalized)

    ids = [str(row["id"]) for row in rows]
    duplicates = [item for item, count in Counter(ids).items() if count > 1]
    if duplicates:
        raise ValueError(f"Duplicate dataset ids: {duplicates}")
    for row in rows:
        validate_example(row)
    return sorted(rows, key=lambda item: str(item["id"]))


def write_dataset(rows: list[dict[str, Any]], output_dir: Path, registry_path: Path, seed_path: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    split_rows = {split: [row for row in rows if row["split"] == split] for split in ("train", "validation", "holdout")}
    files: dict[str, dict[str, Any]] = {}
    for split, selected in split_rows.items():
        path = output_dir / f"{split}.jsonl"
        text = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in selected)
        path.write_text(text, encoding="utf-8")
        files[split] = {
            "path": path.as_posix(),
            "examples": len(selected),
            "sha256": sha256_file(path),
        }

    task_counts = Counter(str(row["task"]) for row in rows)
    capability_counts = Counter(
        str(capability)
        for row in rows
        for capability in row.get("expected_capabilities", [])
    )
    manifest = {
        "schema": "terra-agentic-eo-public-good-manifest-v1",
        "dataset_schema": SCHEMA,
        "total_examples": len(rows),
        "splits": files,
        "task_counts": dict(sorted(task_counts.items())),
        "capability_counts": dict(sorted(capability_counts.items())),
        "source_registry": {
            "path": registry_path.as_posix(),
            "sha256": sha256_file(registry_path),
        },
        "curated_seed": {
            "path": seed_path.as_posix(),
            "sha256": sha256_file(seed_path),
        },
        "external_evaluation_exclusion": "config/agentic-eo-benchmark-v1.json (B01-B10 are not training data)",
        "evidence_policy": "official-public-only; synthetic instruction variants are not observations",
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Agentic EO Public Good Dataset v1")
    parser.add_argument("--registry", type=Path, default=Path("terra_hazards/data_sources.json"))
    parser.add_argument("--seed", type=Path, default=Path("datasets/agentic-eo-public-good-v1/seed.jsonl"))
    parser.add_argument("--output-dir", type=Path, default=Path("datasets/agentic-eo-public-good-v1/generated"))
    args = parser.parse_args()

    rows = build_dataset(args.registry, args.seed)
    manifest = write_dataset(rows, args.output_dir, args.registry, args.seed)
    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
