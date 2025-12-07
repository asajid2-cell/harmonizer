import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: { width: 375, height: 667 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
    });

    const page = await context.newPage();

    console.log('\n🔍 DEBUGGING INDEX PAGE LAYOUT...\n');
    await page.goto('http://localhost:4000/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const indexLayout = await page.evaluate(() => {
        const wall = document.querySelector('.retro-ascii-wall');
        const wallStyles = window.getComputedStyle(wall);

        return {
            wall: {
                display: wallStyles.display,
                columns: wallStyles.columns,
                columnCount: wallStyles.columnCount,
                columnWidth: wallStyles.columnWidth,
                width: wallStyles.width,
                maxWidth: wallStyles.maxWidth
            }
        };
    });

    console.log('📊 INDEX .retro-ascii-wall LAYOUT:');
    console.log('   Display:', indexLayout.wall.display);
    console.log('   Columns:', indexLayout.wall.columns);
    console.log('   Column Count:', indexLayout.wall.columnCount);
    console.log('   Column Width:', indexLayout.wall.columnWidth);
    console.log('   Width:', indexLayout.wall.width);
    console.log('   Max Width:', indexLayout.wall.maxWidth);

    console.log('\n\n🔍 DEBUGGING ELDRICHIFY PAGE LAYOUT...\n');
    await page.goto('http://localhost:4000/eldrichify.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const eldrichifyLayout = await page.evaluate(() => {
        const grid = document.querySelector('.eld-ascii-grid');
        const ctaRow = document.querySelector('.eld-cta-row');

        const gridStyles = window.getComputedStyle(grid);
        const ctaStyles = window.getComputedStyle(ctaRow);

        return {
            grid: {
                display: gridStyles.display,
                flexDirection: gridStyles.flexDirection,
                flexWrap: gridStyles.flexWrap,
                width: gridStyles.width,
                maxWidth: gridStyles.maxWidth
            },
            ctaRow: {
                display: ctaStyles.display,
                flexDirection: ctaStyles.flexDirection,
                flexWrap: ctaStyles.flexWrap,
                width: ctaStyles.width
            }
        };
    });

    console.log('📊 ELDRICHIFY .eld-ascii-grid LAYOUT:');
    console.log('   Display:', eldrichifyLayout.grid.display);
    console.log('   Flex Direction:', eldrichifyLayout.grid.flexDirection);
    console.log('   Flex Wrap:', eldrichifyLayout.grid.flexWrap);
    console.log('   Width:', eldrichifyLayout.grid.width);
    console.log('   Max Width:', eldrichifyLayout.grid.maxWidth);

    console.log('\n📊 ELDRICHIFY .eld-cta-row LAYOUT:');
    console.log('   Display:', eldrichifyLayout.ctaRow.display);
    console.log('   Flex Direction:', eldrichifyLayout.ctaRow.flexDirection);
    console.log('   Flex Wrap:', eldrichifyLayout.ctaRow.flexWrap);
    console.log('   Width:', eldrichifyLayout.ctaRow.width);

    await browser.close();
})();
