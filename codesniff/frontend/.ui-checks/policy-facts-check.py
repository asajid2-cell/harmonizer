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
    "phone-small": "policy-facts-phone-320.png",
    "laptop": "policy-facts-laptop-1366.png",
    "ultrawide": "policy-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "policy-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 842,
    "name": "policy-owner-fixture-with-long-codeowners-rules",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "policy842",
    "storage_path": "/tmp/codesniff/policy-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 42424242,
    "total_symbols": 680,
    "total_files": 172,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

POLICY_FACTS = [
    {
        "id": 870,
        "kind": "repo_policy",
        "key": "license",
        "value": "Apache-2.0",
        "source_path": "LICENSE",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59001,
            "policy_type": "license",
            "name": "license",
            "source": "license-file",
            "detail": "LICENSE",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 871,
        "kind": "repo_policy",
        "key": "security",
        "value": "Security disclosure process for extremely long enterprise repository names",
        "source_path": "SECURITY.md",
        "source_line": 1,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59002,
            "policy_type": "security",
            "name": "security",
            "source": "policy-file",
            "detail": "SECURITY.md",
            "provenance": {"source": "parsed-source"},
        },
    },
]

OWNER_FACTS = [
    {
        "id": 872,
        "kind": "code_owner",
        "key": "/src/payments/reconciliation/very/deep/path/with/long/component-name/*",
        "value": "@platform/billing-reconciliation-maintainers @security/application-reviewers",
        "source_path": ".github/CODEOWNERS",
        "source_line": 2,
        "confidence": "heuristic",
        "metadata": {
            "rank": 59037,
            "owners": ["@platform/billing-reconciliation-maintainers", "@security/application-reviewers"],
            "detail": "long owner rule",
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
    POLICY_FACTS[0],
    OWNER_FACTS[0],
]

OVERVIEW = {
    "repo_id": 842,
    "total_files": 172,
    "total_symbols": 680,
    "languages": [{"language": "Python", "file_count": 120, "line_count": 18000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 120, "line_count": 18000}],
    "modules": [{"path": "src", "file_count": 120, "line_count": 18000, "symbol_count": 580, "languages": ["Python"], "sample_files": ["src/main.py"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 80}],
    "doc_sections": [],
    "configs": [{"path": "pyproject.toml", "kind": "config", "detail": "Python project manifest", "total_lines": 30}],
    "tests": [{"path": "tests/test_policy.py", "kind": "test", "detail": "test source", "total_lines": 40}],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "Python app entry point", "total_lines": 100}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "Python", "package_manager": "pip", "source_path": "pyproject.toml", "dependency_count": 3, "dev_dependency_count": 2, "detail": "Python project"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "Python tests"}],
    "dependencies": [],
    "environment_variables": [],
    "ci_workflows": [],
    "container_services": [],
    "runtime_requirements": [],
    "repo_policies": [
        {"policy_type": item["metadata"]["policy_type"], "name": item["metadata"]["name"], "value": item["value"], "source_path": item["source_path"], "line": item["source_line"], "source": item["metadata"]["source"], "detail": item["metadata"]["detail"]}
        for item in POLICY_FACTS
    ],
    "code_owners": [
        {"pattern": item["key"], "owners": item["metadata"]["owners"], "source_path": item["source_path"], "line": item["source_line"], "detail": item["metadata"]["detail"]}
        for item in OWNER_FACTS
    ],
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 580, "class": 100},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 680, "total_files": 172, "functions": 580, "classes": 100, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/842/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/842/facts":
        if query.get("kind") == ["repo_policy"]:
            facts = POLICY_FACTS
        elif query.get("kind") == ["code_owner"]:
            facts = OWNER_FACTS
        else:
            facts = ALL_FACTS
        return {"repo_id": 842, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/842/relationships":
        return {"repo_id": 842, "total": 0, "relationships": []}
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
    page.get_by_text("license: Apache-2.0").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)

    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Policy").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("license", exact=True).wait_for(timeout=10000)
    facts.get_by_text("Apache-2.0").wait_for(timeout=10000)
    facts.get_by_text("SECURITY.md:1").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Policy filter still shows stale runbook fact")

    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Owners").click()
    facts.get_by_text("/src/payments/reconciliation/very/deep/path/with/long/component-name/*").wait_for(timeout=10000)
    facts.get_by_text("@platform/billing-reconciliation-maintainers @security/application-reviewers").wait_for(timeout=10000)
    facts.get_by_text(".github/CODEOWNERS:2").wait_for(timeout=10000)

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

    policy_requests = [url for url in requests if "/facts" in url and "kind=repo_policy" in url]
    owner_requests = [url for url in requests if "/facts" in url and "kind=code_owner" in url]
    if len(policy_requests) < len(VIEWPORTS):
        failures["policy_requests"] = [f"expected policy fact request per viewport, got {len(policy_requests)}"]
    if len(owner_requests) < len(VIEWPORTS):
        failures["owner_requests"] = [f"expected owner fact request per viewport, got {len(owner_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"repo_policy_fact_requests={len(policy_requests)}")
    print(f"code_owner_fact_requests={len(owner_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("policy and owner facts filter UI check passed")


if __name__ == "__main__":
    main()
