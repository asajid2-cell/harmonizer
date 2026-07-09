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
    "phone-small": "route-frameworks-phone-320.png",
    "laptop": "route-frameworks-laptop-1366.png",
    "ultrawide": "route-frameworks-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "route-frameworks"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 928,
    "name": "route-framework-fixture-with-a-very-long-name-for-layout-testing",
    "source_type": "github",
    "source_url": "https://github.com/example/route-framework-fixture",
    "status": "lexical_ready",
    "active_revision": "abc1234",
    "storage_path": "/tmp/codesniff/route-framework-fixture",
    "created_at": "2026-07-05T00:00:00Z",
    "updated_at": "2026-07-05T00:00:00Z",
    "last_opened_at": "2026-07-05T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 1234567890,
    "total_symbols": 77777,
    "total_files": 100000,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
    "refresh_interval_minutes": 1440,
    "next_refresh_at": "2026-07-06T12:00:00Z",
    "last_scheduled_refresh_at": None,
}

ROUTES = [
    {
        "method": "GET",
        "path": "/api/go/orders/:orderID/with-an-intentionally-long-cold-route-segment",
        "source_path": "cmd/api/main.go",
        "line": 7,
        "framework": "go router",
    },
    {
        "method": "DELETE",
        "path": "/api/spring/accounts/bulk-with-an-intentionally-long-controller-action",
        "source_path": "src/main/java/example/AccountController.java",
        "line": 11,
        "framework": "spring",
    },
    {
        "method": "GET",
        "path": "/api/:controller/:orderId/with-an-intentionally-long-aspnet-route-suffix",
        "source_path": "src/Controllers/OrdersController.cs",
        "line": 6,
        "framework": "aspnet",
    },
    {
        "method": "POST",
        "path": "/api/fastify/reports/:reportId/with-an-intentionally-long-fastify-suffix",
        "source_path": "src/routes/fastify.ts",
        "line": 9,
        "framework": "fastify",
    },
    {
        "method": "GET",
        "path": "/api/hono/accounts/:accountId/with-an-intentionally-long-hono-suffix",
        "source_path": "src/routes/hono.ts",
        "line": 5,
        "framework": "hono",
    },
    {
        "method": "DELETE",
        "path": "/api/nest/orders/:orderId/items/:itemId/with-an-intentionally-long-nestjs-suffix",
        "source_path": "src/orders.controller.ts",
        "line": 12,
        "framework": "nestjs",
    },
]

OVERVIEW = {
    "repo_id": 928,
    "total_files": 100000,
    "total_symbols": 77777,
    "languages": [
        {"language": "Go", "file_count": 9000, "line_count": 300000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "Java", "file_count": 6000, "line_count": 250000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
        {"language": "C#", "file_count": 5000, "line_count": 210000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True},
    ],
    "top_directories": [{"path": "src", "file_count": 18000, "line_count": 700000}],
    "modules": [
        {
            "path": "src/main/java/example",
            "file_count": 1200,
            "line_count": 90000,
            "symbol_count": 4000,
            "languages": ["Java"],
            "sample_files": ["src/main/java/example/AccountController.java"],
        }
    ],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 120}],
    "configs": [{"path": "go.mod", "kind": "config", "detail": "Go module manifest", "total_lines": 20}],
    "tests": [{"path": "tests/route_frameworks_test.go", "kind": "test", "detail": "test source", "total_lines": 90}],
    "entry_points": [{"path": "cmd/api/main.go", "kind": "entry_point", "detail": "Go command entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "go test ./...", "source_path": "go.mod", "detail": "Go tests"}],
    "dependencies": [],
    "route_endpoints": ROUTES,
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 12000, "class": 4000},
    "top_symbols": [],
    "warnings": [],
}

TEACHING = {
    "repo_id": 928,
    "generated_from": "cold_overview_v1",
    "warnings": [],
    "steps": [
        {
            "id": "api",
            "title": "APIs",
            "summary": "The first API surfaces include Go, Spring, and ASP.NET routes.",
            "citations": [{"source_path": "cmd/api/main.go", "source_line": 7, "label": "GET /api/go/orders/:orderID", "kind": "route_endpoint"}],
        }
    ],
}

