"""Golden-query evaluation for cold CodeSniff search artifacts."""

import json
import math
import time
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Iterable, List, Optional

from .search import CodeSearchResult, SearchEngine
from .text_search import TextSearchEngine
from .repo_overview import build_repo_overview
from ..storage.metadata_store import MetadataStore
from ..storage.vector_store import VectorStore


DEFAULT_TOP_K = 5
MAX_EVAL_LIMIT = 100
MAX_SMOKE_CASES = 40


@dataclass(frozen=True)
class GoldenQuery:
    """One expected retrieval result for a search-quality smoke suite."""

    query: str
    expected_symbol: Optional[str] = None
    expected_path: Optional[str] = None
    expected_type: Optional[str] = None
    top_k: int = DEFAULT_TOP_K


def load_golden_queries(path: str | Path) -> List[GoldenQuery]:
    """Load golden query cases from a JSON file."""
    cases, _baseline = load_golden_query_suite(path)
    return cases


def load_golden_query_suite(path: str | Path) -> tuple[List[GoldenQuery], Optional[Dict[str, Any]]]:
    """Load golden query cases plus optional repo-owned baseline thresholds."""
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    raw_cases = payload.get("queries") if isinstance(payload, dict) else payload
    if not isinstance(raw_cases, list):
        raise ValueError("Golden query file must be a list or an object with a 'queries' list")

    baseline = _normalize_baseline(payload.get("baseline")) if isinstance(payload, dict) else None
    return [golden_query_from_dict(item) for item in raw_cases], baseline


def golden_query_from_dict(item: Dict[str, Any]) -> GoldenQuery:
    """Create a validated golden query from a JSON object."""
    if not isinstance(item, dict):
        raise ValueError("Golden query entries must be objects")
    query = str(item.get("query") or "").strip()
    if not query:
        raise ValueError("Golden query entries require a non-empty query")

    top_k = int(item.get("top_k") or DEFAULT_TOP_K)
    top_k = max(1, min(top_k, MAX_EVAL_LIMIT))
    expected_symbol = _optional_text(item.get("expected_symbol"))
    expected_path = _optional_path(item.get("expected_path"))
    expected_type = _optional_text(item.get("expected_type"))
    if not any((expected_symbol, expected_path, expected_type)):
        raise ValueError(f"Golden query '{query}' needs at least one expected_* field")

    return GoldenQuery(
        query=query,
        expected_symbol=expected_symbol,
        expected_path=expected_path,
        expected_type=expected_type,
        top_k=top_k,
    )


