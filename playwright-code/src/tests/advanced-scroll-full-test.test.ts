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

  console.log('🔍 Testing Advanced Settings Full Scroll Range\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.click('#advanced-toggle');
    await page.waitForTimeout(1000);

    // Scroll to top first
    console.log('📜 Scrolling to TOP...\n');
    await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      if (shell) {
        shell.scrollTop = 0;
      }
    });
    await page.waitForTimeout(300);

    const atTop = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('.advanced-section'));
      const shell = document.querySelector('.advanced-shell');
      const shellRect = shell?.getBoundingClientRect();

      return sections.map((section) => {
        const rect = section.getBoundingClientRect();
        const header = section.querySelector('.advanced-section-header');
        const title = header?.querySelector('h4')?.textContent || 'Unknown';

        const fullyVisible = shellRect &&
          rect.top >= shellRect.top &&
          rect.bottom <= shellRect.bottom;

        return {
          title,
          fullyVisible
        };
      });
    });

    console.log('At TOP - Section Visibility:');
    atTop.forEach((section, i) => {
      const status = section.fullyVisible ? '✅ Fully visible' : '❌ Not fully visible';
      console.log(`  [${i + 1}] ${section.title}: ${status}`);
    });

    // Scroll to bottom
    console.log('\n📜 Scrolling to BOTTOM...\n');
    await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      if (shell) {
        shell.scrollTop = shell.scrollHeight;
      }
    });
    await page.waitForTimeout(300);

    const atBottom = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('.advanced-section'));
      const shell = document.querySelector('.advanced-shell');
      const shellRect = shell?.getBoundingClientRect();

      return {
        sections: sections.map((section) => {
          const rect = section.getBoundingClientRect();
          const header = section.querySelector('.advanced-section-header');
          const title = header?.querySelector('h4')?.textContent || 'Unknown';

          const fullyVisible = shellRect &&
            rect.top >= shellRect.top &&
            rect.bottom <= shellRect.bottom;

          return {
            title,
            fullyVisible
          };
        }),
        shell: {
          scrollTop: shell?.scrollTop || 0,
          scrollHeight: shell?.scrollHeight || 0,
          clientHeight: shell?.clientHeight || 0
        }
      };
    });

    console.log('At BOTTOM - Section Visibility:');
    atBottom.sections.forEach((section, i) => {
      const status = section.fullyVisible ? '✅ Fully visible' : '❌ Not fully visible';
      console.log(`  [${i + 1}] ${section.title}: ${status}`);
    });

    console.log('\n📊 Scroll Stats:');
    console.log('  Client height:', atBottom.shell.clientHeight, 'px');
    console.log('  Scroll height:', atBottom.shell.scrollHeight, 'px');
    console.log('  Current scroll:', atBottom.shell.scrollTop, 'px');
    console.log('  Max scroll:', atBottom.shell.scrollHeight - atBottom.shell.clientHeight, 'px');

    const fullyVisibleAtTop = atTop.filter(s => s.fullyVisible).length;
    const fullyVisibleAtBottom = atBottom.sections.filter(s => s.fullyVisible).length;
    const totalSections = atTop.length;

    console.log('\n📋 Summary:');
    console.log('  Total sections:', totalSections);
    console.log('  Fully visible at top:', fullyVisibleAtTop);
    console.log('  Fully visible at bottom:', fullyVisibleAtBottom);

    if (fullyVisibleAtTop >= 3 && fullyVisibleAtBottom >= 1) {
      console.log('\n✅ PASS: Can scroll to see all content');
    } else {
      console.log('\n❌ FAIL: Some content may be inaccessible');
    }

    await page.screenshot({ path: 'artifacts/advanced-scroll-full-test.png', fullPage: true });
    console.log('\n📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
