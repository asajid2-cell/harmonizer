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
    "phone-small": "ui-surface-phone-320.png",
    "laptop": "ui-surface-laptop-1366.png",
    "ultrawide": "ui-surface-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "ui-surface-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 948,
    "name": "ui-surface-fixture-with-long-next-react-svelte-vue-storybook-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "ui948",
    "storage_path": "/tmp/codesniff/ui-surface-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 29000177,
    "total_symbols": 640,
    "total_files": 170,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

UI_SURFACE_FACTS = [
    {
        "id": 9480,
        "kind": "ui_surface",
        "key": "Next.js:page:/customers/{customerId}/billing-ledger-with-long-route-name",
        "value": "Next.js page route /customers/{customerId}/billing-ledger-with-long-route-name",
        "source_path": "app/(dashboard)/customers/[customerId]/billing-ledger-with-long-route-name/page.tsx",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 43001,
            "framework": "Next.js",
            "category": "page",
            "name": "/customers/{customerId}/billing-ledger-with-long-route-name",
            "source": "path-convention",
            "detail": "Next.js page route /customers/{customerId}/billing-ledger-with-long-route-name",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9481,
        "kind": "ui_surface",
        "key": "React:form:CustomerLedgerReconciliationFormWithLongName",
        "value": "React form surface",
        "source_path": "src/components/customer-ledger/CustomerLedgerReconciliationFormWithLongName.tsx",
        "source_line": 12,
        "confidence": "heuristic",
        "metadata": {
            "rank": 43012,
            "framework": "React",
            "category": "form",
            "name": "CustomerLedgerReconciliationFormWithLongName",
            "source": "markup-signal",
            "detail": "React form surface",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9482,
        "kind": "ui_surface",
        "key": "React:story:CustomerLedgerPanelWithLongStoryName",
        "value": "Storybook story file",
        "source_path": "src/components/customer-ledger/CustomerLedgerPanelWithLongStoryName.stories.tsx",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 43031,
            "framework": "React",
            "category": "story",
            "name": "CustomerLedgerPanelWithLongStoryName",
            "source": "storybook",
            "detail": "Storybook story file",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9483,
        "kind": "ui_surface",
        "key": "Svelte:page:/billing/{invoiceId}/activity-with-long-route-name",
        "value": "Svelte page route /billing/{invoiceId}/activity-with-long-route-name",
        "source_path": "src/routes/billing/[invoiceId]/activity-with-long-route-name/+page.svelte",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 43001,
            "framework": "Svelte",
            "category": "page",
            "name": "/billing/{invoiceId}/activity-with-long-route-name",
            "source": "path-convention",
            "detail": "Svelte page route /billing/{invoiceId}/activity-with-long-route-name",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9484,
        "kind": "ui_surface",
        "key": "Vue:component:InvoiceTableViewWithLongName",
        "value": "Vue component",
        "source_path": "src/views/billing/InvoiceTableViewWithLongName.vue",
        "source_line": 2,
        "confidence": "heuristic",
        "metadata": {
            "rank": 43022,
            "framework": "Vue",
            "category": "component",
            "name": "InvoiceTableViewWithLongName",
            "source": "component-declaration",
            "detail": "Vue component",
            "provenance": {"source": "parsed-source"},
        },
    },
]

ALL_FACTS = [
    {
        "id": 1,
        "kind": "runbook_command",
        "key": "test",
        "value": "pnpm test",
        "source_path": "package.json",
        "source_line": None,
        "confidence": "derived",
        "metadata": {"rank": 20000, "provenance": {"source": "manifest"}},
    },
    UI_SURFACE_FACTS[0],
]

OVERVIEW = {
    "repo_id": 948,
    "total_files": 170,
    "total_symbols": 640,
    "languages": [{"language": "TypeScript", "file_count": 100, "line_count": 18000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 100, "line_count": 16000}],
    "modules": [{"path": "src/components", "file_count": 35, "line_count": 5000, "symbol_count": 120, "languages": ["TypeScript"], "sample_files": ["src/components/customer-ledger/CustomerLedgerReconciliationFormWithLongName.tsx"]}],
    "module_dependencies": [],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "configs": [],
    "tests": [],
    "entry_points": [{"path": "src/main.tsx", "kind": "entry_point", "detail": "app entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pnpm test", "source_path": "package.json", "detail": "vitest run"}],
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
    "ui_surfaces": [
        {
            "name": fact["metadata"]["name"],
            "category": fact["metadata"]["category"],
            "framework": fact["metadata"]["framework"],
            "source_path": fact["source_path"],
            "line": fact["source_line"] or 1,
            "source": fact["metadata"]["source"],
            "detail": fact["metadata"]["detail"],
        }
        for fact in UI_SURFACE_FACTS
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
    "symbol_types": {"function": 500, "class": 140},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 640, "total_files": 170, "functions": 500, "classes": 140, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/948/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/948/facts":
        facts = UI_SURFACE_FACTS if query.get("kind") == ["ui_surface"] else ALL_FACTS
        return {"repo_id": 948, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/948/relationships":
        return {"repo_id": 948, "total": 0, "relationships": []}
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
    page.locator("[data-ui='repo-facts']").get_by_text("pnpm test").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="UI").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Next.js:page:/customers/{customerId}/billing-ledger-with-long-route-name").wait_for(timeout=10000)
    facts.get_by_text("React:form:CustomerLedgerReconciliationFormWithLongName").wait_for(timeout=10000)
    facts.get_by_text("React:story:CustomerLedgerPanelWithLongStoryName").wait_for(timeout=10000)
    facts.get_by_text("Svelte:page:/billing/{invoiceId}/activity-with-long-route-name").wait_for(timeout=10000)
    facts.get_by_text("Vue:component:InvoiceTableViewWithLongName").wait_for(timeout=10000)
    facts.get_by_text("src/components/customer-ledger/CustomerLedgerReconciliationFormWithLongName.tsx:12").wait_for(timeout=10000)
    if facts.get_by_text("pnpm test").count() != 0:
        raise AssertionError("UI filter still shows stale runbook fact")
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

    ui_surface_requests = [url for url in requests if "/facts" in url and "kind=ui_surface" in url]
    if len(ui_surface_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected UI surface fact request per viewport, got {len(ui_surface_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"ui_surface_fact_requests={len(ui_surface_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("UI surface facts UI check passed")


if __name__ == "__main__":
    main()