def evaluate_search_quality(
    repo_db: str | Path,
    cases: Iterable[GoldenQuery],
    limit: int = 20,
    baseline: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Evaluate cold lexical search against a set of golden query cases."""
    repo_db = Path(repo_db)
    if not repo_db.exists():
        raise FileNotFoundError(f"Repo SQLite artifact is missing: {repo_db}")

    cases = list(cases)
    if not cases:
        raise ValueError("At least one golden query is required")

    metadata_store = MetadataStore(db_path=str(repo_db), read_only=True)
    try:
        search_engine = SearchEngine(
            embedder=None,
            vector_store=VectorStore(dimension=768),
            metadata_store=metadata_store,
            text_search=TextSearchEngine(),
            build_text_index=False,
        )
        results = [
            _evaluate_case(search_engine, case, limit=max(limit, case.top_k))
            for case in cases
        ]
    finally:
        metadata_store.close()

    passed = sum(1 for item in results if item["passed"])
    reciprocal_ranks = [
        (1.0 / item["rank"]) if item["rank"] else 0.0
        for item in results
    ]
    report = {
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "recall_at_k": passed / len(results),
        "mrr": sum(reciprocal_ranks) / len(reciprocal_ranks),
        "results": results,
    }
    _attach_baseline(report, baseline)
    return report


def evaluate_repo_search_smoke(
    repo_storage_path: str | Path,
    max_cases: int = 8,
    top_k: int = DEFAULT_TOP_K,
) -> Dict[str, Any]:
    """Evaluate curated or generated cold lexical smoke queries for one repo."""
    repo_path = Path(repo_storage_path)
    repo_db = repo_path / "repo.sqlite"
    max_cases = max(1, min(int(max_cases), MAX_SMOKE_CASES))
    top_k = max(1, min(int(top_k), MAX_EVAL_LIMIT))
    overview = build_repo_overview(0, str(repo_path))

    curated = build_curated_queries_from_overview(overview, max_cases=max_cases, top_k=top_k)
    if curated:
        return _evaluate_case_set(
            repo_db=repo_db,
            case_items=curated,
            top_k=top_k,
            warnings=[f"Using {len(curated)} curated search-quality case{'s' if len(curated) != 1 else ''} from repo config."],
            baseline=overview.get("search_quality_baseline") if isinstance(overview.get("search_quality_baseline"), dict) else None,
        )

    generated = build_smoke_queries_from_overview(overview, max_cases=max_cases, top_k=top_k)

    if not generated:
        return {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "recall_at_k": 0.0,
            "mrr": 0.0,
            "generated_cases": [],
            "results": [],
            "warnings": ["No searchable facts were available to generate smoke queries."],
        }

    return _evaluate_case_set(repo_db=repo_db, case_items=generated, top_k=top_k, warnings=[], baseline=None)


def build_curated_queries_from_overview(
    overview: Dict[str, Any],
    max_cases: int = 8,
    top_k: int = DEFAULT_TOP_K,
) -> List[Dict[str, Any]]:
    """Read cached repo-owned golden cases from overview facts."""
    max_cases = max(1, min(int(max_cases), MAX_SMOKE_CASES))
    top_k = max(1, min(int(top_k), MAX_EVAL_LIMIT))
    curated: List[Dict[str, Any]] = []
    for item in overview.get("search_quality_cases", []) or []:
        if len(curated) >= max_cases:
            break
        if not isinstance(item, dict):
            continue
        case_data = dict(item)
        case_data.setdefault("top_k", top_k)
        try:
            case = golden_query_from_dict(case_data)
        except (TypeError, ValueError):
            continue
        curated.append({"source": "curated", "case": case})
    return curated


def _evaluate_case_set(
    repo_db: Path,
    case_items: List[Dict[str, Any]],
    top_k: int,
    warnings: List[str],
    baseline: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    cases = [item["case"] for item in case_items]
    report = evaluate_search_quality(repo_db, cases, limit=top_k)
    source_by_query = {item["case"].query: item["source"] for item in case_items}
    for result in report["results"]:
        result["source"] = source_by_query.get(result["query"], "generated")
    report["generated_cases"] = [
        {
            "query": item["case"].query,
            "expected_symbol": item["case"].expected_symbol,
            "expected_path": item["case"].expected_path,
            "expected_type": item["case"].expected_type,
            "top_k": item["case"].top_k,
            "source": item["source"],
        }
        for item in case_items
    ]
    report["warnings"] = warnings
    _attach_baseline(report, baseline)
    return report


def _attach_baseline(report: Dict[str, Any], baseline: Optional[Dict[str, Any]]) -> None:
    """Attach repo-owned minimum quality thresholds and current deltas."""
    if not baseline:
        report["baseline"] = None
        return

    min_recall = _optional_float(baseline.get("min_recall_at_k"))
    min_mrr = _optional_float(baseline.get("min_mrr"))
    min_passed = _optional_int(baseline.get("min_passed"))
    if min_recall is None and min_mrr is None and min_passed is None:
        report["baseline"] = None
        return

    recall_delta = None if min_recall is None else report["recall_at_k"] - min_recall
    mrr_delta = None if min_mrr is None else report["mrr"] - min_mrr
    passed_delta = None if min_passed is None else report["passed"] - min_passed
    checks = [
        delta is None or delta >= 0
        for delta in (recall_delta, mrr_delta, passed_delta)
    ]
    met = all(checks)

    report["baseline"] = {
        "min_recall_at_k": min_recall,
        "min_mrr": min_mrr,
        "min_passed": min_passed,
        "recall_delta": recall_delta,
        "mrr_delta": mrr_delta,
        "passed_delta": passed_delta,
        "met": met,
    }
    if not met:
        misses = []
        if recall_delta is not None and recall_delta < 0:
            misses.append(f"recall {report['recall_at_k']:.2f} < {min_recall:.2f}")
        if mrr_delta is not None and mrr_delta < 0:
            misses.append(f"MRR {report['mrr']:.2f} < {min_mrr:.2f}")
        if passed_delta is not None and passed_delta < 0:
            misses.append(f"passed {report['passed']} < {min_passed}")
        report.setdefault("warnings", []).append(f"Search quality below baseline: {', '.join(misses)}.")


def attach_search_quality_baseline(report: Dict[str, Any], baseline: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Attach normalized baseline thresholds to an existing search-quality report."""
    _attach_baseline(report, baseline)
    return report


def _normalize_baseline(raw_baseline: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw_baseline, dict):
        return None
    baseline: Dict[str, Any] = {}
    min_recall = _optional_float(raw_baseline.get("min_recall_at_k"))
    min_mrr = _optional_float(raw_baseline.get("min_mrr"))
    min_passed = _optional_int(raw_baseline.get("min_passed"))
    if min_recall is not None:
        baseline["min_recall_at_k"] = min_recall
    if min_mrr is not None:
        baseline["min_mrr"] = min_mrr
    if min_passed is not None:
        baseline["min_passed"] = min_passed
    return baseline or None


def _optional_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(parsed):
        return None
    return max(0.0, min(parsed, 1.0))


def _optional_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(parsed):
        return None
    return max(0, int(parsed))


def build_smoke_queries_from_overview(
    overview: Dict[str, Any],
    max_cases: int = 8,
    top_k: int = DEFAULT_TOP_K,
) -> List[Dict[str, Any]]:
    """Derive high-signal golden queries from deterministic overview facts."""
    max_cases = max(1, min(int(max_cases), MAX_SMOKE_CASES))
    top_k = max(1, min(int(top_k), MAX_EVAL_LIMIT))
    generated: List[Dict[str, Any]] = []
    seen: set[tuple[Optional[str], Optional[str], Optional[str]]] = set()

    def append(source: str, query: Any, expected_path: Any = None, expected_symbol: Any = None, expected_type: Any = None):
        if len(generated) >= max_cases:
            return
        case_data = {
            "query": query,
            "expected_symbol": expected_symbol,
            "expected_path": expected_path,
            "expected_type": expected_type,
            "top_k": top_k,
        }
        try:
            case = golden_query_from_dict(case_data)
        except (TypeError, ValueError):
            return
        identity = (case.query, case.expected_path, case.expected_symbol)
        if identity in seen:
            return
        seen.add(identity)
        generated.append({"source": source, "case": case})

    for symbol in overview.get("top_symbols", []) or []:
        append(
            "symbol",
            symbol.get("name"),
            expected_path=symbol.get("path"),
            expected_symbol=symbol.get("name"),
            expected_type=symbol.get("symbol_type"),
        )

    for route in overview.get("route_endpoints", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (route.get("method"), route.get("path"), route.get("framework"))
            if str(part or "").strip()
        )
        append("route", query, expected_path=route.get("source_path"))

    for item in overview.get("api_contracts", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                item.get("protocol"),
                item.get("category"),
                item.get("name"),
                item.get("detail"),
            )
            if str(part or "").strip()
        )
        append("api_contract", query, expected_path=item.get("source_path"))

    for item in overview.get("ui_surfaces", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                item.get("framework"),
                item.get("category"),
                item.get("name"),
                item.get("detail"),
            )
            if str(part or "").strip()
        )
        append("ui_surface", query, expected_path=item.get("source_path"))

    for item in overview.get("mobile_surfaces", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                item.get("platform"),
                item.get("category"),
                item.get("name"),
                item.get("detail"),
            )
            if str(part or "").strip()
        )
        append("mobile_surface", query, expected_path=item.get("source_path"))

    for item in overview.get("cli_commands", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                item.get("category"),
                item.get("name"),
                item.get("command"),
                item.get("detail"),
            )
            if str(part or "").strip()
        )
        append("cli_command", query, expected_path=item.get("source_path"))

    for item in overview.get("test_systems", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                item.get("tool"),
                item.get("category"),
                item.get("name"),
                item.get("command"),
                item.get("detail"),
            )
            if str(part or "").strip()
        )
        append("test_system", query, expected_path=item.get("source_path"))

    for item in overview.get("release_processes", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                item.get("tool"),
                item.get("category"),
                item.get("name"),
                item.get("command"),
                item.get("detail"),
            )
            if str(part or "").strip()
        )
        append("release_process", query, expected_path=item.get("source_path"))

    for item in overview.get("quality_tools", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                item.get("tool"),
                item.get("category"),
                item.get("name"),
                item.get("command"),
                item.get("detail"),
            )
            if str(part or "").strip()
        )
        append("quality_tool", query, expected_path=item.get("source_path"))

    for item in overview.get("dev_environments", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                item.get("tool"),
                item.get("category"),
                item.get("name"),
                item.get("detail"),
            )
            if str(part or "").strip()
        )
        append("dev_environment", query, expected_path=item.get("source_path"))

    for item in overview.get("build_systems", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                item.get("tool"),
                item.get("category"),
                item.get("name"),
                item.get("command"),
                item.get("detail"),
            )
            if str(part or "").strip()
        )
        append("build_system", query, expected_path=item.get("source_path"))

    for item in overview.get("architecture_decisions", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                item.get("status"),
                item.get("category"),
                item.get("name"),
                item.get("detail"),
            )
            if str(part or "").strip()
        )
        append("architecture_decision", query, expected_path=item.get("source_path"))

    for command in overview.get("runbook_commands", []) or []:
        append(
            "runbook",
            command.get("command") or command.get("name"),
            expected_path=command.get("source_path"),
        )

    for workspace in overview.get("workspaces", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                workspace.get("manager"),
                workspace.get("workspace_kind"),
                workspace.get("path"),
                workspace.get("name"),
            )
            if str(part or "").strip()
        )
        append("workspace", query, expected_path=workspace.get("source_path"))

    for item in overview.get("supply_chain", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                item.get("tool"),
                item.get("category"),
                item.get("name"),
                item.get("ecosystem"),
            )
            if str(part or "").strip()
        )
        append("supply_chain", query, expected_path=item.get("source_path"))

    for item in overview.get("infra_resources", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                item.get("provider"),
                item.get("category"),
                item.get("resource_type"),
                item.get("name"),
            )
            if str(part or "").strip()
        )
        append("infra_resource", query, expected_path=item.get("source_path"))

    for dependency in overview.get("dependencies", []) or []:
        append(
            "dependency",
            dependency.get("name"),
            expected_path=dependency.get("source_path"),
        )

    for schema in overview.get("schema_facts", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (schema.get("schema_type"), schema.get("name"), schema.get("detail"))
            if str(part or "").strip()
        )
        append("schema", query, expected_path=schema.get("source_path"))

    for migration in overview.get("migration_facts", []) or []:
        query = " ".join(
            str(part).strip()
            for part in (
                migration.get("action"),
                migration.get("table"),
                migration.get("field"),
                migration.get("detail"),
            )
            if str(part or "").strip()
        )
        append("migration", query, expected_path=migration.get("source_path"))

    for item in overview.get("import_relationships", []) or []:
        append("import", item.get("target"), expected_path=item.get("source_path"))

    for item in (overview.get("docs", []) or []) + (overview.get("configs", []) or []) + (overview.get("tests", []) or []):
        append(item.get("kind") or "file", item.get("path"), expected_path=item.get("path"))

    return generated


