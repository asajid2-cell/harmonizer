"""Regression tests for lexical-first indexing and degraded semantic state."""

import os
from pathlib import Path
import subprocess
import sys

import pytest

from app.core.indexer import Indexer
from app.core.fast_index_benchmark import run_fast_index_benchmark
from app.core.search import SearchEngine
from app.core.text_search import TextSearchEngine
from app.storage.metadata_store import MetadataStore, SymbolRecord
from app.storage.vector_store import VectorStore
from scripts.benchmark_repo_job import run_repo_job_benchmark
from scripts.benchmark_scheduled_refresh import run_scheduled_refresh_benchmark
from scripts.benchmark_semantic_activation import run_semantic_activation_benchmark


class ExplodingEmbedder:
    def embed_query(self, query):
        raise AssertionError("embed_query should not be called")

    def generate_embedding(self, code):
        raise AssertionError("generate_embedding should not be called")

    def batch_generate(self, codes, batch_size=8, use_cache=True):
        raise AssertionError("batch_generate should not be called")


class EmptyVectorStore:
    vector_count = 0
    index = None

    def search(self, *args, **kwargs):
        raise AssertionError("vector search should not be called")

    def get_stats(self):
        return {"total_vectors": 0, "dimension": 768, "index_type": None}


def test_search_uses_lexical_results_when_vectors_are_missing(tmp_path):
    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    file_id = metadata.add_file("/repo/auth.py", total_lines=3)
    metadata.add_symbol(
        SymbolRecord(
            file_id=file_id,
            name="authenticate_user",
            symbol_type="function",
            code="def authenticate_user(username, password):\n    return True",
            start_line=1,
            end_line=2,
            docstring="Authenticate a user",
            embedding_id=0,
        )
    )

    search = SearchEngine(
        embedder=ExplodingEmbedder(),
        vector_store=EmptyVectorStore(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
    )

    results = search.search("authentication", limit=5)

    assert results
    assert results[0].symbol_name == "authenticate_user"
    assert "lexical" in (results[0].match_info or "")
    assert search.get_stats()["ready"] is True
    assert search.get_stats()["lexical_ready"] is True
    assert search.get_stats()["semantic_ready"] is False


def test_cold_search_uses_sqlite_fts_without_building_bm25(tmp_path):
    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    if not metadata.fts_available:
        pytest.skip("SQLite FTS5 is not available in this Python build")

    file_id = metadata.add_file("/repo/auth.py", total_lines=3)
    metadata.add_symbol(
        SymbolRecord(
            file_id=file_id,
            name="authenticate_user",
            symbol_type="function",
            code="def authenticate_user(username, password):\n    return True",
            start_line=1,
            end_line=2,
            docstring="Authenticate a user",
            embedding_id=0,
        )
    )

    search = SearchEngine(
        embedder=ExplodingEmbedder(),
        vector_store=EmptyVectorStore(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )

    results = search.search("authentication", limit=5)

    assert results
    assert results[0].symbol_name == "authenticate_user"
    assert search.text_search.doc_count == 0


def test_similar_code_returns_empty_when_vectors_are_missing(tmp_path):
    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    search = SearchEngine(
        embedder=ExplodingEmbedder(),
        vector_store=EmptyVectorStore(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
    )

    assert search.find_similar_code("def auth(): pass") == []


def test_lexical_only_indexing_does_not_call_embedder(tmp_path):
    source = tmp_path / "src"
    source.mkdir()
    (source / "auth.py").write_text(
        "def authenticate_user(username, password):\n"
        "    \"\"\"Authenticate a user\"\"\"\n"
        "    return True\n",
        encoding="utf-8",
    )
    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
    )

    stats = indexer.index_directory(str(source), show_progress=False, semantic=False)

    assert stats.files_processed == 1
    assert stats.total_symbols == 1
    assert metadata.get_stats()["total_symbols"] == 1
    assert indexer.vector_store.vector_count == 0


def test_generic_modern_and_config_files_are_searchable_from_cold_fts(tmp_path):
    source = tmp_path / "src"
    source.mkdir()
    (source / "README.md").write_text(
        "# Payments\n\nThe billing runbook explains redis queue recovery.\n",
        encoding="utf-8",
    )
    (source / "App.vue").write_text(
        "<template><CheckoutPanel /></template>\n<script setup>const paymentIntent = true</script>\n",
        encoding="utf-8",
    )
    (source / "Dockerfile").write_text(
        "FROM python:3.11\nENV WORKER_ROLE=invoice-worker\n",
        encoding="utf-8",
    )
    (source / "analysis.R").write_text("# tidyverse cohort revenue model\n", encoding="utf-8")
    (source / "plugin.lua").write_text("-- lua cache hydration hook\n", encoding="utf-8")
    (source / "script.pl").write_text("# perl invoice reconciliation task\n", encoding="utf-8")
    (source / "worker.ex").write_text("defmodule BillingWorker do\n  @moduledoc \"phoenix supervisor queue\"\nend\n", encoding="utf-8")
    (source / "service.erl").write_text("% erlang mailbox consumer\n", encoding="utf-8")
    (source / "interop.m").write_text("// notification bridge for objc runtime\n", encoding="utf-8")
    (source / "build.gradle").write_text("tasks.register('gradleSmokeSuite') { }\n", encoding="utf-8")
    (source / "notebook.jl").write_text("# julia optimizer for inventory balance\n", encoding="utf-8")
    (source / "Risk.fs").write_text("// fsharp calculator for premium exposure\n", encoding="utf-8")
    (source / "handler.clj").write_text("; clojure ring handler middleware\n", encoding="utf-8")
    (source / "allocator.zig").write_text("// zig allocator boundary check\n", encoding="utf-8")
    (source / "deploy.ps1").write_text("# powershell deployment rehearsal\n", encoding="utf-8")
    (source / "schema.graphql").write_text("type Query { graphqlLedger: String }\n", encoding="utf-8")
    (source / "events.proto").write_text("message InvoiceEvent { string protobuf_kafka_topic = 1; }\n", encoding="utf-8")
    (source / "main.hcl").write_text("boundary = \"hcl policy\"\n", encoding="utf-8")
    (source / "schema.prisma").write_text("model Invoice { id String @id }\n", encoding="utf-8")
    ignored = source / "node_modules"
    ignored.mkdir()
    (ignored / "ignored.md").write_text("secret ignored dependency note", encoding="utf-8")

    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
    )

    stats = indexer.index_directory(str(source), show_progress=False, semantic=False)

    assert stats.files_processed == 19
    assert stats.total_symbols == 19
    symbol_types = metadata.get_stats()["by_type"]
    assert symbol_types["chunk"] == 16
    assert symbol_types["attribute"] == 1
    assert symbol_types["graphql_type"] == 1
    assert symbol_types["protobuf_message"] == 1

    cold_search = SearchEngine(
        embedder=ExplodingEmbedder(),
        vector_store=EmptyVectorStore(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )

    assert cold_search.search("redis queue", limit=5)[0].file_path.endswith("README.md")
    assert cold_search.search("payment intent", limit=5, language_filter=["vue"])[0].file_path.endswith("App.vue")
    assert cold_search.search("invoice worker", limit=5, language_filter=["dockerfile"])[0].file_path.endswith("Dockerfile")
    language_cases = [
        ("tidyverse cohort", "analysis.R", "r"),
        ("lua cache", "plugin.lua", "lua"),
        ("perl invoice", "script.pl", "perl"),
        ("phoenix supervisor", "worker.ex", "elixir"),
        ("erlang mailbox", "service.erl", "erlang"),
        ("notification bridge", "interop.m", "objective-c"),
        ("gradle smoke", "build.gradle", "gradle"),
        ("julia optimizer", "notebook.jl", "julia"),
        ("fsharp calculator", "Risk.fs", "fsharp"),
        ("clojure ring", "handler.clj", "clojure"),
        ("zig allocator", "allocator.zig", "zig"),
        ("powershell deployment", "deploy.ps1", "powershell"),
        ("graphql ledger", "schema.graphql", "graphql"),
        ("protobuf kafka", "events.proto", "protobuf"),
        ("hcl boundary", "main.hcl", "hcl"),
        ("model invoice", "schema.prisma", "prisma"),
    ]
    for query, expected_file, language in language_cases:
        results = cold_search.search(query, limit=5, language_filter=[language])
        assert results, f"expected cold search result for {query} filtered as {language}"
        assert results[0].file_path.endswith(expected_file)
    assert cold_search.search("ignored dependency", limit=5) == []


def test_directory_discovery_prunes_ignored_trees_before_indexing(tmp_path):
    source = tmp_path / "src"
    source.mkdir()
    (source / "b.py").write_text("def beta():\n    return True\n", encoding="utf-8")
    (source / "a.py").write_text("def alpha():\n    return True\n", encoding="utf-8")

    ignored = source / "node_modules" / "pkg" / "deep"
    ignored.mkdir(parents=True)
    for idx in range(25):
        (ignored / f"ignored_{idx}.py").write_text("def ignored():\n    return True\n", encoding="utf-8")

    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
    )

    stats = indexer.index_directory(str(source), show_progress=False, semantic=False)

    assert stats.directories_pruned == 1
    assert stats.files_discovered == 2
    assert stats.files_processed == 2
    assert stats.total_symbols == 2
    assert metadata.get_stats()["total_files"] == 2

    cursor = metadata.conn.cursor()
    indexed_paths = [Path(row["path"]).name for row in cursor.execute("SELECT path FROM files ORDER BY path").fetchall()]
    assert indexed_paths == ["a.py", "b.py"]


def test_index_discovery_skips_generated_build_artifacts_and_lockfiles(tmp_path):
    source = tmp_path / "src"
    source.mkdir()
    (source / "app.py").write_text("def app_marker():\n    return True\n", encoding="utf-8")
    build_asset = source / "frontend" / "codesniff-app" / "assets"
    build_asset.mkdir(parents=True)
    (build_asset / "index-xVNIn9Xd.js").write_text("function bundled(){ return true; }\n", encoding="utf-8")
    (source / "package-lock.json").write_text('{"lockfileVersion": 3}\n', encoding="utf-8")
    (source / "frontend" / "jquery-ui.min.js").write_text("function minified(){return true;}\n", encoding="utf-8")

    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )

    files, directories_pruned = indexer._discover_supported_files(source)

    assert directories_pruned == 1
    assert [path.name for path in files] == ["app.py"]


