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
    "phone-small": "search-quality-phone-320.png",
    "laptop": "search-quality-laptop-1366.png",
    "ultrawide": "search-quality-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "search-quality"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 814,
    "name": "search-quality-fixture-with-a-very-long-name-for-layout-testing",
    "source_type": "github",
    "source_url": "https://github.com/example/search-quality-fixture",
    "status": "lexical_ready",
    "active_revision": "abc1234",
    "storage_path": "/tmp/codesniff/search-quality-fixture",
    "created_at": "2026-07-05T00:00:00Z",
    "updated_at": "2026-07-05T00:00:00Z",
    "last_opened_at": "2026-07-05T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 1122334455,
    "total_symbols": 88888,
    "total_files": 100000,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
    "refresh_interval_minutes": None,
    "next_refresh_at": None,
    "last_scheduled_refresh_at": None,
}

OVERVIEW = {
    "repo_id": 814,
    "total_files": 100000,
    "total_symbols": 88888,
    "languages": [{"language": "Python", "file_count": 30000, "line_count": 900000}],
    "top_directories": [{"path": "src", "file_count": 18000, "line_count": 700000}],
    "modules": [{"path": "src/search_quality", "file_count": 240, "line_count": 18000, "symbol_count": 1600, "languages": ["Python"], "sample_files": ["src/search_quality/evaluator.py"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 120}],
    "configs": [{"path": "package.json", "kind": "config", "detail": "npm package manifest", "total_lines": 80}],
    "tests": [{"path": "tests/test_search_quality_dashboard.py", "kind": "test", "detail": "test source", "total_lines": 160}],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "runtime entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [],
    "dependencies": [],
    "route_endpoints": [],
    "import_relationships": [],
    "symbol_types": {"function": 9000, "class": 1200},
    "top_symbols": [],
    "warnings": [],
}

TEACHING = {
    "repo_id": 814,
    "generated_from": "cold_overview_v1",
    "warnings": [],
    "steps": [
        {
            "id": "start",
            "title": "Start",
            "summary": "Start with src/main.py. Then read README.md.",
            "citations": [{"source_path": "src/main.py", "source_line": 1, "label": "runtime entry point", "kind": "entry_point"}],
        }
    ],
}

QUALITY = {
    "repo_id": 814,
    "total": 4,
    "passed": 3,
    "failed": 1,
    "recall_at_k": 0.75,
    "mrr": 0.625,
    "warnings": [],
    "generated_cases": [
        {"query": "authenticate_user", "expected_symbol": "authenticate_user", "expected_path": "src/authentication/auth_service_with_a_very_long_name.py", "expected_type": "function", "top_k": 5, "source": "symbol"},
        {"query": "GET /api/search-quality/extremely-long-route-name/:repoId express", "expected_symbol": None, "expected_path": "src/routes/search_quality_dashboard_with_a_very_long_file_name.ts", "expected_type": None, "top_k": 5, "source": "route"},
    ],
    "results": [
        {
            "query": "authenticate_user",
            "top_k": 5,
            "passed": True,
            "rank": 1,
            "elapsed_ms": 12.4,
            "source": "symbol",
            "expected": {"symbol": "authenticate_user", "path": "src/authentication/auth_service_with_a_very_long_name.py", "type": "function"},
            "top_results": [{"rank": 1, "symbol": "authenticate_user", "path": "src/authentication/auth_service_with_a_very_long_name.py", "type": "function", "score": 0.98, "match_info": "lexical"}],
        },
        {
            "query": "GET /api/search-quality/extremely-long-route-name/:repoId express",
            "top_k": 5,
            "passed": True,
            "rank": 2,
            "elapsed_ms": 18.9,
            "source": "route",
            "expected": {"symbol": None, "path": "src/routes/search_quality_dashboard_with_a_very_long_file_name.ts", "type": None},
            "top_results": [{"rank": 1, "symbol": "registerSearchQualityDashboardWithLongName", "path": "src/routes/search_quality_dashboard_with_a_very_long_file_name.ts", "type": "function", "score": 0.87, "match_info": "lexical"}],
        },
        {
            "query": "pnpm test -- --runInBand --reporter=verbose --config strict.search-quality.config.ts",
            "top_k": 5,
            "passed": True,
            "rank": 1,
            "elapsed_ms": 9.2,
            "source": "runbook",
            "expected": {"symbol": None, "path": "package.json", "type": None},
            "top_results": [{"rank": 1, "symbol": "package.json chunk 1", "path": "package.json", "type": "chunk", "score": 0.82, "match_info": "lexical"}],
        },
        {
            "query": "missing generated quality fixture with intentionally long unmatched terms",
            "top_k": 5,
            "passed": False,
            "rank": None,
            "elapsed_ms": 7.1,
            "source": "generated",
            "expected": {"symbol": None, "path": "src/missing_quality_fixture.py", "type": None},
            "top_results": [{"rank": 1, "symbol": "nearMissQualityFixture", "path": "src/near_miss_quality_fixture.py", "type": "function", "score": 0.12, "match_info": "lexical"}],
        },
    ],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 88888, "total_files": 100000, "functions": 9000, "classes": 1200, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/814/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/814/teaching":
        return TEACHING
    if path == "/api/codesniff/repos/814/search-quality":
        assert query.get("max_cases") == ["8"]
        assert query.get("top_k") == ["5"]
        return QUALITY
    if path == "/api/codesniff/repos/814/facts":
        return {"repo_id": 814, "total": 0, "facts": []}
    if path == "/api/codesniff/repos/814/relationships":
        return {"repo_id": 814, "total": 0, "relationships": []}
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
    page.locator("[data-ui='search-quality-run']").click()
    panel = page.locator("[data-ui='search-quality']")
    panel.get_by_text("75%").wait_for(timeout=10000)
    panel.get_by_text("3/4").wait_for(timeout=10000)
    panel.get_by_text("GET /api/search-quality/extremely-long-route-name/:repoId express").wait_for(timeout=10000)
    panel.get_by_text("src/routes/search_quality_dashboard_with_a_very_long_file_name.ts").first.wait_for(timeout=10000)
    panel.get_by_text("missing generated quality fixture").wait_for(timeout=10000)
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

    quality_requests = [url for url in requests if "/repos/814/search-quality" in url]
    if len(quality_requests) < len(VIEWPORTS):
        failures["quality_requests"] = [f"expected quality request per viewport, got {len(quality_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"quality_requests={len(quality_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("search quality UI check passed")


if __name__ == "__main__":
    main()
