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
    "phone-small": "stack-facts-phone-320.png",
    "laptop": "stack-facts-laptop-1366.png",
    "ultrawide": "stack-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "stack-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 845,
    "name": "stack-framework-fixture-with-long-component-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "stack845",
    "storage_path": "/tmp/codesniff/stack-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 72727272,
    "total_symbols": 840,
    "total_files": 214,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

STACK_FACTS = [
    {
        "id": 900,
        "kind": "stack_component",
        "key": "Next.js",
        "value": "Next.js dependency",
        "source_path": "package.json",
        "source_line": 21,
        "confidence": "heuristic",
        "metadata": {
            "rank": 52021,
            "category": "full-stack framework",
            "ecosystem": "JavaScript/TypeScript",
            "source": "dependency",
            "detail": "Next.js dependency",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 901,
        "kind": "stack_component",
        "key": "Prisma",
        "value": "Prisma dependency",
        "source_path": "package.json",
        "source_line": 24,
        "confidence": "heuristic",
        "metadata": {
            "rank": 52024,
            "category": "data layer",
            "ecosystem": "JavaScript/TypeScript",
            "source": "dependency",
            "detail": "Prisma dependency",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 902,
        "kind": "stack_component",
        "key": "pnpm-workspace-package-manager-with-extra-long-label",
        "value": "workspace package manager from package.json and pnpm-lock.yaml",
        "source_path": "package.json",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 52040,
            "category": "package manager",
            "ecosystem": "JavaScript/TypeScript",
            "source": "manifest",
            "detail": "workspace package manager from package.json and pnpm-lock.yaml",
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
    STACK_FACTS[0],
]

OVERVIEW = {
    "repo_id": 845,
    "total_files": 214,
    "total_symbols": 840,
    "languages": [{"language": "TypeScript", "file_count": 160, "line_count": 26000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 160, "line_count": 26000}],
    "modules": [{"path": "src", "file_count": 160, "line_count": 26000, "symbol_count": 760, "languages": ["TypeScript"], "sample_files": ["src/app/page.tsx"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 88}],
    "doc_sections": [],
    "configs": [{"path": "package.json", "kind": "config", "detail": "npm package manifest", "total_lines": 70}],
    "tests": [{"path": "tests/stack.test.ts", "kind": "test", "detail": "test source", "total_lines": 40}],
    "entry_points": [{"path": "src/app/page.tsx", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 130}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "pnpm", "source_path": "package.json", "dependency_count": 20, "dev_dependency_count": 9, "detail": "5 scripts"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "stack_components": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "ecosystem": item["metadata"]["ecosystem"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in STACK_FACTS
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
    "symbol_types": {"function": 760, "class": 80},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 840, "total_files": 214, "functions": 760, "classes": 80, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/845/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/845/facts":
        facts = STACK_FACTS if query.get("kind") == ["stack_component"] else ALL_FACTS
        return {"repo_id": 845, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/845/relationships":
        return {"repo_id": 845, "total": 0, "relationships": []}
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
    page.get_by_text("Next.js - full-stack framework").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Stack").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Next.js", exact=True).wait_for(timeout=10000)
    facts.get_by_text("Next.js dependency").wait_for(timeout=10000)
    facts.get_by_text("Prisma", exact=True).wait_for(timeout=10000)
    facts.get_by_text("pnpm-workspace-package-manager-with-extra-long-label").wait_for(timeout=10000)
    facts.get_by_text("package.json:1").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Stack filter still shows stale runbook fact")
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

    stack_requests = [url for url in requests if "/facts" in url and "kind=stack_component" in url]
    if len(stack_requests) < len(VIEWPORTS):
        failures["stack_requests"] = [f"expected stack-component fact request per viewport, got {len(stack_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"stack_component_fact_requests={len(stack_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("stack facts filter UI check passed")


if __name__ == "__main__":
    main()
