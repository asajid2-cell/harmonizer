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
    "phone-small": "infra-phone-320.png",
    "laptop": "infra-laptop-1366.png",
    "ultrawide": "infra-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "infra-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 934,
    "name": "infra-fixture-with-long-iac-resource-names",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "infra934",
    "storage_path": "/tmp/codesniff/infra-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 32000177,
    "total_symbols": 768,
    "total_files": 180,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

INFRA_FACTS = [
    {
        "id": 930,
        "kind": "infra_resource",
        "key": "AWS:resource:aws_s3_bucket:customer_billing_archive_bucket_with_long_name",
        "value": "Terraform resource aws_s3_bucket.customer_billing_archive_bucket_with_long_name",
        "source_path": "infra/terraform/customer-billing-platform/main.tf",
        "source_line": 12,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59012,
            "provider": "AWS",
            "category": "resource",
            "resource_type": "aws_s3_bucket",
            "name": "customer_billing_archive_bucket_with_long_name",
            "source": "terraform",
            "detail": "Terraform resource aws_s3_bucket.customer_billing_archive_bucket_with_long_name",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 931,
        "kind": "infra_resource",
        "key": "Terraform:module:module:networking_foundation_with_long_name",
        "value": "Terraform module networking_foundation_with_long_name; source: terraform-aws-modules/vpc/aws",
        "source_path": "infra/terraform/customer-billing-platform/main.tf",
        "source_line": 24,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59024,
            "provider": "Terraform",
            "category": "module",
            "resource_type": "module",
            "name": "networking_foundation_with_long_name",
            "source": "terraform",
            "detail": "Terraform module networking_foundation_with_long_name; source: terraform-aws-modules/vpc/aws",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 932,
        "kind": "infra_resource",
        "key": "AWS:resource:AWS::Serverless::Function:CustomerBillingWebhookProcessorWithLongName",
        "value": "CloudFormation resource AWS::Serverless::Function",
        "source_path": "infra/cloudformation/customer-billing-template-with-long-name.yaml",
        "source_line": 6,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59006,
            "provider": "AWS",
            "category": "resource",
            "resource_type": "AWS::Serverless::Function",
            "name": "CustomerBillingWebhookProcessorWithLongName",
            "source": "cloudformation",
            "detail": "CloudFormation resource AWS::Serverless::Function",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 933,
        "kind": "infra_resource",
        "key": "Serverless Framework:function:function:chargeCustomerWithVeryLongName",
        "value": "Serverless function in billing-platform-with-long-service-name",
        "source_path": "serverless.yml",
        "source_line": 8,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59028,
            "provider": "Serverless Framework",
            "category": "function",
            "resource_type": "function",
            "name": "chargeCustomerWithVeryLongName",
            "source": "serverless",
            "detail": "Serverless function in billing-platform-with-long-service-name",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 934,
        "kind": "infra_resource",
        "key": "Azure:resource:Microsoft.Storage/storageAccounts@2023-01-01:customerBillingStorageAccount",
        "value": "Bicep resource Microsoft.Storage/storageAccounts@2023-01-01",
        "source_path": "infra/azure/customer-billing-storage-with-long-name.bicep",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59001,
            "provider": "Azure",
            "category": "resource",
            "resource_type": "Microsoft.Storage/storageAccounts@2023-01-01",
            "name": "customerBillingStorageAccount",
            "source": "bicep",
            "detail": "Bicep resource Microsoft.Storage/storageAccounts@2023-01-01",
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
    INFRA_FACTS[0],
]

OVERVIEW = {
    "repo_id": 934,
    "total_files": 180,
    "total_symbols": 768,
    "languages": [{"language": "TypeScript", "file_count": 90, "line_count": 16000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "infra", "file_count": 35, "line_count": 4000}],
    "modules": [{"path": "infra", "file_count": 35, "line_count": 4000, "symbol_count": 100, "languages": ["HCL", "YAML"], "sample_files": ["infra/terraform/customer-billing-platform/main.tf"]}],
    "module_dependencies": [],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "configs": [{"path": "serverless.yml", "kind": "config", "detail": "YAML", "total_lines": 40}],
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
    "infra_resources": [
        {
            "provider": fact["metadata"]["provider"],
            "category": fact["metadata"]["category"],
            "resource_type": fact["metadata"]["resource_type"],
            "name": fact["metadata"]["name"],
            "source_path": fact["source_path"],
            "line": fact["source_line"] or 1,
            "source": fact["metadata"]["source"],
            "detail": fact["metadata"]["detail"],
        }
        for fact in INFRA_FACTS
    ],
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
    "symbol_types": {"function": 500, "class": 268},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 768, "total_files": 180, "functions": 500, "classes": 268, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/934/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/934/facts":
        facts = INFRA_FACTS if query.get("kind") == ["infra_resource"] else ALL_FACTS
        return {"repo_id": 934, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/934/relationships":
        return {"repo_id": 934, "total": 0, "relationships": []}
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
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Infra").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("AWS:resource:aws_s3_bucket:customer_billing_archive_bucket_with_long_name").wait_for(timeout=10000)
    facts.get_by_text("Terraform:module:module:networking_foundation_with_long_name").wait_for(timeout=10000)
    facts.get_by_text("AWS:resource:AWS::Serverless::Function:CustomerBillingWebhookProcessorWithLongName").wait_for(timeout=10000)
    facts.get_by_text("Serverless Framework:function:function:chargeCustomerWithVeryLongName").wait_for(timeout=10000)
    facts.get_by_text("Azure:resource:Microsoft.Storage/storageAccounts@2023-01-01:customerBillingStorageAccount").wait_for(timeout=10000)
    facts.get_by_text("infra/cloudformation/customer-billing-template-with-long-name.yaml:6").wait_for(timeout=10000)
    if facts.get_by_text("pnpm test").count() != 0:
        raise AssertionError("Infra filter still shows stale runbook fact")
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

    infra_requests = [url for url in requests if "/facts" in url and "kind=infra_resource" in url]
    if len(infra_requests) < len(VIEWPORTS):
        failures["requests"] = [f"expected infra fact request per viewport, got {len(infra_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"infra_fact_requests={len(infra_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("infra facts UI check passed")


if __name__ == "__main__":
    main()
