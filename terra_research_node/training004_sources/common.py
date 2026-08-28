from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class EvidenceClass(StrEnum):
    OBSERVATION = "OBSERVATION"
    AUTHOR_FIELD_OBSERVATION = "AUTHOR_FIELD_OBSERVATION"
    DERIVED_VALUE = "DERIVED_VALUE"
    MODEL_ESTIMATE = "MODEL_ESTIMATE"
    HYPOTHESIS = "HYPOTHESIS"
    UNKNOWN = "UNKNOWN"


class GateState(StrEnum):
    RESOLVING = "LOADING/RESOLVING"
    READY = "READY"
    FALLBACK_READY = "FALLBACK_READY"
    UNAVAILABLE = "UNKNOWN/UNAVAILABLE"
    ERROR = "ERROR"


@dataclass(frozen=True)
class AssetRef:
    key: str
    href: str
    title: str | None = None
    media_type: str | None = None
    native_resolution_m: float = 30.0


def canonical_hash(payload: dict[str, Any]) -> str:
    import hashlib
    import json

    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
