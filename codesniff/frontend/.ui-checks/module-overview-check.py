from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

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
    "phone-small": "modules-phone-320.png",
    "laptop": "modules-laptop-1366.png",
    "ultrawide": "modules-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "modules"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 328,
    "name": "module-map-fixture-with-a-very-long-name-for-layout-testing",
    "source_type": "github",
    "source_url": "https://github.com/example/module-map-fixture",
    "status": "lexical_ready",
    "active_revision": "abc1234",
    "storage_path": "/tmp/codesniff/module-map-fixture",
    "created_at": "2026-07-05T00:00:00Z",
    "updated_at": "2026-07-05T00:00:00Z",
    "last_opened_at": "2026-07-05T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 1234567890,
    "total_symbols": 98765,
    "total_files": 100000,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

OVERVIEW = {
    "repo_id": 328,
    "total_files": 100000,
    "total_symbols": 98765,
    "languages": [
        {"language": "TypeScript", "file_count": 21000, "line_count": 900000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "Python", "file_count": 12000, "line_count": 550000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "GraphQL", "file_count": 9000, "line_count": 300000, "support_level": "searchable", "symbol_aware": False, "searchable": True},
    ],
    "top_directories": [{"path": "packages", "file_count": 18000, "line_count": 700000}],
    "modules": [
        {
            "path": "packages/extremely-long-analytics-api-client-name",
            "file_count": 2400,
            "line_count": 180000,
            "symbol_count": 16000,
            "languages": ["TypeScript"],
            "sample_files": [
                "packages/extremely-long-analytics-api-client-name/src/index.ts",
                "packages/extremely-long-analytics-api-client-name/src/transport/http.ts",
            ],
        },
        {
            "path": "src/authentication_and_authorization",
            "file_count": 315,
            "line_count": 42000,
            "symbol_count": 4100,
            "languages": ["Python"],
            "sample_files": [
                "src/authentication_and_authorization/service.py",
                "src/authentication_and_authorization/models.py",
            ],
        },
    ],
    "module_dependencies": [
        {
            "source_module": "packages/extremely-long-analytics-api-client-name",
            "target_module": "packages/shared-normalizers",
            "source_path": "packages/extremely-long-analytics-api-client-name/src/transport/http_with_a_very_long_filename_for_wrapping.ts",
            "target_path": "packages/shared-normalizers/src/payloads/analytics.ts",
            "source_line": 44,
            "import_count": 3,
            "sample_imports": [
                {
                    "source_path": "packages/extremely-long-analytics-api-client-name/src/transport/http_with_a_very_long_filename_for_wrapping.ts",
                    "target": "@workspace/shared-normalizers/analytics",
                    "target_path": "packages/shared-normalizers/src/payloads/analytics.ts",
                    "source_line": 44,
                    "syntax": "import-from",
                }
            ],
        },
        {
            "source_module": "apps/operations-console",
            "target_module": "packages/extremely-long-analytics-api-client-name",
            "source_path": "apps/operations-console/src/features/reporting/analytics_bootstrapper_with_a_long_name.ts",
            "target_path": "packages/extremely-long-analytics-api-client-name/src/index.ts",
            "source_line": 91,
            "import_count": 2,
            "sample_imports": [],
        },
    ],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 120}],
    "configs": [],
    "tests": [],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "runtime entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "route_endpoints": [],
    "import_relationships": [],
    "symbol_types": {"class": 1200, "function": 9000},
    "top_symbols": [],
    "warnings": [],
}

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
    {
        "id": 2,
        "kind": "module",
        "key": "packages/extremely-long-analytics-api-client-name",
        "value": "2400 files, 16000 symbols",
        "source_path": "packages/extremely-long-analytics-api-client-name",
        "source_line": None,
        "confidence": "indexed_summary",
        "metadata": {
            "rank": 75001,
            "file_count": 2400,
            "line_count": 180000,
            "symbol_count": 16000,
            "languages": ["TypeScript"],
            "sample_files": ["packages/extremely-long-analytics-api-client-name/src/index.ts"],
            "provenance": {"source": "indexed-metadata"},
        },
    },
]

