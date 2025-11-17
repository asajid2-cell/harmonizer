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

  console.log('🔍 Testing Advanced Settings Panel Scrollability\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Open advanced settings
    console.log('Opening Advanced Settings...\n');
    await page.click('#advanced-toggle');
    await page.waitForTimeout(1000);

    const initialState = await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      const sections = document.querySelector('.advanced-sections');

      return {
        shell: {
          scrollHeight: shell?.scrollHeight || 0,
          clientHeight: shell?.clientHeight || 0,
          scrollTop: shell?.scrollTop || 0,
          computedHeight: shell ? window.getComputedStyle(shell).height : null,
          computedMaxHeight: shell ? window.getComputedStyle(shell).maxHeight : null,
          computedOverflowY: shell ? window.getComputedStyle(shell).overflowY : null,
          isScrollable: (shell?.scrollHeight || 0) > (shell?.clientHeight || 0)
        },
        sections: {
          scrollHeight: sections?.scrollHeight || 0,
          clientHeight: sections?.clientHeight || 0
        }
      };
    });

    console.log('.advanced-shell:');
    console.log('  Client height (visible):', initialState.shell.clientHeight, 'px');
    console.log('  Scroll height (total):', initialState.shell.scrollHeight, 'px');
    console.log('  Computed height:', initialState.shell.computedHeight);
    console.log('  Computed max-height:', initialState.shell.computedMaxHeight);
    console.log('  Overflow-y:', initialState.shell.computedOverflowY);
    console.log('  Is scrollable:', initialState.shell.isScrollable ? '✅ YES' : '❌ NO');

    if (initialState.shell.isScrollable) {
      const hiddenContent = initialState.shell.scrollHeight - initialState.shell.clientHeight;
      console.log('  Hidden content:', hiddenContent, 'px');
    }

    console.log('\n.advanced-sections:');
    console.log('  Client height:', initialState.sections.clientHeight, 'px');
    console.log('  Scroll height:', initialState.sections.scrollHeight, 'px');

    // Try to scroll to bottom
    console.log('\n📜 Attempting to scroll to bottom...\n');

    await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      if (shell) {
        shell.scrollTop = shell.scrollHeight;
      }
    });

    await page.waitForTimeout(500);

    const afterScroll = await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      return {
        scrollTop: shell?.scrollTop || 0,
        maxScrollTop: (shell?.scrollHeight || 0) - (shell?.clientHeight || 0)
      };
    });

    console.log('After scroll attempt:');
    console.log('  Current scrollTop:', afterScroll.scrollTop, 'px');
    console.log('  Max possible scrollTop:', afterScroll.maxScrollTop, 'px');
    console.log('  Reached bottom:', Math.abs(afterScroll.scrollTop - afterScroll.maxScrollTop) < 5 ? '✅ YES' : '❌ NO');

    // Get all sections and check visibility
    const sectionVisibility = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('.advanced-section'));
      const shell = document.querySelector('.advanced-shell');
      const shellRect = shell?.getBoundingClientRect();

      return sections.map((section, index) => {
        const rect = section.getBoundingClientRect();
        const header = section.querySelector('.advanced-section-header');
        const title = header?.querySelector('h4')?.textContent || `Section ${index + 1}`;

        const fullyVisible = shellRect &&
          rect.top >= shellRect.top &&
          rect.bottom <= shellRect.bottom;

        const partiallyVisible = shellRect &&
          rect.bottom > shellRect.top &&
          rect.top < shellRect.bottom;

        return {
          title,
          top: rect.top,
          bottom: rect.bottom,
          fullyVisible,
          partiallyVisible
        };
      });
    });

    console.log('\n📋 Section Visibility (after scroll to bottom):');
    sectionVisibility.forEach((section, i) => {
      const status = section.fullyVisible ? '✅ Fully visible' :
                     section.partiallyVisible ? '⚠️  Partially visible' :
                     '❌ Not visible';
      console.log(`  [${i + 1}] ${section.title}: ${status}`);
    });

    await page.screenshot({ path: 'artifacts/advanced-scroll-test.png', fullPage: true });
    console.log('\n📸 Screenshot saved to artifacts/advanced-scroll-test.png');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
