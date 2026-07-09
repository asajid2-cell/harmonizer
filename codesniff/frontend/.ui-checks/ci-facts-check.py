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
    "phone-small": "ci-facts-phone-320.png",
    "laptop": "ci-facts-laptop-1366.png",
    "ultrawide": "ci-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "ci-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 839,
    "name": "ci-workflow-fixture-with-long-automation-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "ci839",
    "storage_path": "/tmp/codesniff/ci-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 33445566,
    "total_symbols": 720,
    "total_files": 188,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

CI_FACTS = [
    {
        "id": 840,
        "kind": "ci_workflow",
        "key": "Long Billing Reconciliation CI Pipeline With Deployment Smoke Tests",
        "value": "events: push, pull_request; jobs: test, build-and-smoke; runs: pytest tests | npm run build",
        "source_path": ".github/workflows/billing-reconciliation-and-deployment-smoke.yml",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 55001,
            "provider": "github-actions",
            "events": ["push", "pull_request"],
            "jobs": ["test", "build-and-smoke"],
            "commands": ["pytest tests", "npm run build"],
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 841,
        "kind": "ci_workflow",
        "key": "Extremely Long Nightly Index Verification Workflow For Cold Artifacts",
        "value": "events: schedule; jobs: verify-cold-artifacts; runs: python scripts/evaluate_search_quality.py",
        "source_path": ".github/workflows/nightly-cold-artifact-verification.yml",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 55002,
            "provider": "github-actions",
            "events": ["schedule"],
            "jobs": ["verify-cold-artifacts"],
            "commands": ["python scripts/evaluate_search_quality.py"],
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
    CI_FACTS[0],
]

OVERVIEW = {
    "repo_id": 839,
    "total_files": 188,
    "total_symbols": 720,
    "languages": [{"language": "Python", "file_count": 120, "line_count": 16000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 120, "line_count": 16000}],
    "modules": [{"path": "src", "file_count": 120, "line_count": 16000, "symbol_count": 600, "languages": ["Python"], "sample_files": ["src/main.py"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 60}],
    "doc_sections": [],
    "configs": [{"path": ".github/workflows/billing-reconciliation-and-deployment-smoke.yml", "kind": "config", "detail": "GitHub Actions workflow", "total_lines": 44}],
    "tests": [{"path": "tests/test_billing.py", "kind": "test", "detail": "test source", "total_lines": 50}],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "Python app entry point", "total_lines": 100}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "environment_variables": [],
    "ci_workflows": [
        {"name": item["key"], "detail": item["value"], "source_path": item["source_path"], "line": item["source_line"], "provider": item["metadata"]["provider"], "events": item["metadata"]["events"], "jobs": item["metadata"]["jobs"], "commands": item["metadata"]["commands"]}
        for item in CI_FACTS
    ],
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 600, "class": 120},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 720, "total_files": 188, "functions": 600, "classes": 120, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/839/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/839/facts":
        facts = CI_FACTS if query.get("kind") == ["ci_workflow"] else ALL_FACTS
        return {"repo_id": 839, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/839/relationships":
        return {"repo_id": 839, "total": 0, "relationships": []}
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
    page.locator("[data-ui='repo-facts']").get_by_text("pytest", exact=True).wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="CI").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Long Billing Reconciliation CI Pipeline With Deployment Smoke Tests").wait_for(timeout=10000)
    facts.get_by_text("Extremely Long Nightly Index Verification Workflow For Cold Artifacts").wait_for(timeout=10000)
    facts.get_by_text(".github/workflows/billing-reconciliation-and-deployment-smoke.yml:1").wait_for(timeout=10000)
    if facts.get_by_text("pytest", exact=True).count() != 0:
        raise AssertionError("CI filter still shows stale runbook fact")
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

    ci_requests = [url for url in requests if "/facts" in url and "kind=ci_workflow" in url]
    if len(ci_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected ci-workflow fact request per viewport, got {len(ci_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"ci_workflow_fact_requests={len(ci_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("ci facts filter UI check passed")


if __name__ == "__main__":
    main()
