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

  console.log('🔍 Analyzing Canonizer RL Mode - Loop Behavior\n');

  try {
    // Load in canon mode with RL
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=canon');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Get track info
    const trackInfo = await page.evaluate(() => {
      const win = window as any;
      const masterQs = win.masterQs;
      return {
        title: win.currentTrack?.title || 'Unknown',
        totalBeats: masterQs?.length || 0
      };
    });

    console.log('Track:', trackInfo.title);
    console.log('Total beats:', trackInfo.totalBeats);

    // Enable RL mode
    console.log('\n🤖 Enabling RL Model...');
    await page.click('button:has-text("NO RL")');
    await page.waitForTimeout(500);

    // Check which RL model is active
    const rlStatus = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const modelButton = buttons.find(b => b.textContent?.includes('MODEL'));
      return modelButton?.textContent?.trim() || 'Unknown';
    });
    console.log('RL Status:', rlStatus);

    // Set up comprehensive beat tracking
    await page.evaluate(() => {
      const win = window as any;
      win.__beatLog = [];
      win.__jumpLog = [];
      win.__loopDetection = {
        beatSequence: [],
        loops: []
      };
      win.__startTime = Date.now();

      // Monitor beat progression
      if (win.__beatMonitor) {
        clearInterval(win.__beatMonitor);
      }

      win.__beatMonitor = setInterval(() => {
        const driver = win.driver;
        const masterQs = win.masterQs;

        if (!driver || !masterQs) return;

        const curBeat = driver.curQ;
        if (typeof curBeat !== 'number' || curBeat < 0 || curBeat >= masterQs.length) return;

        const now = Date.now();
        const elapsed = ((now - win.__startTime) / 1000).toFixed(1);

        // Log beat
        const lastBeat = win.__beatLog.length > 0 ? win.__beatLog[win.__beatLog.length - 1] : null;

        if (!lastBeat || lastBeat.beat !== curBeat) {
          const entry = {
            beat: curBeat,
            timestamp: now,
            elapsed: parseFloat(elapsed),
            running: driver.running
          };

          win.__beatLog.push(entry);
          win.__loopDetection.beatSequence.push(curBeat);

          // Detect jumps
          if (lastBeat) {
            const distance = curBeat - lastBeat.beat;
            if (Math.abs(distance) > 2) {
              const jump = {
                from: lastBeat.beat,
                to: curBeat,
                distance,
                elapsed: parseFloat(elapsed)
              };
              win.__jumpLog.push(jump);
              console.log(`[JUMP @ ${elapsed}s] ${lastBeat.beat} → ${curBeat} (Δ${distance})`);
            }
          }

          // Detect loops (same sequence repeating)
          if (win.__loopDetection.beatSequence.length > 20) {
            const recent = win.__loopDetection.beatSequence.slice(-20);
            const pattern = recent.slice(0, 10).join(',');
            const next = recent.slice(10, 20).join(',');

            if (pattern === next) {
              const loop = {
                pattern: recent.slice(0, 10),
                detectedAt: parseFloat(elapsed),
                beatRange: `${recent[0]}-${recent[9]}`
              };

              const alreadyDetected = win.__loopDetection.loops.some(
                l => l.pattern.join(',') === loop.pattern.join(',')
              );

              if (!alreadyDetected) {
                win.__loopDetection.loops.push(loop);
                console.log(`[LOOP DETECTED @ ${elapsed}s] Repeating pattern: ${loop.beatRange}`);
              }
            }
          }
        }
      }, 50);

      console.log('[Setup] Beat monitor initialized');
    });

    // Start playback
    console.log('\n▶️  Starting playback...\n');
    await page.click('button#play');
    await page.waitForTimeout(500);

    // Monitor for 30 seconds
    console.log('⏱️  Monitoring for 30 seconds...\n');
    const monitorDuration = 30000;
    const checkInterval = 5000;

    for (let elapsed = 0; elapsed < monitorDuration; elapsed += checkInterval) {
      await page.waitForTimeout(checkInterval);

      const status = await page.evaluate(() => {
        const win = window as any;
        const driver = win.driver;

        return {
          running: driver?.running || false,
          currentBeat: driver?.curQ || 0,
          totalBeats: win.__beatLog.length,
          totalJumps: win.__jumpLog.length,
          loopsDetected: win.__loopDetection.loops.length,
          recentBeats: win.__beatLog.slice(-10).map((b: any) => b.beat)
        };
      });

      console.log(`[${(elapsed / 1000) + 5}s] Beat: ${status.currentBeat}, Logged: ${status.totalBeats}, Jumps: ${status.totalJumps}, Loops: ${status.loopsDetected}`);
      console.log(`      Recent beats: [${status.recentBeats.join(', ')}]`);

      if (!status.running) {
        console.log('\n⏹️  Playback stopped');
        break;
      }
    }

    // Collect final analysis
    console.log('\n\n📊 Collecting Analysis...\n');

    const analysis = await page.evaluate(() => {
      const win = window as any;
      const beatLog = win.__beatLog || [];
      const jumpLog = win.__jumpLog || [];
      const loops = win.__loopDetection.loops || [];

      // Analyze beat distribution
      const beatCounts: Record<number, number> = {};
      beatLog.forEach((entry: any) => {
        beatCounts[entry.beat] = (beatCounts[entry.beat] || 0) + 1;
      });

      const mostVisited = Object.entries(beatCounts)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 10)
        .map(([beat, count]) => ({ beat: parseInt(beat), count }));

      // Find stuck patterns
      const stuckPatterns = [];
      for (let i = 0; i < beatLog.length - 10; i++) {
        const window = beatLog.slice(i, i + 10).map((b: any) => b.beat);
        const unique = new Set(window);
        if (unique.size <= 3) {
          stuckPatterns.push({
            startTime: beatLog[i].elapsed,
            beats: Array.from(unique),
            duration: beatLog[i + 9].elapsed - beatLog[i].elapsed
          });
        }
      }

      return {
        totalBeats: beatLog.length,
        totalJumps: jumpLog.length,
        loopsDetected: loops.length,
        loops,
        mostVisited,
        stuckPatterns: stuckPatterns.slice(0, 5),
        jumpDistribution: {
          forward: jumpLog.filter((j: any) => j.distance > 0).length,
          backward: jumpLog.filter((j: any) => j.distance < 0).length
        },
        firstJump: jumpLog[0] || null,
        lastJump: jumpLog[jumpLog.length - 1] || null
      };
    });

    console.log('═'.repeat(70));
    console.log('ANALYSIS RESULTS');
    console.log('═'.repeat(70));

    console.log('\n📈 Beat Statistics:');
    console.log('  Total beats logged:', analysis.totalBeats);
    console.log('  Total jumps:', analysis.totalJumps);
    console.log('  Loops detected:', analysis.loopsDetected);

    console.log('\n🔄 Jump Distribution:');
    console.log('  Forward jumps:', analysis.jumpDistribution.forward);
    console.log('  Backward jumps:', analysis.jumpDistribution.backward);

    if (analysis.firstJump) {
      console.log('\n⏩ First Jump:');
      console.log(`  At ${analysis.firstJump.elapsed}s: ${analysis.firstJump.from} → ${analysis.firstJump.to} (Δ${analysis.firstJump.distance})`);
    }

    if (analysis.lastJump) {
      console.log('\n⏩ Last Jump:');
      console.log(`  At ${analysis.lastJump.elapsed}s: ${analysis.lastJump.from} → ${analysis.lastJump.to} (Δ${analysis.lastJump.distance})`);
    }

    console.log('\n🔥 Most Visited Beats:');
    analysis.mostVisited.forEach((item, i) => {
      console.log(`  ${i + 1}. Beat ${item.beat}: visited ${item.count} times`);
    });

    if (analysis.loops.length > 0) {
      console.log('\n🔁 Detected Loops:');
      analysis.loops.forEach((loop, i) => {
        console.log(`  [${i + 1}] At ${loop.detectedAt}s - Pattern: ${loop.beatRange}`);
        console.log(`      Beats: [${loop.pattern.join(', ')}]`);
      });
    }

    if (analysis.stuckPatterns.length > 0) {
      console.log('\n⚠️  Stuck Patterns (oscillating between few beats):');
      analysis.stuckPatterns.forEach((pattern, i) => {
        console.log(`  [${i + 1}] At ${pattern.startTime.toFixed(1)}s for ${pattern.duration.toFixed(1)}s`);
        console.log(`      Oscillating between: [${pattern.beats.join(', ')}]`);
      });
    }

    console.log('\n' + '═'.repeat(70));

    if (analysis.loopsDetected > 0 || analysis.stuckPatterns.length > 0) {
      console.log('❌ ISSUE DETECTED: RL mode getting stuck in loops');
    } else {
      console.log('✅ No obvious looping issues detected');
    }

    // Save detailed log
    const outputPath = path.resolve('artifacts/canonizer-rl-loop-analysis.json');
    const fullLog = await page.evaluate(() => {
      const win = window as any;
      return {
        beatLog: win.__beatLog,
        jumpLog: win.__jumpLog,
        loops: win.__loopDetection.loops
      };
    });

    fs.writeFileSync(outputPath, JSON.stringify(fullLog, null, 2));
    console.log('\n💾 Full log saved to:', outputPath);

    await page.screenshot({ path: 'artifacts/canonizer-rl-loop-analysis.png', fullPage: true });
    console.log('📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
