import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1920,1080']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  console.log('🔍 Debugging RL Button Selection\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR4C61EE96C2&mode=canon');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Find all buttons
    const buttons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.map(b => ({
        text: b.textContent?.trim(),
        id: b.id,
        classes: b.className
      }));
    });

    console.log('All buttons:');
    buttons.forEach((btn, i) => {
      console.log(`  [${i}] Text: "${btn.text}", ID: "${btn.id}", Classes: "${btn.classes}"`);
    });

    // Try to click the RL button
    console.log('\n🤖 Looking for RL button...');
    
    const rlButtonText = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const rlBtn = btns.find(b => b.textContent?.includes('NO RL') || b.textContent?.includes('RL'));
      return rlBtn?.textContent?.trim() || 'NOT FOUND';
    });

    console.log('RL button text:', rlButtonText);

    if (rlButtonText.includes('NO RL')) {
      console.log('\n✅ Clicking to enable RL...');
      await page.click('button:has-text("NO RL")');
      await page.waitForTimeout(1000);

      const afterClick = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const rlBtn = btns.find(b => b.textContent?.includes('MODEL') || b.textContent?.includes('RL'));
        return rlBtn?.textContent?.trim() || 'NOT FOUND';
      });

      console.log('After click:', afterClick);
    }

    await page.screenshot({ path: 'artifacts/rl-button-debug.png', fullPage: true });
    console.log('\n📸 Screenshot saved');

    console.log('\n⏸️  Keeping browser open for 10 seconds...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
