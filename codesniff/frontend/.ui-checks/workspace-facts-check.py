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
    "phone-small": "workspace-facts-phone-320.png",
    "laptop": "workspace-facts-laptop-1366.png",
    "ultrawide": "workspace-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "workspace-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 932,
    "name": "workspace-topology-fixture-with-long-monorepo-paths",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "workspace932",
    "storage_path": "/tmp/codesniff/workspace-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 40200177,
    "total_symbols": 2048,
    "total_files": 640,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

WORKSPACE_FACTS = [
    {
        "id": 910,
        "kind": "workspace",
        "key": "pnpm:root:.",
        "value": "package.json workspace root",
        "source_path": "package.json",
        "source_line": 5,
        "confidence": "manifest",
        "metadata": {
            "rank": 35005,
            "name": "workspace-root",
            "path": ".",
            "workspace_kind": "root",
            "ecosystem": "JavaScript/TypeScript",
            "manager": "pnpm",
            "detail": "package.json workspace root",
            "provenance": {"source": "manifest"},
        },
    },
    {
        "id": 911,
        "kind": "workspace",
        "key": "pnpm:package:apps/customer-billing-administration-console-with-long-name",
        "value": "pnpm workspace package pattern",
        "source_path": "pnpm-workspace.yaml",
        "source_line": 3,
        "confidence": "manifest",
        "metadata": {
            "rank": 35013,
            "name": "customer-billing-administration-console-with-long-name",
            "path": "apps/customer-billing-administration-console-with-long-name",
            "workspace_kind": "package",
            "ecosystem": "JavaScript/TypeScript",
            "manager": "pnpm",
            "detail": "pnpm workspace package pattern",
            "provenance": {"source": "manifest"},
        },
    },
    {
        "id": 912,
        "kind": "workspace",
        "key": "nx:project:packages/shared-ui-components-with-long-design-system-name",
        "value": "Nx project root",
        "source_path": "nx.json",
        "source_line": 7,
        "confidence": "manifest",
        "metadata": {
            "rank": 35017,
            "name": "shared-ui",
            "path": "packages/shared-ui-components-with-long-design-system-name",
            "workspace_kind": "project",
            "ecosystem": "JavaScript/TypeScript",
            "manager": "nx",
            "detail": "Nx project root",
            "provenance": {"source": "manifest"},
        },
    },
    {
        "id": 913,
        "kind": "workspace",
        "key": "cargo:member:crates/billing-core-with-long-domain-name",
        "value": "Cargo workspace member",
        "source_path": "Cargo.toml",
        "source_line": 2,
        "confidence": "manifest",
        "metadata": {
            "rank": 35022,
            "name": "billing-core-with-long-domain-name",
            "path": "crates/billing-core-with-long-domain-name",
            "workspace_kind": "member",
            "ecosystem": "Rust",
            "manager": "cargo",
            "detail": "Cargo workspace member",
            "provenance": {"source": "manifest"},
        },
    },
    {
        "id": 914,
        "kind": "workspace",
        "key": "go work:module:services/authentication-api-with-long-name",
        "value": "go.work use module",
        "source_path": "go.work",
        "source_line": 4,
        "confidence": "manifest",
        "metadata": {
            "rank": 35024,
            "name": "authentication-api-with-long-name",
            "path": "services/authentication-api-with-long-name",
            "workspace_kind": "module",
            "ecosystem": "Go",
            "manager": "go work",
            "detail": "go.work use module",
            "provenance": {"source": "manifest"},
        },
    },
]

ALL_FACTS = [
    {
        "id": 1,
        "kind": "runbook_command",
        "key": "test",
        "value": "pnpm test",
        "source_path": "package.json",
        "source_line": None,
        "confidence": "derived",
        "metadata": {"rank": 20000, "provenance": {"source": "manifest"}},
    },
    WORKSPACE_FACTS[0],
]

OVERVIEW = {
    "repo_id": 932,
    "total_files": 640,
    "total_symbols": 2048,
    "languages": [{"language": "TypeScript", "file_count": 510, "line_count": 80000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "apps", "file_count": 200, "line_count": 30000}],
    "modules": [{"path": "apps/customer-billing-administration-console-with-long-name", "file_count": 120, "line_count": 22000, "symbol_count": 900, "languages": ["TypeScript"], "sample_files": ["apps/customer-billing-administration-console-with-long-name/src/main.ts"]}],
    "module_dependencies": [],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 70}],
    "doc_sections": [],
    "configs": [{"path": "package.json", "kind": "config", "detail": "npm package manifest", "total_lines": 40}],
    "tests": [],
    "entry_points": [{"path": "apps/customer-billing-administration-console-with-long-name/src/main.ts", "kind": "entry_point", "detail": "app entry point", "total_lines": 120}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "pnpm", "source_path": "package.json", "dependency_count": 10, "dev_dependency_count": 8, "detail": "4 scripts"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pnpm test", "source_path": "package.json", "detail": "vitest run"}],
    "dependencies": [],
    "workspaces": [
        {
            "name": fact["metadata"]["name"],
            "path": fact["metadata"]["path"],
            "workspace_kind": fact["metadata"]["workspace_kind"],
            "ecosystem": fact["metadata"]["ecosystem"],
            "manager": fact["metadata"]["manager"],
            "source_path": fact["source_path"],
            "line": fact["source_line"] or 1,
            "detail": fact["metadata"]["detail"],
        }
        for fact in WORKSPACE_FACTS
    ],
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
    "symbol_types": {"function": 1800, "class": 248},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 2048, "total_files": 640, "functions": 1800, "classes": 248, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/932/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/932/facts":
        facts = WORKSPACE_FACTS if query.get("kind") == ["workspace"] else ALL_FACTS
        return {"repo_id": 932, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/932/relationships":
        return {"repo_id": 932, "total": 0, "relationships": []}
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
    page.locator("[data-ui='repo-facts']").get_by_text("pnpm test").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Workspaces").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("pnpm:root:.").wait_for(timeout=10000)
    facts.get_by_text("pnpm:package:apps/customer-billing-administration-console-with-long-name").wait_for(timeout=10000)
    facts.get_by_text("nx:project:packages/shared-ui-components-with-long-design-system-name").wait_for(timeout=10000)
    facts.get_by_text("cargo:member:crates/billing-core-with-long-domain-name").wait_for(timeout=10000)
    facts.get_by_text("go work:module:services/authentication-api-with-long-name").wait_for(timeout=10000)
    facts.get_by_text("pnpm-workspace.yaml:3").wait_for(timeout=10000)
    if facts.get_by_text("pnpm test").count() != 0:
        raise AssertionError("Workspace filter still shows stale runbook fact")
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

    workspace_requests = [url for url in requests if "/facts" in url and "kind=workspace" in url]
    if len(workspace_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected workspace fact request per viewport, got {len(workspace_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"workspace_fact_requests={len(workspace_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("workspace facts UI check passed")


if __name__ == "__main__":
    main()
