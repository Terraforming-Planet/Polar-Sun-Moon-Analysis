from __future__ import annotations

import hashlib
import json
import math
import queue
import subprocess
import threading
import time
from collections import Counter
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol, cast

import numpy as np

from .training004_sources.landsat import RasterBackend, read_scientific_window
from .water_cycle_acquisition import UsgsLandsatSearcher, _rank_candidates
from .water_cycle_manifest import ANCHOR_HOLDOUT_REGION
from .water_cycle_pipeline import FROZEN_IDS, acquisition_key, iter_jsonl, split_for_group

RUN_SCHEMA = "terra-training-004-real-streaming-v1"
DERIVED_TARGET_CONFIG = {
    "schema": "terra-training-004-derived-water-change-target-v1",
    "indices": {
        "ndwi": "(green - nir) / (green + nir)",
        "mndwi": "(green - swir1) / (green + swir1)",
    },
    "score": "mean(0.5 * (after_ndwi-before_ndwi + after_mndwi-before_mndwi))",
    "classes": {"0": "water_signal_decrease", "1": "stable", "2": "water_signal_increase"},
    "threshold": 0.03,
    "evidence_class": "DERIVED",
    "environmental_ground_truth": False,
}
DERIVED_TARGET_CONFIG_HASH = hashlib.sha256(
    json.dumps(DERIVED_TARGET_CONFIG, sort_keys=True, separators=(",", ":")).encode()
).hexdigest()


def derive_water_change_target(before: np.ndarray, after: np.ndarray) -> tuple[int, float]:
    """Derive a reproducible weak label from quality-masked C2 surface reflectance."""
    epsilon = np.float32(1e-6)

    def index(array: np.ndarray, left: int, right: int) -> np.ndarray:
        denominator = array[left] + array[right]
        return np.where(
            np.abs(denominator) > epsilon,
            (array[left] - array[right]) / denominator,
            np.nan,
        )

    delta = 0.5 * (
        (index(after, 0, 2) - index(before, 0, 2))
        + (index(after, 0, 3) - index(before, 0, 3))
    )
    score = float(np.nanmean(delta))
    if not np.isfinite(score):
        raise LookupError("UNKNOWN_derived_target_has_no_valid_pixels")
    threshold = float(cast(float, DERIVED_TARGET_CONFIG["threshold"]))
    return (0 if score < -threshold else (2 if score > threshold else 1)), score


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def window_bbox(record: dict[str, Any]) -> tuple[float, float, float, float]:
    center = cast(dict[str, Any], record["sample_center"])
    lat, lon = float(center["lat"]), float(center["lon"])
    half_lat = 7.68 / 111.32
    half_lon = 7.68 / max(10.0, 111.32 * math.cos(math.radians(lat)))
    return lon - half_lon, lat - half_lat, lon + half_lon, lat + half_lat


def assert_training_record(record: dict[str, Any]) -> None:
    pack_id = str(record.get("pack_id", ""))
    region = str(record.get("region_id", ""))
    if pack_id in FROZEN_IDS or region == ANCHOR_HOLDOUT_REGION:
        raise ValueError(f"Evaluation leakage detected: {pack_id}/{region}")
    if split_for_group(region) != "train":
        raise ValueError(f"Non-training split presented to trainer: {pack_id}/{region}")


class ScientificPairSource(Protocol):
    def acquire(self, record: dict[str, Any]) -> dict[str, Any]: ...


