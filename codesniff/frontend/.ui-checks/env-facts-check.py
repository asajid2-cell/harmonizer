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
    "phone-small": "env-facts-phone-320.png",
    "laptop": "env-facts-laptop-1366.png",
    "ultrawide": "env-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "env-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 838,
    "name": "env-facts-fixture-with-long-runtime-configuration-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "env838",
    "storage_path": "/tmp/codesniff/env-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 22334455,
    "total_symbols": 640,
    "total_files": 144,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

ENV_FACTS = [
    {
        "id": 830,
        "kind": "env_var",
        "key": "PAYMENTS_RECONCILIATION_DATABASE_URL_WITH_EXTREMELY_LONG_NAME_FOR_LAYOUT_TESTING",
        "value": "environment template variable",
        "source_path": ".env.example",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 62001,
            "source": "env-template",
            "service": "",
            "required": True,
            "has_default": False,
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 831,
        "kind": "env_var",
        "key": "WORKER_CONCURRENCY_FOR_EXTREMELY_LONG_BATCH_IMPORT_SERVICE",
        "value": "api service environment variable",
        "source_path": "docker-compose.yml",
        "source_line": 12,
        "confidence": "heuristic",
        "metadata": {
            "rank": 62012,
            "source": "docker-compose",
            "service": "api",
            "required": False,
            "has_default": True,
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
    ENV_FACTS[0],
]

OVERVIEW = {
    "repo_id": 838,
    "total_files": 144,
    "total_symbols": 640,
    "languages": [{"language": "TypeScript", "file_count": 90, "line_count": 12000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 90, "line_count": 12000}],
    "modules": [{"path": "src", "file_count": 90, "line_count": 12000, "symbol_count": 520, "languages": ["TypeScript"], "sample_files": ["src/main.ts"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 70}],
    "doc_sections": [],
    "configs": [{"path": ".env.example", "kind": "config", "detail": "Environment template", "total_lines": 20}],
    "tests": [{"path": "tests/config.test.ts", "kind": "test", "detail": "test source", "total_lines": 30}],
    "entry_points": [{"path": "src/main.ts", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 120}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "environment_variables": [
        {"name": ENV_FACTS[0]["key"], "detail": ENV_FACTS[0]["value"], "source_path": ".env.example", "line": 1, "source": "env-template", "service": "", "required": True, "has_default": False},
        {"name": ENV_FACTS[1]["key"], "detail": ENV_FACTS[1]["value"], "source_path": "docker-compose.yml", "line": 12, "source": "docker-compose", "service": "api", "required": False, "has_default": True},
    ],
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 500, "class": 140},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 640, "total_files": 144, "functions": 500, "classes": 140, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/838/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/838/facts":
        facts = ENV_FACTS if query.get("kind") == ["env_var"] else ALL_FACTS
        return {"repo_id": 838, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/838/relationships":
        return {"repo_id": 838, "total": 0, "relationships": []}
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
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Env").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("PAYMENTS_RECONCILIATION_DATABASE_URL_WITH_EXTREMELY_LONG_NAME_FOR_LAYOUT_TESTING").wait_for(timeout=10000)
    facts.get_by_text("WORKER_CONCURRENCY_FOR_EXTREMELY_LONG_BATCH_IMPORT_SERVICE").wait_for(timeout=10000)
    facts.get_by_text(".env.example:1").wait_for(timeout=10000)
    facts.get_by_text("docker-compose.yml:12").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Env filter still shows stale runbook fact")
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

    env_requests = [url for url in requests if "/facts" in url and "kind=env_var" in url]
    if len(env_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected env-var fact request per viewport, got {len(env_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"env_var_fact_requests={len(env_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("env facts filter UI check passed")


if __name__ == "__main__":
    main()
