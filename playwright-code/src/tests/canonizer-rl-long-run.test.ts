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

  console.log('🔍 Long-Duration RL Mode Analysis - Waiting to Reach End\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=canon');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const trackInfo = await page.evaluate(() => {
      const win = window as any;
      return {
        title: win.currentTrack?.title || 'Unknown',
        totalBeats: win.masterQs?.length || 0,
        duration: win.audioElement?.duration || 0
      };
    });

    console.log('Track:', trackInfo.title);
    console.log('Total beats:', trackInfo.totalBeats);
    console.log('Track duration:', Math.round(trackInfo.duration), 'seconds');
    console.log('End region: beats', trackInfo.totalBeats - 20, 'to', trackInfo.totalBeats);

    // Enable RL
    console.log('\n🤖 Enabling RL Model...');
    await page.click('button:has-text("NO RL")');
    await page.waitForTimeout(500);

    // Set up comprehensive monitoring
    await page.evaluate((totalBeats) => {
      const win = window as any;
      win.__beatLog = [];
      win.__startTime = Date.now();
      win.__totalBeats = totalBeats;
      win.__loopWarnings = [];
      win.__endRegionStart = totalBeats - 20;
      win.__reachedEnd = false;

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

          // Check if we've reached end region
          const isNearEnd = curBeat > win.__endRegionStart;
          if (isNearEnd && !win.__reachedEnd) {
            win.__reachedEnd = true;
            console.log(`🎯 [${elapsed}s] REACHED END REGION at beat ${curBeat}`);
          }

          // Monitor for loops in end region
          if (win.__beatLog.length > 8) {
            const recent8 = win.__beatLog.slice(-8).map(b => b.beat);
            const uniqueRecent = new Set(recent8);

            // If stuck oscillating between few beats
            if (uniqueRecent.size <= 4 && isNearEnd) {
              const pattern = Array.from(uniqueRecent).sort((a, b) => a - b).join(',');

              const alreadyWarned = win.__loopWarnings.some(
                w => w.pattern === pattern
              );

              if (!alreadyWarned) {
                win.__loopWarnings.push({
                  location: 'END',
                  pattern,
                  beats: Array.from(uniqueRecent),
                  time: parseFloat(elapsed),
                  beatNumber: curBeat
                });
                console.log(`⚠️  [${elapsed}s] LOOP DETECTED at beat ${curBeat}: oscillating between [${pattern}]`);
              }
            }
          }

          // Check for backward jumps
          if (lastBeat) {
            const jump = curBeat - lastBeat.beat;
            if (Math.abs(jump) > 2 && isNearEnd) {
              console.log(`🔀 [${elapsed}s] JUMP at END: ${lastBeat.beat} → ${curBeat} (Δ${jump})`);
            }
          }
        }
      }, 50);
    }, trackInfo.totalBeats);

    // Start playback
    console.log('\n▶️  Starting playback...');
    console.log('⏱️  Will monitor for up to 5 minutes or until end region loops detected\n');
    await page.click('button#play');
    await page.waitForTimeout(500);

    const maxDuration = 300000; // 5 minutes
    const checkInterval = 10000; // 10 seconds

    let reachedEnd = false;
    let endRegionMonitorTime = 0;

    for (let elapsed = 0; elapsed < maxDuration; elapsed += checkInterval) {
      await page.waitForTimeout(checkInterval);

      const status = await page.evaluate(() => {
        const win = window as any;
        const driver = win.driver;
        const curBeat = driver?.curQ || 0;
        const total = win.__totalBeats;

        const isStart = curBeat < 20;
        const isEnd = curBeat > total - 20;
        const location = isStart ? '(START)' : isEnd ? '(END)' : '';

        return {
          running: driver?.running || false,
          currentBeat: curBeat,
          location,
          totalBeats: win.__beatLog.length,
          loopWarnings: win.__loopWarnings.length,
          recentBeats: win.__beatLog.slice(-6).map((b: any) => b.beat),
          reachedEnd: win.__reachedEnd,
          uniqueBeats: new Set(win.__beatLog.map((b: any) => b.beat)).size
        };
      });

      const elapsedSec = (elapsed + checkInterval) / 1000;
      console.log(`[${elapsedSec}s] Beat: ${status.currentBeat} ${status.location}, Unique: ${status.uniqueBeats}/${status.totalBeats}, Warnings: ${status.loopWarnings}`);
      console.log(`      Recent: [${status.recentBeats.join(', ')}]`);

      // Track time in end region
      if (status.location === '(END)') {
        if (!reachedEnd) {
          reachedEnd = true;
          console.log(`\n✅ Reached end region! Will monitor for 60 more seconds...\n`);
        }
        endRegionMonitorTime += checkInterval;

        // If we've been in end region for 60 seconds, that's enough data
        if (endRegionMonitorTime >= 60000) {
          console.log(`\n✅ Monitored end region for 60 seconds. Stopping test.\n`);
          break;
        }
      }

      if (!status.running) {
        console.log('\n⏹️  Playback stopped');
        break;
      }

      // Early exit if loops detected in end region
      if (status.loopWarnings > 0 && status.location === '(END)') {
        console.log(`\n⚠️  Loop warnings detected in end region. Continuing to monitor...\n`);
      }
    }

    // Final analysis
    console.log('\n\n📊 Final Analysis...\n');

    const analysis = await page.evaluate(() => {
      const win = window as any;
      const beatLog = win.__beatLog || [];
      const warnings = win.__loopWarnings || [];
      const total = win.__totalBeats;
      const endRegionStart = total - 20;

      // Count region visits
      const startRegionVisits = beatLog.filter(b => b.beat < 20).length;
      const endRegionVisits = beatLog.filter(b => b.beat > endRegionStart).length;
      const middleVisits = beatLog.filter(b => b.beat >= 20 && b.beat <= endRegionStart).length;

      // Find backward jumps in end region
      const endRegionJumps = [];
      for (let i = 1; i < beatLog.length; i++) {
        if (beatLog[i].beat > endRegionStart) {
          const jump = beatLog[i].beat - beatLog[i-1].beat;
          if (Math.abs(jump) > 2) {
            endRegionJumps.push({
              from: beatLog[i-1].beat,
              to: beatLog[i].beat,
              jump,
              time: beatLog[i].elapsed
            });
          }
        }
      }

      // Beat visit frequency
      const beatCounts = {};
      beatLog.forEach(entry => {
        beatCounts[entry.beat] = (beatCounts[entry.beat] || 0) + 1;
      });

      const mostVisited = Object.entries(beatCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([beat, count]) => ({ beat: parseInt(beat), count }));

      return {
        totalBeats: beatLog.length,
        uniqueBeats: new Set(beatLog.map(b => b.beat)).size,
        startRegionVisits,
        middleVisits,
        endRegionVisits,
        loopWarnings: warnings,
        endRegionJumps,
        mostVisited,
        firstBeat: beatLog[0]?.beat,
        lastBeat: beatLog[beatLog.length - 1]?.beat,
        maxBeatReached: Math.max(...beatLog.map(b => b.beat))
      };
    });

    console.log('═'.repeat(70));
    console.log('LONG-DURATION ANALYSIS RESULTS');
    console.log('═'.repeat(70));

    console.log('\n📍 Beat Coverage:');
    console.log(`  First beat: ${analysis.firstBeat}`);
    console.log(`  Last beat: ${analysis.lastBeat}`);
    console.log(`  Max beat reached: ${analysis.maxBeatReached} / ${trackInfo.totalBeats}`);
    console.log(`  Total beats logged: ${analysis.totalBeats}`);
    console.log(`  Unique beats visited: ${analysis.uniqueBeats}`);
    console.log(`  Start region (0-19) visits: ${analysis.startRegionVisits}`);
    console.log(`  Middle region visits: ${analysis.middleVisits}`);
    console.log(`  End region (${trackInfo.totalBeats - 20}-${trackInfo.totalBeats}) visits: ${analysis.endRegionVisits}`);

    if (analysis.endRegionVisits > 0) {
      console.log('\n🎯 End Region Behavior:');
      console.log(`  Total visits to end region: ${analysis.endRegionVisits}`);
      console.log(`  Jumps in end region: ${analysis.endRegionJumps.length}`);

      if (analysis.endRegionJumps.length > 0) {
        console.log('\n  Jump details:');
        analysis.endRegionJumps.slice(0, 10).forEach((jump: any, i: number) => {
          console.log(`    [${i + 1}] At ${jump.time}s: ${jump.from} → ${jump.to} (Δ${jump.jump})`);
        });
      }
    } else {
      console.log('\n⚠️  Never reached end region during test');
    }

    if (analysis.loopWarnings.length > 0) {
      console.log('\n⚠️  LOOP WARNINGS:');
      analysis.loopWarnings.forEach((warning: any, i: number) => {
        console.log(`  [${i + 1}] At ${warning.time}s (beat ${warning.beatNumber}) - ${warning.location}`);
        console.log(`      Oscillating between: [${warning.pattern}]`);
      });
    } else {
      console.log('\n✅ No loop warnings detected');
    }

    console.log('\n🔥 Most Revisited Beats:');
    analysis.mostVisited.forEach((item: any, i: number) => {
      console.log(`  ${i + 1}. Beat ${item.beat}: visited ${item.count} times`);
    });

    console.log('\n' + '═'.repeat(70));

    if (analysis.endRegionVisits === 0) {
      console.log('❓ INCONCLUSIVE: Never reached end region to test for loops');
    } else if (analysis.loopWarnings.length > 0) {
      console.log('❌ CONFIRMED: RL mode getting stuck in loops at end region');
    } else {
      console.log('✅ No looping issues detected in end region');
    }

    // Save log
    const outputPath = path.resolve('artifacts/canonizer-rl-long-run.json');
    const fullLog = await page.evaluate(() => {
      const win = window as any;
      return {
        beatLog: win.__beatLog,
        loopWarnings: win.__loopWarnings
      };
    });

    fs.writeFileSync(outputPath, JSON.stringify(fullLog, null, 2));
    console.log('\n💾 Log saved:', outputPath);

    await page.screenshot({ path: 'artifacts/canonizer-rl-long-run.png', fullPage: true });
    console.log('📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
