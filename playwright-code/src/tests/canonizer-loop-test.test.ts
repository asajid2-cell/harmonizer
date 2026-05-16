import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1920,1080']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  console.log('🔄 Testing Canonizer Loop Functionality\n');

  try {
    // Navigate to Canonizer mode
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR4C61EE96C2&mode=canon');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('✓ Loaded Canonizer page');

    // Check that loop toggle exists
    const loopToggle = await page.$('#loop-playback-toggle');
    if (!loopToggle) {
      console.error('❌ Loop toggle not found!');
      await browser.close();
      return;
    }

    console.log('✓ Loop toggle found');

    // Verify loop toggle is initially unchecked
    const initiallyChecked = await page.isChecked('#loop-playback-toggle');
    console.log(`  Initial state: ${initiallyChecked ? 'Checked' : 'Unchecked'}`);

    // Take screenshot of UI with loop toggle
    await page.screenshot({ path: 'artifacts/canonizer-loop-toggle-initial.png', fullPage: false });
    console.log('📸 Screenshot: loop toggle initial state');

    // Check loop toggle
    await page.check('#loop-playback-toggle');
    await page.waitForTimeout(500);

    const checkedState = await page.isChecked('#loop-playback-toggle');
    console.log(`  After check: ${checkedState ? 'Checked ✓' : 'Unchecked ✗'}`);

    // Verify audio loop is enabled in the audio player
    const audioLoopEnabled = await page.evaluate(() => {
      // Check HTML5 audio elements
      const audioElements = document.querySelectorAll('audio');
      if (audioElements.length > 0) {
        return audioElements[0].loop;
      }
      // Fallback to player objects
      if (window.queuePlayer && typeof window.queuePlayer.getLoop === 'function') {
        return window.queuePlayer.getLoop();
      }
      if (window.previewPlayer && typeof window.previewPlayer.getLoop === 'function') {
        return window.previewPlayer.getLoop();
      }
      return null;
    });

    console.log(`  Audio loop property: ${audioLoopEnabled === true ? 'Enabled ✓' : audioLoopEnabled === false ? 'Disabled ✗' : 'Unknown'}`);

    // Take screenshot after enabling
    await page.screenshot({ path: 'artifacts/canonizer-loop-toggle-enabled.png', fullPage: false });
    console.log('📸 Screenshot: loop toggle enabled');

    // Uncheck to test toggle off
    await page.uncheck('#loop-playback-toggle');
    await page.waitForTimeout(500);

    const uncheckedState = await page.isChecked('#loop-playback-toggle');
    console.log(`  After uncheck: ${uncheckedState ? 'Checked ✗' : 'Unchecked ✓'}`);

    const audioLoopDisabled = await page.evaluate(() => {
      // Check HTML5 audio elements
      const audioElements = document.querySelectorAll('audio');
      if (audioElements.length > 0) {
        return audioElements[0].loop;
      }
      // Fallback to player objects
      if (window.queuePlayer && typeof window.queuePlayer.getLoop === 'function') {
        return window.queuePlayer.getLoop();
      }
      if (window.previewPlayer && typeof window.previewPlayer.getLoop === 'function') {
        return window.previewPlayer.getLoop();
      }
      return null;
    });

    console.log(`  Audio loop property: ${audioLoopDisabled === false ? 'Disabled ✓' : audioLoopDisabled === true ? 'Enabled ✗' : 'Unknown'}`);

    // Final verification
    console.log('\n' + '='.repeat(70));
    if (checkedState && audioLoopEnabled === true && !uncheckedState && audioLoopDisabled === false) {
      console.log('✅ SUCCESS - Loop toggle works correctly!');
      console.log('   • Toggle UI responds to clicks');
      console.log('   • Audio loop property syncs with checkbox');
      console.log('   • Can enable and disable looping');
    } else {
      console.log('❌ ISSUE - Loop toggle has problems');
      if (!checkedState) console.log('   • Checkbox did not check properly');
      if (audioLoopEnabled !== true) console.log('   • Audio loop not enabled when checked');
      if (uncheckedState) console.log('   • Checkbox did not uncheck properly');
      if (audioLoopDisabled !== false) console.log('   • Audio loop not disabled when unchecked');
    }
    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
  }
})();
