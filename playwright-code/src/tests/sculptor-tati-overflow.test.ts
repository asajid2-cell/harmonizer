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

  console.log('🔍 Testing Sculptor with TATI song\n');

  try {
    // Navigate directly to TATI in sculptor mode
    console.log('📂 Loading TATI track...');
    await page.goto('http://localhost:4000/harmonizer.html?trid=TRAA3EC7089D&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('✅ Track loaded, checking overflow...\n');

    const overflow = await page.evaluate(() => {
      const palette = document.querySelector('#sculptor-palette');
      const paletteWrapper = document.querySelector('.sculptor-palette-wrapper');
      const controls = document.querySelector('#sculptor-controls');

      const chips = Array.from(document.querySelectorAll('#sculptor-palette .sculptor-section-chip'));
      const chipData = chips.map(chip => {
        const rect = chip.getBoundingClientRect();
        const label = (chip.querySelector('.sculptor-chip-label') as HTMLElement)?.textContent || '';
        return {
          label,
          width: rect.width,
          left: rect.left,
          right: rect.right,
          overflowing: rect.right > window.innerWidth
        };
      });

      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        palette: {
          exists: !!palette,
          width: palette?.getBoundingClientRect().width,
          scrollWidth: (palette as HTMLElement)?.scrollWidth,
          right: palette?.getBoundingClientRect().right
        },
        paletteWrapper: {
          exists: !!paletteWrapper,
          width: paletteWrapper?.getBoundingClientRect().width,
          right: paletteWrapper?.getBoundingClientRect().right
        },
        controls: {
          width: controls?.getBoundingClientRect().width,
          scrollWidth: (controls as HTMLElement)?.scrollWidth,
          right: controls?.getBoundingClientRect().right
        },
        chips: {
          count: chips.length,
          data: chipData,
          anyOverflowing: chipData.some(c => c.overflowing),
          maxRight: Math.max(...chipData.map(c => c.right), 0)
        }
      };
    });

    console.log('Viewport:', `${overflow.viewport.w}x${overflow.viewport.h}`);
    console.log('\nPalette:');
    console.log('  Width:', overflow.palette.width?.toFixed(0), 'px');
    console.log('  Scroll Width:', overflow.palette.scrollWidth, 'px');
    console.log('  Right edge:', overflow.palette.right?.toFixed(0), 'px');

    console.log('\nPalette Wrapper:');
    console.log('  Exists:', overflow.paletteWrapper.exists);
    console.log('  Width:', overflow.paletteWrapper.width?.toFixed(0), 'px');
    console.log('  Right edge:', overflow.paletteWrapper.right?.toFixed(0), 'px');

    console.log('\nControls Container:');
    console.log('  Width:', overflow.controls.width?.toFixed(0), 'px');
    console.log('  Scroll Width:', overflow.controls.scrollWidth, 'px');
    console.log('  Right edge:', overflow.controls.right?.toFixed(0), 'px');

    console.log('\nChips:', overflow.chips.count, 'total');
    console.log('  Max right position:', overflow.chips.maxRight.toFixed(0), 'px');
    console.log('  Any overflowing viewport:', overflow.chips.anyOverflowing ? '❌ YES' : '✅ NO');

    if (overflow.chips.anyOverflowing) {
      console.log('\n⚠️  OVERFLOWING CHIPS:');
      overflow.chips.data.filter(c => c.overflowing).forEach(chip => {
        console.log(`    ${chip.label}: right @ ${chip.right.toFixed(0)}px (viewport: ${overflow.viewport.w}px)`);
      });
    }

    await page.screenshot({ path: 'artifacts/sculptor-tati-overflow.png', fullPage: true });
    console.log('\n📸 Screenshot saved to artifacts/sculptor-tati-overflow.png');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
