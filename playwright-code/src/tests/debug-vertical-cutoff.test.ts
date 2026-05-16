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

  console.log('🔍 Debugging Advanced Settings Vertical Cutoff\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.click('#advanced-toggle');
    await page.waitForTimeout(1000);

    const measurements = await page.evaluate(() => {
      const shell = document.querySelector('.advanced-shell');
      const sections = document.querySelector('.advanced-sections');
      const sidebar = document.querySelector('#advanced-sidebar');
      const allSections = Array.from(document.querySelectorAll('.advanced-section'));

      const shellRect = shell?.getBoundingClientRect();
      const sectionsRect = sections?.getBoundingClientRect();

      return {
        shell: {
          height: shellRect?.height || 0,
          scrollHeight: (shell as HTMLElement)?.scrollHeight || 0,
          computedHeight: shell ? window.getComputedStyle(shell).height : null,
          computedMaxHeight: shell ? window.getComputedStyle(shell).maxHeight : null,
          top: shellRect?.top || 0,
          bottom: shellRect?.bottom || 0
        },
        sections: {
          height: sectionsRect?.height || 0,
          top: sectionsRect?.top || 0,
          bottom: sectionsRect?.bottom || 0
        },
        sidebar: {
          height: sidebar?.getBoundingClientRect().height || 0,
          computedHeight: sidebar ? window.getComputedStyle(sidebar).height : null
        },
        allSections: allSections.map(s => {
          const title = s.querySelector('h4')?.textContent || 'Unknown';
          const rect = s.getBoundingClientRect();
          const isHidden = s.classList.contains('hidden') ||
                          window.getComputedStyle(s).display === 'none';
          return {
            title,
            height: rect.height,
            hidden: isHidden,
            top: rect.top,
            bottom: rect.bottom
          };
        }),
        viewport: window.innerHeight
      };
    });

    console.log('Viewport height:', measurements.viewport, 'px\n');

    console.log('.advanced-shell:');
    console.log('  Top:', measurements.shell.top.toFixed(0), 'px');
    console.log('  Bottom:', measurements.shell.bottom.toFixed(0), 'px');
    console.log('  Visible height:', measurements.shell.height.toFixed(0), 'px');
    console.log('  Scroll height:', measurements.shell.scrollHeight, 'px');
    console.log('  Computed height:', measurements.shell.computedHeight);
    console.log('  Computed max-height:', measurements.shell.computedMaxHeight);

    const isScrollable = measurements.shell.scrollHeight > measurements.shell.height;
    const hiddenContent = measurements.shell.scrollHeight - measurements.shell.height;

    console.log('  Is scrollable:', isScrollable ? 'YES' : 'NO');
    if (isScrollable) {
      console.log('  Hidden content:', hiddenContent.toFixed(0), 'px');
    }

    console.log('\n.advanced-sections:');
    console.log('  Height:', measurements.sections.height.toFixed(0), 'px');
    console.log('  Top:', measurements.sections.top.toFixed(0), 'px');
    console.log('  Bottom:', measurements.sections.bottom.toFixed(0), 'px');

    console.log('\nAll Sections:');
    measurements.allSections.forEach((section, i) => {
      if (!section.hidden) {
        console.log(`  [${i + 1}] ${section.title}:`);
        console.log(`      Height: ${section.height.toFixed(0)}px`);
        console.log(`      Top: ${section.top.toFixed(0)}px, Bottom: ${section.bottom.toFixed(0)}px`);

        const cutOff = section.bottom > measurements.viewport;
        if (cutOff) {
          console.log(`      ⚠️  CUT OFF by ${(section.bottom - measurements.viewport).toFixed(0)}px`);
        }
      }
    });

    const visibleSections = measurements.allSections.filter(s => !s.hidden);
    console.log('\n📊 Summary:');
    console.log('  Visible sections:', visibleSections.length);
    console.log('  Total section height:', visibleSections.reduce((sum, s) => sum + s.height, 0).toFixed(0), 'px');

    await page.screenshot({ path: 'artifacts/debug-vertical-cutoff.png', fullPage: true });
    console.log('\n📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
