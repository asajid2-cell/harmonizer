import assert from 'node:assert/strict';
import path from 'path';
import { pathToFileURL } from 'url';
import { session } from '../runtime/session.js';
import { navigate } from '../api/playwright/navigate.js';
import { screenshot } from '../api/playwright/screenshot.js';

async function runMobileLayoutTest() {
  session.setDeviceType('iPhone SE');
  await session.resetContext();

  const htmlPath = path.resolve('..', 'frontend', 'ourspace.html');
  const url = pathToFileURL(htmlPath).href;

  console.log('📱 Testing OurSpace mobile layout against', url);
  await navigate(url);

  const page = await session.getPage();
  await page.waitForSelector('#ourspace-main', { timeout: 15000 });

  // Ensure we are in customize mode so the drawer is visible.
  await page.evaluate(() => {
    const toggle = document.getElementById('mode-toggle-btn');
    if (document.body.classList.contains('view-mode') && toggle) {
      toggle.click();
    }
  });

  await page.waitForFunction(() => document.body.classList.contains('ourspace-mobile'), { timeout: 5000 });

  const layoutInfo = await page.evaluate(() => {
    const panel = document.getElementById('customization-panel');
    const grid = document.getElementById('content-grid');
    const tabs = document.querySelector('.panel-tabs');
    return {
      isMobileClass: document.body.classList.contains('ourspace-mobile'),
      layoutClass: grid?.className || '',
      panelRect: panel ? panel.getBoundingClientRect() : null,
      tabsScrollable: !!tabs && tabs.scrollWidth > tabs.clientWidth,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });

  assert.ok(layoutInfo.isMobileClass, 'Body should have ourspace-mobile class');
  assert.ok(
    layoutInfo.layoutClass.includes('layout-phone-stack'),
    `Expected phone stack layout, saw ${layoutInfo.layoutClass}`,
  );
  assert.ok(layoutInfo.panelRect, 'Customization panel missing');

  const { width, height } = layoutInfo.panelRect!;
  assert.ok(width >= layoutInfo.viewport.width * 0.9, 'Panel should span nearly full viewport width');
  assert.ok(height >= layoutInfo.viewport.height * 0.5, 'Panel should cover at least half the viewport');
  assert.ok(layoutInfo.tabsScrollable, 'Tab row should support horizontal scrolling on mobile');

  const screenshotPath = await screenshot({
    label: 'ourspace-iphone-se',
    fullPage: true,
  });
  console.log('📷 Saved screenshot:', screenshotPath);
}

runMobileLayoutTest()
  .catch((error) => {
    console.error('Mobile layout test failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await session.dispose();
  });
