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

  const trackIds = [
    'TR03F47BFFE7',
    'TRAA3EC7089D',
    'TR7067473OFA'
  ];

  console.log('🔍 Testing Sculptor overflow across multiple tracks\n');

  for (const trid of trackIds) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing Track: ${trid}`);
    console.log('='.repeat(60));

    try {
      await page.goto(`http://localhost:4000/harmonizer.html?trid=${trid}&mode=sculptor`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      const overflow = await page.evaluate(() => {
        const palette = document.querySelector('#sculptor-palette');
        const chips = Array.from(document.querySelectorAll('#sculptor-palette .sculptor-section-chip'));
        const chipData = chips.map(chip => {
          const rect = chip.getBoundingClientRect();
          const label = (chip.querySelector('.sculptor-chip-label'))?.textContent || '';
          return {
            label,
            right: rect.right,
            overflowing: rect.right > window.innerWidth
          };
        });

        return {
          viewport: { w: window.innerWidth, h: window.innerHeight },
          palette: {
            width: palette?.getBoundingClientRect().width,
            right: palette?.getBoundingClientRect().right,
            overflowing: (palette?.getBoundingClientRect().right || 0) > window.innerWidth
          },
          chips: {
            count: chips.length,
            anyOverflowing: chipData.some(c => c.overflowing),
            overflowingChips: chipData.filter(c => c.overflowing)
          }
        };
      });

      console.log('\nViewport:', `${overflow.viewport.w}x${overflow.viewport.h}`);
      console.log('Palette width:', overflow.palette.width?.toFixed(0), 'px');
      console.log('Palette right edge:', overflow.palette.right?.toFixed(0), 'px');
      console.log('Palette overflowing:', overflow.palette.overflowing ? '❌ YES' : '✅ NO');
      console.log('Chips:', overflow.chips.count);
      console.log('Chips overflowing:', overflow.chips.anyOverflowing ? '❌ YES' : '✅ NO');

      if (overflow.chips.anyOverflowing) {
        console.log('\n⚠️  OVERFLOWING CHIPS:');
        overflow.chips.overflowingChips.forEach(chip => {
          console.log(`    ${chip.label}: right @ ${chip.right.toFixed(0)}px`);
        });
      }

      await page.screenshot({
        path: `artifacts/sculptor-verify-${trid}.png`,
        fullPage: true
      });
      console.log(`\n📸 Screenshot saved: sculptor-verify-${trid}.png`);

    } catch (error) {
      console.error('❌ Error testing track:', error.message);
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('✅ Testing complete');
  console.log('='.repeat(60));

  await browser.close();
})();
