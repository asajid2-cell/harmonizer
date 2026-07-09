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
    "phone-small": "file-browser-phone-320.png",
    "laptop": "file-browser-laptop-1366.png",
    "ultrawide": "file-browser-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "file-browser"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 420,
    "name": "file-browser-fixture-with-a-very-long-name-for-layout-testing",
    "source_type": "github",
    "source_url": "https://github.com/example/file-browser-fixture",
    "status": "lexical_ready",
    "active_revision": "abc1234",
    "storage_path": "/tmp/codesniff/file-browser-fixture",
    "created_at": "2026-07-05T00:00:00Z",
    "updated_at": "2026-07-05T00:00:00Z",
    "last_opened_at": "2026-07-05T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 456789123,
    "total_symbols": 24680,
    "total_files": 100000,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
}

OVERVIEW = {
    "repo_id": 420,
    "total_files": 100000,
    "total_symbols": 24680,
    "languages": [{"language": "Python", "file_count": 2400, "line_count": 180000}],
    "top_directories": [{"path": "src", "file_count": 2400, "line_count": 180000}],
    "modules": [
        {
            "path": "src/authentication_and_authorization",
            "file_count": 18,
            "line_count": 3200,
            "symbol_count": 140,
            "languages": ["Python"],
            "sample_files": ["src/authentication_and_authorization/service_with_a_very_long_filename.py"],
        }
    ],
    "docs": [],
    "configs": [],
    "tests": [],
    "entry_points": [{"path": "src/main.py", "kind": "entry_point", "detail": "runtime entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [],
    "dependencies": [],
    "route_endpoints": [],
    "import_relationships": [],
    "symbol_types": {"class": 120, "function": 900},
    "top_symbols": [],
    "warnings": [],
}

FILES = [
    {
        "id": 7,
        "path": "src/authentication_and_authorization/service_with_a_very_long_filename.py",
        "total_lines": 128,
        "indexed_at": "2026-07-05T00:00:00Z",
        "symbol_count": 2,
    },
    {
        "id": 8,
        "path": "src/authentication_and_authorization/models.py",
        "total_lines": 88,
        "indexed_at": "2026-07-05T00:00:00Z",
        "symbol_count": 1,
    },
]

FILE_CONTENT = {
    "repo_id": 420,
    "file": FILES[0],
    "size_bytes": 812,
    "symbols": [
        {
            "id": 21,
            "name": "AuthenticationServiceWithVeryLongName",
            "symbol_type": "class",
            "start_line": 1,
            "end_line": 8,
            "docstring": None,
        },
        {
            "id": 22,
            "name": "authenticate_user_with_refresh_token_rotation",
            "symbol_type": "function",
            "start_line": 10,
            "end_line": 18,
            "docstring": "Authenticate a user and rotate refresh tokens.",
        },
    ],
    "content": (
        "class AuthenticationServiceWithVeryLongName:\n"
        "    def __init__(self, credential_store, audit_sink):\n"
        "        self.credential_store = credential_store\n"
        "        self.audit_sink = audit_sink\n\n"
        "def authenticate_user_with_refresh_token_rotation(username, password, device_fingerprint):\n"
        "    if not username or not password:\n"
        "        return None\n"
        "    audit_key = 'authentication-refresh-token-rotation-path-with-long-string-for-wrapping'\n"
        "    return {'user': username, 'audit_key': audit_key, 'device': device_fingerprint}\n"
    ),
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {"total_symbols": 24680, "total_files": 100000, "functions": 900, "classes": 120, "vector_count": 0, "ready": True, "lexical_ready": True, "semantic_ready": False, "index_status": "lexical_ready"}
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/420/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/420/facts":
        return {"repo_id": 420, "total": 0, "facts": []}
    if path == "/api/codesniff/repos/420/relationships":
        return {"repo_id": 420, "total": 0, "relationships": []}
    if path == "/api/codesniff/repos/420/files":
        return {"repo_id": 420, "total_files": len(FILES), "files": FILES}
    if path == "/api/codesniff/repos/420/file":
        if query.get("path") == [FILES[0]["path"]]:
            return FILE_CONTENT
        return {"repo_id": 420, "file": FILES[1], "size_bytes": 20, "symbols": [], "content": "class Account:\n    pass\n"}
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
    page.locator("[data-ui='repo-modules']").get_by_text("src/authentication_and_authorization", exact=True).wait_for(timeout=10000)
    page.locator("[data-ui='browse-files']").click()
    page.locator("[data-ui='file-browser']").get_by_text(FILES[0]["path"]).wait_for(timeout=10000)
    page.locator("[data-ui='file-row']").first.click()
    page.locator("[data-ui='file-source']").get_by_text("authenticate_user_with_refresh_token_rotation").first.wait_for(timeout=10000)
    page.locator("[data-ui='file-source']").get_by_text("AuthenticationServiceWithVeryLongName").first.wait_for(timeout=10000)
    page.locator("[data-ui='file-source']").get_by_text("authentication-refresh-token-rotation-path").first.wait_for(timeout=10000)
    defects = scan_layout(page)
    if name in SCREENSHOTS:
        page.screenshot(path=str(OUT_DIR / SCREENSHOTS[name]), full_page=True)
    page.keyboard.press("Escape")
    page.locator("[data-ui='file-browser']").wait_for(state="hidden", timeout=5000)
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

    files_requests = [url for url in requests if "/repos/420/files" in url]
    file_requests = [url for url in requests if "/repos/420/file" in url and "path=" in url]
    if len(files_requests) < len(VIEWPORTS):
        failures["files_requests"] = [f"expected files request per viewport, got {len(files_requests)}"]
    if len(file_requests) < len(VIEWPORTS):
        failures["file_requests"] = [f"expected file detail request per viewport, got {len(file_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"files_requests={len(files_requests)}")
    print(f"file_requests={len(file_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("file browser UI check passed")


if __name__ == "__main__":
    main()