ROUTE_FACTS = [
    {
        "id": index + 1,
        "kind": "route_endpoint",
        "key": f"{route['method']} {route['path']}",
        "value": route["framework"],
        "source_path": route["source_path"],
        "source_line": route["line"],
        "confidence": "heuristic",
        "metadata": {
            "method": route["method"],
            "path": route["path"],
            "framework": route["framework"],
            "rank": 40000 + index,
            "provenance": {"source": "parsed-source", "framework": route["framework"]},
        },
    }
    for index, route in enumerate(ROUTES)
]

ALL_FACTS = [
    {
        "id": 100,
        "kind": "runbook_command",
        "key": "test",
        "value": "go test ./...",
        "source_path": "go.mod",
        "source_line": None,
        "confidence": "derived",
        "metadata": {"rank": 20000, "provenance": {"source": "manifest"}},
    },
    *ROUTE_FACTS,
]

ROUTE_RELATIONSHIPS = [
    {
        "id": index + 200,
        "src_kind": "file",
        "src_id": index + 1,
        "source_path": route["source_path"],
        "dst_kind": "route",
        "dst_id": None,
        "rel_type": "defines_route",
        "target": f"{route['method']} {route['path']}",
        "confidence": "heuristic",
        "source_line": route["line"],
        "metadata": {
            "source_path": route["source_path"],
            "method": route["method"],
            "path": route["path"],
            "framework": route["framework"],
        },
    }
    for index, route in enumerate(ROUTES)
]


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 77777, "total_files": 100000, "functions": 12000, "classes": 4000, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/928/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/928/teaching":
        return TEACHING
    if path == "/api/codesniff/repos/928/facts":
        facts = ROUTE_FACTS if query.get("kind") == ["route_endpoint"] else ALL_FACTS
        return {"repo_id": 928, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/928/relationships":
        relationships = ROUTE_RELATIONSHIPS if query.get("rel_type") == ["defines_route"] else []
        return {"repo_id": 928, "total": len(relationships), "relationships": relationships}
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
    overview.get_by_text("/api/go/orders/:orderID/with-an-intentionally-long-cold-route-segment", exact=True).wait_for(timeout=10000)
    overview.get_by_text("go router - cmd/api/main.go:7", exact=True).wait_for(timeout=10000)

    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Routes").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("DELETE /api/spring/accounts/bulk-with-an-intentionally-long-controller-action").wait_for(timeout=10000)
    facts.get_by_text("POST /api/fastify/reports/:reportId/with-an-intentionally-long-fastify-suffix").wait_for(timeout=10000)
    facts.get_by_text("src/main/java/example/AccountController.java").wait_for(timeout=10000)
    if facts.get_by_text("go test ./...").count() != 0:
        raise AssertionError("Route fact filter still shows stale runbook fact")

    page.locator("[data-ui='relationship-filter']").get_by_role("button", name="Routes").click()
    relationships = page.locator("[data-ui='repo-relationships']")
    relationships.get_by_text("GET /api/:controller/:orderId/with-an-intentionally-long-aspnet-route-suffix").wait_for(timeout=10000)
    relationships.get_by_text("DELETE /api/nest/orders/:orderId/items/:itemId/with-an-intentionally-long-nestjs-suffix").wait_for(timeout=10000)
    relationships.get_by_text("defines route").first.wait_for(timeout=10000)
    relationships.get_by_text("aspnet", exact=True).wait_for(timeout=10000)
    relationships.get_by_text("nestjs", exact=True).wait_for(timeout=10000)

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

    route_fact_requests = [url for url in requests if "/facts" in url and "kind=route_endpoint" in url]
    route_relationship_requests = [url for url in requests if "/relationships" in url and "rel_type=defines_route" in url]
    if len(route_fact_requests) < len(VIEWPORTS):
        failures["fact_requests"] = [f"expected route fact request per viewport, got {len(route_fact_requests)}"]
    if len(route_relationship_requests) < len(VIEWPORTS):
        failures["relationship_requests"] = [f"expected route relationship request per viewport, got {len(route_relationship_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"route_fact_requests={len(route_fact_requests)}")
    print(f"route_relationship_requests={len(route_relationship_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("route frameworks UI check passed")


if __name__ == "__main__":
    main()
