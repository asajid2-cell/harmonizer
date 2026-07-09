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
    "phone-small": "secret-facts-phone-320.png",
    "laptop": "secret-facts-laptop-1366.png",
    "ultrawide": "secret-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "secret-facts"
TARGET = "http://127.0.0.1:5174/"
RAW_SECRET_VALUE = "tok_live_should_never_render_in_codesniff_ui_20260706"

REPO = {
    "id": 844,
    "name": "secret-signal-fixture-with-long-redacted-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "secrets844",
    "storage_path": "/tmp/codesniff/secret-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 62626262,
    "total_symbols": 710,
    "total_files": 184,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

SECRET_FACTS = [
    {
        "id": 890,
        "kind": "secret_signal",
        "key": "PAYMENTS_ACCESS_TOKEN_FOR_RECONCILIATION_WITH_EXTRA_LONG_NAME",
        "value": "token signal; value redacted",
        "source_path": ".env.example",
        "source_line": 3,
        "confidence": "heuristic",
        "metadata": {
            "rank": 61003,
            "category": "token",
            "source": "assignment",
            "has_value": True,
            "redacted": True,
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 891,
        "kind": "secret_signal",
        "key": "STRIPE_SECRET_KEY_FOR_BILLING_WEBHOOKS",
        "value": "secret signal; value redacted",
        "source_path": "src/billing/config.ts",
        "source_line": 14,
        "confidence": "heuristic",
        "metadata": {
            "rank": 61014,
            "category": "secret",
            "source": "code-assignment",
            "has_value": True,
            "redacted": True,
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
    SECRET_FACTS[0],
]

OVERVIEW = {
    "repo_id": 844,
    "total_files": 184,
    "total_symbols": 710,
    "languages": [{"language": "TypeScript", "file_count": 126, "line_count": 21000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 126, "line_count": 21000}],
    "modules": [{"path": "src", "file_count": 126, "line_count": 21000, "symbol_count": 640, "languages": ["TypeScript"], "sample_files": ["src/main.ts"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 82}],
    "doc_sections": [],
    "configs": [{"path": ".env.example", "kind": "config", "detail": "environment template", "total_lines": 18}],
    "tests": [{"path": "tests/secrets.test.ts", "kind": "test", "detail": "test source", "total_lines": 45}],
    "entry_points": [{"path": "src/main.ts", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 110}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "pnpm", "source_path": "package.json", "dependency_count": 12, "dev_dependency_count": 7, "detail": "4 scripts"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "environment_variables": [],
    "ci_workflows": [],
    "container_services": [],
    "runtime_requirements": [],
    "repo_policies": [],
    "code_owners": [],
    "deploy_targets": [],
    "secret_signals": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "has_value": item["metadata"]["has_value"],
            "detail": item["value"],
        }
        for item in SECRET_FACTS
    ],
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 640, "class": 70},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 710, "total_files": 184, "functions": 640, "classes": 70, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/844/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/844/facts":
        facts = SECRET_FACTS if query.get("kind") == ["secret_signal"] else ALL_FACTS
        return {"repo_id": 844, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/844/relationships":
        return {"repo_id": 844, "total": 0, "relationships": []}
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
    page.get_by_text("token: PAYMENTS_ACCESS_TOKEN_FOR_RECONCILIATION_WITH_EXTRA_LONG_NAME").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Secrets").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("PAYMENTS_ACCESS_TOKEN_FOR_RECONCILIATION_WITH_EXTRA_LONG_NAME").wait_for(timeout=10000)
    facts.get_by_text("token signal; value redacted").wait_for(timeout=10000)
    facts.get_by_text("STRIPE_SECRET_KEY_FOR_BILLING_WEBHOOKS").wait_for(timeout=10000)
    facts.get_by_text("src/billing/config.ts:14").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Secrets filter still shows stale runbook fact")
    if RAW_SECRET_VALUE in page.content():
        raise AssertionError("Raw secret-looking value rendered in the UI")
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

    secret_requests = [url for url in requests if "/facts" in url and "kind=secret_signal" in url]
    if len(secret_requests) < len(VIEWPORTS):
        failures["secret_requests"] = [f"expected secret-signal fact request per viewport, got {len(secret_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"secret_signal_fact_requests={len(secret_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("secret facts filter UI check passed")


if __name__ == "__main__":
    main()
