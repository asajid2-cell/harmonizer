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

  console.log('🔍 Analyzing "Man Of The Year" - RL Loop Detection\n');

  try {
    // Load Man Of The Year directly
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR4C61EE96C2&mode=canon');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const trackInfo = await page.evaluate(() => {
      const win = window as any;
      return {
        title: win.currentTrack?.title || 'Unknown',
        artist: win.currentTrack?.artist || 'Unknown',
        totalBeats: win.masterQs?.length || 0
      };
    });

    console.log('Track:', trackInfo.title, 'by', trackInfo.artist);
    console.log('Total beats:', trackInfo.totalBeats);

    // Check and enable RL if needed
    console.log('\n🤖 Checking RL status...');
    const initialRlStatus = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button.rl-model-btn'));
      const activeBtn = buttons.find(b => b.classList.contains('active'));
      return activeBtn?.textContent?.trim() || 'Unknown';
    });
    console.log('Initial RL Status:', initialRlStatus);

    if (initialRlStatus === 'No RL') {
      console.log('Enabling RL by clicking Model A...');
      await page.click('button.rl-model-btn:not(.active)');
      await page.waitForTimeout(500);

      const afterClick = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button.rl-model-btn'));
        const activeBtn = buttons.find(b => b.classList.contains('active'));
        return activeBtn?.textContent?.trim() || 'Unknown';
      });
      console.log('After click:', afterClick);
    } else {
      console.log('✅ RL already enabled');
    }

    // Set up AGGRESSIVE loop detection for start region
    await page.evaluate((totalBeats) => {
      const win = window as any;
      win.__beatLog = [];
      win.__jumpLog = [];
      win.__loopWarnings = [];
      win.__startTime = Date.now();
      win.__totalBeats = totalBeats;

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

          // Log ALL jumps
          if (lastBeat) {
            const jump = curBeat - lastBeat.beat;
            if (Math.abs(jump) > 1) {
              win.__jumpLog.push({
                from: lastBeat.beat,
                to: curBeat,
                jump,
                time: parseFloat(elapsed)
              });

              const direction = jump > 0 ? '⏩' : '↩️';
              console.log(`${direction} [${elapsed}s] JUMP: beat ${lastBeat.beat} → ${curBeat} (Δ${jump})`);
            }
          }

          // VERY aggressive loop detection - check last 4 beats
          if (win.__beatLog.length >= 4) {
            const recent4 = win.__beatLog.slice(-4).map(b => b.beat);
            const uniqueRecent = new Set(recent4);

            // If stuck between 2-3 beats
            if (uniqueRecent.size <= 3) {
              const pattern = Array.from(uniqueRecent).sort((a, b) => a - b).join(',');
              const isStart = curBeat < 50;
              const location = isStart ? 'START' : 'MIDDLE';

              const alreadyWarned = win.__loopWarnings.some(
                w => w.pattern === pattern && Math.abs(w.time - parseFloat(elapsed)) < 2
              );

              if (!alreadyWarned) {
                win.__loopWarnings.push({
                  location,
                  pattern,
                  beats: Array.from(uniqueRecent),
                  time: parseFloat(elapsed),
                  beatNumber: curBeat
                });
                console.log(`⚠️  [${elapsed}s] LOOP DETECTED at ${location}: stuck between [${pattern}]`);
              }
            }
          }

          // Also detect if we're visiting the same beat repeatedly
          if (win.__beatLog.length >= 6) {
            const recent6 = win.__beatLog.slice(-6).map(b => b.beat);
            const beatCounts = {};
            recent6.forEach(b => {
              beatCounts[b] = (beatCounts[b] || 0) + 1;
            });

            const maxVisits = Math.max(...Object.values(beatCounts));
            if (maxVisits >= 3) {
              const repeatedBeat = Object.entries(beatCounts).find(([_, count]) => count >= 3)?.[0];
              console.log(`🔄 [${elapsed}s] Beat ${repeatedBeat} visited ${maxVisits} times in last 6 beats!`);
            }
          }
        }
      }, 50);

      console.log('[Monitor] Aggressive loop detection initialized');
    }, trackInfo.totalBeats);

    // Start playback
    console.log('\n▶️  Starting playback...');
    console.log('⏱️  Monitoring for 60 seconds (or until stopped)...\n');
    await page.click('button#play');
    await page.waitForTimeout(500);

    const monitorDuration = 60000;
    const checkInterval = 2000;

    for (let elapsed = 0; elapsed < monitorDuration; elapsed += checkInterval) {
      await page.waitForTimeout(checkInterval);

      const status = await page.evaluate(() => {
        const win = window as any;
        const driver = win.driver;
        const curBeat = driver?.curQ || 0;

        const isStart = curBeat < 50;
        const location = isStart ? '(START)' : '';

        return {
          running: driver?.running || false,
          currentBeat: curBeat,
          location,
          totalBeats: win.__beatLog.length,
          uniqueBeats: new Set(win.__beatLog.map((b: any) => b.beat)).size,
          loopWarnings: win.__loopWarnings.length,
          totalJumps: win.__jumpLog.length,
          recentBeats: win.__beatLog.slice(-8).map((b: any) => b.beat)
        };
      });

      const elapsedSec = (elapsed + checkInterval) / 1000;
      const uniqueRatio = `${status.uniqueBeats}/${status.totalBeats}`;
      const stuckIndicator = status.uniqueBeats < 20 && status.totalBeats > 30 ? '🔴 STUCK' : '';

      console.log(`[${elapsedSec}s] Beat: ${status.currentBeat} ${status.location}, Unique: ${uniqueRatio}, Jumps: ${status.totalJumps}, Warnings: ${status.loopWarnings} ${stuckIndicator}`);
      console.log(`      Recent: [${status.recentBeats.join(', ')}]`);

      if (!status.running) {
        console.log('\n⏹️  Playback stopped');
        break;
      }

      // If clearly stuck in loop, we have enough data
      if (status.loopWarnings >= 5 && status.uniqueBeats < 15 && elapsed > 10000) {
        console.log('\n⚠️  CLEARLY STUCK IN LOOP - Stopping early with sufficient evidence\n');
        break;
      }
    }

    // Final analysis
    console.log('\n\n📊 Final Analysis...\n');

    const analysis = await page.evaluate(() => {
      const win = window as any;
      const beatLog = win.__beatLog || [];
      const jumpLog = win.__jumpLog || [];
      const warnings = win.__loopWarnings || [];

      // Beat frequency
      const beatCounts = {};
      beatLog.forEach(entry => {
        beatCounts[entry.beat] = (beatCounts[entry.beat] || 0) + 1;
      });

      const mostVisited = Object.entries(beatCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([beat, count]) => ({ beat: parseInt(beat), count }));

      // Check for ping-pong pattern (A→B→A→B)
      const pingPongPatterns = [];
      for (let i = 0; i < beatLog.length - 3; i++) {
        const b1 = beatLog[i].beat;
        const b2 = beatLog[i+1].beat;
        const b3 = beatLog[i+2].beat;
        const b4 = beatLog[i+3].beat;

        if (b1 === b3 && b2 === b4 && b1 !== b2) {
          pingPongPatterns.push({
            beats: [b1, b2],
            startTime: beatLog[i].elapsed
          });
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
        maxBeatReached: beatLog.length > 0 ? Math.max(...beatLog.map(b => b.beat)) : 0,
        minBeatReached: beatLog.length > 0 ? Math.min(...beatLog.map(b => b.beat)) : 0,
        pingPongPatterns: pingPongPatterns.slice(0, 10),
        allJumps: jumpLog
      };
    });

    console.log('═'.repeat(70));
    console.log('MAN OF THE YEAR - LOOP ANALYSIS RESULTS');
    console.log('═'.repeat(70));

    console.log('\n📍 Playback Stats:');
    console.log(`  Total beats logged: ${analysis.totalBeats}`);
    console.log(`  Unique beats visited: ${analysis.uniqueBeats}`);
    console.log(`  Beat range: ${analysis.minBeatReached} - ${analysis.maxBeatReached} (out of ${trackInfo.totalBeats})`);
    console.log(`  Progression: ${((analysis.uniqueBeats / analysis.totalBeats) * 100).toFixed(1)}% unique`);

    console.log('\n🔀 Jump Analysis:');
    console.log(`  Total jumps: ${analysis.totalJumps}`);
    console.log(`    Forward jumps: ${analysis.forwardJumps.length}`);
    console.log(`    Backward jumps: ${analysis.backwardJumps.length}`);

    if (analysis.allJumps.length > 0) {
      console.log('\n  All jumps:');
      analysis.allJumps.slice(0, 20).forEach((jump: any, i: number) => {
        const arrow = jump.jump > 0 ? '⏩' : '↩️';
        console.log(`    ${arrow} [${i + 1}] At ${jump.time}s: ${jump.from} → ${jump.to} (Δ${jump.jump})`);
      });
      if (analysis.allJumps.length > 20) {
        console.log(`    ... and ${analysis.allJumps.length - 20} more jumps`);
      }
    }

    if (analysis.loopWarnings.length > 0) {
      console.log('\n⚠️  LOOP WARNINGS:');
      analysis.loopWarnings.forEach((warning: any, i: number) => {
        console.log(`  [${i + 1}] At ${warning.time}s (beat ${warning.beatNumber}) - ${warning.location}`);
        console.log(`      Stuck between: [${warning.pattern}]`);
      });
    }

    console.log('\n🔥 Most Revisited Beats:');
    analysis.mostVisited.slice(0, 15).forEach((item: any, i: number) => {
      const indicator = item.count > 10 ? '🔴' : item.count > 5 ? '⚠️ ' : item.count > 2 ? '⚡' : '  ';
      console.log(`  ${indicator}${i + 1}. Beat ${item.beat}: visited ${item.count} times`);
    });

    if (analysis.pingPongPatterns.length > 0) {
      console.log(`\n↔️  Ping-pong patterns detected: ${analysis.pingPongPatterns.length}`);
      analysis.pingPongPatterns.slice(0, 5).forEach((pattern: any, i: number) => {
        console.log(`  [${i + 1}] At ${pattern.startTime}s: oscillating ${pattern.beats[0]} ↔ ${pattern.beats[1]}`);
      });
    }

    console.log('\n' + '═'.repeat(70));

    // Final verdict
    const isStuck = analysis.uniqueBeats < 50 && analysis.totalBeats > 100;
    const hasLoops = analysis.loopWarnings.length > 0;
    const hasExcessiveBackwardJumps = analysis.backwardJumps.length > 10;
    const hasExcessiveRevisits = analysis.mostVisited[0]?.count > 5;

    if (isStuck || hasLoops || hasExcessiveBackwardJumps || hasExcessiveRevisits) {
      console.log('❌ LOOPING CONFIRMED!');
      console.log('\nEvidence:');
      if (isStuck) {
        console.log(`  🔴 STUCK: Only ${analysis.uniqueBeats} unique beats out of ${analysis.totalBeats} total (${((analysis.uniqueBeats / analysis.totalBeats) * 100).toFixed(1)}%)`);
      }
      if (hasLoops) {
        console.log(`  ⚠️  ${analysis.loopWarnings.length} explicit loop warnings detected`);
      }
      if (hasExcessiveBackwardJumps) {
        console.log(`  ↩️  ${analysis.backwardJumps.length} backward jumps (indicates oscillation)`);
      }
      if (hasExcessiveRevisits) {
        console.log(`  🔄 Beat ${analysis.mostVisited[0].beat} visited ${analysis.mostVisited[0].count} times`);
      }
    } else {
      console.log('✅ No significant looping detected');
    }

    // Save log
    const outputPath = path.resolve('artifacts/canonizer-man-of-the-year-loop.json');
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
    console.log('\n💾 Full log saved:', outputPath);

    await page.screenshot({ path: 'artifacts/canonizer-man-of-the-year-loop.png', fullPage: true });
    console.log('📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
