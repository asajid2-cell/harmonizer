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

  console.log('🔍 Testing Advanced Settings overflow in Sculptor\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click advanced toggle to open panel
    console.log('Opening Advanced Settings...');
    await page.click('#advanced-toggle');
    await page.waitForTimeout(1000);

    const overflow = await page.evaluate(() => {
      const sidebar = document.querySelector('#advanced-sidebar');
      const shell = document.querySelector('#advanced-shell');
      const vizBody = document.querySelector('.viz-body');
      const vizStage = document.querySelector('.viz-stage');

      const sidebarRect = sidebar?.getBoundingClientRect();
      const shellRect = shell?.getBoundingClientRect();
      const bodyRect = vizBody?.getBoundingClientRect();
      const stageRect = vizStage?.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      return {
        viewport: viewportWidth,
        sidebar: {
          exists: !!sidebar,
          width: sidebarRect?.width || 0,
          right: sidebarRect?.right || 0,
          left: sidebarRect?.left || 0,
          computedWidth: sidebar ? window.getComputedStyle(sidebar).width : null,
          computedMaxWidth: sidebar ? window.getComputedStyle(sidebar).maxWidth : null,
          overflowing: (sidebarRect?.right || 0) > viewportWidth
        },
        shell: {
          width: shellRect?.width || 0,
          right: shellRect?.right || 0,
          computedWidth: shell ? window.getComputedStyle(shell).width : null,
          computedMaxWidth: shell ? window.getComputedStyle(shell).maxWidth : null,
          overflowing: (shellRect?.right || 0) > viewportWidth
        },
        vizBody: {
          width: bodyRect?.width || 0,
          right: bodyRect?.right || 0,
          gridTemplateColumns: vizBody ? window.getComputedStyle(vizBody).gridTemplateColumns : null
        },
        vizStage: {
          width: stageRect?.width || 0
        }
      };
    });

    console.log('Viewport width:', overflow.viewport, 'px\n');

    console.log('.viz-body:');
    console.log('  Width:', overflow.vizBody.width.toFixed(0), 'px');
    console.log('  Grid columns:', overflow.vizBody.gridTemplateColumns);

    console.log('\n.viz-stage:');
    console.log('  Width:', overflow.vizStage.width.toFixed(0), 'px');

    console.log('\n#advanced-sidebar:');
    console.log('  Exists:', overflow.sidebar.exists);
    console.log('  Width:', overflow.sidebar.width.toFixed(0), 'px');
    console.log('  Left:', overflow.sidebar.left.toFixed(0), 'px');
    console.log('  Right:', overflow.sidebar.right.toFixed(0), 'px');
    console.log('  Computed width:', overflow.sidebar.computedWidth);
    console.log('  Computed max-width:', overflow.sidebar.computedMaxWidth);
    console.log('  Overflowing viewport:', overflow.sidebar.overflowing ? '❌ YES' : '✅ NO');

    if (overflow.sidebar.overflowing) {
      const amount = overflow.sidebar.right - overflow.viewport;
      console.log(`  ⚠️  Overflow amount: ${amount.toFixed(0)}px beyond viewport`);
    }

    console.log('\n.advanced-shell:');
    console.log('  Width:', overflow.shell.width.toFixed(0), 'px');
    console.log('  Right:', overflow.shell.right.toFixed(0), 'px');
    console.log('  Computed width:', overflow.shell.computedWidth);
    console.log('  Computed max-width:', overflow.shell.computedMaxWidth);
    console.log('  Overflowing viewport:', overflow.shell.overflowing ? '❌ YES' : '✅ NO');

    await page.screenshot({ path: 'artifacts/advanced-settings-overflow.png', fullPage: true });
    console.log('\n📸 Screenshot saved to artifacts/advanced-settings-overflow.png');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
