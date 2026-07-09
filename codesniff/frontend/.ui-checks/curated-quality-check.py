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
    "phone-small": "curated-quality-phone-320.png",
    "laptop": "curated-quality-laptop-1366.png",
    "ultrawide": "curated-quality-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "curated-quality"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 945,
    "name": "curated-quality-fixture-with-a-very-long-name-for-layout-testing",
    "source_type": "github",
    "source_url": "https://github.com/example/curated-quality-fixture",
    "status": "lexical_ready",
    "active_revision": "abc1234",
    "storage_path": "/tmp/codesniff/curated-quality-fixture",
    "created_at": "2026-07-05T00:00:00Z",
    "updated_at": "2026-07-05T00:00:00Z",
    "last_opened_at": "2026-07-05T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 1234567890,
    "total_symbols": 44444,
    "total_files": 100000,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
    "refresh_interval_minutes": 1440,
    "next_refresh_at": "2026-07-06T12:00:00Z",
    "last_scheduled_refresh_at": None,
}

OVERVIEW = {
    "repo_id": 945,
    "total_files": 100000,
    "total_symbols": 44444,
    "languages": [{"language": "Python", "file_count": 24000, "line_count": 800000}],
    "top_directories": [{"path": "src", "file_count": 18000, "line_count": 700000}],
    "modules": [{"path": "src/authentication", "file_count": 120, "line_count": 9000, "symbol_count": 800, "languages": ["Python"], "sample_files": ["src/authentication/service.py"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 120}],
    "configs": [{"path": ".codesniff/search-quality.json", "kind": "config", "detail": "curated search-quality suite", "total_lines": 40}],
    "tests": [{"path": "tests/test_curated_quality.py", "kind": "test", "detail": "test source", "total_lines": 100}],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "runtime entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "search_quality_cases": [
        {
            "query": "authenticate_user password credentials with intentionally long curated wording",
            "expected_symbol": "authenticate_user",
            "expected_path": "src/authentication/service_with_a_very_long_file_name.py",
            "expected_type": "function",
            "top_k": 5,
            "source_path": ".codesniff/search-quality.json",
            "source_index": 1,
        }
    ],
    "search_quality_baseline": {"min_recall_at_k": 0.75, "min_mrr": 0.6, "min_passed": 3},
    "symbol_types": {"function": 7000, "class": 900},
    "top_symbols": [],
    "warnings": [],
}

TEACHING = {
    "repo_id": 945,
    "generated_from": "cold_overview_v1",
    "warnings": [],
    "steps": [
        {
            "id": "start",
            "title": "Start",
            "summary": "Start with src/main.py. Then read the curated search-quality suite.",
            "citations": [{"source_path": "src/main.py", "source_line": 1, "label": "runtime entry point", "kind": "entry_point"}],
        }
    ],
}

QUALITY = {
    "repo_id": 945,
    "total": 3,
    "passed": 2,
    "failed": 1,
    "recall_at_k": 0.6666667,
    "mrr": 0.5,
    "warnings": [
        "Using 3 curated search-quality cases from repo config.",
        "Search quality below baseline: recall 0.67 < 0.75, MRR 0.50 < 0.60, passed 2 < 3.",
    ],
    "baseline": {
        "min_recall_at_k": 0.75,
        "min_mrr": 0.6,
        "min_passed": 3,
        "recall_delta": -0.0833333,
        "mrr_delta": -0.1,
        "passed_delta": -1,
        "met": False,
    },
    "generated_cases": [
        {
            "query": "authenticate_user password credentials with intentionally long curated wording",
            "expected_symbol": "authenticate_user",
            "expected_path": "src/authentication/service_with_a_very_long_file_name.py",
            "expected_type": "function",
            "top_k": 5,
            "source": "curated",
        },
        {
            "query": "database failover promotion runbook curated case",
            "expected_symbol": None,
            "expected_path": "docs/operations/database_failover_with_a_very_long_name.md",
            "expected_type": None,
            "top_k": 5,
            "source": "curated",
        },
    ],
    "results": [
        {
            "query": "authenticate_user password credentials with intentionally long curated wording",
            "top_k": 5,
            "passed": True,
            "rank": 1,
            "elapsed_ms": 12.4,
            "source": "curated",
            "expected": {"symbol": "authenticate_user", "path": "src/authentication/service_with_a_very_long_file_name.py", "type": "function"},
            "top_results": [{"rank": 1, "symbol": "authenticate_user", "path": "src/authentication/service_with_a_very_long_file_name.py", "type": "function", "score": 0.98, "match_info": "lexical"}],
        },
        {
            "query": "database failover promotion runbook curated case",
            "top_k": 5,
            "passed": True,
            "rank": 2,
            "elapsed_ms": 10.1,
            "source": "curated",
            "expected": {"symbol": None, "path": "docs/operations/database_failover_with_a_very_long_name.md", "type": None},
            "top_results": [{"rank": 1, "symbol": "database_failover_with_a_very_long_name.md chunk 1", "path": "docs/operations/database_failover_with_a_very_long_name.md", "type": "chunk", "score": 0.78, "match_info": "lexical"}],
        },
        {
            "query": "missing curated quality fixture with very long unmatched words",
            "top_k": 5,
            "passed": False,
            "rank": None,
            "elapsed_ms": 7.8,
            "source": "curated",
            "expected": {"symbol": "missingCuratedQualitySymbol", "path": "src/missing_curated_quality.py", "type": "function"},
            "top_results": [{"rank": 1, "symbol": "nearMissCuratedQualitySymbol", "path": "src/near_miss_curated_quality.py", "type": "function", "score": 0.15, "match_info": "lexical"}],
        },
    ],
}

