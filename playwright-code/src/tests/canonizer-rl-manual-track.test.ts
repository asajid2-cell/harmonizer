import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1920,1080']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  console.log('🔍 Manual Track Selection - RL Loop Analysis\n');
  console.log('Instructions:');
  console.log('  1. Load "Man Of The Year" by Juice WRLD in Canon mode');
  console.log('  2. Enable RL if not already enabled');
  console.log('  3. Press Play');
  console.log('  4. Wait for automatic detection...\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?mode=canon');
    await page.waitForLoadState('networkidle');

    console.log('⏸️  Waiting for you to load the track and start playback...');
    console.log('   (Script will auto-detect when playback starts)\n');

    // Wait for playback to start
    await page.waitForFunction(() => {
      const win = window as any;
      return win.driver?.running === true;
    }, { timeout: 120000 }); // 2 minute timeout

    await page.waitForTimeout(1000);

    // Get track info
    const trackInfo = await page.evaluate(() => {
      const win = window as any;
      return {
        title: win.currentTrack?.title || 'Unknown',
        artist: win.currentTrack?.artist || 'Unknown',
        id: win.currentTrack?.id || 'Unknown',
        totalBeats: win.masterQs?.length || 0
      };
    });

    console.log('✅ Playback detected!');
    console.log('\nTrack Info:');
    console.log('  Title:', trackInfo.title);
    console.log('  Artist:', trackInfo.artist);
    console.log('  Track ID:', trackInfo.id);
    console.log('  Total beats:', trackInfo.totalBeats);

    // Check RL status
    const rlStatus = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const rlButton = buttons.find(b => b.textContent?.includes('MODEL') || b.textContent?.includes('RL'));
      return rlButton?.textContent?.trim() || 'Unknown';
    });
    console.log('  RL Status:', rlStatus);

    // Set up aggressive loop detection focused on start region
    await page.evaluate((totalBeats) => {
      const win = window as any;
      win.__beatLog = [];
      win.__startTime = Date.now();
      win.__totalBeats = totalBeats;
      win.__loopWarnings = [];
      win.__jumpLog = [];

      if (win.__beatMonitor) {
        clearInterval(win.__beatMonitor);
      }

      win.__beatMonitor = setInterval(() => {
        const driver = win.driver;
        const masterQs = win.masterQs;

        if (!driver || !masterQs) return;

        const curBeat = driver.curQ;
        if (typeof curBeat !== 'number') return;

        const now = Date.now();
        const elapsed = ((now - win.__startTime) / 1000).toFixed(1);

        const lastBeat = win.__beatLog.length > 0 ? win.__beatLog[win.__beatLog.length - 1] : null;

        if (!lastBeat || lastBeat.beat !== curBeat) {
          win.__beatLog.push({
            beat: curBeat,
            timestamp: now,
            elapsed: parseFloat(elapsed)
          });

          // Detect ANY jumps
          if (lastBeat) {
            const jump = curBeat - lastBeat.beat;
            if (Math.abs(jump) > 1) {
              win.__jumpLog.push({
                from: lastBeat.beat,
                to: curBeat,
                jump,
                time: parseFloat(elapsed)
              });
              const direction = jump > 0 ? 'FORWARD' : 'BACKWARD';
              console.log(`🔀 [${elapsed}s] ${direction} JUMP: ${lastBeat.beat} → ${curBeat} (Δ${jump})`);
            }
          }

          // Aggressive loop detection - check last 5 beats
          if (win.__beatLog.length > 5) {
            const recent5 = win.__beatLog.slice(-5).map(b => b.beat);
            const uniqueRecent = new Set(recent5);

            // If oscillating between 2-3 beats
            if (uniqueRecent.size <= 3) {
              const pattern = Array.from(uniqueRecent).sort((a, b) => a - b).join(',');
              const isStart = curBeat < 30;
              const location = isStart ? 'START' : 'MIDDLE';

              const alreadyWarned = win.__loopWarnings.some(
                w => w.pattern === pattern && Math.abs(w.beatNumber - curBeat) < 10
              );

              if (!alreadyWarned) {
                win.__loopWarnings.push({
                  location,
                  pattern,
                  beats: Array.from(uniqueRecent),
                  time: parseFloat(elapsed),
                  beatNumber: curBeat
                });
                console.log(`⚠️  [${elapsed}s] LOOP at ${location} (beat ${curBeat}): oscillating between [${pattern}]`);
              }
            }
          }
        }
      }, 50);

      console.log('[Monitor] Beat tracking initialized');
    }, trackInfo.totalBeats);

    // Monitor for 60 seconds
    console.log('\n▶️  Monitoring playback...\n');

    const monitorDuration = 60000;
    const checkInterval = 3000;

    for (let elapsed = 0; elapsed < monitorDuration; elapsed += checkInterval) {
      await page.waitForTimeout(checkInterval);

      const status = await page.evaluate(() => {
        const win = window as any;
        const driver = win.driver;
        const curBeat = driver?.curQ || 0;
        const total = win.__totalBeats;

        const isStart = curBeat < 30;
        const location = isStart ? '(START)' : '';

        return {
          running: driver?.running || false,
          currentBeat: curBeat,
          location,
          totalBeats: win.__beatLog.length,
          uniqueBeats: new Set(win.__beatLog.map((b: any) => b.beat)).size,
          loopWarnings: win.__loopWarnings.length,
          totalJumps: win.__jumpLog.length,
          recentBeats: win.__beatLog.slice(-6).map((b: any) => b.beat)
        };
      });

      const elapsedSec = (elapsed + checkInterval) / 1000;
      console.log(`[${elapsedSec}s] Beat: ${status.currentBeat} ${status.location}, Unique: ${status.uniqueBeats}/${status.totalBeats}, Jumps: ${status.totalJumps}, Warnings: ${status.loopWarnings}`);
      console.log(`      Recent: [${status.recentBeats.join(', ')}]`);

      if (!status.running) {
        console.log('\n⏹️  Playback stopped');
        break;
      }

      // Early detection of stuck loop
      if (status.loopWarnings >= 3 && status.uniqueBeats < 20) {
        console.log('\n⚠️  STUCK IN LOOP - Multiple warnings detected!');
        console.log('   Continuing to monitor pattern...\n');
      }
    }

    // Final analysis
    console.log('\n\n📊 Final Analysis...\n');

    const analysis = await page.evaluate(() => {
      const win = window as any;
      const beatLog = win.__beatLog || [];
      const jumpLog = win.__jumpLog || [];
      const warnings = win.__loopWarnings || [];
      const total = win.__totalBeats;

      // Beat frequency analysis
      const beatCounts = {};
      beatLog.forEach(entry => {
        beatCounts[entry.beat] = (beatCounts[entry.beat] || 0) + 1;
      });

      const mostVisited = Object.entries(beatCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([beat, count]) => ({ beat: parseInt(beat), count }));

      // Find longest stuck sequence
      let maxStuckLength = 0;
      let maxStuckBeats = [];

      for (let i = 0; i < beatLog.length - 10; i++) {
        const window = beatLog.slice(i, i + 10).map(b => b.beat);
        const unique = new Set(window);
        if (unique.size <= 3 && unique.size < maxStuckBeats.length || maxStuckBeats.length === 0) {
          maxStuckLength = 10;
          maxStuckBeats = Array.from(unique);
        }
      }

      return {
        totalBeats: beatLog.length,
        uniqueBeats: new Set(beatLog.map(b => b.beat)).size,
        totalJumps: jumpLog.length,
        loopWarnings: warnings,
        mostVisited,
        backwardJumps: jumpLog.filter(j => j.jump < 0),
        forwardJumps: jumpLog.filter(j => j.jump > 0),
        maxBeatReached: Math.max(...beatLog.map(b => b.beat)),
        minBeatReached: Math.min(...beatLog.map(b => b.beat)),
        maxStuckBeats,
        jumpLog
      };
    });

    console.log('═'.repeat(70));
    console.log('MANUAL TRACK ANALYSIS RESULTS');
    console.log('═'.repeat(70));

    console.log('\n📍 Playback Stats:');
    console.log(`  Total beats logged: ${analysis.totalBeats}`);
    console.log(`  Unique beats visited: ${analysis.uniqueBeats}`);
    console.log(`  Beat range: ${analysis.minBeatReached} - ${analysis.maxBeatReached} (out of ${trackInfo.totalBeats})`);
    console.log(`  Total jumps: ${analysis.totalJumps}`);
    console.log(`    Forward jumps: ${analysis.forwardJumps.length}`);
    console.log(`    Backward jumps: ${analysis.backwardJumps.length}`);

    if (analysis.backwardJumps.length > 0) {
      console.log('\n↩️  BACKWARD JUMPS:');
      analysis.backwardJumps.slice(0, 10).forEach((jump: any, i: number) => {
        console.log(`  [${i + 1}] At ${jump.time}s: ${jump.from} → ${jump.to} (Δ${jump.jump})`);
      });
      if (analysis.backwardJumps.length > 10) {
        console.log(`  ... and ${analysis.backwardJumps.length - 10} more`);
      }
    }

    if (analysis.loopWarnings.length > 0) {
      console.log('\n⚠️  LOOP WARNINGS:');
      analysis.loopWarnings.forEach((warning: any, i: number) => {
        console.log(`  [${i + 1}] At ${warning.time}s (beat ${warning.beatNumber}) - ${warning.location}`);
        console.log(`      Oscillating between: [${warning.pattern}]`);
      });
    }

    console.log('\n🔥 Most Revisited Beats:');
    analysis.mostVisited.slice(0, 10).forEach((item: any, i: number) => {
      const indicator = item.count > 5 ? '⚠️ ' : item.count > 2 ? '⚡' : '  ';
      console.log(`  ${indicator}${i + 1}. Beat ${item.beat}: visited ${item.count} times`);
    });

    if (analysis.maxStuckBeats.length > 0 && analysis.maxStuckBeats.length <= 3) {
      console.log(`\n⚠️  Stuck oscillating between beats: [${analysis.maxStuckBeats.join(', ')}]`);
    }

    console.log('\n' + '═'.repeat(70));

    // Verdict
    const isStuck = analysis.uniqueBeats < 30 && analysis.totalBeats > 50;
    const hasLoops = analysis.loopWarnings.length > 0;
    const hasBackwardJumps = analysis.backwardJumps.length > 5;

    if (isStuck || hasLoops || hasBackwardJumps) {
      console.log('❌ LOOPING CONFIRMED!');
      if (isStuck) console.log('   → Only visited', analysis.uniqueBeats, 'unique beats out of', analysis.totalBeats, 'logged');
      if (hasLoops) console.log('   →', analysis.loopWarnings.length, 'loop warnings detected');
      if (hasBackwardJumps) console.log('   →', analysis.backwardJumps.length, 'backward jumps detected');
    } else {
      console.log('✅ No significant looping detected');
    }

    // Save detailed log
    const outputPath = path.resolve('artifacts/canonizer-rl-manual-track.json');
    const fullLog = await page.evaluate(() => {
      const win = window as any;
      return {
        trackInfo: {
          title: win.currentTrack?.title,
          artist: win.currentTrack?.artist,
          id: win.currentTrack?.id,
          totalBeats: win.__totalBeats
        },
        beatLog: win.__beatLog,
        jumpLog: win.__jumpLog,
        loopWarnings: win.__loopWarnings
      };
    });

    fs.writeFileSync(outputPath, JSON.stringify(fullLog, null, 2));
    console.log('\n💾 Log saved:', outputPath);

    await page.screenshot({ path: 'artifacts/canonizer-rl-manual-track.png', fullPage: true });
    console.log('📸 Screenshot saved');

    console.log('\n⏸️  Browser will stay open for 10 seconds for inspection...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
