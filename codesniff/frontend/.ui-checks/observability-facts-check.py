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
    "phone-small": "observability-facts-phone-320.png",
    "laptop": "observability-facts-laptop-1366.png",
    "ultrawide": "observability-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "observability-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 970,
    "name": "observability-surface-fixture-with-long-telemetry-paths",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "observability970",
    "storage_path": "/tmp/codesniff/observability-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 71717171,
    "total_symbols": 720,
    "total_files": 202,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

OBSERVABILITY_FACTS = [
    {
        "id": 1501,
        "kind": "observability_surface",
        "key": "Sentry",
        "value": "Sentry initialization or capture call",
        "source_path": "src/telemetry/sentry-instrumentation-with-extra-long-client-name.ts",
        "source_line": 18,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54018,
            "category": "error monitoring",
            "source": "code-signal",
            "detail": "Sentry initialization or capture call",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1502,
        "kind": "observability_surface",
        "key": "Prometheus",
        "value": "Prometheus metrics code signal",
        "source_path": "src/telemetry/prometheus-exporter-with-extra-long-registry-name.py",
        "source_line": 31,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54031,
            "category": "metrics",
            "source": "code-signal",
            "detail": "Prometheus metrics code signal",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1503,
        "kind": "observability_surface",
        "key": "OpenTelemetry distributed tracing pipeline with very-long-service-name",
        "value": "OpenTelemetry tracing/metrics signal",
        "source_path": "src/observability/opentelemetry/exporters/otlp-http-trace-exporter-for-eu-west-production.ts",
        "source_line": 44,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54044,
            "category": "tracing",
            "source": "code-signal",
            "detail": "OpenTelemetry tracing/metrics signal",
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
    OBSERVABILITY_FACTS[0],
]

OVERVIEW = {
    "repo_id": 970,
    "total_files": 202,
    "total_symbols": 720,
    "languages": [{"language": "Python", "file_count": 128, "line_count": 25000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 128, "line_count": 25000}],
    "modules": [{"path": "src", "file_count": 128, "line_count": 25000, "symbol_count": 680, "languages": ["Python", "TypeScript"], "sample_files": ["src/api.py"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "configs": [{"path": ".env.example", "kind": "config", "detail": "Environment template", "total_lines": 24}],
    "tests": [{"path": "tests/observability.test.py", "kind": "test", "detail": "test source", "total_lines": 52}],
    "entry_points": [{"path": "src/api.py", "kind": "entry_point", "detail": "Python app entry point", "total_lines": 140}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "Python", "package_manager": "pip", "source_path": "requirements.txt", "dependency_count": 12, "dev_dependency_count": 0, "detail": "requirements"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "stack_components": [],
    "service_integrations": [],
    "auth_surfaces": [],
    "background_jobs": [],
    "webhook_surfaces": [],
    "observability_surfaces": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in OBSERVABILITY_FACTS
    ],
    "environment_variables": [],
    "ci_workflows": [],
    "container_services": [],
    "runtime_requirements": [],
    "repo_policies": [],
    "code_owners": [],
    "deploy_targets": [],
    "secret_signals": [],
    "route_endpoints": [{"method": "GET", "path": "/metrics", "source_path": "src/api.py", "line": 14, "framework": "FastAPI"}],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 680, "class": 40},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 720, "total_files": 202, "functions": 680, "classes": 40, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/970/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/970/facts":
        facts = OBSERVABILITY_FACTS if query.get("kind") == ["observability_surface"] else ALL_FACTS
        return {"repo_id": 970, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/970/relationships":
        return {"repo_id": 970, "total": 0, "relationships": []}
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
    page.get_by_text("Sentry - error monitoring").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Observe").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Sentry", exact=True).first.wait_for(timeout=10000)
    facts.get_by_text("Prometheus metrics code signal").wait_for(timeout=10000)
    facts.get_by_text("OpenTelemetry distributed tracing pipeline with very-long-service-name").wait_for(timeout=10000)
    facts.get_by_text("src/observability/opentelemetry/exporters/otlp-http-trace-exporter-for-eu-west-production.ts:44").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Observe filter still shows stale runbook fact")
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

    observe_requests = [url for url in requests if "/facts" in url and "kind=observability_surface" in url]
    if len(observe_requests) < len(VIEWPORTS):
        failures["observe_requests"] = [f"expected observability-surface fact request per viewport, got {len(observe_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"observability_surface_fact_requests={len(observe_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("observability facts filter UI check passed")


if __name__ == "__main__":
    main()
