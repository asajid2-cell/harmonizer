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

  console.log('🔍 Testing Model B (No RL) Default for Canonizer\n');

  try {
    // Clear localStorage to ensure fresh state
    await page.goto('http://localhost:4000/harmonizer.html');
    await page.evaluate(() => {
      localStorage.removeItem('RL_MODEL_VARIANT');
      localStorage.removeItem('RL_MODEL_VARIANT_SCHEMA');
    });

    console.log('✓ Cleared localStorage');

    // Navigate to Canonizer mode with fresh state
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR4C61EE96C2&mode=canon');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('✓ Loaded Canonizer page with fresh state');

    // Check which RL model button is active
    const modelButtons = await page.$$eval('.rl-model-btn', buttons =>
      buttons.map(btn => ({
        variant: btn.getAttribute('data-variant'),
        text: btn.textContent?.trim(),
        classes: btn.className
      }))
    );

    console.log('\n📊 RL Model Buttons:');
    modelButtons.forEach(btn => {
      const isActive = btn.classes.includes('active');
      console.log(`  [${btn.variant}] ${btn.text}: ${isActive ? '✓ ACTIVE' : '  inactive'}`);
    });

    // Get the active button
    const activeButton = await page.$('.rl-model-btn.active');
    const activeVariant = activeButton ? await activeButton.getAttribute('data-variant') : null;
    const activeText = activeButton ? await activeButton.textContent() : null;

    console.log(`\n🎯 Active Model: ${activeVariant} - "${activeText?.trim()}"`);

    // Check localStorage value
    const storedVariant = await page.evaluate(() => {
      return localStorage.getItem('RL_MODEL_VARIANT');
    });

    console.log(`💾 Stored in localStorage: ${storedVariant || '(none)'}`);

    // Check window.harmonizerModelVariant
    const windowVariant = await page.evaluate(() => {
      return (window as any).harmonizerModelVariant;
    });

    console.log(`🪟 window.harmonizerModelVariant: ${windowVariant || '(none)'}`);

    // Take screenshot
    await page.screenshot({ path: 'artifacts/canonizer-model-b-default.png', fullPage: false });
    console.log('\n📸 Screenshot saved: canonizer-model-b-default.png');

    // Verification
    console.log('\n' + '='.repeat(70));
    if (activeVariant === 'b' && activeText?.includes('No RL')) {
      console.log('✅ SUCCESS - Model B (No RL) is the default!');
      console.log('   • UI shows "No RL" button as active');
      console.log('   • data-variant="b" button is highlighted');
      console.log('   • User sees No RL by default on page load');
    } else if (activeVariant === 'a') {
      console.log('❌ FAILURE - Model A is active (should be Model B)');
      console.log('   • Expected: Model B (No RL) as default');
      console.log('   • Actual: Model A is active');
    } else {
      console.log('❌ FAILURE - No model button is active');
      console.log('   • Expected: Model B button with "active" class');
      console.log('   • Actual: No active button found');
    }
    console.log('='.repeat(70));

    // Test switching between models
    console.log('\n🔄 Testing Model Switching...');

    // Click Model A
    await page.click('.rl-model-btn[data-variant="a"]');
    await page.waitForTimeout(1000);

    const modelAActive = await page.$eval('.rl-model-btn[data-variant="a"]', btn =>
      btn.classList.contains('active')
    );
    console.log(`  Clicked Model A: ${modelAActive ? '✓ Active' : '✗ Not active'}`);

    await page.screenshot({ path: 'artifacts/canonizer-model-a-switched.png', fullPage: false });

    // Click back to Model B
    await page.click('.rl-model-btn[data-variant="b"]');
    await page.waitForTimeout(1000);

    const modelBActive = await page.$eval('.rl-model-btn[data-variant="b"]', btn =>
      btn.classList.contains('active')
    );
    console.log(`  Clicked Model B: ${modelBActive ? '✓ Active' : '✗ Not active'}`);

    await page.screenshot({ path: 'artifacts/canonizer-model-b-switched.png', fullPage: false });

    if (modelAActive && modelBActive) {
      console.log('\n✅ Model switching works correctly');
    } else {
      console.log('\n⚠️  Model switching may have issues');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
  }
})();
