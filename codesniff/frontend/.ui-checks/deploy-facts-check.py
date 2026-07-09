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
    "phone-small": "deploy-facts-phone-320.png",
    "laptop": "deploy-facts-laptop-1366.png",
    "ultrawide": "deploy-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "deploy-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 843,
    "name": "deploy-target-fixture-with-long-kubernetes-service-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "deploy843",
    "storage_path": "/tmp/codesniff/deploy-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 52525252,
    "total_symbols": 760,
    "total_files": 196,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

DEPLOY_FACTS = [
    {
        "id": 880,
        "kind": "deploy_target",
        "key": "Kubernetes:Deployment:billing-reconciliation-api-with-extremely-long-name",
        "value": "namespace: billing; images: ghcr.io/example/billing-reconciliation-api-with-extremely-long-image:2026.07",
        "source_path": "deploy/k8s/billing-reconciliation.yaml",
        "source_line": 2,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59002,
            "provider": "Kubernetes",
            "target_type": "Deployment",
            "name": "billing-reconciliation-api-with-extremely-long-name",
            "detail": "namespace: billing; images: ghcr.io/example/billing-reconciliation-api-with-extremely-long-image:2026.07",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 881,
        "kind": "deploy_target",
        "key": "Procfile:process:worker",
        "value": "python -m billing.worker --queue reconciliation",
        "source_path": "Procfile",
        "source_line": 2,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59020,
            "provider": "Procfile",
            "target_type": "process",
            "name": "worker",
            "detail": "python -m billing.worker --queue reconciliation",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 882,
        "kind": "deploy_target",
        "key": "Vercel:project:billing-dashboard",
        "value": "framework: nextjs; buildCommand: pnpm build",
        "source_path": "vercel.json",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59030,
            "provider": "Vercel",
            "target_type": "project",
            "name": "billing-dashboard",
            "detail": "framework: nextjs; buildCommand: pnpm build",
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
    DEPLOY_FACTS[0],
]

OVERVIEW = {
    "repo_id": 843,
    "total_files": 196,
    "total_symbols": 760,
    "languages": [{"language": "Python", "file_count": 150, "line_count": 22000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 150, "line_count": 22000}],
    "modules": [{"path": "src", "file_count": 150, "line_count": 22000, "symbol_count": 650, "languages": ["Python"], "sample_files": ["src/main.py"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "configs": [{"path": "deploy/k8s/billing-reconciliation.yaml", "kind": "config", "detail": "tool config", "total_lines": 40}],
    "tests": [{"path": "tests/test_deploy.py", "kind": "test", "detail": "test source", "total_lines": 40}],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "Python app entry point", "total_lines": 100}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "Python", "package_manager": "pip", "source_path": "pyproject.toml", "dependency_count": 3, "dev_dependency_count": 2, "detail": "Python project"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "environment_variables": [],
    "ci_workflows": [],
    "container_services": [],
    "runtime_requirements": [],
    "repo_policies": [],
    "code_owners": [],
    "deploy_targets": [
        {"provider": item["metadata"]["provider"], "target_type": item["metadata"]["target_type"], "name": item["metadata"]["name"], "source_path": item["source_path"], "line": item["source_line"], "detail": item["metadata"]["detail"]}
        for item in DEPLOY_FACTS
    ],
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 650, "class": 110},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 760, "total_files": 196, "functions": 650, "classes": 110, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/843/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/843/facts":
        facts = DEPLOY_FACTS if query.get("kind") == ["deploy_target"] else ALL_FACTS
        return {"repo_id": 843, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/843/relationships":
        return {"repo_id": 843, "total": 0, "relationships": []}
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
    page.get_by_text("Kubernetes Deployment").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Deploy").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Kubernetes:Deployment:billing-reconciliation-api-with-extremely-long-name").wait_for(timeout=10000)
    facts.get_by_text("ghcr.io/example/billing-reconciliation-api-with-extremely-long-image:2026.07").wait_for(timeout=10000)
    facts.get_by_text("Procfile:process:worker").wait_for(timeout=10000)
    facts.get_by_text("vercel.json:1").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Deploy filter still shows stale runbook fact")
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

    deploy_requests = [url for url in requests if "/facts" in url and "kind=deploy_target" in url]
    if len(deploy_requests) < len(VIEWPORTS):
        failures["deploy_requests"] = [f"expected deploy-target fact request per viewport, got {len(deploy_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"deploy_target_fact_requests={len(deploy_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("deploy facts filter UI check passed")


if __name__ == "__main__":
    main()
