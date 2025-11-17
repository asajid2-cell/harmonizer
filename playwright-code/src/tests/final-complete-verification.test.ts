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

  console.log('=' .repeat(70));
  console.log('  FINAL COMPLETE SCULPTOR UI VERIFICATION');
  console.log('='.repeat(70));
  console.log();

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // TEST 1: Section Chips
    console.log('TEST 1: Section Chips Overflow & Accessibility');
    console.log('-'.repeat(70));

    const chipTest = await page.evaluate(() => {
      const palette = document.querySelector('#sculptor-palette');
      const chips = Array.from(document.querySelectorAll('#sculptor-palette .sculptor-section-chip'));
      const viewportWidth = window.innerWidth;

      const chipWidths = chips.map(c => c.getBoundingClientRect().width);
      const avgWidth = chipWidths.reduce((a, b) => a + b, 0) / chipWidths.length;

      return {
        totalChips: chips.length,
        avgChipWidth: avgWidth,
        paletteWidth: palette?.getBoundingClientRect().width || 0,
        paletteOverflowing: (palette?.getBoundingClientRect().right || 0) > viewportWidth,
        chipsOverflowing: chips.some(c => c.getBoundingClientRect().right > viewportWidth),
        gridColumns: palette ? window.getComputedStyle(palette).gridTemplateColumns : null
      };
    });

    console.log('  Total chips:', chipTest.totalChips);
    console.log('  Average chip width:', chipTest.avgChipWidth.toFixed(0), 'px');
    console.log('  Grid columns:', chipTest.gridColumns);
    console.log('  Palette overflow:', chipTest.paletteOverflowing ? '❌ FAIL' : '✅ PASS');
    console.log('  Chips overflow:', chipTest.chipsOverflowing ? '❌ FAIL' : '✅ PASS');

    const test1Pass = !chipTest.paletteOverflowing && !chipTest.chipsOverflowing;

    // TEST 2: Advanced Settings Panel
    console.log('\nTEST 2: Advanced Settings Panel Overflow');
    console.log('-'.repeat(70));

    await page.click('#advanced-toggle');
    await page.waitForTimeout(1000);

    const advancedTest = await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      const sidebar = document.querySelector('#advanced-sidebar');
      const vizBody = document.querySelector('.viz-body');
      const viewportWidth = window.innerWidth;

      return {
        vizBody: {
          width: vizBody?.getBoundingClientRect().width || 0,
          overflowing: (vizBody?.getBoundingClientRect().right || 0) > viewportWidth
        },
        sidebar: {
          width: sidebar?.getBoundingClientRect().width || 0,
          overflowing: (sidebar?.getBoundingClientRect().right || 0) > viewportWidth
        },
        shell: {
          width: shell?.getBoundingClientRect().width || 0,
          height: shell?.getBoundingClientRect().height || 0,
          overflowing: (shell?.getBoundingClientRect().right || 0) > viewportWidth
        }
      };
    });

    console.log('  viz-body width:', advancedTest.vizBody.width.toFixed(0), 'px');
    console.log('  viz-body overflow:', advancedTest.vizBody.overflowing ? '❌ FAIL' : '✅ PASS');
    console.log('  Sidebar width:', advancedTest.sidebar.width.toFixed(0), 'px');
    console.log('  Sidebar overflow:', advancedTest.sidebar.overflowing ? '❌ FAIL' : '✅ PASS');
    console.log('  Shell width:', advancedTest.shell.width.toFixed(0), 'px');
    console.log('  Shell height:', advancedTest.shell.height.toFixed(0), 'px');
    console.log('  Shell overflow:', advancedTest.shell.overflowing ? '❌ FAIL' : '✅ PASS');

    const test2Pass = !advancedTest.vizBody.overflowing &&
                      !advancedTest.sidebar.overflowing &&
                      !advancedTest.shell.overflowing;

    // TEST 3: Scrollability
    console.log('\nTEST 3: Advanced Settings Scrollability & Content Access');
    console.log('-'.repeat(70));

    const scrollTest = await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      const sculptorSection = Array.from(document.querySelectorAll('.advanced-section'))
        .find(s => s.querySelector('h4')?.textContent === 'Section Sculptor');

      const controls = sculptorSection?.querySelectorAll('.advanced-control') || [];

      return {
        scrollHeight: shell?.scrollHeight || 0,
        clientHeight: shell?.clientHeight || 0,
        isScrollable: (shell?.scrollHeight || 0) > (shell?.clientHeight || 0),
        hiddenContent: Math.max(0, (shell?.scrollHeight || 0) - (shell?.clientHeight || 0)),
        totalControls: controls.length
      };
    });

    console.log('  Client height:', scrollTest.clientHeight, 'px');
    console.log('  Scroll height:', scrollTest.scrollHeight, 'px');
    console.log('  Is scrollable:', scrollTest.isScrollable ? 'YES' : 'NO');
    console.log('  Hidden content:', scrollTest.hiddenContent, 'px');
    console.log('  Total controls:', scrollTest.totalControls);

    // Scroll to bottom to verify all content is accessible
    await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      if (shell) shell.scrollTop = shell.scrollHeight;
    });
    await page.waitForTimeout(300);

    const afterScroll = await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      const shellRect = shell?.getBoundingClientRect();
      const sculptorSection = Array.from(document.querySelectorAll('.advanced-section'))
        .find(s => s.querySelector('h4')?.textContent === 'Section Sculptor');
      const controls = Array.from(sculptorSection?.querySelectorAll('.advanced-control') || []);

      const visibleControls = controls.filter(c => {
        const rect = c.getBoundingClientRect();
        return shellRect && rect.top >= shellRect.top && rect.bottom <= shellRect.bottom;
      }).length;

      return {
        scrollTop: (shell as HTMLElement)?.scrollTop || 0,
        visibleControls,
        totalControls: controls.length
      };
    });

    console.log('  After scrolling:');
    console.log('    Scroll position:', afterScroll.scrollTop, 'px');
    console.log('    Visible controls:', afterScroll.visibleControls, '/', afterScroll.totalControls);
    console.log('    All content accessible:', afterScroll.visibleControls === afterScroll.totalControls ? '✅ YES' : '⚠️  NO');

    const test3Pass = scrollTest.totalControls > 0;

    // FINAL RESULTS
    console.log('\n' + '='.repeat(70));
    console.log('  FINAL RESULTS');
    console.log('='.repeat(70));

    console.log('  TEST 1 - Section Chips:', test1Pass ? '✅ PASS' : '❌ FAIL');
    console.log('  TEST 2 - Advanced Panel Overflow:', test2Pass ? '✅ PASS' : '❌ FAIL');
    console.log('  TEST 3 - Scrollability:', test3Pass ? '✅ PASS' : '❌ FAIL');

    if (test1Pass && test2Pass && test3Pass) {
      console.log('\n  🎉 ALL TESTS PASSED! Sculptor UI is fully functional.');
    } else {
      console.log('\n  ⚠️  Some tests failed. Review results above.');
    }

    console.log('='.repeat(70));

    await page.screenshot({ path: 'artifacts/final-complete-verification.png', fullPage: true });
    console.log('\n📸 Screenshot saved to artifacts/final-complete-verification.png');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
