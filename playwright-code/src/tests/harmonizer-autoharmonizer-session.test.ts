import { chromium } from 'playwright';

const TRACK_ID = 'TR2B5E84CAAA+TR87785B92A1';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const page = await browser.newPage();

  const consoleLog: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLog.push(text);
    if (
      text.includes('Autoharmonizer') ||
      text.includes('cross-track') ||
      text.toLowerCase().includes('error')
    ) {
      console.log(`[BROWSER] ${text}`);
    }
  });

  try {
    await page.goto(`http://localhost:4000/harmonizer.html?trid=${encodeURIComponent(TRACK_ID)}&mode=autoharmonizer`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const autoState = await page.evaluate(() => {
      const track = (window as any).curTrack;
      const analysis = track?.analysis;
      const ah = analysis?.autoharmonizer;
      return {
        hasTrack: !!track,
        hasAnalysis: !!analysis,
        hasAutoharmonizer: !!ah,
        trackKeys: track ? Object.keys(track) : [],
        analysisKeys: analysis ? Object.keys(analysis) : [],
        autoharmonizerKeys: ah ? Object.keys(ah) : [],
        track1Beats: ah?.track1?.beats?.length || 0,
        track2Beats: ah?.track2?.beats?.length || 0,
        crossMap1: Object.keys(ah?.cross_similarity?.track1_to_track2 || {}).length,
        crossMap2: Object.keys(ah?.cross_similarity?.track2_to_track1 || {}).length,
      };
    });
    console.log('Autoharmonizer data state:', autoState);

    await page.evaluate(() => {
      const win = window as any;
      if (win.__autoharmonizerInterval) {
        clearInterval(win.__autoharmonizerInterval);
      }
      win.__autoharmonizerLog = {
        samples: [] as any[],
        crossEvents: [] as any[],
      };
      win.__autoharmonizerInterval = setInterval(() => {
        const driver = win.driver;
        if (!driver || typeof driver.getState !== 'function') {
          return;
        }
        const state = driver.getState();
        if (!state || state.mode !== 'autoharmonizer') {
          return;
        }
        const entry = {
          ts: Date.now(),
          track: state.currentTrack,
          beat: state.currentBeat,
        };
        const log = win.__autoharmonizerLog;
        const prev = log.samples[log.samples.length - 1];
        if (!prev || prev.track !== entry.track || prev.beat !== entry.beat) {
          log.samples.push(entry);
          if (
            prev &&
            typeof prev.track === 'number' &&
            typeof entry.track === 'number' &&
            prev.track !== entry.track
          ) {
            log.crossEvents.push({
              ts: entry.ts,
              from: prev.track,
              to: entry.track,
            });
          }
        }
      }, 200);
    });

    await page.click('#play');
    await page.waitForTimeout(20000);

    const monitorData = await page.evaluate(() => {
      const win = window as any;
      if (win.__autoharmonizerInterval) {
        clearInterval(win.__autoharmonizerInterval);
        win.__autoharmonizerInterval = null;
      }
      const driver = (window as any).driver;
      const state = driver && typeof driver.getState === 'function' ? driver.getState() : null;
      const log = win.__autoharmonizerLog || { samples: [], crossEvents: [] };
      return {
        state,
        curBeat: driver?.curQ ?? null,
        running: driver?.running ?? null,
        currentTrack: state?.currentTrack ?? null,
        curBeatTrack: state?.currentBeat ?? null,
        sampleCount: log.samples.length,
        crossCount: log.crossEvents.length,
        firstSamples: log.samples.slice(0, 10),
        crossEvents: log.crossEvents.slice(0, 10),
      };
    });

    console.log('Driver state after session:', monitorData);
    console.log('Console log count:', consoleLog.length);

    await page.screenshot({
      path: 'playwright-code/artifacts/autoharmonizer-session.png',
      fullPage: true,
    });
  } catch (err) {
    console.error('❌ Autoharmonizer session failed:', err);
  } finally {
    await browser.close();
  }
})();
