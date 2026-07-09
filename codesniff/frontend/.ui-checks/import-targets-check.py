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
    "phone-small": "import-targets-phone-320.png",
    "laptop": "import-targets-laptop-1366.png",
    "ultrawide": "import-targets-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "import-targets"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 616,
    "name": "resolved-import-target-fixture-with-long-common-language-paths",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "import616",
    "storage_path": "/tmp/codesniff/resolved-imports",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 456789123,
    "total_symbols": 8800,
    "total_files": 1800,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
    "refresh_interval_minutes": 1440,
    "next_refresh_at": None,
    "last_scheduled_refresh_at": None,
}

IMPORTS = [
    {
        "source_path": "cmd/server.go",
        "target": "example.com/acme/app/internal/billing/verylongpackagename",
        "target_path": "internal/billing/verylongpackagename/service.go",
        "source_line": 6,
        "confidence": "heuristic",
        "syntax": "go-import-block",
    },
    {
        "source_path": "src/main/java/example/App.java",
        "target": "example.reports.ExtremelyLongReportControllerAdapter",
        "target_path": "src/main/java/example/reports/ExtremelyLongReportControllerAdapter.java",
        "source_line": 5,
        "confidence": "heuristic",
        "syntax": "jvm-import",
    },
    {
        "source_path": "scripts/bootstrap.sh",
        "target": "./lib/functions.sh",
        "target_path": "scripts/lib/functions.sh",
        "source_line": 2,
        "confidence": "heuristic",
        "syntax": "shell-dot-source",
    },
]

IMPORT_RELATIONSHIPS = [
    {
        "id": index + 800,
        "src_kind": "file",
        "src_id": index + 20,
        "source_path": item["source_path"],
        "dst_kind": "module",
        "dst_id": None,
        "rel_type": "imports",
        "target": item["target"],
        "confidence": item["confidence"],
        "source_line": item["source_line"],
        "metadata": {
            "source_path": item["source_path"],
            "syntax": item["syntax"],
            "target_path": item["target_path"],
            "target_resolution": "indexed-file",
        },
    }
    for index, item in enumerate(IMPORTS)
]

OVERVIEW = {
    "repo_id": 616,
    "total_files": 1800,
    "total_symbols": 8800,
    "languages": [
        {"language": "Go", "file_count": 240, "line_count": 41000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "Java", "file_count": 300, "line_count": 64000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "Shell", "file_count": 40, "line_count": 3000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
    ],
    "top_directories": [{"path": "src", "file_count": 900, "line_count": 118000}],
    "modules": [
        {
            "path": "src/main/java/example/reports",
            "file_count": 22,
            "line_count": 5400,
            "symbol_count": 420,
            "languages": ["Java"],
            "sample_files": ["src/main/java/example/reports/ExtremelyLongReportControllerAdapter.java"],
        }
    ],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 70}],
    "configs": [{"path": "go.mod", "kind": "config", "detail": "Go module manifest", "total_lines": 20}],
    "tests": [{"path": "tests/import_graph_test.go", "kind": "test", "detail": "test source", "total_lines": 45}],
    "entry_points": [{"path": "cmd/server.go", "kind": "entry_point", "detail": "Go command entry point", "total_lines": 90}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "go test ./...", "source_path": "go.mod", "detail": "Go tests"}],
    "dependencies": [],
    "route_endpoints": [],
    "import_relationships": IMPORTS,
    "schema_facts": [],
    "symbol_types": {"function": 2600, "class": 900},
    "top_symbols": [],
    "warnings": [],
}

TEACHING = {
    "repo_id": 616,
    "generated_from": "cold_overview_v1",
    "warnings": [],
    "steps": [
        {
            "id": "imports",
            "title": "Imports",
            "summary": "Resolved import targets point from module names to indexed files.",
            "citations": [{"source_path": "cmd/server.go", "source_line": 6, "label": "internal/billing/verylongpackagename/service.go", "kind": "import"}],
        }
    ],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 8800, "total_files": 1800, "functions": 2600, "classes": 900, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/616/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/616/teaching":
        return TEACHING
    if path == "/api/codesniff/repos/616/facts":
        return {"repo_id": 616, "total": 0, "facts": []}
    if path == "/api/codesniff/repos/616/relationships":
        relationships = IMPORT_RELATIONSHIPS if query.get("rel_type") == ["imports"] else []
        return {"repo_id": 616, "total": len(relationships), "relationships": relationships}
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
    overview = page.locator("[data-ui='repo-overview']")
    overview.get_by_text("example.com/acme/app/internal/billing/verylongpackagename").wait_for(timeout=10000)
    overview.get_by_text("target: internal/billing/verylongpackagename/service.go").wait_for(timeout=10000)
    overview.get_by_text("target: src/main/java/example/reports/ExtremelyLongReportControllerAdapter.java").wait_for(timeout=10000)

    page.locator("[data-ui='relationship-filter']").get_by_role("button", name="Imports").click()
    relationships = page.locator("[data-ui='repo-relationships']")
    relationships.get_by_text("example.reports.ExtremelyLongReportControllerAdapter").wait_for(timeout=10000)
    relationships.get_by_text("src/main/java/example/reports/ExtremelyLongReportControllerAdapter.java").wait_for(timeout=10000)
    relationships.get_by_text("indexed-file").first.wait_for(timeout=10000)

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

    import_relationship_requests = [url for url in requests if "/relationships" in url and "rel_type=imports" in url]
    if len(import_relationship_requests) < len(VIEWPORTS):
        failures["relationship_requests"] = [f"expected import relationship request per viewport, got {len(import_relationship_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"import_relationship_requests={len(import_relationship_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("import targets UI check passed")


if __name__ == "__main__":
    main()
