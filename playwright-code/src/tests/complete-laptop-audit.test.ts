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

// Laptop viewport - Small laptop / large tablet landscape
const LAPTOP_VIEWPORT = { width: 1024, height: 768 };
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

class LaptopAuditor {
  private browser!: Browser;
  private page!: Page;
  private results: TestResult[] = [];
  private allIssues: Issue[] = [];
  private artifactsDir = 'playwright-code/artifacts/laptop-audit';

  async init() {
    await mkdir(this.artifactsDir, { recursive: true });
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 100
    });
    const context = await this.browser.newContext({
      viewport: LAPTOP_VIEWPORT,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      hasTouch: false, // Laptop = mouse/trackpad
      isMobile: false,
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

      // 2. Check navigation layout
      const navIssues = await this.checkNavigation();
      issues.push(...navIssues.map(issue => ({ ...issue, page: pageName })));

      // 3. Check text readability (less critical on laptop)
      const textIssues = await this.checkTextReadability();
      issues.push(...textIssues.map(issue => ({ ...issue, page: pageName })));

      // 4. Check clickable target sizes (can be smaller than touch targets)
      const clickIssues = await this.checkClickTargets();
      issues.push(...clickIssues.map(issue => ({ ...issue, page: pageName })));

      // 5. Check viewport meta (less critical but good to verify)
      const viewportIssues = await this.checkViewportMeta();
      issues.push(...viewportIssues.map(issue => ({ ...issue, page: pageName })));

      // 6. Check interactive elements
      const interactiveCheck = await this.checkInteractiveElements();
      issues.push(...interactiveCheck.issues.map(issue => ({ ...issue, page: pageName })));

      // 7. Check layout efficiency (laptop-specific)
      const layoutIssues = await this.checkLayoutEfficiency();
      issues.push(...layoutIssues.map(issue => ({ ...issue, page: pageName })));

      // 8. Check multi-column layouts
      const columnIssues = await this.checkMultiColumnLayouts();
      issues.push(...columnIssues.map(issue => ({ ...issue, page: pageName })));

      // 9. Check hover states (laptop has mouse)
      const hoverIssues = await this.checkHoverStates();
      issues.push(...hoverIssues.map(issue => ({ ...issue, page: pageName })));

      // 10. Collect metrics
      const metrics = await this.collectMetrics();

      // 11. Test scrolling behavior
      const scrollIssues = await this.testScrolling();
      issues.push(...scrollIssues.map(issue => ({ ...issue, page: pageName })));

      // 12. Check content width utilization
      const widthIssues = await this.checkContentWidth();
      issues.push(...widthIssues.map(issue => ({ ...issue, page: pageName })));

      this.allIssues.push(...issues);

      return {
        page: pageName,
        url,
        viewport: `${LAPTOP_VIEWPORT.width}x${LAPTOP_VIEWPORT.height}`,
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
        viewport: `${LAPTOP_VIEWPORT.width}x${LAPTOP_VIEWPORT.height}`,
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
        if (rect.right > viewportWidth + 5) {
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

  private async checkNavigation(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const navCheck = await this.page.evaluate(() => {
      const nav = document.querySelector('nav, .retro-nav');
      if (!nav) return { exists: false, visible: false };

      const styles = window.getComputedStyle(nav);
      const rect = nav.getBoundingClientRect();
      const links = nav.querySelectorAll('a');

      return {
        exists: true,
        visible: styles.display !== 'none' && styles.visibility !== 'hidden',
        height: rect.height,
        width: rect.width,
        overflowing: rect.right > window.innerWidth,
        display: styles.display,
        flexDirection: styles.flexDirection,
        linkCount: links.length,
        linksHorizontal: styles.flexDirection === 'row' || styles.display === 'flex',
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
        severity: 'warning',
        page: '',
        category: 'Navigation',
        description: 'Navigation is hidden',
      });
    } else if (navCheck.overflowing) {
      issues.push({
        severity: 'critical',
        page: '',
        category: 'Navigation',
        description: 'Navigation overflows viewport',
      });
    } else if (!navCheck.linksHorizontal && navCheck.linkCount > 5) {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Navigation',
        description: 'Navigation could be horizontal on laptop (more screen width available)',
      });
    }

    return issues;
  }

  private async checkTextReadability(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const textChecks = await this.page.evaluate(() => {
      const problems: { element: string; fontSize: number }[] = [];

      // On laptop, minimum 14px is comfortable
      document.querySelectorAll('p, span, div, a, button, li').forEach((el) => {
        const styles = window.getComputedStyle(el);
        const fontSize = parseFloat(styles.fontSize);

        if (fontSize < 14 && el.textContent && el.textContent.trim().length > 10) {
          problems.push({
            element: el.tagName.toLowerCase() + (el.className ? `.${el.classList[0]}` : ''),
            fontSize,
          });
        }
      });

      return problems.slice(0, 3);
    });

    textChecks.forEach(check => {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Readability',
        description: `Text could be larger on laptop: ${check.element} (${check.fontSize}px)`,
        element: check.element,
      });
    });

    return issues;
  }

  private async checkClickTargets(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const clickChecks = await this.page.evaluate(() => {
      const MIN_CLICK_SIZE = 32; // Smaller than touch, but still comfortable for mouse
      const problems: { element: string; width: number; height: number }[] = [];

      document.querySelectorAll('a, button, [onclick], [role="button"]').forEach((el) => {
        const rect = el.getBoundingClientRect();

        if ((rect.width < MIN_CLICK_SIZE || rect.height < MIN_CLICK_SIZE) &&
            rect.width > 0 && rect.height > 0) {
          problems.push({
            element: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : el.className ? `.${el.classList[0]}` : ''),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      });

      return problems.slice(0, 3);
    });

    clickChecks.forEach(check => {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Click Targets',
        description: `Small click target: ${check.element} (${check.width}x${check.height}px)`,
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
        severity: 'info',
        page: '',
        category: 'Meta Tags',
        description: 'Missing viewport meta tag (less critical on laptop)',
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

  private async checkLayoutEfficiency(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const layoutCheck = await this.page.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const body = document.body;
      const main = document.querySelector('main');
      const content = main || body;
      const contentRect = content.getBoundingClientRect();

      // Check if content is using available width efficiently
      const contentWidth = contentRect.width;
      const widthUtilization = (contentWidth / viewportWidth) * 100;

      return {
        viewportWidth,
        contentWidth,
        widthUtilization,
        isCentered: Math.abs(contentRect.left - (viewportWidth - contentRect.right)) < 50,
      };
    });

    if (layoutCheck.widthUtilization < 60) {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Layout',
        description: `Low width utilization (${Math.round(layoutCheck.widthUtilization)}%) - content could be wider on laptop`,
      });
    } else if (layoutCheck.widthUtilization > 95) {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Layout',
        description: 'Content spans full width - consider constraining max-width for readability',
      });
    }

    return issues;
  }

  private async checkMultiColumnLayouts(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const columnCheck = await this.page.evaluate(() => {
      const problems: { element: string; columnCount: number; columnWidth: number }[] = [];

      document.querySelectorAll('*').forEach((el) => {
        const styles = window.getComputedStyle(el);
        const columnCount = parseInt(styles.columnCount);
        const columnWidth = parseFloat(styles.columnWidth);

        // On laptop, columns can be narrower but not too narrow
        if (columnWidth > 0 && columnWidth < 150) {
          problems.push({
            element: el.tagName.toLowerCase() + (el.className ? `.${el.classList[0]}` : ''),
            columnCount,
            columnWidth,
          });
        }
      });

      return problems.slice(0, 2);
    });

    columnCheck.forEach(check => {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Layout',
        description: `Narrow column width: ${check.element} (${check.columnWidth}px)`,
        element: check.element,
      });
    });

    return issues;
  }

  private async checkHoverStates(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const hoverCheck = await this.page.evaluate(() => {
      const links = document.querySelectorAll('a, button');
      let linksWithHover = 0;

      links.forEach((el) => {
        const styles = window.getComputedStyle(el, ':hover');
        const normalStyles = window.getComputedStyle(el);

        // Check if hover state is different from normal state
        if (styles.color !== normalStyles.color ||
            styles.backgroundColor !== normalStyles.backgroundColor ||
            styles.textDecoration !== normalStyles.textDecoration) {
          linksWithHover++;
        }
      });

      return {
        totalLinks: links.length,
        linksWithHover,
        percentage: links.length > 0 ? (linksWithHover / links.length) * 100 : 0,
      };
    });

    if (hoverCheck.percentage < 50 && hoverCheck.totalLinks > 5) {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Interactivity',
        description: `Only ${Math.round(hoverCheck.percentage)}% of links have hover states - consider adding for desktop UX`,
      });
    }

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

    // Scroll down
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await this.page.waitForTimeout(500);

    const scrollPos = await this.page.evaluate(() => window.scrollY);

    if (scrollPos === 0) {
      return issues;
    }

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

    // Scroll back
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.page.waitForTimeout(300);

    return issues;
  }

  private async checkContentWidth(): Promise<Issue[]> {
    const issues: Issue[] = [];

    const widthCheck = await this.page.evaluate(() => {
      const main = document.querySelector('main, .main-content, .content');
      const article = document.querySelector('article, .article');
      const targetElement = article || main || document.body;
      const rect = targetElement.getBoundingClientRect();

      return {
        elementWidth: rect.width,
        viewportWidth: window.innerWidth,
        utilization: (rect.width / window.innerWidth) * 100,
      };
    });

    // Optimal content width on laptop is 60-85%
    if (widthCheck.utilization > 90) {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Layout',
        description: 'Content very wide - consider max-width for better readability',
      });
    } else if (widthCheck.utilization < 50) {
      issues.push({
        severity: 'info',
        page: '',
        category: 'Layout',
        description: 'Content narrow - could utilize more horizontal space',
      });
    }

    return issues;
  }

  async generateReport() {
    console.log('\n\n' + '='.repeat(80));
    console.log('💻 LAPTOP AUDIT REPORT - VIEWPORT: 1024x768 (Small Laptop)');
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

    const reportPath = join(this.artifactsDir, 'laptop-audit-report.json');
    await writeFile(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      viewport: LAPTOP_VIEWPORT,
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
  console.log('🚀 Starting comprehensive laptop audit...\n');
  console.log('💻 Testing viewport: 1024x768 (Small Laptop / Landscape Tablet)');
  console.log('🌐 Base URL: http://localhost:4000\n');

  const auditor = new LaptopAuditor();

  try {
    await auditor.runFullAudit();
    console.log('\n✅ Laptop audit complete!');
  } catch (error) {
    console.error('\n❌ Audit failed:', error);
    process.exitCode = 1;
  }
})();
