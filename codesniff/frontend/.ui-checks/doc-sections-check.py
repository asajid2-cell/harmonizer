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
    "phone-small": "doc-sections-phone-320.png",
    "laptop": "doc-sections-laptop-1366.png",
    "ultrawide": "doc-sections-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "doc-sections"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 727,
    "name": "doc-section-fixture-with-a-very-long-name-for-facts-layout-testing",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "docs727",
    "storage_path": "/tmp/codesniff/doc-sections",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 123456789,
    "total_symbols": 1200,
    "total_files": 320,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

DOC_FACTS = [
    {
        "id": 70,
        "kind": "doc_section",
        "key": "Billing setup guide for extremely long enterprise deployment environments",
        "value": "README.md",
        "source_path": "README.md",
        "source_line": 5,
        "confidence": "heuristic",
        "metadata": {"rank": 82015, "level": 2, "anchor": "billing-setup-guide-for-extremely-long-enterprise-deployment-environments", "provenance": {"source": "parsed-source"}},
    },
    {
        "id": 71,
        "kind": "doc_section",
        "key": "Troubleshooting cache misses when source snapshots are pruned after indexing",
        "value": "docs/operators/recovery-and-cache-behavior.md",
        "source_path": "docs/operators/recovery-and-cache-behavior.md",
        "source_line": 17,
        "confidence": "heuristic",
        "metadata": {"rank": 82067, "level": 3, "anchor": "troubleshooting-cache-misses-when-source-snapshots-are-pruned-after-indexing", "provenance": {"source": "parsed-source"}},
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
    DOC_FACTS[0],
]

OVERVIEW = {
    "repo_id": 727,
    "total_files": 320,
    "total_symbols": 1200,
    "languages": [{"language": "Python", "file_count": 210, "line_count": 30000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 210, "line_count": 30000}],
    "modules": [{"path": "src", "file_count": 210, "line_count": 30000, "symbol_count": 1100, "languages": ["Python"], "sample_files": ["src/main.py"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [
        {"source_path": "README.md", "line": 5, "level": 2, "title": DOC_FACTS[0]["key"], "anchor": DOC_FACTS[0]["metadata"]["anchor"]},
        {"source_path": "docs/operators/recovery-and-cache-behavior.md", "line": 17, "level": 3, "title": DOC_FACTS[1]["key"], "anchor": DOC_FACTS[1]["metadata"]["anchor"]},
    ],
    "configs": [{"path": "pyproject.toml", "kind": "config", "detail": "Python project manifest", "total_lines": 40}],
    "tests": [{"path": "tests/test_docs.py", "kind": "test", "detail": "test source", "total_lines": 20}],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "Python app entry point", "total_lines": 100}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 900, "class": 300},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 1200, "total_files": 320, "functions": 900, "classes": 300, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/727/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/727/facts":
        facts = DOC_FACTS if query.get("kind") == ["doc_section"] else ALL_FACTS
        return {"repo_id": 727, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/727/relationships":
        return {"repo_id": 727, "total": 0, "relationships": []}
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
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Docs").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Billing setup guide for extremely long enterprise deployment environments").wait_for(timeout=10000)
    facts.get_by_text("Troubleshooting cache misses when source snapshots are pruned after indexing").wait_for(timeout=10000)
    facts.get_by_text("README.md:5").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Docs filter still shows stale runbook fact")
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

    doc_requests = [url for url in requests if "/facts" in url and "kind=doc_section" in url]
    if len(doc_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected doc-section fact request per viewport, got {len(doc_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"doc_section_fact_requests={len(doc_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("doc sections facts-filter UI check passed")


if __name__ == "__main__":
    main()
