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
    "phone-small": "test-system-phone-320.png",
    "laptop": "test-system-laptop-1366.png",
    "ultrawide": "test-system-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "test-system-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 970,
    "name": "test-system-fixture-with-long-cross-language-test-runners",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "test970",
    "storage_path": "/tmp/codesniff/test-system-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 25000177,
    "total_symbols": 300,
    "total_files": 120,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

TEST_SYSTEM_FACTS = [
    {
        "id": 9700,
        "kind": "test_system",
        "key": "Vitest:script:test:contract-and-accessibility-regression-suite",
        "value": "npm run test:contract-and-accessibility-regression-suite",
        "source_path": "package.json",
        "source_line": 8,
        "confidence": "heuristic",
        "metadata": {
            "rank": 32038,
            "tool": "Vitest",
            "category": "script",
            "name": "test:contract-and-accessibility-regression-suite",
            "command": "npm run test:contract-and-accessibility-regression-suite",
            "source": "package-scripts",
            "detail": "vitest run --config strict.vitest.config.ts --coverage",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9701,
        "kind": "test_system",
        "key": "Playwright:config:playwright.reconciliation-browser-matrix.config.ts",
        "value": "npx playwright test",
        "source_path": "playwright.reconciliation-browser-matrix.config.ts",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 32011,
            "tool": "Playwright",
            "category": "config",
            "name": "playwright.reconciliation-browser-matrix.config.ts",
            "command": "npx playwright test",
            "source": "js-test-config",
            "detail": "Playwright configuration file",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9702,
        "kind": "test_system",
        "key": "pytest:config:tool.pytest",
        "value": "pytest",
        "source_path": "pyproject.toml",
        "source_line": 17,
        "confidence": "heuristic",
        "metadata": {
            "rank": 32027,
            "tool": "pytest",
            "category": "config",
            "name": "tool.pytest",
            "command": "pytest",
            "source": "pyproject-pytest",
            "detail": "pyproject pytest configuration",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9703,
        "kind": "test_system",
        "key": "Bazel:target://services/payments/reconciliation:billing_contract_reconciliation_integration_test",
        "value": "bazel test //services/payments/reconciliation:billing_contract_reconciliation_integration_test",
        "source_path": "services/payments/reconciliation/BUILD.bazel",
        "source_line": 3,
        "confidence": "heuristic",
        "metadata": {
            "rank": 32043,
            "tool": "Bazel",
            "category": "target",
            "name": "//services/payments/reconciliation:billing_contract_reconciliation_integration_test",
            "command": "bazel test //services/payments/reconciliation:billing_contract_reconciliation_integration_test",
            "source": "py_test",
            "detail": "Bazel py_test target",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9704,
        "kind": "test_system",
        "key": ".NET test:project:Billing.Reconciliation.Contract.Tests",
        "value": "dotnet test src/Billing.Reconciliation.Contract.Tests/Billing.Reconciliation.Contract.Tests.csproj",
        "source_path": "src/Billing.Reconciliation.Contract.Tests/Billing.Reconciliation.Contract.Tests.csproj",
        "source_line": 4,
        "confidence": "heuristic",
        "metadata": {
            "rank": 32064,
            "tool": ".NET test",
            "category": "project",
            "name": "Billing.Reconciliation.Contract.Tests",
            "command": "dotnet test src/Billing.Reconciliation.Contract.Tests/Billing.Reconciliation.Contract.Tests.csproj",
            "source": "dotnet-test-project",
            "detail": ".NET test project",
            "provenance": {"source": "parsed-source"},
        },
    },
]

ALL_FACTS = [
    {
        "id": 1,
        "kind": "runbook_command",
        "key": "test",
        "value": "npm test",
        "source_path": "package.json",
        "source_line": None,
        "confidence": "derived",
        "metadata": {"rank": 20000, "provenance": {"source": "manifest"}},
    },
    TEST_SYSTEM_FACTS[0],
]

OVERVIEW = {
    "repo_id": 970,
    "total_files": 120,
    "total_symbols": 300,
    "languages": [{"language": "TypeScript", "file_count": 45, "line_count": 9000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 30, "line_count": 5000}],
    "modules": [{"path": "src", "file_count": 30, "line_count": 5000, "symbol_count": 130, "languages": ["TypeScript"], "sample_files": ["src/App.tsx"]}],
    "module_dependencies": [],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "configs": [],
    "tests": [],
    "entry_points": [{"path": "src/App.tsx", "kind": "entry_point", "detail": "app entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "npm test", "source_path": "package.json", "detail": "vitest run"}],
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
    "ci_workflows": [],
    "container_services": [],
    "runtime_requirements": [],
    "api_contracts": [],
    "cli_commands": [],
    "test_systems": [
        {
            "name": fact["metadata"]["name"],
            "category": fact["metadata"]["category"],
            "tool": fact["metadata"]["tool"],
            "command": fact["metadata"]["command"],
            "source_path": fact["source_path"],
            "line": fact["source_line"] or 1,
            "source": fact["metadata"]["source"],
            "detail": fact["metadata"]["detail"],
        }
        for fact in TEST_SYSTEM_FACTS
    ],
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
    "index_fallbacks": [],
    "route_endpoints": [],
    "import_relationships": [],
    "migration_facts": [],
    "search_quality_cases": [],
    "search_quality_baseline": None,
    "symbol_types": {"function": 230, "class": 70},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 300, "total_files": 120, "functions": 230, "classes": 70, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/970/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/970/facts":
        facts = TEST_SYSTEM_FACTS if query.get("kind") == ["test_system"] else ALL_FACTS
        return {"repo_id": 970, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/970/relationships":
        return {"repo_id": 970, "total": 0, "relationships": []}
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
    page.locator("[data-ui='repo-facts']").get_by_text("npm test").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Tests").first.click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Vitest:script:test:contract-and-accessibility-regression-suite").wait_for(timeout=10000)
    facts.get_by_text("Playwright:config:playwright.reconciliation-browser-matrix.config.ts").wait_for(timeout=10000)
    facts.get_by_text("pytest:config:tool.pytest").wait_for(timeout=10000)
    facts.get_by_text("Bazel:target://services/payments/reconciliation:billing_contract_reconciliation_integration_test").wait_for(timeout=10000)
    facts.get_by_text(".NET test:project:Billing.Reconciliation.Contract.Tests").wait_for(timeout=10000)
    facts.get_by_text("services/payments/reconciliation/BUILD.bazel:3").wait_for(timeout=10000)
    if facts.get_by_text("npm test").count() != 0:
        raise AssertionError("Tests filter still shows stale runbook fact")
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

    test_requests = [url for url in requests if "/facts" in url and "kind=test_system" in url]
    if len(test_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected Tests fact request per viewport, got {len(test_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"test_system_fact_requests={len(test_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("Test system facts UI check passed")


if __name__ == "__main__":
    main()
