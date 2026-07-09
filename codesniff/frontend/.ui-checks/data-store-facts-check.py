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
    "phone-small": "data-store-facts-phone-320.png",
    "laptop": "data-store-facts-laptop-1366.png",
    "ultrawide": "data-store-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "data-store-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 975,
    "name": "data-store-fixture-with-long-storage-and-search-paths",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "store975",
    "storage_path": "/tmp/codesniff/data-store-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 103939393,
    "total_symbols": 1020,
    "total_files": 312,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

DATA_STORE_FACTS = [
    {
        "id": 2001,
        "kind": "data_store",
        "key": "PostgreSQL",
        "value": "PostgreSQL connection/client signal",
        "source_path": "src/storage/postgres/customer-ledger-primary-database-connection-with-very-long-name.ts",
        "source_line": 41,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54041,
            "category": "relational database",
            "source": "code-signal",
            "detail": "PostgreSQL connection/client signal",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 2002,
        "kind": "data_store",
        "key": "Redis",
        "value": "Redis data-store signal; value not stored",
        "source_path": ".env.example",
        "source_line": 7,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54070,
            "category": "key-value cache",
            "source": "environment-name",
            "detail": "Redis data-store signal; value not stored",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 2003,
        "kind": "data_store",
        "key": "Amazon S3",
        "value": "S3 object-storage client signal",
        "source_path": "src/storage/object-store/s3-invoice-archive-client-with-extra-long-region-name.py",
        "source_line": 88,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54088,
            "category": "object storage",
            "source": "code-signal",
            "detail": "S3 object-storage client signal",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 2004,
        "kind": "data_store",
        "key": "Elasticsearch",
        "value": "Elasticsearch client signal",
        "source_path": "src/search/customer-ledger-elasticsearch-index-writer-with-extra-long-index-name.ts",
        "source_line": 116,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54116,
            "category": "search engine",
            "source": "code-signal",
            "detail": "Elasticsearch client signal",
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
    DATA_STORE_FACTS[0],
]

OVERVIEW = {
    "repo_id": 975,
    "total_files": 312,
    "total_symbols": 1020,
    "languages": [{"language": "TypeScript", "file_count": 222, "line_count": 39000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 222, "line_count": 39000}],
    "modules": [{"path": "src", "file_count": 222, "line_count": 39000, "symbol_count": 980, "languages": ["TypeScript", "Python"], "sample_files": ["src/storage/postgres/client.ts"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 96}],
    "doc_sections": [],
    "configs": [{"path": ".env.example", "kind": "config", "detail": "Environment template", "total_lines": 42}],
    "tests": [{"path": "tests/storage.test.ts", "kind": "test", "detail": "test source", "total_lines": 84}],
    "entry_points": [{"path": "src/app.ts", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 150}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "npm", "source_path": "package.json", "dependency_count": 22, "dev_dependency_count": 0, "detail": "package.json"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "tests"}],
    "dependencies": [],
    "stack_components": [],
    "service_integrations": [],
    "data_stores": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in DATA_STORE_FACTS
    ],
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
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 960, "class": 60},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 1020, "total_files": 312, "functions": 960, "classes": 60, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/975/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/975/facts":
        facts = DATA_STORE_FACTS if query.get("kind") == ["data_store"] else ALL_FACTS
        return {"repo_id": 975, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/975/relationships":
        return {"repo_id": 975, "total": 0, "relationships": []}
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
    page.get_by_text("PostgreSQL - relational database").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Stores").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("PostgreSQL", exact=True).first.wait_for(timeout=10000)
    facts.get_by_text("Redis data-store signal; value not stored").wait_for(timeout=10000)
    facts.get_by_text("S3 object-storage client signal").wait_for(timeout=10000)
    facts.get_by_text("src/search/customer-ledger-elasticsearch-index-writer-with-extra-long-index-name.ts:116").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Stores filter still shows stale runbook fact")
    if page.get_by_text("redis://cache_should_not_be_rendered_975").count() != 0:
        raise AssertionError("Raw Redis URL sample rendered")
    if page.get_by_text("postgres://db_should_not_be_rendered_975").count() != 0:
        raise AssertionError("Raw database URL sample rendered")
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

    store_requests = [url for url in requests if "/facts" in url and "kind=data_store" in url]
    if len(store_requests) < len(VIEWPORTS):
        failures["data_store_requests"] = [f"expected data-store fact request per viewport, got {len(store_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"data_store_fact_requests={len(store_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("Data-store facts filter UI check passed")


if __name__ == "__main__":
    main()