def test_fast_index_benchmark_reports_budget_and_skips_semantic_embedding(tmp_path):
    result = run_fast_index_benchmark(
        workdir=tmp_path,
        files=12,
        symbols_per_file=3,
        pruned_files=20,
        max_seconds=60,
    )

    assert result["files_discovered"] == 12
    assert result["directories_pruned"] == 1
    assert result["files_processed"] == 12
    assert result["files_failed"] == 0
    assert result["total_symbols"] == 36
    assert result["db_total_files"] == 12
    assert result["db_total_symbols"] == 36
    assert result["text_index_documents"] == 0
    assert result["seconds_per_1000_files"] is not None
    assert result["estimated_seconds_100k_files"] is not None
    assert result["estimated_seconds_100k_symbols"] is not None
    assert result["under_budget"] is True


def test_repo_job_benchmark_exercises_production_fast_index_wrapper(tmp_path):
    result = run_repo_job_benchmark(
        workdir=tmp_path / "repo-job-benchmark",
        files=4,
        symbols_per_file=1,
        pruned_files=3,
        max_seconds=30,
        index_mode="shallow",
        sample_blobs=0,
    )

    assert result["benchmark"] == "repo_job_wrapper"
    assert result["job_status"] == "complete"
    assert result["repo_status"] == "lexical_ready"
    assert result["manifest_index_mode"] == "shallow"
    assert result["job_files_indexed"] == 4
    assert result["job_symbols_indexed"] == 4
    assert result["db_total_files"] == 4
    assert result["db_total_symbols"] == 4
    assert result["storage_total_bytes"] > 0
    assert result["cold_search_results"] > 0
    assert result["cold_search_elapsed_ms"] >= 0
    assert result["under_budget"] is True