QUALITY_FACTS = {
    "repo_id": 945,
    "total": 3,
    "facts": [
        {
            "id": 7001,
            "kind": "search_quality",
            "key": "baseline",
            "value": "recall>=75%, mrr>=0.60, passed>=3",
            "source_path": ".codesniff/search-quality.json",
            "source_line": None,
            "confidence": "repo_config",
            "metadata": {"fact_type": "baseline"},
        },
        {
            "id": 7002,
            "kind": "search_quality",
            "key": "authenticate_user password credentials with intentionally long curated wording",
            "value": "expects authenticate_user / src/authentication/service_with_a_very_long_file_name.py / function; top_k=5",
            "source_path": ".codesniff/search-quality.json",
            "source_line": None,
            "confidence": "repo_config",
            "metadata": {"fact_type": "case"},
        },
        {
            "id": 7003,
            "kind": "search_quality",
            "key": "database failover promotion runbook curated case",
            "value": "expects docs/operations/database_failover_with_a_very_long_name.md; top_k=5",
            "source_path": ".codesniff/search-quality.json",
            "source_line": None,
            "confidence": "repo_config",
            "metadata": {"fact_type": "case"},
        },
    ],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 44444, "total_files": 100000, "functions": 7000, "classes": 900, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/945/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/945/teaching":
        return TEACHING
    if path == "/api/codesniff/repos/945/search-quality":
        assert query.get("max_cases") == ["8"]
        assert query.get("top_k") == ["5"]
        return QUALITY
    if path == "/api/codesniff/repos/945/facts":
        if query.get("kind") == ["search_quality"]:
            return QUALITY_FACTS
        return {"repo_id": 945, "total": 0, "facts": []}
    if path == "/api/codesniff/repos/945/relationships":
        return {"repo_id": 945, "total": 0, "relationships": []}
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
    panel = page.locator("[data-ui='search-quality']")
    panel.get_by_text("Run curated repo cases or generated smoke queries from indexed facts").wait_for(timeout=10000)
    panel.locator("[data-ui='search-quality-run']").click()
    panel.get_by_text("67%").wait_for(timeout=10000)
    panel.get_by_text("2/3").wait_for(timeout=10000)
    panel.get_by_text("Below baseline").wait_for(timeout=10000)
    panel.get_by_text("Recall >= 75% (-8pp)").wait_for(timeout=10000)
    panel.get_by_text("MRR >= 0.60 (-0.10)").wait_for(timeout=10000)
    panel.get_by_text("Cases >= 3 (-1)").wait_for(timeout=10000)
    panel.get_by_text("Using 3 curated search-quality cases from repo config.").wait_for(timeout=10000)
    panel.get_by_text("curated", exact=True).first.wait_for(timeout=10000)
    panel.get_by_text("authenticate_user password credentials with intentionally long curated wording").wait_for(timeout=10000)
    panel.get_by_text("src/authentication/service_with_a_very_long_file_name.py").first.wait_for(timeout=10000)
    panel.get_by_text("missing curated quality fixture with very long unmatched words").wait_for(timeout=10000)

    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Quality").click()
    facts_panel = page.locator("[data-ui='repo-facts']")
    facts_panel.get_by_text("baseline", exact=True).wait_for(timeout=10000)
    facts_panel.get_by_text("recall>=75%, mrr>=0.60, passed>=3").wait_for(timeout=10000)
    facts_panel.get_by_text("authenticate_user password credentials with intentionally long curated wording").wait_for(timeout=10000)
    facts_panel.get_by_text("src/authentication/service_with_a_very_long_file_name.py").wait_for(timeout=10000)
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

    quality_requests = [url for url in requests if "/repos/945/search-quality" in url]
    if len(quality_requests) < len(VIEWPORTS):
        failures["quality_requests"] = [f"expected curated quality request per viewport, got {len(quality_requests)}"]
    quality_fact_requests = [url for url in requests if "/repos/945/facts" in url and "kind=search_quality" in url]
    if len(quality_fact_requests) < len(VIEWPORTS):
        failures["quality_fact_requests"] = [f"expected quality fact request per viewport, got {len(quality_fact_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"quality_requests={len(quality_requests)}")
    print(f"quality_fact_requests={len(quality_fact_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("curated quality UI check passed")


if __name__ == "__main__":
    main()