def _evaluate_case(search_engine: SearchEngine, case: GoldenQuery, limit: int) -> Dict[str, Any]:
    start = time.perf_counter()
    results = search_engine.search(
        query=case.query,
        limit=min(max(limit, case.top_k), MAX_EVAL_LIMIT),
        min_similarity=0.0,
    )
    elapsed_ms = (time.perf_counter() - start) * 1000
    rank = _first_match_rank(results[:case.top_k], case)

    return {
        "query": case.query,
        "top_k": case.top_k,
        "passed": rank is not None,
        "rank": rank,
        "elapsed_ms": round(elapsed_ms, 3),
        "expected": {
            "symbol": case.expected_symbol,
            "path": case.expected_path,
            "type": case.expected_type,
        },
        "top_results": [
            {
                "rank": index + 1,
                "symbol": result.symbol_name,
                "path": _normalize_path(result.file_path),
                "type": result.symbol_type,
                "score": round(float(result.similarity_score), 6),
                "match_info": result.match_info,
            }
            for index, result in enumerate(results[:case.top_k])
        ],
    }


def _first_match_rank(results: List[CodeSearchResult], case: GoldenQuery) -> Optional[int]:
    for index, result in enumerate(results, 1):
        if _result_matches(result, case):
            return index
    return None


def _result_matches(result: CodeSearchResult, case: GoldenQuery) -> bool:
    if case.expected_symbol and result.symbol_name != case.expected_symbol:
        return False
    if case.expected_type and result.symbol_type != case.expected_type:
        return False
    if case.expected_path and not _path_matches(result.file_path, case.expected_path):
        return False
    return True


def _path_matches(actual_path: str, expected_path: str) -> bool:
    actual = _normalize_path(actual_path)
    expected = _normalize_path(expected_path)
    return actual == expected or actual.endswith(f"/{expected}")


def _normalize_path(path: str) -> str:
    return PurePosixPath(str(path or "").replace("\\", "/")).as_posix().lstrip("/")


def _optional_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_path(value: Any) -> Optional[str]:
    text = _optional_text(value)
    return _normalize_path(text) if text else None
