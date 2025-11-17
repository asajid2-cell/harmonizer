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

  console.log('🔍 FINAL SCULPTOR UI VERIFICATION\n');
  console.log('Testing all UI components for overflow issues\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('=' .repeat(60));
    console.log('TEST 1: Section Chips Overflow');
    console.log('='.repeat(60));

    const chipTest = await page.evaluate(() => {
      const palette = document.querySelector('#sculptor-palette');
      const chips = Array.from(document.querySelectorAll('#sculptor-palette .sculptor-section-chip'));
      const viewportWidth = window.innerWidth;

      const overflowingChips = chips.filter(chip => {
        const rect = chip.getBoundingClientRect();
        return rect.right > viewportWidth;
      });

      return {
        totalChips: chips.length,
        overflowingCount: overflowingChips.length,
        paletteWidth: palette?.getBoundingClientRect().width || 0,
        paletteOverflowing: (palette?.getBoundingClientRect().right || 0) > viewportWidth
      };
    });

    console.log('Total chips:', chipTest.totalChips);
    console.log('Palette width:', chipTest.paletteWidth.toFixed(0), 'px');
    console.log('Palette overflowing:', chipTest.paletteOverflowing ? '❌ FAIL' : '✅ PASS');
    console.log('Chips overflowing:', chipTest.overflowingCount > 0 ? `❌ FAIL (${chipTest.overflowingCount})` : '✅ PASS');

    console.log('\n' + '='.repeat(60));
    console.log('TEST 2: Advanced Settings Panel Overflow');
    console.log('='.repeat(60));

    // Open advanced settings
    await page.click('#advanced-toggle');
    await page.waitForTimeout(1000);

    const advancedTest = await page.evaluate(() => {
      const sidebar = document.querySelector('#advanced-sidebar');
      const shell = document.querySelector('#advanced-shell');
      const vizBody = document.querySelector('.viz-body');
      const viewportWidth = window.innerWidth;

      return {
        vizBodyWidth: vizBody?.getBoundingClientRect().width || 0,
        vizBodyRight: vizBody?.getBoundingClientRect().right || 0,
        vizBodyOverflowing: (vizBody?.getBoundingClientRect().right || 0) > viewportWidth,
        sidebarWidth: sidebar?.getBoundingClientRect().width || 0,
        sidebarRight: sidebar?.getBoundingClientRect().right || 0,
        sidebarOverflowing: (sidebar?.getBoundingClientRect().right || 0) > viewportWidth,
        shellWidth: shell?.getBoundingClientRect().width || 0,
        shellRight: shell?.getBoundingClientRect().right || 0,
        shellOverflowing: (shell?.getBoundingClientRect().right || 0) > viewportWidth,
        viewportWidth
      };
    });

    console.log('Viewport:', advancedTest.viewportWidth, 'px');
    console.log('\n.viz-body:');
    console.log('  Width:', advancedTest.vizBodyWidth.toFixed(0), 'px');
    console.log('  Right edge:', advancedTest.vizBodyRight.toFixed(0), 'px');
    console.log('  Overflowing:', advancedTest.vizBodyOverflowing ? '❌ FAIL' : '✅ PASS');

    console.log('\n#advanced-sidebar:');
    console.log('  Width:', advancedTest.sidebarWidth.toFixed(0), 'px');
    console.log('  Right edge:', advancedTest.sidebarRight.toFixed(0), 'px');
    console.log('  Overflowing:', advancedTest.sidebarOverflowing ? '❌ FAIL' : '✅ PASS');

    console.log('\n.advanced-shell:');
    console.log('  Width:', advancedTest.shellWidth.toFixed(0), 'px');
    console.log('  Right edge:', advancedTest.shellRight.toFixed(0), 'px');
    console.log('  Overflowing:', advancedTest.shellOverflowing ? '❌ FAIL' : '✅ PASS');

    console.log('\n' + '='.repeat(60));
    console.log('FINAL RESULTS');
    console.log('='.repeat(60));

    const allPassed = !chipTest.paletteOverflowing &&
                      chipTest.overflowingCount === 0 &&
                      !advancedTest.vizBodyOverflowing &&
                      !advancedTest.sidebarOverflowing &&
                      !advancedTest.shellOverflowing;

    if (allPassed) {
      console.log('✅ ALL TESTS PASSED - No overflow detected!');
    } else {
      console.log('❌ SOME TESTS FAILED - Overflow still present');
    }

    await page.screenshot({ path: 'artifacts/final-sculptor-verification.png', fullPage: true });
    console.log('\n📸 Screenshot saved to artifacts/final-sculptor-verification.png');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