def test_repo_job_benchmark_can_stage_existing_source_tree(tmp_path):
    source = tmp_path / "existing-source"
    source.mkdir()
    (source / "app.py").write_text(
        "def authenticate_user(username, password):\n"
        "    return bool(username and password)\n",
        encoding="utf-8",
    )
    (source / "README.md").write_text("# Existing source\n", encoding="utf-8")
    ignored = source / "node_modules" / "ignored"
    ignored.mkdir(parents=True)
    (ignored / "package.js").write_text("export const ignored = true;\n", encoding="utf-8")

    result = run_repo_job_benchmark(
        workdir=tmp_path / "existing-source-benchmark",
        max_seconds=30,
        index_mode="deep",
        sample_blobs=1,
        search_query="authenticate_user",
        source_dir=source,
    )

    assert result["generated"]["source_mode"] == "copytree_pruned"
    assert result["generated"]["source_files"] == 2
    assert result["job_status"] == "complete"
    assert result["manifest_index_mode"] == "deep"
    assert result["db_total_files"] == 2
    assert result["cold_search_results"] > 0


def test_semantic_activation_benchmark_warms_and_lazy_loads_vectors(tmp_path):
    result = run_semantic_activation_benchmark(
        workdir=tmp_path / "semantic-activation",
        symbols=12,
        files=3,
        warm_batch_size=4,
    )

    assert result["benchmark"] == "semantic_activation"
    assert result["lexical_semantic_loaded"] is False
    assert result["symbols_embedded"] == 12
    assert result["vector_index_bytes"] > 0
    assert result["vector_metadata_bytes"] > 0
    assert result["semantic_loaded"] is True
    assert result["loaded_vector_count"] == 12
    assert result["first_semantic_results"] > 0
    assert result["warm_semantic_results"] > 0


