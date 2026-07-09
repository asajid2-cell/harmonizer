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
    "phone-small": "integration-facts-phone-320.png",
    "laptop": "integration-facts-laptop-1366.png",
    "ultrawide": "integration-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "integration-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 846,
    "name": "external-integration-fixture-with-long-provider-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "integrations846",
    "storage_path": "/tmp/codesniff/integration-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 82828282,
    "total_symbols": 920,
    "total_files": 246,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

INTEGRATION_FACTS = [
    {
        "id": 910,
        "kind": "service_integration",
        "key": "Stripe",
        "value": "Stripe integration signal",
        "source_path": "package.json",
        "source_line": 28,
        "confidence": "heuristic",
        "metadata": {
            "rank": 53028,
            "category": "payment provider",
            "source": "dependency",
            "detail": "Stripe integration signal",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 911,
        "kind": "service_integration",
        "key": "Sentry",
        "value": "Sentry integration signal",
        "source_path": "package.json",
        "source_line": 31,
        "confidence": "heuristic",
        "metadata": {
            "rank": 53031,
            "category": "observability",
            "source": "dependency",
            "detail": "Sentry integration signal",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 912,
        "kind": "service_integration",
        "key": "Redis-cache-provider-with-long-compose-service-name",
        "value": "Redis integration signal; redis:7-alpine",
        "source_path": "docker-compose.yml",
        "source_line": 12,
        "confidence": "heuristic",
        "metadata": {
            "rank": 53012,
            "category": "cache",
            "source": "container-service",
            "detail": "Redis integration signal; redis:7-alpine",
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
    INTEGRATION_FACTS[0],
]

OVERVIEW = {
    "repo_id": 846,
    "total_files": 246,
    "total_symbols": 920,
    "languages": [{"language": "TypeScript", "file_count": 190, "line_count": 31000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 190, "line_count": 31000}],
    "modules": [{"path": "src", "file_count": 190, "line_count": 31000, "symbol_count": 830, "languages": ["TypeScript"], "sample_files": ["src/app/page.tsx"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 90}],
    "doc_sections": [],
    "configs": [{"path": "package.json", "kind": "config", "detail": "npm package manifest", "total_lines": 80}],
    "tests": [{"path": "tests/integrations.test.ts", "kind": "test", "detail": "test source", "total_lines": 48}],
    "entry_points": [{"path": "src/app/page.tsx", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 140}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "pnpm", "source_path": "package.json", "dependency_count": 24, "dev_dependency_count": 10, "detail": "5 scripts"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "stack_components": [],
    "service_integrations": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in INTEGRATION_FACTS
    ],
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
    "symbol_types": {"function": 830, "class": 90},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 920, "total_files": 246, "functions": 830, "classes": 90, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/846/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/846/facts":
        facts = INTEGRATION_FACTS if query.get("kind") == ["service_integration"] else ALL_FACTS
        return {"repo_id": 846, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/846/relationships":
        return {"repo_id": 846, "total": 0, "relationships": []}
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
    page.get_by_text("Stripe - payment provider").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Integrations").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Stripe", exact=True).wait_for(timeout=10000)
    facts.get_by_text("Stripe integration signal").wait_for(timeout=10000)
    facts.get_by_text("Sentry", exact=True).wait_for(timeout=10000)
    facts.get_by_text("Redis-cache-provider-with-long-compose-service-name").wait_for(timeout=10000)
    facts.get_by_text("docker-compose.yml:12").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Integrations filter still shows stale runbook fact")
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

    integration_requests = [url for url in requests if "/facts" in url and "kind=service_integration" in url]
    if len(integration_requests) < len(VIEWPORTS):
        failures["integration_requests"] = [f"expected service-integration fact request per viewport, got {len(integration_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"service_integration_fact_requests={len(integration_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("integration facts filter UI check passed")


if __name__ == "__main__":
    main()
