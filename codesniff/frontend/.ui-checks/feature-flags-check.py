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
    "phone-small": "feature-flags-phone-320.png",
    "laptop": "feature-flags-laptop-1366.png",
    "ultrawide": "feature-flags-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "feature-flags"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 971,
    "name": "feature-flag-fixture-with-long-experiment-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "flags971",
    "storage_path": "/tmp/codesniff/feature-flags",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 73737373,
    "total_symbols": 740,
    "total_files": 218,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

FLAG_FACTS = [
    {
        "id": 1601,
        "kind": "feature_flag",
        "key": "LaunchDarkly",
        "value": "LaunchDarkly server SDK dependency",
        "source_path": "package.json",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54001,
            "category": "feature flag provider",
            "source": "dependency",
            "detail": "LaunchDarkly server SDK dependency",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1602,
        "kind": "feature_flag",
        "key": "LaunchDarkly variation",
        "value": "LaunchDarkly variation call",
        "source_path": "src/features/invoice-redesign/launchdarkly-rollout-with-extra-long-segment-name.ts",
        "source_line": 37,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54037,
            "category": "flag usage",
            "source": "code-signal",
            "detail": "LaunchDarkly variation call",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1603,
        "kind": "feature_flag",
        "key": "CheckoutRevampExperimentForEnterpriseAccountsWithVeryLongCohortName",
        "value": "Experiment configuration signal",
        "source_path": "config/feature-flags/checkout-revamp-experiments-with-very-long-file-name.yaml",
        "source_line": 12,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54012,
            "category": "experiment",
            "source": "config-signal",
            "detail": "Experiment configuration signal",
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
    FLAG_FACTS[0],
]

OVERVIEW = {
    "repo_id": 971,
    "total_files": 218,
    "total_symbols": 740,
    "languages": [{"language": "TypeScript", "file_count": 140, "line_count": 26000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 140, "line_count": 26000}],
    "modules": [{"path": "src", "file_count": 140, "line_count": 26000, "symbol_count": 700, "languages": ["TypeScript"], "sample_files": ["src/features/flags.ts"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 76}],
    "doc_sections": [],
    "configs": [{"path": "config/feature-flags/checkout-revamp-experiments-with-very-long-file-name.yaml", "kind": "config", "detail": "feature flag config", "total_lines": 45}],
    "tests": [{"path": "tests/feature-flags.test.ts", "kind": "test", "detail": "test source", "total_lines": 58}],
    "entry_points": [{"path": "src/app.ts", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 132}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "npm", "source_path": "package.json", "dependency_count": 12, "dev_dependency_count": 0, "detail": "package.json"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "tests"}],
    "dependencies": [],
    "stack_components": [],
    "service_integrations": [],
    "auth_surfaces": [],
    "background_jobs": [],
    "webhook_surfaces": [],
    "observability_surfaces": [],
    "feature_flags": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in FLAG_FACTS
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
    "symbol_types": {"function": 700, "class": 40},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 740, "total_files": 218, "functions": 700, "classes": 40, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/971/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/971/facts":
        facts = FLAG_FACTS if query.get("kind") == ["feature_flag"] else ALL_FACTS
        return {"repo_id": 971, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/971/relationships":
        return {"repo_id": 971, "total": 0, "relationships": []}
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
    page.get_by_text("LaunchDarkly - feature flag provider").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Flags").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("LaunchDarkly", exact=True).first.wait_for(timeout=10000)
    facts.get_by_text("LaunchDarkly variation call").wait_for(timeout=10000)
    facts.get_by_text("CheckoutRevampExperimentForEnterpriseAccountsWithVeryLongCohortName").wait_for(timeout=10000)
    facts.get_by_text("config/feature-flags/checkout-revamp-experiments-with-very-long-file-name.yaml:12").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Flags filter still shows stale runbook fact")
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

    flag_requests = [url for url in requests if "/facts" in url and "kind=feature_flag" in url]
    if len(flag_requests) < len(VIEWPORTS):
        failures["flag_requests"] = [f"expected feature-flag fact request per viewport, got {len(flag_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"feature_flag_fact_requests={len(flag_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("feature flag facts filter UI check passed")


if __name__ == "__main__":
    main()
