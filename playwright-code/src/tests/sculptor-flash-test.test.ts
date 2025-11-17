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

  console.log('🔍 Testing for CSS flash/resize on Sculptor load\n');

  try {
    const measurements = [];

    // Monitor changes to palette width
    await page.exposeFunction('recordMeasurement', (data) => {
      measurements.push(data);
    });

    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');

    // Inject monitoring script BEFORE page loads
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        const palette = document.querySelector('#sculptor-palette');
        const controls = document.querySelector('#sculptor-controls');
        if (palette && controls) {
          const paletteRect = palette.getBoundingClientRect();
          const controlsRect = controls.getBoundingClientRect();
          window.recordMeasurement({
            timestamp: Date.now(),
            paletteWidth: paletteRect.width,
            paletteRight: paletteRect.right,
            controlsWidth: controlsRect.width,
            controlsRight: controlsRect.right,
            viewportWidth: window.innerWidth
          });
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    });

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Take final measurements
    const final = await page.evaluate(() => {
      const palette = document.querySelector('#sculptor-palette');
      const controls = document.querySelector('#sculptor-controls');
      const paletteWrapper = document.querySelector('.sculptor-palette-wrapper');

      return {
        palette: {
          width: palette?.getBoundingClientRect().width,
          right: palette?.getBoundingClientRect().right,
          scrollWidth: (palette as HTMLElement)?.scrollWidth,
          computedWidth: palette ? window.getComputedStyle(palette).width : null,
          computedMaxWidth: palette ? window.getComputedStyle(palette).maxWidth : null,
          computedOverflowX: palette ? window.getComputedStyle(palette).overflowX : null
        },
        controls: {
          width: controls?.getBoundingClientRect().width,
          right: controls?.getBoundingClientRect().right,
          computedWidth: controls ? window.getComputedStyle(controls).width : null,
          computedMaxWidth: controls ? window.getComputedStyle(controls).maxWidth : null
        },
        paletteWrapper: {
          width: paletteWrapper?.getBoundingClientRect().width,
          computedWidth: paletteWrapper ? window.getComputedStyle(paletteWrapper).width : null,
          computedMaxWidth: paletteWrapper ? window.getComputedStyle(paletteWrapper).maxWidth : null
        },
        viewport: window.innerWidth
      };
    });

    console.log('📊 Final Measurements:\n');
    console.log('Viewport:', final.viewport, 'px');
    console.log('\n#sculptor-palette:');
    console.log('  Width:', final.palette.width?.toFixed(0), 'px');
    console.log('  Right edge:', final.palette.right?.toFixed(0), 'px');
    console.log('  Scroll width:', final.palette.scrollWidth, 'px');
    console.log('  Computed width:', final.palette.computedWidth);
    console.log('  Computed max-width:', final.palette.computedMaxWidth);
    console.log('  Computed overflow-x:', final.palette.computedOverflowX);
    console.log('  Overflowing:', (final.palette.right || 0) > final.viewport ? '❌ YES' : '✅ NO');

    console.log('\n#sculptor-controls:');
    console.log('  Width:', final.controls.width?.toFixed(0), 'px');
    console.log('  Right edge:', final.controls.right?.toFixed(0), 'px');
    console.log('  Computed width:', final.controls.computedWidth);
    console.log('  Computed max-width:', final.controls.computedMaxWidth);
    console.log('  Overflowing:', (final.controls.right || 0) > final.viewport ? '❌ YES' : '✅ NO');

    console.log('\n.sculptor-palette-wrapper:');
    console.log('  Width:', final.paletteWrapper.width?.toFixed(0), 'px');
    console.log('  Computed width:', final.paletteWrapper.computedWidth);
    console.log('  Computed max-width:', final.paletteWrapper.computedMaxWidth);

    if (measurements.length > 0) {
      console.log('\n📈 Detected', measurements.length, 'size changes during load');
      console.log('\nSize change timeline:');
      measurements.forEach((m, i) => {
        console.log(`  [${i + 1}] Palette: ${m.paletteWidth.toFixed(0)}px, Controls: ${m.controlsWidth.toFixed(0)}px`);
      });
    }

    await page.screenshot({ path: 'artifacts/sculptor-flash-test.png', fullPage: true });
    console.log('\n📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
