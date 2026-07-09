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
    "phone-small": "job-facts-phone-320.png",
    "laptop": "job-facts-laptop-1366.png",
    "ultrawide": "job-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "job-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 958,
    "name": "background-job-fixture-with-long-worker-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "jobs958",
    "storage_path": "/tmp/codesniff/job-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 64646464,
    "total_symbols": 710,
    "total_files": 202,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

JOB_FACTS = [
    {
        "id": 1301,
        "kind": "background_job",
        "key": "Celery",
        "value": "Celery dependency",
        "source_path": "requirements.txt",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54001,
            "category": "task queue",
            "source": "dependency",
            "detail": "Celery dependency",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1302,
        "kind": "background_job",
        "key": "BullMQ",
        "value": "BullMQ queue dependency",
        "source_path": "package.json",
        "source_line": 28,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54028,
            "category": "task queue",
            "source": "dependency",
            "detail": "BullMQ queue dependency",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1303,
        "kind": "background_job",
        "key": "billing-worker-with-super-long-queue-name-for-mobile-wrapping",
        "value": "Celery worker or task signal; celery -A src.tasks worker --loglevel=info",
        "source_path": "docker-compose.yml",
        "source_line": 14,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54014,
            "category": "queue worker",
            "source": "container-service",
            "detail": "Celery worker or task signal; celery -A src.tasks worker --loglevel=info",
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
    JOB_FACTS[0],
]

OVERVIEW = {
    "repo_id": 958,
    "total_files": 202,
    "total_symbols": 710,
    "languages": [{"language": "Python", "file_count": 150, "line_count": 25000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 150, "line_count": 25000}],
    "modules": [{"path": "src", "file_count": 150, "line_count": 25000, "symbol_count": 690, "languages": ["Python"], "sample_files": ["src/tasks.py"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 60}],
    "doc_sections": [],
    "configs": [{"path": "docker-compose.yml", "kind": "config", "detail": "Docker Compose file", "total_lines": 44}],
    "tests": [{"path": "tests/tasks.test.py", "kind": "test", "detail": "test source", "total_lines": 35}],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "Python app entry point", "total_lines": 110}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "Python", "package_manager": "pip", "source_path": "requirements.txt", "dependency_count": 12, "dev_dependency_count": 0, "detail": "requirements"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "stack_components": [],
    "service_integrations": [],
    "auth_surfaces": [],
    "background_jobs": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in JOB_FACTS
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
    "symbol_types": {"function": 690, "class": 20},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 710, "total_files": 202, "functions": 690, "classes": 20, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/958/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/958/facts":
        facts = JOB_FACTS if query.get("kind") == ["background_job"] else ALL_FACTS
        return {"repo_id": 958, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/958/relationships":
        return {"repo_id": 958, "total": 0, "relationships": []}
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
    page.get_by_text("Celery - task queue").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Jobs").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Celery", exact=True).wait_for(timeout=10000)
    facts.get_by_text("Celery dependency").wait_for(timeout=10000)
    facts.get_by_text("BullMQ", exact=True).wait_for(timeout=10000)
    facts.get_by_text("billing-worker-with-super-long-queue-name-for-mobile-wrapping").wait_for(timeout=10000)
    facts.get_by_text("docker-compose.yml:14").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Jobs filter still shows stale runbook fact")
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

    job_requests = [url for url in requests if "/facts" in url and "kind=background_job" in url]
    if len(job_requests) < len(VIEWPORTS):
        failures["job_requests"] = [f"expected background-job fact request per viewport, got {len(job_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"background_job_fact_requests={len(job_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("job facts filter UI check passed")


if __name__ == "__main__":
    main()
