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

  console.log('🔍 Testing Advanced Settings Visible Sections in Sculptor Mode\n');

  try {
    await page.goto('http://localhost:4000/harmonizer.html?trid=TR03F47BFFE7&mode=sculptor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.click('#advanced-toggle');
    await page.waitForTimeout(1000);

    const sectionInfo = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('.advanced-section'));
      const shell = document.querySelector('.advanced-shell');

      return {
        shell: {
          clientHeight: shell?.clientHeight || 0,
          scrollHeight: shell?.scrollHeight || 0
        },
        sections: sections.map((section) => {
          const header = section.querySelector('.advanced-section-header');
          const title = header?.querySelector('h4')?.textContent || 'Unknown';
          const rect = section.getBoundingClientRect();
          const isHidden = section.classList.contains('hidden') ||
                          window.getComputedStyle(section).display === 'none';

          return {
            title,
            isHidden,
            height: rect.height,
            display: window.getComputedStyle(section).display
          };
        })
      };
    });

    console.log('Advanced Shell:');
    console.log('  Client height:', sectionInfo.shell.clientHeight, 'px');
    console.log('  Scroll height:', sectionInfo.shell.scrollHeight, 'px');
    console.log('  Scrollable:', sectionInfo.shell.scrollHeight > sectionInfo.shell.clientHeight ? 'YES' : 'NO');

    console.log('\nSections:');
    sectionInfo.sections.forEach((section, i) => {
      const status = section.isHidden ? '🚫 Hidden' : '✅ Visible';
      console.log(`  [${i + 1}] ${section.title}:`);
      console.log(`      Status: ${status}`);
      console.log(`      Display: ${section.display}`);
      console.log(`      Height: ${section.height.toFixed(0)}px`);
    });

    const visibleSections = sectionInfo.sections.filter(s => !s.isHidden);
    console.log('\nSummary:');
    console.log('  Total sections:', sectionInfo.sections.length);
    console.log('  Visible sections:', visibleSections.length);
    console.log('  Hidden sections:', sectionInfo.sections.length - visibleSections.length);

    if (visibleSections.length === 1 && visibleSections[0].title === 'Section Sculptor') {
      console.log('\n✅ Correct: Only Section Sculptor visible in Sculptor mode');
      console.log('   (This is expected behavior - other sections are for different modes)');
    }

    await page.screenshot({ path: 'artifacts/advanced-visible-sections.png', fullPage: true });
    console.log('\n📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
})();
