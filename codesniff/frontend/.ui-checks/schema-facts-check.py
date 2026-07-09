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
    "phone-small": "schema-facts-phone-320.png",
    "laptop": "schema-facts-laptop-1366.png",
    "ultrawide": "schema-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "schema-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 301,
    "name": "schema-data-fixture-with-a-very-long-name-for-layout-testing",
    "source_type": "github",
    "source_url": "https://github.com/example/schema-data-fixture",
    "status": "lexical_ready",
    "active_revision": "abc1234",
    "storage_path": "/tmp/codesniff/schema-data-fixture",
    "created_at": "2026-07-05T00:00:00Z",
    "updated_at": "2026-07-05T00:00:00Z",
    "last_opened_at": "2026-07-05T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 987654321,
    "total_symbols": 54321,
    "total_files": 100000,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

OVERVIEW = {
    "repo_id": 301,
    "total_files": 100000,
    "total_symbols": 54321,
    "languages": [
        {"language": "Python", "file_count": 4321, "line_count": 200000},
        {"language": "Prisma", "file_count": 1, "line_count": 12},
        {"language": "SQL", "file_count": 4, "line_count": 300},
    ],
    "top_directories": [{"path": "src", "file_count": 3000, "line_count": 180000}],
    "docs": [],
    "configs": [{"path": "prisma/schema.prisma", "kind": "config", "detail": "Prisma schema", "total_lines": 12}],
    "tests": [],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "runtime entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "route_endpoints": [],
    "import_relationships": [],
    "symbol_types": {"class": 1200, "function": 9000},
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
    },
    {
        "id": 2,
        "kind": "schema",
        "key": "field:Customer.email",
        "value": "Email",
        "source_path": "src/models.py",
        "source_line": 5,
        "confidence": "heuristic",
        "metadata": {"rank": 65025, "schema_type": "field", "source": "django", "model": "Customer", "provenance": {"source": "parsed-source"}},
    },
]

SCHEMA_FACTS = [
    {
        "id": 10,
        "kind": "schema",
        "key": "table:invoices_with_long_reporting_partition_name",
        "value": "SQL table",
        "source_path": "db/schema.sql",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {"rank": 65001, "schema_type": "table", "source": "sql", "table": "invoices", "provenance": {"source": "parsed-source"}},
    },
    {
        "id": 11,
        "kind": "schema",
        "key": "model:User",
        "value": "Prisma model",
        "source_path": "prisma/schema.prisma",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {"rank": 65010, "schema_type": "model", "source": "prisma", "model": "User", "provenance": {"source": "parsed-source"}},
    },
    {
        "id": 12,
        "kind": "schema",
        "key": "field:Customer.email",
        "value": "Email",
        "source_path": "src/models.py",
        "source_line": 5,
        "confidence": "heuristic",
        "metadata": {"rank": 65025, "schema_type": "field", "source": "django", "model": "Customer", "provenance": {"source": "parsed-source"}},
    },
    {
        "id": 13,
        "kind": "schema",
        "key": "field:payments.reference",
        "value": "string",
        "source_path": "database/migrations/2024_01_01_create_payments.php",
        "source_line": 4,
        "confidence": "heuristic",
        "metadata": {"rank": 65035, "schema_type": "field", "source": "laravel", "table": "payments", "provenance": {"source": "parsed-source"}},
    },
    {
        "id": 14,
        "kind": "schema",
        "key": "field:Account.extremelyLongBillingEmailColumnNameForWrapping",
        "value": "varchar",
        "source_path": "src/entities/account.entity.ts",
        "source_line": 9,
        "confidence": "heuristic",
        "metadata": {"rank": 65040, "schema_type": "field", "source": "typeorm", "model": "Account", "table": "accounts", "provenance": {"source": "parsed-source"}},
    },
    {
        "id": 15,
        "kind": "schema",
        "key": "field:users.active",
        "value": "boolean",
        "source_path": "lib/my_app/accounts/user.ex",
        "source_line": 6,
        "confidence": "heuristic",
        "metadata": {"rank": 65045, "schema_type": "field", "source": "ecto", "model": "User", "table": "users", "provenance": {"source": "parsed-source"}},
    },
    {
        "id": 16,
        "kind": "schema",
        "key": "field:Payment.Reference",
        "value": "string",
        "source_path": "src/csharp_models/Payment.cs",
        "source_line": 9,
        "confidence": "heuristic",
        "metadata": {"rank": 65050, "schema_type": "field", "source": "entity_framework", "model": "Payment", "table": "payments", "provenance": {"source": "parsed-source"}},
    },
    {
        "id": 17,
        "kind": "schema",
        "key": "relationship:Order.customerWithExtremelyLongAssociationNameForWrapping",
        "value": "SQLAlchemy relationship to CustomerAccountAggregate",
        "source_path": "src/models/orders.py",
        "source_line": 22,
        "confidence": "heuristic",
        "metadata": {
            "rank": 65052,
            "schema_type": "relationship",
            "source": "sqlalchemy",
            "model": "Order",
            "table": "orders",
            "field": "customerWithExtremelyLongAssociationNameForWrapping",
            "target_model": "CustomerAccountAggregate",
            "relation_type": "relationship",
            "foreign_key": "customer_account_id",
            "provenance": {"source": "parsed-source"},
        },
    },
]

