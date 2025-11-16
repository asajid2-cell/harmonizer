import { chromium } from 'playwright';
const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4175', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  const html = await page.content();
  console.log(html);
  await browser.close();
};
run().catch(err => { console.error(err); process.exit(1); });
