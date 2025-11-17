import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage();

  console.log('🎵 Testing Harmonizer Jump Logic and Playback...\n');

  try {
    // Load a track with canon mode
    const trackId = 'TR03F47BFFE7';
    await page.goto(`http://localhost:4000/harmonizer.html?trid=${trackId}&mode=canon`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('Track loaded. Checking analysis data...');

    // Check if analysis data loaded correctly
    const analysisData = await page.evaluate(() => {
      const track = (window as any).curTrack;
      if (!track) return { loaded: false };

      const analysis = track.analysis;
      const canonAlignment = analysis?.canon_alignment;

      return {
        loaded: true,
        trackTitle: track.title,
        duration: track.audio_summary?.duration,
        beatsCount: analysis?.beats?.length || 0,
        barsCount: analysis?.bars?.length || 0,
        segmentsCount: analysis?.segments?.length || 0,
        hasCanonAlignment: !!canonAlignment,
        canonOffset: canonAlignment?.offset,
        canonPairs: canonAlignment?.pairs?.length || 0,
        canonTransitions: canonAlignment?.transitions?.length || 0,
        loopCandidates: canonAlignment?.loop_candidates?.length || 0
      };
    });

    console.log('Analysis data:', analysisData);

    if (!analysisData.loaded) {
      console.error('❌ Track data not loaded!');
      return;
    }

    // Check driver and remixer state
    const driverState = await page.evaluate(() => {
      const driver = (window as any).driver;
      const remixer = (window as any).remixer;

      return {
        hasDriver: !!driver,
        hasRemixer: !!remixer,
        driverFunctions: driver ? Object.keys(driver).filter(k => typeof driver[k] === 'function') : [],
        remixerFunctions: remixer ? Object.keys(remixer).filter(k => typeof remixer[k] === 'function') : []
      };
    });

    console.log('\n🎛️  Driver/Remixer state:', driverState);

    // Start playback
    console.log('\n▶️  Starting playback...');
    await page.click('button#play, button:has-text("play"), [aria-label*="play"]');
    await page.waitForTimeout(1000);

    // Monitor playback for jumps
    const jumpData = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const jumps: any[] = [];
        const startTime = Date.now();
        const monitorDuration = 10000; // Monitor for 10 seconds

        let lastBeat = -1;
        let jumpCount = 0;

        const checkInterval = setInterval(() => {
          const driver = (window as any).driver;
          const remixer = (window as any).remixer;

          if (driver && driver.player) {
            const currentBeat = driver.curBeat || driver.getCurrentBeat?.() || -1;
            const currentTime = driver.player.currentTime || 0;

            // Detect jump (non-sequential beat change)
            if (lastBeat >= 0 && currentBeat >= 0) {
              const beatDiff = currentBeat - lastBeat;
              if (Math.abs(beatDiff) > 2) { // Jump detected
                jumpCount++;
                jumps.push({
                  fromBeat: lastBeat,
                  toBeat: currentBeat,
                  jumpDistance: beatDiff,
                  timestamp: Date.now() - startTime,
                  currentTime
                });
              }
            }

            lastBeat = currentBeat;
          }

          if (Date.now() - startTime >= monitorDuration) {
            clearInterval(checkInterval);
            resolve({
              totalJumps: jumpCount,
              jumps: jumps.slice(0, 20), // First 20 jumps
              monitoredDuration: monitorDuration
            });
          }
        }, 100);
      });
    });

    console.log('\n🔀 Jump monitoring results:', jumpData);

    // Test manual jump by clicking on a beat tile
    console.log('\n🖱️  Testing manual jump (clicking beat tile)...');
    const tileClicked = await page.evaluate(() => {
      const tiles = document.querySelectorAll('rect[data-index], rect[data-beat]');
      if (tiles.length > 10) {
        const targetTile = tiles[10] as any;
        targetTile.click();
        return true;
      }
      return false;
    });

    if (tileClicked) {
      await page.waitForTimeout(500);
      const postJumpState = await page.evaluate(() => {
        const driver = (window as any).driver;
        return {
          currentBeat: driver?.curBeat || driver?.getCurrentBeat?.() || -1,
          isPlaying: driver?.player?.paused === false
        };
      });
      console.log('Post-manual-jump state:', postJumpState);
    }

    // Test canon alignment quality
    console.log('\n📊 Analyzing canon alignment quality...');
    const alignmentQuality = await page.evaluate(() => {
      const track = (window as any).curTrack;
      if (!track?.analysis?.canon_alignment) return null;

      const alignment = track.analysis.canon_alignment;
      const pairs = alignment.pairs || [];
      const pairSimilarity = alignment.pair_similarity || [];

      if (pairs.length === 0) return null;

      // Calculate similarity statistics
      const validSims = pairSimilarity.filter((s: number) => s > 0);
      const avgSimilarity = validSims.reduce((a: number, b: number) => a + b, 0) / validSims.length;
      const minSimilarity = Math.min(...validSims);
      const maxSimilarity = Math.max(...validSims);

      // Check for poor matches
      const poorMatches = pairSimilarity.filter((s: number) => s < 0.5).length;
      const goodMatches = pairSimilarity.filter((s: number) => s >= 0.7).length;

      return {
        totalPairs: pairs.length,
        avgSimilarity: avgSimilarity.toFixed(3),
        minSimilarity: minSimilarity.toFixed(3),
        maxSimilarity: maxSimilarity.toFixed(3),
        poorMatches,
        goodMatches,
        coverageRatio: alignment.coverage?.ratio || 0,
        primaryOffset: alignment.offset
      };
    });

    console.log('Canon alignment quality:', alignmentQuality);

    // Screenshot current state
    await page.screenshot({
      path: 'playwright-code/artifacts/harmonizer-playing-canon.png',
      fullPage: true
    });

    // Test jukebox mode
    console.log('\n🎰 Testing jukebox mode...');
    await page.goto(`http://localhost:4000/harmonizer.html?trid=${trackId}&mode=jukebox`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const jukeboxData = await page.evaluate(() => {
      const track = (window as any).curTrack;
      if (!track) return null;

      const eternalCandidates = track.analysis?.eternal_loop_candidates || {};
      const candidateCount = Object.keys(eternalCandidates).reduce((sum: number, key: string) => {
        return sum + (eternalCandidates[key]?.length || 0);
      }, 0);

      return {
        mode: (window as any).mode,
        bodyMode: document.body.getAttribute('data-mode'),
        eternalCandidatesCount: candidateCount,
        beatsWithCandidates: Object.keys(eternalCandidates).length
      };
    });

    console.log('Jukebox mode data:', jukeboxData);

    await page.screenshot({
      path: 'playwright-code/artifacts/harmonizer-jukebox.png',
      fullPage: true
    });

    console.log('\n📸 Screenshots saved to artifacts/');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
    console.log('\n✅ Jump logic test complete');
  }
})();