def test_scheduled_refresh_benchmark_runs_due_refresh_through_runner(tmp_path):
    result = run_scheduled_refresh_benchmark(workdir=tmp_path / "scheduled-refresh")

    assert result["benchmark"] == "scheduled_refresh"
    assert result["runner_ran_work"] is True
    assert result["initial_job_status"] == "complete"
    assert result["initial_search_results"] > 0
    assert result["refresh_job_status"] == "complete"
    assert result["refresh_job_phase"] == "lexical_ready"
    assert result["repo_status"] == "lexical_ready"
    assert result["last_scheduled_refresh_at"] is not None
    assert result["next_refresh_at"] is not None
    assert result["updated_search_results"] > 0
    assert result["stale_search_results"] == 0


def test_lexical_initial_index_batches_symbol_writes(tmp_path, monkeypatch):
    monkeypatch.setenv("CODESNIFF_INDEX_READ_WORKERS", "2")
    source = tmp_path / "src"
    source.mkdir()
    for idx in range(5):
        (source / f"module_{idx}.py").write_text(
            f"def marker_{idx}():\n"
            f"    return {idx}\n",
            encoding="utf-8",
        )

    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    batch_sizes = []
    original_add_symbols_batch = metadata.add_symbols_batch

    def counted_add_symbols_batch(records):
        batch_sizes.append(len(records))
        return original_add_symbols_batch(records)

    monkeypatch.setattr(metadata, "add_symbols_batch", counted_add_symbols_batch)
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )

    stats = indexer.index_directory(str(source), show_progress=False, semantic=False)

    assert stats.files_processed == 5
    assert stats.total_symbols == 5
    assert batch_sizes == [5]
    rows = metadata.conn.execute("SELECT embedding_id FROM symbols ORDER BY embedding_id").fetchall()
    assert [row["embedding_id"] for row in rows] == [0, 1, 2, 3, 4]


def test_oversized_generic_file_uses_bounded_fallback_not_failure(tmp_path, monkeypatch):
    monkeypatch.setenv("CODESNIFF_GENERIC_CHUNK_MAX_BYTES", "64")
    monkeypatch.setenv("CODESNIFF_FULL_SOURCE_READ_MAX_BYTES", "4096")
    source = tmp_path / "src"
    source.mkdir()
    (source / "huge.md").write_text(
        "# Operations\n\n"
        "Queue recovery and billing cache notes.\n" * 20,
        encoding="utf-8",
    )
    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )

    stats = indexer.index_directory(str(source), show_progress=False, semantic=False)

    assert stats.files_discovered == 1
    assert stats.files_processed == 1
    assert stats.files_failed == 0
    db_stats = metadata.get_stats()
    assert db_stats["total_files"] == 1
    assert db_stats["by_type"]["file"] == 1
    assert db_stats["by_type"]["chunk"] >= 1
    row = metadata.conn.execute(
        "SELECT code, docstring FROM symbols WHERE symbol_type = 'file'"
    ).fetchone()
    assert "Bounded fallback" in row["code"]
    assert "skipped full parsing" in row["docstring"]


