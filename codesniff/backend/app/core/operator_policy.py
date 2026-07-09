"""Runtime operator policy helpers for CodeSniff."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List

from loguru import logger


DEFAULT_SOURCE_PRUNE_THRESHOLD_BYTES = 1_000_000_000

_KEEP_ALIASES = {"keep", "never", "off", "0", "false", "no"}
_AUTO_ALIASES = {"", "auto", "prune", "prune_large", "prune_shallow"}


@dataclass(frozen=True)
class SourceRetentionPolicy:
    """Operator-configured source checkout retention behavior."""

    mode: str
    prune_threshold_bytes: int
    raw_mode: str
    raw_prune_threshold_bytes: str
    warnings: List[str] = field(default_factory=list)

    @property
    def enabled(self) -> bool:
        return self.mode == "auto"

    @property
    def cleanup_policy(self) -> str:
        if not self.enabled:
            return "keep_managed_source_snapshots"
        return "prune_managed_shallow_github_source_after_manifest_commit"

    def should_prune(
        self,
        *,
        source_type: str,
        source_url: str | None,
        index_mode: str,
        source_bytes: int,
    ) -> bool:
        if not self.enabled:
            return False
        if index_mode != "shallow":
            return False
        if source_type != "github" or not source_url:
            return False
        return source_bytes >= self.prune_threshold_bytes

    def to_response(self) -> dict:
        return {
            "mode": self.mode,
            "enabled": self.enabled,
            "prune_threshold_bytes": self.prune_threshold_bytes,
            "cleanup_policy": self.cleanup_policy,
            "applies_to_source_types": ["github"] if self.enabled else [],
            "applies_to_index_modes": ["shallow"] if self.enabled else [],
            "managed_source_only": True,
            "rehydrate_on": ["refresh", "deep_enrich"] if self.enabled else [],
            "warnings": list(self.warnings),
        }


def get_source_retention_policy() -> SourceRetentionPolicy:
    raw_mode = os.getenv("CODESNIFF_SOURCE_RETENTION_MODE", "auto").strip().lower()
    warnings: List[str] = []

    if raw_mode in _KEEP_ALIASES:
        mode = "keep"
    elif raw_mode in _AUTO_ALIASES:
        mode = "auto"
    else:
        warnings.append(f"Unknown CODESNIFF_SOURCE_RETENTION_MODE={raw_mode}; using auto")
        logger.warning(warnings[-1])
        mode = "auto"

    raw_threshold = os.getenv(
        "CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES",
        str(DEFAULT_SOURCE_PRUNE_THRESHOLD_BYTES),
    ).strip()
    try:
        threshold = max(0, int(raw_threshold))
    except ValueError:
        warnings.append(
            "Invalid CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES="
            f"{raw_threshold}; using {DEFAULT_SOURCE_PRUNE_THRESHOLD_BYTES}"
        )
        logger.warning(warnings[-1])
        threshold = DEFAULT_SOURCE_PRUNE_THRESHOLD_BYTES

    return SourceRetentionPolicy(
        mode=mode,
        prune_threshold_bytes=threshold,
        raw_mode=raw_mode,
        raw_prune_threshold_bytes=raw_threshold,
        warnings=warnings,
    )
