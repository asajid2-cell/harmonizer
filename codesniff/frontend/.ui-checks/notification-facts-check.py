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
    "phone-small": "notification-facts-phone-320.png",
    "laptop": "notification-facts-laptop-1366.png",
    "ultrawide": "notification-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "notification-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 972,
    "name": "notification-surface-fixture-with-long-message-paths",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "notify972",
    "storage_path": "/tmp/codesniff/notification-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 74747474,
    "total_symbols": 760,
    "total_files": 226,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

NOTIFY_FACTS = [
    {
        "id": 1701,
        "kind": "notification_surface",
        "key": "SendGrid",
        "value": "SendGrid email send call",
        "source_path": "src/notifications/email/sendgrid-invoice-reminder-with-extra-long-template-name.ts",
        "source_line": 28,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54028,
            "category": "email",
            "source": "code-signal",
            "detail": "SendGrid email send call",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1702,
        "kind": "notification_surface",
        "key": "Twilio",
        "value": "Twilio message send call",
        "source_path": "src/notifications/sms/twilio-payment-failure-escalation-with-very-long-region-name.py",
        "source_line": 41,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54041,
            "category": "sms",
            "source": "code-signal",
            "detail": "Twilio message send call",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1703,
        "kind": "notification_surface",
        "key": "Slack incident notification for enterprise-billing-reconciliation",
        "value": "Slack message send call",
        "source_path": "src/notifications/chat/slack-enterprise-billing-reconciliation-alerts.ts",
        "source_line": 64,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54064,
            "category": "chat",
            "source": "code-signal",
            "detail": "Slack message send call",
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
    NOTIFY_FACTS[0],
]

OVERVIEW = {
    "repo_id": 972,
    "total_files": 226,
    "total_symbols": 760,
    "languages": [{"language": "TypeScript", "file_count": 150, "line_count": 27000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 150, "line_count": 27000}],
    "modules": [{"path": "src", "file_count": 150, "line_count": 27000, "symbol_count": 720, "languages": ["TypeScript", "Python"], "sample_files": ["src/notifications/email/sendgrid.ts"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 70}],
    "doc_sections": [],
    "configs": [{"path": ".env.example", "kind": "config", "detail": "Environment template", "total_lines": 30}],
    "tests": [{"path": "tests/notifications.test.ts", "kind": "test", "detail": "test source", "total_lines": 62}],
    "entry_points": [{"path": "src/app.ts", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 142}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "npm", "source_path": "package.json", "dependency_count": 14, "dev_dependency_count": 0, "detail": "package.json"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "tests"}],
    "dependencies": [],
    "stack_components": [],
    "service_integrations": [],
    "auth_surfaces": [],
    "background_jobs": [],
    "webhook_surfaces": [],
    "observability_surfaces": [],
    "feature_flags": [],
    "notification_surfaces": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in NOTIFY_FACTS
    ],
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
    "symbol_types": {"function": 720, "class": 40},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 760, "total_files": 226, "functions": 720, "classes": 40, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/972/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/972/facts":
        facts = NOTIFY_FACTS if query.get("kind") == ["notification_surface"] else ALL_FACTS
        return {"repo_id": 972, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/972/relationships":
        return {"repo_id": 972, "total": 0, "relationships": []}
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
    page.get_by_text("SendGrid - email").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Notify").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("SendGrid", exact=True).first.wait_for(timeout=10000)
    facts.get_by_text("Twilio message send call").wait_for(timeout=10000)
    facts.get_by_text("Slack incident notification for enterprise-billing-reconciliation").wait_for(timeout=10000)
    facts.get_by_text("src/notifications/chat/slack-enterprise-billing-reconciliation-alerts.ts:64").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Notify filter still shows stale runbook fact")
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

    notify_requests = [url for url in requests if "/facts" in url and "kind=notification_surface" in url]
    if len(notify_requests) < len(VIEWPORTS):
        failures["notify_requests"] = [f"expected notification-surface fact request per viewport, got {len(notify_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"notification_surface_fact_requests={len(notify_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("notification facts filter UI check passed")


if __name__ == "__main__":
    main()
