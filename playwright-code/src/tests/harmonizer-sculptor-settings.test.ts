import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 120 });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForSelector('#sculptor-controls.is-visible');

    await page.click('#advanced-toggle');
    await page.waitForSelector('.advanced-shell');
    await page.evaluate(() => {
      if (typeof (window as any).setAdvancedPanelMode === 'function') {
        (window as any).setAdvancedPanelMode('sculptor');
      }
    });

    await page.click('[data-section-mode="sculptor"] .advanced-collapse-btn');
    await page.evaluate(() => {
      const group = document.querySelector('[data-section-mode="sculptor"] .advanced-group');
      if (group) {
        group.classList.remove('is-collapsed');
      }
    });
    await page.click('#advanced-toggle-sculptorConfig');
    await page.waitForSelector('#advanced-sculptorConfig-durationScale');

    const setRangeValue = async (selector: string, value: string) => {
      await page.evaluate(({ sel, val }) => {
        const slider = document.querySelector(sel) as HTMLInputElement | null;
        if (!slider) return;
        slider.value = val;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }, { sel: selector, val: value });
    };

    await setRangeValue('#advanced-sculptorConfig-durationScale', '0.50');
    await setRangeValue('#advanced-sculptorConfig-minSectionSeconds', '2');
    await setRangeValue('#advanced-sculptorConfig-maxSectionSeconds', '5');
    await page.evaluate(() => {
      (window as any).applySculptorSettings?.({ source: 'test' });
    });

    await page.waitForFunction(() => {
      const driver = (window as any).driver;
      if (!driver || typeof driver.getState !== 'function') return false;
      const state = driver.getState();
      return !!(state && state.sectionData && state.sectionData[0] && state.sectionData[0].duration <= 5.1);
    }, { timeout: 8000 });

    await page.evaluate(() => {
      const driver = (window as any).driver;
      if (!driver) return;
      if (driver.clearQueue) {
        driver.clearQueue();
      }
      driver.addSection(0, 0);
      driver.addSection(1, 1);
    });

    await page.waitForFunction(() => document.querySelectorAll('.sculptor-timeline-chip').length === 2, { timeout: 5000 });

    const queueInfo = await page.$eval('#sculptor-queue-info', el => (el.textContent || '').trim());
    console.log('Advanced queue info:', queueInfo);

    const chipMeta = await page.evaluate(() => (
      Array.from(document.querySelectorAll('.sculptor-timeline-chip .sculptor-chip-meta')).map(node => node.textContent?.trim() || '')
    ));
    console.log('Timeline meta after settings:', chipMeta);

    const settingsSnapshot = await page.evaluate(() => {
      const snapshot = (window as any).getAdvancedSettings('sculptorConfig');
      const state = (window as any).driver?.getState?.();
      return {
        enabled: snapshot?.enabled,
        durationScale: snapshot?.settings?.durationScale,
        maxSectionSeconds: snapshot?.settings?.maxSectionSeconds,
        firstSectionDuration: state?.sectionData?.[0]?.duration
      };
    });
    console.log('Sculptor settings snapshot:', settingsSnapshot);

    const overflowStyle = await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      return shell ? getComputedStyle(shell).overflowY : '';
    });
    console.log('Advanced panel overflow:', overflowStyle);

    await page.screenshot({ path: 'playwright-code/artifacts/sculptor-settings.png', fullPage: true });
  } catch (error) {
    console.error('Sculptor settings test failed:', error);
  } finally {
    await browser.close();
  }
})();

