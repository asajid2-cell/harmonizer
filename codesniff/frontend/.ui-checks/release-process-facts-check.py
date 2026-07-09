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
    "phone-small": "release-process-phone-320.png",
    "laptop": "release-process-laptop-1366.png",
    "ultrawide": "release-process-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "release-process-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 980,
    "name": "release-process-fixture-with-long-publish-versioning-automation",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "release980",
    "storage_path": "/tmp/codesniff/release-process-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 26000177,
    "total_symbols": 320,
    "total_files": 130,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

RELEASE_PROCESS_FACTS = [
    {
        "id": 9800,
        "kind": "release_process",
        "key": "semantic-release:script:release-production-with-contract-audit-and-long-channel-name",
        "value": "npm run release-production-with-contract-audit-and-long-channel-name",
        "source_path": "package.json",
        "source_line": 9,
        "confidence": "heuristic",
        "metadata": {
            "rank": 34069,
            "tool": "semantic-release",
            "category": "script",
            "name": "release-production-with-contract-audit-and-long-channel-name",
            "command": "npm run release-production-with-contract-audit-and-long-channel-name",
            "source": "package-scripts",
            "detail": "semantic-release --branches main,next --ci",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9801,
        "kind": "release_process",
        "key": "Release Please:config:release-please-config.json",
        "value": "packages: ., packages/ledger-reconciliation-worker",
        "source_path": "release-please-config.json",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 34051,
            "tool": "Release Please",
            "category": "config",
            "name": "release-please-config.json",
            "command": "release-please",
            "source": "release-please-config",
            "detail": "packages: ., packages/ledger-reconciliation-worker",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9802,
        "kind": "release_process",
        "key": "GoReleaser:config:billingctl-reconciliation-release-binary",
        "value": "goreleaser release",
        "source_path": ".goreleaser.yml",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 34052,
            "tool": "GoReleaser",
            "category": "config",
            "name": "billingctl-reconciliation-release-binary",
            "command": "goreleaser release",
            "source": "goreleaser-config",
            "detail": "Homebrew tap; Docker image release; Linux package release",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9803,
        "kind": "release_process",
        "key": "PyPI:publish action:PyPI",
        "value": "PyPI publish action",
        "source_path": ".github/workflows/release-production.yml",
        "source_line": 21,
        "confidence": "heuristic",
        "metadata": {
            "rank": 34025,
            "tool": "PyPI",
            "category": "publish action",
            "name": "PyPI",
            "command": "",
            "source": "workflow-signal",
            "detail": "PyPI publish action",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9804,
        "kind": "release_process",
        "key": "Cargo:registry:billing-reconciliation-rust-crate",
        "value": "cargo publish",
        "source_path": "crates/billing-reconciliation/Cargo.toml",
        "source_line": 4,
        "confidence": "heuristic",
        "metadata": {
            "rank": 34134,
            "tool": "Cargo",
            "category": "registry",
            "name": "billing-reconciliation-rust-crate",
            "command": "cargo publish",
            "source": "cargo-publish",
            "detail": "Cargo publish setting ['crates-io']",
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
    RELEASE_PROCESS_FACTS[0],
]

OVERVIEW = {
    "repo_id": 980,
    "total_files": 130,
    "total_symbols": 320,
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
    "release_processes": [
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
        for fact in RELEASE_PROCESS_FACTS
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
    "symbol_types": {"function": 240, "class": 80},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 320, "total_files": 130, "functions": 240, "classes": 80, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/980/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/980/facts":
        facts = RELEASE_PROCESS_FACTS if query.get("kind") == ["release_process"] else ALL_FACTS
        return {"repo_id": 980, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/980/relationships":
        return {"repo_id": 980, "total": 0, "relationships": []}
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
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Release").first.click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("semantic-release:script:release-production-with-contract-audit-and-long-channel-name").wait_for(timeout=10000)
    facts.get_by_text("Release Please:config:release-please-config.json").wait_for(timeout=10000)
    facts.get_by_text("GoReleaser:config:billingctl-reconciliation-release-binary").wait_for(timeout=10000)
    facts.get_by_text("PyPI:publish action:PyPI").wait_for(timeout=10000)
    facts.get_by_text("Cargo:registry:billing-reconciliation-rust-crate").wait_for(timeout=10000)
    facts.get_by_text(".github/workflows/release-production.yml:21").wait_for(timeout=10000)
    if facts.get_by_text("npm run build").count() != 0:
        raise AssertionError("Release filter still shows stale runbook fact")
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

    release_requests = [url for url in requests if "/facts" in url and "kind=release_process" in url]
    if len(release_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected Release fact request per viewport, got {len(release_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"release_process_fact_requests={len(release_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("Release process facts UI check passed")


if __name__ == "__main__":
    main()
