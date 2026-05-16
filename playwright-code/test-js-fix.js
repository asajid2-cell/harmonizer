const { chromium, devices } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({
        ...devices['iPhone SE'],
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
    });

    const page = await context.newPage();

    // Listen for console logs
    page.on('console', msg => console.log('[Browser]', msg.text()));

    console.log('\n🧪 Testing Index Page with JavaScript Fix...\n');
    await page.goto('http://localhost:5000/index.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for JS to run

    // Check for overflow
    const overflowElements = await page.evaluate(() => {
        const overflowing = [];
        const viewport = window.innerWidth;

        document.querySelectorAll('*').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > viewport) {
                overflowing.push({
                    tag: el.tagName,
                    class: el.className,
                    width: rect.width,
                    viewport: viewport
                });
            }
        });

        return overflowing;
    });

    console.log('\n📊 Index Page Results:');
    console.log('   Viewport Width:', 375);
    console.log('   Overflowing Elements:', overflowElements.length);
    if (overflowElements.length > 0) {
        console.log('   ❌ FAILED - Still has overflow:');
        overflowElements.slice(0, 5).forEach(el => {
            console.log(`      - ${el.tag}.${el.class}: ${el.width}px`);
        });
    } else {
        console.log('   ✅ PASSED - No overflow detected!');
    }

    await page.screenshot({ path: 'playwright-code/test-index-js-fix.png', fullPage: true });

    console.log('\n🧪 Testing OurSpace Page with JavaScript Fix...\n');
    await page.goto('http://localhost:5000/ourspace.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const ourspaceOverflow = await page.evaluate(() => {
        const overflowing = [];
        const viewport = window.innerWidth;

        document.querySelectorAll('*').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > viewport) {
                overflowing.push({
                    tag: el.tagName,
                    class: el.className,
                    id: el.id,
                    width: rect.width,
                    viewport: viewport
                });
            }
        });

        return overflowing;
    });

    console.log('\n📊 OurSpace Page Results:');
    console.log('   Viewport Width:', 375);
    console.log('   Overflowing Elements:', ourspaceOverflow.length);
    if (ourspaceOverflow.length > 0) {
        console.log('   ❌ FAILED - Still has overflow:');
        ourspaceOverflow.slice(0, 5).forEach(el => {
            console.log(`      - ${el.tag}${el.id ? '#' + el.id : ''}.${el.class}: ${el.width}px`);
        });
    } else {
        console.log('   ✅ PASSED - No overflow detected!');
    }

    await page.screenshot({ path: 'playwright-code/test-ourspace-js-fix.png', fullPage: true });

    console.log('\n🧪 Testing Eldrichify Page with JavaScript Fix...\n');
    await page.goto('http://localhost:5000/eldrichify.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const eldrichifyOverflow = await page.evaluate(() => {
        const overflowing = [];
        const viewport = window.innerWidth;

        document.querySelectorAll('*').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > viewport) {
                overflowing.push({
                    tag: el.tagName,
                    class: el.className,
                    id: el.id,
                    width: rect.width,
                    viewport: viewport
                });
            }
        });

        return overflowing;
    });

    console.log('\n📊 Eldrichify Page Results:');
    console.log('   Viewport Width:', 375);
    console.log('   Overflowing Elements:', eldrichifyOverflow.length);
    if (eldrichifyOverflow.length > 0) {
        console.log('   ❌ FAILED - Still has overflow:');
        eldrichifyOverflow.slice(0, 5).forEach(el => {
            console.log(`      - ${el.tag}${el.id ? '#' + el.id : ''}.${el.class}: ${el.width}px`);
        });
    } else {
        console.log('   ✅ PASSED - No overflow detected!');
    }

    await page.screenshot({ path: 'playwright-code/test-eldrichify-js-fix.png', fullPage: true });

    console.log('\n\n🎯 FINAL SUMMARY:');
    console.log('   Index:', overflowElements.length === 0 ? '✅ PASS' : '❌ FAIL');
    console.log('   OurSpace:', ourspaceOverflow.length === 0 ? '✅ PASS' : '❌ FAIL');
    console.log('   Eldrichify:', eldrichifyOverflow.length === 0 ? '✅ PASS' : '❌ FAIL');

    await browser.close();
})();
