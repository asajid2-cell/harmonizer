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
    "phone-small": "message-bus-facts-phone-320.png",
    "laptop": "message-bus-facts-laptop-1366.png",
    "ultrawide": "message-bus-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "message-bus-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 981,
    "name": "message-bus-fixture-with-long-event-broker-and-topic-paths",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "events981",
    "storage_path": "/tmp/codesniff/message-bus-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 121212121,
    "total_symbols": 1288,
    "total_files": 338,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

MESSAGE_BUS_FACTS = [
    {
        "id": 3001,
        "kind": "message_bus",
        "key": "Kafka",
        "value": "Kafka broker/topic signal",
        "source_path": "src/events/kafka/customer-invoice-created-topic-producer-with-very-long-name.ts",
        "source_line": 27,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54027,
            "category": "event streaming",
            "source": "code-signal",
            "detail": "Kafka broker/topic signal",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 3002,
        "kind": "message_bus",
        "key": "Kafka producer",
        "value": "Kafka produce/send signal",
        "source_path": "src/events/kafka/customer-invoice-created-topic-producer-with-very-long-name.ts",
        "source_line": 48,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54088,
            "category": "producer",
            "source": "code-signal",
            "detail": "Kafka produce/send signal",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 3003,
        "kind": "message_bus",
        "key": "Amazon SQS",
        "value": "Amazon SQS queue signal; value not stored",
        "source_path": ".env.example",
        "source_line": 9,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54039,
            "category": "message queue",
            "source": "environment-name",
            "detail": "Amazon SQS queue signal; value not stored",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 3004,
        "kind": "message_bus",
        "key": "RabbitMQ consumer",
        "value": "RabbitMQ consume signal",
        "source_path": "src/events/rabbitmq/invoice-retry-dead-letter-consumer-with-extra-long-routing-key.ts",
        "source_line": 116,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54116,
            "category": "consumer",
            "source": "code-signal",
            "detail": "RabbitMQ consume signal",
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
    MESSAGE_BUS_FACTS[0],
]

OVERVIEW = {
    "repo_id": 981,
    "total_files": 338,
    "total_symbols": 1288,
    "languages": [{"language": "TypeScript", "file_count": 246, "line_count": 42000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 246, "line_count": 42000}],
    "modules": [{"path": "src/events", "file_count": 28, "line_count": 6200, "symbol_count": 184, "languages": ["TypeScript", "Python"], "sample_files": ["src/events/kafka/producer.ts"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 120}],
    "doc_sections": [],
    "configs": [{"path": ".env.example", "kind": "config", "detail": "Environment template", "total_lines": 48}],
    "tests": [{"path": "tests/events.test.ts", "kind": "test", "detail": "test source", "total_lines": 96}],
    "entry_points": [{"path": "src/app.ts", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 160}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "npm", "source_path": "package.json", "dependency_count": 28, "dev_dependency_count": 0, "detail": "package.json"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "tests"}],
    "dependencies": [],
    "stack_components": [],
    "service_integrations": [],
    "message_buses": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in MESSAGE_BUS_FACTS
    ],
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
    "repo_policies": [],
    "code_owners": [],
    "deploy_targets": [],
    "secret_signals": [],
    "route_endpoints": [],
    "import_relationships": [],
    "schema_facts": [],
    "symbol_types": {"function": 1220, "class": 68},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 1288, "total_files": 338, "functions": 1220, "classes": 68, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/981/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/981/facts":
        facts = MESSAGE_BUS_FACTS if query.get("kind") == ["message_bus"] else ALL_FACTS
        return {"repo_id": 981, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/981/relationships":
        return {"repo_id": 981, "total": 0, "relationships": []}
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
    page.get_by_text("Kafka - event streaming").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="Events").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("Kafka", exact=True).first.wait_for(timeout=10000)
    facts.get_by_text("Kafka produce/send signal").wait_for(timeout=10000)
    facts.get_by_text("Amazon SQS queue signal; value not stored").wait_for(timeout=10000)
    facts.get_by_text("src/events/rabbitmq/invoice-retry-dead-letter-consumer-with-extra-long-routing-key.ts:116").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("Events filter still shows stale runbook fact")
    if page.get_by_text("kafka_should_not_be_rendered_981").count() != 0:
        raise AssertionError("Raw Kafka broker sample rendered")
    if page.get_by_text("https://sqs.example/should_not_be_rendered_981").count() != 0:
        raise AssertionError("Raw SQS URL sample rendered")
    if page.get_by_text("rabbitmq_should_not_be_rendered_981").count() != 0:
        raise AssertionError("Raw RabbitMQ secret sample rendered")
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

    message_bus_requests = [url for url in requests if "/facts" in url and "kind=message_bus" in url]
    if len(message_bus_requests) < len(VIEWPORTS):
        failures["message_bus_requests"] = [f"expected message-bus fact request per viewport, got {len(message_bus_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"message_bus_fact_requests={len(message_bus_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("Message-bus facts filter UI check passed")


if __name__ == "__main__":
    main()
