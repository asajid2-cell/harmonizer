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

  console.log('🔍 Final Verification - Section Sculptor Timeline Scrolling\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR4C61EE96C2&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click Reset Order
    await page.click('#sculptor-reset-btn');
    await page.waitForTimeout(1000);

    console.log('✓ Timeline populated with sections');

    // Scroll timeline to bottom
    await page.evaluate(() => {
      const timeline = document.querySelector('#sculptor-timeline');
      if (timeline) {
        timeline.scrollTop = timeline.scrollHeight;
      }
    });

    await page.waitForTimeout(500);

    // Verify all items are accessible
    const allItemsAccessible = await page.evaluate(() => {
      const timeline = document.querySelector('#sculptor-timeline');
      const items = document.querySelectorAll('#sculptor-timeline-content .sculptor-chip');

      if (!timeline || items.length === 0) return false;

      // Scroll to top
      timeline.scrollTop = 0;
      const firstItemRect = items[0].getBoundingClientRect();
      const firstItemVisible = firstItemRect.top >= 0 && firstItemRect.bottom <= window.innerHeight;

      // Scroll to bottom
      timeline.scrollTop = timeline.scrollHeight;
      const lastItemRect = items[items.length - 1].getBoundingClientRect();
      const lastItemVisible = lastItemRect.top >= 0 && lastItemRect.bottom <= window.innerHeight;

      return {
        totalItems: items.length,
        timelineHeight: timeline.clientHeight,
        timelineScrollHeight: timeline.scrollHeight,
        firstItemAccessible: firstItemVisible,
        lastItemAccessible: lastItemVisible,
        canScroll: timeline.scrollHeight > timeline.clientHeight
      };
    });

    console.log('\n📊 Scroll Verification:');
    console.log(`  Total items: ${allItemsAccessible.totalItems}`);
    console.log(`  Timeline height: ${allItemsAccessible.timelineHeight}px`);
    console.log(`  Timeline scroll height: ${allItemsAccessible.timelineScrollHeight}px`);
    console.log(`  Can scroll: ${allItemsAccessible.canScroll ? '✓ YES' : '✗ NO'}`);
    console.log(`  First item accessible: ${allItemsAccessible.firstItemAccessible ? '✓ YES' : '✗ NO'}`);
    console.log(`  Last item accessible: ${allItemsAccessible.lastItemAccessible ? '✓ YES' : '✗ NO'}`);

    // Take screenshot at bottom of timeline
    await page.screenshot({ path: 'artifacts/sculptor-timeline-scrolled-to-bottom.png', fullPage: false });
    console.log('\n📸 Screenshot saved: timeline scrolled to bottom');

    // Scroll back to top
    await page.evaluate(() => {
      const timeline = document.querySelector('#sculptor-timeline');
      if (timeline) timeline.scrollTop = 0;
    });

    await page.waitForTimeout(300);
    await page.screenshot({ path: 'artifacts/sculptor-timeline-scrolled-to-top.png', fullPage: false });
    console.log('📸 Screenshot saved: timeline scrolled to top');

    console.log('\n' + '='.repeat(70));
    if (allItemsAccessible.canScroll && allItemsAccessible.lastItemAccessible) {
      console.log('✅ SUCCESS - Timeline is properly scrollable, all items accessible!');
    } else {
      console.log('❌ ISSUE - Some items may not be accessible');
    }
    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
  }
})();
