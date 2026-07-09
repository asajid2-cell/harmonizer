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
    "phone-small": "teaching-phone-320.png",
    "laptop": "teaching-laptop-1366.png",
    "ultrawide": "teaching-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "teaching"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 712,
    "name": "teaching-fixture-with-a-very-long-name-for-layout-testing",
    "source_type": "github",
    "source_url": "https://github.com/example/teaching-fixture",
    "status": "lexical_ready",
    "active_revision": "abc1234",
    "storage_path": "/tmp/codesniff/teaching-fixture",
    "created_at": "2026-07-05T00:00:00Z",
    "updated_at": "2026-07-05T00:00:00Z",
    "last_opened_at": "2026-07-05T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 987654321,
    "total_symbols": 55555,
    "total_files": 100000,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
    "refresh_interval_minutes": 1440,
    "next_refresh_at": "2026-07-06T12:00:00Z",
    "last_scheduled_refresh_at": None,
}

OVERVIEW = {
    "repo_id": 712,
    "total_files": 100000,
    "total_symbols": 55555,
    "languages": [{"language": "TypeScript", "file_count": 30000, "line_count": 900000}],
    "top_directories": [{"path": "packages", "file_count": 18000, "line_count": 700000}],
    "modules": [
        {
            "path": "packages/extremely-long-teaching-module-name-for-wrapping",
            "file_count": 2400,
            "line_count": 180000,
            "symbol_count": 16000,
            "languages": ["TypeScript"],
            "sample_files": ["packages/extremely-long-teaching-module-name-for-wrapping/src/index.ts"],
        }
    ],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 120}],
    "configs": [{"path": "package.json", "kind": "config", "detail": "npm package manifest", "total_lines": 80}],
    "tests": [{"path": "tests/extremely_long_teaching_flow_test.spec.ts", "kind": "test", "detail": "test source", "total_lines": 160}],
    "entry_points": [{"path": "src/main.ts", "kind": "entry_point", "detail": "runtime entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "pnpm", "source_path": "package.json", "dependency_count": 30, "dev_dependency_count": 14, "detail": "pnpm workspace"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pnpm test -- --runInBand --reporter=verbose", "source_path": "package.json", "detail": "package script"}],
    "dependencies": [{"name": "@workspace/super-long-runtime-contract-package", "ecosystem": "JavaScript/TypeScript", "scope": "runtime", "source_path": "package.json"}],
    "route_endpoints": [{"method": "GET", "path": "/api/extremely-long-teaching-route/:accountId", "source_path": "src/routes/accounts.ts", "line": 42, "framework": "express"}],
    "import_relationships": [{"source_path": "src/main.ts", "target": "@workspace/extremely-long-runtime-contracts", "source_line": 3, "confidence": "parsed", "syntax": "import-from"}],
    "symbol_types": {"function": 9000, "class": 1200},
    "top_symbols": [],
    "warnings": [],
}

TEACHING = {
    "repo_id": 712,
    "generated_from": "cold_overview_v1",
    "warnings": [],
    "steps": [
        {
            "id": "start",
            "title": "Start",
            "summary": "Start with src/main.ts. Then read README.md. The indexed surface is mostly TypeScript, JSON, Markdown, and SQL.",
            "citations": [
                {"source_path": "src/main.ts", "source_line": 1, "label": "runtime entry point", "kind": "entry_point"},
                {"source_path": "README.md", "source_line": 1, "label": "repo documentation", "kind": "doc"},
            ],
        },
        {
            "id": "run",
            "title": "Run",
            "summary": "Use the manifest-derived commands: test: pnpm test -- --runInBand --reporter=verbose; build: pnpm build --filter extremely-long-package-name.",
            "citations": [
                {"source_path": "package.json", "source_line": None, "label": "pnpm test -- --runInBand --reporter=verbose", "kind": "runbook_command"}
            ],
        },
        {
            "id": "api",
            "title": "APIs",
            "summary": "The first API surface includes GET /api/extremely-long-teaching-route/:accountId (express).",
            "citations": [
                {"source_path": "src/routes/accounts_with_a_very_long_file_name_for_wrapping.ts", "source_line": 42, "label": "GET /api/extremely-long-teaching-route/:accountId", "kind": "route_endpoint"}
            ],
        },
        {
            "id": "modules",
            "title": "Modules",
            "summary": "Primary modules are packages/extremely-long-teaching-module-name-for-wrapping (2400 files, 16000 symbols).",
            "citations": [
                {"source_path": "packages/extremely-long-teaching-module-name-for-wrapping/src/index.ts", "source_line": 1, "label": "packages/extremely-long-teaching-module-name-for-wrapping", "kind": "module"}
            ],
        },
    ],
}

