"""Regression tests for golden-query search quality evaluation."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

from app.core.indexer import Indexer
from app.core.search_quality import evaluate_search_quality, load_golden_queries
from app.core.text_search import TextSearchEngine
from app.storage.metadata_store import MetadataStore


class ExplodingEmbedder:
    def batch_generate(self, codes, batch_size=8, use_cache=True):
        raise AssertionError("batch_generate should not be called")

    def embed_query(self, query):
        raise AssertionError("embed_query should not be called")


def build_quality_fixture(tmp_path: Path) -> Path:
    source = tmp_path / "source"
    (source / "src").mkdir(parents=True)
    (source / "web").mkdir()

    (source / "src" / "auth.py").write_text(
        "def authenticate_user(username, password):\n"
        "    \"\"\"Authenticate a user with credentials and password checks.\"\"\"\n"
        "    return bool(username and password)\n",
        encoding="utf-8",
    )
    (source / "src" / "database.py").write_text(
        "def connect_database(dsn):\n"
        "    \"\"\"Open a database connection and run SQL health checks.\"\"\"\n"
        "    return dsn\n",
        encoding="utf-8",
    )
    (source / "web" / "server.ts").write_text(
        "export function registerHealthRoute(app) {\n"
        "  app.get('/health', (_request, response) => response.json({ ok: true }))\n"
        "}\n",
        encoding="utf-8",
    )
    (source / "package.json").write_text(
        json.dumps({
            "scripts": {
                "test": "vitest run --config strict.vitest.config.ts",
                "build": "vite build",
            },
            "dependencies": {"express": "^4.18.0"},
        }),
        encoding="utf-8",
    )

    repo_db = tmp_path / "repo.sqlite"
    metadata = MetadataStore(db_path=str(repo_db))
    try:
        indexer = Indexer(
            embedder=ExplodingEmbedder(),
            metadata_store=metadata,
            text_search=TextSearchEngine(),
            build_text_index=False,
        )
        indexer.index_directory(str(source), show_progress=False, semantic=False)
    finally:
        metadata.close()
    return repo_db


def test_search_quality_evaluator_reports_recall_and_mrr(tmp_path):
    repo_db = build_quality_fixture(tmp_path)
    cases = load_golden_queries(_write_golden_cases(tmp_path, [
        {
            "query": "authentication credentials",
            "expected_symbol": "authenticate_user",
            "expected_path": "src/auth.py",
            "expected_type": "function",
            "top_k": 3,
        },
        {
            "query": "database SQL connection",
            "expected_symbol": "connect_database",
            "expected_path": "src/database.py",
            "top_k": 3,
        },
        {
            "query": "health route response",
            "expected_symbol": "registerHealthRoute",
            "expected_path": "web/server.ts",
            "top_k": 3,
        },
        {
            "query": "strict vitest config",
            "expected_symbol": "package.json chunk 1",
            "expected_path": "package.json",
            "expected_type": "chunk",
            "top_k": 5,
        },
    ]))

    report = evaluate_search_quality(repo_db, cases)

    assert report["total"] == 4
    assert report["passed"] == 4
    assert report["failed"] == 0
    assert report["recall_at_k"] == pytest.approx(1.0)
    assert report["mrr"] >= 0.75
    assert all(item["top_results"] for item in report["results"])


def test_search_quality_evaluator_exposes_failed_queries(tmp_path):
    repo_db = build_quality_fixture(tmp_path)
    cases = load_golden_queries(_write_golden_cases(tmp_path, [
        {
            "query": "payment refund workflow",
            "expected_symbol": "refund_payment",
            "expected_path": "src/payments.py",
            "top_k": 3,
        }
    ]))

    report = evaluate_search_quality(repo_db, cases)

    assert report["total"] == 1
    assert report["passed"] == 0
    assert report["failed"] == 1
    assert report["recall_at_k"] == 0
    assert report["results"][0]["rank"] is None
    assert report["results"][0]["expected"]["symbol"] == "refund_payment"


def test_search_quality_loader_rejects_unverifiable_cases(tmp_path):
    path = _write_golden_cases(tmp_path, [{"query": "missing expectations"}])

    with pytest.raises(ValueError, match="expected_"):
        load_golden_queries(path)


def test_search_quality_cli_reports_suite_baseline(tmp_path):
    repo_db = build_quality_fixture(tmp_path)
    suite_path = _write_golden_cases(
        tmp_path,
        [
            {
                "query": "authentication credentials",
                "expected_symbol": "authenticate_user",
                "expected_path": "src/auth.py",
                "expected_type": "function",
                "top_k": 3,
            },
            {
                "query": "database SQL connection",
                "expected_symbol": "connect_database",
                "expected_path": "src/database.py",
                "top_k": 3,
            },
        ],
        baseline={"min_recall_at_k": 1.0, "min_mrr": 0.5, "min_passed": 2},
    )

    result = subprocess.run(
        [
            sys.executable,
            str(Path(__file__).resolve().parents[1] / "scripts" / "evaluate_search_quality.py"),
            str(repo_db),
            str(suite_path),
            "--json",
        ],
        capture_output=True,
        encoding="utf-8",
        check=False,
    )

    assert result.returncode == 0, result.stderr
    body = json.loads(result.stdout)
    assert body["passed_thresholds"] is True
    assert body["baseline"]["met"] is True
    assert body["baseline"]["min_passed"] == 2
    assert body["baseline"]["passed_delta"] == 0


def test_search_quality_cli_exits_nonzero_when_suite_baseline_fails(tmp_path):
    repo_db = build_quality_fixture(tmp_path)
    suite_path = _write_golden_cases(
        tmp_path,
        [
            {
                "query": "payment refund workflow",
                "expected_symbol": "refund_payment",
                "expected_path": "src/payments.py",
                "top_k": 3,
            },
        ],
        baseline={"min_recall_at_k": 1.0, "min_mrr": 1.0, "min_passed": 1},
    )

    result = subprocess.run(
        [
            sys.executable,
            str(Path(__file__).resolve().parents[1] / "scripts" / "evaluate_search_quality.py"),
            str(repo_db),
            str(suite_path),
            "--json",
        ],
        capture_output=True,
        encoding="utf-8",
        check=False,
    )

    assert result.returncode == 1
    body = json.loads(result.stdout)
    assert body["passed_thresholds"] is False
    assert body["baseline"]["met"] is False
    assert body["baseline"]["passed_delta"] == -1
    assert any("Search quality below baseline" in warning for warning in body["warnings"])


def test_search_quality_cli_can_use_repo_owned_or_generated_suite(tmp_path):
    build_quality_fixture(tmp_path)

    result = subprocess.run(
        [
            sys.executable,
            str(Path(__file__).resolve().parents[1] / "scripts" / "evaluate_search_quality.py"),
            str(tmp_path),
            "--max-cases",
            "3",
            "--top-k",
            "5",
            "--min-recall",
            "0.0",
            "--json",
        ],
        capture_output=True,
        encoding="utf-8",
        check=False,
    )

    assert result.returncode == 0, result.stderr
    body = json.loads(result.stdout)
    assert body["total"] > 0
    assert body["generated_cases"]
    assert body["baseline"]["met"] is True


def _write_golden_cases(tmp_path: Path, cases, baseline=None) -> Path:
    path = tmp_path / "golden_queries.json"
    payload = {"queries": cases}
    if baseline is not None:
        payload["baseline"] = baseline
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path
