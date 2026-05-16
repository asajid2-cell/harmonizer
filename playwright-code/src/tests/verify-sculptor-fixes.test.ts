import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage();

  console.log('🔍 Verifying Sculptor CSS fixes are applied...\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const cssCheck = await page.evaluate(() => {
      const controls = document.querySelector('#sculptor-controls');
      const palette = document.querySelector('#sculptor-palette');
      const paletteWrapper = document.querySelector('.sculptor-palette-wrapper');
      const vizStage = document.querySelector('.viz-stage');

      return {
        controls: {
          exists: !!controls,
          width: controls ? window.getComputedStyle(controls).width : null,
          maxWidth: controls ? window.getComputedStyle(controls).maxWidth : null,
          boxSizing: controls ? window.getComputedStyle(controls).boxSizing : null,
          overflow: controls ? window.getComputedStyle(controls).overflow : null
        },
        palette: {
          exists: !!palette,
          display: palette ? window.getComputedStyle(palette).display : null,
          gridTemplateColumns: palette ? window.getComputedStyle(palette).gridTemplateColumns : null,
          maxHeight: palette ? window.getComputedStyle(palette).maxHeight : null,
          overflowY: palette ? window.getComputedStyle(palette).overflowY : null,
          overflowX: palette ? window.getComputedStyle(palette).overflowX : null,
          boxSizing: palette ? window.getComputedStyle(palette).boxSizing : null
        },
        paletteWrapper: {
          exists: !!paletteWrapper,
          width: paletteWrapper ? window.getComputedStyle(paletteWrapper).width : null,
          maxWidth: paletteWrapper ? window.getComputedStyle(paletteWrapper).maxWidth : null,
          overflow: paletteWrapper ? window.getComputedStyle(paletteWrapper).overflow : null,
          boxSizing: paletteWrapper ? window.getComputedStyle(paletteWrapper).boxSizing : null
        },
        vizStage: {
          exists: !!vizStage,
          minHeight: vizStage ? window.getComputedStyle(vizStage).minHeight : null,
          width: vizStage ? window.getComputedStyle(vizStage).width : null
        }
      };
    });

    console.log('📊 CSS Check Results:\n');

    console.log('#sculptor-controls:');
    console.log('  Exists:', cssCheck.controls.exists);
    console.log('  Width:', cssCheck.controls.width);
    console.log('  Max-width:', cssCheck.controls.maxWidth);
    console.log('  Box-sizing:', cssCheck.controls.boxSizing);
    console.log('  Overflow:', cssCheck.controls.overflow);

    console.log('\n#sculptor-palette:');
    console.log('  Exists:', cssCheck.palette.exists);
    console.log('  Display:', cssCheck.palette.display);
    console.log('  Grid columns:', cssCheck.palette.gridTemplateColumns);
    console.log('  Max-height:', cssCheck.palette.maxHeight);
    console.log('  Overflow-y:', cssCheck.palette.overflowY);
    console.log('  Overflow-x:', cssCheck.palette.overflowX);
    console.log('  Box-sizing:', cssCheck.palette.boxSizing);

    console.log('\n.sculptor-palette-wrapper:');
    console.log('  Exists:', cssCheck.paletteWrapper.exists);
    console.log('  Width:', cssCheck.paletteWrapper.width);
    console.log('  Max-width:', cssCheck.paletteWrapper.maxWidth);
    console.log('  Overflow:', cssCheck.paletteWrapper.overflow);
    console.log('  Box-sizing:', cssCheck.paletteWrapper.boxSizing);

    console.log('\n.viz-stage:');
    console.log('  Min-height:', cssCheck.vizStage.minHeight);
    console.log('  Width:', cssCheck.vizStage.width);

    // Now check actual overflow
    console.log('\n\n🔍 Checking actual overflow...\n');

    const overflowCheck = await page.evaluate(() => {
      const palette = document.querySelector('#sculptor-palette');
      const chips = document.querySelectorAll('#sculptor-palette .sculptor-section-chip');

      if (!palette || chips.length === 0) {
        return { error: 'No palette or chips found' };
      }

      const paletteRect = palette.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      const chipPositions = Array.from(chips).map((chip, i) => {
        const rect = chip.getBoundingClientRect();
        return {
          index: i,
          label: (chip.querySelector('.sculptor-chip-label') as HTMLElement)?.textContent || '',
          right: rect.right,
          overflowing: rect.right > viewportWidth
        };
      });

      return {
        paletteWidth: paletteRect.width,
        paletteRight: paletteRect.right,
        viewportWidth,
        paletteOverflowing: paletteRect.right > viewportWidth,
        chipCount: chips.length,
        chipsOverflowing: chipPositions.filter(c => c.overflowing),
        allChips: chipPositions
      };
    });

    if ('error' in overflowCheck) {
      console.log('❌', overflowCheck.error);
    } else {
      console.log('Palette width:', overflowCheck.paletteWidth.toFixed(0), 'px');
      console.log('Palette right edge:', overflowCheck.paletteRight.toFixed(0), 'px');
      console.log('Viewport width:', overflowCheck.viewportWidth, 'px');
      console.log('Palette overflowing:', overflowCheck.paletteOverflowing ? '❌ YES' : '✅ NO');
      console.log('\nChips:', overflowCheck.chipCount);
      console.log('Chips overflowing viewport:', overflowCheck.chipsOverflowing.length);

      if (overflowCheck.chipsOverflowing.length > 0) {
        console.log('\n❌ OVERFLOWING CHIPS:');
        overflowCheck.chipsOverflowing.forEach(chip => {
          console.log(`  [${chip.index}] ${chip.label}: right @ ${chip.right.toFixed(0)}px`);
        });
      } else {
        console.log('✅ No chips overflowing!');
      }
    }

    await page.screenshot({ path: 'artifacts/sculptor-verify.png', fullPage: true });
    console.log('\n📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
