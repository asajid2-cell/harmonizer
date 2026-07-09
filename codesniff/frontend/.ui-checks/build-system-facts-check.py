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
    "phone-small": "build-system-phone-320.png",
    "laptop": "build-system-laptop-1366.png",
    "ultrawide": "build-system-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "build-system-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 960,
    "name": "build-system-fixture-with-long-targets-and-toolchains",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "build960",
    "storage_path": "/tmp/codesniff/build-system-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 24000177,
    "total_symbols": 280,
    "total_files": 110,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

BUILD_SYSTEM_FACTS = [
    {
        "id": 9600,
        "kind": "build_system",
        "key": "Maven:module:invoice-core-reconciliation-domain-with-long-name",
        "value": "mvn -pl invoice-core-reconciliation-domain-with-long-name test",
        "source_path": "pom.xml",
        "source_line": 7,
        "confidence": "heuristic",
        "metadata": {
            "rank": 33037,
            "tool": "Maven",
            "category": "module",
            "name": "invoice-core-reconciliation-domain-with-long-name",
            "command": "mvn -pl invoice-core-reconciliation-domain-with-long-name test",
            "source": "pom-modules",
            "detail": "Maven reactor module",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9601,
        "kind": "build_system",
        "key": "Gradle:task:generateLedgerReconciliationClientWithExtremelyLongName",
        "value": "./gradlew generateLedgerReconciliationClientWithExtremelyLongName",
        "source_path": "build.gradle.kts",
        "source_line": 12,
        "confidence": "heuristic",
        "metadata": {
            "rank": 33082,
            "tool": "Gradle",
            "category": "task",
            "name": "generateLedgerReconciliationClientWithExtremelyLongName",
            "command": "./gradlew generateLedgerReconciliationClientWithExtremelyLongName",
            "source": "gradle-task",
            "detail": "Gradle task declaration",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9602,
        "kind": "build_system",
        "key": "Bazel:target://services/payments/reconciliation:billing_server_with_long_target_name",
        "value": "bazel build //services/payments/reconciliation:billing_server_with_long_target_name",
        "source_path": "services/payments/reconciliation/BUILD.bazel",
        "source_line": 3,
        "confidence": "heuristic",
        "metadata": {
            "rank": 33043,
            "tool": "Bazel",
            "category": "target",
            "name": "//services/payments/reconciliation:billing_server_with_long_target_name",
            "command": "bazel build //services/payments/reconciliation:billing_server_with_long_target_name",
            "source": "java_binary",
            "detail": "Bazel java_binary target",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9603,
        "kind": "build_system",
        "key": "CMake:executable:ledgerctl_reconciliation_native_tool",
        "value": "cmake --build build --target ledgerctl_reconciliation_native_tool",
        "source_path": "native/CMakeLists.txt",
        "source_line": 5,
        "confidence": "heuristic",
        "metadata": {
            "rank": 33055,
            "tool": "CMake",
            "category": "executable",
            "name": "ledgerctl_reconciliation_native_tool",
            "command": "cmake --build build --target ledgerctl_reconciliation_native_tool",
            "source": "cmake-target",
            "detail": "CMake add_executable target",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9604,
        "kind": "build_system",
        "key": ".NET:project:Billing.Reconciliation.Service",
        "value": "dotnet build src/Billing.Reconciliation.Service/Billing.Reconciliation.Service.csproj",
        "source_path": "src/Billing.Reconciliation.Service/Billing.Reconciliation.Service.csproj",
        "source_line": 4,
        "confidence": "heuristic",
        "metadata": {
            "rank": 33024,
            "tool": ".NET",
            "category": "project",
            "name": "Billing.Reconciliation.Service",
            "command": "dotnet build src/Billing.Reconciliation.Service/Billing.Reconciliation.Service.csproj",
            "source": "dotnet-project",
            "detail": "target net8.0; output Exe",
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
    BUILD_SYSTEM_FACTS[0],
]

OVERVIEW = {
    "repo_id": 960,
    "total_files": 110,
    "total_symbols": 280,
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
    "build_systems": [
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
        for fact in BUILD_SYSTEM_FACTS
    ],
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
    "symbol_types": {"function": 220, "class": 60},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 280, "total_files": 110, "functions": 220, "classes": 60, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/960/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/960/facts":
        facts = BUILD_SYSTEM_FACTS if query.get("kind") == ["build_system"] else ALL_FACTS
        return {"repo_id": 960, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/960/relationships":
        return {"repo_id": 960, "total": 0, "relationships": []}
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
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Build").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Maven:module:invoice-core-reconciliation-domain-with-long-name").wait_for(timeout=10000)
    facts.get_by_text("Gradle:task:generateLedgerReconciliationClientWithExtremelyLongName").wait_for(timeout=10000)
    facts.get_by_text("Bazel:target://services/payments/reconciliation:billing_server_with_long_target_name").wait_for(timeout=10000)
    facts.get_by_text("CMake:executable:ledgerctl_reconciliation_native_tool").wait_for(timeout=10000)
    facts.get_by_text(".NET:project:Billing.Reconciliation.Service").wait_for(timeout=10000)
    facts.get_by_text("services/payments/reconciliation/BUILD.bazel:3").wait_for(timeout=10000)
    if facts.get_by_text("npm test").count() != 0:
        raise AssertionError("Build filter still shows stale runbook fact")
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

    build_requests = [url for url in requests if "/facts" in url and "kind=build_system" in url]
    if len(build_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected Build fact request per viewport, got {len(build_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"build_system_fact_requests={len(build_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("Build system facts UI check passed")


if __name__ == "__main__":
    main()
