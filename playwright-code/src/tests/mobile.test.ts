import { readFile } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { session } from '../runtime/session.js';
import { screenshot } from '../api/playwright/screenshot.js';
import { navigate } from '../api/playwright/navigate.js';

async function testMobileView() {
  console.log('Testing mobile responsiveness...\n');

  const filePath = path.resolve('../final-exam/dist/index.html');
  const url = pathToFileURL(filePath).href;

  // Test different mobile devices
  const devices = [
    { name: 'iPhone 12 Pro', type: 'iPhone 12 Pro' as const },
    { name: 'iPhone SE', type: 'iPhone SE' as const },
    { name: 'Pixel 5', type: 'Pixel 5' as const },
    { name: 'Galaxy S9+', type: 'Galaxy S9+' as const },
    { name: 'iPad Pro', type: 'tablet' as const },
  ];

  for (const device of devices) {
    console.log(`📱 Testing on ${device.name}...`);

    // Set device type
    session.setDeviceType(device.type);

    // Navigate to the page
    await navigate({ url });

    // Wait a bit for the page to render
    const page = await session.getPage();
    await page.waitForTimeout(1000);

    // Take screenshot
    const screenshotPath = await screenshot({
      label: `mobile-${device.name.toLowerCase().replace(/\s+/g, '-')}`,
      fullPage: true,
    });

    console.log(`   ✓ Screenshot saved: ${screenshotPath}`);

    // Reset context for next device
    await session.resetContext();
  }

  console.log('\n✅ Mobile testing complete!');
}

async function testCustomViewports() {
  console.log('\nTesting custom viewport sizes...\n');

  const filePath = path.resolve('../final-exam/dist/index.html');
  const url = pathToFileURL(filePath).href;

  const viewports = [
    { name: 'Small Mobile', width: 320, height: 568 },  // iPhone SE
    { name: 'Medium Mobile', width: 375, height: 667 }, // iPhone 8
    { name: 'Large Mobile', width: 414, height: 896 },  // iPhone 11 Pro Max
    { name: 'Small Tablet', width: 768, height: 1024 }, // iPad Mini
    { name: 'Desktop', width: 1920, height: 1080 },     // Full HD
  ];

  for (const viewport of viewports) {
    console.log(`🖥️  Testing ${viewport.name} (${viewport.width}x${viewport.height})...`);

    // Reset and create new context with custom viewport
    await session.resetContext();
    const page = await session.getPage();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await navigate({ url });
    await page.waitForTimeout(1000);

    const screenshotPath = await screenshot({
      label: `viewport-${viewport.name.toLowerCase().replace(/\s+/g, '-')}`,
      fullPage: true,
    });

    console.log(`   ✓ Screenshot saved: ${screenshotPath}`);
  }

  console.log('\n✅ Viewport testing complete!');
}

async function main() {
  try {
    await testMobileView();
    await testCustomViewports();
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exitCode = 1;
  } finally {
    await session.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