class LandsatPairSource:
    """Resolve and range-read exactly two official Landsat C2 L2 AOI windows."""

    def __init__(
        self,
        searcher: UsgsLandsatSearcher,
        backend: RasterBackend,
        size: int = 256,
        max_scene_attempts: int = 4,
    ):
        self.searcher, self.backend, self.size = searcher, backend, size
        self.max_scene_attempts = max(1, max_scene_attempts)

    def _one(self, record: dict[str, Any], year: int, window: tuple[str, str]) -> dict[str, Any]:
        center = cast(dict[str, Any], record["sample_center"])
        items = self.searcher.search(
            lat=float(center["lat"]), lon=float(center["lon"]), year=year, window=window
        )
        candidates = _rank_candidates(
            items, lat=float(center["lat"]), lon=float(center["lon"]), year=year, window=window
        )
        if not candidates:
            raise LookupError("UNKNOWN_optical_unavailable")
        reasons: Counter[str] = Counter()
        for item in candidates[: self.max_scene_attempts]:
            try:
                result = read_scientific_window(
                    item, window_bbox(record), self.backend, size=self.size
                )
            except LookupError as exc:
                reasons[str(exc)] += 1
                continue
            if result["evidence_class"] == "OBSERVATION":
                return {"item": item, "window": result}
            reasons[str(result.get("reason", "UNKNOWN_quality_gate"))] += 1
        detail = ",".join(f"{reason}:{count}" for reason, count in sorted(reasons.items()))
        raise LookupError(
            "UNKNOWN_optical_unavailable_after_candidate_retry"
            + (f" ({detail})" if detail else "")
        )

    def acquire(self, record: dict[str, Any]) -> dict[str, Any]:
        season = cast(dict[str, Any], record["season"])
        if season.get("zone") == "tropical":
            raise LookupError("UNKNOWN_hydroclimatic_window_unresolved")
        temporal = cast(dict[str, Any], record["temporal"])
        primary_raw = cast(list[str], season["primary_window"])
        primary = (primary_raw[0], primary_raw[1])
        comparison = primary
        if temporal["mode"] == "within_year_seasonal_response":
            comparison_raw = cast(list[str], season["secondary_window"])
            comparison = (comparison_raw[0], comparison_raw[1])
        before = self._one(record, int(temporal["reference_year"]), primary)
        after = self._one(record, int(temporal["comparison_year"]), comparison)
        return self._payload(record, before, after)

    @staticmethod
    def _payload(
        record: dict[str, Any], before: dict[str, Any], after: dict[str, Any]
    ) -> dict[str, Any]:
        def metadata(value: dict[str, Any]) -> dict[str, Any]:
            item, window = value["item"], value["window"]
            properties = cast(dict[str, Any], item.get("properties", {}))
            return {
                "item_id": str(item.get("id", "")),
                "product_id": str(item.get("id", "")),
                "acquired_utc": properties.get("datetime") or properties.get("start_datetime"),
                "provider": "USGS",
                "mission": properties.get("platform") or window["platform"],
                "sensor": window["platform"],
                "processing_level": window["processing_level"],
                "native_resolution_m": window["native_resolution_m"],
                "valid_pixel_ratio": window["valid_pixel_ratio"],
                "quality": window["quality"],
                "slc_off_masked": window["slc_off_masked"],
                "assets": window["assets"],
            }

        arrays = tuple(
            np.stack([value["window"]["bands"][name] for name in ("green", "red", "nir", "swir1")])
            for value in (before, after)
        )
        return {
            "arrays": arrays,
            "provenance": {
                "schema": "terra-training-004-consumed-window-provenance-v1",
                "pack_id": record["pack_id"],
                "acquisition_key": acquisition_key(record),
                "region_id": record["region_id"],
                "category": record["category"],
                "sample_center": record["sample_center"],
                "window_bbox_wgs84": window_bbox(record),
                "pixel_dimensions": list(before["window"]["bands"]["green"].shape),
                "reference_year": record["temporal"]["reference_year"],
                "comparison_year": record["temporal"]["comparison_year"],
                "observations": [metadata(before), metadata(after)],
                "generated_satellite_pixels": False,
            },
        }


class CachedPairSource:
    """Persist reusable, acquisition-keyed scientific AOI blocks outside Git."""

    def __init__(self, source: ScientificPairSource, cache_dir: Path):
        self.source, self.cache_dir = source, cache_dir
        self.hits = 0
        self.misses = 0

    def acquire(self, record: dict[str, Any]) -> dict[str, Any]:
        key = acquisition_key(record)
        array_path = self.cache_dir / f"{key}.npz"
        metadata_path = self.cache_dir / f"{key}.json"
        if array_path.exists() and metadata_path.exists():
            loaded = np.load(array_path, allow_pickle=False)
            self.hits += 1
            return {
                "arrays": (loaded["before"], loaded["after"]),
                "provenance": json.loads(metadata_path.read_text(encoding="utf-8")),
            }
        payload = self.source.acquire(record)
        before, after = cast(tuple[np.ndarray, np.ndarray], payload["arrays"])
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        temporary = array_path.with_suffix(".tmp.npz")
        np.savez_compressed(temporary, before=before, after=after)
        temporary.replace(array_path)
        metadata_path.write_text(
            json.dumps(payload["provenance"], sort_keys=True, default=str) + "\n",
            encoding="utf-8",
        )
        self.misses += 1
        return payload


