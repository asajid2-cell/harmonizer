"""Tests for benchmark harnesses used as reproducible refactor evidence."""

from pathlib import Path

from scripts.benchmark_repo_job import run_repo_job_benchmark
from scripts.benchmark_source_retention_recovery import run_source_retention_recovery_benchmark


def test_repo_job_benchmark_can_exercise_github_source_pruning(tmp_path, monkeypatch):
    monkeypatch.setenv("CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES", "1")
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "1")

    result = run_repo_job_benchmark(
        workdir=tmp_path / "bench",
        files=2,
        symbols_per_file=1,
        pruned_files=0,
        max_seconds=30,
        index_mode="shallow",
        sample_blobs=0,
        search_query="module_000001",
        source_type="github",
        source_url="https://github.com/example/large-repo",
    )

    assert result["job_status"] == "complete"
    assert result["manifest_index_mode"] == "shallow"
    assert result["manifest_source_available"] is False
    assert result["manifest_source_retention_policy"] == "pruned"
    assert result["manifest_source_retention_reason"] == "large_shallow_github_source"
    assert result["manifest_source_retention_bytes"] >= 1
    assert result["manifest_source_retention_threshold_bytes"] == 1
    assert result["cold_search_results"] >= 1

    repo_source_paths = list(Path(tmp_path / "bench" / "repos").glob("*/source"))
    assert repo_source_paths == []


def test_source_retention_recovery_benchmark_exercises_refresh_and_deep_paths(tmp_path):
    result = run_source_retention_recovery_benchmark(
        workdir=tmp_path / "recovery",
        files=2,
        operation="both",
        max_seconds=30,
        prune_threshold_bytes=1,
    )

    assert result["initial_job_status"] == "complete"
    assert result["initial_index_mode"] == "shallow"
    assert result["initial_source_retention_policy"] == "pruned"
    assert result["initial_source_available"] is False
    assert result["initial_search_results"] >= 1

    assert result["refresh_under_budget"] is True
    assert result["refresh_job_status"] == "complete"
    assert result["refresh_index_mode"] == "shallow"
    assert result["refresh_source_retention_policy"] == "pruned"
    assert result["refresh_source_available"] is False
    assert result["refresh_search_results"] >= 1
    assert result["refresh_stale_path_count"] == 0

    assert result["deep_under_budget"] is True
    assert result["deep_job_status"] == "complete"
    assert result["deep_index_mode"] == "deep"
    assert result["deep_source_retention_policy"] == "kept"
    assert result["deep_source_available"] is True
    assert result["deep_search_results"] >= 1

    assert result["repo_status"] == "lexical_ready"
