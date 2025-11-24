import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

  console.log('🔍 Testing Eternal Canonizer circular overlay cursors...\n');

  try {
    // Navigate to eternal canonizer mode with a track
    await page.goto('http://localhost:4000/harmonizer.html?trid=TRE560E6CFDA&mode=eternal');
    await page.waitForLoadState('networkidle');
    console.log('✓ Page loaded in eternal mode');

    // Wait for the visualizer to initialize
    await page.waitForTimeout(2000);

    // Check the mode
    const modeInfo = await page.evaluate(() => {
      const body = document.body;
      return {
        dataMode: body.getAttribute('data-mode'),
        bodyClasses: body.className
      };
    });
    console.log('Mode info:', modeInfo);

    // Check for SVG elements (Raphael creates SVG)
    const svgInfo = await page.evaluate(() => {
      const svgs = document.querySelectorAll('svg');
      const circles = document.querySelectorAll('svg circle');
      const paths = document.querySelectorAll('svg path');

      // Get info about all circles
      const circleDetails = Array.from(circles).map((c, idx) => ({
        idx,
        cx: c.getAttribute('cx'),
        cy: c.getAttribute('cy'),
        r: c.getAttribute('r'),
        fill: c.getAttribute('fill'),
        stroke: c.getAttribute('stroke')
      }));

      // Check path colors to see if we have both orange (eternal) and cyan (canon) loops
      const pathColors: Record<string, number> = {};
      Array.from(paths).forEach(p => {
        const stroke = p.getAttribute('stroke') || 'none';
        pathColors[stroke] = (pathColors[stroke] || 0) + 1;
      });

      return {
        svgCount: svgs.length,
        circleCount: circles.length,
        pathCount: paths.length,
        circleDetails: circleDetails.slice(0, 20), // First 20 circles
        pathColors // Breakdown of path stroke colors
      };
    });
    console.log('\n📊 SVG elements:', {
      svgCount: svgInfo.svgCount,
      circleCount: svgInfo.circleCount,
      pathCount: svgInfo.pathCount,
      pathColors: svgInfo.pathColors
    });
    console.log('Circle details (first 20):', svgInfo.circleDetails);

    // Check visualizer globals
    const vizState = await page.evaluate(() => {
      const win = window as any;
      return {
        mode: win.mode,
        hasOtherCursorCircles: Array.isArray(win.otherCursorCircles),
        otherCursorCirclesLength: win.otherCursorCircles ? win.otherCursorCircles.length : 'undefined',
        hasMasterCursorCircle: !!win.masterCursorCircle,
        hasCurrentVoiceStates: Array.isArray(win.currentVoiceStates),
        currentVoiceStatesLength: win.currentVoiceStates ? win.currentVoiceStates.length : 0,
        hasMasterQs: Array.isArray(win.masterQs),
        masterQsLength: win.masterQs ? win.masterQs.length : 0
      };
    });
    console.log('\n🔧 Visualizer state:', vizState);

    // Start playback to trigger the cursors
    console.log('\n▶️ Starting playback...');
    const playButton = page.locator('#play-btn, button:has-text("Play"), .play-button').first();
    if (await playButton.count() > 0) {
      await playButton.click();
      console.log('Clicked play button');
    } else {
      // Try space bar
      await page.keyboard.press('Space');
      console.log('Pressed space bar');
    }

    // Wait for playback to start
    await page.waitForTimeout(3000);

    // Check the state again after playback
    const playbackState = await page.evaluate(() => {
      const win = window as any;
      const circles = document.querySelectorAll('svg circle');

      // Find circles that look like overlay cursors (smaller radius, colored)
      const possibleOverlayCursors = Array.from(circles).filter(c => {
        const r = parseFloat(c.getAttribute('r') || '0');
        const fill = c.getAttribute('fill') || '';
        // Overlay cursors have r=5-7 and non-tile colors
        return r >= 4 && r <= 10 && fill !== 'none';
      });

      return {
        isPlaying: win.isPlaying,
        currentVoiceStates: win.currentVoiceStates || [],
        otherCursorCircles: win.otherCursorCircles ? win.otherCursorCircles.length : 0,
        possibleOverlayCursorCount: possibleOverlayCursors.length,
        possibleOverlayCursors: possibleOverlayCursors.slice(0, 10).map(c => ({
          cx: c.getAttribute('cx'),
          cy: c.getAttribute('cy'),
          r: c.getAttribute('r'),
          fill: c.getAttribute('fill')
        }))
      };
    });
    console.log('\n🎵 Playback state:', playbackState);

    // Check if updateCircularCursors is being called
    console.log('\n📍 Checking updateCircularCursors function...');
    const funcCheck = await page.evaluate(() => {
      const win = window as any;
      return {
        hasUpdateCircularCursors: typeof win.updateCircularCursors === 'function',
        hasUpdateCursors: typeof win.updateCursors === 'function',
        hasGetCircularPoint: typeof win.getCircularPoint === 'function',
        hasGetOverlayColor: typeof win.getOverlayColor === 'function'
      };
    });
    console.log('Function availability:', funcCheck);

    // Take a screenshot
    await page.screenshot({ path: 'eternal-canonizer-overlay-test.png', fullPage: true });
    console.log('\n📸 Screenshot saved: eternal-canonizer-overlay-test.png');

    // Wait before closing
    console.log('\n⏳ Waiting 10 seconds for observation...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('❌ Error:', error);
    await page.screenshot({ path: 'eternal-canonizer-error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('\n✓ Browser closed');
  }
})();
