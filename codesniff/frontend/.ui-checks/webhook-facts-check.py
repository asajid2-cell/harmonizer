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
    "phone-small": "webhook-facts-phone-320.png",
    "laptop": "webhook-facts-laptop-1366.png",
    "ultrawide": "webhook-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "webhook-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 969,
    "name": "webhook-surface-fixture-with-long-callback-paths",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "webhooks969",
    "storage_path": "/tmp/codesniff/webhook-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 61616161,
    "total_symbols": 680,
    "total_files": 188,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

WEBHOOK_FACTS = [
    {
        "id": 1401,
        "kind": "webhook_surface",
        "key": "Stripe webhook",
        "value": "POST /webhooks/stripe; FastAPI",
        "source_path": "src/api.py",
        "source_line": 9,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54009,
            "category": "webhook endpoint",
            "source": "route",
            "detail": "POST /webhooks/stripe; FastAPI",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1402,
        "kind": "webhook_surface",
        "key": "Stripe webhook",
        "value": "Stripe webhook signature verification",
        "source_path": "src/api.py",
        "source_line": 11,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54011,
            "category": "signature verification",
            "source": "code-signal",
            "detail": "Stripe webhook signature verification",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1403,
        "kind": "webhook_surface",
        "key": "GitHub webhook for very-long-repository-installation-callback",
        "value": "POST /api/integrations/github/webhooks/installation-events-with-extra-long-path; Express",
        "source_path": "src/server/webhooks/github.ts",
        "source_line": 42,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54042,
            "category": "webhook endpoint",
            "source": "route",
            "detail": "POST /api/integrations/github/webhooks/installation-events-with-extra-long-path; Express",
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
    WEBHOOK_FACTS[0],
]

OVERVIEW = {
    "repo_id": 969,
    "total_files": 188,
    "total_symbols": 680,
    "languages": [{"language": "Python", "file_count": 120, "line_count": 21000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 120, "line_count": 21000}],
    "modules": [{"path": "src", "file_count": 120, "line_count": 21000, "symbol_count": 650, "languages": ["Python"], "sample_files": ["src/api.py"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 72}],
    "doc_sections": [],
    "configs": [{"path": ".env.example", "kind": "config", "detail": "Environment template", "total_lines": 20}],
    "tests": [{"path": "tests/webhooks.test.py", "kind": "test", "detail": "test source", "total_lines": 45}],
    "entry_points": [{"path": "src/api.py", "kind": "entry_point", "detail": "Python app entry point", "total_lines": 120}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "Python", "package_manager": "pip", "source_path": "requirements.txt", "dependency_count": 10, "dev_dependency_count": 0, "detail": "requirements"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "stack_components": [],
    "service_integrations": [],
    "auth_surfaces": [],
    "background_jobs": [],
    "webhook_surfaces": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in WEBHOOK_FACTS
    ],
    "environment_variables": [],
    "ci_workflows": [],
    "container_services": [],
    "runtime_requirements": [],
    "repo_policies": [],
    "code_owners": [],
    "deploy_targets": [],
    "secret_signals": [],
    "route_endpoints": [{"method": "POST", "path": "/webhooks/stripe", "source_path": "src/api.py", "line": 9, "framework": "FastAPI"}],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 650, "class": 30},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 680, "total_files": 188, "functions": 650, "classes": 30, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/969/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/969/facts":
        facts = WEBHOOK_FACTS if query.get("kind") == ["webhook_surface"] else ALL_FACTS
        return {"repo_id": 969, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/969/relationships":
        return {"repo_id": 969, "total": 0, "relationships": []}
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
    page.get_by_text("Stripe webhook - webhook endpoint").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Webhooks").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Stripe webhook", exact=True).first.wait_for(timeout=10000)
    facts.get_by_text("Stripe webhook signature verification").wait_for(timeout=10000)
    facts.get_by_text("GitHub webhook for very-long-repository-installation-callback").wait_for(timeout=10000)
    facts.get_by_text("src/server/webhooks/github.ts:42").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Webhooks filter still shows stale runbook fact")
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

    webhook_requests = [url for url in requests if "/facts" in url and "kind=webhook_surface" in url]
    if len(webhook_requests) < len(VIEWPORTS):
        failures["webhook_requests"] = [f"expected webhook-surface fact request per viewport, got {len(webhook_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"webhook_surface_fact_requests={len(webhook_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("webhook facts filter UI check passed")


if __name__ == "__main__":
    main()
