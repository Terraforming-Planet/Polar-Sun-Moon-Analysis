from __future__ import annotations

import argparse
import hashlib
import io
import json
import random
import time
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

from .global_public_dataset import SEASONAL_DATES, Region, _cell_bbox, _gibs_url, _load_regions, _request
from .site_corpus import build_site_corpus
from .training import _augment, _build_model, _load_images


@dataclass(slots=True, frozen=True)
class WindowTask:
    task_index: int
    region_id: str
    region_name: str
    date: str
    cell: int
    bbox: tuple[float, float, float, float]
    source_url: str


def candidate_window_count(region_count: int, start_year: int, end_year: int, grid: int) -> int:
    years = max(0, end_year - start_year + 1)
    return years * len(SEASONAL_DATES) * max(0, region_count) * max(1, grid) ** 2


def task_from_index(
    index: int,
    regions: list[Region],
    *,
    start_year: int,
    end_year: int,
    grid: int,
    resolution: int,
) -> WindowTask:
    total = candidate_window_count(len(regions), start_year, end_year, grid)
    if not 0 <= index < total:
        raise IndexError(index)
    cells = grid * grid
    cell = index % cells
    cursor = index // cells
    region = regions[cursor % len(regions)]
    cursor //= len(regions)
    season = cursor % len(SEASONAL_DATES)
    year_offset = cursor // len(SEASONAL_DATES)
    year = start_year + year_offset
    month, day = SEASONAL_DATES[season]
    date = f"{year:04d}-{month:02d}-{day:02d}"
    bbox = _cell_bbox(region, grid, cell)
    return WindowTask(
        task_index=index,
        region_id=region.id,
        region_name=region.name,
        date=date,
        cell=cell,
        bbox=bbox,
        source_url=_gibs_url(date, bbox, resolution),
    )


def _append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, separators=(",", ":")) + "\n")


def _fetch_window(task: WindowTask, resolution: int) -> tuple[WindowTask, np.ndarray, str, int]:
    payload = _request(task.source_url, timeout=35.0, retries=3)
    with Image.open(io.BytesIO(payload)) as image:
        rgb = ImageOps.fit(
            image.convert("RGB"),
            (resolution, resolution),
            method=Image.Resampling.BILINEAR,
        )
        array = np.asarray(rgb, dtype=np.uint8)
    if array.shape != (resolution, resolution, 3):
        raise RuntimeError(f"Unexpected GIBS image shape: {array.shape}")
    sha256 = hashlib.sha256(payload).hexdigest()
    chw = np.transpose(array, (2, 0, 1)).copy()
    return task, chw, sha256, len(payload)


def _train_batch(
    arrays: list[np.ndarray],
    *,
    torch: Any,
    model: Any,
    optimizer: Any,
    scaler: Any,
    device: Any,
) -> float:
    clean = torch.from_numpy(np.stack(arrays)).pin_memory().to(
        device=device,
        dtype=torch.float32,
        non_blocking=True,
    ).div_(255.0)
    noisy = _augment(clean, torch)
    optimizer.zero_grad(set_to_none=True)
    with torch.amp.autocast("cuda", dtype=torch.float16, enabled=True):
        reconstructed = model(noisy)
        l1 = torch.nn.functional.l1_loss(reconstructed, clean)
        mse = torch.nn.functional.mse_loss(reconstructed, clean)
        loss = l1 + 0.25 * mse
    scaler.scale(loss).backward()
    scaler.step(optimizer)
    scaler.update()
    return float(loss.detach().item())