def test_oversized_symbol_file_uses_bounded_fallback_without_parser(tmp_path, monkeypatch):
    monkeypatch.setenv("CODESNIFF_SYMBOL_PARSE_MAX_BYTES", "80")
    monkeypatch.setenv("CODESNIFF_FULL_SOURCE_READ_MAX_BYTES", "4096")
    source = tmp_path / "src"
    source.mkdir()
    huge_source = (
        "def should_not_parse_as_symbol():\n"
        "    return 'still searchable from bounded chunks'\n"
        + "\n".join(f"VALUE_{idx} = {idx}" for idx in range(50))
    )
    huge_path = source / "huge.py"
    huge_path.write_text(huge_source, encoding="utf-8")
    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )

    def fail_parse(*_args, **_kwargs):
        raise AssertionError("oversized file should not reach the Python parser")

    monkeypatch.setattr(indexer.parser, "parse_source_bytes", fail_parse)

    stats = indexer.index_directory(str(source), show_progress=False, semantic=False)

    assert stats.files_discovered == 1
    assert stats.files_processed == 1
    assert stats.files_failed == 0
    assert stats.functions_indexed == 0
    db_stats = metadata.get_stats()
    assert db_stats["total_files"] == 1
    assert db_stats["by_type"]["file"] == 1
    assert db_stats["by_type"]["chunk"] >= 1
    rows = metadata.conn.execute(
        "SELECT name, symbol_type, code FROM symbols ORDER BY id"
    ).fetchall()
    assert rows[0]["symbol_type"] == "file"
    assert "Bounded fallback" in rows[0]["code"]
    assert any("should_not_parse_as_symbol" in row["code"] for row in rows)


def test_loaded_generic_source_bytes_are_reused_for_blob_storage(tmp_path, monkeypatch):
    source = tmp_path / "src"
    source.mkdir()
    doc_path = source / "README.md"
    source_bytes = b"# Operations\n\nQueue recovery and billing cache notes.\n"
    doc_path.write_bytes(source_bytes)
    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )

    def fail_read_bytes(_path):
        raise AssertionError("index_file reread generic source bytes")

    monkeypatch.setattr(Path, "read_bytes", fail_read_bytes)

    stats = indexer.index_file(
        str(doc_path),
        semantic=False,
        source_bytes=source_bytes,
        source_loaded=True,
    )

    assert stats.files_processed == 1
    assert stats.files_failed == 0
    row = metadata.conn.execute("SELECT id FROM files WHERE path = ?", (str(doc_path),)).fetchone()
    blob = metadata.get_file_blob(row["id"])
    assert blob["content"] == source_bytes


def test_oversized_symbol_code_is_capped_before_storage(tmp_path):
    source = tmp_path / "src"
    source.mkdir()
    huge_body = "\n".join(f"  const value_{idx} = {idx};" for idx in range(5000))
    (source / "huge.js").write_text(
        "function hugeGeneratedBlock() {\n"
        f"{huge_body}\n"
        "}\n",
        encoding="utf-8",
    )
    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )

    stats = indexer.index_directory(str(source), show_progress=False, semantic=False)

    assert stats.files_processed == 1
    row = metadata.conn.execute(
        "SELECT code FROM symbols WHERE name = ?",
        ("hugeGeneratedBlock",),
    ).fetchone()
    assert row is not None
    assert len(row["code"]) <= Indexer.MAX_STORED_SYMBOL_CODE_CHARS + len(Indexer.SYMBOL_TRUNCATION_MARKER)
    assert Indexer.SYMBOL_TRUNCATION_MARKER in row["code"]


def test_lexical_import_path_does_not_load_semantic_embedder():
    script = (
        "import sys\n"
        "import app.core.indexer\n"
        "import app.core.search\n"
        "import app.storage.active_repo_manager\n"
        "print('app.core.embedder' in sys.modules)\n"
    )
    env = os.environ.copy()
    env["PYTHONPATH"] = str(Path(__file__).resolve().parents[1])

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(Path(__file__).resolve().parents[1]),
        env=env,
        text=True,
        capture_output=True,
        check=True,
    )

    assert result.stdout.strip() == "False"


