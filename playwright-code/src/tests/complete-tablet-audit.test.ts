import { chromium, Browser, Page } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

interface Issue {
  severity: 'critical' | 'warning' | 'info';
  page: string;
  category: string;
  description: string;
  element?: string;
  screenshot?: string;
}

interface TestResult {
  page: string;
  url: string;
  viewport: string;
  passed: boolean;
  issues: Issue[];
  metrics: {
    loadTime: number;
    elementCount: number;
    overflowElements: number;
    hiddenElements: number;
    interactiveElements: number;
  };
}

// Tablet viewport - iPad Mini
const TABLET_VIEWPORT = { width: 768, height: 1024 };
const BASE_URL = 'http://localhost:4000';

const PAGES_TO_TEST = [
  { path: '/', name: 'index' },
  { path: '/projects', name: 'projects' },
  { path: '/projects.html', name: 'projects-alt' },
  { path: '/harmonizer.html', name: 'harmonizer' },
  { path: '/ourspace.html', name: 'ourspace' },
  { path: '/eldrichify.html', name: 'eldrichify' },
  { path: '/codesniff.html', name: 'codesniff' },
  { path: '/sand.html', name: 'sand' },
  { path: '/notebook.html', name: 'notebook' },
  { path: '/contact/index.html', name: 'contact' },
];

class TabletAuditor {
  private browser!: Browser;
  private page!: Page;
  private results: TestResult[] = [];
  private allIssues: Issue[] = [];
  private artifactsDir = 'playwright-code/artifacts/tablet-audit';

