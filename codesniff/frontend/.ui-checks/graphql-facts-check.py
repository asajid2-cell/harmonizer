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
    "phone-small": "graphql-facts-phone-320.png",
    "laptop": "graphql-facts-laptop-1366.png",
    "ultrawide": "graphql-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "graphql-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 982,
    "name": "graphql-fixture-with-long-schema-resolver-and-client-paths",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "graphql982",
    "storage_path": "/tmp/codesniff/graphql-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 131313131,
    "total_symbols": 1410,
    "total_files": 352,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

GRAPHQL_FACTS = [
    {
        "id": 4001,
        "kind": "graphql_surface",
        "key": "Apollo Server",
        "value": "Apollo GraphQL server dependency",
        "source_path": "package.json",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54010,
            "category": "server",
            "source": "dependency",
            "detail": "Apollo GraphQL server dependency",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 4002,
        "kind": "graphql_surface",
        "key": "GraphQL root type",
        "value": "GraphQL root operation type",
        "source_path": "src/graphql/schema/customer-invoice-billing-graph-with-very-long-schema-path.graphql",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54021,
            "category": "schema",
            "source": "code-signal",
            "detail": "GraphQL root operation type",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 4003,
        "kind": "graphql_surface",
        "key": "GraphQL resolver",
        "value": "GraphQL resolver signal",
        "source_path": "src/graphql/resolvers/customer-invoice-create-mutation-resolver-with-extra-long-name.ts",
        "source_line": 42,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54042,
            "category": "resolver",
            "source": "code-signal",
            "detail": "GraphQL resolver signal",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 4004,
        "kind": "graphql_surface",
        "key": "GraphQL client",
        "value": "GraphQL client call signal",
        "source_path": "src/ui/graphql/customer-invoice-dashboard-query-client-with-extra-long-hook-name.tsx",
        "source_line": 118,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54118,
            "category": "client",
            "source": "code-signal",
            "detail": "GraphQL client call signal",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 4005,
        "kind": "graphql_surface",
        "key": "GraphQL",
        "value": "GraphQL endpoint/config signal; value not stored",
        "source_path": ".env.example",
        "source_line": 14,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54140,
            "category": "endpoint",
            "source": "environment-name",
            "detail": "GraphQL endpoint/config signal; value not stored",
            "provenance": {"source": "parsed-source"},
        },
    },
]

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
    GRAPHQL_FACTS[0],
]

OVERVIEW = {
    "repo_id": 982,
    "total_files": 352,
    "total_symbols": 1410,
    "languages": [{"language": "TypeScript", "file_count": 268, "line_count": 46000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 268, "line_count": 46000}],
    "modules": [{"path": "src/graphql", "file_count": 18, "line_count": 5200, "symbol_count": 172, "languages": ["GraphQL", "TypeScript"], "sample_files": ["src/graphql/schema.graphql"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 140}],
    "doc_sections": [],
    "configs": [{"path": ".env.example", "kind": "config", "detail": "Environment template", "total_lines": 52}],
    "tests": [{"path": "tests/graphql.test.ts", "kind": "test", "detail": "test source", "total_lines": 88}],
    "entry_points": [{"path": "src/app.ts", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 180}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "npm", "source_path": "package.json", "dependency_count": 31, "dev_dependency_count": 0, "detail": "package.json"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "tests"}],
    "dependencies": [],
    "stack_components": [],
    "service_integrations": [],
    "graphql_surfaces": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in GRAPHQL_FACTS
    ],
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
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 1330, "class": 80},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 1410, "total_files": 352, "functions": 1330, "classes": 80, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/982/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/982/facts":
        facts = GRAPHQL_FACTS if query.get("kind") == ["graphql_surface"] else ALL_FACTS
        return {"repo_id": 982, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/982/relationships":
        return {"repo_id": 982, "total": 0, "relationships": []}
    return None


def scan_layout(page):
    return page.evaluate(
        """
        () => {
          const out = [];
          const de = document.documentElement;
          const vw = de.clientWidth;
          if (de.scrollWidth > vw + 1) out.push(`h-overflow:${de.scrollWidth}>${vw}`);
          const controls = document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role="button"], [onclick]');
          for (const el of controls) {
            const s = getComputedStyle(el);
            if (el.hidden || s.display === 'none' || s.visibility === 'hidden') continue;
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
    page.get_by_text("Apollo Server - server").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="GraphQL").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Apollo Server", exact=True).first.wait_for(timeout=10000)
    facts.get_by_text("GraphQL root operation type").wait_for(timeout=10000)
    facts.get_by_text("GraphQL resolver signal").wait_for(timeout=10000)
    facts.get_by_text("src/ui/graphql/customer-invoice-dashboard-query-client-with-extra-long-hook-name.tsx:118").wait_for(timeout=10000)
    facts.get_by_text("GraphQL endpoint/config signal; value not stored").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("GraphQL filter still shows stale runbook fact")
    if page.get_by_text("https://graphql.example/should_not_be_rendered_982").count() != 0:
        raise AssertionError("Raw GraphQL endpoint sample rendered")
    if page.get_by_text("apollo_should_not_be_rendered_982").count() != 0:
        raise AssertionError("Raw Apollo key sample rendered")
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

    graphql_requests = [url for url in requests if "/facts" in url and "kind=graphql_surface" in url]
    if len(graphql_requests) < len(VIEWPORTS):
        failures["graphql_surface_requests"] = [f"expected GraphQL fact request per viewport, got {len(graphql_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"graphql_surface_fact_requests={len(graphql_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("GraphQL facts filter UI check passed")


if __name__ == "__main__":
    main()