TEACHING_QUERY = {
    "repo_id": 712,
    "question": "How does the long account route work?",
    "generated_from": "cold_teaching_query_v1",
    "answer": "Cold artifacts point first to GET /api/extremely-long-teaching-route/:accountId, accountRouteHandlerWithAnExcessivelyLongName.",
    "warnings": [],
    "evidence": [
        {
            "kind": "route",
            "title": "GET /api/extremely-long-teaching-route/:accountId",
            "summary": "GET /api/extremely-long-teaching-route/:accountId is defined by express.",
            "score": 4.0,
            "citations": [
                {"source_path": "src/routes/accounts_with_a_very_long_file_name_for_wrapping.ts", "source_line": 42, "label": "GET /api/extremely-long-teaching-route/:accountId", "kind": "route_endpoint"}
            ],
        },
        {
            "kind": "search_result",
            "title": "accountRouteHandlerWithAnExcessivelyLongName",
            "summary": "accountRouteHandlerWithAnExcessivelyLongName in src/routes/accounts_with_a_very_long_file_name_for_wrapping.ts matched the question through cold lexical search.",
            "score": 3.0,
            "citations": [
                {"source_path": "src/routes/accounts_with_a_very_long_file_name_for_wrapping.ts", "source_line": 48, "label": "accountRouteHandlerWithAnExcessivelyLongName", "kind": "function"}
            ],
        },
    ],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 55555, "total_files": 100000, "functions": 9000, "classes": 1200, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/712/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/712/teaching":
        return TEACHING
    if path == "/api/codesniff/repos/712/teaching/query":
        return TEACHING_QUERY
    if path == "/api/codesniff/repos/712/facts":
        kind = query.get("kind", [""])[0]
        if kind:
            return {"repo_id": 712, "total": 0, "facts": []}
        return {"repo_id": 712, "total": 0, "facts": []}
    if path == "/api/codesniff/repos/712/relationships":
        return {"repo_id": 712, "total": 0, "relationships": []}
    return None


def scan_layout(page):
    return page.evaluate(
        """
        () => {
          const out = [];
          const de = document.documentElement;
          const vw = de.clientWidth;
          const visible = (el) => {
            for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
              const s = getComputedStyle(n);
              if (n.hidden || n.inert || n.getAttribute('aria-hidden') === 'true' || s.display === 'none' || s.visibility === 'hidden' || (Number(s.opacity) === 0 && s.pointerEvents === 'none')) return false;
            }
            return true;
          };
          if (de.scrollWidth > vw + 1) out.push(`h-overflow:${de.scrollWidth}>${vw}`);
          const controls = document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role="button"], [onclick]');
          for (const el of controls) {
            if (!visible(el)) continue;
            const r = el.getBoundingClientRect();
            const label = ((el.innerText || el.value || el.getAttribute('aria-label') || el.tagName) + '').trim().slice(0, 70);
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
    panel = page.locator("[data-ui='repo-teaching']")
    panel.get_by_text("GET /api/extremely-long-teaching-route/:accountId").wait_for(timeout=10000)
    panel.get_by_text("src/routes/accounts_with_a_very_long_file_name_for_wrapping.ts:42").wait_for(timeout=10000)
    panel.get_by_text("packages/extremely-long-teaching-module-name-for-wrapping/src/index.ts:1").wait_for(timeout=10000)
    panel.locator("[data-ui='teaching-query-input']").fill("How does the long account route work?")
    panel.locator("[data-ui='teaching-query-run']").click()
    panel.get_by_text("Cold artifacts point first to GET /api/extremely-long-teaching-route/:accountId").wait_for(timeout=10000)
    panel.get_by_text("accountRouteHandlerWithAnExcessivelyLongName", exact=True).wait_for(timeout=10000)
    panel.get_by_text("src/routes/accounts_with_a_very_long_file_name_for_wrapping.ts:48").wait_for(timeout=10000)
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

    teaching_requests = [url for url in requests if urlparse(url).path == "/api/codesniff/repos/712/teaching"]
    query_requests = [url for url in requests if urlparse(url).path == "/api/codesniff/repos/712/teaching/query"]
    if len(teaching_requests) < len(VIEWPORTS):
        failures["teaching_requests"] = [f"expected teaching request per viewport, got {len(teaching_requests)}"]
    if len(query_requests) < len(VIEWPORTS):
        failures["teaching_query_requests"] = [f"expected teaching query request per viewport, got {len(query_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"teaching_requests={len(teaching_requests)}")
    print(f"teaching_query_requests={len(query_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("teaching UI check passed")


if __name__ == "__main__":
    main()