  async init() {
    await mkdir(this.artifactsDir, { recursive: true });
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 100
    });
    const context = await this.browser.newContext({
      viewport: TABLET_VIEWPORT,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      hasTouch: true,
      isMobile: true,
    });
    this.page = await context.newPage();

    // Listen for console errors
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('❌ Console Error:', msg.text());
      }
    });

    this.page.on('pageerror', error => {
      console.log('❌ Page Error:', error.message);
    });
  }

  async testPage(pagePath: string, pageName: string): Promise<TestResult> {
    const url = `${BASE_URL}${pagePath}`;
    console.log(`\n🔍 Testing: ${pageName} (${url})`);

    const issues: Issue[] = [];
    const startTime = Date.now();

    try {
      // Navigate to page
      await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const loadTime = Date.now() - startTime;

      // Take initial screenshot
      const screenshotPath = join(this.artifactsDir, `${pageName}-initial.png`);
      await this.page.screenshot({ path: screenshotPath, fullPage: true });

      // 1. Check for horizontal overflow
      const overflowCheck = await this.checkHorizontalOverflow();
      if (overflowCheck.hasOverflow) {
        issues.push({
          severity: 'critical',
          page: pageName,
          category: 'Layout',
          description: `Horizontal overflow detected: ${overflowCheck.elements.join(', ')}`,
          screenshot: screenshotPath,
        });
      }

      // 2. Check navigation on tablet
      const navIssues = await this.checkNavigationTablet();
      issues.push(...navIssues.map(issue => ({ ...issue, page: pageName })));

      // 3. Check text readability
      const textIssues = await this.checkTextReadability();
      issues.push(...textIssues.map(issue => ({ ...issue, page: pageName })));

      // 4. Check touch target sizes (still relevant for tablet)
      const touchIssues = await this.checkTouchTargets();
      issues.push(...touchIssues.map(issue => ({ ...issue, page: pageName })));

      // 5. Check viewport meta
      const viewportIssues = await this.checkViewportMeta();
      issues.push(...viewportIssues.map(issue => ({ ...issue, page: pageName })));

      // 6. Check interactive elements
      const interactiveCheck = await this.checkInteractiveElements();
      issues.push(...interactiveCheck.issues.map(issue => ({ ...issue, page: pageName })));

      // 7. Check column layouts (tablet-specific)
      const columnIssues = await this.checkColumnLayouts();
      issues.push(...columnIssues.map(issue => ({ ...issue, page: pageName })));

      // 8. Check for aspect ratio issues
      const aspectIssues = await this.checkAspectRatios();
      issues.push(...aspectIssues.map(issue => ({ ...issue, page: pageName })));

      // 9. Collect metrics
      const metrics = await this.collectMetrics();

      // 10. Test scrolling behavior
      const scrollIssues = await this.testScrolling();
      issues.push(...scrollIssues.map(issue => ({ ...issue, page: pageName })));

      // 11. Test landscape orientation
      await this.testLandscapeOrientation(pageName);

      // 12. Check spacing and gaps
      const spacingIssues = await this.checkSpacing();
      issues.push(...spacingIssues.map(issue => ({ ...issue, page: pageName })));

      this.allIssues.push(...issues);

      return {
        page: pageName,
        url,
        viewport: `${TABLET_VIEWPORT.width}x${TABLET_VIEWPORT.height}`,
        passed: issues.filter(i => i.severity === 'critical').length === 0,
        issues,
        metrics: {
          loadTime,
          ...metrics,
        },
      };
    } catch (error) {
      console.error(`❌ Failed to test ${pageName}:`, error);
      issues.push({
        severity: 'critical',
        page: pageName,
        category: 'Navigation',
        description: `Failed to load page: ${(error as Error).message}`,
      });

      return {
        page: pageName,
        url,
        viewport: `${TABLET_VIEWPORT.width}x${TABLET_VIEWPORT.height}`,
        passed: false,
        issues,
        metrics: {
          loadTime: Date.now() - startTime,
          elementCount: 0,
          overflowElements: 0,
          hiddenElements: 0,
          interactiveElements: 0,
        },
      };
    }
  }

  private async checkHorizontalOverflow(): Promise<{ hasOverflow: boolean; elements: string[] }> {
    return await this.page.evaluate(() => {
      const elements: string[] = [];
      const viewportWidth = window.innerWidth;

      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > viewportWidth + 5) { // 5px tolerance
          const identifier = el.id ? `#${el.id}` :
                           el.className ? `.${el.classList[0]}` :
                           el.tagName.toLowerCase();
          elements.push(identifier);
        }
      });

      return {
        hasOverflow: elements.length > 0,
        elements: [...new Set(elements)].slice(0, 10),
      };
    });
  }

  private async checkNavigationTablet(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const navCheck = await this.page.evaluate(() => {
      const nav = document.querySelector('nav, .retro-nav');
      if (!nav) return { exists: false, visible: false, height: 0, layout: 'unknown' };

      const styles = window.getComputedStyle(nav);
      const rect = nav.getBoundingClientRect();
      const links = nav.querySelectorAll('a');

      // Check if navigation wraps to multiple lines
      const firstLink = links[0]?.getBoundingClientRect();
      const lastLink = links[links.length - 1]?.getBoundingClientRect();
      const wrapsMultipleLines = lastLink && firstLink &&
                                 Math.abs(lastLink.top - firstLink.top) > 10;

      return {
        exists: true,
        visible: styles.display !== 'none' && styles.visibility !== 'hidden',
        height: rect.height,
        overflowing: rect.right > window.innerWidth,
        display: styles.display,
        flexDirection: styles.flexDirection,
        linkCount: links.length,
        wrapsMultipleLines,
      };
    });

    if (!navCheck.exists) {
      issues.push({
        severity: 'warning',
        page: '',
        category: 'Navigation',
        description: 'No navigation element found',
      });
    } else if (!navCheck.visible) {
      issues.push({
        severity: 'critical',
        page: '',
        category: 'Navigation',
        description: 'Navigation is hidden on tablet',
      });
    } else if (navCheck.overflowing) {
      issues.push({
        severity: 'critical',
        page: '',
        category: 'Navigation',
        description: 'Navigation overflows viewport horizontally',
      });
    } else if (navCheck.wrapsMultipleLines && navCheck.linkCount > 8) {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Navigation',
        description: `Navigation wraps to multiple lines with ${navCheck.linkCount} links - consider dropdown menu`,
      });
    }

    return issues;
  }

  private async checkTextReadability(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const textChecks = await this.page.evaluate(() => {
      const problems: { element: string; fontSize: number; lineHeight: string }[] = [];

      document.querySelectorAll('p, span, div, a, button, li, h1, h2, h3').forEach((el) => {
        const styles = window.getComputedStyle(el);
        const fontSize = parseFloat(styles.fontSize);
        const lineHeight = styles.lineHeight;

        // On tablet, minimum should be 13px
        if (fontSize < 13 && el.textContent && el.textContent.trim().length > 0) {
          problems.push({
            element: el.tagName.toLowerCase() + (el.className ? `.${el.classList[0]}` : ''),
            fontSize,
            lineHeight,
          });
        }
      });

      return problems.slice(0, 5);
    });

    textChecks.forEach(check => {
      issues.push({
        severity: 'warning',
        page: '',
        category: 'Readability',
        description: `Text too small for tablet: ${check.element} (${check.fontSize}px)`,
        element: check.element,
      });
    });

    return issues;
  }

  private async checkTouchTargets(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const touchChecks = await this.page.evaluate(() => {
      const MIN_TOUCH_SIZE = 44; // Still Apple's recommended minimum for tablet
      const problems: { element: string; width: number; height: number }[] = [];

      document.querySelectorAll('a, button, input, select, textarea, [onclick], [role="button"]').forEach((el) => {
        const rect = el.getBoundingClientRect();

        if ((rect.width < MIN_TOUCH_SIZE || rect.height < MIN_TOUCH_SIZE) &&
            rect.width > 0 && rect.height > 0) {
          problems.push({
            element: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : el.className ? `.${el.classList[0]}` : ''),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      });

      return problems.slice(0, 5);
    });

    touchChecks.forEach(check => {
      issues.push({
        severity: 'warning',
        page: '',
        category: 'Touch Targets',
        description: `Touch target too small: ${check.element} (${check.width}x${check.height}px)`,
        element: check.element,
      });
    });

    return issues;
  }

  private async checkViewportMeta(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const hasViewport = await this.page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return {
        exists: !!meta,
        content: meta?.getAttribute('content') || '',
      };
    });

    if (!hasViewport.exists) {
      issues.push({
        severity: 'critical',
        page: '',
        category: 'Meta Tags',
        description: 'Missing viewport meta tag',
      });
    }

    return issues;
  }

  private async checkInteractiveElements(): Promise<{ issues: Issue[]; count: number }> {
    const issues: Issue[] = [];

    const interactiveCheck = await this.page.evaluate(() => {
      const interactive = document.querySelectorAll('a, button, input, select, textarea, [onclick]');
      const broken: string[] = [];

      interactive.forEach((el) => {
        const styles = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        if ((styles.display === 'none' || styles.visibility === 'hidden' ||
             styles.opacity === '0' || rect.width === 0 || rect.height === 0) &&
            (el.tagName === 'A' || el.tagName === 'BUTTON')) {
          broken.push(el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''));
        }
      });

      return {
        count: interactive.length,
        broken: broken.slice(0, 3),
      };
    });

    interactiveCheck.broken.forEach(el => {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Interactive',
        description: `Interactive element is hidden: ${el}`,
        element: el,
      });
    });

    return { issues, count: interactiveCheck.count };
  }

  private async checkColumnLayouts(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const columnCheck = await this.page.evaluate(() => {
      const problems: { element: string; columnCount: number; columnWidth: number }[] = [];

      document.querySelectorAll('*').forEach((el) => {
        const styles = window.getComputedStyle(el);
        const columnCount = parseInt(styles.columnCount);
        const columnWidth = parseFloat(styles.columnWidth);

        // Check if column width is too narrow on tablet
        if (columnWidth > 0 && columnWidth < 180) {
          problems.push({
            element: el.tagName.toLowerCase() + (el.className ? `.${el.classList[0]}` : ''),
            columnCount,
            columnWidth,
          });
        }
      });

      return problems.slice(0, 3);
    });

    columnCheck.forEach(check => {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Layout',
        description: `Column width may be too narrow on tablet: ${check.element} (${check.columnWidth}px)`,
        element: check.element,
      });
    });

    return issues;
  }

  private async checkAspectRatios(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const aspectCheck = await this.page.evaluate(() => {
      const problems: string[] = [];

      document.querySelectorAll('img, video, canvas').forEach((el) => {
        const rect = el.getBoundingClientRect();

        if (rect.width > 0 && rect.height > 0) {
          const aspectRatio = rect.width / rect.height;

          // Check for extremely wide or tall aspect ratios that might look bad on tablet
          if (aspectRatio > 4 || aspectRatio < 0.25) {
            problems.push(el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''));
          }
        }
      });

      return problems;
    });

    aspectCheck.forEach(el => {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Media',
        description: `Extreme aspect ratio detected on: ${el}`,
        element: el,
      });
    });

    return issues;
  }

  private async collectMetrics() {
    return await this.page.evaluate(() => {
      const all = document.querySelectorAll('*');
      const hidden = Array.from(all).filter(el => {
        const styles = window.getComputedStyle(el);
        return styles.display === 'none' || styles.visibility === 'hidden';
      });

      const interactive = document.querySelectorAll('a, button, input, select, textarea, [onclick]');

      return {
        elementCount: all.length,
        overflowElements: 0,
        hiddenElements: hidden.length,
        interactiveElements: interactive.length,
      };
    });
  }

  private async testScrolling(): Promise<Issue[]> {
    const issues: Issue[] = [];

    // Scroll down the page
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await this.page.waitForTimeout(500);

    const scrollPos = await this.page.evaluate(() => window.scrollY);

    if (scrollPos === 0) {
      return issues;
    }

    // Check for overflow during scroll
    const scrollIssues = await this.page.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const problems: string[] = [];

      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > viewportWidth + 5) {
          problems.push(el.tagName.toLowerCase());
        }
      });

      return [...new Set(problems)].slice(0, 3);
    });

    if (scrollIssues.length > 0) {
      issues.push({
        severity: 'warning',
        page: '',
        category: 'Scrolling',
        description: `Elements overflow during scroll: ${scrollIssues.join(', ')}`,
      });
    }

    // Scroll back to top
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.page.waitForTimeout(300);

    return issues;
  }

  private async testLandscapeOrientation(pageName: string): Promise<void> {
    // Test landscape mode (rotate viewport)
    await this.page.setViewportSize({ width: 1024, height: 768 });
    await this.page.waitForTimeout(500);

    const landscapeScreenshot = join(this.artifactsDir, `${pageName}-landscape.png`);
    await this.page.screenshot({ path: landscapeScreenshot, fullPage: false });

    // Return to portrait
    await this.page.setViewportSize(TABLET_VIEWPORT);
    await this.page.waitForTimeout(300);
  }

  private async checkSpacing(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const spacingCheck = await this.page.evaluate(() => {
      const problems: string[] = [];

      // Check for elements that are too cramped together
      const buttons = document.querySelectorAll('button, a.button, .btn');
      buttons.forEach((btn, i) => {
        if (i < buttons.length - 1) {
          const rect1 = btn.getBoundingClientRect();
          const rect2 = buttons[i + 1].getBoundingClientRect();

          // Check if buttons are on same row and too close
          if (Math.abs(rect1.top - rect2.top) < 10) {
            const gap = rect2.left - rect1.right;
            if (gap < 8 && gap >= 0) {
              problems.push('Buttons too close together (< 8px gap)');
            }
          }
        }
      });

      return [...new Set(problems)];
    });

    spacingCheck.forEach(problem => {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Spacing',
        description: problem,
      });
    });

    return issues;
  }

  async generateReport() {
    console.log('\n\n' + '='.repeat(80));
    console.log('📱 TABLET AUDIT REPORT - VIEWPORT: 768x1024 (iPad Mini Portrait)');
    console.log('='.repeat(80));

    const totalPages = this.results.length;
    const passedPages = this.results.filter(r => r.passed).length;
    const criticalIssues = this.allIssues.filter(i => i.severity === 'critical').length;
    const warnings = this.allIssues.filter(i => i.severity === 'warning').length;
    const info = this.allIssues.filter(i => i.severity === 'info').length;

    console.log(`\n📊 SUMMARY`);
    console.log(`  Total Pages Tested: ${totalPages}`);
    console.log(`  Passed: ${passedPages}`);
    console.log(`  Failed: ${totalPages - passedPages}`);
    console.log(`  🔴 Critical Issues: ${criticalIssues}`);
    console.log(`  ⚠️  Warnings: ${warnings}`);
    console.log(`  ℹ️  Info: ${info}`);

    console.log(`\n\n📄 DETAILED RESULTS\n`);

    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.page.toUpperCase()}`);
      console.log(`   URL: ${result.url}`);
      console.log(`   Load Time: ${result.metrics.loadTime}ms`);
      console.log(`   Elements: ${result.metrics.elementCount}`);
      console.log(`   Interactive: ${result.metrics.interactiveElements}`);

      if (result.issues.length > 0) {
        console.log(`   Issues Found: ${result.issues.length}`);
        result.issues.forEach(issue => {
          const icon = issue.severity === 'critical' ? '🔴' :
                      issue.severity === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`     ${icon} [${issue.category}] ${issue.description}`);
        });
      } else {
        console.log(`   ✨ No issues found!`);
      }
      console.log('');
    });

    const categories = new Map<string, number>();
    this.allIssues.forEach(issue => {
      categories.set(issue.category, (categories.get(issue.category) || 0) + 1);
    });

    console.log(`\n📋 ISSUES BY CATEGORY\n`);
    Array.from(categories.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });

    const reportPath = join(this.artifactsDir, 'tablet-audit-report.json');
    await writeFile(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      viewport: TABLET_VIEWPORT,
      summary: {
        totalPages,
        passedPages,
        criticalIssues,
        warnings,
        info,
      },
      results: this.results,
      allIssues: this.allIssues,
    }, null, 2));

    console.log(`\n💾 Full report saved to: ${reportPath}`);
    console.log('='.repeat(80));
  }

  async runFullAudit() {
    await this.init();

    for (const page of PAGES_TO_TEST) {
      const result = await this.testPage(page.path, page.name);
      this.results.push(result);
      await this.page.waitForTimeout(1000);
    }

    await this.generateReport();
    await this.browser.close();
  }
}

(async () => {
  console.log('🚀 Starting comprehensive tablet audit...\n');
  console.log('📱 Testing viewport: 768x1024 (iPad Mini Portrait)');
  console.log('🌐 Base URL: http://localhost:4000\n');

  const auditor = new TabletAuditor();

  try {
    await auditor.runFullAudit();
    console.log('\n✅ Tablet audit complete!');
  } catch (error) {
    console.error('\n❌ Audit failed:', error);
    process.exitCode = 1;
  }
})();
