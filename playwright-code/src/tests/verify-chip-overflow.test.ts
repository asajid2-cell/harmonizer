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

  console.log('🔍 Testing individual chip overflow in Sculptor palette\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const chipAnalysis = await page.evaluate(() => {
      const palette = document.querySelector('#sculptor-palette');
      const chips = Array.from(document.querySelectorAll('#sculptor-palette .sculptor-section-chip'));

      const paletteRect = palette?.getBoundingClientRect();
      const paletteRight = paletteRect?.right || 0;
      const viewportWidth = window.innerWidth;

      const chipDetails = chips.map((chip, index) => {
        const chipRect = chip.getBoundingClientRect();
        const label = chip.querySelector('.sculptor-chip-label')?.textContent || '';
        const meta = chip.querySelector('.sculptor-chip-meta')?.textContent || '';
        const chipBody = chip.querySelector('.sculptor-chip-body');
        const chipBodyRect = chipBody?.getBoundingClientRect();

        return {
          index: index + 1,
          label,
          meta,
          width: chipRect.width,
          left: chipRect.left,
          right: chipRect.right,
          bodyWidth: chipBodyRect?.width || 0,
          overflowingPalette: chipRect.right > paletteRight,
          overflowingViewport: chipRect.right > viewportWidth
        };
      });

      return {
        paletteWidth: paletteRect?.width || 0,
        paletteRight,
        viewportWidth,
        chipCount: chips.length,
        chips: chipDetails,
        overflowingChips: chipDetails.filter(c => c.overflowingViewport || c.overflowingPalette)
      };
    });

    console.log('Viewport width:', chipAnalysis.viewportWidth, 'px');
    console.log('Palette width:', chipAnalysis.paletteWidth.toFixed(0), 'px');
    console.log('Palette right edge:', chipAnalysis.paletteRight.toFixed(0), 'px');
    console.log('Total chips:', chipAnalysis.chipCount);
    console.log();

    if (chipAnalysis.overflowingChips.length === 0) {
      console.log('✅ NO CHIPS OVERFLOWING!\n');
    } else {
      console.log('❌ OVERFLOWING CHIPS DETECTED:\n');
      chipAnalysis.overflowingChips.forEach(chip => {
        console.log(`  Chip #${chip.index}: ${chip.label}`);
        console.log(`    Meta: ${chip.meta}`);
        console.log(`    Width: ${chip.width.toFixed(0)}px`);
        console.log(`    Right edge: ${chip.right.toFixed(0)}px`);
        console.log(`    Overflow amount: ${(chip.right - chipAnalysis.viewportWidth).toFixed(0)}px beyond viewport`);
        console.log();
      });
    }

    console.log('Individual chip details:');
    chipAnalysis.chips.forEach(chip => {
      const status = chip.overflowingViewport || chip.overflowingPalette ? '❌' : '✅';
      console.log(`  ${status} #${chip.index}: ${chip.label} | ${chip.meta}`);
      console.log(`      Width: ${chip.width.toFixed(0)}px, Right: ${chip.right.toFixed(0)}px`);
    });

    await page.screenshot({ path: 'artifacts/chip-overflow-check.png', fullPage: true });
    console.log('\n📸 Screenshot saved to artifacts/chip-overflow-check.png');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
