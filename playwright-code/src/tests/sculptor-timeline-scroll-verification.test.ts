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

  console.log('🔍 Complete Timeline Scroll Verification\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR4C61EE96C2&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click Reset Order
    await page.click('#sculptor-reset-btn');
    await page.waitForTimeout(1000);

    console.log('✓ Timeline populated with sections');

    // Verify all items are accessible via scrolling
    const scrollTest = await page.evaluate(() => {
      const timeline = document.querySelector('#sculptor-timeline');
      const items = document.querySelectorAll('#sculptor-timeline-content .sculptor-chip');

      if (!timeline || items.length === 0) {
        return { success: false, error: 'Timeline or items not found' };
      }

      const timelineRect = timeline.getBoundingClientRect();
      const results = {
        totalItems: items.length,
        timelineHeight: timeline.clientHeight,
        timelineScrollHeight: timeline.scrollHeight,
        canScroll: timeline.scrollHeight > timeline.clientHeight,
        items: []
      };

      // Test each item by scrolling it into view
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Scroll item into view
        item.scrollIntoView({ block: 'center', behavior: 'auto' });

        const itemRect = item.getBoundingClientRect();
        const isVisible =
          itemRect.top >= timelineRect.top &&
          itemRect.bottom <= timelineRect.bottom;

        results.items.push({
          index: i,
          text: item.textContent.trim(),
          isVisible,
          itemTop: Math.round(itemRect.top),
          itemBottom: Math.round(itemRect.bottom),
          timelineTop: Math.round(timelineRect.top),
          timelineBottom: Math.round(timelineRect.bottom)
        });
      }

      // Count how many items are accessible
      const accessibleCount = results.items.filter(item => item.isVisible).length;

      return {
        ...results,
        accessibleCount,
        allAccessible: accessibleCount === items.length,
        success: true
      };
    });

    console.log('\n📊 Scroll Test Results:');
    console.log(`  Total items: ${scrollTest.totalItems}`);
    console.log(`  Timeline height: ${scrollTest.timelineHeight}px`);
    console.log(`  Timeline scroll height: ${scrollTest.timelineScrollHeight}px`);
    console.log(`  Can scroll: ${scrollTest.canScroll ? '✓' : '✗'}`);
    console.log(`  Accessible items: ${scrollTest.accessibleCount}/${scrollTest.totalItems}`);

    // Show which items are not accessible
    const notAccessible = scrollTest.items.filter(item => !item.isVisible);
    if (notAccessible.length > 0) {
      console.log('\n⚠️  Items NOT accessible when scrolled into view:');
      notAccessible.forEach(item => {
        console.log(`  [${item.index}] ${item.text}`);
        console.log(`      Item: ${item.itemTop} - ${item.itemBottom}`);
        console.log(`      Timeline: ${item.timelineTop} - ${item.timelineBottom}`);
      });
    }

    // Take screenshots at different scroll positions
    await page.evaluate(() => {
      const timeline = document.querySelector('#sculptor-timeline');
      if (timeline) timeline.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'artifacts/sculptor-scroll-top.png', fullPage: false });

    await page.evaluate(() => {
      const timeline = document.querySelector('#sculptor-timeline');
      if (timeline) timeline.scrollTop = timeline.scrollHeight / 2;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'artifacts/sculptor-scroll-middle.png', fullPage: false });

    await page.evaluate(() => {
      const timeline = document.querySelector('#sculptor-timeline');
      if (timeline) timeline.scrollTop = timeline.scrollHeight;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'artifacts/sculptor-scroll-bottom.png', fullPage: false });

    console.log('\n📸 Screenshots saved: top, middle, bottom');

    console.log('\n' + '='.repeat(70));
    if (scrollTest.allAccessible) {
      console.log('✅ SUCCESS - All timeline items are accessible via scrolling!');
    } else {
      console.log(`❌ ISSUE - ${notAccessible.length} items not accessible`);
      console.log('   Timeline may need increased max-height or padding adjustments');
    }
    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
  }
})();
