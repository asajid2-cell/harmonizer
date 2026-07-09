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
    "phone-small": "dev-environment-phone-320.png",
    "laptop": "dev-environment-laptop-1366.png",
    "ultrawide": "dev-environment-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "dev-environment-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 970,
    "name": "dev-environment-fixture-with-long-setup-tool-labels",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "devenv970",
    "storage_path": "/tmp/codesniff/dev-environment-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 23000177,
    "total_symbols": 270,
    "total_files": 105,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

DEV_ENVIRONMENT_FACTS = [
    {
        "id": 9700,
        "kind": "dev_environment",
        "key": "Dev Containers:dev container:Billing Reconciliation Developer Container With Long Name",
        "value": "image mcr.microsoft.com/devcontainers/python:3.12; compose docker-compose.devcontainer.yml; 3 features",
        "source_path": ".devcontainer/devcontainer.json",
        "source_line": 3,
        "confidence": "heuristic",
        "metadata": {
            "rank": 24003,
            "tool": "Dev Containers",
            "category": "dev container",
            "name": "Billing Reconciliation Developer Container With Long Name",
            "source": "devcontainer-json",
            "detail": "image mcr.microsoft.com/devcontainers/python:3.12; compose docker-compose.devcontainer.yml; 3 features",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9701,
        "kind": "dev_environment",
        "key": "VS Code:editor extension:ms-azuretools.vscode-docker",
        "value": "VS Code recommended extension",
        "source_path": ".vscode/extensions.json",
        "source_line": 4,
        "confidence": "heuristic",
        "metadata": {
            "rank": 24074,
            "tool": "VS Code",
            "category": "editor extension",
            "name": "ms-azuretools.vscode-docker",
            "source": "vscode-recommendations",
            "detail": "VS Code recommended extension",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9702,
        "kind": "dev_environment",
        "key": "Nix:nix shell:flake default",
        "value": "Nix dev shell",
        "source_path": "flake.nix",
        "source_line": 2,
        "confidence": "heuristic",
        "metadata": {
            "rank": 24032,
            "tool": "Nix",
            "category": "nix shell",
            "name": "flake default",
            "source": "nix",
            "detail": "Nix dev shell",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9703,
        "kind": "dev_environment",
        "key": "mise:tool version:node",
        "value": "mise node 22.2.0",
        "source_path": ".mise.toml",
        "source_line": 2,
        "confidence": "heuristic",
        "metadata": {
            "rank": 24052,
            "tool": "mise",
            "category": "tool version",
            "name": "node",
            "source": "mise-tools",
            "detail": "mise node 22.2.0",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9704,
        "kind": "dev_environment",
        "key": "Skaffold:cluster dev loop:billing-reconciliation-skaffold-local-workflow-with-long-name",
        "value": "Skaffold local Kubernetes workflow",
        "source_path": "skaffold.yaml",
        "source_line": 4,
        "confidence": "heuristic",
        "metadata": {
            "rank": 24114,
            "tool": "Skaffold",
            "category": "cluster dev loop",
            "name": "billing-reconciliation-skaffold-local-workflow-with-long-name",
            "source": "skaffold-yaml",
            "detail": "Skaffold local Kubernetes workflow",
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
    DEV_ENVIRONMENT_FACTS[0],
]

OVERVIEW = {
    "repo_id": 970,
    "total_files": 105,
    "total_symbols": 270,
    "languages": [{"language": "TypeScript", "file_count": 44, "line_count": 8800, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
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
    "dev_environments": [
        {
            "name": fact["metadata"]["name"],
            "category": fact["metadata"]["category"],
            "tool": fact["metadata"]["tool"],
            "source_path": fact["source_path"],
            "line": fact["source_line"] or 1,
            "source": fact["metadata"]["source"],
            "detail": fact["metadata"]["detail"],
        }
        for fact in DEV_ENVIRONMENT_FACTS
    ],
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
    "symbol_types": {"function": 210, "class": 60},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 270, "total_files": 105, "functions": 210, "classes": 60, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/970/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/970/facts":
        facts = DEV_ENVIRONMENT_FACTS if query.get("kind") == ["dev_environment"] else ALL_FACTS
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
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Dev Env").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Dev Containers:dev container:Billing Reconciliation Developer Container With Long Name").wait_for(timeout=10000)
    facts.get_by_text("VS Code:editor extension:ms-azuretools.vscode-docker").wait_for(timeout=10000)
    facts.get_by_text("Nix:nix shell:flake default").wait_for(timeout=10000)
    facts.get_by_text("mise:tool version:node").wait_for(timeout=10000)
    facts.get_by_text("Skaffold:cluster dev loop:billing-reconciliation-skaffold-local-workflow-with-long-name").wait_for(timeout=10000)
    facts.get_by_text(".devcontainer/devcontainer.json:3").wait_for(timeout=10000)
    if facts.get_by_text("npm test").count() != 0:
        raise AssertionError("Dev Env filter still shows stale runbook fact")
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

    dev_env_requests = [url for url in requests if "/facts" in url and "kind=dev_environment" in url]
    if len(dev_env_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected Dev Env fact request per viewport, got {len(dev_env_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"dev_environment_fact_requests={len(dev_env_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("Dev environment facts UI check passed")


if __name__ == "__main__":
    main()
