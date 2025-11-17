import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForSelector('#sculptor-controls', { state: 'visible' });

    await page.waitForFunction(() => {
      const win = window as any;
      return win.driver && typeof win.driver.addSection === 'function';
    });

    await page.waitForFunction(() => document.querySelectorAll('.sculptor-section-chip').length >= 3, { timeout: 8000 });

    await page.evaluate(() => {
      const driver = (window as any).driver;
      driver.addSection(0, 0);
      driver.addSection(1, 1);
      driver.addSection(2, 2);
    });

    await page.waitForFunction(() => document.querySelectorAll('.sculptor-timeline-chip').length === 3, { timeout: 5000 });

    await page.click('#play');
    await page.waitForSelector('.sculptor-timeline-chip.playing', { timeout: 15000 });

    const chipStates = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.sculptor-timeline-chip')).map(chip => ({
        queuePos: chip.getAttribute('data-queue-pos'),
        section: chip.querySelector('.sculptor-chip-label')?.textContent?.trim() || '',
        meta: chip.querySelector('.sculptor-chip-meta')?.textContent?.trim() || '',
        playing: chip.classList.contains('playing'),
        upNext: chip.classList.contains('up-next')
      }));
    });
    console.log('Timeline chips:', chipStates);

    await page.click('.sculptor-timeline-chip:nth-child(2) .sculptor-chip-remove');
    await page.waitForFunction(() => document.querySelectorAll('.sculptor-timeline-chip').length === 2, { timeout: 5000 });

    const queueInfo = await page.$eval('#sculptor-queue-info', el => (el.textContent || '').trim());
    console.log('Queue info:', queueInfo);

    await page.screenshot({ path: 'playwright-code/artifacts/sculptor-ui.png', fullPage: true });
  } catch (error) {
    console.error('Sculptor UI test failed:', error);
  } finally {
    await browser.close();
  }
})();
