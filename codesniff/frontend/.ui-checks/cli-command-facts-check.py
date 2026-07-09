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
    "phone-small": "cli-command-phone-320.png",
    "laptop": "cli-command-laptop-1366.png",
    "ultrawide": "cli-command-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "cli-command-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 949,
    "name": "cli-command-fixture-with-long-node-python-go-rust-ruby-executable-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "cli949",
    "storage_path": "/tmp/codesniff/cli-command-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 19000177,
    "total_symbols": 220,
    "total_files": 90,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

CLI_COMMAND_FACTS = [
    {
        "id": 9490,
        "kind": "cli_command",
        "key": "node bin:billing-ledger-reconciliation-with-very-long-command-name",
        "value": "billing-ledger-reconciliation-with-very-long-command-name",
        "source_path": "package.json",
        "source_line": 7,
        "confidence": "heuristic",
        "metadata": {
            "rank": 22007,
            "category": "node bin",
            "name": "billing-ledger-reconciliation-with-very-long-command-name",
            "command": "billing-ledger-reconciliation-with-very-long-command-name",
            "source": "package-bin",
            "detail": "package bin target ./bin/billing-ledger-reconciliation-with-very-long-command-name.js",
            "provenance": {"source": "manifest"},
        },
    },
    {
        "id": 9491,
        "kind": "cli_command",
        "key": "python console script:billing-admin-reconcile-overdue-invoices",
        "value": "billing-admin-reconcile-overdue-invoices",
        "source_path": "pyproject.toml",
        "source_line": 5,
        "confidence": "heuristic",
        "metadata": {
            "rank": 22015,
            "category": "python console script",
            "name": "billing-admin-reconcile-overdue-invoices",
            "command": "billing-admin-reconcile-overdue-invoices",
            "source": "pyproject-scripts",
            "detail": "billing.cli:main",
            "provenance": {"source": "manifest"},
        },
    },
    {
        "id": 9492,
        "kind": "cli_command",
        "key": "go command:reconcile-ledger-backfill-worker",
        "value": "go run ./cmd/reconcile-ledger-backfill-worker",
        "source_path": "cmd/reconcile-ledger-backfill-worker/main.go",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 22041,
            "category": "go command",
            "name": "reconcile-ledger-backfill-worker",
            "command": "go run ./cmd/reconcile-ledger-backfill-worker",
            "source": "go-cmd",
            "detail": "Go command entry point",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9493,
        "kind": "cli_command",
        "key": "rust binary:billing-worker-long-running-reconciler",
        "value": "cargo run --bin billing-worker-long-running-reconciler",
        "source_path": "Cargo.toml",
        "source_line": 9,
        "confidence": "heuristic",
        "metadata": {
            "rank": 22059,
            "category": "rust binary",
            "name": "billing-worker-long-running-reconciler",
            "command": "cargo run --bin billing-worker-long-running-reconciler",
            "source": "cargo-bin",
            "detail": "Cargo binary target src/bin/billing_worker_long_running_reconciler.rs",
            "provenance": {"source": "manifest"},
        },
    },
    {
        "id": 9494,
        "kind": "cli_command",
        "key": "shell executable:export-ledger-with-long-period-range",
        "value": "./bin/export-ledger-with-long-period-range",
        "source_path": "bin/export-ledger-with-long-period-range",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 22071,
            "category": "shell executable",
            "name": "export-ledger-with-long-period-range",
            "command": "./bin/export-ledger-with-long-period-range",
            "source": "shebang",
            "detail": "/usr/bin/env bash",
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
    CLI_COMMAND_FACTS[0],
]

OVERVIEW = {
    "repo_id": 949,
    "total_files": 90,
    "total_symbols": 220,
    "languages": [{"language": "TypeScript", "file_count": 40, "line_count": 8000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 30, "line_count": 5000}],
    "modules": [{"path": "src", "file_count": 30, "line_count": 5000, "symbol_count": 120, "languages": ["TypeScript"], "sample_files": ["src/index.ts"]}],
    "module_dependencies": [],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "configs": [],
    "tests": [],
    "entry_points": [{"path": "src/index.ts", "kind": "entry_point", "detail": "runtime entry point", "total_lines": 80}],
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
    "cli_commands": [
        {
            "name": fact["metadata"]["name"],
            "category": fact["metadata"]["category"],
            "command": fact["metadata"]["command"],
            "source_path": fact["source_path"],
            "line": fact["source_line"] or 1,
            "source": fact["metadata"]["source"],
            "detail": fact["metadata"]["detail"],
        }
        for fact in CLI_COMMAND_FACTS
    ],
    "ui_surfaces": [],
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
    "symbol_types": {"function": 180, "class": 40},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 220, "total_files": 90, "functions": 180, "classes": 40, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/949/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/949/facts":
        facts = CLI_COMMAND_FACTS if query.get("kind") == ["cli_command"] else ALL_FACTS
        return {"repo_id": 949, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/949/relationships":
        return {"repo_id": 949, "total": 0, "relationships": []}
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
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="CLI").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("node bin:billing-ledger-reconciliation-with-very-long-command-name").wait_for(timeout=10000)
    facts.get_by_text("python console script:billing-admin-reconcile-overdue-invoices").wait_for(timeout=10000)
    facts.get_by_text("go command:reconcile-ledger-backfill-worker").wait_for(timeout=10000)
    facts.get_by_text("rust binary:billing-worker-long-running-reconciler").wait_for(timeout=10000)
    facts.get_by_text("shell executable:export-ledger-with-long-period-range").wait_for(timeout=10000)
    facts.get_by_text("bin/export-ledger-with-long-period-range:1").wait_for(timeout=10000)
    if facts.get_by_text("npm test").count() != 0:
        raise AssertionError("CLI filter still shows stale runbook fact")
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

    cli_requests = [url for url in requests if "/facts" in url and "kind=cli_command" in url]
    if len(cli_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected CLI fact request per viewport, got {len(cli_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"cli_command_fact_requests={len(cli_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("CLI command facts UI check passed")


if __name__ == "__main__":
    main()
