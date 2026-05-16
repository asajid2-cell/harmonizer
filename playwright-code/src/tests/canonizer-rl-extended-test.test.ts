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

  console.log('🔍 Extended Canon RL Analysis - Testing for End/Beginning Loops\n');

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

    // Enable RL
    console.log('\n🤖 Enabling RL Model...');
    await page.click('button:has-text("NO RL")');
    await page.waitForTimeout(500);

    // Set up monitoring with focus on beginning/end detection
    await page.evaluate((totalBeats) => {
      const win = window as any;
      win.__beatLog = [];
      win.__startTime = Date.now();
      win.__totalBeats = totalBeats;
      win.__loopWarnings = [];

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

          // Check for loops at extremes
          const isNearStart = curBeat < 20;
          const isNearEnd = curBeat > win.__totalBeats - 20;

          if (win.__beatLog.length > 10) {
            const recent10 = win.__beatLog.slice(-10).map(b => b.beat);
            const uniqueRecent = new Set(recent10);

            // If stuck oscillating between few beats near start/end
            if (uniqueRecent.size <= 4 && (isNearStart || isNearEnd)) {
              const location = isNearStart ? 'START' : 'END';
              const pattern = Array.from(uniqueRecent).sort((a, b) => a - b).join(',');

              const alreadyWarned = win.__loopWarnings.some(
                w => w.pattern === pattern && w.location === location
              );

              if (!alreadyWarned) {
                win.__loopWarnings.push({
                  location,
                  pattern,
                  beats: Array.from(uniqueRecent),
                  time: parseFloat(elapsed)
                });
                console.log(`⚠️  [${elapsed}s] LOOP at ${location}: oscillating between [${pattern}]`);
              }
            }
          }
        }
      }, 50);
    }, trackInfo.totalBeats);

    // Start playback
    console.log('\n▶️  Starting playback...');
    console.log('⏱️  Monitoring for 60 seconds (or until stopped)...\n');
    await page.click('button#play');
    await page.waitForTimeout(500);

    const monitorDuration = 60000;
    const checkInterval = 5000;

    for (let elapsed = 0; elapsed < monitorDuration; elapsed += checkInterval) {
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
          recentBeats: win.__beatLog.slice(-8).map((b: any) => b.beat)
        };
      });

      console.log(`[${(elapsed / 1000) + 5}s] Beat: ${status.currentBeat} ${status.location}, Logged: ${status.totalBeats}, Warnings: ${status.loopWarnings}`);
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

      // Count visits to start/end regions
      const startRegionVisits = beatLog.filter(b => b.beat < 20).length;
      const endRegionVisits = beatLog.filter(b => b.beat > total - 20).length;
      const middleVisits = beatLog.filter(b => b.beat >= 20 && b.beat <= total - 20).length;

      // Find longest repeated sequence
      let maxRepeatLength = 0;
      let maxRepeatPattern = [];

      for (let len = 3; len <= 10; len++) {
        for (let i = 0; i < beatLog.length - len * 2; i++) {
          const pattern1 = beatLog.slice(i, i + len).map(b => b.beat).join(',');
          const pattern2 = beatLog.slice(i + len, i + len * 2).map(b => b.beat).join(',');

          if (pattern1 === pattern2 && len > maxRepeatLength) {
            maxRepeatLength = len;
            maxRepeatPattern = beatLog.slice(i, i + len).map(b => b.beat);
          }
        }
      }

      return {
        totalBeats: beatLog.length,
        startRegionVisits,
        endRegionVisits,
        middleVisits,
        loopWarnings: warnings,
        maxRepeatLength,
        maxRepeatPattern,
        firstBeat: beatLog[0]?.beat,
        lastBeat: beatLog[beatLog.length - 1]?.beat
      };
    });

    console.log('═'.repeat(70));
    console.log('EXTENDED ANALYSIS RESULTS');
    console.log('═'.repeat(70));

    console.log('\n📍 Beat Coverage:');
    console.log(`  First beat: ${analysis.firstBeat}`);
    console.log(`  Last beat: ${analysis.lastBeat}`);
    console.log(`  Total beats logged: ${analysis.totalBeats}`);
    console.log(`  Start region (0-19) visits: ${analysis.startRegionVisits}`);
    console.log(`  Middle region visits: ${analysis.middleVisits}`);
    console.log(`  End region (${trackInfo.totalBeats - 20}-${trackInfo.totalBeats}) visits: ${analysis.endRegionVisits}`);

    if (analysis.loopWarnings.length > 0) {
      console.log('\n⚠️  LOOP WARNINGS DETECTED:');
      analysis.loopWarnings.forEach((warning: any, i: number) => {
        console.log(`  [${i + 1}] At ${warning.time}s - ${warning.location}`);
        console.log(`      Oscillating between: [${warning.pattern}]`);
      });
    } else {
      console.log('\n✅ No loop warnings at start/end regions');
    }

    if (analysis.maxRepeatLength > 0) {
      console.log('\n🔁 Longest Repeated Sequence:');
      console.log(`  Length: ${analysis.maxRepeatLength} beats`);
      console.log(`  Pattern: [${analysis.maxRepeatPattern.join(', ')}]`);
    }

    console.log('\n' + '═'.repeat(70));

    if (analysis.loopWarnings.length > 0) {
      console.log('❌ CONFIRMED: RL mode getting stuck in loops at extremes');
    } else {
      console.log('✅ No looping issues detected in this run');
    }

    // Save log
    const outputPath = path.resolve('artifacts/canonizer-rl-extended-test.json');
    const fullLog = await page.evaluate(() => {
      const win = window as any;
      return {
        beatLog: win.__beatLog,
        loopWarnings: win.__loopWarnings
      };
    });

    fs.writeFileSync(outputPath, JSON.stringify(fullLog, null, 2));
    console.log('\n💾 Log saved:', outputPath);

    await page.screenshot({ path: 'artifacts/canonizer-rl-extended-test.png', fullPage: true });
    console.log('📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
