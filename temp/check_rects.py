import asyncio, sys, subprocess, time
from pathlib import Path
from playwright.async_api import async_playwright

REPO = Path(r"z:\328\CMPUT328-A2\codexworks\301\harmonizer")

async def count_rects(url):
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto(url, wait_until='networkidle')
        await page.wait_for_timeout(1500)
        rects = await page.eval_on_selector_all('#tiles svg rect', 'nodes => nodes.length')
        await browser.close()
        return rects

def run(url):
    server = subprocess.Popen([sys.executable, 'app.py'], cwd=REPO)
    try:
        time.sleep(3)
        rects = asyncio.run(count_rects(url))
        print(rects)
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

if __name__ == '__main__':
    import sys
    run(sys.argv[1])
