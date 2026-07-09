import json
from pathlib import Path
from urllib.parse import urlparse

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
    "phone-small": "deep-enrichment-phone-320.png",
    "laptop": "deep-enrichment-laptop-1366.png",
    "ultrawide": "deep-enrichment-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "deep-enrichment"
TARGET = "http://127.0.0.1:5174/"
REPO_ID = 701
JOB_ID = 8801

REPO = {
    "id": REPO_ID,
    "name": "shallow-first-repository-with-a-very-long-name-and-many-generated-paths-for-layout-testing",
    "source_type": "github",
    "source_url": "https://github.com/example/shallow-first-repository",
    "status": "lexical_ready",
    "active_revision": "abc1234",
    "storage_path": "/tmp/codesniff/shallow-first-repository",
    "created_at": "2026-07-05T00:00:00Z",
    "updated_at": "2026-07-05T00:00:00Z",
    "last_opened_at": "2026-07-05T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 3456789123,
    "total_symbols": 100000,
    "total_files": 100000,
    "lexical_ready": True,
    "lexical_index_mode": "shallow",
    "semantic_ready": False,
    "artifact_health": "valid",
    "artifact_warnings": [],
    "refresh_interval_minutes": None,
    "next_refresh_at": None,
    "last_scheduled_refresh_at": None,
}


def stats_response():
    return {
        "total_symbols": 100000,
        "total_files": 100000,
        "functions": 0,
        "classes": 0,
        "vector_count": 0,
        "ready": True,
        "lexical_ready": True,
        "semantic_ready": False,
        "index_status": "lexical_ready",
    }


def running_job(cancel_requested=False):
    return {
        "id": JOB_ID,
        "repo_id": REPO_ID,
        "kind": "deep_enrich",
        "status": "running",
        "phase": "deep_enriching",
        "files_seen": 100000,
        "files_indexed": 1234,
        "symbols_indexed": 4321,
        "started_at": "2026-07-05T00:01:00Z",
        "finished_at": None,
        "error": "Cancel requested by user" if cancel_requested else None,
        "cancel_requested": cancel_requested,
    }


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


def run_case(browser, name, width, height, enrich_calls, cancel_calls):
    page = browser.new_page(viewport={"width": width, "height": height})
    repo_state = dict(REPO)
    job_state = None

    def route_handler(route):
        nonlocal job_state, repo_state
        parsed = urlparse(route.request.url)
        path = parsed.path
        method = route.request.method
        if path == "/api/codesniff/stats":
            route.fulfill(status=200, content_type="application/json", json=stats_response())
            return
        if path == "/api/codesniff/repos" and method == "GET":
            route.fulfill(status=200, content_type="application/json", json=[repo_state])
            return
        if path == f"/api/codesniff/repos/{REPO_ID}/enrich" and method == "POST":
            enrich_calls.append({"repo_id": REPO_ID})
            repo_state = {**repo_state, "status": "deep_enriching"}
            job_state = running_job()
            route.fulfill(
                status=200,
                content_type="application/json",
                json={"repo": repo_state, "job": job_state, "message": "Repo queued for deep lexical enrichment"},
            )
            return
        if path == f"/api/codesniff/jobs/{JOB_ID}" and method == "GET":
            route.fulfill(status=200, content_type="application/json", json=job_state or running_job())
            return
        if path == f"/api/codesniff/jobs/{JOB_ID}/cancel" and method == "POST":
            cancel_calls.append({"job_id": JOB_ID})
            job_state = running_job(cancel_requested=True)
            route.fulfill(status=200, content_type="application/json", json=job_state)
            return
        route.continue_()

    page.route("**/api/codesniff/**", route_handler)
    page.goto(TARGET, wait_until="networkidle")

    enrich = page.locator("[data-ui='repo-enrich']").first
    enrich.wait_for(timeout=10000)
    enrich.click()
    page.locator("[data-ui='repo-enrich-cancel']").first.wait_for(timeout=10000)
    page.get_by_text("Deep enrichment: deep_enriching").wait_for(timeout=10000)
    page.locator("[data-ui='repo-enrich-cancel']").first.click()
    page.locator("[data-ui='repo-enrich-cancel'][title='Deep enrichment cancel requested']").first.wait_for(timeout=10000)

    defects = scan_layout(page)
    if name in SCREENSHOTS:
        page.screenshot(path=str(OUT_DIR / SCREENSHOTS[name]), full_page=True)
    page.close()
    return defects


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    failures = {}
    enrich_calls = []
    cancel_calls = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            for name, width, height in VIEWPORTS:
                defects = run_case(browser, name, width, height, enrich_calls, cancel_calls)
                if defects:
                    failures[name] = defects
        finally:
            browser.close()

    if len(enrich_calls) != len(VIEWPORTS):
        failures["enrich_requests"] = [f"expected {len(VIEWPORTS)} enrich requests, got {len(enrich_calls)}"]
    if len(cancel_calls) != len(VIEWPORTS):
        failures["cancel_requests"] = [f"expected {len(VIEWPORTS)} cancel requests, got {len(cancel_calls)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"enrich_requests={len(enrich_calls)}")
    print(f"cancel_requests={len(cancel_calls)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("deep enrichment UI check passed")


if __name__ == "__main__":
    main()
