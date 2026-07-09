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
    "phone-small": "payment-facts-phone-320.png",
    "laptop": "payment-facts-laptop-1366.png",
    "ultrawide": "payment-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "payment-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 973,
    "name": "payment-surface-fixture-with-long-checkout-paths",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "pay973",
    "storage_path": "/tmp/codesniff/payment-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 83838383,
    "total_symbols": 840,
    "total_files": 244,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

PAYMENT_FACTS = [
    {
        "id": 1801,
        "kind": "payment_surface",
        "key": "Stripe Checkout",
        "value": "Stripe checkout session create call",
        "source_path": "src/billing/checkout/stripe-enterprise-renewal-checkout-session-with-extra-long-name.ts",
        "source_line": 32,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54032,
            "category": "checkout",
            "source": "code-signal",
            "detail": "Stripe checkout session create call",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1802,
        "kind": "payment_surface",
        "key": "Stripe PaymentIntent",
        "value": "Stripe PaymentIntent create call",
        "source_path": "src/payments/intents/stripe-payment-intent-for-usage-adjustments.py",
        "source_line": 47,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54047,
            "category": "payment intent",
            "source": "code-signal",
            "detail": "Stripe PaymentIntent create call",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1803,
        "kind": "payment_surface",
        "key": "Chargebee billing for enterprise-subscription-reconciliation",
        "value": "Chargebee hosted page/subscription/invoice call",
        "source_path": "src/billing/subscriptions/chargebee-enterprise-subscription-reconciliation.ts",
        "source_line": 71,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54071,
            "category": "billing provider",
            "source": "code-signal",
            "detail": "Chargebee hosted page/subscription/invoice call",
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
    PAYMENT_FACTS[0],
]

OVERVIEW = {
    "repo_id": 973,
    "total_files": 244,
    "total_symbols": 840,
    "languages": [{"language": "TypeScript", "file_count": 180, "line_count": 31000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 180, "line_count": 31000}],
    "modules": [{"path": "src", "file_count": 180, "line_count": 31000, "symbol_count": 810, "languages": ["TypeScript", "Python"], "sample_files": ["src/billing/checkout/stripe.ts"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "configs": [{"path": ".env.example", "kind": "config", "detail": "Environment template", "total_lines": 34}],
    "tests": [{"path": "tests/payments.test.ts", "kind": "test", "detail": "test source", "total_lines": 74}],
    "entry_points": [{"path": "src/app.ts", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 150}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "npm", "source_path": "package.json", "dependency_count": 16, "dev_dependency_count": 0, "detail": "package.json"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "tests"}],
    "dependencies": [],
    "stack_components": [],
    "service_integrations": [],
    "payment_surfaces": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in PAYMENT_FACTS
    ],
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
    "repo_policies": [],
    "code_owners": [],
    "deploy_targets": [],
    "secret_signals": [],
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 790, "class": 50},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 840, "total_files": 244, "functions": 790, "classes": 50, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/973/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/973/facts":
        facts = PAYMENT_FACTS if query.get("kind") == ["payment_surface"] else ALL_FACTS
        return {"repo_id": 973, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/973/relationships":
        return {"repo_id": 973, "total": 0, "relationships": []}
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
    page.get_by_text("Stripe Checkout - checkout").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Billing").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Stripe Checkout", exact=True).first.wait_for(timeout=10000)
    facts.get_by_text("Stripe PaymentIntent create call").wait_for(timeout=10000)
    facts.get_by_text("Chargebee billing for enterprise-subscription-reconciliation").wait_for(timeout=10000)
    facts.get_by_text("src/billing/subscriptions/chargebee-enterprise-subscription-reconciliation.ts:71").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Billing filter still shows stale runbook fact")
    if page.get_by_text("sk_live_should_not_be_rendered_payment_973").count() != 0:
        raise AssertionError("Raw payment secret sample rendered")
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

    payment_requests = [url for url in requests if "/facts" in url and "kind=payment_surface" in url]
    if len(payment_requests) < len(VIEWPORTS):
        failures["payment_requests"] = [f"expected payment-surface fact request per viewport, got {len(payment_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"payment_surface_fact_requests={len(payment_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("payment facts filter UI check passed")


if __name__ == "__main__":
    main()
