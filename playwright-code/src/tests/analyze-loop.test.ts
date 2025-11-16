import { readdir } from 'fs/promises';
import path from 'path';
import { session } from '../runtime/session.js';
import { navigate } from '../api/playwright/navigate.js';
import { screenshot } from '../api/playwright/screenshot.js';
import { analyzeScreenshot, compareScreenshots, generateReport } from '../analysis/screenshot-analyzer.js';
import { pathToFileURL } from 'url';

/**
 * Screenshot Analysis Loop
 *
 * This test continuously captures screenshots and analyzes them for UI issues.
 * Perfect for iterative design improvements!
 */

async function analyzeLoop() {
  console.log('🚀 Starting Screenshot Analysis Loop...\n');

  const filePath = path.resolve('../final-exam/dist/index.html');
  const url = pathToFileURL(filePath).href;

  let previousScreenshot: string | null = null;
  let iteration = 1;

  // Test configurations to cycle through
  const configurations = [
    { name: 'Desktop', device: 'desktop' as const },
    { name: 'Mobile', device: 'mobile' as const },
    { name: 'Tablet', device: 'tablet' as const },
    { name: 'iPhone 12 Pro', device: 'iPhone 12 Pro' as const },
    { name: 'Pixel 5', device: 'Pixel 5' as const },
  ];

  for (const config of configurations) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📱 ITERATION ${iteration}: ${config.name}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Set device type
    session.setDeviceType(config.device);

    // Navigate to the page
    console.log(`🌐 Loading ${url}...`);
    await navigate({ url });

    // Wait for content to load
    const page = await session.getPage();
    await page.waitForTimeout(2000);

    // Interact with the page (add widgets if empty)
    try {
      const addChartButton = page.locator('[data-test="add-chart"]');
      if (await addChartButton.isVisible()) {
        console.log('  ➕ Adding chart widget...');
        await addChartButton.click();
        await page.waitForTimeout(500);
      }

      const addTableButton = page.locator('[data-test="add-table"]');
      if (await addTableButton.isVisible()) {
        console.log('  ➕ Adding table widget...');
        await addTableButton.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.log('  ⚠️  Could not interact with widgets (this is okay)');
    }

    // Take screenshot
    console.log('📸 Capturing screenshot...');
    const screenshotPath = await screenshot({
      label: `analysis-${config.name.toLowerCase().replace(/\s+/g, '-')}-iter${iteration}`,
      fullPage: true
    });

    console.log(`  ✓ Saved to: ${path.basename(screenshotPath)}\n`);

    // Analyze the screenshot
    console.log('🔍 Analyzing screenshot...');
    const analysis = await analyzeScreenshot(screenshotPath);

    // Generate and display report
    const report = generateReport(analysis);
    console.log(report);

    // Compare with previous if available
    if (previousScreenshot) {
      console.log('\n🔄 Comparing with previous screenshot...');
      const comparison = await compareScreenshots(previousScreenshot, screenshotPath);
      console.log(`  ${comparison.different ? '🔴' : '🟢'} ${comparison.message}`);
    }

    previousScreenshot = screenshotPath;

    // Reset context for next iteration
    await session.resetContext();

    iteration++;

    // Small delay between iterations
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✅ Analysis loop complete!\n');

  // Generate summary
  await generateSummary();
}

async function generateSummary() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('           📊 ANALYSIS SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  const screenshotsDir = path.resolve('artifacts/screenshots');

  try {
    const files = await readdir(screenshotsDir);
    const analysisScreenshots = files.filter(f => f.startsWith('analysis-') && f.endsWith('.png'));

    console.log(`Total screenshots analyzed: ${analysisScreenshots.length}`);
    console.log(`Location: ${screenshotsDir}\n`);

    console.log('📁 Screenshots captured:');
    analysisScreenshots.forEach((file, i) => {
      console.log(`  ${i + 1}. ${file}`);
    });

    console.log('\n💡 Next Steps:');
    console.log('  1. Review screenshots in artifacts/screenshots/');
    console.log('  2. Compare different device views');
    console.log('  3. Fix any issues identified in the reports');
    console.log('  4. Run the loop again to verify fixes\n');

  } catch (e) {
    console.log('Could not generate summary - check screenshots directory\n');
  }

  console.log('═══════════════════════════════════════════════════════\n');
}

async function main() {
  try {
    await analyzeLoop();
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exitCode = 1;
  } finally {
    await session.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
