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
    "phone-small": "service-facts-phone-320.png",
    "laptop": "service-facts-laptop-1366.png",
    "ultrawide": "service-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "service-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 840,
    "name": "compose-service-fixture-with-long-topology-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "svc840",
    "storage_path": "/tmp/codesniff/service-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 44556677,
    "total_symbols": 880,
    "total_files": 204,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

SERVICE_FACTS = [
    {
        "id": 850,
        "kind": "container_service",
        "key": "billing-reconciliation-api-with-extremely-long-compose-service-name",
        "value": "image: ghcr.io/example/billing-reconciliation-api-with-extremely-long-image-name:2026.07; ports: 8080:80; depends on: postgres-primary-database, redis-cache",
        "source_path": "docker-compose.yml",
        "source_line": 2,
        "confidence": "heuristic",
        "metadata": {
            "rank": 57002,
            "provider": "docker-compose",
            "image": "ghcr.io/example/billing-reconciliation-api-with-extremely-long-image-name:2026.07",
            "build": "",
            "command": "",
            "ports": ["8080:80"],
            "depends_on": ["postgres-primary-database", "redis-cache"],
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 851,
        "kind": "container_service",
        "key": "postgres-primary-database",
        "value": "image: postgres:16; ports: 5432:5432",
        "source_path": "docker-compose.yml",
        "source_line": 14,
        "confidence": "heuristic",
        "metadata": {
            "rank": 57014,
            "provider": "docker-compose",
            "image": "postgres:16",
            "build": "",
            "command": "",
            "ports": ["5432:5432"],
            "depends_on": [],
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
    SERVICE_FACTS[0],
]

OVERVIEW = {
    "repo_id": 840,
    "total_files": 204,
    "total_symbols": 880,
    "languages": [{"language": "Python", "file_count": 150, "line_count": 22000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 150, "line_count": 22000}],
    "modules": [{"path": "src", "file_count": 150, "line_count": 22000, "symbol_count": 760, "languages": ["Python"], "sample_files": ["src/main.py"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 60}],
    "doc_sections": [],
    "configs": [{"path": "docker-compose.yml", "kind": "config", "detail": "Docker Compose app", "total_lines": 36}],
    "tests": [{"path": "tests/test_services.py", "kind": "test", "detail": "test source", "total_lines": 50}],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "Python app entry point", "total_lines": 100}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "environment_variables": [],
    "ci_workflows": [],
    "container_services": [
        {"name": item["key"], "detail": item["value"], "source_path": item["source_path"], "line": item["source_line"], "provider": item["metadata"]["provider"], "image": item["metadata"]["image"], "build": item["metadata"]["build"], "command": item["metadata"]["command"], "ports": item["metadata"]["ports"], "depends_on": item["metadata"]["depends_on"]}
        for item in SERVICE_FACTS
    ],
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 760, "class": 120},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 880, "total_files": 204, "functions": 760, "classes": 120, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/840/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/840/facts":
        facts = SERVICE_FACTS if query.get("kind") == ["container_service"] else ALL_FACTS
        return {"repo_id": 840, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/840/relationships":
        return {"repo_id": 840, "total": 0, "relationships": []}
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
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Services").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("billing-reconciliation-api-with-extremely-long-compose-service-name").wait_for(timeout=10000)
    facts.get_by_text("postgres-primary-database", exact=True).wait_for(timeout=10000)
    facts.get_by_text("docker-compose.yml:2").wait_for(timeout=10000)
    if facts.get_by_text("pytest", exact=True).count() != 0:
        raise AssertionError("Services filter still shows stale runbook fact")
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

    service_requests = [url for url in requests if "/facts" in url and "kind=container_service" in url]
    if len(service_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected container-service fact request per viewport, got {len(service_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"container_service_fact_requests={len(service_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("service facts filter UI check passed")


if __name__ == "__main__":
    main()