@dataclass
class StreamState:
    cursor: int = 0
    consumed: int = 0
    attempted: int = 0


class JsonStateStore:
    def __init__(self, root: Path):
        self.root = root
        self.state_path = root / "stream-state.json"
        self.resolved_path = root / "acquisition-state.jsonl"
        self.provenance_path = root / "consumed-provenance.jsonl"

    def load(self, seed: int, manifest_hash: str) -> StreamState:
        if not self.state_path.exists():
            return StreamState()
        raw = json.loads(self.state_path.read_text(encoding="utf-8"))
        if raw.get("schema") != RUN_SCHEMA or raw.get("seed") != seed:
            raise ValueError("Checkpoint run schema/seed mismatch")
        if raw.get("manifest_sha256") != manifest_hash:
            raise ValueError("Checkpoint manifest mismatch")
        return StreamState(int(raw["cursor"]), int(raw["consumed"]), int(raw["attempted"]))

    def save(self, state: StreamState, seed: int, manifest_hash: str) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        payload = {
            "schema": RUN_SCHEMA,
            "seed": seed,
            "manifest_sha256": manifest_hash,
            "cursor": state.cursor,
            "consumed": state.consumed,
            "attempted": state.attempted,
            "updated_utc": utc_now(),
        }
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        temporary.replace(self.state_path)

    @staticmethod
    def append(path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(payload, sort_keys=True, default=str) + "\n")


