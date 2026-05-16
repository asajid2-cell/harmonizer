import { chromium, devices } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: { width: 375, height: 667 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
    });

    const page = await context.newPage();

    // Listen for console logs
    page.on('console', msg => console.log('[Browser]', msg.text()));

    console.log('\n🔍 DEBUGGING INDEX PAGE OVERFLOW...\n');
    await page.goto('http://localhost:4000/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const indexOverflow = await page.evaluate(() => {
        const viewport = window.innerWidth;
        const overflowing = [];

        document.querySelectorAll('.retro-ascii-card, pre.retro-ascii-card').forEach(el => {
            const rect = el.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(el);

            overflowing.push({
                tag: el.tagName,
                class: el.className,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                scrollWidth: el.scrollWidth,
                viewport: viewport,
                fontSize: computedStyle.fontSize,
                transform: computedStyle.transform,
                maxWidth: computedStyle.maxWidth,
                overflow: computedStyle.overflow,
                boxSizing: computedStyle.boxSizing,
                isOverflowing: rect.right > viewport + 5 // Same as audit test
            });
        });

        return {
            viewport,
            cards: overflowing,
            bodyWidth: document.body.getBoundingClientRect().width,
            bodyScrollWidth: document.body.scrollWidth
        };
    });

    console.log('📊 INDEX PAGE ANALYSIS:');
    console.log('   Viewport:', indexOverflow.viewport);
    console.log('   Body Width:', indexOverflow.bodyWidth);
    console.log('   Body ScrollWidth:', indexOverflow.bodyScrollWidth);
    console.log('\n   ASCII Cards Found:', indexOverflow.cards.length);
    indexOverflow.cards.forEach((card, i) => {
        console.log(`\n   Card ${i + 1}:`);
        console.log(`      Left: ${card.left}px | Right: ${card.right}px (viewport: ${card.viewport}px)`);
        console.log(`      Width: ${card.width}px | ScrollWidth: ${card.scrollWidth}px`);
        console.log(`      Font Size: ${card.fontSize}`);
        console.log(`      Transform: ${card.transform}`);
        console.log(`      Max Width: ${card.maxWidth}`);
        console.log(`      Overflow: ${card.overflow}`);
        console.log(`      Box Sizing: ${card.boxSizing}`);
        console.log(`      ${card.isOverflowing ? '❌ OVERFLOWING (right edge exceeds viewport + 5px)' : '✅ OK'}`);
    });

    console.log('\n\n🔍 DEBUGGING ELDRICHIFY PAGE OVERFLOW...\n');
    await page.goto('http://localhost:4000/eldrichify.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const eldrichifyOverflow = await page.evaluate(() => {
        const viewport = window.innerWidth;
        const overflowing = [];

        // Check launch links
        document.querySelectorAll('.launch-link, button.launch-link, a.launch-link').forEach(el => {
            const rect = el.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(el);

            overflowing.push({
                type: 'launch-link',
                tag: el.tagName,
                class: el.className,
                text: el.textContent.substring(0, 30),
                left: rect.left,
                right: rect.right,
                width: rect.width,
                scrollWidth: el.scrollWidth,
                viewport: viewport,
                fontSize: computedStyle.fontSize,
                padding: computedStyle.padding,
                maxWidth: computedStyle.maxWidth,
                display: computedStyle.display,
                whiteSpace: computedStyle.whiteSpace,
                isOverflowing: rect.right > viewport + 5
            });
        });

        // Check pre tags
        document.querySelectorAll('pre').forEach(el => {
            const rect = el.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(el);

            overflowing.push({
                type: 'pre',
                tag: el.tagName,
                class: el.className,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                scrollWidth: el.scrollWidth,
                viewport: viewport,
                fontSize: computedStyle.fontSize,
                transform: computedStyle.transform,
                maxWidth: computedStyle.maxWidth,
                whiteSpace: computedStyle.whiteSpace,
                isOverflowing: rect.right > viewport + 5
            });
        });

        return {
            viewport,
            elements: overflowing,
            bodyWidth: document.body.getBoundingClientRect().width,
            bodyScrollWidth: document.body.scrollWidth
        };
    });

    console.log('📊 ELDRICHIFY PAGE ANALYSIS:');
    console.log('   Viewport:', eldrichifyOverflow.viewport);
    console.log('   Body Width:', eldrichifyOverflow.bodyWidth);
    console.log('   Body ScrollWidth:', eldrichifyOverflow.bodyScrollWidth);

    const launchLinks = eldrichifyOverflow.elements.filter(e => e.type === 'launch-link');
    const preTags = eldrichifyOverflow.elements.filter(e => e.type === 'pre');

    console.log('\n   Launch Links Found:', launchLinks.length);
    launchLinks.forEach((link, i) => {
        console.log(`\n   Link ${i + 1}: "${link.text}"`);
        console.log(`      Left: ${link.left}px | Right: ${link.right}px (viewport: ${link.viewport}px)`);
        console.log(`      Width: ${link.width}px | ScrollWidth: ${link.scrollWidth}px`);
        console.log(`      Font Size: ${link.fontSize}`);
        console.log(`      Padding: ${link.padding}`);
        console.log(`      Max Width: ${link.maxWidth}`);
        console.log(`      Display: ${link.display}`);
        console.log(`      White Space: ${link.whiteSpace}`);
        console.log(`      ${link.isOverflowing ? '❌ OVERFLOWING (right edge exceeds viewport + 5px)' : '✅ OK'}`);
    });

    console.log('\n   Pre Tags Found:', preTags.length);
    preTags.forEach((pre, i) => {
        console.log(`\n   Pre ${i + 1}:`);
        console.log(`      Left: ${pre.left}px | Right: ${pre.right}px (viewport: ${pre.viewport}px)`);
        console.log(`      Width: ${pre.width}px | ScrollWidth: ${pre.scrollWidth}px`);
        console.log(`      Font Size: ${pre.fontSize}`);
        console.log(`      Transform: ${pre.transform}`);
        console.log(`      Max Width: ${pre.maxWidth}`);
        console.log(`      White Space: ${pre.whiteSpace}`);
        console.log(`      ${pre.isOverflowing ? '❌ OVERFLOWING (right edge exceeds viewport + 5px)' : '✅ OK'}`);
    });

    await browser.close();
})();
