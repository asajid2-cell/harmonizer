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
    "phone-small": "test-relationships-phone-320.png",
    "laptop": "test-relationships-laptop-1366.png",
    "ultrawide": "test-relationships-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "test-relationships"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 515,
    "name": "import-aware-test-relationship-fixture-with-a-long-name",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "test515",
    "storage_path": "/tmp/codesniff/import-aware-tests",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 987654321,
    "total_symbols": 4400,
    "total_files": 1200,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
    "refresh_interval_minutes": 1440,
    "next_refresh_at": None,
    "last_scheduled_refresh_at": None,
}

TEST_RELATIONSHIPS = [
    {
        "id": 701,
        "src_kind": "file",
        "src_id": 31,
        "source_path": "tests/test_checkout_flow.py",
        "dst_kind": "file",
        "dst_id": 9,
        "rel_type": "tests",
        "target": "src/billing/invoice.py",
        "confidence": "heuristic",
        "source_line": 1,
        "metadata": {
            "source_path": "tests/test_checkout_flow.py",
            "target_path": "src/billing/invoice.py",
            "match": "import",
            "detail": "test source",
            "import_target": "src.billing.invoice",
            "import_syntax": "from",
            "import_confidence": "parsed",
        },
    },
    {
        "id": 702,
        "src_kind": "file",
        "src_id": 32,
        "source_path": "packages/web/__tests__/checkout-flow.spec.ts",
        "dst_kind": "file",
        "dst_id": 12,
        "rel_type": "tests",
        "target": "packages/web/src/checkoutServiceWithAnIntentionallyLongModuleName.ts",
        "confidence": "heuristic",
        "source_line": 1,
        "metadata": {
            "source_path": "packages/web/__tests__/checkout-flow.spec.ts",
            "target_path": "packages/web/src/checkoutServiceWithAnIntentionallyLongModuleName.ts",
            "match": "import",
            "detail": "test source",
            "import_target": "../src/checkoutServiceWithAnIntentionallyLongModuleName",
            "import_syntax": "import-from",
            "import_confidence": "heuristic",
        },
    },
]

OVERVIEW = {
    "repo_id": 515,
    "total_files": 1200,
    "total_symbols": 4400,
    "languages": [
        {"language": "Python", "file_count": 300, "line_count": 42000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "TypeScript", "file_count": 260, "line_count": 39000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
    ],
    "top_directories": [{"path": "src", "file_count": 400, "line_count": 51000}],
    "modules": [
        {
            "path": "src/billing",
            "file_count": 18,
            "line_count": 3200,
            "symbol_count": 210,
            "languages": ["Python"],
            "sample_files": ["src/billing/invoice.py"],
        }
    ],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "configs": [{"path": "package.json", "kind": "config", "detail": "JavaScript/TypeScript package", "total_lines": 60}],
    "tests": [
        {"path": "tests/test_checkout_flow.py", "kind": "test", "detail": "test source", "total_lines": 40},
        {"path": "packages/web/__tests__/checkout-flow.spec.ts", "kind": "test", "detail": "test source", "total_lines": 55},
    ],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "Python app entry point", "total_lines": 90}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest && npm test", "source_path": "package.json", "detail": "test script"}],
    "dependencies": [],
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 1100, "class": 300},
    "top_symbols": [],
    "warnings": [],
}

TEACHING = {
    "repo_id": 515,
    "generated_from": "cold_overview_v1",
    "warnings": [],
    "steps": [
        {
            "id": "tests",
            "title": "Tests",
            "summary": "Behavior-named tests are linked to imported implementation files.",
            "citations": [{"source_path": "tests/test_checkout_flow.py", "source_line": 1, "label": "src/billing/invoice.py", "kind": "relationship"}],
        }
    ],
}

ALL_FACTS = [
    {
        "id": 501,
        "kind": "runbook_command",
        "key": "test",
        "value": "pytest && npm test",
        "source_path": "package.json",
        "source_line": None,
        "confidence": "derived",
        "metadata": {"rank": 20000, "provenance": {"source": "manifest"}},
    }
]

TEST_FACTS = [
    {
        "id": index + 601,
        "kind": "test",
        "key": item["source_path"],
        "value": item["metadata"]["target_path"],
        "source_path": item["source_path"],
        "source_line": item["source_line"],
        "confidence": "heuristic",
        "metadata": {"rank": 30000 + index, "match": "import"},
    }
    for index, item in enumerate(TEST_RELATIONSHIPS)
]


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 4400, "total_files": 1200, "functions": 1100, "classes": 300, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/515/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/515/teaching":
        return TEACHING
    if path == "/api/codesniff/repos/515/facts":
        facts = TEST_FACTS if query.get("kind") == ["test"] else ALL_FACTS
        return {"repo_id": 515, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/515/relationships":
        relationships = TEST_RELATIONSHIPS if query.get("rel_type") == ["tests"] else []
        return {"repo_id": 515, "total": len(relationships), "relationships": relationships}
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
            const label = ((el.innerText || el.value || el.getAttribute('aria-label') || el.tagName) + '').trim().slice(0, 70);
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
    page.locator("[data-ui='repo-overview']").get_by_text("tests/test_checkout_flow.py", exact=True).wait_for(timeout=10000)

    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Tests").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("packages/web/__tests__/checkout-flow.spec.ts").first.wait_for(timeout=10000)

    page.locator("[data-ui='relationship-filter']").get_by_role("button", name="Tests").click()
    relationships = page.locator("[data-ui='repo-relationships']")
    relationships.get_by_text("src/billing/invoice.py", exact=True).wait_for(timeout=10000)
    relationships.get_by_text("packages/web/src/checkoutServiceWithAnIntentionallyLongModuleName.ts", exact=True).wait_for(timeout=10000)
    relationships.get_by_text("tests").first.wait_for(timeout=10000)
    relationships.get_by_text("import").first.wait_for(timeout=10000)

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

    test_fact_requests = [url for url in requests if "/facts" in url and "kind=test" in url]
    test_relationship_requests = [url for url in requests if "/relationships" in url and "rel_type=tests" in url]
    if len(test_fact_requests) < len(VIEWPORTS):
        failures["fact_requests"] = [f"expected test fact request per viewport, got {len(test_fact_requests)}"]
    if len(test_relationship_requests) < len(VIEWPORTS):
        failures["relationship_requests"] = [f"expected test relationship request per viewport, got {len(test_relationship_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"test_fact_requests={len(test_fact_requests)}")
    print(f"test_relationship_requests={len(test_relationship_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("test relationships UI check passed")


if __name__ == "__main__":
    main()
