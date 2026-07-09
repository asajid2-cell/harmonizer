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
    "phone-small": "supply-chain-phone-320.png",
    "laptop": "supply-chain-laptop-1366.png",
    "ultrawide": "supply-chain-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "supply-chain-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 933,
    "name": "supply-chain-fixture-with-long-security-controls",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "supply933",
    "storage_path": "/tmp/codesniff/supply-chain-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 25000177,
    "total_symbols": 512,
    "total_files": 120,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

SUPPLY_FACTS = [
    {
        "id": 920,
        "kind": "supply_chain",
        "key": "lockfile:npm:package-lock.json",
        "value": "npm dependency lockfile",
        "source_path": "package-lock.json",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59001,
            "category": "lockfile",
            "tool": "npm",
            "ecosystem": "JavaScript/TypeScript",
            "source": "lockfile",
            "detail": "npm dependency lockfile",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 921,
        "kind": "supply_chain",
        "key": "dependency automation:Dependabot:Dependabot npm",
        "value": "Dependabot updates npm in / on a weekly schedule",
        "source_path": ".github/dependabot.yml",
        "source_line": 3,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59013,
            "category": "dependency automation",
            "tool": "Dependabot",
            "ecosystem": "JavaScript/TypeScript",
            "source": "config",
            "detail": "Dependabot updates npm in / on a weekly schedule",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 922,
        "kind": "supply_chain",
        "key": "security scan:CodeQL:CodeQL",
        "value": "GitHub CodeQL workflow",
        "source_path": ".github/workflows/security-and-dependency-review-with-long-name.yml",
        "source_line": 7,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59037,
            "category": "security scan",
            "tool": "CodeQL",
            "ecosystem": "multi",
            "source": "workflow",
            "detail": "GitHub CodeQL workflow",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 923,
        "kind": "supply_chain",
        "key": "dependency review:Dependency Review:Dependency Review",
        "value": "GitHub dependency review workflow",
        "source_path": ".github/workflows/security-and-dependency-review-with-long-name.yml",
        "source_line": 9,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59029,
            "category": "dependency review",
            "tool": "Dependency Review",
            "ecosystem": "multi",
            "source": "workflow",
            "detail": "GitHub dependency review workflow",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 924,
        "kind": "supply_chain",
        "key": "sbom:SPDX:frontend-platform-super-long-sbom.spdx.json",
        "value": "Software bill of materials file",
        "source_path": "security/frontend-platform-super-long-sbom.spdx.json",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59071,
            "category": "sbom",
            "tool": "SPDX",
            "ecosystem": "multi",
            "source": "sbom",
            "detail": "Software bill of materials file",
            "provenance": {"source": "parsed-source"},
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
    SUPPLY_FACTS[0],
]

OVERVIEW = {
    "repo_id": 933,
    "total_files": 120,
    "total_symbols": 512,
    "languages": [{"language": "TypeScript", "file_count": 90, "line_count": 12000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 70, "line_count": 8000}],
    "modules": [{"path": "src", "file_count": 70, "line_count": 8000, "symbol_count": 400, "languages": ["TypeScript"], "sample_files": ["src/main.ts"]}],
    "module_dependencies": [],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 40}],
    "doc_sections": [],
    "configs": [{"path": "package.json", "kind": "config", "detail": "npm package manifest", "total_lines": 20}],
    "tests": [],
    "entry_points": [{"path": "src/main.ts", "kind": "entry_point", "detail": "app entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "npm", "source_path": "package.json", "dependency_count": 5, "dev_dependency_count": 3, "detail": "npm manifest"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pnpm test", "source_path": "package.json", "detail": "vitest run"}],
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
    "repo_policies": [],
    "code_owners": [],
    "deploy_targets": [],
    "supply_chain": [
        {
            "name": fact["metadata"]["tool"],
            "category": fact["metadata"]["category"],
            "tool": fact["metadata"]["tool"],
            "ecosystem": fact["metadata"]["ecosystem"],
            "source_path": fact["source_path"],
            "line": fact["source_line"] or 1,
            "source": fact["metadata"]["source"],
            "detail": fact["metadata"]["detail"],
        }
        for fact in SUPPLY_FACTS
    ],
    "secret_signals": [],
    "index_fallbacks": [],
    "route_endpoints": [],
    "import_relationships": [],
    "migration_facts": [],
    "search_quality_cases": [],
    "search_quality_baseline": None,
    "symbol_types": {"function": 400, "class": 112},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 512, "total_files": 120, "functions": 400, "classes": 112, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/933/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/933/facts":
        facts = SUPPLY_FACTS if query.get("kind") == ["supply_chain"] else ALL_FACTS
        return {"repo_id": 933, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/933/relationships":
        return {"repo_id": 933, "total": 0, "relationships": []}
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
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Supply").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("lockfile:npm:package-lock.json").wait_for(timeout=10000)
    facts.get_by_text("dependency automation:Dependabot:Dependabot npm").wait_for(timeout=10000)
    facts.get_by_text("security scan:CodeQL:CodeQL").wait_for(timeout=10000)
    facts.get_by_text("dependency review:Dependency Review:Dependency Review").wait_for(timeout=10000)
    facts.get_by_text("sbom:SPDX:frontend-platform-super-long-sbom.spdx.json").wait_for(timeout=10000)
    facts.get_by_text(".github/workflows/security-and-dependency-review-with-long-name.yml:7").wait_for(timeout=10000)
    if facts.get_by_text("pnpm test").count() != 0:
        raise AssertionError("Supply filter still shows stale runbook fact")
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

    supply_requests = [url for url in requests if "/facts" in url and "kind=supply_chain" in url]
    if len(supply_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected supply-chain fact request per viewport, got {len(supply_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"supply_chain_fact_requests={len(supply_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("supply-chain facts UI check passed")


if __name__ == "__main__":
    main()