def run_streaming_training(
    repo_root: Path,
    *,
    duration_minutes: float,
    target_remote_windows: int,
    start_year: int,
    end_year: int,
    grid: int,
    workers: int,
    resolution: int,
    batch_size: int,
    seed: int,
) -> dict[str, Any]:
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for L4 streaming training.") from exc
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; the streaming run requires the NVIDIA L4.")

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = True

    regions = _load_regions(repo_root / "config" / "global_training_regions.json")
    pool_size = candidate_window_count(len(regions), start_year, end_year, grid)
    if pool_size < 1:
        raise RuntimeError("The NASA GIBS candidate window pool is empty.")

    local_records, local_manifest = build_site_corpus(repo_root, download_remote=False)
    local_paths = [repo_root / record.path for record in local_records]
    local_images, local_accepted = _load_images(local_paths, resolution)

    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    run_dir = repo_root / "research_runs" / f"stream_gibs_{stamp}"
    run_dir.mkdir(parents=True, exist_ok=True)
    streamed_path = run_dir / "streamed_windows.jsonl"
    failures_path = run_dir / "stream_failures.jsonl"

    device = torch.device("cuda")
    model = _build_model(torch).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-4)
    scaler = torch.amp.GradScaler("cuda", enabled=True)

    batch_limit = max(1, batch_size)
    worker_limit = max(1, workers)
    target = min(max(1, target_remote_windows), pool_size)
    task_indices = list(range(pool_size))
    random.Random(seed).shuffle(task_indices)
    task_iter = iter(task_indices)

    started = time.monotonic()
    deadline = started + max(1.0, duration_minutes * 60.0)
    last_report = started
    last_remote_train = started
    steps = 0
    samples_seen = 0
    local_replay_samples = 0
    remote_windows_trained = 0
    remote_bytes = 0
    failures = 0
    losses: list[float] = []
    seen_task_indices: set[int] = set()
    seen_content_hashes: set[str] = set()
    remote_batch: list[np.ndarray] = []
    remote_meta: list[dict[str, Any]] = []

    print(
        json.dumps(
            {
                "event": "streaming_gibs_start",
                "candidate_window_pool": pool_size,
                "target_remote_windows": target,
                "local_unique_images": len(local_accepted),
                "regions": len(regions),
                "years": [start_year, end_year],
                "grid": grid,
                "workers": worker_limit,
                "resolution": resolution,
                "source": "NASA GIBS MODIS/VIIRS true-color WMS",
            }
        ),
        flush=True,
    )

    if len(local_images) >= 4:
        for offset in range(0, len(local_images), batch_limit):
            arrays = [array for array in local_images[offset : offset + batch_limit]]
            if not arrays:
                continue
            loss = _train_batch(
                arrays,
                torch=torch,
                model=model,
                optimizer=optimizer,
                scaler=scaler,
                device=device,
            )
            losses.append(loss)
            steps += 1
            samples_seen += len(arrays)
            local_replay_samples += len(arrays)

    pending: dict[Future[tuple[WindowTask, np.ndarray, str, int]], WindowTask] = {}

    def submit_one(executor: ThreadPoolExecutor) -> bool:
        try:
            index = next(task_iter)
        except StopIteration:
            return False
        task = task_from_index(
            index,
            regions,
            start_year=start_year,
            end_year=end_year,
            grid=grid,
            resolution=resolution,
        )
        pending[executor.submit(_fetch_window, task, resolution)] = task
        return True

    with ThreadPoolExecutor(max_workers=worker_limit) as executor:
        for _ in range(worker_limit * 3):
            if not submit_one(executor):
                break

        while time.monotonic() < deadline and remote_windows_trained < target and pending:
            done, _ = wait(tuple(pending), timeout=1.0, return_when=FIRST_COMPLETED)
            if not done:
                if len(local_images) >= 4 and time.monotonic() - last_remote_train >= 1.0:
                    count = min(batch_limit, len(local_images))
                    indices = np.random.randint(0, len(local_images), size=count)
                    arrays = [local_images[index] for index in indices]
                    loss = _train_batch(
                        arrays,
                        torch=torch,
                        model=model,
                        optimizer=optimizer,
                        scaler=scaler,
                        device=device,
                    )
                    losses.append(loss)
                    steps += 1
                    samples_seen += count
                    local_replay_samples += count
                continue

            for future in done:
                task = pending.pop(future)
                try:
                    fetched_task, array, sha256, payload_bytes = future.result()
                except Exception as exc:  # network/image decoder boundary; log and continue
                    failures += 1
                    _append_jsonl(
                        failures_path,
                        {
                            "task_index": task.task_index,
                            "region_id": task.region_id,
                            "date": task.date,
                            "cell": task.cell,
                            "source_url": task.source_url,
                            "error": str(exc),
                        },
                    )
                else:
                    if fetched_task.task_index not in seen_task_indices:
                        seen_task_indices.add(fetched_task.task_index)
                        seen_content_hashes.add(sha256)
                        remote_bytes += payload_bytes
                        remote_batch.append(array)
                        remote_meta.append(
                            {
                                "task_index": fetched_task.task_index,
                                "region_id": fetched_task.region_id,
                                "region_name": fetched_task.region_name,
                                "observation_date": fetched_task.date,
                                "cell": fetched_task.cell,
                                "bbox": fetched_task.bbox,
                                "source_url": fetched_task.source_url,
                                "sha256": sha256,
                                "payload_bytes": payload_bytes,
                                "source": "NASA GIBS",
                                "source_family": "MODIS/VIIRS true-color WMS derived window",
                                "evidence_class": "OBSERVATION",
                            }
                        )
                if remote_windows_trained + len(remote_batch) < target:
                    submit_one(executor)

            while len(remote_batch) >= batch_limit and remote_windows_trained < target:
                arrays = remote_batch[:batch_limit]
                metas = remote_meta[:batch_limit]
                del remote_batch[:batch_limit]
                del remote_meta[:batch_limit]
                try:
                    loss = _train_batch(
                        arrays,
                        torch=torch,
                        model=model,
                        optimizer=optimizer,
                        scaler=scaler,
                        device=device,
                    )
                except torch.OutOfMemoryError:
                    torch.cuda.empty_cache()
                    batch_limit = max(1, batch_limit // 2)
                    remote_batch = arrays + remote_batch
                    remote_meta = metas + remote_meta
                    continue
                for meta in metas:
                    _append_jsonl(streamed_path, meta)
                remote_windows_trained += len(arrays)
                samples_seen += len(arrays)
                steps += 1
                losses.append(loss)
                last_remote_train = time.monotonic()

            now = time.monotonic()
            if now - last_report >= 10.0:
                elapsed = max(0.001, now - started)
                print(
                    json.dumps(
                        {
                            "event": "streaming_training_progress",
                            "remote_unique_windows_trained": remote_windows_trained,
                            "remote_unique_content_sha256": len(seen_content_hashes),
                            "candidate_window_pool": pool_size,
                            "target_remote_windows": target,
                            "local_unique_images": len(local_accepted),
                            "samples_seen": samples_seen,
                            "steps": steps,
                            "loss": round(losses[-1], 6) if losses else None,
                            "remote_windows_per_second": round(remote_windows_trained / elapsed, 3),
                            "remote_download_mb": round(remote_bytes / 1024**2, 2),
                            "failures": failures,
                        }
                    ),
                    flush=True,
                )
                last_report = now

    if remote_batch and time.monotonic() < deadline:
        arrays = remote_batch[: min(len(remote_batch), batch_limit, target - remote_windows_trained)]
        metas = remote_meta[: len(arrays)]
        if arrays:
            loss = _train_batch(
                arrays,
                torch=torch,
                model=model,
                optimizer=optimizer,
                scaler=scaler,
                device=device,
            )
            for meta in metas:
                _append_jsonl(streamed_path, meta)
            remote_windows_trained += len(arrays)
            samples_seen += len(arrays)
            steps += 1
            losses.append(loss)

    torch.cuda.synchronize()
    elapsed = time.monotonic() - started
    checkpoint = run_dir / "earth_observation_streaming_gibs.pt"
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "steps": steps,
            "samples_seen": samples_seen,
            "local_unique_images": len(local_accepted),
            "remote_unique_windows_trained": remote_windows_trained,
            "candidate_window_pool": pool_size,
            "training_mode": "self_supervised_denoising_streaming_gibs",
        },
        checkpoint,
    )

    summary: dict[str, Any] = {
        "schema": "tp26-streaming-gibs-training-v1",
        "run_id": run_dir.name,
        "training_mode": "self_supervised_denoising_streaming_gibs",
        "completed": True,
        "elapsed_seconds": elapsed,
        "candidate_window_pool": pool_size,
        "target_remote_windows": target,
        "remote_unique_windows_trained": remote_windows_trained,
        "remote_unique_content_sha256": len(seen_content_hashes),
        "local_unique_images": len(local_accepted),
        "local_corpus_unique_count": local_manifest.get("unique_image_count"),
        "samples_seen": samples_seen,
        "local_replay_samples": local_replay_samples,
        "steps": steps,
        "batch_size_final": batch_limit,
        "workers": worker_limit,
        "resolution": resolution,
        "remote_download_bytes": remote_bytes,
        "failures": failures,
        "loss_first": losses[0] if losses else None,
        "loss_last": losses[-1] if losses else None,
        "loss_best": min(losses) if losses else None,
        "checkpoint": checkpoint.as_posix(),
        "source": "NASA GIBS public MODIS/VIIRS true-color WMS",
        "evidence_class": "DERIVED_VALUE",
        "ground_truth_claim": False,
        "scientific_finding_claim": False,
        "causal_environmental_claim": False,
        "counting_note": (
            "remote_unique_windows_trained counts distinct requested geospatial/time WMS windows that "
            "were actually decoded and used for optimization. It is not a count of unique satellite "
            "source scenes. samples_seen includes local replay and must not be called an image count."
        ),
    }
    (run_dir / "metrics.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (run_dir / "training_manifest.json").write_text(
        json.dumps(
            {
                "schema": "tp26-streaming-gibs-manifest-v1",
                "regions": [asdict(region) for region in regions],
                "years": [start_year, end_year],
                "seasonal_dates": SEASONAL_DATES,
                "grid": grid,
                "candidate_window_pool": pool_size,
                "local_unique_images": len(local_accepted),
                "source": "NASA GIBS public MODIS/VIIRS true-color WMS",
                "streamed_windows_log": streamed_path.as_posix(),
                "failures_log": failures_path.as_posix(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(json.dumps({"event": "streaming_gibs_complete", **summary}), flush=True)
    print(f"Run saved to: {run_dir}", flush=True)
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Train immediately on the local research corpus while streaming distinct public NASA "
            "GIBS geospatial/time windows into the NVIDIA L4."
        )
    )
    parser.add_argument("--duration-minutes", type=float, default=60.0)
    parser.add_argument("--target-remote-windows", type=int, default=200000)
    parser.add_argument("--start-year", type=int, default=2000)
    parser.add_argument("--end-year", type=int, default=2026)
    parser.add_argument("--grid", type=int, default=8)
    parser.add_argument("--workers", type=int, default=32)
    parser.add_argument("--resolution", type=int, default=512)
    parser.add_argument("--batch-size", type=int, default=24)
    parser.add_argument("--seed", type=int, default=20260820)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    run_streaming_training(
        Path.cwd(),
        duration_minutes=args.duration_minutes,
        target_remote_windows=args.target_remote_windows,
        start_year=args.start_year,
        end_year=args.end_year,
        grid=max(1, args.grid),
        workers=max(1, args.workers),
        resolution=max(64, args.resolution),
        batch_size=max(1, args.batch_size),
        seed=args.seed,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
