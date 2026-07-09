"""Deterministic repo teaching walkthroughs from cold CodeSniff artifacts."""

import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from .repo_overview import build_repo_overview
from .search import SearchEngine
from .text_search import TextSearchEngine
from ..storage.metadata_store import MetadataStore
from ..storage.vector_store import VectorStore


MAX_TEACHING_CITATIONS = 6
MAX_TEACHING_STEPS = 6
MAX_QUERY_EVIDENCE = 8
QUERY_TOKEN_RE = re.compile(r"[a-zA-Z0-9_./:-]{2,}")


def build_repo_teaching(repo_id: int, repo_storage_path: str) -> Dict[str, Any]:
    """Build a cited, deterministic walkthrough from cached overview facts."""
    overview = build_repo_overview(repo_id, repo_storage_path)
    steps: List[Dict[str, Any]] = []

    _append_step(
        steps,
        "start",
        "Start",
        _start_summary(overview),
        _citations_from_file_facts(overview.get("entry_points", []), "entry_point")
        + _citations_from_file_facts(overview.get("docs", []), "doc"),
    )
    _append_step(
        steps,
        "run",
        "Run",
        _run_summary(overview),
        _citations_from_commands(overview.get("runbook_commands", []))
        + _citations_from_manifests(overview.get("dependency_manifests", []))
        + _citations_from_runtime_requirements(overview.get("runtime_requirements", [])),
    )
    _append_step(
        steps,
        "api",
        "APIs",
        _route_summary(overview),
        _citations_from_routes(overview.get("route_endpoints", [])),
    )
    _append_step(
        steps,
        "data",
        "Data",
        _data_summary(overview),
        _citations_from_schema(overview.get("schema_facts", [])),
    )
    _append_step(
        steps,
        "tests",
        "Tests",
        _test_summary(overview),
        _citations_from_file_facts(overview.get("tests", []), "test"),
    )
    _append_step(
        steps,
        "modules",
        "Modules",
        _module_summary(overview),
        _citations_from_modules(overview.get("modules", []))
        + _citations_from_imports(overview.get("import_relationships", [])),
    )

    warnings = list(overview.get("warnings", []))
    if not steps:
        warnings.append("No cited teaching steps could be derived from the current lexical artifact.")

    return {
        "repo_id": repo_id,
        "generated_from": "cold_overview_v1",
        "steps": steps[:MAX_TEACHING_STEPS],
        "warnings": warnings,
    }


def build_repo_teaching_query(
    repo_id: int,
    repo_storage_path: str,
    question: str,
    limit: int = 6,
) -> Dict[str, Any]:
    """Return cited, question-specific teaching evidence without semantic vectors."""
    clean_question = " ".join(str(question or "").split())[:500]
    query_tokens = _query_tokens(clean_question)
    if not clean_question or not query_tokens:
        raise ValueError("Question must contain searchable terms")

    repo_path = Path(repo_storage_path)
    overview = build_repo_overview(repo_id, repo_storage_path)
    evidence = _search_evidence(repo_path, clean_question, query_tokens, limit=max(limit, 6))
    evidence.extend(_overview_evidence(overview, query_tokens))
    ranked = _rank_evidence(evidence, query_tokens)

    warnings = list(overview.get("warnings", []))
    if not ranked:
        warnings.append("No cited cold-artifact evidence matched this question.")
    elif ranked[0]["score"] <= 0:
        warnings.append("No direct lexical overlap found; showing general repo guide evidence.")

    selected = ranked[:max(1, min(limit, MAX_QUERY_EVIDENCE))]
    return {
        "repo_id": repo_id,
        "question": clean_question,
        "generated_from": "cold_teaching_query_v1",
        "answer": _query_answer(clean_question, selected),
        "evidence": selected,
        "warnings": warnings,
    }


def _query_tokens(question: str) -> List[str]:
    stop = {
        "about", "after", "and", "are", "can", "does", "for", "from", "how",
        "into", "show", "tell", "that", "the", "this", "what", "when", "where",
        "which", "with", "work", "works",
    }
    tokens = []
    seen = set()
    for match in QUERY_TOKEN_RE.finditer(question.lower()):
        token = match.group(0).strip("._-:/")
        if len(token) < 2 or token in stop or token in seen:
            continue
        seen.add(token)
        tokens.append(token)
    return tokens


def _search_evidence(
    repo_path: Path,
    question: str,
    query_tokens: List[str],
    limit: int,
) -> List[Dict[str, Any]]:
    repo_db = repo_path / "repo.sqlite"
    if not repo_db.exists():
        raise FileNotFoundError(repo_db)

    metadata_store = MetadataStore(db_path=str(repo_db), read_only=True)
    try:
        search_engine = SearchEngine(
            embedder=None,
            vector_store=VectorStore(dimension=768),
            metadata_store=metadata_store,
            text_search=TextSearchEngine(),
            build_text_index=False,
        )
        results = search_engine.search(question, limit=limit, min_similarity=0.0)
    finally:
        metadata_store.close()

    evidence = []
    for result in results:
        source_path = _repo_relative_path_from_repo(result.file_path, repo_path)
        label = result.symbol_name or source_path or "search result"
        line = result.start_line if result.start_line and result.start_line > 0 else None
        summary = _sentence(
            f"{label} in {source_path}",
            f"matched the question through cold lexical search",
            result.match_info or "",
        )
        evidence.append(_evidence_item(
            kind="search_result",
            title=label,
            summary=summary,
            citations=[_citation(source_path, line, label, result.symbol_type or "symbol")],
            search_text=" ".join([
                result.symbol_name or "",
                result.symbol_type or "",
                result.file_path or "",
                result.docstring or "",
                result.code_snippet or "",
            ]),
            query_tokens=query_tokens,
        ))
    return evidence


