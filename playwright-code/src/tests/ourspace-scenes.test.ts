import path from 'path';
import { pathToFileURL } from 'url';
import type { Page } from 'playwright';
import { session } from '../runtime/session.js';
import { navigate } from '../api/playwright/navigate.js';
import { screenshot } from '../api/playwright/screenshot.js';

const OURSPACE_HTML = path.resolve('..', 'frontend', 'ourspace.html');
const WIDGET_SELECTOR = '#about-me-widget';
const SECONDARY_WIDGET_SELECTOR = '#comments-widget';

async function ensureCustomizeMode(page: Page) {
  const isViewMode = await page.locator('body').evaluate((body) => body.classList.contains('view-mode'));
  if (isViewMode) {
    await page.click('#mode-toggle-btn');
    await page.waitForSelector('body:not(.view-mode)', { timeout: 2000 });
  }
}

async function openTab(page: Page, tab: string) {
  await page.click(`.panel-tab[data-tab='${tab}']`);
  await page.waitForSelector(`.tabbed-panel[data-active-tab='${tab}']`, { timeout: 2000 });
}

async function enableLayoutEditor(page: Page) {
  const toggle = page.locator('#layout-editor-toggle');
  if (!(await toggle.isChecked())) {
    await toggle.check();
  }
  await page.waitForFunction(() => document.body.classList.contains('layout-editor-active'), undefined, {
    timeout: 2000,
  });
}

async function dragWidget(page: Page, selector: string, deltaX: number, deltaY: number) {
  const widget = page.locator(selector);
  await widget.waitFor();
  const box = await widget.boundingBox();
  if (!box) {
    throw new Error(`Could not obtain bounding box for ${selector}`);
  }

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function getWidgetCenter(page: Page, selector: string) {
  const widget = page.locator(selector);
  const box = await widget.boundingBox();
  if (!box) {
    throw new Error(`Missing bounding box for ${selector}`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function captureScene(page: Page, name: string, notes: string) {
  await openTab(page, 'scenes');
  await page.fill('#scene-name', name);
  await page.fill('#scene-description', notes);
  await page.click('#scene-capture-btn');
  await page.waitForSelector(`.scene-card h4:text-is("${name}")`, { timeout: 3000 });
}

async function applySceneByName(page: Page, name: string) {
  await openTab(page, 'scenes');
  const card = page.locator('.scene-card').filter({ has: page.locator('h4', { hasText: name }) });
  await card.first().waitFor({ timeout: 3000 });
  await card.first().locator('.scene-action-btn.scene-apply').click();
  await page.waitForTimeout(800);
}

async function resetLayout(page: Page) {
  await openTab(page, 'layout');
  const resetBtn = page.locator('#layout-reset');
  page.once('dialog', (dialog) => dialog.accept());
  await resetBtn.click();
  await page.waitForTimeout(500);
}

async function runSceneWorkflow() {
  await session.resetContext();
  const page = await session.getPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  const url = pathToFileURL(OURSPACE_HTML).href;
  await navigate(url);
  await page.waitForSelector('#customization-panel', { timeout: 8000 });

  await ensureCustomizeMode(page);
  await openTab(page, 'layout');
  await enableLayoutEditor(page);

  const initialCenter = await getWidgetCenter(page, WIDGET_SELECTOR);
  const initialSecondary = await getWidgetCenter(page, SECONDARY_WIDGET_SELECTOR);
  await dragWidget(page, WIDGET_SELECTOR, 140, 120);
  const sceneACenter = await getWidgetCenter(page, WIDGET_SELECTOR);

  await captureScene(page, 'Automation Scene A', 'Widget dragged down-right');
  await screenshot({ label: 'scene-workflow-a', fullPage: true });

  await resetLayout(page);
  await dragWidget(page, WIDGET_SELECTOR, -110, -90);
  const sceneBCenter = await getWidgetCenter(page, WIDGET_SELECTOR);

  await captureScene(page, 'Automation Scene B', 'Widget pulled upward');
  await screenshot({ label: 'scene-workflow-b', fullPage: true });

  await applySceneByName(page, 'Automation Scene A');
  const appliedCenter = await getWidgetCenter(page, WIDGET_SELECTOR);
  const appliedSecondary = await getWidgetCenter(page, SECONDARY_WIDGET_SELECTOR);
  await screenshot({ label: 'scene-workflow-applied-a', fullPage: true });

  const delta = Math.hypot(appliedCenter.x - sceneACenter.x, appliedCenter.y - sceneACenter.y);
  if (delta > 12) {
    throw new Error(
      `Scene did not restore widget position. Expected ~(${sceneACenter.x.toFixed(
        1,
      )}, ${sceneACenter.y.toFixed(1)}) but got (${appliedCenter.x.toFixed(1)}, ${appliedCenter.y.toFixed(1)})`,
    );
  }

  const secondaryDelta = Math.hypot(appliedSecondary.x - initialSecondary.x, appliedSecondary.y - initialSecondary.y);
  if (secondaryDelta > 12) {
    throw new Error(
      `Unmoved widget shifted unexpectedly. Expected ~(${initialSecondary.x.toFixed(
        1,
      )}, ${initialSecondary.y.toFixed(1)}) but got (${appliedSecondary.x.toFixed(1)}, ${appliedSecondary.y.toFixed(1)})`,
    );
  }

  console.table([
    { label: 'Initial', ...initialCenter },
    { label: 'Scene A', ...sceneACenter },
    { label: 'Scene B', ...sceneBCenter },
    { label: 'Initial Secondary', ...initialSecondary },
    { label: 'Applied A', ...appliedCenter },
    { label: 'Secondary Applied', ...appliedSecondary },
  ]);
}

async function main() {
  try {
    await runSceneWorkflow();
  } catch (error) {
    console.error('[Scene Workflow] Failure:', error);
    process.exitCode = 1;
  } finally {
    await session.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
