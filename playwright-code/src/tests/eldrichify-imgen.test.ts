import assert from 'node:assert/strict';
import path from 'path';
import { pathToFileURL } from 'url';
import { session } from '../runtime/session.js';
import { navigate } from '../api/playwright/navigate.js';

const API_BASE = 'https://mock.api.local';
const HD_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Yd9lwAAAABJRU5ErkJggg==';

async function runEldrichifyImgenTest() {
  session.setDeviceType('desktop');
  await session.resetContext();

  const page = await session.getPage();
  await page.addInitScript((apiBase) => {
    window.HARMONIZER_CONFIG = Object.assign({}, window.HARMONIZER_CONFIG || {}, {
      apiBaseUrl: apiBase,
    });
  }, API_BASE);

  const htmlPath = path.resolve('..', 'frontend', 'eldrichify.html');
  const url = pathToFileURL(htmlPath).href;
  console.log('** Testing Eldrichify IMGEN flow at', url);
  await navigate(url);

  await page.route(`${API_BASE}/api/imgen`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 'job-playwright', status: 'pending' }),
    });
  });

  let pollCount = 0;
  await page.route(`${API_BASE}/api/imgen/status/*`, async (route) => {
    pollCount += 1;
    let payload;
    if (pollCount < 3) {
      payload = {
        status: 'queued',
        queue_position: Math.max(0, 3 - pollCount),
        eta_seconds: 20,
      };
    } else {
      payload = {
        status: 'completed',
        result: {
          mode: 'prompt',
          prompt: 'Playwright prompt',
          seed: 42,
          filename: 'playwright.png',
          image_url: '/media/generated/playwright.png',
          previews: { hd: HD_DATA_URL },
        },
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  await page.click('#launch-pipeline-btn');
  await page.waitForSelector('.eld-terminal-window:not([hidden])', { timeout: 10000 });

  await page.getByRole('button', { name: 'IMGEN' }).click();
  await page.fill('textarea.eld-terminal-textarea', 'neon rooftops under midnight rain');
  await page.click('button.eld-terminal-submit');

  await page.waitForSelector('.eld-progress', { timeout: 15000 });
  await page.waitForSelector('#results-grid:not([hidden])', { timeout: 20000 });

  const hdSrc = await page.$eval('#result-hd', (img) => img?.getAttribute('src') || '');
  assert.ok(hdSrc.startsWith('data:image/png;base64'), 'HD preview should be populated via data URL');

  const downloadPanelVisible = await page.$eval(
    '#download-panel',
    (panel) => !!panel && !panel.hasAttribute('hidden'),
  );
  assert.equal(downloadPanelVisible, true, 'Download panel should be visible after completion');

  const tracedHref = await page.$eval('[data-api-link="traced-model"]', (link) => link?.href || '');
  assert.equal(tracedHref, `${API_BASE}/download-traced-model`, 'Traced model link should use API base');

  console.log('** Eldrichify IMGEN test HD src preview:', hdSrc.slice(0, 48) + '...');
}

runEldrichifyImgenTest()
  .catch((error) => {
    console.error('Eldrichify IMGEN test failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await session.dispose();
  });
