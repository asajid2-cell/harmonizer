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

  console.log('🔍 Testing RL Mode at END Region - Looking for Loops\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=canon');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const trackInfo = await page.evaluate(() => {
      const win = window as any;
      return {
        title: win.currentTrack?.title || 'Unknown',
        totalBeats: win.masterQs?.length || 0
      };
    });

    console.log('Track:', trackInfo.title);
    console.log('Total beats:', trackInfo.totalBeats);
    console.log('End region: beats', trackInfo.totalBeats - 20, 'to', trackInfo.totalBeats);

    // Enable RL
    console.log('\n🤖 Enabling RL Model...');
    await page.click('button:has-text("NO RL")');
    await page.waitForTimeout(500);

    // Jump to end region using seek
    const targetBeat = trackInfo.totalBeats - 30; // Start 30 beats before end
    console.log('\n⏩ Jumping to beat', targetBeat, '(30 beats before end)...');

    await page.evaluate((beat) => {
      const win = window as any;
      if (win.driver && win.masterQs) {
        win.driver.curQ = beat;
        const timeMs = win.masterQs[beat];
        if (timeMs !== undefined && win.audioElement) {
          win.audioElement.currentTime = timeMs / 1000;
        }
      }
    }, targetBeat);

    await page.waitForTimeout(1000);

    // Set up end-region focused monitoring
    await page.evaluate((totalBeats) => {
      const win = window as any;
      win.__beatLog = [];
      win.__startTime = Date.now();
      win.__totalBeats = totalBeats;
      win.__loopWarnings = [];
      win.__endRegionStart = totalBeats - 20;

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

          // Check for end region loops with lower threshold
          const isNearEnd = curBeat > win.__endRegionStart;

          if (win.__beatLog.length > 6) {
            const recent6 = win.__beatLog.slice(-6).map(b => b.beat);
            const uniqueRecent = new Set(recent6);

            // If stuck oscillating between few beats near end
            if (uniqueRecent.size <= 3 && isNearEnd) {
              const pattern = Array.from(uniqueRecent).sort((a, b) => a - b).join(',');

              const alreadyWarned = win.__loopWarnings.some(
                w => w.pattern === pattern && w.location === 'END'
              );

              if (!alreadyWarned) {
                win.__loopWarnings.push({
                  location: 'END',
                  pattern,
                  beats: Array.from(uniqueRecent),
                  time: parseFloat(elapsed)
                });
                console.log(`⚠️  [${elapsed}s] LOOP at END: oscillating between [${pattern}]`);
              }
            }
          }

          // Also check for backward jumps near end
          if (lastBeat && isNearEnd) {
            const jump = curBeat - lastBeat.beat;
            if (jump < -2) {
              console.log(`↩️  [${elapsed}s] BACKWARD JUMP at END: ${lastBeat.beat} → ${curBeat} (Δ${jump})`);
            }
          }
        }
      }, 50);
    }, trackInfo.totalBeats);

    // Start playback
    console.log('\n▶️  Starting playback from end region...');
    console.log('⏱️  Monitoring for 60 seconds...\n');
    await page.click('button#play');
    await page.waitForTimeout(500);

    const monitorDuration = 60000;
    const checkInterval = 3000;

    for (let elapsed = 0; elapsed < monitorDuration; elapsed += checkInterval) {
      await page.waitForTimeout(checkInterval);

      const status = await page.evaluate(() => {
        const win = window as any;
        const driver = win.driver;
        const curBeat = driver?.curQ || 0;
        const total = win.__totalBeats;

        const isEnd = curBeat > total - 20;
        const location = isEnd ? '(END)' : '';

        return {
          running: driver?.running || false,
          currentBeat: curBeat,
          location,
          totalBeats: win.__beatLog.length,
          loopWarnings: win.__loopWarnings.length,
          recentBeats: win.__beatLog.slice(-8).map((b: any) => b.beat)
        };
      });

      console.log(`[${(elapsed / 1000) + 3}s] Beat: ${status.currentBeat} ${status.location}, Logged: ${status.totalBeats}, Warnings: ${status.loopWarnings}`);
      console.log(`      Recent: [${status.recentBeats.join(', ')}]`);

      if (!status.running) {
        console.log('\n⏹️  Playback stopped');
        break;
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

      // Count end region visits
      const endRegionVisits = beatLog.filter(b => b.beat > endRegionStart).length;
      const beforeEndVisits = beatLog.filter(b => b.beat <= endRegionStart).length;

      // Find repeated patterns
      const sequences = [];
      for (let i = 0; i < beatLog.length - 5; i++) {
        const seq = beatLog.slice(i, i + 5).map(b => b.beat).join(',');
        sequences.push(seq);
      }

      const repeatedSequences = sequences.filter((seq, i) =>
        sequences.indexOf(seq) !== i
      );

      // Find backward jumps
      const backwardJumps = [];
      for (let i = 1; i < beatLog.length; i++) {
        const jump = beatLog[i].beat - beatLog[i-1].beat;
        if (jump < -2) {
          backwardJumps.push({
            from: beatLog[i-1].beat,
            to: beatLog[i].beat,
            jump,
            time: beatLog[i].elapsed
          });
        }
      }

      return {
        totalBeats: beatLog.length,
        endRegionVisits,
        beforeEndVisits,
        loopWarnings: warnings,
        repeatedSequences: repeatedSequences.length,
        backwardJumps,
        firstBeat: beatLog[0]?.beat,
        lastBeat: beatLog[beatLog.length - 1]?.beat,
        uniqueBeatsVisited: new Set(beatLog.map(b => b.beat)).size
      };
    });

    console.log('═'.repeat(70));
    console.log('END REGION ANALYSIS RESULTS');
    console.log('═'.repeat(70));

    console.log('\n📍 Beat Coverage:');
    console.log(`  First beat: ${analysis.firstBeat}`);
    console.log(`  Last beat: ${analysis.lastBeat}`);
    console.log(`  Total beats logged: ${analysis.totalBeats}`);
    console.log(`  Unique beats visited: ${analysis.uniqueBeatsVisited}`);
    console.log(`  Before end region visits: ${analysis.beforeEndVisits}`);
    console.log(`  End region (${trackInfo.totalBeats - 20}-${trackInfo.totalBeats}) visits: ${analysis.endRegionVisits}`);

    if (analysis.backwardJumps.length > 0) {
      console.log('\n↩️  BACKWARD JUMPS DETECTED:');
      analysis.backwardJumps.slice(0, 10).forEach((jump: any, i: number) => {
        console.log(`  [${i + 1}] At ${jump.time}s: ${jump.from} → ${jump.to} (Δ${jump.jump})`);
      });
      if (analysis.backwardJumps.length > 10) {
        console.log(`  ... and ${analysis.backwardJumps.length - 10} more`);
      }
    }

    if (analysis.loopWarnings.length > 0) {
      console.log('\n⚠️  LOOP WARNINGS DETECTED:');
      analysis.loopWarnings.forEach((warning: any, i: number) => {
        console.log(`  [${i + 1}] At ${warning.time}s - ${warning.location}`);
        console.log(`      Oscillating between: [${warning.pattern}]`);
      });
    } else {
      console.log('\n✅ No loop warnings detected');
    }

    if (analysis.repeatedSequences > 0) {
      console.log(`\n🔁 Repeated sequences found: ${analysis.repeatedSequences}`);
    }

    console.log('\n' + '═'.repeat(70));

    if (analysis.loopWarnings.length > 0 || analysis.backwardJumps.length > 5) {
      console.log('❌ CONFIRMED: RL mode showing loop behavior at end region');
    } else {
      console.log('✅ No significant looping issues detected in end region');
    }

    // Save log
    const outputPath = path.resolve('artifacts/canonizer-rl-end-region-test.json');
    const fullLog = await page.evaluate(() => {
      const win = window as any;
      return {
        beatLog: win.__beatLog,
        loopWarnings: win.__loopWarnings
      };
    });

    fs.writeFileSync(outputPath, JSON.stringify(fullLog, null, 2));
    console.log('\n💾 Log saved:', outputPath);

    await page.screenshot({ path: 'artifacts/canonizer-rl-end-region-test.png', fullPage: true });
    console.log('📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
