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
    "phone-small": "ai-facts-phone-320.png",
    "laptop": "ai-facts-laptop-1366.png",
    "ultrawide": "ai-facts-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "ai-facts"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 974,
    "name": "ai-surface-fixture-with-long-rag-prompt-paths",
    "source_type": "upload",
    "source_url": None,
    "status": "lexical_ready",
    "active_revision": "ai974",
    "storage_path": "/tmp/codesniff/ai-facts",
    "created_at": "2026-07-06T00:00:00Z",
    "updated_at": "2026-07-06T00:00:00Z",
    "last_opened_at": "2026-07-06T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 92929292,
    "total_symbols": 910,
    "total_files": 268,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

AI_FACTS = [
    {
        "id": 1901,
        "kind": "ai_surface",
        "key": "OpenAI chat completion",
        "value": "OpenAI chat completions create call",
        "source_path": "src/ai/invoice-explanation/openai-chat-completion-with-very-long-prompt-context.ts",
        "source_line": 34,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54034,
            "category": "chat completion",
            "source": "code-signal",
            "detail": "OpenAI chat completions create call",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1902,
        "kind": "ai_surface",
        "key": "OpenAI embeddings",
        "value": "OpenAI embeddings create call",
        "source_path": "src/ai/embeddings/openai-invoice-embedding-indexer-with-extra-long-name.py",
        "source_line": 52,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54052,
            "category": "embedding",
            "source": "code-signal",
            "detail": "OpenAI embeddings create call",
            "provenance": {"source": "parsed-source"},
        },
    },
    {
        "id": 1903,
        "kind": "ai_surface",
        "key": "LangChain invoice-reconciliation retrieval agent with unusually long name",
        "value": "LangChain chain/model/agent signal",
        "source_path": "src/ai/rag/langchain-invoice-reconciliation-retrieval-agent.ts",
        "source_line": 76,
        "confidence": "heuristic",
        "metadata": {
            "rank": 54076,
            "category": "agent framework",
            "source": "code-signal",
            "detail": "LangChain chain/model/agent signal",
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
    AI_FACTS[0],
]

OVERVIEW = {
    "repo_id": 974,
    "total_files": 268,
    "total_symbols": 910,
    "languages": [{"language": "TypeScript", "file_count": 205, "line_count": 36000, "support_level": "symbol-aware", "symbol_aware": True, "searchable": True}],
    "top_directories": [{"path": "src", "file_count": 205, "line_count": 36000}],
    "modules": [{"path": "src", "file_count": 205, "line_count": 36000, "symbol_count": 880, "languages": ["TypeScript", "Python"], "sample_files": ["src/ai/invoice-explanation/openai.ts"]}],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 90}],
    "doc_sections": [],
    "configs": [{"path": ".env.example", "kind": "config", "detail": "Environment template", "total_lines": 40}],
    "tests": [{"path": "tests/ai.test.ts", "kind": "test", "detail": "test source", "total_lines": 88}],
    "entry_points": [{"path": "src/app.ts", "kind": "entry_point", "detail": "TypeScript app entry point", "total_lines": 150}],
    "package_scripts": [],
    "dependency_manifests": [{"ecosystem": "JavaScript/TypeScript", "package_manager": "npm", "source_path": "package.json", "dependency_count": 18, "dev_dependency_count": 0, "detail": "package.json"}],
    "runbook_commands": [{"category": "test", "name": "test", "command": "pytest", "source_path": "pyproject.toml", "detail": "tests"}],
    "dependencies": [],
    "stack_components": [],
    "service_integrations": [],
    "ai_surfaces": [
        {
            "name": item["key"],
            "category": item["metadata"]["category"],
            "source_path": item["source_path"],
            "line": item["source_line"],
            "source": item["metadata"]["source"],
            "detail": item["metadata"]["detail"],
        }
        for item in AI_FACTS
    ],
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
    "symbol_types": {"function": 860, "class": 50},
    "top_symbols": [],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 910, "total_files": 268, "functions": 860, "classes": 50, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/974/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/974/facts":
        facts = AI_FACTS if query.get("kind") == ["ai_surface"] else ALL_FACTS
        return {"repo_id": 974, "total": len(facts), "facts": facts}
    if path == "/api/codesniff/repos/974/relationships":
        return {"repo_id": 974, "total": 0, "relationships": []}
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
    page.get_by_text("OpenAI chat completion - chat completion").first.wait_for(timeout=10000)
    page.locator("[data-ui='repo-facts']").get_by_text("pytest").wait_for(timeout=10000)
    page.locator("[data-ui='fact-filter']").get_by_role("button", name="AI").click()
    facts = page.locator("[data-ui='repo-facts']")
    facts.get_by_text("OpenAI chat completion", exact=True).first.wait_for(timeout=10000)
    facts.get_by_text("OpenAI embeddings create call").wait_for(timeout=10000)
    facts.get_by_text("LangChain invoice-reconciliation retrieval agent with unusually long name").wait_for(timeout=10000)
    facts.get_by_text("src/ai/rag/langchain-invoice-reconciliation-retrieval-agent.ts:76").wait_for(timeout=10000)
    if facts.get_by_text("pytest").count() != 0:
        raise AssertionError("AI filter still shows stale runbook fact")
    if page.get_by_text("sk_ai_should_not_be_rendered_974").count() != 0:
        raise AssertionError("Raw AI key sample rendered")
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

    ai_requests = [url for url in requests if "/facts" in url and "kind=ai_surface" in url]
    if len(ai_requests) < len(VIEWPORTS):
        failures["ai_requests"] = [f"expected ai-surface fact request per viewport, got {len(ai_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"ai_surface_fact_requests={len(ai_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("AI facts filter UI check passed")


if __name__ == "__main__":
    main()
