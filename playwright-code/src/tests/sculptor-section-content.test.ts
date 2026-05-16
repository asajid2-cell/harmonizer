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

  console.log('🔍 Testing Section Sculptor Content Visibility\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.click('#advanced-toggle');
    await page.waitForTimeout(1000);

    // Expand the section if collapsed
    await page.evaluate(() => {
      const sculptorSection = Array.from(document.querySelectorAll('.advanced-section'))
        .find(s => s.querySelector('h4')?.textContent === 'Section Sculptor');
      const collapseBtn = sculptorSection?.querySelector('.advanced-collapse-btn');
      const isExpanded = collapseBtn?.getAttribute('aria-expanded') === 'true';
      if (!isExpanded && collapseBtn) {
        (collapseBtn as HTMLElement).click();
      }
    });

    await page.waitForTimeout(500);

    const contentDetails = await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      const shellRect = shell?.getBoundingClientRect();

      const sculptorSection = Array.from(document.querySelectorAll('.advanced-section'))
        .find(s => s.querySelector('h4')?.textContent === 'Section Sculptor');

      if (!sculptorSection || !shellRect) {
        return null;
      }

      const header = sculptorSection.querySelector('.advanced-section-header');
      const groups = Array.from(sculptorSection.querySelectorAll('.advanced-group'));

      const headerRect = header?.getBoundingClientRect();
      const headerVisible = headerRect &&
        headerRect.top >= shellRect.top &&
        headerRect.bottom <= shellRect.bottom;

      return {
        shell: {
          top: shellRect.top,
          bottom: shellRect.bottom,
          height: shellRect.height,
          scrollTop: (shell as HTMLElement)?.scrollTop || 0,
          scrollHeight: (shell as HTMLElement)?.scrollHeight || 0
        },
        header: {
          top: headerRect?.top || 0,
          bottom: headerRect?.bottom || 0,
          visible: headerVisible
        },
        groups: groups.map((group) => {
          const rect = group.getBoundingClientRect();
          const title = group.querySelector('.advanced-group-title')?.textContent || 'Unknown';
          const controls = Array.from(group.querySelectorAll('.advanced-control'));

          const groupVisible = rect.top >= shellRect.top && rect.bottom <= shellRect.bottom;
          const groupPartiallyVisible = rect.bottom > shellRect.top && rect.top < shellRect.bottom;

          return {
            title,
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            visible: groupVisible,
            partiallyVisible: groupPartiallyVisible,
            controlCount: controls.length,
            controls: controls.map((control) => {
              const cRect = control.getBoundingClientRect();
              const label = control.querySelector('.advanced-control-label')?.textContent || 'Unknown';
              const visible = cRect.top >= shellRect.top && cRect.bottom <= shellRect.bottom;
              return {
                label,
                top: cRect.top,
                visible
              };
            })
          };
        })
      };
    });

    if (!contentDetails) {
      console.log('❌ Could not find Section Sculptor content');
      return;
    }

    console.log('Advanced Shell:');
    console.log('  Top:', contentDetails.shell.top.toFixed(0), 'px');
    console.log('  Bottom:', contentDetails.shell.bottom.toFixed(0), 'px');
    console.log('  Height:', contentDetails.shell.height.toFixed(0), 'px');
    console.log('  Scroll top:', contentDetails.shell.scrollTop, 'px');
    console.log('  Scroll height:', contentDetails.shell.scrollHeight, 'px');

    console.log('\nSection Header:');
    console.log('  Visible:', contentDetails.header.visible ? '✅ YES' : '❌ NO');

    console.log('\nGroups:');
    contentDetails.groups.forEach((group, i) => {
      const status = group.visible ? '✅ Fully' :
                     group.partiallyVisible ? '⚠️  Partially' :
                     '❌ Not';
      console.log(`\n  [${i + 1}] ${group.title}:`);
      console.log(`      Visible: ${status} visible`);
      console.log(`      Top: ${group.top.toFixed(0)}px, Bottom: ${group.bottom.toFixed(0)}px`);
      console.log(`      Height: ${group.height.toFixed(0)}px`);
      console.log(`      Controls: ${group.controlCount}`);

      const hiddenControls = group.controls.filter(c => !c.visible);
      if (hiddenControls.length > 0) {
        console.log(`      Hidden controls: ${hiddenControls.length}`);
        hiddenControls.forEach(c => {
          console.log(`        - ${c.label} (top: ${c.top.toFixed(0)}px)`);
        });
      }
    });

    // Try scrolling to bottom
    console.log('\n\n📜 Scrolling to bottom...\n');
    await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      if (shell) {
        shell.scrollTop = shell.scrollHeight;
      }
    });
    await page.waitForTimeout(300);

    const afterScroll = await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      const shellRect = shell?.getBoundingClientRect();

      const sculptorSection = Array.from(document.querySelectorAll('.advanced-section'))
        .find(s => s.querySelector('h4')?.textContent === 'Section Sculptor');

      const groups = Array.from(sculptorSection?.querySelectorAll('.advanced-group') || []);

      return groups.map((group) => {
        const rect = group.getBoundingClientRect();
        const title = group.querySelector('.advanced-group-title')?.textContent || 'Unknown';
        const controls = Array.from(group.querySelectorAll('.advanced-control'));

        const groupVisible = shellRect &&
          rect.top >= shellRect.top &&
          rect.bottom <= shellRect.bottom;

        return {
          title,
          visible: groupVisible,
          hiddenControls: controls.filter(c => {
            const cRect = c.getBoundingClientRect();
            return !(shellRect && cRect.top >= shellRect.top && cRect.bottom <= shellRect.bottom);
          }).length
        };
      });
    });

    console.log('After scrolling to bottom:');
    afterScroll.forEach((group, i) => {
      const status = group.visible ? '✅' : '❌';
      console.log(`  [${i + 1}] ${group.title}: ${status} (Hidden controls: ${group.hiddenControls})`);
    });

    await page.screenshot({ path: 'artifacts/sculptor-section-content.png', fullPage: true });
    console.log('\n📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
