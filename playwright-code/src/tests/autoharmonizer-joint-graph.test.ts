import { chromium, ConsoleMessage } from 'playwright';

// Uses combined track from existing fixtures
const TRACK_ID = 'TR03F47BFFE7+TRE17840B6AC';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleLog: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    consoleLog.push(text);
    if (text.toLowerCase().includes('error') || text.includes('Autoharmonizer')) {
      console.log('[browser]', text);
    }
  });

  try {
    await page.goto(`http://localhost:4000/harmonizer.html?trid=${encodeURIComponent(TRACK_ID)}&mode=autoharmonizer`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Start playback
    await page.click('#play');

    // Run for ~25 seconds to collect jump log
    await page.waitForTimeout(25000);

    const report = await page.evaluate(() => {
      const win: any = window;
      const log = win.__autohLog || [];
      const jumps = log.filter((e: any) => e.type === 'jump').length;
      const crosses = log.filter((e: any) => e.type === 'cross').length;
      const seq = log.filter((e: any) => e.type === 'sequential').length;
      const sample = log.slice(0, 12);
      return { total: log.length, jumps, crosses, seq, sample };
    });

    console.log('Autoharmonizer jump report:', report);
    if (report.total < 5 || report.crosses < 1) {
      throw new Error(`Insufficient autoharmonizer activity: ${JSON.stringify(report)}`);
    }

    await page.screenshot({
      path: 'playwright-code/artifacts/autoharmonizer-joint-graph.png',
      fullPage: true,
    });
  } catch (err) {
    console.error('[TEST] Autoharmonizer joint-graph test failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
})();
