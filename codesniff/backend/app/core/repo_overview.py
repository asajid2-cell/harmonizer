"""Deterministic repo overview facts from cold CodeSniff artifacts."""

import ast
import configparser
import json
import math
import plistlib
import re
import sqlite3
import textwrap
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional, Tuple

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python <3.11 fallback
    tomllib = None


LANGUAGE_BY_EXTENSION = {
    ".py": "Python",
    ".pyi": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".java": "Java",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".html": "HTML",
    ".htm": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".sass": "Sass",
    ".vue": "Vue",
    ".svelte": "Svelte",
    ".c": "C",
    ".h": "C/C++ Header",
    ".cpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    ".hpp": "C++ Header",
    ".hh": "C++ Header",
    ".hxx": "C++ Header",
    ".cs": "C#",
    ".go": "Go",
    ".rs": "Rust",
    ".rb": "Ruby",
    ".rake": "Ruby",
    ".php": "PHP",
    ".phtml": "PHP",
    ".swift": "Swift",
    ".dart": "Dart",
    ".scala": "Scala",
    ".sc": "Scala",
    ".r": "R",
    ".lua": "Lua",
    ".pl": "Perl",
    ".pm": "Perl",
    ".ex": "Elixir",
    ".exs": "Elixir",
    ".erl": "Erlang",
    ".hrl": "Erlang",
    ".m": "Objective-C/MATLAB",
    ".mm": "Objective-C++",
    ".groovy": "Groovy",
    ".gradle": "Gradle",
    ".jl": "Julia",
    ".fs": "F#",
    ".fsx": "F#",
    ".fsi": "F#",
    ".clj": "Clojure",
    ".cljs": "ClojureScript",
    ".cljc": "Clojure",
    ".edn": "EDN",
    ".zig": "Zig",
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
    ".fish": "Shell",
    ".ps1": "PowerShell",
    ".psm1": "PowerShell",
    ".sql": "SQL",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".json": "JSON",
    ".toml": "TOML",
    ".xml": "XML",
    ".ini": "INI",
    ".tf": "Terraform",
    ".tfvars": "Terraform",
    ".hcl": "HCL",
    ".graphql": "GraphQL",
    ".gql": "GraphQL",
    ".proto": "Protocol Buffers",
    ".prisma": "Prisma",
    ".md": "Markdown",
    ".mdx": "Markdown",
}

LANGUAGE_BY_FILENAME = {
    "dockerfile": "Dockerfile",
    "makefile": "Makefile",
    "justfile": "Just",
    "rakefile": "Ruby",
}

SYMBOL_AWARE_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".java",
    ".kt",
    ".html",
    ".htm",
    ".css",
    ".c",
    ".cpp",
    ".cc",
    ".cxx",
    ".h",
    ".hpp",
    ".hh",
    ".hxx",
    ".cs",
    ".go",
    ".rs",
    ".rb",
    ".rake",
    ".php",
    ".phtml",
    ".ex",
    ".exs",
    ".scala",
    ".sc",
    ".lua",
    ".swift",
    ".dart",
    ".tf",
    ".tfvars",
    ".hcl",
    ".graphql",
    ".gql",
    ".proto",
    ".ps1",
    ".psm1",
    ".sh",
    ".bash",
    ".zsh",
    ".sql",
    ".glsl",
    ".vert",
    ".frag",
    ".geom",
    ".tesc",
    ".tese",
    ".comp",
    ".hlsl",
    ".fx",
    ".fxh",
    ".hlsli",
    ".wgsl",
    ".metal",
    ".shader",
    ".cginc",
}

CONFIG_HINTS = {
    "package.json": "npm package manifest",
    "pyproject.toml": "Python project manifest",
    "requirements.txt": "Python dependency list",
    "poetry.lock": "Python lockfile",
    "pipfile": "Python environment manifest",
    "cargo.toml": "Rust package manifest",
    "go.mod": "Go module manifest",
    "pom.xml": "Maven project manifest",
    "build.gradle": "Gradle build file",
    "build.gradle.kts": "Gradle Kotlin build file",
    "composer.json": "PHP package manifest",
    "gemfile": "Ruby dependency manifest",
    "dockerfile": "Docker build file",
    "docker-compose.yml": "Docker Compose file",
    "docker-compose.yaml": "Docker Compose file",
    "makefile": "Make targets",
    "justfile": "Just command runner",
    "tsconfig.json": "TypeScript compiler config",
    "vite.config.ts": "Vite config",
    "vite.config.js": "Vite config",
    "next.config.js": "Next.js config",
    "next.config.mjs": "Next.js config",
    ".env.example": "Environment template",
    ".env.sample": "Environment template",
}

DOC_NAMES = {
    "readme",
    "changelog",
    "contributing",
    "license",
    "security",
    "code_of_conduct",
}

ENTRY_NAMES = {
    "main.py",
    "app.py",
    "server.py",
    "manage.py",
    "main.js",
    "server.js",
    "index.js",
    "main.ts",
    "server.ts",
    "index.ts",
    "main.go",
    "main.rs",
    "program.cs",
    "dockerfile",
}

PRUNED_PARTS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "target",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
}

JS_ROUTE_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
PHP_ROUTE_EXTENSIONS = {".php", ".phtml"}
RUBY_ROUTE_EXTENSIONS = {".rb", ".rake"}
GO_ROUTE_EXTENSIONS = {".go"}
JVM_ROUTE_EXTENSIONS = {".java", ".kt", ".kts"}
CSHARP_ROUTE_EXTENSIONS = {".cs"}
ROUTE_EXTENSIONS = (
    {".py"}
    | JS_ROUTE_EXTENSIONS
    | PHP_ROUTE_EXTENSIONS
    | RUBY_ROUTE_EXTENSIONS
    | GO_ROUTE_EXTENSIONS
    | JVM_ROUTE_EXTENSIONS
    | CSHARP_ROUTE_EXTENSIONS
)
HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}
MAX_ROUTE_FILE_BYTES = 512 * 1024
MAX_MANIFEST_FILE_BYTES = 512 * 1024
MAX_DEPENDENCY_MANIFESTS = 24
MAX_RUNBOOK_COMMANDS = 36
MAX_DEPENDENCY_FACTS = 60
MAX_WORKSPACE_FACTS = 120
MAX_STACK_COMPONENT_FACTS = 80
MAX_SERVICE_INTEGRATION_FACTS = 80
MAX_GRAPHQL_SURFACE_FACTS = 100
MAX_GRAPHQL_SURFACE_SCAN_FILES = 500
MAX_AUTH_SURFACE_FACTS = 100
MAX_AUTH_SURFACE_SCAN_FILES = 500
MAX_BACKGROUND_JOB_FACTS = 100
MAX_BACKGROUND_JOB_SCAN_FILES = 500
MAX_WEBHOOK_SURFACE_FACTS = 100
MAX_WEBHOOK_SURFACE_SCAN_FILES = 500
MAX_OBSERVABILITY_SURFACE_FACTS = 100
MAX_OBSERVABILITY_SURFACE_SCAN_FILES = 500
MAX_FEATURE_FLAG_FACTS = 100
MAX_FEATURE_FLAG_SCAN_FILES = 500
MAX_NOTIFICATION_SURFACE_FACTS = 100
MAX_NOTIFICATION_SURFACE_SCAN_FILES = 500
MAX_MESSAGE_BUS_FACTS = 120
MAX_MESSAGE_BUS_SCAN_FILES = 500
MAX_DATA_STORE_FACTS = 120
MAX_DATA_STORE_SCAN_FILES = 500
MAX_PAYMENT_SURFACE_FACTS = 100
MAX_PAYMENT_SURFACE_SCAN_FILES = 500
MAX_AI_SURFACE_FACTS = 100
MAX_AI_SURFACE_SCAN_FILES = 500
MAX_DOC_SECTION_FACTS = 48
MAX_DOC_SECTION_FILE_BYTES = 256 * 1024
MAX_ENV_VAR_FACTS = 80
MAX_SECRET_SIGNAL_FACTS = 120
MAX_SECRET_SIGNAL_SCAN_FILES = 500
MAX_CI_WORKFLOW_FACTS = 40
MAX_CONTAINER_SERVICE_FACTS = 60
MAX_RUNTIME_REQUIREMENT_FACTS = 80
MAX_REPO_POLICY_FACTS = 80
MAX_CODE_OWNER_FACTS = 120
MAX_DEPLOY_TARGET_FACTS = 120
MAX_INDEX_FALLBACK_FACTS = 80
MAX_IMPORT_RELATIONSHIPS = 48
MAX_REPO_FACTS = 1000
MAX_REPO_RELATIONSHIPS = 1000
MAX_EXPORT_RELATIONSHIPS = 500
MAX_MENTION_RELATIONSHIPS = 300
MAX_MENTION_SOURCE_FILE_BYTES = 512 * 1024
MAX_TEST_TARGETS_PER_FILE = 4
MAX_CALL_RELATIONSHIPS = 500
MAX_REFERENCE_RELATIONSHIPS = 500
MAX_CALL_FILES = 500
MAX_CALL_SYMBOLS_PER_FILE = 200
MAX_CALL_SOURCE_SYMBOL_BYTES = 128 * 1024
MAX_MODULE_SUMMARIES = 12
MAX_MODULE_SAMPLE_FILES = 4
MAX_MODULE_DEPENDENCIES = 80
MAX_MODULE_DETAIL_FILES = 200
MAX_MODULE_DETAIL_SYMBOLS = 500
MAX_MODULE_DETAIL_RELATIONSHIPS = 120
MAX_SCHEMA_FACTS = 120
MAX_SCHEMA_SOURCE_FILE_BYTES = 512 * 1024
MAX_MIGRATION_FACTS = 120
MAX_MIGRATION_SOURCE_FILE_BYTES = 512 * 1024
MAX_ARCHITECTURE_DECISION_FACTS = 80
MAX_ARCHITECTURE_DECISION_SCAN_FILES = 400
MAX_ARCHITECTURE_DECISION_FILE_BYTES = 512 * 1024
MAX_API_CONTRACT_FACTS = 120
MAX_CLI_COMMAND_FACTS = 120
MAX_CLI_COMMAND_SCAN_FILES = 500
MAX_TEST_SYSTEM_FACTS = 140
MAX_TEST_SYSTEM_SCAN_FILES = 800
MAX_RELEASE_PROCESS_FACTS = 120
MAX_RELEASE_PROCESS_SCAN_FILES = 600
MAX_QUALITY_TOOL_FACTS = 140
MAX_QUALITY_TOOL_SCAN_FILES = 700
MAX_DEV_ENVIRONMENT_FACTS = 120
MAX_DEV_ENVIRONMENT_SCAN_FILES = 500
MAX_BUILD_SYSTEM_FACTS = 120
MAX_BUILD_SYSTEM_SCAN_FILES = 500
MAX_UI_SURFACE_FACTS = 120
MAX_UI_SURFACE_SCAN_FILES = 500
MAX_MOBILE_SURFACE_FACTS = 120
MAX_MOBILE_SURFACE_SCAN_FILES = 500
MAX_INFRA_RESOURCE_FACTS = 120
MAX_SUPPLY_CHAIN_FACTS = 80
MAX_SEARCH_QUALITY_CASES = 40
MAX_SEARCH_QUALITY_TOP_K = 100
SEARCH_QUALITY_SUITE_PATHS = (
    ".codesniff/search-quality.json",
    ".codesniff/search_quality.json",
    "codesniff.search.json",
)
OVERVIEW_CACHE_KEY = "repo_overview_v1"
EXPORTABLE_SYMBOL_TYPES = {
    "function",
    "class",
    "module",
    "interface",
    "struct",
    "enum",
    "trait",
}
CALLER_SYMBOL_TYPES = {"function", "method"}
CALLABLE_SYMBOL_TYPES = {"function", "method", "class"}
FACT_KIND_RANK = {
    "entry_point": 10,
    "index_fallback": 12,
    "runbook_command": 20,
    "cli_command": 22,
    "dev_environment": 24,
    "package_script": 30,
    "quality_tool": 31,
    "test_system": 32,
    "build_system": 33,
    "release_process": 34,
    "workspace": 35,
    "route_endpoint": 40,
    "architecture_decision": 41,
    "api_contract": 42,
    "ui_surface": 43,
    "mobile_surface": 44,
    "dependency_manifest": 50,
    "stack_component": 52,
    "service_integration": 53,
    "graphql_surface": 54,
    "message_bus": 54,
    "data_store": 54,
    "ai_surface": 54,
    "payment_surface": 54,
    "auth_surface": 54,
    "background_job": 54,
    "webhook_surface": 54,
    "observability_surface": 54,
    "feature_flag": 54,
    "notification_surface": 54,
    "ci_workflow": 55,
    "container_service": 57,
    "runtime_requirement": 58,
    "infra_resource": 59,
    "repo_policy": 59,
    "code_owner": 59,
    "deploy_target": 59,
    "supply_chain": 59,
    "config": 60,
    "secret_signal": 61,
    "env_var": 62,
    "search_quality": 64,
    "schema": 65,
    "migration": 66,
    "module_dependency": 72,
    "module": 75,
    "test": 70,
    "doc": 80,
    "doc_section": 82,
    "import": 90,
    "symbol": 100,
    "dependency": 110,
    "language": 120,
    "directory": 130,
}
SCHEMA_FACT_METADATA_KEYS = (
    "schema_type",
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
MIGRATION_FACT_METADATA_KEYS = (
    "action",
    "table",
    "field",
    "source",
    "framework",
    "operation",
    "name",
)
RUNBOOK_CATEGORY_RANK = {
    "install": 0,
    "run": 1,
    "test": 2,
    "build": 3,
    "container": 4,
}
WORKSPACE_KIND_RANK = {
    "root": 0,
    "package": 1,
    "project": 1,
    "member": 1,
    "module": 1,
    "exclude": 8,
}


class RepoOverviewError(Exception):
    """Raised when overview facts cannot be built from cold artifacts."""


def build_repo_overview(repo_id: int, repo_storage_path: str) -> Dict[str, Any]:
    """Return repo overview facts from cache when available, else derive them."""
    repo_path = Path(repo_storage_path)
    repo_db = repo_path / "repo.sqlite"
    source_dir = repo_path / "source"

    if not repo_db.exists():
        raise FileNotFoundError(f"Repo is not indexed yet: {repo_db}")

    cached = read_cached_repo_overview(repo_db)
    if cached is not None:
        cached.setdefault("import_relationships", _read_import_relationships(repo_db, source_dir))
        cached.setdefault("module_dependencies", _derive_module_dependencies(cached.get("import_relationships", [])))
        cached.setdefault("stack_components", [])
        cached.setdefault("service_integrations", [])
        cached.setdefault("graphql_surfaces", [])
        cached.setdefault("message_buses", [])
        cached.setdefault("data_stores", [])
        cached.setdefault("ai_surfaces", [])
        cached.setdefault("payment_surfaces", [])
        cached.setdefault("auth_surfaces", [])
        cached.setdefault("background_jobs", [])
        cached.setdefault("webhook_surfaces", [])
        cached.setdefault("observability_surfaces", [])
        cached.setdefault("feature_flags", [])
        cached.setdefault("notification_surfaces", [])
        cached.setdefault("runtime_requirements", [])
        cached.setdefault("api_contracts", [])
        cached.setdefault("cli_commands", [])
        cached.setdefault("test_systems", [])
        cached.setdefault("release_processes", [])
        cached.setdefault("quality_tools", [])
        cached.setdefault("dev_environments", [])
        cached.setdefault("build_systems", [])
        cached.setdefault("ui_surfaces", [])
        cached.setdefault("mobile_surfaces", [])
        cached.setdefault("infra_resources", [])
        cached.setdefault("repo_policies", [])
        cached.setdefault("code_owners", [])
        cached.setdefault("deploy_targets", [])
        cached.setdefault("supply_chain", [])
        cached.setdefault("secret_signals", [])
        cached.setdefault("index_fallbacks", [])
        cached.setdefault("search_quality_cases", [])
        cached.setdefault("search_quality_baseline", None)
        cached.setdefault("migration_facts", [])
        cached.setdefault("architecture_decisions", [])
        cached.setdefault("workspaces", [])
        return cached

    return build_repo_overview_from_paths(repo_id, repo_db, source_dir)


def build_repo_overview_from_paths(
    repo_id: int,
    repo_db: str | Path,
    source_dir: str | Path,
    source_scan: bool = True,
) -> Dict[str, Any]:
    """Build repo overview facts from a specific SQLite DB and source tree."""
    repo_db = Path(repo_db)
    source_dir = Path(source_dir)
    files, symbol_types, top_symbols = _read_index_facts(repo_db, source_dir)
    warnings: List[str] = []
    if not source_dir.exists():
        warnings.append("Source snapshot is unavailable; script and manifest details are limited to indexed paths.")

    overview = _summarize_files(files)
    package_scripts = _read_package_scripts(source_dir)
    runbook = _extract_runbook_facts(source_dir)
    doc_sections = _extract_doc_sections(overview["docs"], source_dir)
    route_endpoints = _extract_route_endpoints(files, source_dir) if source_scan else []
    webhook_surfaces = _derive_webhook_surfaces_from_overview(runbook["webhook_surfaces"], route_endpoints)
    observability_surfaces = _derive_observability_surfaces_from_overview(runbook["observability_surfaces"], route_endpoints)
    import_relationships = _read_import_relationships(repo_db, source_dir)
    module_dependencies = _derive_module_dependencies(import_relationships)
    index_fallbacks = _read_index_fallbacks(repo_db, source_dir)
    schema_facts = _extract_schema_facts(files, source_dir) if source_scan else []
    migration_facts = _extract_migration_facts(files, source_dir) if source_scan else []
    search_quality_cases, search_quality_baseline, search_quality_warnings = _extract_search_quality_cases(source_dir)

    if not runbook["runbook_commands"]:
        warnings.append("No install, run, test, or build commands found in common repo manifests.")
    if not source_scan:
        warnings.append("Route and schema source scans were skipped for the shallow first-pass index; migration source scans were skipped too.")
    if index_fallbacks:
        warnings.append(f"{len(index_fallbacks)} files used bounded indexing fallback instead of full parsing.")
    warnings.extend(search_quality_warnings)

    return {
        "repo_id": repo_id,
        "total_files": len(files),
        "total_symbols": sum(symbol_types.values()),
        "languages": overview["languages"],
        "top_directories": overview["top_directories"],
        "modules": overview["modules"],
        "docs": overview["docs"],
        "doc_sections": doc_sections,
        "architecture_decisions": runbook["architecture_decisions"],
        "configs": overview["configs"],
        "tests": overview["tests"],
        "entry_points": overview["entry_points"],
        "package_scripts": package_scripts,
        "dependency_manifests": runbook["dependency_manifests"],
        "runbook_commands": runbook["runbook_commands"],
        "dependencies": runbook["dependencies"],
        "workspaces": runbook["workspaces"],
        "stack_components": runbook["stack_components"],
        "service_integrations": runbook["service_integrations"],
        "graphql_surfaces": runbook["graphql_surfaces"],
        "message_buses": runbook["message_buses"],
        "data_stores": runbook["data_stores"],
        "ai_surfaces": runbook["ai_surfaces"],
        "payment_surfaces": runbook["payment_surfaces"],
        "auth_surfaces": runbook["auth_surfaces"],
        "background_jobs": runbook["background_jobs"],
        "webhook_surfaces": webhook_surfaces,
        "observability_surfaces": observability_surfaces,
        "feature_flags": runbook["feature_flags"],
        "notification_surfaces": runbook["notification_surfaces"],
        "environment_variables": runbook["environment_variables"],
        "ci_workflows": runbook["ci_workflows"],
        "container_services": runbook["container_services"],
        "runtime_requirements": runbook["runtime_requirements"],
        "api_contracts": runbook["api_contracts"],
        "cli_commands": runbook["cli_commands"],
        "test_systems": runbook["test_systems"],
        "release_processes": runbook["release_processes"],
        "quality_tools": runbook["quality_tools"],
        "dev_environments": runbook["dev_environments"],
        "build_systems": runbook["build_systems"],
        "ui_surfaces": runbook["ui_surfaces"],
        "mobile_surfaces": runbook["mobile_surfaces"],
        "infra_resources": runbook["infra_resources"],
        "repo_policies": runbook["repo_policies"],
        "code_owners": runbook["code_owners"],
        "deploy_targets": runbook["deploy_targets"],
        "supply_chain": runbook["supply_chain"],
        "secret_signals": runbook["secret_signals"],
        "index_fallbacks": index_fallbacks,
        "route_endpoints": route_endpoints,
        "import_relationships": import_relationships,
        "module_dependencies": module_dependencies,
        "schema_facts": schema_facts,
        "migration_facts": migration_facts,
        "search_quality_cases": search_quality_cases,
        "search_quality_baseline": search_quality_baseline,
        "symbol_types": dict(symbol_types),
        "top_symbols": top_symbols,
        "warnings": warnings,
    }


def persist_repo_overview(
    repo_id: int,
    repo_db: str | Path,
    source_dir: str | Path,
    source_scan: bool = True,
) -> Dict[str, Any]:
    """Build and store the deterministic overview JSON in the repo SQLite DB."""
    repo_db = Path(repo_db)
    overview = build_repo_overview_from_paths(repo_id, repo_db, source_dir, source_scan=source_scan)
    conn = sqlite3.connect(repo_db)
    try:
        _ensure_overview_cache_table(conn)
        _ensure_repo_facts_table(conn)
        _ensure_relationships_table(conn)
        conn.execute(
            """
            INSERT INTO repo_overview_cache (cache_key, generated_at, payload_json)
            VALUES (?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
                generated_at = excluded.generated_at,
                payload_json = excluded.payload_json
            """,
            (
                OVERVIEW_CACHE_KEY,
                _now(),
                json.dumps(overview, sort_keys=True, separators=(",", ":")),
            ),
        )
        _replace_repo_facts(conn, _repo_facts_from_overview(overview))
        _replace_overview_relationships(conn, overview, Path(source_dir))
        conn.commit()
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        conn.close()
    return overview


def read_cached_repo_overview(repo_db: str | Path) -> Optional[Dict[str, Any]]:
    """Read persisted overview facts without mutating the artifact DB."""
    repo_db = Path(repo_db)
    if not repo_db.exists():
        return None

    conn = sqlite3.connect(f"file:{repo_db}?mode=ro", uri=True)
    try:
        table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'repo_overview_cache'"
        ).fetchone()
        if table is None:
            return None

        row = conn.execute(
            "SELECT payload_json FROM repo_overview_cache WHERE cache_key = ?",
            (OVERVIEW_CACHE_KEY,),
        ).fetchone()
        if row is None:
            return None
        payload = json.loads(row[0])
        return payload if isinstance(payload, dict) else None
    except (sqlite3.Error, json.JSONDecodeError):
        return None
    finally:
        conn.close()


def read_repo_facts(repo_db: str | Path, kind: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
    """Read normalized repo facts without mutating the artifact DB."""
    repo_db = Path(repo_db)
    if not repo_db.exists():
        raise FileNotFoundError(f"Repo is not indexed yet: {repo_db}")

    limit = max(1, min(int(limit), MAX_REPO_FACTS))
    clauses = []
    params: List[Any] = []
    if kind:
        clauses.append("kind = ?")
        params.append(kind)
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    conn = sqlite3.connect(f"file:{repo_db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'repo_facts'"
        ).fetchone()
        if table is None:
            return []

        rows = conn.execute(f"""
            SELECT id, kind, key, value, source_path, source_line, confidence, metadata_json
            FROM repo_facts
            {where_sql}
        """, params).fetchall()
    except sqlite3.Error:
        return []
    finally:
        conn.close()

    facts: List[Dict[str, Any]] = []
    for row in rows:
        metadata: Dict[str, Any] = {}
        if row["metadata_json"]:
            try:
                parsed = json.loads(row["metadata_json"])
                if isinstance(parsed, dict):
                    metadata = parsed
            except json.JSONDecodeError:
                metadata = {}
        facts.append({
            "id": row["id"],
            "kind": row["kind"],
            "key": row["key"],
            "value": row["value"],
            "source_path": row["source_path"],
            "source_line": row["source_line"],
            "confidence": row["confidence"],
            "metadata": metadata,
        })
    return sorted(facts, key=_repo_fact_sort_key)[:limit]


def read_repo_relationships(
    repo_db: str | Path,
    source_dir: str | Path,
    rel_type: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """Read normalized relationship rows without mutating the artifact DB."""
    repo_db = Path(repo_db)
    source_dir = Path(source_dir)
    if not repo_db.exists():
        raise FileNotFoundError(f"Repo is not indexed yet: {repo_db}")

    limit = max(1, min(int(limit), MAX_REPO_RELATIONSHIPS))
    clauses = []
    params: List[Any] = []
    if rel_type:
        clauses.append("r.rel_type = ?")
        params.append(rel_type)
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)

    conn = sqlite3.connect(f"file:{repo_db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'relationships'"
        ).fetchone()
        if table is None:
            return []

        indexed_paths = _indexed_paths_from_conn(conn, source_dir)
        rows = conn.execute(f"""
            SELECT
                r.id, r.src_kind, r.src_id, r.dst_kind, r.dst_id, r.rel_type,
                r.target, r.confidence, r.source_line, r.metadata_json,
                f.path AS source_path
            FROM relationships r
            LEFT JOIN files f ON r.src_kind = 'file' AND r.src_id = f.id
            {where_sql}
            ORDER BY r.rel_type, COALESCE(f.path, ''), COALESCE(r.source_line, 0), r.target
            LIMIT ?
        """, params).fetchall()
    except sqlite3.Error:
        return []
    finally:
        conn.close()

    relationships: List[Dict[str, Any]] = []
    for row in rows:
        metadata: Dict[str, Any] = {}
        if row["metadata_json"]:
            try:
                parsed = json.loads(row["metadata_json"])
                if isinstance(parsed, dict):
                    metadata = parsed
            except json.JSONDecodeError:
                metadata = {}
        source_path = metadata.get("source_path")
        if not isinstance(source_path, str) or not source_path:
            source_path = _normalize_indexed_path(row["source_path"], source_dir) if row["source_path"] else None
        if row["rel_type"] == "imports" and source_path:
            target_path = metadata.get("target_path")
            if not isinstance(target_path, str) or not target_path:
                target_path = _resolve_import_target_path(source_path, str(row["target"] or ""), indexed_paths)
                if target_path:
                    metadata["target_path"] = target_path
                    metadata.setdefault("target_resolution", "indexed-file")
        relationships.append({
            "id": row["id"],
            "src_kind": row["src_kind"],
            "src_id": row["src_id"],
            "source_path": source_path,
            "dst_kind": row["dst_kind"],
            "dst_id": row["dst_id"],
            "rel_type": row["rel_type"],
            "target": row["target"],
            "confidence": row["confidence"],
            "source_line": row["source_line"],
            "metadata": metadata,
        })
    return relationships


def read_repo_module_detail(
    repo_id: int,
    repo_db: str | Path,
    source_dir: str | Path,
    module_path: str,
) -> Dict[str, Any]:
    """Read one module/package detail view from cold SQLite artifacts."""
    repo_db = Path(repo_db)
    source_dir = Path(source_dir)
    if not repo_db.exists():
        raise FileNotFoundError(f"Repo is not indexed yet: {repo_db}")

    clean_module_path = _clean_module_path(module_path)
    conn = sqlite3.connect(f"file:{repo_db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        file_rows = conn.execute(
            """
            SELECT f.id, f.path, f.total_lines, f.indexed_at, COUNT(s.id) AS symbol_count
            FROM files f
            LEFT JOIN symbols s ON s.file_id = f.id
            GROUP BY f.id
            ORDER BY f.path
            """
        ).fetchall()

        all_file_paths: Dict[int, str] = {}
        module_files: List[Dict[str, Any]] = []
        for row in file_rows:
            normalized_path = _normalize_indexed_path(row["path"], source_dir)
            all_file_paths[row["id"]] = normalized_path
            if _module_path(normalized_path) != clean_module_path:
                continue
            module_files.append({
                "id": row["id"],
                "path": normalized_path,
                "total_lines": int(row["total_lines"] or 0),
                "indexed_at": row["indexed_at"],
                "symbol_count": int(row["symbol_count"] or 0),
                "language": _classify_language(normalized_path),
            })

        if not module_files:
            raise KeyError(clean_module_path)

        module_file_ids = {item["id"] for item in module_files}
        module_paths = {item["path"] for item in module_files}
        indexed_paths = set(all_file_paths.values())
        symbols = _read_module_symbols(conn, module_file_ids, source_dir)
        module_symbol_ids = {item["id"] for item in symbols}
        imports, exports, outgoing, incoming = _read_module_relationships(
            conn=conn,
            source_dir=source_dir,
            module_path=clean_module_path,
            module_file_ids=module_file_ids,
            module_symbol_ids=module_symbol_ids,
            module_paths=module_paths,
            indexed_paths=indexed_paths,
        )
    finally:
        conn.close()

    languages = sorted({item["language"] for item in module_files if item.get("language")})
    return {
        "repo_id": repo_id,
        "module_path": clean_module_path,
        "file_count": len(module_files),
        "line_count": sum(int(item.get("total_lines") or 0) for item in module_files),
        "symbol_count": len(symbols),
        "languages": languages,
        "files": module_files[:MAX_MODULE_DETAIL_FILES],
        "symbols": symbols[:MAX_MODULE_DETAIL_SYMBOLS],
        "imports": imports,
        "exports": exports,
        "outgoing": outgoing,
        "incoming": incoming,
        "warnings": _module_detail_warnings(module_files, symbols),
    }


def _read_module_symbols(
    conn: sqlite3.Connection,
    module_file_ids: set[int],
    source_dir: Path,
) -> List[Dict[str, Any]]:
    if not module_file_ids:
        return []

    placeholders = ",".join("?" for _ in module_file_ids)
    rows = conn.execute(
        f"""
        SELECT s.id, s.file_id, s.name, s.symbol_type, s.start_line, s.end_line, s.docstring, f.path AS file_path
        FROM symbols s
        JOIN files f ON f.id = s.file_id
        WHERE s.file_id IN ({placeholders})
        ORDER BY f.path, s.start_line, s.end_line, s.name
        LIMIT ?
        """,
        [*sorted(module_file_ids), MAX_MODULE_DETAIL_SYMBOLS],
    ).fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "symbol_type": row["symbol_type"],
            "file_path": _normalize_indexed_path(row["file_path"], source_dir),
            "start_line": row["start_line"],
            "end_line": row["end_line"],
            "docstring": row["docstring"],
        }
        for row in rows
    ]


def _read_module_relationships(
    conn: sqlite3.Connection,
    source_dir: Path,
    module_path: str,
    module_file_ids: set[int],
    module_symbol_ids: set[int],
    module_paths: set[str],
    indexed_paths: set[str],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    table = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'relationships'"
    ).fetchone()
    if table is None:
        return [], [], [], []

    clauses = []
    params: List[Any] = []
    if module_file_ids:
        placeholders = ",".join("?" for _ in module_file_ids)
        clauses.append(f"(r.src_kind = 'file' AND r.src_id IN ({placeholders}))")
        params.extend(sorted(module_file_ids))
        clauses.append(f"(r.dst_kind = 'file' AND r.dst_id IN ({placeholders}))")
        params.extend(sorted(module_file_ids))
    if module_symbol_ids:
        placeholders = ",".join("?" for _ in module_symbol_ids)
        clauses.append(f"(r.src_kind = 'symbol' AND r.src_id IN ({placeholders}))")
        params.extend(sorted(module_symbol_ids))
        clauses.append(f"(r.dst_kind = 'symbol' AND r.dst_id IN ({placeholders}))")
        params.extend(sorted(module_symbol_ids))
    clauses.append("r.rel_type = 'imports'")
    clauses.append("r.rel_type = 'depends_on_module'")

    rows = conn.execute(
        f"""
        SELECT
            r.id, r.src_kind, r.src_id, r.dst_kind, r.dst_id, r.rel_type,
            r.target, r.confidence, r.source_line, r.metadata_json,
            sf.path AS src_file_path,
            ss.name AS src_symbol_name,
            ssf.path AS src_symbol_file_path,
            df.path AS dst_file_path,
            ds.name AS dst_symbol_name,
            dsf.path AS dst_symbol_file_path
        FROM relationships r
        LEFT JOIN files sf ON r.src_kind = 'file' AND r.src_id = sf.id
        LEFT JOIN symbols ss ON r.src_kind = 'symbol' AND r.src_id = ss.id
        LEFT JOIN files ssf ON ss.file_id = ssf.id
        LEFT JOIN files df ON r.dst_kind = 'file' AND r.dst_id = df.id
        LEFT JOIN symbols ds ON r.dst_kind = 'symbol' AND r.dst_id = ds.id
        LEFT JOIN files dsf ON ds.file_id = dsf.id
        WHERE {" OR ".join(clauses)}
        ORDER BY r.rel_type, COALESCE(sf.path, ssf.path, ''), COALESCE(r.source_line, 0), r.target
        """,
        params,
    ).fetchall()

    imports: List[Dict[str, Any]] = []
    exports: List[Dict[str, Any]] = []
    outgoing: List[Dict[str, Any]] = []
    incoming: List[Dict[str, Any]] = []
    seen = {
        "imports": set(),
        "exports": set(),
        "outgoing": set(),
        "incoming": set(),
    }

    for row in rows:
        item = _module_relationship_item(row, source_dir, indexed_paths)
        metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        source_module = metadata.get("source_module")
        target_module = metadata.get("target_module")
        source_in_module = (
            (row["src_kind"] == "file" and row["src_id"] in module_file_ids)
            or (row["src_kind"] == "symbol" and row["src_id"] in module_symbol_ids)
            or item.get("source_path") in module_paths
            or source_module == module_path
        )
        target_in_module = (
            (row["dst_kind"] == "file" and row["dst_id"] in module_file_ids)
            or (row["dst_kind"] == "symbol" and row["dst_id"] in module_symbol_ids)
            or item.get("target_path") in module_paths
            or target_module == module_path
        )

        if item["rel_type"] == "imports" and source_in_module:
            _append_limited_relationship(imports, item, seen["imports"])
        elif item["rel_type"] == "exports" and source_in_module:
            _append_limited_relationship(exports, item, seen["exports"])
        elif source_in_module and item["rel_type"] not in {"imports", "exports"}:
            _append_limited_relationship(outgoing, item, seen["outgoing"])
        elif target_in_module and not source_in_module:
            _append_limited_relationship(incoming, item, seen["incoming"])

    return imports, exports, outgoing, incoming


def _module_relationship_item(
    row: sqlite3.Row,
    source_dir: Path,
    indexed_paths: set[str],
) -> Dict[str, Any]:
    metadata = _loads_json_object(row["metadata_json"])
    source_path = metadata.get("source_path")
    if not isinstance(source_path, str) or not source_path:
        raw_source_path = row["src_file_path"] or row["src_symbol_file_path"]
        source_path = _normalize_indexed_path(raw_source_path, source_dir) if raw_source_path else None

    target_path = metadata.get("target_path")
    if not isinstance(target_path, str) or not target_path:
        raw_target_path = row["dst_file_path"] or row["dst_symbol_file_path"]
        target_path = _normalize_indexed_path(raw_target_path, source_dir) if raw_target_path else None
    if not target_path and row["rel_type"] == "imports" and source_path:
        target_path = _resolve_import_target_path(source_path, str(row["target"] or ""), indexed_paths)

    return {
        "id": row["id"],
        "rel_type": row["rel_type"],
        "source_path": source_path,
        "source_symbol": row["src_symbol_name"],
        "target": row["target"],
        "target_path": target_path,
        "target_symbol": row["dst_symbol_name"],
        "confidence": row["confidence"],
        "source_line": row["source_line"],
        "metadata": metadata,
    }


def _resolve_import_target_path(source_path: str, target: str, indexed_paths: set[str]) -> Optional[str]:
    if not target:
        return None

    source_pure = PurePosixPath(source_path)
    suffix = source_pure.suffix.lower()
    if suffix in {".py", ".pyi"}:
        if target.startswith("."):
            dot_count = len(target) - len(target.lstrip("."))
            module_tail = target[dot_count:]
            base = source_pure.parent
            for _ in range(max(dot_count - 1, 0)):
                base = base.parent
            parts = [part for part in module_tail.split(".") if part]
            module_path = base.joinpath(*parts) if parts else base
        else:
            module_path = PurePosixPath(*[part for part in target.split(".") if part])

        for candidate in (
            module_path.with_suffix(".py"),
            module_path / "__init__.py",
            module_path.with_suffix(".pyi"),
        ):
            normalized = _to_posix(candidate)
            if normalized in indexed_paths:
                return normalized
        return None

    if suffix in JS_ROUTE_EXTENSIONS and target.startswith("."):
        module_path = source_pure.parent.joinpath(target)
        for candidate in _js_module_candidates(module_path):
            if candidate in indexed_paths:
                return candidate
        return None

    if suffix == ".go":
        return _resolve_package_directory_import(target, indexed_paths, {".go"})

    if suffix in {".java", ".kt", ".kts", ".scala", ".sc"}:
        return _resolve_dotted_type_import(target, indexed_paths, {".java", ".kt", ".kts", ".scala", ".sc"})

    if suffix == ".cs":
        return _resolve_dotted_type_import(target, indexed_paths, {".cs"})

    if suffix in RUBY_ROUTE_EXTENSIONS:
        return _resolve_file_like_import(
            source_pure,
            target,
            indexed_paths,
            suffixes=("", ".rb", ".rake"),
            include_source_parent=True,
        )

    if suffix in PHP_ROUTE_EXTENSIONS:
        if "\\" in target:
            return _resolve_path_suffix_import(
                target.replace("\\", "/"),
                indexed_paths,
                suffixes=(".php", ".phtml"),
                case_insensitive=True,
            )
        return _resolve_file_like_import(
            source_pure,
            target,
            indexed_paths,
            suffixes=("", ".php", ".phtml"),
            include_source_parent=True,
            case_insensitive=True,
        )

    if suffix == ".rs":
        return _resolve_rust_import(source_pure, target, indexed_paths)

    if suffix in {".sh", ".bash", ".zsh"}:
        return _resolve_file_like_import(
            source_pure,
            target,
            indexed_paths,
            suffixes=("", ".sh", ".bash", ".zsh"),
            include_source_parent=True,
        )
    if suffix == ".lua":
        dotted_target = target.replace(".", "/")
        resolved = _resolve_file_like_import(
            source_pure,
            dotted_target,
            indexed_paths,
            suffixes=("", ".lua", "/init.lua"),
            include_source_parent=True,
        )
        if resolved:
            return resolved
        return _resolve_file_like_import(
            source_pure,
            target,
            indexed_paths,
            suffixes=("", ".lua", "/init.lua"),
            include_source_parent=True,
        )
    if suffix == ".dart":
        if target.startswith("package:"):
            package_target = target[len("package:"):]
            parts = [part for part in package_target.split("/") if part]
            if len(parts) >= 2:
                local_target = PurePosixPath("lib").joinpath(*parts[1:])
                match = _resolve_path_suffix_import(
                    _to_posix(local_target),
                    indexed_paths,
                    suffixes=("", ".dart"),
                    case_insensitive=True,
                )
                if match:
                    return match
            return None
        return _resolve_file_like_import(
            source_pure,
            target,
            indexed_paths,
            suffixes=("", ".dart"),
            include_source_parent=True,
        )
    if suffix in {".tf", ".hcl"}:
        if not target.startswith("."):
            return None
        resolved = _resolve_file_like_import(
            source_pure,
            target,
            indexed_paths,
            suffixes=("", ".tf", ".hcl", "/main.tf", "/terragrunt.hcl"),
            include_source_parent=True,
        )
        if resolved:
            return resolved
        target_dir = _collapse_relative_posix_path(source_pure.parent / PurePosixPath(target))
        if target_dir:
            matches = _files_in_unique_package_dir(
                target_dir,
                indexed_paths,
                {".tf", ".hcl"},
                case_insensitive=True,
            )
            if matches:
                return matches[0]
    if suffix == ".proto":
        return _resolve_file_like_import(
            source_pure,
            target,
            indexed_paths,
            suffixes=("", ".proto"),
            include_source_parent=True,
        )
    if suffix in {".ps1", ".psm1"}:
        return _resolve_file_like_import(
            source_pure,
            target.replace("\\", "/"),
            indexed_paths,
            suffixes=("", ".ps1", ".psm1", ".psd1"),
            include_source_parent=True,
            case_insensitive=True,
        )
    if suffix in {".ex", ".exs"}:
        return _resolve_elixir_module_import(target, indexed_paths)
    return None


def _js_module_candidates(module_path: PurePosixPath) -> List[str]:
    suffixes = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
    index_names = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs", "index.cjs"]
    candidates: List[str] = []
    for suffix in suffixes:
        candidate = _collapse_relative_posix_path(PurePosixPath(f"{module_path}{suffix}"))
        if candidate:
            candidates.append(candidate)
    for index_name in index_names:
        candidate = _collapse_relative_posix_path(module_path / index_name)
        if candidate:
            candidates.append(candidate)
    return candidates


def _resolve_file_like_import(
    source_path: PurePosixPath,
    target: str,
    indexed_paths: set[str],
    suffixes: tuple[str, ...],
    include_source_parent: bool = False,
    case_insensitive: bool = False,
) -> Optional[str]:
    cleaned = target.strip().strip("'\"")
    if not cleaned or "://" in cleaned or cleaned.startswith("$"):
        return None

    base_candidates: List[PurePosixPath] = []
    target_path = PurePosixPath(cleaned)
    if cleaned.startswith((".", "..")):
        base_candidates.append(source_path.parent / target_path)
    else:
        base_candidates.append(target_path)
        if include_source_parent:
            base_candidates.append(source_path.parent / target_path)

    for base in base_candidates:
        for suffix in suffixes:
            candidate = _collapse_relative_posix_path(PurePosixPath(f"{base}{suffix}"))
            match = _exact_indexed_path(candidate, indexed_paths, case_insensitive=case_insensitive)
            if match:
                return match

    return _resolve_path_suffix_import(
        cleaned,
        indexed_paths,
        suffixes=suffixes,
        case_insensitive=case_insensitive,
    )


def _resolve_path_suffix_import(
    target_path: str,
    indexed_paths: set[str],
    suffixes: tuple[str, ...],
    case_insensitive: bool = False,
) -> Optional[str]:
    normalized_target = target_path.replace("\\", "/").strip("/")
    if not normalized_target:
        return None

    candidate_suffixes = []
    for suffix in suffixes:
        value = f"{normalized_target}{suffix}" if suffix and not normalized_target.endswith(suffix) else normalized_target
        candidate_suffixes.append(value)

    matches = []
    for indexed_path in indexed_paths:
        compare_path = indexed_path.lower() if case_insensitive else indexed_path
        for candidate in candidate_suffixes:
            compare_candidate = candidate.lower() if case_insensitive else candidate
            if compare_path == compare_candidate or compare_path.endswith(f"/{compare_candidate}"):
                matches.append(indexed_path)
                break

    return matches[0] if len(set(matches)) == 1 else None


def _resolve_package_directory_import(
    target: str,
    indexed_paths: set[str],
    suffixes: set[str],
) -> Optional[str]:
    parts = [part for part in target.replace("\\", "/").split("/") if part and part not in {".", ".."}]
    for start in range(len(parts)):
        package_dir = "/".join(parts[start:])
        matches = _files_in_unique_package_dir(package_dir, indexed_paths, suffixes)
        if matches:
            return matches[0]
    return None


def _resolve_dotted_type_import(
    target: str,
    indexed_paths: set[str],
    suffixes: set[str],
) -> Optional[str]:
    parts = [part for part in target.replace("\\", ".").split(".") if part and part != "*"]
    while parts:
        target_path = "/".join(parts)
        match = _resolve_path_suffix_import(target_path, indexed_paths, tuple(sorted(suffixes)), case_insensitive=True)
        if match:
            return match
        matches = _files_in_unique_package_dir(target_path, indexed_paths, suffixes, case_insensitive=True)
        if matches:
            return matches[0]
        parts.pop()
    return None


def _resolve_elixir_module_import(target: str, indexed_paths: set[str]) -> Optional[str]:
    parts = [part for part in target.split(".") if part and part[0].isupper()]
    if not parts:
        return None

    snake_parts = [_camel_to_snake(part) for part in parts]
    candidate_suffixes = [
        "/".join(snake_parts),
        "lib/" + "/".join(snake_parts),
        "test/" + "/".join(snake_parts),
    ]
    for candidate in candidate_suffixes:
        match = _resolve_path_suffix_import(
            candidate,
            indexed_paths,
            suffixes=(".ex", ".exs"),
            case_insensitive=True,
        )
        if match:
            return match
    return None


def _camel_to_snake(value: str) -> str:
    value = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", value)
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value)
    return value.replace("-", "_").lower()


def _resolve_rust_import(
    source_path: PurePosixPath,
    target: str,
    indexed_paths: set[str],
) -> Optional[str]:
    cleaned = target.replace(" ", "")
    if "{" in cleaned:
        cleaned = cleaned.split("{", 1)[0].rstrip(":")
    parts = [part for part in cleaned.split("::") if part]
    if not parts:
        return None

    if parts[0] == "crate":
        base = PurePosixPath("src")
        parts = parts[1:]
    elif parts[0] == "self":
        base = source_path.parent
        parts = parts[1:]
    elif parts[0] == "super":
        base = source_path.parent.parent
        parts = parts[1:]
    else:
        base = source_path.parent

    while parts:
        module_path = base.joinpath(*parts)
        for candidate in (
            module_path.with_suffix(".rs"),
            module_path / "mod.rs",
        ):
            normalized = _collapse_relative_posix_path(candidate)
            if normalized in indexed_paths:
                return normalized
        parts.pop()
    return None


def _files_in_unique_package_dir(
    package_dir: str,
    indexed_paths: set[str],
    suffixes: set[str],
    case_insensitive: bool = False,
) -> List[str]:
    normalized_dir = package_dir.strip("/")
    if not normalized_dir:
        return []
    compare_dir = normalized_dir.lower() if case_insensitive else normalized_dir

    matches_by_dir: Dict[str, List[str]] = defaultdict(list)
    for indexed_path in indexed_paths:
        pure = PurePosixPath(indexed_path)
        if pure.suffix.lower() not in suffixes:
            continue
        parent = pure.parent.as_posix()
        compare_parent = parent.lower() if case_insensitive else parent
        if compare_parent == compare_dir or compare_parent.endswith(f"/{compare_dir}"):
            matches_by_dir[parent].append(indexed_path)

    if len(matches_by_dir) != 1:
        return []
    return sorted(next(iter(matches_by_dir.values())))


def _exact_indexed_path(
    candidate: Optional[str],
    indexed_paths: set[str],
    case_insensitive: bool = False,
) -> Optional[str]:
    if not candidate:
        return None
    if not case_insensitive:
        return candidate if candidate in indexed_paths else None
    matches = [path for path in indexed_paths if path.lower() == candidate.lower()]
    return matches[0] if len(matches) == 1 else None


def _append_limited_relationship(
    rows: List[Dict[str, Any]],
    item: Dict[str, Any],
    seen: set[tuple[Any, ...]],
):
    if len(rows) >= MAX_MODULE_DETAIL_RELATIONSHIPS:
        return
    identity = (
        item.get("id"),
        item.get("rel_type"),
        item.get("source_path"),
        item.get("source_symbol"),
        item.get("target"),
        item.get("target_path"),
    )
    if identity in seen:
        return
    seen.add(identity)
    rows.append(item)


def _module_detail_warnings(
    files: List[Dict[str, Any]],
    symbols: List[Dict[str, Any]],
) -> List[str]:
    warnings: List[str] = []
    if len(files) >= MAX_MODULE_DETAIL_FILES:
        warnings.append(f"File list capped at {MAX_MODULE_DETAIL_FILES} rows.")
    if len(symbols) >= MAX_MODULE_DETAIL_SYMBOLS:
        warnings.append(f"Symbol list capped at {MAX_MODULE_DETAIL_SYMBOLS} rows.")
    return warnings


def _clean_module_path(raw_path: str) -> str:
    normalized = str(raw_path or "").replace("\\", "/").strip().strip("/")
    if not normalized:
        raise ValueError("Module path is required")
    if normalized == "(root)":
        return normalized

    pure = PurePosixPath(normalized)
    if ":" in pure.parts[0]:
        raise ValueError("Module path must be repo-relative")
    if any(part in {"", ".", ".."} for part in pure.parts):
        raise ValueError("Module path must not contain traversal segments")
    return pure.as_posix()


def _ensure_overview_cache_table(conn: sqlite3.Connection):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS repo_overview_cache (
            cache_key TEXT PRIMARY KEY,
            generated_at TEXT NOT NULL,
            payload_json TEXT NOT NULL
        )
        """
    )


def _ensure_repo_facts_table(conn: sqlite3.Connection):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS repo_facts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            source_path TEXT,
            source_line INTEGER,
            confidence TEXT NOT NULL,
            metadata_json TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_repo_facts_kind_key ON repo_facts(kind, key)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_repo_facts_source ON repo_facts(source_path)")


def _ensure_relationships_table(conn: sqlite3.Connection):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            src_kind TEXT NOT NULL,
            src_id INTEGER NOT NULL,
            dst_kind TEXT NOT NULL,
            dst_id INTEGER,
            rel_type TEXT NOT NULL,
            target TEXT NOT NULL,
            confidence TEXT NOT NULL,
            source_line INTEGER,
            metadata_json TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_relationships_src ON relationships(src_kind, src_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(rel_type)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target)")


def _replace_repo_facts(conn: sqlite3.Connection, facts: List[Dict[str, Any]]):
    conn.execute("DELETE FROM repo_facts")
    if not facts:
        return

    conn.executemany(
        """
        INSERT INTO repo_facts (
            kind, key, value, source_path, source_line, confidence, metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                fact["kind"],
                fact["key"],
                fact["value"],
                fact.get("source_path"),
                fact.get("source_line"),
                fact["confidence"],
                json.dumps(fact.get("metadata") or {}, sort_keys=True, separators=(",", ":")),
            )
            for fact in facts
        ],
    )


def _replace_overview_relationships(conn: sqlite3.Connection, overview: Dict[str, Any], source_dir: Path):
    conn.execute("DELETE FROM relationships WHERE rel_type IN ('defines_route', 'defines_schema', 'defines_migration', 'tests', 'configures', 'exports', 'mentions', 'calls', 'references', 'depends_on_module')")
    relationships = []
    relationships.extend(_route_relationships_from_overview(conn, overview, source_dir))
    relationships.extend(_schema_relationships_from_overview(conn, overview, source_dir))
    relationships.extend(_migration_relationships_from_overview(conn, overview, source_dir))
    relationships.extend(_test_relationships_from_overview(conn, overview, source_dir))
    relationships.extend(_config_relationships_from_overview(conn, overview, source_dir))
    relationships.extend(_module_dependency_relationships_from_imports(conn, source_dir))
    relationships.extend(_export_relationships_from_symbols(conn, source_dir))
    relationships.extend(_mention_relationships_from_docs(conn, overview, source_dir))
    relationships.extend(_call_relationships_from_symbols(conn, source_dir))
    relationships.extend(_reference_relationships_from_symbols(conn, source_dir))
    if not relationships:
        return

    conn.executemany(
        """
        INSERT INTO relationships (
            src_kind, src_id, dst_kind, dst_id, rel_type, target,
            confidence, source_line, metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        relationships,
    )


def _relationship_row(
    src_id: int,
    dst_kind: str,
    dst_id: Optional[int],
    rel_type: str,
    target: str,
    confidence: str,
    source_line: Optional[int],
    metadata: Dict[str, Any],
    src_kind: str = "file",
) -> tuple[Any, ...]:
    return (
        src_kind,
        src_id,
        dst_kind,
        dst_id,
        rel_type,
        target[:500],
        confidence,
        source_line,
        json.dumps(metadata, sort_keys=True, separators=(",", ":")),
    )


def _route_relationships_from_overview(
    conn: sqlite3.Connection,
    overview: Dict[str, Any],
    source_dir: Path,
) -> List[tuple[Any, ...]]:
    file_ids = _file_ids_by_normalized_path(conn, source_dir)
    rows: List[tuple[Any, ...]] = []
    seen = set()
    for route in overview.get("route_endpoints", []):
        source_path = route.get("source_path")
        file_id = file_ids.get(source_path or "")
        method = str(route.get("method") or "").upper()
        path = str(route.get("path") or "")
        if file_id is None or not method or not path:
            continue

        target = f"{method} {path}"
        source_line = _positive_int(route.get("line"))
        identity = (file_id, target, source_line)
        if identity in seen:
            continue
        seen.add(identity)
        rows.append(_relationship_row(
            src_id=file_id,
            dst_kind="route",
            dst_id=None,
            rel_type="defines_route",
            target=target,
            confidence="heuristic",
            source_line=source_line,
            metadata={
                "framework": route.get("framework") or "",
                "method": method,
                "path": path,
                "source_path": source_path,
            },
        ))
    return rows


def _schema_relationships_from_overview(
    conn: sqlite3.Connection,
    overview: Dict[str, Any],
    source_dir: Path,
) -> List[tuple[Any, ...]]:
    file_ids = _file_ids_by_normalized_path(conn, source_dir)
    rows: List[tuple[Any, ...]] = []
    seen = set()
    for schema_fact in overview.get("schema_facts", []):
        source_path = schema_fact.get("source_path")
        file_id = file_ids.get(source_path or "")
        schema_type = str(schema_fact.get("schema_type") or "")
        name = str(schema_fact.get("name") or "")
        if file_id is None or not schema_type or not name:
            continue

        target = f"{schema_type}:{name}"
        source_line = _positive_int(schema_fact.get("line"))
        identity = (file_id, target, source_line)
        if identity in seen:
            continue
        seen.add(identity)
        rows.append(_relationship_row(
            src_id=file_id,
            dst_kind="schema",
            dst_id=None,
            rel_type="defines_schema",
            target=target,
            confidence="heuristic",
            source_line=source_line,
            metadata={
                "source_path": source_path,
                **{key: schema_fact.get(key) or "" for key in SCHEMA_FACT_METADATA_KEYS},
                "detail": schema_fact.get("detail") or "",
            },
        ))
    return rows


def _migration_relationships_from_overview(
    conn: sqlite3.Connection,
    overview: Dict[str, Any],
    source_dir: Path,
) -> List[tuple[Any, ...]]:
    file_ids = _file_ids_by_normalized_path(conn, source_dir)
    rows: List[tuple[Any, ...]] = []
    seen = set()
    for migration_fact in overview.get("migration_facts", []):
        source_path = migration_fact.get("source_path")
        file_id = file_ids.get(source_path or "")
        target = _migration_fact_key(migration_fact)
        if file_id is None or not target:
            continue

        source_line = _positive_int(migration_fact.get("line"))
        identity = (file_id, target, source_line)
        if identity in seen:
            continue
        seen.add(identity)
        rows.append(_relationship_row(
            src_id=file_id,
            dst_kind="migration",
            dst_id=None,
            rel_type="defines_migration",
            target=target,
            confidence="heuristic",
            source_line=source_line,
            metadata={
                "source_path": source_path,
                **{key: migration_fact.get(key) or "" for key in MIGRATION_FACT_METADATA_KEYS},
                "detail": migration_fact.get("detail") or "",
            },
        ))
    return rows


def _test_relationships_from_overview(
    conn: sqlite3.Connection,
    overview: Dict[str, Any],
    source_dir: Path,
) -> List[tuple[Any, ...]]:
    file_ids = _file_ids_by_normalized_path(conn, source_dir)
    indexed_paths = sorted(file_ids)
    indexed_path_set = set(indexed_paths)
    test_file_ids = {
        str(test_file.get("path") or ""): file_ids[str(test_file.get("path") or "")]
        for test_file in overview.get("tests", [])
        if str(test_file.get("path") or "") in file_ids
    }
    import_targets = _test_import_targets_by_source(conn, source_dir, test_file_ids, indexed_path_set)
    rows: List[tuple[Any, ...]] = []
    seen = set()

    for test_file in overview.get("tests", []):
        source_path = test_file.get("path")
        test_file_id = file_ids.get(source_path or "")
        if test_file_id is None:
            continue

        matches: List[Dict[str, Any]] = []
        target_path = _infer_test_target_path(str(source_path), indexed_paths)
        if target_path:
            matches.append({
                "target_path": target_path,
                "match": "filename",
                "source_line": 1,
            })
        matches.extend(import_targets.get(str(source_path), []))
        matches = _dedupe_test_target_matches(matches)
        if not matches:
            continue

        for match in matches[:MAX_TEST_TARGETS_PER_FILE]:
            target_path = str(match.get("target_path") or "")
            target_file_id = file_ids.get(target_path)
            if target_file_id is None:
                continue

            identity = (test_file_id, target_file_id)
            if identity in seen:
                continue
            seen.add(identity)
            metadata = {
                "source_path": source_path,
                "target_path": target_path,
                "match": match.get("match") or "filename",
                "detail": test_file.get("detail") or "test source",
            }
            if metadata["match"] == "import":
                metadata.update({
                    "import_target": match.get("import_target") or "",
                    "import_syntax": match.get("import_syntax") or "",
                    "import_confidence": match.get("import_confidence") or "",
                })
            rows.append(_relationship_row(
                src_id=test_file_id,
                dst_kind="file",
                dst_id=target_file_id,
                rel_type="tests",
                target=target_path,
                confidence="heuristic",
                source_line=_positive_int(match.get("source_line")) or 1,
                metadata=metadata,
            ))
    return rows


def _test_import_targets_by_source(
    conn: sqlite3.Connection,
    source_dir: Path,
    test_file_ids: Dict[str, int],
    indexed_paths: set[str],
) -> Dict[str, List[Dict[str, Any]]]:
    if not test_file_ids:
        return {}

    conn.row_factory = sqlite3.Row
    matches_by_source: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    file_ids = list(test_file_ids.values())
    for start in range(0, len(file_ids), 500):
        chunk = file_ids[start:start + 500]
        placeholders = ",".join("?" for _ in chunk)
        rows = conn.execute(
            f"""
            SELECT f.path AS source_path, r.target, r.source_line, r.confidence, r.metadata_json
            FROM relationships r
            JOIN files f ON r.src_kind = 'file' AND r.src_id = f.id
            WHERE r.rel_type = 'imports'
              AND r.src_kind = 'file'
              AND r.src_id IN ({placeholders})
            ORDER BY f.path, r.source_line, r.target
            """,
            chunk,
        ).fetchall()

        for row in rows:
            metadata = _loads_json_object(row["metadata_json"])
            source_path = metadata.get("source_path")
            if not isinstance(source_path, str) or not source_path:
                source_path = _normalize_indexed_path(row["source_path"], source_dir)
            if source_path not in test_file_ids:
                continue

            target = str(row["target"] or "")
            target_path = _resolve_import_target_path(source_path, target, indexed_paths)
            if not target_path or target_path == source_path or _is_test_path(target_path):
                continue

            matches_by_source[source_path].append({
                "target_path": target_path,
                "match": "import",
                "source_line": row["source_line"] or 1,
                "import_target": target,
                "import_syntax": metadata.get("syntax") or "",
                "import_confidence": row["confidence"] or "",
            })

    return {
        source_path: _dedupe_test_target_matches(matches)
        for source_path, matches in matches_by_source.items()
    }


def _dedupe_test_target_matches(matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped: List[Dict[str, Any]] = []
    seen = set()
    for match in matches:
        target_path = str(match.get("target_path") or "")
        if not target_path or target_path in seen:
            continue
        seen.add(target_path)
        deduped.append(match)
    return deduped


def _config_relationships_from_overview(
    conn: sqlite3.Connection,
    overview: Dict[str, Any],
    source_dir: Path,
) -> List[tuple[Any, ...]]:
    file_ids = _file_ids_by_normalized_path(conn, source_dir)
    rows: List[tuple[Any, ...]] = []
    seen = set()

    for config_file in overview.get("configs", []):
        source_path = config_file.get("path")
        file_id = file_ids.get(source_path or "")
        if file_id is None:
            continue

        target = _config_relationship_target(str(source_path), str(config_file.get("detail") or ""))
        if not target:
            continue

        identity = (file_id, target)
        if identity in seen:
            continue
        seen.add(identity)
        rows.append(_relationship_row(
            src_id=file_id,
            dst_kind="tool",
            dst_id=None,
            rel_type="configures",
            target=target,
            confidence="derived",
            source_line=1,
            metadata={
                "source_path": source_path,
                "detail": config_file.get("detail") or "",
                "tool": target,
            },
        ))
    return rows


def _module_dependency_relationships_from_imports(conn: sqlite3.Connection, source_dir: Path) -> List[tuple[Any, ...]]:
    conn.row_factory = sqlite3.Row
    table = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'relationships'"
    ).fetchone()
    if table is None:
        return []

    indexed_paths = _indexed_paths_from_conn(conn, source_dir)
    import_rows = conn.execute(
        """
        SELECT r.src_id, f.path AS source_path, r.target, r.source_line, r.confidence, r.metadata_json
        FROM relationships r
        JOIN files f ON r.src_kind = 'file' AND r.src_id = f.id
        WHERE r.rel_type = 'imports'
          AND r.src_kind = 'file'
        ORDER BY f.path, r.source_line, r.target
        """
    ).fetchall()

    dependencies: Dict[tuple[str, str], Dict[str, Any]] = {}
    for row in import_rows:
        metadata = _loads_json_object(row["metadata_json"])
        source_path = metadata.get("source_path")
        if not isinstance(source_path, str) or not source_path:
            source_path = _normalize_indexed_path(row["source_path"], source_dir)

        target_path = metadata.get("target_path")
        if not isinstance(target_path, str) or not target_path:
            target_path = _resolve_import_target_path(source_path, str(row["target"] or ""), indexed_paths)
        if not target_path:
            continue

        source_module = _module_path(source_path)
        target_module = _module_path(target_path)
        if not source_module or not target_module or source_module == target_module:
            continue

        key = (source_module, target_module)
        dependency = dependencies.setdefault(
            key,
            {
                "source_file_id": row["src_id"],
                "source_path": source_path,
                "target_path": target_path,
                "source_line": row["source_line"] or 1,
                "source_module": source_module,
                "target_module": target_module,
                "import_count": 0,
                "sample_imports": [],
                "confidence": row["confidence"] or "derived",
            },
        )
        dependency["import_count"] += 1
        if len(dependency["sample_imports"]) < 4:
            dependency["sample_imports"].append({
                "source_path": source_path,
                "target": row["target"] or "",
                "target_path": target_path,
                "source_line": row["source_line"] or 0,
                "syntax": metadata.get("syntax") or "",
            })

    rows: List[tuple[Any, ...]] = []
    for dependency in sorted(
        dependencies.values(),
        key=lambda item: (-int(item.get("import_count") or 0), item.get("source_module") or "", item.get("target_module") or ""),
    )[:MAX_MODULE_DEPENDENCIES]:
        rows.append(_relationship_row(
            src_id=int(dependency["source_file_id"]),
            dst_kind="module",
            dst_id=None,
            rel_type="depends_on_module",
            target=str(dependency["target_module"]),
            confidence="derived",
            source_line=_positive_int(dependency.get("source_line")),
            metadata={
                "source_path": dependency["source_path"],
                "target_path": dependency["target_path"],
                "source_module": dependency["source_module"],
                "target_module": dependency["target_module"],
                "import_count": dependency["import_count"],
                "sample_imports": dependency["sample_imports"],
            },
        ))
    return rows


def _export_relationships_from_symbols(conn: sqlite3.Connection, source_dir: Path) -> List[tuple[Any, ...]]:
    conn.row_factory = sqlite3.Row
    symbol_rows = conn.execute(
        """
        SELECT s.id, s.file_id, s.name, s.symbol_type, s.start_line, f.path AS file_path
        FROM symbols s
        JOIN files f ON f.id = s.file_id
        WHERE s.symbol_type IN ('function', 'class', 'module', 'interface', 'struct', 'enum', 'trait')
        ORDER BY f.path, s.start_line, s.name
        """
    ).fetchall()

    explicit_js_exports = _explicit_js_exports_by_path(source_dir)
    rows: List[tuple[Any, ...]] = []
    seen = set()

    for symbol in symbol_rows:
        source_path = _normalize_indexed_path(symbol["file_path"], source_dir)
        symbol_name = str(symbol["name"] or "")
        symbol_type = str(symbol["symbol_type"] or "")
        if not symbol_name or symbol_name.startswith("_") or symbol_type not in EXPORTABLE_SYMBOL_TYPES:
            continue

        source_pure = PurePosixPath(source_path)
        source_suffix = source_pure.suffix.lower()
        metadata: Optional[Dict[str, Any]] = None
        confidence = "derived"

        if source_suffix == ".py":
            metadata = {
                "language": "Python",
                "source_path": source_path,
                "symbol_type": symbol_type,
                "syntax": "public-top-level-symbol",
            }
        elif source_suffix in JS_ROUTE_EXTENSIONS:
            js_exports = explicit_js_exports.get(source_path, {})
            export_info = js_exports.get(symbol_name)
            if export_info is None:
                continue
            confidence = "heuristic"
            metadata = {
                "language": "JavaScript/TypeScript",
                "source_path": source_path,
                "symbol_type": symbol_type,
                "syntax": export_info["syntax"],
                "exported_as": export_info["exported_as"],
            }
        else:
            continue

        identity = (symbol["file_id"], symbol["id"], symbol_name)
        if identity in seen:
            continue
        seen.add(identity)
        rows.append(_relationship_row(
            src_id=symbol["file_id"],
            dst_kind="symbol",
            dst_id=symbol["id"],
            rel_type="exports",
            target=symbol_name,
            confidence=confidence,
            source_line=_positive_int(symbol["start_line"]),
            metadata=metadata,
        ))

        if len(rows) >= MAX_EXPORT_RELATIONSHIPS:
            break

    return rows


def _explicit_js_exports_by_path(source_dir: Path) -> Dict[str, Dict[str, Dict[str, str]]]:
    if not source_dir.exists():
        return {}

    exports_by_path: Dict[str, Dict[str, Dict[str, str]]] = {}
    for file_path in sorted(source_dir.rglob("*")):
        if not file_path.is_file() or file_path.suffix.lower() not in JS_ROUTE_EXTENSIONS:
            continue

        try:
            relative_path = file_path.relative_to(source_dir)
        except ValueError:
            continue
        if _is_pruned(relative_path):
            continue

        text = _read_text_file(file_path)
        if text is None:
            continue

        source_path = _to_posix(relative_path)
        exports = _parse_explicit_js_exports(text)
        if exports:
            exports_by_path[source_path] = exports

    return exports_by_path


def _parse_explicit_js_exports(text: str) -> Dict[str, Dict[str, str]]:
    exports: Dict[str, Dict[str, str]] = {}

    for syntax, pattern in (
        (
            "export-declaration",
            r"\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)\b",
        ),
        (
            "export-variable",
            r"\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b",
        ),
    ):
        for match in re.finditer(pattern, text):
            name = match.group(1)
            exports.setdefault(name, {"syntax": syntax, "exported_as": name})

    for match in re.finditer(r"\bexport\s*\{([^}]+)\}", text, flags=re.DOTALL):
        for item in match.group(1).split(","):
            raw = item.strip()
            if not raw:
                continue
            parts = re.split(r"\s+as\s+", raw, maxsplit=1, flags=re.IGNORECASE)
            local_name = parts[0].strip()
            exported_as = parts[1].strip() if len(parts) == 2 else local_name
            if re.fullmatch(r"[A-Za-z_$][\w$]*", local_name) and re.fullmatch(r"[A-Za-z_$][\w$]*", exported_as):
                exports.setdefault(local_name, {"syntax": "export-list", "exported_as": exported_as})

    return exports


def _mention_relationships_from_docs(
    conn: sqlite3.Connection,
    overview: Dict[str, Any],
    source_dir: Path,
) -> List[tuple[Any, ...]]:
    if not source_dir.exists():
        return []

    file_ids = _file_ids_by_normalized_path(conn, source_dir)
    symbols = _mention_candidate_symbols(conn, source_dir)
    if not symbols:
        return []

    rows: List[tuple[Any, ...]] = []
    seen = set()
    for doc in overview.get("docs", []):
        source_path = str(doc.get("path") or "")
        file_id = file_ids.get(source_path)
        if file_id is None:
            continue

        file_path = source_dir / Path(source_path)
        try:
            if file_path.stat().st_size > MAX_MENTION_SOURCE_FILE_BYTES:
                continue
        except OSError:
            continue

        text = _read_text_file(file_path)
        if not text:
            continue

        for symbol in symbols:
            if symbol["file_id"] == file_id:
                continue

            line = _first_symbol_mention_line(text, symbol["name"])
            if line is None:
                continue

            identity = (file_id, symbol["id"], symbol["name"])
            if identity in seen:
                continue
            seen.add(identity)
            rows.append(_relationship_row(
                src_id=file_id,
                dst_kind="symbol",
                dst_id=symbol["id"],
                rel_type="mentions",
                target=symbol["name"],
                confidence="heuristic",
                source_line=line,
                metadata={
                    "source_path": source_path,
                    "target_path": symbol["source_path"],
                    "symbol_type": symbol["symbol_type"],
                    "match": "documentation-text",
                },
            ))

            if len(rows) >= MAX_MENTION_RELATIONSHIPS:
                return rows

    return rows


def _mention_candidate_symbols(conn: sqlite3.Connection, source_dir: Path) -> List[Dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    explicit_js_exports = _explicit_js_exports_by_path(source_dir)
    rows = conn.execute(
        """
        SELECT s.id, s.file_id, s.name, s.symbol_type, f.path AS file_path
        FROM symbols s
        JOIN files f ON f.id = s.file_id
        WHERE s.symbol_type IN ('function', 'class', 'module', 'interface', 'struct', 'enum', 'trait')
        ORDER BY LENGTH(s.name) DESC, s.name, f.path
        LIMIT 500
        """
    ).fetchall()

    candidates: List[Dict[str, Any]] = []
    seen_names = set()
    for row in rows:
        name = str(row["name"] or "")
        symbol_type = str(row["symbol_type"] or "")
        if not _is_mention_candidate_name(name) or symbol_type not in EXPORTABLE_SYMBOL_TYPES:
            continue
        source_path = _normalize_indexed_path(row["file_path"], source_dir)
        source_suffix = PurePosixPath(source_path).suffix.lower()
        if source_suffix == ".py":
            pass
        elif source_suffix in JS_ROUTE_EXTENSIONS:
            if name not in explicit_js_exports.get(source_path, {}):
                continue
        else:
            continue
        if name in seen_names:
            continue
        seen_names.add(name)
        candidates.append({
            "id": row["id"],
            "file_id": row["file_id"],
            "name": name,
            "symbol_type": symbol_type,
            "source_path": source_path,
        })
    return candidates


def _call_relationships_from_symbols(conn: sqlite3.Connection, source_dir: Path) -> List[tuple[Any, ...]]:
    conn.row_factory = sqlite3.Row
    symbols_by_path = _callable_symbols_by_path(conn, source_dir)
    explicit_js_exports = _explicit_js_exports_by_path(source_dir)

    rows: List[tuple[Any, ...]] = []
    seen = set()
    for source_path, symbols in list(symbols_by_path.items())[:MAX_CALL_FILES]:
        suffix = PurePosixPath(source_path).suffix.lower()
        if suffix != ".py" and suffix not in JS_ROUTE_EXTENSIONS:
            continue
        if len(symbols) > MAX_CALL_SYMBOLS_PER_FILE:
            continue

        unique_targets = _unique_callable_targets(symbols)
        imported_targets = _imported_callable_targets(
            conn,
            source_path,
            suffix,
            source_dir,
            symbols_by_path,
            explicit_js_exports,
        )
        for caller in symbols:
            caller_type = str(caller["symbol_type"] or "")
            if caller_type not in CALLER_SYMBOL_TYPES:
                continue
            code = str(caller["code"] or "")
            if not code or len(code.encode("utf-8", errors="ignore")) > MAX_CALL_SOURCE_SYMBOL_BYTES:
                continue

            caller_start = _positive_int(caller["start_line"]) or 1
            if suffix == ".py":
                direct_calls = _python_direct_calls(code, caller_start)
                language = "Python"
            else:
                direct_calls = _js_direct_calls(code, caller_start)
                language = "JavaScript/TypeScript"

            for call in direct_calls:
                target = unique_targets.get(call["name"])
                target_path = source_path
                syntax = call["syntax"]
                confidence = call["confidence"]

                if target is None:
                    imported_target = _resolve_imported_call_target(call, imported_targets)
                    if imported_target is not None:
                        target = imported_target["symbol"]
                        target_path = imported_target["target_path"]
                        syntax = imported_target["syntax"]
                        confidence = imported_target["confidence"]

                if target is None or target["id"] == caller["id"]:
                    continue

                identity = (caller["id"], target["id"])
                if identity in seen:
                    continue
                seen.add(identity)
                rows.append(_relationship_row(
                    src_id=caller["id"],
                    src_kind="symbol",
                    dst_kind="symbol",
                    dst_id=target["id"],
                    rel_type="calls",
                    target=str(target["name"]),
                    confidence=confidence,
                    source_line=call["line"],
                    metadata={
                        "source_path": source_path,
                        "target_path": target_path,
                        "language": language,
                        "caller": str(caller["name"]),
                        "caller_type": caller_type,
                        "symbol_type": str(target["symbol_type"]),
                        "syntax": syntax,
                    },
                ))
                if len(rows) >= MAX_CALL_RELATIONSHIPS:
                    return rows

    return rows


def _reference_relationships_from_symbols(conn: sqlite3.Connection, source_dir: Path) -> List[tuple[Any, ...]]:
    conn.row_factory = sqlite3.Row
    symbols_by_path = _callable_symbols_by_path(conn, source_dir)
    explicit_js_exports = _explicit_js_exports_by_path(source_dir)

    rows: List[tuple[Any, ...]] = []
    seen = set()
    for source_path, symbols in list(symbols_by_path.items())[:MAX_CALL_FILES]:
        suffix = PurePosixPath(source_path).suffix.lower()
        if suffix != ".py" and suffix not in JS_ROUTE_EXTENSIONS:
            continue
        if len(symbols) > MAX_CALL_SYMBOLS_PER_FILE:
            continue

        unique_targets = _unique_callable_targets(symbols)
        imported_targets = _imported_callable_targets(
            conn,
            source_path,
            suffix,
            source_dir,
            symbols_by_path,
            explicit_js_exports,
        )
        for caller in symbols:
            caller_type = str(caller["symbol_type"] or "")
            if caller_type not in CALLER_SYMBOL_TYPES:
                continue
            code = str(caller["code"] or "")
            if not code or len(code.encode("utf-8", errors="ignore")) > MAX_CALL_SOURCE_SYMBOL_BYTES:
                continue

            caller_start = _positive_int(caller["start_line"]) or 1
            if suffix == ".py":
                references = _python_symbol_references(code, caller_start)
                language = "Python"
            else:
                references = _js_symbol_references(code, caller_start)
                language = "JavaScript/TypeScript"

            for reference in references:
                target = unique_targets.get(reference["name"])
                target_path = source_path
                syntax = reference["syntax"]
                confidence = reference["confidence"]

                if target is None:
                    imported_target = _resolve_imported_call_target(reference, imported_targets)
                    if imported_target is not None:
                        target = imported_target["symbol"]
                        target_path = imported_target["target_path"]
                        syntax = str(imported_target["syntax"]).replace("-call", "-reference")
                        confidence = imported_target["confidence"]

                if target is None or target["id"] == caller["id"]:
                    continue

                identity = (caller["id"], target["id"], reference["line"], reference.get("receiver"))
                if identity in seen:
                    continue
                seen.add(identity)
                rows.append(_relationship_row(
                    src_id=caller["id"],
                    src_kind="symbol",
                    dst_kind="symbol",
                    dst_id=target["id"],
                    rel_type="references",
                    target=str(target["name"]),
                    confidence=confidence,
                    source_line=reference["line"],
                    metadata={
                        "source_path": source_path,
                        "target_path": target_path,
                        "language": language,
                        "caller": str(caller["name"]),
                        "caller_type": caller_type,
                        "symbol_type": str(target["symbol_type"]),
                        "syntax": syntax,
                    },
                ))
                if len(rows) >= MAX_REFERENCE_RELATIONSHIPS:
                    return rows

    return rows


def _callable_symbols_by_path(conn: sqlite3.Connection, source_dir: Path) -> Dict[str, List[sqlite3.Row]]:
    rows = conn.execute(
        """
        SELECT s.id, s.file_id, s.name, s.symbol_type, s.start_line, s.end_line, s.code, f.path AS file_path
        FROM files f
        JOIN symbols s ON s.file_id = f.id
        WHERE s.symbol_type IN ('function', 'method', 'class')
        ORDER BY f.path, s.start_line, s.id
        LIMIT ?
        """,
        (MAX_CALL_FILES * (MAX_CALL_SYMBOLS_PER_FILE + 1),),
    ).fetchall()

    symbols_by_path: Dict[str, List[sqlite3.Row]] = defaultdict(list)
    for row in rows:
        symbols_by_path[_normalize_indexed_path(row["file_path"], source_dir)].append(row)
    return dict(sorted(symbols_by_path.items()))


def _imported_callable_targets(
    conn: sqlite3.Connection,
    source_path: str,
    suffix: str,
    source_dir: Path,
    symbols_by_path: Dict[str, List[sqlite3.Row]],
    explicit_js_exports: Dict[str, Dict[str, Dict[str, str]]],
) -> Dict[str, Any]:
    if suffix == ".py":
        return _python_imported_callable_targets(conn, source_path, symbols_by_path)
    if suffix in JS_ROUTE_EXTENSIONS:
        return _js_imported_callable_targets(source_path, source_dir, symbols_by_path, explicit_js_exports)
    return {"names": {}, "namespaces": {}}


def _python_imported_callable_targets(
    conn: sqlite3.Connection,
    source_path: str,
    symbols_by_path: Dict[str, List[sqlite3.Row]],
) -> Dict[str, Any]:
    file_id = _first_file_id(symbols_by_path.get(source_path, []))
    if file_id is None:
        return {"names": {}, "namespaces": {}}

    rows = conn.execute(
        """
        SELECT target, metadata_json
        FROM relationships
        WHERE src_kind = 'file'
          AND src_id = ?
          AND rel_type = 'imports'
        ORDER BY source_line, target
        """,
        (file_id,),
    ).fetchall()

    names: Dict[str, Dict[str, Any]] = {}
    namespaces: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for row in rows:
        target_module = str(row["target"] or "")
        metadata = _loads_json_object(row["metadata_json"])
        target_path = _resolve_python_module_path(source_path, target_module, symbols_by_path)
        if target_path is None:
            continue
        target_symbols = _unique_callable_targets(symbols_by_path.get(target_path, []))

        syntax = str(metadata.get("syntax") or "")
        if syntax == "from":
            imported = metadata.get("imports")
            aliases = metadata.get("aliases")
            if not isinstance(imported, list):
                continue
            if not isinstance(aliases, dict):
                aliases = {}
            for imported_name in imported:
                if not isinstance(imported_name, str):
                    continue
                symbol = target_symbols.get(imported_name)
                if symbol is None:
                    continue
                local_name = aliases.get(imported_name) if isinstance(aliases.get(imported_name), str) else imported_name
                names[local_name] = {
                    "symbol": symbol,
                    "target_path": target_path,
                    "syntax": "imported-name-call",
                    "confidence": "parsed",
                }
        elif syntax == "import":
            alias = metadata.get("alias")
            local_name = alias if isinstance(alias, str) and alias else target_module.split(".")[-1]
            namespaces[local_name] = {
                name: {
                    "symbol": symbol,
                    "target_path": target_path,
                    "syntax": "imported-attribute-call",
                    "confidence": "parsed",
                }
                for name, symbol in target_symbols.items()
            }

    return {"names": names, "namespaces": namespaces}


def _js_imported_callable_targets(
    source_path: str,
    source_dir: Path,
    symbols_by_path: Dict[str, List[sqlite3.Row]],
    explicit_js_exports: Dict[str, Dict[str, Dict[str, str]]],
) -> Dict[str, Any]:
    text = _read_text_file(source_dir / Path(source_path))
    if not text:
        return {"names": {}, "namespaces": {}}

    names: Dict[str, Dict[str, Any]] = {}
    namespaces: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for binding in _parse_js_import_bindings(text):
        target_path = _resolve_js_module_path(source_path, binding["module"], symbols_by_path)
        if target_path is None:
            continue
        target_symbols = _unique_callable_targets(symbols_by_path.get(target_path, []))
        exported_by_local = explicit_js_exports.get(target_path, {})
        exported_to_local = {
            export_info.get("exported_as"): local_name
            for local_name, export_info in exported_by_local.items()
            if isinstance(export_info.get("exported_as"), str)
        }

        if binding["kind"] == "named":
            exported_name = binding["imported"]
            local_symbol_name = exported_to_local.get(exported_name, exported_name)
            symbol = target_symbols.get(local_symbol_name)
            if symbol is None:
                continue
            names[binding["local"]] = {
                "symbol": symbol,
                "target_path": target_path,
                "syntax": "imported-name-call",
                "confidence": "heuristic",
            }
        elif binding["kind"] == "namespace":
            exported_symbols: Dict[str, Dict[str, Any]] = {}
            for exported_name, local_symbol_name in exported_to_local.items():
                symbol = target_symbols.get(local_symbol_name)
                if symbol is not None:
                    exported_symbols[exported_name] = {
                        "symbol": symbol,
                        "target_path": target_path,
                        "syntax": "imported-attribute-call",
                        "confidence": "heuristic",
                    }
            namespaces[binding["local"]] = exported_symbols

    return {"names": names, "namespaces": namespaces}


def _resolve_imported_call_target(call: Dict[str, Any], imported_targets: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    receiver = call.get("receiver")
    if isinstance(receiver, str) and receiver:
        namespace = imported_targets.get("namespaces", {}).get(receiver)
        if namespace:
            return namespace.get(call["name"])
        return None
    return imported_targets.get("names", {}).get(call["name"])


def _unique_callable_targets(symbols: List[sqlite3.Row]) -> Dict[str, sqlite3.Row]:
    targets_by_name: Dict[str, List[sqlite3.Row]] = defaultdict(list)
    for symbol in symbols:
        name = str(symbol["name"] or "")
        symbol_type = str(symbol["symbol_type"] or "")
        if not _is_call_candidate_name(name) or symbol_type not in CALLABLE_SYMBOL_TYPES:
            continue
        targets_by_name[name].append(symbol)
    return {name: rows[0] for name, rows in targets_by_name.items() if len(rows) == 1}


def _first_file_id(symbols: List[sqlite3.Row]) -> Optional[int]:
    if not symbols:
        return None
    return _positive_int(symbols[0]["file_id"])


def _loads_json_object(raw: Any) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _resolve_python_module_path(
    source_path: str,
    module_name: str,
    symbols_by_path: Dict[str, List[sqlite3.Row]],
) -> Optional[str]:
    if not module_name:
        return None

    if module_name.startswith("."):
        dot_count = len(module_name) - len(module_name.lstrip("."))
        module_tail = module_name[dot_count:]
        base = PurePosixPath(source_path).parent
        for _ in range(max(dot_count - 1, 0)):
            base = base.parent
        parts = [part for part in module_tail.split(".") if part]
        module_path = base.joinpath(*parts) if parts else base
    else:
        module_path = PurePosixPath(*[part for part in module_name.split(".") if part])

    for candidate in (
        module_path.with_suffix(".py"),
        module_path / "__init__.py",
        module_path.with_suffix(".pyi"),
    ):
        normalized = _to_posix(candidate)
        if normalized in symbols_by_path:
            return normalized
    return None


def _resolve_js_module_path(
    source_path: str,
    module_name: str,
    symbols_by_path: Dict[str, List[sqlite3.Row]],
) -> Optional[str]:
    if not module_name.startswith("."):
        return None

    source_dir = PurePosixPath(source_path).parent
    module_path = source_dir.joinpath(module_name)
    suffixes = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
    index_names = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs", "index.cjs"]

    for suffix in suffixes:
        candidate = _to_posix(PurePosixPath(f"{module_path}{suffix}"))
        if candidate in symbols_by_path:
            return candidate
    for index_name in index_names:
        candidate = _to_posix(module_path / index_name)
        if candidate in symbols_by_path:
            return candidate
    return None


def _parse_js_import_bindings(text: str) -> List[Dict[str, str]]:
    bindings: List[Dict[str, str]] = []
    import_re = re.compile(r"^\s*import(?:\s+type)?\s+(.+?)\s+from\s*['\"]([^'\"]+)['\"]", re.MULTILINE)
    namespace_re = re.compile(r"^\s*import(?:\s+type)?\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*['\"]([^'\"]+)['\"]", re.MULTILINE)

    for match in namespace_re.finditer(text):
        bindings.append({
            "kind": "namespace",
            "local": match.group(1),
            "module": match.group(2),
        })

    for match in import_re.finditer(text):
        clause = match.group(1).strip()
        module_name = match.group(2)
        named_match = re.search(r"\{([^}]+)\}", clause, flags=re.DOTALL)
        if not named_match:
            continue
        for item in named_match.group(1).split(","):
            raw = item.strip()
            if not raw:
                continue
            parts = re.split(r"\s+as\s+", raw, maxsplit=1, flags=re.IGNORECASE)
            imported = parts[0].strip()
            local = parts[1].strip() if len(parts) == 2 else imported
            if re.fullmatch(r"[A-Za-z_$][\w$]*", imported) and re.fullmatch(r"[A-Za-z_$][\w$]*", local):
                bindings.append({
                    "kind": "named",
                    "imported": imported,
                    "local": local,
                    "module": module_name,
                })

    return bindings


def _is_call_candidate_name(name: str) -> bool:
    return re.fullmatch(r"[A-Za-z_$][\w$]*", name) is not None


def _python_direct_calls(code: str, start_line: int) -> List[Dict[str, Any]]:
    try:
        tree = ast.parse(textwrap.dedent(code))
    except SyntaxError:
        return []

    calls: List[Dict[str, Any]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue

        name = None
        receiver = None
        syntax = "name-call"
        if isinstance(node.func, ast.Name):
            name = node.func.id
        elif isinstance(node.func, ast.Attribute):
            name = node.func.attr
            if isinstance(node.func.value, ast.Name):
                receiver = node.func.value.id
            syntax = "attribute-call"

        if not name:
            continue
        calls.append({
            "name": name,
            "receiver": receiver,
            "line": start_line + max(getattr(node, "lineno", 1), 1) - 1,
            "syntax": syntax,
            "confidence": "parsed",
        })

    return calls


def _python_symbol_references(code: str, start_line: int) -> List[Dict[str, Any]]:
    try:
        tree = ast.parse(textwrap.dedent(code))
    except SyntaxError:
        return []

    call_func_ids = {
        id(node.func)
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
    }
    references: List[Dict[str, Any]] = []
    for node in ast.walk(tree):
        if id(node) in call_func_ids:
            continue

        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            references.append({
                "name": node.id,
                "receiver": None,
                "line": start_line + max(getattr(node, "lineno", 1), 1) - 1,
                "syntax": "name-reference",
                "confidence": "parsed",
            })
        elif isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Load):
            receiver = node.value.id if isinstance(node.value, ast.Name) else None
            if receiver:
                references.append({
                    "name": node.attr,
                    "receiver": receiver,
                    "line": start_line + max(getattr(node, "lineno", 1), 1) - 1,
                    "syntax": "attribute-reference",
                    "confidence": "parsed",
                })

    return references


def _js_direct_calls(code: str, start_line: int) -> List[Dict[str, Any]]:
    calls: List[Dict[str, Any]] = []
    pattern = re.compile(r"(?<![\w$])(?:(?P<receiver>[A-Za-z_$][\w$]*)\s*\.\s*)?(?P<name>[A-Za-z_$][\w$]*)\s*\(")
    for match in pattern.finditer(code):
        name = match.group("name")
        calls.append({
            "name": name,
            "receiver": match.group("receiver"),
            "line": start_line + code[:match.start()].count("\n"),
            "syntax": "attribute-call" if match.group("receiver") else "direct-call",
            "confidence": "heuristic",
        })
    return calls


def _js_symbol_references(code: str, start_line: int) -> List[Dict[str, Any]]:
    references: List[Dict[str, Any]] = []
    seen = set()
    member_pattern = re.compile(r"(?<![\w$])(?P<receiver>[A-Za-z_$][\w$]*)\s*\.\s*(?P<name>[A-Za-z_$][\w$]*)")
    name_pattern = re.compile(r"(?<![\w$.])(?P<name>[A-Za-z_$][\w$]*)(?![\w$])")
    js_keywords = {
        "async", "await", "break", "case", "catch", "class", "const", "continue", "default",
        "else", "export", "false", "for", "from", "function", "if", "import", "let", "new",
        "null", "return", "switch", "true", "try", "typeof", "undefined", "var", "while",
    }

    def next_non_space(index: int) -> str:
        remainder = code[index:]
        stripped = remainder.lstrip()
        return stripped[:1]

    for match in member_pattern.finditer(code):
        if next_non_space(match.end()) == "(":
            continue
        key = (match.group("receiver"), match.group("name"), match.start())
        seen.add(key)
        references.append({
            "name": match.group("name"),
            "receiver": match.group("receiver"),
            "line": start_line + code[:match.start()].count("\n"),
            "syntax": "attribute-reference",
            "confidence": "heuristic",
        })

    for match in name_pattern.finditer(code):
        name = match.group("name")
        if name in js_keywords or next_non_space(match.end()) == "(":
            continue
        if match.start() > 0 and code[match.start() - 1] == ".":
            continue
        key = (None, name, match.start())
        if key in seen:
            continue
        seen.add(key)
        references.append({
            "name": name,
            "receiver": None,
            "line": start_line + code[:match.start()].count("\n"),
            "syntax": "name-reference",
            "confidence": "heuristic",
        })

    return references


def _is_mention_candidate_name(name: str) -> bool:
    if len(name) < 4 or name.startswith("_"):
        return False
    if name.lower() in {"main", "init", "test", "run", "get", "set"}:
        return False
    return re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) is not None


def _first_symbol_mention_line(text: str, symbol_name: str) -> Optional[int]:
    pattern = re.compile(rf"(?<![A-Za-z0-9_]){re.escape(symbol_name)}(?![A-Za-z0-9_])")
    for line_no, line in enumerate(text.splitlines(), 1):
        if pattern.search(line):
            return line_no
    return None


def _file_ids_by_normalized_path(conn: sqlite3.Connection, source_dir: Path) -> Dict[str, int]:
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, path FROM files").fetchall()
    return {
        _normalize_indexed_path(row["path"], source_dir): row["id"]
        for row in rows
    }


def _indexed_paths_from_conn(conn: sqlite3.Connection, source_dir: Path) -> set[str]:
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT path FROM files").fetchall()
    except sqlite3.Error:
        return set()
    return {_normalize_indexed_path(row["path"], source_dir) for row in rows}


def _positive_int(value: Any) -> Optional[int]:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _read_index_facts(repo_db: Path, source_dir: Path) -> tuple[List[Dict[str, Any]], Counter, List[Dict[str, Any]]]:
    conn = sqlite3.connect(repo_db)
    conn.row_factory = sqlite3.Row
    try:
        file_rows = conn.execute(
            "SELECT id, path, total_lines FROM files ORDER BY path"
        ).fetchall()
        file_symbol_rows = conn.execute(
            "SELECT file_id, COUNT(*) AS count FROM symbols GROUP BY file_id"
        ).fetchall()
        symbol_count_by_file_id = {row["file_id"]: row["count"] for row in file_symbol_rows}
        files = [
            {
                "id": row["id"],
                "path": _normalize_indexed_path(row["path"], source_dir),
                "total_lines": row["total_lines"] or 0,
                "symbol_count": symbol_count_by_file_id.get(row["id"], 0),
            }
            for row in file_rows
        ]

        symbol_rows = conn.execute(
            "SELECT symbol_type, COUNT(*) as count FROM symbols GROUP BY symbol_type ORDER BY count DESC, symbol_type"
        ).fetchall()
        symbol_types = Counter({row["symbol_type"]: row["count"] for row in symbol_rows})

        top_symbol_rows = conn.execute(
            """
            SELECT s.name, s.symbol_type, s.start_line, f.path as file_path
            FROM symbols s
            JOIN files f ON f.id = s.file_id
            ORDER BY f.path, s.start_line, s.name
            LIMIT 12
            """
        ).fetchall()
        top_symbols = [
            {
                "name": row["name"],
                "symbol_type": row["symbol_type"],
                "path": _normalize_indexed_path(row["file_path"], source_dir),
                "start_line": row["start_line"],
            }
            for row in top_symbol_rows
        ]
        return files, symbol_types, top_symbols
    finally:
        conn.close()


def _read_index_fallbacks(repo_db: Path, source_dir: Path) -> List[Dict[str, Any]]:
    """Read files that were intentionally indexed through bounded fallback rows."""
    conn = sqlite3.connect(f"file:{repo_db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT f.path, f.total_lines, s.code, s.docstring
            FROM symbols s
            JOIN files f ON f.id = s.file_id
            WHERE s.symbol_type = 'file'
              AND s.docstring LIKE 'Bounded fallback entry;%'
            ORDER BY f.path
            LIMIT ?
            """,
            (MAX_INDEX_FALLBACK_FACTS,),
        ).fetchall()
    except sqlite3.Error:
        return []
    finally:
        conn.close()

    fallbacks: List[Dict[str, Any]] = []
    for row in rows:
        reason = _bounded_fallback_reason_from_code(row["code"] or "")
        path = _normalize_indexed_path(row["path"], source_dir)
        fallbacks.append({
            "path": path,
            "reason": reason or "bounded indexing fallback",
            "total_lines": int(row["total_lines"] or 0),
        })
    return fallbacks


def _bounded_fallback_reason_from_code(code: str) -> str:
    for line in code.splitlines():
        if line.startswith("Bounded fallback:"):
            return line.split(":", 1)[1].strip()
    return ""


def _read_import_relationships(repo_db: Path, source_dir: Path) -> List[Dict[str, Any]]:
    """Read file-level import edges from the cold SQLite artifact."""
    conn = sqlite3.connect(f"file:{repo_db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'relationships'"
        ).fetchone()
        if table is None:
            return []

        indexed_paths = _indexed_paths_from_conn(conn, source_dir)
        rows = conn.execute(
            """
            SELECT f.path AS source_path, r.target, r.source_line, r.confidence, r.metadata_json
            FROM relationships r
            JOIN files f ON r.src_kind = 'file' AND r.src_id = f.id
            WHERE r.rel_type = 'imports'
            ORDER BY f.path, r.source_line, r.target
            LIMIT ?
            """,
            (MAX_IMPORT_RELATIONSHIPS,),
        ).fetchall()
    except sqlite3.Error:
        return []
    finally:
        conn.close()

    imports: List[Dict[str, Any]] = []
    for row in rows:
        metadata: Dict[str, Any] = {}
        if row["metadata_json"]:
            try:
                parsed = json.loads(row["metadata_json"])
                if isinstance(parsed, dict):
                    metadata = parsed
            except json.JSONDecodeError:
                metadata = {}
        source_path = metadata.get("source_path")
        if not isinstance(source_path, str) or not source_path:
            source_path = _normalize_indexed_path(row["source_path"], source_dir)
        target_path = metadata.get("target_path")
        if not isinstance(target_path, str) or not target_path:
            target_path = _resolve_import_target_path(source_path, str(row["target"] or ""), indexed_paths)

        item = {
            "source_path": source_path,
            "target": row["target"],
            "source_line": row["source_line"] or 0,
            "confidence": row["confidence"],
            "syntax": metadata.get("syntax", ""),
        }
        if target_path:
            item["target_path"] = target_path
        imports.append(item)

    return imports


def _derive_module_dependencies(import_relationships: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    dependencies: Dict[tuple[str, str], Dict[str, Any]] = {}
    for item in import_relationships:
        source_path = str(item.get("source_path") or "")
        target_path = str(item.get("target_path") or "")
        if not source_path or not target_path:
            continue

        source_module = _module_path(source_path)
        target_module = _module_path(target_path)
        if not source_module or not target_module or source_module == target_module:
            continue

        key = (source_module, target_module)
        dependency = dependencies.setdefault(
            key,
            {
                "source_module": source_module,
                "target_module": target_module,
                "source_path": source_path,
                "target_path": target_path,
                "source_line": item.get("source_line") or 0,
                "import_count": 0,
                "sample_imports": [],
            },
        )
        dependency["import_count"] += 1
        if len(dependency["sample_imports"]) < 4:
            dependency["sample_imports"].append({
                "source_path": source_path,
                "target": item.get("target") or "",
                "target_path": target_path,
                "source_line": item.get("source_line") or 0,
                "syntax": item.get("syntax") or "",
            })

    return sorted(
        dependencies.values(),
        key=lambda item: (-int(item.get("import_count") or 0), item.get("source_module") or "", item.get("target_module") or ""),
    )[:MAX_MODULE_DEPENDENCIES]


def _summarize_files(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    language_counts: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {"language": "", "file_count": 0, "line_count": 0, "support_levels": set()}
    )
    directory_counts: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"path": "", "file_count": 0, "line_count": 0})
    module_counts: Dict[str, Dict[str, Any]] = {}
    docs: List[Dict[str, Any]] = []
    configs: List[Dict[str, Any]] = []
    tests: List[Dict[str, Any]] = []
    entry_points: List[Dict[str, Any]] = []

    for file in files:
        path = file["path"]
        total_lines = file["total_lines"]
        language = _classify_language(path)
        language_counts[language]["language"] = language
        language_counts[language]["file_count"] += 1
        language_counts[language]["line_count"] += total_lines
        language_counts[language]["support_levels"].add(_file_language_support(path))

        top_dir = _top_directory(path)
        directory_counts[top_dir]["path"] = top_dir
        directory_counts[top_dir]["file_count"] += 1
        directory_counts[top_dir]["line_count"] += total_lines

        module_path = _module_path(path)
        module_counts.setdefault(
            module_path,
            {
                "path": module_path,
                "file_count": 0,
                "line_count": 0,
                "symbol_count": 0,
                "languages": set(),
                "sample_files": [],
            },
        )
        module_counts[module_path]["file_count"] += 1
        module_counts[module_path]["line_count"] += total_lines
        module_counts[module_path]["symbol_count"] += int(file.get("symbol_count") or 0)
        module_counts[module_path]["languages"].add(language)
        if len(module_counts[module_path]["sample_files"]) < MAX_MODULE_SAMPLE_FILES:
            module_counts[module_path]["sample_files"].append(path)

        doc_detail = _doc_detail(path)
        if doc_detail:
            docs.append(_file_fact(path, "doc", doc_detail, total_lines))

        config_detail = _config_detail(path)
        if config_detail:
            configs.append(_file_fact(path, "config", config_detail, total_lines))

        if _is_test_path(path):
            tests.append(_file_fact(path, "test", "test source", total_lines))

        entry_detail = _entry_detail(path)
        if entry_detail:
            entry_points.append(_file_fact(path, "entry", entry_detail, total_lines))

    return {
        "languages": _ranked_languages(language_counts.values(), 64),
        "top_directories": _ranked_values(directory_counts.values(), "file_count", 8),
        "modules": _ranked_modules(module_counts.values()),
        "docs": _limit_facts(docs, 8),
        "configs": _limit_facts(configs, 10),
        "tests": _limit_facts(tests, 10),
        "entry_points": _limit_facts(entry_points, 10),
    }


def _read_package_scripts(source_dir: Path) -> List[Dict[str, str]]:
    if not source_dir.exists():
        return []

    scripts: List[Dict[str, str]] = []
    for package_json in sorted(source_dir.rglob("package.json")):
        if _is_pruned(package_json.relative_to(source_dir)):
            continue

        data = _read_json_file(package_json)
        if not isinstance(data, dict):
            continue

        raw_scripts = data.get("scripts")
        if not isinstance(raw_scripts, dict):
            continue

        source_path = _to_posix(package_json.relative_to(source_dir))
        for name, command in raw_scripts.items():
            if not isinstance(command, str):
                continue
            scripts.append({
                "name": str(name),
                "command": command[:200],
                "source_path": source_path,
            })
            if len(scripts) >= 12:
                return scripts

    return scripts


def _extract_runbook_facts(source_dir: Path) -> Dict[str, List[Dict[str, Any]]]:
    facts: Dict[str, List[Dict[str, Any]]] = {
        "dependency_manifests": [],
        "runbook_commands": [],
        "dependencies": [],
        "workspaces": [],
        "stack_components": [],
        "service_integrations": [],
        "graphql_surfaces": [],
        "message_buses": [],
        "data_stores": [],
        "ai_surfaces": [],
        "payment_surfaces": [],
        "auth_surfaces": [],
        "background_jobs": [],
        "webhook_surfaces": [],
        "observability_surfaces": [],
        "feature_flags": [],
        "notification_surfaces": [],
        "environment_variables": [],
        "architecture_decisions": [],
        "ci_workflows": [],
        "container_services": [],
        "runtime_requirements": [],
        "api_contracts": [],
        "cli_commands": [],
        "test_systems": [],
        "release_processes": [],
        "quality_tools": [],
        "dev_environments": [],
        "build_systems": [],
        "ui_surfaces": [],
        "mobile_surfaces": [],
        "infra_resources": [],
        "repo_policies": [],
        "code_owners": [],
        "deploy_targets": [],
        "supply_chain": [],
        "secret_signals": [],
    }
    if not source_dir.exists():
        return facts

    seen_manifests = set()
    seen_commands = set()
    seen_dependencies = set()
    seen_workspaces = set()
    seen_stack_components = set()
    seen_service_integrations = set()
    seen_graphql_surfaces = set()
    seen_message_buses = set()
    seen_data_stores = set()
    seen_ai_surfaces = set()
    seen_payment_surfaces = set()
    seen_auth_surfaces = set()
    seen_background_jobs = set()
    seen_webhook_surfaces = set()
    seen_observability_surfaces = set()
    seen_feature_flags = set()
    seen_notification_surfaces = set()
    seen_environment = set()
    seen_architecture_decisions = set()
    seen_ci_workflows = set()
    seen_container_services = set()
    seen_runtime_requirements = set()
    seen_api_contracts = set()
    seen_cli_commands = set()
    seen_test_systems = set()
    seen_release_processes = set()
    seen_quality_tools = set()
    seen_dev_environments = set()
    seen_build_systems = set()
    seen_ui_surfaces = set()
    seen_mobile_surfaces = set()
    seen_infra_resources = set()
    seen_repo_policies = set()
    seen_code_owners = set()
    seen_deploy_targets = set()
    seen_supply_chain = set()
    seen_secret_signals = set()
    secret_signal_scan_count = 0
    graphql_surface_scan_count = 0
    message_bus_scan_count = 0
    data_store_scan_count = 0
    ai_surface_scan_count = 0
    payment_surface_scan_count = 0
    auth_surface_scan_count = 0
    background_job_scan_count = 0
    webhook_surface_scan_count = 0
    observability_surface_scan_count = 0
    feature_flag_scan_count = 0
    notification_surface_scan_count = 0
    architecture_decision_scan_count = 0
    cli_command_scan_count = 0
    test_system_scan_count = 0
    release_process_scan_count = 0
    quality_tool_scan_count = 0
    dev_environment_scan_count = 0
    build_system_scan_count = 0
    ui_surface_scan_count = 0
    mobile_surface_scan_count = 0

    for file_path in sorted(source_dir.rglob("*")):
        if not file_path.is_file():
            continue

        try:
            relative_path = file_path.relative_to(source_dir)
        except ValueError:
            continue

        if _is_pruned(relative_path):
            continue

        source_path = _to_posix(relative_path)
        name = file_path.name.lower()

        try:
            if file_path.stat().st_size > MAX_MANIFEST_FILE_BYTES:
                continue
        except OSError:
            continue

        if (
            secret_signal_scan_count < MAX_SECRET_SIGNAL_SCAN_FILES
            and _is_secret_signal_scan_path(relative_path, name)
        ):
            _extract_secret_signals(file_path, source_path, facts, seen_secret_signals)
            secret_signal_scan_count += 1

        if (
            graphql_surface_scan_count < MAX_GRAPHQL_SURFACE_SCAN_FILES
            and _is_graphql_surface_scan_path(relative_path, name)
        ):
            _extract_graphql_surfaces(file_path, source_path, facts, seen_graphql_surfaces)
            graphql_surface_scan_count += 1

        if (
            message_bus_scan_count < MAX_MESSAGE_BUS_SCAN_FILES
            and _is_message_bus_scan_path(relative_path, name)
        ):
            _extract_message_buses(file_path, source_path, facts, seen_message_buses)
            message_bus_scan_count += 1

        if (
            data_store_scan_count < MAX_DATA_STORE_SCAN_FILES
            and _is_data_store_scan_path(relative_path, name)
        ):
            _extract_data_stores(file_path, source_path, facts, seen_data_stores)
            data_store_scan_count += 1

        if (
            ai_surface_scan_count < MAX_AI_SURFACE_SCAN_FILES
            and _is_ai_surface_scan_path(relative_path, name)
        ):
            _extract_ai_surfaces(file_path, source_path, facts, seen_ai_surfaces)
            ai_surface_scan_count += 1

        if (
            payment_surface_scan_count < MAX_PAYMENT_SURFACE_SCAN_FILES
            and _is_payment_surface_scan_path(relative_path, name)
        ):
            _extract_payment_surfaces(file_path, source_path, facts, seen_payment_surfaces)
            payment_surface_scan_count += 1

        if (
            auth_surface_scan_count < MAX_AUTH_SURFACE_SCAN_FILES
            and _is_auth_surface_scan_path(relative_path, name)
        ):
            _extract_auth_surfaces(file_path, source_path, facts, seen_auth_surfaces)
            auth_surface_scan_count += 1

        if (
            background_job_scan_count < MAX_BACKGROUND_JOB_SCAN_FILES
            and _is_background_job_scan_path(relative_path, name)
        ):
            _extract_background_jobs(file_path, source_path, facts, seen_background_jobs)
            background_job_scan_count += 1

        if (
            webhook_surface_scan_count < MAX_WEBHOOK_SURFACE_SCAN_FILES
            and _is_webhook_surface_scan_path(relative_path, name)
        ):
            _extract_webhook_surfaces(file_path, source_path, facts, seen_webhook_surfaces)
            webhook_surface_scan_count += 1

        if (
            observability_surface_scan_count < MAX_OBSERVABILITY_SURFACE_SCAN_FILES
            and _is_observability_surface_scan_path(relative_path, name)
        ):
            _extract_observability_surfaces(file_path, source_path, facts, seen_observability_surfaces)
            observability_surface_scan_count += 1

        if (
            feature_flag_scan_count < MAX_FEATURE_FLAG_SCAN_FILES
            and _is_feature_flag_scan_path(relative_path, name)
        ):
            _extract_feature_flags(file_path, source_path, facts, seen_feature_flags)
            feature_flag_scan_count += 1

        if (
            notification_surface_scan_count < MAX_NOTIFICATION_SURFACE_SCAN_FILES
            and _is_notification_surface_scan_path(relative_path, name)
        ):
            _extract_notification_surfaces(file_path, source_path, facts, seen_notification_surfaces)
            notification_surface_scan_count += 1

        if (
            ui_surface_scan_count < MAX_UI_SURFACE_SCAN_FILES
            and _is_ui_surface_scan_path(relative_path, name)
        ):
            _extract_ui_surfaces(file_path, relative_path, source_path, facts, seen_ui_surfaces)
            ui_surface_scan_count += 1

        if (
            mobile_surface_scan_count < MAX_MOBILE_SURFACE_SCAN_FILES
            and _is_mobile_surface_path(relative_path, name)
        ):
            _extract_mobile_surfaces(file_path, relative_path, source_path, facts, seen_mobile_surfaces)
            mobile_surface_scan_count += 1

        if _is_supply_chain_path(relative_path, name):
            _extract_supply_chain(file_path, source_path, facts, seen_supply_chain)
        if _is_api_contract_path(relative_path, name):
            _extract_api_contracts(file_path, source_path, facts, seen_api_contracts)
        if (
            architecture_decision_scan_count < MAX_ARCHITECTURE_DECISION_SCAN_FILES
            and _is_architecture_decision_path(relative_path, name)
        ):
            _extract_architecture_decisions(file_path, relative_path, source_path, facts, seen_architecture_decisions)
            architecture_decision_scan_count += 1
        if (
            cli_command_scan_count < MAX_CLI_COMMAND_SCAN_FILES
            and _is_cli_command_path(relative_path, name)
        ):
            _extract_cli_commands(file_path, relative_path, source_path, facts, seen_cli_commands)
            cli_command_scan_count += 1
        if (
            test_system_scan_count < MAX_TEST_SYSTEM_SCAN_FILES
            and _is_test_system_path(relative_path, name)
        ):
            _extract_test_systems(file_path, relative_path, source_path, facts, seen_test_systems)
            test_system_scan_count += 1
        if (
            release_process_scan_count < MAX_RELEASE_PROCESS_SCAN_FILES
            and _is_release_process_path(relative_path, name)
        ):
            _extract_release_processes(file_path, relative_path, source_path, facts, seen_release_processes)
            release_process_scan_count += 1
        if (
            quality_tool_scan_count < MAX_QUALITY_TOOL_SCAN_FILES
            and _is_quality_tool_path(relative_path, name)
        ):
            _extract_quality_tools(file_path, relative_path, source_path, facts, seen_quality_tools)
            quality_tool_scan_count += 1
        if (
            dev_environment_scan_count < MAX_DEV_ENVIRONMENT_SCAN_FILES
            and _is_dev_environment_path(relative_path, name)
        ):
            _extract_dev_environments(file_path, relative_path, source_path, facts, seen_dev_environments)
            dev_environment_scan_count += 1
        if (
            build_system_scan_count < MAX_BUILD_SYSTEM_SCAN_FILES
            and _is_build_system_path(relative_path, name)
        ):
            _extract_build_systems(file_path, relative_path, source_path, facts, seen_build_systems)
            build_system_scan_count += 1
        if _is_infra_resource_path(relative_path, name):
            _extract_infra_resources(file_path, source_path, facts, seen_infra_resources)

        if name == "package.json":
            _extract_package_json_runbook(file_path, source_path, facts, seen_manifests, seen_commands, seen_dependencies, seen_runtime_requirements, seen_repo_policies, seen_workspaces)
        elif name == "pyproject.toml":
            _extract_pyproject_runbook(file_path, source_path, facts, seen_manifests, seen_commands, seen_dependencies, seen_runtime_requirements, seen_repo_policies)
        elif name.startswith("requirements") and name.endswith(".txt"):
            _extract_requirements_runbook(file_path, source_path, facts, seen_manifests, seen_commands, seen_dependencies)
        elif name == "go.mod":
            _extract_go_mod_runbook(file_path, source_path, facts, seen_manifests, seen_commands, seen_dependencies, seen_runtime_requirements)
        elif name == "go.work":
            _extract_go_work_runbook(file_path, source_path, facts, seen_workspaces, seen_commands, seen_runtime_requirements)
        elif name == "cargo.toml":
            _extract_cargo_runbook(file_path, source_path, facts, seen_manifests, seen_commands, seen_dependencies, seen_runtime_requirements, seen_repo_policies, seen_workspaces)
        elif name == "composer.json":
            _extract_composer_runbook(file_path, source_path, facts, seen_manifests, seen_commands, seen_dependencies, seen_runtime_requirements, seen_repo_policies)
        elif name == "gemfile":
            _extract_gemfile_runbook(file_path, source_path, facts, seen_manifests, seen_commands, seen_dependencies, seen_runtime_requirements)
        elif name in {".nvmrc", ".node-version"}:
            _extract_version_file_runtime(file_path, source_path, facts, seen_runtime_requirements, "Node.js", "version-file")
        elif name == ".python-version":
            _extract_version_file_runtime(file_path, source_path, facts, seen_runtime_requirements, "Python", "version-file")
        elif name == ".ruby-version":
            _extract_version_file_runtime(file_path, source_path, facts, seen_runtime_requirements, "Ruby", "version-file")
        elif name == ".tool-versions":
            _extract_tool_versions_runtime(file_path, source_path, facts, seen_runtime_requirements)
        elif name == "pom.xml":
            _extract_pom_runtime(file_path, source_path, facts, seen_runtime_requirements)
        elif name in {"build.gradle", "build.gradle.kts"}:
            _extract_gradle_runtime(file_path, source_path, facts, seen_runtime_requirements)
        elif name == "dockerfile":
            _extract_dockerfile_runbook(source_path, facts, seen_commands)
        elif name in {"docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}:
            _extract_compose_runbook(file_path, source_path, facts, seen_manifests, seen_commands)
            _extract_compose_environment(file_path, source_path, facts, seen_environment)
            _extract_compose_services(file_path, source_path, facts, seen_container_services)
        elif name in {".env.example", ".env.sample"}:
            _extract_env_template(file_path, source_path, facts, seen_environment)
        elif _is_ci_workflow_path(relative_path, name):
            _extract_ci_workflow(file_path, source_path, facts, seen_ci_workflows)
        elif _is_license_path(relative_path, name):
            _extract_license_policy(file_path, source_path, facts, seen_repo_policies)
        elif _is_repo_policy_path(relative_path, name):
            _extract_repo_policy_file(file_path, source_path, facts, seen_repo_policies)
        elif _is_codeowners_path(relative_path, name):
            _extract_codeowners(file_path, source_path, facts, seen_code_owners)
        elif name == "pnpm-workspace.yaml":
            _extract_pnpm_workspace(file_path, source_path, facts, seen_workspaces)
        elif name == "lerna.json":
            _extract_lerna_workspace(file_path, source_path, facts, seen_workspaces)
        elif name == "nx.json":
            _extract_nx_workspace(file_path, source_path, facts, seen_workspaces)
        elif name in {"procfile", "vercel.json", "netlify.toml"} or name.endswith(".service") or name in {"chart.yaml", "chart.yml", "kustomization.yaml", "kustomization.yml"} or name.endswith((".yaml", ".yml")):
            _extract_deploy_targets(file_path, source_path, facts, seen_deploy_targets)
        elif name == "makefile":
            _extract_makefile_runbook(file_path, source_path, facts, seen_commands)
        elif name == "justfile":
            _extract_justfile_runbook(file_path, source_path, facts, seen_commands)

    _derive_stack_components(facts, seen_stack_components)
    _derive_service_integrations(facts, seen_service_integrations)
    _derive_graphql_surfaces(facts, seen_graphql_surfaces)
    _derive_message_buses(facts, seen_message_buses)
    _derive_data_stores(facts, seen_data_stores)
    _derive_ai_surfaces(facts, seen_ai_surfaces)
    _derive_payment_surfaces(facts, seen_payment_surfaces)
    _derive_auth_surfaces(facts, seen_auth_surfaces)
    _derive_background_jobs(facts, seen_background_jobs)
    _derive_webhook_surfaces(facts, seen_webhook_surfaces)
    _derive_observability_surfaces(facts, seen_observability_surfaces)
    _derive_feature_flags(facts, seen_feature_flags)
    _derive_notification_surfaces(facts, seen_notification_surfaces)

    facts["dependency_manifests"] = sorted(
        facts["dependency_manifests"],
        key=_manifest_sort_key,
    )[:MAX_DEPENDENCY_MANIFESTS]
    facts["runbook_commands"] = sorted(
        facts["runbook_commands"],
        key=_runbook_command_sort_key,
    )[:MAX_RUNBOOK_COMMANDS]
    facts["dependencies"] = sorted(
        facts["dependencies"],
        key=_dependency_sort_key,
    )[:MAX_DEPENDENCY_FACTS]
    facts["workspaces"] = sorted(
        facts["workspaces"],
        key=_workspace_sort_key,
    )[:MAX_WORKSPACE_FACTS]
    facts["stack_components"] = sorted(
        facts["stack_components"],
        key=lambda item: (_stack_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), item.get("name") or ""),
    )[:MAX_STACK_COMPONENT_FACTS]
    facts["service_integrations"] = sorted(
        facts["service_integrations"],
        key=lambda item: (_service_integration_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), item.get("name") or ""),
    )[:MAX_SERVICE_INTEGRATION_FACTS]
    facts["graphql_surfaces"] = _sort_graphql_surfaces(facts["graphql_surfaces"])
    facts["message_buses"] = _sort_message_buses(facts["message_buses"])
    facts["data_stores"] = _sort_data_stores(facts["data_stores"])
    facts["ai_surfaces"] = _sort_ai_surfaces(facts["ai_surfaces"])
    facts["payment_surfaces"] = _sort_payment_surfaces(facts["payment_surfaces"])
    facts["auth_surfaces"] = sorted(
        facts["auth_surfaces"],
        key=lambda item: (_auth_surface_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_AUTH_SURFACE_FACTS]
    facts["background_jobs"] = sorted(
        facts["background_jobs"],
        key=lambda item: (_background_job_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_BACKGROUND_JOB_FACTS]
    facts["webhook_surfaces"] = _sort_webhook_surfaces(facts["webhook_surfaces"])
    facts["observability_surfaces"] = _sort_observability_surfaces(facts["observability_surfaces"])
    facts["feature_flags"] = _sort_feature_flags(facts["feature_flags"])
    facts["notification_surfaces"] = _sort_notification_surfaces(facts["notification_surfaces"])
    facts["environment_variables"] = sorted(
        facts["environment_variables"],
        key=lambda item: (item.get("source_path") or "", int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_ENV_VAR_FACTS]
    facts["architecture_decisions"] = sorted(
        facts["architecture_decisions"],
        key=lambda item: (_architecture_decision_category_rank(item.get("category") or ""), _architecture_decision_status_rank(item.get("status") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_ARCHITECTURE_DECISION_FACTS]
    facts["ci_workflows"] = sorted(
        facts["ci_workflows"],
        key=lambda item: (item.get("source_path") or "", int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_CI_WORKFLOW_FACTS]
    facts["container_services"] = sorted(
        facts["container_services"],
        key=lambda item: (item.get("source_path") or "", int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_CONTAINER_SERVICE_FACTS]
    facts["runtime_requirements"] = sorted(
        facts["runtime_requirements"],
        key=lambda item: (_source_priority(item.get("source_path") or ""), item.get("runtime") or "", item.get("requirement") or ""),
    )[:MAX_RUNTIME_REQUIREMENT_FACTS]
    facts["api_contracts"] = sorted(
        facts["api_contracts"],
        key=lambda item: (_api_contract_category_rank(item.get("category") or ""), item.get("source_path") or "", int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_API_CONTRACT_FACTS]
    facts["cli_commands"] = sorted(
        facts["cli_commands"],
        key=lambda item: (_cli_command_category_rank(item.get("category") or ""), item.get("source_path") or "", int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_CLI_COMMAND_FACTS]
    facts["test_systems"] = sorted(
        facts["test_systems"],
        key=lambda item: (_test_system_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("tool") or "", item.get("name") or ""),
    )[:MAX_TEST_SYSTEM_FACTS]
    facts["release_processes"] = sorted(
        facts["release_processes"],
        key=lambda item: (_release_process_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("tool") or "", item.get("name") or ""),
    )[:MAX_RELEASE_PROCESS_FACTS]
    facts["quality_tools"] = sorted(
        facts["quality_tools"],
        key=lambda item: (_quality_tool_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("tool") or "", item.get("name") or ""),
    )[:MAX_QUALITY_TOOL_FACTS]
    facts["dev_environments"] = sorted(
        facts["dev_environments"],
        key=lambda item: (_dev_environment_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("tool") or "", item.get("name") or ""),
    )[:MAX_DEV_ENVIRONMENT_FACTS]
    facts["build_systems"] = sorted(
        facts["build_systems"],
        key=lambda item: (_build_system_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("tool") or "", item.get("name") or ""),
    )[:MAX_BUILD_SYSTEM_FACTS]
    facts["ui_surfaces"] = sorted(
        facts["ui_surfaces"],
        key=lambda item: (_ui_surface_category_rank(item.get("category") or ""), item.get("source_path") or "", int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_UI_SURFACE_FACTS]
    facts["mobile_surfaces"] = sorted(
        facts["mobile_surfaces"],
        key=lambda item: (_mobile_surface_category_rank(item.get("category") or ""), item.get("source_path") or "", int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_MOBILE_SURFACE_FACTS]
    facts["infra_resources"] = sorted(
        facts["infra_resources"],
        key=lambda item: (_infra_resource_category_rank(item.get("category") or ""), item.get("source_path") or "", int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_INFRA_RESOURCE_FACTS]
    facts["repo_policies"] = sorted(
        facts["repo_policies"],
        key=lambda item: (_policy_type_rank(item.get("policy_type") or ""), _source_priority(item.get("source_path") or ""), item.get("name") or ""),
    )[:MAX_REPO_POLICY_FACTS]
    facts["code_owners"] = sorted(
        facts["code_owners"],
        key=lambda item: (item.get("source_path") or "", int(item.get("line") or 0), item.get("pattern") or ""),
    )[:MAX_CODE_OWNER_FACTS]
    facts["deploy_targets"] = sorted(
        facts["deploy_targets"],
        key=lambda item: (_deploy_provider_rank(item.get("provider") or ""), item.get("source_path") or "", int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_DEPLOY_TARGET_FACTS]
    facts["supply_chain"] = sorted(
        facts["supply_chain"],
        key=lambda item: (_supply_chain_category_rank(item.get("category") or ""), item.get("source_path") or "", int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_SUPPLY_CHAIN_FACTS]
    facts["secret_signals"] = sorted(
        facts["secret_signals"],
        key=lambda item: (_secret_category_rank(item.get("category") or ""), item.get("source_path") or "", int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_SECRET_SIGNAL_FACTS]
    return facts


def _extract_doc_sections(docs: List[Dict[str, Any]], source_dir: Path) -> List[Dict[str, Any]]:
    if not source_dir.exists():
        return []

    sections: List[Dict[str, Any]] = []
    seen = set()
    heading_pattern = re.compile(r"^(?P<level>#{1,6})\s+(?P<title>.+?)\s*#*\s*$")

    for doc in docs:
        source_path = doc.get("path")
        if not source_path:
            continue
        pure = PurePosixPath(str(source_path))
        if pure.suffix.lower() not in {".md", ".mdx", ""}:
            continue

        file_path = source_dir / Path(*pure.parts)
        try:
            if not file_path.is_file() or file_path.stat().st_size > MAX_DOC_SECTION_FILE_BYTES:
                continue
            text = file_path.read_text(encoding="utf-8-sig", errors="replace")
        except OSError:
            continue

        for line_number, line in enumerate(text.splitlines(), start=1):
            match = heading_pattern.match(line.strip())
            if not match:
                continue
            title = _clean_markdown_heading(match.group("title"))
            if not title:
                continue
            level = len(match.group("level"))
            identity = (str(source_path), line_number, level, title)
            if identity in seen:
                continue
            seen.add(identity)
            sections.append({
                "source_path": str(source_path),
                "line": line_number,
                "level": level,
                "title": title,
                "anchor": _markdown_anchor(title),
            })
            if len(sections) >= MAX_DOC_SECTION_FACTS:
                return sections

    return sections


def _clean_markdown_heading(title: str) -> str:
    title = re.sub(r"`([^`]+)`", r"\1", title)
    title = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", title)
    return " ".join(title.strip().split())[:180]


def _markdown_anchor(title: str) -> str:
    anchor = title.strip().lower()
    anchor = re.sub(r"`([^`]+)`", r"\1", anchor)
    anchor = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", anchor)
    anchor = re.sub(r"[^a-z0-9 _-]+", "", anchor)
    anchor = re.sub(r"\s+", "-", anchor.strip())
    anchor = re.sub(r"-{2,}", "-", anchor)
    return anchor[:160]


def _append_architecture_decision(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    status: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").strip().split())[:180]
    category_value = " ".join(str(category or "").strip().split())[:80]
    status_value = " ".join(str(status or "").strip().split())[:80]
    if not name_value or not category_value:
        return

    line_value = int(line or 1)
    key = (category_value.lower(), status_value.lower(), name_value.lower(), source_path, line_value)
    if key in seen or len(facts["architecture_decisions"]) >= MAX_ARCHITECTURE_DECISION_FACTS:
        return
    seen.add(key)
    facts["architecture_decisions"].append({
        "name": name_value,
        "category": category_value,
        "status": status_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:240],
    })


def _is_architecture_decision_path(relative_path: Path, name: str) -> bool:
    pure = PurePosixPath(_to_posix(relative_path))
    suffix = pure.suffix.lower()
    if suffix not in {".md", ".mdx", ".txt", ".rst"}:
        return False

    normalized = str(pure).lower()
    stem = pure.stem.lower()
    parts = [part.lower() for part in pure.parts]
    decision_dirs = {
        "adr",
        "adrs",
        "rfc",
        "rfcs",
        "decision",
        "decisions",
        "decision-records",
        "architecture",
        "architectural-decisions",
        "design",
        "designs",
        "design-docs",
        "docs",
    }
    if any(part in decision_dirs - {"docs"} for part in parts[:-1]):
        return True
    if name in {
        "architecture.md",
        "architecture.mdx",
        "design.md",
        "design.mdx",
        "decisions.md",
        "decision-log.md",
        "adr.md",
        "adrs.md",
        "rfc.md",
        "rfcs.md",
    }:
        return True
    if re.match(r"^\d{3,5}[-_].+", stem) and any(part in {"docs", "doc"} for part in parts[:-1]):
        return True
    return any(token in normalized for token in (
        "/adr/",
        "/adrs/",
        "/rfc/",
        "/rfcs/",
        "/architecture/",
        "/decisions/",
        "/decision-records/",
        "/design-docs/",
    )) or any(token in stem for token in ("architecture", "decision", "adr", "rfc", "design"))


def _extract_architecture_decisions(
    file_path: Path,
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_architecture_decisions: set,
) -> None:
    try:
        if file_path.stat().st_size > MAX_ARCHITECTURE_DECISION_FILE_BYTES:
            return
    except OSError:
        return
    text = _read_text_file(file_path)
    if text is None:
        return

    title, title_line = _architecture_decision_title(text, source_path)
    category = _architecture_decision_category(relative_path, title, text)
    status, status_line = _architecture_decision_status(text)
    detail = _architecture_decision_detail(text, title_line, status_line)
    _append_architecture_decision(
        facts,
        seen_architecture_decisions,
        name=title,
        category=category,
        status=status,
        source_path=source_path,
        line=title_line or status_line or 1,
        source=_architecture_decision_source(category),
        detail=detail or f"{category} document",
    )


def _architecture_decision_title(text: str, source_path: str) -> tuple[str, int]:
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        stripped = raw_line.strip()
        match = re.match(r"^(#{1,3})\s+(.+?)\s*#*\s*$", stripped)
        if match:
            title = _clean_markdown_heading(match.group(2))
            if title:
                return title, line_number
        if stripped and not stripped.startswith(("---", "+++", "title:", "status:", "date:")):
            break
    return _architecture_decision_name_from_path(source_path), 1


def _architecture_decision_name_from_path(source_path: str) -> str:
    stem = PurePosixPath(source_path).stem
    stem = re.sub(r"^\d{3,5}[-_ ]+", "", stem)
    stem = re.sub(r"[-_]+", " ", stem)
    return " ".join(part.capitalize() if part.islower() else part for part in stem.split())[:180] or PurePosixPath(source_path).name


def _architecture_decision_category(relative_path: Path, title: str, text: str) -> str:
    parts = [part.lower() for part in relative_path.parts]
    joined = "/".join(parts)
    lower_title = str(title or "").lower()
    lower_text = text[:2000].lower()
    if any(part in {"adr", "adrs", "architectural-decisions", "decision-records"} for part in parts) or "architecture decision record" in lower_text or lower_title.startswith("adr"):
        return "adr"
    if any(part in {"rfc", "rfcs"} for part in parts) or lower_title.startswith("rfc"):
        return "rfc"
    if any(part in {"design", "designs", "design-docs"} for part in parts) or "design doc" in lower_text or "design proposal" in lower_text:
        return "design doc"
    if "decision" in joined or "decision" in lower_title:
        return "decision log"
    return "architecture doc"


def _architecture_decision_status(text: str) -> tuple[str, int]:
    patterns = [
        r"(?im)^\s*(?:[-*]\s*)?(?:\*\*)?status(?:\*\*)?\s*[:|-]\s*(?P<status>[A-Za-z][A-Za-z0-9 _/-]{1,60})\s*$",
        r"(?im)^\s*(?:[-*]\s*)?(?:\*\*)?state(?:\*\*)?\s*[:|-]\s*(?P<status>[A-Za-z][A-Za-z0-9 _/-]{1,60})\s*$",
        r"(?im)^\s*\|\s*status\s*\|\s*(?P<status>[^|]{2,60})\|",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            status = " ".join(match.group("status").strip().strip("*`").split())[:80]
            if status:
                return status, _line_number(text, match.start())
    return "", 0


def _architecture_decision_detail(text: str, title_line: int, status_line: int) -> str:
    skip_until = max(int(title_line or 0), int(status_line or 0))
    lines = text.splitlines()
    paragraphs: List[str] = []
    current: List[str] = []
    for line_number, raw_line in enumerate(lines, start=1):
        if line_number <= skip_until:
            continue
        stripped = raw_line.strip()
        if not stripped:
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        if stripped.startswith(("#", "|", "---", "+++", "```", "- Status", "* Status")):
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        if re.match(r"(?i)^(date|authors?|deciders?|status|state)\s*[:|-]", stripped):
            continue
        current.append(re.sub(r"\s+", " ", stripped))
        if len(" ".join(current)) >= 220:
            break
    if current:
        paragraphs.append(" ".join(current))
    if not paragraphs:
        return ""
    detail = re.sub(r"`([^`]+)`", r"\1", paragraphs[0])
    detail = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", detail)
    return " ".join(detail.split())[:240]


def _architecture_decision_source(category: str) -> str:
    return {
        "adr": "adr-doc",
        "rfc": "rfc-doc",
        "design doc": "design-doc",
        "decision log": "decision-doc",
    }.get(str(category or ""), "architecture-doc")


def _extract_schema_facts(files: List[Dict[str, Any]], source_dir: Path) -> List[Dict[str, Any]]:
    """Extract durable data/schema facts from common schema and ORM files."""
    if not source_dir.exists():
        return []

    facts: List[Dict[str, Any]] = []
    seen = set()
    for file in files:
        relative_path = file["path"]
        pure = PurePosixPath(relative_path)
        suffix = pure.suffix.lower()
        name = pure.name.lower()
        if suffix not in {
            ".sql",
            ".py",
            ".prisma",
            ".php",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".rb",
            ".rake",
            ".ex",
            ".exs",
            ".java",
            ".kt",
            ".kts",
            ".cs",
        } and name != "schema.prisma":
            continue

        source_path = source_dir / Path(*pure.parts)
        if not source_path.exists():
            continue
        try:
            if source_path.stat().st_size > MAX_SCHEMA_SOURCE_FILE_BYTES:
                continue
            text = source_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        if suffix == ".sql":
            _extend_schema_facts(facts, seen, _extract_sql_schema_facts(relative_path, text))
        elif suffix == ".prisma" or name == "schema.prisma":
            _extend_schema_facts(facts, seen, _extract_prisma_schema_facts(relative_path, text))
        elif suffix == ".py":
            _extend_schema_facts(facts, seen, _extract_python_schema_facts(relative_path, text))
        elif suffix == ".php":
            _extend_schema_facts(facts, seen, _extract_laravel_migration_schema_facts(relative_path, text))
        elif suffix in {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}:
            _extend_schema_facts(facts, seen, _extract_javascript_schema_facts(relative_path, text))
        elif suffix in {".rb", ".rake"}:
            _extend_schema_facts(facts, seen, _extract_ruby_schema_facts(relative_path, text))
        elif suffix in {".ex", ".exs"}:
            _extend_schema_facts(facts, seen, _extract_elixir_schema_facts(relative_path, text))
        elif suffix in {".java", ".kt", ".kts"}:
            _extend_schema_facts(facts, seen, _extract_jvm_schema_facts(relative_path, text))
        elif suffix == ".cs":
            _extend_schema_facts(facts, seen, _extract_csharp_schema_facts(relative_path, text))

        if len(facts) >= MAX_SCHEMA_FACTS:
            break

    return sorted(
        facts,
        key=lambda item: (
            {"table": 0, "model": 1, "view": 2, "relationship": 3, "field": 4}.get(item.get("schema_type"), 9),
            item.get("source_path") or "",
            item.get("line") or 0,
            item.get("name") or "",
        ),
    )[:MAX_SCHEMA_FACTS]


def _extend_schema_facts(facts: List[Dict[str, Any]], seen: set, candidates: List[Dict[str, Any]]) -> None:
    for item in candidates:
        key = (
            item.get("schema_type"),
            item.get("name"),
            item.get("source_path"),
            item.get("line"),
        )
        if key in seen:
            continue
        seen.add(key)
        facts.append(item)


def _schema_fact(
    schema_type: str,
    name: str,
    detail: str,
    source_path: str,
    line: int,
    **metadata: Any,
) -> Dict[str, Any]:
    return {
        "schema_type": schema_type,
        "name": name,
        "detail": detail,
        "source_path": source_path,
        "line": line,
        **metadata,
    }


def _extract_migration_facts(files: List[Dict[str, Any]], source_dir: Path) -> List[Dict[str, Any]]:
    """Extract durable migration operations from common migration formats."""
    if not source_dir.exists():
        return []

    facts: List[Dict[str, Any]] = []
    seen = set()
    for file in files:
        relative_path = file["path"]
        pure = PurePosixPath(relative_path)
        suffix = pure.suffix.lower()
        if suffix not in {".sql", ".py", ".php", ".rb", ".rake", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".cs"}:
            continue
        if not _looks_like_migration_path(pure):
            continue

        source_path = source_dir / Path(*pure.parts)
        if not source_path.exists():
            continue
        try:
            if source_path.stat().st_size > MAX_MIGRATION_SOURCE_FILE_BYTES:
                continue
            text = source_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        framework = _migration_framework_from_path(pure)
        candidates: List[Dict[str, Any]] = []
        if suffix == ".sql":
            candidates.extend(_extract_sql_migration_facts(relative_path, text, framework=framework))
        elif suffix == ".py":
            candidates.extend(_extract_python_migration_facts(relative_path, text, framework=framework))
            candidates.extend(_extract_sql_migration_facts(relative_path, text, framework=framework))
        elif suffix == ".php":
            candidates.extend(_extract_laravel_migration_facts(relative_path, text, framework=framework))
            candidates.extend(_extract_sql_migration_facts(relative_path, text, framework=framework))
        elif suffix in {".rb", ".rake"}:
            candidates.extend(_extract_rails_migration_facts(relative_path, text, framework=framework))
            candidates.extend(_extract_sql_migration_facts(relative_path, text, framework=framework))
        elif suffix in {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}:
            candidates.extend(_extract_javascript_migration_facts(relative_path, text, framework=framework))
            candidates.extend(_extract_sql_migration_facts(relative_path, text, framework=framework))
        elif suffix == ".cs":
            candidates.extend(_extract_csharp_migration_facts(relative_path, text, framework=framework))
            candidates.extend(_extract_sql_migration_facts(relative_path, text, framework=framework))

        _extend_migration_facts(facts, seen, candidates)
        if len(facts) >= MAX_MIGRATION_FACTS:
            break

    return sorted(
        facts,
        key=lambda item: (
            item.get("source_path") or "",
            item.get("line") or 0,
            item.get("action") or "",
            item.get("table") or "",
            item.get("field") or "",
        ),
    )[:MAX_MIGRATION_FACTS]


def _looks_like_migration_path(path: PurePosixPath) -> bool:
    normalized = path.as_posix().lower()
    return (
        normalized == "migration.sql"
        or normalized.startswith("migrations/")
        or normalized.startswith("db/migrate/")
        or normalized.startswith("database/migrations/")
        or normalized.startswith("prisma/migrations/")
        or normalized.startswith("alembic/versions/")
        or "/migrations/" in normalized
        or "/migrate/" in normalized
        or "/alembic/versions/" in normalized
    )


def _migration_framework_from_path(path: PurePosixPath) -> str:
    normalized = path.as_posix().lower()
    if "prisma/migrations" in normalized:
        return "prisma"
    if "alembic/versions" in normalized:
        return "alembic"
    if normalized.startswith("db/migrate/") or "/db/migrate/" in normalized:
        return "rails"
    if "database/migrations" in normalized:
        return "laravel"
    if normalized.endswith(".cs"):
        return "entity_framework"
    return "migration"


def _extend_migration_facts(facts: List[Dict[str, Any]], seen: set, candidates: List[Dict[str, Any]]) -> None:
    for item in candidates:
        if not item.get("action") or not item.get("table"):
            continue
        key = (
            item.get("action"),
            item.get("table"),
            item.get("field"),
            item.get("source_path"),
            item.get("line"),
            item.get("operation"),
            item.get("name"),
        )
        if key in seen:
            continue
        seen.add(key)
        facts.append(item)


def _migration_fact(
    action: str,
    table: str,
    detail: str,
    source_path: str,
    line: int,
    *,
    field: str = "",
    source: str = "",
    framework: str = "",
    operation: str = "",
    name: str = "",
) -> Dict[str, Any]:
    return {
        "action": action,
        "table": table,
        "field": field,
        "detail": detail,
        "source_path": source_path,
        "line": line,
        "source": source or framework or "migration",
        "framework": framework or source or "migration",
        "operation": operation or action,
        "name": name,
    }


def _migration_fact_key(item: Dict[str, Any]) -> str:
    action = str(item.get("action") or "").strip()
    table = str(item.get("table") or "").strip()
    field = str(item.get("field") or "").strip()
    if field:
        return f"{action}:{table}.{field}"
    return f"{action}:{table}".strip(":")


def _extract_sql_migration_facts(source_path: str, text: str, framework: str = "sql") -> List[Dict[str, Any]]:
    facts: List[Dict[str, Any]] = []
    table_ident = r"[`\"\[]?([A-Za-z_][\w.]*)[`\"\]]?"
    column_ident = r"[`\"\[]?([A-Za-z_][\w]*)[`\"\]]?"

    for match in re.finditer(
        rf"(?im)\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{table_ident}",
        text,
    ):
        table = match.group(1)
        facts.append(_migration_fact(
            "create_table",
            table,
            f"SQL migration creates table {table}",
            source_path,
            _line_number(text, match.start()),
            source="sql",
            framework=framework,
            operation="CREATE TABLE",
        ))

    for match in re.finditer(
        rf"(?im)\bALTER\s+TABLE\s+{table_ident}\s+ADD\s+(?:COLUMN\s+)?{column_ident}",
        text,
    ):
        table = match.group(1)
        field = match.group(2)
        facts.append(_migration_fact(
            "add_column",
            table,
            f"SQL migration adds column {field} to {table}",
            source_path,
            _line_number(text, match.start()),
            field=field,
            source="sql",
            framework=framework,
            operation="ALTER TABLE ADD COLUMN",
        ))

    for match in re.finditer(
        rf"(?im)\bALTER\s+TABLE\s+{table_ident}\s+DROP\s+(?:COLUMN\s+)?{column_ident}",
        text,
    ):
        table = match.group(1)
        field = match.group(2)
        facts.append(_migration_fact(
            "drop_column",
            table,
            f"SQL migration drops column {field} from {table}",
            source_path,
            _line_number(text, match.start()),
            field=field,
            source="sql",
            framework=framework,
            operation="ALTER TABLE DROP COLUMN",
        ))

    for match in re.finditer(
        rf"(?im)\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?{table_ident}",
        text,
    ):
        table = match.group(1)
        facts.append(_migration_fact(
            "drop_table",
            table,
            f"SQL migration drops table {table}",
            source_path,
            _line_number(text, match.start()),
            source="sql",
            framework=framework,
            operation="DROP TABLE",
        ))

    for match in re.finditer(
        rf"(?im)\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`\"\[]?([A-Za-z_][\w.]*)[`\"\]]?\s+ON\s+{table_ident}",
        text,
    ):
        index_name = match.group(1)
        table = match.group(2)
        facts.append(_migration_fact(
            "add_index",
            table,
            f"SQL migration adds index {index_name} on {table}",
            source_path,
            _line_number(text, match.start()),
            source="sql",
            framework=framework,
            operation="CREATE INDEX",
            name=index_name,
        ))
    return facts


def _extract_python_migration_facts(source_path: str, text: str, framework: str = "python") -> List[Dict[str, Any]]:
    facts: List[Dict[str, Any]] = []
    if "op." in text:
        facts.extend(_extract_alembic_migration_facts(source_path, text, framework=framework))
    if "migrations." in text:
        facts.extend(_extract_django_migration_facts(source_path, text, framework=framework))
    return facts


def _extract_alembic_migration_facts(source_path: str, text: str, framework: str = "alembic") -> List[Dict[str, Any]]:
    framework = "alembic" if framework == "migration" else framework
    facts: List[Dict[str, Any]] = []
    for action, operation in (("create_table", "create_table"), ("drop_table", "drop_table")):
        pattern = re.compile(rf"\bop\.{operation}\s*\(\s*['\"]([^'\"]+)['\"]", re.DOTALL)
        for match in pattern.finditer(text):
            table = match.group(1)
            facts.append(_migration_fact(
                action,
                table,
                f"Alembic migration {operation.replace('_', ' ')} {table}",
                source_path,
                _line_number(text, match.start()),
                source="alembic",
                framework=framework,
                operation=operation,
            ))

    add_column_pattern = re.compile(
        r"\bop\.add_column\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*(?:sa\.)?Column\s*\(\s*['\"]([^'\"]+)['\"]",
        re.DOTALL,
    )
    for match in add_column_pattern.finditer(text):
        table = match.group(1)
        field = match.group(2)
        facts.append(_migration_fact(
            "add_column",
            table,
            f"Alembic migration adds column {field} to {table}",
            source_path,
            _line_number(text, match.start()),
            field=field,
            source="alembic",
            framework=framework,
            operation="add_column",
        ))

    create_index_pattern = re.compile(
        r"\bop\.create_index\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]+)['\"]",
        re.DOTALL,
    )
    for match in create_index_pattern.finditer(text):
        index_name = match.group(1)
        table = match.group(2)
        facts.append(_migration_fact(
            "add_index",
            table,
            f"Alembic migration adds index {index_name} on {table}",
            source_path,
            _line_number(text, match.start()),
            source="alembic",
            framework=framework,
            operation="create_index",
            name=index_name,
        ))
    return facts


def _extract_django_migration_facts(source_path: str, text: str, framework: str = "django") -> List[Dict[str, Any]]:
    framework = "django" if framework == "migration" else framework
    facts: List[Dict[str, Any]] = []
    operation_pattern = re.compile(
        r"migrations\.(CreateModel|DeleteModel|AddField|AlterField|RemoveField)\s*\((?P<args>.*?)\)\s*,?",
        re.DOTALL,
    )
    action_map = {
        "CreateModel": "create_model",
        "DeleteModel": "delete_model",
        "AddField": "add_field",
        "AlterField": "alter_field",
        "RemoveField": "remove_field",
    }
    for match in operation_pattern.finditer(text):
        operation = match.group(1)
        args = match.group("args") or ""
        model = _python_named_call_arg(args, "model_name") or _python_named_call_arg(args, "name")
        field = ""
        if operation in {"AddField", "AlterField", "RemoveField"}:
            field = _python_named_call_arg(args, "name")
        if not model:
            continue
        action = action_map.get(operation, operation.lower())
        detail_subject = f"{model}.{field}" if field else model
        facts.append(_migration_fact(
            action,
            model,
            f"Django migration {operation} {detail_subject}",
            source_path,
            _line_number(text, match.start()),
            field=field,
            source="django",
            framework=framework,
            operation=operation,
        ))
    return facts


def _extract_laravel_migration_facts(source_path: str, text: str, framework: str = "laravel") -> List[Dict[str, Any]]:
    if "Schema::" not in text:
        return []

    framework = "laravel" if framework == "migration" else framework
    facts: List[Dict[str, Any]] = []
    table_pattern = re.compile(
        r"Schema::(?P<method>create|table)\s*\(\s*['\"](?P<table>[^'\"]+)['\"].*?function\s*\([^)]*\)\s*\{(?P<body>.*?)\n\s*\}\s*\)",
        re.IGNORECASE | re.DOTALL,
    )
    for match in table_pattern.finditer(text):
        method = match.group("method")
        table = match.group("table")
        action = "create_table" if method.lower() == "create" else "change_table"
        facts.append(_migration_fact(
            action,
            table,
            f"Laravel migration {method}s table {table}",
            source_path,
            _line_number(text, match.start()),
            source="laravel",
            framework=framework,
            operation=f"Schema::{method}",
        ))
        body = match.group("body")
        body_offset = match.start("body")
        for field_match in re.finditer(r"\$table->([A-Za-z_][\w]*)\s*\(\s*(?:['\"]([^'\"]+)['\"])?", body):
            column_type = field_match.group(1)
            field = field_match.group(2)
            if not field or column_type in {"timestamps", "softDeletes", "rememberToken"}:
                continue
            facts.append(_migration_fact(
                "add_column",
                table,
                f"Laravel migration adds {column_type} column {field} to {table}",
                source_path,
                _line_number(text, body_offset + field_match.start()),
                field=field,
                source="laravel",
                framework=framework,
                operation=column_type,
            ))

    for match in re.finditer(r"Schema::drop(?:IfExists)?\s*\(\s*['\"]([^'\"]+)['\"]", text):
        table = match.group(1)
        facts.append(_migration_fact(
            "drop_table",
            table,
            f"Laravel migration drops table {table}",
            source_path,
            _line_number(text, match.start()),
            source="laravel",
            framework=framework,
            operation="Schema::drop",
        ))
    return facts


def _extract_rails_migration_facts(source_path: str, text: str, framework: str = "rails") -> List[Dict[str, Any]]:
    framework = "rails" if framework == "migration" else framework
    if not any(marker in text for marker in ("create_table", "change_table", "add_column", "remove_column", "add_index", "drop_table")):
        return []

    facts: List[Dict[str, Any]] = []
    table_pattern = re.compile(
        r"(?ms)\b(?P<verb>create_table|change_table)\s+(?::|['\"])(?P<table>[A-Za-z_][\w]*)['\"]?\s+do\s+\|(?P<var>[A-Za-z_][\w]*)\|(?P<body>.*?)(?=^\s*end\b)",
        re.MULTILINE,
    )
    for match in table_pattern.finditer(text):
        table = match.group("table")
        verb = match.group("verb")
        action = "create_table" if verb == "create_table" else "change_table"
        facts.append(_migration_fact(
            action,
            table,
            f"Rails migration {verb} {table}",
            source_path,
            _line_number(text, match.start()),
            source="rails",
            framework=framework,
            operation=verb,
        ))
        body = match.group("body")
        body_offset = match.start("body")
        var_name = re.escape(match.group("var"))
        field_pattern = re.compile(rf"(?m)^\s*{var_name}\.([A-Za-z_][\w]*)\s+(?::|['\"])([A-Za-z_][\w]*)")
        for field_match in field_pattern.finditer(body):
            column_type = field_match.group(1)
            field = field_match.group(2)
            facts.append(_migration_fact(
                "add_column",
                table,
                f"Rails migration adds {column_type} column {field} to {table}",
                source_path,
                _line_number(text, body_offset + field_match.start()),
                field=field,
                source="rails",
                framework=framework,
                operation=column_type,
            ))

    column_pattern = re.compile(
        r"\b(?P<verb>add_column|remove_column)\s+(?::|['\"])(?P<table>[A-Za-z_][\w]*)['\"]?\s*,\s+(?::|['\"])(?P<field>[A-Za-z_][\w]*)['\"]?(?:\s*,\s+(?::|['\"])(?P<type>[A-Za-z_][\w]*)['\"]?)?"
    )
    for match in column_pattern.finditer(text):
        verb = match.group("verb")
        table = match.group("table")
        field = match.group("field")
        action = "add_column" if verb == "add_column" else "drop_column"
        detail = f"Rails migration {verb} {table}.{field}"
        if match.group("type"):
            detail = f"{detail} as {match.group('type')}"
        facts.append(_migration_fact(
            action,
            table,
            detail,
            source_path,
            _line_number(text, match.start()),
            field=field,
            source="rails",
            framework=framework,
            operation=verb,
        ))

    index_pattern = re.compile(
        r"\badd_index\s+(?::|['\"])(?P<table>[A-Za-z_][\w]*)['\"]?\s*,\s+(?::|['\"])(?P<field>[A-Za-z_][\w]*)['\"]?"
    )
    for match in index_pattern.finditer(text):
        table = match.group("table")
        field = match.group("field")
        facts.append(_migration_fact(
            "add_index",
            table,
            f"Rails migration adds index on {table}.{field}",
            source_path,
            _line_number(text, match.start()),
            field=field,
            source="rails",
            framework=framework,
            operation="add_index",
        ))
    return facts


def _extract_javascript_migration_facts(source_path: str, text: str, framework: str = "javascript") -> List[Dict[str, Any]]:
    facts: List[Dict[str, Any]] = []
    if "schema." in text or "knex.schema" in text:
        facts.extend(_extract_knex_migration_facts(source_path, text, framework=framework))
    return facts


def _extract_knex_migration_facts(source_path: str, text: str, framework: str = "knex") -> List[Dict[str, Any]]:
    framework = "knex" if framework in {"migration", "javascript"} else framework
    facts: List[Dict[str, Any]] = []
    table_pattern = re.compile(
        r"\bschema\.(?P<method>createTable|table)\s*\(\s*['\"](?P<table>[^'\"]+)['\"]\s*,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{(?P<body>.*?)\n\s*\}\s*\)",
        re.DOTALL,
    )
    for match in table_pattern.finditer(text):
        method = match.group("method")
        table = match.group("table")
        action = "create_table" if method == "createTable" else "change_table"
        facts.append(_migration_fact(
            action,
            table,
            f"Knex migration {method} {table}",
            source_path,
            _line_number(text, match.start()),
            source="knex",
            framework=framework,
            operation=method,
        ))
        body = match.group("body")
        body_offset = match.start("body")
        for field_match in re.finditer(r"\btable\.([A-Za-z_][\w]*)\s*\(\s*['\"]([^'\"]+)['\"]", body):
            column_type = field_match.group(1)
            field = field_match.group(2)
            facts.append(_migration_fact(
                "add_column",
                table,
                f"Knex migration adds {column_type} column {field} to {table}",
                source_path,
                _line_number(text, body_offset + field_match.start()),
                field=field,
                source="knex",
                framework=framework,
                operation=column_type,
            ))

    drop_pattern = re.compile(r"\bschema\.dropTable(?:IfExists)?\s*\(\s*['\"]([^'\"]+)['\"]", re.DOTALL)
    for match in drop_pattern.finditer(text):
        table = match.group(1)
        facts.append(_migration_fact(
            "drop_table",
            table,
            f"Knex migration drops table {table}",
            source_path,
            _line_number(text, match.start()),
            source="knex",
            framework=framework,
            operation="dropTable",
        ))
    return facts


def _extract_csharp_migration_facts(source_path: str, text: str, framework: str = "entity_framework") -> List[Dict[str, Any]]:
    if "migrationBuilder." not in text:
        return []

    framework = "entity_framework" if framework == "migration" else framework
    facts: List[Dict[str, Any]] = []
    for operation, action in (("CreateTable", "create_table"), ("DropTable", "drop_table")):
        pattern = re.compile(rf"\bmigrationBuilder\.{operation}\s*\(\s*name:\s*\"([^\"]+)\"", re.DOTALL)
        for match in pattern.finditer(text):
            table = match.group(1)
            facts.append(_migration_fact(
                action,
                table,
                f"Entity Framework migration {operation} {table}",
                source_path,
                _line_number(text, match.start()),
                source="entity_framework",
                framework=framework,
                operation=operation,
            ))

    column_pattern = re.compile(
        r"\bmigrationBuilder\.(?P<operation>AddColumn|DropColumn)(?:<[^>]+>)?\s*\(\s*name:\s*\"(?P<field>[^\"]+)\"\s*,\s*table:\s*\"(?P<table>[^\"]+)\"",
        re.DOTALL,
    )
    for match in column_pattern.finditer(text):
        operation = match.group("operation")
        table = match.group("table")
        field = match.group("field")
        action = "add_column" if operation == "AddColumn" else "drop_column"
        facts.append(_migration_fact(
            action,
            table,
            f"Entity Framework migration {operation} {table}.{field}",
            source_path,
            _line_number(text, match.start()),
            field=field,
            source="entity_framework",
            framework=framework,
            operation=operation,
        ))

    index_pattern = re.compile(
        r"\bmigrationBuilder\.CreateIndex\s*\(\s*name:\s*\"(?P<name>[^\"]+)\"\s*,\s*table:\s*\"(?P<table>[^\"]+)\"",
        re.DOTALL,
    )
    for match in index_pattern.finditer(text):
        table = match.group("table")
        index_name = match.group("name")
        facts.append(_migration_fact(
            "add_index",
            table,
            f"Entity Framework migration adds index {index_name} on {table}",
            source_path,
            _line_number(text, match.start()),
            source="entity_framework",
            framework=framework,
            operation="CreateIndex",
            name=index_name,
        ))
    return facts


def _extract_sql_schema_facts(source_path: str, text: str) -> List[Dict[str, Any]]:
    facts: List[Dict[str, Any]] = []
    table_pattern = re.compile(
        r"(?im)^\s*CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`\"\[]?([A-Za-z_][\w.]*)[`\"\]]?",
    )
    view_pattern = re.compile(
        r"(?im)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+[`\"\[]?([A-Za-z_][\w.]*)[`\"\]]?",
    )
    for match in table_pattern.finditer(text):
        facts.append(_schema_fact(
            "table",
            match.group(1),
            "SQL table",
            source_path,
            _line_number(text, match.start()),
            source="sql",
        ))
    for match in view_pattern.finditer(text):
        facts.append(_schema_fact(
            "view",
            match.group(1),
            "SQL view",
            source_path,
            _line_number(text, match.start()),
            source="sql",
        ))
    return facts


def _extract_prisma_schema_facts(source_path: str, text: str) -> List[Dict[str, Any]]:
    facts: List[Dict[str, Any]] = []
    model_pattern = re.compile(r"(?ms)^\s*model\s+([A-Za-z_][\w]*)\s*\{(?P<body>.*?)^\s*\}")
    model_matches = list(model_pattern.finditer(text))
    model_names = {match.group(1) for match in model_matches}
    for match in model_matches:
        model_name = match.group(1)
        body = match.group("body")
        table_name = _prisma_model_table_name(body)
        facts.append(_schema_fact(
            "model",
            model_name,
            "Prisma model",
            source_path,
            _line_number(text, match.start()),
            source="prisma",
            table=table_name,
        ))
        if table_name:
            facts.append(_schema_fact(
                "table",
                table_name,
                f"Prisma mapped table for {model_name}",
                source_path,
                _line_number(text, match.start()),
                source="prisma",
                model=model_name,
            ))
        body_offset = match.start("body")
        for line_offset, raw_line in enumerate(body.splitlines(), 0):
            stripped = raw_line.strip()
            field_match = re.match(r"^([A-Za-z_][\w]*)\s+([A-Za-z_][\w\[\]?]*)\b", stripped)
            if not field_match or field_match.group(1).startswith("@"):
                continue
            field_name = field_match.group(1)
            field_type = field_match.group(2)
            field_line = _line_number(text, body_offset) + line_offset
            column_name = _prisma_field_map(stripped)
            facts.append(_schema_fact(
                "field",
                f"{model_name}.{field_name}",
                field_type,
                source_path,
                field_line,
                source="prisma",
                model=model_name,
                table=table_name,
                column=column_name,
            ))
            target_model = _prisma_base_type(field_type)
            if target_model in model_names or "@relation" in stripped:
                relation_fields = _prisma_relation_array_option(stripped, "fields")
                relation_refs = _prisma_relation_array_option(stripped, "references")
                facts.append(_schema_fact(
                    "relationship",
                    f"{model_name}.{field_name}",
                    f"Prisma relation to {target_model or field_type}",
                    source_path,
                    field_line,
                    source="prisma",
                    model=model_name,
                    table=table_name,
                    field=field_name,
                    target_model=target_model,
                    relation_type=_prisma_relation_type(field_type),
                    foreign_key=", ".join(relation_fields),
                    references=", ".join(relation_refs),
                ))
    return facts


def _extract_python_schema_facts(source_path: str, text: str) -> List[Dict[str, Any]]:
    if "models.Model" not in text and "Column(" not in text and "mapped_column(" not in text and "relationship(" not in text:
        return []

    facts: List[Dict[str, Any]] = []
    class_pattern = re.compile(
        r"(?ms)^class\s+([A-Za-z_][\w]*)\((?P<bases>[^)]*)\):(?P<body>.*?)(?=^class\s+[A-Za-z_][\w]*\(|\Z)"
    )
    for match in class_pattern.finditer(text):
        class_name = match.group(1)
        bases = match.group("bases")
        body = match.group("body")
        source = ""
        table_name = ""
        if "models.Model" in bases or re.search(r"\bModel\b", bases):
            source = "django"
            table_name = _django_meta_table_name(body)
        elif "Base" in bases or "__tablename__" in body or "Column(" in body or "mapped_column(" in body:
            source = "sqlalchemy"
            table_match = re.search(r"__tablename__\s*=\s*['\"]([^'\"]+)['\"]", body)
            table_name = table_match.group(1) if table_match else ""
        if not source:
            continue

        line = _line_number(text, match.start())
        facts.append(_schema_fact(
            "model",
            class_name,
            "Django model" if source == "django" else (f"SQLAlchemy model for {table_name}" if table_name else "SQLAlchemy model"),
            source_path,
            line,
            source=source,
            table=table_name,
        ))
        if table_name:
            facts.append(_schema_fact(
                "table",
                table_name,
                f"{'Django' if source == 'django' else 'SQLAlchemy'} table for {class_name}",
                source_path,
                line,
                source=source,
                model=class_name,
            ))

        body_offset = match.start("body")
        if source == "django":
            django_field_pattern = re.compile(
                r"(?m)^\s{4,}([A-Za-z_][\w]*)\s*=\s*models\.([A-Za-z_][\w]*)\s*\(([^)\n]*)"
            )
            for field_match in django_field_pattern.finditer(body):
                field_name = field_match.group(1)
                field_type = field_match.group(2)
                args = field_match.group(3) or ""
                field_line = _line_number(text, body_offset + field_match.start())
                facts.append(_schema_fact(
                    "field",
                    f"{class_name}.{field_name}",
                    field_type or "field",
                    source_path,
                    field_line,
                    source=source,
                    model=class_name,
                    table=table_name,
                ))
                if field_type in {"ForeignKey", "OneToOneField", "ManyToManyField"}:
                    target_model = _python_first_call_arg(args)
                    facts.append(_schema_fact(
                        "relationship",
                        f"{class_name}.{field_name}",
                        f"Django {field_type} to {target_model or 'model'}",
                        source_path,
                        field_line,
                        source=source,
                        model=class_name,
                        table=table_name,
                        field=field_name,
                        target_model=target_model,
                        relation_type=field_type,
                    ))
        else:
            column_pattern = re.compile(
                r"(?m)^\s{4,}([A-Za-z_][\w]*)\s*=\s*(?:mapped_column|Column)\s*\(([^)\n]*)"
            )
            for field_match in column_pattern.finditer(body):
                field_name = field_match.group(1)
                args = field_match.group(2) or ""
                field_line = _line_number(text, body_offset + field_match.start())
                field_type = _sqlalchemy_column_type(args)
                facts.append(_schema_fact(
                    "field",
                    f"{class_name}.{field_name}",
                    field_type or "field",
                    source_path,
                    field_line,
                    source=source,
                    model=class_name,
                    table=table_name,
                ))
                foreign_key = _sqlalchemy_foreign_key(args)
                if foreign_key:
                    facts.append(_schema_fact(
                        "relationship",
                        f"{class_name}.{field_name}",
                        f"SQLAlchemy foreign key to {foreign_key}",
                        source_path,
                        field_line,
                        source=source,
                        model=class_name,
                        table=table_name,
                        field=field_name,
                        target_table=foreign_key.split(".", 1)[0],
                        relation_type="foreign_key",
                        references=foreign_key,
                    ))
            relationship_pattern = re.compile(
                r"(?m)^\s{4,}([A-Za-z_][\w]*)\s*=\s*relationship\s*\(([^)\n]*)"
            )
            for relation_match in relationship_pattern.finditer(body):
                field_name = relation_match.group(1)
                args = relation_match.group(2) or ""
                target_model = _python_first_call_arg(args)
                facts.append(_schema_fact(
                    "relationship",
                    f"{class_name}.{field_name}",
                    f"SQLAlchemy relationship to {target_model or 'model'}",
                    source_path,
                    _line_number(text, body_offset + relation_match.start()),
                    source=source,
                    model=class_name,
                    table=table_name,
                    field=field_name,
                    target_model=target_model,
                    relation_type="relationship",
                    inverse=_python_named_call_arg(args, "back_populates"),
                ))
    return facts


def _sqlalchemy_column_type(args: str) -> str:
    match = re.search(r"\b([A-Za-z_][\w]*)\b", args)
    return match.group(1) if match else "column"


def _sqlalchemy_foreign_key(args: str) -> str:
    match = re.search(r"\bForeignKey\s*\(\s*['\"]([^'\"]+)['\"]", args)
    return match.group(1) if match else ""


def _django_meta_table_name(body: str) -> str:
    meta_match = re.search(r"(?m)^(?P<indent>\s*)class\s+Meta\s*:\s*$", body)
    if not meta_match:
        return ""
    base_indent = len(meta_match.group("indent"))
    for line in body[meta_match.end():].splitlines():
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent <= base_indent:
            break
        table_match = re.search(r"\bdb_table\s*=\s*['\"]([^'\"]+)['\"]", line)
        if table_match:
            return table_match.group(1)
    return ""


def _python_first_call_arg(args: str) -> str:
    match = re.match(r"\s*['\"]([^'\"]+)['\"]", args)
    if match:
        return match.group(1)
    match = re.match(r"\s*([A-Za-z_][\w.]*)(?:\s*,|\s*$)", args)
    return match.group(1) if match else ""


def _python_named_call_arg(args: str, name: str) -> str:
    match = re.search(rf"\b{re.escape(name)}\s*=\s*['\"]([^'\"]+)['\"]", args)
    return match.group(1) if match else ""


def _extract_laravel_migration_schema_facts(source_path: str, text: str) -> List[Dict[str, Any]]:
    if "Schema::" not in text:
        return []

    facts: List[Dict[str, Any]] = []
    table_pattern = re.compile(
        r"Schema::(?:create|table)\s*\(\s*['\"]([^'\"]+)['\"].*?function\s*\([^)]*\)\s*\{(?P<body>.*?)\n\s*\}\s*\)",
        re.IGNORECASE | re.DOTALL,
    )
    for match in table_pattern.finditer(text):
        table_name = match.group(1)
        facts.append(_schema_fact(
            "table",
            table_name,
            "Laravel migration table",
            source_path,
            _line_number(text, match.start()),
            source="laravel",
        ))
        body_offset = match.start("body")
        field_pattern = re.compile(r"\$table->([A-Za-z_][\w]*)\s*\(\s*(?:['\"]([^'\"]+)['\"])?")
        for field_match in field_pattern.finditer(match.group("body")):
            field_name = field_match.group(2) or field_match.group(1)
            facts.append(_schema_fact(
                "field",
                f"{table_name}.{field_name}",
                field_match.group(1),
                source_path,
                _line_number(text, body_offset + field_match.start()),
                source="laravel",
                table=table_name,
            ))
    return facts


def _extract_javascript_schema_facts(source_path: str, text: str) -> List[Dict[str, Any]]:
    if not any(marker in text for marker in (
        "@Entity",
        "sequelize.define",
        ".define(",
        ".init(",
        ".belongsTo(",
        ".hasOne(",
        ".hasMany(",
        ".belongsToMany(",
        "mongoose.model",
        "new Schema",
    )):
        return []

    facts: List[Dict[str, Any]] = []
    facts.extend(_extract_typeorm_schema_facts(source_path, text))
    facts.extend(_extract_sequelize_schema_facts(source_path, text))
    facts.extend(_extract_mongoose_schema_facts(source_path, text))
    return facts


def _extract_typeorm_schema_facts(source_path: str, text: str) -> List[Dict[str, Any]]:
    facts: List[Dict[str, Any]] = []
    entity_pattern = re.compile(
        r"(?ms)@Entity\s*(?:\((?P<args>.*?)\))?\s*(?:export\s+)?(?:default\s+)?class\s+(?P<class>[A-Za-z_$][\w$]*)[^{]*\{"
    )
    for match in entity_pattern.finditer(text):
        body_info = _extract_braced_body(text, match.end() - 1)
        if not body_info:
            continue
        body, body_offset, _ = body_info
        class_name = match.group("class")
        table_name = _first_quoted_value(match.group("args") or "")
        line = _line_number(text, match.start())
        facts.append(_schema_fact(
            "model",
            class_name,
            "TypeORM entity",
            source_path,
            line,
            source="typeorm",
            table=table_name,
        ))
        if table_name:
            facts.append(_schema_fact(
                "table",
                table_name,
                f"TypeORM table for {class_name}",
                source_path,
                line,
                source="typeorm",
                model=class_name,
            ))

        field_pattern = re.compile(
            r"(?ms)@(?P<decorator>PrimaryGeneratedColumn|PrimaryColumn|Column|CreateDateColumn|UpdateDateColumn|DeleteDateColumn)"
            r"\s*(?:\((?P<args>.*?)\))?\s*"
            r"(?:public\s+|private\s+|protected\s+|readonly\s+|declare\s+|override\s+|static\s+)*"
            r"(?P<name>[A-Za-z_$][\w$]*)[!?]?\s*(?::\s*(?P<type>[^=;\n]+))?"
        )
        for field_match in field_pattern.finditer(body):
            field_name = field_match.group("name")
            detail = _js_schema_field_type(field_match.group("args") or "") or (field_match.group("type") or "").strip() or field_match.group("decorator")
            facts.append(_schema_fact(
                "field",
                f"{class_name}.{field_name}",
                detail,
                source_path,
                _line_number(text, body_offset + field_match.start()),
                source="typeorm",
                model=class_name,
                table=table_name,
            ))
        relation_pattern = re.compile(
            r"(?ms)@(?P<decorator>ManyToOne|OneToMany|OneToOne|ManyToMany)\s*(?:\((?P<args>.*?)\))?\s*"
            r"(?:@\w+\s*(?:\((?P<join>.*?)\))?\s*)*"
            r"(?:public\s+|private\s+|protected\s+|readonly\s+|declare\s+|override\s+|static\s+)*"
            r"(?P<name>[A-Za-z_$][\w$]*)[!?]?\s*(?::\s*(?P<type>[^=;\n]+))?"
        )
        for relation_match in relation_pattern.finditer(body):
            field_name = relation_match.group("name")
            target_model = _typeorm_relation_target(
                relation_match.group("args") or "",
                relation_match.group("type") or "",
            )
            relation_type = relation_match.group("decorator")
            facts.append(_schema_fact(
                "relationship",
                f"{class_name}.{field_name}",
                f"TypeORM {relation_type} relation to {target_model or 'entity'}",
                source_path,
                _line_number(text, body_offset + relation_match.start()),
                source="typeorm",
                model=class_name,
                table=table_name,
                field=field_name,
                target_model=target_model,
                relation_type=relation_type,
                foreign_key=_js_named_option(relation_match.group("join") or "", "name"),
            ))
    return facts


def _extract_sequelize_schema_facts(source_path: str, text: str) -> List[Dict[str, Any]]:
    facts: List[Dict[str, Any]] = []
    define_pattern = re.compile(
        r"(?ms)(?:[A-Za-z_$][\w$]*\.)?define\s*\(\s*['\"](?P<model>[A-Za-z_$][\w$]*)['\"]\s*,\s*\{"
    )
    for match in define_pattern.finditer(text):
        body_info = _extract_braced_body(text, match.end() - 1)
        if not body_info:
            continue
        body, body_offset, _ = body_info
        model_name = match.group("model")
        line = _line_number(text, match.start())
        facts.append(_schema_fact(
            "model",
            model_name,
            "Sequelize model",
            source_path,
            line,
            source="sequelize",
        ))
        facts.extend(_javascript_object_schema_fields(
            source_path,
            text,
            body,
            body_offset,
            model_name,
            source="sequelize",
        ))

    init_pattern = re.compile(r"(?ms)(?P<model>[A-Za-z_$][\w$]*)\.init\s*\(\s*\{")
    for match in init_pattern.finditer(text):
        body_info = _extract_braced_body(text, match.end() - 1)
        if not body_info:
            continue
        body, body_offset, body_end = body_info
        model_name = match.group("model")
        options = text[body_end:min(len(text), body_end + 800)]
        table_name = _js_named_option(options, "tableName")
        line = _line_number(text, match.start())
        facts.append(_schema_fact(
            "model",
            model_name,
            "Sequelize model",
            source_path,
            line,
            source="sequelize",
            table=table_name,
        ))
        if table_name:
            facts.append(_schema_fact(
                "table",
                table_name,
                f"Sequelize table for {model_name}",
                source_path,
                line,
                source="sequelize",
                model=model_name,
            ))
        facts.extend(_javascript_object_schema_fields(
            source_path,
            text,
            body,
            body_offset,
            model_name,
            source="sequelize",
            table=table_name,
        ))

    association_pattern = re.compile(
        r"(?ms)\b(?P<model>[A-Za-z_$][\w$]*)\.(?P<method>belongsTo|hasOne|hasMany|belongsToMany)\s*"
        r"\(\s*(?P<target>[A-Za-z_$][\w$]*)(?P<args>.*?)\)\s*;"
    )
    for match in association_pattern.finditer(text):
        model_name = match.group("model")
        target_model = match.group("target")
        relation_type = match.group("method")
        facts.append(_schema_fact(
            "relationship",
            f"{model_name}.{target_model}",
            f"Sequelize {relation_type} association to {target_model}",
            source_path,
            _line_number(text, match.start()),
            source="sequelize",
            model=model_name,
            field=_js_named_option(match.group("args") or "", "as"),
            target_model=target_model,
            relation_type=relation_type,
            foreign_key=_js_named_option(match.group("args") or "", "foreignKey"),
            through=_js_named_option(match.group("args") or "", "through"),
        ))
    return facts


def _extract_mongoose_schema_facts(source_path: str, text: str) -> List[Dict[str, Any]]:
    if "Schema" not in text or "model" not in text:
        return []

    facts: List[Dict[str, Any]] = []
    schema_defs: Dict[str, Tuple[str, int, int]] = {}
    schema_pattern = re.compile(
        r"(?ms)(?:const|let|var)\s+(?P<name>[A-Za-z_$][\w$]*)\s*=\s*new\s+(?:mongoose\.)?Schema\s*\(\s*\{"
    )
    for match in schema_pattern.finditer(text):
        body_info = _extract_braced_body(text, match.end() - 1)
        if body_info:
            schema_defs[match.group("name")] = body_info

    model_pattern = re.compile(
        r"(?ms)(?:mongoose\.)?model\s*\(\s*['\"](?P<model>[A-Za-z_$][\w$]*)['\"]\s*,\s*(?P<schema>[A-Za-z_$][\w$]*)"
    )
    for match in model_pattern.finditer(text):
        schema_name = match.group("schema")
        if schema_name not in schema_defs:
            continue
        body, body_offset, _ = schema_defs[schema_name]
        model_name = match.group("model")
        facts.append(_schema_fact(
            "model",
            model_name,
            "Mongoose model",
            source_path,
            _line_number(text, match.start()),
            source="mongoose",
        ))
        facts.extend(_javascript_object_schema_fields(
            source_path,
            text,
            body,
            body_offset,
            model_name,
            source="mongoose",
        ))
        facts.extend(_javascript_object_schema_relationships(
            source_path,
            text,
            body,
            body_offset,
            model_name,
            source="mongoose",
        ))

    direct_pattern = re.compile(
        r"(?ms)(?:mongoose\.)?model\s*\(\s*['\"](?P<model>[A-Za-z_$][\w$]*)['\"]\s*,\s*new\s+(?:mongoose\.)?Schema\s*\(\s*\{"
    )
    for match in direct_pattern.finditer(text):
        body_info = _extract_braced_body(text, match.end() - 1)
        if not body_info:
            continue
        body, body_offset, _ = body_info
        model_name = match.group("model")
        facts.append(_schema_fact(
            "model",
            model_name,
            "Mongoose model",
            source_path,
            _line_number(text, match.start()),
            source="mongoose",
        ))
        facts.extend(_javascript_object_schema_fields(
            source_path,
            text,
            body,
            body_offset,
            model_name,
            source="mongoose",
        ))
        facts.extend(_javascript_object_schema_relationships(
            source_path,
            text,
            body,
            body_offset,
            model_name,
            source="mongoose",
        ))
    return facts


def _javascript_object_schema_fields(
    source_path: str,
    full_text: str,
    body: str,
    body_offset: int,
    model_name: str,
    source: str,
    table: str = "",
) -> List[Dict[str, Any]]:
    facts: List[Dict[str, Any]] = []
    for field_name, value, offset in _extract_js_object_entries(body):
        if field_name.startswith("_") and field_name != "_id":
            continue
        detail = _js_schema_field_type(value) or "field"
        facts.append(_schema_fact(
            "field",
            f"{model_name}.{field_name}",
            detail,
            source_path,
            _line_number(full_text, body_offset + offset),
            source=source,
            model=model_name,
            table=table,
        ))
    return facts


def _javascript_object_schema_relationships(
    source_path: str,
    full_text: str,
    body: str,
    body_offset: int,
    model_name: str,
    source: str,
) -> List[Dict[str, Any]]:
    facts: List[Dict[str, Any]] = []
    for field_name, value, offset in _extract_js_object_entries(body):
        target_model = _js_named_option(value, "ref")
        if not target_model:
            continue
        facts.append(_schema_fact(
            "relationship",
            f"{model_name}.{field_name}",
            f"Mongoose ref to {target_model}",
            source_path,
            _line_number(full_text, body_offset + offset),
            source=source,
            model=model_name,
            field=field_name,
            target_model=target_model,
            relation_type="ref_array" if value.strip().startswith("[") else "ref",
        ))
    return facts


def _extract_ruby_schema_facts(source_path: str, text: str) -> List[Dict[str, Any]]:
    if not any(marker in text for marker in ("create_table", "change_table", "add_column", "ApplicationRecord", "ActiveRecord::Base")):
        return []

    facts: List[Dict[str, Any]] = []
    class_pattern = re.compile(
        r"(?ms)^class\s+(?P<class>[A-Za-z_][\w:]*)\s*<\s*(?:ApplicationRecord|ActiveRecord::Base)(?P<body>.*?)(?=^class\s+|\Z)"
    )
    for match in class_pattern.finditer(text):
        class_name = match.group("class").split("::")[-1]
        body = match.group("body")
        table_name = ""
        table_match = re.search(r"self\.table_name\s*=\s*['\"]([^'\"]+)['\"]", body)
        if table_match:
            table_name = table_match.group(1)
        facts.append(_schema_fact(
            "model",
            class_name,
            "Rails model",
            source_path,
            _line_number(text, match.start()),
            source="rails",
            table=table_name,
        ))
        if table_name:
            facts.append(_schema_fact(
                "table",
                table_name,
                f"Rails table for {class_name}",
                source_path,
                _line_number(text, match.start("body") + table_match.start()),
                source="rails",
                model=class_name,
            ))
        association_pattern = re.compile(
            r"(?m)^\s*(belongs_to|has_one|has_many|has_and_belongs_to_many)\s+:([A-Za-z_][\w]*)"
        )
        for association_match in association_pattern.finditer(body):
            relation_type = association_match.group(1)
            association_name = association_match.group(2)
            facts.append(_schema_fact(
                "relationship",
                f"{class_name}.{association_name}",
                f"Rails {relation_type} association to {association_name}",
                source_path,
                _line_number(text, match.start("body") + association_match.start()),
                source="rails",
                model=class_name,
                table=table_name,
                field=association_name,
                target_model=_rails_association_target(association_name, relation_type),
                relation_type=relation_type,
            ))

    table_pattern = re.compile(
        r"(?ms)\b(?P<verb>create_table|change_table)\s+(?::|['\"])(?P<table>[A-Za-z_][\w]*)['\"]?\s+do\s+\|(?P<var>[A-Za-z_][\w]*)\|(?P<body>.*?)(?=^\s*end\b)",
        re.MULTILINE,
    )
    for match in table_pattern.finditer(text):
        table_name = match.group("table")
        facts.append(_schema_fact(
            "table",
            table_name,
            "Rails migration table",
            source_path,
            _line_number(text, match.start()),
            source="rails",
        ))
        body = match.group("body")
        body_offset = match.start("body")
        var_name = re.escape(match.group("var"))
        field_pattern = re.compile(rf"(?m)^\s*{var_name}\.([A-Za-z_][\w]*)\s+(?::|['\"])([A-Za-z_][\w]*)")
        for field_match in field_pattern.finditer(body):
            facts.append(_schema_fact(
                "field",
                f"{table_name}.{field_match.group(2)}",
                field_match.group(1),
                source_path,
                _line_number(text, body_offset + field_match.start()),
                source="rails",
                table=table_name,
            ))

    add_column_pattern = re.compile(
        r"\badd_column\s+(?::|['\"])(?P<table>[A-Za-z_][\w]*)['\"]?\s*,\s+(?::|['\"])(?P<field>[A-Za-z_][\w]*)['\"]?\s*,\s+(?::|['\"])(?P<type>[A-Za-z_][\w]*)['\"]?"
    )
    for match in add_column_pattern.finditer(text):
        table_name = match.group("table")
        facts.append(_schema_fact(
            "field",
            f"{table_name}.{match.group('field')}",
            match.group("type"),
            source_path,
            _line_number(text, match.start()),
            source="rails",
            table=table_name,
        ))
    return facts


def _extract_elixir_schema_facts(source_path: str, text: str) -> List[Dict[str, Any]]:
    if "Ecto.Schema" not in text and "schema " not in text:
        return []

    facts: List[Dict[str, Any]] = []
    schema_pattern = re.compile(r"(?ms)\bschema\s+['\"](?P<table>[^'\"]+)['\"]\s+do(?P<body>.*?)(?=^\s*end\b)")
    for match in schema_pattern.finditer(text):
        table_name = match.group("table")
        module_name = _nearest_elixir_module_name(text, match.start())
        line = _line_number(text, match.start())
        if module_name:
            facts.append(_schema_fact(
                "model",
                module_name,
                f"Ecto schema for {table_name}",
                source_path,
                line,
                source="ecto",
                table=table_name,
            ))
        facts.append(_schema_fact(
            "table",
            table_name,
            "Ecto schema table",
            source_path,
            line,
            source="ecto",
            model=module_name,
        ))
        body = match.group("body")
        body_offset = match.start("body")
        field_pattern = re.compile(r"\bfield\s+:([A-Za-z_][\w!?]*)\s*,\s+:?([A-Za-z_][\w]*)")
        for field_match in field_pattern.finditer(body):
            facts.append(_schema_fact(
                "field",
                f"{table_name}.{field_match.group(1)}",
                field_match.group(2),
                source_path,
                _line_number(text, body_offset + field_match.start()),
                source="ecto",
                model=module_name,
                table=table_name,
            ))
        relation_pattern = re.compile(
            r"\b(belongs_to|has_one|has_many|many_to_many)\s+:([A-Za-z_][\w!?]*)\s*,\s*([A-Za-z_][\w.]*|__MODULE__)"
        )
        for relation_match in relation_pattern.finditer(body):
            relation_type = relation_match.group(1)
            field_name = relation_match.group(2)
            target_model = relation_match.group(3)
            if target_model == "__MODULE__":
                target_model = module_name
            else:
                target_model = target_model.split(".")[-1]
            facts.append(_schema_fact(
                "relationship",
                f"{module_name or table_name}.{field_name}",
                f"Ecto {relation_type} association to {target_model or 'schema'}",
                source_path,
                _line_number(text, body_offset + relation_match.start()),
                source="ecto",
                model=module_name,
                table=table_name,
                field=field_name,
                target_model=target_model,
                relation_type=relation_type,
            ))
    return facts


def _extract_jvm_schema_facts(source_path: str, text: str) -> List[Dict[str, Any]]:
    if "@Entity" not in text:
        return []

    facts: List[Dict[str, Any]] = []
    class_pattern = re.compile(
        r"(?ms)(?P<prefix>(?:^\s*@[\w.]+(?:\([^)]*\))?\s*)*)^\s*(?:public\s+|open\s+|data\s+)*class\s+(?P<class>[A-Za-z_][\w]*)[^{]*\{",
        re.MULTILINE,
    )
    for match in class_pattern.finditer(text):
        prefix = match.group("prefix") or ""
        if "@Entity" not in prefix:
            continue
        body_info = _extract_braced_body(text, match.end() - 1)
        if not body_info:
            continue
        body, body_offset, _ = body_info
        class_name = match.group("class")
        table_name = _annotation_named_value(prefix, "Table", "name")
        line = _line_number(text, match.start())
        facts.append(_schema_fact(
            "model",
            class_name,
            "JPA entity",
            source_path,
            line,
            source="jpa",
            table=table_name,
        ))
        if table_name:
            facts.append(_schema_fact(
                "table",
                table_name,
                f"JPA table for {class_name}",
                source_path,
                line,
                source="jpa",
                model=class_name,
            ))

        field_pattern = re.compile(
            r"(?ms)(?P<annotations>(?:@\w+(?:\([^)]*\))?\s*)+)"
            r"(?:private\s+|protected\s+|public\s+|lateinit\s+|var\s+|val\s+)*"
            r"(?:(?P<java_type>[A-Za-z_][\w<>, ?]*)\s+(?P<java_name>[A-Za-z_][\w]*)|(?P<kt_name>[A-Za-z_][\w]*)\s*:\s*(?P<kt_type>[A-Za-z_][\w<>, ?]*))"
        )
        for field_match in field_pattern.finditer(body):
            annotations = field_match.group("annotations")
            if not any(token in annotations for token in ("@Id", "@Column", "@JoinColumn", "@ManyToOne", "@OneToOne", "@OneToMany", "@ManyToMany")):
                continue
            field_name = field_match.group("java_name") or field_match.group("kt_name")
            field_type = (field_match.group("java_type") or field_match.group("kt_type") or "field").strip()
            facts.append(_schema_fact(
                "field",
                f"{class_name}.{field_name}",
                field_type,
                source_path,
                _line_number(text, body_offset + field_match.start()),
                source="jpa",
                model=class_name,
                table=table_name,
            ))
            relation_type = _jpa_relation_annotation(annotations)
            if relation_type:
                facts.append(_schema_fact(
                    "relationship",
                    f"{class_name}.{field_name}",
                    f"JPA {relation_type} relation to {_clean_type_name(field_type) or 'entity'}",
                    source_path,
                    _line_number(text, body_offset + field_match.start()),
                    source="jpa",
                    model=class_name,
                    table=table_name,
                    field=field_name,
                    target_model=_clean_type_name(field_type),
                    relation_type=relation_type,
                    foreign_key=_annotation_named_value(annotations, "JoinColumn", "name"),
                ))
    return facts


def _extract_csharp_schema_facts(source_path: str, text: str) -> List[Dict[str, Any]]:
    if not any(marker in text for marker in ("[Table", "[Column", "[Key", "DbSet<")):
        return []

    facts: List[Dict[str, Any]] = []
    class_pattern = re.compile(
        r"(?ms)(?P<prefix>(?:^\s*\[[^\]]+\]\s*)*)^\s*public\s+(?:partial\s+)?class\s+(?P<class>[A-Za-z_][\w]*)[^{]*\{",
        re.MULTILINE,
    )
    for match in class_pattern.finditer(text):
        body_info = _extract_braced_body(text, match.end() - 1)
        if not body_info:
            continue
        body, body_offset, _ = body_info
        prefix = match.group("prefix") or ""
        class_name = match.group("class")
        table_name = _csharp_attribute_value(prefix, "Table")
        if not table_name and not any(marker in body for marker in ("[Column", "[Key")):
            continue
        line = _line_number(text, match.start())
        facts.append(_schema_fact(
            "model",
            class_name,
            "Entity Framework model",
            source_path,
            line,
            source="entity_framework",
            table=table_name,
        ))
        if table_name:
            facts.append(_schema_fact(
                "table",
                table_name,
                f"Entity Framework table for {class_name}",
                source_path,
                line,
                source="entity_framework",
                model=class_name,
            ))

        property_pattern = re.compile(
            r"(?ms)(?P<attrs>(?:\s*\[[^\]]+\]\s*)+)\s*public\s+(?P<type>[A-Za-z_][\w<>, ?]*)\s+(?P<name>[A-Za-z_][\w]*)\s*\{"
        )
        for prop_match in property_pattern.finditer(body):
            attrs = prop_match.group("attrs")
            if not any(marker in attrs for marker in ("[Column", "[Key", "[Required", "[ForeignKey")):
                continue
            field_name = prop_match.group("name")
            facts.append(_schema_fact(
                "field",
                f"{class_name}.{field_name}",
                prop_match.group("type").strip(),
                source_path,
                _line_number(text, body_offset + prop_match.start()),
                source="entity_framework",
                model=class_name,
                table=table_name,
            ))
            if "[ForeignKey" in attrs:
                field_type = prop_match.group("type").strip()
                facts.append(_schema_fact(
                    "relationship",
                    f"{class_name}.{field_name}",
                    f"Entity Framework foreign key relationship to {_clean_type_name(field_type) or field_type}",
                    source_path,
                    _line_number(text, body_offset + prop_match.start()),
                    source="entity_framework",
                    model=class_name,
                    table=table_name,
                    field=field_name,
                    target_model=_clean_type_name(field_type),
                    relation_type="ForeignKey",
                    foreign_key=_csharp_attribute_value(attrs, "ForeignKey"),
                ))
    return facts


def _extract_braced_body(text: str, open_brace_index: int) -> Optional[Tuple[str, int, int]]:
    if open_brace_index < 0 or open_brace_index >= len(text) or text[open_brace_index] != "{":
        return None

    depth = 0
    quote = ""
    escape = False
    body_start = open_brace_index + 1
    for index in range(open_brace_index, len(text)):
        char = text[index]
        if quote:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == quote:
                quote = ""
            continue
        if char in {"'", '"', "`"}:
            quote = char
            continue
        if char == "{":
            depth += 1
            continue
        if char == "}":
            depth -= 1
            if depth == 0:
                return text[body_start:index], body_start, index
    return None


def _extract_js_object_entries(body: str) -> List[Tuple[str, str, int]]:
    entries: List[Tuple[str, str, int]] = []
    index = 0
    length = len(body)
    while index < length:
        while index < length and (body[index].isspace() or body[index] == ","):
            index += 1
        if index >= length:
            break
        if body.startswith("...", index):
            next_comma = body.find(",", index)
            index = length if next_comma == -1 else next_comma + 1
            continue

        key_offset = index
        key = ""
        if body[index] in {"'", '"'}:
            quote = body[index]
            index += 1
            start = index
            while index < length and body[index] != quote:
                if body[index] == "\\":
                    index += 2
                else:
                    index += 1
            key = body[start:index]
            index += 1
        else:
            match = re.match(r"[A-Za-z_$][\w$]*", body[index:])
            if not match:
                index += 1
                continue
            key = match.group(0)
            index += len(key)

        while index < length and body[index].isspace():
            index += 1
        if index >= length or body[index] != ":":
            next_comma = body.find(",", index)
            index = length if next_comma == -1 else next_comma + 1
            continue
        index += 1

        value_start = index
        depth = 0
        quote = ""
        escape = False
        while index < length:
            char = body[index]
            if quote:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == quote:
                    quote = ""
            elif char in {"'", '"', "`"}:
                quote = char
            elif char in "{[(":
                depth += 1
            elif char in "}])" and depth > 0:
                depth -= 1
            elif char == "," and depth == 0:
                break
            index += 1
        entries.append((key, body[value_start:index].strip(), key_offset))
        if index < length and body[index] == ",":
            index += 1
    return entries


def _js_schema_field_type(value: str) -> str:
    for pattern in (
        r"\bDataTypes\.([A-Za-z_][\w]*)",
        r"\btype\s*:\s*DataTypes\.([A-Za-z_][\w]*)",
        r"\btype\s*:\s*([A-Za-z_][\w]*)",
        r"^\s*([A-Za-z_][\w]*)\s*$",
    ):
        match = re.search(pattern, value)
        if match:
            return match.group(1)
    quoted_type = _js_named_option(value, "type")
    return quoted_type


def _first_quoted_value(text: str) -> str:
    match = re.search(r"['\"]([^'\"]+)['\"]", text)
    return match.group(1) if match else ""


def _js_named_option(text: str, name: str) -> str:
    match = re.search(rf"\b{re.escape(name)}\s*:\s*['\"]([^'\"]+)['\"]", text)
    return match.group(1) if match else ""


def _prisma_base_type(field_type: str) -> str:
    return str(field_type or "").replace("[]", "").rstrip("?").strip()


def _prisma_relation_type(field_type: str) -> str:
    value = str(field_type or "").strip()
    if value.endswith("[]"):
        return "many"
    if value.endswith("?"):
        return "optional"
    return "one"


def _prisma_model_table_name(body: str) -> str:
    match = re.search(r"(?m)^\s*@@map\s*\(\s*['\"]([^'\"]+)['\"]", body)
    return match.group(1) if match else ""


def _prisma_field_map(line: str) -> str:
    match = re.search(r"@map\s*\(\s*['\"]([^'\"]+)['\"]", line)
    return match.group(1) if match else ""


def _prisma_relation_array_option(line: str, name: str) -> List[str]:
    match = re.search(rf"\b{re.escape(name)}\s*:\s*\[(?P<items>[^\]]*)\]", line)
    if not match:
        return []
    items = []
    for raw in match.group("items").split(","):
        value = raw.strip().strip("\"'")
        if value:
            items.append(value)
    return items


def _typeorm_relation_target(args: str, type_annotation: str) -> str:
    clean_type = _clean_type_name(type_annotation)
    if clean_type:
        return clean_type
    match = re.search(r"=>\s*([A-Za-z_$][\w$]*)", args)
    return match.group(1) if match else ""


def _rails_association_target(name: str, relation_type: str) -> str:
    value = str(name or "").strip("_")
    if relation_type in {"has_many", "has_and_belongs_to_many"} and value.endswith("s") and len(value) > 1:
        value = value[:-1]
    return _camelize_identifier(value)


def _jpa_relation_annotation(annotations: str) -> str:
    for relation_type in ("ManyToOne", "OneToOne", "OneToMany", "ManyToMany"):
        if f"@{relation_type}" in annotations:
            return relation_type
    return ""


def _clean_type_name(type_name: str) -> str:
    value = str(type_name or "").strip()
    if not value:
        return ""
    value = re.sub(r"\b(?:Promise|Array|ICollection|IEnumerable|List|Set|Collection)\s*<\s*([^>]+)\s*>", r"\1", value)
    value = value.replace("[]", "").replace("?", "").strip()
    value = value.split("|", 1)[0].strip()
    value = value.rsplit(".", 1)[-1]
    return value if re.match(r"^[A-Za-z_$][\w$]*$", value) else ""


def _camelize_identifier(value: str) -> str:
    parts = [part for part in re.split(r"[_\-\s]+", str(value or "")) if part]
    return "".join(part[:1].upper() + part[1:] for part in parts)


def _nearest_elixir_module_name(text: str, offset: int) -> str:
    matches = list(re.finditer(r"\bdefmodule\s+([A-Za-z_][\w.]+)\s+do", text[:offset]))
    if not matches:
        return ""
    return matches[-1].group(1).split(".")[-1]


def _annotation_named_value(text: str, annotation: str, name: str) -> str:
    pattern = rf"@{re.escape(annotation)}\s*\((?P<body>[^)]*)\)"
    matches = list(re.finditer(pattern, text, flags=re.DOTALL))
    if not matches:
        return ""
    body = matches[-1].group("body")
    named = re.search(rf"\b{re.escape(name)}\s*=\s*['\"]([^'\"]+)['\"]", body)
    if named:
        return named.group(1)
    return _first_quoted_value(body)


def _csharp_attribute_value(text: str, attribute: str) -> str:
    pattern = rf"\[{re.escape(attribute)}(?:Attribute)?\s*\((?P<body>[^\)]*)\)\]"
    matches = list(re.finditer(pattern, text, flags=re.DOTALL))
    if not matches:
        return ""
    return _first_quoted_value(matches[-1].group("body"))


def _extract_package_json_runbook(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_manifests: set,
    seen_commands: set,
    seen_dependencies: set,
    seen_runtime_requirements: set,
    seen_repo_policies: set,
    seen_workspaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return

    package_manager = _detect_node_package_manager(file_path.parent)
    _extract_package_json_workspaces(data, text, source_path, facts, seen_workspaces, package_manager)
    dependencies = data.get("dependencies") if isinstance(data.get("dependencies"), dict) else {}
    dev_dependencies = data.get("devDependencies") if isinstance(data.get("devDependencies"), dict) else {}
    optional_dependencies = data.get("optionalDependencies") if isinstance(data.get("optionalDependencies"), dict) else {}
    peer_dependencies = data.get("peerDependencies") if isinstance(data.get("peerDependencies"), dict) else {}

    _append_manifest(
        facts,
        seen_manifests,
        ecosystem="JavaScript/TypeScript",
        package_manager=package_manager,
        source_path=source_path,
        dependency_count=len(dependencies) + len(optional_dependencies) + len(peer_dependencies),
        dev_dependency_count=len(dev_dependencies),
        detail=f"{len(data.get('scripts') or {}) if isinstance(data.get('scripts'), dict) else 0} scripts",
    )
    _append_command(
        facts,
        seen_commands,
        category="install",
        name=f"{package_manager} install",
        command=f"{package_manager} install",
        source_path=source_path,
        detail="Install JavaScript dependencies",
    )

    for scope, raw_deps in (
        ("runtime", dependencies),
        ("dev", dev_dependencies),
        ("optional", optional_dependencies),
        ("peer", peer_dependencies),
    ):
        for dependency in sorted(raw_deps):
            _append_dependency(
                facts,
                seen_dependencies,
                name=dependency,
                ecosystem="JavaScript/TypeScript",
                scope=scope,
                source_path=source_path,
            )

    license_value = data.get("license")
    if isinstance(license_value, str) and license_value.strip():
        _append_repo_policy(
            facts,
            seen_repo_policies,
            policy_type="license",
            name="license",
            value=license_value.strip(),
            source_path=source_path,
            line=_line_number_for_key(text, "license") or 1,
            source="package-json",
            detail="package.json license",
        )

    engines = data.get("engines") if isinstance(data.get("engines"), dict) else {}
    for raw_name, raw_requirement in sorted(engines.items()):
        runtime = _node_engine_runtime(str(raw_name))
        if not runtime or not isinstance(raw_requirement, (str, int, float)):
            continue
        _append_runtime_requirement(
            facts,
            seen_runtime_requirements,
            runtime=runtime,
            requirement=str(raw_requirement),
            source_path=source_path,
            line=_line_number_for_key(text, str(raw_name)) or _line_number_for_key(text, "engines") or 1,
            source="package-engines",
            detail=f"package.json engines.{raw_name}",
        )

    scripts = data.get("scripts")
    if not isinstance(scripts, dict):
        return

    for script_name in sorted(scripts, key=_script_sort_key):
        script_body = scripts.get(script_name)
        if not isinstance(script_body, str):
            continue

        _append_command(
            facts,
            seen_commands,
            category=_command_category(script_name),
            name=str(script_name),
            command=_node_script_command(package_manager, str(script_name)),
            source_path=source_path,
            detail=script_body[:200],
        )


def _extract_package_json_workspaces(
    data: Dict[str, Any],
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_workspaces: set,
    package_manager: str,
) -> None:
    package_name = data.get("name") if isinstance(data.get("name"), str) else "JavaScript workspace"
    raw_workspaces = data.get("workspaces")
    workspace_patterns: List[str] = []
    if isinstance(raw_workspaces, list):
        workspace_patterns = [item for item in raw_workspaces if isinstance(item, str)]
    elif isinstance(raw_workspaces, dict):
        packages = raw_workspaces.get("packages")
        if isinstance(packages, list):
            workspace_patterns = [item for item in packages if isinstance(item, str)]

    if not workspace_patterns:
        return

    _append_workspace(
        facts,
        seen_workspaces,
        name=package_name,
        path=".",
        workspace_kind="root",
        ecosystem="JavaScript/TypeScript",
        manager=package_manager,
        source_path=source_path,
        line=_line_number_for_key(text, "workspaces") or 1,
        detail="package.json workspace root",
    )
    for pattern in workspace_patterns:
        _append_workspace(
            facts,
            seen_workspaces,
            name=_workspace_name_from_pattern(pattern),
            path=pattern,
            workspace_kind="package",
            ecosystem="JavaScript/TypeScript",
            manager=package_manager,
            source_path=source_path,
            line=_line_number_for_key(text, pattern) or _line_number_for_key(text, "workspaces") or 1,
            detail="package.json workspace package pattern",
        )


def _extract_pyproject_runbook(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_manifests: set,
    seen_commands: set,
    seen_dependencies: set,
    seen_runtime_requirements: set,
    seen_repo_policies: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_toml_text(text)
    if not isinstance(data, dict):
        return

    project = data.get("project") if isinstance(data.get("project"), dict) else {}
    tool = data.get("tool") if isinstance(data.get("tool"), dict) else {}
    poetry = tool.get("poetry") if isinstance(tool.get("poetry"), dict) else {}
    package_manager = "poetry" if poetry else "pip"

    project_dependencies = project.get("dependencies") if isinstance(project.get("dependencies"), list) else []
    optional_dependencies = project.get("optional-dependencies") if isinstance(project.get("optional-dependencies"), dict) else {}
    poetry_dependencies = poetry.get("dependencies") if isinstance(poetry.get("dependencies"), dict) else {}
    poetry_dev_dependencies = poetry.get("dev-dependencies") if isinstance(poetry.get("dev-dependencies"), dict) else {}
    poetry_groups = poetry.get("group") if isinstance(poetry.get("group"), dict) else {}

    dependency_names = {
        _python_dependency_name(item)
        for item in project_dependencies
        if isinstance(item, str)
    }
    dependency_names.update(name for name in poetry_dependencies if name.lower() != "python")
    optional_names = {
        _python_dependency_name(item)
        for items in optional_dependencies.values()
        if isinstance(items, list)
        for item in items
        if isinstance(item, str)
    }
    dev_names = set(poetry_dev_dependencies)
    for group_data in poetry_groups.values():
        if not isinstance(group_data, dict):
            continue
        group_dependencies = group_data.get("dependencies")
        if isinstance(group_dependencies, dict):
            dev_names.update(group_dependencies)

    _append_manifest(
        facts,
        seen_manifests,
        ecosystem="Python",
        package_manager=package_manager,
        source_path=source_path,
        dependency_count=len(dependency_names),
        dev_dependency_count=len(optional_names | dev_names),
        detail=(project.get("name") or poetry.get("name") or "Python project"),
    )
    _append_command(
        facts,
        seen_commands,
        category="install",
        name=f"{package_manager} install",
        command="poetry install" if package_manager == "poetry" else "pip install -e .",
        source_path=source_path,
        detail="Install Python project dependencies",
    )

    all_python_dependencies = dependency_names | optional_names | dev_names
    if "pytest" in {name.lower() for name in all_python_dependencies}:
        _append_command(facts, seen_commands, "test", "pytest", "poetry run pytest" if package_manager == "poetry" else "pytest", source_path, "Run Python tests")
    if data.get("build-system"):
        _append_command(facts, seen_commands, "build", "build", "python -m build", source_path, "Build Python package")

    for dependency in sorted(dependency_names):
        _append_dependency(facts, seen_dependencies, dependency, "Python", "runtime", source_path)
    for dependency in sorted(optional_names | dev_names):
        _append_dependency(facts, seen_dependencies, dependency, "Python", "dev", source_path)

    requires_python = project.get("requires-python")
    if isinstance(requires_python, str) and requires_python.strip():
        _append_runtime_requirement(
            facts,
            seen_runtime_requirements,
            runtime="Python",
            requirement=requires_python.strip(),
            source_path=source_path,
            line=_line_number_for_key(text, "requires-python") or 1,
            source="pyproject",
            detail="project.requires-python",
        )

    poetry_python = poetry_dependencies.get("python") if isinstance(poetry_dependencies, dict) else None
    if isinstance(poetry_python, str) and poetry_python.strip():
        _append_runtime_requirement(
            facts,
            seen_runtime_requirements,
            runtime="Python",
            requirement=poetry_python.strip(),
            source_path=source_path,
            line=_line_number_for_key(text, "python") or 1,
            source="poetry",
            detail="tool.poetry.dependencies.python",
        )

    license_value = _pyproject_license_value(project)
    if license_value:
        _append_repo_policy(
            facts,
            seen_repo_policies,
            policy_type="license",
            name="license",
            value=license_value,
            source_path=source_path,
            line=_line_number_for_key(text, "license") or 1,
            source="pyproject",
            detail="project.license",
        )


def _extract_requirements_runbook(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_manifests: set,
    seen_commands: set,
    seen_dependencies: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    dependencies = [
        _python_dependency_name(line)
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith(("#", "-"))
    ]
    dependencies = [dependency for dependency in dependencies if dependency]

    _append_manifest(
        facts,
        seen_manifests,
        ecosystem="Python",
        package_manager="pip",
        source_path=source_path,
        dependency_count=len(dependencies),
        dev_dependency_count=0,
        detail="requirements file",
    )
    _append_command(
        facts,
        seen_commands,
        category="install",
        name="pip install",
        command=f"pip install -r {source_path}",
        source_path=source_path,
        detail="Install pinned Python dependencies",
    )
    for dependency in sorted(set(dependencies)):
        _append_dependency(facts, seen_dependencies, dependency, "Python", "runtime", source_path)


def _extract_go_mod_runbook(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_manifests: set,
    seen_commands: set,
    seen_dependencies: set,
    seen_runtime_requirements: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    module_match = re.search(r"(?m)^module\s+(\S+)", text)
    dependencies = _go_required_modules(text)
    _append_manifest(facts, seen_manifests, "Go", "go", source_path, len(dependencies), 0, module_match.group(1) if module_match else "Go module")
    _append_command(facts, seen_commands, "install", "go mod download", "go mod download", source_path, "Download Go modules")
    _append_command(facts, seen_commands, "test", "go test", "go test ./...", source_path, "Run Go tests")
    _append_command(facts, seen_commands, "run", "go run", "go run .", source_path, "Run Go module")
    for dependency in dependencies:
        _append_dependency(facts, seen_dependencies, dependency, "Go", "runtime", source_path)

    go_match = re.search(r"(?m)^go\s+([0-9][^\s]*)", text)
    if go_match:
        _append_runtime_requirement(
            facts,
            seen_runtime_requirements,
            runtime="Go",
            requirement=go_match.group(1),
            source_path=source_path,
            line=_line_number(text, go_match.start()),
            source="go.mod",
            detail="go directive",
        )


def _extract_go_work_runbook(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_workspaces: set,
    seen_commands: set,
    seen_runtime_requirements: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    modules = _go_work_use_paths(text)
    if not modules:
        return

    _append_workspace(
        facts,
        seen_workspaces,
        name="Go workspace",
        path=".",
        workspace_kind="root",
        ecosystem="Go",
        manager="go work",
        source_path=source_path,
        line=1,
        detail="go.work workspace root",
    )
    for module_path, line_number in modules:
        _append_workspace(
            facts,
            seen_workspaces,
            name=PurePosixPath(module_path).name or module_path,
            path=module_path,
            workspace_kind="module",
            ecosystem="Go",
            manager="go work",
            source_path=source_path,
            line=line_number,
            detail="go.work use module",
        )

    _append_command(facts, seen_commands, "install", "go work sync", "go work sync", source_path, "Sync Go workspace modules")
    go_match = re.search(r"(?m)^go\s+([0-9][^\s]*)", text)
    if go_match:
        _append_runtime_requirement(
            facts,
            seen_runtime_requirements,
            runtime="Go",
            requirement=go_match.group(1),
            source_path=source_path,
            line=_line_number(text, go_match.start()),
            source="go.work",
            detail="go.work go directive",
        )


def _extract_cargo_runbook(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_manifests: set,
    seen_commands: set,
    seen_dependencies: set,
    seen_runtime_requirements: set,
    seen_repo_policies: set,
    seen_workspaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_toml_text(text)
    if not isinstance(data, dict):
        return

    runtime = data.get("dependencies") if isinstance(data.get("dependencies"), dict) else {}
    dev = data.get("dev-dependencies") if isinstance(data.get("dev-dependencies"), dict) else {}
    build = data.get("build-dependencies") if isinstance(data.get("build-dependencies"), dict) else {}
    package = data.get("package") if isinstance(data.get("package"), dict) else {}
    workspace = data.get("workspace") if isinstance(data.get("workspace"), dict) else {}

    if workspace:
        _append_workspace(
            facts,
            seen_workspaces,
            name=package.get("name") or "Cargo workspace",
            path=".",
            workspace_kind="root",
            ecosystem="Rust",
            manager="cargo",
            source_path=source_path,
            line=_line_number_for_key(text, "workspace") or 1,
            detail="Cargo workspace root",
        )
        workspace_members = workspace.get("members") if isinstance(workspace.get("members"), list) else []
        for member in workspace_members:
            if isinstance(member, str):
                _append_workspace(
                    facts,
                    seen_workspaces,
                    name=PurePosixPath(member).name or member,
                    path=member,
                    workspace_kind="member",
                    ecosystem="Rust",
                    manager="cargo",
                    source_path=source_path,
                    line=_line_number_for_key(text, member) or _line_number_for_key(text, "members") or 1,
                    detail="Cargo workspace member",
                )
        workspace_excludes = workspace.get("exclude") if isinstance(workspace.get("exclude"), list) else []
        for excluded in workspace_excludes:
            if isinstance(excluded, str):
                _append_workspace(
                    facts,
                    seen_workspaces,
                    name=PurePosixPath(excluded).name or excluded,
                    path=excluded,
                    workspace_kind="exclude",
                    ecosystem="Rust",
                    manager="cargo",
                    source_path=source_path,
                    line=_line_number_for_key(text, excluded) or _line_number_for_key(text, "exclude") or 1,
                    detail="Cargo workspace exclude",
                )

    _append_manifest(facts, seen_manifests, "Rust", "cargo", source_path, len(runtime) + len(build), len(dev), package.get("name") or "Rust crate")
    _append_command(facts, seen_commands, "build", "cargo build", "cargo build", source_path, "Build Rust crate")
    _append_command(facts, seen_commands, "test", "cargo test", "cargo test", source_path, "Run Rust tests")
    _append_command(facts, seen_commands, "run", "cargo run", "cargo run", source_path, "Run Rust crate")
    for dependency in sorted(runtime):
        _append_dependency(facts, seen_dependencies, dependency, "Rust", "runtime", source_path)
    for dependency in sorted(set(dev) | set(build)):
        _append_dependency(facts, seen_dependencies, dependency, "Rust", "dev", source_path)

    rust_version = package.get("rust-version")
    if isinstance(rust_version, str) and rust_version.strip():
        _append_runtime_requirement(
            facts,
            seen_runtime_requirements,
            runtime="Rust",
            requirement=rust_version.strip(),
            source_path=source_path,
            line=_line_number_for_key(text, "rust-version") or 1,
            source="cargo",
            detail="package.rust-version",
        )
    edition = package.get("edition")
    if isinstance(edition, str) and edition.strip():
        _append_runtime_requirement(
            facts,
            seen_runtime_requirements,
            runtime="Rust edition",
            requirement=edition.strip(),
            source_path=source_path,
            line=_line_number_for_key(text, "edition") or 1,
            source="cargo",
            detail="package.edition",
        )

    license_value = package.get("license")
    if isinstance(license_value, str) and license_value.strip():
        _append_repo_policy(
            facts,
            seen_repo_policies,
            policy_type="license",
            name="license",
            value=license_value.strip(),
            source_path=source_path,
            line=_line_number_for_key(text, "license") or 1,
            source="cargo",
            detail="package.license",
        )
    license_file = package.get("license-file")
    if isinstance(license_file, str) and license_file.strip():
        _append_repo_policy(
            facts,
            seen_repo_policies,
            policy_type="license",
            name="license file",
            value=license_file.strip(),
            source_path=source_path,
            line=_line_number_for_key(text, "license-file") or 1,
            source="cargo",
            detail="package.license-file",
        )


def _extract_pnpm_workspace(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_workspaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    patterns = _yaml_list_under_key(text, "packages")
    if not patterns:
        return

    _append_workspace(
        facts,
        seen_workspaces,
        name="pnpm workspace",
        path=".",
        workspace_kind="root",
        ecosystem="JavaScript/TypeScript",
        manager="pnpm",
        source_path=source_path,
        line=_line_number_for_key(text, "packages") or 1,
        detail="pnpm workspace root",
    )
    for pattern, line_number in patterns:
        _append_workspace(
            facts,
            seen_workspaces,
            name=_workspace_name_from_pattern(pattern),
            path=pattern,
            workspace_kind="package",
            ecosystem="JavaScript/TypeScript",
            manager="pnpm",
            source_path=source_path,
            line=line_number,
            detail="pnpm workspace package pattern",
        )


def _extract_lerna_workspace(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_workspaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return
    packages = data.get("packages") if isinstance(data.get("packages"), list) else []
    if not packages:
        return
    _append_workspace(
        facts,
        seen_workspaces,
        name="Lerna workspace",
        path=".",
        workspace_kind="root",
        ecosystem="JavaScript/TypeScript",
        manager="lerna",
        source_path=source_path,
        line=_line_number_for_key(text, "packages") or 1,
        detail="Lerna workspace root",
    )
    for pattern in packages:
        if not isinstance(pattern, str):
            continue
        _append_workspace(
            facts,
            seen_workspaces,
            name=_workspace_name_from_pattern(pattern),
            path=pattern,
            workspace_kind="package",
            ecosystem="JavaScript/TypeScript",
            manager="lerna",
            source_path=source_path,
            line=_line_number_for_key(text, pattern) or _line_number_for_key(text, "packages") or 1,
            detail="Lerna package pattern",
        )


def _extract_nx_workspace(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_workspaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return
    projects = data.get("projects") if isinstance(data.get("projects"), dict) else {}
    if not projects:
        return
    _append_workspace(
        facts,
        seen_workspaces,
        name="Nx workspace",
        path=".",
        workspace_kind="root",
        ecosystem="JavaScript/TypeScript",
        manager="nx",
        source_path=source_path,
        line=_line_number_for_key(text, "projects") or 1,
        detail="Nx workspace root",
    )
    for project_name, raw_project in sorted(projects.items()):
        project_path = ""
        if isinstance(raw_project, str):
            project_path = raw_project
        elif isinstance(raw_project, dict) and isinstance(raw_project.get("root"), str):
            project_path = raw_project["root"]
        if not project_path:
            continue
        _append_workspace(
            facts,
            seen_workspaces,
            name=str(project_name),
            path=project_path,
            workspace_kind="project",
            ecosystem="JavaScript/TypeScript",
            manager="nx",
            source_path=source_path,
            line=_line_number_for_key(text, str(project_name)) or _line_number_for_key(text, "projects") or 1,
            detail="Nx project root",
        )


def _extract_composer_runbook(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_manifests: set,
    seen_commands: set,
    seen_dependencies: set,
    seen_runtime_requirements: set,
    seen_repo_policies: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return

    runtime = data.get("require") if isinstance(data.get("require"), dict) else {}
    dev = data.get("require-dev") if isinstance(data.get("require-dev"), dict) else {}
    scripts = data.get("scripts") if isinstance(data.get("scripts"), dict) else {}
    runtime_deps = [name for name in runtime if name.lower() != "php"]

    _append_manifest(facts, seen_manifests, "PHP", "composer", source_path, len(runtime_deps), len(dev), data.get("name") or "Composer package")
    _append_command(facts, seen_commands, "install", "composer install", "composer install", source_path, "Install PHP dependencies")
    for script_name, script_body in sorted(scripts.items(), key=lambda item: _script_sort_key(item[0])):
        if isinstance(script_body, (str, list)):
            detail = script_body if isinstance(script_body, str) else " && ".join(str(item) for item in script_body)
            _append_command(facts, seen_commands, _command_category(str(script_name)), str(script_name), f"composer run-script {script_name}", source_path, detail[:200])
    for dependency in sorted(runtime_deps):
        _append_dependency(facts, seen_dependencies, dependency, "PHP", "runtime", source_path)
    for dependency in sorted(dev):
        _append_dependency(facts, seen_dependencies, dependency, "PHP", "dev", source_path)

    php_requirement = runtime.get("php")
    if isinstance(php_requirement, str) and php_requirement.strip():
        _append_runtime_requirement(
            facts,
            seen_runtime_requirements,
            runtime="PHP",
            requirement=php_requirement.strip(),
            source_path=source_path,
            line=_line_number_for_key(text, "php") or 1,
            source="composer",
            detail="require.php",
        )

    license_value = data.get("license")
    if isinstance(license_value, str):
        licenses = [license_value]
    elif isinstance(license_value, list):
        licenses = [str(item) for item in license_value if isinstance(item, str)]
    else:
        licenses = []
    for item in licenses:
        if not item.strip():
            continue
        _append_repo_policy(
            facts,
            seen_repo_policies,
            policy_type="license",
            name="license",
            value=item.strip(),
            source_path=source_path,
            line=_line_number_for_key(text, "license") or 1,
            source="composer",
            detail="composer license",
        )


def _extract_gemfile_runbook(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_manifests: set,
    seen_commands: set,
    seen_dependencies: set,
    seen_runtime_requirements: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    dependencies = sorted(set(re.findall(r"(?m)^\s*gem\s+['\"]([^'\"]+)['\"]", text)))
    _append_manifest(facts, seen_manifests, "Ruby", "bundler", source_path, len(dependencies), 0, "Gemfile")
    _append_command(facts, seen_commands, "install", "bundle install", "bundle install", source_path, "Install Ruby gems")
    if "rspec" in dependencies:
        _append_command(facts, seen_commands, "test", "rspec", "bundle exec rspec", source_path, "Run RSpec tests")
    if "rails" in dependencies:
        _append_command(facts, seen_commands, "run", "rails server", "bundle exec rails server", source_path, "Run Rails server")
    for dependency in dependencies:
        _append_dependency(facts, seen_dependencies, dependency, "Ruby", "runtime", source_path)

    ruby_match = re.search(r"(?m)^\s*ruby\s+['\"]([^'\"]+)['\"]", text)
    if ruby_match:
        _append_runtime_requirement(
            facts,
            seen_runtime_requirements,
            runtime="Ruby",
            requirement=ruby_match.group(1),
            source_path=source_path,
            line=_line_number(text, ruby_match.start()),
            source="gemfile",
            detail="Gemfile ruby directive",
        )


def _extract_dockerfile_runbook(source_path: str, facts: Dict[str, List[Dict[str, Any]]], seen_commands: set) -> None:
    context = "." if "/" not in source_path else str(PurePosixPath(source_path).parent)
    _append_command(
        facts,
        seen_commands,
        category="container",
        name="docker build",
        command=f"docker build -t codesniff-target {context}",
        source_path=source_path,
        detail="Build container image",
    )


def _extract_compose_runbook(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_manifests: set,
    seen_commands: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    services = _count_compose_services(text)
    _append_manifest(facts, seen_manifests, "Containers", "docker compose", source_path, services, 0, f"{services} services")
    _append_command(facts, seen_commands, "container", "docker compose up", "docker compose up", source_path, "Run Compose services")


def _extract_env_template(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_environment: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    assignment_pattern = re.compile(r"^(?:export\s+)?(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*(?:=(?P<value>.*))?$")
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = assignment_pattern.match(stripped)
        if not match:
            continue
        value = match.group("value")
        _append_environment_variable(
            facts,
            seen_environment,
            name=match.group("name"),
            source_path=source_path,
            line=line_number,
            source="env-template",
            service=None,
            required=value is None or value == "",
            has_default=bool(value),
        )


def _extract_compose_environment(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_environment: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    in_services = False
    current_service: Optional[str] = None
    service_indent: Optional[int] = None
    in_environment = False
    environment_indent: Optional[int] = None

    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        stripped = raw_line.strip()

        if re.match(r"^services\s*:\s*(?:#.*)?$", stripped):
            in_services = True
            current_service = None
            service_indent = None
            in_environment = False
            environment_indent = None
            continue

        if in_services and indent == 0 and not stripped.startswith("services:"):
            in_services = False
            current_service = None
            service_indent = None
            in_environment = False
            environment_indent = None

        if not in_services:
            continue

        service_match = re.match(r"^(?P<name>[A-Za-z0-9_.-]+)\s*:\s*(?:#.*)?$", stripped)
        if service_match and (service_indent is None or indent <= service_indent):
            current_service = service_match.group("name")
            service_indent = indent
            in_environment = False
            environment_indent = None
            continue

        if current_service and re.match(r"^environment\s*:\s*(?:#.*)?$", stripped):
            in_environment = True
            environment_indent = indent
            continue

        if in_environment and environment_indent is not None and indent <= environment_indent:
            in_environment = False
            environment_indent = None

        if in_environment and current_service:
            env_name = _compose_environment_name(stripped)
            if env_name:
                _append_environment_variable(
                    facts,
                    seen_environment,
                    name=env_name,
                    source_path=source_path,
                    line=line_number,
                    source="docker-compose",
                    service=current_service,
                    required="=" not in stripped and ":" not in stripped,
                    has_default=("=" in stripped or ":" in stripped),
                )


def _compose_environment_name(stripped_line: str) -> Optional[str]:
    item = stripped_line[2:].strip() if stripped_line.startswith("- ") else stripped_line
    item = item.strip("'\"")
    match = re.match(r"^(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*(?:[:=]|$)", item)
    return match.group("name") if match else None


def _append_environment_variable(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_environment: set,
    *,
    name: str,
    source_path: str,
    line: int,
    source: str,
    service: Optional[str],
    required: bool,
    has_default: bool,
) -> None:
    if len(facts["environment_variables"]) >= MAX_ENV_VAR_FACTS:
        return
    identity = (source_path, service or "", name)
    if identity in seen_environment:
        return
    seen_environment.add(identity)
    detail = f"{service} service environment variable" if service else "environment template variable"
    facts["environment_variables"].append({
        "name": name,
        "detail": detail,
        "source_path": source_path,
        "line": line,
        "source": source,
        "service": service or "",
        "required": required,
        "has_default": has_default,
    })


def _extract_compose_services(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_container_services: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    in_services = False
    current: Optional[Dict[str, Any]] = None
    service_indent: Optional[int] = None
    list_field: Optional[str] = None
    list_indent: Optional[int] = None

    def flush_current() -> None:
        if current:
            _append_container_service(facts, seen_container_services, **current)

    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        stripped = raw_line.strip()

        if re.match(r"^services\s*:\s*(?:#.*)?$", stripped):
            flush_current()
            in_services = True
            current = None
            service_indent = None
            list_field = None
            list_indent = None
            continue

        if in_services and indent == 0 and not stripped.startswith("services:"):
            flush_current()
            in_services = False
            current = None
            service_indent = None
            list_field = None
            list_indent = None
            continue

        if not in_services:
            continue

        service_match = re.match(r"^(?P<name>[A-Za-z0-9_.-]+)\s*:\s*(?:#.*)?$", stripped)
        if service_match and (service_indent is None or indent <= service_indent):
            flush_current()
            current = {
                "name": service_match.group("name"),
                "source_path": source_path,
                "line": line_number,
                "provider": "docker-compose",
                "image": "",
                "build": "",
                "command": "",
                "ports": [],
                "depends_on": [],
            }
            service_indent = indent
            list_field = None
            list_indent = None
            continue

        if not current or service_indent is None or indent <= service_indent:
            continue

        if list_field and list_indent is not None and indent > list_indent:
            _consume_compose_service_list_item(current, list_field, stripped)
            continue
        if list_field and list_indent is not None and indent <= list_indent:
            list_field = None
            list_indent = None

        field_match = re.match(r"^(?P<field>image|build|command|ports|depends_on)\s*:\s*(?P<value>.*?)\s*$", stripped)
        if not field_match:
            continue
        field = field_match.group("field")
        value = _clean_compose_scalar(field_match.group("value"))
        if field in {"image", "build", "command"}:
            current[field] = value or ("build context" if field == "build" else "")
        elif field in {"ports", "depends_on"}:
            if value:
                current[field] = _split_compose_inline_list(value)
            else:
                list_field = field
                list_indent = indent

    flush_current()


def _consume_compose_service_list_item(current: Dict[str, Any], field: str, stripped: str) -> None:
    values = current.get(field)
    if not isinstance(values, list):
        values = []
        current[field] = values

    item = ""
    if stripped.startswith("- "):
        item = _clean_compose_scalar(stripped[2:])
    elif field == "depends_on":
        match = re.match(r"([A-Za-z0-9_.-]+)\s*:", stripped)
        item = match.group(1) if match else ""
    if item and item not in values:
        values.append(item[:160])


def _split_compose_inline_list(value: str) -> List[str]:
    cleaned = _clean_compose_scalar(value)
    if not cleaned:
        return []
    if cleaned.startswith("[") and cleaned.endswith("]"):
        cleaned = cleaned[1:-1]
    if "," in cleaned:
        return [_clean_compose_scalar(part)[:160] for part in cleaned.split(",") if _clean_compose_scalar(part)]
    return [_clean_compose_scalar(cleaned)[:160]]


def _clean_compose_scalar(value: str) -> str:
    cleaned = str(value or "").strip()
    if " #" in cleaned:
        cleaned = cleaned.split(" #", 1)[0].strip()
    return cleaned.strip().strip("'\"")


def _append_container_service(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_container_services: set,
    *,
    name: str,
    source_path: str,
    line: int,
    provider: str,
    image: str,
    build: str,
    command: str,
    ports: List[str],
    depends_on: List[str],
) -> None:
    if len(facts["container_services"]) >= MAX_CONTAINER_SERVICE_FACTS:
        return
    identity = (source_path, name)
    if identity in seen_container_services:
        return
    seen_container_services.add(identity)

    detail_parts = []
    if image:
        detail_parts.append(f"image: {image}")
    if build:
        detail_parts.append(f"build: {build}")
    if ports:
        detail_parts.append(f"ports: {', '.join(ports[:4])}")
    if depends_on:
        detail_parts.append(f"depends on: {', '.join(depends_on[:4])}")
    if command:
        detail_parts.append(f"command: {command}")
    detail = "; ".join(detail_parts) or "Docker Compose service"
    facts["container_services"].append({
        "name": name,
        "detail": detail[:300],
        "source_path": source_path,
        "line": line,
        "provider": provider,
        "image": image,
        "build": build,
        "command": command,
        "ports": ports[:8],
        "depends_on": depends_on[:8],
    })


def _is_ci_workflow_path(relative_path: Path, name: str) -> bool:
    parts = [part.lower() for part in relative_path.parts]
    if len(parts) >= 3 and parts[0] == ".github" and parts[1] == "workflows" and name.endswith((".yml", ".yaml")):
        return True
    if len(parts) >= 2 and parts[0] == ".circleci" and name in {"config.yml", "config.yaml"}:
        return True
    return name in {
        ".gitlab-ci.yml",
        ".gitlab-ci.yaml",
        "azure-pipelines.yml",
        "azure-pipelines.yaml",
        "bitbucket-pipelines.yml",
        "bitbucket-pipelines.yaml",
    }


def _extract_ci_workflow(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_ci_workflows: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    name, line = _ci_workflow_name(text, source_path)
    events = _ci_workflow_events(text)
    jobs = _ci_workflow_jobs(text)
    commands = _ci_workflow_run_commands(text)
    provider = _ci_workflow_provider(source_path)
    detail_parts = []
    if events:
        detail_parts.append(f"events: {', '.join(events[:4])}")
    if jobs:
        detail_parts.append(f"jobs: {', '.join(jobs[:4])}")
    if commands:
        detail_parts.append(f"runs: {' | '.join(commands[:3])}")
    detail = "; ".join(detail_parts) or f"{provider} workflow"
    _append_ci_workflow(
        facts,
        seen_ci_workflows,
        name=name,
        detail=detail,
        source_path=source_path,
        line=line,
        provider=provider,
        events=events,
        jobs=jobs,
        commands=commands,
    )


def _ci_workflow_name(text: str, source_path: str) -> tuple[str, int]:
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        match = re.match(r"^(?P<indent>\s*)name\s*:\s*(?P<value>.+?)\s*$", raw_line)
        if match and len(match.group("indent")) <= 2:
            value = _clean_ci_scalar(match.group("value"))
            if value:
                return value[:160], line_number
    return PurePosixPath(source_path).stem, 1


def _ci_workflow_events(text: str) -> List[str]:
    lines = text.splitlines()
    for index, raw_line in enumerate(lines):
        match = re.match(r"^(?P<indent>\s*)(?:['\"]?on['\"]?)\s*:\s*(?P<value>.*?)\s*$", raw_line)
        if not match:
            continue
        base_indent = len(match.group("indent"))
        value = _clean_ci_scalar(match.group("value"))
        if value:
            return _split_ci_list(value)[:8]

        events: List[str] = []
        for nested in lines[index + 1:]:
            if not nested.strip() or nested.lstrip().startswith("#"):
                continue
            indent = len(nested) - len(nested.lstrip(" "))
            if indent <= base_indent:
                break
            if indent != base_indent + 2:
                continue
            stripped = nested.strip()
            if stripped.startswith("- "):
                event = _clean_ci_scalar(stripped[2:])
            else:
                event_match = re.match(r"([A-Za-z_][\w-]*)\s*:", stripped)
                event = event_match.group(1) if event_match else ""
            if event and event not in events:
                events.append(event)
        return events[:8]
    return []


def _ci_workflow_jobs(text: str) -> List[str]:
    lines = text.splitlines()
    for index, raw_line in enumerate(lines):
        match = re.match(r"^(?P<indent>\s*)jobs\s*:\s*(?:#.*)?$", raw_line)
        if not match:
            continue
        base_indent = len(match.group("indent"))
        jobs: List[str] = []
        for nested in lines[index + 1:]:
            if not nested.strip() or nested.lstrip().startswith("#"):
                continue
            indent = len(nested) - len(nested.lstrip(" "))
            if indent <= base_indent:
                break
            if indent != base_indent + 2:
                continue
            job_match = re.match(r"([A-Za-z_][\w.-]*)\s*:", nested.strip())
            if job_match and job_match.group(1) not in jobs:
                jobs.append(job_match.group(1))
        return jobs[:12]
    return []


def _ci_workflow_run_commands(text: str) -> List[str]:
    commands: List[str] = []
    for raw_line in text.splitlines():
        match = re.match(r"^\s*(?:-\s*)?run\s*:\s*(?P<value>.+?)\s*$", raw_line)
        if not match:
            continue
        command = _clean_ci_scalar(match.group("value"))
        if command and command not in commands:
            commands.append(command[:180])
        if len(commands) >= 8:
            break
    return commands


def _ci_workflow_provider(source_path: str) -> str:
    normalized = source_path.lower()
    if normalized.startswith(".github/workflows/"):
        return "github-actions"
    if normalized.startswith(".circleci/"):
        return "circleci"
    if normalized.startswith(".gitlab-ci."):
        return "gitlab-ci"
    if normalized.startswith("azure-pipelines."):
        return "azure-pipelines"
    if normalized.startswith("bitbucket-pipelines."):
        return "bitbucket-pipelines"
    return "ci"


def _split_ci_list(value: str) -> List[str]:
    cleaned = value.strip()
    if cleaned.startswith("[") and cleaned.endswith("]"):
        cleaned = cleaned[1:-1]
    values = [_clean_ci_scalar(part) for part in re.split(r"[, ]+", cleaned) if part.strip()]
    return [item for item in values if item]


def _clean_ci_scalar(value: str) -> str:
    cleaned = str(value or "").strip().strip("'\"")
    if " #" in cleaned:
        cleaned = cleaned.split(" #", 1)[0].strip()
    return cleaned.strip().strip("'\"")


def _append_ci_workflow(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_ci_workflows: set,
    *,
    name: str,
    detail: str,
    source_path: str,
    line: int,
    provider: str,
    events: List[str],
    jobs: List[str],
    commands: List[str],
) -> None:
    if len(facts["ci_workflows"]) >= MAX_CI_WORKFLOW_FACTS:
        return
    identity = (source_path, name)
    if identity in seen_ci_workflows:
        return
    seen_ci_workflows.add(identity)
    facts["ci_workflows"].append({
        "name": name,
        "detail": detail[:300],
        "source_path": source_path,
        "line": line,
        "provider": provider,
        "events": events[:8],
        "jobs": jobs[:12],
        "commands": commands[:8],
    })


def _extract_makefile_runbook(file_path: Path, source_path: str, facts: Dict[str, List[Dict[str, Any]]], seen_commands: set) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    for target in _extract_make_targets(text)[:8]:
        _append_command(facts, seen_commands, _command_category(target), target, f"make {target}", source_path, "Makefile target")


def _extract_justfile_runbook(file_path: Path, source_path: str, facts: Dict[str, List[Dict[str, Any]]], seen_commands: set) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    for recipe in _extract_make_targets(text)[:8]:
        _append_command(facts, seen_commands, _command_category(recipe), recipe, f"just {recipe}", source_path, "Just recipe")


def _extract_search_quality_cases(source_dir: Path) -> tuple[List[Dict[str, Any]], Optional[Dict[str, Any]], List[str]]:
    if not source_dir.exists():
        return [], None, []

    warnings: List[str] = []
    for relative in SEARCH_QUALITY_SUITE_PATHS:
        file_path = source_dir / Path(*PurePosixPath(relative).parts)
        if not file_path.exists():
            continue

        text = _read_text_file(file_path)
        if text is None:
            warnings.append(f"Search-quality suite {relative} could not be read.")
            return [], None, warnings

        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            warnings.append(f"Search-quality suite {relative} is invalid JSON: {exc.msg}.")
            return [], None, warnings

        raw_cases = payload.get("queries") if isinstance(payload, dict) else payload
        if not isinstance(raw_cases, list):
            warnings.append(f"Search-quality suite {relative} must be a list or an object with a queries list.")
            return [], None, warnings
        baseline = _normalize_search_quality_baseline(payload.get("baseline") if isinstance(payload, dict) else None)

        cases: List[Dict[str, Any]] = []
        for index, raw_case in enumerate(raw_cases[:MAX_SEARCH_QUALITY_CASES], 1):
            case = _normalize_search_quality_case(raw_case, relative, index)
            if case is None:
                warnings.append(f"Search-quality suite {relative} case {index} was skipped because it is not verifiable.")
                continue
            cases.append(case)

        if len(raw_cases) > MAX_SEARCH_QUALITY_CASES:
            warnings.append(f"Search-quality suite {relative} was capped at {MAX_SEARCH_QUALITY_CASES} cases.")
        return cases, baseline, warnings

    return [], None, warnings


def _normalize_search_quality_case(raw_case: Any, suite_path: str, index: int) -> Optional[Dict[str, Any]]:
    if not isinstance(raw_case, dict):
        return None

    query = _optional_case_text(raw_case.get("query"))
    expected_symbol = _optional_case_text(raw_case.get("expected_symbol"))
    expected_path = _optional_case_path(raw_case.get("expected_path"))
    expected_type = _optional_case_text(raw_case.get("expected_type"))
    if not query or not any((expected_symbol, expected_path, expected_type)):
        return None

    top_k = raw_case.get("top_k")
    try:
        top_k_value = max(1, min(int(top_k), MAX_SEARCH_QUALITY_TOP_K)) if top_k is not None else None
    except (TypeError, ValueError):
        top_k_value = None

    case = {
        "query": query,
        "expected_symbol": expected_symbol,
        "expected_path": expected_path,
        "expected_type": expected_type,
        "source_path": suite_path,
        "source_index": index,
    }
    if top_k_value is not None:
        case["top_k"] = top_k_value
    return case


def _normalize_search_quality_baseline(raw_baseline: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw_baseline, dict):
        return None

    baseline: Dict[str, Any] = {}
    min_recall = _optional_baseline_float(raw_baseline.get("min_recall_at_k"))
    min_mrr = _optional_baseline_float(raw_baseline.get("min_mrr"))
    min_passed = _optional_baseline_int(raw_baseline.get("min_passed"))
    if min_recall is not None:
        baseline["min_recall_at_k"] = min_recall
    if min_mrr is not None:
        baseline["min_mrr"] = min_mrr
    if min_passed is not None:
        baseline["min_passed"] = min_passed
    return baseline or None


def _optional_baseline_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(parsed):
        return None
    return max(0.0, min(parsed, 1.0))


def _optional_baseline_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(parsed):
        return None
    return max(0, int(parsed))


def _optional_case_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return _truncate_text(text, 500) if text else None


def _optional_case_path(value: Any) -> Optional[str]:
    text = _optional_case_text(value)
    if not text:
        return None
    return _to_posix(PurePosixPath(text.replace("\\", "/")))


def _extract_route_endpoints(files: List[Dict[str, Any]], source_dir: Path) -> List[Dict[str, Any]]:
    if not source_dir.exists():
        return []

    endpoints: List[Dict[str, Any]] = []
    seen = set()
    for file in files:
        relative_path = file["path"]
        pure = PurePosixPath(relative_path)
        if pure.suffix.lower() not in ROUTE_EXTENSIONS:
            continue

        source_path = source_dir / Path(*pure.parts)
        if not source_path.exists():
            continue

        try:
            if source_path.stat().st_size > MAX_ROUTE_FILE_BYTES:
                continue
            text = source_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        suffix = pure.suffix.lower()
        if suffix == ".py":
            for endpoint in _extract_python_routes(relative_path, text):
                _append_route_endpoint(endpoints, seen, endpoint)

        if suffix in JS_ROUTE_EXTENSIONS:
            for endpoint in _extract_js_routes(relative_path, text):
                _append_route_endpoint(endpoints, seen, endpoint)

            for endpoint in _extract_nextjs_routes(relative_path, text):
                _append_route_endpoint(endpoints, seen, endpoint)

        if suffix in PHP_ROUTE_EXTENSIONS:
            for endpoint in _extract_laravel_routes(relative_path, text):
                _append_route_endpoint(endpoints, seen, endpoint)

        if suffix in RUBY_ROUTE_EXTENSIONS:
            for endpoint in _extract_rails_routes(relative_path, text):
                _append_route_endpoint(endpoints, seen, endpoint)

        if suffix in GO_ROUTE_EXTENSIONS:
            for endpoint in _extract_go_routes(relative_path, text):
                _append_route_endpoint(endpoints, seen, endpoint)

        if suffix in JVM_ROUTE_EXTENSIONS:
            for endpoint in _extract_spring_routes(relative_path, text):
                _append_route_endpoint(endpoints, seen, endpoint)

        if suffix in CSHARP_ROUTE_EXTENSIONS:
            for endpoint in _extract_aspnet_routes(relative_path, text):
                _append_route_endpoint(endpoints, seen, endpoint)

        if len(endpoints) >= 40:
            break

    return sorted(endpoints, key=lambda item: (item["source_path"], item["line"], item["method"], item["path"]))[:40]


def _extract_python_routes(source_path: str, text: str) -> List[Dict[str, Any]]:
    endpoints: List[Dict[str, Any]] = []
    decorator_pattern = re.compile(
        r"(?m)^\s*@(?!pytest\b)[\w.]+\.(get|post|put|patch|delete|options|head)\(\s*['\"]([^'\"]+)['\"]",
        re.IGNORECASE,
    )
    for match in decorator_pattern.finditer(text):
        endpoints.append(_route_endpoint(
            method=match.group(1).upper(),
            path=match.group(2),
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework="python decorator",
        ))

    route_pattern = re.compile(
        r"(?ms)^\s*@(?!pytest\b)[\w.]+\.route\(\s*['\"]([^'\"]+)['\"](?P<args>.*?)\)",
        re.IGNORECASE,
    )
    for match in route_pattern.finditer(text):
        raw_methods = re.findall(r"['\"]([A-Za-z]+)['\"]", match.group("args"))
        methods = [method.upper() for method in raw_methods if method.upper() in HTTP_METHODS]
        if not methods:
            methods = ["GET"]
        for method in methods:
            endpoints.append(_route_endpoint(
                method=method,
                path=match.group(1),
                source_path=source_path,
                line=_line_number(text, match.start()),
                framework="python route",
            ))

    endpoints.extend(_extract_django_routes(source_path, text))
    return endpoints


def _extract_django_routes(source_path: str, text: str) -> List[Dict[str, Any]]:
    """Extract Django urls.py patterns without inferring view-level HTTP methods."""
    pure = PurePosixPath(source_path)
    looks_like_django_urls = (
        pure.name.lower() == "urls.py"
        or "urlpatterns" in text
        or "django.urls" in text
        or "django.conf.urls" in text
    )
    if not looks_like_django_urls:
        return []

    endpoints: List[Dict[str, Any]] = []
    path_pattern = re.compile(
        r"(?<![\w.])path\(\s*(?:[rubf]*)['\"]([^'\"]+)['\"]",
        re.IGNORECASE,
    )
    regex_path_pattern = re.compile(
        r"(?<![\w.])(?:re_path|url)\(\s*(?:[rubf]*)['\"]([^'\"]+)['\"]",
        re.IGNORECASE,
    )

    for match in path_pattern.finditer(text):
        route_path = _normalize_django_path_pattern(match.group(1))
        endpoints.append(_route_endpoint(
            method="ANY",
            path=route_path,
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework="django",
        ))

    for match in regex_path_pattern.finditer(text):
        route_path = _normalize_django_regex_pattern(match.group(1))
        if not route_path:
            continue
        endpoints.append(_route_endpoint(
            method="ANY",
            path=route_path,
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework="django",
        ))

    return endpoints


def _normalize_django_path_pattern(pattern: str) -> str:
    route = pattern.strip()
    if not route:
        return "/"

    def replace_converter(match: re.Match[str]) -> str:
        converter = (match.group("converter") or "").lower()
        suffix = "*" if converter == "path" else ""
        return f":{match.group('name')}{suffix}"

    route = re.sub(
        r"<(?:(?P<converter>[A-Za-z_][\w]*):)?(?P<name>[A-Za-z_][\w]*)>",
        replace_converter,
        route,
    )
    return _leading_slash_route(route)


def _normalize_django_regex_pattern(pattern: str) -> Optional[str]:
    route = pattern.strip()
    if not route:
        return "/"

    route = re.sub(r"^(?:\\A|\^)+", "", route)
    route = re.sub(r"(?:\\Z|\\z|\$)+$", "", route)
    route = route.replace(r"\/", "/")
    route = re.sub(r"\(\?P<([A-Za-z_][\w]*)>[^)]*\)", r":\1", route)
    route = re.sub(r"\([^)]*\)", ":param", route)
    route = re.sub(r"\[[^\]]+\][+*]?", ":param", route)
    route = re.sub(r"\\d[+*]?", ":param", route)
    route = route.replace("\\.", ".")
    route = route.replace("\\", "")

    if any(marker in route for marker in ("(", ")", "[", "]", "|")):
        return None
    return _leading_slash_route(route)


def _leading_slash_route(route: str) -> str:
    route = route.strip()
    if not route:
        return "/"
    return route if route.startswith("/") else f"/{route}"


def _extract_laravel_routes(source_path: str, text: str) -> List[Dict[str, Any]]:
    pure = PurePosixPath(source_path)
    if "Route::" not in text and not (pure.parts and pure.parts[0].lower() == "routes"):
        return []

    endpoints: List[Dict[str, Any]] = []
    route_call_pattern = re.compile(
        r"\bRoute::(?P<method>get|post|put|patch|delete|options|any)\s*\(\s*['\"](?P<path>[^'\"]+)['\"]",
        re.IGNORECASE,
    )
    match_call_pattern = re.compile(
        r"\bRoute::match\s*\(\s*\[(?P<methods>[^\]]+)\]\s*,\s*['\"](?P<path>[^'\"]+)['\"]",
        re.IGNORECASE | re.DOTALL,
    )

    for match in route_call_pattern.finditer(text):
        method = match.group("method").upper()
        if method == "ANY":
            method = "ANY"
        endpoints.append(_route_endpoint(
            method=method,
            path=_normalize_brace_route(match.group("path")),
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework="laravel",
        ))

    for match in match_call_pattern.finditer(text):
        methods = [
            method.upper()
            for method in re.findall(r"['\"]([A-Za-z]+)['\"]", match.group("methods"))
            if method.upper() in HTTP_METHODS
        ]
        if not methods:
            methods = ["ANY"]
        for method in methods:
            endpoints.append(_route_endpoint(
                method=method,
                path=_normalize_brace_route(match.group("path")),
                source_path=source_path,
                line=_line_number(text, match.start()),
                framework="laravel",
            ))

    return endpoints


def _extract_rails_routes(source_path: str, text: str) -> List[Dict[str, Any]]:
    pure = PurePosixPath(source_path)
    if pure.as_posix().lower() != "config/routes.rb" and "Rails.application.routes.draw" not in text:
        return []

    endpoints: List[Dict[str, Any]] = []
    route_line_pattern = re.compile(
        r"(?m)^\s*(get|post|put|patch|delete|options)\s+['\"]([^'\"]+)['\"]",
        re.IGNORECASE,
    )
    match_line_pattern = re.compile(
        r"(?m)^\s*match\s+['\"]([^'\"]+)['\"].*?\bvia:\s*(\[[^\]]+\]|:\w+|['\"]\w+['\"])",
        re.IGNORECASE,
    )
    root_line_pattern = re.compile(r"(?m)^\s*root\s+['\"][^'\"]+['\"]", re.IGNORECASE)
    resources_line_pattern = re.compile(r"(?m)^\s*resources\s+:([A-Za-z_][\w]*)\b", re.IGNORECASE)

    for match in route_line_pattern.finditer(text):
        endpoints.append(_route_endpoint(
            method=match.group(1).upper(),
            path=_leading_slash_route(match.group(2)),
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework="rails",
        ))

    for match in match_line_pattern.finditer(text):
        methods = _rails_via_methods(match.group(2))
        for method in methods:
            endpoints.append(_route_endpoint(
                method=method,
                path=_leading_slash_route(match.group(1)),
                source_path=source_path,
                line=_line_number(text, match.start()),
                framework="rails",
            ))

    for match in root_line_pattern.finditer(text):
        endpoints.append(_route_endpoint(
            method="GET",
            path="/",
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework="rails",
        ))

    for match in resources_line_pattern.finditer(text):
        endpoints.append(_route_endpoint(
            method="ANY",
            path=f"/{match.group(1)}",
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework="rails",
        ))

    return endpoints


def _rails_via_methods(raw_via: str) -> List[str]:
    raw_via = raw_via.strip()
    if raw_via.lower() in {":all", "'all'", '"all"'}:
        return ["ANY"]
    methods = [
        method.upper()
        for method in re.findall(r":([A-Za-z]+)|['\"]([A-Za-z]+)['\"]", raw_via)
        for method in method
        if method and method.upper() in HTTP_METHODS
    ]
    return methods or ["ANY"]


def _extract_go_routes(source_path: str, text: str) -> List[Dict[str, Any]]:
    if not any(marker in text for marker in ("http.Handle", ".GET(", ".POST(", ".Get(", ".Post(", ".Methods(")):
        return []

    endpoints: List[Dict[str, Any]] = []
    quoted_path = r"(?P<quote>['\"`])(?P<path>/[^'\"`]*) (?P=quote)"
    quoted_path = quoted_path.replace(" ", "")

    gorilla_pattern = re.compile(
        rf"\b\w+\.HandleFunc\s*\(\s*{quoted_path}[^\n]*?\)\.Methods\s*\((?P<methods>[^)]*)\)",
        re.IGNORECASE,
    )
    for match in gorilla_pattern.finditer(text):
        methods = [
            method.upper()
            for method in re.findall(r"['\"`]([A-Za-z]+)['\"`]", match.group("methods"))
            if method.upper() in HTTP_METHODS
        ] or ["ANY"]
        for method in methods:
            endpoints.append(_route_endpoint(
                method=method,
                path=_normalize_brace_route(match.group("path")),
                source_path=source_path,
                line=_line_number(text, match.start()),
                framework="go gorilla",
            ))

    stdlib_pattern = re.compile(
        rf"\bhttp\.Handle(?:Func)?\s*\(\s*{quoted_path}",
        re.IGNORECASE,
    )
    for match in stdlib_pattern.finditer(text):
        endpoints.append(_route_endpoint(
            method="ANY",
            path=_normalize_brace_route(match.group("path")),
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework="go net/http",
        ))

    router_pattern = re.compile(
        rf"\b\w+\.(?P<method>get|post|put|patch|delete|options|head|any)\s*\(\s*{quoted_path}",
        re.IGNORECASE,
    )
    for match in router_pattern.finditer(text):
        method = match.group("method").upper()
        endpoints.append(_route_endpoint(
            method="ANY" if method == "ANY" else method,
            path=_normalize_brace_route(match.group("path")),
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework="go router",
        ))

    return endpoints


def _extract_spring_routes(source_path: str, text: str) -> List[Dict[str, Any]]:
    if "Mapping" not in text:
        return []

    endpoints: List[Dict[str, Any]] = []
    prefixes = _spring_class_prefixes(text)
    mapping_methods = {
        "get": "GET",
        "post": "POST",
        "put": "PUT",
        "patch": "PATCH",
        "delete": "DELETE",
    }
    method_mapping_pattern = re.compile(
        r"@(?P<kind>Get|Post|Put|Patch|Delete)Mapping\s*(?:\((?P<args>.*?)\))?",
        re.IGNORECASE | re.DOTALL,
    )
    request_mapping_pattern = re.compile(
        r"@RequestMapping\s*\((?P<args>.*?)\)",
        re.IGNORECASE | re.DOTALL,
    )

    for match in method_mapping_pattern.finditer(text):
        raw_path = _annotation_string_path(match.group("args") or "")
        route_path = _join_route_paths(_nearest_prefix(prefixes, match.start()), raw_path or "/")
        endpoints.append(_route_endpoint(
            method=mapping_methods[match.group("kind").lower()],
            path=route_path,
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework="spring",
        ))

    for match in request_mapping_pattern.finditer(text):
        args = match.group("args")
        methods = _spring_request_methods(args)
        if not methods:
            continue
        raw_path = _annotation_string_path(args) or "/"
        route_path = _join_route_paths(_nearest_prefix(prefixes, match.start()), raw_path)
        for method in methods:
            endpoints.append(_route_endpoint(
                method=method,
                path=route_path,
                source_path=source_path,
                line=_line_number(text, match.start()),
                framework="spring",
            ))

    return endpoints


def _spring_class_prefixes(text: str) -> List[tuple[int, str]]:
    class_pattern = re.compile(
        r"@RequestMapping\s*(?:\((?P<args>.*?)\))?\s*"
        r"(?:@\w+(?:\s*\(.*?\))?\s*)*"
        r"(?:public\s+|internal\s+|open\s+|final\s+|abstract\s+)*"
        r"(?:class|interface|record)\s+",
        re.IGNORECASE | re.DOTALL,
    )
    prefixes: List[tuple[int, str]] = []
    for match in class_pattern.finditer(text):
        route_path = _annotation_string_path(match.group("args") or "")
        if route_path:
            prefixes.append((match.start(), _normalize_brace_route(route_path)))
    return prefixes


def _spring_request_methods(args: str) -> List[str]:
    methods = [
        method.upper()
        for method in re.findall(r"\bRequestMethod\.([A-Za-z]+)\b", args)
        if method.upper() in HTTP_METHODS
    ]
    if methods:
        return sorted(set(methods))

    method_assignment = re.search(r"\bmethod\s*=\s*([A-Za-z]+)\b", args, flags=re.IGNORECASE)
    if method_assignment and method_assignment.group(1).upper() in HTTP_METHODS:
        return [method_assignment.group(1).upper()]
    return []


def _extract_aspnet_routes(source_path: str, text: str) -> List[Dict[str, Any]]:
    if "Http" not in text and ".Map" not in text:
        return []

    endpoints: List[Dict[str, Any]] = []
    prefixes = _aspnet_class_prefixes(text)
    attribute_methods = {
        "httpget": "GET",
        "httppost": "POST",
        "httpput": "PUT",
        "httppatch": "PATCH",
        "httpdelete": "DELETE",
        "httpoptions": "OPTIONS",
        "httphead": "HEAD",
    }
    attribute_pattern = re.compile(
        r"\[(?P<kind>HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|HttpOptions|HttpHead)"
        r"(?:\s*\((?P<args>[^\]]*?)\))?\]",
        re.IGNORECASE | re.DOTALL,
    )
    map_pattern = re.compile(
        r"\b\w+\.Map(?P<kind>Get|Post|Put|Patch|Delete|Methods)\s*"
        r"\(\s*(?P<quote>['\"])(?P<path>/[^'\"]*)(?P=quote)(?P<args>.*?)\)",
        re.IGNORECASE | re.DOTALL,
    )

    for match in attribute_pattern.finditer(text):
        raw_path = _annotation_string_path(match.group("args") or "")
        route_path = _join_route_paths(_nearest_prefix(prefixes, match.start()), raw_path or "/")
        endpoints.append(_route_endpoint(
            method=attribute_methods[match.group("kind").lower()],
            path=_normalize_csharp_route(route_path),
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework="aspnet",
        ))

    for match in map_pattern.finditer(text):
        methods = _aspnet_map_methods(match.group("kind"), match.group("args") or "")
        for method in methods:
            endpoints.append(_route_endpoint(
                method=method,
                path=_normalize_csharp_route(match.group("path")),
                source_path=source_path,
                line=_line_number(text, match.start()),
                framework="aspnet",
            ))

    return endpoints


def _aspnet_class_prefixes(text: str) -> List[tuple[int, str]]:
    class_pattern = re.compile(
        r"\[Route\s*\((?P<args>.*?)\)\]\s*"
        r"(?:\[[^\]]+\]\s*)*"
        r"(?:public\s+|internal\s+|sealed\s+|partial\s+|abstract\s+)*"
        r"(?:class|record)\s+",
        re.IGNORECASE | re.DOTALL,
    )
    prefixes: List[tuple[int, str]] = []
    for match in class_pattern.finditer(text):
        route_path = _annotation_string_path(match.group("args") or "")
        if route_path:
            prefixes.append((match.start(), _normalize_csharp_route(route_path)))
    return prefixes


def _aspnet_map_methods(kind: str, args: str) -> List[str]:
    kind_upper = kind.upper()
    if kind_upper == "METHODS":
        methods = [
            method.upper()
            for method in re.findall(r"['\"]([A-Za-z]+)['\"]", args)
            if method.upper() in HTTP_METHODS
        ]
        return sorted(set(methods)) or ["ANY"]
    return [kind_upper]


def _annotation_string_path(args: str) -> Optional[str]:
    match = re.search(r"['\"]([^'\"]*)['\"]", args or "")
    if not match:
        return None
    return match.group(1)


def _nearest_prefix(prefixes: List[tuple[int, str]], offset: int) -> str:
    nearest = ""
    for prefix_offset, prefix in prefixes:
        if prefix_offset <= offset:
            nearest = prefix
        else:
            break
    return nearest


def _join_route_paths(prefix: str, path: str) -> str:
    parts = []
    for part in (prefix, path):
        normalized = _normalize_brace_route(part or "")
        if normalized and normalized != "/":
            parts.append(normalized.strip("/"))
    return "/" + "/".join(parts) if parts else "/"


def _normalize_csharp_route(route: str) -> str:
    route = re.sub(r"\[([A-Za-z_][\w]*)\]", r":\1", route or "")
    return _normalize_brace_route(route)


def _normalize_brace_route(route: str) -> str:
    route = route.strip()
    route = re.sub(r"\{([A-Za-z_][\w]*)(?:\?|:[^}]*)?\}", r":\1", route)
    return _leading_slash_route(route)


def _extract_js_routes(source_path: str, text: str) -> List[Dict[str, Any]]:
    endpoints: List[Dict[str, Any]] = []
    route_call_pattern = re.compile(
        r"\b(?P<receiver>app|router|server|fastify)\.(?P<method>get|post|put|patch|delete|options|head|all)\(\s*['\"`](?P<path>[^'\"`]+)['\"`]",
        re.IGNORECASE,
    )
    for match in route_call_pattern.finditer(text):
        method = match.group("method").upper()
        if method == "ALL":
            method = "ANY"
        endpoints.append(_route_endpoint(
            method=method,
            path=match.group("path"),
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework=_js_route_call_framework(text, match.group("receiver")),
        ))
    endpoints.extend(_extract_fastify_object_routes(source_path, text))
    endpoints.extend(_extract_nestjs_routes(source_path, text))
    return endpoints


def _js_route_call_framework(text: str, receiver: str) -> str:
    lower = text.lower()
    receiver = receiver.lower()
    if "from 'hono'" in lower or 'from "hono"' in lower or "new hono" in lower:
        return "hono"
    if (
        "from '@koa/router'" in lower
        or 'from "@koa/router"' in lower
        or "from 'koa-router'" in lower
        or 'from "koa-router"' in lower
        or "require('@koa/router')" in lower
        or 'require("@koa/router")' in lower
        or "require('koa-router')" in lower
        or 'require("koa-router")' in lower
    ):
        return "koa"
    if receiver == "fastify" or "fastify(" in lower or "from 'fastify'" in lower or 'from "fastify"' in lower:
        return "fastify"
    return "express"


def _extract_fastify_object_routes(source_path: str, text: str) -> List[Dict[str, Any]]:
    lower = text.lower()
    if "fastify" not in lower:
        return []

    endpoints: List[Dict[str, Any]] = []
    route_pattern = re.compile(
        r"\b(?:fastify|server|app)\.route\s*\(\s*\{(?P<body>.*?)\}\s*\)",
        re.IGNORECASE | re.DOTALL,
    )
    for match in route_pattern.finditer(text):
        body = match.group("body")
        path_match = re.search(r"\b(?:url|path)\s*:\s*['\"`](?P<path>[^'\"`]+)['\"`]", body, re.IGNORECASE)
        if not path_match:
            continue
        methods = _js_object_route_methods(body)
        for method in methods:
            endpoints.append(_route_endpoint(
                method=method,
                path=path_match.group("path"),
                source_path=source_path,
                line=_line_number(text, match.start()),
                framework="fastify",
            ))
    return endpoints


def _js_object_route_methods(body: str) -> List[str]:
    array_match = re.search(r"\bmethod\s*:\s*\[(?P<methods>[^\]]+)\]", body, re.IGNORECASE | re.DOTALL)
    if array_match:
        methods = [
            method.upper()
            for method in re.findall(r"['\"`]([A-Za-z]+)['\"`]", array_match.group("methods"))
            if method.upper() in HTTP_METHODS
        ]
        return sorted(set(methods)) or ["ANY"]

    method_match = re.search(r"\bmethod\s*:\s*['\"`](?P<method>[A-Za-z]+)['\"`]", body, re.IGNORECASE)
    if method_match:
        method = method_match.group("method").upper()
        return [method] if method in HTTP_METHODS else ["ANY"]
    return ["ANY"]


def _extract_nestjs_routes(source_path: str, text: str) -> List[Dict[str, Any]]:
    if "@Controller" not in text:
        return []

    endpoints: List[Dict[str, Any]] = []
    prefixes = _nestjs_controller_prefixes(text)
    decorator_methods = {
        "get": "GET",
        "post": "POST",
        "put": "PUT",
        "patch": "PATCH",
        "delete": "DELETE",
        "options": "OPTIONS",
        "head": "HEAD",
        "all": "ANY",
    }
    decorator_pattern = re.compile(
        r"@(?P<kind>Get|Post|Put|Patch|Delete|Options|Head|All)\s*(?:\((?P<args>.*?)\))?",
        re.IGNORECASE | re.DOTALL,
    )
    for match in decorator_pattern.finditer(text):
        raw_path = _annotation_string_path(match.group("args") or "") or "/"
        route_path = _join_route_paths(_nearest_prefix(prefixes, match.start()), raw_path)
        endpoints.append(_route_endpoint(
            method=decorator_methods[match.group("kind").lower()],
            path=route_path,
            source_path=source_path,
            line=_line_number(text, match.start()),
            framework="nestjs",
        ))
    return endpoints


def _nestjs_controller_prefixes(text: str) -> List[tuple[int, str]]:
    controller_pattern = re.compile(
        r"@Controller\s*(?:\((?P<args>.*?)\))?\s*"
        r"(?:@\w+(?:\s*\(.*?\))?\s*)*"
        r"(?:export\s+)?(?:abstract\s+)?class\s+",
        re.IGNORECASE | re.DOTALL,
    )
    prefixes: List[tuple[int, str]] = []
    for match in controller_pattern.finditer(text):
        route_path = _annotation_string_path(match.group("args") or "") or ""
        prefixes.append((match.start(), _normalize_brace_route(route_path)))
    return prefixes


def _extract_nextjs_routes(source_path: str, text: str) -> List[Dict[str, Any]]:
    pure = PurePosixPath(source_path)
    parts = tuple(part.lower() for part in pure.parts)
    is_app_route = len(parts) >= 3 and parts[0] == "app" and parts[1] == "api" and parts[-1].startswith("route.")
    is_pages_route = len(parts) >= 3 and parts[0] == "pages" and parts[1] == "api"
    if not is_app_route and not is_pages_route:
        return []

    route_path = _nextjs_route_path(pure, is_app_route=is_app_route)
    if not route_path:
        return []

    exported_methods = {
        method.upper()
        for method in re.findall(
            r"\bexport\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b",
            text,
            flags=re.IGNORECASE,
        )
    }

    if not exported_methods and is_pages_route:
        exported_methods = {"ANY"}

    return [
        _route_endpoint(
            method=method,
            path=route_path,
            source_path=source_path,
            line=_line_number_for_export(text, method),
            framework="nextjs",
        )
        for method in sorted(exported_methods)
    ]


def _nextjs_route_path(path: PurePosixPath, is_app_route: bool) -> Optional[str]:
    if is_app_route:
        segments = list(path.parts[2:-1])
    else:
        stem_parts = list(path.with_suffix("").parts[2:])
        if stem_parts and stem_parts[-1] == "index":
            stem_parts = stem_parts[:-1]
        segments = stem_parts

    normalized = []
    for segment in segments:
        if segment.startswith("(") and segment.endswith(")"):
            continue
        if segment.startswith("[[...") and segment.endswith("]]"):
            normalized.append(f":{segment[5:-2]}*")
        elif segment.startswith("[...") and segment.endswith("]"):
            normalized.append(f":{segment[4:-1]}*")
        elif segment.startswith("[") and segment.endswith("]"):
            normalized.append(f":{segment[1:-1]}")
        else:
            normalized.append(segment)

    return "/api" + ("/" + "/".join(normalized) if normalized else "")


def _append_route_endpoint(endpoints: List[Dict[str, Any]], seen: set, endpoint: Dict[str, Any]):
    key = (endpoint["method"], endpoint["path"], endpoint["source_path"], endpoint["line"])
    if key in seen:
        return
    seen.add(key)
    endpoints.append(endpoint)


def _route_endpoint(method: str, path: str, source_path: str, line: int, framework: str) -> Dict[str, Any]:
    return {
        "method": method,
        "path": path,
        "source_path": source_path,
        "line": line,
        "framework": framework,
    }


def _line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _line_number_for_export(text: str, method: str) -> int:
    match = re.search(
        rf"\bexport\s+(?:async\s+)?(?:function|const)\s+{re.escape(method)}\b",
        text,
        flags=re.IGNORECASE,
    )
    return _line_number(text, match.start()) if match else 1


def _append_manifest(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    ecosystem: str,
    package_manager: str,
    source_path: str,
    dependency_count: int,
    dev_dependency_count: int,
    detail: str,
) -> None:
    key = (ecosystem, package_manager, source_path)
    if key in seen or len(facts["dependency_manifests"]) >= MAX_DEPENDENCY_MANIFESTS:
        return
    seen.add(key)
    facts["dependency_manifests"].append({
        "ecosystem": ecosystem,
        "package_manager": package_manager,
        "source_path": source_path,
        "dependency_count": int(dependency_count),
        "dev_dependency_count": int(dev_dependency_count),
        "detail": str(detail)[:160],
    })


def _append_command(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    category: str,
    name: str,
    command: str,
    source_path: str,
    detail: str,
) -> None:
    key = (category, name, command, source_path)
    if key in seen or len(facts["runbook_commands"]) >= MAX_RUNBOOK_COMMANDS:
        return
    seen.add(key)
    facts["runbook_commands"].append({
        "category": category,
        "name": str(name)[:80],
        "command": str(command)[:200],
        "source_path": source_path,
        "detail": str(detail)[:200],
    })


def _append_dependency(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    ecosystem: str,
    scope: str,
    source_path: str,
) -> None:
    normalized = str(name).strip()
    if not normalized:
        return

    key = (ecosystem, scope, normalized.lower(), source_path)
    if key in seen or len(facts["dependencies"]) >= MAX_DEPENDENCY_FACTS:
        return
    seen.add(key)
    facts["dependencies"].append({
        "name": normalized[:120],
        "ecosystem": ecosystem,
        "scope": scope,
        "source_path": source_path,
    })


def _append_workspace(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    path: str,
    workspace_kind: str,
    ecosystem: str,
    manager: str,
    source_path: str,
    line: int,
    detail: str,
) -> None:
    path_value = _normalize_workspace_path(path)[:240]
    kind_value = " ".join(str(workspace_kind or "").split())[:80]
    manager_value = " ".join(str(manager or "").split())[:80]
    if not path_value or not kind_value:
        return

    key = (path_value.lower(), kind_value.lower(), manager_value.lower(), source_path)
    if key in seen or len(facts["workspaces"]) >= MAX_WORKSPACE_FACTS:
        return
    seen.add(key)
    facts["workspaces"].append({
        "name": (" ".join(str(name or "").split()) or path_value)[:160],
        "path": path_value,
        "workspace_kind": kind_value,
        "ecosystem": " ".join(str(ecosystem or "").split())[:80],
        "manager": manager_value,
        "source_path": source_path,
        "line": int(line or 1),
        "detail": str(detail or "")[:240],
    })


def _append_stack_component(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    ecosystem: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:120]
    category_value = " ".join(str(category or "").split())[:80]
    ecosystem_value = " ".join(str(ecosystem or "").split())[:100]
    if not name_value or not category_value:
        return

    key = (name_value.lower(), category_value.lower(), ecosystem_value.lower(), source_path, str(source or ""))
    if key in seen or len(facts["stack_components"]) >= MAX_STACK_COMPONENT_FACTS:
        return
    seen.add(key)
    facts["stack_components"].append({
        "name": name_value,
        "category": category_value,
        "ecosystem": ecosystem_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_stack_components(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_stack_components: set,
) -> None:
    for manifest in facts.get("dependency_manifests", []):
        manager = str(manifest.get("package_manager") or "").strip()
        if manager:
            _append_stack_component(
                facts,
                seen_stack_components,
                name=manager,
                category="package manager",
                ecosystem=str(manifest.get("ecosystem") or ""),
                source_path=str(manifest.get("source_path") or ""),
                line=1,
                source="manifest",
                detail=str(manifest.get("detail") or "dependency manifest"),
            )

    for dependency in facts.get("dependencies", []):
        signal = _stack_component_from_dependency(
            str(dependency.get("name") or ""),
            str(dependency.get("ecosystem") or ""),
        )
        if signal is None:
            continue
        name, category, detail = signal
        _append_stack_component(
            facts,
            seen_stack_components,
            name=name,
            category=category,
            ecosystem=str(dependency.get("ecosystem") or ""),
            source_path=str(dependency.get("source_path") or ""),
            line=1,
            source="dependency",
            detail=detail,
        )

    for target in facts.get("deploy_targets", []):
        provider = str(target.get("provider") or "").strip()
        if provider in {"Kubernetes", "Helm", "Kustomize", "Vercel", "Netlify", "systemd", "Procfile"}:
            _append_stack_component(
                facts,
                seen_stack_components,
                name=provider,
                category="deployment",
                ecosystem="Deployment",
                source_path=str(target.get("source_path") or ""),
                line=int(target.get("line") or 1),
                source="deploy-target",
                detail=str(target.get("target_type") or target.get("detail") or "deployment target"),
            )


def _stack_component_from_dependency(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    ecosystem_value = str(ecosystem or "").lower()

    if ecosystem_value == "javascript/typescript":
        exact = {
            "react": ("React", "ui framework", "React UI dependency"),
            "next": ("Next.js", "full-stack framework", "Next.js dependency"),
            "vue": ("Vue", "ui framework", "Vue dependency"),
            "svelte": ("Svelte", "ui framework", "Svelte dependency"),
            "angular": ("Angular", "ui framework", "Angular dependency"),
            "express": ("Express", "web framework", "Express dependency"),
            "fastify": ("Fastify", "web framework", "Fastify dependency"),
            "hono": ("Hono", "web framework", "Hono dependency"),
            "koa": ("Koa", "web framework", "Koa dependency"),
            "@koa/router": ("Koa Router", "web framework", "Koa Router dependency"),
            "vite": ("Vite", "build tool", "Vite dependency"),
            "webpack": ("Webpack", "build tool", "Webpack dependency"),
            "rollup": ("Rollup", "build tool", "Rollup dependency"),
            "esbuild": ("esbuild", "build tool", "esbuild dependency"),
            "tailwindcss": ("Tailwind CSS", "styling", "Tailwind CSS dependency"),
            "prisma": ("Prisma", "data layer", "Prisma dependency"),
            "@prisma/client": ("Prisma", "data layer", "Prisma client dependency"),
            "typeorm": ("TypeORM", "data layer", "TypeORM dependency"),
            "sequelize": ("Sequelize", "data layer", "Sequelize dependency"),
            "mongoose": ("Mongoose", "data layer", "Mongoose dependency"),
            "zod": ("Zod", "validation", "Zod dependency"),
            "vitest": ("Vitest", "test tool", "Vitest dependency"),
            "jest": ("Jest", "test tool", "Jest dependency"),
            "playwright": ("Playwright", "test tool", "Playwright dependency"),
            "cypress": ("Cypress", "test tool", "Cypress dependency"),
        }
        if normalized in exact:
            return exact[normalized]
        if normalized.startswith("@nestjs/"):
            return ("NestJS", "web framework", "NestJS dependency")

    if ecosystem_value == "python":
        exact = {
            "fastapi": ("FastAPI", "web framework", "FastAPI dependency"),
            "flask": ("Flask", "web framework", "Flask dependency"),
            "django": ("Django", "web framework", "Django dependency"),
            "starlette": ("Starlette", "web framework", "Starlette dependency"),
            "sqlalchemy": ("SQLAlchemy", "data layer", "SQLAlchemy dependency"),
            "alembic": ("Alembic", "migration tool", "Alembic dependency"),
            "pydantic": ("Pydantic", "validation", "Pydantic dependency"),
            "pytest": ("pytest", "test tool", "pytest dependency"),
            "celery": ("Celery", "background jobs", "Celery dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "go":
        if "gin-gonic/gin" in normalized:
            return ("Gin", "web framework", "Gin dependency")
        if "gofiber/fiber" in normalized:
            return ("Fiber", "web framework", "Fiber dependency")
        if "gorilla/mux" in normalized:
            return ("Gorilla Mux", "router", "Gorilla Mux dependency")
        if "labstack/echo" in normalized:
            return ("Echo", "web framework", "Echo dependency")
        if "stretchr/testify" in normalized:
            return ("testify", "test tool", "testify dependency")

    if ecosystem_value == "rust":
        exact = {
            "actix-web": ("Actix Web", "web framework", "Actix Web dependency"),
            "axum": ("Axum", "web framework", "Axum dependency"),
            "rocket": ("Rocket", "web framework", "Rocket dependency"),
            "tokio": ("Tokio", "async runtime", "Tokio dependency"),
            "diesel": ("Diesel", "data layer", "Diesel dependency"),
            "sqlx": ("SQLx", "data layer", "SQLx dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "php":
        if normalized in {"laravel/framework", "laravel"}:
            return ("Laravel", "web framework", "Laravel dependency")
        if normalized.startswith("symfony/"):
            return ("Symfony", "web framework", "Symfony dependency")
        if normalized in {"phpunit/phpunit", "phpunit"}:
            return ("PHPUnit", "test tool", "PHPUnit dependency")

    if ecosystem_value == "ruby":
        exact = {
            "rails": ("Rails", "web framework", "Rails dependency"),
            "sinatra": ("Sinatra", "web framework", "Sinatra dependency"),
            "rspec": ("RSpec", "test tool", "RSpec dependency"),
            "sidekiq": ("Sidekiq", "background jobs", "Sidekiq dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value in {"java", "kotlin", "jvm"}:
        if "spring-boot" in normalized:
            return ("Spring Boot", "web framework", "Spring Boot dependency")
        if "hibernate" in normalized:
            return ("Hibernate", "data layer", "Hibernate dependency")
        if "junit" in normalized:
            return ("JUnit", "test tool", "JUnit dependency")

    return None


def _normalize_dependency_signal_name(name: str) -> str:
    normalized = str(name or "").strip().lower()
    normalized = re.split(r"\s|[<>=!~^]", normalized, maxsplit=1)[0]
    return normalized.replace("_", "-")


def _stack_category_rank(category: str) -> int:
    return {
        "full-stack framework": 0,
        "web framework": 1,
        "ui framework": 2,
        "data layer": 3,
        "migration tool": 4,
        "validation": 5,
        "background jobs": 6,
        "async runtime": 7,
        "styling": 8,
        "build tool": 9,
        "test tool": 10,
        "package manager": 11,
        "deployment": 12,
        "router": 13,
    }.get(str(category or ""), 50)


def _append_service_integration(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:120]
    category_value = " ".join(str(category or "").split())[:80]
    if not name_value or not category_value:
        return

    key = (name_value.lower(), category_value.lower(), source_path, int(line or 1), str(source or ""))
    if key in seen or len(facts["service_integrations"]) >= MAX_SERVICE_INTEGRATION_FACTS:
        return
    seen.add(key)
    facts["service_integrations"].append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_service_integrations(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_service_integrations: set,
) -> None:
    for dependency in facts.get("dependencies", []):
        signal = _service_integration_from_text(str(dependency.get("name") or ""))
        if signal is None:
            continue
        name, category, detail = signal
        _append_service_integration(
            facts,
            seen_service_integrations,
            name=name,
            category=category,
            source_path=str(dependency.get("source_path") or ""),
            line=1,
            source="dependency",
            detail=detail,
        )

    for env_var in facts.get("environment_variables", []):
        signal = _service_integration_from_text(str(env_var.get("name") or ""))
        if signal is None:
            continue
        name, category, detail = signal
        _append_service_integration(
            facts,
            seen_service_integrations,
            name=name,
            category=category,
            source_path=str(env_var.get("source_path") or ""),
            line=int(env_var.get("line") or 1),
            source="environment-name",
            detail=f"{detail}; value not stored",
        )

    for signal in facts.get("secret_signals", []):
        integration = _service_integration_from_text(str(signal.get("name") or ""))
        if integration is None:
            continue
        name, category, detail = integration
        _append_service_integration(
            facts,
            seen_service_integrations,
            name=name,
            category=category,
            source_path=str(signal.get("source_path") or ""),
            line=int(signal.get("line") or 1),
            source="redacted-secret-name",
            detail=f"{detail}; secret value redacted",
        )

    for service in facts.get("container_services", []):
        text = " ".join(str(service.get(key) or "") for key in ("name", "image", "build", "detail"))
        signal = _service_integration_from_text(text)
        if signal is None:
            continue
        name, category, detail = signal
        _append_service_integration(
            facts,
            seen_service_integrations,
            name=name,
            category=category,
            source_path=str(service.get("source_path") or ""),
            line=int(service.get("line") or 1),
            source="container-service",
            detail=f"{detail}; {service.get('image') or service.get('name') or 'Compose service'}",
        )


def _service_integration_from_text(text: str) -> Optional[tuple[str, str, str]]:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return None
    cleaned = normalized.replace("_", "-").replace(".", "-").replace("/", "-")

    patterns = [
        (("stripe",), ("Stripe", "payment provider", "Stripe integration signal")),
        (("paypal", "braintree"), ("PayPal", "payment provider", "PayPal integration signal")),
        (("sentry",), ("Sentry", "observability", "Sentry integration signal")),
        (("datadog",), ("Datadog", "observability", "Datadog integration signal")),
        (("newrelic", "new-relic"), ("New Relic", "observability", "New Relic integration signal")),
        (("openai",), ("OpenAI", "ai provider", "OpenAI integration signal")),
        (("anthropic",), ("Anthropic", "ai provider", "Anthropic integration signal")),
        (("twilio",), ("Twilio", "messaging", "Twilio integration signal")),
        (("sendgrid",), ("SendGrid", "email provider", "SendGrid integration signal")),
        (("mailgun",), ("Mailgun", "email provider", "Mailgun integration signal")),
        (("resend",), ("Resend", "email provider", "Resend integration signal")),
        (("smtp", "nodemailer"), ("SMTP", "email provider", "SMTP/email integration signal")),
        (("aws", "amazonaws", "s3-bucket", "s3bucket"), ("AWS", "cloud provider", "AWS integration signal")),
        (("google-cloud", "gcp", "google-application-credentials"), ("Google Cloud", "cloud provider", "Google Cloud integration signal")),
        (("azure",), ("Azure", "cloud provider", "Azure integration signal")),
        (("postgres", "postgresql", "pgdatabase", "pg-host"), ("PostgreSQL", "database", "PostgreSQL integration signal")),
        (("database-url",), ("Database", "database", "Database URL integration signal")),
        (("mysql", "mariadb"), ("MySQL", "database", "MySQL/MariaDB integration signal")),
        (("mongodb", "mongo"), ("MongoDB", "database", "MongoDB integration signal")),
        (("redis",), ("Redis", "cache", "Redis integration signal")),
        (("rabbitmq", "amqp"), ("RabbitMQ", "queue", "RabbitMQ integration signal")),
        (("kafka",), ("Kafka", "queue", "Kafka integration signal")),
        (("nats",), ("NATS", "queue", "NATS integration signal")),
        (("elasticsearch", "elastic-search"), ("Elasticsearch", "search", "Elasticsearch integration signal")),
        (("opensearch", "open-search"), ("OpenSearch", "search", "OpenSearch integration signal")),
        (("meilisearch", "meili-search"), ("Meilisearch", "search", "Meilisearch integration signal")),
        (("auth0",), ("Auth0", "identity provider", "Auth0 integration signal")),
        (("clerk",), ("Clerk", "identity provider", "Clerk integration signal")),
        (("firebase",), ("Firebase", "cloud provider", "Firebase integration signal")),
        (("supabase",), ("Supabase", "backend platform", "Supabase integration signal")),
    ]
    for needles, result in patterns:
        if any(needle in cleaned for needle in needles):
            return result
    return None


def _service_integration_category_rank(category: str) -> int:
    return {
        "payment provider": 0,
        "observability": 1,
        "ai provider": 2,
        "email provider": 3,
        "messaging": 4,
        "identity provider": 5,
        "cache": 6,
        "database": 7,
        "search": 8,
        "queue": 9,
        "cloud provider": 10,
        "backend platform": 11,
    }.get(str(category or ""), 50)


def _append_graphql_surface(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:140]
    category_value = " ".join(str(category or "").split())[:80]
    if not name_value or not category_value:
        return

    line_value = int(line or 1)
    key = (name_value.lower(), category_value.lower(), source_path, line_value, str(source or ""))
    if key in seen or len(facts["graphql_surfaces"]) >= MAX_GRAPHQL_SURFACE_FACTS:
        return
    seen.add(key)
    facts["graphql_surfaces"].append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_graphql_surfaces(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_graphql_surfaces: set,
) -> None:
    for dependency in facts.get("dependencies", []):
        signal = _graphql_surface_from_dependency(
            str(dependency.get("name") or ""),
            str(dependency.get("ecosystem") or ""),
        )
        if signal is None:
            continue
        name, category, detail = signal
        _append_graphql_surface(
            facts,
            seen_graphql_surfaces,
            name=name,
            category=category,
            source_path=str(dependency.get("source_path") or ""),
            line=1,
            source="dependency",
            detail=detail,
        )

    for env_var in facts.get("environment_variables", []):
        signal = _graphql_surface_from_text(str(env_var.get("name") or ""))
        if signal is None:
            continue
        name, category, detail = signal
        _append_graphql_surface(
            facts,
            seen_graphql_surfaces,
            name=name,
            category=category,
            source_path=str(env_var.get("source_path") or ""),
            line=int(env_var.get("line") or 1),
            source="environment-name",
            detail=f"{detail}; value not stored",
        )

    for signal in facts.get("secret_signals", []):
        surface = _graphql_surface_from_text(str(signal.get("name") or ""))
        if surface is None:
            continue
        name, category, detail = surface
        _append_graphql_surface(
            facts,
            seen_graphql_surfaces,
            name=name,
            category=category,
            source_path=str(signal.get("source_path") or ""),
            line=int(signal.get("line") or 1),
            source="redacted-secret-name",
            detail=f"{detail}; secret value redacted",
        )

    for integration in facts.get("service_integrations", []):
        text = " ".join(str(integration.get(key) or "") for key in ("name", "category", "detail"))
        surface = _graphql_surface_from_text(text)
        if surface is None:
            continue
        name, category, detail = surface
        _append_graphql_surface(
            facts,
            seen_graphql_surfaces,
            name=name,
            category=category,
            source_path=str(integration.get("source_path") or ""),
            line=int(integration.get("line") or 1),
            source="service-integration",
            detail=detail,
        )


def _graphql_surface_from_dependency(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    ecosystem_value = str(ecosystem or "").lower()

    exact = {
        "graphql": ("GraphQL", "schema", "GraphQL dependency"),
        "@apollo/server": ("Apollo Server", "server", "Apollo GraphQL server dependency"),
        "apollo-server": ("Apollo Server", "server", "Apollo GraphQL server dependency"),
        "apollo-server-express": ("Apollo Server", "server", "Apollo Express GraphQL dependency"),
        "@apollo/client": ("Apollo Client", "client", "Apollo GraphQL client dependency"),
        "graphql-yoga": ("GraphQL Yoga", "server", "GraphQL Yoga server dependency"),
        "graphql-request": ("GraphQL request", "client", "GraphQL request client dependency"),
        "urql": ("urql", "client", "urql GraphQL client dependency"),
        "relay-runtime": ("Relay", "client", "Relay GraphQL client dependency"),
        "mercurius": ("Mercurius", "server", "Mercurius GraphQL server dependency"),
        "type-graphql": ("TypeGraphQL", "schema", "TypeGraphQL schema dependency"),
        "@nestjs/graphql": ("NestJS GraphQL", "server", "NestJS GraphQL dependency"),
        "nexus": ("Nexus", "schema", "Nexus GraphQL schema dependency"),
        "graphene": ("Graphene", "server", "Graphene GraphQL dependency"),
        "strawberry-graphql": ("Strawberry GraphQL", "server", "Strawberry GraphQL dependency"),
        "ariadne": ("Ariadne", "server", "Ariadne GraphQL dependency"),
        "gql": ("gql", "client", "Python GraphQL client dependency"),
        "graphql-core": ("GraphQL", "schema", "Python GraphQL core dependency"),
        "async-graphql": ("async-graphql", "server", "Rust async-graphql dependency"),
        "juniper": ("Juniper", "server", "Rust Juniper GraphQL dependency"),
        "hotchocolate": ("Hot Chocolate", "server", ".NET Hot Chocolate GraphQL dependency"),
        "graphql.net": ("GraphQL.NET", "server", ".NET GraphQL dependency"),
    }
    if normalized in exact:
        return exact[normalized]

    if ecosystem_value == "go":
        if "99designs/gqlgen" in normalized:
            return ("gqlgen", "server", "Go gqlgen GraphQL dependency")
        if "graph-gophers/graphql-go" in normalized:
            return ("graphql-go", "server", "Go GraphQL dependency")
        if "machinebox/graphql" in normalized:
            return ("machinebox GraphQL", "client", "Go GraphQL client dependency")
    if ecosystem_value in {"java", "kotlin", "jvm"}:
        if "graphql-java" in normalized:
            return ("GraphQL Java", "server", "JVM GraphQL dependency")
        if "spring-graphql" in normalized:
            return ("Spring GraphQL", "server", "Spring GraphQL dependency")
    if ecosystem_value == "php":
        if "webonyx/graphql-php" in normalized:
            return ("graphql-php", "server", "PHP GraphQL dependency")
        if "rebing/graphql-laravel" in normalized:
            return ("Laravel GraphQL", "server", "Laravel GraphQL dependency")
    if ecosystem_value == "ruby" and normalized == "graphql":
        return ("GraphQL Ruby", "server", "Ruby GraphQL dependency")

    return _graphql_surface_from_text(normalized)


def _graphql_surface_from_text(text: str) -> Optional[tuple[str, str, str]]:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return None
    cleaned = normalized.replace("_", "-").replace(".", "-").replace("/", "-")

    patterns = [
        (("apollo", "apollo-graph"), ("Apollo GraphQL", "server", "Apollo GraphQL signal")),
        (("graphql-endpoint", "graphql-url", "graphql-uri", "graphql-api", "graph-ref", "apollo-key", "apollo-graph-ref"), ("GraphQL", "endpoint", "GraphQL endpoint/config signal")),
        (("graphql", "gql"), ("GraphQL", "schema", "GraphQL signal")),
    ]
    for needles, result in patterns:
        if any(needle in cleaned for needle in needles):
            return result
    return None


def _sort_graphql_surfaces(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (_graphql_surface_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_GRAPHQL_SURFACE_FACTS]


def _graphql_surface_category_rank(category: str) -> int:
    return {
        "schema": 0,
        "server": 1,
        "resolver": 2,
        "query operation": 3,
        "mutation operation": 4,
        "subscription operation": 5,
        "client": 6,
        "endpoint": 7,
        "federation": 8,
    }.get(str(category or ""), 50)


def _is_graphql_surface_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    if suffix in {".graphql", ".gql"}:
        return True
    if any(token in name for token in ("graphql", "gql", "apollo", "resolver", "resolvers", "schema")):
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".graphql",
            ".gql",
            ".json",
            ".yml",
            ".yaml",
        }
    parts = {part.lower() for part in relative_path.parts}
    if parts & {"graphql", "gql", "schema", "schemas", "resolvers", "resolver"}:
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".graphql",
            ".gql",
        }
    if suffix in {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".kt", ".cs", ".rb", ".php", ".go", ".rs"}:
        return relative_path.parts and relative_path.parts[0].lower() in {"src", "app", "lib", "server", "api", "packages"}
    return False


def _extract_graphql_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_graphql_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        for name, category, source, detail in _graphql_surfaces_from_line(line, source_path):
            _append_graphql_surface(
                facts,
                seen_graphql_surfaces,
                name=name,
                category=category,
                source_path=source_path,
                line=line_number,
                source=source,
                detail=detail,
            )


def _graphql_surfaces_from_line(line: str, source_path: str) -> List[tuple[str, str, str, str]]:
    signals: List[tuple[str, str, str, str]] = []
    lowered = line.lower()
    path_lower = source_path.lower()
    suffix = PurePosixPath(source_path).suffix.lower()
    graphql_path = suffix in {".graphql", ".gql"} or any(token in path_lower for token in ("graphql", "gql", "resolver", "schema", "apollo"))

    if graphql_path:
        if re.search(r"^\s*type\s+(Query|Mutation|Subscription)\b", line):
            signals.append(("GraphQL root type", "schema", "code-signal", "GraphQL root operation type"))
        elif re.search(r"^\s*(type|input|interface|enum|union|scalar)\s+[A-Za-z_][A-Za-z0-9_]*\b", line):
            signals.append(("GraphQL type", "schema", "code-signal", "GraphQL schema type definition"))
        if re.search(r"^\s*query\s+[A-Za-z_][A-Za-z0-9_]*\b", line):
            signals.append(("GraphQL query", "query operation", "code-signal", "GraphQL query operation"))
        if re.search(r"^\s*mutation\s+[A-Za-z_][A-Za-z0-9_]*\b", line):
            signals.append(("GraphQL mutation", "mutation operation", "code-signal", "GraphQL mutation operation"))
        if re.search(r"^\s*subscription\s+[A-Za-z_][A-Za-z0-9_]*\b", line):
            signals.append(("GraphQL subscription", "subscription operation", "code-signal", "GraphQL subscription operation"))

    if re.search(r"\bnew\s+ApolloServer\s*\(|\bApolloServer\s*\(|\bcreateYoga\s*\(|\bmercurius\s*\(", line):
        signals.append(("Apollo GraphQL", "server", "code-signal", "GraphQL server setup signal"))
    if re.search(r"\bmakeExecutableSchema\s*\(|\bbuildSchema\s*\(|\btypeDefs\b|\bgql`", line):
        signals.append(("GraphQL schema", "schema", "code-signal", "GraphQL schema document/setup signal"))
    if re.search(r"\bresolvers?\b|@Resolver\b|GraphQLResolver\b|\bQueryType\s*\(|\bMutationType\s*\(", line) and ("graphql" in lowered or graphql_path):
        signals.append(("GraphQL resolver", "resolver", "code-signal", "GraphQL resolver signal"))
    if re.search(r"\buseQuery\s*\(|\buseMutation\s*\(|\bgraphqlRequest\s*\(|\bGraphQLClient\s*\(|\brequest\s*\(", line) and ("graphql" in lowered or "gql" in lowered or graphql_path):
        signals.append(("GraphQL client", "client", "code-signal", "GraphQL client call signal"))
    if re.search(r"\bApolloGateway\b|\bbuildSubgraphSchema\b|\bfederation\b", line) and ("graphql" in lowered or "apollo" in lowered):
        signals.append(("GraphQL federation", "federation", "code-signal", "GraphQL federation signal"))
    if re.search(r"\bgraphene\.ObjectType\b|\bstrawberry\.type\b|\bariadne\b|\bGraphQLObjectType\b", line):
        signals.append(("GraphQL schema", "schema", "code-signal", "GraphQL schema type signal"))

    config_signal = _graphql_surface_from_text(line)
    if config_signal is not None and graphql_path:
        name, category, detail = config_signal
        signals.append((name, category, "config-signal", detail))

    deduped: List[tuple[str, str, str, str]] = []
    seen = set()
    for item in signals:
        key = (item[0].lower(), item[1].lower(), item[2])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _append_message_bus(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:140]
    category_value = " ".join(str(category or "").split())[:80]
    if not name_value or not category_value:
        return

    line_value = int(line or 1)
    key = (name_value.lower(), category_value.lower(), source_path, line_value, str(source or ""))
    if key in seen or len(facts["message_buses"]) >= MAX_MESSAGE_BUS_FACTS:
        return
    seen.add(key)
    facts["message_buses"].append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_message_buses(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_message_buses: set,
) -> None:
    for dependency in facts.get("dependencies", []):
        signal = _message_bus_from_dependency(
            str(dependency.get("name") or ""),
            str(dependency.get("ecosystem") or ""),
        )
        if signal is None:
            continue
        name, category, detail = signal
        _append_message_bus(
            facts,
            seen_message_buses,
            name=name,
            category=category,
            source_path=str(dependency.get("source_path") or ""),
            line=1,
            source="dependency",
            detail=detail,
        )

    for env_var in facts.get("environment_variables", []):
        signal = _message_bus_from_text(str(env_var.get("name") or ""))
        if signal is None:
            continue
        name, category, detail = signal
        _append_message_bus(
            facts,
            seen_message_buses,
            name=name,
            category=category,
            source_path=str(env_var.get("source_path") or ""),
            line=int(env_var.get("line") or 1),
            source="environment-name",
            detail=f"{detail}; value not stored",
        )

    for signal in facts.get("secret_signals", []):
        bus = _message_bus_from_text(str(signal.get("name") or ""))
        if bus is None:
            continue
        name, category, detail = bus
        _append_message_bus(
            facts,
            seen_message_buses,
            name=name,
            category=category,
            source_path=str(signal.get("source_path") or ""),
            line=int(signal.get("line") or 1),
            source="redacted-secret-name",
            detail=f"{detail}; secret value redacted",
        )

    for integration in facts.get("service_integrations", []):
        text = " ".join(str(integration.get(key) or "") for key in ("name", "category", "detail"))
        bus = _message_bus_from_text(text)
        if bus is None and str(integration.get("category") or "") == "queue":
            bus = (
                str(integration.get("name") or "Message broker"),
                "message broker",
                str(integration.get("detail") or "message-broker integration signal"),
            )
        if bus is None:
            continue
        name, category, detail = bus
        _append_message_bus(
            facts,
            seen_message_buses,
            name=name,
            category=category,
            source_path=str(integration.get("source_path") or ""),
            line=int(integration.get("line") or 1),
            source="service-integration",
            detail=detail,
        )

    for service in facts.get("container_services", []):
        text = " ".join(str(service.get(key) or "") for key in ("name", "image", "command", "detail"))
        bus = _message_bus_from_text(text)
        if bus is None:
            continue
        name, category, detail = bus
        _append_message_bus(
            facts,
            seen_message_buses,
            name=name,
            category=category,
            source_path=str(service.get("source_path") or ""),
            line=int(service.get("line") or 1),
            source="container-service",
            detail=f"{detail}; {service.get('image') or service.get('name') or 'Compose service'}",
        )


def _message_bus_from_dependency(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    ecosystem_value = str(ecosystem or "").lower()

    exact = {
        "kafkajs": ("Kafka", "event streaming", "KafkaJS dependency"),
        "kafka-node": ("Kafka", "event streaming", "Kafka Node dependency"),
        "node-rdkafka": ("Kafka", "event streaming", "Node rdkafka dependency"),
        "@confluentinc/kafka-javascript": ("Kafka", "event streaming", "Confluent Kafka JavaScript dependency"),
        "confluent-kafka": ("Kafka", "event streaming", "Confluent Kafka dependency"),
        "kafka-python": ("Kafka", "event streaming", "Kafka Python dependency"),
        "aiokafka": ("Kafka", "event streaming", "aiokafka dependency"),
        "amqplib": ("RabbitMQ", "message broker", "AMQP/RabbitMQ dependency"),
        "amqp-connection-manager": ("RabbitMQ", "message broker", "AMQP connection dependency"),
        "pika": ("RabbitMQ", "message broker", "Pika/RabbitMQ dependency"),
        "kombu": ("AMQP", "message broker", "Kombu AMQP dependency"),
        "nats": ("NATS", "pub/sub", "NATS dependency"),
        "nats-py": ("NATS", "pub/sub", "NATS Python dependency"),
        "mqtt": ("MQTT", "mqtt broker", "MQTT dependency"),
        "paho-mqtt": ("MQTT", "mqtt broker", "Paho MQTT dependency"),
        "@aws-sdk/client-sqs": ("Amazon SQS", "message queue", "AWS SQS client dependency"),
        "aws-sdk-sqs": ("Amazon SQS", "message queue", "AWS SQS client dependency"),
        "@aws-sdk/client-sns": ("Amazon SNS", "pub/sub", "AWS SNS client dependency"),
        "aws-sdk-sns": ("Amazon SNS", "pub/sub", "AWS SNS client dependency"),
        "@aws-sdk/client-eventbridge": ("EventBridge", "event bus", "AWS EventBridge client dependency"),
        "aws-sdk-eventbridge": ("EventBridge", "event bus", "AWS EventBridge client dependency"),
        "@google-cloud/pubsub": ("Google Pub/Sub", "pub/sub", "Google Pub/Sub dependency"),
        "google-cloud-pubsub": ("Google Pub/Sub", "pub/sub", "Google Pub/Sub dependency"),
        "@azure/service-bus": ("Azure Service Bus", "message queue", "Azure Service Bus dependency"),
        "azure-servicebus": ("Azure Service Bus", "message queue", "Azure Service Bus dependency"),
        "@azure/event-hubs": ("Azure Event Hubs", "event streaming", "Azure Event Hubs dependency"),
        "azure-eventhub": ("Azure Event Hubs", "event streaming", "Azure Event Hubs dependency"),
    }
    if normalized in exact:
        return exact[normalized]

    if ecosystem_value == "ruby":
        if normalized in {"ruby-kafka", "racecar", "waterdrop"}:
            return ("Kafka", "event streaming", "Ruby Kafka dependency")
        if normalized in {"bunny", "sneakers"}:
            return ("RabbitMQ", "message broker", "Ruby RabbitMQ dependency")
    if ecosystem_value == "php":
        if "php-amqplib" in normalized:
            return ("RabbitMQ", "message broker", "PHP AMQP dependency")
        if normalized.startswith("enqueue/"):
            return ("Message broker", "message broker", "PHP enqueue dependency")
    if ecosystem_value == "go":
        if "segmentio/kafka-go" in normalized or "confluent-kafka-go" in normalized or "sarama" in normalized:
            return ("Kafka", "event streaming", "Go Kafka dependency")
        if "amqp091-go" in normalized or "streadway/amqp" in normalized:
            return ("RabbitMQ", "message broker", "Go AMQP dependency")
        if "nats-io/nats.go" in normalized:
            return ("NATS", "pub/sub", "Go NATS dependency")
        if "paho.mqtt.golang" in normalized:
            return ("MQTT", "mqtt broker", "Go MQTT dependency")
        if "service/sqs" in normalized:
            return ("Amazon SQS", "message queue", "Go SQS dependency")
        if "service/sns" in normalized:
            return ("Amazon SNS", "pub/sub", "Go SNS dependency")
        if "service/eventbridge" in normalized:
            return ("EventBridge", "event bus", "Go EventBridge dependency")
        if "google-cloud-go/pubsub" in normalized:
            return ("Google Pub/Sub", "pub/sub", "Go Pub/Sub dependency")
    if ecosystem_value == "rust":
        if normalized in {"rdkafka", "kafka"}:
            return ("Kafka", "event streaming", "Rust Kafka dependency")
        if normalized == "lapin":
            return ("RabbitMQ", "message broker", "Rust AMQP dependency")
        if normalized == "async-nats":
            return ("NATS", "pub/sub", "Rust NATS dependency")
        if normalized == "rumqttc":
            return ("MQTT", "mqtt broker", "Rust MQTT dependency")
        if normalized == "aws-sdk-sqs":
            return ("Amazon SQS", "message queue", "Rust SQS dependency")
        if normalized == "aws-sdk-sns":
            return ("Amazon SNS", "pub/sub", "Rust SNS dependency")
        if normalized == "aws-sdk-eventbridge":
            return ("EventBridge", "event bus", "Rust EventBridge dependency")
    if ecosystem_value in {"java", "kotlin", "jvm"}:
        if "kafka-clients" in normalized or "spring-kafka" in normalized:
            return ("Kafka", "event streaming", "JVM Kafka dependency")
        if "amqp-client" in normalized or "spring-rabbit" in normalized:
            return ("RabbitMQ", "message broker", "JVM RabbitMQ dependency")
        if "servicebus" in normalized:
            return ("Azure Service Bus", "message queue", "JVM Service Bus dependency")
    if ecosystem_value in {"c#", ".net", "dotnet"}:
        if "confluent.kafka" in normalized:
            return ("Kafka", "event streaming", ".NET Kafka dependency")
        if "rabbitmq.client" in normalized:
            return ("RabbitMQ", "message broker", ".NET RabbitMQ dependency")
        if "nats.net" in normalized:
            return ("NATS", "pub/sub", ".NET NATS dependency")
        if "mqttnet" in normalized:
            return ("MQTT", "mqtt broker", ".NET MQTT dependency")
        if "azure.messaging.servicebus" in normalized:
            return ("Azure Service Bus", "message queue", ".NET Service Bus dependency")
        if "azure.messaging.eventhubs" in normalized:
            return ("Azure Event Hubs", "event streaming", ".NET Event Hubs dependency")
        if "awssdk.sqs" in normalized:
            return ("Amazon SQS", "message queue", ".NET SQS dependency")
        if "awssdk.sns" in normalized:
            return ("Amazon SNS", "pub/sub", ".NET SNS dependency")
        if "awssdk.eventbridge" in normalized:
            return ("EventBridge", "event bus", ".NET EventBridge dependency")

    return _message_bus_from_text(normalized)


def _message_bus_from_text(text: str) -> Optional[tuple[str, str, str]]:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return None
    cleaned = normalized.replace("_", "-").replace(".", "-").replace("/", "-")

    patterns = [
        (("kafka", "kafka-broker", "kafka-bootstrap", "kafka-topic"), ("Kafka", "event streaming", "Kafka broker/topic signal")),
        (("rabbitmq", "rabbit-mq", "amqp-url", "amqp-uri", "amqp-host"), ("RabbitMQ", "message broker", "RabbitMQ/AMQP signal")),
        (("nats", "nats-url", "nats-server"), ("NATS", "pub/sub", "NATS signal")),
        (("sqs-queue", "sqs-url", "sqs-queue-url", "aws-sqs"), ("Amazon SQS", "message queue", "Amazon SQS queue signal")),
        (("sns-topic", "sns-topic-arn", "aws-sns"), ("Amazon SNS", "pub/sub", "Amazon SNS topic signal")),
        (("eventbridge", "event-bridge"), ("EventBridge", "event bus", "AWS EventBridge signal")),
        (("pubsub", "pub-sub", "pubsub-topic", "google-pubsub"), ("Google Pub/Sub", "pub/sub", "Google Pub/Sub signal")),
        (("service-bus", "servicebus"), ("Azure Service Bus", "message queue", "Azure Service Bus signal")),
        (("event-hub", "eventhub", "event-hubs", "eventhubs"), ("Azure Event Hubs", "event streaming", "Azure Event Hubs signal")),
        (("mqtt", "mqtt-broker"), ("MQTT", "mqtt broker", "MQTT broker/topic signal")),
    ]
    for needles, result in patterns:
        if any(needle in cleaned for needle in needles):
            return result
    return None


def _sort_message_buses(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (_message_bus_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_MESSAGE_BUS_FACTS]


def _message_bus_category_rank(category: str) -> int:
    return {
        "event streaming": 0,
        "message broker": 1,
        "message queue": 2,
        "pub/sub": 3,
        "event bus": 4,
        "mqtt broker": 5,
        "producer": 6,
        "consumer": 7,
        "publisher": 8,
        "subscriber": 9,
    }.get(str(category or ""), 50)


def _is_message_bus_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    if name in {
        ".env.example",
        ".env.sample",
        "events.py",
        "events.ts",
        "events.js",
        "messaging.py",
        "messaging.ts",
        "messaging.js",
        "queue.py",
        "queue.ts",
        "queue.js",
        "broker.py",
        "broker.ts",
        "broker.js",
    }:
        return True
    if any(token in name for token in ("kafka", "rabbit", "amqp", "nats", "pubsub", "pub-sub", "sqs", "sns", "eventbridge", "event-bridge", "servicebus", "service-bus", "eventhub", "event-hub", "mqtt", "message", "messaging", "event", "events", "broker", "topic")):
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
            ".ini",
        }
    parts = {part.lower() for part in relative_path.parts}
    if parts & {"events", "event", "messaging", "messages", "message", "broker", "brokers", "pubsub", "queues", "queue", "topics", "topic"}:
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
            ".ini",
        }
    if suffix in {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".kt", ".cs", ".rb", ".php", ".go", ".rs"}:
        return relative_path.parts and relative_path.parts[0].lower() in {"src", "app", "lib", "server", "api", "packages", "workers"}
    if suffix in {".yml", ".yaml", ".json", ".toml", ".xml", ".properties", ".ini"}:
        return len(relative_path.parts) <= 3 and any(token in name for token in ("kafka", "rabbit", "amqp", "nats", "pubsub", "sqs", "sns", "event", "mqtt", "queue", "topic"))
    return False


def _extract_message_buses(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_message_buses: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        for name, category, source, detail in _message_buses_from_line(line, source_path):
            _append_message_bus(
                facts,
                seen_message_buses,
                name=name,
                category=category,
                source_path=source_path,
                line=line_number,
                source=source,
                detail=detail,
            )


def _message_buses_from_line(line: str, source_path: str) -> List[tuple[str, str, str, str]]:
    signals: List[tuple[str, str, str, str]] = []
    lowered = line.lower()
    path_lower = source_path.lower()
    bus_path = any(token in path_lower for token in ("env", "config", "event", "message", "broker", "queue", "topic", "kafka", "rabbit", "amqp", "nats", "pubsub", "sqs", "sns", "mqtt"))

    config_signal = _message_bus_from_text(line)
    if config_signal is not None and bus_path:
        name, category, detail = config_signal
        signals.append((name, category, "config-signal", detail))

    if re.search(r"\bnew\s+Kafka\s*\(|\bKafkaProducer\b|\bKafkaConsumer\b|\bconfluent_kafka\b", line):
        signals.append(("Kafka", "event streaming", "code-signal", "Kafka client signal"))
    if re.search(r"\bproducer\.send\s*\(|\bproduce\s*\(", line) and ("kafka" in lowered or "topic" in lowered or "producer" in path_lower):
        signals.append(("Kafka producer", "producer", "code-signal", "Kafka produce/send signal"))
    if re.search(r"\bconsumer\.subscribe\s*\(|\bconsumer\.run\s*\(|\bsubscribe\s*\(", line) and ("kafka" in lowered or "topic" in lowered or "consumer" in path_lower):
        signals.append(("Kafka consumer", "consumer", "code-signal", "Kafka consume/subscribe signal"))
    if re.search(r"\bamqp\.connect\s*\(|\bpika\.BlockingConnection\b|\bConnectionFactory\b", line):
        signals.append(("RabbitMQ", "message broker", "code-signal", "RabbitMQ/AMQP connection signal"))
    if re.search(r"\bchannel\.assertQueue\s*\(|\bqueue_declare\s*\(|\bbasic_publish\s*\(", line):
        signals.append(("RabbitMQ publisher", "publisher", "code-signal", "RabbitMQ publish/queue declaration signal"))
    if re.search(r"\bchannel\.consume\s*\(|\bbasic_consume\s*\(", line):
        signals.append(("RabbitMQ consumer", "consumer", "code-signal", "RabbitMQ consume signal"))
    if re.search(r"\bnats\.connect\s*\(|\bconnect\s*\(", line) and ("nats" in lowered or "nats" in path_lower):
        signals.append(("NATS", "pub/sub", "code-signal", "NATS connection signal"))
    if re.search(r"\b(?:nc|nats|client)\.publish\s*\(", line) and ("nats" in lowered or "subject" in lowered or "nats" in path_lower):
        signals.append(("NATS publisher", "publisher", "code-signal", "NATS publish signal"))
    if re.search(r"\b(?:nc|nats|client)\.subscribe\s*\(", line) and ("nats" in lowered or "subject" in lowered or "nats" in path_lower):
        signals.append(("NATS subscriber", "subscriber", "code-signal", "NATS subscribe signal"))
    if re.search(r"\bSendMessageCommand\b|\bsqs\.send_message\s*\(|\bSendMessageRequest\b", line):
        signals.append(("Amazon SQS producer", "producer", "code-signal", "SQS send-message signal"))
    if re.search(r"\bReceiveMessageCommand\b|\bsqs\.receive_message\s*\(|\bReceiveMessageRequest\b", line):
        signals.append(("Amazon SQS consumer", "consumer", "code-signal", "SQS receive-message signal"))
    if re.search(r"\bPublishCommand\b|\bsns\.publish\s*\(", line) and ("sns" in lowered or "topic" in lowered):
        signals.append(("Amazon SNS publisher", "publisher", "code-signal", "SNS publish signal"))
    if re.search(r"\bPutEventsCommand\b|\beventbridge\.put_events\s*\(|\bputEvents\s*\(", line):
        signals.append(("EventBridge publisher", "publisher", "code-signal", "EventBridge put-events signal"))
    if re.search(r"\bPubSub\s*\(|\bpubsub\.topic\s*\(|\bpublishMessage\s*\(", line) and ("pubsub" in lowered or "topic" in lowered or "pubsub" in path_lower):
        signals.append(("Google Pub/Sub publisher", "publisher", "code-signal", "Pub/Sub publish signal"))
    if re.search(r"\bsubscription\s*\(|\bcreateSubscription\s*\(", line) and ("pubsub" in lowered or "pubsub" in path_lower):
        signals.append(("Google Pub/Sub subscriber", "subscriber", "code-signal", "Pub/Sub subscription signal"))
    if re.search(r"\bServiceBusClient\b|\bserviceBusClient\b", line):
        signals.append(("Azure Service Bus", "message queue", "code-signal", "Azure Service Bus client signal"))
    if re.search(r"\bsendMessages\s*\(|\bServiceBusMessage\b", line):
        signals.append(("Azure Service Bus producer", "producer", "code-signal", "Azure Service Bus send signal"))
    if re.search(r"\bsubscribe\s*\(|\bprocessMessage\b", line) and ("servicebus" in lowered or "service-bus" in path_lower):
        signals.append(("Azure Service Bus consumer", "consumer", "code-signal", "Azure Service Bus receive signal"))
    if re.search(r"\bEventHubProducerClient\b|\bEventDataBatch\b", line):
        signals.append(("Azure Event Hubs producer", "producer", "code-signal", "Azure Event Hubs publish signal"))
    if re.search(r"\bmqtt\.connect\s*\(|\bMqttClient\b", line):
        signals.append(("MQTT", "mqtt broker", "code-signal", "MQTT client signal"))
    if re.search(r"\bclient\.publish\s*\(", line) and ("mqtt" in lowered or "mqtt" in path_lower):
        signals.append(("MQTT publisher", "publisher", "code-signal", "MQTT publish signal"))
    if re.search(r"\bclient\.subscribe\s*\(", line) and ("mqtt" in lowered or "mqtt" in path_lower):
        signals.append(("MQTT subscriber", "subscriber", "code-signal", "MQTT subscribe signal"))

    deduped: List[tuple[str, str, str, str]] = []
    seen = set()
    for item in signals:
        key = (item[0].lower(), item[1].lower(), item[2])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _append_data_store(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:140]
    category_value = " ".join(str(category or "").split())[:80]
    if not name_value or not category_value:
        return

    line_value = int(line or 1)
    key = (name_value.lower(), category_value.lower(), source_path, line_value, str(source or ""))
    if key in seen or len(facts["data_stores"]) >= MAX_DATA_STORE_FACTS:
        return
    seen.add(key)
    facts["data_stores"].append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_data_stores(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_data_stores: set,
) -> None:
    for dependency in facts.get("dependencies", []):
        signal = _data_store_from_dependency(
            str(dependency.get("name") or ""),
            str(dependency.get("ecosystem") or ""),
        )
        if signal is None:
            continue
        name, category, detail = signal
        _append_data_store(
            facts,
            seen_data_stores,
            name=name,
            category=category,
            source_path=str(dependency.get("source_path") or ""),
            line=1,
            source="dependency",
            detail=detail,
        )

    for env_var in facts.get("environment_variables", []):
        signal = _data_store_from_text(str(env_var.get("name") or ""))
        if signal is None:
            continue
        name, category, detail = signal
        _append_data_store(
            facts,
            seen_data_stores,
            name=name,
            category=category,
            source_path=str(env_var.get("source_path") or ""),
            line=int(env_var.get("line") or 1),
            source="environment-name",
            detail=f"{detail}; value not stored",
        )

    for signal in facts.get("secret_signals", []):
        store = _data_store_from_text(str(signal.get("name") or ""))
        if store is None:
            continue
        name, category, detail = store
        _append_data_store(
            facts,
            seen_data_stores,
            name=name,
            category=category,
            source_path=str(signal.get("source_path") or ""),
            line=int(signal.get("line") or 1),
            source="redacted-secret-name",
            detail=f"{detail}; secret value redacted",
        )

    for integration in facts.get("service_integrations", []):
        text = " ".join(str(integration.get(key) or "") for key in ("name", "category", "detail"))
        store = _data_store_from_text(text)
        if store is None and str(integration.get("category") or "") in {"database", "cache", "search"}:
            store = (
                str(integration.get("name") or "Data store"),
                str(integration.get("category") or "data store"),
                str(integration.get("detail") or "data-store integration signal"),
            )
        if store is None:
            continue
        name, category, detail = store
        _append_data_store(
            facts,
            seen_data_stores,
            name=name,
            category=category,
            source_path=str(integration.get("source_path") or ""),
            line=int(integration.get("line") or 1),
            source="service-integration",
            detail=detail,
        )

    for service in facts.get("container_services", []):
        text = " ".join(str(service.get(key) or "") for key in ("name", "image", "command", "detail"))
        store = _data_store_from_text(text)
        if store is None:
            continue
        name, category, detail = store
        _append_data_store(
            facts,
            seen_data_stores,
            name=name,
            category=category,
            source_path=str(service.get("source_path") or ""),
            line=int(service.get("line") or 1),
            source="container-service",
            detail=f"{detail}; {service.get('image') or service.get('name') or 'Compose service'}",
        )


def _data_store_from_dependency(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    ecosystem_value = str(ecosystem or "").lower()

    exact = {
        "pg": ("PostgreSQL", "relational database", "PostgreSQL client dependency"),
        "postgres": ("PostgreSQL", "relational database", "PostgreSQL client dependency"),
        "postgresql": ("PostgreSQL", "relational database", "PostgreSQL client dependency"),
        "postgres.js": ("PostgreSQL", "relational database", "PostgreSQL client dependency"),
        "psycopg": ("PostgreSQL", "relational database", "PostgreSQL client dependency"),
        "psycopg2": ("PostgreSQL", "relational database", "PostgreSQL client dependency"),
        "asyncpg": ("PostgreSQL", "relational database", "PostgreSQL client dependency"),
        "pg8000": ("PostgreSQL", "relational database", "PostgreSQL client dependency"),
        "mysql": ("MySQL", "relational database", "MySQL client dependency"),
        "mysql2": ("MySQL", "relational database", "MySQL client dependency"),
        "mysqlclient": ("MySQL", "relational database", "MySQL client dependency"),
        "pymysql": ("MySQL", "relational database", "MySQL client dependency"),
        "mysql-connector-python": ("MySQL", "relational database", "MySQL client dependency"),
        "mariadb": ("MariaDB", "relational database", "MariaDB client dependency"),
        "sqlite3": ("SQLite", "embedded database", "SQLite dependency"),
        "better-sqlite3": ("SQLite", "embedded database", "SQLite dependency"),
        "sqlite": ("SQLite", "embedded database", "SQLite dependency"),
        "mongodb": ("MongoDB", "document database", "MongoDB client dependency"),
        "mongoose": ("MongoDB", "document database", "Mongoose/MongoDB dependency"),
        "pymongo": ("MongoDB", "document database", "MongoDB client dependency"),
        "motor": ("MongoDB", "document database", "Motor/MongoDB dependency"),
        "redis": ("Redis", "key-value cache", "Redis client dependency"),
        "ioredis": ("Redis", "key-value cache", "Redis client dependency"),
        "memcached": ("Memcached", "key-value cache", "Memcached dependency"),
        "pylibmc": ("Memcached", "key-value cache", "Memcached dependency"),
        "boto3": ("AWS data services", "cloud data service", "boto3 AWS data-service dependency"),
        "@aws-sdk/client-s3": ("Amazon S3", "object storage", "AWS S3 client dependency"),
        "@aws-sdk/client-dynamodb": ("DynamoDB", "document database", "AWS DynamoDB client dependency"),
        "elasticsearch": ("Elasticsearch", "search engine", "Elasticsearch client dependency"),
        "@elastic/elasticsearch": ("Elasticsearch", "search engine", "Elasticsearch client dependency"),
        "opensearch-py": ("OpenSearch", "search engine", "OpenSearch client dependency"),
        "@opensearch-project/opensearch": ("OpenSearch", "search engine", "OpenSearch client dependency"),
        "meilisearch": ("Meilisearch", "search engine", "Meilisearch client dependency"),
        "typesense": ("Typesense", "search engine", "Typesense client dependency"),
        "algoliasearch": ("Algolia", "search engine", "Algolia search dependency"),
        "clickhouse": ("ClickHouse", "analytics database", "ClickHouse client dependency"),
        "snowflake-connector-python": ("Snowflake", "analytics warehouse", "Snowflake client dependency"),
        "@google-cloud/storage": ("Google Cloud Storage", "object storage", "Google Cloud Storage dependency"),
        "@azure/storage-blob": ("Azure Blob Storage", "object storage", "Azure Blob Storage dependency"),
        "firebase": ("Firestore", "realtime database", "Firebase data dependency"),
        "firebase-admin": ("Firestore", "realtime database", "Firebase Admin data dependency"),
        "supabase": ("Supabase", "hosted database", "Supabase client dependency"),
        "@supabase/supabase-js": ("Supabase", "hosted database", "Supabase client dependency"),
        "qdrant-client": ("Qdrant", "vector store", "Qdrant client dependency"),
        "@qdrant/js-client-rest": ("Qdrant", "vector store", "Qdrant client dependency"),
        "pinecone-client": ("Pinecone", "vector store", "Pinecone client dependency"),
        "@pinecone-database/pinecone": ("Pinecone", "vector store", "Pinecone client dependency"),
        "weaviate-client": ("Weaviate", "vector store", "Weaviate client dependency"),
        "chromadb": ("Chroma", "vector store", "Chroma client dependency"),
        "milvus": ("Milvus", "vector store", "Milvus client dependency"),
    }
    if normalized in exact:
        return exact[normalized]

    if ecosystem_value == "go":
        if "jackc/pgx" in normalized or "lib/pq" in normalized or "driver/postgres" in normalized:
            return ("PostgreSQL", "relational database", "Go PostgreSQL dependency")
        if "go-sql-driver/mysql" in normalized or "driver/mysql" in normalized:
            return ("MySQL", "relational database", "Go MySQL dependency")
        if "mongo-driver" in normalized:
            return ("MongoDB", "document database", "Go MongoDB dependency")
        if "redis/go-redis" in normalized or "go-redis/redis" in normalized:
            return ("Redis", "key-value cache", "Go Redis dependency")
        if "aws-sdk-go" in normalized and "s3" in normalized:
            return ("Amazon S3", "object storage", "Go AWS S3 dependency")
    if ecosystem_value == "rust":
        if normalized in {"tokio-postgres", "postgres", "sqlx"}:
            return ("PostgreSQL", "relational database", "Rust database dependency")
        if normalized == "mongodb":
            return ("MongoDB", "document database", "Rust MongoDB dependency")
        if normalized == "redis":
            return ("Redis", "key-value cache", "Rust Redis dependency")
    if ecosystem_value in {"java", "kotlin", "jvm"}:
        if "postgresql" in normalized:
            return ("PostgreSQL", "relational database", "JVM PostgreSQL dependency")
        if "mysql" in normalized or "mariadb" in normalized:
            return ("MySQL", "relational database", "JVM MySQL/MariaDB dependency")
        if "mongodb" in normalized:
            return ("MongoDB", "document database", "JVM MongoDB dependency")
        if "jedis" in normalized or "lettuce" in normalized:
            return ("Redis", "key-value cache", "JVM Redis dependency")
    if ecosystem_value in {"c#", ".net", "dotnet"}:
        if "npgsql" in normalized:
            return ("PostgreSQL", "relational database", ".NET PostgreSQL dependency")
        if "mysql" in normalized:
            return ("MySQL", "relational database", ".NET MySQL dependency")
        if "mongodb" in normalized:
            return ("MongoDB", "document database", ".NET MongoDB dependency")
        if "stackexchange.redis" in normalized:
            return ("Redis", "key-value cache", ".NET Redis dependency")

    return _data_store_from_text(normalized)


def _data_store_from_text(text: str) -> Optional[tuple[str, str, str]]:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return None
    cleaned = normalized.replace("_", "-").replace(".", "-").replace("/", "-")

    patterns = [
        (("postgresql", "postgres", "pgdatabase", "pg-host", "pg-url", "pg-uri"), ("PostgreSQL", "relational database", "PostgreSQL data-store signal")),
        (("mysql", "mariadb"), ("MySQL", "relational database", "MySQL/MariaDB data-store signal")),
        (("mongodb", "mongo-url", "mongo-uri"), ("MongoDB", "document database", "MongoDB data-store signal")),
        (("dynamodb",), ("DynamoDB", "document database", "DynamoDB data-store signal")),
        (("firestore", "firebase-database", "firebase-db"), ("Firestore", "realtime database", "Firestore/Firebase data-store signal")),
        (("sqlite", "sqlite3", "better-sqlite3"), ("SQLite", "embedded database", "SQLite data-store signal")),
        (("database-url", "database-uri", "db-url", "db-uri"), ("Database URL", "database", "Database connection URL signal")),
        (("redis", "rediss-url"), ("Redis", "key-value cache", "Redis data-store signal")),
        (("memcached", "memcache"), ("Memcached", "key-value cache", "Memcached data-store signal")),
        (("s3-bucket", "s3bucket", "s3-client", "aws-s3", "amazon-s3"), ("Amazon S3", "object storage", "Amazon S3 object-store signal")),
        (("gcs-bucket", "google-cloud-storage", "cloud-storage-bucket"), ("Google Cloud Storage", "object storage", "Google Cloud Storage signal")),
        (("azure-storage", "azure-blob", "blob-storage"), ("Azure Blob Storage", "object storage", "Azure Blob Storage signal")),
        (("minio",), ("MinIO", "object storage", "MinIO object-store signal")),
        (("elasticsearch", "elastic-search"), ("Elasticsearch", "search engine", "Elasticsearch data-store signal")),
        (("opensearch", "open-search"), ("OpenSearch", "search engine", "OpenSearch data-store signal")),
        (("meilisearch", "meili-search"), ("Meilisearch", "search engine", "Meilisearch data-store signal")),
        (("typesense",), ("Typesense", "search engine", "Typesense data-store signal")),
        (("algolia",), ("Algolia", "search engine", "Algolia search-store signal")),
        (("clickhouse",), ("ClickHouse", "analytics database", "ClickHouse data-store signal")),
        (("snowflake",), ("Snowflake", "analytics warehouse", "Snowflake data-store signal")),
        (("bigquery",), ("BigQuery", "analytics warehouse", "BigQuery data-store signal")),
        (("redshift",), ("Redshift", "analytics warehouse", "Redshift data-store signal")),
        (("supabase",), ("Supabase", "hosted database", "Supabase data-store signal")),
        (("qdrant",), ("Qdrant", "vector store", "Qdrant vector-store signal")),
        (("pinecone",), ("Pinecone", "vector store", "Pinecone vector-store signal")),
        (("weaviate",), ("Weaviate", "vector store", "Weaviate vector-store signal")),
        (("chromadb", "chroma-db"), ("Chroma", "vector store", "Chroma vector-store signal")),
        (("milvus",), ("Milvus", "vector store", "Milvus vector-store signal")),
    ]
    for needles, result in patterns:
        if _contains_data_store_signal(cleaned, needles):
            return result
    return None


def _contains_data_store_signal(cleaned: str, needles: tuple[str, ...]) -> bool:
    for needle in needles:
        if needle in {"redis", "s3"}:
            if re.search(rf"(^|[^a-z0-9]){re.escape(needle)}($|[^a-z0-9])", cleaned):
                return True
            continue
        if needle in cleaned:
            return True
    return False


def _sort_data_stores(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (_data_store_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_DATA_STORE_FACTS]


def _data_store_category_rank(category: str) -> int:
    return {
        "relational database": 0,
        "database": 1,
        "embedded database": 2,
        "document database": 3,
        "realtime database": 4,
        "hosted database": 5,
        "key-value cache": 6,
        "object storage": 7,
        "search engine": 8,
        "vector store": 9,
        "analytics database": 10,
        "analytics warehouse": 11,
        "cloud data service": 12,
    }.get(str(category or ""), 50)


def _is_data_store_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    if name in {
        ".env.example",
        ".env.sample",
        "database.py",
        "database.ts",
        "database.js",
        "db.py",
        "db.ts",
        "db.js",
        "cache.py",
        "cache.ts",
        "cache.js",
        "storage.py",
        "storage.ts",
        "storage.js",
        "search.py",
        "search.ts",
        "search.js",
    }:
        return True
    if any(token in name for token in ("postgres", "mysql", "mongo", "redis", "memcache", "sqlite", "database", "db", "cache", "storage", "bucket", "s3", "elastic", "opensearch", "meilisearch", "typesense", "qdrant", "pinecone", "weaviate")):
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
            ".ini",
        }
    parts = {part.lower() for part in relative_path.parts}
    if parts & {"database", "databases", "db", "storage", "stores", "cache", "search", "persistence", "repositories", "repository"}:
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
            ".ini",
        }
    if suffix in {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".kt", ".cs", ".rb", ".php", ".go", ".rs"}:
        return relative_path.parts and relative_path.parts[0].lower() in {"src", "app", "lib", "server", "api", "packages"}
    if suffix in {".yml", ".yaml", ".json", ".toml", ".xml", ".properties", ".ini"}:
        return len(relative_path.parts) <= 3 and any(token in name for token in ("database", "db", "cache", "storage", "search", "redis", "postgres", "mongo", "elastic"))
    return False


def _extract_data_stores(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_data_stores: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        for name, category, source, detail in _data_stores_from_line(line, source_path):
            _append_data_store(
                facts,
                seen_data_stores,
                name=name,
                category=category,
                source_path=source_path,
                line=line_number,
                source=source,
                detail=detail,
            )


def _data_stores_from_line(line: str, source_path: str) -> List[tuple[str, str, str, str]]:
    signals: List[tuple[str, str, str, str]] = []
    lowered = line.lower()
    path_lower = source_path.lower()
    data_path = any(token in path_lower for token in ("env", "config", "database", "db", "cache", "storage", "search", "redis", "postgres", "mongo", "elastic", "bucket"))

    config_signal = _data_store_from_text(line)
    if config_signal is not None and data_path:
        name, category, detail = config_signal
        signals.append((name, category, "config-signal", detail))

    if re.search(r"\b(?:psycopg2|psycopg|asyncpg|pg8000)\.connect\s*\(|\bpg\.Pool\s*\(|\bnew\s+Pool\s*\(", line):
        signals.append(("PostgreSQL", "relational database", "code-signal", "PostgreSQL connection/client signal"))
    if re.search(r"\b(?:mysql|pymysql)\.connect\s*\(|\bmysql\.createConnection\s*\(|\bcreatePool\s*\(", line) and ("mysql" in lowered or "mariadb" in lowered):
        signals.append(("MySQL", "relational database", "code-signal", "MySQL connection/client signal"))
    if re.search(r"\bsqlite3\.connect\s*\(|\bbetterSqlite3\s*\(|\bnew\s+Database\s*\(", line):
        signals.append(("SQLite", "embedded database", "code-signal", "SQLite connection/client signal"))
    if re.search(r"\bMongoClient\s*\(|\bmongoose\.connect\s*\(|\bpymongo\.MongoClient\s*\(", line):
        signals.append(("MongoDB", "document database", "code-signal", "MongoDB connection/client signal"))
    if re.search(r"\bRedis\.from_url\s*\(|\bredis\.Redis\s*\(|\bcreateClient\s*\(|\bnew\s+Redis\s*\(", line) and "redis" in lowered:
        signals.append(("Redis", "key-value cache", "code-signal", "Redis client signal"))
    if re.search(r"\bmemcached\s*\(|\bnew\s+Memcached\s*\(", line, flags=re.IGNORECASE):
        signals.append(("Memcached", "key-value cache", "code-signal", "Memcached client signal"))
    if re.search(r"\bboto3\.(?:client|resource)\s*\(\s*['\"]s3['\"]|\bS3Client\s*\(|\bPutObjectCommand\s*\(", line):
        signals.append(("Amazon S3", "object storage", "code-signal", "S3 object-storage client signal"))
    if re.search(r"\bboto3\.(?:client|resource)\s*\(\s*['\"]dynamodb['\"]|\bDynamoDBClient\s*\(", line):
        signals.append(("DynamoDB", "document database", "code-signal", "DynamoDB client signal"))
    if re.search(r"\bstorage\.Client\s*\(|\bStorage\s*\(\)\.bucket\b|\badmin\.storage\(\)\.bucket\b", line):
        signals.append(("Google Cloud Storage", "object storage", "code-signal", "Cloud Storage bucket signal"))
    if re.search(r"\bBlobServiceClient\b|\b@azure/storage-blob\b", line):
        signals.append(("Azure Blob Storage", "object storage", "code-signal", "Azure Blob client signal"))
    if re.search(r"\bElasticsearch\s*\(|\b@elastic/elasticsearch\b|\bnew\s+Client\s*\(", line) and "elastic" in lowered:
        signals.append(("Elasticsearch", "search engine", "code-signal", "Elasticsearch client signal"))
    if re.search(r"\bOpenSearch\s*\(|\bopensearch\b", line, flags=re.IGNORECASE):
        signals.append(("OpenSearch", "search engine", "code-signal", "OpenSearch client signal"))
    if re.search(r"\bMeiliSearch\s*\(|\bmeilisearch\b", line):
        signals.append(("Meilisearch", "search engine", "code-signal", "Meilisearch client signal"))
    if re.search(r"\bTypesense\b|\btypesense\.Client\s*\(", line):
        signals.append(("Typesense", "search engine", "code-signal", "Typesense client signal"))
    if re.search(r"\bQdrantClient\s*\(|\bqdrant\b", line, flags=re.IGNORECASE):
        signals.append(("Qdrant", "vector store", "code-signal", "Qdrant client signal"))
    if re.search(r"\bPinecone\b|\bpinecone\.init\s*\(", line):
        signals.append(("Pinecone", "vector store", "code-signal", "Pinecone client signal"))
    if re.search(r"\bweaviate\.Client\s*\(|\bWeaviateClient\b", line):
        signals.append(("Weaviate", "vector store", "code-signal", "Weaviate client signal"))
    if re.search(r"\bchromadb\.Client\s*\(|\bChroma\b", line):
        signals.append(("Chroma", "vector store", "code-signal", "Chroma client signal"))
    if re.search(r"\bcreate_engine\s*\(|\bDataSource\s*\(|\bPrismaClient\s*\(", line) and any(token in lowered for token in ("database", "postgres", "mysql", "sqlite", "prisma", "sqlalchemy", "typeorm")):
        signals.append(("Database client", "database", "code-signal", "Generic database client/ORM signal"))

    deduped: List[tuple[str, str, str, str]] = []
    seen = set()
    for item in signals:
        key = (item[0].lower(), item[1].lower(), item[2])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _append_ai_surface(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:140]
    category_value = " ".join(str(category or "").split())[:80]
    if not name_value or not category_value:
        return

    line_value = int(line or 1)
    key = (name_value.lower(), category_value.lower(), source_path, line_value, str(source or ""))
    if key in seen or len(facts["ai_surfaces"]) >= MAX_AI_SURFACE_FACTS:
        return
    seen.add(key)
    facts["ai_surfaces"].append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_ai_surfaces(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_ai_surfaces: set,
) -> None:
    for dependency in facts.get("dependencies", []):
        signal = _ai_surface_from_dependency(
            str(dependency.get("name") or ""),
            str(dependency.get("ecosystem") or ""),
        )
        if signal is None:
            continue
        name, category, detail = signal
        _append_ai_surface(
            facts,
            seen_ai_surfaces,
            name=name,
            category=category,
            source_path=str(dependency.get("source_path") or ""),
            line=1,
            source="dependency",
            detail=detail,
        )

    for env_var in facts.get("environment_variables", []):
        signal = _ai_surface_from_text(str(env_var.get("name") or ""))
        if signal is None:
            continue
        name, category, detail = signal
        _append_ai_surface(
            facts,
            seen_ai_surfaces,
            name=name,
            category=category,
            source_path=str(env_var.get("source_path") or ""),
            line=int(env_var.get("line") or 1),
            source="environment-name",
            detail=f"{detail}; value not stored",
        )

    for signal in facts.get("secret_signals", []):
        surface = _ai_surface_from_text(str(signal.get("name") or ""))
        if surface is None:
            continue
        name, category, detail = surface
        _append_ai_surface(
            facts,
            seen_ai_surfaces,
            name=name,
            category=category,
            source_path=str(signal.get("source_path") or ""),
            line=int(signal.get("line") or 1),
            source="redacted-secret-name",
            detail=f"{detail}; secret value redacted",
        )

    for integration in facts.get("service_integrations", []):
        if str(integration.get("category") or "") != "ai provider":
            continue
        signal = _ai_surface_from_text(" ".join(str(integration.get(key) or "") for key in ("name", "category", "detail")))
        if signal is None:
            signal = (
                str(integration.get("name") or "AI provider"),
                "ai provider",
                str(integration.get("detail") or "AI provider signal"),
            )
        name, category, detail = signal
        _append_ai_surface(
            facts,
            seen_ai_surfaces,
            name=name,
            category=category,
            source_path=str(integration.get("source_path") or ""),
            line=int(integration.get("line") or 1),
            source="service-integration",
            detail=detail,
        )


def _sort_ai_surfaces(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (_ai_surface_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_AI_SURFACE_FACTS]


def _ai_surface_from_dependency(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    ecosystem_value = str(ecosystem or "").lower()

    if ecosystem_value == "javascript/typescript":
        exact = {
            "openai": ("OpenAI", "llm provider", "OpenAI SDK dependency"),
            "@azure/openai": ("Azure OpenAI", "llm provider", "Azure OpenAI SDK dependency"),
            "@anthropic-ai/sdk": ("Anthropic", "llm provider", "Anthropic SDK dependency"),
            "@google/generative-ai": ("Google Gemini", "llm provider", "Google Generative AI dependency"),
            "@google/genai": ("Google Gemini", "llm provider", "Google GenAI dependency"),
            "cohere-ai": ("Cohere", "llm provider", "Cohere SDK dependency"),
            "@mistralai/mistralai": ("Mistral", "llm provider", "Mistral SDK dependency"),
            "@huggingface/inference": ("Hugging Face Inference", "llm provider", "Hugging Face inference dependency"),
            "langchain": ("LangChain", "agent framework", "LangChain dependency"),
            "@langchain/openai": ("LangChain OpenAI", "agent framework", "LangChain OpenAI dependency"),
            "llamaindex": ("LlamaIndex", "rag framework", "LlamaIndex dependency"),
            "ai": ("Vercel AI SDK", "ai sdk", "Vercel AI SDK dependency"),
            "ollama": ("Ollama", "local model", "Ollama dependency"),
            "replicate": ("Replicate", "model hosting", "Replicate dependency"),
            "@xenova/transformers": ("Transformers.js", "local model", "Transformers.js dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "python":
        exact = {
            "openai": ("OpenAI", "llm provider", "OpenAI Python dependency"),
            "azure-openai": ("Azure OpenAI", "llm provider", "Azure OpenAI dependency"),
            "anthropic": ("Anthropic", "llm provider", "Anthropic Python dependency"),
            "google-generativeai": ("Google Gemini", "llm provider", "Google Generative AI dependency"),
            "google-genai": ("Google Gemini", "llm provider", "Google GenAI dependency"),
            "cohere": ("Cohere", "llm provider", "Cohere Python dependency"),
            "mistralai": ("Mistral", "llm provider", "Mistral Python dependency"),
            "huggingface-hub": ("Hugging Face", "llm provider", "Hugging Face Hub dependency"),
            "transformers": ("Transformers", "local model", "Transformers dependency"),
            "sentence-transformers": ("Sentence Transformers", "embedding", "Sentence Transformers dependency"),
            "langchain": ("LangChain", "agent framework", "LangChain dependency"),
            "langchain-openai": ("LangChain OpenAI", "agent framework", "LangChain OpenAI dependency"),
            "llama-index": ("LlamaIndex", "rag framework", "LlamaIndex dependency"),
            "semantic-kernel": ("Semantic Kernel", "agent framework", "Semantic Kernel dependency"),
            "ollama": ("Ollama", "local model", "Ollama dependency"),
            "replicate": ("Replicate", "model hosting", "Replicate dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "ruby":
        exact = {
            "ruby-openai": ("OpenAI", "llm provider", "OpenAI Ruby dependency"),
            "anthropic": ("Anthropic", "llm provider", "Anthropic Ruby dependency"),
            "langchainrb": ("LangChain.rb", "agent framework", "LangChain.rb dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "php":
        exact = {
            "openai-php/client": ("OpenAI", "llm provider", "OpenAI PHP dependency"),
            "orhanerday/open-ai": ("OpenAI", "llm provider", "OpenAI PHP dependency"),
            "probots-io/anthropic-php": ("Anthropic", "llm provider", "Anthropic PHP dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "go":
        if "openai-go" in normalized or "go-openai" in normalized:
            return ("OpenAI", "llm provider", "OpenAI Go dependency")
        if "anthropic" in normalized:
            return ("Anthropic", "llm provider", "Anthropic Go dependency")
        if "langchaingo" in normalized:
            return ("LangChainGo", "agent framework", "LangChainGo dependency")
        if "ollama" in normalized:
            return ("Ollama", "local model", "Ollama Go dependency")

    if ecosystem_value == "rust":
        if "async-openai" in normalized or normalized == "openai":
            return ("OpenAI", "llm provider", "OpenAI Rust dependency")
        if "anthropic" in normalized:
            return ("Anthropic", "llm provider", "Anthropic Rust dependency")
        if "ollama-rs" in normalized:
            return ("Ollama", "local model", "Ollama Rust dependency")

    if ecosystem_value in {"java", "kotlin", "jvm"}:
        if "openai" in normalized:
            return ("OpenAI", "llm provider", "OpenAI JVM dependency")
        if "langchain4j" in normalized:
            return ("LangChain4j", "agent framework", "LangChain4j dependency")
        if "semantic-kernel" in normalized:
            return ("Semantic Kernel", "agent framework", "Semantic Kernel JVM dependency")

    if ecosystem_value in {"c#", ".net", "dotnet"}:
        if "openai" in normalized:
            return ("OpenAI", "llm provider", "OpenAI .NET dependency")
        if "azure.ai.openai" in normalized:
            return ("Azure OpenAI", "llm provider", "Azure OpenAI .NET dependency")
        if "semantic-kernel" in normalized or "microsoft.semantickernel" in normalized:
            return ("Semantic Kernel", "agent framework", "Semantic Kernel .NET dependency")

    return None


def _ai_surface_from_text(text: str) -> Optional[tuple[str, str, str]]:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return None
    cleaned = normalized.replace("_", "-").replace(".", "-").replace("/", "-")

    patterns = [
        (("azure-openai",), ("Azure OpenAI", "llm provider", "Azure OpenAI signal")),
        (("openai",), ("OpenAI", "llm provider", "OpenAI signal")),
        (("anthropic", "claude"), ("Anthropic", "llm provider", "Anthropic/Claude signal")),
        (("gemini", "generative-ai", "google-genai"), ("Google Gemini", "llm provider", "Google Gemini signal")),
        (("cohere",), ("Cohere", "llm provider", "Cohere signal")),
        (("mistral",), ("Mistral", "llm provider", "Mistral signal")),
        (("huggingface", "hugging-face"), ("Hugging Face", "llm provider", "Hugging Face signal")),
        (("langchain",), ("LangChain", "agent framework", "LangChain signal")),
        (("llamaindex", "llama-index"), ("LlamaIndex", "rag framework", "LlamaIndex signal")),
        (("semantic-kernel", "semantickernel"), ("Semantic Kernel", "agent framework", "Semantic Kernel signal")),
        (("ollama",), ("Ollama", "local model", "Ollama signal")),
        (("replicate",), ("Replicate", "model hosting", "Replicate signal")),
        (("embedding", "embeddings"), ("Embeddings", "embedding", "Embedding signal")),
        (("chat-completion", "chat-completions", "responses-api"), ("Chat completion", "chat completion", "Chat completion signal")),
        (("prompt-template", "system-prompt"), ("Prompt template", "prompt", "Prompt template signal")),
        (("vector-search", "vectorstore", "retriever"), ("Vector retrieval", "rag retrieval", "Vector/RAG retrieval signal")),
    ]
    for needles, result in patterns:
        if any(needle in cleaned for needle in needles):
            return result
    return None


def _ai_surface_category_rank(category: str) -> int:
    return {
        "llm provider": 0,
        "chat completion": 1,
        "completion": 2,
        "embedding": 3,
        "prompt": 4,
        "agent framework": 5,
        "rag framework": 6,
        "rag retrieval": 7,
        "ai sdk": 8,
        "local model": 9,
        "model hosting": 10,
        "moderation": 11,
    }.get(str(category or ""), 50)


def _append_payment_surface(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:140]
    category_value = " ".join(str(category or "").split())[:80]
    if not name_value or not category_value:
        return

    line_value = int(line or 1)
    key = (name_value.lower(), category_value.lower(), source_path, line_value, str(source or ""))
    if key in seen or len(facts["payment_surfaces"]) >= MAX_PAYMENT_SURFACE_FACTS:
        return
    seen.add(key)
    facts["payment_surfaces"].append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_payment_surfaces(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_payment_surfaces: set,
) -> None:
    for dependency in facts.get("dependencies", []):
        signal = _payment_surface_from_dependency(
            str(dependency.get("name") or ""),
            str(dependency.get("ecosystem") or ""),
        )
        if signal is None:
            continue
        name, category, detail = signal
        _append_payment_surface(
            facts,
            seen_payment_surfaces,
            name=name,
            category=category,
            source_path=str(dependency.get("source_path") or ""),
            line=1,
            source="dependency",
            detail=detail,
        )

    for env_var in facts.get("environment_variables", []):
        signal = _payment_surface_from_text(str(env_var.get("name") or ""))
        if signal is None:
            continue
        name, category, detail = signal
        _append_payment_surface(
            facts,
            seen_payment_surfaces,
            name=name,
            category=category,
            source_path=str(env_var.get("source_path") or ""),
            line=int(env_var.get("line") or 1),
            source="environment-name",
            detail=f"{detail}; value not stored",
        )

    for signal in facts.get("secret_signals", []):
        surface = _payment_surface_from_text(str(signal.get("name") or ""))
        if surface is None:
            continue
        name, category, detail = surface
        _append_payment_surface(
            facts,
            seen_payment_surfaces,
            name=name,
            category=category,
            source_path=str(signal.get("source_path") or ""),
            line=int(signal.get("line") or 1),
            source="redacted-secret-name",
            detail=f"{detail}; secret value redacted",
        )

    for integration in facts.get("service_integrations", []):
        if str(integration.get("category") or "") != "payment provider":
            continue
        signal = _payment_surface_from_text(" ".join(str(integration.get(key) or "") for key in ("name", "category", "detail")))
        if signal is None:
            signal = (
                str(integration.get("name") or "Payment provider"),
                "payment provider",
                str(integration.get("detail") or "payment provider signal"),
            )
        name, category, detail = signal
        _append_payment_surface(
            facts,
            seen_payment_surfaces,
            name=name,
            category=category,
            source_path=str(integration.get("source_path") or ""),
            line=int(integration.get("line") or 1),
            source="service-integration",
            detail=detail,
        )


def _sort_payment_surfaces(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (_payment_surface_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_PAYMENT_SURFACE_FACTS]


def _payment_surface_from_dependency(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    ecosystem_value = str(ecosystem or "").lower()

    if ecosystem_value == "javascript/typescript":
        exact = {
            "stripe": ("Stripe", "payment provider", "Stripe payment SDK dependency"),
            "@stripe/stripe-js": ("Stripe.js", "client checkout", "Stripe browser checkout dependency"),
            "@paypal/checkout-server-sdk": ("PayPal", "payment provider", "PayPal checkout SDK dependency"),
            "@paypal/paypal-js": ("PayPal", "client checkout", "PayPal browser checkout dependency"),
            "braintree": ("Braintree", "payment provider", "Braintree payments dependency"),
            "square": ("Square", "payment provider", "Square payments dependency"),
            "razorpay": ("Razorpay", "payment provider", "Razorpay payments dependency"),
            "paddle-sdk": ("Paddle", "payment provider", "Paddle payments dependency"),
            "chargebee": ("Chargebee", "billing provider", "Chargebee billing dependency"),
            "revenuecat": ("RevenueCat", "subscription billing", "RevenueCat billing dependency"),
        }
        if normalized in exact:
            return exact[normalized]
        if "lemon" in normalized and "squeezy" in normalized:
            return ("Lemon Squeezy", "payment provider", "Lemon Squeezy payments dependency")

    if ecosystem_value == "python":
        exact = {
            "stripe": ("Stripe", "payment provider", "Stripe Python dependency"),
            "paypalrestsdk": ("PayPal", "payment provider", "PayPal REST SDK dependency"),
            "braintree": ("Braintree", "payment provider", "Braintree Python dependency"),
            "squareup": ("Square", "payment provider", "Square Python dependency"),
            "razorpay": ("Razorpay", "payment provider", "Razorpay Python dependency"),
            "dj-stripe": ("dj-stripe", "billing provider", "Django Stripe billing dependency"),
            "django-paypal": ("Django PayPal", "payment provider", "Django PayPal dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "ruby":
        exact = {
            "stripe": ("Stripe", "payment provider", "Stripe Ruby dependency"),
            "paypal-sdk-rest": ("PayPal", "payment provider", "PayPal Ruby dependency"),
            "braintree": ("Braintree", "payment provider", "Braintree Ruby dependency"),
            "square-sdk": ("Square", "payment provider", "Square Ruby dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "php":
        exact = {
            "stripe/stripe-php": ("Stripe", "payment provider", "Stripe PHP dependency"),
            "paypal/rest-api-sdk-php": ("PayPal", "payment provider", "PayPal PHP dependency"),
            "braintree/braintree_php": ("Braintree", "payment provider", "Braintree PHP dependency"),
            "square/square": ("Square", "payment provider", "Square PHP dependency"),
            "adyen/php-api-library": ("Adyen", "payment provider", "Adyen PHP dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "go":
        if "stripe-go" in normalized:
            return ("Stripe", "payment provider", "Stripe Go dependency")
        if "paypal" in normalized:
            return ("PayPal", "payment provider", "PayPal Go dependency")
        if "braintree" in normalized:
            return ("Braintree", "payment provider", "Braintree Go dependency")
        if "square" in normalized:
            return ("Square", "payment provider", "Square Go dependency")

    if ecosystem_value == "rust":
        if "async-stripe" in normalized or "stripe-rust" in normalized:
            return ("Stripe", "payment provider", "Stripe Rust dependency")
        if normalized == "stripe":
            return ("Stripe", "payment provider", "Stripe Rust dependency")

    if ecosystem_value in {"java", "kotlin", "jvm"}:
        if "stripe-java" in normalized:
            return ("Stripe", "payment provider", "Stripe JVM dependency")
        if "paypal" in normalized:
            return ("PayPal", "payment provider", "PayPal JVM dependency")
        if "braintree" in normalized:
            return ("Braintree", "payment provider", "Braintree JVM dependency")
        if "square" in normalized:
            return ("Square", "payment provider", "Square JVM dependency")

    if ecosystem_value in {"c#", ".net", "dotnet"}:
        if "stripe.net" in normalized or normalized == "stripe":
            return ("Stripe", "payment provider", "Stripe .NET dependency")
        if "paypal" in normalized:
            return ("PayPal", "payment provider", "PayPal .NET dependency")
        if "braintree" in normalized:
            return ("Braintree", "payment provider", "Braintree .NET dependency")
        if "square" in normalized:
            return ("Square", "payment provider", "Square .NET dependency")

    return None


def _payment_surface_from_text(text: str) -> Optional[tuple[str, str, str]]:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return None
    cleaned = normalized.replace("_", "-").replace(".", "-").replace("/", "-")

    patterns = [
        (("stripe",), ("Stripe", "payment provider", "Stripe payment signal")),
        (("paypal",), ("PayPal", "payment provider", "PayPal payment signal")),
        (("braintree",), ("Braintree", "payment provider", "Braintree payment signal")),
        (("square",), ("Square", "payment provider", "Square payment signal")),
        (("adyen",), ("Adyen", "payment provider", "Adyen payment signal")),
        (("razorpay",), ("Razorpay", "payment provider", "Razorpay payment signal")),
        (("paddle",), ("Paddle", "payment provider", "Paddle payment signal")),
        (("chargebee",), ("Chargebee", "billing provider", "Chargebee billing signal")),
        (("revenuecat",), ("RevenueCat", "subscription billing", "RevenueCat subscription signal")),
        (("lemon-squeezy", "lemonsqueezy"), ("Lemon Squeezy", "payment provider", "Lemon Squeezy payment signal")),
        (("checkout-session", "checkout-sessions"), ("Checkout session", "checkout", "Checkout session signal")),
        (("payment-intent", "payment-intents"), ("Payment intent", "payment intent", "Payment intent signal")),
        (("setup-intent", "setup-intents"), ("Setup intent", "setup intent", "Setup intent signal")),
        (("billing-portal", "customer-portal"), ("Billing portal", "billing portal", "Billing portal signal")),
        (("subscription", "subscriptions"), ("Subscription billing", "subscription", "Subscription billing signal")),
        (("invoice", "invoices"), ("Invoice billing", "invoice", "Invoice billing signal")),
    ]
    for needles, result in patterns:
        if any(needle in cleaned for needle in needles):
            return result
    return None


def _payment_surface_category_rank(category: str) -> int:
    return {
        "payment provider": 0,
        "checkout": 1,
        "payment intent": 2,
        "charge": 3,
        "subscription": 4,
        "billing provider": 5,
        "subscription billing": 6,
        "billing portal": 7,
        "invoice": 8,
        "customer billing": 9,
        "client checkout": 10,
        "setup intent": 11,
    }.get(str(category or ""), 50)


def _append_auth_surface(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:140]
    category_value = " ".join(str(category or "").split())[:80]
    if not name_value or not category_value:
        return

    line_value = int(line or 1)
    key = (name_value.lower(), category_value.lower(), source_path, line_value, str(source or ""))
    if key in seen or len(facts["auth_surfaces"]) >= MAX_AUTH_SURFACE_FACTS:
        return
    seen.add(key)
    facts["auth_surfaces"].append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_auth_surfaces(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_auth_surfaces: set,
) -> None:
    for dependency in facts.get("dependencies", []):
        signal = _auth_surface_from_dependency(
            str(dependency.get("name") or ""),
            str(dependency.get("ecosystem") or ""),
        )
        if signal is None:
            continue
        name, category, detail = signal
        _append_auth_surface(
            facts,
            seen_auth_surfaces,
            name=name,
            category=category,
            source_path=str(dependency.get("source_path") or ""),
            line=1,
            source="dependency",
            detail=detail,
        )

    for env_var in facts.get("environment_variables", []):
        signal = _auth_surface_from_text(str(env_var.get("name") or ""))
        if signal is None:
            continue
        name, category, detail = signal
        _append_auth_surface(
            facts,
            seen_auth_surfaces,
            name=name,
            category=category,
            source_path=str(env_var.get("source_path") or ""),
            line=int(env_var.get("line") or 1),
            source="environment-name",
            detail=f"{detail}; value not stored",
        )

    for signal in facts.get("secret_signals", []):
        surface = _auth_surface_from_text(str(signal.get("name") or ""))
        if surface is None:
            continue
        name, category, detail = surface
        _append_auth_surface(
            facts,
            seen_auth_surfaces,
            name=name,
            category=category,
            source_path=str(signal.get("source_path") or ""),
            line=int(signal.get("line") or 1),
            source="redacted-secret-name",
            detail=f"{detail}; secret value redacted",
        )

    for component in facts.get("stack_components", []):
        text = " ".join(str(component.get(key) or "") for key in ("name", "category", "detail"))
        surface = _auth_surface_from_text(text)
        if surface is None:
            continue
        name, category, detail = surface
        _append_auth_surface(
            facts,
            seen_auth_surfaces,
            name=name,
            category=category,
            source_path=str(component.get("source_path") or ""),
            line=int(component.get("line") or 1),
            source="stack-signal",
            detail=detail,
        )

    for integration in facts.get("service_integrations", []):
        if str(integration.get("category") or "") != "identity provider":
            continue
        _append_auth_surface(
            facts,
            seen_auth_surfaces,
            name=str(integration.get("name") or ""),
            category="identity provider",
            source_path=str(integration.get("source_path") or ""),
            line=int(integration.get("line") or 1),
            source="service-integration",
            detail=str(integration.get("detail") or "identity provider integration signal"),
        )


def _auth_surface_from_dependency(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    ecosystem_value = str(ecosystem or "").lower()

    if ecosystem_value == "javascript/typescript":
        exact = {
            "next-auth": ("NextAuth", "auth framework", "NextAuth/Auth.js dependency"),
            "@auth/core": ("Auth.js", "auth framework", "Auth.js core dependency"),
            "@auth/nextjs": ("Auth.js", "auth framework", "Auth.js Next.js dependency"),
            "passport": ("Passport", "auth middleware", "Passport dependency"),
            "passport-jwt": ("Passport JWT", "jwt", "Passport JWT strategy dependency"),
            "jsonwebtoken": ("JSON Web Token", "jwt", "JWT library dependency"),
            "jose": ("JOSE", "jwt", "JOSE/JWT library dependency"),
            "express-session": ("Express session", "session", "Express session middleware dependency"),
            "cookie-session": ("Cookie session", "session", "Cookie session middleware dependency"),
            "iron-session": ("Iron Session", "session", "Iron Session dependency"),
            "@clerk/nextjs": ("Clerk", "identity provider", "Clerk auth dependency"),
            "@clerk/clerk-sdk-node": ("Clerk", "identity provider", "Clerk auth dependency"),
            "@auth0/nextjs-auth0": ("Auth0", "identity provider", "Auth0 auth dependency"),
            "firebase-admin": ("Firebase Auth", "identity provider", "Firebase Admin auth dependency"),
            "casbin": ("Casbin", "authorization", "Casbin authorization dependency"),
        }
        if normalized in exact:
            return exact[normalized]
        if normalized.startswith("@clerk/"):
            return ("Clerk", "identity provider", "Clerk auth dependency")
        if normalized.startswith("@auth0/"):
            return ("Auth0", "identity provider", "Auth0 auth dependency")

    if ecosystem_value == "python":
        exact = {
            "django-allauth": ("Django allauth", "auth framework", "Django allauth dependency"),
            "djangorestframework-simplejwt": ("Simple JWT", "jwt", "Django REST Framework Simple JWT dependency"),
            "pyjwt": ("PyJWT", "jwt", "PyJWT dependency"),
            "python-jose": ("python-jose", "jwt", "python-jose JWT dependency"),
            "authlib": ("Authlib", "oauth", "Authlib OAuth dependency"),
            "flask-login": ("Flask-Login", "session", "Flask-Login dependency"),
            "flask-jwt-extended": ("Flask JWT Extended", "jwt", "Flask JWT Extended dependency"),
            "fastapi-users": ("FastAPI Users", "auth framework", "FastAPI Users dependency"),
            "passlib": ("Passlib", "password hashing", "Passlib credential hashing dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "ruby":
        exact = {
            "devise": ("Devise", "auth framework", "Devise dependency"),
            "omniauth": ("OmniAuth", "oauth", "OmniAuth dependency"),
            "jwt": ("JWT", "jwt", "JWT dependency"),
            "pundit": ("Pundit", "authorization", "Pundit authorization dependency"),
            "cancancan": ("CanCanCan", "authorization", "CanCanCan authorization dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "php":
        exact = {
            "laravel/sanctum": ("Laravel Sanctum", "auth framework", "Laravel Sanctum dependency"),
            "laravel/passport": ("Laravel Passport", "oauth", "Laravel Passport dependency"),
            "firebase/php-jwt": ("Firebase PHP-JWT", "jwt", "PHP JWT dependency"),
            "symfony/security-bundle": ("Symfony Security", "auth framework", "Symfony Security dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "go":
        if "golang-jwt/jwt" in normalized:
            return ("golang-jwt", "jwt", "Go JWT dependency")
        if "auth0/go-jwt-middleware" in normalized:
            return ("Auth0 JWT middleware", "auth middleware", "Auth0 Go JWT middleware dependency")
        if "casbin" in normalized:
            return ("Casbin", "authorization", "Casbin authorization dependency")

    if ecosystem_value == "rust":
        exact = {
            "jsonwebtoken": ("jsonwebtoken", "jwt", "Rust JWT dependency"),
            "oauth2": ("oauth2", "oauth", "Rust OAuth dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value in {"java", "kotlin", "jvm"}:
        if "spring-boot-starter-security" in normalized or "spring-security" in normalized:
            return ("Spring Security", "auth framework", "Spring Security dependency")
        if "jjwt" in normalized:
            return ("JJWT", "jwt", "Java JWT dependency")

    if "jwt" in normalized and ecosystem_value in {"c#", ".net", "dotnet"}:
        return ("JWT bearer", "jwt", ".NET JWT dependency")

    return None


def _auth_surface_from_text(text: str) -> Optional[tuple[str, str, str]]:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return None
    cleaned = normalized.replace("_", "-").replace(".", "-").replace("/", "-")

    patterns = [
        (("nextauth-secret", "next-auth-secret", "auth-secret"), ("Auth secret", "auth secret", "Auth secret configuration name")),
        (("jwt-secret", "jwt-private-key", "jwt-public-key", "jwt-issuer", "jwt-audience"), ("JWT", "jwt", "JWT configuration name")),
        (("session-secret", "session-key", "cookie-secret", "cookie-session"), ("Session cookies", "session", "Session configuration name")),
        (("oauth-client-id", "oauth-client-secret", "google-client-id", "google-client-secret", "github-client-id", "github-client-secret"), ("OAuth client", "oauth", "OAuth client configuration name")),
        (("auth0-domain", "auth0-client", "auth0-audience"), ("Auth0", "identity provider", "Auth0 configuration name")),
        (("clerk-secret-key", "clerk-publishable-key", "clerk-jwt-key"), ("Clerk", "identity provider", "Clerk configuration name")),
        (("firebase-auth", "firebase-admin"), ("Firebase Auth", "identity provider", "Firebase auth configuration name")),
        (("openid", "oidc"), ("OpenID Connect", "oauth", "OpenID Connect configuration name")),
        (("saml",), ("SAML", "sso", "SAML configuration name")),
    ]
    for needles, result in patterns:
        if any(needle in cleaned for needle in needles):
            return result
    return None


def _auth_surface_category_rank(category: str) -> int:
    return {
        "auth framework": 0,
        "auth middleware": 1,
        "auth guard": 2,
        "identity provider": 3,
        "oauth": 4,
        "sso": 5,
        "jwt": 6,
        "session": 7,
        "authorization": 8,
        "password hashing": 9,
        "auth secret": 10,
    }.get(str(category or ""), 50)


def _append_background_job(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:140]
    category_value = " ".join(str(category or "").split())[:80]
    if not name_value or not category_value:
        return

    line_value = int(line or 1)
    key = (name_value.lower(), category_value.lower(), source_path, line_value, str(source or ""))
    if key in seen or len(facts["background_jobs"]) >= MAX_BACKGROUND_JOB_FACTS:
        return
    seen.add(key)
    facts["background_jobs"].append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_background_jobs(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_background_jobs: set,
) -> None:
    for dependency in facts.get("dependencies", []):
        signal = _background_job_from_dependency(
            str(dependency.get("name") or ""),
            str(dependency.get("ecosystem") or ""),
        )
        if signal is None:
            continue
        name, category, detail = signal
        _append_background_job(
            facts,
            seen_background_jobs,
            name=name,
            category=category,
            source_path=str(dependency.get("source_path") or ""),
            line=1,
            source="dependency",
            detail=detail,
        )

    for command in facts.get("runbook_commands", []):
        signal = _background_job_from_text(" ".join(str(command.get(key) or "") for key in ("name", "command", "detail")))
        if signal is None:
            continue
        name, category, detail = signal
        _append_background_job(
            facts,
            seen_background_jobs,
            name=name,
            category=category,
            source_path=str(command.get("source_path") or ""),
            line=1,
            source="runbook-command",
            detail=f"{detail}; {command.get('command') or command.get('name') or 'command'}",
        )

    for workflow in facts.get("ci_workflows", []):
        events = [str(event).lower() for event in (workflow.get("events") or [])]
        if any("schedule" in event or "cron" in event for event in events):
            _append_background_job(
                facts,
                seen_background_jobs,
                name=str(workflow.get("name") or "scheduled workflow"),
                category="scheduled workflow",
                source_path=str(workflow.get("source_path") or ""),
                line=int(workflow.get("line") or 1),
                source="ci-schedule",
                detail="CI workflow has a schedule trigger",
            )

    for service in facts.get("container_services", []):
        text = " ".join(str(service.get(key) or "") for key in ("name", "image", "command", "detail"))
        signal = _background_job_from_text(text)
        if signal is None:
            continue
        name, category, detail = signal
        service_name = str(service.get("name") or name)
        _append_background_job(
            facts,
            seen_background_jobs,
            name=service_name,
            category=category,
            source_path=str(service.get("source_path") or ""),
            line=int(service.get("line") or 1),
            source="container-service",
            detail=f"{detail}; {service.get('image') or service.get('command') or service_name}",
        )

    for target in facts.get("deploy_targets", []):
        text = " ".join(str(target.get(key) or "") for key in ("name", "target_type", "detail"))
        signal = _background_job_from_text(text)
        if signal is None:
            continue
        name, category, detail = signal
        _append_background_job(
            facts,
            seen_background_jobs,
            name=str(target.get("name") or name),
            category=category,
            source_path=str(target.get("source_path") or ""),
            line=int(target.get("line") or 1),
            source="deploy-target",
            detail=f"{detail}; {target.get('detail') or target.get('target_type') or 'deploy target'}",
        )


def _background_job_from_dependency(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    ecosystem_value = str(ecosystem or "").lower()

    if ecosystem_value == "javascript/typescript":
        exact = {
            "bull": ("Bull", "task queue", "Bull queue dependency"),
            "bullmq": ("BullMQ", "task queue", "BullMQ queue dependency"),
            "@nestjs/bull": ("NestJS Bull", "task queue", "NestJS Bull queue dependency"),
            "@nestjs/bullmq": ("NestJS BullMQ", "task queue", "NestJS BullMQ queue dependency"),
            "agenda": ("Agenda", "scheduler", "Agenda job scheduler dependency"),
            "bee-queue": ("Bee-Queue", "task queue", "Bee-Queue dependency"),
            "bree": ("Bree", "scheduler", "Bree scheduler dependency"),
            "node-cron": ("node-cron", "cron", "node-cron dependency"),
            "cron": ("cron", "cron", "cron scheduler dependency"),
            "inngest": ("Inngest", "workflow engine", "Inngest dependency"),
            "@temporalio/worker": ("Temporal worker", "workflow engine", "Temporal worker dependency"),
            "@temporalio/client": ("Temporal client", "workflow engine", "Temporal client dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "python":
        exact = {
            "celery": ("Celery", "task queue", "Celery dependency"),
            "rq": ("RQ", "task queue", "Redis Queue dependency"),
            "django-rq": ("django-rq", "task queue", "Django RQ dependency"),
            "huey": ("Huey", "task queue", "Huey dependency"),
            "dramatiq": ("Dramatiq", "task queue", "Dramatiq dependency"),
            "apscheduler": ("APScheduler", "scheduler", "APScheduler dependency"),
            "arq": ("ARQ", "task queue", "ARQ dependency"),
            "django-q": ("Django Q", "task queue", "Django Q dependency"),
            "temporalio": ("Temporal", "workflow engine", "Temporal Python dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "ruby":
        exact = {
            "sidekiq": ("Sidekiq", "task queue", "Sidekiq dependency"),
            "resque": ("Resque", "task queue", "Resque dependency"),
            "delayed-job": ("Delayed Job", "task queue", "Delayed Job dependency"),
            "delayed_job": ("Delayed Job", "task queue", "Delayed Job dependency"),
            "whenever": ("Whenever", "cron", "Whenever cron dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "php":
        exact = {
            "laravel/horizon": ("Laravel Horizon", "queue worker", "Laravel Horizon dependency"),
            "laravel/framework": ("Laravel queue", "task queue", "Laravel framework queue support"),
            "symfony/messenger": ("Symfony Messenger", "task queue", "Symfony Messenger dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "go":
        if "hibiken/asynq" in normalized:
            return ("Asynq", "task queue", "Asynq dependency")
        if "robfig/cron" in normalized:
            return ("robfig/cron", "cron", "Go cron dependency")
        if "temporalio/sdk-go" in normalized:
            return ("Temporal", "workflow engine", "Temporal Go dependency")
        if "richardknop/machinery" in normalized:
            return ("Machinery", "task queue", "Machinery dependency")

    if ecosystem_value == "rust":
        exact = {
            "apalis": ("Apalis", "task queue", "Apalis dependency"),
            "fang": ("Fang", "task queue", "Fang dependency"),
            "tokio-cron-scheduler": ("Tokio cron scheduler", "cron", "Tokio cron scheduler dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value in {"java", "kotlin", "jvm"}:
        if "spring-batch" in normalized:
            return ("Spring Batch", "batch job", "Spring Batch dependency")
        if "spring-boot-starter-quartz" in normalized or "quartz" in normalized:
            return ("Quartz", "scheduler", "Quartz scheduler dependency")

    if "hangfire" in normalized:
        return ("Hangfire", "task queue", "Hangfire dependency")
    if "quartz" in normalized:
        return ("Quartz", "scheduler", "Quartz scheduler dependency")

    return None


def _background_job_from_text(text: str) -> Optional[tuple[str, str, str]]:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return None
    cleaned = normalized.replace("_", "-").replace(".", "-").replace("/", "-")

    patterns = [
        (("celery",), ("Celery", "task queue", "Celery worker or task signal")),
        (("sidekiq",), ("Sidekiq", "task queue", "Sidekiq worker signal")),
        (("bullmq",), ("BullMQ", "task queue", "BullMQ queue signal")),
        (("bull",), ("Bull", "task queue", "Bull queue signal")),
        (("rq-worker", "rqworker", "django-rq", "rq "), ("RQ", "task queue", "RQ worker signal")),
        (("worker", "queue-worker", "queueworker"), ("Worker", "queue worker", "Worker process signal")),
        (("scheduler", "schedule"), ("Scheduler", "scheduler", "Scheduler signal")),
        (("cron", "crontab"), ("Cron", "cron", "Cron schedule signal")),
        (("temporal",), ("Temporal", "workflow engine", "Temporal worker signal")),
        (("inngest",), ("Inngest", "workflow engine", "Inngest function signal")),
        (("hangfire",), ("Hangfire", "task queue", "Hangfire job signal")),
        (("quartz",), ("Quartz", "scheduler", "Quartz scheduler signal")),
        (("batch",), ("Batch job", "batch job", "Batch job signal")),
    ]
    for needles, result in patterns:
        if any(needle in cleaned for needle in needles):
            return result
    return None


def _background_job_category_rank(category: str) -> int:
    return {
        "task queue": 0,
        "queue worker": 1,
        "workflow engine": 2,
        "scheduler": 3,
        "cron": 4,
        "scheduled workflow": 5,
        "batch job": 6,
        "background task": 7,
    }.get(str(category or ""), 50)


def _append_webhook_surface(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    _append_webhook_surface_item(
        facts["webhook_surfaces"],
        seen,
        name=name,
        category=category,
        source_path=source_path,
        line=line,
        source=source,
        detail=detail,
    )


def _append_webhook_surface_item(
    items: List[Dict[str, Any]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:140]
    category_value = " ".join(str(category or "").split())[:80]
    if not name_value or not category_value:
        return

    line_value = int(line or 1)
    key = (name_value.lower(), category_value.lower(), source_path, line_value, str(source or ""))
    if key in seen or len(items) >= MAX_WEBHOOK_SURFACE_FACTS:
        return
    seen.add(key)
    items.append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_webhook_surfaces(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_webhook_surfaces: set,
) -> None:
    for env_var in facts.get("environment_variables", []):
        signal = _webhook_surface_from_text(str(env_var.get("name") or ""))
        if signal is None:
            continue
        name, category, detail = signal
        _append_webhook_surface(
            facts,
            seen_webhook_surfaces,
            name=name,
            category=category,
            source_path=str(env_var.get("source_path") or ""),
            line=int(env_var.get("line") or 1),
            source="environment-name",
            detail=f"{detail}; value not stored",
        )

    for signal in facts.get("secret_signals", []):
        surface = _webhook_surface_from_text(str(signal.get("name") or ""))
        if surface is None:
            continue
        name, category, detail = surface
        _append_webhook_surface(
            facts,
            seen_webhook_surfaces,
            name=name,
            category=category,
            source_path=str(signal.get("source_path") or ""),
            line=int(signal.get("line") or 1),
            source="redacted-secret-name",
            detail=f"{detail}; secret value redacted",
        )

    for integration in facts.get("service_integrations", []):
        surface = _webhook_surface_from_text(str(integration.get("name") or ""))
        if surface is None:
            continue
        name, category, detail = surface
        _append_webhook_surface(
            facts,
            seen_webhook_surfaces,
            name=name,
            category=category,
            source_path=str(integration.get("source_path") or ""),
            line=int(integration.get("line") or 1),
            source="service-integration",
            detail=detail,
        )


def _derive_webhook_surfaces_from_overview(
    existing: List[Dict[str, Any]],
    route_endpoints: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    items = list(existing or [])
    seen = _webhook_surface_seen(items)
    for route in route_endpoints:
        path = str(route.get("path") or "")
        if not _is_webhook_route_path(path):
            continue
        name, category, detail = _webhook_surface_from_route(route)
        _append_webhook_surface_item(
            items,
            seen,
            name=name,
            category=category,
            source_path=str(route.get("source_path") or ""),
            line=int(route.get("line") or 1),
            source="route",
            detail=detail,
        )
    return _sort_webhook_surfaces(items)


def _webhook_surface_seen(items: List[Dict[str, Any]]) -> set:
    seen = set()
    for item in items:
        seen.add((
            str(item.get("name") or "").lower(),
            str(item.get("category") or "").lower(),
            str(item.get("source_path") or ""),
            int(item.get("line") or 1),
            str(item.get("source") or ""),
        ))
    return seen


def _sort_webhook_surfaces(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (_webhook_surface_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_WEBHOOK_SURFACE_FACTS]


def _webhook_surface_from_route(route: Dict[str, Any]) -> tuple[str, str, str]:
    path = str(route.get("path") or "")
    method = str(route.get("method") or "").upper()
    framework = str(route.get("framework") or "route")
    provider = _webhook_provider_from_text(path)
    if provider:
        return (f"{provider} webhook", "webhook endpoint", f"{method} {path}; {framework}")
    if "callback" in path.lower():
        return ("Callback endpoint", "callback endpoint", f"{method} {path}; {framework}")
    return ("Webhook endpoint", "webhook endpoint", f"{method} {path}; {framework}")


def _webhook_surface_from_text(text: str) -> Optional[tuple[str, str, str]]:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return None
    cleaned = normalized.replace("_", "-").replace(".", "-").replace("/", "-")
    provider = _webhook_provider_from_text(cleaned)
    if provider:
        return (f"{provider} webhook", "webhook provider", f"{provider} webhook signal")
    if "webhook" in cleaned:
        return ("Webhook", "webhook provider", "Webhook configuration signal")
    if "callback" in cleaned:
        return ("Callback", "callback endpoint", "Callback configuration signal")
    return None


def _webhook_provider_from_text(text: str) -> str:
    cleaned = str(text or "").lower().replace("_", "-").replace(".", "-").replace("/", "-")
    patterns = [
        (("stripe",), "Stripe"),
        (("github", "x-hub-signature"), "GitHub"),
        (("slack",), "Slack"),
        (("twilio",), "Twilio"),
        (("shopify",), "Shopify"),
        (("paypal",), "PayPal"),
        (("discord",), "Discord"),
        (("sendgrid",), "SendGrid"),
        (("mailgun",), "Mailgun"),
        (("vercel",), "Vercel"),
        (("linear",), "Linear"),
        (("notion",), "Notion"),
        (("svix",), "Svix"),
        (("clerk",), "Clerk"),
        (("auth0",), "Auth0"),
        (("github-app",), "GitHub"),
    ]
    for needles, provider in patterns:
        if any(needle in cleaned for needle in needles):
            return provider
    return ""


def _is_webhook_route_path(path: str) -> bool:
    normalized = str(path or "").lower()
    return any(token in normalized for token in ("webhook", "webhooks", "callback", "callbacks"))


def _webhook_surface_category_rank(category: str) -> int:
    return {
        "webhook endpoint": 0,
        "callback endpoint": 1,
        "webhook handler": 2,
        "signature verification": 3,
        "webhook provider": 4,
    }.get(str(category or ""), 50)


def _append_observability_surface(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    _append_observability_surface_item(
        facts["observability_surfaces"],
        seen,
        name=name,
        category=category,
        source_path=source_path,
        line=line,
        source=source,
        detail=detail,
    )


def _append_observability_surface_item(
    items: List[Dict[str, Any]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:140]
    category_value = " ".join(str(category or "").split())[:80]
    if not name_value or not category_value:
        return

    line_value = int(line or 1)
    key = (name_value.lower(), category_value.lower(), source_path, line_value, str(source or ""))
    if key in seen or len(items) >= MAX_OBSERVABILITY_SURFACE_FACTS:
        return
    seen.add(key)
    items.append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_observability_surfaces(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_observability_surfaces: set,
) -> None:
    for dependency in facts.get("dependencies", []):
        signal = _observability_surface_from_dependency(
            str(dependency.get("name") or ""),
            str(dependency.get("ecosystem") or ""),
        )
        if signal is None:
            continue
        name, category, detail = signal
        _append_observability_surface(
            facts,
            seen_observability_surfaces,
            name=name,
            category=category,
            source_path=str(dependency.get("source_path") or ""),
            line=1,
            source="dependency",
            detail=detail,
        )

    for env_var in facts.get("environment_variables", []):
        signal = _observability_surface_from_text(str(env_var.get("name") or ""))
        if signal is None:
            continue
        name, category, detail = signal
        _append_observability_surface(
            facts,
            seen_observability_surfaces,
            name=name,
            category=category,
            source_path=str(env_var.get("source_path") or ""),
            line=int(env_var.get("line") or 1),
            source="environment-name",
            detail=f"{detail}; value not stored",
        )

    for signal in facts.get("secret_signals", []):
        surface = _observability_surface_from_text(str(signal.get("name") or ""))
        if surface is None:
            continue
        name, category, detail = surface
        _append_observability_surface(
            facts,
            seen_observability_surfaces,
            name=name,
            category=category,
            source_path=str(signal.get("source_path") or ""),
            line=int(signal.get("line") or 1),
            source="redacted-secret-name",
            detail=f"{detail}; secret value redacted",
        )

    for integration in facts.get("service_integrations", []):
        text = " ".join(str(integration.get(key) or "") for key in ("name", "category", "detail"))
        surface = _observability_surface_from_text(text)
        if surface is None and str(integration.get("category") or "") == "observability":
            surface = (str(integration.get("name") or "Observability"), "apm", str(integration.get("detail") or "observability integration signal"))
        if surface is None:
            continue
        name, category, detail = surface
        _append_observability_surface(
            facts,
            seen_observability_surfaces,
            name=name,
            category=category,
            source_path=str(integration.get("source_path") or ""),
            line=int(integration.get("line") or 1),
            source="service-integration",
            detail=detail,
        )

    for service in facts.get("container_services", []):
        text = " ".join(str(service.get(key) or "") for key in ("name", "image", "command", "detail"))
        surface = _observability_surface_from_text(text)
        if surface is None:
            continue
        name, category, detail = surface
        _append_observability_surface(
            facts,
            seen_observability_surfaces,
            name=name,
            category=category,
            source_path=str(service.get("source_path") or ""),
            line=int(service.get("line") or 1),
            source="container-service",
            detail=f"{detail}; {service.get('image') or service.get('name') or 'Compose service'}",
        )


def _derive_observability_surfaces_from_overview(
    existing: List[Dict[str, Any]],
    route_endpoints: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    items = list(existing or [])
    seen = _observability_surface_seen(items)
    for route in route_endpoints:
        path = str(route.get("path") or "")
        if not _is_observability_route_path(path):
            continue
        name, category, detail = _observability_surface_from_route(route)
        _append_observability_surface_item(
            items,
            seen,
            name=name,
            category=category,
            source_path=str(route.get("source_path") or ""),
            line=int(route.get("line") or 1),
            source="route",
            detail=detail,
        )
    return _sort_observability_surfaces(items)


def _observability_surface_seen(items: List[Dict[str, Any]]) -> set:
    seen = set()
    for item in items:
        seen.add((
            str(item.get("name") or "").lower(),
            str(item.get("category") or "").lower(),
            str(item.get("source_path") or ""),
            int(item.get("line") or 1),
            str(item.get("source") or ""),
        ))
    return seen


def _sort_observability_surfaces(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (_observability_surface_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_OBSERVABILITY_SURFACE_FACTS]


def _observability_surface_from_route(route: Dict[str, Any]) -> tuple[str, str, str]:
    path = str(route.get("path") or "")
    method = str(route.get("method") or "").upper()
    framework = str(route.get("framework") or "route")
    normalized = path.lower()
    if "metrics" in normalized or "prometheus" in normalized:
        return ("Metrics endpoint", "metrics", f"{method} {path}; {framework}")
    if any(token in normalized for token in ("health", "ready", "readiness", "live", "liveness", "status")):
        return ("Health check endpoint", "health check", f"{method} {path}; {framework}")
    return ("Observability endpoint", "health check", f"{method} {path}; {framework}")


def _observability_surface_from_dependency(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    ecosystem_value = str(ecosystem or "").lower()

    if ecosystem_value == "javascript/typescript":
        if normalized.startswith("@sentry/") or normalized in {"sentry", "raven-js"}:
            return ("Sentry", "error monitoring", "Sentry JavaScript dependency")
        if normalized.startswith("@opentelemetry/") or normalized in {"opentelemetry", "otel"}:
            return ("OpenTelemetry", "tracing", "OpenTelemetry JavaScript dependency")
        exact = {
            "dd-trace": ("Datadog", "apm", "Datadog tracing dependency"),
            "datadog-metrics": ("Datadog", "metrics", "Datadog metrics dependency"),
            "newrelic": ("New Relic", "apm", "New Relic dependency"),
            "prom-client": ("Prometheus", "metrics", "Prometheus metrics dependency"),
            "winston": ("Winston", "logging", "Winston logging dependency"),
            "pino": ("Pino", "logging", "Pino logging dependency"),
            "bunyan": ("Bunyan", "logging", "Bunyan logging dependency"),
            "log4js": ("Log4js", "logging", "Log4js logging dependency"),
            "rollbar": ("Rollbar", "error monitoring", "Rollbar dependency"),
            "bugsnag-js": ("Bugsnag", "error monitoring", "Bugsnag dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "python":
        if normalized.startswith("opentelemetry-"):
            return ("OpenTelemetry", "tracing", "OpenTelemetry Python dependency")
        exact = {
            "sentry-sdk": ("Sentry", "error monitoring", "Sentry Python dependency"),
            "prometheus-client": ("Prometheus", "metrics", "Prometheus metrics dependency"),
            "structlog": ("structlog", "logging", "structlog logging dependency"),
            "loguru": ("Loguru", "logging", "Loguru logging dependency"),
            "statsd": ("StatsD", "metrics", "StatsD metrics dependency"),
            "datadog": ("Datadog", "apm", "Datadog Python dependency"),
            "ddtrace": ("Datadog", "apm", "Datadog tracing dependency"),
            "newrelic": ("New Relic", "apm", "New Relic Python dependency"),
            "rollbar": ("Rollbar", "error monitoring", "Rollbar dependency"),
            "bugsnag": ("Bugsnag", "error monitoring", "Bugsnag dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "ruby":
        exact = {
            "sentry-ruby": ("Sentry", "error monitoring", "Sentry Ruby dependency"),
            "opentelemetry-sdk": ("OpenTelemetry", "tracing", "OpenTelemetry Ruby dependency"),
            "prometheus-client": ("Prometheus", "metrics", "Prometheus metrics dependency"),
            "newrelic-rpm": ("New Relic", "apm", "New Relic Ruby dependency"),
            "datadog": ("Datadog", "apm", "Datadog Ruby dependency"),
            "semantic-logger": ("Semantic Logger", "logging", "Semantic Logger dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "php":
        exact = {
            "sentry/sentry": ("Sentry", "error monitoring", "Sentry PHP dependency"),
            "open-telemetry/sdk": ("OpenTelemetry", "tracing", "OpenTelemetry PHP dependency"),
            "monolog/monolog": ("Monolog", "logging", "Monolog dependency"),
            "promphp/prometheus-client-php": ("Prometheus", "metrics", "Prometheus PHP dependency"),
            "datadog/dd-trace": ("Datadog", "apm", "Datadog PHP tracing dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "go":
        if "getsentry/sentry-go" in normalized:
            return ("Sentry", "error monitoring", "Sentry Go dependency")
        if "go.opentelemetry.io/otel" in normalized:
            return ("OpenTelemetry", "tracing", "OpenTelemetry Go dependency")
        if "prometheus/client-golang" in normalized:
            return ("Prometheus", "metrics", "Prometheus Go dependency")
        if "datadog/dd-trace-go" in normalized:
            return ("Datadog", "apm", "Datadog Go tracing dependency")
        if "uber-go/zap" in normalized or "sirupsen/logrus" in normalized or "rs/zerolog" in normalized:
            return ("Go logging", "logging", "Go structured logging dependency")

    if ecosystem_value == "rust":
        exact = {
            "sentry": ("Sentry", "error monitoring", "Sentry Rust dependency"),
            "opentelemetry": ("OpenTelemetry", "tracing", "OpenTelemetry Rust dependency"),
            "prometheus": ("Prometheus", "metrics", "Prometheus Rust dependency"),
            "tracing": ("tracing", "logging", "Rust tracing/logging dependency"),
            "tracing-subscriber": ("tracing subscriber", "logging", "Rust tracing subscriber dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value in {"java", "kotlin", "jvm"}:
        if "opentelemetry" in normalized:
            return ("OpenTelemetry", "tracing", "OpenTelemetry JVM dependency")
        if "micrometer" in normalized:
            return ("Micrometer", "metrics", "Micrometer metrics dependency")
        if "sentry" in normalized:
            return ("Sentry", "error monitoring", "Sentry JVM dependency")
        if "logback" in normalized or "log4j" in normalized or "slf4j" in normalized:
            return ("JVM logging", "logging", "JVM logging dependency")
        if "newrelic" in normalized:
            return ("New Relic", "apm", "New Relic JVM dependency")
        if "datadog" in normalized:
            return ("Datadog", "apm", "Datadog JVM dependency")

    if ecosystem_value in {"c#", ".net", "dotnet"}:
        if "sentry" in normalized:
            return ("Sentry", "error monitoring", "Sentry .NET dependency")
        if "opentelemetry" in normalized:
            return ("OpenTelemetry", "tracing", "OpenTelemetry .NET dependency")
        if "serilog" in normalized or "nlog" in normalized:
            return (".NET logging", "logging", ".NET logging dependency")
        if "prometheus-net" in normalized:
            return ("Prometheus", "metrics", "Prometheus .NET dependency")

    return None


def _observability_surface_from_text(text: str) -> Optional[tuple[str, str, str]]:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return None
    cleaned = normalized.replace("_", "-").replace(".", "-").replace("/", "-")

    patterns = [
        (("sentry-dsn", "sentry-auth-token", "sentry"), ("Sentry", "error monitoring", "Sentry observability signal")),
        (("rollbar",), ("Rollbar", "error monitoring", "Rollbar observability signal")),
        (("bugsnag",), ("Bugsnag", "error monitoring", "Bugsnag observability signal")),
        (("datadog", "dd-api-key", "dd-trace", "dd-service"), ("Datadog", "apm", "Datadog observability signal")),
        (("new-relic", "newrelic"), ("New Relic", "apm", "New Relic observability signal")),
        (("honeycomb",), ("Honeycomb", "tracing", "Honeycomb observability signal")),
        (("otel", "opentelemetry", "otlp"), ("OpenTelemetry", "tracing", "OpenTelemetry signal")),
        (("prometheus", "prom-client"), ("Prometheus", "metrics", "Prometheus metrics signal")),
        (("grafana", "loki", "promtail"), ("Grafana", "metrics", "Grafana/Loki observability signal")),
        (("statsd",), ("StatsD", "metrics", "StatsD metrics signal")),
        (("log-level", "log-format", "logging-config", "logger-config"), ("Logging", "logging", "Logging configuration signal")),
    ]
    for needles, result in patterns:
        if any(needle in cleaned for needle in needles):
            return result
    return None


def _is_observability_route_path(path: str) -> bool:
    normalized = str(path or "").lower()
    return any(token in normalized for token in ("metrics", "prometheus", "health", "ready", "readiness", "live", "liveness", "status"))


def _observability_surface_category_rank(category: str) -> int:
    return {
        "error monitoring": 0,
        "tracing": 1,
        "metrics": 2,
        "logging": 3,
        "apm": 4,
        "health check": 5,
    }.get(str(category or ""), 50)


def _append_feature_flag(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:140]
    category_value = " ".join(str(category or "").split())[:80]
    if not name_value or not category_value:
        return

    line_value = int(line or 1)
    key = (name_value.lower(), category_value.lower(), source_path, line_value, str(source or ""))
    if key in seen or len(facts["feature_flags"]) >= MAX_FEATURE_FLAG_FACTS:
        return
    seen.add(key)
    facts["feature_flags"].append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_feature_flags(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_feature_flags: set,
) -> None:
    for dependency in facts.get("dependencies", []):
        signal = _feature_flag_from_dependency(
            str(dependency.get("name") or ""),
            str(dependency.get("ecosystem") or ""),
        )
        if signal is None:
            continue
        name, category, detail = signal
        _append_feature_flag(
            facts,
            seen_feature_flags,
            name=name,
            category=category,
            source_path=str(dependency.get("source_path") or ""),
            line=1,
            source="dependency",
            detail=detail,
        )

    for env_var in facts.get("environment_variables", []):
        signal = _feature_flag_from_text(str(env_var.get("name") or ""))
        if signal is None:
            continue
        name, category, detail = signal
        _append_feature_flag(
            facts,
            seen_feature_flags,
            name=name,
            category=category,
            source_path=str(env_var.get("source_path") or ""),
            line=int(env_var.get("line") or 1),
            source="environment-name",
            detail=f"{detail}; value not stored",
        )

    for signal in facts.get("secret_signals", []):
        flag = _feature_flag_from_text(str(signal.get("name") or ""))
        if flag is None:
            continue
        name, category, detail = flag
        _append_feature_flag(
            facts,
            seen_feature_flags,
            name=name,
            category=category,
            source_path=str(signal.get("source_path") or ""),
            line=int(signal.get("line") or 1),
            source="redacted-secret-name",
            detail=f"{detail}; secret value redacted",
        )


def _sort_feature_flags(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (_feature_flag_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_FEATURE_FLAG_FACTS]


def _feature_flag_from_dependency(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    ecosystem_value = str(ecosystem or "").lower()

    if ecosystem_value == "javascript/typescript":
        exact = {
            "launchdarkly-node-server-sdk": ("LaunchDarkly", "feature flag provider", "LaunchDarkly server SDK dependency"),
            "launchdarkly-js-client-sdk": ("LaunchDarkly", "feature flag provider", "LaunchDarkly client SDK dependency"),
            "@launchdarkly/node-server-sdk": ("LaunchDarkly", "feature flag provider", "LaunchDarkly server SDK dependency"),
            "@launchdarkly/react-client-sdk": ("LaunchDarkly", "feature flag provider", "LaunchDarkly React SDK dependency"),
            "unleash-client": ("Unleash", "feature flag provider", "Unleash client dependency"),
            "unleash-proxy-client": ("Unleash", "feature flag provider", "Unleash proxy client dependency"),
            "configcat-js": ("ConfigCat", "feature flag provider", "ConfigCat dependency"),
            "@splitsoftware/splitio": ("Split", "feature flag provider", "Split.io dependency"),
            "splitio": ("Split", "feature flag provider", "Split.io dependency"),
            "statsig-node": ("Statsig", "feature flag provider", "Statsig dependency"),
            "statsig-js": ("Statsig", "feature flag provider", "Statsig dependency"),
            "@growthbook/growthbook": ("GrowthBook", "feature flag provider", "GrowthBook dependency"),
            "posthog-js": ("PostHog", "feature flag provider", "PostHog feature flag dependency"),
            "flagsmith": ("Flagsmith", "feature flag provider", "Flagsmith dependency"),
            "@openfeature/server-sdk": ("OpenFeature", "feature flag provider", "OpenFeature server SDK dependency"),
            "@openfeature/web-sdk": ("OpenFeature", "feature flag provider", "OpenFeature web SDK dependency"),
        }
        if normalized in exact:
            return exact[normalized]
        if "growthbook" in normalized:
            return ("GrowthBook", "feature flag provider", "GrowthBook dependency")

    if ecosystem_value == "python":
        exact = {
            "launchdarkly-server-sdk": ("LaunchDarkly", "feature flag provider", "LaunchDarkly Python SDK dependency"),
            "unleashclient": ("Unleash", "feature flag provider", "Unleash Python dependency"),
            "django-waffle": ("Django Waffle", "feature flag framework", "Django Waffle feature flag dependency"),
            "django-flags": ("Django Flags", "feature flag framework", "Django Flags dependency"),
            "flask-featureflags": ("Flask FeatureFlags", "feature flag framework", "Flask feature flag dependency"),
            "splitio-client": ("Split", "feature flag provider", "Split.io Python dependency"),
            "statsig": ("Statsig", "feature flag provider", "Statsig Python dependency"),
            "growthbook": ("GrowthBook", "feature flag provider", "GrowthBook Python dependency"),
            "posthog": ("PostHog", "feature flag provider", "PostHog feature flag dependency"),
            "flagsmith": ("Flagsmith", "feature flag provider", "Flagsmith dependency"),
            "openfeature-sdk": ("OpenFeature", "feature flag provider", "OpenFeature Python SDK dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "ruby":
        exact = {
            "flipper": ("Flipper", "feature flag framework", "Flipper feature flag dependency"),
            "rollout": ("Rollout", "feature flag framework", "Rollout feature flag dependency"),
            "unleash": ("Unleash", "feature flag provider", "Unleash Ruby dependency"),
            "launchdarkly-server-sdk": ("LaunchDarkly", "feature flag provider", "LaunchDarkly Ruby SDK dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "php":
        exact = {
            "launchdarkly/server-sdk": ("LaunchDarkly", "feature flag provider", "LaunchDarkly PHP SDK dependency"),
            "unleash/client": ("Unleash", "feature flag provider", "Unleash PHP dependency"),
            "growthbook/growthbook": ("GrowthBook", "feature flag provider", "GrowthBook PHP dependency"),
            "open-feature/sdk": ("OpenFeature", "feature flag provider", "OpenFeature PHP SDK dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "go":
        if "launchdarkly/go-server-sdk" in normalized:
            return ("LaunchDarkly", "feature flag provider", "LaunchDarkly Go SDK dependency")
        if "unleash-client-go" in normalized:
            return ("Unleash", "feature flag provider", "Unleash Go dependency")
        if "openfeature/go-sdk" in normalized:
            return ("OpenFeature", "feature flag provider", "OpenFeature Go SDK dependency")
        if "posthog-go" in normalized:
            return ("PostHog", "feature flag provider", "PostHog feature flag dependency")

    if ecosystem_value == "rust":
        exact = {
            "open-feature": ("OpenFeature", "feature flag provider", "OpenFeature Rust SDK dependency"),
            "unleash-api-client": ("Unleash", "feature flag provider", "Unleash Rust dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value in {"java", "kotlin", "jvm"}:
        if "launchdarkly-java-server-sdk" in normalized:
            return ("LaunchDarkly", "feature flag provider", "LaunchDarkly JVM SDK dependency")
        if "unleash-client-java" in normalized:
            return ("Unleash", "feature flag provider", "Unleash JVM dependency")
        if "ff4j" in normalized:
            return ("FF4J", "feature flag framework", "FF4J dependency")
        if "togglz" in normalized:
            return ("Togglz", "feature flag framework", "Togglz dependency")
        if "openfeature" in normalized:
            return ("OpenFeature", "feature flag provider", "OpenFeature JVM dependency")

    if ecosystem_value in {"c#", ".net", "dotnet"}:
        if "launchdarkly" in normalized:
            return ("LaunchDarkly", "feature flag provider", "LaunchDarkly .NET SDK dependency")
        if "unleash" in normalized:
            return ("Unleash", "feature flag provider", "Unleash .NET dependency")
        if "openfeature" in normalized:
            return ("OpenFeature", "feature flag provider", "OpenFeature .NET dependency")
        if "microsoft.featuremanagement" in normalized:
            return ("Microsoft Feature Management", "feature flag framework", ".NET feature management dependency")

    return None


def _feature_flag_from_text(text: str) -> Optional[tuple[str, str, str]]:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return None
    cleaned = normalized.replace("_", "-").replace(".", "-").replace("/", "-")

    patterns = [
        (("launchdarkly", "ld-sdk-key", "ld-client-id"), ("LaunchDarkly", "feature flag provider", "LaunchDarkly feature flag signal")),
        (("unleash",), ("Unleash", "feature flag provider", "Unleash feature flag signal")),
        (("configcat",), ("ConfigCat", "feature flag provider", "ConfigCat feature flag signal")),
        (("split-api-key", "splitio", "split-io"), ("Split", "feature flag provider", "Split.io feature flag signal")),
        (("statsig",), ("Statsig", "feature flag provider", "Statsig feature flag signal")),
        (("growthbook",), ("GrowthBook", "feature flag provider", "GrowthBook feature flag signal")),
        (("posthog",), ("PostHog", "feature flag provider", "PostHog feature flag signal")),
        (("flagsmith",), ("Flagsmith", "feature flag provider", "Flagsmith feature flag signal")),
        (("openfeature", "open-feature"), ("OpenFeature", "feature flag provider", "OpenFeature feature flag signal")),
        (("feature-flag", "feature-flags", "feature-toggle", "feature-toggles"), ("Feature flags", "feature flag config", "Feature flag configuration signal")),
        (("experiment", "experiments"), ("Experiment", "experiment", "Experiment flag signal")),
    ]
    for needles, result in patterns:
        if any(needle in cleaned for needle in needles):
            return result
    return None


def _feature_flag_category_rank(category: str) -> int:
    return {
        "feature flag provider": 0,
        "feature flag framework": 1,
        "flag usage": 2,
        "flag definition": 3,
        "experiment": 4,
        "feature flag config": 5,
    }.get(str(category or ""), 50)


def _append_notification_surface(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").split())[:140]
    category_value = " ".join(str(category or "").split())[:80]
    if not name_value or not category_value:
        return

    line_value = int(line or 1)
    key = (name_value.lower(), category_value.lower(), source_path, line_value, str(source or ""))
    if key in seen or len(facts["notification_surfaces"]) >= MAX_NOTIFICATION_SURFACE_FACTS:
        return
    seen.add(key)
    facts["notification_surfaces"].append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:220],
    })


def _derive_notification_surfaces(
    facts: Dict[str, List[Dict[str, Any]]],
    seen_notification_surfaces: set,
) -> None:
    for dependency in facts.get("dependencies", []):
        signal = _notification_surface_from_dependency(
            str(dependency.get("name") or ""),
            str(dependency.get("ecosystem") or ""),
        )
        if signal is None:
            continue
        name, category, detail = signal
        _append_notification_surface(
            facts,
            seen_notification_surfaces,
            name=name,
            category=category,
            source_path=str(dependency.get("source_path") or ""),
            line=1,
            source="dependency",
            detail=detail,
        )

    for env_var in facts.get("environment_variables", []):
        signal = _notification_surface_from_text(str(env_var.get("name") or ""))
        if signal is None:
            continue
        name, category, detail = signal
        _append_notification_surface(
            facts,
            seen_notification_surfaces,
            name=name,
            category=category,
            source_path=str(env_var.get("source_path") or ""),
            line=int(env_var.get("line") or 1),
            source="environment-name",
            detail=f"{detail}; value not stored",
        )

    for signal in facts.get("secret_signals", []):
        surface = _notification_surface_from_text(str(signal.get("name") or ""))
        if surface is None:
            continue
        name, category, detail = surface
        _append_notification_surface(
            facts,
            seen_notification_surfaces,
            name=name,
            category=category,
            source_path=str(signal.get("source_path") or ""),
            line=int(signal.get("line") or 1),
            source="redacted-secret-name",
            detail=f"{detail}; secret value redacted",
        )

    for integration in facts.get("service_integrations", []):
        if str(integration.get("category") or "") not in {"email provider", "messaging"}:
            continue
        signal = _notification_surface_from_text(" ".join(str(integration.get(key) or "") for key in ("name", "category", "detail")))
        if signal is None:
            category = "email" if str(integration.get("category") or "") == "email provider" else "sms"
            signal = (str(integration.get("name") or "Notification provider"), category, str(integration.get("detail") or "notification provider signal"))
        name, category, detail = signal
        _append_notification_surface(
            facts,
            seen_notification_surfaces,
            name=name,
            category=category,
            source_path=str(integration.get("source_path") or ""),
            line=int(integration.get("line") or 1),
            source="service-integration",
            detail=detail,
        )


def _sort_notification_surfaces(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (_notification_surface_category_rank(item.get("category") or ""), _source_priority(item.get("source_path") or ""), int(item.get("line") or 0), item.get("name") or ""),
    )[:MAX_NOTIFICATION_SURFACE_FACTS]


def _notification_surface_from_dependency(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    ecosystem_value = str(ecosystem or "").lower()

    if ecosystem_value == "javascript/typescript":
        exact = {
            "nodemailer": ("Nodemailer", "email", "Nodemailer email dependency"),
            "@sendgrid/mail": ("SendGrid", "email", "SendGrid mail dependency"),
            "resend": ("Resend", "email", "Resend email dependency"),
            "mailgun.js": ("Mailgun", "email", "Mailgun email dependency"),
            "postmark": ("Postmark", "email", "Postmark email dependency"),
            "aws-sdk": ("AWS messaging", "notification provider", "AWS SDK can send SES/SNS/SQS notifications"),
            "@aws-sdk/client-ses": ("Amazon SES", "email", "Amazon SES client dependency"),
            "@aws-sdk/client-sns": ("Amazon SNS", "push", "Amazon SNS client dependency"),
            "twilio": ("Twilio", "sms", "Twilio messaging dependency"),
            "firebase-admin": ("Firebase Cloud Messaging", "push", "Firebase Admin messaging dependency"),
            "web-push": ("Web Push", "push", "Web Push dependency"),
            "@slack/web-api": ("Slack", "chat", "Slack Web API dependency"),
            "discord.js": ("Discord", "chat", "Discord client dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "python":
        exact = {
            "sendgrid": ("SendGrid", "email", "SendGrid Python dependency"),
            "resend": ("Resend", "email", "Resend Python dependency"),
            "mailgun": ("Mailgun", "email", "Mailgun Python dependency"),
            "postmarker": ("Postmark", "email", "Postmark Python dependency"),
            "django-anymail": ("Django Anymail", "email", "Django Anymail dependency"),
            "twilio": ("Twilio", "sms", "Twilio Python dependency"),
            "firebase-admin": ("Firebase Cloud Messaging", "push", "Firebase Admin messaging dependency"),
            "slack-sdk": ("Slack", "chat", "Slack SDK dependency"),
            "discord.py": ("Discord", "chat", "Discord Python dependency"),
            "boto3": ("AWS messaging", "notification provider", "Boto3 can send SES/SNS notifications"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "ruby":
        exact = {
            "sendgrid-ruby": ("SendGrid", "email", "SendGrid Ruby dependency"),
            "mailgun-ruby": ("Mailgun", "email", "Mailgun Ruby dependency"),
            "postmark-rails": ("Postmark", "email", "Postmark Rails dependency"),
            "twilio-ruby": ("Twilio", "sms", "Twilio Ruby dependency"),
            "slack-ruby-client": ("Slack", "chat", "Slack Ruby dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "php":
        exact = {
            "sendgrid/sendgrid": ("SendGrid", "email", "SendGrid PHP dependency"),
            "mailgun/mailgun-php": ("Mailgun", "email", "Mailgun PHP dependency"),
            "resend/resend-php": ("Resend", "email", "Resend PHP dependency"),
            "twilio/sdk": ("Twilio", "sms", "Twilio PHP dependency"),
            "symfony/mailer": ("Symfony Mailer", "email", "Symfony Mailer dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value == "go":
        if "sendgrid/sendgrid-go" in normalized:
            return ("SendGrid", "email", "SendGrid Go dependency")
        if "mailgun/mailgun-go" in normalized:
            return ("Mailgun", "email", "Mailgun Go dependency")
        if "twilio/twilio-go" in normalized:
            return ("Twilio", "sms", "Twilio Go dependency")
        if "slack-go/slack" in normalized:
            return ("Slack", "chat", "Slack Go dependency")
        if "aws-sdk-go" in normalized:
            return ("AWS messaging", "notification provider", "AWS SDK can send SES/SNS notifications")

    if ecosystem_value == "rust":
        exact = {
            "lettre": ("lettre", "email", "Rust email dependency"),
            "sendgrid": ("SendGrid", "email", "SendGrid Rust dependency"),
            "slack-morphism": ("Slack", "chat", "Slack Rust dependency"),
        }
        if normalized in exact:
            return exact[normalized]

    if ecosystem_value in {"java", "kotlin", "jvm"}:
        if "spring-boot-starter-mail" in normalized or "jakarta.mail" in normalized or "javax.mail" in normalized:
            return ("JVM mail", "email", "JVM mail dependency")
        if "twilio" in normalized:
            return ("Twilio", "sms", "Twilio JVM dependency")
        if "firebase-admin" in normalized:
            return ("Firebase Cloud Messaging", "push", "Firebase Admin messaging dependency")
        if "sendgrid-java" in normalized:
            return ("SendGrid", "email", "SendGrid JVM dependency")

    if ecosystem_value in {"c#", ".net", "dotnet"}:
        if "sendgrid" in normalized:
            return ("SendGrid", "email", "SendGrid .NET dependency")
        if "twilio" in normalized:
            return ("Twilio", "sms", "Twilio .NET dependency")
        if "mailkit" in normalized:
            return ("MailKit", "email", "MailKit dependency")
        if "firebaseadmin" in normalized:
            return ("Firebase Cloud Messaging", "push", "Firebase Admin messaging dependency")

    return None


def _notification_surface_from_text(text: str) -> Optional[tuple[str, str, str]]:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return None
    cleaned = normalized.replace("_", "-").replace(".", "-").replace("/", "-")

    patterns = [
        (("sendgrid",), ("SendGrid", "email", "SendGrid notification signal")),
        (("mailgun",), ("Mailgun", "email", "Mailgun notification signal")),
        (("resend",), ("Resend", "email", "Resend notification signal")),
        (("postmark",), ("Postmark", "email", "Postmark notification signal")),
        (("smtp", "mail-from", "email-from"), ("SMTP/email", "email", "SMTP/email notification signal")),
        (("ses", "aws-ses"), ("Amazon SES", "email", "Amazon SES notification signal")),
        (("twilio", "sms"), ("Twilio", "sms", "Twilio/SMS notification signal")),
        (("sns-topic", "aws-sns"), ("Amazon SNS", "push", "Amazon SNS notification signal")),
        (("firebase-messaging", "fcm", "push-notification"), ("Firebase Cloud Messaging", "push", "Push notification signal")),
        (("slack-bot", "slack-webhook", "slack-token", "slack"), ("Slack", "chat", "Slack notification signal")),
        (("discord-webhook", "discord-token", "discord"), ("Discord", "chat", "Discord notification signal")),
        (("notification", "notifications", "notify"), ("Notification", "notification sender", "Notification signal")),
    ]
    for needles, result in patterns:
        if any(needle in cleaned for needle in needles):
            return result
    return None


def _notification_surface_category_rank(category: str) -> int:
    return {
        "email": 0,
        "sms": 1,
        "push": 2,
        "chat": 3,
        "notification sender": 4,
        "notification provider": 5,
    }.get(str(category or ""), 50)


def _append_runtime_requirement(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    runtime: str,
    requirement: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    runtime_value = " ".join(str(runtime or "").split())[:80]
    requirement_value = " ".join(str(requirement or "").split())[:120]
    if not runtime_value or not requirement_value:
        return

    key = (runtime_value.lower(), requirement_value.lower(), source_path, int(line or 1), str(source or ""))
    if key in seen or len(facts["runtime_requirements"]) >= MAX_RUNTIME_REQUIREMENT_FACTS:
        return
    seen.add(key)
    facts["runtime_requirements"].append({
        "runtime": runtime_value,
        "requirement": requirement_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:200],
    })


def _extract_version_file_runtime(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_runtime_requirements: set,
    runtime: str,
    source: str,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        requirement = raw_line.strip()
        if not requirement or requirement.startswith("#"):
            continue
        _append_runtime_requirement(
            facts,
            seen_runtime_requirements,
            runtime=runtime,
            requirement=requirement,
            source_path=source_path,
            line=line_number,
            source=source,
            detail=source_path,
        )
        return


def _extract_tool_versions_runtime(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_runtime_requirements: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    runtime_names = {
        "node": "Node.js",
        "nodejs": "Node.js",
        "python": "Python",
        "python3": "Python",
        "ruby": "Ruby",
        "golang": "Go",
        "go": "Go",
        "rust": "Rust",
        "java": "Java",
        "php": "PHP",
        "elixir": "Elixir",
        "erlang": "Erlang",
    }
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        runtime = runtime_names.get(parts[0].lower())
        if not runtime:
            continue
        _append_runtime_requirement(
            facts,
            seen_runtime_requirements,
            runtime=runtime,
            requirement=" ".join(parts[1:]),
            source_path=source_path,
            line=line_number,
            source="tool-versions",
            detail=f"{parts[0]} tool version",
        )


def _extract_pom_runtime(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_runtime_requirements: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    for tag in ("maven.compiler.release", "maven.compiler.source", "java.version"):
        match = re.search(rf"<{re.escape(tag)}>\s*([^<\s]+)\s*</{re.escape(tag)}>", text)
        if match:
            _append_runtime_requirement(
                facts,
                seen_runtime_requirements,
                runtime="Java",
                requirement=match.group(1),
                source_path=source_path,
                line=_line_number(text, match.start()),
                source="maven",
                detail=tag,
            )
            return


def _extract_gradle_runtime(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_runtime_requirements: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    patterns = [
        (r"sourceCompatibility\s*=\s*['\"]?([0-9][0-9._]*)['\"]?", "sourceCompatibility"),
        (r"targetCompatibility\s*=\s*['\"]?([0-9][0-9._]*)['\"]?", "targetCompatibility"),
        (r"JavaVersion\.VERSION_([0-9_]+)", "JavaVersion"),
        (r"JavaLanguageVersion\.of\((\d+)\)", "Java toolchain"),
        (r"jvmToolchain\((\d+)\)", "Kotlin JVM toolchain"),
    ]
    for pattern, detail in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        _append_runtime_requirement(
            facts,
            seen_runtime_requirements,
            runtime="Java",
            requirement=match.group(1).replace("_", "."),
            source_path=source_path,
            line=_line_number(text, match.start()),
            source="gradle",
            detail=detail,
        )
        return


def _node_engine_runtime(name: str) -> str:
    normalized = name.strip().lower()
    if normalized in {"node", "nodejs", "node.js"}:
        return "Node.js"
    if normalized in {"npm", "pnpm", "yarn"}:
        return normalized
    if normalized in {"bun", "deno"}:
        return normalized.capitalize()
    return ""


def _pyproject_license_value(project: Dict[str, Any]) -> str:
    license_value = project.get("license")
    if isinstance(license_value, str):
        return license_value.strip()[:120]
    if isinstance(license_value, dict):
        for key in ("text", "file"):
            value = license_value.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:120]
    return ""


def _append_repo_policy(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    policy_type: str,
    name: str,
    value: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    policy_type_value = " ".join(str(policy_type or "").split())[:80]
    name_value = " ".join(str(name or "").split())[:120]
    value_value = " ".join(str(value or "").split())[:240]
    if not policy_type_value or not name_value:
        return

    key = (policy_type_value.lower(), name_value.lower(), value_value.lower(), source_path, int(line or 1))
    if key in seen or len(facts["repo_policies"]) >= MAX_REPO_POLICY_FACTS:
        return
    seen.add(key)
    facts["repo_policies"].append({
        "policy_type": policy_type_value,
        "name": name_value,
        "value": value_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:200],
    })


def _append_code_owner(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    pattern: str,
    owners: List[str],
    source_path: str,
    line: int,
) -> None:
    pattern_value = " ".join(str(pattern or "").split())[:200]
    owner_values = [str(owner).strip()[:120] for owner in owners if str(owner).strip()]
    if not pattern_value or not owner_values:
        return

    key = (pattern_value.lower(), tuple(owner_values), source_path, int(line or 1))
    if key in seen or len(facts["code_owners"]) >= MAX_CODE_OWNER_FACTS:
        return
    seen.add(key)
    facts["code_owners"].append({
        "pattern": pattern_value,
        "owners": owner_values[:12],
        "source_path": source_path,
        "line": int(line or 1),
        "detail": f"{pattern_value} owned by {' '.join(owner_values[:12])}"[:240],
    })


def _append_deploy_target(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    provider: str,
    target_type: str,
    name: str,
    source_path: str,
    line: int,
    detail: str = "",
) -> None:
    provider_value = " ".join(str(provider or "").split())[:80]
    target_type_value = " ".join(str(target_type or "").split())[:100]
    name_value = " ".join(str(name or "").split())[:160]
    if not provider_value or not target_type_value or not name_value:
        return

    key = (provider_value.lower(), target_type_value.lower(), name_value.lower(), source_path, int(line or 1))
    if key in seen or len(facts["deploy_targets"]) >= MAX_DEPLOY_TARGET_FACTS:
        return
    seen.add(key)
    facts["deploy_targets"].append({
        "provider": provider_value,
        "target_type": target_type_value,
        "name": name_value,
        "source_path": source_path,
        "line": int(line or 1),
        "detail": str(detail or "")[:240],
    })


def _append_secret_signal(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    source_path: str,
    line: int,
    source: str,
    has_value: bool,
) -> None:
    name_value = " ".join(str(name or "").strip().split())[:160]
    category_value = " ".join(str(category or "").strip().split())[:80]
    if not name_value or not category_value:
        return

    key = (name_value.lower(), category_value.lower(), source_path, int(line or 1), str(source or ""))
    if key in seen or len(facts["secret_signals"]) >= MAX_SECRET_SIGNAL_FACTS:
        return
    seen.add(key)
    facts["secret_signals"].append({
        "name": name_value,
        "category": category_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "has_value": bool(has_value),
        "detail": f"{category_value} signal; value redacted",
    })


def _is_license_path(relative_path: Path, name: str) -> bool:
    parts = [part.lower() for part in relative_path.parts]
    if any(part in {".github", "docs", "doc"} for part in parts[:-1]):
        return name in {"license", "license.md", "license.txt", "copying", "copying.md", "copying.txt"}
    return name in {"license", "license.md", "license.txt", "copying", "copying.md", "copying.txt"}


def _is_repo_policy_path(relative_path: Path, name: str) -> bool:
    stem = PurePosixPath(name).stem.lower()
    if stem in {"security", "contributing", "code_of_conduct", "code-of-conduct"}:
        return True
    parts = [part.lower() for part in relative_path.parts]
    return len(parts) >= 2 and parts[0] == ".github" and stem in {"security", "contributing", "code_of_conduct", "code-of-conduct"}


def _is_codeowners_path(relative_path: Path, name: str) -> bool:
    if name != "codeowners":
        return False
    parts = [part.lower() for part in relative_path.parts]
    return len(parts) == 1 or parts[:1] == [".github"] or parts[:1] in (["docs"], ["doc"])


def _extract_license_policy(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_repo_policies: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    detected = _detect_license_name(text)
    _append_repo_policy(
        facts,
        seen_repo_policies,
        policy_type="license",
        name="license",
        value=detected,
        source_path=source_path,
        line=1,
        source="license-file",
        detail=PurePosixPath(source_path).name,
    )


def _extract_repo_policy_file(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_repo_policies: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    name = PurePosixPath(source_path).name.lower()
    stem = PurePosixPath(name).stem.lower().replace("-", "_")
    policy_type = {
        "security": "security",
        "contributing": "contributing",
        "code_of_conduct": "code_of_conduct",
    }.get(stem)
    if not policy_type:
        return
    heading, line = _first_markdown_heading(text)
    label = heading or policy_type.replace("_", " ")
    _append_repo_policy(
        facts,
        seen_repo_policies,
        policy_type=policy_type,
        name=policy_type.replace("_", " "),
        value=label,
        source_path=source_path,
        line=line or 1,
        source="policy-file",
        detail=PurePosixPath(source_path).name,
    )


def _extract_codeowners(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_code_owners: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        _append_code_owner(
            facts,
            seen_code_owners,
            pattern=parts[0],
            owners=parts[1:],
            source_path=source_path,
            line=line_number,
        )


LOCKFILE_SUPPLY_CHAIN: Dict[str, tuple[str, str]] = {
    "package-lock.json": ("npm", "JavaScript/TypeScript"),
    "npm-shrinkwrap.json": ("npm", "JavaScript/TypeScript"),
    "pnpm-lock.yaml": ("pnpm", "JavaScript/TypeScript"),
    "yarn.lock": ("Yarn", "JavaScript/TypeScript"),
    "bun.lock": ("Bun", "JavaScript/TypeScript"),
    "bun.lockb": ("Bun", "JavaScript/TypeScript"),
    "poetry.lock": ("Poetry", "Python"),
    "pdm.lock": ("PDM", "Python"),
    "uv.lock": ("uv", "Python"),
    "pipfile.lock": ("Pipenv", "Python"),
    "cargo.lock": ("Cargo", "Rust"),
    "go.sum": ("Go modules", "Go"),
    "composer.lock": ("Composer", "PHP"),
    "gemfile.lock": ("Bundler", "Ruby"),
    "packages.lock.json": ("NuGet", ".NET"),
    "gradle.lockfile": ("Gradle", "JVM"),
    "mix.lock": ("Mix", "Elixir"),
}


def _append_supply_chain(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    tool: str,
    ecosystem: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").strip().split())[:160]
    category_value = " ".join(str(category or "").strip().split())[:80]
    tool_value = " ".join(str(tool or "").strip().split())[:120]
    ecosystem_value = " ".join(str(ecosystem or "").strip().split())[:80]
    if not name_value or not category_value:
        return

    key = (category_value.lower(), name_value.lower(), tool_value.lower(), source_path, int(line or 1))
    if key in seen or len(facts["supply_chain"]) >= MAX_SUPPLY_CHAIN_FACTS:
        return
    seen.add(key)
    facts["supply_chain"].append({
        "name": name_value,
        "category": category_value,
        "tool": tool_value,
        "ecosystem": ecosystem_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:240],
    })


def _is_supply_chain_path(relative_path: Path, name: str) -> bool:
    parts = [part.lower() for part in relative_path.parts]
    suffix = PurePosixPath(name).suffix.lower()
    if name in LOCKFILE_SUPPLY_CHAIN:
        return True
    if name in {"dependabot.yml", "dependabot.yaml"} and parts[:1] == [".github"]:
        return True
    if name in {"renovate.json", "renovate.json5", ".renovaterc", ".renovaterc.json", ".renovaterc.json5"}:
        return True
    if name in {".snyk", "snyk.json", "snyk.yml", "snyk.yaml", "snyk.config.json"}:
        return True
    if len(parts) >= 3 and parts[0] == ".github" and parts[1] == "workflows" and name.endswith((".yml", ".yaml")):
        return True
    if "sbom" in name or "cyclonedx" in name:
        return suffix in {".json", ".xml", ".spdx", ".yml", ".yaml", ".txt"}
    if name in {"bom.json", "bom.xml"} or name.endswith((".cdx.json", ".spdx", ".spdx.json")):
        return True
    return False


def _extract_supply_chain(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_supply_chain: set,
) -> None:
    name = file_path.name.lower()
    if name in LOCKFILE_SUPPLY_CHAIN:
        tool, ecosystem = LOCKFILE_SUPPLY_CHAIN[name]
        _append_supply_chain(
            facts,
            seen_supply_chain,
            name=PurePosixPath(source_path).name,
            category="lockfile",
            tool=tool,
            ecosystem=ecosystem,
            source_path=source_path,
            line=1,
            source="lockfile",
            detail=f"{tool} dependency lockfile",
        )
        return

    text = _read_text_file(file_path)
    if text is None:
        return

    if name in {"dependabot.yml", "dependabot.yaml"}:
        _extract_dependabot_supply_chain(text, source_path, facts, seen_supply_chain)
    elif name in {"renovate.json", "renovate.json5", ".renovaterc", ".renovaterc.json", ".renovaterc.json5"}:
        _append_supply_chain(
            facts,
            seen_supply_chain,
            name="Renovate",
            category="dependency automation",
            tool="Renovate",
            ecosystem="multi",
            source_path=source_path,
            line=_line_number_for_key(text, "extends") or 1,
            source="config",
            detail=_renovate_detail(text),
        )
    elif name in {".snyk", "snyk.json", "snyk.yml", "snyk.yaml", "snyk.config.json"}:
        _append_supply_chain(
            facts,
            seen_supply_chain,
            name="Snyk",
            category="vulnerability scan",
            tool="Snyk",
            ecosystem="multi",
            source_path=source_path,
            line=1,
            source="config",
            detail="Snyk vulnerability policy/config",
        )
    elif _is_workflow_supply_chain_path(source_path):
        _extract_workflow_supply_chain(text, source_path, facts, seen_supply_chain)
    elif _is_sbom_supply_chain_path(source_path):
        _append_supply_chain(
            facts,
            seen_supply_chain,
            name=PurePosixPath(source_path).name,
            category="sbom",
            tool=_sbom_tool_from_name(source_path),
            ecosystem="multi",
            source_path=source_path,
            line=1,
            source="sbom",
            detail="Software bill of materials file",
        )


def _extract_dependabot_supply_chain(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_supply_chain: set,
) -> None:
    current_ecosystem = ""
    current_directory = ""
    current_line = 1
    current_interval = ""
    entries: List[tuple[str, str, int, str]] = []
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        stripped = raw_line.strip().strip("'\"")
        package_prefix = re.match(r"^-?\s*package-ecosystem\s*:\s*(.+?)\s*$", stripped)
        if package_prefix:
            if current_ecosystem:
                entries.append((current_ecosystem, current_directory, current_line, current_interval))
            current_ecosystem = package_prefix.group(1).strip().strip("'\"")
            current_directory = ""
            current_interval = ""
            current_line = line_number
        elif current_ecosystem and stripped.startswith("directory:"):
            current_directory = stripped.split(":", 1)[1].strip().strip("'\"")
        elif current_ecosystem and stripped.startswith("interval:"):
            current_interval = stripped.split(":", 1)[1].strip().strip("'\"")
    if current_ecosystem:
        entries.append((current_ecosystem, current_directory, current_line, current_interval))

    if not entries and "package-ecosystem" in text:
        entries.append(("configured", "", _line_number_for_key(text, "package-ecosystem") or 1, ""))

    for ecosystem, directory, line, interval in entries:
        detail_parts = [f"Dependabot updates {ecosystem}"]
        if directory:
            detail_parts.append(f"in {directory}")
        if interval:
            detail_parts.append(f"on a {interval} schedule")
        _append_supply_chain(
            facts,
            seen_supply_chain,
            name=f"Dependabot {ecosystem}".strip(),
            category="dependency automation",
            tool="Dependabot",
            ecosystem=_dependabot_ecosystem_label(ecosystem),
            source_path=source_path,
            line=line,
            source="config",
            detail=" ".join(detail_parts),
        )


def _extract_workflow_supply_chain(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_supply_chain: set,
) -> None:
    lower = text.lower()
    workflow_tools = (
        ("github/codeql-action", "CodeQL", "security scan", "GitHub CodeQL workflow"),
        ("actions/dependency-review-action", "Dependency Review", "dependency review", "GitHub dependency review workflow"),
        ("ossf/scorecard-action", "OpenSSF Scorecard", "security scorecard", "OpenSSF Scorecard workflow"),
        ("snyk/actions", "Snyk", "vulnerability scan", "Snyk workflow scan"),
        ("aquasecurity/trivy-action", "Trivy", "vulnerability scan", "Trivy workflow scan"),
        ("anchore/scan-action", "Anchore", "vulnerability scan", "Anchore workflow scan"),
        ("returntocorp/semgrep-action", "Semgrep", "static analysis", "Semgrep workflow scan"),
        ("semgrep/semgrep-action", "Semgrep", "static analysis", "Semgrep workflow scan"),
    )
    for needle, tool, category, detail in workflow_tools:
        if needle not in lower:
            continue
        _append_supply_chain(
            facts,
            seen_supply_chain,
            name=tool,
            category=category,
            tool=tool,
            ecosystem="multi",
            source_path=source_path,
            line=_line_number_for_text(text, needle) or _line_number_for_text(text, tool) or 1,
            source="workflow",
            detail=detail,
        )


def _renovate_detail(text: str) -> str:
    if "schedule" in text.lower():
        return "Renovate dependency automation with schedule rules"
    if "packageRules" in text or "package-rules" in text.lower():
        return "Renovate dependency automation with package rules"
    return "Renovate dependency automation config"


def _dependabot_ecosystem_label(ecosystem: str) -> str:
    normalized = str(ecosystem or "").lower()
    if normalized == "npm":
        return "JavaScript/TypeScript"
    if normalized == "github-actions":
        return "GitHub Actions"
    if normalized in {"pip", "pip-compile", "poetry"}:
        return "Python"
    if normalized in {"gomod", "go"}:
        return "Go"
    if normalized == "cargo":
        return "Rust"
    if normalized == "bundler":
        return "Ruby"
    if normalized == "composer":
        return "PHP"
    if normalized == "nuget":
        return ".NET"
    if normalized == "docker":
        return "Docker"
    return ecosystem or "multi"


def _is_workflow_supply_chain_path(source_path: str) -> bool:
    parts = [part.lower() for part in PurePosixPath(source_path).parts]
    return len(parts) >= 3 and parts[0] == ".github" and parts[1] == "workflows"


def _is_sbom_supply_chain_path(source_path: str) -> bool:
    name = PurePosixPath(source_path).name.lower()
    return (
        "sbom" in name
        or "cyclonedx" in name
        or name in {"bom.json", "bom.xml"}
        or name.endswith((".cdx.json", ".spdx", ".spdx.json"))
    )


def _sbom_tool_from_name(source_path: str) -> str:
    name = PurePosixPath(source_path).name.lower()
    if "cyclonedx" in name or name in {"bom.json", "bom.xml"} or name.endswith(".cdx.json"):
        return "CycloneDX"
    if "spdx" in name or name.endswith(".spdx.json"):
        return "SPDX"
    return "SBOM"


def _append_api_contract(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    protocol: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").strip().split())[:180]
    category_value = " ".join(str(category or "").strip().split())[:80]
    protocol_value = " ".join(str(protocol or "").strip().split())[:80]
    if not name_value or not category_value:
        return

    key = (protocol_value.lower(), category_value.lower(), name_value.lower(), source_path, int(line or 1))
    if key in seen or len(facts["api_contracts"]) >= MAX_API_CONTRACT_FACTS:
        return
    seen.add(key)
    facts["api_contracts"].append({
        "name": name_value,
        "category": category_value,
        "protocol": protocol_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:240],
    })


def _is_api_contract_path(relative_path: Path, name: str) -> bool:
    lower_path = _to_posix(relative_path).lower()
    suffix = PurePosixPath(name).suffix.lower()
    suffixes = "".join(PurePosixPath(name).suffixes).lower()
    if suffix == ".proto":
        return True
    if name.endswith(".postman_collection.json") or "postman" in name and suffix == ".json":
        return True
    if any(token in lower_path for token in ("openapi", "swagger", "asyncapi")) and suffix in {".json", ".yaml", ".yml"}:
        return True
    if name in {
        "openapi.json",
        "openapi.yaml",
        "openapi.yml",
        "swagger.json",
        "swagger.yaml",
        "swagger.yml",
        "asyncapi.json",
        "asyncapi.yaml",
        "asyncapi.yml",
    }:
        return True
    if suffixes.endswith(".openapi.json") or suffixes.endswith(".openapi.yaml") or suffixes.endswith(".openapi.yml"):
        return True
    return False


def _extract_api_contracts(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_api_contracts: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return

    name = PurePosixPath(source_path).name.lower()
    suffix = PurePosixPath(name).suffix.lower()
    if suffix == ".proto":
        _extract_proto_api_contracts(text, source_path, facts, seen_api_contracts)
        return

    payload = None
    if suffix == ".json":
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = None

    if isinstance(payload, dict):
        if _looks_like_postman_collection(payload, name):
            _extract_postman_api_contracts(payload, text, source_path, facts, seen_api_contracts)
        elif payload.get("openapi") or payload.get("swagger"):
            _extract_openapi_json_contracts(payload, text, source_path, facts, seen_api_contracts)
        elif payload.get("asyncapi"):
            _extract_asyncapi_json_contracts(payload, text, source_path, facts, seen_api_contracts)
        return

    if _looks_like_openapi_text(text):
        _extract_openapi_text_contracts(text, source_path, facts, seen_api_contracts)
    elif _looks_like_asyncapi_text(text):
        _extract_asyncapi_text_contracts(text, source_path, facts, seen_api_contracts)


def _extract_openapi_json_contracts(
    payload: Dict[str, Any],
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_api_contracts: set,
) -> None:
    info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
    title = _clean_contract_name(info.get("title")) or PurePosixPath(source_path).stem
    version = str(payload.get("openapi") or payload.get("swagger") or "").strip()
    _append_api_contract(
        facts,
        seen_api_contracts,
        name=title,
        category="document",
        protocol="OpenAPI",
        source_path=source_path,
        line=_line_number_for_key(text, "openapi") or _line_number_for_key(text, "swagger") or 1,
        source="openapi",
        detail=f"OpenAPI contract {version}".strip(),
    )

    paths = payload.get("paths") if isinstance(payload.get("paths"), dict) else {}
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            method_value = str(method or "").upper()
            if method_value not in HTTP_METHODS:
                continue
            operation_name = ""
            if isinstance(operation, dict):
                operation_name = _clean_contract_name(operation.get("operationId") or operation.get("summary"))
            display = f"{method_value} {path}"
            detail = f"OpenAPI operation {operation_name}" if operation_name else "OpenAPI operation"
            _append_api_contract(
                facts,
                seen_api_contracts,
                name=display,
                category="operation",
                protocol="OpenAPI",
                source_path=source_path,
                line=_line_number_for_text(text, str(path)) or _line_number_for_text(text, method_value.lower()) or 1,
                source="openapi",
                detail=detail,
            )

    components = payload.get("components") if isinstance(payload.get("components"), dict) else {}
    schemas = components.get("schemas") if isinstance(components.get("schemas"), dict) else {}
    if not schemas and isinstance(payload.get("definitions"), dict):
        schemas = payload.get("definitions") or {}
    for schema_name in schemas.keys():
        _append_api_contract(
            facts,
            seen_api_contracts,
            name=str(schema_name),
            category="schema",
            protocol="OpenAPI",
            source_path=source_path,
            line=_line_number_for_text(text, str(schema_name)) or 1,
            source="openapi",
            detail="OpenAPI schema component",
        )


def _extract_openapi_text_contracts(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_api_contracts: set,
) -> None:
    title = _yaml_scalar_value(text, "title") or PurePosixPath(source_path).stem
    version = _yaml_scalar_value(text, "openapi") or _yaml_scalar_value(text, "swagger")
    _append_api_contract(
        facts,
        seen_api_contracts,
        name=title,
        category="document",
        protocol="OpenAPI",
        source_path=source_path,
        line=_line_number_for_key(text, "openapi") or _line_number_for_key(text, "swagger") or 1,
        source="openapi",
        detail=f"OpenAPI contract {version}".strip(),
    )

    for line, method, path in _openapi_text_operations(text):
        _append_api_contract(
            facts,
            seen_api_contracts,
            name=f"{method.upper()} {path}",
            category="operation",
            protocol="OpenAPI",
            source_path=source_path,
            line=line,
            source="openapi",
            detail="OpenAPI operation",
        )

    for schema_name, line in _yaml_map_entries_under_path(text, ("components", "schemas")):
        _append_api_contract(
            facts,
            seen_api_contracts,
            name=schema_name,
            category="schema",
            protocol="OpenAPI",
            source_path=source_path,
            line=line,
            source="openapi",
            detail="OpenAPI schema component",
        )


def _extract_asyncapi_json_contracts(
    payload: Dict[str, Any],
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_api_contracts: set,
) -> None:
    info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
    title = _clean_contract_name(info.get("title")) or PurePosixPath(source_path).stem
    _append_api_contract(
        facts,
        seen_api_contracts,
        name=title,
        category="document",
        protocol="AsyncAPI",
        source_path=source_path,
        line=_line_number_for_key(text, "asyncapi") or 1,
        source="asyncapi",
        detail=f"AsyncAPI contract {payload.get('asyncapi') or ''}".strip(),
    )

    channels = payload.get("channels") if isinstance(payload.get("channels"), dict) else {}
    for channel_name in channels.keys():
        _append_api_contract(
            facts,
            seen_api_contracts,
            name=str(channel_name),
            category="channel",
            protocol="AsyncAPI",
            source_path=source_path,
            line=_line_number_for_text(text, str(channel_name)) or 1,
            source="asyncapi",
            detail="AsyncAPI channel",
        )

    components = payload.get("components") if isinstance(payload.get("components"), dict) else {}
    messages = components.get("messages") if isinstance(components.get("messages"), dict) else {}
    for message_name in messages.keys():
        _append_api_contract(
            facts,
            seen_api_contracts,
            name=str(message_name),
            category="message",
            protocol="AsyncAPI",
            source_path=source_path,
            line=_line_number_for_text(text, str(message_name)) or 1,
            source="asyncapi",
            detail="AsyncAPI message component",
        )


def _extract_asyncapi_text_contracts(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_api_contracts: set,
) -> None:
    title = _yaml_scalar_value(text, "title") or PurePosixPath(source_path).stem
    _append_api_contract(
        facts,
        seen_api_contracts,
        name=title,
        category="document",
        protocol="AsyncAPI",
        source_path=source_path,
        line=_line_number_for_key(text, "asyncapi") or 1,
        source="asyncapi",
        detail=f"AsyncAPI contract {_yaml_scalar_value(text, 'asyncapi')}".strip(),
    )
    for channel_name, line in _yaml_map_entries_under_path(text, ("channels",)):
        _append_api_contract(
            facts,
            seen_api_contracts,
            name=channel_name,
            category="channel",
            protocol="AsyncAPI",
            source_path=source_path,
            line=line,
            source="asyncapi",
            detail="AsyncAPI channel",
        )
    for message_name, line in _yaml_map_entries_under_path(text, ("components", "messages")):
        _append_api_contract(
            facts,
            seen_api_contracts,
            name=message_name,
            category="message",
            protocol="AsyncAPI",
            source_path=source_path,
            line=line,
            source="asyncapi",
            detail="AsyncAPI message component",
        )


def _extract_postman_api_contracts(
    payload: Dict[str, Any],
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_api_contracts: set,
) -> None:
    info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
    collection_name = _clean_contract_name(info.get("name")) or PurePosixPath(source_path).stem
    _append_api_contract(
        facts,
        seen_api_contracts,
        name=collection_name,
        category="collection",
        protocol="Postman",
        source_path=source_path,
        line=_line_number_for_key(text, "info") or 1,
        source="postman",
        detail="Postman collection",
    )
    for request in _postman_requests(payload.get("item")):
        request_name = _clean_contract_name(request.get("name")) or request.get("url") or "request"
        method = str(request.get("method") or "").upper()
        display = f"{method} {request_name}".strip()
        _append_api_contract(
            facts,
            seen_api_contracts,
            name=display,
            category="request",
            protocol="Postman",
            source_path=source_path,
            line=_line_number_for_text(text, str(request_name)) or _line_number_for_text(text, str(request.get("url") or "")) or 1,
            source="postman",
            detail=request.get("url") or "Postman request",
        )


def _extract_proto_api_contracts(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_api_contracts: set,
) -> None:
    package_name = _proto_package(text)
    for match in re.finditer(r"(?m)^\s*service\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{", text):
        service_name = match.group(1)
        _append_api_contract(
            facts,
            seen_api_contracts,
            name=service_name,
            category="service",
            protocol="gRPC",
            source_path=source_path,
            line=_line_number(text, match.start()),
            source="protobuf",
            detail=f"protobuf service{f' in {package_name}' if package_name else ''}",
        )

    for match in re.finditer(r"(?m)^\s*rpc\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*returns\s*\(([^)]*)\)", text):
        rpc_name = match.group(1)
        request_type = " ".join(match.group(2).split())
        response_type = " ".join(match.group(3).split())
        _append_api_contract(
            facts,
            seen_api_contracts,
            name=rpc_name,
            category="rpc",
            protocol="gRPC",
            source_path=source_path,
            line=_line_number(text, match.start()),
            source="protobuf",
            detail=f"{request_type} -> {response_type}".strip(" ->"),
        )

    for match in re.finditer(r"(?m)^\s*message\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{", text):
        message_name = match.group(1)
        _append_api_contract(
            facts,
            seen_api_contracts,
            name=message_name,
            category="message",
            protocol="Protocol Buffers",
            source_path=source_path,
            line=_line_number(text, match.start()),
            source="protobuf",
            detail="protobuf message",
        )


def _looks_like_postman_collection(payload: Dict[str, Any], name: str) -> bool:
    info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
    schema = str(info.get("schema") or "").lower()
    return "postman" in schema or name.endswith(".postman_collection.json")


def _looks_like_openapi_text(text: str) -> bool:
    return bool(re.search(r"(?m)^\s*(openapi|swagger)\s*:", text))


def _looks_like_asyncapi_text(text: str) -> bool:
    return bool(re.search(r"(?m)^\s*asyncapi\s*:", text))


def _openapi_text_operations(text: str) -> List[tuple[int, str, str]]:
    operations: List[tuple[int, str, str]] = []
    current_path = ""
    current_indent = 0
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        path_match = re.match(r"['\"]?(/[^:'\"]*)['\"]?\s*:\s*(?:#.*)?$", stripped)
        if path_match:
            current_path = path_match.group(1).strip()
            current_indent = indent
            continue
        method_match = re.match(r"(get|post|put|patch|delete|options|head)\s*:\s*(?:#.*)?$", stripped, flags=re.IGNORECASE)
        if current_path and method_match and indent > current_indent:
            operations.append((line_number, method_match.group(1).upper(), current_path))
    return operations


def _yaml_map_entries_under_path(text: str, path: tuple[str, ...]) -> List[tuple[str, int]]:
    if not path:
        return []
    entries: List[tuple[str, int]] = []
    stack: List[tuple[int, str]] = []
    target_indent: Optional[int] = None
    in_target = False
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("-"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        key_match = re.match(r"['\"]?([^:'\"]+)['\"]?\s*:\s*(?:#.*)?$", stripped)
        if not key_match:
            continue
        key = key_match.group(1).strip()
        while stack and indent <= stack[-1][0]:
            stack.pop()
        stack.append((indent, key))
        names = tuple(item[1] for item in stack)
        if names == path:
            target_indent = indent
            in_target = True
            continue
        if in_target:
            if target_indent is None or indent <= target_indent:
                in_target = False
                target_indent = None
            elif len(names) == len(path) + 1 and names[:len(path)] == path:
                entries.append((key, line_number))
    return entries


def _postman_requests(items: Any) -> List[Dict[str, str]]:
    requests: List[Dict[str, str]] = []
    if not isinstance(items, list):
        return requests
    for item in items:
        if not isinstance(item, dict):
            continue
        raw_request = item.get("request")
        if isinstance(raw_request, dict):
            method = str(raw_request.get("method") or "")
            url = _postman_url(raw_request.get("url"))
            requests.append({"name": str(item.get("name") or ""), "method": method, "url": url})
        requests.extend(_postman_requests(item.get("item")))
    return requests[:MAX_API_CONTRACT_FACTS]


def _postman_url(raw_url: Any) -> str:
    if isinstance(raw_url, str):
        return raw_url[:180]
    if isinstance(raw_url, dict):
        raw = raw_url.get("raw")
        if raw:
            return str(raw)[:180]
        path = raw_url.get("path")
        if isinstance(path, list):
            joined = "/" + "/".join(str(part).strip("/") for part in path if str(part).strip())
            return joined[:180]
    return ""


def _proto_package(text: str) -> str:
    match = re.search(r"(?m)^\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;", text)
    return match.group(1) if match else ""


def _clean_contract_name(value: Any) -> str:
    return " ".join(str(value or "").strip().strip("'\"").split())


def _append_cli_command(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    command: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").strip().split())[:180]
    category_value = " ".join(str(category or "").strip().split())[:80]
    command_value = " ".join(str(command or "").strip().split())[:240]
    if not name_value or not category_value or not command_value:
        return

    key = (category_value.lower(), name_value.lower(), command_value.lower(), source_path, int(line or 1))
    if key in seen or len(facts["cli_commands"]) >= MAX_CLI_COMMAND_FACTS:
        return
    seen.add(key)
    facts["cli_commands"].append({
        "name": name_value,
        "category": category_value,
        "command": command_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:240],
    })


def _is_cli_command_path(relative_path: Path, name: str) -> bool:
    parts = [part.lower() for part in relative_path.parts]
    if name in {"package.json", "pyproject.toml", "setup.cfg", "setup.py", "cargo.toml"}:
        return True
    if name.endswith(".gemspec"):
        return True
    if len(parts) >= 3 and parts[0] == "cmd" and parts[-1] == "main.go":
        return True
    if parts and {"bin", "exe"}.intersection(parts[:-1]) and not name.startswith("."):
        suffix = PurePosixPath(name).suffix.lower()
        return suffix not in {".md", ".txt", ".json", ".lock", ".map", ".png", ".jpg", ".jpeg", ".gif", ".svg"}
    return False


def _extract_cli_commands(
    file_path: Path,
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_cli_commands: set,
) -> None:
    name = file_path.name.lower()
    if name == "package.json":
        _extract_package_json_cli_commands(file_path, source_path, facts, seen_cli_commands)
    elif name == "pyproject.toml":
        _extract_pyproject_cli_commands(file_path, source_path, facts, seen_cli_commands)
    elif name == "setup.cfg":
        _extract_setup_cfg_cli_commands(file_path, source_path, facts, seen_cli_commands)
    elif name == "setup.py":
        _extract_setup_py_cli_commands(file_path, source_path, facts, seen_cli_commands)
    elif name == "cargo.toml":
        _extract_cargo_cli_commands(file_path, source_path, facts, seen_cli_commands)
    elif name.endswith(".gemspec"):
        _extract_gemspec_cli_commands(file_path, source_path, facts, seen_cli_commands)
    elif _is_go_cmd_main(relative_path):
        _extract_go_cmd_cli_command(relative_path, source_path, facts, seen_cli_commands)
    else:
        _extract_shebang_cli_command(file_path, source_path, facts, seen_cli_commands)


def _extract_package_json_cli_commands(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_cli_commands: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return

    raw_bin = data.get("bin")
    if isinstance(raw_bin, str):
        command_name = _node_package_command_name(data, source_path)
        _append_cli_command(
            facts,
            seen_cli_commands,
            name=command_name,
            category="node bin",
            command=command_name,
            source_path=source_path,
            line=_line_number_for_key(text, "bin") or 1,
            source="package-bin",
            detail=f"package bin target {raw_bin.strip()}",
        )
    elif isinstance(raw_bin, dict):
        for raw_name, raw_target in sorted(raw_bin.items()):
            if not isinstance(raw_name, str) or not isinstance(raw_target, str):
                continue
            command_name = raw_name.strip()
            target = raw_target.strip()
            if not command_name or not target:
                continue
            _append_cli_command(
                facts,
                seen_cli_commands,
                name=command_name,
                category="node bin",
                command=command_name,
                source_path=source_path,
                line=_line_number_for_text(text, command_name) or _line_number_for_key(text, "bin") or 1,
                source="package-bin",
                detail=f"package bin target {target}",
            )


def _extract_pyproject_cli_commands(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_cli_commands: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_toml_text(text)
    if not isinstance(data, dict):
        return

    project = data.get("project") if isinstance(data.get("project"), dict) else {}
    for section_name, category in (("scripts", "python console script"), ("gui-scripts", "python gui script")):
        scripts = project.get(section_name) if isinstance(project.get(section_name), dict) else {}
        _append_python_cli_script_entries(
            scripts,
            category,
            "pyproject-scripts",
            text,
            source_path,
            facts,
            seen_cli_commands,
        )

    tool = data.get("tool") if isinstance(data.get("tool"), dict) else {}
    poetry = tool.get("poetry") if isinstance(tool.get("poetry"), dict) else {}
    poetry_scripts = poetry.get("scripts") if isinstance(poetry.get("scripts"), dict) else {}
    _append_python_cli_script_entries(
        poetry_scripts,
        "poetry script",
        "poetry-scripts",
        text,
        source_path,
        facts,
        seen_cli_commands,
    )


def _extract_setup_cfg_cli_commands(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_cli_commands: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    parser = configparser.RawConfigParser()
    try:
        parser.read_string(text)
    except configparser.Error:
        return
    if not parser.has_section("options.entry_points"):
        return
    section = parser["options.entry_points"]
    for group, category in (("console_scripts", "python console script"), ("gui_scripts", "python gui script")):
        if group not in section:
            continue
        for command_name, target, line in _python_entry_point_lines(section.get(group, ""), text):
            _append_cli_command(
                facts,
                seen_cli_commands,
                name=command_name,
                category=category,
                command=command_name,
                source_path=source_path,
                line=line,
                source="setup-cfg-entry-points",
                detail=target,
            )


def _extract_setup_py_cli_commands(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_cli_commands: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for group, category in (("console_scripts", "python console script"), ("gui_scripts", "python gui script")):
        pattern = re.compile(rf"['\"]{re.escape(group)}['\"]\s*:\s*\[(?P<body>.*?)\]", re.DOTALL)
        for match in pattern.finditer(text):
            body = match.group("body")
            for item_match in re.finditer(r"['\"]([^'\"]+=[^'\"]+)['\"]", body):
                command_name, target = _split_python_entry_point(item_match.group(1))
                if not command_name:
                    continue
                _append_cli_command(
                    facts,
                    seen_cli_commands,
                    name=command_name,
                    category=category,
                    command=command_name,
                    source_path=source_path,
                    line=_line_number(text, match.start("body") + item_match.start()),
                    source="setup-py-entry-points",
                    detail=target,
                )


def _extract_cargo_cli_commands(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_cli_commands: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_toml_text(text)
    if not isinstance(data, dict):
        return

    raw_bins = data.get("bin")
    bins = raw_bins if isinstance(raw_bins, list) else ([raw_bins] if isinstance(raw_bins, dict) else [])
    for item in bins:
        if not isinstance(item, dict):
            continue
        command_name = str(item.get("name") or "").strip()
        if not command_name:
            continue
        target = str(item.get("path") or f"src/bin/{command_name}.rs").strip()
        _append_cli_command(
            facts,
            seen_cli_commands,
            name=command_name,
            category="rust binary",
            command=f"cargo run --bin {command_name}",
            source_path=source_path,
            line=_line_number_for_text(text, command_name) or _line_number_for_key(text, "bin") or 1,
            source="cargo-bin",
            detail=f"Cargo binary target {target}",
        )


def _extract_gemspec_cli_commands(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_cli_commands: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for match in re.finditer(r"\.executables\s*=\s*(?:%w\[(?P<words>[^\]]+)\]|\[(?P<array>[^\]]+)\])", text):
        raw_names = match.group("words")
        if raw_names is not None:
            names = [item.strip() for item in raw_names.split()]
        else:
            names = [item.strip() for item in re.findall(r"['\"]([^'\"]+)['\"]", match.group("array") or "")]
        for command_name in names:
            if not command_name:
                continue
            _append_cli_command(
                facts,
                seen_cli_commands,
                name=command_name,
                category="ruby executable",
                command=command_name,
                source_path=source_path,
                line=_line_number(text, match.start()),
                source="gemspec-executables",
                detail="Ruby gem executable",
            )


def _extract_go_cmd_cli_command(
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_cli_commands: set,
) -> None:
    parts = list(relative_path.parts)
    if len(parts) < 3:
        return
    command_name = str(parts[1]).strip()
    if not command_name:
        return
    _append_cli_command(
        facts,
        seen_cli_commands,
        name=command_name,
        category="go command",
        command=f"go run ./cmd/{command_name}",
        source_path=source_path,
        line=1,
        source="go-cmd",
        detail="Go command entry point",
    )


def _extract_shebang_cli_command(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_cli_commands: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    first_line = text.splitlines()[0].strip() if text.splitlines() else ""
    if not first_line.startswith("#!"):
        return
    command_name = PurePosixPath(source_path).name
    _append_cli_command(
        facts,
        seen_cli_commands,
        name=command_name,
        category=_shebang_cli_category(first_line),
        command=f"./{source_path}",
        source_path=source_path,
        line=1,
        source="shebang",
        detail=first_line[2:].strip(),
    )


def _append_python_cli_script_entries(
    scripts: Dict[str, Any],
    category: str,
    source: str,
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_cli_commands: set,
) -> None:
    for raw_name, raw_target in sorted(scripts.items()):
        command_name = str(raw_name or "").strip()
        target = _python_script_target_text(raw_target)
        if not command_name or not target:
            continue
        _append_cli_command(
            facts,
            seen_cli_commands,
            name=command_name,
            category=category,
            command=command_name,
            source_path=source_path,
            line=_line_number_for_text(text, command_name) or 1,
            source=source,
            detail=target,
        )


def _python_entry_point_lines(raw_value: str, full_text: str) -> List[tuple[str, str, int]]:
    entries: List[tuple[str, str, int]] = []
    for raw_line in str(raw_value or "").splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        cleaned = stripped.split("#", 1)[0].strip().rstrip(",")
        command_name, target = _split_python_entry_point(cleaned)
        if not command_name:
            continue
        line = _line_number_for_text(full_text, cleaned) or _line_number_for_text(full_text, command_name) or 1
        entries.append((command_name, target, line))
    return entries


def _split_python_entry_point(value: str) -> tuple[str, str]:
    if "=" not in value:
        return "", ""
    command_name, target = value.split("=", 1)
    return command_name.strip(), target.strip()


def _python_script_target_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in ("callable", "reference", "cmd", "script"):
            raw = value.get(key)
            if isinstance(raw, str) and raw.strip():
                return raw.strip()
    return ""


def _node_package_command_name(data: Dict[str, Any], source_path: str) -> str:
    package_name = data.get("name") if isinstance(data.get("name"), str) else ""
    package_name = package_name.strip()
    if package_name:
        return package_name.rsplit("/", 1)[-1]
    parent = PurePosixPath(source_path).parent
    return parent.name if str(parent) not in {"", "."} else "node-cli"


def _is_go_cmd_main(relative_path: Path) -> bool:
    parts = [part.lower() for part in relative_path.parts]
    return len(parts) >= 3 and parts[0] == "cmd" and parts[-1] == "main.go"


def _shebang_cli_category(first_line: str) -> str:
    lower = first_line.lower()
    if "python" in lower:
        return "python executable"
    if "node" in lower or "deno" in lower or "bun" in lower:
        return "node executable"
    if "ruby" in lower:
        return "ruby executable"
    if any(shell in lower for shell in ("sh", "bash", "zsh", "fish")):
        return "shell executable"
    return "script executable"


def _append_test_system(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    tool: str,
    command: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").strip().split())[:180]
    category_value = " ".join(str(category or "").strip().split())[:80]
    tool_value = " ".join(str(tool or "").strip().split())[:80]
    command_value = " ".join(str(command or "").strip().split())[:240]
    if not name_value or not category_value or not tool_value:
        return

    key = (tool_value.lower(), category_value.lower(), name_value.lower(), command_value.lower(), source_path, int(line or 1))
    if key in seen or len(facts["test_systems"]) >= MAX_TEST_SYSTEM_FACTS:
        return
    seen.add(key)
    facts["test_systems"].append({
        "name": name_value,
        "category": category_value,
        "tool": tool_value,
        "command": command_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:240],
    })


def _is_test_system_path(relative_path: Path, name: str) -> bool:
    normalized = _to_posix(relative_path).lower()
    suffix = PurePosixPath(name).suffix.lower()
    parts = [part.lower() for part in relative_path.parts]
    if name in {
        "package.json",
        "pyproject.toml",
        "pytest.ini",
        "tox.ini",
        "setup.cfg",
        "noxfile.py",
        "conftest.py",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "build",
        "build.bazel",
        "meson.build",
        "cmakelists.txt",
        "makefile",
        "justfile",
        "composer.json",
        "gemfile",
        "cargo.toml",
        "go.mod",
        "pubspec.yaml",
        "pubspec.yml",
        ".rspec",
        "spec_helper.rb",
        "rails_helper.rb",
        "phpunit.xml",
        "phpunit.xml.dist",
    }:
        return True
    if name.startswith("requirements") and name.endswith(".txt"):
        return True
    if suffix in {".csproj", ".fsproj", ".vbproj", ".runsettings"}:
        return True
    if re.match(r"^(vitest|jest|playwright)\.config\.(js|jsx|ts|tsx|mjs|mts|cjs|cts)$", name):
        return True
    if re.match(r"^cypress\.config\.(js|jsx|ts|tsx|mjs|mts|cjs|cts)$", name):
        return True
    if name == "karma.conf.js" or name.startswith(".mocharc."):
        return True
    if name.endswith("_test.go"):
        return True
    if suffix == ".rs" and parts and parts[0] == "tests":
        return True
    return normalized.endswith("/phpunit.xml") or normalized.endswith("/phpunit.xml.dist")


def _extract_test_systems(
    file_path: Path,
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    name = file_path.name.lower()
    suffix = PurePosixPath(name).suffix.lower()
    if name == "package.json":
        _extract_package_json_test_systems(file_path, source_path, facts, seen_test_systems)
    elif name == "pyproject.toml":
        _extract_pyproject_test_systems(file_path, source_path, facts, seen_test_systems)
    elif name.startswith("requirements") and name.endswith(".txt"):
        _extract_requirements_test_systems(file_path, source_path, facts, seen_test_systems)
    elif name in {"pytest.ini", "tox.ini", "setup.cfg"}:
        _extract_python_ini_test_systems(file_path, source_path, facts, seen_test_systems)
    elif name == "noxfile.py":
        _extract_nox_test_systems(file_path, source_path, facts, seen_test_systems)
    elif name == "conftest.py":
        _append_test_system(facts, seen_test_systems, "conftest.py", "fixture config", "pytest", "pytest", source_path, 1, "pytest-conftest", "pytest fixture and plugin configuration")
    elif name in {"pom.xml", "build.gradle", "build.gradle.kts"}:
        _extract_jvm_test_systems(file_path, source_path, facts, seen_test_systems)
    elif name in {"build", "build.bazel"}:
        _extract_bazel_test_systems(file_path, source_path, facts, seen_test_systems)
    elif name == "meson.build":
        _extract_meson_test_systems(file_path, source_path, facts, seen_test_systems)
    elif name == "cmakelists.txt":
        _extract_cmake_test_systems(file_path, source_path, facts, seen_test_systems)
    elif name in {"makefile", "justfile"}:
        _extract_command_file_test_systems(file_path, source_path, facts, seen_test_systems, name)
    elif name == "composer.json":
        _extract_composer_test_systems(file_path, source_path, facts, seen_test_systems)
    elif name == "gemfile":
        _extract_gemfile_test_systems(file_path, source_path, facts, seen_test_systems)
    elif name == "cargo.toml":
        _extract_cargo_test_systems(file_path, source_path, facts, seen_test_systems)
    elif name == "go.mod":
        _append_test_system(facts, seen_test_systems, "go test ./...", "runner", "go test", "go test ./...", source_path, 1, "go-mod", "Go module test runner")
    elif name.endswith("_test.go"):
        _append_test_system(facts, seen_test_systems, PurePosixPath(source_path).name, "test file", "go test", "go test ./...", source_path, 1, "go-test-file", "Go test file")
    elif suffix == ".rs" and PurePosixPath(source_path).parts and PurePosixPath(source_path).parts[0].lower() == "tests":
        _append_test_system(facts, seen_test_systems, PurePosixPath(source_path).stem, "integration test", "Cargo test", "cargo test", source_path, 1, "cargo-integration-test", "Rust integration test file")
    elif name in {"pubspec.yaml", "pubspec.yml"}:
        _extract_pubspec_test_systems(file_path, source_path, facts, seen_test_systems)
    elif suffix in {".csproj", ".fsproj", ".vbproj"}:
        _extract_dotnet_project_test_systems(file_path, source_path, facts, seen_test_systems)
    elif suffix == ".runsettings":
        _append_test_system(facts, seen_test_systems, PurePosixPath(source_path).name, "config", ".NET test", f"dotnet test --settings {source_path}", source_path, 1, "runsettings", ".NET test runsettings file")
    elif name in {".rspec", "spec_helper.rb", "rails_helper.rb"}:
        tool = "RSpec" if name != "spec_helper.rb" else "RSpec"
        _append_test_system(facts, seen_test_systems, name, "config", tool, "bundle exec rspec", source_path, 1, "rspec-config", "RSpec configuration")
    elif name in {"phpunit.xml", "phpunit.xml.dist"}:
        _append_test_system(facts, seen_test_systems, name, "config", "PHPUnit", "vendor/bin/phpunit", source_path, 1, "phpunit-config", "PHPUnit XML configuration")
    elif _is_js_test_config_name(name):
        _append_js_test_config(file_path, source_path, facts, seen_test_systems, name)


def _extract_package_json_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return

    package_manager = _detect_node_package_manager(file_path.parent)
    scripts = data.get("scripts") if isinstance(data.get("scripts"), dict) else {}
    for raw_name, raw_command in sorted(scripts.items(), key=lambda item: _script_sort_key(str(item[0]))):
        if not isinstance(raw_command, str):
            continue
        script_name = str(raw_name)
        lower_command = raw_command.lower()
        if "test" not in script_name.lower() and not _js_test_tool_from_text(lower_command):
            continue
        tool = _js_test_tool_from_text(lower_command) or "npm scripts"
        _append_test_system(
            facts,
            seen_test_systems,
            script_name,
            "script",
            tool,
            _node_script_command(package_manager, script_name),
            source_path,
            _line_number_for_text(text, script_name) or 1,
            "package-scripts",
            raw_command,
        )

    for scope, raw_deps in (
        ("runtime", data.get("dependencies") if isinstance(data.get("dependencies"), dict) else {}),
        ("dev", data.get("devDependencies") if isinstance(data.get("devDependencies"), dict) else {}),
        ("optional", data.get("optionalDependencies") if isinstance(data.get("optionalDependencies"), dict) else {}),
        ("peer", data.get("peerDependencies") if isinstance(data.get("peerDependencies"), dict) else {}),
    ):
        for dependency in sorted(raw_deps):
            signal = _js_test_dependency_signal(str(dependency))
            if signal is None:
                continue
            tool, category, detail = signal
            _append_test_system(
                facts,
                seen_test_systems,
                str(dependency),
                category,
                tool,
                _default_test_command(tool, package_manager),
                source_path,
                _line_number_for_text(text, str(dependency)) or 1,
                f"package-{scope}-dependency",
                detail,
            )


def _extract_pyproject_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_toml_text(text)
    if not isinstance(data, dict):
        return
    tool_data = data.get("tool") if isinstance(data.get("tool"), dict) else {}
    project = data.get("project") if isinstance(data.get("project"), dict) else {}
    poetry = tool_data.get("poetry") if isinstance(tool_data.get("poetry"), dict) else {}
    package_manager = "poetry" if poetry else "pip"

    if isinstance(tool_data.get("pytest"), dict):
        _append_test_system(facts, seen_test_systems, "tool.pytest", "config", "pytest", "poetry run pytest" if package_manager == "poetry" else "pytest", source_path, _line_number_for_key(text, "pytest") or 1, "pyproject-pytest", "pyproject pytest configuration")
    if isinstance(tool_data.get("tox"), dict):
        _append_test_system(facts, seen_test_systems, "tool.tox", "config", "tox", "tox", source_path, _line_number_for_key(text, "tox") or 1, "pyproject-tox", "pyproject tox configuration")
    if isinstance(tool_data.get("nox"), dict):
        _append_test_system(facts, seen_test_systems, "tool.nox", "config", "nox", "nox", source_path, _line_number_for_key(text, "nox") or 1, "pyproject-nox", "pyproject nox configuration")

    dependency_names = set()
    for item in project.get("dependencies") if isinstance(project.get("dependencies"), list) else []:
        if isinstance(item, str):
            dependency_names.add(_python_dependency_name(item))
    optional = project.get("optional-dependencies") if isinstance(project.get("optional-dependencies"), dict) else {}
    for items in optional.values():
        if isinstance(items, list):
            dependency_names.update(_python_dependency_name(item) for item in items if isinstance(item, str))
    poetry_dependencies = poetry.get("dependencies") if isinstance(poetry.get("dependencies"), dict) else {}
    poetry_dev_dependencies = poetry.get("dev-dependencies") if isinstance(poetry.get("dev-dependencies"), dict) else {}
    dependency_names.update(name for name in poetry_dependencies if str(name).lower() != "python")
    dependency_names.update(poetry_dev_dependencies)
    poetry_groups = poetry.get("group") if isinstance(poetry.get("group"), dict) else {}
    for group_data in poetry_groups.values():
        if not isinstance(group_data, dict):
            continue
        group_dependencies = group_data.get("dependencies")
        if isinstance(group_dependencies, dict):
            dependency_names.update(group_dependencies)

    for dependency in sorted(name for name in dependency_names if name):
        signal = _python_test_dependency_signal(dependency)
        if signal is None:
            continue
        tool, category, detail = signal
        command = "poetry run pytest" if package_manager == "poetry" and tool == "pytest" else _default_test_command(tool, package_manager)
        _append_test_system(facts, seen_test_systems, dependency, category, tool, command, source_path, _line_number_for_text(text, dependency) or 1, "pyproject-dependency", detail)


def _extract_requirements_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith(("#", "-")):
            continue
        dependency = _python_dependency_name(stripped)
        signal = _python_test_dependency_signal(dependency)
        if signal is None:
            continue
        tool, category, detail = signal
        _append_test_system(facts, seen_test_systems, dependency, category, tool, _default_test_command(tool, "pip"), source_path, _line_number_for_text(text, stripped) or 1, "requirements-dependency", detail)


def _extract_python_ini_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    name = file_path.name.lower()
    tool = "pytest" if name in {"pytest.ini", "setup.cfg"} else "tox"
    command = "pytest" if tool == "pytest" else "tox"
    detail = "pytest configuration" if tool == "pytest" else "tox environment configuration"
    _append_test_system(facts, seen_test_systems, name, "config", tool, command, source_path, 1, name, detail)
    text = _read_text_file(file_path)
    if text and name == "tox.ini":
        for match in re.finditer(r"(?m)^\s*\[(testenv:[^\]]+|testenv)\]", text):
            env_name = match.group(1)
            _append_test_system(facts, seen_test_systems, env_name, "environment", "tox", "tox", source_path, _line_number(text, match.start()), "tox-env", "tox test environment")


def _extract_nox_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    found = False
    for match in re.finditer(r"(?ms)@nox\.session[^\n]*\n\s*def\s+([A-Za-z_][\w]*)\s*\(", text):
        found = True
        session_name = match.group(1)
        _append_test_system(facts, seen_test_systems, session_name, "session", "nox", f"nox -s {session_name}", source_path, _line_number(text, match.start()), "nox-session", "nox test session")
    if not found:
        _append_test_system(facts, seen_test_systems, "noxfile.py", "config", "nox", "nox", source_path, 1, "noxfile", "nox session file")


def _extract_jvm_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    name = file_path.name.lower()
    if name == "pom.xml":
        for match in re.finditer(r"<artifactId>\s*([^<]+)\s*</artifactId>", text):
            artifact = match.group(1).strip()
            signal = _jvm_test_dependency_signal(artifact)
            if signal is None:
                continue
            tool, category, detail = signal
            source = "maven-plugin" if "plugin" in category else "maven-dependency"
            _append_test_system(facts, seen_test_systems, artifact, category, tool, "mvn test", source_path, _line_number(text, match.start()), source, detail)
        return

    for match in re.finditer(r"['\"]([^'\"]*(?:junit|testng|mockito|assertj|kotest|spek)[^'\"]*)['\"]", text, flags=re.IGNORECASE):
        raw = match.group(1)
        package_name = raw.split(":")[1] if ":" in raw and len(raw.split(":")) > 1 else raw
        signal = _jvm_test_dependency_signal(package_name)
        if signal is None:
            continue
        tool, category, detail = signal
        _append_test_system(facts, seen_test_systems, package_name, category, tool, "./gradlew test", source_path, _line_number(text, match.start()), "gradle-dependency", detail)
    if re.search(r"\buseJUnitPlatform\s*\(", text):
        _append_test_system(facts, seen_test_systems, "useJUnitPlatform", "runner config", "JUnit", "./gradlew test", source_path, _line_number_for_text(text, "useJUnitPlatform") or 1, "gradle-test-task", "Gradle test task uses JUnit Platform")
    if re.search(r"\buseTestNG\s*\(", text):
        _append_test_system(facts, seen_test_systems, "useTestNG", "runner config", "TestNG", "./gradlew test", source_path, _line_number_for_text(text, "useTestNG") or 1, "gradle-test-task", "Gradle test task uses TestNG")


def _extract_bazel_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for rule_kind, target_name, line in _bazel_rule_entries(text):
        if not rule_kind.endswith("_test"):
            continue
        label = _build_file_label(source_path, target_name)
        _append_test_system(facts, seen_test_systems, label, "target", "Bazel", f"bazel test {label}", source_path, line, rule_kind, f"Bazel {rule_kind} target")


def _extract_meson_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for match in re.finditer(r"\btest\s*\(\s*['\"]([^'\"]+)['\"]", text):
        test_name = match.group(1)
        _append_test_system(facts, seen_test_systems, test_name, "target", "Meson", f"meson test -C build {test_name}", source_path, _line_number(text, match.start()), "meson-test", "Meson test target")


def _extract_cmake_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    if re.search(r"\benable_testing\s*\(", text, flags=re.IGNORECASE):
        _append_test_system(facts, seen_test_systems, "enable_testing", "runner config", "CTest", "ctest --test-dir build", source_path, _line_number_for_text(text, "enable_testing") or 1, "cmake-enable-testing", "CMake enables CTest")
    for match in re.finditer(r"\badd_test\s*\(\s*(?:NAME\s+)?([A-Za-z0-9_.+-]+)", text, flags=re.IGNORECASE):
        test_name = match.group(1)
        _append_test_system(facts, seen_test_systems, test_name, "target", "CTest", f"ctest --test-dir build -R {test_name}", source_path, _line_number(text, match.start()), "cmake-add-test", "CMake add_test target")
    if re.search(r"\bgtest_discover_tests\s*\(", text, flags=re.IGNORECASE):
        _append_test_system(facts, seen_test_systems, "gtest_discover_tests", "framework", "GoogleTest", "ctest --test-dir build", source_path, _line_number_for_text(text, "gtest_discover_tests") or 1, "cmake-gtest", "GoogleTest discovery")


def _extract_command_file_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
    name: str,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    entries = _make_target_entries(text) if name == "makefile" else _just_target_entries(text)
    for target_name, line in entries:
        lower = target_name.lower()
        if lower not in {"test", "tests", "check", "spec", "unit", "integration", "e2e"} and "test" not in lower:
            continue
        tool = "Make" if name == "makefile" else "Just"
        command = f"make {target_name}" if name == "makefile" else f"just {target_name}"
        _append_test_system(facts, seen_test_systems, target_name, "task", tool, command, source_path, line, f"{name}-test-target", f"{tool} test task")


def _extract_composer_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return
    scripts = data.get("scripts") if isinstance(data.get("scripts"), dict) else {}
    for script_name, script_body in sorted(scripts.items()):
        body = " ".join(script_body) if isinstance(script_body, list) else str(script_body)
        if "test" not in str(script_name).lower() and not _php_test_tool_from_text(body):
            continue
        tool = _php_test_tool_from_text(body) or "Composer scripts"
        _append_test_system(facts, seen_test_systems, str(script_name), "script", tool, f"composer {script_name}", source_path, _line_number_for_text(text, str(script_name)) or 1, "composer-script", body)
    for scope, raw_deps in (
        ("runtime", data.get("require") if isinstance(data.get("require"), dict) else {}),
        ("dev", data.get("require-dev") if isinstance(data.get("require-dev"), dict) else {}),
    ):
        for dependency in sorted(raw_deps):
            signal = _php_test_dependency_signal(str(dependency))
            if signal is None:
                continue
            tool, category, detail = signal
            _append_test_system(facts, seen_test_systems, str(dependency), category, tool, _default_test_command(tool, "composer"), source_path, _line_number_for_text(text, str(dependency)) or 1, f"composer-{scope}-dependency", detail)


def _extract_gemfile_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for match in re.finditer(r"(?m)^\s*gem\s+['\"]([^'\"]+)['\"]", text):
        gem_name = match.group(1)
        signal = _ruby_test_dependency_signal(gem_name)
        if signal is None:
            continue
        tool, category, detail = signal
        _append_test_system(facts, seen_test_systems, gem_name, category, tool, _default_test_command(tool, "bundler"), source_path, _line_number(text, match.start()), "gemfile-dependency", detail)


def _extract_cargo_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_toml_text(text)
    if not isinstance(data, dict):
        return
    _append_test_system(facts, seen_test_systems, "cargo test", "runner", "Cargo test", "cargo test", source_path, 1, "cargo-manifest", "Rust cargo test runner")
    dev_dependencies = data.get("dev-dependencies") if isinstance(data.get("dev-dependencies"), dict) else {}
    for dependency in sorted(dev_dependencies):
        signal = _rust_test_dependency_signal(str(dependency))
        if signal is None:
            continue
        tool, category, detail = signal
        _append_test_system(facts, seen_test_systems, str(dependency), category, tool, _default_test_command(tool, "cargo"), source_path, _line_number_for_text(text, str(dependency)) or 1, "cargo-dev-dependency", detail)


def _extract_pubspec_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for dependency, line in _yaml_list_under_mapping(text, "dev_dependencies"):
        signal = _dart_test_dependency_signal(dependency)
        if signal is None:
            continue
        tool, category, detail = signal
        _append_test_system(facts, seen_test_systems, dependency, category, tool, _default_test_command(tool, "dart"), source_path, line, "pubspec-dev-dependency", detail)


def _extract_dotnet_project_test_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    project_name = PurePosixPath(source_path).stem
    if re.search(r"<IsTestProject>\s*true\s*</IsTestProject>", text, flags=re.IGNORECASE):
        _append_test_system(facts, seen_test_systems, project_name, "project", ".NET test", f"dotnet test {source_path}", source_path, _line_number_for_text(text, "IsTestProject") or 1, "dotnet-test-project", ".NET test project")
    for match in re.finditer(r"<PackageReference\b[^>]*Include=\"([^\"]+)\"", text, flags=re.IGNORECASE):
        package_name = match.group(1).strip()
        signal = _dotnet_test_package_signal(package_name)
        if signal is None:
            continue
        tool, category, detail = signal
        _append_test_system(facts, seen_test_systems, package_name, category, tool, f"dotnet test {source_path}", source_path, _line_number(text, match.start()), "dotnet-package-reference", detail)


def _append_js_test_config(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_test_systems: set,
    name: str,
) -> None:
    tool = "Vitest" if name.startswith("vitest.") else "Jest" if name.startswith("jest.") else "Playwright" if name.startswith("playwright.") else "Cypress" if name.startswith("cypress.") else "Karma" if name == "karma.conf.js" else "Mocha"
    _append_test_system(facts, seen_test_systems, PurePosixPath(source_path).name, "config", tool, _default_test_command(tool, "npm"), source_path, 1, "js-test-config", f"{tool} configuration file")


def _is_js_test_config_name(name: str) -> bool:
    return (
        re.match(r"^(vitest|jest|playwright)\.config\.(js|jsx|ts|tsx|mjs|mts|cjs|cts)$", name) is not None
        or re.match(r"^cypress\.config\.(js|jsx|ts|tsx|mjs|mts|cjs|cts)$", name) is not None
        or name == "karma.conf.js"
        or name.startswith(".mocharc.")
    )


def _js_test_tool_from_text(text: str) -> str:
    lower = str(text or "").lower()
    for needle, tool in (
        ("@playwright/test", "Playwright"),
        ("playwright", "Playwright"),
        ("vitest", "Vitest"),
        ("jest", "Jest"),
        ("cypress", "Cypress"),
        ("karma", "Karma"),
        ("mocha", "Mocha"),
        ("ava", "AVA"),
        ("uvu", "uvu"),
        ("tap", "tap"),
        ("node --test", "node:test"),
    ):
        if needle in lower:
            return tool
    return ""


def _php_test_tool_from_text(text: str) -> str:
    lower = str(text or "").lower()
    if "pest" in lower:
        return "Pest"
    if "phpunit" in lower:
        return "PHPUnit"
    return ""


def _js_test_dependency_signal(name: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    exact = {
        "vitest": ("Vitest", "framework", "Vitest dependency"),
        "jest": ("Jest", "framework", "Jest dependency"),
        "@jest/globals": ("Jest", "framework", "Jest globals dependency"),
        "jest-environment-jsdom": ("Jest", "environment", "Jest jsdom environment"),
        "@playwright/test": ("Playwright", "framework", "Playwright test dependency"),
        "playwright": ("Playwright", "framework", "Playwright dependency"),
        "cypress": ("Cypress", "framework", "Cypress dependency"),
        "karma": ("Karma", "framework", "Karma dependency"),
        "mocha": ("Mocha", "framework", "Mocha dependency"),
        "ava": ("AVA", "framework", "AVA dependency"),
        "uvu": ("uvu", "framework", "uvu dependency"),
        "tap": ("tap", "framework", "tap dependency"),
        "node:test": ("node:test", "framework", "Node test runner"),
        "@testing-library/react": ("Testing Library", "library", "React Testing Library dependency"),
        "@testing-library/vue": ("Testing Library", "library", "Vue Testing Library dependency"),
        "@testing-library/svelte": ("Testing Library", "library", "Svelte Testing Library dependency"),
        "@testing-library/jest-dom": ("Testing Library", "assertion library", "jest-dom assertions"),
        "storybook": ("Storybook", "component test surface", "Storybook dependency"),
    }
    return exact.get(normalized)


def _python_test_dependency_signal(name: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    exact = {
        "pytest": ("pytest", "framework", "pytest dependency"),
        "pytest-cov": ("pytest", "coverage plugin", "pytest-cov dependency"),
        "pytest-asyncio": ("pytest", "plugin", "pytest-asyncio dependency"),
        "pytest-django": ("pytest", "plugin", "pytest-django dependency"),
        "tox": ("tox", "environment", "tox dependency"),
        "nox": ("nox", "environment", "nox dependency"),
        "hypothesis": ("Hypothesis", "property testing", "Hypothesis dependency"),
        "unittest2": ("unittest", "framework", "unittest2 dependency"),
        "robotframework": ("Robot Framework", "framework", "Robot Framework dependency"),
    }
    return exact.get(normalized)


def _jvm_test_dependency_signal(name: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    if "maven-surefire-plugin" in normalized:
        return ("Surefire", "plugin", "Maven Surefire plugin")
    if "maven-failsafe-plugin" in normalized:
        return ("Failsafe", "plugin", "Maven Failsafe plugin")
    if "junit" in normalized:
        return ("JUnit", "framework", "JUnit test dependency")
    if "testng" in normalized:
        return ("TestNG", "framework", "TestNG dependency")
    if "mockito" in normalized:
        return ("Mockito", "mocking library", "Mockito dependency")
    if "assertj" in normalized:
        return ("AssertJ", "assertion library", "AssertJ dependency")
    if "kotest" in normalized:
        return ("Kotest", "framework", "Kotest dependency")
    if "spek" in normalized:
        return ("Spek", "framework", "Spek dependency")
    return None


def _php_test_dependency_signal(name: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    if normalized in {"phpunit/phpunit", "phpunit"}:
        return ("PHPUnit", "framework", "PHPUnit dependency")
    if normalized in {"pestphp/pest", "pest"}:
        return ("Pest", "framework", "Pest dependency")
    if normalized in {"mockery/mockery", "mockery"}:
        return ("Mockery", "mocking library", "Mockery dependency")
    return None


def _ruby_test_dependency_signal(name: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    exact = {
        "rspec": ("RSpec", "framework", "RSpec dependency"),
        "rspec-rails": ("RSpec", "framework", "RSpec Rails dependency"),
        "minitest": ("Minitest", "framework", "Minitest dependency"),
        "capybara": ("Capybara", "browser test library", "Capybara dependency"),
        "factory_bot_rails": ("FactoryBot", "fixture library", "FactoryBot Rails dependency"),
        "factory-bot-rails": ("FactoryBot", "fixture library", "FactoryBot Rails dependency"),
    }
    return exact.get(normalized)


def _dotnet_test_package_signal(name: str) -> Optional[tuple[str, str, str]]:
    normalized = str(name or "").strip().lower()
    if normalized == "microsoft.net.test.sdk":
        return (".NET test", "sdk", "Microsoft.NET.Test.Sdk package")
    if normalized.startswith("xunit"):
        return ("xUnit", "framework", "xUnit package")
    if normalized.startswith("nunit"):
        return ("NUnit", "framework", "NUnit package")
    if normalized.startswith("mstest"):
        return ("MSTest", "framework", "MSTest package")
    if normalized.startswith("coverlet"):
        return ("coverlet", "coverage", "coverlet package")
    return None


def _rust_test_dependency_signal(name: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    exact = {
        "rstest": ("rstest", "framework", "rstest dev dependency"),
        "proptest": ("proptest", "property testing", "proptest dev dependency"),
        "quickcheck": ("QuickCheck", "property testing", "QuickCheck dev dependency"),
        "criterion": ("Criterion", "benchmark", "Criterion dev dependency"),
        "mockall": ("mockall", "mocking library", "mockall dev dependency"),
    }
    return exact.get(normalized)


def _dart_test_dependency_signal(name: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    exact = {
        "test": ("Dart test", "framework", "Dart test package"),
        "flutter-test": ("Flutter test", "framework", "Flutter test package"),
        "flutter_test": ("Flutter test", "framework", "Flutter test package"),
        "integration-test": ("Flutter integration_test", "integration test", "Flutter integration_test package"),
        "integration_test": ("Flutter integration_test", "integration test", "Flutter integration_test package"),
        "mockito": ("Mockito", "mocking library", "Dart Mockito package"),
    }
    return exact.get(normalized)


def _default_test_command(tool: str, package_manager: str) -> str:
    normalized = str(tool or "").lower()
    manager = str(package_manager or "").lower()
    if normalized == "vitest":
        return _node_script_command(manager if manager in {"npm", "pnpm", "yarn"} else "npm", "test")
    if normalized == "jest":
        return _node_script_command(manager if manager in {"npm", "pnpm", "yarn"} else "npm", "test")
    if normalized == "playwright":
        return "npx playwright test"
    if normalized == "cypress":
        return "npx cypress run"
    if normalized == "karma":
        return "npx karma start"
    if normalized == "mocha":
        return "npx mocha"
    if normalized == "pytest":
        return "pytest"
    if normalized == "tox":
        return "tox"
    if normalized == "nox":
        return "nox"
    if normalized in {"phpunit", "pest"}:
        return "vendor/bin/phpunit" if normalized == "phpunit" else "vendor/bin/pest"
    if normalized in {"rspec", "capybara", "factorybot"}:
        return "bundle exec rspec"
    if normalized in {"cargo test", "rstest", "proptest", "quickcheck", "mockall"}:
        return "cargo test"
    if normalized in {"dart test", "flutter test"}:
        return "flutter test" if "flutter" in normalized else "dart test"
    if normalized in {"junit", "testng", "mockito", "assertj", "kotest", "spek"}:
        return "mvn test"
    if normalized in {"xunit", "nunit", "mstest", ".net test", "coverlet"}:
        return "dotnet test"
    return ""


def _append_quality_tool(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    tool: str,
    command: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").strip().split())[:180]
    category_value = " ".join(str(category or "").strip().split())[:80]
    tool_value = " ".join(str(tool or "").strip().split())[:80]
    command_value = " ".join(str(command or "").strip().split())[:240]
    if not name_value or not category_value or not tool_value:
        return

    key = (tool_value.lower(), category_value.lower(), name_value.lower(), command_value.lower(), source_path, int(line or 1))
    if key in seen or len(facts["quality_tools"]) >= MAX_QUALITY_TOOL_FACTS:
        return
    seen.add(key)
    facts["quality_tools"].append({
        "name": name_value,
        "category": category_value,
        "tool": tool_value,
        "command": command_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:240],
    })


def _is_quality_tool_path(relative_path: Path, name: str) -> bool:
    normalized = _to_posix(relative_path).lower()
    parts = [part.lower() for part in relative_path.parts]
    suffix = PurePosixPath(name).suffix.lower()
    if len(parts) >= 3 and parts[0] == ".github" and parts[1] == "workflows" and name.endswith((".yml", ".yaml")):
        return True
    if normalized == "sorbet/config":
        return True
    if name in {
        "package.json",
        "pyproject.toml",
        "setup.cfg",
        "tox.ini",
        "noxfile.py",
        "mypy.ini",
        ".mypy.ini",
        "pyrightconfig.json",
        ".pylintrc",
        "pylintrc",
        ".flake8",
        "ruff.toml",
        ".ruff.toml",
        ".pre-commit-config.yaml",
        ".pre-commit-config.yml",
        ".editorconfig",
        ".shellcheckrc",
        ".golangci.yml",
        ".golangci.yaml",
        ".golangci.toml",
        ".golangci.json",
        "golangci.yml",
        "golangci.yaml",
        "rustfmt.toml",
        ".rustfmt.toml",
        "clippy.toml",
        ".clippy.toml",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "build.sbt",
        "composer.json",
        "gemfile",
        "makefile",
        "justfile",
        "rakefile",
        "phpstan.neon",
        "phpstan.neon.dist",
        "psalm.xml",
        "psalm.xml.dist",
        ".php-cs-fixer.php",
        ".php-cs-fixer.dist.php",
        "phpcs.xml",
        "phpcs.xml.dist",
        "phpmd.xml",
        "phpmd.xml.dist",
        ".rubocop.yml",
        ".rubocop_todo.yml",
        "sorbet.config",
        "biome.json",
        "biome.jsonc",
        "rome.json",
    }:
        return True
    if name.startswith("requirements") and name.endswith(".txt"):
        return True
    if name.startswith("tsconfig") and name.endswith(".json"):
        return True
    if name in {".eslintrc", ".prettierrc", ".stylelintrc"}:
        return True
    if name.startswith((".eslintrc.", ".prettierrc.", ".stylelintrc.")):
        return True
    if re.match(r"^(eslint|prettier|stylelint)\.config\.(js|jsx|ts|tsx|mjs|mts|cjs|cts)$", name):
        return True
    if suffix in {".neon", ".xml", ".yml", ".yaml", ".json", ".toml", ".js", ".cjs", ".mjs", ".ts", ".kts"}:
        return any(token in name for token in (
            "eslint",
            "prettier",
            "biome",
            "rome",
            "stylelint",
            "ruff",
            "mypy",
            "pyright",
            "pylint",
            "flake8",
            "bandit",
            "golangci",
            "rustfmt",
            "clippy",
            "checkstyle",
            "spotbugs",
            "pmd",
            "detekt",
            "ktlint",
            "phpstan",
            "psalm",
            "phpcs",
            "rubocop",
            "shellcheck",
            "shfmt",
        ))
    return False


def _extract_quality_tools(
    file_path: Path,
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
) -> None:
    name = file_path.name.lower()
    normalized = _to_posix(relative_path).lower()
    if name == "package.json":
        _extract_package_json_quality_tools(file_path, source_path, facts, seen_quality_tools)
    elif name == "pyproject.toml":
        _extract_pyproject_quality_tools(file_path, source_path, facts, seen_quality_tools)
    elif name.startswith("requirements") and name.endswith(".txt"):
        _extract_requirements_quality_tools(file_path, source_path, facts, seen_quality_tools)
    elif name in {"setup.cfg", "tox.ini", "mypy.ini", ".mypy.ini", "pyrightconfig.json", ".pylintrc", "pylintrc", ".flake8", "ruff.toml", ".ruff.toml"}:
        _extract_python_ini_quality_tools(file_path, source_path, facts, seen_quality_tools)
    elif name == "noxfile.py":
        _extract_nox_quality_tools(file_path, source_path, facts, seen_quality_tools)
    elif name in {"pom.xml", "build.gradle", "build.gradle.kts", "build.sbt"}:
        _extract_jvm_quality_tools(file_path, source_path, facts, seen_quality_tools)
    elif name == "composer.json":
        _extract_composer_quality_tools(file_path, source_path, facts, seen_quality_tools)
    elif name in {"gemfile", "rakefile"}:
        _extract_ruby_quality_tools(file_path, source_path, facts, seen_quality_tools)
    elif name in {"makefile", "justfile"}:
        _extract_quality_task_file(file_path, source_path, facts, seen_quality_tools, name)
    elif normalized == "sorbet/config":
        _append_quality_tool(facts, seen_quality_tools, "sorbet/config", "typecheck config", "Sorbet", "srb tc", source_path, 1, "sorbet-config", "Sorbet type checker configuration")
    elif normalized.startswith(".github/workflows/"):
        _extract_workflow_quality_tools(file_path, source_path, facts, seen_quality_tools)
    elif name in {".pre-commit-config.yaml", ".pre-commit-config.yml"}:
        _extract_precommit_quality_tools(file_path, source_path, facts, seen_quality_tools)
    else:
        _append_quality_config_file(file_path, source_path, facts, seen_quality_tools, name)


def _extract_package_json_quality_tools(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return

    package_manager = _detect_node_package_manager(file_path.parent)
    scripts = data.get("scripts") if isinstance(data.get("scripts"), dict) else {}
    for raw_name, raw_command in sorted(scripts.items(), key=lambda item: _script_sort_key(str(item[0]))):
        if not isinstance(raw_command, str):
            continue
        script_name = str(raw_name)
        if not _is_quality_script(script_name, raw_command):
            continue
        tool = _quality_tool_from_text(raw_command) or "npm scripts"
        _append_quality_tool(
            facts,
            seen_quality_tools,
            script_name,
            "script",
            tool,
            _node_script_command(package_manager, script_name),
            source_path,
            _line_number_for_text(text, script_name) or 1,
            "package-scripts",
            raw_command,
        )

    if isinstance(data.get("eslintConfig"), dict):
        _append_quality_tool(facts, seen_quality_tools, "eslintConfig", "linter config", "ESLint", _default_quality_command("ESLint", package_manager), source_path, _line_number_for_key(text, "eslintConfig") or 1, "package-eslint-config", "package.json ESLint configuration")
    if isinstance(data.get("prettier"), (dict, str)):
        _append_quality_tool(facts, seen_quality_tools, "prettier", "formatter config", "Prettier", _default_quality_command("Prettier", package_manager), source_path, _line_number_for_key(text, "prettier") or 1, "package-prettier-config", "package.json Prettier configuration")
    if isinstance(data.get("stylelint"), dict):
        _append_quality_tool(facts, seen_quality_tools, "stylelint", "linter config", "Stylelint", _default_quality_command("Stylelint", package_manager), source_path, _line_number_for_key(text, "stylelint") or 1, "package-stylelint-config", "package.json Stylelint configuration")

    for scope, raw_deps in (
        ("runtime", data.get("dependencies") if isinstance(data.get("dependencies"), dict) else {}),
        ("dev", data.get("devDependencies") if isinstance(data.get("devDependencies"), dict) else {}),
        ("optional", data.get("optionalDependencies") if isinstance(data.get("optionalDependencies"), dict) else {}),
        ("peer", data.get("peerDependencies") if isinstance(data.get("peerDependencies"), dict) else {}),
    ):
        for dependency in sorted(raw_deps):
            signal = _quality_dependency_signal(str(dependency), "JavaScript/TypeScript")
            if signal is None:
                continue
            tool, category, detail = signal
            _append_quality_tool(
                facts,
                seen_quality_tools,
                str(dependency),
                category,
                tool,
                _default_quality_command(tool, package_manager),
                source_path,
                _line_number_for_text(text, str(dependency)) or 1,
                f"package-{scope}-dependency",
                detail,
            )


def _extract_pyproject_quality_tools(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_toml_text(text)
    if not isinstance(data, dict):
        return
    tool_data = data.get("tool") if isinstance(data.get("tool"), dict) else {}
    tool_sections = {
        "ruff": ("Ruff", "linter config", "ruff check .", "pyproject-ruff", "pyproject Ruff configuration"),
        "black": ("Black", "formatter config", "black --check .", "pyproject-black", "pyproject Black configuration"),
        "isort": ("isort", "formatter config", "isort --check-only .", "pyproject-isort", "pyproject isort configuration"),
        "mypy": ("mypy", "typecheck config", "mypy .", "pyproject-mypy", "pyproject mypy configuration"),
        "pyright": ("Pyright", "typecheck config", "pyright", "pyproject-pyright", "pyproject Pyright configuration"),
        "pylint": ("Pylint", "linter config", "pylint .", "pyproject-pylint", "pyproject Pylint configuration"),
        "bandit": ("Bandit", "static analysis config", "bandit -r .", "pyproject-bandit", "pyproject Bandit configuration"),
    }
    for key, (tool, category, command, source, detail) in tool_sections.items():
        if isinstance(tool_data.get(key), dict):
            _append_quality_tool(facts, seen_quality_tools, f"tool.{key}", category, tool, command, source_path, _line_number_for_key(text, key) or 1, source, detail)

    dependency_names = set()
    project = data.get("project") if isinstance(data.get("project"), dict) else {}
    for item in project.get("dependencies") if isinstance(project.get("dependencies"), list) else []:
        if isinstance(item, str):
            dependency_names.add(_python_dependency_name(item))
    optional = project.get("optional-dependencies") if isinstance(project.get("optional-dependencies"), dict) else {}
    for items in optional.values():
        if isinstance(items, list):
            dependency_names.update(_python_dependency_name(item) for item in items if isinstance(item, str))
    poetry = tool_data.get("poetry") if isinstance(tool_data.get("poetry"), dict) else {}
    poetry_dependencies = poetry.get("dependencies") if isinstance(poetry.get("dependencies"), dict) else {}
    poetry_dev_dependencies = poetry.get("dev-dependencies") if isinstance(poetry.get("dev-dependencies"), dict) else {}
    dependency_names.update(name for name in poetry_dependencies if str(name).lower() != "python")
    dependency_names.update(poetry_dev_dependencies)
    poetry_groups = poetry.get("group") if isinstance(poetry.get("group"), dict) else {}
    for group_data in poetry_groups.values():
        if not isinstance(group_data, dict):
            continue
        group_dependencies = group_data.get("dependencies")
        if isinstance(group_dependencies, dict):
            dependency_names.update(group_dependencies)

    for dependency in sorted(name for name in dependency_names if name):
        signal = _quality_dependency_signal(dependency, "Python")
        if signal is None:
            continue
        tool, category, detail = signal
        _append_quality_tool(facts, seen_quality_tools, dependency, category, tool, _default_quality_command(tool, "python"), source_path, _line_number_for_text(text, dependency) or 1, "pyproject-dependency", detail)


def _extract_requirements_quality_tools(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith(("#", "-")):
            continue
        dependency = _python_dependency_name(stripped)
        signal = _quality_dependency_signal(dependency, "Python")
        if signal is None:
            continue
        tool, category, detail = signal
        _append_quality_tool(facts, seen_quality_tools, dependency, category, tool, _default_quality_command(tool, "python"), source_path, _line_number_for_text(text, stripped) or 1, "requirements-dependency", detail)


def _extract_python_ini_quality_tools(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
) -> None:
    name = file_path.name.lower()
    text = _read_text_file(file_path) or ""
    config_signals = {
        "mypy.ini": ("mypy.ini", "typecheck config", "mypy", "mypy .", "mypy configuration"),
        ".mypy.ini": (".mypy.ini", "typecheck config", "mypy", "mypy .", "mypy configuration"),
        "pyrightconfig.json": ("pyrightconfig.json", "typecheck config", "Pyright", "pyright", "Pyright configuration"),
        ".pylintrc": (".pylintrc", "linter config", "Pylint", "pylint .", "Pylint configuration"),
        "pylintrc": ("pylintrc", "linter config", "Pylint", "pylint .", "Pylint configuration"),
        ".flake8": (".flake8", "linter config", "flake8", "flake8 .", "flake8 configuration"),
        "ruff.toml": ("ruff.toml", "linter config", "Ruff", "ruff check .", "Ruff configuration"),
        ".ruff.toml": (".ruff.toml", "linter config", "Ruff", "ruff check .", "Ruff configuration"),
    }
    if name in config_signals:
        entry_name, category, tool, command, detail = config_signals[name]
        _append_quality_tool(facts, seen_quality_tools, entry_name, category, tool, command, source_path, 1, name, detail)

    for section, tool, category, command, detail in (
        ("flake8", "flake8", "linter config", "flake8 .", "flake8 configuration"),
        ("mypy", "mypy", "typecheck config", "mypy .", "mypy configuration"),
        ("tool:pytest", "", "", "", ""),
        ("isort", "isort", "formatter config", "isort --check-only .", "isort configuration"),
        ("black", "Black", "formatter config", "black --check .", "Black configuration"),
        ("pylint", "Pylint", "linter config", "pylint .", "Pylint configuration"),
        ("pylint.messages_control", "Pylint", "linter config", "pylint .", "Pylint configuration"),
    ):
        if not tool:
            continue
        match = re.search(rf"(?m)^\s*\[{re.escape(section)}[^\]]*\]", text)
        if match:
            _append_quality_tool(facts, seen_quality_tools, section, category, tool, command, source_path, _line_number(text, match.start()), f"{name}-section", detail)

    if name == "tox.ini":
        for match in re.finditer(r"(?ms)^\s*\[(testenv(?::[^\]]+)?)\](.*?)(?=^\s*\[|\Z)", text):
            env_name = match.group(1)
            body = match.group(2)
            tool = _quality_tool_from_text(env_name + "\n" + body)
            if tool is None:
                continue
            _append_quality_tool(facts, seen_quality_tools, env_name, "environment", tool, "tox", source_path, _line_number(text, match.start()), "tox-env", "tox environment runs quality checks")


def _extract_nox_quality_tools(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for match in re.finditer(r"(?ms)@nox\.session[^\n]*\n\s*def\s+([A-Za-z_][\w]*)\s*\([^)]*\)\s*:(.*?)(?=^@nox\.session|\Z)", text):
        session_name = match.group(1)
        body = match.group(2)
        tool = _quality_tool_from_text(session_name + "\n" + body)
        if tool is None:
            continue
        _append_quality_tool(facts, seen_quality_tools, session_name, "session", tool, f"nox -s {session_name}", source_path, _line_number(text, match.start()), "nox-session", "nox session runs quality checks")


def _extract_jvm_quality_tools(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    name = file_path.name.lower()
    if name == "pom.xml":
        for match in re.finditer(r"<artifactId>\s*([^<]+)\s*</artifactId>", text):
            artifact = match.group(1).strip()
            signal = _quality_dependency_signal(artifact, "JVM")
            if signal is None:
                continue
            tool, category, detail = signal
            _append_quality_tool(facts, seen_quality_tools, artifact, category, tool, _default_quality_command(tool, "maven"), source_path, _line_number(text, match.start()), "maven-plugin", detail)
        return

    for match in re.finditer(r"['\"]([^'\"]*(?:checkstyle|spotbugs|pmd|detekt|ktlint|spotless|scalafmt|scalafix)[^'\"]*)['\"]", text, flags=re.IGNORECASE):
        raw = match.group(1)
        package_name = raw.split(":")[1] if ":" in raw and len(raw.split(":")) > 1 else raw
        signal = _quality_dependency_signal(package_name, "JVM")
        if signal is None:
            continue
        tool, category, detail = signal
        _append_quality_tool(facts, seen_quality_tools, package_name, category, tool, _default_quality_command(tool, "gradle"), source_path, _line_number(text, match.start()), "gradle-plugin", detail)

    for needle, tool in (
        ("checkstyle", "Checkstyle"),
        ("spotbugs", "SpotBugs"),
        ("pmd", "PMD"),
        ("detekt", "Detekt"),
        ("ktlint", "ktlint"),
        ("spotless", "Spotless"),
        ("scalafmt", "Scalafmt"),
        ("scalafix", "Scalafix"),
    ):
        if re.search(rf"\b{re.escape(needle)}\b", text, flags=re.IGNORECASE):
            _append_quality_tool(facts, seen_quality_tools, needle, "plugin", tool, _default_quality_command(tool, "gradle"), source_path, _line_number_for_text(text, needle) or 1, f"{name}-quality-plugin", f"{tool} build plugin")


def _extract_composer_quality_tools(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return
    scripts = data.get("scripts") if isinstance(data.get("scripts"), dict) else {}
    for raw_name, raw_command in sorted(scripts.items()):
        command_text = " ".join(str(item) for item in raw_command) if isinstance(raw_command, list) else str(raw_command)
        script_name = str(raw_name)
        if not _is_quality_script(script_name, command_text):
            continue
        tool = _quality_tool_from_text(command_text) or "Composer"
        _append_quality_tool(facts, seen_quality_tools, script_name, "script", tool, f"composer {script_name}", source_path, _line_number_for_text(text, script_name) or 1, "composer-script", command_text)

    for scope, raw_deps in (
        ("runtime", data.get("require") if isinstance(data.get("require"), dict) else {}),
        ("dev", data.get("require-dev") if isinstance(data.get("require-dev"), dict) else {}),
    ):
        for dependency in sorted(raw_deps):
            signal = _quality_dependency_signal(str(dependency), "PHP")
            if signal is None:
                continue
            tool, category, detail = signal
            _append_quality_tool(facts, seen_quality_tools, str(dependency), category, tool, _default_quality_command(tool, "composer"), source_path, _line_number_for_text(text, str(dependency)) or 1, f"composer-{scope}-dependency", detail)


def _extract_ruby_quality_tools(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    name = file_path.name.lower()
    if name == "rakefile":
        _extract_quality_task_file(file_path, source_path, facts, seen_quality_tools, name)
        return
    for match in re.finditer(r"\bgem\s+['\"]([^'\"]+)['\"]", text):
        gem_name = match.group(1)
        signal = _quality_dependency_signal(gem_name, "Ruby")
        if signal is None:
            continue
        tool, category, detail = signal
        _append_quality_tool(facts, seen_quality_tools, gem_name, category, tool, _default_quality_command(tool, "bundler"), source_path, _line_number(text, match.start()), "gemfile-dependency", detail)


def _append_quality_config_file(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
    name: str,
) -> None:
    normalized = name.lower()
    config_signals = {
        ".editorconfig": (".editorconfig", "editor config", "EditorConfig", "", "EditorConfig formatting rules"),
        ".shellcheckrc": (".shellcheckrc", "linter config", "ShellCheck", "shellcheck .", "ShellCheck configuration"),
        ".golangci.yml": (".golangci.yml", "linter config", "golangci-lint", "golangci-lint run", "golangci-lint configuration"),
        ".golangci.yaml": (".golangci.yaml", "linter config", "golangci-lint", "golangci-lint run", "golangci-lint configuration"),
        ".golangci.toml": (".golangci.toml", "linter config", "golangci-lint", "golangci-lint run", "golangci-lint configuration"),
        ".golangci.json": (".golangci.json", "linter config", "golangci-lint", "golangci-lint run", "golangci-lint configuration"),
        "golangci.yml": ("golangci.yml", "linter config", "golangci-lint", "golangci-lint run", "golangci-lint configuration"),
        "golangci.yaml": ("golangci.yaml", "linter config", "golangci-lint", "golangci-lint run", "golangci-lint configuration"),
        "rustfmt.toml": ("rustfmt.toml", "formatter config", "rustfmt", "cargo fmt --check", "rustfmt configuration"),
        ".rustfmt.toml": (".rustfmt.toml", "formatter config", "rustfmt", "cargo fmt --check", "rustfmt configuration"),
        "clippy.toml": ("clippy.toml", "linter config", "Clippy", "cargo clippy", "Clippy configuration"),
        ".clippy.toml": (".clippy.toml", "linter config", "Clippy", "cargo clippy", "Clippy configuration"),
        "phpstan.neon": ("phpstan.neon", "static analysis config", "PHPStan", "vendor/bin/phpstan analyse", "PHPStan configuration"),
        "phpstan.neon.dist": ("phpstan.neon.dist", "static analysis config", "PHPStan", "vendor/bin/phpstan analyse", "PHPStan configuration"),
        "psalm.xml": ("psalm.xml", "static analysis config", "Psalm", "vendor/bin/psalm", "Psalm configuration"),
        "psalm.xml.dist": ("psalm.xml.dist", "static analysis config", "Psalm", "vendor/bin/psalm", "Psalm configuration"),
        ".php-cs-fixer.php": (".php-cs-fixer.php", "formatter config", "PHP CS Fixer", "vendor/bin/php-cs-fixer fix --dry-run", "PHP CS Fixer configuration"),
        ".php-cs-fixer.dist.php": (".php-cs-fixer.dist.php", "formatter config", "PHP CS Fixer", "vendor/bin/php-cs-fixer fix --dry-run", "PHP CS Fixer configuration"),
        "phpcs.xml": ("phpcs.xml", "linter config", "PHP_CodeSniffer", "vendor/bin/phpcs", "PHP_CodeSniffer configuration"),
        "phpcs.xml.dist": ("phpcs.xml.dist", "linter config", "PHP_CodeSniffer", "vendor/bin/phpcs", "PHP_CodeSniffer configuration"),
        "phpmd.xml": ("phpmd.xml", "static analysis config", "PHPMD", "vendor/bin/phpmd", "PHPMD configuration"),
        "phpmd.xml.dist": ("phpmd.xml.dist", "static analysis config", "PHPMD", "vendor/bin/phpmd", "PHPMD configuration"),
        ".rubocop.yml": (".rubocop.yml", "linter config", "RuboCop", "bundle exec rubocop", "RuboCop configuration"),
        ".rubocop_todo.yml": (".rubocop_todo.yml", "linter config", "RuboCop", "bundle exec rubocop", "RuboCop TODO configuration"),
        "biome.json": ("biome.json", "static analysis config", "Biome", "npx biome check .", "Biome configuration"),
        "biome.jsonc": ("biome.jsonc", "static analysis config", "Biome", "npx biome check .", "Biome configuration"),
        "rome.json": ("rome.json", "static analysis config", "Rome", "npx rome check .", "Rome configuration"),
    }
    if normalized in config_signals:
        entry_name, category, tool, command, detail = config_signals[normalized]
        _append_quality_tool(facts, seen_quality_tools, entry_name, category, tool, command, source_path, 1, normalized, detail)
        return

    if normalized.startswith("tsconfig") and normalized.endswith(".json"):
        _append_quality_tool(facts, seen_quality_tools, PurePosixPath(source_path).name, "typecheck config", "TypeScript", f"npx tsc --noEmit -p {source_path}", source_path, 1, "tsconfig", "TypeScript compiler configuration")
        return
    if normalized == ".eslintrc" or normalized.startswith(".eslintrc.") or re.match(r"^eslint\.config\.", normalized):
        _append_quality_tool(facts, seen_quality_tools, PurePosixPath(source_path).name, "linter config", "ESLint", "npx eslint .", source_path, 1, "eslint-config", "ESLint configuration file")
        return
    if normalized == ".prettierrc" or normalized.startswith(".prettierrc.") or re.match(r"^prettier\.config\.", normalized):
        _append_quality_tool(facts, seen_quality_tools, PurePosixPath(source_path).name, "formatter config", "Prettier", "npx prettier --check .", source_path, 1, "prettier-config", "Prettier configuration file")
        return
    if normalized == ".stylelintrc" or normalized.startswith(".stylelintrc.") or re.match(r"^stylelint\.config\.", normalized):
        _append_quality_tool(facts, seen_quality_tools, PurePosixPath(source_path).name, "linter config", "Stylelint", "npx stylelint '**/*.{css,scss,sass}'", source_path, 1, "stylelint-config", "Stylelint configuration file")


def _extract_quality_task_file(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
    name: str,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    lines = text.splitlines()
    tool_name = {"makefile": "Make", "justfile": "Just", "rakefile": "Rake"}.get(name, "Task")
    command_prefix = {"makefile": "make", "justfile": "just", "rakefile": "rake"}.get(name, name)
    for index, raw_line in enumerate(lines):
        target = ""
        if name == "rakefile":
            match = re.match(r"\s*task\s+[:'\"]?([A-Za-z0-9_.:-]+)", raw_line)
            if match:
                target = match.group(1).strip(":'\"")
        else:
            match = re.match(r"^\s*([A-Za-z0-9_.:-]+)\s*:(?:\s|$)", raw_line)
            if match and not raw_line.startswith(("\t", " ")):
                target = match.group(1)
        if not target:
            continue
        body = "\n".join(lines[index:index + 6])
        tool = _quality_tool_from_text(target + "\n" + body)
        if tool is None and not _is_quality_name(target):
            continue
        _append_quality_tool(
            facts,
            seen_quality_tools,
            target,
            "task",
            tool or tool_name,
            f"{command_prefix} {target}",
            source_path,
            index + 1,
            f"{name}-quality-task",
            _first_quality_command(body) or f"{tool_name} quality task",
        )


def _extract_workflow_quality_tools(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    workflow_name, _workflow_line = _ci_workflow_name(text, source_path)
    workflow_name = workflow_name or PurePosixPath(source_path).stem
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        match = re.match(r"^\s*(?:-\s*)?run\s*:\s*(?P<value>.+?)\s*$", raw_line)
        if not match:
            continue
        command = _clean_ci_scalar(match.group("value"))[:220]
        tool = _quality_tool_from_text(command)
        if tool is None:
            continue
        _append_quality_tool(facts, seen_quality_tools, f"{workflow_name}:{tool}", "workflow command", tool, command, source_path, line_number, "workflow-run", f"GitHub Actions quality command in {workflow_name}")


def _extract_precommit_quality_tools(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_quality_tools: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    _append_quality_tool(facts, seen_quality_tools, ".pre-commit-config", "hook config", "pre-commit", "pre-commit run --all-files", source_path, 1, "precommit-config", "pre-commit hook configuration")
    for needle, tool in (
        ("ruff-pre-commit", "Ruff"),
        ("mirrors-mypy", "mypy"),
        ("mirrors-eslint", "ESLint"),
        ("mirrors-prettier", "Prettier"),
        ("black", "Black"),
        ("isort", "isort"),
        ("shellcheck", "ShellCheck"),
        ("shfmt", "shfmt"),
    ):
        if needle in text:
            _append_quality_tool(facts, seen_quality_tools, needle, "hook", tool, "pre-commit run --all-files", source_path, _line_number_for_text(text, needle) or 1, "precommit-hook", f"pre-commit hook for {tool}")


def _is_quality_script(script_name: str, command: str) -> bool:
    return _quality_tool_from_text(command) is not None or _is_quality_name(script_name)


def _is_quality_name(name: str) -> bool:
    normalized = str(name or "").lower()
    tokens = set(re.split(r"[^a-z0-9]+", normalized))
    return bool(tokens.intersection({"lint", "format", "fmt", "typecheck", "type", "quality", "analyse", "analyze", "static"})) or "type-check" in normalized


def _first_quality_command(text: str) -> str:
    for raw_line in text.splitlines()[1:]:
        stripped = raw_line.strip()
        if stripped and _quality_tool_from_text(stripped):
            return stripped[:220]
    return ""


def _quality_tool_from_text(text: str) -> Optional[str]:
    lower = str(text or "").lower()
    checks = (
        ("golangci-lint", "golangci-lint"),
        ("cargo clippy", "Clippy"),
        ("php-cs-fixer", "PHP CS Fixer"),
        ("phpstan", "PHPStan"),
        ("shellcheck", "ShellCheck"),
        ("checkstyle", "Checkstyle"),
        ("spotbugs", "SpotBugs"),
        ("stylelint", "Stylelint"),
        ("svelte-check", "svelte-check"),
        ("vue-tsc", "vue-tsc"),
        ("typescript --noemit", "TypeScript"),
        ("tsc --noemit", "TypeScript"),
        ("tsc --noemit", "TypeScript"),
        ("tsc --noEmit".lower(), "TypeScript"),
        ("eslint", "ESLint"),
        ("oxlint", "oxlint"),
        ("prettier", "Prettier"),
        ("biome", "Biome"),
        ("rome", "Rome"),
        ("ruff", "Ruff"),
        ("black", "Black"),
        ("isort", "isort"),
        ("mypy", "mypy"),
        ("pyright", "Pyright"),
        ("pylint", "Pylint"),
        ("flake8", "flake8"),
        ("bandit", "Bandit"),
        ("staticcheck", "staticcheck"),
        ("gofmt", "gofmt"),
        ("go vet", "go vet"),
        ("rustfmt", "rustfmt"),
        ("cargo fmt", "rustfmt"),
        ("pmd", "PMD"),
        ("detekt", "Detekt"),
        ("ktlint", "ktlint"),
        ("spotless", "Spotless"),
        ("scalafmt", "Scalafmt"),
        ("scalafix", "Scalafix"),
        ("psalm", "Psalm"),
        ("phpcs", "PHP_CodeSniffer"),
        ("phpmd", "PHPMD"),
        ("rubocop", "RuboCop"),
        ("srb tc", "Sorbet"),
        ("sorbet", "Sorbet"),
        ("standardrb", "StandardRB"),
        ("standard", "StandardRB"),
        ("brakeman", "Brakeman"),
        ("reek", "Reek"),
        ("shfmt", "shfmt"),
        ("pre-commit", "pre-commit"),
        ("semgrep", "Semgrep"),
        ("next lint", "ESLint"),
    )
    for needle, tool in checks:
        if needle in lower:
            return tool
    return None


def _quality_dependency_signal(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    exact = {
        "eslint": ("ESLint", "linter", "ESLint dependency"),
        "@eslint/js": ("ESLint", "linter", "ESLint JavaScript config dependency"),
        "@typescript-eslint/eslint-plugin": ("ESLint", "linter", "TypeScript ESLint plugin"),
        "@typescript-eslint/parser": ("ESLint", "linter", "TypeScript ESLint parser"),
        "prettier": ("Prettier", "formatter", "Prettier dependency"),
        "@biomejs/biome": ("Biome", "static analysis", "Biome dependency"),
        "biome": ("Biome", "static analysis", "Biome dependency"),
        "rome": ("Rome", "static analysis", "Rome dependency"),
        "stylelint": ("Stylelint", "linter", "Stylelint dependency"),
        "typescript": ("TypeScript", "typecheck", "TypeScript compiler dependency"),
        "vue-tsc": ("vue-tsc", "typecheck", "Vue TypeScript checker dependency"),
        "svelte-check": ("svelte-check", "typecheck", "Svelte checker dependency"),
        "oxlint": ("oxlint", "linter", "oxlint dependency"),
        "tslint": ("TSLint", "linter", "TSLint dependency"),
        "ruff": ("Ruff", "linter", "Ruff dependency"),
        "black": ("Black", "formatter", "Black dependency"),
        "isort": ("isort", "formatter", "isort dependency"),
        "mypy": ("mypy", "typecheck", "mypy dependency"),
        "pyright": ("Pyright", "typecheck", "Pyright dependency"),
        "pylint": ("Pylint", "linter", "Pylint dependency"),
        "flake8": ("flake8", "linter", "flake8 dependency"),
        "bandit": ("Bandit", "static analysis", "Bandit dependency"),
        "semgrep": ("Semgrep", "static analysis", "Semgrep dependency"),
        "maven-checkstyle-plugin": ("Checkstyle", "plugin", "Maven Checkstyle plugin"),
        "checkstyle": ("Checkstyle", "plugin", "Checkstyle plugin"),
        "spotbugs-maven-plugin": ("SpotBugs", "plugin", "Maven SpotBugs plugin"),
        "spotbugs": ("SpotBugs", "plugin", "SpotBugs plugin"),
        "maven-pmd-plugin": ("PMD", "plugin", "Maven PMD plugin"),
        "pmd": ("PMD", "plugin", "PMD plugin"),
        "detekt": ("Detekt", "plugin", "Detekt plugin"),
        "ktlint": ("ktlint", "plugin", "ktlint plugin"),
        "spotless-plugin-gradle": ("Spotless", "plugin", "Spotless Gradle plugin"),
        "spotless": ("Spotless", "plugin", "Spotless plugin"),
        "scalafmt": ("Scalafmt", "formatter", "Scalafmt dependency"),
        "scalafix": ("Scalafix", "static analysis", "Scalafix dependency"),
        "phpstan/phpstan": ("PHPStan", "static analysis", "PHPStan dependency"),
        "vimeo/psalm": ("Psalm", "static analysis", "Psalm dependency"),
        "friendsofphp/php-cs-fixer": ("PHP CS Fixer", "formatter", "PHP CS Fixer dependency"),
        "squizlabs/php_codesniffer": ("PHP_CodeSniffer", "linter", "PHP_CodeSniffer dependency"),
        "phpmd/phpmd": ("PHPMD", "static analysis", "PHPMD dependency"),
        "rector/rector": ("Rector", "static analysis", "Rector dependency"),
        "larastan/larastan": ("PHPStan", "static analysis", "Larastan dependency"),
        "rubocop": ("RuboCop", "linter", "RuboCop dependency"),
        "rubocop-rails": ("RuboCop", "linter", "RuboCop Rails dependency"),
        "rubocop-rspec": ("RuboCop", "linter", "RuboCop RSpec dependency"),
        "sorbet": ("Sorbet", "typecheck", "Sorbet dependency"),
        "sorbet-runtime": ("Sorbet", "typecheck", "Sorbet runtime dependency"),
        "standard": ("StandardRB", "linter", "StandardRB dependency"),
        "standardrb": ("StandardRB", "linter", "StandardRB dependency"),
        "brakeman": ("Brakeman", "static analysis", "Brakeman dependency"),
        "reek": ("Reek", "static analysis", "Reek dependency"),
        "honnef.co/go/tools": ("staticcheck", "static analysis", "staticcheck Go tools dependency"),
    }
    if normalized in exact:
        return exact[normalized]
    if normalized.startswith("eslint-"):
        return ("ESLint", "linter", "ESLint plugin or config dependency")
    if normalized.startswith("stylelint-"):
        return ("Stylelint", "linter", "Stylelint plugin or config dependency")
    if normalized.startswith("flake8-"):
        return ("flake8", "linter", "flake8 plugin dependency")
    if "rubocop" in normalized:
        return ("RuboCop", "linter", "RuboCop dependency")
    if "detekt" in normalized:
        return ("Detekt", "plugin", "Detekt plugin")
    if "ktlint" in normalized:
        return ("ktlint", "plugin", "ktlint plugin")
    return None


def _default_quality_command(tool: str, package_manager: str) -> str:
    normalized = str(tool or "").lower()
    manager = str(package_manager or "").lower()
    runner = "npx"
    if manager == "pnpm":
        runner = "pnpm exec"
    elif manager == "yarn":
        runner = "yarn"
    if normalized == "eslint":
        return f"{runner} eslint ."
    if normalized == "prettier":
        return f"{runner} prettier --check ."
    if normalized == "biome":
        return f"{runner} biome check ."
    if normalized == "rome":
        return f"{runner} rome check ."
    if normalized == "stylelint":
        return f"{runner} stylelint '**/*.{{css,scss,sass}}'"
    if normalized in {"typescript", "vue-tsc", "svelte-check"}:
        executable = "tsc" if normalized == "typescript" else normalized
        return f"{runner} {executable} --noEmit"
    if normalized == "oxlint":
        return f"{runner} oxlint"
    if normalized == "ruff":
        return "ruff check ."
    if normalized == "black":
        return "black --check ."
    if normalized == "isort":
        return "isort --check-only ."
    if normalized == "mypy":
        return "mypy ."
    if normalized == "pyright":
        return "pyright"
    if normalized == "pylint":
        return "pylint ."
    if normalized == "flake8":
        return "flake8 ."
    if normalized == "bandit":
        return "bandit -r ."
    if normalized == "semgrep":
        return "semgrep scan"
    if normalized == "golangci-lint":
        return "golangci-lint run"
    if normalized == "staticcheck":
        return "staticcheck ./..."
    if normalized == "gofmt":
        return "gofmt -w ."
    if normalized == "go vet":
        return "go vet ./..."
    if normalized == "clippy":
        return "cargo clippy"
    if normalized == "rustfmt":
        return "cargo fmt --check"
    if normalized == "checkstyle":
        return "mvn checkstyle:check" if manager == "maven" else "./gradlew checkstyleMain"
    if normalized == "spotbugs":
        return "mvn spotbugs:check" if manager == "maven" else "./gradlew spotbugsMain"
    if normalized == "pmd":
        return "mvn pmd:check" if manager == "maven" else "./gradlew pmdMain"
    if normalized == "detekt":
        return "./gradlew detekt"
    if normalized == "ktlint":
        return "./gradlew ktlintCheck"
    if normalized == "spotless":
        return "./gradlew spotlessCheck"
    if normalized == "scalafmt":
        return "sbt scalafmtCheck"
    if normalized == "scalafix":
        return "sbt scalafix"
    if normalized == "phpstan":
        return "vendor/bin/phpstan analyse"
    if normalized == "psalm":
        return "vendor/bin/psalm"
    if normalized == "php cs fixer":
        return "vendor/bin/php-cs-fixer fix --dry-run"
    if normalized == "php_codesniffer":
        return "vendor/bin/phpcs"
    if normalized == "phpmd":
        return "vendor/bin/phpmd"
    if normalized == "rubocop":
        return "bundle exec rubocop"
    if normalized == "sorbet":
        return "srb tc"
    if normalized == "standardrb":
        return "bundle exec standardrb"
    if normalized == "brakeman":
        return "bundle exec brakeman"
    if normalized == "reek":
        return "bundle exec reek"
    if normalized == "shellcheck":
        return "shellcheck ."
    if normalized == "shfmt":
        return "shfmt -d ."
    if normalized == "pre-commit":
        return "pre-commit run --all-files"
    return ""


def _yaml_list_under_mapping(text: str, key: str) -> List[tuple[str, int]]:
    entries: List[tuple[str, int]] = []
    lines = text.splitlines()
    in_mapping = False
    base_indent = 0
    for line_number, raw_line in enumerate(lines, start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        if not in_mapping:
            if re.match(rf"^\s*{re.escape(key)}\s*:\s*(?:#.*)?$", raw_line):
                in_mapping = True
                base_indent = indent
            continue
        if indent <= base_indent:
            break
        match = re.match(r"([A-Za-z0-9_.-]+)\s*:", stripped)
        if match:
            entries.append((match.group(1), line_number))
    return entries


def _append_release_process(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    tool: str,
    command: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").strip().split())[:180]
    category_value = " ".join(str(category or "").strip().split())[:80]
    tool_value = " ".join(str(tool or "").strip().split())[:80]
    command_value = " ".join(str(command or "").strip().split())[:240]
    if not name_value or not category_value or not tool_value:
        return

    key = (tool_value.lower(), category_value.lower(), name_value.lower(), command_value.lower(), source_path, int(line or 1))
    if key in seen or len(facts["release_processes"]) >= MAX_RELEASE_PROCESS_FACTS:
        return
    seen.add(key)
    facts["release_processes"].append({
        "name": name_value,
        "category": category_value,
        "tool": tool_value,
        "command": command_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:240],
    })


def _is_release_process_path(relative_path: Path, name: str) -> bool:
    parts = [part.lower() for part in relative_path.parts]
    suffix = PurePosixPath(name).suffix.lower()
    normalized = _to_posix(relative_path).lower()
    if len(parts) >= 3 and parts[0] == ".github" and parts[1] == "workflows" and name.endswith((".yml", ".yaml")):
        return True
    if parts[:1] == [".changeset"] and (name == "config.json" or suffix == ".md"):
        return True
    if name in {
        "package.json",
        "pyproject.toml",
        "cargo.toml",
        "composer.json",
        "gemfile",
        "makefile",
        "justfile",
        "rakefile",
        "changelog.md",
        "changes.md",
        ".releaserc",
        ".releaserc.json",
        ".releaserc.yaml",
        ".releaserc.yml",
        "release.config.js",
        "release.config.cjs",
        "release.config.mjs",
        "release.config.ts",
        "release-please-config.json",
        ".release-please-manifest.json",
        ".goreleaser.yml",
        ".goreleaser.yaml",
        "goreleaser.yml",
        "goreleaser.yaml",
        ".bumpversion.cfg",
        ".bumpversion.toml",
    }:
        return True
    if suffix == ".gemspec":
        return True
    if "release" in name or "publish" in name or "changeset" in name or "changelog" in name:
        return suffix in {".yml", ".yaml", ".json", ".toml", ".js", ".cjs", ".mjs", ".ts", ".md", ".ini", ".cfg"}
    return normalized.endswith("/release-please-config.json") or normalized.endswith("/.release-please-manifest.json")


def _extract_release_processes(
    file_path: Path,
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_release_processes: set,
) -> None:
    name = file_path.name.lower()
    suffix = PurePosixPath(name).suffix.lower()
    parts = [part.lower() for part in relative_path.parts]
    if name == "package.json":
        _extract_package_json_release_processes(file_path, source_path, facts, seen_release_processes)
    elif name == "pyproject.toml":
        _extract_pyproject_release_processes(file_path, source_path, facts, seen_release_processes)
    elif name == "cargo.toml":
        _extract_cargo_release_processes(file_path, source_path, facts, seen_release_processes)
    elif name == "composer.json":
        _extract_composer_release_processes(file_path, source_path, facts, seen_release_processes)
    elif name == "gemfile" or suffix == ".gemspec":
        _extract_ruby_release_processes(file_path, source_path, facts, seen_release_processes)
    elif name in {"makefile", "justfile", "rakefile"}:
        _extract_release_task_file(file_path, source_path, facts, seen_release_processes, name)
    elif len(parts) >= 3 and parts[0] == ".github" and parts[1] == "workflows":
        _extract_workflow_release_processes(file_path, source_path, facts, seen_release_processes)
    elif name in {".releaserc", ".releaserc.json", ".releaserc.yaml", ".releaserc.yml", "release.config.js", "release.config.cjs", "release.config.mjs", "release.config.ts"}:
        _extract_semantic_release_config(file_path, source_path, facts, seen_release_processes)
    elif parts[:1] == [".changeset"] and name == "config.json":
        _extract_changesets_config(file_path, source_path, facts, seen_release_processes)
    elif parts[:1] == [".changeset"] and suffix == ".md":
        _append_release_process(facts, seen_release_processes, PurePosixPath(source_path).stem, "pending changeset", "Changesets", "changeset version", source_path, 1, "changeset-file", "Changesets pending release note")
    elif name in {"release-please-config.json", ".release-please-manifest.json"}:
        _extract_release_please_config(file_path, source_path, facts, seen_release_processes)
    elif name in {".goreleaser.yml", ".goreleaser.yaml", "goreleaser.yml", "goreleaser.yaml"}:
        _extract_goreleaser_config(file_path, source_path, facts, seen_release_processes)
    elif name in {".bumpversion.cfg", ".bumpversion.toml"}:
        _append_release_process(facts, seen_release_processes, name, "versioning config", "bumpversion", "bumpversion patch", source_path, 1, "bumpversion-config", "bumpversion configuration")
    elif name in {"changelog.md", "changes.md"} or "changelog" in name:
        _append_release_process(facts, seen_release_processes, PurePosixPath(source_path).name, "changelog", "Changelog", "", source_path, 1, "changelog", "Release notes or changelog file")


def _extract_package_json_release_processes(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_release_processes: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return

    package_manager = _detect_node_package_manager(file_path.parent)
    package_name = data.get("name") if isinstance(data.get("name"), str) else "package"
    version = data.get("version") if isinstance(data.get("version"), str) else ""
    if version:
        _append_release_process(facts, seen_release_processes, package_name, "package version", package_manager, "", source_path, _line_number_for_key(text, "version") or 1, "package-version", f"package version {version}")
    if isinstance(data.get("publishConfig"), dict):
        registry = data["publishConfig"].get("registry") if isinstance(data["publishConfig"].get("registry"), str) else ""
        detail = f"publishConfig registry {registry}" if registry else "package publishConfig"
        _append_release_process(facts, seen_release_processes, package_name, "registry", package_manager, f"{package_manager} publish", source_path, _line_number_for_key(text, "publishConfig") or 1, "package-publish-config", detail)

    scripts = data.get("scripts") if isinstance(data.get("scripts"), dict) else {}
    for raw_name, raw_command in sorted(scripts.items(), key=lambda item: _script_sort_key(str(item[0]))):
        if not isinstance(raw_command, str):
            continue
        script_name = str(raw_name)
        if not _is_release_script(script_name, raw_command):
            continue
        tool = _release_tool_from_text(raw_command) or package_manager
        _append_release_process(facts, seen_release_processes, script_name, "script", tool, _node_script_command(package_manager, script_name), source_path, _line_number_for_text(text, script_name) or 1, "package-scripts", raw_command)

    for scope, raw_deps in (
        ("runtime", data.get("dependencies") if isinstance(data.get("dependencies"), dict) else {}),
        ("dev", data.get("devDependencies") if isinstance(data.get("devDependencies"), dict) else {}),
        ("optional", data.get("optionalDependencies") if isinstance(data.get("optionalDependencies"), dict) else {}),
    ):
        for dependency in sorted(raw_deps):
            signal = _release_dependency_signal(str(dependency), "JavaScript/TypeScript")
            if signal is None:
                continue
            tool, category, detail = signal
            _append_release_process(facts, seen_release_processes, str(dependency), category, tool, _default_release_command(tool, package_manager), source_path, _line_number_for_text(text, str(dependency)) or 1, f"package-{scope}-dependency", detail)


def _extract_pyproject_release_processes(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_release_processes: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_toml_text(text)
    if not isinstance(data, dict):
        return
    project = data.get("project") if isinstance(data.get("project"), dict) else {}
    tool_data = data.get("tool") if isinstance(data.get("tool"), dict) else {}
    poetry = tool_data.get("poetry") if isinstance(tool_data.get("poetry"), dict) else {}
    package_name = str(project.get("name") or poetry.get("name") or "Python package")
    version = project.get("version") if isinstance(project.get("version"), str) else poetry.get("version") if isinstance(poetry.get("version"), str) else ""
    if version:
        _append_release_process(facts, seen_release_processes, package_name, "package version", "Python packaging", "", source_path, _line_number_for_key(text, "version") or 1, "pyproject-version", f"package version {version}")
    if isinstance(tool_data.get("semantic_release"), dict) or isinstance(tool_data.get("semantic-release"), dict):
        _append_release_process(facts, seen_release_processes, "python-semantic-release", "config", "python-semantic-release", "semantic-release publish", source_path, _line_number_for_key(text, "semantic_release") or _line_number_for_key(text, "semantic-release") or 1, "pyproject-semantic-release", "Python semantic release configuration")
    if isinstance(tool_data.get("towncrier"), dict):
        _append_release_process(facts, seen_release_processes, "towncrier", "changelog config", "Towncrier", "towncrier build", source_path, _line_number_for_key(text, "towncrier") or 1, "pyproject-towncrier", "Towncrier changelog configuration")
    if isinstance(tool_data.get("bumpversion"), dict) or isinstance(tool_data.get("bump2version"), dict):
        _append_release_process(facts, seen_release_processes, "bumpversion", "versioning config", "bumpversion", "bumpversion patch", source_path, _line_number_for_key(text, "bumpversion") or _line_number_for_key(text, "bump2version") or 1, "pyproject-bumpversion", "Python version bump configuration")
    if isinstance(tool_data.get("hatch"), dict):
        hatch = tool_data.get("hatch")
        if isinstance(hatch.get("version"), dict):
            _append_release_process(facts, seen_release_processes, "hatch version", "versioning config", "Hatch", "hatch version", source_path, _line_number_for_key(text, "version") or 1, "pyproject-hatch-version", "Hatch version configuration")

    dependency_names = set()
    for item in project.get("dependencies") if isinstance(project.get("dependencies"), list) else []:
        if isinstance(item, str):
            dependency_names.add(_python_dependency_name(item))
    optional = project.get("optional-dependencies") if isinstance(project.get("optional-dependencies"), dict) else {}
    for items in optional.values():
        if isinstance(items, list):
            dependency_names.update(_python_dependency_name(item) for item in items if isinstance(item, str))
    poetry_dependencies = poetry.get("dependencies") if isinstance(poetry.get("dependencies"), dict) else {}
    poetry_dev_dependencies = poetry.get("dev-dependencies") if isinstance(poetry.get("dev-dependencies"), dict) else {}
    dependency_names.update(name for name in poetry_dependencies if str(name).lower() != "python")
    dependency_names.update(poetry_dev_dependencies)
    for dependency in sorted(name for name in dependency_names if name):
        signal = _release_dependency_signal(dependency, "Python")
        if signal is None:
            continue
        tool, category, detail = signal
        _append_release_process(facts, seen_release_processes, dependency, category, tool, _default_release_command(tool, "python"), source_path, _line_number_for_text(text, dependency) or 1, "pyproject-dependency", detail)


def _extract_cargo_release_processes(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_release_processes: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_toml_text(text)
    if not isinstance(data, dict):
        return
    package = data.get("package") if isinstance(data.get("package"), dict) else {}
    package_name = str(package.get("name") or "Rust crate")
    version = package.get("version") if isinstance(package.get("version"), str) else ""
    if version:
        _append_release_process(facts, seen_release_processes, package_name, "package version", "Cargo", "", source_path, _line_number_for_key(text, "version") or 1, "cargo-version", f"crate version {version}")
    if "publish" in package:
        publish = str(package.get("publish"))
        _append_release_process(facts, seen_release_processes, package_name, "registry", "Cargo", "cargo publish", source_path, _line_number_for_key(text, "publish") or 1, "cargo-publish", f"Cargo publish setting {publish}")
    dev_dependencies = data.get("dev-dependencies") if isinstance(data.get("dev-dependencies"), dict) else {}
    for dependency in sorted(dev_dependencies):
        signal = _release_dependency_signal(str(dependency), "Rust")
        if signal is None:
            continue
        tool, category, detail = signal
        _append_release_process(facts, seen_release_processes, str(dependency), category, tool, _default_release_command(tool, "cargo"), source_path, _line_number_for_text(text, str(dependency)) or 1, "cargo-dev-dependency", detail)


def _extract_composer_release_processes(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_release_processes: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return
    package_name = data.get("name") if isinstance(data.get("name"), str) else "PHP package"
    version = data.get("version") if isinstance(data.get("version"), str) else ""
    if version:
        _append_release_process(facts, seen_release_processes, package_name, "package version", "Composer", "", source_path, _line_number_for_key(text, "version") or 1, "composer-version", f"package version {version}")
    scripts = data.get("scripts") if isinstance(data.get("scripts"), dict) else {}
    for script_name, script_body in sorted(scripts.items()):
        body = " ".join(script_body) if isinstance(script_body, list) else str(script_body)
        if not _is_release_script(str(script_name), body):
            continue
        tool = _release_tool_from_text(body) or "Composer"
        _append_release_process(facts, seen_release_processes, str(script_name), "script", tool, f"composer {script_name}", source_path, _line_number_for_text(text, str(script_name)) or 1, "composer-script", body)
    for scope, raw_deps in (
        ("runtime", data.get("require") if isinstance(data.get("require"), dict) else {}),
        ("dev", data.get("require-dev") if isinstance(data.get("require-dev"), dict) else {}),
    ):
        for dependency in sorted(raw_deps):
            signal = _release_dependency_signal(str(dependency), "PHP")
            if signal is None:
                continue
            tool, category, detail = signal
            _append_release_process(facts, seen_release_processes, str(dependency), category, tool, _default_release_command(tool, "composer"), source_path, _line_number_for_text(text, str(dependency)) or 1, f"composer-{scope}-dependency", detail)


def _extract_ruby_release_processes(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_release_processes: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    if source_path.lower().endswith(".gemspec"):
        gem_name = _ruby_gemspec_name(text) or PurePosixPath(source_path).stem
        version_ref = _ruby_gemspec_version(text)
        detail = f"gemspec version {version_ref}" if version_ref else "Ruby gemspec"
        _append_release_process(facts, seen_release_processes, gem_name, "package version", "RubyGems", "gem build", source_path, _line_number_for_text(text, gem_name) or 1, "gemspec", detail)
        return
    for match in re.finditer(r"(?m)^\s*gem\s+['\"]([^'\"]+)['\"]", text):
        gem_name = match.group(1)
        signal = _release_dependency_signal(gem_name, "Ruby")
        if signal is None:
            continue
        tool, category, detail = signal
        _append_release_process(facts, seen_release_processes, gem_name, category, tool, _default_release_command(tool, "bundler"), source_path, _line_number(text, match.start()), "gemfile-dependency", detail)


def _extract_release_task_file(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_release_processes: set,
    name: str,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    if name == "makefile":
        entries = _make_target_entries(text)
        tool = "Make"
        command_prefix = "make"
    elif name == "justfile":
        entries = _just_target_entries(text)
        tool = "Just"
        command_prefix = "just"
    else:
        entries = _rake_task_entries(text)
        tool = "Rake"
        command_prefix = "rake"
    for target_name, line in entries:
        lower = target_name.lower()
        if not any(token in lower for token in ("release", "publish", "version", "tag", "changelog")):
            continue
        _append_release_process(facts, seen_release_processes, target_name, "task", tool, f"{command_prefix} {target_name}", source_path, line, f"{name}-release-task", f"{tool} release task")


def _extract_workflow_release_processes(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_release_processes: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    lower = text.lower()
    workflow_name, workflow_line = _ci_workflow_name(text, source_path)
    events = _ci_workflow_events(text)
    if any(event in {"release", "workflow_dispatch"} or "tag" in event for event in events) or re.search(r"(?m)^\s*tags\s*:", text):
        _append_release_process(facts, seen_release_processes, workflow_name, "workflow", "GitHub Actions", "", source_path, workflow_line, "workflow-trigger", f"release workflow events: {', '.join(events) if events else 'tag/release trigger'}")
    workflow_tools = (
        ("cycjimmy/semantic-release-action", "semantic-release", "release action", "semantic-release GitHub Action"),
        ("semantic-release", "semantic-release", "release command", "semantic-release workflow command"),
        ("changesets/action", "Changesets", "release action", "Changesets GitHub Action"),
        ("googleapis/release-please-action", "Release Please", "release action", "Release Please GitHub Action"),
        ("release-please", "Release Please", "release command", "Release Please workflow command"),
        ("goreleaser/goreleaser-action", "GoReleaser", "release action", "GoReleaser GitHub Action"),
        ("softprops/action-gh-release", "GitHub Releases", "release action", "GitHub release action"),
        ("ncipollo/release-action", "GitHub Releases", "release action", "GitHub release action"),
        ("pypa/gh-action-pypi-publish", "PyPI", "publish action", "PyPI publish action"),
        ("js-devtools/npm-publish", "npm", "publish action", "npm publish action"),
        ("npm publish", "npm", "publish command", "npm publish command"),
        ("pnpm publish", "pnpm", "publish command", "pnpm publish command"),
        ("yarn npm publish", "yarn", "publish command", "Yarn npm publish command"),
        ("twine upload", "Twine", "publish command", "Twine upload command"),
        ("cargo publish", "Cargo", "publish command", "Cargo publish command"),
        ("gem push", "RubyGems", "publish command", "RubyGems publish command"),
        ("docker/metadata-action", "Docker", "release metadata", "Docker metadata action"),
        ("docker/build-push-action", "Docker", "publish action", "Docker image publish action"),
    )
    for needle, tool, category, detail in workflow_tools:
        if needle not in lower:
            continue
        _append_release_process(facts, seen_release_processes, tool, category, tool, _workflow_release_command(text, needle), source_path, _line_number_for_text(text, needle) or 1, "workflow-signal", detail)


def _extract_semantic_release_config(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_release_processes: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    branches = _release_config_branches(text)
    detail = f"semantic-release branches {branches}" if branches else "semantic-release configuration"
    _append_release_process(facts, seen_release_processes, PurePosixPath(source_path).name, "config", "semantic-release", "semantic-release", source_path, 1, "semantic-release-config", detail)


def _extract_changesets_config(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_release_processes: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_jsonc_text(text)
    base_branch = data.get("baseBranch") if isinstance(data, dict) and isinstance(data.get("baseBranch"), str) else ""
    detail = f"base branch {base_branch}" if base_branch else "Changesets release configuration"
    _append_release_process(facts, seen_release_processes, "Changesets", "config", "Changesets", "changeset version", source_path, _line_number_for_key(text, "baseBranch") or 1, "changesets-config", detail)


def _extract_release_please_config(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_release_processes: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_jsonc_text(text)
    packages = []
    if isinstance(data, dict):
        raw_packages = data.get("packages")
        if isinstance(raw_packages, dict):
            packages = list(raw_packages)[:4]
    detail = f"packages: {', '.join(packages)}" if packages else "Release Please configuration"
    _append_release_process(facts, seen_release_processes, PurePosixPath(source_path).name, "config", "Release Please", "release-please", source_path, 1, "release-please-config", detail)


def _extract_goreleaser_config(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_release_processes: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    project_name = _yaml_scalar_value(text, "project_name") or PurePosixPath(source_path).name
    detail_parts = []
    if "brews:" in text:
        detail_parts.append("Homebrew tap")
    if "dockers:" in text or "docker_manifests:" in text:
        detail_parts.append("Docker image release")
    if "nfpms:" in text:
        detail_parts.append("Linux package release")
    _append_release_process(facts, seen_release_processes, project_name, "config", "GoReleaser", "goreleaser release", source_path, _line_number_for_key(text, "project_name") or 1, "goreleaser-config", "; ".join(detail_parts) or "GoReleaser configuration")


def _is_release_script(name: str, command: str) -> bool:
    lower_name = str(name or "").lower()
    lower_command = str(command or "").lower()
    return any(token in lower_name for token in ("release", "publish", "version", "changelog", "changeset", "tag")) or any(
        token in lower_command
        for token in (
            "semantic-release",
            "release-it",
            "changeset",
            "release-please",
            "goreleaser",
            "npm publish",
            "pnpm publish",
            "yarn npm publish",
            "twine upload",
            "cargo publish",
            "gem push",
            "standard-version",
            "bumpversion",
            "towncrier",
        )
    )


def _release_tool_from_text(text: str) -> str:
    lower = str(text or "").lower()
    signals = (
        ("semantic-release", "semantic-release"),
        ("release-it", "release-it"),
        ("changesets/action", "Changesets"),
        ("changeset", "Changesets"),
        ("release-please", "Release Please"),
        ("goreleaser", "GoReleaser"),
        ("standard-version", "standard-version"),
        ("npm publish", "npm"),
        ("pnpm publish", "pnpm"),
        ("yarn npm publish", "yarn"),
        ("twine upload", "Twine"),
        ("pypi", "PyPI"),
        ("cargo publish", "Cargo"),
        ("crates.io", "Cargo"),
        ("gem push", "RubyGems"),
        ("bumpversion", "bumpversion"),
        ("towncrier", "Towncrier"),
        ("github release", "GitHub Releases"),
        ("gh release", "GitHub Releases"),
    )
    for needle, tool in signals:
        if needle in lower:
            return tool
    return ""


def _release_dependency_signal(name: str, ecosystem: str) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_dependency_signal_name(name)
    ecosystem_value = str(ecosystem or "").lower()
    if ecosystem_value == "javascript/typescript":
        exact = {
            "semantic-release": ("semantic-release", "release tool", "semantic-release dependency"),
            "release-it": ("release-it", "release tool", "release-it dependency"),
            "@changesets/cli": ("Changesets", "release tool", "Changesets CLI dependency"),
            "changesets": ("Changesets", "release tool", "Changesets dependency"),
            "standard-version": ("standard-version", "versioning tool", "standard-version dependency"),
            "release-please": ("Release Please", "release tool", "Release Please dependency"),
            "np": ("np", "publish tool", "np npm publish helper"),
            "npm-run-all": ("npm scripts", "release helper", "npm-run-all script helper"),
        }
        return exact.get(normalized)
    if ecosystem_value == "python":
        exact = {
            "twine": ("Twine", "publish tool", "Twine PyPI upload dependency"),
            "build": ("Python build", "build tool", "python -m build dependency"),
            "python-semantic-release": ("python-semantic-release", "release tool", "Python semantic-release dependency"),
            "bump2version": ("bump2version", "versioning tool", "bump2version dependency"),
            "bumpversion": ("bumpversion", "versioning tool", "bumpversion dependency"),
            "towncrier": ("Towncrier", "changelog tool", "Towncrier dependency"),
            "hatch": ("Hatch", "publish tool", "Hatch dependency"),
            "poetry-dynamic-versioning": ("Poetry dynamic versioning", "versioning tool", "Poetry dynamic versioning dependency"),
        }
        return exact.get(normalized)
    if ecosystem_value == "rust":
        exact = {
            "cargo-release": ("cargo-release", "release tool", "cargo-release dev dependency"),
            "git-cliff": ("git-cliff", "changelog tool", "git-cliff changelog dependency"),
        }
        return exact.get(normalized)
    if ecosystem_value == "php":
        exact = {
            "consolidation/robo": ("Robo", "release helper", "Robo task runner dependency"),
            "phar-io/version": ("PHAR versioning", "versioning tool", "PHAR version dependency"),
        }
        return exact.get(normalized)
    if ecosystem_value == "ruby":
        exact = {
            "bundler": ("Bundler", "publish tool", "Bundler gem release tooling"),
            "rake": ("Rake", "release helper", "Rake task runner dependency"),
            "gem-release": ("gem-release", "release tool", "gem-release dependency"),
        }
        return exact.get(normalized)
    return None


def _default_release_command(tool: str, package_manager: str) -> str:
    normalized = str(tool or "").lower()
    manager = str(package_manager or "").lower()
    if normalized == "semantic-release":
        return "semantic-release"
    if normalized == "release-it":
        return "release-it"
    if normalized == "changesets":
        return "changeset version && changeset publish"
    if normalized == "release please":
        return "release-please"
    if normalized == "goreleaser":
        return "goreleaser release"
    if normalized in {"npm", "pnpm", "yarn"}:
        return f"{normalized} publish" if normalized != "yarn" else "yarn npm publish"
    if normalized == "twine":
        return "python -m twine upload dist/*"
    if normalized == "python build":
        return "python -m build"
    if normalized in {"python-semantic-release", "bumpversion", "bump2version", "towncrier", "hatch"}:
        return normalized
    if normalized == "cargo":
        return "cargo publish"
    if normalized == "cargo-release":
        return "cargo release"
    if normalized == "rubygems":
        return "gem push"
    if normalized == "bundler":
        return "bundle exec rake release"
    if manager in {"npm", "pnpm", "yarn"}:
        return _node_script_command(manager, "release")
    return ""


def _workflow_release_command(text: str, needle: str) -> str:
    for raw_line in text.splitlines():
        if needle.lower() not in raw_line.lower():
            continue
        match = re.match(r"^\s*(?:-\s*)?run\s*:\s*(?P<value>.+?)\s*$", raw_line)
        if match:
            return _clean_ci_scalar(match.group("value"))[:180]
        return ""
    return ""


def _release_config_branches(text: str) -> str:
    match = re.search(r"branches\s*[:=]\s*(\[[^\]]+\]|['\"][^'\"]+['\"])", text)
    if not match:
        return ""
    return " ".join(match.group(1).strip().strip("[]").replace("\"", "").replace("'", "").split())[:120]


def _rake_task_entries(text: str) -> List[tuple[str, int]]:
    entries: List[tuple[str, int]] = []
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        match = re.match(r"\s*task\s+[:'\"]?([A-Za-z0-9_.:-]+)", raw_line)
        if match:
            entries.append((match.group(1).strip(":'\""), line_number))
    return entries


def _ruby_gemspec_name(text: str) -> str:
    match = re.search(r"\.name\s*=\s*['\"]([^'\"]+)['\"]", text)
    return match.group(1).strip() if match else ""


def _ruby_gemspec_version(text: str) -> str:
    match = re.search(r"\.version\s*=\s*([^#\n]+)", text)
    return " ".join(match.group(1).strip().strip("'\"").split())[:120] if match else ""


def _append_dev_environment(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    tool: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").strip().split())[:180]
    category_value = " ".join(str(category or "").strip().split())[:80]
    tool_value = " ".join(str(tool or "").strip().split())[:80]
    if not name_value or not category_value or not tool_value:
        return

    line_value = int(line or 1)
    key = (tool_value.lower(), category_value.lower(), name_value.lower(), source_path, line_value, str(source or ""))
    if key in seen or len(facts["dev_environments"]) >= MAX_DEV_ENVIRONMENT_FACTS:
        return
    seen.add(key)
    facts["dev_environments"].append({
        "name": name_value,
        "category": category_value,
        "tool": tool_value,
        "source_path": source_path,
        "line": line_value,
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:240],
    })


def _is_dev_environment_path(relative_path: Path, name: str) -> bool:
    normalized = _to_posix(relative_path).lower()
    parts = [part.lower() for part in relative_path.parts]
    if name == "devcontainer.json" and ({".devcontainer", "codespaces"}.intersection(parts) or normalized.endswith("/devcontainer.json")):
        return True
    if normalized in {".vscode/extensions.json", ".vscode/settings.json"}:
        return True
    if name in {
        "devbox.json",
        "flake.nix",
        "shell.nix",
        "default.nix",
        "devenv.nix",
        "devenv.yaml",
        "devenv.yml",
        ".envrc",
        "mise.toml",
        ".mise.toml",
        "mise.local.toml",
        ".tool-versions",
        "tiltfile",
        "skaffold.yaml",
        "skaffold.yml",
        "procfile.dev",
        "procfile.development",
        "processes.dev",
        "overmind.yml",
        "overmind.yaml",
    }:
        return True
    if name.startswith(("docker-compose.", "compose.")) and "dev" in name and name.endswith((".yml", ".yaml")):
        return True
    return False


def _extract_dev_environments(
    file_path: Path,
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    name = file_path.name.lower()
    normalized = _to_posix(relative_path).lower()
    if name == "devcontainer.json":
        _extract_devcontainer_environment(file_path, relative_path, source_path, facts, seen_dev_environments)
    elif normalized == ".vscode/extensions.json":
        _extract_vscode_extensions_environment(file_path, source_path, facts, seen_dev_environments)
    elif normalized == ".vscode/settings.json":
        _extract_vscode_settings_environment(file_path, source_path, facts, seen_dev_environments)
    elif name in {"flake.nix", "shell.nix", "default.nix", "devenv.nix", "devenv.yaml", "devenv.yml"}:
        _extract_nix_environment(file_path, source_path, facts, seen_dev_environments)
    elif name == "devbox.json":
        _extract_devbox_environment(file_path, source_path, facts, seen_dev_environments)
    elif name == ".envrc":
        _extract_direnv_environment(file_path, source_path, facts, seen_dev_environments)
    elif name in {"mise.toml", ".mise.toml", "mise.local.toml"}:
        _extract_mise_environment(file_path, source_path, facts, seen_dev_environments)
    elif name == ".tool-versions":
        _extract_asdf_environment(file_path, source_path, facts, seen_dev_environments)
    elif name == "tiltfile":
        _extract_tilt_environment(file_path, source_path, facts, seen_dev_environments)
    elif name in {"skaffold.yaml", "skaffold.yml"}:
        _extract_skaffold_environment(file_path, source_path, facts, seen_dev_environments)
    elif name in {"procfile.dev", "procfile.development", "processes.dev", "overmind.yml", "overmind.yaml"}:
        _extract_process_environment(file_path, source_path, facts, seen_dev_environments)
    elif name.startswith(("docker-compose.", "compose.")):
        _extract_compose_dev_environment(file_path, source_path, facts, seen_dev_environments)


def _extract_devcontainer_environment(
    file_path: Path,
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_jsonc_text(text)
    if not isinstance(data, dict):
        return

    path_parts = {part.lower() for part in relative_path.parts}
    tool = "Codespaces" if "codespaces" in path_parts else "Dev Containers"
    category = "codespaces" if tool == "Codespaces" else "dev container"
    name = str(data.get("name") or PurePosixPath(source_path).parent.name or "dev container").strip()
    detail_parts = []
    for key, label in (("image", "image"), ("dockerFile", "dockerfile"), ("dockerfile", "dockerfile"), ("service", "service")):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            detail_parts.append(f"{label} {value.strip()}")
    compose = data.get("dockerComposeFile")
    if isinstance(compose, str) and compose.strip():
        detail_parts.append(f"compose {compose.strip()}")
    elif isinstance(compose, list):
        compose_files = [str(item).strip() for item in compose if str(item).strip()]
        if compose_files:
            detail_parts.append("compose " + ", ".join(compose_files[:3]))
    features = data.get("features")
    if isinstance(features, dict) and features:
        detail_parts.append(f"{len(features)} features")
    _append_dev_environment(
        facts,
        seen_dev_environments,
        name=name,
        category=category,
        tool=tool,
        source_path=source_path,
        line=_line_number_for_text(text, name) or _line_number_for_key(text, "name") or 1,
        source="devcontainer-json",
        detail="; ".join(detail_parts) or "Dev container configuration",
    )

    for command_key in ("postCreateCommand", "postStartCommand", "initializeCommand"):
        command_value = data.get(command_key)
        if isinstance(command_value, str) and command_value.strip():
            _append_dev_environment(
                facts,
                seen_dev_environments,
                name=command_key,
                category="setup command",
                tool=tool,
                source_path=source_path,
                line=_line_number_for_key(text, command_key) or 1,
                source="devcontainer-command",
                detail=command_value.strip(),
            )

    customizations = data.get("customizations") if isinstance(data.get("customizations"), dict) else {}
    vscode = customizations.get("vscode") if isinstance(customizations.get("vscode"), dict) else {}
    for extension in _string_list(vscode.get("extensions"))[:12]:
        _append_dev_environment(
            facts,
            seen_dev_environments,
            name=extension,
            category="editor extension",
            tool="VS Code",
            source_path=source_path,
            line=_line_number_for_text(text, extension) or _line_number_for_key(text, "extensions") or 1,
            source="devcontainer-vscode",
            detail="Dev container recommended extension",
        )


def _extract_vscode_extensions_environment(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_jsonc_text(text)
    if not isinstance(data, dict):
        return
    for extension in _string_list(data.get("recommendations"))[:24]:
        _append_dev_environment(
            facts,
            seen_dev_environments,
            name=extension,
            category="editor extension",
            tool="VS Code",
            source_path=source_path,
            line=_line_number_for_text(text, extension) or _line_number_for_key(text, "recommendations") or 1,
            source="vscode-recommendations",
            detail="VS Code recommended extension",
        )


def _extract_vscode_settings_environment(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_jsonc_text(text)
    if not isinstance(data, dict):
        return
    keys = [str(key) for key in sorted(data) if not str(key).startswith("_")]
    if not keys:
        return
    _append_dev_environment(
        facts,
        seen_dev_environments,
        name=".vscode/settings.json",
        category="editor settings",
        tool="VS Code",
        source_path=source_path,
        line=1,
        source="vscode-settings",
        detail="Workspace settings: " + ", ".join(keys[:8]),
    )


def _extract_nix_environment(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    name = PurePosixPath(source_path).name
    lower = text.lower()
    tool = "devenv" if "devenv" in PurePosixPath(source_path).name.lower() else "Nix"
    if "devshell" in lower or "mkshell" in lower or tool == "devenv":
        shell_name = _nix_dev_shell_name(text, source_path)
        detail = "Nix dev shell"
        if tool == "devenv":
            detail = "devenv development shell"
        _append_dev_environment(
            facts,
            seen_dev_environments,
            name=shell_name or name,
            category="nix shell" if tool == "Nix" else "dev shell",
            tool=tool,
            source_path=source_path,
            line=_line_number_for_text(text, "devShell") or _line_number_for_text(text, "mkShell") or 1,
            source="nix",
            detail=detail,
        )


def _extract_devbox_environment(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_jsonc_text(text)
    if not isinstance(data, dict):
        return
    packages = _string_list(data.get("packages"))
    _append_dev_environment(
        facts,
        seen_dev_environments,
        name="devbox",
        category="dev shell",
        tool="Devbox",
        source_path=source_path,
        line=_line_number_for_key(text, "packages") or 1,
        source="devbox-json",
        detail=f"{len(packages)} packages" if packages else "Devbox shell configuration",
    )


def _extract_direnv_environment(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        if line.startswith(("use ", "layout ", "source_env", "dotenv")):
            name = line.split(" ", 2)[0] + (" " + line.split(" ", 2)[1] if " " in line else "")
            _append_dev_environment(
                facts,
                seen_dev_environments,
                name=name,
                category="direnv",
                tool="direnv",
                source_path=source_path,
                line=line_number,
                source="envrc",
                detail=line,
            )


def _extract_mise_environment(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    data = _read_toml_text(text)
    if not isinstance(data, dict):
        return
    tools = data.get("tools") if isinstance(data.get("tools"), dict) else {}
    for tool_name, raw_requirement in sorted(tools.items()):
        requirement = _dev_tool_requirement(raw_requirement)
        if not requirement:
            continue
        _append_dev_environment(
            facts,
            seen_dev_environments,
            name=str(tool_name),
            category="tool version",
            tool="mise",
            source_path=source_path,
            line=_line_number_for_text(text, str(tool_name)) or _line_number_for_key(text, "tools") or 1,
            source="mise-tools",
            detail=f"mise {tool_name} {requirement}",
        )


def _extract_asdf_environment(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        _append_dev_environment(
            facts,
            seen_dev_environments,
            name=parts[0],
            category="tool version",
            tool="asdf",
            source_path=source_path,
            line=line_number,
            source="tool-versions",
            detail=f"asdf {parts[0]} {' '.join(parts[1:])}",
        )


def _extract_tilt_environment(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    signals = [name for name in ("docker_build", "k8s_yaml", "helm", "local_resource", "docker_compose") if name in text]
    _append_dev_environment(
        facts,
        seen_dev_environments,
        name="Tiltfile",
        category="cluster dev loop",
        tool="Tilt",
        source_path=source_path,
        line=1,
        source="tiltfile",
        detail="Tilt dev loop" + (": " + ", ".join(signals[:5]) if signals else ""),
    )


def _extract_skaffold_environment(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    name = _yaml_metadata_name(text) or "skaffold"
    _append_dev_environment(
        facts,
        seen_dev_environments,
        name=name,
        category="cluster dev loop",
        tool="Skaffold",
        source_path=source_path,
        line=_line_number_for_text(text, name) or _line_number_for_key(text, "apiVersion") or 1,
        source="skaffold-yaml",
        detail="Skaffold local Kubernetes workflow",
    )


def _extract_process_environment(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    name = PurePosixPath(source_path).name.lower()
    tool = "Overmind" if name.startswith("overmind") else "Procfile"
    if name.startswith("overmind") and name.endswith((".yml", ".yaml")):
        for process_name, line in _yaml_map_entries_under_path(text, ("processes",)):
            _append_dev_environment(
                facts,
                seen_dev_environments,
                name=process_name,
                category="local process",
                tool=tool,
                source_path=source_path,
                line=line,
                source="overmind-process",
                detail="Overmind local process",
            )
        return

    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        process_name, command = line.split(":", 1)
        process_name = process_name.strip()
        command = command.strip()
        if not process_name or not command:
            continue
        _append_dev_environment(
            facts,
            seen_dev_environments,
            name=process_name,
            category="local process",
            tool=tool,
            source_path=source_path,
            line=line_number,
            source="procfile-dev",
            detail=command,
        )


def _extract_compose_dev_environment(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_dev_environments: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    service_count = _count_compose_services(text)
    _append_dev_environment(
        facts,
        seen_dev_environments,
        name=PurePosixPath(source_path).name,
        category="compose dev environment",
        tool="Docker Compose",
        source_path=source_path,
        line=1,
        source="compose-dev",
        detail=f"{service_count} dev services" if service_count else "Dev Compose file",
    )


def _read_jsonc_text(text: str) -> Any:
    try:
        return json.loads(_strip_json_comments_and_trailing_commas(text))
    except json.JSONDecodeError:
        return None


def _strip_json_comments_and_trailing_commas(text: str) -> str:
    out: List[str] = []
    index = 0
    quote = ""
    escaped = False
    while index < len(text):
        char = text[index]
        nxt = text[index + 1] if index + 1 < len(text) else ""
        if quote:
            out.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
            index += 1
            continue
        if char in {"'", '"'}:
            quote = char
            out.append(char)
            index += 1
            continue
        if char == "/" and nxt == "/":
            index += 2
            while index < len(text) and text[index] not in "\r\n":
                index += 1
            continue
        if char == "/" and nxt == "*":
            index += 2
            while index + 1 < len(text) and not (text[index] == "*" and text[index + 1] == "/"):
                index += 1
            index += 2
            continue
        out.append(char)
        index += 1
    return re.sub(r",(\s*[}\]])", r"\1", "".join(out))


def _string_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _dev_tool_requirement(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return ", ".join(str(item).strip() for item in value if str(item).strip())[:120]
    if isinstance(value, dict):
        for key in ("version", "ref", "path"):
            raw = value.get(key)
            if isinstance(raw, str) and raw.strip():
                return raw.strip()
    return ""


def _nix_dev_shell_name(text: str, source_path: str) -> str:
    for pattern in (
        r"\bdevShells\.[A-Za-z0-9_-]+\.(default|[A-Za-z0-9_-]+)\b",
        r"\bdevShell\.(default|[A-Za-z0-9_-]+)\b",
    ):
        match = re.search(pattern, text)
        if match:
            return f"flake {match.group(1)}"
    if "mkShell" in text:
        return PurePosixPath(source_path).name
    return ""


def _append_build_system(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    tool: str,
    command: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").strip().split())[:180]
    category_value = " ".join(str(category or "").strip().split())[:80]
    tool_value = " ".join(str(tool or "").strip().split())[:80]
    command_value = " ".join(str(command or "").strip().split())[:240]
    if not name_value or not category_value or not tool_value or not command_value:
        return

    key = (tool_value.lower(), category_value.lower(), name_value.lower(), command_value.lower(), source_path, int(line or 1))
    if key in seen or len(facts["build_systems"]) >= MAX_BUILD_SYSTEM_FACTS:
        return
    seen.add(key)
    facts["build_systems"].append({
        "name": name_value,
        "category": category_value,
        "tool": tool_value,
        "command": command_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:240],
    })


def _is_build_system_path(relative_path: Path, name: str) -> bool:
    normalized = _to_posix(relative_path).lower()
    suffix = PurePosixPath(name).suffix.lower()
    parts = [part.lower() for part in relative_path.parts]
    if name in {
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "settings.gradle",
        "settings.gradle.kts",
        "cmakelists.txt",
        "build",
        "build.bazel",
        "workspace",
        "workspace.bazel",
        "module.bazel",
        "buck",
        "targets",
        "meson.build",
        "build.ninja",
        "build.sbt",
        "mix.exs",
        "makefile",
        "justfile",
    }:
        return True
    if suffix in {".sln", ".csproj", ".fsproj", ".vbproj"}:
        return True
    if name == "project.pbxproj" and any(part.endswith(".xcodeproj") for part in parts):
        return True
    if name == "contents.xcworkspacedata" and any(part.endswith(".xcworkspace") for part in parts):
        return True
    return normalized.endswith(".xcodeproj/project.pbxproj") or normalized.endswith(".xcworkspace/contents.xcworkspacedata")


def _extract_build_systems(
    file_path: Path,
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    name = file_path.name.lower()
    suffix = PurePosixPath(name).suffix.lower()
    if name == "pom.xml":
        _extract_maven_build_systems(file_path, source_path, facts, seen_build_systems)
    elif name in {"build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"}:
        _extract_gradle_build_systems(file_path, source_path, facts, seen_build_systems)
    elif name == "cmakelists.txt":
        _extract_cmake_build_systems(file_path, source_path, facts, seen_build_systems)
    elif name in {"build", "build.bazel", "workspace", "workspace.bazel", "module.bazel"}:
        _extract_bazel_build_systems(file_path, source_path, facts, seen_build_systems)
    elif name in {"buck", "targets"}:
        _extract_buck_build_systems(file_path, source_path, facts, seen_build_systems)
    elif name == "meson.build":
        _extract_meson_build_systems(file_path, source_path, facts, seen_build_systems)
    elif name == "build.ninja":
        _extract_ninja_build_systems(file_path, source_path, facts, seen_build_systems)
    elif name == "build.sbt":
        _extract_sbt_build_systems(file_path, source_path, facts, seen_build_systems)
    elif name == "mix.exs":
        _extract_mix_build_systems(file_path, source_path, facts, seen_build_systems)
    elif name == "makefile":
        _extract_make_build_systems(file_path, source_path, facts, seen_build_systems)
    elif name == "justfile":
        _extract_just_build_systems(file_path, source_path, facts, seen_build_systems)
    elif suffix == ".sln":
        _extract_dotnet_solution_build_systems(file_path, source_path, facts, seen_build_systems)
    elif suffix in {".csproj", ".fsproj", ".vbproj"}:
        _extract_dotnet_project_build_systems(file_path, source_path, facts, seen_build_systems)
    elif name == "project.pbxproj":
        _extract_xcode_project_build_system(file_path, relative_path, source_path, facts, seen_build_systems)
    elif name == "contents.xcworkspacedata":
        _extract_xcode_workspace_build_system(file_path, relative_path, source_path, facts, seen_build_systems)


def _extract_maven_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return
    artifact_id = _xml_child_text(root, "artifactId") or PurePosixPath(source_path).parent.name or "maven-project"
    group_id = _xml_child_text(root, "groupId") or _xml_child_text(root, "parent/groupId")
    packaging = _xml_child_text(root, "packaging") or "jar"
    detail_parts = [part for part in (group_id, artifact_id, packaging) if part]
    _append_build_system(
        facts,
        seen_build_systems,
        name=artifact_id,
        category="project",
        tool="Maven",
        command="mvn test",
        source_path=source_path,
        line=_line_number_for_text(text, artifact_id) or _line_number_for_key(text, "artifactId") or 1,
        source="pom",
        detail="Maven project " + ":".join(detail_parts),
    )
    for module_name, line in _maven_module_entries(text):
        _append_build_system(
            facts,
            seen_build_systems,
            name=module_name,
            category="module",
            tool="Maven",
            command=f"mvn -pl {module_name} test",
            source_path=source_path,
            line=line,
            source="pom-modules",
            detail="Maven reactor module",
        )


def _extract_gradle_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    name = PurePosixPath(source_path).parent.name or "gradle-project"
    root_name_match = re.search(r"\brootProject\.name\s*=\s*['\"]([^'\"]+)['\"]", text)
    if root_name_match:
        name = root_name_match.group(1).strip()
    _append_build_system(
        facts,
        seen_build_systems,
        name=name,
        category="project",
        tool="Gradle",
        command="./gradlew build",
        source_path=source_path,
        line=_line_number_for_text(text, name) or 1,
        source="gradle",
        detail="Gradle build manifest",
    )
    for module_name, line in _gradle_include_entries(text):
        command_module = module_name if module_name.startswith(":") else f":{module_name}"
        _append_build_system(
            facts,
            seen_build_systems,
            name=module_name.strip(":"),
            category="module",
            tool="Gradle",
            command=f"./gradlew {command_module}:build",
            source_path=source_path,
            line=line,
            source="gradle-settings",
            detail="Gradle included project",
        )
    for plugin_name, line in _gradle_plugin_entries(text):
        _append_build_system(
            facts,
            seen_build_systems,
            name=plugin_name,
            category="plugin",
            tool="Gradle",
            command="./gradlew tasks",
            source_path=source_path,
            line=line,
            source="gradle-plugins",
            detail="Gradle plugin declaration",
        )
    for task_name, line in _gradle_task_entries(text):
        _append_build_system(
            facts,
            seen_build_systems,
            name=task_name,
            category="task",
            tool="Gradle",
            command=f"./gradlew {task_name}",
            source_path=source_path,
            line=line,
            source="gradle-task",
            detail="Gradle task declaration",
        )


def _extract_cmake_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    project_match = re.search(r"\bproject\s*\(\s*([A-Za-z0-9_.+-]+)", text, flags=re.IGNORECASE)
    project_name = project_match.group(1) if project_match else PurePosixPath(source_path).parent.name or "cmake-project"
    _append_build_system(
        facts,
        seen_build_systems,
        name=project_name,
        category="project",
        tool="CMake",
        command="cmake --build build",
        source_path=source_path,
        line=_line_number(text, project_match.start()) if project_match else 1,
        source="cmake-project",
        detail="CMake project declaration",
    )
    for match in re.finditer(r"\b(add_executable|add_library)\s*\(\s*([A-Za-z0-9_.+-]+)", text, flags=re.IGNORECASE):
        function_name = match.group(1).lower()
        target_name = match.group(2)
        _append_build_system(
            facts,
            seen_build_systems,
            name=target_name,
            category="executable" if function_name == "add_executable" else "library",
            tool="CMake",
            command=f"cmake --build build --target {target_name}",
            source_path=source_path,
            line=_line_number(text, match.start()),
            source="cmake-target",
            detail=f"CMake {function_name} target",
        )


def _extract_bazel_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    pure = PurePosixPath(source_path)
    name = pure.name.lower()
    if name in {"workspace", "workspace.bazel", "module.bazel"}:
        project_name = _bazel_workspace_name(text) or pure.parent.name or "bazel-workspace"
        _append_build_system(
            facts,
            seen_build_systems,
            name=project_name,
            category="workspace",
            tool="Bazel",
            command="bazel build //...",
            source_path=source_path,
            line=_line_number_for_text(text, project_name) or 1,
            source="bazel-workspace",
            detail="Bazel workspace/module manifest",
        )
        return

    for rule_kind, target_name, line in _bazel_rule_entries(text):
        label = _build_file_label(source_path, target_name)
        _append_build_system(
            facts,
            seen_build_systems,
            name=label,
            category="target",
            tool="Bazel",
            command=f"bazel build {label}",
            source_path=source_path,
            line=line,
            source=rule_kind,
            detail=f"Bazel {rule_kind} target",
        )


def _extract_buck_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for rule_kind, target_name, line in _bazel_rule_entries(text):
        label = _build_file_label(source_path, target_name)
        _append_build_system(
            facts,
            seen_build_systems,
            name=label,
            category="target",
            tool="Buck",
            command=f"buck build {label}",
            source_path=source_path,
            line=line,
            source=rule_kind,
            detail=f"Buck {rule_kind} target",
        )


def _extract_meson_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    project_match = re.search(r"\bproject\s*\(\s*['\"]([^'\"]+)['\"]", text)
    project_name = project_match.group(1) if project_match else PurePosixPath(source_path).parent.name or "meson-project"
    _append_build_system(
        facts,
        seen_build_systems,
        name=project_name,
        category="project",
        tool="Meson",
        command="meson compile -C build",
        source_path=source_path,
        line=_line_number(text, project_match.start()) if project_match else 1,
        source="meson-project",
        detail="Meson project declaration",
    )
    for match in re.finditer(r"\b(executable|library|shared_library|static_library|test)\s*\(\s*['\"]([^'\"]+)['\"]", text):
        kind = match.group(1)
        target_name = match.group(2)
        category = "test" if kind == "test" else ("library" if "library" in kind else "executable")
        command = "meson test -C build" if category == "test" else f"meson compile -C build {target_name}"
        _append_build_system(
            facts,
            seen_build_systems,
            name=target_name,
            category=category,
            tool="Meson",
            command=command,
            source_path=source_path,
            line=_line_number(text, match.start()),
            source=f"meson-{kind}",
            detail=f"Meson {kind} target",
        )


def _extract_ninja_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        match = re.match(r"\s*build\s+([^:\s]+)\s*:\s*([A-Za-z0-9_.+-]+)", raw_line)
        if not match:
            continue
        target_name = match.group(1)
        rule_name = match.group(2)
        if target_name.startswith("$") or target_name in {"build.ninja", "rules.ninja"}:
            continue
        _append_build_system(
            facts,
            seen_build_systems,
            name=target_name,
            category="target",
            tool="Ninja",
            command=f"ninja {target_name}",
            source_path=source_path,
            line=line_number,
            source="ninja-build",
            detail=f"Ninja rule {rule_name}",
        )
        if len(facts["build_systems"]) >= MAX_BUILD_SYSTEM_FACTS:
            return


def _extract_sbt_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    name_match = re.search(r"\bname\s*:=[ \t]*['\"]([^'\"]+)['\"]", text)
    project_name = name_match.group(1) if name_match else PurePosixPath(source_path).parent.name or "sbt-project"
    _append_build_system(
        facts,
        seen_build_systems,
        name=project_name,
        category="project",
        tool="SBT",
        command="sbt compile",
        source_path=source_path,
        line=_line_number(text, name_match.start()) if name_match else 1,
        source="sbt-build",
        detail="SBT project declaration",
    )
    for match in re.finditer(r"\blazy\s+val\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)\s*)?project\b", text):
        module_name = match.group(1)
        _append_build_system(
            facts,
            seen_build_systems,
            name=module_name,
            category="module",
            tool="SBT",
            command=f"sbt {module_name}/compile",
            source_path=source_path,
            line=_line_number(text, match.start()),
            source="sbt-project",
            detail="SBT subproject declaration",
        )


def _extract_mix_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    app_match = re.search(r"\bapp:\s*:([A-Za-z_][A-Za-z0-9_]*)", text)
    app_name = app_match.group(1) if app_match else PurePosixPath(source_path).parent.name or "mix-project"
    _append_build_system(
        facts,
        seen_build_systems,
        name=app_name,
        category="project",
        tool="Mix",
        command="mix test",
        source_path=source_path,
        line=_line_number(text, app_match.start()) if app_match else 1,
        source="mix-project",
        detail="Mix project declaration",
    )


def _extract_make_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for target_name, line in _make_target_entries(text):
        _append_build_system(
            facts,
            seen_build_systems,
            name=target_name,
            category="target",
            tool="Make",
            command=f"make {target_name}",
            source_path=source_path,
            line=line,
            source="make-target",
            detail="Makefile target",
        )


def _extract_just_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for target_name, line in _just_target_entries(text):
        _append_build_system(
            facts,
            seen_build_systems,
            name=target_name,
            category="task",
            tool="Just",
            command=f"just {target_name}",
            source_path=source_path,
            line=line,
            source="just-task",
            detail="Just recipe",
        )


def _extract_dotnet_solution_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    solution_name = PurePosixPath(source_path).stem
    _append_build_system(
        facts,
        seen_build_systems,
        name=solution_name,
        category="solution",
        tool=".NET",
        command=f"dotnet build {source_path}",
        source_path=source_path,
        line=1,
        source="dotnet-solution",
        detail=".NET solution file",
    )
    for match in re.finditer(r"(?m)^Project\([^)]*\)\s*=\s*\"([^\"]+)\"\s*,\s*\"([^\"]+)\"", text):
        project_name = match.group(1).strip()
        project_path = match.group(2).strip().replace("\\", "/")
        _append_build_system(
            facts,
            seen_build_systems,
            name=project_name,
            category="project",
            tool=".NET",
            command=f"dotnet build {project_path}",
            source_path=source_path,
            line=_line_number(text, match.start()),
            source="dotnet-solution-project",
            detail=f".NET solution project {project_path}",
        )


def _extract_dotnet_project_build_systems(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return
    project_name = _xml_child_text(root, "AssemblyName") or PurePosixPath(source_path).stem
    target_framework = _xml_child_text(root, "TargetFramework") or _xml_child_text(root, "TargetFrameworks")
    output_type = _xml_child_text(root, "OutputType") or "library"
    _append_build_system(
        facts,
        seen_build_systems,
        name=project_name,
        category="project",
        tool=".NET",
        command=f"dotnet build {source_path}",
        source_path=source_path,
        line=_line_number_for_text(text, project_name) or _line_number_for_key(text, "TargetFramework") or 1,
        source="dotnet-project",
        detail="; ".join(part for part in (f"target {target_framework}" if target_framework else "", f"output {output_type}" if output_type else "") if part) or ".NET project file",
    )


def _extract_xcode_project_build_system(
    file_path: Path,
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    project_name = _xcode_container_name(relative_path, ".xcodeproj") or PurePosixPath(source_path).parent.stem
    _append_build_system(
        facts,
        seen_build_systems,
        name=project_name,
        category="project",
        tool="Xcode",
        command=f"xcodebuild -project {project_name}.xcodeproj",
        source_path=source_path,
        line=1,
        source="xcode-project",
        detail="Xcode project file",
    )


def _extract_xcode_workspace_build_system(
    file_path: Path,
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_build_systems: set,
) -> None:
    workspace_name = _xcode_container_name(relative_path, ".xcworkspace") or PurePosixPath(source_path).parent.stem
    _append_build_system(
        facts,
        seen_build_systems,
        name=workspace_name,
        category="workspace",
        tool="Xcode",
        command=f"xcodebuild -workspace {workspace_name}.xcworkspace",
        source_path=source_path,
        line=1,
        source="xcode-workspace",
        detail="Xcode workspace file",
    )


def _xml_child_text(root: ET.Element, path: str) -> str:
    current: Optional[ET.Element] = root
    parts = path.split("/")
    for part in parts:
        if current is None:
            return ""
        found = None
        for child in list(current):
            if child.tag.rsplit("}", 1)[-1] == part:
                found = child
                break
        current = found
    if current is None and len(parts) == 1:
        for element in root.iter():
            if element is root:
                continue
            if element.tag.rsplit("}", 1)[-1] == parts[0]:
                current = element
                break
    return " ".join(str(current.text or "").split()) if current is not None else ""


def _maven_module_entries(text: str) -> List[tuple[str, int]]:
    entries: List[tuple[str, int]] = []
    modules_match = re.search(r"(?s)<modules\b[^>]*>(?P<body>.*?)</modules>", text)
    if not modules_match:
        return entries
    body = modules_match.group("body")
    for match in re.finditer(r"<module\b[^>]*>([^<]+)</module>", body):
        module_name = match.group(1).strip()
        if module_name:
            entries.append((module_name, _line_number(text, modules_match.start("body") + match.start())))
    return entries


def _gradle_include_entries(text: str) -> List[tuple[str, int]]:
    entries: List[tuple[str, int]] = []
    for match in re.finditer(r"\binclude\s*(?:\(?\s*)?([^\n\r]+)", text):
        raw = match.group(1)
        for module_match in re.finditer(r"['\"](:?[^'\"]+)['\"]", raw):
            module_name = module_match.group(1).strip()
            if module_name:
                entries.append((module_name, _line_number(text, match.start(1) + module_match.start())))
    return entries


def _gradle_plugin_entries(text: str) -> List[tuple[str, int]]:
    entries: List[tuple[str, int]] = []
    patterns = (
        r"\bid\s*\(\s*['\"]([^'\"]+)['\"]\s*\)",
        r"\bid\s+['\"]([^'\"]+)['\"]",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            plugin_name = match.group(1).strip()
            if plugin_name:
                entries.append((plugin_name, _line_number(text, match.start())))
    return entries


def _gradle_task_entries(text: str) -> List[tuple[str, int]]:
    entries: List[tuple[str, int]] = []
    patterns = (
        r"\btasks\.(?:register|create)\s*\(\s*['\"]([^'\"]+)['\"]",
        r"\btask\s+([A-Za-z_][A-Za-z0-9_-]*)\b",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            task_name = match.group(1).strip()
            if task_name:
                entries.append((task_name, _line_number(text, match.start())))
    return entries


def _bazel_workspace_name(text: str) -> str:
    for pattern in (
        r"\bworkspace\s*\(\s*name\s*=\s*['\"]([^'\"]+)['\"]",
        r"\bmodule\s*\(\s*name\s*=\s*['\"]([^'\"]+)['\"]",
    ):
        match = re.search(pattern, text, flags=re.DOTALL)
        if match:
            return match.group(1).strip()
    return ""


def _bazel_rule_entries(text: str) -> List[tuple[str, str, int]]:
    entries: List[tuple[str, str, int]] = []
    skip = {"load", "package", "exports_files", "glob", "filegroup"}
    for match in re.finditer(r"(?m)^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\(", text):
        rule_kind = match.group(1)
        if rule_kind in skip:
            continue
        body_start = match.end()
        body_end = _find_matching_paren(text, body_start - 1)
        if body_end <= body_start:
            continue
        body = text[body_start:body_end]
        name_match = re.search(r"\bname\s*=\s*['\"]([^'\"]+)['\"]", body)
        if not name_match:
            continue
        target_name = name_match.group(1).strip()
        if target_name:
            entries.append((rule_kind, target_name, _line_number(text, body_start + name_match.start())))
    return entries


def _find_matching_paren(text: str, open_index: int) -> int:
    depth = 0
    quote = ""
    escaped = False
    for index in range(open_index, len(text)):
        char = text[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
            continue
        if char in {"'", '"'}:
            quote = char
        elif char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return index
    return -1


def _build_file_label(source_path: str, target_name: str) -> str:
    parent = PurePosixPath(source_path).parent
    package = "" if str(parent) in {"", "."} else str(parent)
    return f"//{package}:{target_name}" if package else f"//:{target_name}"


def _make_target_entries(text: str) -> List[tuple[str, int]]:
    entries: List[tuple[str, int]] = []
    ignored = {"phony", "clean"}
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        if raw_line.startswith(("\t", " ", "#", ".")):
            continue
        match = re.match(r"([A-Za-z0-9_.-]+)\s*:(?![=])", raw_line)
        if not match:
            continue
        target_name = match.group(1)
        if target_name.lower() in ignored:
            continue
        entries.append((target_name, line_number))
    return entries


def _just_target_entries(text: str) -> List[tuple[str, int]]:
    entries: List[tuple[str, int]] = []
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        if raw_line.startswith(("#", " ", "\t", "@")):
            continue
        match = re.match(r"([A-Za-z0-9_-]+)(?:\s+[^:=]+)?\s*:", raw_line)
        if match:
            entries.append((match.group(1), line_number))
    return entries


def _xcode_container_name(relative_path: Path, suffix: str) -> str:
    suffix_value = suffix.lower()
    for part in relative_path.parts:
        if part.lower().endswith(suffix_value):
            return PurePosixPath(part).stem
    return ""


def _append_ui_surface(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    framework: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").strip().split())[:180]
    category_value = " ".join(str(category or "").strip().split())[:80]
    framework_value = " ".join(str(framework or "").strip().split())[:80]
    if not name_value or not category_value:
        return

    key = (framework_value.lower(), category_value.lower(), name_value.lower(), source_path, int(line or 1))
    if key in seen or len(facts["ui_surfaces"]) >= MAX_UI_SURFACE_FACTS:
        return
    seen.add(key)
    facts["ui_surfaces"].append({
        "name": name_value,
        "category": category_value,
        "framework": framework_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:240],
    })


def _is_ui_surface_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    parts = {part.lower() for part in relative_path.parts}
    if suffix in {".jsx", ".tsx", ".vue", ".svelte", ".astro"}:
        return True
    if name.endswith((".stories.js", ".stories.ts", ".story.js", ".story.ts")):
        return True
    if suffix in {".js", ".ts", ".mjs", ".cjs"} and parts & {"app", "pages", "routes", "components", "views", "frontend", "client", "ui"}:
        return True
    return False


def _extract_ui_surfaces(
    file_path: Path,
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_ui_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    pure = PurePosixPath(source_path)
    name = pure.name.lower()
    framework = _ui_framework_for_path(pure, text)
    if not framework:
        return

    route = _ui_route_from_path(relative_path)
    if route:
        _append_ui_surface(
            facts,
            seen_ui_surfaces,
            name=route,
            category="page",
            framework=framework,
            source_path=source_path,
            line=1,
            source="path-convention",
            detail=f"{framework} page route {route}",
        )

    if _is_storybook_story_name(name):
        _append_ui_surface(
            facts,
            seen_ui_surfaces,
            name=_ui_component_name_from_path(pure),
            category="story",
            framework=framework,
            source_path=source_path,
            line=1,
            source="storybook",
            detail="Storybook story file",
        )

    component_names = _ui_component_names(text, pure, framework)
    for component_name, line in component_names[:6]:
        _append_ui_surface(
            facts,
            seen_ui_surfaces,
            name=component_name,
            category="component",
            framework=framework,
            source_path=source_path,
            line=line,
            source="component-declaration",
            detail=f"{framework} component",
        )

    if re.search(r"<form\b", text, flags=re.IGNORECASE):
        surface_name = route or (component_names[0][0] if component_names else _ui_component_name_from_path(pure))
        _append_ui_surface(
            facts,
            seen_ui_surfaces,
            name=surface_name,
            category="form",
            framework=framework,
            source_path=source_path,
            line=_line_number_for_text(text, "<form") or 1,
            source="markup-signal",
            detail=f"{framework} form surface",
        )


def _ui_framework_for_path(path: PurePosixPath, text: str) -> str:
    name = path.name.lower()
    suffix = path.suffix.lower()
    parts = [part.lower() for part in path.parts]
    if suffix == ".vue":
        return "Vue"
    if suffix == ".svelte":
        return "Svelte"
    if suffix == ".astro":
        return "Astro"
    if "app" in parts and name in {"page.js", "page.jsx", "page.ts", "page.tsx", "layout.js", "layout.jsx", "layout.ts", "layout.tsx"}:
        return "Next.js"
    if "pages" in parts and suffix in {".js", ".jsx", ".ts", ".tsx"}:
        return "Next.js"
    lower = text.lower()
    if "from 'react'" in lower or 'from "react"' in lower or "jsx" in lower or re.search(r"<[A-Z][A-Za-z0-9_]*\b", text):
        return "React"
    return ""


def _ui_route_from_path(relative_path: Path) -> str:
    parts = [part.replace("\\", "/") for part in relative_path.parts]
    lower_parts = [part.lower() for part in parts]
    name = lower_parts[-1] if lower_parts else ""

    for app_index, app_part in enumerate(lower_parts[:-1]):
        if app_part != "app":
            continue
        if name not in {"page.js", "page.jsx", "page.ts", "page.tsx", "page.vue", "page.svelte"}:
            continue
        route_parts = [_normalize_ui_route_part(part) for part in parts[app_index + 1:-1]]
        route_parts = [part for part in route_parts if part]
        return "/" + "/".join(route_parts) if route_parts else "/"

    for pages_index, pages_part in enumerate(lower_parts[:-1]):
        if pages_part != "pages":
            continue
        if name.startswith("_"):
            return ""
        route_parts = [_normalize_ui_route_part(part) for part in parts[pages_index + 1:-1]]
        stem = PurePosixPath(parts[-1]).stem
        if stem != "index":
            route_parts.append(_normalize_ui_route_part(stem))
        route_parts = [part for part in route_parts if part]
        return "/" + "/".join(route_parts) if route_parts else "/"

    for routes_index, routes_part in enumerate(lower_parts[:-1]):
        if routes_part != "routes":
            continue
        if name not in {"+page.svelte", "+page.ts", "+page.js", "index.tsx", "index.jsx"} and not name.startswith("+page."):
            continue
        route_parts = [_normalize_ui_route_part(part) for part in parts[routes_index + 1:-1]]
        route_parts = [part for part in route_parts if part]
        return "/" + "/".join(route_parts) if route_parts else "/"

    return ""


def _normalize_ui_route_part(part: str) -> str:
    value = str(part or "").strip()
    if not value or value.startswith("(") and value.endswith(")") or value.startswith("@"):
        return ""
    if value.startswith("[[...") and value.endswith("]]"):
        return "{" + value[5:-2] + "...}"
    if value.startswith("[...") and value.endswith("]"):
        return "{" + value[4:-1] + "...}"
    if value.startswith("[") and value.endswith("]"):
        return "{" + value[1:-1] + "}"
    if value.startswith("$"):
        return "{" + value[1:] + "}"
    return value


def _ui_component_names(text: str, path: PurePosixPath, framework: str) -> List[tuple[str, int]]:
    names: List[tuple[str, int]] = []
    seen = set()

    def append(name: str, offset: int = 0):
        cleaned = _clean_ui_component_name(name)
        if not cleaned or cleaned in seen:
            return
        seen.add(cleaned)
        names.append((cleaned, _line_number(text, offset) if offset >= 0 else 1))

    if framework in {"React", "Next.js"}:
        patterns = (
            r"\bexport\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)\b",
            r"\bexport\s+function\s+([A-Z][A-Za-z0-9_]*)\b",
            r"\bfunction\s+([A-Z][A-Za-z0-9_]*)\s*\(",
            r"\b(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_]+)?\s*=>",
            r"\bclass\s+([A-Z][A-Za-z0-9_]*)\s+extends\s+(?:React\.)?(?:Pure)?Component\b",
        )
        for pattern in patterns:
            for match in re.finditer(pattern, text):
                append(match.group(1), match.start())
    elif framework == "Vue":
        match = re.search(r"\bname\s*:\s*['\"]([^'\"]+)['\"]", text)
        append(match.group(1), match.start()) if match else append(_ui_component_name_from_path(path), 0)
    elif framework in {"Svelte", "Astro"}:
        append(_ui_component_name_from_path(path), 0)

    if not names and _looks_like_component_filename(path):
        append(_ui_component_name_from_path(path), 0)
    return names


def _clean_ui_component_name(name: Any) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.$/-]+", "", str(name or "").strip())
    return cleaned[:160]


def _ui_component_name_from_path(path: PurePosixPath) -> str:
    stem = path.stem
    for suffix in (".stories", ".story", ".test", ".spec"):
        if stem.lower().endswith(suffix):
            stem = stem[: -len(suffix)]
    parts = re.split(r"[-_.\s]+", stem)
    words = [part[:1].upper() + part[1:] for part in parts if part]
    return "".join(words) or stem or path.name


def _looks_like_component_filename(path: PurePosixPath) -> bool:
    stem = path.stem
    return bool(stem and (stem[:1].isupper() or "-" in stem or "_" in stem))


def _is_storybook_story_name(name: str) -> bool:
    return name.endswith((".stories.js", ".stories.jsx", ".stories.ts", ".stories.tsx", ".story.js", ".story.jsx", ".story.ts", ".story.tsx"))


def _append_mobile_surface(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    name: str,
    category: str,
    platform: str,
    source_path: str,
    line: int,
    source: str,
    detail: str,
) -> None:
    name_value = " ".join(str(name or "").strip().split())[:180]
    category_value = " ".join(str(category or "").strip().split())[:80]
    platform_value = " ".join(str(platform or "").strip().split())[:80]
    if not name_value or not category_value:
        return

    key = (platform_value.lower(), category_value.lower(), name_value.lower(), source_path, int(line or 1))
    if key in seen or len(facts["mobile_surfaces"]) >= MAX_MOBILE_SURFACE_FACTS:
        return
    seen.add(key)
    facts["mobile_surfaces"].append({
        "name": name_value,
        "category": category_value,
        "platform": platform_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:240],
    })


def _is_mobile_surface_path(relative_path: Path, name: str) -> bool:
    normalized = _to_posix(relative_path).lower()
    suffix = PurePosixPath(name).suffix.lower()
    if name == "package.json":
        return True
    if name in {"app.json", "app.config.json", "app.config.js", "app.config.ts", "pubspec.yaml", "pubspec.yml"}:
        return True
    if name == "androidmanifest.xml":
        return True
    if name == "info.plist":
        return True
    if normalized == "lib/main.dart":
        return True
    if suffix in {".kt", ".java"} and "/android/" in f"/{normalized}/" and name in {"mainactivity.kt", "mainactivity.java", "mainapplication.kt", "mainapplication.java"}:
        return True
    return False


def _extract_mobile_surfaces(
    file_path: Path,
    relative_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_mobile_surfaces: set,
) -> None:
    name = file_path.name.lower()
    if name == "package.json":
        _extract_package_json_mobile_surfaces(file_path, source_path, facts, seen_mobile_surfaces)
    elif name in {"app.json", "app.config.json"}:
        _extract_app_json_mobile_surfaces(file_path, source_path, facts, seen_mobile_surfaces)
    elif name in {"app.config.js", "app.config.ts"}:
        _extract_app_config_text_mobile_surfaces(file_path, source_path, facts, seen_mobile_surfaces)
    elif name in {"pubspec.yaml", "pubspec.yml"}:
        _extract_pubspec_mobile_surfaces(file_path, source_path, facts, seen_mobile_surfaces)
    elif name == "androidmanifest.xml":
        _extract_android_manifest_mobile_surfaces(file_path, source_path, facts, seen_mobile_surfaces)
    elif name == "info.plist":
        _extract_ios_plist_mobile_surfaces(file_path, source_path, facts, seen_mobile_surfaces)
    elif _to_posix(relative_path).lower() == "lib/main.dart":
        _extract_flutter_entry_mobile_surface(file_path, source_path, facts, seen_mobile_surfaces)
    elif name in {"mainactivity.kt", "mainactivity.java", "mainapplication.kt", "mainapplication.java"}:
        _extract_android_entry_source_mobile_surface(file_path, source_path, facts, seen_mobile_surfaces)


def _extract_package_json_mobile_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_mobile_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return

    dependencies: Dict[str, Any] = {}
    for section in ("dependencies", "devDependencies", "peerDependencies"):
        raw = data.get(section)
        if isinstance(raw, dict):
            dependencies.update(raw)
    dependency_names = {str(name).lower() for name in dependencies}
    app_name = _react_native_app_name(data, source_path)
    if "expo" in dependency_names:
        _append_mobile_surface(
            facts,
            seen_mobile_surfaces,
            name=app_name,
            category="app",
            platform="Expo",
            source_path=source_path,
            line=_line_number_for_text(text, "expo") or 1,
            source="package-json",
            detail="Expo dependency declares a mobile app surface",
        )
    if "react-native" in dependency_names:
        _append_mobile_surface(
            facts,
            seen_mobile_surfaces,
            name=app_name,
            category="app",
            platform="React Native",
            source_path=source_path,
            line=_line_number_for_text(text, "react-native") or 1,
            source="package-json",
            detail="React Native dependency declares a mobile app surface",
        )


def _extract_app_json_mobile_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_mobile_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return

    expo = data.get("expo") if isinstance(data.get("expo"), dict) else {}
    if expo:
        app_name = str(expo.get("name") or expo.get("slug") or "Expo app").strip()
        slug = str(expo.get("slug") or "").strip()
        _append_mobile_surface(
            facts,
            seen_mobile_surfaces,
            name=app_name,
            category="app",
            platform="Expo",
            source_path=source_path,
            line=_line_number_for_key(text, "expo") or 1,
            source="expo-config",
            detail=f"Expo app{f' slug {slug}' if slug else ''}",
        )
        scheme = expo.get("scheme")
        for scheme_name in _mobile_scheme_values(scheme):
            _append_mobile_surface(
                facts,
                seen_mobile_surfaces,
                name=scheme_name,
                category="url scheme",
                platform="Expo",
                source_path=source_path,
                line=_line_number_for_text(text, scheme_name) or _line_number_for_key(text, "scheme") or 1,
                source="expo-config",
                detail="Expo deep-link URL scheme",
            )
        return

    if isinstance(data.get("displayName"), str) or isinstance(data.get("name"), str):
        app_name = str(data.get("displayName") or data.get("name") or "React Native app").strip()
        _append_mobile_surface(
            facts,
            seen_mobile_surfaces,
            name=app_name,
            category="app",
            platform="React Native",
            source_path=source_path,
            line=_line_number_for_key(text, "displayName") or _line_number_for_key(text, "name") or 1,
            source="react-native-config",
            detail="React Native app config",
        )


def _extract_app_config_text_mobile_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_mobile_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None or "expo" not in text.lower():
        return
    app_name = _javascript_object_string_value(text, "name") or _javascript_object_string_value(text, "slug") or "Expo app"
    _append_mobile_surface(
        facts,
        seen_mobile_surfaces,
        name=app_name,
        category="app",
        platform="Expo",
        source_path=source_path,
        line=_line_number_for_text(text, app_name) or _line_number_for_text(text, "expo") or 1,
        source="expo-config",
        detail="Expo app config",
    )
    scheme = _javascript_object_string_value(text, "scheme")
    if scheme:
        _append_mobile_surface(
            facts,
            seen_mobile_surfaces,
            name=scheme,
            category="url scheme",
            platform="Expo",
            source_path=source_path,
            line=_line_number_for_text(text, scheme) or 1,
            source="expo-config",
            detail="Expo deep-link URL scheme",
        )


def _extract_pubspec_mobile_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_mobile_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    lower = text.lower()
    if "flutter:" not in lower and "sdk: flutter" not in lower:
        return
    app_name = _yaml_scalar_value(text, "name") or "Flutter app"
    _append_mobile_surface(
        facts,
        seen_mobile_surfaces,
        name=app_name,
        category="app",
        platform="Flutter",
        source_path=source_path,
        line=_line_number_for_text(text, app_name) or _line_number_for_key(text, "flutter") or 1,
        source="pubspec",
        detail="Flutter project manifest",
    )


def _extract_android_manifest_mobile_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_mobile_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        _extract_android_manifest_text_mobile_surfaces(text, source_path, facts, seen_mobile_surfaces)
        return

    package_name = str(root.attrib.get("package") or "").strip()
    if package_name:
        _append_mobile_surface(
            facts,
            seen_mobile_surfaces,
            name=package_name,
            category="app",
            platform="Android",
            source_path=source_path,
            line=_line_number_for_text(text, package_name) or 1,
            source="android-manifest",
            detail="Android application package",
        )

    for child in root.findall(".//"):
        tag = child.tag.rsplit("}", 1)[-1].lower()
        if tag not in {"activity", "service", "receiver", "provider", "uses-permission"}:
            continue
        raw_name = _android_attr(child, "name")
        if not raw_name:
            continue
        category = "permission" if tag == "uses-permission" else tag
        detail = "Android manifest permission" if category == "permission" else f"Android {tag} component"
        _append_mobile_surface(
            facts,
            seen_mobile_surfaces,
            name=raw_name,
            category=category,
            platform="Android",
            source_path=source_path,
            line=_line_number_for_text(text, raw_name) or _line_number_for_text(text, tag) or 1,
            source="android-manifest",
            detail=detail,
        )


def _extract_android_manifest_text_mobile_surfaces(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_mobile_surfaces: set,
) -> None:
    package_match = re.search(r"\bpackage\s*=\s*['\"]([^'\"]+)['\"]", text)
    if package_match:
        _append_mobile_surface(
            facts,
            seen_mobile_surfaces,
            name=package_match.group(1),
            category="app",
            platform="Android",
            source_path=source_path,
            line=_line_number(text, package_match.start()),
            source="android-manifest",
            detail="Android application package",
        )
    for match in re.finditer(r"<(?P<tag>activity|service|receiver|provider|uses-permission)\b[^>]*android:name\s*=\s*['\"](?P<name>[^'\"]+)['\"]", text):
        tag = match.group("tag")
        category = "permission" if tag == "uses-permission" else tag
        _append_mobile_surface(
            facts,
            seen_mobile_surfaces,
            name=match.group("name"),
            category=category,
            platform="Android",
            source_path=source_path,
            line=_line_number(text, match.start()),
            source="android-manifest",
            detail="Android manifest permission" if category == "permission" else f"Android {tag} component",
        )


def _extract_ios_plist_mobile_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_mobile_surfaces: set,
) -> None:
    try:
        raw = file_path.read_bytes()
        data = plistlib.loads(raw)
    except (OSError, plistlib.InvalidFileException, ValueError):
        return
    if not isinstance(data, dict):
        return
    text = _read_text_file(file_path) or ""

    display_name = str(data.get("CFBundleDisplayName") or data.get("CFBundleName") or "iOS app").strip()
    bundle_id = str(data.get("CFBundleIdentifier") or "").strip()
    _append_mobile_surface(
        facts,
        seen_mobile_surfaces,
        name=display_name,
        category="app",
        platform="iOS",
        source_path=source_path,
        line=_line_number_for_text(text, "CFBundleDisplayName") or _line_number_for_text(text, "CFBundleName") or 1,
        source="info-plist",
        detail=f"iOS app bundle{f' {bundle_id}' if bundle_id else ''}",
    )
    if bundle_id:
        _append_mobile_surface(
            facts,
            seen_mobile_surfaces,
            name=bundle_id,
            category="bundle id",
            platform="iOS",
            source_path=source_path,
            line=_line_number_for_text(text, bundle_id) or _line_number_for_text(text, "CFBundleIdentifier") or 1,
            source="info-plist",
            detail="iOS bundle identifier",
        )

    for scheme_name in _ios_url_schemes(data):
        _append_mobile_surface(
            facts,
            seen_mobile_surfaces,
            name=scheme_name,
            category="url scheme",
            platform="iOS",
            source_path=source_path,
            line=_line_number_for_text(text, scheme_name) or _line_number_for_text(text, "CFBundleURLTypes") or 1,
            source="info-plist",
            detail="iOS deep-link URL scheme",
        )


def _extract_flutter_entry_mobile_surface(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_mobile_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None or "runApp" not in text:
        return
    app_widget = _flutter_run_app_name(text) or "runApp"
    _append_mobile_surface(
        facts,
        seen_mobile_surfaces,
        name=app_widget,
        category="entry",
        platform="Flutter",
        source_path=source_path,
        line=_line_number_for_text(text, "runApp") or 1,
        source="flutter-entry",
        detail="Flutter runApp entry point",
    )


def _extract_android_entry_source_mobile_surface(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_mobile_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    class_match = re.search(r"\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b", text)
    class_name = class_match.group(1) if class_match else PurePosixPath(source_path).stem
    category = "application" if class_name.lower().endswith("application") else "activity"
    _append_mobile_surface(
        facts,
        seen_mobile_surfaces,
        name=class_name,
        category=category,
        platform="Android",
        source_path=source_path,
        line=_line_number(text, class_match.start()) if class_match else 1,
        source="android-source",
        detail=f"Android {category} source entry",
    )


def _android_attr(element: ET.Element, name: str) -> str:
    android_key = "{http://schemas.android.com/apk/res/android}" + name
    return str(element.attrib.get(android_key) or element.attrib.get(name) or "").strip()


def _react_native_app_name(data: Dict[str, Any], source_path: str) -> str:
    app_name = data.get("displayName") if isinstance(data.get("displayName"), str) else ""
    if not app_name:
        app_name = data.get("name") if isinstance(data.get("name"), str) else ""
    app_name = app_name.strip()
    if app_name:
        return app_name.rsplit("/", 1)[-1]
    parent = PurePosixPath(source_path).parent
    return parent.name if str(parent) not in {"", "."} else "mobile app"


def _mobile_scheme_values(value: Any) -> List[str]:
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item or "").strip()]
    return []


def _ios_url_schemes(data: Dict[str, Any]) -> List[str]:
    schemes: List[str] = []
    raw_url_types = data.get("CFBundleURLTypes")
    if not isinstance(raw_url_types, list):
        return schemes
    for item in raw_url_types:
        if not isinstance(item, dict):
            continue
        raw_schemes = item.get("CFBundleURLSchemes")
        schemes.extend(_mobile_scheme_values(raw_schemes))
    return schemes[:12]


def _javascript_object_string_value(text: str, key: str) -> str:
    match = re.search(rf"\b{re.escape(key)}\s*:\s*['\"]([^'\"]+)['\"]", text)
    return match.group(1).strip() if match else ""


def _flutter_run_app_name(text: str) -> str:
    match = re.search(r"\brunApp\s*\(\s*(?:const\s+)?([A-Za-z_][A-Za-z0-9_]*)", text)
    return match.group(1) if match else ""


def _append_infra_resource(
    facts: Dict[str, List[Dict[str, Any]]],
    seen: set,
    provider: str,
    category: str,
    resource_type: str,
    name: str,
    source_path: str,
    line: int,
    source: str,
    detail: str = "",
) -> None:
    provider_value = " ".join(str(provider or "").strip().split())[:100]
    category_value = " ".join(str(category or "").strip().split())[:80]
    resource_type_value = " ".join(str(resource_type or "").strip().split())[:160]
    name_value = " ".join(str(name or "").strip().split())[:160]
    if not category_value or not resource_type_value or not name_value:
        return

    key = (provider_value.lower(), category_value.lower(), resource_type_value.lower(), name_value.lower(), source_path, int(line or 1))
    if key in seen or len(facts["infra_resources"]) >= MAX_INFRA_RESOURCE_FACTS:
        return
    seen.add(key)
    facts["infra_resources"].append({
        "provider": provider_value,
        "category": category_value,
        "resource_type": resource_type_value,
        "name": name_value,
        "source_path": source_path,
        "line": int(line or 1),
        "source": str(source or "")[:80],
        "detail": str(detail or "")[:240],
    })


def _is_infra_resource_path(relative_path: Path, name: str) -> bool:
    parts = {part.lower() for part in relative_path.parts}
    suffixes = "".join(PurePosixPath(name).suffixes).lower()
    suffix = PurePosixPath(name).suffix.lower()
    if suffix == ".tf" or suffixes.endswith(".tf.json") or name in {"terragrunt.hcl", "terragrunt.hcl.json"}:
        return True
    if name in {"pulumi.yaml", "pulumi.yml", "pulumi.json", "cdk.json"}:
        return True
    if name in {"serverless.yml", "serverless.yaml"}:
        return True
    if name in {"template.yaml", "template.yml", "sam.yaml", "sam.yml", "cloudformation.yaml", "cloudformation.yml"}:
        return True
    if suffix == ".bicep":
        return True
    if suffix in {".yml", ".yaml", ".json"} and parts & {"cloudformation", "cfn", "sam", "serverless", "infra", "infrastructure"}:
        return True
    return False


def _extract_infra_resources(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_infra_resources: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    name = PurePosixPath(source_path).name.lower()
    suffixes = "".join(PurePosixPath(name).suffixes).lower()
    suffix = PurePosixPath(name).suffix.lower()

    if suffix == ".tf" or suffixes.endswith(".tf.json") or name.startswith("terragrunt.hcl"):
        _extract_terraform_infra_resources(text, source_path, facts, seen_infra_resources)
    elif name in {"pulumi.yaml", "pulumi.yml", "pulumi.json"}:
        _extract_pulumi_infra_resources(text, source_path, facts, seen_infra_resources)
    elif name == "cdk.json":
        _extract_cdk_infra_resources(text, source_path, facts, seen_infra_resources)
    elif name in {"serverless.yml", "serverless.yaml"} or _looks_like_serverless_yaml(text):
        _extract_serverless_infra_resources(text, source_path, facts, seen_infra_resources)
    elif suffix == ".bicep":
        _extract_bicep_infra_resources(text, source_path, facts, seen_infra_resources)
    elif _looks_like_cloudformation(text):
        _extract_cloudformation_infra_resources(text, source_path, facts, seen_infra_resources)


def _extract_terraform_infra_resources(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_infra_resources: set,
) -> None:
    for match in re.finditer(r'(?m)^\s*provider\s+"([^"]+)"\s*\{', text):
        provider = match.group(1)
        _append_infra_resource(
            facts,
            seen_infra_resources,
            provider=_infra_provider_label(provider),
            category="provider",
            resource_type=provider,
            name=provider,
            source_path=source_path,
            line=_line_number(text, match.start()),
            source="terraform",
            detail=f"Terraform provider {provider}",
        )

    for block_kind, category in (("resource", "resource"), ("data", "data")):
        pattern = rf'(?m)^\s*{block_kind}\s+"([^"]+)"\s+"([^"]+)"\s*\{{'
        for match in re.finditer(pattern, text):
            resource_type = match.group(1)
            resource_name = match.group(2)
            _append_infra_resource(
                facts,
                seen_infra_resources,
                provider=_provider_from_infra_type(resource_type),
                category=category,
                resource_type=resource_type,
                name=resource_name,
                source_path=source_path,
                line=_line_number(text, match.start()),
                source="terraform",
                detail=f"Terraform {block_kind} {resource_type}.{resource_name}",
            )

    for match in re.finditer(r'(?m)^\s*module\s+"([^"]+)"\s*\{', text):
        module_name = match.group(1)
        detail = f"Terraform module {module_name}"
        module_source = _hcl_block_scalar_after(text, match.end(), "source")
        if module_source:
            detail = f"{detail}; source: {module_source}"
        _append_infra_resource(
            facts,
            seen_infra_resources,
            provider="Terraform",
            category="module",
            resource_type="module",
            name=module_name,
            source_path=source_path,
            line=_line_number(text, match.start()),
            source="terraform",
            detail=detail,
        )

    for match in re.finditer(r'(?m)^\s*backend\s+"([^"]+)"\s*\{', text):
        backend_name = match.group(1)
        _append_infra_resource(
            facts,
            seen_infra_resources,
            provider="Terraform",
            category="state backend",
            resource_type=backend_name,
            name=backend_name,
            source_path=source_path,
            line=_line_number(text, match.start()),
            source="terraform",
            detail=f"Terraform state backend {backend_name}",
        )


def _extract_cloudformation_infra_resources(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_infra_resources: set,
) -> None:
    lines = text.splitlines()
    resources_indent = None
    resources_start = 0
    for index, raw_line in enumerate(lines):
        match = re.match(r"^(\s*)Resources\s*:\s*(?:#.*)?$", raw_line)
        if match:
            resources_indent = len(match.group(1))
            resources_start = index + 1
            break
    if resources_indent is None:
        return

    index = resources_start
    while index < len(lines):
        raw_line = lines[index]
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            index += 1
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        if indent <= resources_indent:
            break
        resource_match = re.match(r"^\s+([A-Za-z0-9_.-]+)\s*:\s*(?:#.*)?$", raw_line)
        if not resource_match:
            index += 1
            continue
        resource_name = resource_match.group(1).strip()
        resource_indent = indent
        resource_line = index + 1
        index += 1
        resource_type = ""
        while index < len(lines):
            nested_line = lines[index]
            nested_stripped = nested_line.strip()
            nested_indent = len(nested_line) - len(nested_line.lstrip(" "))
            if nested_stripped and not nested_stripped.startswith("#") and nested_indent <= resource_indent:
                break
            type_match = re.match(r"^\s+Type\s*:\s*['\"]?([A-Za-z0-9_:./-]+)", nested_line)
            if type_match:
                resource_type = type_match.group(1).strip()
                break
            index += 1
        if not resource_type:
            continue
        _append_infra_resource(
            facts,
            seen_infra_resources,
            provider=_provider_from_infra_type(resource_type),
            category="resource",
            resource_type=resource_type,
            name=resource_name,
            source_path=source_path,
            line=resource_line,
            source="cloudformation",
            detail=f"CloudFormation resource {resource_type}",
        )


def _extract_serverless_infra_resources(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_infra_resources: set,
) -> None:
    service = _yaml_scalar_value(text, "service") or PurePosixPath(source_path).stem
    _append_infra_resource(
        facts,
        seen_infra_resources,
        provider="Serverless Framework",
        category="service",
        resource_type="service",
        name=service,
        source_path=source_path,
        line=_line_number_for_key(text, "service") or 1,
        source="serverless",
        detail="Serverless service",
    )
    functions_match = re.search(r"(?ms)^\s*functions\s*:[^\S\n]*(?P<body>.*?)(?:^\S|\Z)", text)
    if not functions_match:
        return
    for match in re.finditer(r"(?m)^ {2}([A-Za-z0-9_.-]+)\s*:\s*(?:#.*)?$", functions_match.group("body")):
        function_name = match.group(1)
        _append_infra_resource(
            facts,
            seen_infra_resources,
            provider="Serverless Framework",
            category="function",
            resource_type="function",
            name=function_name,
            source_path=source_path,
            line=_line_number(text, functions_match.start("body") + match.start()),
            source="serverless",
            detail=f"Serverless function in {service}",
        )


def _extract_pulumi_infra_resources(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_infra_resources: set,
) -> None:
    name = _yaml_scalar_value(text, "name") or PurePosixPath(source_path).parent.name or "pulumi"
    runtime = _yaml_scalar_value(text, "runtime")
    detail = f"Pulumi project{f' runtime: {runtime}' if runtime else ''}"
    _append_infra_resource(
        facts,
        seen_infra_resources,
        provider="Pulumi",
        category="project",
        resource_type=runtime or "project",
        name=name,
        source_path=source_path,
        line=_line_number_for_key(text, "name") or 1,
        source="pulumi",
        detail=detail,
    )


def _extract_cdk_infra_resources(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_infra_resources: set,
) -> None:
    data = None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return
    app_command = data.get("app") if isinstance(data, dict) else None
    _append_infra_resource(
        facts,
        seen_infra_resources,
        provider="AWS CDK",
        category="project",
        resource_type="cdk app",
        name=PurePosixPath(source_path).parent.name or "cdk",
        source_path=source_path,
        line=_line_number_for_key(text, "app") or 1,
        source="cdk",
        detail=f"CDK app: {app_command}" if isinstance(app_command, str) else "AWS CDK app",
    )


def _extract_bicep_infra_resources(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_infra_resources: set,
) -> None:
    for match in re.finditer(r"(?m)^\s*resource\s+([A-Za-z_][A-Za-z0-9_]*)\s+'([^']+)'", text):
        _append_infra_resource(
            facts,
            seen_infra_resources,
            provider="Azure",
            category="resource",
            resource_type=match.group(2),
            name=match.group(1),
            source_path=source_path,
            line=_line_number(text, match.start()),
            source="bicep",
            detail=f"Bicep resource {match.group(2)}",
        )


def _looks_like_cloudformation(text: str) -> bool:
    return bool(
        re.search(r"(?m)^\s*(AWSTemplateFormatVersion|Transform)\s*:", text)
        or re.search(r"(?m)^\s*Resources\s*:\s*$", text)
    )


def _looks_like_serverless_yaml(text: str) -> bool:
    return bool(re.search(r"(?m)^\s*service\s*:", text) and re.search(r"(?m)^\s*functions\s*:", text))


def _hcl_block_scalar_after(text: str, start: int, key: str) -> str:
    snippet = text[start:start + 2000]
    match = re.search(rf"(?m)^\s*{re.escape(key)}\s*=\s*[\"']([^\"']+)[\"']", snippet)
    return match.group(1).strip() if match else ""


def _provider_from_infra_type(resource_type: str) -> str:
    value = str(resource_type or "").strip()
    if not value:
        return ""
    if value.startswith("AWS::") or value.startswith("AWS/"):
        return "AWS"
    if value.startswith("Microsoft."):
        return "Azure"
    if "::" in value:
        return value.split("::", 1)[0]
    prefix = value.split("_", 1)[0].lower()
    return _infra_provider_label(prefix)


def _infra_provider_label(provider: str) -> str:
    normalized = str(provider or "").strip().lower()
    return {
        "aws": "AWS",
        "azurerm": "Azure",
        "azuread": "Azure AD",
        "google": "Google Cloud",
        "google-beta": "Google Cloud",
        "kubernetes": "Kubernetes",
        "helm": "Helm",
        "cloudflare": "Cloudflare",
        "datadog": "Datadog",
        "github": "GitHub",
        "random": "Terraform random",
        "null": "Terraform null",
        "local": "Terraform local",
        "time": "Terraform time",
    }.get(normalized, provider or "")


def _extract_deploy_targets(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_deploy_targets: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    name = PurePosixPath(source_path).name.lower()
    if name == "procfile":
        _extract_procfile_deploy_targets(text, source_path, facts, seen_deploy_targets)
    elif name == "vercel.json":
        _extract_vercel_deploy_targets(text, source_path, facts, seen_deploy_targets)
    elif name == "netlify.toml":
        _extract_netlify_deploy_targets(text, source_path, facts, seen_deploy_targets)
    elif name.endswith(".service"):
        _extract_systemd_deploy_targets(text, source_path, facts, seen_deploy_targets)
    elif name in {"chart.yaml", "chart.yml"}:
        _extract_helm_chart_deploy_targets(text, source_path, facts, seen_deploy_targets)
    elif name in {"kustomization.yaml", "kustomization.yml"}:
        _extract_kustomize_deploy_targets(text, source_path, facts, seen_deploy_targets)
    elif name.endswith((".yaml", ".yml")):
        _extract_kubernetes_deploy_targets(text, source_path, facts, seen_deploy_targets)


def _is_ai_surface_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    if name in {
        ".env.example",
        ".env.sample",
        "ai.py",
        "ai.ts",
        "ai.js",
        "llm.py",
        "llm.ts",
        "llm.js",
        "chat.py",
        "chat.ts",
        "chat.js",
        "assistant.py",
        "assistant.ts",
        "assistant.js",
        "embeddings.py",
        "embeddings.ts",
        "embeddings.js",
        "prompts.py",
        "prompts.ts",
        "prompts.js",
    }:
        return True
    if any(token in name for token in ("openai", "anthropic", "claude", "gemini", "cohere", "mistral", "huggingface", "langchain", "llamaindex", "semantic-kernel", "ollama", "replicate", "ai", "llm", "prompt", "embedding", "chatbot", "assistant", "rag")):
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
        }
    parts = {part.lower() for part in relative_path.parts}
    if parts & {"ai", "llm", "llms", "prompts", "prompt", "embeddings", "embedding", "rag", "agents", "agent", "assistant", "assistants", "chat", "chatbot"}:
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
            ".md",
        }
    if suffix in {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".kt", ".cs", ".rb", ".php", ".go", ".rs"}:
        return relative_path.parts and relative_path.parts[0].lower() in {"src", "app", "lib", "server", "api", "routes", "packages"}
    if suffix in {".yml", ".yaml", ".json", ".toml", ".xml", ".properties"}:
        return len(relative_path.parts) <= 3 and any(token in name for token in ("openai", "anthropic", "gemini", "llm", "ai", "prompt", "embedding", "rag"))
    return False


def _extract_ai_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_ai_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        for name, category, source, detail in _ai_surfaces_from_line(line, source_path):
            _append_ai_surface(
                facts,
                seen_ai_surfaces,
                name=name,
                category=category,
                source_path=source_path,
                line=line_number,
                source=source,
                detail=detail,
            )


def _ai_surfaces_from_line(line: str, source_path: str) -> List[tuple[str, str, str, str]]:
    signals: List[tuple[str, str, str, str]] = []
    lowered = line.lower()
    path_lower = source_path.lower()
    ai_path = any(token in path_lower for token in ("ai", "llm", "prompt", "embedding", "rag", "agent", "assistant", "chatbot", "openai", "anthropic", "gemini", "langchain", "llamaindex"))

    config_signal = _ai_surface_from_text(line)
    if config_signal is not None and any(token in path_lower for token in ("env", "config", "ai", "llm", "prompt", "embedding", "rag", "openai", "anthropic", "gemini")):
        name, category, detail = config_signal
        signals.append((name, category, "config-signal", detail))

    if re.search(r"\b(?:openai|client)\.chat\.completions\.create\s*\(", line):
        signals.append(("OpenAI chat completion", "chat completion", "code-signal", "OpenAI chat completions create call"))
    if re.search(r"\b(?:openai|client)\.responses\.create\s*\(", line):
        signals.append(("OpenAI Responses API", "chat completion", "code-signal", "OpenAI responses create call"))
    if re.search(r"\b(?:openai|client)\.completions\.create\s*\(", line):
        signals.append(("OpenAI completion", "completion", "code-signal", "OpenAI completions create call"))
    if re.search(r"\b(?:openai|client)\.embeddings\.create\s*\(|\bEmbedding\.create\s*\(", line):
        signals.append(("OpenAI embeddings", "embedding", "code-signal", "OpenAI embeddings create call"))
    if re.search(r"\banthropic\.(?:messages|completions)\.create\s*\(|\bclient\.messages\.create\s*\(", line) and ("anthropic" in lowered or "claude" in lowered):
        signals.append(("Anthropic messages", "chat completion", "code-signal", "Anthropic messages create call"))
    if re.search(r"\bgenerateContent\s*\(|\bmodels\.generate_content\s*\(", line):
        signals.append(("Gemini generate content", "chat completion", "code-signal", "Gemini generate content call"))
    if re.search(r"\bcohere\.(?:chat|generate|embed)\s*\(|\bco\.chat\s*\(", line, flags=re.IGNORECASE):
        category = "embedding" if "embed" in lowered else "chat completion"
        signals.append(("Cohere AI call", category, "code-signal", "Cohere chat/generate/embed call"))
    if re.search(r"\bmistral\b.*\bchat\.complete\b|\bclient\.chat\.complete\s*\(", line, flags=re.IGNORECASE):
        signals.append(("Mistral chat completion", "chat completion", "code-signal", "Mistral chat completion call"))
    if re.search(r"\bHuggingFaceInference\b|\bhf\.textGeneration\s*\(|\bInferenceClient\b", line):
        signals.append(("Hugging Face inference", "llm provider", "code-signal", "Hugging Face inference call"))
    if re.search(r"\bChatOpenAI\b|\bOpenAIEmbeddings\b|\bLLMChain\b|\bRunnableSequence\b|\bcreateOpenAIFunctionsAgent\b", line):
        signals.append(("LangChain", "agent framework", "code-signal", "LangChain chain/model/agent signal"))
    if re.search(r"\bVectorStoreIndex\b|\bRetrieverQueryEngine\b|\basRetriever\s*\(|\bvectorStore\.asRetriever\s*\(", line):
        signals.append(("Vector retrieval", "rag retrieval", "code-signal", "Vector/RAG retrieval call"))
    if re.search(r"\bllama_index\b|\bLlamaIndex\b", line):
        signals.append(("LlamaIndex", "rag framework", "code-signal", "LlamaIndex code signal"))
    if re.search(r"\bSemanticKernel\b|\bKernel\.CreateBuilder\b|\bkernel\.invoke", line):
        signals.append(("Semantic Kernel", "agent framework", "code-signal", "Semantic Kernel call"))
    if re.search(r"\bollama\.(?:chat|generate|embeddings)\s*\(|\bOllama\b", line):
        category = "embedding" if "embedding" in lowered else "local model"
        signals.append(("Ollama", category, "code-signal", "Ollama local model call"))
    if re.search(r"\breplicate\.(?:run|predictions\.create)\s*\(", line):
        signals.append(("Replicate prediction", "model hosting", "code-signal", "Replicate model prediction call"))
    if ai_path and re.search(r"\b(systemPrompt|promptTemplate|PromptTemplate|ChatPromptTemplate)\b", line):
        signals.append(("Prompt template", "prompt", "code-signal", "Prompt template or system prompt signal"))
    if ai_path and re.search(r"\bmoderations?\.create\s*\(|\bmoderate(?:Text|Content)\b", line):
        signals.append(("AI moderation", "moderation", "code-signal", "AI moderation call"))

    deduped: List[tuple[str, str, str, str]] = []
    seen = set()
    for item in signals:
        key = (item[0].lower(), item[1].lower(), item[2])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _is_payment_surface_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    if name in {
        ".env.example",
        ".env.sample",
        "billing.py",
        "billing.ts",
        "billing.js",
        "payments.py",
        "payments.ts",
        "payments.js",
        "payment.py",
        "payment.ts",
        "payment.js",
        "checkout.py",
        "checkout.ts",
        "checkout.js",
        "subscriptions.py",
        "subscriptions.ts",
        "subscriptions.js",
        "invoices.py",
        "invoices.ts",
        "invoices.js",
    }:
        return True
    if any(token in name for token in ("stripe", "paypal", "braintree", "square", "adyen", "razorpay", "paddle", "chargebee", "revenuecat", "payment", "payments", "billing", "checkout", "subscription", "invoice")):
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
        }
    parts = {part.lower() for part in relative_path.parts}
    if parts & {"billing", "payment", "payments", "checkout", "subscriptions", "subscription", "invoices", "invoice"}:
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
        }
    if suffix in {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".kt", ".cs", ".rb", ".php", ".go", ".rs"}:
        return relative_path.parts and relative_path.parts[0].lower() in {"src", "app", "lib", "server", "api", "routes"}
    if suffix in {".yml", ".yaml", ".json", ".toml", ".xml", ".properties"}:
        return len(relative_path.parts) <= 3 and any(token in name for token in ("stripe", "paypal", "payment", "billing", "checkout", "subscription", "invoice"))
    return False


def _extract_payment_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_payment_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        for name, category, source, detail in _payment_surfaces_from_line(line, source_path):
            _append_payment_surface(
                facts,
                seen_payment_surfaces,
                name=name,
                category=category,
                source_path=source_path,
                line=line_number,
                source=source,
                detail=detail,
            )


def _payment_surfaces_from_line(line: str, source_path: str) -> List[tuple[str, str, str, str]]:
    signals: List[tuple[str, str, str, str]] = []
    lowered = line.lower()
    path_lower = source_path.lower()
    payment_path = any(token in path_lower for token in ("payment", "payments", "billing", "checkout", "subscription", "invoice", "stripe", "paypal", "braintree", "square", "adyen", "razorpay", "paddle"))

    config_signal = _payment_surface_from_text(line)
    if config_signal is not None and any(token in path_lower for token in ("env", "config", "payment", "billing", "checkout", "subscription", "invoice", "stripe", "paypal")):
        name, category, detail = config_signal
        signals.append((name, category, "config-signal", detail))

    if re.search(r"\bstripe\.checkout\.sessions\.create\s*\(|\bcheckout\.sessions\.create\s*\(|\bSession\.create\s*\(", line):
        signals.append(("Stripe Checkout", "checkout", "code-signal", "Stripe checkout session create call"))
    if re.search(r"\bstripe\.paymentIntents\.create\s*\(|\bPaymentIntent\.create\s*\(|\bPaymentIntentCreate\b", line):
        signals.append(("Stripe PaymentIntent", "payment intent", "code-signal", "Stripe PaymentIntent create call"))
    if re.search(r"\bstripe\.setupIntents\.create\s*\(|\bSetupIntent\.create\s*\(", line):
        signals.append(("Stripe SetupIntent", "setup intent", "code-signal", "Stripe SetupIntent create call"))
    if re.search(r"\bstripe\.subscriptions\.create\s*\(|\bSubscription\.create\s*\(", line):
        signals.append(("Stripe subscription", "subscription", "code-signal", "Stripe subscription create call"))
    if re.search(r"\bstripe\.billingPortal\.sessions\.create\s*\(|\bbilling_portal\.Session\.create\s*\(", line):
        signals.append(("Stripe billing portal", "billing portal", "code-signal", "Stripe billing portal session call"))
    if re.search(r"\bstripe\.customers\.create\s*\(|\bCustomer\.create\s*\(", line) and ("stripe" in lowered or payment_path):
        signals.append(("Stripe customer", "customer billing", "code-signal", "Stripe customer create call"))
    if re.search(r"\bpaypal\b.*\b(?:orders?|capture|authorize)\b|\bOrdersCreateRequest\b|\bOrdersCaptureRequest\b", line, flags=re.IGNORECASE):
        signals.append(("PayPal order", "checkout", "code-signal", "PayPal order checkout call"))
    if re.search(r"\bbraintree\b.*\btransaction\b|\bgateway\.transaction\.sale\s*\(", line, flags=re.IGNORECASE):
        signals.append(("Braintree transaction", "charge", "code-signal", "Braintree transaction sale call"))
    if re.search(r"\bpaymentsApi\.createPayment\s*\(|\bCreatePaymentRequest\b|\bsquare\b.*createPayment", line):
        signals.append(("Square payment", "charge", "code-signal", "Square payment create call"))
    if re.search(r"\badyen\b.*\bpayments\b|\bcheckout\.payments\s*\(", line, flags=re.IGNORECASE):
        signals.append(("Adyen payment", "charge", "code-signal", "Adyen payments call"))
    if re.search(r"\brazorpay\b.*\b(?:orders\.create|payments\.capture)\b", line, flags=re.IGNORECASE):
        signals.append(("Razorpay payment", "charge", "code-signal", "Razorpay order or capture call"))
    if re.search(r"\bpaddle\b.*\b(?:checkout|subscription|transaction)\b", line, flags=re.IGNORECASE):
        signals.append(("Paddle billing", "subscription billing", "code-signal", "Paddle checkout or subscription call"))
    if re.search(r"\bchargebee\b.*\b(?:hosted_page|subscription|invoice)\b", line, flags=re.IGNORECASE):
        signals.append(("Chargebee billing", "billing provider", "code-signal", "Chargebee hosted page/subscription/invoice call"))
    if payment_path and re.search(r"\bcreateCheckoutSession\b|\bcheckoutSession\b", line):
        signals.append(("Checkout session", "checkout", "code-signal", "Checkout session code signal"))
    if payment_path and re.search(r"\bcreateSubscription\b|\bsubscription(?:Id|ID|Status)?\b", line):
        signals.append(("Subscription billing", "subscription", "code-signal", "Subscription billing code signal"))
    if payment_path and re.search(r"\binvoice(?:Id|ID|Status|Number)?\b|\bcreateInvoice\b", line):
        signals.append(("Invoice billing", "invoice", "code-signal", "Invoice billing code signal"))

    deduped: List[tuple[str, str, str, str]] = []
    seen = set()
    for item in signals:
        key = (item[0].lower(), item[1].lower(), item[2])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _is_auth_surface_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    if name in {
        ".env.example",
        ".env.sample",
        "auth.ts",
        "auth.js",
        "auth.py",
        "middleware.ts",
        "middleware.js",
        "middleware.py",
        "security.py",
        "security.java",
        "security.kt",
    }:
        return True
    auth_parts = {
        "auth",
        "authentication",
        "authorization",
        "security",
        "session",
        "sessions",
        "identity",
        "accounts",
        "users",
        "middleware",
        "middlewares",
    }
    parts = {part.lower() for part in relative_path.parts}
    if parts & auth_parts:
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".sh",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
        }
    if suffix in {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".kt", ".cs", ".rb", ".php", ".go", ".rs"}:
        return relative_path.parts and relative_path.parts[0].lower() in {"src", "app", "lib", "server", "api", "routes"}
    if suffix in {".yml", ".yaml", ".json", ".toml", ".xml"}:
        return len(relative_path.parts) <= 3 and (
            name in {"appsettings.json", "application.yml", "application.yaml", "application.properties"}
            or "auth" in name
            or "security" in name
        )
    return False


def _extract_auth_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_auth_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        for name, category, source, detail in _auth_surfaces_from_line(line, source_path):
            _append_auth_surface(
                facts,
                seen_auth_surfaces,
                name=name,
                category=category,
                source_path=source_path,
                line=line_number,
                source=source,
                detail=detail,
            )


def _auth_surfaces_from_line(line: str, source_path: str) -> List[tuple[str, str, str, str]]:
    signals: List[tuple[str, str, str, str]] = []
    lowered = line.lower()
    path_lower = source_path.lower()

    if re.search(r"\bOAuth2PasswordBearer\b", line):
        signals.append(("OAuth2PasswordBearer", "oauth", "code-signal", "FastAPI OAuth2 bearer dependency"))
    if re.search(r"\bHTTPBearer\b", line):
        signals.append(("HTTPBearer", "auth middleware", "code-signal", "FastAPI HTTP bearer dependency"))
    if re.search(r"\bDepends\s*\(\s*get_current_user\b", line) or re.search(r"\bSecurity\s*\(", line):
        signals.append(("FastAPI security dependency", "auth guard", "code-signal", "FastAPI dependency guard"))
    if re.search(r"\bpassport\.authenticate\s*\(", line):
        signals.append(("Passport authenticate", "auth middleware", "code-signal", "Passport authentication middleware"))
    if re.search(r"\b(requireAuth|withAuth|authMiddleware|authenticateToken|ensureAuthenticated)\b", line):
        signals.append(("Auth middleware", "auth middleware", "code-signal", "Authentication middleware or guard"))
    if re.search(r"\bjwt\.(?:verify|sign|decode)\s*\(", line, flags=re.IGNORECASE):
        signals.append(("JWT", "jwt", "code-signal", "JWT verify/sign/decode call"))
    if re.search(r"\bgetServerSession\b", line):
        signals.append(("NextAuth session", "session", "code-signal", "NextAuth server session call"))
    if re.search(r"\b(login_required|LoginRequiredMixin)\b", line):
        signals.append(("Login required", "auth guard", "code-signal", "Login-required guard"))
    if "isauthenticated" in lowered or re.search(r"\bpermission_classes\s*=", line):
        signals.append(("IsAuthenticated", "auth guard", "code-signal", "Django REST Framework permission guard"))
    if "authenticationmiddleware" in lowered:
        signals.append(("AuthenticationMiddleware", "auth middleware", "code-signal", "Django authentication middleware"))
    if re.search(r"\bSecurityFilterChain\b|@EnableWebSecurity|@PreAuthorize\b", line):
        signals.append(("Spring Security", "auth framework", "code-signal", "Spring Security configuration"))
    if re.search(r"\[Authorize\]|\bUseAuthentication\s*\(|\bUseAuthorization\s*\(|\bAddAuthentication\s*\(", line):
        signals.append(("ASP.NET authentication", "auth middleware", "code-signal", "ASP.NET authentication/authorization middleware"))
    if re.search(r"\bbefore_action\s+:authenticate_user!|\bdevise_for\b", line):
        signals.append(("Devise", "auth framework", "code-signal", "Rails Devise authentication"))
    if re.search(r"\bauth:sanctum\b|\bmiddleware\s*\(\s*['\"]auth|\bAuth::routes\b", line):
        signals.append(("Laravel auth", "auth framework", "code-signal", "Laravel authentication route or middleware"))
    if re.search(r"\boauth2?\b", lowered):
        signals.append(("OAuth", "oauth", "code-signal", "OAuth code/config signal"))
    if re.search(r"\b(openid|oidc)\b", lowered):
        signals.append(("OpenID Connect", "oauth", "code-signal", "OpenID Connect code/config signal"))
    if "saml" in lowered:
        signals.append(("SAML", "sso", "code-signal", "SAML code/config signal"))
    if ("[...nextauth]" in path_lower or "/auth/" in path_lower) and re.search(r"\bNextAuth\b|next-auth", line):
        signals.append(("NextAuth", "auth framework", "code-signal", "NextAuth route/config file"))

    deduped: List[tuple[str, str, str, str]] = []
    seen = set()
    for item in signals:
        key = (item[0].lower(), item[1].lower(), item[2])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _is_background_job_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    if name in {
        "celery.py",
        "tasks.py",
        "jobs.py",
        "worker.py",
        "workers.py",
        "scheduler.py",
        "cron.py",
        "sidekiq.yml",
        "sidekiq.yaml",
        "schedule.rb",
        "crontab",
    }:
        return True
    job_parts = {
        "jobs",
        "job",
        "tasks",
        "task",
        "workers",
        "worker",
        "queues",
        "queue",
        "schedules",
        "scheduler",
        "cron",
        "crons",
        "temporal",
        "workflows",
    }
    parts = {part.lower() for part in relative_path.parts}
    if parts & job_parts:
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".rake",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
        }
    if suffix in {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".rb", ".php", ".go", ".rs", ".java", ".kt", ".cs"}:
        return relative_path.parts and relative_path.parts[0].lower() in {"src", "app", "lib", "server", "api", "cmd"}
    if suffix in {".yml", ".yaml", ".json", ".toml", ".xml"}:
        return len(relative_path.parts) <= 3 and (
            "cron" in name
            or "schedule" in name
            or "sidekiq" in name
            or "worker" in name
            or "queue" in name
        )
    return False


def _extract_background_jobs(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_background_jobs: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        for name, category, source, detail in _background_jobs_from_line(line, source_path):
            _append_background_job(
                facts,
                seen_background_jobs,
                name=name,
                category=category,
                source_path=source_path,
                line=line_number,
                source=source,
                detail=detail,
            )


def _background_jobs_from_line(line: str, source_path: str) -> List[tuple[str, str, str, str]]:
    signals: List[tuple[str, str, str, str]] = []
    lowered = line.lower()

    if re.search(r"@(?:shared_task|app\.task|celery_app\.task|celery\.task)\b", line):
        signals.append(("Celery task", "task queue", "code-signal", "Celery task decorator"))
    if re.search(r"\bcelery\s+-A\b|\bcelery_app\s*=", line):
        signals.append(("Celery worker", "queue worker", "code-signal", "Celery worker/app signal"))
    if re.search(r"\bQueue\s*\(|\bWorker\s*\(", line) and ("rq" in lowered or "redis" in lowered):
        signals.append(("RQ worker", "task queue", "code-signal", "Redis Queue worker signal"))
    if re.search(r"\bdramatiq\.actor\b|@actor\b", line):
        signals.append(("Dramatiq actor", "task queue", "code-signal", "Dramatiq actor signal"))
    if re.search(r"\bAPScheduler\b|BackgroundScheduler|BlockingScheduler|add_job\s*\(", line):
        signals.append(("APScheduler", "scheduler", "code-signal", "APScheduler job signal"))
    if re.search(r"\bnew\s+(?:Queue|Worker|QueueScheduler|FlowProducer)\s*\(", line):
        name = "BullMQ" if "bullmq" in lowered or "queuescheduler" in lowered else "Bull queue"
        signals.append((name, "task queue", "code-signal", "Bull/BullMQ queue or worker constructor"))
    if re.search(r"\bQueue\.add\s*\(|\.process\s*\(", line) and ("bull" in lowered or "queue" in lowered):
        signals.append(("Queue processor", "task queue", "code-signal", "Queue add/process signal"))
    if re.search(r"\bcron\.schedule\s*\(|\bnew\s+CronJob\s*\(|\bCronJob\s*\(", line):
        signals.append(("Cron job", "cron", "code-signal", "JavaScript cron job signal"))
    if re.search(r"\bdefineJob\b|\bdefineSchedule\b|\bevery\s+\d", line):
        signals.append(("Scheduled job", "scheduler", "code-signal", "Scheduled job definition"))
    if re.search(r"\binclude\s+Sidekiq::Worker\b|\bsidekiq_options\b|\bperform_async\b", line):
        signals.append(("Sidekiq worker", "task queue", "code-signal", "Sidekiq worker signal"))
    if re.search(r"\bActiveJob::Base\b|queue_as\s+:", line):
        signals.append(("Active Job", "task queue", "code-signal", "Rails Active Job signal"))
    if re.search(r"\bhandle\s*\(\)|ShouldQueue|dispatch\s*\(|queue:work", line):
        signals.append(("Laravel queue", "task queue", "code-signal", "Laravel queue job signal"))
    if re.search(r"\bcron\.New\b|\.AddFunc\s*\(|\basynq\.New", line):
        signals.append(("Go background job", "task queue", "code-signal", "Go cron/asynq signal"))
    if re.search(r"\bWorker::new\b|tokio_cron_scheduler|JobScheduler::new", line):
        signals.append(("Rust background job", "scheduler", "code-signal", "Rust scheduler/worker signal"))
    if re.search(r"@Scheduled\b|@EnableScheduling\b|@KafkaListener\b|@RabbitListener\b", line):
        signals.append(("Spring scheduled job", "scheduler", "code-signal", "Spring scheduled/listener signal"))
    if re.search(r"\bIHostedService\b|BackgroundService|RecurringJob\.|Hangfire|AddHostedService", line):
        signals.append((".NET background service", "background task", "code-signal", ".NET hosted service or Hangfire signal"))
    if re.search(r"\btemporal\b", lowered) and re.search(r"\bworker\b|\bworkflow\b|Worker\.", line):
        signals.append(("Temporal worker", "workflow engine", "code-signal", "Temporal worker/workflow signal"))
    if re.search(r"\bcron\s*:\s*['\"]?[*0-9]", line):
        signals.append(("Cron schedule", "cron", "config-signal", "Cron expression in config"))

    deduped: List[tuple[str, str, str, str]] = []
    seen = set()
    for item in signals:
        key = (item[0].lower(), item[1].lower(), item[2])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _is_webhook_surface_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    if "webhook" in name or "callback" in name:
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
        }
    parts = {part.lower() for part in relative_path.parts}
    if parts & {"webhook", "webhooks", "callback", "callbacks", "routes", "api", "app", "src", "server"}:
        return suffix in {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".rs", ".rb", ".php", ".java", ".kt", ".cs"}
    if name in {".env.example", ".env.sample"}:
        return True
    return False


def _extract_webhook_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_webhook_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        for name, category, source, detail in _webhook_surfaces_from_line(line, source_path):
            _append_webhook_surface(
                facts,
                seen_webhook_surfaces,
                name=name,
                category=category,
                source_path=source_path,
                line=line_number,
                source=source,
                detail=detail,
            )


def _webhook_surfaces_from_line(line: str, source_path: str) -> List[tuple[str, str, str, str]]:
    signals: List[tuple[str, str, str, str]] = []
    lowered = line.lower()

    route_match = re.search(
        r"\b(?:app|router|server|route)\.(?:post|put|patch|all)\s*\(\s*['\"](?P<path>[^'\"]*(?:webhook|callback)[^'\"]*)['\"]",
        line,
        flags=re.IGNORECASE,
    )
    if route_match:
        path = route_match.group("path")
        provider = _webhook_provider_from_text(path)
        signals.append((f"{provider} webhook" if provider else "Webhook endpoint", "webhook endpoint", "code-signal", f"Route path {path}"))

    if re.search(r"\bstripe\.webhooks\.constructEvent\b|construct_event\s*\(", line, flags=re.IGNORECASE):
        signals.append(("Stripe webhook", "signature verification", "code-signal", "Stripe webhook signature verification"))
    if re.search(r"\bWebhook\.constructEvent\b|\bsvix\b", line, flags=re.IGNORECASE):
        provider = "Svix" if "svix" in lowered else "Webhook"
        signals.append((f"{provider} webhook", "signature verification", "code-signal", "Webhook signature verification"))
    if re.search(r"x-hub-signature-256|x-hub-signature|github-event", lowered):
        signals.append(("GitHub webhook", "signature verification", "code-signal", "GitHub webhook header signal"))
    if re.search(r"x-slack-signature|slack-signature|slackrequesthandler", lowered):
        signals.append(("Slack webhook", "signature verification", "code-signal", "Slack webhook signature signal"))
    if re.search(r"x-shopify-hmac|shopify.*webhook|webhooks\.registry", lowered):
        signals.append(("Shopify webhook", "signature verification", "code-signal", "Shopify webhook signal"))
    if re.search(r"twilio.*validate|x-twilio-signature", lowered):
        signals.append(("Twilio webhook", "signature verification", "code-signal", "Twilio webhook signature signal"))
    if re.search(r"paypal.*webhook|transmission-sig", lowered):
        signals.append(("PayPal webhook", "signature verification", "code-signal", "PayPal webhook signature signal"))
    if re.search(r"sendgrid.*webhook|eventwebhook", lowered):
        signals.append(("SendGrid webhook", "webhook handler", "code-signal", "SendGrid event webhook signal"))
    if re.search(r"mailgun.*webhook|x-mailgun-signature", lowered):
        signals.append(("Mailgun webhook", "signature verification", "code-signal", "Mailgun webhook signature signal"))
    if "webhook" in lowered and re.search(r"\b(secret|signature|verify|handler|event)\b", lowered):
        provider = _webhook_provider_from_text(lowered)
        signals.append((f"{provider} webhook" if provider else "Webhook handler", "webhook handler", "code-signal", "Webhook handler or verification signal"))

    deduped: List[tuple[str, str, str, str]] = []
    seen = set()
    for item in signals:
        key = (item[0].lower(), item[1].lower(), item[2])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _is_observability_surface_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    observability_names = {
        "instrumentation.ts",
        "instrumentation.js",
        "instrumentation.py",
        "logging.yml",
        "logging.yaml",
        "logging.json",
        "logback.xml",
        "log4j2.xml",
        "prometheus.yml",
        "prometheus.yaml",
        "otel-collector-config.yml",
        "otel-collector-config.yaml",
        ".env.example",
        ".env.sample",
    }
    if name in observability_names:
        return True
    if any(token in name for token in ("observability", "telemetry", "metrics", "tracing", "logging", "logger", "monitoring", "sentry", "datadog", "newrelic", "new-relic", "prometheus", "opentelemetry", "otel", "rollbar", "bugsnag")):
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
        }
    parts = {part.lower() for part in relative_path.parts}
    if parts & {"observability", "telemetry", "monitoring", "metrics", "tracing", "logging", "loggers", "instrumentation"}:
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
        }
    if suffix in {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".kt", ".cs"}:
        return name in {"app.py", "main.py", "server.py", "server.js", "server.ts", "index.js", "index.ts", "startup.cs", "program.cs"}
    if suffix in {".yml", ".yaml", ".json", ".toml", ".xml", ".properties"}:
        return len(relative_path.parts) <= 3 and any(token in name for token in ("logging", "metrics", "monitoring", "telemetry", "sentry", "datadog", "newrelic", "otel", "prometheus"))
    return False


def _extract_observability_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_observability_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        for name, category, source, detail in _observability_surfaces_from_line(line, source_path):
            _append_observability_surface(
                facts,
                seen_observability_surfaces,
                name=name,
                category=category,
                source_path=source_path,
                line=line_number,
                source=source,
                detail=detail,
            )


def _observability_surfaces_from_line(line: str, source_path: str) -> List[tuple[str, str, str, str]]:
    signals: List[tuple[str, str, str, str]] = []
    lowered = line.lower()

    route_match = re.search(
        r"\b(?:app|router|server|route)\.(?:get|head|all)\s*\(\s*['\"](?P<path>[^'\"]*(?:metrics|prometheus|health|ready|readiness|live|liveness|status)[^'\"]*)['\"]",
        line,
        flags=re.IGNORECASE,
    )
    if route_match:
        path = route_match.group("path")
        if "metrics" in path.lower() or "prometheus" in path.lower():
            signals.append(("Metrics endpoint", "metrics", "code-signal", f"Route path {path}"))
        else:
            signals.append(("Health check endpoint", "health check", "code-signal", f"Route path {path}"))

    if re.search(r"\bSentry\.init\b|\bsentry_sdk\.init\b|\bcaptureException\b|\bcapture_exception\b", line):
        signals.append(("Sentry", "error monitoring", "code-signal", "Sentry initialization or capture call"))
    if re.search(r"\brollbar\.init\b|\bRollbar\b", line):
        signals.append(("Rollbar", "error monitoring", "code-signal", "Rollbar initialization or capture call"))
    if re.search(r"\bBugsnag\b|\bbugsnag\.start\b", line):
        signals.append(("Bugsnag", "error monitoring", "code-signal", "Bugsnag initialization or capture call"))
    if re.search(r"\b(ddtrace|datadog)\b|\btracer\.init\b", lowered):
        signals.append(("Datadog", "apm", "code-signal", "Datadog tracing/APM code signal"))
    if re.search(r"\bnewrelic\b|\bnewrelic\.agent\b", lowered):
        signals.append(("New Relic", "apm", "code-signal", "New Relic code signal"))
    if re.search(r"\bopentelemetry\b|\btrace\.get_tracer\b|\bTracerProvider\b|\bMeterProvider\b|\bOTLP", line):
        signals.append(("OpenTelemetry", "tracing", "code-signal", "OpenTelemetry tracing/metrics signal"))
    if re.search(r"\bprometheus_client\b|\bprom_client\b|\bprom-client\b|\bCounter\s*\(|\bHistogram\s*\(|\bSummary\s*\(", line):
        signals.append(("Prometheus", "metrics", "code-signal", "Prometheus metrics code signal"))
    if re.search(r"\bstatsd\b|\bStatsD\b", line):
        signals.append(("StatsD", "metrics", "code-signal", "StatsD metrics code signal"))
    if re.search(r"\bstructlog\b|\bloguru\b|\blogging\.basicConfig\b|\bcreateLogger\b|\bwinston\b|\bpino\b|\bLoggerFactory\.getLogger\b|\bSerilog\b|\bNLog\b|\bMonolog\b|\blogrus\b|\bzap\.New", line):
        signals.append(("Structured logging", "logging", "code-signal", "Structured logging code signal"))

    config_signal = _observability_surface_from_text(line)
    if config_signal is not None and any(token in source_path.lower() for token in ("env", "config", "logging", "monitoring", "telemetry", "observability", "metrics")):
        name, category, detail = config_signal
        signals.append((name, category, "config-signal", detail))

    deduped: List[tuple[str, str, str, str]] = []
    seen = set()
    for item in signals:
        key = (item[0].lower(), item[1].lower(), item[2])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _is_feature_flag_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    if name in {".env.example", ".env.sample", "features.yml", "features.yaml", "features.json", "flags.yml", "flags.yaml", "flags.json"}:
        return True
    if any(token in name for token in ("feature", "features", "flag", "flags", "toggle", "toggles", "experiment", "experiments", "launchdarkly", "unleash", "configcat", "statsig", "growthbook", "flagsmith")):
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
        }
    parts = {part.lower() for part in relative_path.parts}
    if parts & {"features", "feature", "flags", "flag", "toggles", "experiments", "experiment"}:
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
        }
    if suffix in {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".kt", ".cs"}:
        return relative_path.parts and relative_path.parts[0].lower() in {"src", "app", "lib", "server", "api"}
    if suffix in {".yml", ".yaml", ".json", ".toml", ".xml", ".properties"}:
        return len(relative_path.parts) <= 3 and any(token in name for token in ("feature", "flag", "toggle", "experiment", "launchdarkly", "unleash", "configcat", "statsig", "growthbook"))
    return False


def _extract_feature_flags(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_feature_flags: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        for name, category, source, detail in _feature_flags_from_line(line, source_path):
            _append_feature_flag(
                facts,
                seen_feature_flags,
                name=name,
                category=category,
                source_path=source_path,
                line=line_number,
                source=source,
                detail=detail,
            )


def _feature_flags_from_line(line: str, source_path: str) -> List[tuple[str, str, str, str]]:
    signals: List[tuple[str, str, str, str]] = []
    lowered = line.lower()
    path_lower = source_path.lower()

    provider_signal = _feature_flag_from_text(line)
    if provider_signal is not None and any(token in path_lower for token in ("env", "config", "feature", "flag", "toggle", "experiment")):
        name, category, detail = provider_signal
        signals.append((name, category, "config-signal", detail))

    if re.search(r"\b(?:variation|boolVariation|stringVariation|numberVariation|jsonVariation)\s*\(", line):
        signals.append(("LaunchDarkly variation", "flag usage", "code-signal", "LaunchDarkly variation call"))
    if re.search(r"\b(?:isEnabled|is_enabled|isFeatureEnabled|is_feature_enabled)\s*\(", line):
        signals.append(("Feature flag check", "flag usage", "code-signal", "Feature flag enabled check"))
    if re.search(r"\bgetTreatment\s*\(", line):
        signals.append(("Split treatment", "flag usage", "code-signal", "Split.io treatment call"))
    if re.search(r"\bcheckGate\s*\(|\bgetExperiment\s*\(", line):
        signals.append(("Statsig gate", "flag usage", "code-signal", "Statsig gate or experiment call"))
    if re.search(r"\bgetFeatureValue\s*\(|\bgetValue\s*\(", line) and any(token in lowered for token in ("configcat", "feature", "flag")):
        signals.append(("ConfigCat flag", "flag usage", "code-signal", "ConfigCat flag value call"))
    if re.search(r"\bGrowthBook\b|\bgrowthbook\.(?:isOn|isOff|getFeatureValue)\s*\(", line):
        signals.append(("GrowthBook flag", "flag usage", "code-signal", "GrowthBook feature flag call"))
    if re.search(r"\bposthog\.(?:isFeatureEnabled|getFeatureFlag)\s*\(", line):
        signals.append(("PostHog flag", "flag usage", "code-signal", "PostHog feature flag call"))
    if re.search(r"\bflagsmith\.(?:hasFeatureFlag|getValue)\s*\(", line):
        signals.append(("Flagsmith flag", "flag usage", "code-signal", "Flagsmith feature flag call"))
    if re.search(r"\bFeatureManager\.IsEnabledAsync\b|\bIFeatureManager\b", line):
        signals.append(("Microsoft Feature Management", "flag usage", "code-signal", ".NET feature manager call"))
    if re.search(r"\bfeatureFlags?\b|\bfeature_flags?\b|\bflags\s*[:=]\s*[\[{]", line) and any(token in path_lower for token in ("feature", "flag", "config", "experiment")):
        signals.append(("Feature flag definition", "flag definition", "config-signal", "Feature flag definition/config signal"))
    if re.search(r"\bexperiment(?:Name|Key|Id)?\b|\bexperiments\s*[:=]\s*[\[{]", line) and any(token in path_lower for token in ("experiment", "feature", "flag", "config")):
        signals.append(("Experiment", "experiment", "config-signal", "Experiment configuration signal"))

    deduped: List[tuple[str, str, str, str]] = []
    seen = set()
    for item in signals:
        key = (item[0].lower(), item[1].lower(), item[2])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _is_notification_surface_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    if name in {
        ".env.example",
        ".env.sample",
        "mailer.py",
        "mailers.py",
        "notifications.py",
        "notification.py",
        "notifier.py",
        "sms.py",
        "push.py",
        "emails.py",
        "email.py",
    }:
        return True
    if any(token in name for token in ("mail", "email", "notify", "notification", "sms", "push", "message", "messaging", "slack", "discord", "twilio", "sendgrid", "mailgun", "resend", "postmark")):
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
        }
    parts = {part.lower() for part in relative_path.parts}
    if parts & {"mail", "mailer", "mailers", "email", "emails", "notifications", "notification", "notifiers", "sms", "push", "messaging", "messages"}:
        return suffix in {
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".mjs",
            ".cjs",
            ".go",
            ".rs",
            ".rb",
            ".php",
            ".java",
            ".kt",
            ".cs",
            ".yml",
            ".yaml",
            ".json",
            ".toml",
            ".xml",
            ".properties",
        }
    if suffix in {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".kt", ".cs", ".rb", ".php", ".go", ".rs"}:
        return relative_path.parts and relative_path.parts[0].lower() in {"src", "app", "lib", "server", "api"}
    if suffix in {".yml", ".yaml", ".json", ".toml", ".xml", ".properties"}:
        return len(relative_path.parts) <= 3 and any(token in name for token in ("mail", "email", "notification", "sms", "push", "twilio", "sendgrid", "slack", "discord"))
    return False


def _extract_notification_surfaces(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_notification_surfaces: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        for name, category, source, detail in _notification_surfaces_from_line(line, source_path):
            _append_notification_surface(
                facts,
                seen_notification_surfaces,
                name=name,
                category=category,
                source_path=source_path,
                line=line_number,
                source=source,
                detail=detail,
            )


def _notification_surfaces_from_line(line: str, source_path: str) -> List[tuple[str, str, str, str]]:
    signals: List[tuple[str, str, str, str]] = []
    lowered = line.lower()
    path_lower = source_path.lower()

    config_signal = _notification_surface_from_text(line)
    if config_signal is not None and any(token in path_lower for token in ("env", "config", "mail", "email", "notification", "sms", "push", "message")):
        name, category, detail = config_signal
        signals.append((name, category, "config-signal", detail))

    if re.search(r"\bsendMail\s*\(|\btransporter\.sendMail\s*\(|\bmailTransport\.send\s*\(", line):
        signals.append(("Email sender", "email", "code-signal", "Email send call"))
    if re.search(r"\bsend_mail\s*\(|\bEmailMessage\s*\(|\bmail\.send\s*\(", line):
        signals.append(("Email sender", "email", "code-signal", "Email send call"))
    if re.search(r"\bMail::to\b|\bNotification::send\b|\bnotify\s*\(", line) and ("mail" in lowered or "notification" in lowered or "notify" in lowered):
        signals.append(("Notification sender", "notification sender", "code-signal", "Framework notification send call"))
    if re.search(r"\bsgMail\.send\s*\(|\bsendgrid\b.*\.send\s*\(", line, flags=re.IGNORECASE):
        signals.append(("SendGrid", "email", "code-signal", "SendGrid email send call"))
    if re.search(r"\bresend\.emails\.send\s*\(|\bresend\.send\s*\(", line, flags=re.IGNORECASE):
        signals.append(("Resend", "email", "code-signal", "Resend email send call"))
    if re.search(r"\bmailgun\.(?:messages|client).*send\b|\bmessages\.create\s*\(", line, flags=re.IGNORECASE) and "mailgun" in lowered:
        signals.append(("Mailgun", "email", "code-signal", "Mailgun email send call"))
    if re.search(r"\bpostmark\b.*send", line, flags=re.IGNORECASE):
        signals.append(("Postmark", "email", "code-signal", "Postmark email send call"))
    if re.search(r"\btwilio\b.*messages\.create\s*\(|\bclient\.messages\.create\s*\(", line, flags=re.IGNORECASE):
        signals.append(("Twilio", "sms", "code-signal", "Twilio message send call"))
    if re.search(r"\bfirebase_admin\.messaging\b|\badmin\.messaging\(\)\.send\b|\bsendMulticast\s*\(", line):
        signals.append(("Firebase Cloud Messaging", "push", "code-signal", "Push notification send call"))
    if re.search(r"\bwebpush\.sendNotification\b|\bpushService\.send\b", line):
        signals.append(("Web Push", "push", "code-signal", "Web Push notification send call"))
    if re.search(r"\bchat\.postMessage\s*\(|\bslack\.chat\.postMessage\s*\(", line):
        signals.append(("Slack", "chat", "code-signal", "Slack message send call"))
    if re.search(r"\bdiscord\b.*(?:send|reply)\s*\(|\bwebhookClient\.send\s*\(", line, flags=re.IGNORECASE):
        signals.append(("Discord", "chat", "code-signal", "Discord message send call"))
    if re.search(r"\bses\.(?:sendEmail|sendRawEmail)\s*\(|\bSendEmailCommand\b", line):
        signals.append(("Amazon SES", "email", "code-signal", "Amazon SES email send call"))
    if re.search(r"\bsns\.(?:publish|Publish)\s*\(|\bPublishCommand\b", line):
        signals.append(("Amazon SNS", "push", "code-signal", "Amazon SNS publish call"))

    deduped: List[tuple[str, str, str, str]] = []
    seen = set()
    for item in signals:
        key = (item[0].lower(), item[1].lower(), item[2])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _is_secret_signal_scan_path(relative_path: Path, name: str) -> bool:
    suffix = PurePosixPath(name).suffix.lower()
    if name in {".env", ".env.example", ".env.sample", ".env.template", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}:
        return True
    if name.endswith((".env", ".env.example", ".env.sample", ".env.template", ".properties", ".conf", ".config", ".ini", ".tfvars")):
        return True
    if suffix in {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".rs", ".rb", ".php", ".java", ".kt", ".cs", ".sh", ".bash", ".zsh", ".yml", ".yaml", ".json", ".toml", ".ini", ".tf", ".hcl"}:
        parts = {part.lower() for part in relative_path.parts}
        if parts & {"src", "app", "lib", "config", "configs", ".github", "deploy", "ops", "infra"}:
            return True
        return len(relative_path.parts) <= 2 and suffix in {".yml", ".yaml", ".json", ".toml", ".ini", ".tf", ".hcl"}
    return False


def _extract_secret_signals(
    file_path: Path,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_secret_signals: set,
) -> None:
    text = _read_text_file(file_path)
    if text is None:
        return
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        for name, source, has_value in _secret_names_from_line(line):
            category = _secret_category(name)
            if not category:
                continue
            _append_secret_signal(
                facts,
                seen_secret_signals,
                name=name,
                category=category,
                source_path=source_path,
                line=line_number,
                source=source,
                has_value=has_value,
            )


def _secret_names_from_line(line: str) -> List[tuple[str, str, bool]]:
    candidates: List[tuple[str, str, bool]] = []
    env_match = re.match(
        r"^(?:export\s+)?(?P<name>[A-Za-z_][A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASS|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|DSN|CREDENTIAL)[A-Za-z0-9_]*)\s*(?P<op>[:=])\s*(?P<value>.*)$",
        line,
        flags=re.IGNORECASE,
    )
    if env_match:
        candidates.append((
            env_match.group("name"),
            "assignment",
            bool(env_match.group("value").strip()),
        ))

    key_match = re.match(
        r"^[\"']?(?P<name>[A-Za-z_][A-Za-z0-9_.-]*(?:secret|token|password|pass|api[_-]?key|private[_-]?key|access[_-]?key|dsn|credential)[A-Za-z0-9_.-]*)[\"']?\s*[:=]\s*(?P<value>.*)$",
        line,
        flags=re.IGNORECASE,
    )
    if key_match:
        candidates.append((
            key_match.group("name"),
            "config-key",
            bool(key_match.group("value").strip()),
        ))

    code_match = re.search(
        r"\b(?P<name>[A-Za-z_][A-Za-z0-9_]*(?:secret|token|password|pass|api_key|private_key|access_key|dsn|credential)[A-Za-z0-9_]*)\s*=\s*(?P<value>[^#\n]+)",
        line,
        flags=re.IGNORECASE,
    )
    if code_match:
        candidates.append((
            code_match.group("name"),
            "code-assignment",
            bool(code_match.group("value").strip()),
        ))

    deduped = []
    seen = set()
    for name, source, has_value in candidates:
        normalized = name.strip().strip("\"'`")
        key = (normalized.lower(), source)
        if key in seen:
            continue
        seen.add(key)
        deduped.append((normalized, source, has_value))
    return deduped


def _secret_category(name: str) -> str:
    normalized = str(name or "").lower().replace("-", "_").replace(".", "_")
    if "private_key" in normalized:
        return "private_key"
    if "api_key" in normalized or normalized.endswith("_key") or "access_key" in normalized:
        return "api_key"
    if "password" in normalized or normalized.endswith("_pass") or "_pass_" in normalized:
        return "password"
    if "secret" in normalized:
        return "secret"
    if "token" in normalized:
        return "token"
    if "dsn" in normalized:
        return "dsn"
    if "credential" in normalized:
        return "credential"
    return ""


def _secret_category_rank(category: str) -> int:
    return {
        "private_key": 0,
        "api_key": 1,
        "password": 2,
        "secret": 3,
        "token": 4,
        "credential": 5,
        "dsn": 6,
    }.get(str(category or ""), 9)


def _extract_procfile_deploy_targets(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_deploy_targets: set,
) -> None:
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        process_type, command = line.split(":", 1)
        if not process_type.strip():
            continue
        _append_deploy_target(
            facts,
            seen_deploy_targets,
            provider="Procfile",
            target_type="process",
            name=process_type.strip(),
            source_path=source_path,
            line=line_number,
            detail=command.strip(),
        )


def _extract_vercel_deploy_targets(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_deploy_targets: set,
) -> None:
    data = None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        pass
    project_name = "Vercel project"
    detail_parts = []
    if isinstance(data, dict):
        if isinstance(data.get("name"), str) and data.get("name"):
            project_name = data["name"]
        for key in ("framework", "buildCommand", "outputDirectory"):
            if isinstance(data.get(key), str) and data.get(key):
                detail_parts.append(f"{key}: {data[key]}")
    _append_deploy_target(
        facts,
        seen_deploy_targets,
        provider="Vercel",
        target_type="project",
        name=project_name,
        source_path=source_path,
        line=1,
        detail="; ".join(detail_parts) or "vercel config",
    )


def _extract_netlify_deploy_targets(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_deploy_targets: set,
) -> None:
    command = _toml_like_value(text, "command")
    publish = _toml_like_value(text, "publish")
    name = _toml_like_value(text, "name") or "Netlify site"
    detail = "; ".join(part for part in (f"command: {command}" if command else "", f"publish: {publish}" if publish else "") if part)
    _append_deploy_target(
        facts,
        seen_deploy_targets,
        provider="Netlify",
        target_type="site",
        name=name,
        source_path=source_path,
        line=1,
        detail=detail or "netlify config",
    )


def _extract_systemd_deploy_targets(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_deploy_targets: set,
) -> None:
    description = _ini_like_value(text, "Description") or PurePosixPath(source_path).stem
    exec_start = _ini_like_value(text, "ExecStart")
    _append_deploy_target(
        facts,
        seen_deploy_targets,
        provider="systemd",
        target_type="service",
        name=description,
        source_path=source_path,
        line=_line_number_for_ini_key(text, "Description") or 1,
        detail=exec_start,
    )


def _extract_helm_chart_deploy_targets(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_deploy_targets: set,
) -> None:
    if not re.search(r"(?m)^\s*apiVersion\s*:\s*v[12]\s*$", text):
        return
    name = _yaml_scalar_value(text, "name") or PurePosixPath(source_path).parent.name or "Helm chart"
    version = _yaml_scalar_value(text, "version")
    app_version = _yaml_scalar_value(text, "appVersion")
    detail = "; ".join(part for part in (f"version: {version}" if version else "", f"appVersion: {app_version}" if app_version else "") if part)
    _append_deploy_target(
        facts,
        seen_deploy_targets,
        provider="Helm",
        target_type="chart",
        name=name,
        source_path=source_path,
        line=_line_number_for_key(text, "name") or 1,
        detail=detail,
    )


def _extract_kustomize_deploy_targets(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_deploy_targets: set,
) -> None:
    if not re.search(r"(?m)^\s*(resources|bases|patches|images)\s*:", text):
        return
    namespace = _yaml_scalar_value(text, "namespace")
    name = PurePosixPath(source_path).parent.as_posix() or "kustomization"
    _append_deploy_target(
        facts,
        seen_deploy_targets,
        provider="Kustomize",
        target_type="kustomization",
        name=name,
        source_path=source_path,
        line=1,
        detail=f"namespace: {namespace}" if namespace else "kustomization",
    )


def _extract_kubernetes_deploy_targets(
    text: str,
    source_path: str,
    facts: Dict[str, List[Dict[str, Any]]],
    seen_deploy_targets: set,
) -> None:
    for document_start, document in _yaml_documents_with_offsets(text):
        kind_match = re.search(
            r"(?m)^\s*kind\s*:\s*(Deployment|StatefulSet|DaemonSet|Job|CronJob|Service|Ingress|ConfigMap|Secret|Namespace|HorizontalPodAutoscaler)\s*(?:#.*)?$",
            document,
        )
        if not kind_match:
            continue
        api_match = re.search(r"(?m)^\s*apiVersion\s*:\s*([^\s#]+)", document)
        if not api_match:
            continue
        name = _yaml_metadata_name(document) or kind_match.group(1)
        namespace = _yaml_scalar_value(document, "namespace")
        images = re.findall(r"(?m)^\s*image\s*:\s*([^\s#]+)", document)
        detail_parts = []
        if namespace:
            detail_parts.append(f"namespace: {namespace}")
        if images:
            detail_parts.append("images: " + ", ".join(images[:3]))
        _append_deploy_target(
            facts,
            seen_deploy_targets,
            provider="Kubernetes",
            target_type=kind_match.group(1),
            name=name,
            source_path=source_path,
            line=_line_number(text, document_start + kind_match.start()),
            detail="; ".join(detail_parts),
        )


def _yaml_documents_with_offsets(text: str) -> List[tuple[int, str]]:
    documents: List[tuple[int, str]] = []
    start = 0
    parts = re.split(r"(?m)^---\s*$", text)
    cursor = 0
    for part in parts:
        stripped = part.strip()
        if stripped:
            start = text.find(part, cursor)
            documents.append((max(start, 0), part))
        cursor += len(part) + 3
    return documents or [(0, text)]


def _yaml_scalar_value(text: str, key: str) -> str:
    match = re.search(rf"(?m)^\s*{re.escape(key)}\s*:\s*['\"]?([^'\"\n#]+)", text)
    return match.group(1).strip() if match else ""


def _yaml_metadata_name(document: str) -> str:
    metadata_match = re.search(r"(?ms)^\s*metadata\s*:\s*(?P<body>.*?)(?:^\S|\Z)", document)
    if metadata_match:
        name = _yaml_scalar_value(metadata_match.group("body"), "name")
        if name:
            return name
    return _yaml_scalar_value(document, "name")


def _toml_like_value(text: str, key: str) -> str:
    match = re.search(rf"(?m)^\s*{re.escape(key)}\s*=\s*['\"]([^'\"]+)['\"]", text)
    return match.group(1).strip() if match else ""


def _ini_like_value(text: str, key: str) -> str:
    match = re.search(rf"(?m)^\s*{re.escape(key)}\s*=\s*(.+?)\s*$", text)
    return match.group(1).strip() if match else ""


def _line_number_for_ini_key(text: str, key: str) -> Optional[int]:
    match = re.search(rf"(?m)^\s*{re.escape(key)}\s*=", text)
    return _line_number(text, match.start()) if match else None


def _deploy_provider_rank(provider: str) -> int:
    return {
        "Kubernetes": 0,
        "Helm": 1,
        "Kustomize": 2,
        "Procfile": 3,
        "Vercel": 4,
        "Netlify": 5,
        "systemd": 6,
    }.get(str(provider or ""), 9)


def _supply_chain_category_rank(category: str) -> int:
    return {
        "lockfile": 0,
        "dependency automation": 1,
        "dependency review": 2,
        "security scan": 3,
        "vulnerability scan": 4,
        "static analysis": 5,
        "security scorecard": 6,
        "sbom": 7,
    }.get(str(category or ""), 9)


def _api_contract_category_rank(category: str) -> int:
    return {
        "document": 0,
        "service": 1,
        "operation": 2,
        "rpc": 3,
        "channel": 4,
        "request": 5,
        "schema": 6,
        "message": 7,
        "collection": 8,
    }.get(str(category or ""), 9)


def _cli_command_category_rank(category: str) -> int:
    return {
        "node bin": 0,
        "python console script": 1,
        "python gui script": 2,
        "poetry script": 3,
        "go command": 4,
        "rust binary": 5,
        "ruby executable": 6,
        "shell executable": 7,
        "python executable": 8,
        "node executable": 9,
        "script executable": 10,
    }.get(str(category or ""), 19)


def _dev_environment_category_rank(category: str) -> int:
    return {
        "dev container": 0,
        "codespaces": 1,
        "dev shell": 2,
        "nix shell": 3,
        "direnv": 4,
        "tool version": 5,
        "setup command": 6,
        "editor extension": 7,
        "editor settings": 8,
        "local process": 9,
        "compose dev environment": 10,
        "cluster dev loop": 11,
    }.get(str(category or ""), 19)


def _build_system_category_rank(category: str) -> int:
    return {
        "workspace": 0,
        "solution": 1,
        "project": 2,
        "module": 3,
        "target": 4,
        "executable": 5,
        "library": 6,
        "task": 7,
        "plugin": 8,
        "test": 9,
    }.get(str(category or ""), 19)


def _test_system_category_rank(category: str) -> int:
    return {
        "framework": 0,
        "config": 1,
        "runner": 2,
        "script": 3,
        "target": 4,
        "task": 5,
        "project": 6,
        "environment": 7,
        "session": 8,
        "runner config": 9,
        "plugin": 10,
        "sdk": 11,
        "library": 12,
        "assertion library": 13,
        "mocking library": 14,
        "coverage": 15,
        "coverage plugin": 15,
        "property testing": 16,
        "integration test": 17,
        "fixture config": 18,
        "test file": 19,
        "component test surface": 20,
        "browser test library": 21,
        "fixture library": 22,
        "benchmark": 23,
    }.get(str(category or ""), 39)


def _release_process_category_rank(category: str) -> int:
    return {
        "workflow": 0,
        "release action": 1,
        "publish action": 2,
        "release command": 3,
        "publish command": 4,
        "config": 5,
        "script": 6,
        "task": 7,
        "release tool": 8,
        "publish tool": 9,
        "versioning tool": 10,
        "versioning config": 11,
        "package version": 12,
        "registry": 13,
        "changelog config": 14,
        "changelog": 15,
        "pending changeset": 16,
        "release helper": 17,
        "build tool": 18,
        "release metadata": 19,
    }.get(str(category or ""), 39)


def _quality_tool_category_rank(category: str) -> int:
    return {
        "script": 0,
        "workflow command": 1,
        "task": 2,
        "session": 3,
        "environment": 4,
        "linter config": 5,
        "formatter config": 6,
        "typecheck config": 7,
        "static analysis config": 8,
        "hook config": 9,
        "plugin": 10,
        "linter": 11,
        "formatter": 12,
        "typecheck": 13,
        "static analysis": 14,
        "hook": 15,
        "editor config": 16,
    }.get(str(category or ""), 39)


def _architecture_decision_category_rank(category: str) -> int:
    return {
        "adr": 0,
        "rfc": 1,
        "design doc": 2,
        "architecture doc": 3,
        "decision log": 4,
    }.get(str(category or ""), 9)


def _architecture_decision_status_rank(status: str) -> int:
    normalized = str(status or "").strip().lower()
    if normalized in {"accepted", "approved", "adopted", "done", "implemented"}:
        return 0
    if normalized in {"proposed", "draft", "pending", "in review", "review"}:
        return 1
    if normalized in {"superseded", "deprecated", "replaced"}:
        return 2
    if normalized in {"rejected", "declined"}:
        return 3
    return 5


def _ui_surface_category_rank(category: str) -> int:
    return {
        "page": 0,
        "form": 1,
        "component": 2,
        "story": 3,
    }.get(str(category or ""), 9)


def _mobile_surface_category_rank(category: str) -> int:
    return {
        "app": 0,
        "bundle id": 1,
        "activity": 2,
        "application": 3,
        "entry": 4,
        "service": 5,
        "receiver": 6,
        "provider": 7,
        "permission": 8,
        "url scheme": 9,
    }.get(str(category or ""), 19)


def _infra_resource_category_rank(category: str) -> int:
    return {
        "resource": 0,
        "module": 1,
        "function": 2,
        "service": 3,
        "provider": 4,
        "data": 5,
        "state backend": 6,
        "project": 7,
    }.get(str(category or ""), 9)


def _detect_license_name(text: str) -> str:
    lower = text[:65536].lower()
    if "mit license" in lower:
        return "MIT"
    if "apache license" in lower and "version 2.0" in lower:
        return "Apache-2.0"
    if "gnu affero general public license" in lower:
        return "AGPL"
    if "gnu lesser general public license" in lower:
        return "LGPL"
    if "gnu general public license" in lower:
        return "GPL"
    if "mozilla public license" in lower:
        return "MPL"
    if "isc license" in lower:
        return "ISC"
    if "bsd 3-clause" in lower:
        return "BSD-3-Clause"
    if "bsd 2-clause" in lower:
        return "BSD-2-Clause"
    if "redistribution and use in source and binary forms" in lower:
        return "BSD-style"
    return "license file"


def _first_markdown_heading(text: str) -> tuple[str, int]:
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        match = re.match(r"^\s*#{1,6}\s+(.+?)\s*#*\s*$", raw_line)
        if match:
            return (_clean_markdown_heading(match.group(1)), line_number)
    return ("", 0)


def _policy_type_rank(policy_type: str) -> int:
    return {
        "license": 0,
        "security": 1,
        "contributing": 2,
        "code_of_conduct": 3,
    }.get(str(policy_type or ""), 9)


def _manifest_sort_key(item: Dict[str, Any]) -> tuple[int, str, str]:
    return (_source_priority(item["source_path"]), item["ecosystem"], item["source_path"])


def _runbook_command_sort_key(item: Dict[str, Any]) -> tuple[int, int, str, str]:
    category_rank = {
        "run": 0,
        "test": 1,
        "build": 2,
        "install": 3,
        "lint": 4,
        "format": 5,
        "container": 6,
        "task": 7,
    }
    return (
        _source_priority(item["source_path"]),
        category_rank.get(item["category"], 9),
        item["name"],
        item["command"],
    )


def _dependency_sort_key(item: Dict[str, Any]) -> tuple[int, int, str]:
    scope_rank = {
        "runtime": 0,
        "peer": 1,
        "optional": 2,
        "dev": 3,
    }
    return (
        _source_priority(item["source_path"]),
        scope_rank.get(item["scope"], 9),
        item["name"].lower(),
    )


def _workspace_sort_key(item: Dict[str, Any]) -> tuple[int, int, str, str]:
    return (
        _source_priority(item.get("source_path") or ""),
        WORKSPACE_KIND_RANK.get(str(item.get("workspace_kind") or ""), 5),
        item.get("path") or "",
        item.get("name") or "",
    )


def _source_priority(source_path: str) -> int:
    normalized = _to_posix(PurePosixPath(source_path)).lower()
    name = PurePosixPath(source_path).name.lower()
    if name in {"devcontainer.json", "devbox.json", "flake.nix", "shell.nix", "devenv.nix", "devenv.yaml", "devenv.yml", ".envrc", "mise.toml", ".mise.toml", ".tool-versions", "tiltfile", "skaffold.yaml", "skaffold.yml"}:
        return 0
    if normalized in {".vscode/extensions.json", ".vscode/settings.json"}:
        return 1
    if name == "package.json":
        return 0
    if name in {"pnpm-workspace.yaml", "lerna.json", "nx.json", "go.work"}:
        return 1
    if name == "pyproject.toml":
        return 2
    if name.startswith("requirements") and name.endswith(".txt"):
        return 3
    if name == "makefile":
        return 4
    if name == "justfile":
        return 5
    if name in {"pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "cmakelists.txt", "build.sbt", "mix.exs"}:
        return 5
    if name == "go.mod":
        return 6
    if name == "cargo.toml":
        return 7
    if name == "composer.json":
        return 8
    if name == "gemfile":
        return 9
    if name in {"docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}:
        return 10
    if name == "dockerfile":
        return 11
    return 50


def _read_json_file(file_path: Path) -> Any:
    text = _read_text_file(file_path)
    if text is None:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _read_toml_file(file_path: Path) -> Any:
    text = _read_text_file(file_path)
    if text is None:
        return None
    return _read_toml_text(text)


def _read_toml_text(text: str) -> Any:
    if tomllib is None:
        return None
    try:
        return tomllib.loads(text)
    except Exception:
        return None


def _read_text_file(file_path: Path) -> Optional[str]:
    try:
        return file_path.read_text(encoding="utf-8-sig", errors="ignore")
    except OSError:
        return None


def _normalize_workspace_path(path: str) -> str:
    value = str(path or "").strip().strip("\"'")
    if not value:
        return ""
    value = value.replace("\\", "/")
    value = re.sub(r"/+", "/", value)
    if value in {"", "./"}:
        return "."
    if value.startswith("./") and len(value) > 2:
        value = value[2:]
    return value.rstrip("/") or "."


def _workspace_name_from_pattern(pattern: str) -> str:
    value = _normalize_workspace_path(pattern)
    if not value or value == ".":
        return "workspace"
    parts = [part for part in PurePosixPath(value).parts if part not in {"*", "**", "."}]
    if not parts:
        return value
    return parts[-1]


def _go_work_use_paths(text: str) -> List[tuple[str, int]]:
    paths: List[tuple[str, int]] = []
    in_block = False
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.split("//", 1)[0].strip()
        if not line:
            continue
        if in_block:
            if line.startswith(")"):
                in_block = False
                continue
            path = line.strip()
            if path:
                paths.append((path, line_number))
            continue
        if line.startswith("use ("):
            in_block = True
            continue
        match = re.match(r"use\s+(.+)$", line)
        if match:
            paths.append((match.group(1).strip(), line_number))
    return paths


def _yaml_list_under_key(text: str, key: str) -> List[tuple[str, int]]:
    key_pattern = re.compile(rf"^\s*{re.escape(key)}\s*:\s*(?:#.*)?$")
    lines = text.splitlines()
    items: List[tuple[str, int]] = []
    in_list = False
    base_indent = 0
    for index, raw_line in enumerate(lines, start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        if not in_list:
            if key_pattern.match(raw_line):
                in_list = True
                base_indent = indent
            continue
        if indent <= base_indent and not stripped.startswith("-"):
            break
        match = re.match(r"-\s*['\"]?([^'\"#]+?)['\"]?\s*(?:#.*)?$", stripped)
        if match:
            value = match.group(1).strip()
            if value:
                items.append((value, index))
    return items


def _line_number_for_key(text: str, key: str) -> Optional[int]:
    pattern = re.compile(rf"(?m)^\s*[\"']?{re.escape(key)}[\"']?\s*[:=]")
    match = pattern.search(text)
    return _line_number(text, match.start()) if match else None


def _line_number_for_text(text: str, needle: str) -> Optional[int]:
    if not needle:
        return None
    index = text.lower().find(str(needle).lower())
    return _line_number(text, index) if index >= 0 else None


def _detect_node_package_manager(package_dir: Path) -> str:
    if (package_dir / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (package_dir / "yarn.lock").exists():
        return "yarn"
    return "npm"


def _node_script_command(package_manager: str, script_name: str) -> str:
    if package_manager == "npm":
        return f"npm run {script_name}"
    return f"{package_manager} {script_name}"


def _script_sort_key(script_name: str) -> tuple[int, str]:
    category_rank = {
        "install": 0,
        "run": 1,
        "test": 2,
        "build": 3,
        "lint": 4,
        "format": 5,
        "task": 6,
    }
    category = _command_category(script_name)
    return (category_rank.get(category, 9), script_name)


def _command_category(name: str) -> str:
    normalized = name.lower()
    if normalized in {"install", "setup", "bootstrap", "deps"} or "install" in normalized:
        return "install"
    if normalized in {"dev", "serve", "server", "start", "run"} or any(token in normalized for token in ("dev", "serve", "start")):
        return "run"
    if "test" in normalized or normalized in {"spec", "check"}:
        return "test"
    if "build" in normalized or normalized in {"compile", "package"}:
        return "build"
    if "lint" in normalized or "typecheck" in normalized or "type-check" in normalized:
        return "lint"
    if "format" in normalized or normalized == "fmt":
        return "format"
    if "docker" in normalized or "compose" in normalized:
        return "container"
    return "task"


def _python_dependency_name(raw: str) -> str:
    match = re.match(r"\s*([A-Za-z0-9_.-]+)", raw)
    return match.group(1).lower().replace("_", "-") if match else ""


def _go_required_modules(text: str) -> List[str]:
    modules = []
    in_require_block = False
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("//"):
            continue
        if stripped.startswith("require ("):
            in_require_block = True
            continue
        if in_require_block and stripped == ")":
            in_require_block = False
            continue
        if in_require_block:
            modules.append(stripped.split()[0])
            continue
        if stripped.startswith("require "):
            parts = stripped.split()
            if len(parts) >= 2:
                modules.append(parts[1])
    return sorted(set(modules))


def _count_compose_services(text: str) -> int:
    services = set()
    in_services = False
    for line in text.splitlines():
        if re.match(r"^services\s*:\s*$", line):
            in_services = True
            continue
        if in_services and line and not line.startswith((" ", "\t")):
            break
        match = re.match(r"^\s{2}([A-Za-z0-9_.-]+)\s*:\s*$", line)
        if in_services and match:
            services.add(match.group(1))
    return len(services)


def _extract_make_targets(text: str) -> List[str]:
    targets = []
    seen = set()
    for line in text.splitlines():
        if line.startswith(("\t", " ")):
            continue
        match = re.match(r"^([A-Za-z0-9_.-]+)\s*:(?![=:])", line)
        if not match:
            continue
        target = match.group(1)
        if target.startswith(".") or target in seen:
            continue
        seen.add(target)
        targets.append(target)
    return targets


def _normalize_indexed_path(path: str, source_dir: Path) -> str:
    raw = path.replace("\\", "/")
    source_raw = str(source_dir).replace("\\", "/")
    if raw.startswith(source_raw.rstrip("/") + "/"):
        return raw[len(source_raw.rstrip("/")) + 1:]

    marker = "/source/"
    if marker in raw:
        return raw.split(marker, 1)[1]

    try:
        return _to_posix(Path(path).resolve().relative_to(source_dir.resolve()))
    except Exception:
        return raw.lstrip("/")


def _classify_language(path: str) -> str:
    pure = PurePosixPath(path)
    name = pure.name.lower()
    if name in LANGUAGE_BY_FILENAME:
        return LANGUAGE_BY_FILENAME[name]
    return LANGUAGE_BY_EXTENSION.get(pure.suffix.lower(), "Text")


def _file_language_support(path: str) -> str:
    pure = PurePosixPath(path)
    name = pure.name.lower()
    if name in LANGUAGE_BY_FILENAME:
        return "searchable"
    if pure.suffix.lower() in SYMBOL_AWARE_EXTENSIONS:
        return "symbol-aware"
    return "searchable"


def _top_directory(path: str) -> str:
    parts = PurePosixPath(path).parts
    if len(parts) <= 1:
        return "(root)"
    return parts[0]


def _module_path(path: str) -> str:
    parts = PurePosixPath(path).parts
    if len(parts) <= 1:
        return "(root)"

    first = parts[0].lower()
    if first in {"packages", "apps", "services"} and len(parts) >= 3:
        return _to_posix(PurePosixPath(parts[0], parts[1]))
    if first in {"src", "app", "lib", "pkg", "cmd", "web", "server", "client"}:
        if len(parts) >= 3:
            return _to_posix(PurePosixPath(parts[0], parts[1]))
        return parts[0]
    return parts[0]


def _doc_detail(path: str) -> Optional[str]:
    pure = PurePosixPath(path)
    stem = pure.stem.lower()
    if stem in DOC_NAMES or pure.parts[0].lower() in {"docs", "doc"}:
        return "repo documentation"
    return None


def _config_detail(path: str) -> Optional[str]:
    name = PurePosixPath(path).name.lower()
    if name in CONFIG_HINTS:
        return CONFIG_HINTS[name]
    if name.endswith((".config.js", ".config.ts", ".config.mjs")):
        return "tool config"
    return None


def _is_test_path(path: str) -> bool:
    pure = PurePosixPath(path)
    parts = {part.lower() for part in pure.parts[:-1]}
    name = pure.name.lower()
    if parts & {"test", "tests", "__tests__", "spec", "specs"}:
        return True
    return (
        name.startswith("test_")
        or "_test." in name
        or ".test." in name
        or ".spec." in name
    )


def _infer_test_target_path(test_path: str, indexed_paths: List[str]) -> Optional[str]:
    """Infer a source file tested by a test file using conservative name matches."""
    pure = PurePosixPath(test_path)
    base_names = _test_base_names(pure)
    if not base_names:
        return None

    candidates = []
    for path in indexed_paths:
        if path == test_path or _is_test_path(path):
            continue

        candidate = PurePosixPath(path)
        if candidate.stem.lower() not in base_names:
            continue

        candidates.append(path)

    if not candidates:
        return None

    return sorted(candidates, key=lambda item: _test_target_sort_key(test_path, item))[0]


def _test_base_names(path: PurePosixPath) -> set[str]:
    stem = path.stem.lower()
    base_names = {stem}

    for prefix in ("test_", "test-", "spec_", "spec-"):
        if stem.startswith(prefix) and len(stem) > len(prefix):
            base_names.add(stem[len(prefix):])

    for suffix in ("_test", "-test", "_spec", "-spec", ".test", ".spec"):
        if stem.endswith(suffix) and len(stem) > len(suffix):
            base_names.add(stem[:-len(suffix)])

    return {name for name in base_names if name and name not in {"test", "spec"}}


def _test_target_sort_key(test_path: str, candidate_path: str) -> tuple[int, int, int, str]:
    test_parts = PurePosixPath(test_path).parts
    candidate_parts = PurePosixPath(candidate_path).parts

    shared_prefix = 0
    for left, right in zip(test_parts, candidate_parts):
        if left == right:
            shared_prefix += 1
        else:
            break

    source_rank = 0 if candidate_parts and candidate_parts[0].lower() in {"src", "app", "lib"} else 1
    return (source_rank, -shared_prefix, len(candidate_parts), candidate_path)


def _config_relationship_target(path: str, detail: str) -> Optional[str]:
    name = PurePosixPath(path).name.lower()
    if name == "package.json":
        return "JavaScript/TypeScript package"
    if name == "pyproject.toml":
        return "Python project"
    if name.startswith("requirements") and name.endswith(".txt"):
        return "Python dependencies"
    if name == "go.mod":
        return "Go module"
    if name == "cargo.toml":
        return "Rust crate"
    if name == "composer.json":
        return "PHP package"
    if name == "gemfile":
        return "Ruby bundle"
    if name == "dockerfile":
        return "Docker image"
    if name in {"docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}:
        return "Docker Compose app"
    if name == "makefile":
        return "Make targets"
    if name == "justfile":
        return "Just tasks"
    if name == "tsconfig.json":
        return "TypeScript compiler"
    if name.startswith("vite.config."):
        return "Vite build"
    if name.startswith("next.config."):
        return "Next.js app"
    if name.startswith(".env."):
        return "Environment template"
    return detail or None


def _entry_detail(path: str) -> Optional[str]:
    pure = PurePosixPath(path)
    name = pure.name.lower()
    normalized = _to_posix(pure).lower()
    if name in ENTRY_NAMES:
        return "runtime entry point"
    if normalized in {"src/main.tsx", "src/main.jsx", "src/index.tsx", "src/index.jsx", "app/main.py"}:
        return "app entry point"
    if len(pure.parts) >= 3 and pure.parts[0].lower() == "cmd" and name == "main.go":
        return "Go command entry point"
    return None


def _file_fact(path: str, kind: str, detail: str, total_lines: int) -> Dict[str, Any]:
    return {
        "path": path,
        "kind": kind,
        "detail": detail,
        "total_lines": total_lines,
    }


def _repo_facts_from_overview(overview: Dict[str, Any]) -> List[Dict[str, Any]]:
    facts: List[Dict[str, Any]] = []

    for item in overview.get("languages", []):
        facts.append(_repo_fact(
            "language",
            item.get("language"),
            f"{item.get('file_count', 0)} files",
            confidence="indexed_summary",
            metadata={
                "file_count": item.get("file_count", 0),
                "line_count": item.get("line_count", 0),
                "support_level": item.get("support_level", "searchable"),
                "symbol_aware": bool(item.get("symbol_aware", False)),
            },
        ))

    for item in overview.get("top_directories", []):
        facts.append(_repo_fact(
            "directory",
            item.get("path"),
            f"{item.get('file_count', 0)} files",
            source_path=None if item.get("path") == "(root)" else item.get("path"),
            confidence="indexed_summary",
            metadata={
                "file_count": item.get("file_count", 0),
                "line_count": item.get("line_count", 0),
            },
        ))

    for item in overview.get("modules", []):
        facts.append(_repo_fact(
            "module",
            item.get("path"),
            f"{item.get('file_count', 0)} files, {item.get('symbol_count', 0)} symbols",
            source_path=None if item.get("path") == "(root)" else item.get("path"),
            confidence="indexed_summary",
            metadata={
                "file_count": item.get("file_count", 0),
                "line_count": item.get("line_count", 0),
                "symbol_count": item.get("symbol_count", 0),
                "languages": item.get("languages", []),
                "sample_files": item.get("sample_files", []),
            },
        ))

    for item in overview.get("module_dependencies", []):
        source_module = item.get("source_module")
        target_module = item.get("target_module")
        import_count = int(item.get("import_count") or 0)
        facts.append(_repo_fact(
            "module_dependency",
            f"{source_module} -> {target_module}",
            f"{import_count} resolved imports",
            source_path=item.get("source_path"),
            source_line=item.get("source_line"),
            confidence="derived",
            metadata={
                "source_module": source_module,
                "target_module": target_module,
                "target_path": item.get("target_path", ""),
                "import_count": import_count,
                "sample_imports": item.get("sample_imports", []),
            },
        ))

    for overview_key, fact_kind in (
        ("docs", "doc"),
        ("configs", "config"),
        ("tests", "test"),
        ("entry_points", "entry_point"),
    ):
        for item in overview.get(overview_key, []):
            facts.append(_repo_fact(
                fact_kind,
                item.get("path"),
                item.get("detail"),
                source_path=item.get("path"),
                source_line=1,
                metadata={"total_lines": item.get("total_lines", 0)},
            ))

    for item in overview.get("index_fallbacks", []):
        facts.append(_repo_fact(
            "index_fallback",
            item.get("path"),
            item.get("reason") or "bounded indexing fallback",
            source_path=item.get("path"),
            confidence="bounded",
            metadata={
                "total_lines": item.get("total_lines", 0),
                "reason": item.get("reason") or "",
            },
        ))

    baseline = overview.get("search_quality_baseline")
    if isinstance(baseline, dict):
        facts.append(_repo_fact(
            "search_quality",
            "baseline",
            _search_quality_baseline_value(baseline),
            source_path=_search_quality_suite_source_path(overview),
            confidence="repo_config",
            metadata={
                "fact_type": "baseline",
                "min_recall_at_k": baseline.get("min_recall_at_k"),
                "min_mrr": baseline.get("min_mrr"),
                "min_passed": baseline.get("min_passed"),
            },
        ))

    for item in overview.get("search_quality_cases", []):
        if not isinstance(item, dict):
            continue
        facts.append(_repo_fact(
            "search_quality",
            item.get("query"),
            _search_quality_case_value(item),
            source_path=item.get("source_path"),
            confidence="repo_config",
            metadata={
                "fact_type": "case",
                "expected_symbol": item.get("expected_symbol"),
                "expected_path": item.get("expected_path"),
                "expected_type": item.get("expected_type"),
                "top_k": item.get("top_k"),
                "source_index": item.get("source_index"),
            },
        ))

    for item in overview.get("doc_sections", []):
        facts.append(_repo_fact(
            "doc_section",
            item.get("title"),
            item.get("source_path"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "level": item.get("level", 0),
                "anchor": item.get("anchor", ""),
            },
        ))

    for item in overview.get("architecture_decisions", []):
        facts.append(_repo_fact(
            "architecture_decision",
            f"{item.get('status')}:{item.get('category')}:{item.get('name')}".strip(":"),
            item.get("detail") or item.get("source_path"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "name": item.get("name", ""),
                "category": item.get("category", ""),
                "status": item.get("status", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("package_scripts", []):
        facts.append(_repo_fact(
            "package_script",
            item.get("name"),
            item.get("command"),
            source_path=item.get("source_path"),
        ))

    for item in overview.get("dependency_manifests", []):
        facts.append(_repo_fact(
            "dependency_manifest",
            f"{item.get('ecosystem')}:{item.get('package_manager')}:{item.get('source_path')}",
            item.get("detail") or item.get("package_manager"),
            source_path=item.get("source_path"),
            metadata={
                "ecosystem": item.get("ecosystem"),
                "package_manager": item.get("package_manager"),
                "dependency_count": item.get("dependency_count", 0),
                "dev_dependency_count": item.get("dev_dependency_count", 0),
            },
        ))

    for item in overview.get("runbook_commands", []):
        facts.append(_repo_fact(
            "runbook_command",
            item.get("name"),
            item.get("command"),
            source_path=item.get("source_path"),
            metadata={
                "category": item.get("category"),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("dependencies", []):
        facts.append(_repo_fact(
            "dependency",
            item.get("name"),
            item.get("ecosystem"),
            source_path=item.get("source_path"),
            metadata={
                "ecosystem": item.get("ecosystem"),
                "scope": item.get("scope"),
            },
        ))

    for item in overview.get("workspaces", []):
        workspace_path = item.get("path")
        facts.append(_repo_fact(
            "workspace",
            f"{item.get('manager')}:{item.get('workspace_kind')}:{workspace_path}",
            item.get("detail") or item.get("name") or workspace_path,
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="manifest",
            metadata={
                "name": item.get("name", ""),
                "path": workspace_path or "",
                "workspace_kind": item.get("workspace_kind", ""),
                "ecosystem": item.get("ecosystem", ""),
                "manager": item.get("manager", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("stack_components", []):
        facts.append(_repo_fact(
            "stack_component",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "ecosystem": item.get("ecosystem", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("service_integrations", []):
        facts.append(_repo_fact(
            "service_integration",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("graphql_surfaces", []):
        facts.append(_repo_fact(
            "graphql_surface",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("message_buses", []):
        facts.append(_repo_fact(
            "message_bus",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("data_stores", []):
        facts.append(_repo_fact(
            "data_store",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("ai_surfaces", []):
        facts.append(_repo_fact(
            "ai_surface",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("payment_surfaces", []):
        facts.append(_repo_fact(
            "payment_surface",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("auth_surfaces", []):
        facts.append(_repo_fact(
            "auth_surface",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("background_jobs", []):
        facts.append(_repo_fact(
            "background_job",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("webhook_surfaces", []):
        facts.append(_repo_fact(
            "webhook_surface",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("observability_surfaces", []):
        facts.append(_repo_fact(
            "observability_surface",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("feature_flags", []):
        facts.append(_repo_fact(
            "feature_flag",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("notification_surfaces", []):
        facts.append(_repo_fact(
            "notification_surface",
            item.get("name"),
            item.get("detail") or item.get("category"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("environment_variables", []):
        facts.append(_repo_fact(
            "env_var",
            item.get("name"),
            item.get("detail"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "source": item.get("source", ""),
                "service": item.get("service", ""),
                "required": bool(item.get("required", False)),
                "has_default": bool(item.get("has_default", False)),
            },
        ))

    for item in overview.get("ci_workflows", []):
        facts.append(_repo_fact(
            "ci_workflow",
            item.get("name"),
            item.get("detail"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "provider": item.get("provider", ""),
                "events": item.get("events", []),
                "jobs": item.get("jobs", []),
                "commands": item.get("commands", []),
            },
        ))

    for item in overview.get("container_services", []):
        facts.append(_repo_fact(
            "container_service",
            item.get("name"),
            item.get("detail"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "provider": item.get("provider", ""),
                "image": item.get("image", ""),
                "build": item.get("build", ""),
                "command": item.get("command", ""),
                "ports": item.get("ports", []),
                "depends_on": item.get("depends_on", []),
            },
        ))

    for item in overview.get("runtime_requirements", []):
        facts.append(_repo_fact(
            "runtime_requirement",
            item.get("runtime"),
            item.get("requirement"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "runtime": item.get("runtime", ""),
                "requirement": item.get("requirement", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("api_contracts", []):
        facts.append(_repo_fact(
            "api_contract",
            f"{item.get('protocol')}:{item.get('category')}:{item.get('name')}",
            item.get("detail") or item.get("source_path"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "name": item.get("name", ""),
                "category": item.get("category", ""),
                "protocol": item.get("protocol", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("cli_commands", []):
        facts.append(_repo_fact(
            "cli_command",
            f"{item.get('category')}:{item.get('name')}",
            item.get("command") or item.get("detail"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "name": item.get("name", ""),
                "category": item.get("category", ""),
                "command": item.get("command", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("test_systems", []):
        facts.append(_repo_fact(
            "test_system",
            f"{item.get('tool')}:{item.get('category')}:{item.get('name')}",
            item.get("command") or item.get("detail"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "name": item.get("name", ""),
                "category": item.get("category", ""),
                "tool": item.get("tool", ""),
                "command": item.get("command", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("release_processes", []):
        facts.append(_repo_fact(
            "release_process",
            f"{item.get('tool')}:{item.get('category')}:{item.get('name')}",
            item.get("command") or item.get("detail"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "name": item.get("name", ""),
                "category": item.get("category", ""),
                "tool": item.get("tool", ""),
                "command": item.get("command", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("quality_tools", []):
        facts.append(_repo_fact(
            "quality_tool",
            f"{item.get('tool')}:{item.get('category')}:{item.get('name')}",
            item.get("command") or item.get("detail"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "name": item.get("name", ""),
                "category": item.get("category", ""),
                "tool": item.get("tool", ""),
                "command": item.get("command", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("dev_environments", []):
        facts.append(_repo_fact(
            "dev_environment",
            f"{item.get('tool')}:{item.get('category')}:{item.get('name')}",
            item.get("detail") or item.get("source_path"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "name": item.get("name", ""),
                "category": item.get("category", ""),
                "tool": item.get("tool", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("build_systems", []):
        facts.append(_repo_fact(
            "build_system",
            f"{item.get('tool')}:{item.get('category')}:{item.get('name')}",
            item.get("command") or item.get("detail"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "name": item.get("name", ""),
                "category": item.get("category", ""),
                "tool": item.get("tool", ""),
                "command": item.get("command", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("ui_surfaces", []):
        facts.append(_repo_fact(
            "ui_surface",
            f"{item.get('framework')}:{item.get('category')}:{item.get('name')}",
            item.get("detail") or item.get("source_path"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "name": item.get("name", ""),
                "category": item.get("category", ""),
                "framework": item.get("framework", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("mobile_surfaces", []):
        facts.append(_repo_fact(
            "mobile_surface",
            f"{item.get('platform')}:{item.get('category')}:{item.get('name')}",
            item.get("detail") or item.get("source_path"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "name": item.get("name", ""),
                "category": item.get("category", ""),
                "platform": item.get("platform", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("infra_resources", []):
        facts.append(_repo_fact(
            "infra_resource",
            f"{item.get('provider')}:{item.get('category')}:{item.get('resource_type')}:{item.get('name')}",
            item.get("detail") or item.get("source_path"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "provider": item.get("provider", ""),
                "category": item.get("category", ""),
                "resource_type": item.get("resource_type", ""),
                "name": item.get("name", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("repo_policies", []):
        facts.append(_repo_fact(
            "repo_policy",
            item.get("policy_type"),
            item.get("value") or item.get("name"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "policy_type": item.get("policy_type", ""),
                "name": item.get("name", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("code_owners", []):
        owners = item.get("owners") if isinstance(item.get("owners"), list) else []
        facts.append(_repo_fact(
            "code_owner",
            item.get("pattern"),
            " ".join(str(owner) for owner in owners),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "owners": owners,
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("deploy_targets", []):
        facts.append(_repo_fact(
            "deploy_target",
            f"{item.get('provider')}:{item.get('target_type')}:{item.get('name')}",
            item.get("detail") or item.get("source_path"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "provider": item.get("provider", ""),
                "target_type": item.get("target_type", ""),
                "name": item.get("name", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("supply_chain", []):
        facts.append(_repo_fact(
            "supply_chain",
            f"{item.get('category')}:{item.get('tool')}:{item.get('name')}",
            item.get("detail") or item.get("source_path"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "tool": item.get("tool", ""),
                "ecosystem": item.get("ecosystem", ""),
                "source": item.get("source", ""),
                "detail": item.get("detail", ""),
            },
        ))

    for item in overview.get("secret_signals", []):
        facts.append(_repo_fact(
            "secret_signal",
            item.get("name"),
            item.get("detail") or "value redacted",
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "category": item.get("category", ""),
                "source": item.get("source", ""),
                "has_value": bool(item.get("has_value", False)),
                "redacted": True,
            },
        ))

    for item in overview.get("route_endpoints", []):
        method = item.get("method", "")
        path = item.get("path", "")
        facts.append(_repo_fact(
            "route_endpoint",
            f"{method} {path}".strip(),
            item.get("framework"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={
                "method": method,
                "path": path,
                "framework": item.get("framework"),
            },
        ))

    for item in overview.get("schema_facts", []):
        schema_type = item.get("schema_type", "")
        name = item.get("name", "")
        facts.append(_repo_fact(
            "schema",
            f"{schema_type}:{name}".strip(":"),
            item.get("detail"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={key: item.get(key, "") for key in SCHEMA_FACT_METADATA_KEYS},
        ))

    for item in overview.get("migration_facts", []):
        facts.append(_repo_fact(
            "migration",
            _migration_fact_key(item),
            item.get("detail"),
            source_path=item.get("source_path"),
            source_line=item.get("line"),
            confidence="heuristic",
            metadata={key: item.get(key, "") for key in MIGRATION_FACT_METADATA_KEYS},
        ))

    for item in overview.get("import_relationships", []):
        facts.append(_repo_fact(
            "import",
            item.get("target"),
            item.get("source_path"),
            source_path=item.get("source_path"),
            source_line=item.get("source_line"),
            confidence=item.get("confidence") or "heuristic",
            metadata={
                "syntax": item.get("syntax", ""),
                "target_path": item.get("target_path", ""),
            },
        ))

    for item in overview.get("top_symbols", []):
        facts.append(_repo_fact(
            "symbol",
            item.get("name"),
            item.get("symbol_type"),
            source_path=item.get("path"),
            source_line=item.get("start_line"),
            confidence="indexed_summary",
            metadata={"symbol_type": item.get("symbol_type")},
        ))

    return _dedupe_and_sort_repo_facts(facts)[:MAX_REPO_FACTS]


def _search_quality_baseline_value(baseline: Dict[str, Any]) -> str:
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


def _search_quality_case_value(item: Dict[str, Any]) -> str:
    expected = []
    if item.get("expected_symbol"):
        expected.append(str(item.get("expected_symbol")))
    if item.get("expected_path"):
        expected.append(str(item.get("expected_path")))
    if item.get("expected_type"):
        expected.append(str(item.get("expected_type")))
    top_k = item.get("top_k")
    suffix = f"; top_k={top_k}" if top_k is not None else ""
    return f"expects {' / '.join(expected) if expected else 'match'}{suffix}"


def _search_quality_suite_source_path(overview: Dict[str, Any]) -> Optional[str]:
    for item in overview.get("search_quality_cases", []) or []:
        if isinstance(item, dict) and item.get("source_path"):
            return str(item.get("source_path"))
    return None


def _repo_fact(
    kind: str,
    key: Any,
    value: Any,
    source_path: Optional[str] = None,
    source_line: Optional[int] = None,
    confidence: str = "derived",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    source_line_value = None
    if source_line is not None:
        try:
            parsed_line = int(source_line)
            source_line_value = parsed_line if parsed_line > 0 else None
        except (TypeError, ValueError):
            source_line_value = None

    metadata_value = dict(metadata or {})
    metadata_value.setdefault(
        "provenance",
        _repo_fact_provenance(kind, source_path, source_line_value, confidence, metadata_value),
    )
    metadata_value.setdefault(
        "rank",
        _repo_fact_rank(kind, key, value, source_path, source_line_value, metadata_value),
    )

    return {
        "kind": _truncate_text(kind, 80),
        "key": _truncate_text(key, 240),
        "value": _truncate_text(value, 500),
        "source_path": _truncate_text(source_path, 500) if source_path else None,
        "source_line": source_line_value,
        "confidence": _truncate_text(confidence or "derived", 40),
        "metadata": metadata_value,
    }


def _dedupe_and_sort_repo_facts(facts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped: List[Dict[str, Any]] = []
    seen = set()
    for fact in facts:
        if not fact["kind"] or not fact["key"]:
            continue
        identity = (
            fact["kind"],
            fact["key"],
            fact["value"],
            fact.get("source_path") or "",
            fact.get("source_line") or 0,
        )
        if identity in seen:
            continue
        seen.add(identity)
        deduped.append(fact)

    return sorted(deduped, key=_repo_fact_sort_key)


def _repo_fact_sort_key(item: Dict[str, Any]) -> tuple[Any, ...]:
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    rank = metadata.get("rank")
    try:
        rank_value = int(rank)
    except (TypeError, ValueError):
        rank_value = _repo_fact_rank(
            item.get("kind"),
            item.get("key"),
            item.get("value"),
            item.get("source_path"),
            item.get("source_line"),
            metadata,
        )
    return (
        rank_value,
        item.get("kind") or "",
        item.get("key") or "",
        item.get("source_path") or "",
        item.get("source_line") or 0,
        item.get("value") or "",
    )


def _repo_fact_rank(
    kind: Any,
    key: Any,
    value: Any,
    source_path: Optional[str],
    source_line: Optional[int],
    metadata: Optional[Dict[str, Any]] = None,
) -> int:
    kind_value = str(kind or "")
    metadata = metadata or {}
    rank = FACT_KIND_RANK.get(kind_value, 900) * 1000

    if kind_value == "runbook_command":
        rank += RUNBOOK_CATEGORY_RANK.get(str(metadata.get("category") or ""), 9) * 100
    elif kind_value == "route_endpoint":
        method = str(metadata.get("method") or str(key or "").split(" ", 1)[0]).upper()
        rank += {"GET": 0, "POST": 1, "PUT": 2, "PATCH": 3, "DELETE": 4}.get(method, 8) * 10
    elif kind_value == "migration":
        rank += {
            "create_table": 0,
            "create_model": 1,
            "add_column": 2,
            "add_field": 2,
            "add_index": 3,
            "change_table": 4,
            "alter_field": 5,
            "drop_column": 6,
            "remove_field": 6,
            "drop_table": 7,
            "delete_model": 7,
        }.get(str(metadata.get("action") or ""), 9) * 10
    elif kind_value == "dependency":
        rank += {"runtime": 0, "dev": 1, "build": 2, "test": 3}.get(str(metadata.get("scope") or ""), 8) * 10
    elif kind_value == "workspace":
        rank += WORKSPACE_KIND_RANK.get(str(metadata.get("workspace_kind") or ""), 5) * 10
    elif kind_value == "service_integration":
        rank += _service_integration_category_rank(str(metadata.get("category") or "")) * 2
    elif kind_value == "graphql_surface":
        rank += _graphql_surface_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "message_bus":
        rank += _message_bus_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "data_store":
        rank += _data_store_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "ai_surface":
        rank += _ai_surface_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "payment_surface":
        rank += _payment_surface_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "auth_surface":
        rank += _auth_surface_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "background_job":
        rank += _background_job_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "webhook_surface":
        rank += _webhook_surface_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "observability_surface":
        rank += _observability_surface_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "feature_flag":
        rank += _feature_flag_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "notification_surface":
        rank += _notification_surface_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "supply_chain":
        rank += _supply_chain_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "api_contract":
        rank += _api_contract_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "cli_command":
        rank += _cli_command_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "test_system":
        rank += _test_system_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "release_process":
        rank += _release_process_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "quality_tool":
        rank += _quality_tool_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "architecture_decision":
        rank += _architecture_decision_category_rank(str(metadata.get("category") or "")) * 10
        rank += _architecture_decision_status_rank(str(metadata.get("status") or ""))
    elif kind_value == "dev_environment":
        rank += _dev_environment_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "build_system":
        rank += _build_system_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "ui_surface":
        rank += _ui_surface_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "mobile_surface":
        rank += _mobile_surface_category_rank(str(metadata.get("category") or "")) * 10
    elif kind_value == "infra_resource":
        rank += _infra_resource_category_rank(str(metadata.get("category") or "")) * 10

    rank += _repo_fact_source_rank(source_path)
    if source_line:
        rank += min(int(source_line), 99)
    return rank


def _repo_fact_source_rank(source_path: Optional[str]) -> int:
    if not source_path:
        return 40
    pure = PurePosixPath(source_path)
    name = pure.name.lower()
    if len(pure.parts) == 1:
        if name in {"package.json", "pyproject.toml", "go.mod", "cargo.toml", "composer.json", "gemfile", "makefile", "justfile"}:
            return 0
        return 10
    if pure.parts and pure.parts[0].lower() in {"src", "app", "lib", "cmd"}:
        return 20
    if pure.parts and pure.parts[0].lower() in {"tests", "test", "__tests__"}:
        return 30
    if pure.parts and pure.parts[0].lower() in {"docs", "doc"}:
        return 50
    return 35


def _repo_fact_provenance(
    kind: Any,
    source_path: Optional[str],
    source_line: Optional[int],
    confidence: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    metadata = metadata or {}
    kind_value = str(kind or "")
    if kind_value in {"language", "directory", "module", "module_dependency", "symbol", "index_fallback"}:
        source = "indexed-metadata"
    elif kind_value in {"runbook_command", "package_script", "dependency_manifest", "dependency", "workspace"}:
        source = "manifest"
    elif kind_value == "cli_command":
        source_kind = str(metadata.get("source") or "")
        if source_kind in {"package-bin", "pyproject-scripts", "poetry-scripts", "setup-cfg-entry-points", "setup-py-entry-points", "cargo-bin", "gemspec-executables"}:
            source = "manifest"
        else:
            source = "parsed-source"
    elif kind_value in {"route_endpoint", "import", "schema", "migration", "doc_section", "architecture_decision", "env_var", "stack_component", "service_integration", "graphql_surface", "message_bus", "data_store", "ai_surface", "payment_surface", "auth_surface", "background_job", "webhook_surface", "observability_surface", "feature_flag", "notification_surface", "ci_workflow", "container_service", "runtime_requirement", "api_contract", "test_system", "release_process", "quality_tool", "dev_environment", "build_system", "ui_surface", "mobile_surface", "infra_resource", "repo_policy", "code_owner", "deploy_target", "supply_chain", "secret_signal"}:
        source = "parsed-source"
    else:
        source = "file-classification"

    provenance: Dict[str, Any] = {
        "source": source,
        "confidence": confidence or "derived",
    }
    if source_path:
        provenance["source_path"] = source_path
    if source_line:
        provenance["source_line"] = source_line
    if "framework" in metadata:
        provenance["framework"] = metadata["framework"]
    if "ecosystem" in metadata:
        provenance["ecosystem"] = metadata["ecosystem"]
    return provenance


def _truncate_text(value: Any, limit: int) -> str:
    text = "" if value is None else str(value)
    return text[:limit]


def _ranked_values(values, metric: str, limit: int) -> List[Dict[str, Any]]:
    return sorted(
        values,
        key=lambda item: (-item[metric], item.get("path") or item.get("language") or ""),
    )[:limit]


def _ranked_languages(values, limit: int) -> List[Dict[str, Any]]:
    languages = []
    for item in values:
        support_levels = set(item.get("support_levels") or {"searchable"})
        if "symbol-aware" in support_levels and "searchable" in support_levels:
            support_level = "mixed"
        elif "symbol-aware" in support_levels:
            support_level = "symbol-aware"
        else:
            support_level = "searchable"
        languages.append({
            "language": item.get("language") or "Text",
            "file_count": int(item.get("file_count") or 0),
            "line_count": int(item.get("line_count") or 0),
            "support_level": support_level,
            "symbol_aware": "symbol-aware" in support_levels,
            "searchable": True,
        })
    return _ranked_values(languages, "line_count", limit)


def _ranked_modules(values) -> List[Dict[str, Any]]:
    modules = []
    for item in values:
        modules.append({
            "path": item.get("path") or "(root)",
            "file_count": int(item.get("file_count") or 0),
            "line_count": int(item.get("line_count") or 0),
            "symbol_count": int(item.get("symbol_count") or 0),
            "languages": sorted(str(language) for language in item.get("languages", set()) if language),
            "sample_files": list(item.get("sample_files") or [])[:MAX_MODULE_SAMPLE_FILES],
        })
    return sorted(
        modules,
        key=lambda item: (
            -item["symbol_count"],
            -item["file_count"],
            -item["line_count"],
            item["path"],
        ),
    )[:MAX_MODULE_SUMMARIES]


def _limit_facts(facts: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    return sorted(facts, key=lambda item: (item["path"].count("/"), item["path"]))[:limit]


def _is_pruned(relative_path: Path) -> bool:
    return any(part.lower() in PRUNED_PARTS for part in relative_path.parts)


def _collapse_relative_posix_path(path: PurePosixPath) -> Optional[str]:
    parts: List[str] = []
    for part in path.parts:
        if part in {"", "."}:
            continue
        if part == "..":
            if not parts:
                return None
            parts.pop()
            continue
        parts.append(part)
    return "/".join(parts)


def _to_posix(path: Path | PurePosixPath) -> str:
    return PurePosixPath(*path.parts).as_posix()
