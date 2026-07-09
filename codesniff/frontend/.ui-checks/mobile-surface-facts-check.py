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
    "phone-small": "mobile-surface-phone-320.png",
    "laptop": "mobile-surface-laptop-1366.png",
    "ultrawide": "mobile-surface-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "mobile-surface-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 950,
    "name": "mobile-surface-fixture-with-long-android-ios-expo-flutter-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "mobile950",
    "storage_path": "/tmp/codesniff/mobile-surface-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 21000177,
    "total_symbols": 260,
    "total_files": 95,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

MOBILE_SURFACE_FACTS = [
    {
        "id": 9500,
        "kind": "mobile_surface",
        "key": "Expo:app:Ledger Mobile Reconciliation Companion With Long Name",
        "value": "Expo app slug ledger-mobile-reconciliation-companion-with-long-name",
        "source_path": "app.json",
        "source_line": 3,
        "confidence": "heuristic",
        "metadata": {
            "rank": 44003,
            "platform": "Expo",
            "category": "app",
            "name": "Ledger Mobile Reconciliation Companion With Long Name",
            "source": "expo-config",
            "detail": "Expo app slug ledger-mobile-reconciliation-companion-with-long-name",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9501,
        "kind": "mobile_surface",
        "key": "Android:activity:.payments.reconciliation.ExtremelyLongMainActivityName",
        "value": "Android activity component",
        "source_path": "android/app/src/main/AndroidManifest.xml",
        "source_line": 14,
        "confidence": "heuristic",
        "metadata": {
            "rank": 44034,
            "platform": "Android",
            "category": "activity",
            "name": ".payments.reconciliation.ExtremelyLongMainActivityName",
            "source": "android-manifest",
            "detail": "Android activity component",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9502,
        "kind": "mobile_surface",
        "key": "Android:permission:android.permission.POST_NOTIFICATIONS",
        "value": "Android manifest permission",
        "source_path": "android/app/src/main/AndroidManifest.xml",
        "source_line": 5,
        "confidence": "heuristic",
        "metadata": {
            "rank": 44085,
            "platform": "Android",
            "category": "permission",
            "name": "android.permission.POST_NOTIFICATIONS",
            "source": "android-manifest",
            "detail": "Android manifest permission",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9503,
        "kind": "mobile_surface",
        "key": "iOS:bundle id:com.example.ledger.reconciliation.mobile.longbundleidentifier",
        "value": "iOS bundle identifier",
        "source_path": "ios/LedgerMobile/Info.plist",
        "source_line": 8,
        "confidence": "heuristic",
        "metadata": {
            "rank": 44018,
            "platform": "iOS",
            "category": "bundle id",
            "name": "com.example.ledger.reconciliation.mobile.longbundleidentifier",
            "source": "info-plist",
            "detail": "iOS bundle identifier",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9504,
        "kind": "mobile_surface",
        "key": "Flutter:entry:LedgerFlutterReconciliationApplicationWithLongName",
        "value": "Flutter runApp entry point",
        "source_path": "lib/main.dart",
        "source_line": 2,
        "confidence": "heuristic",
        "metadata": {
            "rank": 44042,
            "platform": "Flutter",
            "category": "entry",
            "name": "LedgerFlutterReconciliationApplicationWithLongName",
            "source": "flutter-entry",
            "detail": "Flutter runApp entry point",
            "provenance": {"source": "parsed-source"},
        },
    },
]

ALL_FACTS = [
    {
        "id": 1,
        "kind": "runbook_command",
        "key": "test",
        "value": "npm test",
        "source_path": "package.json",
        "source_line": None,
        "confidence": "derived",
        "metadata": {"rank": 20000, "provenance": {"source": "manifest"}},
    },
    MOBILE_SURFACE_FACTS[0],
]

OVERVIEW = {
    "repo_id": 950,
    "total_files": 95,
    "total_symbols": 260,
    "languages": [{"language": "TypeScript", "file_count": 45, "line_count": 9000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 30, "line_count": 5000}],
    "modules": [{"path": "src", "file_count": 30, "line_count": 5000, "symbol_count": 130, "languages": ["TypeScript"], "sample_files": ["src/App.tsx"]}],
    "module_dependencies": [],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "configs": [],
    "tests": [],
    "entry_points": [{"path": "src/App.tsx", "kind": "entry_point", "detail": "app entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "npm test", "source_path": "package.json", "detail": "vitest run"}],
    "dependencies": [],
    "workspaces": [],
    "stack_components": [],
    "service_integrations": [],
    "graphql_surfaces": [],
    "message_buses": [],
    "data_stores": [],
    "ai_surfaces": [],
    "payment_surfaces": [],
    "auth_surfaces": [],
    "background_jobs": [],
    "webhook_surfaces": [],
    "observability_surfaces": [],
    "feature_flags": [],
    "notification_surfaces": [],
    "environment_variables": [],
    "ci_workflows": [],
    "container_services": [],
    "runtime_requirements": [],
    "api_contracts": [],
    "cli_commands": [],
    "ui_surfaces": [],
    "mobile_surfaces": [
        {
            "name": fact["metadata"]["name"],
            "category": fact["metadata"]["category"],
            "platform": fact["metadata"]["platform"],
            "source_path": fact["source_path"],
            "line": fact["source_line"] or 1,
            "source": fact["metadata"]["source"],
            "detail": fact["metadata"]["detail"],
        }
        for fact in MOBILE_SURFACE_FACTS
    ],
    "infra_resources": [],
    "repo_policies": [],
    "code_owners": [],
    "deploy_targets": [],
    "supply_chain": [],
    "secret_signals": [],
    "index_fallbacks": [],
    "route_endpoints": [],
    "import_relationships": [],
    "migration_facts": [],
    "search_quality_cases": [],
    "search_quality_baseline": None,
    "symbol_types": {"function": 210, "class": 50},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 260, "total_files": 95, "functions": 210, "classes": 50, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/950/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/950/facts":
        facts = MOBILE_SURFACE_FACTS if query.get("kind") == ["mobile_surface"] else ALL_FACTS
        return {"repo_id": 950, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/950/relationships":
        return {"repo_id": 950, "total": 0, "relationships": []}
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
    page.locator("[data-ui='repo-facts']").get_by_text("npm test").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Mobile").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Expo:app:Ledger Mobile Reconciliation Companion With Long Name").wait_for(timeout=10000)
    facts.get_by_text("Android:activity:.payments.reconciliation.ExtremelyLongMainActivityName").wait_for(timeout=10000)
    facts.get_by_text("Android:permission:android.permission.POST_NOTIFICATIONS").wait_for(timeout=10000)
    facts.get_by_text("iOS:bundle id:com.example.ledger.reconciliation.mobile.longbundleidentifier").wait_for(timeout=10000)
    facts.get_by_text("Flutter:entry:LedgerFlutterReconciliationApplicationWithLongName").wait_for(timeout=10000)
    facts.get_by_text("android/app/src/main/AndroidManifest.xml:14").wait_for(timeout=10000)
    if facts.get_by_text("npm test").count() != 0:
        raise AssertionError("Mobile filter still shows stale runbook fact")
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

    mobile_requests = [url for url in requests if "/facts" in url and "kind=mobile_surface" in url]
    if len(mobile_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected Mobile fact request per viewport, got {len(mobile_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"mobile_surface_fact_requests={len(mobile_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("Mobile surface facts UI check passed")


if __name__ == "__main__":
    main()
