import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newPage();

  console.log('🎵 Testing Harmonizer with actual track data...\n');

  try {
    // Test regular canon mode track
    const trackId = 'TR03F47BFFE7';
    console.log(`Loading track: ${trackId}`);

    await page.goto(`http://localhost:4000/harmonizer.html?trid=${trackId}&mode=canon`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Let visualization render

    const trackLoaded = await page.evaluate(() => {
      return {
        curTrack: (window as any).curTrack !== null,
        mode: (window as any).mode,
        bodyMode: document.body.getAttribute('data-mode'),
        bodyState: Array.from(document.body.classList).find((c:string) => c.startsWith('state-'))
      };
    });
    console.log('Track state:', trackLoaded);

    // Check visualization populated
    const vizState = await page.evaluate(() => {
      const tiles = document.getElementById('tiles');
      const svg = tiles?.querySelector('svg');
      const circles = svg?.querySelectorAll('circle');
      const rects = svg?.querySelectorAll('rect');
      const paths = svg?.querySelectorAll('path');
      const texts = svg?.querySelectorAll('text');

      return {
        svgChildren: svg?.children.length || 0,
        circles: circles?.length || 0,
        rects: rects?.length || 0,
        paths: paths?.length || 0,
        texts: texts?.length || 0,
        totalElements: (circles?.length || 0) + (rects?.length || 0) + (paths?.length || 0) + (texts?.length || 0)
      };
    });
    console.log('\n📊 Visualization elements:', vizState);

    if (vizState.totalElements === 0) {
      console.log('⚠️  WARNING: No visualization elements rendered!');
    }

    // Test autoharmonizer mode
    console.log('\n🎛️  Testing autoharmonizer mode...');
    const autoharmonizerTrackId = 'TR03F47BFFE7+TRE17840B6AC';

    await page.goto(`http://localhost:4000/harmonizer.html?trid=${autoharmonizerTrackId}&mode=autoharmonizer`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const autoharmonizerState = await page.evaluate(() => {
      const body = document.body;
      const tiles = document.getElementById('tiles');
      const svg = tiles?.querySelector('svg');

      return {
        bodyMode: body.getAttribute('data-mode'),
        bodyClasses: body.className,
        svgChildren: svg?.children.length || 0,
        curTrack: (window as any).curTrack !== null,
        mode: (window as any).mode
      };
    });
    console.log('Autoharmonizer state:', autoharmonizerState);

    // Check for autoharmonizer-specific UI
    const autoharmonizerUI = await page.evaluate(() => {
      const track1Indicator = document.querySelector('[data-track="1"], .track-1, #track1');
      const track2Indicator = document.querySelector('[data-track="2"], .track-2, #track2');
      const crossfadeControl = document.querySelector('[data-control="crossfade"], .crossfade-control');

      return {
        hasTrack1Indicator: !!track1Indicator,
        hasTrack2Indicator: !!track2Indicator,
        hasCrossfadeControl: !!crossfadeControl,
        track1Classes: track1Indicator?.className || 'none',
        track2Classes: track2Indicator?.className || 'none'
      };
    });
    console.log('Autoharmonizer UI elements:', autoharmonizerUI);

    // Test playback controls
    console.log('\n▶️  Testing playback...');
    const playButton = page.locator('button:has-text("play"), [aria-label*="play" i], .play-btn').first();
    const playButtonExists = await playButton.count() > 0;
    console.log('Play button exists:', playButtonExists);

    if (playButtonExists) {
      await playButton.click();
      await page.waitForTimeout(2000);

      const playbackState = await page.evaluate(() => {
        const audioElements = document.querySelectorAll('audio');
        return {
          audioCount: audioElements.length,
          audioStates: Array.from(audioElements).map((audio: any) => ({
            paused: audio.paused,
            currentTime: audio.currentTime,
            duration: audio.duration
          }))
        };
      });
      console.log('Playback state:', playbackState);
    }

    // Screenshots
    await page.screenshot({
      path: 'playwright-code/artifacts/harmonizer-canon-loaded.png',
      fullPage: true
    });

    await page.goto(`http://localhost:4000/harmonizer.html?trid=${autoharmonizerTrackId}&mode=autoharmonizer`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: 'playwright-code/artifacts/harmonizer-autoharmonizer-loaded.png',
      fullPage: true
    });

    console.log('\n📸 Screenshots saved');

    await page.waitForTimeout(2000);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
    console.log('\n✅ Track loading test complete');
  }
})();