MODULE_FACTS = [fact for fact in ALL_FACTS if fact["kind"] == "module"]

MODULE_DEPENDENCY_FACTS = [
    {
        "id": 3,
        "kind": "module_dependency",
        "key": "packages/extremely-long-analytics-api-client-name -> packages/shared-normalizers",
        "value": "3 resolved imports",
        "source_path": "packages/extremely-long-analytics-api-client-name/src/transport/http_with_a_very_long_filename_for_wrapping.ts",
        "source_line": 44,
        "confidence": "derived",
        "metadata": {
            "rank": 72000,
            "source_module": "packages/extremely-long-analytics-api-client-name",
            "target_module": "packages/shared-normalizers",
            "target_path": "packages/shared-normalizers/src/payloads/analytics.ts",
            "import_count": 3,
            "provenance": {"source": "indexed-metadata"},
        },
    }
]

MODULE_DETAIL = {
    "repo_id": 328,
    "module_path": "packages/extremely-long-analytics-api-client-name",
    "file_count": 2400,
    "line_count": 180000,
    "symbol_count": 16000,
    "languages": ["TypeScript"],
    "files": [
        {
            "id": 101,
            "path": "packages/extremely-long-analytics-api-client-name/src/transport/http_with_a_very_long_filename_for_wrapping.ts",
            "total_lines": 420,
            "indexed_at": "2026-07-05T00:00:00Z",
            "symbol_count": 24,
            "language": "TypeScript",
        },
        {
            "id": 102,
            "path": "packages/extremely-long-analytics-api-client-name/src/index.ts",
            "total_lines": 88,
            "indexed_at": "2026-07-05T00:00:00Z",
            "symbol_count": 12,
            "language": "TypeScript",
        },
    ],
    "symbols": [
        {
            "id": 201,
            "name": "createAnalyticsTransportWithExtremelyLongName",
            "symbol_type": "function",
            "file_path": "packages/extremely-long-analytics-api-client-name/src/transport/http_with_a_very_long_filename_for_wrapping.ts",
            "start_line": 12,
            "end_line": 56,
            "docstring": None,
        },
        {
            "id": 202,
            "name": "AnalyticsTransportConfiguration",
            "symbol_type": "interface",
            "file_path": "packages/extremely-long-analytics-api-client-name/src/index.ts",
            "start_line": 4,
            "end_line": 10,
            "docstring": None,
        },
    ],
    "imports": [
        {
            "id": 301,
            "rel_type": "imports",
            "source_path": "packages/extremely-long-analytics-api-client-name/src/transport/http_with_a_very_long_filename_for_wrapping.ts",
            "source_symbol": None,
            "target": "@workspace/shared-super-long-runtime-contracts",
            "target_path": None,
            "target_symbol": None,
            "confidence": "heuristic",
            "source_line": 3,
            "metadata": {"syntax": "import-from"},
        }
    ],
    "exports": [
        {
            "id": 302,
            "rel_type": "exports",
            "source_path": "packages/extremely-long-analytics-api-client-name/src/index.ts",
            "source_symbol": None,
            "target": "createAnalyticsTransportWithExtremelyLongName",
            "target_path": "packages/extremely-long-analytics-api-client-name/src/index.ts",
            "target_symbol": "createAnalyticsTransportWithExtremelyLongName",
            "confidence": "heuristic",
            "source_line": 6,
            "metadata": {"syntax": "export-list", "exported_as": "createAnalyticsTransportWithExtremelyLongName"},
        }
    ],
    "outgoing": [
        {
            "id": 305,
            "rel_type": "depends_on_module",
            "source_path": "packages/extremely-long-analytics-api-client-name/src/transport/http_with_a_very_long_filename_for_wrapping.ts",
            "source_symbol": None,
            "target": "packages/shared-normalizers",
            "target_path": "packages/shared-normalizers/src/payloads/analytics.ts",
            "target_symbol": None,
            "confidence": "derived",
            "source_line": 44,
            "metadata": {
                "source_module": "packages/extremely-long-analytics-api-client-name",
                "target_module": "packages/shared-normalizers",
                "target_path": "packages/shared-normalizers/src/payloads/analytics.ts",
                "import_count": 3,
            },
        },
        {
            "id": 303,
            "rel_type": "calls",
            "source_path": "packages/extremely-long-analytics-api-client-name/src/transport/http_with_a_very_long_filename_for_wrapping.ts",
            "source_symbol": "createAnalyticsTransportWithExtremelyLongName",
            "target": "normalizeAnalyticsPayloadWithLongInternalIdentifier",
            "target_path": "packages/shared-normalizers/src/payloads/analytics.ts",
            "target_symbol": "normalizeAnalyticsPayloadWithLongInternalIdentifier",
            "confidence": "heuristic",
            "source_line": 44,
            "metadata": {
                "caller": "createAnalyticsTransportWithExtremelyLongName",
                "target_path": "packages/shared-normalizers/src/payloads/analytics.ts",
                "syntax": "imported-name-call",
            },
        }
    ],
    "incoming": [
        {
            "id": 306,
            "rel_type": "depends_on_module",
            "source_path": "apps/operations-console/src/features/reporting/analytics_bootstrapper_with_a_long_name.ts",
            "source_symbol": None,
            "target": "packages/extremely-long-analytics-api-client-name",
            "target_path": "packages/extremely-long-analytics-api-client-name/src/index.ts",
            "target_symbol": None,
            "confidence": "derived",
            "source_line": 91,
            "metadata": {
                "source_module": "apps/operations-console",
                "target_module": "packages/extremely-long-analytics-api-client-name",
                "target_path": "packages/extremely-long-analytics-api-client-name/src/index.ts",
                "import_count": 2,
            },
        },
        {
            "id": 304,
            "rel_type": "calls",
            "source_path": "apps/operations-console/src/features/reporting/analytics_bootstrapper_with_a_long_name.ts",
            "source_symbol": "bootstrapAnalyticsForOperationsConsole",
            "target": "createAnalyticsTransportWithExtremelyLongName",
            "target_path": "packages/extremely-long-analytics-api-client-name/src/index.ts",
            "target_symbol": "createAnalyticsTransportWithExtremelyLongName",
            "confidence": "heuristic",
            "source_line": 91,
            "metadata": {
                "caller": "bootstrapAnalyticsForOperationsConsole",
                "target_path": "packages/extremely-long-analytics-api-client-name/src/index.ts",
                "syntax": "imported-name-call",
            },
        }
    ],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 98765, "total_files": 100000, "functions": 9000, "classes": 1200, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/328/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/328/facts":
        if query.get("kind") == ["module"]:
            facts = MODULE_FACTS
        elif query.get("kind") == ["module_dependency"]:
            facts = MODULE_DEPENDENCY_FACTS
        else:
            facts = ALL_FACTS
        return {"repo_id": 328, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/328/relationships":
        relationships = []
        if query.get("rel_type") == ["depends_on_module"]:
            relationships = [
                {
                    "id": 400,
                    "src_kind": "file",
                    "src_id": 101,
                    "source_path": "packages/extremely-long-analytics-api-client-name/src/transport/http_with_a_very_long_filename_for_wrapping.ts",
                    "dst_kind": "module",
                    "dst_id": None,
                    "rel_type": "depends_on_module",
                    "target": "packages/shared-normalizers",
                    "confidence": "derived",
                    "source_line": 44,
                    "metadata": {
                        "source_module": "packages/extremely-long-analytics-api-client-name",
                        "target_module": "packages/shared-normalizers",
                        "target_path": "packages/shared-normalizers/src/payloads/analytics.ts",
                        "import_count": 3,
                    },
                }
            ]
        return {"repo_id": 328, "total": len(relationships), "relationships": relationships}
    if path.startswith("/api/codesniff/repos/328/modules/"):
        module_path = unquote(path.split("/modules/", 1)[1])
        if module_path == MODULE_DETAIL["module_path"]:
            return MODULE_DETAIL
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
    page.locator("[data-ui='language-support']").get_by_text("Symbols").first.wait_for(timeout=10000)
    page.locator("[data-ui='language-support']").get_by_text("Search").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-modules']").get_by_text("src/authentication_and_authorization", exact=True).wait_for(timeout=10000)
    page.locator("[data-ui='repo-modules']").get_by_text("packages/extremely-long-analytics-api-client-name", exact=True).wait_for(timeout=10000)
    page.locator("[data-ui='module-dependencies']").get_by_text("packages/extremely-long-analytics-api-client-name -> packages/shared-normalizers").wait_for(timeout=10000)
    page.locator("[data-ui='module-dependencies']").get_by_text("3 imports").wait_for(timeout=10000)
    page.locator("[data-ui='module-card']").filter(has_text="packages/extremely-long-analytics-api-client-name").click()
    page.locator("[data-ui='module-detail']").get_by_text("createAnalyticsTransportWithExtremelyLongName").first.wait_for(timeout=10000)
    page.locator("[data-ui='module-detail']").get_by_text("@workspace/shared-super-long-runtime-contracts").wait_for(timeout=10000)
    page.locator("[data-ui='module-detail']").get_by_text("depends on module").first.wait_for(timeout=10000)
    page.locator("[data-ui='module-detail']").get_by_text("packages/shared-normalizers").first.wait_for(timeout=10000)
    page.locator("[data-ui='module-detail']").get_by_text("bootstrapAnalyticsForOperationsConsole").first.wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Modules").click()
    page.locator("[data-ui='repo-facts']").get_by_text("packages/extremely-long-analytics-api-client-name").first.wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Mod Deps").click()
    page.locator("[data-ui='repo-facts']").get_by_text("packages/extremely-long-analytics-api-client-name -> packages/shared-normalizers").wait_for(timeout=10000)
    page.locator("[data-ui='relationship-filter']").get_by_role("button", name="Modules").click()
    page.locator("[data-ui='repo-relationships']").get_by_text("packages/shared-normalizers", exact=True).wait_for(timeout=10000)
    if page.locator("[data-ui='repo-facts']").get_by_text("pytest").count() != 0:
        raise AssertionError("Modules filter still shows stale runbook fact")
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

    module_requests = [url for url in requests if "/facts" in url and "kind=module" in url]
    module_dependency_requests = [url for url in requests if "/facts" in url and "kind=module_dependency" in url]
    module_dependency_relationship_requests = [url for url in requests if "/relationships" in url and "rel_type=depends_on_module" in url]
    module_detail_requests = [url for url in requests if "/modules/packages/extremely-long-analytics-api-client-name" in url]
    if len(module_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected module fact request per viewport, got {len(module_requests)}"]
    if len(module_dependency_requests) < len(VIEWPORTS):
        failures["module_dependency_requests"] = [f"expected module dependency fact request per viewport, got {len(module_dependency_requests)}"]
    if len(module_dependency_relationship_requests) < len(VIEWPORTS):
        failures["module_dependency_relationship_requests"] = [f"expected module dependency relationship request per viewport, got {len(module_dependency_relationship_requests)}"]
    if len(module_detail_requests) < len(VIEWPORTS):
        failures["module_detail_requests"] = [f"expected module detail request per viewport, got {len(module_detail_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"module_fact_requests={len(module_requests)}")
    print(f"module_dependency_fact_requests={len(module_dependency_requests)}")
    print(f"module_dependency_relationship_requests={len(module_dependency_relationship_requests)}")
    print(f"module_detail_requests={len(module_detail_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("module overview UI check passed")


if __name__ == "__main__":
    main()
