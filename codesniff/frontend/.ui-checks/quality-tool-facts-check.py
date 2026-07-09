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
    "phone-small": "quality-tool-phone-320.png",
    "laptop": "quality-tool-laptop-1366.png",
    "ultrawide": "quality-tool-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "quality-tool-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 990,
    "name": "quality-tool-fixture-with-long-lint-format-typecheck-static-analysis",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "quality990",
    "storage_path": "/tmp/codesniff/quality-tool-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 27000177,
    "total_symbols": 340,
    "total_files": 140,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

QUALITY_TOOL_FACTS = [
    {
        "id": 9900,
        "kind": "quality_tool",
        "key": "ESLint:script:lint-typescript-workspace-with-long-paths-and-zero-warning-budget",
        "value": "npm run lint-typescript-workspace-with-long-paths-and-zero-warning-budget",
        "source_path": "package.json",
        "source_line": 8,
        "confidence": "heuristic",
        "metadata": {
            "rank": 31008,
            "tool": "ESLint",
            "category": "script",
            "name": "lint-typescript-workspace-with-long-paths-and-zero-warning-budget",
            "command": "npm run lint-typescript-workspace-with-long-paths-and-zero-warning-budget",
            "source": "package-scripts",
            "detail": "eslint packages apps --max-warnings=0",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9901,
        "kind": "quality_tool",
        "key": "Ruff:linter config:tool.ruff",
        "value": "ruff check .",
        "source_path": "pyproject.toml",
        "source_line": 5,
        "confidence": "heuristic",
        "metadata": {
            "rank": 31055,
            "tool": "Ruff",
            "category": "linter config",
            "name": "tool.ruff",
            "command": "ruff check .",
            "source": "pyproject-ruff",
            "detail": "pyproject Ruff configuration",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9902,
        "kind": "quality_tool",
        "key": "TypeScript:typecheck config:tsconfig.strictest.json",
        "value": "npx tsc --noEmit -p tsconfig.strictest.json",
        "source_path": "tsconfig.strictest.json",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 31071,
            "tool": "TypeScript",
            "category": "typecheck config",
            "name": "tsconfig.strictest.json",
            "command": "npx tsc --noEmit -p tsconfig.strictest.json",
            "source": "tsconfig",
            "detail": "TypeScript compiler configuration",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9903,
        "kind": "quality_tool",
        "key": "PHPStan:static analysis config:phpstan.neon",
        "value": "vendor/bin/phpstan analyse",
        "source_path": "phpstan.neon",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 31081,
            "tool": "PHPStan",
            "category": "static analysis config",
            "name": "phpstan.neon",
            "command": "vendor/bin/phpstan analyse",
            "source": "phpstan.neon",
            "detail": "PHPStan configuration with a deliberately long baseline include path",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9904,
        "kind": "quality_tool",
        "key": "pre-commit:hook config:.pre-commit-config",
        "value": "pre-commit run --all-files",
        "source_path": ".pre-commit-config.yaml",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 31091,
            "tool": "pre-commit",
            "category": "hook config",
            "name": ".pre-commit-config",
            "command": "pre-commit run --all-files",
            "source": "precommit-config",
            "detail": "pre-commit hook configuration",
            "provenance": {"source": "parsed-source"},
        },
    },
]

ALL_FACTS = [
    {
        "id": 1,
        "kind": "runbook_command",
        "key": "build",
        "value": "npm run build",
        "source_path": "package.json",
        "source_line": None,
        "confidence": "derived",
        "metadata": {"rank": 20000, "provenance": {"source": "manifest"}},
    },
    QUALITY_TOOL_FACTS[0],
]

OVERVIEW = {
    "repo_id": 990,
    "total_files": 140,
    "total_symbols": 340,
    "languages": [{"language": "TypeScript", "file_count": 50, "line_count": 10000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 35, "line_count": 6000}],
    "modules": [{"path": "src", "file_count": 35, "line_count": 6000, "symbol_count": 150, "languages": ["TypeScript"], "sample_files": ["src/App.tsx"]}],
    "module_dependencies": [],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "configs": [],
    "tests": [],
    "entry_points": [{"path": "src/App.tsx", "kind": "entry_point", "detail": "app entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "build", "name": "build", "command": "npm run build", "source_path": "package.json", "detail": "vite build"}],
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
    "test_systems": [],
    "release_processes": [],
    "quality_tools": [
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
        for fact in QUALITY_TOOL_FACTS
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
    "symbol_types": {"function": 250, "class": 90},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 340, "total_files": 140, "functions": 250, "classes": 90, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/990/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/990/facts":
        facts = QUALITY_TOOL_FACTS if query.get("kind") == ["quality_tool"] else ALL_FACTS
        return {"repo_id": 990, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/990/relationships":
        return {"repo_id": 990, "total": 0, "relationships": []}
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
    page.locator("[data-ui='repo-facts']").get_by_text("npm run build").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Checks").first.click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("ESLint:script:lint-typescript-workspace-with-long-paths-and-zero-warning-budget").wait_for(timeout=10000)
    facts.get_by_text("Ruff:linter config:tool.ruff").wait_for(timeout=10000)
    facts.get_by_text("TypeScript:typecheck config:tsconfig.strictest.json").wait_for(timeout=10000)
    facts.get_by_text("PHPStan:static analysis config:phpstan.neon").wait_for(timeout=10000)
    facts.get_by_text("pre-commit:hook config:.pre-commit-config").wait_for(timeout=10000)
    facts.get_by_text("package.json:8").wait_for(timeout=10000)
    facts.get_by_text(".pre-commit-config.yaml:1").wait_for(timeout=10000)
    if facts.get_by_text("npm run build").count() != 0:
        raise AssertionError("Checks filter still shows stale runbook fact")
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

    quality_requests = [url for url in requests if "/facts" in url and "kind=quality_tool" in url]
    if len(quality_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected Checks fact request per viewport, got {len(quality_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"quality_tool_fact_requests={len(quality_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("Quality tool facts UI check passed")


if __name__ == "__main__":
    main()
