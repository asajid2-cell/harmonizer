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
    "phone-small": "runtime-facts-phone-320.png",
    "laptop": "runtime-facts-laptop-1366.png",
    "ultrawide": "runtime-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "runtime-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 841,
    "name": "runtime-toolchain-fixture-with-long-version-constraints",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "runtime841",
    "storage_path": "/tmp/codesniff/runtime-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 33557799,
    "total_symbols": 720,
    "total_files": 188,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

RUNTIME_FACTS = [
    {
        "id": 860,
        "kind": "runtime_requirement",
        "key": "Node.js",
        "value": ">=20.10.0 <23.0.0 with an intentionally long constraint for layout testing",
        "source_path": "package.json",
        "source_line": 9,
        "confidence": "heuristic",
        "metadata": {
            "rank": 58009,
            "runtime": "Node.js",
            "requirement": ">=20.10.0 <23.0.0 with an intentionally long constraint for layout testing",
            "source": "package-engines",
            "detail": "package.json engines.node",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 861,
        "kind": "runtime_requirement",
        "key": "Python",
        "value": ">=3.12",
        "source_path": "pyproject.toml",
        "source_line": 3,
        "confidence": "heuristic",
        "metadata": {
            "rank": 58003,
            "runtime": "Python",
            "requirement": ">=3.12",
            "source": "pyproject",
            "detail": "project.requires-python",
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
    RUNTIME_FACTS[0],
]

OVERVIEW = {
    "repo_id": 841,
    "total_files": 188,
    "total_symbols": 720,
    "languages": [{"language": "TypeScript", "file_count": 120, "line_count": 18000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 120, "line_count": 18000}],
    "modules": [{"path": "src", "file_count": 120, "line_count": 18000, "symbol_count": 620, "languages": ["TypeScript"], "sample_files": ["src/main.ts"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 70}],
    "doc_sections": [],
    "configs": [{"path": "package.json", "kind": "config", "detail": "npm package manifest", "total_lines": 40}],
    "tests": [{"path": "tests/runtime.test.ts", "kind": "test", "detail": "test source", "total_lines": 30}],
    "entry_points": [{"path": "src/main.ts", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 120}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "pnpm", "source_path": "package.json", "dependency_count": 10, "dev_dependency_count": 8, "detail": "4 scripts"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "environment_variables": [],
    "ci_workflows": [],
    "container_services": [],
    "runtime_requirements": [
        {"runtime": item["key"], "requirement": item["value"], "source_path": item["source_path"], "line": item["source_line"], "source": item["metadata"]["source"], "detail": item["metadata"]["detail"]}
        for item in RUNTIME_FACTS
    ],
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 620, "class": 100},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 720, "total_files": 188, "functions": 620, "classes": 100, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/841/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/841/facts":
        facts = RUNTIME_FACTS if query.get("kind") == ["runtime_requirement"] else ALL_FACTS
        return {"repo_id": 841, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/841/relationships":
        return {"repo_id": 841, "total": 0, "relationships": []}
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
    page.get_by_text("Node.js >=20.10.0").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Runtime").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Node.js", exact=True).wait_for(timeout=10000)
    facts.get_by_text(">=20.10.0 <23.0.0 with an intentionally long constraint for layout testing").wait_for(timeout=10000)
    facts.get_by_text("Python", exact=True).wait_for(timeout=10000)
    facts.get_by_text("pyproject.toml:3").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Runtime filter still shows stale runbook fact")
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

    runtime_requests = [url for url in requests if "/facts" in url and "kind=runtime_requirement" in url]
    if len(runtime_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected runtime fact request per viewport, got {len(runtime_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"runtime_fact_requests={len(runtime_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("runtime facts filter UI check passed")


if __name__ == "__main__":
    main()
