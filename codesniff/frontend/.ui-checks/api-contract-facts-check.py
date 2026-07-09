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
    "phone-small": "api-contract-phone-320.png",
    "laptop": "api-contract-laptop-1366.png",
    "ultrawide": "api-contract-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "api-contract-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 942,
    "name": "api-contract-fixture-with-long-openapi-asyncapi-postman-protobuf-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "api942",
    "storage_path": "/tmp/codesniff/api-contract-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 28000177,
    "total_symbols": 512,
    "total_files": 140,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

API_CONTRACT_FACTS = [
    {
        "id": 940,
        "kind": "api_contract",
        "key": "OpenAPI:operation:GET /v1/customers/{customerId}/billing-ledger-with-long-contract-name",
        "value": "OpenAPI operation getCustomerLedgerWithLongOperationIdentifier",
        "source_path": "contracts/openapi/customer-billing-public-contract-with-long-name.yaml",
        "source_line": 12,
        "confidence": "heuristic",
        "metadata": {
            "rank": 42012,
            "protocol": "OpenAPI",
            "category": "operation",
            "name": "GET /v1/customers/{customerId}/billing-ledger-with-long-contract-name",
            "source": "openapi",
            "detail": "OpenAPI operation getCustomerLedgerWithLongOperationIdentifier",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 941,
        "kind": "api_contract",
        "key": "OpenAPI:schema:CustomerBillingLedgerResponseWithLongSchemaName",
        "value": "OpenAPI schema component",
        "source_path": "contracts/openapi/customer-billing-public-contract-with-long-name.yaml",
        "source_line": 44,
        "confidence": "heuristic",
        "metadata": {
            "rank": 42044,
            "protocol": "OpenAPI",
            "category": "schema",
            "name": "CustomerBillingLedgerResponseWithLongSchemaName",
            "source": "openapi",
            "detail": "OpenAPI schema component",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 942,
        "kind": "api_contract",
        "key": "AsyncAPI:channel:billing.invoice.created.with.long.routing.key",
        "value": "AsyncAPI channel",
        "source_path": "contracts/events/billing-events-with-long-name.asyncapi.yaml",
        "source_line": 8,
        "confidence": "heuristic",
        "metadata": {
            "rank": 42008,
            "protocol": "AsyncAPI",
            "category": "channel",
            "name": "billing.invoice.created.with.long.routing.key",
            "source": "asyncapi",
            "detail": "AsyncAPI channel",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 943,
        "kind": "api_contract",
        "key": "Postman:request:POST Create Billing Session With Long Operator Collection Name",
        "value": "https://api.example.test/v1/billing/session/with/long/operator/path",
        "source_path": "contracts/postman/billing-operator.postman_collection.json",
        "source_line": 19,
        "confidence": "heuristic",
        "metadata": {
            "rank": 42019,
            "protocol": "Postman",
            "category": "request",
            "name": "POST Create Billing Session With Long Operator Collection Name",
            "source": "postman",
            "detail": "https://api.example.test/v1/billing/session/with/long/operator/path",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 944,
        "kind": "api_contract",
        "key": "gRPC:service:BillingLedgerServiceWithLongName",
        "value": "protobuf service in billing.v1",
        "source_path": "proto/billing-ledger-with-long-name.proto",
        "source_line": 4,
        "confidence": "heuristic",
        "metadata": {
            "rank": 42004,
            "protocol": "gRPC",
            "category": "service",
            "name": "BillingLedgerServiceWithLongName",
            "source": "protobuf",
            "detail": "protobuf service in billing.v1",
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
    API_CONTRACT_FACTS[0],
]

OVERVIEW = {
    "repo_id": 942,
    "total_files": 140,
    "total_symbols": 512,
    "languages": [{"language": "TypeScript", "file_count": 80, "line_count": 12000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "contracts", "file_count": 20, "line_count": 3500}],
    "modules": [{"path": "contracts", "file_count": 20, "line_count": 3500, "symbol_count": 30, "languages": ["YAML", "JSON", "Protocol Buffers"], "sample_files": ["contracts/openapi/customer-billing-public-contract-with-long-name.yaml"]}],
    "module_dependencies": [],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "configs": [{"path": "contracts/openapi/customer-billing-public-contract-with-long-name.yaml", "kind": "config", "detail": "YAML", "total_lines": 80}],
    "tests": [],
    "entry_points": [{"path": "src/main.ts", "kind": "entry_point", "detail": "app entry point", "total_lines": 80}],
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
    "api_contracts": [
        {
            "name": fact["metadata"]["name"],
            "category": fact["metadata"]["category"],
            "protocol": fact["metadata"]["protocol"],
            "source_path": fact["source_path"],
            "line": fact["source_line"] or 1,
            "source": fact["metadata"]["source"],
            "detail": fact["metadata"]["detail"],
        }
        for fact in API_CONTRACT_FACTS
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
    "symbol_types": {"function": 400, "class": 112},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 512, "total_files": 140, "functions": 400, "classes": 112, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/942/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/942/facts":
        facts = API_CONTRACT_FACTS if query.get("kind") == ["api_contract"] else ALL_FACTS
        return {"repo_id": 942, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/942/relationships":
        return {"repo_id": 942, "total": 0, "relationships": []}
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
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="API Specs").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("OpenAPI:operation:GET /v1/customers/{customerId}/billing-ledger-with-long-contract-name").wait_for(timeout=10000)
    facts.get_by_text("OpenAPI:schema:CustomerBillingLedgerResponseWithLongSchemaName").wait_for(timeout=10000)
    facts.get_by_text("AsyncAPI:channel:billing.invoice.created.with.long.routing.key").wait_for(timeout=10000)
    facts.get_by_text("Postman:request:POST Create Billing Session With Long Operator Collection Name").wait_for(timeout=10000)
    facts.get_by_text("gRPC:service:BillingLedgerServiceWithLongName").wait_for(timeout=10000)
    facts.get_by_text("contracts/openapi/customer-billing-public-contract-with-long-name.yaml:12").wait_for(timeout=10000)
    if facts.get_by_text("pnpm test").count() != 0:
        raise AssertionError("API Specs filter still shows stale runbook fact")
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

    api_contract_requests = [url for url in requests if "/facts" in url and "kind=api_contract" in url]
    if len(api_contract_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected API contract fact request per viewport, got {len(api_contract_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"api_contract_fact_requests={len(api_contract_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("API contract facts UI check passed")


if __name__ == "__main__":
    main()