SCHEMA_RELATIONSHIPS = [
    {
        "id": 50,
        "src_kind": "file",
        "src_id": 7,
        "source_path": "db/schema.sql",
        "dst_kind": "schema",
        "dst_id": None,
        "rel_type": "defines_schema",
        "target": "table:invoices_with_long_reporting_partition_name",
        "confidence": "heuristic",
        "source_line": 1,
        "metadata": {"source_path": "db/schema.sql", "schema_type": "table", "source": "sql", "detail": "SQL table"},
    },
    {
        "id": 51,
        "src_kind": "file",
        "src_id": 8,
        "source_path": "src/models.py",
        "dst_kind": "schema",
        "dst_id": None,
        "rel_type": "defines_schema",
        "target": "field:Customer.email",
        "confidence": "heuristic",
        "source_line": 5,
        "metadata": {"source_path": "src/models.py", "schema_type": "field", "source": "django", "model": "Customer", "detail": "Email"},
    },
    {
        "id": 52,
        "src_kind": "file",
        "src_id": 9,
        "source_path": "src/entities/account.entity.ts",
        "dst_kind": "schema",
        "dst_id": None,
        "rel_type": "defines_schema",
        "target": "field:Account.extremelyLongBillingEmailColumnNameForWrapping",
        "confidence": "heuristic",
        "source_line": 9,
        "metadata": {"source_path": "src/entities/account.entity.ts", "schema_type": "field", "source": "typeorm", "model": "Account", "table": "accounts", "detail": "varchar"},
    },
    {
        "id": 53,
        "src_kind": "file",
        "src_id": 10,
        "source_path": "lib/my_app/accounts/user.ex",
        "dst_kind": "schema",
        "dst_id": None,
        "rel_type": "defines_schema",
        "target": "field:users.active",
        "confidence": "heuristic",
        "source_line": 6,
        "metadata": {"source_path": "lib/my_app/accounts/user.ex", "schema_type": "field", "source": "ecto", "model": "User", "table": "users", "detail": "boolean"},
    },
    {
        "id": 54,
        "src_kind": "file",
        "src_id": 11,
        "source_path": "src/models/orders.py",
        "dst_kind": "schema",
        "dst_id": None,
        "rel_type": "defines_schema",
        "target": "relationship:Order.customerWithExtremelyLongAssociationNameForWrapping",
        "confidence": "heuristic",
        "source_line": 22,
        "metadata": {
            "source_path": "src/models/orders.py",
            "schema_type": "relationship",
            "source": "sqlalchemy",
            "model": "Order",
            "table": "orders",
            "field": "customerWithExtremelyLongAssociationNameForWrapping",
            "target_model": "CustomerAccountAggregate",
            "relation_type": "relationship",
            "foreign_key": "customer_account_id",
            "detail": "SQLAlchemy relationship to CustomerAccountAggregate",
        },
    },
]


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 54321, "total_files": 100000, "functions": 9000, "classes": 1200, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/301/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/301/facts":
        facts = SCHEMA_FACTS if query.get("kind") == ["schema"] else ALL_FACTS
        return {"repo_id": 301, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/301/relationships":
        relationships = SCHEMA_RELATIONSHIPS if query.get("rel_type") == ["defines_schema"] else []
        return {"repo_id": 301, "total": len(relationships), "relationships": relationships}
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
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Data").click()
    page.locator("[data-ui='repo-facts']").get_by_text("field:Customer.email").wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("field:payments.reference").wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("field:Account.extremelyLongBillingEmailColumnNameForWrapping").wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("field:users.active").wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("relationship:Order.customerWithExtremelyLongAssociationNameForWrapping").wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("SQLAlchemy relationship to CustomerAccountAggregate").wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("field:Payment.Reference").wait_for(timeout=10000)
    if page.locator("[data-ui='repo-facts']").get_by_text("pytest").count() != 0:
        raise AssertionError("Data filter still shows stale runbook fact")
    page.locator("[data-ui='relationship-filter']").get_by_role("button", name="Data").click()
    page.locator("[data-ui='repo-relationships']").get_by_text("field:Customer.email").wait_for(timeout=10000)
    page.locator("[data-ui='repo-relationships']").get_by_text("table:invoices_with_long_reporting_partition_name").wait_for(timeout=10000)
    page.locator("[data-ui='repo-relationships']").get_by_text("field:Account.extremelyLongBillingEmailColumnNameForWrapping").wait_for(timeout=10000)
    page.locator("[data-ui='repo-relationships']").get_by_text("field:users.active").wait_for(timeout=10000)
    page.locator("[data-ui='repo-relationships']").get_by_text("relationship:Order.customerWithExtremelyLongAssociationNameForWrapping").wait_for(timeout=10000)
    page.locator("[data-ui='repo-relationships']").get_by_text("CustomerAccountAggregate").wait_for(timeout=10000)
    page.locator("[data-ui='repo-relationships']").get_by_text("customer_account_id").wait_for(timeout=10000)
    page.locator("[data-ui='repo-relationships']").get_by_text("defines schema").first.wait_for(timeout=10000)
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

    schema_requests = [url for url in requests if "/facts" in url and "kind=schema" in url]
    schema_relationship_requests = [url for url in requests if "/relationships" in url and "rel_type=defines_schema" in url]
    if len(schema_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected schema fact request per viewport, got {len(schema_requests)}"]
    if len(schema_relationship_requests) < len(VIEWPORTS):
        failures["relationship_requests"] = [f"expected schema relationship request per viewport, got {len(schema_relationship_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"schema_fact_requests={len(schema_requests)}")
    print(f"schema_relationship_requests={len(schema_relationship_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("schema facts data-filter UI check passed")


if __name__ == "__main__":
    main()
