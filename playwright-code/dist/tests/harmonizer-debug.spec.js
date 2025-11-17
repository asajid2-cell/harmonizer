import { test, expect } from '@playwright/test';
test.describe('Harmonizer - Bug Investigation', () => {
    test.beforeEach(async ({ page }) => {
        // Start backend server and navigate to harmonizer
        await page.goto('http://localhost:4000/harmonizer.html');
        await page.waitForLoadState('networkidle');
    });
    test('should load harmonizer interface correctly', async ({ page }) => {
        // Check if main elements are present
        await expect(page.locator('h1')).toContainText('INFINITE LOOPS');
        await expect(page.locator('.hero-callouts')).toBeVisible();
        // Check for upload form
        const uploadForm = page.locator('form, .upload-section, [data-testid="upload"]');
        await expect(uploadForm.first()).toBeVisible({ timeout: 5000 });
    });
    test('should display visualizer canvas', async ({ page }) => {
        // Look for canvas or SVG visualizer elements
        const canvas = page.locator('canvas').first();
        const svg = page.locator('svg').first();
        const hasCanvas = await canvas.count() > 0;
        const hasSvg = await svg.count() > 0;
        expect(hasCanvas || hasSvg).toBeTruthy();
    });
    test('should handle file upload UI', async ({ page }) => {
        // Find file input
        const fileInput = page.locator('input[type="file"]').first();
        await expect(fileInput).toBeAttached();
        // Check if there's a submit button
        const submitButtons = page.locator('button[type="submit"], button:has-text("Upload"), button:has-text("Process")');
        expect(await submitButtons.count()).toBeGreaterThan(0);
    });
    test('should show mode selectors', async ({ page }) => {
        // Check for mode selection (canon, jukebox, eternal, autoharmonizer)
        const modeSelectors = page.locator('input[name="algorithm"], select[name="algorithm"], [data-mode]');
        expect(await modeSelectors.count()).toBeGreaterThan(0);
    });
    test('investigate visualizer initialization', async ({ page }) => {
        // Wait for any JavaScript to initialize
        await page.waitForTimeout(2000);
        // Check console for errors
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });
        page.on('pageerror', error => {
            errors.push(error.message);
        });
        // Check if visualizer object exists in window
        const visualizerExists = await page.evaluate(() => {
            return typeof window.visualizer !== 'undefined' ||
                typeof window.HarmonizerApp !== 'undefined' ||
                typeof window.CanvasVisualizer !== 'undefined';
        });
        console.log('Visualizer object exists:', visualizerExists);
        console.log('JavaScript errors:', errors);
        // Take screenshot for manual inspection
        await page.screenshot({ path: 'playwright-code/artifacts/harmonizer-initial-state.png', fullPage: true });
    });
    test('check for broken visualizer rendering', async ({ page }) => {
        // Check if canvas/SVG has actual content
        await page.waitForTimeout(1000);
        const canvasInfo = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            if (!canvas)
                return { exists: false };
            const ctx = canvas.getContext('2d');
            if (!ctx)
                return { exists: true, hasContext: false };
            // Check if canvas has been drawn on
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hasContent = Array.from(imageData.data).some(val => val !== 0);
            return {
                exists: true,
                hasContext: true,
                width: canvas.width,
                height: canvas.height,
                hasContent
            };
        });
        console.log('Canvas info:', canvasInfo);
    });
    test('test audio player integration', async ({ page }) => {
        // Check if audio element exists
        const audioElements = await page.locator('audio').count();
        console.log('Audio elements found:', audioElements);
        // Check for audio controls
        const playButton = page.locator('button:has-text("Play"), [aria-label*="play" i], .play-button');
        const pauseButton = page.locator('button:has-text("Pause"), [aria-label*="pause" i], .pause-button');
        console.log('Play buttons:', await playButton.count());
        console.log('Pause buttons:', await pauseButton.count());
    });
});
