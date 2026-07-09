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
    "phone-small": "auth-facts-phone-320.png",
    "laptop": "auth-facts-laptop-1366.png",
    "ultrawide": "auth-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "auth-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 947,
    "name": "auth-surface-fixture-with-long-middleware-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "auth947",
    "storage_path": "/tmp/codesniff/auth-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 73737373,
    "total_symbols": 640,
    "total_files": 184,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

AUTH_FACTS = [
    {
        "id": 1201,
        "kind": "auth_surface",
        "key": "NextAuth",
        "value": "NextAuth/Auth.js dependency",
        "source_path": "package.json",
        "source_line": 22,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54022,
            "category": "auth framework",
            "source": "dependency",
            "detail": "NextAuth/Auth.js dependency",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1202,
        "kind": "auth_surface",
        "key": "Passport JWT",
        "value": "Passport JWT strategy dependency",
        "source_path": "package.json",
        "source_line": 23,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54083,
            "category": "jwt",
            "source": "dependency",
            "detail": "Passport JWT strategy dependency",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1203,
        "kind": "auth_surface",
        "key": "Super-long-enterprise-authentication-middleware-name-that-must-wrap",
        "value": "Authentication middleware or guard",
        "source_path": "src/server/auth/middleware.ts",
        "source_line": 44,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54084,
            "category": "auth middleware",
            "source": "code-signal",
            "detail": "Authentication middleware or guard",
            "provenance": {"source": "parsed-source"},
        },
    },
]

ALL_FACTS = [
    {
        "id": 1,
        "kind": "runbook_command",
        "key": "test",
        "value": "vitest run",
        "source_path": "package.json",
        "source_line": None,
        "confidence": "derived",
        "metadata": {"rank": 20000, "provenance": {"source": "manifest"}},
    },
    AUTH_FACTS[0],
]

OVERVIEW = {
    "repo_id": 947,
    "total_files": 184,
    "total_symbols": 640,
    "languages": [{"language": "TypeScript", "file_count": 160, "line_count": 22000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 160, "line_count": 22000}],
    "modules": [{"path": "src", "file_count": 160, "line_count": 22000, "symbol_count": 620, "languages": ["TypeScript"], "sample_files": ["src/server/auth/middleware.ts"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 72}],
    "doc_sections": [],
    "configs": [{"path": "package.json", "kind": "config", "detail": "npm package manifest", "total_lines": 90}],
    "tests": [{"path": "tests/auth.test.ts", "kind": "test", "detail": "test source", "total_lines": 52}],
    "entry_points": [{"path": "src/server/index.ts", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 120}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "pnpm", "source_path": "package.json", "dependency_count": 26, "dev_dependency_count": 8, "detail": "4 scripts"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "vitest run", "source_path": "package.json", "detail": "test script"}],
    "dependencies": [],
    "stack_components": [],
    "service_integrations": [],
    "auth_surfaces": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in AUTH_FACTS
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
    "symbol_types": {"function": 610, "class": 30},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 640, "total_files": 184, "functions": 610, "classes": 30, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/947/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/947/facts":
        facts = AUTH_FACTS if query.get("kind") == ["auth_surface"] else ALL_FACTS
        return {"repo_id": 947, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/947/relationships":
        return {"repo_id": 947, "total": 0, "relationships": []}
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
    page.get_by_text("NextAuth - auth framework").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("vitest run").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Auth").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("NextAuth", exact=True).wait_for(timeout=10000)
    facts.get_by_text("NextAuth/Auth.js dependency").wait_for(timeout=10000)
    facts.get_by_text("Passport JWT", exact=True).wait_for(timeout=10000)
    facts.get_by_text("Super-long-enterprise-authentication-middleware-name-that-must-wrap").wait_for(timeout=10000)
    facts.get_by_text("src/server/auth/middleware.ts:44").wait_for(timeout=10000)
    if facts.get_by_text("vitest run").count() != 0:
        raise AssertionError("Auth filter still shows stale runbook fact")
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

    auth_requests = [url for url in requests if "/facts" in url and "kind=auth_surface" in url]
    if len(auth_requests) < len(VIEWPORTS):
        failures["auth_requests"] = [f"expected auth-surface fact request per viewport, got {len(auth_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"auth_surface_fact_requests={len(auth_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("auth facts filter UI check passed")


if __name__ == "__main__":
    main()
