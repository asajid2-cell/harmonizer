import { chromium } from 'playwright';
import path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  console.log('🎨 Deep-diving into Harmonizer visualizer issues...\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html');
    await page.waitForLoadState('networkidle');

    // Check if Raphael loaded
    const raphaelLoaded = await page.evaluate(() => typeof (window as any).Raphael !== 'undefined');
    console.log('Raphael.js loaded:', raphaelLoaded);

    // Check if #tiles div exists
    const tilesDiv = await page.evaluate(() => {
      const tiles = document.getElementById('tiles');
      return {
        exists: !!tiles,
        className: tiles?.className || 'none',
        innerHTML: tiles?.innerHTML?.length || 0,
        children: tiles?.children.length || 0,
        hasSvg: !!tiles?.querySelector('svg')
      };
    });
    console.log('\n#tiles div:', tilesDiv);

    // Check global paper variable
    const paperState = await page.evaluate(() => {
      const paper = (window as any).paper;
      return {
        exists: !!paper,
        type: typeof paper,
        hasCanvas: paper?.canvas ? true : false,
        width: paper?.width || 0,
        height: paper?.height || 0
      };
    });
    console.log('Paper object:', paperState);

    // Upload a test audio file to trigger visualization
    console.log('\n📤 Testing with sample audio...');

    // Check for test audio files in uploads
    const testAudioPath = path.resolve('backend/uploads');
    console.log('Looking for test audio in:', testAudioPath);

    // Instead, let's check if there are any already-processed tracks
    const existingTracks = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/tracks');
        if (response.ok) {
          return await response.json();
        }
      } catch(e) {}
      return null;
    });

    console.log('Existing tracks:', existingTracks);

    // Check visualizer state in different modes
    const modes = ['canon', 'jukebox', 'eternal', 'autoharmonizer'];
    for (const testMode of modes) {
      console.log(`\n🔄 Testing ${testMode} mode...`);

      await page.evaluate((m) => {
        document.body.setAttribute('data-mode', m);
      }, testMode);

      await page.waitForTimeout(500);

      const modeVisualization = await page.evaluate(() => {
        const tiles = document.getElementById('tiles');
        const svg = tiles?.querySelector('svg');
        return {
          tilesSvgCount: tiles?.querySelectorAll('svg').length || 0,
          svgWidth: svg?.getAttribute('width'),
          svgHeight: svg?.getAttribute('height'),
          svgChildren: svg?.children.length || 0,
          bodyMode: document.body.getAttribute('data-mode'),
          bodyClasses: document.body.className
        };
      });

      console.log(`  ${testMode}:`, modeVisualization);
    }

    // Check console errors during visualization
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    // Try to trigger a visualization update
    console.log('\n🎯 Attempting to trigger visualization...');
    const triggerResult = await page.evaluate(() => {
      try {
        const funcs = [
          'configureCanvasForMode',
          'renderOrbitBase',
          'applyModeLayout',
          'syncOrbitContainerSize',
          'refreshCanonVisualization',
          'refreshJukeboxVisualization'
        ];

        const available = funcs.filter(f => typeof (window as any)[f] === 'function');

        // Try to call available functions
        for (const func of available) {
          try {
            (window as any)[func]();
          } catch(e:any) {
            return { error: `${func} failed: ${e.message}` };
          }
        }

        return { available, called: available.length };
      } catch(e: any) {
        return { error: e.message };
      }
    });
    console.log('Trigger result:', triggerResult);

    // Final screenshot
    await page.screenshot({
      path: 'playwright-code/artifacts/harmonizer-visualizer-deep.png',
      fullPage: true
    });

    console.log('\n📸 Screenshot saved');

    if (consoleMessages.length > 0) {
      console.log('\n⚠️ Console messages:', consoleMessages.slice(0, 10));
    }

    await page.waitForTimeout(2000);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
    console.log('\n✅ Deep dive complete');
  }
})();
