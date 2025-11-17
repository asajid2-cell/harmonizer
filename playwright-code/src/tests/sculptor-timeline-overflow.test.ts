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

  console.log('🔍 Testing Section Sculptor Timeline Overflow\n');

  try {
    // Load Man Of The Year in Sculptor mode
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR4C61EE96C2&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('✓ Page loaded');

    // Take initial screenshot
    await page.screenshot({ path: 'artifacts/sculptor-timeline-before.png', fullPage: true });
    console.log('✓ Initial screenshot saved');

    // Click Reset Order button to populate timeline
    const resetButton = await page.locator('#sculptor-reset-btn');
    if (await resetButton.isVisible()) {
      console.log('\n📋 Clicking Reset Order...');
      await resetButton.click();
      await page.waitForTimeout(1000);
      console.log('✓ Reset Order clicked');
    }

    // Get timeline and container measurements
    const measurements = await page.evaluate(() => {
      const timeline = document.querySelector('#sculptor-timeline');
      const timelineContent = document.querySelector('#sculptor-timeline-content');
      const sculptorControls = document.querySelector('.sculptor-controls');
      const vizPanel = document.querySelector('.viz-panel');

      if (!timeline || !timelineContent || !sculptorControls || !vizPanel) {
        return null;
      }

      const timelineRect = timeline.getBoundingClientRect();
      const contentRect = timelineContent.getBoundingClientRect();
      const controlsRect = sculptorControls.getBoundingClientRect();
      const panelRect = vizPanel.getBoundingClientRect();

      const items = timelineContent.querySelectorAll('.sculptor-chip');

      return {
        timeline: {
          top: timelineRect.top,
          bottom: timelineRect.bottom,
          height: timelineRect.height,
          scrollHeight: (timeline as HTMLElement).scrollHeight
        },
        content: {
          top: contentRect.top,
          bottom: contentRect.bottom,
          height: contentRect.height,
          itemCount: items.length
        },
        controls: {
          top: controlsRect.top,
          bottom: controlsRect.bottom,
          height: controlsRect.height
        },
        panel: {
          top: panelRect.top,
          bottom: panelRect.bottom,
          height: panelRect.height,
          scrollHeight: (vizPanel as HTMLElement).scrollHeight
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      };
    });

    if (measurements) {
      console.log('\n📊 Measurements:');
      console.log(`Viewport: ${measurements.viewport.width}x${measurements.viewport.height}`);
      console.log(`\nTimeline:`);
      console.log(`  Position: ${measurements.timeline.top}px - ${measurements.timeline.bottom}px`);
      console.log(`  Height: ${measurements.timeline.height}px`);
      console.log(`  Scroll Height: ${measurements.timeline.scrollHeight}px`);
      console.log(`\nTimeline Content:`);
      console.log(`  Items: ${measurements.content.itemCount}`);
      console.log(`  Height: ${measurements.content.height}px`);
      console.log(`\nViz Panel:`);
      console.log(`  Position: ${measurements.panel.top}px - ${measurements.panel.bottom}px`);
      console.log(`  Height: ${measurements.panel.height}px`);
      console.log(`  Scroll Height: ${measurements.panel.scrollHeight}px`);

      // Check for overflow
      const isOverflowing = measurements.panel.bottom > measurements.viewport.height;
      const needsScroll = measurements.panel.scrollHeight > measurements.panel.height;

      console.log('\n🔍 Overflow Detection:');
      console.log(`  Panel extends beyond viewport: ${isOverflowing ? '❌ YES' : '✓ NO'}`);
      console.log(`  Panel needs scrolling: ${needsScroll ? '✓ YES' : '❌ NO'}`);

      if (isOverflowing) {
        console.log(`\n⚠️  OVERFLOW DETECTED!`);
        console.log(`  Panel bottom: ${measurements.panel.bottom}px`);
        console.log(`  Viewport height: ${measurements.viewport.height}px`);
        console.log(`  Overflow: ${measurements.panel.bottom - measurements.viewport.height}px`);
      }
    }

    // Scroll down to see if content is cut off
    console.log('\n⬇️  Scrolling down...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(500);

    // Take screenshot after scroll
    await page.screenshot({ path: 'artifacts/sculptor-timeline-after-scroll.png', fullPage: true });
    console.log('✓ After-scroll screenshot saved');

    // Check visibility of items
    const visibility = await page.evaluate(() => {
      const timeline = document.querySelector('#sculptor-timeline');
      const items = document.querySelectorAll('#sculptor-timeline-content .sculptor-chip');

      if (!timeline || items.length === 0) {
        return null;
      }

      const viewportHeight = window.innerHeight;
      const results = [];

      items.forEach((item, index) => {
        const rect = item.getBoundingClientRect();
        const isVisible = rect.top >= 0 && rect.bottom <= viewportHeight;
        const isPartiallyVisible = rect.bottom > 0 && rect.top < viewportHeight;
        const isCutOff = rect.bottom > viewportHeight;

        results.push({
          index,
          label: item.querySelector('.sculptor-chip-label')?.textContent?.trim() || '',
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          visible: isVisible,
          partiallyVisible: isPartiallyVisible,
          cutOff: isCutOff
        });
      });

      return results;
    });

    if (visibility) {
      console.log('\n👁️  Item Visibility:');
      const cutOffItems = visibility.filter(v => v.cutOff);
      const fullyVisible = visibility.filter(v => v.visible);

      console.log(`  Total items: ${visibility.length}`);
      console.log(`  Fully visible: ${fullyVisible.length}`);
      console.log(`  Cut off: ${cutOffItems.length}`);

      if (cutOffItems.length > 0) {
        console.log('\n  ❌ Cut off items:');
        cutOffItems.slice(0, 5).forEach(item => {
          console.log(`    [${item.index}] ${item.label} - bottom at ${item.bottom}px`);
        });
      }
    }

    console.log('\n' + '='.repeat(70));

    if (measurements && measurements.panel.bottom > measurements.viewport.height) {
      console.log('❌ OVERFLOW CONFIRMED - Timeline extends beyond viewport');
    } else {
      console.log('✓ No overflow detected');
    }

    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
})();