def _overview_evidence(overview: Dict[str, Any], query_tokens: List[str]) -> List[Dict[str, Any]]:
    evidence: List[Dict[str, Any]] = []

    for route in overview.get("route_endpoints", []):
        label = f"{route.get('method', '')} {route.get('path', '')}".strip()
        evidence.append(_evidence_item(
            kind="route",
            title=label or "Route",
            summary=_sentence(label, "is defined by", route.get("framework") or "route extractor"),
            citations=[_citation(route.get("source_path"), route.get("line"), label or "route", "route_endpoint")],
            search_text=" ".join(str(route.get(key) or "") for key in ("method", "path", "framework", "source_path")),
            query_tokens=query_tokens,
        ))

    for item in overview.get("api_contracts", []):
        title = _api_contract_title(item)
        evidence.append(_evidence_item(
            kind="api_contract",
            title=title,
            summary=_sentence(title, "is declared by", item.get("source_path") or "API contract"),
            citations=[_citation(item.get("source_path"), item.get("line"), title, "api_contract")],
            search_text=" ".join(str(item.get(key) or "") for key in ("name", "category", "protocol", "source", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for item in overview.get("ui_surfaces", []):
        title = _ui_surface_title(item)
        evidence.append(_evidence_item(
            kind="ui_surface",
            title=title,
            summary=_sentence(title, "is declared by", item.get("source_path") or "UI source"),
            citations=[_citation(item.get("source_path"), item.get("line"), title, "ui_surface")],
            search_text=" ".join(str(item.get(key) or "") for key in ("name", "category", "framework", "source", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for item in overview.get("mobile_surfaces", []):
        title = _mobile_surface_title(item)
        evidence.append(_evidence_item(
            kind="mobile_surface",
            title=title,
            summary=_sentence(title, "is declared by", item.get("source_path") or "mobile config"),
            citations=[_citation(item.get("source_path"), item.get("line"), title, "mobile_surface")],
            search_text=" ".join(str(item.get(key) or "") for key in ("name", "category", "platform", "source", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for item in overview.get("cli_commands", []):
        title = _cli_command_title(item)
        evidence.append(_evidence_item(
            kind="cli_command",
            title=title,
            summary=_sentence(title, "is declared by", item.get("source_path") or "CLI entry point"),
            citations=[_citation(item.get("source_path"), item.get("line"), title, "cli_command")],
            search_text=" ".join(str(item.get(key) or "") for key in ("name", "category", "command", "source", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for item in overview.get("test_systems", []):
        title = _test_system_title(item)
        evidence.append(_evidence_item(
            kind="test_system",
            title=title,
            summary=_sentence(title, "is declared by", item.get("source_path") or "test configuration"),
            citations=[_citation(item.get("source_path"), item.get("line"), title, "test_system")],
            search_text=" ".join(str(item.get(key) or "") for key in ("name", "category", "tool", "command", "source", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for item in overview.get("release_processes", []):
        title = _release_process_title(item)
        evidence.append(_evidence_item(
            kind="release_process",
            title=title,
            summary=_sentence(title, "is declared by", item.get("source_path") or "release configuration"),
            citations=[_citation(item.get("source_path"), item.get("line"), title, "release_process")],
            search_text=" ".join(str(item.get(key) or "") for key in ("name", "category", "tool", "command", "source", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for item in overview.get("quality_tools", []):
        title = _quality_tool_title(item)
        evidence.append(_evidence_item(
            kind="quality_tool",
            title=title,
            summary=_sentence(title, "is declared by", item.get("source_path") or "quality tooling config"),
            citations=[_citation(item.get("source_path"), item.get("line"), title, "quality_tool")],
            search_text=" ".join(str(item.get(key) or "") for key in ("name", "category", "tool", "command", "source", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for item in overview.get("architecture_decisions", []):
        title = _architecture_decision_title(item)
        evidence.append(_evidence_item(
            kind="architecture_decision",
            title=title,
            summary=_sentence(title, "is documented by", item.get("source_path") or "architecture docs"),
            citations=[_citation(item.get("source_path"), item.get("line"), title, "architecture_decision")],
            search_text=" ".join(str(item.get(key) or "") for key in ("name", "category", "status", "source", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for item in overview.get("dev_environments", []):
        title = _dev_environment_title(item)
        evidence.append(_evidence_item(
            kind="dev_environment",
            title=title,
            summary=_sentence(title, "is declared by", item.get("source_path") or "developer setup config"),
            citations=[_citation(item.get("source_path"), item.get("line"), title, "dev_environment")],
            search_text=" ".join(str(item.get(key) or "") for key in ("name", "category", "tool", "source", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for item in overview.get("build_systems", []):
        title = _build_system_title(item)
        evidence.append(_evidence_item(
            kind="build_system",
            title=title,
            summary=_sentence(title, "is declared by", item.get("source_path") or "build manifest"),
            citations=[_citation(item.get("source_path"), item.get("line"), title, "build_system")],
            search_text=" ".join(str(item.get(key) or "") for key in ("name", "category", "tool", "command", "source", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for command in overview.get("runbook_commands", []):
        title = f"{command.get('category')}: {command.get('command')}".strip(": ")
        evidence.append(_evidence_item(
            kind="runbook",
            title=title or "Run command",
            summary=_sentence(command.get("name") or "Command", "comes from", command.get("source_path") or "manifest"),
            citations=[_citation(command.get("source_path"), None, command.get("command") or "command", "runbook_command")],
            search_text=" ".join(str(command.get(key) or "") for key in ("category", "name", "command", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for workspace in overview.get("workspaces", []):
        title = _workspace_title(workspace)
        evidence.append(_evidence_item(
            kind="workspace",
            title=title,
            summary=_sentence(title, "is declared by", workspace.get("source_path") or "workspace manifest"),
            citations=[_citation(workspace.get("source_path"), workspace.get("line"), title, "workspace")],
            search_text=" ".join(str(workspace.get(key) or "") for key in ("name", "path", "workspace_kind", "ecosystem", "manager", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for item in overview.get("supply_chain", []):
        title = _supply_chain_title(item)
        evidence.append(_evidence_item(
            kind="supply_chain",
            title=title,
            summary=_sentence(title, "is declared by", item.get("source_path") or "supply-chain config"),
            citations=[_citation(item.get("source_path"), item.get("line"), title, "supply_chain")],
            search_text=" ".join(str(item.get(key) or "") for key in ("name", "category", "tool", "ecosystem", "source", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for item in overview.get("infra_resources", []):
        title = _infra_resource_title(item)
        evidence.append(_evidence_item(
            kind="infra_resource",
            title=title,
            summary=_sentence(title, "is declared by", item.get("source_path") or "infrastructure config"),
            citations=[_citation(item.get("source_path"), item.get("line"), title, "infra_resource")],
            search_text=" ".join(str(item.get(key) or "") for key in ("provider", "category", "resource_type", "name", "source", "detail", "source_path")),
            query_tokens=query_tokens,
        ))

    for fact in overview.get("schema_facts", []):
        label = ":".join(str(part) for part in (fact.get("schema_type"), fact.get("name")) if part)
        schema_metadata = " ".join(
            str(fact.get(key) or "")
            for key in (
                "source",
                "model",
                "table",
                "field",
                "target_model",
                "target_table",
                "relation_type",
                "foreign_key",
                "references",
                "inverse",
                "through",
                "column",
            )
        )
        evidence.append(_evidence_item(
            kind="schema",
            title=label or "Data fact",
            summary=_sentence(label or "Data fact", "is described as", fact.get("detail") or "schema evidence"),
            citations=[_citation(fact.get("source_path"), fact.get("line"), fact.get("name") or label or "schema", "schema")],
            search_text=" ".join(str(fact.get(key) or "") for key in ("schema_type", "name", "detail", "source_path")) + " " + schema_metadata,
            query_tokens=query_tokens,
        ))

    for fact in overview.get("migration_facts", []):
        label = _migration_label(fact)
        migration_metadata = " ".join(
            str(fact.get(key) or "")
            for key in ("action", "table", "field", "source", "framework", "operation", "name")
        )
        evidence.append(_evidence_item(
            kind="migration",
            title=label or "Migration fact",
            summary=_sentence(label or "Migration fact", "is described as", fact.get("detail") or "migration evidence"),
            citations=[_citation(fact.get("source_path"), fact.get("line"), label or "migration", "migration")],
            search_text=" ".join(str(fact.get(key) or "") for key in ("action", "table", "field", "detail", "source_path")) + " " + migration_metadata,
            query_tokens=query_tokens,
        ))

    for env_var in overview.get("environment_variables", []):
        title = env_var.get("name") or "environment variable"
        evidence.append(_evidence_item(
            kind="env_var",
            title=title,
            summary=_sentence(title, "is declared by", env_var.get("source_path") or "environment config"),
            citations=[_citation(env_var.get("source_path"), env_var.get("line"), title, "env_var")],
            search_text=" ".join(str(env_var.get(key) or "") for key in ("name", "detail", "source_path", "source", "service")),
            query_tokens=query_tokens,
        ))

    for component in overview.get("stack_components", []):
        title = " ".join(str(component.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="stack_component",
            title=title or "stack component",
            summary=_sentence(title or "Stack component", "is inferred from", component.get("source_path") or "repo manifest"),
            citations=[_citation(component.get("source_path"), component.get("line"), title or "stack component", "stack_component")],
            search_text=" ".join(str(component.get(key) or "") for key in ("name", "category", "ecosystem", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for integration in overview.get("service_integrations", []):
        title = " ".join(str(integration.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="service_integration",
            title=title or "service integration",
            summary=_sentence(title or "Service integration", "is inferred from", integration.get("source_path") or "cold repo facts"),
            citations=[_citation(integration.get("source_path"), integration.get("line"), title or "service integration", "service_integration")],
            search_text=" ".join(str(integration.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for surface in overview.get("graphql_surfaces", []):
        title = " ".join(str(surface.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="graphql_surface",
            title=title or "GraphQL surface",
            summary=_sentence(title or "GraphQL surface", "is inferred from", surface.get("source_path") or "cold repo facts"),
            citations=[_citation(surface.get("source_path"), surface.get("line"), title or "GraphQL surface", "graphql_surface")],
            search_text=" ".join(str(surface.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for bus in overview.get("message_buses", []):
        title = " ".join(str(bus.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="message_bus",
            title=title or "message bus",
            summary=_sentence(title or "Message bus", "is inferred from", bus.get("source_path") or "cold repo facts"),
            citations=[_citation(bus.get("source_path"), bus.get("line"), title or "message bus", "message_bus")],
            search_text=" ".join(str(bus.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for store in overview.get("data_stores", []):
        title = " ".join(str(store.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="data_store",
            title=title or "data store",
            summary=_sentence(title or "Data store", "is inferred from", store.get("source_path") or "cold repo facts"),
            citations=[_citation(store.get("source_path"), store.get("line"), title or "data store", "data_store")],
            search_text=" ".join(str(store.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for surface in overview.get("ai_surfaces", []):
        title = " ".join(str(surface.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="ai_surface",
            title=title or "AI surface",
            summary=_sentence(title or "AI surface", "is inferred from", surface.get("source_path") or "cold repo facts"),
            citations=[_citation(surface.get("source_path"), surface.get("line"), title or "AI surface", "ai_surface")],
            search_text=" ".join(str(surface.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for surface in overview.get("payment_surfaces", []):
        title = " ".join(str(surface.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="payment_surface",
            title=title or "payment surface",
            summary=_sentence(title or "Payment surface", "is inferred from", surface.get("source_path") or "cold repo facts"),
            citations=[_citation(surface.get("source_path"), surface.get("line"), title or "payment surface", "payment_surface")],
            search_text=" ".join(str(surface.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for surface in overview.get("auth_surfaces", []):
        title = " ".join(str(surface.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="auth_surface",
            title=title or "auth surface",
            summary=_sentence(title or "Auth surface", "is inferred from", surface.get("source_path") or "cold repo facts"),
            citations=[_citation(surface.get("source_path"), surface.get("line"), title or "auth surface", "auth_surface")],
            search_text=" ".join(str(surface.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for job in overview.get("background_jobs", []):
        title = " ".join(str(job.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="background_job",
            title=title or "background job",
            summary=_sentence(title or "Background job", "is inferred from", job.get("source_path") or "cold repo facts"),
            citations=[_citation(job.get("source_path"), job.get("line"), title or "background job", "background_job")],
            search_text=" ".join(str(job.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for webhook in overview.get("webhook_surfaces", []):
        title = " ".join(str(webhook.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="webhook_surface",
            title=title or "webhook surface",
            summary=_sentence(title or "Webhook surface", "is inferred from", webhook.get("source_path") or "cold repo facts"),
            citations=[_citation(webhook.get("source_path"), webhook.get("line"), title or "webhook surface", "webhook_surface")],
            search_text=" ".join(str(webhook.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for surface in overview.get("observability_surfaces", []):
        title = " ".join(str(surface.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="observability_surface",
            title=title or "observability surface",
            summary=_sentence(title or "Observability surface", "is inferred from", surface.get("source_path") or "cold repo facts"),
            citations=[_citation(surface.get("source_path"), surface.get("line"), title or "observability surface", "observability_surface")],
            search_text=" ".join(str(surface.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for flag in overview.get("feature_flags", []):
        title = " ".join(str(flag.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="feature_flag",
            title=title or "feature flag",
            summary=_sentence(title or "Feature flag", "is inferred from", flag.get("source_path") or "cold repo facts"),
            citations=[_citation(flag.get("source_path"), flag.get("line"), title or "feature flag", "feature_flag")],
            search_text=" ".join(str(flag.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for surface in overview.get("notification_surfaces", []):
        title = " ".join(str(surface.get(key) or "") for key in ("name", "category")).strip()
        evidence.append(_evidence_item(
            kind="notification_surface",
            title=title or "notification surface",
            summary=_sentence(title or "Notification surface", "is inferred from", surface.get("source_path") or "cold repo facts"),
            citations=[_citation(surface.get("source_path"), surface.get("line"), title or "notification surface", "notification_surface")],
            search_text=" ".join(str(surface.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    baseline = overview.get("search_quality_baseline")
    if isinstance(baseline, dict):
        title = "Search quality baseline"
        evidence.append(_evidence_item(
            kind="search_quality",
            title=title,
            summary=_sentence(title, "requires", _search_quality_baseline_summary(baseline)),
            citations=[_citation(_search_quality_suite_source_path(overview), None, title, "search_quality")],
            search_text=" ".join([
                title,
                "quality search golden curated baseline threshold recall mrr passed suite",
                _search_quality_baseline_summary(baseline),
            ]),
            query_tokens=query_tokens,
        ))

    for case in overview.get("search_quality_cases", []):
        if not isinstance(case, dict):
            continue
        title = str(case.get("query") or "search-quality case")
        evidence.append(_evidence_item(
            kind="search_quality",
            title=title,
            summary=_sentence(title, "expects", _search_quality_case_summary(case)),
            citations=[_citation(case.get("source_path"), None, title, "search_quality")],
            search_text=" ".join([
                title,
                "quality search golden curated case expected suite",
                _search_quality_case_summary(case),
                str(case.get("source_path") or ""),
            ]),
            query_tokens=query_tokens,
        ))

    for workflow in overview.get("ci_workflows", []):
        title = workflow.get("name") or "CI workflow"
        evidence.append(_evidence_item(
            kind="ci_workflow",
            title=title,
            summary=_sentence(title, "is declared by", workflow.get("source_path") or "CI config"),
            citations=[_citation(workflow.get("source_path"), workflow.get("line"), title, "ci_workflow")],
            search_text=" ".join(
                [
                    str(workflow.get("name") or ""),
                    str(workflow.get("detail") or ""),
                    str(workflow.get("source_path") or ""),
                    str(workflow.get("provider") or ""),
                    " ".join(workflow.get("events") or []),
                    " ".join(workflow.get("jobs") or []),
                    " ".join(workflow.get("commands") or []),
                ]
            ),
            query_tokens=query_tokens,
        ))

    for service in overview.get("container_services", []):
        title = service.get("name") or "container service"
        evidence.append(_evidence_item(
            kind="container_service",
            title=title,
            summary=_sentence(title, "is declared by", service.get("source_path") or "Compose config"),
            citations=[_citation(service.get("source_path"), service.get("line"), title, "container_service")],
            search_text=" ".join(
                [
                    str(service.get("name") or ""),
                    str(service.get("detail") or ""),
                    str(service.get("source_path") or ""),
                    str(service.get("provider") or ""),
                    str(service.get("image") or ""),
                    str(service.get("build") or ""),
                    str(service.get("command") or ""),
                    " ".join(service.get("ports") or []),
                    " ".join(service.get("depends_on") or []),
                ]
            ),
            query_tokens=query_tokens,
        ))

    for target in overview.get("deploy_targets", []):
        title = " ".join(str(target.get(key) or "") for key in ("provider", "target_type", "name")).strip()
        evidence.append(_evidence_item(
            kind="deploy_target",
            title=title or "deploy target",
            summary=_sentence(title or "Deploy target", "is declared by", target.get("source_path") or "deployment config"),
            citations=[_citation(target.get("source_path"), target.get("line"), title or "deploy target", "deploy_target")],
            search_text=" ".join(str(target.get(key) or "") for key in ("provider", "target_type", "name", "source_path", "detail")),
            query_tokens=query_tokens,
        ))

    for runtime in overview.get("runtime_requirements", []):
        title = " ".join(str(runtime.get(key) or "") for key in ("runtime", "requirement")).strip()
        evidence.append(_evidence_item(
            kind="runtime_requirement",
            title=title or "runtime requirement",
            summary=_sentence(title or "Runtime requirement", "is declared by", runtime.get("source_path") or "repo manifest"),
            citations=[_citation(runtime.get("source_path"), runtime.get("line"), title or "runtime requirement", "runtime_requirement")],
            search_text=" ".join(str(runtime.get(key) or "") for key in ("runtime", "requirement", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for signal in overview.get("secret_signals", []):
        title = " ".join(str(signal.get(key) or "") for key in ("category", "name")).strip()
        evidence.append(_evidence_item(
            kind="secret_signal",
            title=title or "secret signal",
            summary=_sentence(title or "Secret signal", "is marked in", signal.get("source_path") or "source", "with value redacted"),
            citations=[_citation(signal.get("source_path"), signal.get("line"), title or "secret signal", "secret_signal")],
            search_text=" ".join(str(signal.get(key) or "") for key in ("name", "category", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for policy in overview.get("repo_policies", []):
        title = " ".join(str(policy.get(key) or "") for key in ("policy_type", "value")).strip()
        evidence.append(_evidence_item(
            kind="repo_policy",
            title=title or "repo policy",
            summary=_sentence(title or "Repo policy", "is declared by", policy.get("source_path") or "repo policy file"),
            citations=[_citation(policy.get("source_path"), policy.get("line"), title or "repo policy", "repo_policy")],
            search_text=" ".join(str(policy.get(key) or "") for key in ("policy_type", "name", "value", "source_path", "source", "detail")),
            query_tokens=query_tokens,
        ))

    for owner in overview.get("code_owners", []):
        owners = owner.get("owners") if isinstance(owner.get("owners"), list) else []
        title = f"{owner.get('pattern') or 'ownership rule'} {' '.join(str(item) for item in owners)}".strip()
        evidence.append(_evidence_item(
            kind="code_owner",
            title=title or "code owner",
            summary=_sentence(owner.get("pattern") or "Ownership rule", "is owned by", " ".join(str(item) for item in owners)),
            citations=[_citation(owner.get("source_path"), owner.get("line"), title or "code owner", "code_owner")],
            search_text=" ".join([str(owner.get("pattern") or ""), " ".join(str(item) for item in owners), str(owner.get("source_path") or ""), str(owner.get("detail") or "")]),
            query_tokens=query_tokens,
        ))

    for item, kind in [
        (overview.get("entry_points", []), "entry_point"),
        (overview.get("docs", []), "doc"),
        (overview.get("tests", []), "test"),
        (overview.get("configs", []), "config"),
    ]:
        for file_fact in item:
            path = file_fact.get("path")
            detail = file_fact.get("detail") or kind
            evidence.append(_evidence_item(
                kind=kind,
                title=path or detail,
                summary=_sentence(path or kind, "is indexed as", detail),
                citations=[_citation(path, 1, detail, kind)],
                search_text=" ".join(str(file_fact.get(key) or "") for key in ("path", "kind", "detail")),
                query_tokens=query_tokens,
            ))

    for section in overview.get("doc_sections", []):
        title = section.get("title") or "Documentation section"
        source_path = section.get("source_path")
        evidence.append(_evidence_item(
            kind="doc_section",
            title=title,
            summary=_sentence(title, "is documented in", source_path or "repo documentation"),
            citations=[_citation(source_path, section.get("line"), title, "doc_section")],
            search_text=" ".join(str(section.get(key) or "") for key in ("title", "source_path", "anchor")),
            query_tokens=query_tokens,
        ))

    for module in overview.get("modules", []):
        title = module.get("path") or "module"
        sample_files = module.get("sample_files") if isinstance(module.get("sample_files"), list) else []
        source_path = sample_files[0] if sample_files else title
        evidence.append(_evidence_item(
            kind="module",
            title=title,
            summary=f"{title} groups {int(module.get('file_count') or 0)} files and {int(module.get('symbol_count') or 0)} symbols.",
            citations=[_citation(source_path, 1, title, "module")],
            search_text=" ".join([title, " ".join(sample_files), " ".join(module.get("languages") or [])]),
            query_tokens=query_tokens,
        ))

    for dependency in overview.get("module_dependencies", []):
        source_module = dependency.get("source_module") or "module"
        target_module = dependency.get("target_module") or "module"
        title = f"{source_module} -> {target_module}"
        evidence.append(_evidence_item(
            kind="module_dependency",
            title=title,
            summary=f"{source_module} depends on {target_module} through {int(dependency.get('import_count') or 0)} resolved imports.",
            citations=[_citation(dependency.get("source_path"), dependency.get("source_line"), title, "module_dependency")],
            search_text=" ".join(str(dependency.get(key) or "") for key in ("source_module", "target_module", "source_path", "target_path", "import_count")),
            query_tokens=query_tokens,
        ))

    for symbol in overview.get("top_symbols", []):
        title = symbol.get("name") or "symbol"
        evidence.append(_evidence_item(
            kind="symbol",
            title=title,
            summary=_sentence(title, "is indexed in", symbol.get("path") or "source"),
            citations=[_citation(symbol.get("path"), symbol.get("start_line"), title, symbol.get("symbol_type") or "symbol")],
            search_text=" ".join(str(symbol.get(key) or "") for key in ("name", "symbol_type", "path")),
            query_tokens=query_tokens,
        ))

    return evidence


def _evidence_item(
    *,
    kind: str,
    title: str,
    summary: str,
    citations: List[Dict[str, Any]],
    search_text: str,
    query_tokens: List[str],
) -> Dict[str, Any]:
    cited = _dedupe_citations(citations)[:MAX_TEACHING_CITATIONS]
    score = _overlap_score(search_text, query_tokens) + _kind_score_bonus(kind, query_tokens)
    return {
        "kind": kind,
        "title": str(title or kind)[:180],
        "summary": str(summary or title or kind)[:500],
        "score": score,
        "citations": cited,
    }


def _rank_evidence(evidence: List[Dict[str, Any]], query_tokens: List[str]) -> List[Dict[str, Any]]:
    deduped = []
    seen = set()
    for item in evidence:
        citations = item.get("citations") or []
        if not citations:
            continue
        first = citations[0]
        identity = (item.get("kind"), item.get("title"), first.get("source_path"), first.get("source_line"))
        if identity in seen:
            continue
        seen.add(identity)
        deduped.append(item)

    priority = {
        "search_result": 0,
        "route": 1,
        "api_contract": 2,
        "architecture_decision": 3,
        "ui_surface": 3,
        "mobile_surface": 4,
        "cli_command": 5,
        "test_system": 6,
        "release_process": 7,
        "quality_tool": 8,
        "dev_environment": 9,
        "build_system": 10,
        "runbook": 11,
        "workspace": 12,
        "supply_chain": 13,
        "infra_resource": 14,
        "stack_component": 15,
        "service_integration": 16,
        "graphql_surface": 17,
        "message_bus": 18,
        "data_store": 19,
        "ai_surface": 20,
        "payment_surface": 21,
        "auth_surface": 22,
        "background_job": 23,
        "webhook_surface": 24,
        "observability_surface": 25,
        "feature_flag": 26,
        "notification_surface": 27,
        "search_quality": 28,
        "ci_workflow": 29,
        "container_service": 30,
        "deploy_target": 31,
        "secret_signal": 32,
        "runtime_requirement": 33,
        "repo_policy": 34,
        "code_owner": 35,
        "schema": 36,
        "migration": 37,
        "env_var": 38,
        "entry_point": 39,
        "module_dependency": 40,
        "module": 41,
        "symbol": 42,
        "test": 43,
        "doc": 44,
        "doc_section": 45,
        "config": 46,
    }
    return sorted(
        deduped,
        key=lambda item: (
            -float(item.get("score") or 0),
            priority.get(str(item.get("kind") or ""), 20),
            str(item.get("title") or ""),
        ),
    )


def _overlap_score(text: str, query_tokens: List[str]) -> float:
    lower = str(text or "").lower()
    if not lower:
        return 0.0
    score = 0.0
    for token in query_tokens:
        if token in lower:
            score += 1.0
        elif token.replace("_", "-") in lower or token.replace("-", "_") in lower:
            score += 0.5
    return score


def _kind_score_bonus(kind: str, query_tokens: List[str]) -> float:
    token_set = set(query_tokens)
    if kind == "route" and (
        "api" in token_set
        or "endpoint" in token_set
        or "endpoints" in token_set
        or any(token.startswith("rout") for token in token_set)
    ):
        return 2.0
    if kind == "api_contract" and token_set.intersection({"api", "contract", "contracts", "spec", "specs", "openapi", "swagger", "asyncapi", "postman", "protobuf", "proto", "grpc", "operation", "operations", "channel", "channels", "request", "requests", "schema", "schemas", "rpc", "service"}):
        return 2.0
    if kind == "ui_surface" and token_set.intersection({"ui", "frontend", "front-end", "screen", "screens", "page", "pages", "component", "components", "form", "forms", "react", "next", "nextjs", "vue", "svelte", "astro", "storybook", "story", "stories", "route", "routes", "view", "views"}):
        return 2.0
    if kind == "mobile_surface" and token_set.intersection({"mobile", "android", "ios", "iphone", "ipad", "flutter", "dart", "react-native", "reactnative", "expo", "manifest", "plist", "activity", "activities", "permission", "permissions", "scheme", "schemes", "deeplink", "deep-link", "bundle"}):
        return 2.0
    if kind == "cli_command" and token_set.intersection({"cli", "command", "commands", "console", "script", "scripts", "binary", "binaries", "executable", "executables", "bin", "admin", "tool", "tools", "entry", "entrypoint", "entrypoints", "go", "cargo", "poetry", "setuptools"}):
        return 2.0
    if kind == "test_system" and token_set.intersection({"test", "tests", "testing", "spec", "specs", "unit", "integration", "e2e", "runner", "framework", "pytest", "tox", "nox", "vitest", "jest", "playwright", "cypress", "mocha", "junit", "testng", "rspec", "phpunit", "pest", "xunit", "nunit", "mstest", "go", "cargo", "ctest"}):
        return 2.0
    if kind == "release_process" and token_set.intersection({"release", "releases", "publish", "publishing", "ship", "shipping", "version", "versioning", "tag", "tags", "changelog", "changeset", "changesets", "semantic-release", "release-it", "release-please", "goreleaser", "pypi", "npm", "crates", "rubygems", "twine", "cargo"}):
        return 2.0
    if kind == "quality_tool" and token_set.intersection({"quality", "check", "checks", "lint", "linter", "linters", "format", "formatter", "formatting", "typecheck", "type-check", "type", "static", "analysis", "analyze", "analyse", "eslint", "prettier", "biome", "stylelint", "typescript", "tsc", "ruff", "black", "isort", "mypy", "pyright", "pylint", "flake8", "bandit", "golangci-lint", "clippy", "rustfmt", "checkstyle", "spotbugs", "pmd", "detekt", "ktlint", "phpstan", "psalm", "rubocop", "sorbet", "shellcheck", "shfmt", "pre-commit"}):
        return 2.0
    if kind == "architecture_decision" and token_set.intersection({"architecture", "architectural", "adr", "adrs", "decision", "decisions", "rfc", "rfcs", "design", "proposal", "why", "rationale", "tradeoff", "tradeoffs", "status", "accepted", "proposed", "superseded", "context", "consequence", "consequences"}):
        return 2.0
    if kind == "dev_environment" and token_set.intersection({"dev", "developer", "development", "environment", "environments", "setup", "bootstrap", "codespaces", "devcontainer", "container", "vscode", "extension", "extensions", "nix", "flake", "devbox", "devenv", "direnv", "mise", "asdf", "tool", "tools", "tilt", "skaffold", "procfile", "foreman", "overmind", "local"}):
        return 2.0
    if kind == "build_system" and token_set.intersection({"build", "builds", "target", "targets", "task", "tasks", "toolchain", "compile", "compiler", "make", "just", "maven", "gradle", "cmake", "bazel", "buck", "meson", "ninja", "sbt", "mix", "xcode", "dotnet", ".net", "csproj", "sln", "project", "projects", "module", "modules", "plugin", "plugins"}):
        return 2.0
    if kind == "schema" and token_set.intersection({"data", "database", "db", "schema", "table", "tables", "model", "models", "relation", "relations", "relationship", "relationships", "association", "associations", "foreign", "key", "join", "belongs", "has"}):
        return 2.0
    if kind == "migration" and token_set.intersection({"migration", "migrations", "migrate", "schema", "change", "changes", "create", "table", "column", "field", "index", "alembic", "django", "rails", "laravel", "knex", "prisma", "entity", "framework"}):
        return 2.0
    if kind == "runbook" and token_set.intersection({"run", "setup", "start", "install", "command", "commands"}):
        return 2.0
    if kind == "workspace" and token_set.intersection({"workspace", "workspaces", "monorepo", "package", "packages", "project", "projects", "member", "members", "module", "modules", "pnpm", "yarn", "npm", "lerna", "nx", "cargo", "go.work"}):
        return 2.0
    if kind == "supply_chain" and token_set.intersection({"supply", "chain", "supply-chain", "lockfile", "lockfiles", "dependabot", "renovate", "codeql", "snyk", "trivy", "semgrep", "scorecard", "sbom", "spdx", "cyclonedx", "dependency", "dependencies", "vulnerability", "vulnerabilities", "security", "scan", "scanning", "review", "reproducible"}):
        return 2.0
    if kind == "infra_resource" and token_set.intersection({"infra", "infrastructure", "iac", "terraform", "opentofu", "tofu", "terragrunt", "pulumi", "cloudformation", "cfn", "sam", "serverless", "bicep", "cdk", "resource", "resources", "module", "modules", "stack", "stacks", "bucket", "lambda", "function", "vpc", "aws", "azure", "google", "gcp"}):
        return 2.0
    if kind == "env_var" and token_set.intersection({"env", "environment", "config", "configuration", "secret", "secrets", "variable", "variables", "setup"}):
        return 2.0
    if kind == "stack_component" and token_set.intersection({"stack", "framework", "frameworks", "library", "libraries", "dependency", "dependencies", "package", "packages", "tool", "tools", "next", "react", "fastapi", "django", "flask", "express", "nestjs", "prisma", "rails", "laravel", "spring"}):
        return 2.0
    if kind == "service_integration" and token_set.intersection({"integration", "integrations", "external", "service", "services", "provider", "providers", "database", "cache", "queue", "payment", "payments", "observability", "stripe", "sentry", "redis", "postgres", "openai", "email", "aws", "cloud"}):
        return 2.0
    if kind == "graphql_surface" and token_set.intersection({"graphql", "gql", "apollo", "schema", "schemas", "resolver", "resolvers", "query", "queries", "mutation", "mutations", "subscription", "subscriptions", "federation", "relay", "urql"}):
        return 2.0
    if kind == "message_bus" and token_set.intersection({"event", "events", "message", "messages", "messaging", "broker", "queue", "queues", "topic", "topics", "producer", "producers", "consumer", "consumers", "publisher", "subscriber", "pubsub", "pub", "sub", "kafka", "rabbitmq", "amqp", "nats", "sqs", "sns", "eventbridge", "mqtt", "servicebus", "eventhub"}):
        return 2.0
    if kind == "data_store" and token_set.intersection({"data", "store", "stores", "storage", "database", "databases", "db", "cache", "redis", "memcached", "postgres", "postgresql", "mysql", "mariadb", "mongo", "mongodb", "sqlite", "bucket", "blob", "s3", "gcs", "search", "elasticsearch", "opensearch", "meilisearch", "typesense", "vector", "qdrant", "pinecone", "weaviate"}):
        return 2.0
    if kind == "ai_surface" and token_set.intersection({"ai", "llm", "llms", "model", "models", "chat", "completion", "completions", "response", "responses", "prompt", "prompts", "embedding", "embeddings", "rag", "retrieval", "retriever", "agent", "agents", "assistant", "assistants", "openai", "anthropic", "claude", "gemini", "cohere", "mistral", "huggingface", "langchain", "llamaindex", "ollama", "replicate"}):
        return 2.0
    if kind == "payment_surface" and token_set.intersection({"payment", "payments", "billing", "bill", "checkout", "charge", "charges", "subscription", "subscriptions", "invoice", "invoices", "customer", "portal", "stripe", "paypal", "braintree", "square", "adyen", "razorpay", "paddle", "chargebee", "revenuecat"}):
        return 2.0
    if kind == "auth_surface" and token_set.intersection({"auth", "authentication", "authorization", "login", "session", "jwt", "token", "oauth", "oauth2", "oidc", "openid", "saml", "passport", "nextauth", "clerk", "auth0", "guard", "permission", "middleware"}):
        return 2.0
    if kind == "background_job" and token_set.intersection({"job", "jobs", "task", "tasks", "worker", "workers", "queue", "queues", "scheduler", "schedule", "scheduled", "cron", "crontab", "celery", "sidekiq", "bull", "bullmq", "temporal", "batch"}):
        return 2.0
    if kind == "webhook_surface" and token_set.intersection({"webhook", "webhooks", "callback", "callbacks", "event", "events", "signature", "stripe", "github", "slack", "shopify", "twilio", "paypal", "sendgrid", "mailgun"}):
        return 2.0
    if kind == "observability_surface" and token_set.intersection({"observability", "telemetry", "monitoring", "logs", "logging", "logger", "metrics", "metric", "tracing", "trace", "traces", "health", "readiness", "liveness", "sentry", "datadog", "newrelic", "new", "relic", "otel", "opentelemetry", "prometheus", "grafana"}):
        return 2.0
    if kind == "feature_flag" and token_set.intersection({"feature", "features", "flag", "flags", "toggle", "toggles", "experiment", "experiments", "gate", "gates", "launchdarkly", "unleash", "configcat", "split", "statsig", "growthbook", "posthog", "flagsmith", "openfeature"}):
        return 2.0
    if kind == "notification_surface" and token_set.intersection({"notification", "notifications", "notify", "notifier", "email", "emails", "mail", "mailer", "sms", "message", "messages", "push", "sendgrid", "resend", "mailgun", "postmark", "smtp", "twilio", "slack", "discord", "fcm", "firebase"}):
        return 2.0
    if kind == "search_quality" and token_set.intersection({"quality", "search", "golden", "curated", "suite", "baseline", "threshold", "thresholds", "recall", "mrr", "passed", "case", "cases", "expected"}):
        return 2.0
    if kind == "ci_workflow" and token_set.intersection({"ci", "workflow", "pipeline", "action", "actions", "build", "test", "tests", "deploy", "deployment", "release"}):
        return 2.0
    if kind == "container_service" and token_set.intersection({"container", "containers", "compose", "docker", "service", "services", "port", "ports", "depends", "dependency"}):
        return 2.0
    if kind == "deploy_target" and token_set.intersection({"deploy", "deployment", "deployments", "hosting", "host", "kubernetes", "k8s", "helm", "kustomize", "procfile", "vercel", "netlify", "systemd", "service", "ingress"}):
        return 2.0
    if kind == "runtime_requirement" and token_set.intersection({"runtime", "version", "versions", "toolchain", "node", "python", "ruby", "java", "go", "rust", "php", "setup", "install"}):
        return 2.0
    if kind == "module_dependency" and token_set.intersection({"module", "modules", "dependency", "dependencies", "depend", "depends", "graph", "import", "imports", "edge", "edges", "package", "packages"}):
        return 2.0
    if kind == "secret_signal" and token_set.intersection({"secret", "secrets", "token", "tokens", "password", "credential", "credentials", "api", "key", "keys", "dsn", "sensitive"}):
        return 2.0
    if kind == "repo_policy" and token_set.intersection({"license", "licence", "security", "policy", "policies", "contributing", "conduct", "vulnerability", "report"}):
        return 2.0
    if kind == "code_owner" and token_set.intersection({"owner", "owners", "ownership", "maintainer", "maintainers", "codeowner", "codeowners", "review", "reviewer"}):
        return 2.0
    if kind == "test" and any(token.startswith("test") for token in token_set):
        return 2.0
    if kind in {"doc", "doc_section"} and token_set.intersection({"doc", "docs", "documentation", "readme", "guide"}):
        return 2.0
    if kind == "doc_section":
        return 0.75
    return 0.0


def _query_answer(question: str, evidence: List[Dict[str, Any]]) -> str:
    if not evidence:
        return f"No cited cold-artifact evidence was found for: {question}"
    labels = [item.get("title") for item in evidence[:3] if item.get("title")]
    if not labels:
        return f"Cold artifacts found cited evidence for: {question}"
    return f"Cold artifacts point first to {', '.join(labels)}."


def _sentence(*parts: Any) -> str:
    text = " ".join(str(part).strip() for part in parts if str(part or "").strip())
    return text.rstrip(".") + "." if text else ""


def _search_quality_baseline_summary(baseline: Dict[str, Any]) -> str:
    parts = []
    if baseline.get("min_recall_at_k") is not None:
        try:
            parts.append(f"recall>={float(baseline['min_recall_at_k']) * 100:.0f}%")
        except (TypeError, ValueError):
            pass
    if baseline.get("min_mrr") is not None:
        try:
            parts.append(f"mrr>={float(baseline['min_mrr']):.2f}")
        except (TypeError, ValueError):
            pass
    if baseline.get("min_passed") is not None:
        try:
            parts.append(f"passed>={int(baseline['min_passed'])}")
        except (TypeError, ValueError):
            pass
    return ", ".join(parts) or "baseline thresholds"


def _search_quality_case_summary(case: Dict[str, Any]) -> str:
    expected = []
    if case.get("expected_symbol"):
        expected.append(str(case.get("expected_symbol")))
    if case.get("expected_path"):
        expected.append(str(case.get("expected_path")))
    if case.get("expected_type"):
        expected.append(str(case.get("expected_type")))
    top_k = case.get("top_k")
    suffix = f"; top_k={top_k}" if top_k is not None else ""
    return f"{' / '.join(expected) if expected else 'match'}{suffix}"


def _search_quality_suite_source_path(overview: Dict[str, Any]) -> Optional[str]:
    for case in overview.get("search_quality_cases", []) or []:
        if isinstance(case, dict) and case.get("source_path"):
            return str(case.get("source_path"))
    return None


def _migration_label(fact: Dict[str, Any]) -> str:
    action = str(fact.get("action") or "").strip()
    table = str(fact.get("table") or "").strip()
    field = str(fact.get("field") or "").strip()
    if field:
        return f"{action}:{table}.{field}".strip(":")
    return f"{action}:{table}".strip(":")


def _workspace_title(workspace: Dict[str, Any]) -> str:
    manager = str(workspace.get("manager") or "").strip()
    kind = str(workspace.get("workspace_kind") or "").strip()
    path = str(workspace.get("path") or workspace.get("name") or "").strip()
    return ":".join(part for part in (manager, kind, path) if part) or "workspace"


def _supply_chain_title(item: Dict[str, Any]) -> str:
    category = str(item.get("category") or "").strip()
    tool = str(item.get("tool") or "").strip()
    name = str(item.get("name") or "").strip()
    return ":".join(part for part in (category, tool, name) if part) or "supply-chain"


def _infra_resource_title(item: Dict[str, Any]) -> str:
    provider = str(item.get("provider") or "").strip()
    category = str(item.get("category") or "").strip()
    resource_type = str(item.get("resource_type") or "").strip()
    name = str(item.get("name") or "").strip()
    return ":".join(part for part in (provider, category, resource_type, name) if part) or "infra-resource"


def _api_contract_title(item: Dict[str, Any]) -> str:
    protocol = str(item.get("protocol") or "").strip()
    category = str(item.get("category") or "").strip()
    name = str(item.get("name") or "").strip()
    return ":".join(part for part in (protocol, category, name) if part) or "api-contract"


def _cli_command_title(item: Dict[str, Any]) -> str:
    category = str(item.get("category") or "").strip()
    name = str(item.get("name") or "").strip()
    command = str(item.get("command") or "").strip()
    return ":".join(part for part in (category, name, command) if part) or "cli-command"


def _test_system_title(item: Dict[str, Any]) -> str:
    tool = str(item.get("tool") or "").strip()
    category = str(item.get("category") or "").strip()
    name = str(item.get("name") or "").strip()
    return ":".join(part for part in (tool, category, name) if part) or "test-system"


def _release_process_title(item: Dict[str, Any]) -> str:
    tool = str(item.get("tool") or "").strip()
    category = str(item.get("category") or "").strip()
    name = str(item.get("name") or "").strip()
    return ":".join(part for part in (tool, category, name) if part) or "release-process"


def _quality_tool_title(item: Dict[str, Any]) -> str:
    tool = str(item.get("tool") or "").strip()
    category = str(item.get("category") or "").strip()
    name = str(item.get("name") or "").strip()
    return ":".join(part for part in (tool, category, name) if part) or "quality-tool"


def _architecture_decision_title(item: Dict[str, Any]) -> str:
    status = str(item.get("status") or "").strip()
    category = str(item.get("category") or "").strip()
    name = str(item.get("name") or "").strip()
    return ":".join(part for part in (status, category, name) if part) or "architecture-decision"


def _dev_environment_title(item: Dict[str, Any]) -> str:
    tool = str(item.get("tool") or "").strip()
    category = str(item.get("category") or "").strip()
    name = str(item.get("name") or "").strip()
    return ":".join(part for part in (tool, category, name) if part) or "dev-environment"


def _build_system_title(item: Dict[str, Any]) -> str:
    tool = str(item.get("tool") or "").strip()
    category = str(item.get("category") or "").strip()
    name = str(item.get("name") or "").strip()
    return ":".join(part for part in (tool, category, name) if part) or "build-system"


def _ui_surface_title(item: Dict[str, Any]) -> str:
    framework = str(item.get("framework") or "").strip()
    category = str(item.get("category") or "").strip()
    name = str(item.get("name") or "").strip()
    return ":".join(part for part in (framework, category, name) if part) or "ui-surface"


def _mobile_surface_title(item: Dict[str, Any]) -> str:
    platform = str(item.get("platform") or "").strip()
    category = str(item.get("category") or "").strip()
    name = str(item.get("name") or "").strip()
    return ":".join(part for part in (platform, category, name) if part) or "mobile-surface"


def _append_step(
    steps: List[Dict[str, Any]],
    step_id: str,
    title: str,
    summary: str,
    citations: List[Dict[str, Any]],
):
    cited = _dedupe_citations(citations)
    if not summary or not cited:
        return
    steps.append({
        "id": step_id,
        "title": title,
        "summary": summary,
        "citations": cited[:MAX_TEACHING_CITATIONS],
    })


def _start_summary(overview: Dict[str, Any]) -> str:
    entries = [item.get("path") for item in overview.get("entry_points", [])[:3] if item.get("path")]
    docs = [item.get("path") for item in overview.get("docs", [])[:2] if item.get("path")]
    languages = [item.get("language") for item in overview.get("languages", [])[:3] if item.get("language")]
    parts = []
    if entries:
        parts.append(f"Start with {', '.join(entries)}")
    if docs:
        parts.append(f"Then read {', '.join(docs)}")
    if languages:
        parts.append(f"The indexed surface is mostly {', '.join(languages)}")
    return ". ".join(parts) + "." if parts else ""


def _run_summary(overview: Dict[str, Any]) -> str:
    commands = overview.get("runbook_commands", [])
    if not commands:
        return ""
    selected = []
    for command in commands:
        category = command.get("category")
        value = command.get("command")
        if category and value:
            selected.append(f"{category}: {value}")
        if len(selected) >= 4:
            break
    return f"Use the manifest-derived commands: {'; '.join(selected)}." if selected else ""


def _route_summary(overview: Dict[str, Any]) -> str:
    routes = overview.get("route_endpoints", [])
    if not routes:
        return ""
    labels = []
    for route in routes[:5]:
        label = f"{route.get('method', '').strip()} {route.get('path', '').strip()}".strip()
        framework = route.get("framework")
        labels.append(f"{label} ({framework})" if framework else label)
    return f"The first API surface includes {'; '.join(labels)}." if labels else ""


def _data_summary(overview: Dict[str, Any]) -> str:
    schema_facts = overview.get("schema_facts", [])
    if not schema_facts:
        return ""
    labels = []
    for fact in schema_facts[:5]:
        schema_type = fact.get("schema_type")
        name = fact.get("name")
        detail = fact.get("detail")
        label = ":".join(str(part) for part in (schema_type, name) if part)
        labels.append(f"{label} ({detail})" if detail else label)
    return f"The indexed data model includes {'; '.join(labels)}." if labels else ""


def _test_summary(overview: Dict[str, Any]) -> str:
    tests = [item.get("path") for item in overview.get("tests", [])[:5] if item.get("path")]
    return f"Test evidence starts in {', '.join(tests)}." if tests else ""


def _module_summary(overview: Dict[str, Any]) -> str:
    modules = []
    for module in overview.get("modules", [])[:4]:
        path = module.get("path")
        files = int(module.get("file_count") or 0)
        symbols = int(module.get("symbol_count") or 0)
        if path:
            modules.append(f"{path} ({files} files, {symbols} symbols)")
    return f"Primary modules are {'; '.join(modules)}." if modules else ""


def _citations_from_file_facts(items: List[Dict[str, Any]], kind: str) -> List[Dict[str, Any]]:
    return [
        _citation(item.get("path"), 1, item.get("detail") or item.get("path") or kind, kind)
        for item in items
        if item.get("path")
    ]


def _citations_from_commands(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        _citation(item.get("source_path"), None, item.get("command") or item.get("name") or "command", "runbook_command")
        for item in items
        if item.get("source_path")
    ]


def _citations_from_manifests(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        _citation(item.get("source_path"), 1, item.get("package_manager") or item.get("ecosystem") or "manifest", "dependency_manifest")
        for item in items
        if item.get("source_path")
    ]


def _citations_from_runtime_requirements(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        _citation(
            item.get("source_path"),
            item.get("line"),
            " ".join(str(item.get(key) or "") for key in ("runtime", "requirement")).strip() or "runtime requirement",
            "runtime_requirement",
        )
        for item in items
        if item.get("source_path")
    ]


def _citations_from_routes(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    citations = []
    for item in items:
        label = f"{item.get('method', '')} {item.get('path', '')}".strip()
        citations.append(_citation(item.get("source_path"), item.get("line"), label or "route", "route_endpoint"))
    return [item for item in citations if item.get("source_path")]


def _citations_from_schema(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        _citation(item.get("source_path"), item.get("line"), item.get("name") or item.get("detail") or "schema", "schema")
        for item in items
        if item.get("source_path")
    ]


def _citations_from_modules(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    citations = []
    for item in items:
        sample_files = item.get("sample_files") if isinstance(item.get("sample_files"), list) else []
        source_path = sample_files[0] if sample_files else item.get("path")
        citations.append(_citation(source_path, 1, item.get("path") or "module", "module"))
    return [item for item in citations if item.get("source_path")]


def _citations_from_imports(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        _citation(item.get("source_path"), item.get("source_line"), item.get("target") or "import", "import")
        for item in items
        if item.get("source_path")
    ]


def _citation(source_path: Optional[str], source_line: Any, label: Any, kind: str) -> Dict[str, Any]:
    line_value = None
    if source_line is not None:
        try:
            parsed = int(source_line)
            line_value = parsed if parsed > 0 else None
        except (TypeError, ValueError):
            line_value = None

    return {
        "source_path": _repo_relative_path(source_path),
        "source_line": line_value,
        "label": str(label or kind)[:160],
        "kind": kind,
    }


def _repo_relative_path(path: Optional[str]) -> Optional[str]:
    if not path:
        return None
    raw = str(path).replace("\\", "/").strip()
    if not raw:
        return None
    pure = Path(raw)
    if pure.is_absolute():
        return pure.name
    return raw.strip("/")


def _repo_relative_path_from_repo(path: Optional[str], repo_path: Path) -> Optional[str]:
    if not path:
        return None
    raw = str(path).replace("\\", "/").strip()
    if not raw:
        return None
    candidate = Path(raw)
    source_path = repo_path / "source"
    if candidate.is_absolute():
        try:
            return candidate.resolve().relative_to(source_path.resolve()).as_posix()
        except (OSError, ValueError):
            try:
                return candidate.resolve().relative_to(repo_path.resolve()).as_posix()
            except (OSError, ValueError):
                return candidate.name
    return raw.strip("/")


def _dedupe_citations(citations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped = []
    seen = set()
    for citation in citations:
        source_path = citation.get("source_path")
        if not source_path:
            continue
        identity = (
            source_path,
            citation.get("source_line"),
            citation.get("label"),
            citation.get("kind"),
        )
        if identity in seen:
            continue
        seen.add(identity)
        deduped.append(citation)
    return deduped
