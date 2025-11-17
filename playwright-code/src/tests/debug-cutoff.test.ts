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

  console.log('🔍 Debugging Advanced Settings Cutoff\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.click('#advanced-toggle');
    await page.waitForTimeout(1000);

    const layout = await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      const sidebar = document.querySelector('#advanced-sidebar');
      const vizBody = document.querySelector('.viz-body');
      const vizPanel = document.querySelector('.viz-panel');

      const shellRect = shell?.getBoundingClientRect();
      const sidebarRect = sidebar?.getBoundingClientRect();
      const vizBodyRect = vizBody?.getBoundingClientRect();
      const vizPanelRect = vizPanel?.getBoundingClientRect();

      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        vizPanel: {
          top: vizPanelRect?.top || 0,
          bottom: vizPanelRect?.bottom || 0,
          height: vizPanelRect?.height || 0,
          computedHeight: vizPanel ? window.getComputedStyle(vizPanel).height : null
        },
        vizBody: {
          top: vizBodyRect?.top || 0,
          bottom: vizBodyRect?.bottom || 0,
          height: vizBodyRect?.height || 0,
          computedHeight: vizBody ? window.getComputedStyle(vizBody).height : null
        },
        sidebar: {
          top: sidebarRect?.top || 0,
          bottom: sidebarRect?.bottom || 0,
          height: sidebarRect?.height || 0,
          computedHeight: sidebar ? window.getComputedStyle(sidebar).height : null,
          computedMaxHeight: sidebar ? window.getComputedStyle(sidebar).maxHeight : null
        },
        shell: {
          top: shellRect?.top || 0,
          bottom: shellRect?.bottom || 0,
          height: shellRect?.height || 0,
          scrollHeight: (shell as HTMLElement)?.scrollHeight || 0,
          computedHeight: shell ? window.getComputedStyle(shell).height : null,
          computedMaxHeight: shell ? window.getComputedStyle(shell).maxHeight : null
        }
      };
    });

    console.log('Viewport:', `${layout.viewport.width}x${layout.viewport.height}`);
    console.log('\n.viz-panel:');
    console.log('  Top:', layout.vizPanel.top.toFixed(0), 'px');
    console.log('  Bottom:', layout.vizPanel.bottom.toFixed(0), 'px');
    console.log('  Height:', layout.vizPanel.height.toFixed(0), 'px');
    console.log('  Computed height:', layout.vizPanel.computedHeight);

    console.log('\n.viz-body:');
    console.log('  Top:', layout.vizBody.top.toFixed(0), 'px');
    console.log('  Bottom:', layout.vizBody.bottom.toFixed(0), 'px');
    console.log('  Height:', layout.vizBody.height.toFixed(0), 'px');
    console.log('  Computed height:', layout.vizBody.computedHeight);

    console.log('\n#advanced-sidebar:');
    console.log('  Top:', layout.sidebar.top.toFixed(0), 'px');
    console.log('  Bottom:', layout.sidebar.bottom.toFixed(0), 'px');
    console.log('  Height:', layout.sidebar.height.toFixed(0), 'px');
    console.log('  Computed height:', layout.sidebar.computedHeight);
    console.log('  Computed max-height:', layout.sidebar.computedMaxHeight);

    console.log('\n.advanced-shell:');
    console.log('  Top:', layout.shell.top.toFixed(0), 'px');
    console.log('  Bottom:', layout.shell.bottom.toFixed(0), 'px');
    console.log('  Visible height:', layout.shell.height.toFixed(0), 'px');
    console.log('  Scroll height:', layout.shell.scrollHeight, 'px');
    console.log('  Computed height:', layout.shell.computedHeight);
    console.log('  Computed max-height:', layout.shell.computedMaxHeight);

    const cutoff = layout.shell.bottom > layout.viewport.height;
    console.log('\n🔍 Analysis:');
    console.log('  Shell bottom extends beyond viewport:', cutoff ? '❌ YES' : '✅ NO');
    if (cutoff) {
      const overflow = layout.shell.bottom - layout.viewport.height;
      console.log('  Cut off by:', overflow.toFixed(0), 'px');
    }

    await page.screenshot({ path: 'artifacts/debug-cutoff.png', fullPage: true });
    console.log('\n📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
