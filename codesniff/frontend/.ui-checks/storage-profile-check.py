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
    "phone-small": "storage-profile-phone-320.png",
    "laptop": "storage-profile-laptop-1366.png",
    "ultrawide": "storage-profile-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "storage-profile"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 913,
    "name": "storage-profile-fixture-with-a-very-long-name-for-cold-artifact-layout-testing",
    "source_type": "github",
    "source_url": "https://github.com/example/storage-profile-fixture",
    "status": "lexical_ready",
    "active_revision": "abc1234",
    "storage_path": "/tmp/codesniff/storage-profile-fixture",
    "created_at": "2026-07-05T00:00:00Z",
    "updated_at": "2026-07-05T00:00:00Z",
    "last_opened_at": "2026-07-05T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 4567891230,
    "total_symbols": 222222,
    "total_files": 100000,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
    "refresh_interval_minutes": None,
    "next_refresh_at": None,
    "last_scheduled_refresh_at": None,
}

OVERVIEW = {
    "repo_id": 913,
    "total_files": 100000,
    "total_symbols": 222222,
    "languages": [{"language": "TypeScript", "file_count": 38000, "line_count": 980000}],
    "top_directories": [{"path": "packages", "file_count": 28000, "line_count": 760000}],
    "modules": [
        {
            "path": "packages/storage-profile-module-with-a-very-long-name-for-wrapping",
            "file_count": 2400,
            "line_count": 180000,
            "symbol_count": 16000,
            "languages": ["TypeScript"],
            "sample_files": ["packages/storage-profile-module-with-a-very-long-name-for-wrapping/src/index.ts"],
        }
    ],
    "docs": [{"path": "README.md", "kind": "doc", "detail": "repo documentation", "total_lines": 120}],
    "configs": [{"path": "package.json", "kind": "config", "detail": "npm package manifest", "total_lines": 80}],
    "tests": [{"path": "tests/storage_profile_layout_test.spec.ts", "kind": "test", "detail": "test source", "total_lines": 160}],
    "entry_points": [{"path": "src/main.ts", "kind": "entry_point", "detail": "runtime entry point", "total_lines": 80}],
    "package_scripts": [],
    "dependency_manifests": [],
    "runbook_commands": [],
    "dependencies": [],
    "route_endpoints": [],
    "import_relationships": [],
    "symbol_types": {"function": 9000, "class": 1200},
    "top_symbols": [],
    "warnings": [],
}

TEACHING = {
    "repo_id": 913,
    "generated_from": "cold_overview_v1",
    "warnings": [],
    "steps": [
        {
            "id": "start",
            "title": "Start",
            "summary": "Start with src/main.ts and package.json.",
            "citations": [{"source_path": "src/main.ts", "source_line": 1, "label": "runtime entry point", "kind": "entry_point"}],
        }
    ],
}

STORAGE_PROFILE = {
    "repo_id": 913,
    "total_bytes": 9876543210,
    "artifact_bytes": {
        "repo_sqlite": 349175808,
        "manifest": 8192,
        "source": 4194304000,
        "vector": 268435456,
        "logs": 524288,
        "other": 33554432,
    },
    "file_count": 100000,
    "blob_count": 99888,
    "blob_coverage": 0.99888,
    "blob_compressed_bytes": 1879048192,
    "blob_uncompressed_bytes": 5637144576,
    "blob_compression_ratio": 0.33333,
    "sampled_blob_count": 5,
    "sampled_decompress_ms_total": 7.61,
    "sampled_decompress_ms_max": 2.42,
    "sampled_blobs": [
        {
            "path": "packages/storage-profile-module-with-a-very-long-name-for-wrapping/src/server/routes/accounts/[accountId]/extremely_long_file_name_that_must_wrap_without_overflow.ts",
            "compression": "zstd",
            "compressed_bytes": 18432,
            "uncompressed_bytes": 68814,
            "compression_ratio": 0.26785,
            "decompress_ms": 1.37,
        },
        {
            "path": "apps/web/src/app/(authenticated)/admin/storage-profile/long-cold-repo-dashboard-view-model.tsx",
            "compression": "zstd",
            "compressed_bytes": 14336,
            "uncompressed_bytes": 49152,
            "compression_ratio": 0.29166,
            "decompress_ms": 2.42,
        },
        {
            "path": "backend/services/indexing/cold_artifact_source_blob_latency_probe_with_a_long_name.py",
            "compression": "zstd",
            "compressed_bytes": 12012,
            "uncompressed_bytes": 44122,
            "compression_ratio": 0.27225,
            "decompress_ms": 1.11,
        },
        {
            "path": "docs/architecture/cold-storage-indexed-repo-weight-and-activation-budget.md",
            "compression": "zstd",
            "compressed_bytes": 9216,
            "uncompressed_bytes": 32768,
            "compression_ratio": 0.28125,
            "decompress_ms": 0.92,
        },
        {
            "path": "tests/fixtures/large_repo/storage_profile_fixture_with_100000_files_snapshot.json",
            "compression": "zstd",
            "compressed_bytes": 4096,
            "uncompressed_bytes": 12288,
            "compression_ratio": 0.33333,
            "decompress_ms": 1.79,
        },
    ],
    "warnings": [],
}


def api_response(url: str):
    parsed = urlparse(url)
    path = parsed.path
    query = parse_qs(parsed.query)
    if path == "/api/codesniff/stats":
        return {
            "total_symbols": 222222,
            "total_files": 100000,
            "functions": 9000,
            "classes": 1200,
            "vector_count": 0,
            "ready": True,
            "lexical_ready": True,
            "semantic_ready": False,
            "index_status": "lexical_ready",
        }
    if path == "/api/codesniff/repos":
        return [REPO]
    if path == "/api/codesniff/repos/913/overview":
        return OVERVIEW
    if path == "/api/codesniff/repos/913/teaching":
        return TEACHING
    if path == "/api/codesniff/repos/913/facts":
        return {"repo_id": 913, "total": 0, "facts": []}
    if path == "/api/codesniff/repos/913/relationships":
        return {"repo_id": 913, "total": 0, "relationships": []}
    if path == "/api/codesniff/repos/913/storage-profile":
        assert query.get("sample_blobs") == ["5"]
        return STORAGE_PROFILE
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
            const label = ((el.innerText || el.value || el.getAttribute('aria-label') || el.tagName) + '').trim().slice(0, 70);
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
    page.locator("[data-ui='storage-profile-run']").click()
    panel = page.locator("[data-ui='storage-profile']")
    panel.get_by_text("9.2 GB").wait_for(timeout=10000)
    panel.get_by_text("100%").wait_for(timeout=10000)
    panel.get_by_text("33%").wait_for(timeout=10000)
    panel.get_by_text("repo sqlite").wait_for(timeout=10000)
    panel.get_by_text("1.8 GB compressed from 5.3 GB source").wait_for(timeout=10000)
    panel.get_by_text("packages/storage-profile-module-with-a-very-long-name-for-wrapping").wait_for(timeout=10000)
    panel.get_by_text("extremely_long_file_name_that_must_wrap_without_overflow.ts").wait_for(timeout=10000)
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

    profile_requests = [url for url in requests if "/repos/913/storage-profile" in url]
    if len(profile_requests) != len(VIEWPORTS):
        failures["storage_profile_requests"] = [f"expected {len(VIEWPORTS)} profile requests, got {len(profile_requests)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"storage_profile_requests={len(profile_requests)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("storage profile UI check passed")


if __name__ == "__main__":
    main()
