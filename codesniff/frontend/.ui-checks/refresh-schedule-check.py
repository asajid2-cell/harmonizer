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
    "phone-small": "refresh-schedule-phone-320.png",
    "laptop": "refresh-schedule-laptop-1366.png",
    "ultrawide": "refresh-schedule-ultrawide-2560.png",
}

OUT_DIR = Path(__file__).resolve().parent / "refresh-schedule"
TARGET = "http://127.0.0.1:5174/"

REPO = {
    "id": 512,
    "name": "scheduled-refresh-fixture-with-a-very-long-name-for-layout-testing",
    "source_type": "github",
    "source_url": "https://github.com/example/scheduled-refresh-fixture",
    "status": "lexical_ready",
    "active_revision": "abc1234",
    "storage_path": "/tmp/codesniff/scheduled-refresh-fixture",
    "created_at": "2026-07-05T00:00:00Z",
    "updated_at": "2026-07-05T00:00:00Z",
    "last_opened_at": "2026-07-05T00:00:00Z",
    "error_summary": None,
    "storage_bytes": 2345678910,
    "total_symbols": 77777,
    "total_files": 100000,
    "lexical_ready": True,
    "semantic_ready": False,
    "artifact_health": "ok",
    "artifact_warnings": [],
    "refresh_interval_minutes": None,
    "next_refresh_at": None,
    "last_scheduled_refresh_at": None,
}


def stats_response():
    return {
        "total_symbols": 77777,
        "total_files": 100000,
        "functions": 50000,
        "classes": 1200,
        "vector_count": 0,
        "ready": True,
        "lexical_ready": True,
        "semantic_ready": False,
        "index_status": "lexical_ready",
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


def run_case(browser, name, width, height, schedule_calls):
    page = browser.new_page(viewport={"width": width, "height": height})
    repo_state = dict(REPO)

    def route_handler(route):
        parsed = urlparse(route.request.url)
        path = parsed.path
        if path == "/api/codesniff/stats":
            route.fulfill(status=200, content_type="application/json", json=stats_response())
            return
        if path == "/api/codesniff/repos" and route.request.method == "GET":
            route.fulfill(status=200, content_type="application/json", json=[repo_state])
            return
        if path == "/api/codesniff/repos/512/refresh/schedule" and route.request.method == "POST":
            body = json.loads(route.request.post_data or "{}")
            schedule_calls.append(body)
            interval = body.get("interval_minutes")
            repo_state.update(
                {
                    "refresh_interval_minutes": interval,
                    "next_refresh_at": "2026-07-05T13:00:00Z" if interval else None,
                    "last_scheduled_refresh_at": None,
                }
            )
            route.fulfill(status=200, content_type="application/json", json=repo_state)
            return
        route.continue_()

    page.route("**/api/codesniff/**", route_handler)
    page.goto(TARGET, wait_until="networkidle")

    schedule = page.locator("[data-ui='repo-refresh-schedule']").first
    schedule.wait_for(timeout=10000)
    schedule.select_option("1440")
    page.wait_for_function(
        "() => document.querySelector('[data-ui=\"repo-refresh-schedule\"]')?.value === '1440'",
        timeout=10000,
    )
    page.locator("[data-ui='repo-refresh']").first.wait_for(timeout=10000)
    page.locator("[data-ui='semantic-warm']").first.wait_for(timeout=10000)

    defects = scan_layout(page)
    if name in SCREENSHOTS:
        page.screenshot(path=str(OUT_DIR / SCREENSHOTS[name]), full_page=True)
    page.close()
    return defects


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    failures = {}
    schedule_calls = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            for name, width, height in VIEWPORTS:
                defects = run_case(browser, name, width, height, schedule_calls)
                if defects:
                    failures[name] = defects
        finally:
            browser.close()

    daily_calls = [call for call in schedule_calls if call.get("interval_minutes") == 1440]
    if len(daily_calls) != len(VIEWPORTS):
        failures["schedule_requests"] = [f"expected {len(VIEWPORTS)} daily schedule requests, got {len(daily_calls)}"]

    print(f"viewports={len(VIEWPORTS)}")
    print(f"schedule_requests={len(daily_calls)}")
    print(f"screenshots={','.join(str(OUT_DIR / name) for name in SCREENSHOTS.values())}")
    if failures:
        print(f"failures={failures}")
        raise SystemExit(1)
    print("refresh schedule UI check passed")


if __name__ == "__main__":
    main()
