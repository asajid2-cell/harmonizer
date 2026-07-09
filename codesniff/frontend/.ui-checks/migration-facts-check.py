from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright


VIEWPORTS = [
    ("phone-portrait", 390, 844),
    ("phone-small", 320, 568),
    ("tablet-portrait", 768, 1024),
    ("laptop", 1366, 768),
    ("desktop", 1920, 1080),
    ("ultrawide", 2560, 1080),
    ("vertical-kiosk", 1080, 1920),
    ("odd-square", 900, 900),
]

SCREENSHOTS = {
    "phone-small": "migrations-phone-320.png",
    "laptop": "migrations-laptop-1366.png",
    "ultrawide": "migrations-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "migrations"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 421,
    "name": "migration-surface-fixture-with-a-very-long-name-for-layout-testing",
    "source_type": "github",
    "source_url": "https://github.com/example/migration-surface-fixture",
    "status": "lexical_ready",
    "active_revision": "abc1234",
    "storage_path": "/tmp/codesniff/migration-surface-fixture",
    "created_at": "2026-07-05T00:00:00Z",
    "updated_at": "2026-07-05T00:00:00Z",
    "last_opened_at": "2026-07-05T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 456789012,
    "total_symbols": 12345,
    "total_files": 50000,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

OVERVIEW = {
    "repo_id": 421,
    "total_files": 50000,
    "total_symbols": 12345,
    "languages": [
        {"language": "Python", "file_count": 2000, "line_count": 90000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "SQL", "file_count": 120, "line_count": 8000, "support_level": "searchable", "symbol_aware": False, "searchable": True},
    ],
    "top_directories": [{"path": "src", "file_count": 1200, "line_count": 70000}],
    "modules": [],
    "module_dependencies": [],
    "docs": [],
    "doc_sections": [],
    "configs": [],
    "tests": [],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "runtime entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
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
    "ci_workflows": [],
    "container_services": [],
    "runtime_requirements": [],
    "repo_policies": [],
    "code_owners": [],
    "deploy_targets": [],
    "secret_signals": [],
    "index_fallbacks": [],
    "route_endpoints": [],
    "import_relationships": [],
    "migration_facts": [],
    "search_quality_cases": [],
    "search_quality_baseline": None,
    "symbol_types": {"function": 1000},
    "top_symbols": [],
    "warnings": [],
}

ALL_FACTS = [
    {
        "id": 1,
        "kind": "runbook_command",
        "key": "test",
        "value": "pytest",
        "source_path": "pyproject.toml",
        "source_line": None,
        "confidence": "derived",
        "metadata": {"rank": 20000, "provenance": {"source": "manifest"}},
    }
]

MIGRATION_FACTS = [
    {
        "id": 10,
        "kind": "migration",
        "key": "add_column:users.email",
        "value": "Alembic migration adds column email to users",
        "source_path": "alembic/versions/20240701_add_users.py",
        "source_line": 6,
        "confidence": "heuristic",
        "metadata": {"rank": 66026, "action": "add_column", "table": "users", "field": "email", "source": "alembic", "framework": "alembic", "operation": "add_column", "provenance": {"source": "parsed-source"}},
    },
    {
        "id": 11,
        "kind": "migration",
        "key": "add_column:extremely_long_audit_events_partition_for_operational_reporting.customer_account_identifier_with_long_suffix",
        "value": "SQL migration adds column customer_account_identifier_with_long_suffix to extremely_long_audit_events_partition_for_operational_reporting",
        "source_path": "prisma/migrations/20240701000000_init/migration.sql",
        "source_line": 2,
        "confidence": "heuristic",
        "metadata": {"rank": 66032, "action": "add_column", "table": "extremely_long_audit_events_partition_for_operational_reporting", "field": "customer_account_identifier_with_long_suffix", "source": "sql", "framework": "prisma", "operation": "ALTER TABLE ADD COLUMN", "provenance": {"source": "parsed-source"}},
    },
    {
        "id": 12,
        "kind": "migration",
        "key": "add_index:Invoices",
        "value": "Entity Framework migration adds index IX_Invoices_Number on Invoices",
        "source_path": "Migrations/20240701000000_AddInvoices.cs",
        "source_line": 8,
        "confidence": "heuristic",
        "metadata": {"rank": 66048, "action": "add_index", "table": "Invoices", "field": "", "name": "IX_Invoices_Number", "source": "entity_framework", "framework": "entity_framework", "operation": "CreateIndex", "provenance": {"source": "parsed-source"}},
    },
]

MIGRATION_RELATIONSHIPS = [
    {
        "id": 50,
        "src_kind": "file",
        "src_id": 7,
        "source_path": "alembic/versions/20240701_add_users.py",
        "dst_kind": "migration",
        "dst_id": None,
        "rel_type": "defines_migration",
        "target": "add_column:users.email",
        "confidence": "heuristic",
        "source_line": 6,
        "metadata": {"source_path": "alembic/versions/20240701_add_users.py", "action": "add_column", "table": "users", "field": "email", "source": "alembic", "framework": "alembic", "operation": "add_column", "detail": "Alembic migration adds column email to users"},
    },
    {
        "id": 51,
        "src_kind": "file",
        "src_id": 8,
        "source_path": "prisma/migrations/20240701000000_init/migration.sql",
        "dst_kind": "migration",
        "dst_id": None,
        "rel_type": "defines_migration",
        "target": "add_column:extremely_long_audit_events_partition_for_operational_reporting.customer_account_identifier_with_long_suffix",
        "confidence": "heuristic",
        "source_line": 2,
        "metadata": {"source_path": "prisma/migrations/20240701000000_init/migration.sql", "action": "add_column", "table": "extremely_long_audit_events_partition_for_operational_reporting", "field": "customer_account_identifier_with_long_suffix", "source": "sql", "framework": "prisma", "operation": "ALTER TABLE ADD COLUMN", "detail": "SQL migration adds column customer_account_identifier_with_long_suffix"},
    },
    {
        "id": 52,
        "src_kind": "file",
        "src_id": 9,
        "source_path": "Migrations/20240701000000_AddInvoices.cs",
        "dst_kind": "migration",
        "dst_id": None,
        "rel_type": "defines_migration",
        "target": "add_index:Invoices",
        "confidence": "heuristic",
        "source_line": 8,
        "metadata": {"source_path": "Migrations/20240701000000_AddInvoices.cs", "action": "add_index", "table": "Invoices", "field": "", "name": "IX_Invoices_Number", "source": "entity_framework", "framework": "entity_framework", "operation": "CreateIndex", "detail": "Entity Framework migration adds index IX_Invoices_Number on Invoices"},
    },
]


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 12345, "total_files": 50000, "functions": 1000, "classes": 200, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/421/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/421/facts":
        facts = MIGRATION_FACTS if query.get("kind") == ["migration"] else ALL_FACTS
        return {"repo_id": 421, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/421/relationships":
        relationships = MIGRATION_RELATIONSHIPS if query.get("rel_type") == ["defines_migration"] else []
        return {"repo_id": 421, "total": len(relationships), "relationships": relationships}
    return None


def scan_layout(page):
    return page.evaluate(
        """
        () => {
          const out = [];
          const de = document.documentElement;
          const vw = de.clientWidth;
          const visible = (el) => {
            for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
              const s = getComputedStyle(n);
              if (n.hidden || n.inert || n.getAttribute('aria-hidden') === 'true' || s.display === 'none' || s.visibility === 'hidden' || (Number(s.opacity) === 0 && s.pointerEvents === 'none')) return false;
            }
            return true;
          };
          if (de.scrollWidth > vw + 1) out.push(`h-overflow:${de.scrollWidth}>${vw}`);
          const controls = document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role="button"], [onclick]');
          for (const el of controls) {
            if (!visible(el)) continue;
            const r = el.getBoundingClientRect();
            const label = ((el.innerText || el.value || el.getAttribute('aria-label') || el.tagName) + '').trim().slice(0, 50);
            if (r.width === 0 || r.height === 0) out.push(`zero-size:${label}`);
            if (r.right > vw + 1 || r.left < -1) out.push(`clipped:${label}:${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
          }
          return out;
        }
        """
    )


def run_case(browser, name, width, height, requests):
    page = browser.new_page(viewport={"width": width, "height": height})

    def route_handler(route):
        data = api_response(route.request.url)
        if data is None:
            route.continue_()
            return
        requests.append(route.request.url)
        route.fulfill(status=200, content_type="application/json", json=data)

    page.route("**/api/codesniff/**", route_handler)
    page.goto(TARGET, wait_until="networkidle")
    page.locator("[data-ui='repo-select']").first.click()
    page.locator("[data-ui='repo-facts']").get_by_text("pyproject.toml").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Migrate").click()
    page.locator("[data-ui='repo-facts']").get_by_text("add_column:users.email").wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("add_column:extremely_long_audit_events_partition_for_operational_reporting.customer_account_identifier_with_long_suffix").wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("SQL migration adds column customer_account_identifier_with_long_suffix").wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("add_index:Invoices").wait_for(timeout=10000)
    if page.locator("[data-ui='repo-facts']").get_by_text("pytest").count() != 0:
        raise AssertionError("Migration filter still shows stale runbook fact")
    page.locator("[data-ui='relationship-filter']").get_by_role("button", name="Migrate").click()
    page.locator("[data-ui='repo-relationships']").get_by_text("defines migration").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-relationships']").get_by_text("add_column:users.email").wait_for(timeout=10000)
    page.locator("[data-ui='repo-relationships']").get_by_text("add_column:extremely_long_audit_events_partition_for_operational_reporting.customer_account_identifier_with_long_suffix").wait_for(timeout=10000)
    page.locator("[data-ui='repo-relationships']").get_by_text("ALTER TABLE ADD COLUMN").wait_for(timeout=10000)
    page.locator("[data-ui='repo-relationships']").get_by_text("entity_framework").wait_for(timeout=10000)
    page.locator("[data-ui='repo-relationships']").get_by_text("IX_Invoices_Number").wait_for(timeout=10000)
    defects = scan_layout(page)
    if name in SCREENSHOTS:
        page.screenshot(path=str(OUT_DIR / SCREENSHOTS[name]), full_page=True)
    page.close()
    return defects


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    requests = []
    failures = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            for name, width, height in VIEWPORTS:
                defects = run_case(browser, name, width, height, requests)
                if defects:
                    failures[name] = defects
        finally:
            browser.close()

    migration_requests = [url for url in requests if "/facts" in url and "kind=migration" in url]
    migration_relationship_requests = [url for url in requests if "/relationships" in url and "rel_type=defines_migration" in url]
    if len(migration_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected migration fact request per viewport, got {len(migration_requests)}"]
    if len(migration_relationship_requests) < len(VIEWPORTS):
        failures["relationship_requests"] = [f"expected migration relationship request per viewport, got {len(migration_relationship_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"migration_fact_requests={len(migration_requests)}")
    print(f"migration_relationship_requests={len(migration_relationship_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("migration facts UI check passed")


if __name__ == "__main__":
    main()
