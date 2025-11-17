import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  console.log('🎵 Running FULL-LENGTH harmonizer session with comprehensive data gathering...\n');

  const jumpLog: any[] = [];
  const beatSequence: any[] = [];
  let sessionStartTime = Date.now();

  // Capture console output
  page.on('console', msg => {
    const text = msg.text();
    // Log important messages
    if (text.includes('[Canon Driver]') || text.includes('ERROR') || text.includes('error')) {
      console.log(`[BROWSER]`, text);
    }
  });

  try {
    const trackId = 'TR03F47BFFE7';
    await page.goto(`http://localhost:4000/harmonizer.html?trid=${trackId}&mode=canon`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Get track info
    const trackInfo = await page.evaluate(() => {
      const track = (window as any).curTrack;
      return {
        title: track?.title || 'Unknown',
        duration: track?.analysis?.audio_summary?.duration || 0,
        beatCount: (window as any).masterQs?.length || 0
      };
    });

    console.log(`Track: ${trackInfo.title}`);
    console.log(`Duration: ${trackInfo.duration.toFixed(1)}s`);
    console.log(`Beats: ${trackInfo.beatCount}\n`);

    // Inject comprehensive logging
    await page.evaluate(() => {
      const win = window as any;
      win.__jumpDataLog = [];
      win.__beatProgressLog = [];
      win.__monitorStart = Date.now();
      win.__monitorActive = false;

      if (win.__beatMonitorInterval) {
        clearInterval(win.__beatMonitorInterval);
      }

      win.__beatMonitorInterval = setInterval(() => {
        const driver = win.driver;
        const masterQs = win.masterQs;
        const canonLoopGraph = win.canonLoopGraph;

        if (!driver || !masterQs) {
          return;
        }

        const curBeat = driver.curQ;
        if (typeof curBeat !== 'number' || curBeat < 0 || curBeat >= masterQs.length) {
          return;
        }

        const currentBeatData = masterQs[curBeat];
        const loopCandidates = canonLoopGraph?.[curBeat] || [];

        const entry = {
          beat: curBeat,
          timestamp: Date.now(),
          running: driver.running,
          canonPair: currentBeatData?.other?.which ?? null,
          similarity: currentBeatData?.otherSimilarity ?? currentBeatData?.otherSimilarityRaw ?? null,
          loopCandidatesCount: loopCandidates.length,
          topLoopTargets: loopCandidates.slice(0, 3).map((candidate: any) => ({
            target: candidate.target_start,
            similarity: candidate.similarity
          }))
        };

        const log = win.__beatProgressLog;
        const lastEntry = log.length > 0 ? log[log.length - 1] : null;
        log.push(entry);

        if (lastEntry) {
          const diff = entry.beat - lastEntry.beat;
          if (Math.abs(diff) > 2) {
            win.__jumpDataLog.push({
              from: lastEntry.beat,
              to: entry.beat,
              distance: diff,
              timestamp: entry.timestamp,
              similarity: entry.similarity
            });
            console.log(`[JUMP] ${lastEntry.beat} → ${entry.beat} (Δ${diff})`);
          }
        }

        if (driver.running) {
          win.__monitorActive = true;
        }

        if (win.__monitorActive && !driver.running) {
          clearInterval(win.__beatMonitorInterval);
        }
      }, 100);

      console.log('[Setup] Beat monitor interval established');
    });

    // Start playback
    console.log('▶️  Starting playback...\n');
    await page.click('button#play');
    await page.waitForTimeout(500);

    const isPlaying = await page.evaluate(() => (window as any).driver?.running || false);

    if (!isPlaying) {
      console.error('❌ Playback did not start!');
      await browser.close();
      return;
    }

    // Monitor for 60 seconds (or until stopped)
    const monitorDuration = 60; // seconds
    console.log(`Monitoring for ${monitorDuration} seconds...\n`);

    for (let i = 0; i < monitorDuration * 2; i++) {
      await page.waitForTimeout(500);

      const state = await page.evaluate(() => {
        const driver = (window as any).driver;
        return {
          curQ: driver?.curQ ?? -1,
          running: driver?.running || false,
          jumpCount: (window as any).jumpDataLog?.length || 0
        };
      });

      // Update progress line
      const elapsed = (i * 0.5).toFixed(1);
      process.stdout.write(`\r[${elapsed}s] Beat: ${state.curQ.toString().padStart(3)} | Jumps: ${state.jumpCount.toString().padStart(2)} | Running: ${state.running ? 'YES' : 'NO '}`);

      if (!state.running) {
        console.log('\n\n⚠️  Playback stopped');
        break;
      }
    }

    console.log('\n\n📊 Collecting session data...\n');

    // Get all collected data
    const sessionData = await page.evaluate(() => {
      const win = window as any;
      const jumpLog = win.__jumpDataLog || [];
      const beatLog = win.__beatProgressLog || [];
      const masterQs = win.masterQs;

      const jumpDistances = jumpLog.map((j: any) => Math.abs(j.distance));
      const avgJumpDistance = jumpDistances.length > 0
        ? jumpDistances.reduce((sum: number, val: number) => sum + val, 0) / jumpDistances.length
        : 0;

      const jumpTargets = new Set(jumpLog.map((j: any) => j.to));
      const jumpSources = new Set(jumpLog.map((j: any) => j.from));
      const beatsVisited = new Set(beatLog.map((b: any) => b.beat));
      const totalBeats = masterQs?.length || 0;
      const coverage = totalBeats > 0 ? (beatsVisited.size / totalBeats * 100).toFixed(1) : '0.0';

      return {
        jumps: jumpLog,
        beatProgress: beatLog,
        stats: {
          totalJumps: jumpLog.length,
          totalBeatsLogged: beatLog.length,
          avgJumpDistance: avgJumpDistance.toFixed(1),
          uniqueJumpTargets: jumpTargets.size,
          uniqueJumpSources: jumpSources.size,
          beatCoverage: `${coverage}%`,
          totalBeatsInTrack: totalBeats
        }
      };
    });

    console.log('Session Statistics:');
    console.log(sessionData.stats);

    console.log('\n📝 Jump Details:');
    if (sessionData.jumps.length === 0) {
      console.log('  NO JUMPS DETECTED!');
    } else {
      sessionData.jumps.forEach((jump: any, idx: number) => {
        const elapsed = ((jump.timestamp - sessionStartTime) / 1000).toFixed(1);
        console.log(`  [${idx + 1}] ${elapsed}s: Beat ${jump.from} → ${jump.to} (distance: ${jump.distance > 0 ? '+' : ''}${jump.distance}, sim: ${jump.similarity.toFixed(3)})`);
      });
    }

    // Save detailed data to file
    const outputPath = path.resolve('artifacts/harmonizer-session-data.json');
    const outputData = {
      trackInfo,
      sessionStats: sessionData.stats,
      jumps: sessionData.jumps,
      beatProgressSample: sessionData.beatProgress.slice(0, 50), // First 50 beats
      fullBeatProgress: sessionData.beatProgress
    };

    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`\n💾 Full session data saved to: ${outputPath}`);

    // Take screenshot
    await page.screenshot({
      path: 'playwright-code/artifacts/harmonizer-full-session.png',
      fullPage: true
    });

    console.log('📸 Screenshot saved\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
    console.log('✅ Session complete');
  }
})();
