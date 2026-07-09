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
    "phone-small": "index-fallback-phone-320.png",
    "laptop": "index-fallback-laptop-1366.png",
    "ultrawide": "index-fallback-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "index-fallback"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 986,
    "name": "pathological-fallback-fixture-with-long-generated-source-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "fallback986",
    "storage_path": "/tmp/codesniff/index-fallback",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 81818181,
    "total_symbols": 614,
    "total_files": 144,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

FALLBACKS = [
    {
        "path": "src/generated/customer-invoice-billing-ledger-with-a-very-long-path/huge-client-types.generated.ts",
        "reason": "source file is 1842048 bytes, above the 1000000 byte symbol-parse limit",
        "total_lines": 32440,
    },
    {
        "path": "schemas/analytics/exported-reporting-schema-with-a-long-name.graphql",
        "reason": "generic file is 1200044 bytes, above the 1000000 byte chunking limit",
        "total_lines": 18020,
    },
]

INDEX_FACTS = [
    {
        "id": 8101,
        "kind": "index_fallback",
        "key": item["path"],
        "value": item["reason"],
        "source_path": item["path"],
        "source_line": None,
        "confidence": "bounded",
        "metadata": {
            "rank": 12000 + idx,
            "total_lines": item["total_lines"],
            "reason": item["reason"],
            "provenance": {"source": "indexed-metadata"},
        },
    }
    for idx, item in enumerate(FALLBACKS)
]

ALL_FACTS = [
    {
        "id": 1,
        "kind": "runbook_command",
        "key": "test",
        "value": "pytest tests",
        "source_path": "pyproject.toml",
        "source_line": None,
        "confidence": "derived",
        "metadata": {"rank": 20000, "provenance": {"source": "manifest"}},
    },
    INDEX_FACTS[0],
]

OVERVIEW = {
    "repo_id": 986,
    "total_files": 144,
    "total_symbols": 614,
    "languages": [
        {"language": "TypeScript", "file_count": 96, "line_count": 42000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "GraphQL", "file_count": 7, "line_count": 19000, "support_level": "searchable", "symbol_aware": False, "searchable": True},
    ],
    "top_directories": [{"path": "src", "file_count": 96, "line_count": 42000}],
    "modules": [{"path": "src/generated/customer-invoice-billing-ledger-with-a-very-long-path", "file_count": 4, "line_count": 35000, "symbol_count": 4, "languages": ["TypeScript"], "sample_files": [FALLBACKS[0]["path"]]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "configs": [{"path": "pyproject.toml", "kind": "config", "detail": "Python project manifest", "total_lines": 42}],
    "tests": [{"path": "tests/test_index_fallbacks.py", "kind": "test", "detail": "test source", "total_lines": 64}],
    "entry_points": [{"path": "src/main.ts", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 180}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest tests", "source_path": "pyproject.toml", "detail": "tests"}],
    "dependencies": [],
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
    "index_fallbacks": FALLBACKS,
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 600, "file": 2, "chunk": 12},
    "top_symbols": [],
    "warnings": ["2 files used bounded indexing fallback instead of full parsing."],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 614, "total_files": 144, "functions": 600, "classes": 0, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/986/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/986/facts":
        facts = INDEX_FACTS if query.get("kind") == ["index_fallback"] else ALL_FACTS
        return {"repo_id": 986, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/986/relationships":
        return {"repo_id": 986, "total": 0, "relationships": []}
    if path == "/api/codesniff/repos/986/teaching":
        return {"repo_id": 986, "summary": "", "steps": [], "warnings": []}
    if path == "/api/codesniff/repos/986/search-quality":
        return {"repo_id": 986, "total_cases": 0, "passed_cases": 0, "score": 0, "cases": [], "warnings": []}
    if path == "/api/codesniff/repos/986/storage-profile":
        return {"repo_id": 986, "artifact_bytes": 0, "source_bytes": 0, "sqlite_bytes": 0, "vector_bytes": 0, "blob_bytes": 0, "blob_file_count": 0, "compression_ratio": None, "sampled_cold_read_ms": None, "warnings": []}
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
    warning = page.locator("[data-ui='index-fallback-warning']")
    warning.wait_for(timeout=10000)
    warning.get_by_text("Bounded indexing fallback", exact=True).wait_for(timeout=10000)
    warning.get_by_text(FALLBACKS[0]["path"], exact=True).wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Index").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text(FALLBACKS[0]["path"], exact=True).first.wait_for(timeout=10000)
    facts.get_by_text("symbol-parse limit").first.wait_for(timeout=10000)
    facts.get_by_text(FALLBACKS[1]["path"], exact=True).first.wait_for(timeout=10000)
    if facts.get_by_text("pytest tests").count() != 0:
        raise AssertionError("Index fallback filter still shows stale runbook fact")
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

    index_requests = [url for url in requests if "/facts" in url and "kind=index_fallback" in url]
    if len(index_requests) < len(VIEWPORTS):
        failures["index_fallback_requests"] = [f"expected index fallback fact request per viewport, got {len(index_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"index_fallback_fact_requests={len(index_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("Index fallback warning UI check passed")


if __name__ == "__main__":
    main()