def test_shallow_index_creates_searchable_file_inventory_without_content_reads(tmp_path, monkeypatch):
    source = tmp_path / "src"
    nested = source / "services" / "payments"
    nested.mkdir(parents=True)
    (nested / "invoice_worker.py").write_text(
        "def should_not_be_read():\n    return 'content'\n",
        encoding="utf-8",
    )
    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )

    def fail_content_read(_path, *args, **kwargs):
        raise AssertionError("shallow indexing read source content")

    monkeypatch.setattr(Path, "read_bytes", fail_content_read)
    monkeypatch.setattr(Path, "read_text", fail_content_read)

    stats = indexer.index_directory(str(source), show_progress=False, semantic=False, shallow=True)

    assert stats.files_processed == 1
    assert stats.total_symbols == 1
    assert metadata.get_stats()["by_type"] == {"file": 1}
    row = metadata.conn.execute(
        "SELECT f.content_hash, s.name, s.code FROM files f JOIN symbols s ON s.file_id = f.id"
    ).fetchone()
    assert row["content_hash"].startswith("shallow:")
    assert row["name"] == "services/payments/invoice_worker.py"
    assert "invoice_worker.py" in row["code"]
    assert metadata.conn.execute("SELECT COUNT(*) FROM file_blobs").fetchone()[0] == 0

    search = SearchEngine(
        embedder=ExplodingEmbedder(),
        vector_store=EmptyVectorStore(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )
    results = search.search("payments invoice worker", limit=5, language_filter=["python"])
    assert results
    assert results[0].symbol_name == "services/payments/invoice_worker.py"


def test_shallow_index_batches_file_inventory_writes(tmp_path):
    source = tmp_path / "src"
    source.mkdir()
    for idx in range(5):
        (source / f"module_{idx}.py").write_text(
            f"def marker_{idx}():\n    return {idx}\n",
            encoding="utf-8",
        )

    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    batch_sizes = []
    original_add_symbols_batch = metadata.add_symbols_batch

    def counted_add_symbols_batch(records):
        batch_sizes.append(len(records))
        return original_add_symbols_batch(records)

    metadata.add_symbols_batch = counted_add_symbols_batch
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )

    stats = indexer.index_directory(str(source), show_progress=False, semantic=False, shallow=True)

    assert stats.files_processed == 5
    assert stats.total_symbols == 5
    assert batch_sizes == [5]
    rows = metadata.conn.execute("SELECT name, embedding_id FROM symbols ORDER BY embedding_id").fetchall()
    assert [row["name"] for row in rows] == [f"module_{idx}.py" for idx in range(5)]
    assert [row["embedding_id"] for row in rows] == [0, 1, 2, 3, 4]

    search = SearchEngine(
        embedder=ExplodingEmbedder(),
        vector_store=EmptyVectorStore(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )
    results = search.search("module_4", limit=5, language_filter=["python"])
    assert any(result.symbol_name == "module_4.py" for result in results)


def test_reindexing_same_file_replaces_symbols_instead_of_duplicating(tmp_path):
    source = tmp_path / "src"
    source.mkdir()
    code_path = source / "module.py"
    code_path.write_text("def first():\n    return 1\n", encoding="utf-8")
    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
    )

    indexer.index_directory(str(source), show_progress=False, semantic=False)
    code_path.write_text("def second():\n    return 2\n", encoding="utf-8")
    indexer.index_directory(str(source), show_progress=False, semantic=False)

    cursor = metadata.conn.cursor()
    names = [row["name"] for row in cursor.execute("SELECT name FROM symbols").fetchall()]
    assert names == ["second"]

    if metadata.fts_available:
        cold_search = SearchEngine(
            embedder=ExplodingEmbedder(),
            vector_store=EmptyVectorStore(),
            metadata_store=metadata,
            text_search=TextSearchEngine(),
            build_text_index=False,
        )

        assert cold_search.search("first", limit=5) == []
        assert cold_search.search("second", limit=5)[0].symbol_name == "second"


def test_corrupt_vector_index_resets_to_empty(tmp_path):
    vector_dir = tmp_path / "vector_index"
    vector_dir.mkdir()
    (vector_dir / "vectors.index").write_bytes(b"")

    store = VectorStore(dimension=768)

    with pytest.raises(RuntimeError):
        store.load(str(vector_dir))

    assert store.vector_count == 0
