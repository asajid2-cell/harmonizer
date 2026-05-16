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

  console.log('🔍 Testing Sculptor Timeline Overflow\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Get the ACTUAL overflow measurements
    const overflow = await page.evaluate(() => {
      const palette = document.querySelector('#sculptor-palette');
      const paletteParent = palette?.parentElement;

      // Measure each section chip in palette
      const chips = Array.from(document.querySelectorAll('#sculptor-palette .sculptor-section-chip'));
      const chipWidths = chips.map(chip => {
        const rect = chip.getBoundingClientRect();
        return {
          width: rect.width,
          right: rect.right,
          label: (chip.querySelector('.sculptor-chip-label') as HTMLElement)?.textContent || 'Unknown'
        };
      });

      // Measure palette container
      const paletteRect = palette?.getBoundingClientRect();
      const parentRect = paletteParent?.getBoundingClientRect();

      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        palette: {
          width: paletteRect?.width,
          scrollWidth: (palette as HTMLElement)?.scrollWidth,
          computedWidth: palette ? window.getComputedStyle(palette).width : null,
          parentWidth: parentRect?.width,
          overflow: (palette as HTMLElement)?.scrollWidth > (paletteRect?.width || 0)
        },
        chips: {
          count: chips.length,
          widths: chipWidths,
          maxRight: Math.max(...chipWidths.map(c => c.right)),
          totalWidth: chipWidths.reduce((sum, c) => sum + c.width, 0)
        }
      };
    });

    console.log('Viewport:', `${overflow.viewport.w}x${overflow.viewport.h}`);
    console.log('\nPalette Container:');
    console.log('  Width:', overflow.palette.width?.toFixed(0), 'px');
    console.log('  Scroll Width:', overflow.palette.scrollWidth, 'px');
    console.log('  Parent Width:', overflow.palette.parentWidth?.toFixed(0), 'px');
    console.log('  Computed Width:', overflow.palette.computedWidth);

    if (overflow.palette.overflow) {
      const diff = overflow.palette.scrollWidth - (overflow.palette.width || 0);
      console.log('  ❌ OVERFLOW:', diff.toFixed(0), 'px HIDDEN');
    } else {
      console.log('  ✅ No overflow');
    }

    console.log('\nChips:');
    console.log('  Count:', overflow.chips.count);
    console.log('  Total Width:', overflow.chips.totalWidth.toFixed(0), 'px');
    console.log('  Max Right Position:', overflow.chips.maxRight.toFixed(0), 'px');
    console.log('  Viewport Right Edge:', overflow.viewport.w, 'px');

    if (overflow.chips.maxRight > overflow.viewport.w) {
      console.log('  ❌ CHIPS EXTEND BEYOND VIEWPORT by', (overflow.chips.maxRight - overflow.viewport.w).toFixed(0), 'px');
    }

    console.log('\nChip Details:');
    overflow.chips.widths.forEach((chip, i) => {
      const overflowing = chip.right > overflow.viewport.w;
      console.log(`  [${i + 1}] ${chip.label}: ${chip.width.toFixed(0)}px wide, right: ${chip.right.toFixed(0)}px ${overflowing ? '❌ OVERFLOW' : ''}`);
    });

    await page.screenshot({ path: 'artifacts/sculptor-overflow-analysis.png', fullPage: true });
    console.log('\n📸 Screenshot saved to artifacts/sculptor-overflow-analysis.png');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
