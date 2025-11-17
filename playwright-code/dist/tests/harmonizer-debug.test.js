import { chromium } from 'playwright';
(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    console.log('🔍 Starting Harmonizer debug session...\n');
    try {
        // Navigate to harmonizer
        await page.goto('http://localhost:4000/harmonizer.html');
        await page.waitForLoadState('networkidle');
        console.log('✓ Page loaded');
        // Check main elements
        const title = await page.locator('h1').textContent();
        console.log('Page title:', title);
        // Check for visualizer canvas
        const canvasCount = await page.locator('canvas').count();
        const svgCount = await page.locator('svg').count();
        console.log(`\n📊 Visualizer elements: ${canvasCount} canvas, ${svgCount} SVG`);
        // Check canvas rendering
        const canvasInfo = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            if (!canvas)
                return { exists: false };
            const ctx = canvas.getContext('2d');
            if (!ctx)
                return { exists: true, hasContext: false };
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hasContent = Array.from(imageData.data).some(val => val !== 0);
            return {
                exists: true,
                hasContext: true,
                width: canvas.width,
                height: canvas.height,
                hasContent,
                classList: canvas.className
            };
        });
        console.log('Canvas state:', canvasInfo);
        // Check for JavaScript errors
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });
        page.on('pageerror', error => {
            errors.push(error.message);
        });
        // Check window objects
        const windowObjects = await page.evaluate(() => {
            return {
                hasVisualizer: typeof window.visualizer !== 'undefined',
                hasHarmonizerApp: typeof window.HarmonizerApp !== 'undefined',
                hasCanvasVisualizer: typeof window.CanvasVisualizer !== 'undefined',
                hasModeManager: typeof window.ModeManager !== 'undefined',
                windowKeys: Object.keys(window).filter(k => k.toLowerCase().includes('visual') || k.toLowerCase().includes('harmon') || k.toLowerCase().includes('canon'))
            };
        });
        console.log('\n🔧 Window objects:', windowObjects);
        // Check audio elements
        const audioCount = await page.locator('audio').count();
        console.log(`\n🔊 Audio elements: ${audioCount}`);
        // Check for upload form
        const uploadElements = await page.evaluate(() => {
            const fileInput = document.querySelector('input[type="file"]');
            const forms = document.querySelectorAll('form');
            const algorithmInputs = document.querySelectorAll('input[name="algorithm"], select[name="algorithm"]');
            return {
                hasFileInput: !!fileInput,
                formCount: forms.length,
                algorithmInputCount: algorithmInputs.length,
                fileInputId: fileInput?.id || 'none',
                fileInputName: fileInput?.getAttribute('name') || 'none'
            };
        });
        console.log('\n📤 Upload form:', uploadElements);
        // Take screenshot
        await page.screenshot({
            path: 'playwright-code/artifacts/harmonizer-debug.png',
            fullPage: true
        });
        console.log('\n📸 Screenshot saved to artifacts/harmonizer-debug.png');
        // Check for mode-specific UI
        const modeUI = await page.evaluate(() => {
            const body = document.body;
            return {
                bodyClasses: body.className,
                dataMode: body.getAttribute('data-mode'),
                stateClass: Array.from(body.classList).find(c => c.startsWith('state-'))
            };
        });
        console.log('\n🎛️ Mode state:', modeUI);
        if (errors.length > 0) {
            console.log('\n❌ JavaScript errors detected:');
            errors.forEach(err => console.log('  -', err));
        }
        else {
            console.log('\n✅ No JavaScript errors detected');
        }
        // Wait a bit to see the page
        await page.waitForTimeout(3000);
    }
    catch (error) {
        console.error('❌ Test failed:', error);
    }
    finally {
        await browser.close();
        console.log('\n✅ Debug session complete');
    }
})();
