from pathlib import Path
from urllib.parse import urlparse

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
    "phone-small": "language-breadth-phone-320.png",
    "laptop": "language-breadth-laptop-1366.png",
    "ultrawide": "language-breadth-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "language-breadth"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 992,
    "name": "language-breadth-fixture-with-generic-searchable-languages",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "language992",
    "storage_path": "/tmp/codesniff/language-breadth",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 31000177,
    "total_symbols": 420,
    "total_files": 210,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

OVERVIEW = {
    "repo_id": 992,
    "total_files": 210,
    "total_symbols": 420,
    "languages": [
        {"language": "TypeScript", "file_count": 18, "line_count": 7000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "Terraform", "file_count": 9, "line_count": 2400, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "HCL", "file_count": 4, "line_count": 2100, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "GraphQL", "file_count": 3, "line_count": 2000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "Protocol Buffers", "file_count": 4, "line_count": 1900, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "PowerShell", "file_count": 4, "line_count": 1850, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "Scala", "file_count": 7, "line_count": 1800, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "Lua", "file_count": 6, "line_count": 1700, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "Dart", "file_count": 5, "line_count": 1650, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "Elixir", "file_count": 5, "line_count": 1600, "support_level": "searchable", "symbol_aware": False, "searchable": True},
        {"language": "Swift", "file_count": 4, "line_count": 1400, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "Just", "file_count": 1, "line_count": 300, "support_level": "searchable", "symbol_aware": False, "searchable": True},
        {"language": "Objective-C++", "file_count": 2, "line_count": 900, "support_level": "searchable", "symbol_aware": False, "searchable": True},
    ],
    "top_directories": [{"path": "src", "file_count": 35, "line_count": 9000}],
    "modules": [
        {
            "path": "src",
            "file_count": 35,
            "line_count": 9000,
            "symbol_count": 180,
            "languages": ["TypeScript", "Terraform", "HCL", "GraphQL", "Protocol Buffers", "PowerShell", "Scala", "Lua", "Dart", "Swift"],
            "sample_files": ["src/App.tsx"],
        }
    ],
    "module_dependencies": [],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "architecture_decisions": [],
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
    "index_fallbacks": [],
    "route_endpoints": [],
    "import_relationships": [],
    "migration_facts": [],
    "search_quality_cases": [],
    "search_quality_baseline": None,
    "symbol_types": {"function": 300, "class": 120},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    path = urlparse(url).path
    if path == "/api/codesniff/stats":
        return {
            "total_symbols": 420,
            "total_files": 210,
            "functions": 300,
            "classes": 120,
            "vector_count": 0,
            "ready": True,
            "lexical_ready": True,
            "semantic_ready": False,
            "index_status": "lexical_ready",
        }
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/992/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/992/facts":
        return {"repo_id": 992, "total": 0, "facts": []}
    if path == "/api/codesniff/repos/992/relationships":
        return {"repo_id": 992, "total": 0, "relationships": []}
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
    for label in ["TypeScript: 18", "Terraform: 9", "HCL: 4", "GraphQL: 3", "Protocol Buffers: 4", "PowerShell: 4"]:
        page.get_by_text(label).wait_for(timeout=10000)

    badges = page.locator("[data-ui='language-support']")
    if badges.filter(has_text="Symbols").count() != 6:
        raise AssertionError("expected TypeScript, Terraform, HCL, GraphQL, Protocol Buffers, and PowerShell symbol-aware language badges")

    page.locator("[data-ui='language-filter']").click()
    for option in ["Just", "Terraform", "HCL", "GraphQL", "Scala", "Lua", "Dart", "Swift", "Objective-C++", "Protocol Buffers", "PowerShell"]:
        page.get_by_role("button", name=option).last.wait_for(timeout=10000)

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

    overview_requests = [url for url in requests if url.endswith("/repos/992/overview")]
    if len(overview_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected overview request per viewport, got {len(overview_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"language_overview_requests={len(overview_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("Language breadth UI check passed")


if __name__ == "__main__":
    main()
