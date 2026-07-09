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
    "phone-small": "architecture-decision-phone-320.png",
    "laptop": "architecture-decision-laptop-1366.png",
    "ultrawide": "architecture-decision-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "architecture-decision-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 991,
    "name": "architecture-decision-fixture-with-long-adr-rfc-design-records",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "architecture991",
    "storage_path": "/tmp/codesniff/architecture-decision-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 28000177,
    "total_symbols": 360,
    "total_files": 150,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

ARCHITECTURE_DECISION_FACTS = [
    {
        "id": 9910,
        "kind": "architecture_decision",
        "key": "Accepted:adr:Use Transactional Outbox For Billing Event Dispatch With Replay Guarantees",
        "value": "The billing service writes domain events beside invoice mutations so workers can replay failed delivery safely.",
        "source_path": "docs/adr/0001-use-transactional-outbox-for-billing-events.md",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 41001,
            "name": "Use Transactional Outbox For Billing Event Dispatch With Replay Guarantees",
            "category": "adr",
            "status": "Accepted",
            "source": "adr-doc",
            "detail": "The billing service writes domain events beside invoice mutations so workers can replay failed delivery safely.",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9911,
        "kind": "architecture_decision",
        "key": "Proposed:rfc:RFC 0007 Ledger Reconciliation Windows And Late Provider Adjustments",
        "value": "Reconciliation windows should close after bank settlement plus a configurable delay for late provider adjustments.",
        "source_path": "docs/rfcs/0007-ledger-reconciliation-windows.md",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 41012,
            "name": "RFC 0007 Ledger Reconciliation Windows And Late Provider Adjustments",
            "category": "rfc",
            "status": "Proposed",
            "source": "rfc-doc",
            "detail": "Reconciliation windows should close after bank settlement plus a configurable delay for late provider adjustments.",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9912,
        "kind": "architecture_decision",
        "key": "architecture doc:Runtime Topology For Billing Workbench Worker And Web Processes",
        "value": "The web process handles API traffic while the worker process owns indexing and enrichment queues.",
        "source_path": "docs/architecture/runtime-topology.md",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 41033,
            "name": "Runtime Topology For Billing Workbench Worker And Web Processes",
            "category": "architecture doc",
            "status": "",
            "source": "architecture-doc",
            "detail": "The web process handles API traffic while the worker process owns indexing and enrichment queues.",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 9913,
        "kind": "architecture_decision",
        "key": "Superseded:decision log:Payment Idempotency Key Strategy For Provider Scoped Retries",
        "value": "Older payment retries used invoice identifiers before PSP-scoped idempotency keys became the stable contract.",
        "source_path": "docs/decisions/payment-idempotency-key-strategy.md",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 41042,
            "name": "Payment Idempotency Key Strategy For Provider Scoped Retries",
            "category": "decision log",
            "status": "Superseded",
            "source": "decision-doc",
            "detail": "Older payment retries used invoice identifiers before PSP-scoped idempotency keys became the stable contract.",
            "provenance": {"source": "parsed-source"},
        },
    },
]

ALL_FACTS = [
    {
        "id": 1,
        "kind": "runbook_command",
        "key": "build",
        "value": "npm run build",
        "source_path": "package.json",
        "source_line": None,
        "confidence": "derived",
        "metadata": {"rank": 20000, "provenance": {"source": "manifest"}},
    },
    ARCHITECTURE_DECISION_FACTS[0],
]

OVERVIEW = {
    "repo_id": 991,
    "total_files": 150,
    "total_symbols": 360,
    "languages": [{"language": "TypeScript", "file_count": 55, "line_count": 11000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 40, "line_count": 7000}],
    "modules": [{"path": "src", "file_count": 40, "line_count": 7000, "symbol_count": 160, "languages": ["TypeScript"], "sample_files": ["src/App.tsx"]}],
    "module_dependencies": [],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "architecture_decisions": [
        {
            "name": fact["metadata"]["name"],
            "category": fact["metadata"]["category"],
            "status": fact["metadata"]["status"],
            "source_path": fact["source_path"],
            "line": fact["source_line"] or 1,
            "source": fact["metadata"]["source"],
            "detail": fact["metadata"]["detail"],
        }
        for fact in ARCHITECTURE_DECISION_FACTS
    ],
    "configs": [],
    "tests": [],
    "entry_points": [{"path": "src/App.tsx", "kind": "entry_point", "detail": "app entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [{"category": "build", "name": "build", "command": "npm run build", "source_path": "package.json", "detail": "vite build"}],
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
    "test_systems": [],
    "release_processes": [],
    "quality_tools": [],
    "dev_environments": [],
    "build_systems": [],
    "ui_surfaces": [],
    "mobile_surfaces": [],
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
    "symbol_types": {"function": 260, "class": 100},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 360, "total_files": 150, "functions": 260, "classes": 100, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/991/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/991/facts":
        facts = ARCHITECTURE_DECISION_FACTS if query.get("kind") == ["architecture_decision"] else ALL_FACTS
        return {"repo_id": 991, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/991/relationships":
        return {"repo_id": 991, "total": 0, "relationships": []}
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
    page.locator("[data-ui='repo-facts']").get_by_text("npm run build").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="ADRs").first.click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Accepted:adr:Use Transactional Outbox For Billing Event Dispatch With Replay Guarantees").wait_for(timeout=10000)
    facts.get_by_text("Proposed:rfc:RFC 0007 Ledger Reconciliation Windows And Late Provider Adjustments").wait_for(timeout=10000)
    facts.get_by_text("architecture doc:Runtime Topology For Billing Workbench Worker And Web Processes").wait_for(timeout=10000)
    facts.get_by_text("Superseded:decision log:Payment Idempotency Key Strategy For Provider Scoped Retries").wait_for(timeout=10000)
    facts.get_by_text("docs/adr/0001-use-transactional-outbox-for-billing-events.md:1").wait_for(timeout=10000)
    facts.get_by_text("docs/decisions/payment-idempotency-key-strategy.md:1").wait_for(timeout=10000)
    if facts.get_by_text("npm run build").count() != 0:
        raise AssertionError("ADRs filter still shows stale runbook fact")
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

    decision_requests = [url for url in requests if "/facts" in url and "kind=architecture_decision" in url]
    if len(decision_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected ADR fact request per viewport, got {len(decision_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"architecture_decision_fact_requests={len(decision_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("Architecture decision facts UI check passed")


if __name__ == "__main__":
    main()