class TelemetrySampler:
    def __init__(self, path: Path, interval_s: float, queue_depth: Callable[[], int]):
        self.path, self.interval_s, self.queue_depth = path, max(2.0, interval_s), queue_depth
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        self.thread.join(timeout=self.interval_s + 2)

    def _run(self) -> None:
        while not self.stop_event.is_set():
            row: dict[str, Any] = {"timestamp_utc": utc_now(), "queue_depth": self.queue_depth()}
            try:
                psutil = __import__("psutil")

                memory = psutil.virtual_memory()
                row.update({"cpu_percent": psutil.cpu_percent(), "ram_used_bytes": memory.used})
            except ImportError:
                row.update({"cpu_percent": None, "ram_used_bytes": None})
            try:
                fields = (
                    "name,utilization.gpu,memory.used,memory.total,"
                    "utilization.memory,power.draw,temperature.gpu"
                )
                result = subprocess.run(
                    ["nvidia-smi", f"--query-gpu={fields}", "--format=csv,noheader,nounits"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    check=True,
                )
                values = [part.strip() for part in result.stdout.splitlines()[0].split(",")]
                row.update(
                    dict(
                        zip(
                            (
                                "gpu_name",
                                "gpu_utilization_percent",
                                "vram_used_mib",
                                "vram_total_mib",
                                "memory_utilization_percent",
                                "power_draw_w",
                                "temperature_c",
                            ),
                            values,
                            strict=True,
                        )
                    )
                )
            except (OSError, subprocess.SubprocessError, IndexError, ValueError):
                row["gpu_name"] = None
            JsonStateStore.append(self.path, row)
            self.stop_event.wait(self.interval_s)


def iter_training_records(manifest: Path, cursor: int) -> Iterator[tuple[int, dict[str, Any]]]:
    for index, record in enumerate(iter_jsonl(manifest)):
        if index < cursor:
            continue
        if (
            str(record.get("pack_id")) in FROZEN_IDS
            or record.get("region_id") == ANCHOR_HOLDOUT_REGION
        ):
            raise ValueError("Frozen evaluation record found in training manifest")
        if split_for_group(str(record["region_id"])) == "train":
            yield index, record


def run_stream(
    manifest: Path,
    output_dir: Path,
    source: ScientificPairSource,
    *,
    target: int,
    seed: int,
    workers: int,
    queue_size: int,
    batch_size: int,
    max_attempts: int | None,
    bootstrap_batch_size: int | None = None,
    first_batch_timeout_s: float | None = None,
    max_runtime_s: float | None = None,
    heartbeat_interval_s: float = 5.0,
    train_batch: Callable[[list[dict[str, Any]], StreamState], dict[str, Any]],
) -> dict[str, Any]:
    manifest_hash = file_sha256(manifest)
    store = JsonStateStore(output_dir)
    state = store.load(seed, manifest_hash)
    initial_consumed = state.consumed
    initial_attempted = state.attempted
    work: queue.Queue[tuple[int, int, dict[str, Any]] | None] = queue.Queue(maxsize=queue_size)
    ready: queue.Queue[tuple[int, int, dict[str, Any], dict[str, Any] | None, str | None]] = (
        queue.Queue(maxsize=queue_size)
    )
    counters: Counter[str] = Counter()
    stop = threading.Event()
    fatal: queue.SimpleQueue[BaseException] = queue.SimpleQueue()
    producer_exhausted = threading.Event()

    def bounded_put(target_queue: queue.Queue[Any], value: Any) -> bool:
        while not stop.is_set():
            try:
                target_queue.put(value, timeout=0.5)
                return True
            except queue.Full:
                continue
        return False

    def producer() -> None:
        try:
            for sequence, (index, record) in enumerate(
                iter_training_records(manifest, state.cursor)
            ):
                if stop.is_set():
                    break
                if not bounded_put(work, (sequence, index, record)):
                    break
        except BaseException as exc:
            fatal.put(exc)
        finally:
            producer_exhausted.set()
            for _ in range(workers):
                if not bounded_put(work, None):
                    break

    def worker() -> None:
        while True:
            try:
                value = work.get(timeout=0.5)
            except queue.Empty:
                if producer_exhausted.is_set() or stop.is_set():
                    bounded_put(ready, (-1, -1, {}, None, "WORKER_DONE"))
                    return
                continue
            try:
                if value is None:
                    bounded_put(ready, (-1, -1, {}, None, "WORKER_DONE"))
                    return
                sequence, index, record = value
                payload = source.acquire(record)
                bounded_put(ready, (sequence, index, record, payload, None))
            except Exception as exc:
                if isinstance(exc, LookupError):
                    bounded_put(
                        ready,
                        (sequence, index, record, None, f"{type(exc).__name__}: {exc}"),
                    )
                else:
                    fatal.put(exc)
                    stop.set()
                    return

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(max(1, workers))]
    producer_thread = threading.Thread(target=producer, daemon=True)
    telemetry = TelemetrySampler(output_dir / "telemetry.jsonl", 5.0, ready.qsize)
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    if bootstrap_batch_size is not None and bootstrap_batch_size <= 0:
        raise ValueError("bootstrap_batch_size must be positive")
    if max_runtime_s is not None and max_runtime_s <= 0:
        raise ValueError("max_runtime_s must be positive")
    started = time.monotonic()
    telemetry.start()
    for thread in threads:
        thread.start()
    producer_thread.start()
    batch: list[dict[str, Any]] = []
    done = 0
    training_metrics: dict[str, Any] = {}
    pending: dict[int, tuple[int, dict[str, Any], dict[str, Any] | None, str | None]] = {}
    expected_sequence = 0
    last_heartbeat = started - heartbeat_interval_s
    first_cuda_batch = state.consumed > 0

    def abort(exc: BaseException) -> None:
        stop.set()
        telemetry.stop()
        raise exc

    while state.consumed < target and (done < len(threads) or pending):
        try:
            fatal_error = fatal.get_nowait()
        except queue.Empty:
            fatal_error = None
        if fatal_error is not None:
            abort(fatal_error)
        now = time.monotonic()
        if max_runtime_s is not None and now - started >= max_runtime_s:
            counters["TIME_BUDGET_REACHED"] += 1
            break
        if now - last_heartbeat >= heartbeat_interval_s:
            print(
                "HEARTBEAT "
                f"attempted={state.attempted} resolved={counters['RESOLVED']} "
                f"rejected={counters['REJECTED']} UNKNOWN={counters['UNKNOWN']} "
                f"provider_errors={counters['PROVIDER_ERROR']} input_queue={work.qsize()} "
                f"ready_queue={ready.qsize()} cache_hits={int(getattr(source, 'hits', 0))}",
                flush=True,
            )
            last_heartbeat = now
        if (
            first_batch_timeout_s is not None
            and not first_cuda_batch
            and now - started >= first_batch_timeout_s
        ):
            abort(
                TimeoutError(
                    "No real scientific batch reached CUDA within "
                    f"{first_batch_timeout_s:.0f} seconds"
                )
            )
        if max_attempts is not None and state.attempted - initial_attempted >= max_attempts:
            break
        if expected_sequence in pending:
            index, record, payload, error = pending.pop(expected_sequence)
        else:
            try:
                sequence, index, record, payload, error = ready.get(timeout=0.5)
            except queue.Empty:
                try:
                    fatal_error = fatal.get_nowait()
                except queue.Empty:
                    fatal_error = None
                if fatal_error is not None:
                    abort(fatal_error)
                if (
                    producer_exhausted.is_set()
                    and work.empty()
                    and not any(t.is_alive() for t in threads)
                ):
                    if pending and expected_sequence not in pending:
                        abort(RuntimeError(f"Worker result sequence {expected_sequence} was lost"))
                    break
                dead = [index for index, thread in enumerate(threads) if not thread.is_alive()]
                if dead and done + len(dead) == len(threads) and not pending:
                    abort(RuntimeError(f"Acquisition workers died before completion: {dead}"))
                continue
            if error == "WORKER_DONE":
                done += 1
                continue
            pending[sequence] = (index, record, payload, error)
            continue
        expected_sequence += 1
        state.cursor = max(state.cursor, index + 1)
        state.attempted += 1
        if error is not None or payload is None:
            reason = error or "UNKNOWN"
            status = (
                "UNKNOWN" if "UNKNOWN" in reason or "LookupError" in reason else "PROVIDER_ERROR"
            )
            counters[status] += 1
            store.append(
                store.resolved_path,
                {"pack_id": record["pack_id"], "status": status, "reason": reason},
            )
            store.save(state, seed, manifest_hash)
            continue
        assert_training_record(record)
        batch.append(payload)
        required_batch = batch_size
        if not first_cuda_batch and bootstrap_batch_size is not None:
            required_batch = min(batch_size, bootstrap_batch_size)
        if len(batch) >= required_batch or state.consumed + len(batch) >= target:
            remaining = target - state.consumed
            selected = batch[:remaining]
            training_metrics = train_batch(selected, state)
            first_cuda_batch = True
            for item in selected:
                store.append(store.provenance_path, cast(dict[str, Any], item["provenance"]))
            state.consumed += len(selected)
            counters["RESOLVED"] += len(selected)
            batch = batch[len(selected) :]
            store.save(state, seed, manifest_hash)
    stop.set()
    telemetry.stop()
    try:
        raise fatal.get_nowait()
    except queue.Empty:
        pass
    elapsed = time.monotonic() - started
    status = (
        "PASS"
        if state.consumed == target
        else ("PARTIAL" if state.consumed else "PROVIDER_BLOCKED")
    )
    summary = {
        "schema": RUN_SCHEMA,
        "status": status,
        "requested_target": target,
        "real_scientific_windows_trained": state.consumed,
        "new_windows_this_invocation": state.consumed - initial_consumed,
        "attempted": state.attempted,
        "counts": dict(counters),
        "seed": seed,
        "manifest_sha256": manifest_hash,
        "elapsed_seconds": elapsed,
        "max_runtime_seconds": max_runtime_s,
        "time_budget_reached": bool(counters["TIME_BUDGET_REACHED"]),
        "test001_leakage": False,
        "benchmark_leakage": False,
        "mission_leakage": False,
        "checkpoint_resume": training_metrics.get("resume_proof", False),
        "training": training_metrics,
        "cache": {
            "hits": int(getattr(source, "hits", 0)),
            "misses": int(getattr(source, "misses", 0)),
        },
        "provenance_path": str(store.provenance_path),
        "telemetry_path": str(output_dir / "telemetry.jsonl"),
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return summary
